import { ipcMain, BrowserWindow } from 'electron'
import { Launcher } from 'eml-lib'
import type { Account } from 'eml-lib'
import type { IGameSettings } from '../settings'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, AUTH_SERVER_URL, SYSTEM_JAVA_21_PATH } from '../../const'
import fs from 'node:fs'
import { IPC } from '../../ipc-channels'
import { getAuthlibInjectorPath } from './authlib'
import { killMinecraft, trackMinecraftPid, schedulePostLaunchAction } from './process'

export { killMinecraft } from './process'

export function registerLauncherHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle(IPC.game.kill, () => {
    killMinecraft()
    return { success: true }
  })

  ipcMain.handle(IPC.game.checkExtraMods, async (_event, profileSlug: string) => {
    try {
      const appData = process.env.APPDATA || (process.platform === 'darwin' ? `${process.env.HOME}/Library/Application Support` : `${process.env.HOME}`)
      const pathModule = require('node:path')
      const modsDir = pathModule.join(appData, '.modey', profileSlug || 'athena', 'mods')
      if (!fs.existsSync(modsDir)) return { hasExtra: false, extraMods: [] }

      const localFiles = fs.readdirSync(modsDir).filter((f) => f.endsWith('.jar'))
      const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${profileSlug || 'athena'}`)
      if (!resp.ok) return { hasExtra: false, extraMods: [] }
      const data = await resp.json()
      const officialFiles = (data.files || []).map((f: any) => f.name)
      const extraMods = localFiles.filter((f) => !officialFiles.includes(f))
      return { hasExtra: extraMods.length > 0, extraMods }
    } catch (err) {
      logger.warn('Failed to check extra mods:', err)
      return { hasExtra: false, extraMods: [] }
    }
  })

  ipcMain.handle(
    IPC.game.launch,
    async (_event, payload: {
      account: Account
      settings: IGameSettings
      profileSlug: string
      serverIp?: string
      serverPort?: number
      minecraftVersion?: string
      loaderType?: 'neoforge' | 'forge' | 'fabric' | 'quilt' | 'vanilla'
      loaderVersion?: string
      forceClean?: boolean
    }) => {
      const { account, settings, profileSlug, serverIp, serverPort, minecraftVersion, loaderType, loaderVersion, forceClean } = payload

      let java: { install: 'auto' } | { install: 'manual'; absolutePath: string } = { install: 'auto' }
      if (settings.java === 'system') {
        const javaExe = fs.existsSync(SYSTEM_JAVA_21_PATH) ? SYSTEM_JAVA_21_PATH : 'java'
        java = { install: 'manual', absolutePath: javaExe }
      }

      const host = serverIp || '127.0.0.1'
      const port = serverPort || 25565
      const gameArgs = ['--quickPlayMultiplayer', `${host}:${port}`, '--quickPlayPath', 'quickPlay.json']
      let actionTimer: ReturnType<typeof setTimeout> | null = null

      const targetMcVersion = minecraftVersion || '1.21.1'
      const targetLoaderType = loaderType || 'neoforge'
      const targetLoaderVersion = loaderVersion || '21.1.169'

      logger.log(`Launching Minecraft ${targetMcVersion} (${targetLoaderType} ${targetLoaderVersion}) for profile ${profileSlug} with server target ${host}:${port}`)

      // Récupérer les règles d'exclusion de nettoyage décidées par le serveur
      let serverCleaningIgnored: string[] | undefined = undefined
      try {
        const updaterResp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${profileSlug}`)
        if (updaterResp.ok) {
          const updaterManifest = await updaterResp.json()
          if (Array.isArray(updaterManifest.cleaningIgnored)) {
            serverCleaningIgnored = updaterManifest.cleaningIgnored
          }
        }
      } catch (manifestErr) {
        logger.warn('Failed to fetch cleaning rules from server:', manifestErr)
      }

      const launcher = new Launcher({
        root: 'modey',
        profile: {
          slug: profileSlug,
          minecraft: {
            version: targetMcVersion,
            loader: {
              loader: targetLoaderType as any,
              version: targetLoaderVersion
            },
            modpackUrl: `${ADMINTOOL_URL}/api/files-updater/${profileSlug}`,
            args: gameArgs
          }
        },
        account: account,
        cleaning: {
          enabled: forceClean ? true : !(account as any)?.hasNoCleaning,
          ignored: serverCleaningIgnored
        },
        java: java
      })

      // Interception de run() pour la capture de PID et l'injection authlib-injector
      ;(launcher as any).run = async function (javaPath: string, args: string[]) {
        try {
          const authlibPath = getAuthlibInjectorPath()
          // Toujours privilégier l'AUTH_SERVER_URL actuel (résout automatiquement les changements d'IP/Domaine)
          let customAuthUrl = AUTH_SERVER_URL
          if (account.meta?.type === 'yggdrasil') {
            customAuthUrl = AUTH_SERVER_URL
            if (account.meta) (account.meta as any).url = AUTH_SERVER_URL
          } else if (account.meta?.url) {
            customAuthUrl = account.meta.url
          }
          if (authlibPath) {
            const jvmArg = `-javaagent:${authlibPath}=${customAuthUrl}`
            if (!args.some((arg) => arg.includes('authlib-injector'))) {
              args.unshift(jvmArg)
              logger.info(`[Modey Launcher] 🔒 authlib-injector injecté dans les JVM args → ${customAuthUrl}`)
            }
          }

          // Lancement du processus avec capture PID
          return new Promise<void>((resolve, reject) => {
            const minecraft = require('node:child_process').spawn(javaPath, args, {
              cwd: (launcher as any).config.root,
              detached: true
            })
            minecraft.unref()

            if (minecraft && minecraft.pid) {
              logger.info(`[Modey Launcher] Minecraft démarré avec PID: ${minecraft.pid}`)
              trackMinecraftPid(minecraft.pid)
            }

            minecraft.stdout.on('data', (data: Buffer) => {
              ;(launcher as any).emit('launch_data', data.toString('utf8').replace(/\n$/, ''))
            })
            minecraft.stderr.on('data', (data: Buffer) => {
              ;(launcher as any).emit('launch_data', data.toString('utf8').replace(/\n$/, ''))
            })
            minecraft.on('error', (err: Error) => {
              logger.error('[Modey Launcher] Erreur processus Minecraft :', err)
              mainWindow.webContents.send(IPC.game.launchClose, -1)
              reject(err)
            })
            minecraft.on('close', (code: number | null) => {
              const exitCode = code ?? 0
              logger.info(`[Modey Launcher] Minecraft fermé avec code: ${exitCode}`)
              trackMinecraftPid(null)
              ;(launcher as any).emit('launch_close', exitCode)
              resolve()
            })
          })
        } catch (spawnErr) {
          logger.error('[Modey Launcher] Échec du spawn Minecraft :', spawnErr)
          throw spawnErr
        }
      }

      // Forwarders events moteur → renderer (source des canaux : ipc-channels.ts)
      const forward = <T>(emitterEvent: string, channel: string) => {
        ;(launcher as any).on(emitterEvent, (value: T) => mainWindow.webContents.send(channel, value))
      }

      launcher.on('launch_compute_download', () => {
        logger.log('Computing download...')
        mainWindow.webContents.send(IPC.game.launchComputeDownload)
      })

      forward('launch_download', IPC.game.launchDownload)
      launcher.on('launch_download', (download) => {
        logger.log(`Downloading ${download.total.amount} files (${download.total.size} B).`)
      })
      // Throttling de download_progress pour éviter de saturer l'IPC Electron et geler le renderer
      let lastProgressDispatch = 0
      launcher.on('download_progress', (value: any) => {
        const now = Date.now()
        if (now - lastProgressDispatch >= 60) {
          lastProgressDispatch = now
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.game.downloadProgress, value)
          }
        }
      })
      launcher.on('download_error', (error) => {
        logger.error(`Error downloading ${error.filename}: ${error.message}`)
      })
      forward('download_error', IPC.game.downloadError)
      forward('download_end', IPC.game.downloadEnd)
      launcher.on('download_end', (info) => {
        logger.log(`Downloaded ${info.downloaded.amount} files.`)
      })

      forward('launch_install_loader', IPC.game.launchInstallLoader)
      launcher.on('launch_install_loader', (loader) => {
        logger.log(`Installing loader ${loader.type} ${loader.loaderVersion}...`)
      })

      launcher.on('launch_extract_natives', () => {
        logger.log('Extracting natives...')
        mainWindow.webContents.send(IPC.game.launchExtractNatives)
      })
      launcher.on('launch_copy_assets', () => {
        logger.log('Copying assets...')
        mainWindow.webContents.send(IPC.game.launchCopyAssets)
      })
      launcher.on('launch_patch_loader', () => {
        logger.log('Patching loader...')
        mainWindow.webContents.send(IPC.game.launchPatchLoader)
      })
      launcher.on('launch_check_java', () => {
        logger.log('Checking Java...')
        mainWindow.webContents.send(IPC.game.launchCheckJava)
      })
      forward('java_info', IPC.game.javaInfo)
      launcher.on('java_info', (info) => {
        logger.log(`Using Java ${info.version} ${info.arch}`)
      })

      launcher.on('launch_clean', () => {
        logger.log('Cleaning game directory...')
        mainWindow.webContents.send(IPC.game.launchClean)
      })

      launcher.on('launch_launch', (info) => {
        logger.log(`Launching Minecraft ${info.version} (${info.type}${info.loaderVersion ? ` ${info.loaderVersion}` : ''})...`)
        mainWindow.webContents.send(IPC.game.launchLaunch, info)

        actionTimer = schedulePostLaunchAction(mainWindow, settings.launcherAction)
        mainWindow.webContents.send(IPC.game.launched)
      })

      launcher.on('launch_close', (code: number | null) => {
        logger.log(`Minecraft fermé avec code ${code}.`)
        if (actionTimer) {
          clearTimeout(actionTimer)
          actionTimer = null
        }

        // Toujours restaurer la fenêtre du launcher lorsque Minecraft se ferme
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }

        mainWindow.webContents.send(IPC.game.launchClose, code)
      })

      try {
        void launcher.launch().catch((err: any) => {
          logger.error('Launcher error:', err)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.game.launchClose, -1)
          }
        })
      } catch (err: any) {
        logger.error('Launcher error:', err)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC.game.launchClose, -1)
        }
      }
    }
  )
}
