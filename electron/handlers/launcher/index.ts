import { ipcMain, BrowserWindow } from 'electron'
import { Launcher } from 'eml-lib'
import type { Account } from 'eml-lib'
import type { IGameSettings } from '../settings'
import logger from 'electron-log/main'
import profileConfig from '../../../config/athena-profile.json'
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
    (_event, payload: { account: Account; settings: IGameSettings; profileSlug: string; serverIp?: string; serverPort?: number }) => {
      const { account, settings, profileSlug, serverIp, serverPort } = payload

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

      logger.log(`Launching Minecraft for profile ${profileSlug} with server target ${host}:${port}`)

      const launcher = new Launcher({
        root: 'modey-athena',
        profile: {
          slug: profileSlug,
          minecraft: {
            version: profileConfig.minecraftVersion,
            loader: {
              loader: profileConfig.modLoader.type as 'neoforge',
              version: profileConfig.modLoader.version
            },
            modpackUrl: `${ADMINTOOL_URL}/api/files-updater/${profileSlug}`,
            args: gameArgs
          }
        },
        account: account,
        cleaning: {
          enabled: false
        },
        java: java,
        memory: {
          min: +settings.memory.min * 1024,
          max: +settings.memory.max * 1024
        },
        window: {
          width: settings.resolution.width,
          height: settings.resolution.height,
          fullscreen: settings.resolution.fullscreen
        }
      })

      // Interception du spawn du processus Minecraft : capture du PID,
      // injection d'authlib-injector (anti-crack) et cycle de vie.
      ;(launcher as any).run = async function (javaPath: string, args: string[]) {
        const { spawn } = await import('node:child_process')

        const authlibPath = getAuthlibInjectorPath()
        if (authlibPath) {
          const authlibArg = `-javaagent:${authlibPath}=${AUTH_SERVER_URL}`

          // Les args EML sont de la forme : [jvmArgs..., '-cp', classpath, mainClass, gameArgs...]
          const cpIndex = args.findIndex((a) => a === '-cp' || a === '-classpath' || a === '--classpath')
          if (cpIndex > 0) {
            args.splice(0, 0, authlibArg)
            logger.info(`[Modey Launcher] 🔒 authlib-injector injecté dans les JVM args → ${AUTH_SERVER_URL}`)
          } else {
            args.unshift(authlibArg)
            logger.info(`[Modey Launcher] 🔒 authlib-injector injecté (fallback) → ${AUTH_SERVER_URL}`)
          }
        } else {
          logger.warn(`[Modey Launcher] ⚠️ Lancement sans authlib-injector (fichier jar absent)`)
        }

        return new Promise<void>((resolve, reject) => {
          try {
            const minecraft = spawn(javaPath, args, { cwd: this.config.root, detached: true })
            trackMinecraftPid(minecraft.pid ?? null)

            minecraft.unref()

            minecraft.stdout?.on('data', (data: Buffer) => {
              this.emit('launch_data', data.toString('utf8').replace(/\n$/, ''))
            })

            minecraft.stderr?.on('data', (data: Buffer) => {
              this.emit('launch_data', data.toString('utf8').replace(/\n$/, ''))
            })

            minecraft.on('error', (err: Error) => {
              logger.error('[Modey Launcher] Erreur processus Minecraft :', err)
              trackMinecraftPid(null)
              reject(err)
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
      forward('download_progress', IPC.game.downloadProgress)
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
      forward('extract_progress', IPC.game.extractProgress)
      forward('extract_end', IPC.game.extractEnd)

      launcher.on('launch_copy_assets', () => {
        logger.log('Copying assets...')
        mainWindow.webContents.send(IPC.game.launchCopyAssets)
      })
      forward('copy_progress', IPC.game.copyProgress)
      forward('copy_end', IPC.game.copyEnd)

      launcher.on('launch_patch_loader', () => {
        logger.log('Patching loader...')
        mainWindow.webContents.send(IPC.game.launchPatchLoader)
      })
      forward('patch_progress', IPC.game.patchProgress)
      forward('patch_error', IPC.game.patchError)
      forward('patch_end', IPC.game.patchEnd)

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
      forward('clean_progress', IPC.game.cleanProgress)
      forward('clean_end', IPC.game.cleanEnd)

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
        logger.log(message)

        // Détection de déconnexion du serveur Athéna (Athéna-Guard anti-crack)
        if (disconnectWatchArmed && hasActiveMinecraft() && !isExitingByDisconnect()) {
          if (DISCONNECT_PATTERNS.some((pattern) => pattern.test(message))) {
            logger.info(`[Athéna-Guard] Déconnexion détectée via les logs : "${message}". Fermeture automatique de Minecraft...`)
            killMinecraft()
          }
        }

        mainWindow.webContents.send(IPC.game.launchData, message)
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

      // @internal — debug moteur, jamais consommé côté renderer
      launcher.on('launch_debug', (message) => {
        logger.debug(message)
        mainWindow.webContents.send(IPC.game.launchDebug, message)
      })
      launcher.on('patch_debug', (message) => {
        mainWindow.webContents.send(IPC.game.patchDebug, message)
      })

      try {
        void launcher.launch().catch((err) => {
          logger.error('Launcher error:', err)
          mainWindow.webContents.send(IPC.game.launchClose, 1)
        })
      } catch (err) {
        logger.error('Launcher error:', err)
        mainWindow.webContents.send(IPC.game.launchClose, 1)
      }
    }
  )
}
