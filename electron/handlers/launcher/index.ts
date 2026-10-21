import { ipcMain, BrowserWindow } from 'electron'
import { Launcher } from 'eml-lib'
import type { Account } from 'eml-lib'
import type { IGameSettings } from '../settings'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, AUTH_SERVER_URL, SYSTEM_JAVA_21_PATH } from '../../const'
import fs from 'node:fs'
import { IPC } from '../../ipc-channels'
import { getAuthlibInjectorPath } from './authlib'
import { DISCONNECT_PATTERNS } from './disconnects'
import { killMinecraft, trackMinecraftPid, setExitingByDisconnect, isExitingByDisconnect, hasActiveMinecraft, schedulePostLaunchAction } from './process'

export { killMinecraft } from './process'

export function registerLauncherHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle(IPC.game.kill, () => {
    killMinecraft()
    return { success: true }
  })

  ipcMain.handle(
    IPC.game.launch,
    (_event, payload: {
      account: Account
      settings: IGameSettings
      profileSlug: string
      serverIp?: string
      serverPort?: number
      minecraftVersion?: string
      loaderType?: 'neoforge' | 'forge' | 'fabric' | 'quilt' | 'vanilla'
      loaderVersion?: string
    }) => {
      const { account, settings, profileSlug, serverIp, serverPort, minecraftVersion, loaderType, loaderVersion } = payload

      let java: { install: 'auto' } | { install: 'manual'; absolutePath: string } = { install: 'auto' }
      if (settings.java === 'system') {
        const javaExe = fs.existsSync(SYSTEM_JAVA_21_PATH) ? SYSTEM_JAVA_21_PATH : 'java'
        java = { install: 'manual', absolutePath: javaExe }
      }

      const host = serverIp || '127.0.0.1'
      const port = serverPort || 25565
      const gameArgs = ['--quickPlayMultiplayer', `${host}:${port}`, '--quickPlayPath', 'quickPlay.json']
      let actionTimer: ReturnType<typeof setTimeout> | null = null
      let disconnectWatchArmed = false
      setExitingByDisconnect(false)

      const targetMcVersion = minecraftVersion || '1.21.1'
      const targetLoaderType = loaderType || 'neoforge'
      const targetLoaderVersion = loaderVersion || '21.1.169'

      logger.log(`Launching Minecraft ${targetMcVersion} (${targetLoaderType} ${targetLoaderVersion}) for profile ${profileSlug} with server target ${host}:${port}`)

      const launcher = new Launcher({
        root: 'modey-athena',
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
          enabled: false
        },
        java: java
      })

      // Interception du spawn pour sécurité anti-crack Athéna (authlib-injector)
      const originalLaunchGame = (launcher as any).launchGame.bind(launcher)
      ;(launcher as any).launchGame = function (options: any) {
        return new Promise<void>((resolve, reject) => {
          try {
            const authlibPath = getAuthlibInjectorPath()
            if (authlibPath) {
              const jvmArg = `-javaagent:${authlibPath}=${AUTH_SERVER_URL}`
              if (!options.jvmArgs) options.jvmArgs = []
              if (!options.jvmArgs.some((arg: string) => arg.includes('authlib-injector'))) {
                options.jvmArgs.push(jvmArg)
                logger.info(`[Modey Launcher] 🔒 authlib-injector injecté dans les JVM args → ${AUTH_SERVER_URL}`)
              }
            } else if (fs.existsSync('assets/authlib-injector.jar')) {
              const fallbackArg = `-javaagent:assets/authlib-injector.jar=${AUTH_SERVER_URL}`
              if (!options.jvmArgs) options.jvmArgs = []
              options.jvmArgs.push(fallbackArg)
              logger.info(`[Modey Launcher] 🔒 authlib-injector injecté (fallback) → ${AUTH_SERVER_URL}`)
            } else {
              logger.warn(`[Modey Launcher] ⚠️ Lancement sans authlib-injector (fichier jar absent)`)
            }

            // Exécution du lancement normal
            const procPromise = originalLaunchGame(options)
            const minecraft = (launcher as any).minecraft

            if (minecraft && minecraft.pid) {
              trackMinecraftPid(minecraft.pid)
            } else if (procPromise && procPromise.pid) {
              trackMinecraftPid(procPromise.pid)
            }

            if (!minecraft) {
              if (procPromise && typeof procPromise.then === 'function') {
                procPromise.then(resolve).catch(reject)
                return
              }
              resolve()
              return
            }

            minecraft.on('error', (err: Error) => {
              logger.error('[Modey Launcher] Erreur processus Minecraft :', err)
            })

            minecraft.on('close', (code: number | null) => {
              logger.info(`[Modey Launcher] Processus Minecraft fermé avec code: ${code}`)
              trackMinecraftPid(null)
              const finalCode = isExitingByDisconnect() ? 0 : (code ?? 0)
              this.emit('launch_close', finalCode)
              resolve()
            })
          } catch (spawnErr) {
            logger.error('[Modey Launcher] Échec du spawn Minecraft :', spawnErr)
            reject(spawnErr)
          }
        })
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

        // Surveillance de déconnexion armée 3 s après le démarrage du moteur
        setTimeout(() => {
          disconnectWatchArmed = true
        }, 3000)

        actionTimer = schedulePostLaunchAction(mainWindow, settings.launcherAction)
        mainWindow.webContents.send(IPC.game.launched)
      })

      launcher.on('launch_data', (message: string) => {
        // Détection de déconnexion du serveur Athéna (Athéna-Guard anti-crack)
        if (disconnectWatchArmed && hasActiveMinecraft() && !isExitingByDisconnect()) {
          if (DISCONNECT_PATTERNS.some((pattern) => pattern.test(message))) {
            logger.info(`[Athéna-Guard] Déconnexion détectée via les logs : "${message}". Fermeture automatique de Minecraft...`)
            killMinecraft()
          }
        }
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

        mainWindow.webContents.send(IPC.game.launchClose, isExitingByDisconnect() ? 0 : code)
        setExitingByDisconnect(false)
      })

      try {
        void launcher.launch().catch((err) => {
          logger.error('Launcher error:', err)
        })
      } catch (err) {
        logger.error('Launcher error:', err)
      }
    }
  )
}
