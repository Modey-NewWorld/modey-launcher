import { ipcMain, BrowserWindow, app } from 'electron'
import { Launcher } from 'eml-lib'
import type { Account, IProfile } from 'eml-lib'
import type { IGameSettings } from './settings'
import logger from 'electron-log/main'
import profileConfig from '../../config/athena-profile.json'
import { ADMINTOOL_URL, AUTH_SERVER_URL } from '../const'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'

// ─────────────────────────────────────────────────────────────
//  AUTHLIB-INJECTOR — Chemin vers le JAR bundlé avec l'app
// ─────────────────────────────────────────────────────────────
/**
 * Résout le chemin vers authlib-injector.jar.
 * En production (app packagée) : dans process.resourcesPath/assets/
 * En développement : dans le dossier assets/ à la racine du projet
 */
function getAuthlibInjectorPath(): string {
  const inResources = path.join(process.resourcesPath || '', 'assets', 'authlib-injector.jar')
  const inProject = path.join(app.getAppPath(), '..', 'assets', 'authlib-injector.jar')
  const devPath = path.join(app.getAppPath(), 'assets', 'authlib-injector.jar')

  for (const candidate of [inResources, inProject, devPath]) {
    if (fs.existsSync(candidate)) {
      logger.info(`[Modey Launcher] authlib-injector trouvé : ${candidate}`)
      return candidate
    }
  }

  logger.warn('[Modey Launcher] ⚠️  authlib-injector.jar introuvable ! La sécurité anti-crack ne sera pas active.')
  return 'authlib-injector.jar' // fallback relatif
}

// Gestion du processus Minecraft actif
let activeMinecraftPid: number | null = null
let activeMinecraftProcess: any = null
let isExitingOnDisconnect = false

/**
 * Arrête complètement le processus Minecraft (ferme le jeu et tous les sous-processus)
 */
export function killMinecraft() {
  if (!activeMinecraftPid) return
  const pid = activeMinecraftPid
  isExitingOnDisconnect = true
  logger.info(`[Modey Launcher] Fermeture du processus Minecraft (PID: ${pid})...`)

  if (process.platform === 'win32') {
    exec(`taskkill /PID ${pid} /T /F`, (err) => {
      if (err) {
        logger.warn(`[Modey Launcher] Erreur taskkill, tentative process.kill : ${err.message}`)
        try {
          process.kill(pid, 'SIGTERM')
        } catch {}
      }
    })
  } else {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
  }
}

// Patterns indiquant que le joueur quitte la partie ou se déconnecte du serveur Athéna
const DISCONNECT_PATTERNS = [
  /\[.*ClientPacketListener.*\]: Disconnected/i,
  /Disconnected from server/i,
  /Disconnecting from /i,
  /disconnect\.disconnected/i,
  /disconnect\.kicked/i,
  /disconnect\.lost/i,
  /Leaving multiplayer game/i,
  /Connection closed by server/i,
  /Lost connection to server/i,
  /\[minecraft\/Minecraft\]: Disconnecting/i,
  /Failed to connect to the server/i,
  /Could not connect to server/i,
  /Connection refused/i,
  /Stopping!/i
]

export function registerLauncherHandlers(mainWindow: BrowserWindow) {
  // Handler IPC pour tuer Minecraft à la demande depuis le renderer
  ipcMain.handle('game:kill', () => {
    killMinecraft()
    return { success: true }
  })

  ipcMain.handle(
    'game:launch',
    (_event, payload: { account: Account; settings: IGameSettings; profileSlug: string; serverIp?: string; serverPort?: number }) => {
      const { account, settings, profileSlug, serverIp, serverPort } = payload

      let java: { install: 'auto' } | { install: 'manual'; absolutePath: string } = { install: 'auto' }
      if (settings.java === 'system') {
        const jdk21Path = 'C:\\Program Files\\Java\\jdk-21.0.10\\bin\\java.exe'
        const javaExe = fs.existsSync(jdk21Path) ? jdk21Path : 'java'
        java = { install: 'manual', absolutePath: javaExe }
      }

      const host = serverIp || '127.0.0.1'
      const port = serverPort || 25565
      const gameArgs = ['--quickPlayMultiplayer', `${host}:${port}`, '--quickPlayPath', 'quickPlay.json']
      let actionTimer: ReturnType<typeof setTimeout> | null = null
      let disconnectWatchArmed = false
      isExitingOnDisconnect = false

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

      // Interception du spawn du processus Minecraft pour capturer son PID,
      // injecter authlib-injector et gérer le cycle de vie du processus
      ;(launcher as any).run = async function (javaPath: string, args: string[]) {
        const { spawn } = await import('node:child_process')

        // ─── Injection de authlib-injector (sécurité anti-crack) ───────────
        const authlibPath = getAuthlibInjectorPath()
        const authlibArg = `-javaagent:${authlibPath}=${AUTH_SERVER_URL}`

        // Insérer l'argument authlib au début des args JVM (avant -cp et -jar)
        // Les args EML sont de la forme : [jvmArgs..., '-cp', classpath, mainClass, gameArgs...]
        const cpIndex = args.findIndex((a) => a === '-cp' || a === '-classpath' || a === '--classpath')
        if (cpIndex > 0) {
          args.splice(0, 0, authlibArg)
          logger.info(`[Modey Launcher] 🔒 authlib-injector injecté dans les JVM args → ${AUTH_SERVER_URL}`)
        } else {
          // Fallback : insertion en première position
          args.unshift(authlibArg)
          logger.info(`[Modey Launcher] 🔒 authlib-injector injecté (fallback) → ${AUTH_SERVER_URL}`)
        }
        // ───────────────────────────────────────────────────────────────────

        return new Promise<void>((resolve, reject) => {
          try {
            const minecraft = spawn(javaPath, args, { cwd: this.config.root, detached: true })
            activeMinecraftProcess = minecraft
            activeMinecraftPid = minecraft.pid ?? null

            minecraft.unref()

            minecraft.stdout?.on('data', (data: Buffer) => {
              const line = data.toString('utf8').replace(/\n$/, '')
              this.emit('launch_data', line)
            })

            minecraft.stderr?.on('data', (data: Buffer) => {
              const line = data.toString('utf8').replace(/\n$/, '')
              this.emit('launch_data', line)
            })

            minecraft.on('error', (err: Error) => {
              logger.error('[Modey Launcher] Erreur processus Minecraft :', err)
              activeMinecraftPid = null
              activeMinecraftProcess = null
              reject(err)
            })

            minecraft.on('close', (code: number | null) => {
              logger.info(`[Modey Launcher] Processus Minecraft fermé avec code: ${code}`)
              activeMinecraftPid = null
              activeMinecraftProcess = null
              const finalCode = isExitingOnDisconnect ? 0 : (code ?? 0)
              this.emit('launch_close', finalCode)
              resolve()
            })
          } catch (spawnErr) {
            logger.error('[Modey Launcher] Échec du spawn Minecraft :', spawnErr)
            reject(spawnErr)
          }
        })
      }

      launcher.on('launch_compute_download', () => {
        logger.log('Computing download...')
        mainWindow.webContents.send('game:launch_compute_download')
      })

      launcher.on('launch_download', (download) => {
        logger.log(`Downloading ${download.total.amount} files (${download.total.size} B).`)
        mainWindow.webContents.send('game:launch_download', download)
      })
      launcher.on('download_progress', (progress) => {
        mainWindow.webContents.send('game:download_progress', progress)
      })
      launcher.on('download_error', (error) => {
        logger.error(`Error downloading ${error.filename}: ${error.message}`)
        mainWindow.webContents.send('game:download_error', error)
      })
      launcher.on('download_end', (info) => {
        logger.log(`Downloaded ${info.downloaded.amount} files.`)
        mainWindow.webContents.send('game:download_end', info)
      })

      launcher.on('launch_install_loader', (loader) => {
        logger.log(`Installing loader ${loader.type} ${loader.loaderVersion}...`)
        mainWindow.webContents.send('game:launch_install_loader', loader)
      })

      launcher.on('launch_extract_natives', () => {
        logger.log('Extracting natives...')
        mainWindow.webContents.send('game:launch_extract_natives')
      })
      launcher.on('extract_progress', (progress) => {
        logger.log(`Extracted ${progress.filename}.`)
        mainWindow.webContents.send('game:extract_progress', progress)
      })
      launcher.on('extract_end', (info) => {
        logger.log(`Extracted ${info.amount} files.`)
        mainWindow.webContents.send('game:extract_end', info)
      })

      launcher.on('launch_copy_assets', () => {
        logger.log('Copying assets...')
        mainWindow.webContents.send('game:launch_copy_assets')
      })
      launcher.on('copy_progress', (progress) => {
        logger.log(`Copied ${progress.filename} to ${progress.dest}.`)
        mainWindow.webContents.send('game:copy_progress', progress)
      })
      launcher.on('copy_end', (info) => {
        logger.log(`Copied ${info.amount} files.`)
        mainWindow.webContents.send('game:copy_end', info)
      })

      launcher.on('launch_patch_loader', () => {
        logger.log('Patching loader...')
        mainWindow.webContents.send('game:launch_patch_loader')
      })
      launcher.on('patch_progress', (progress) => {
        mainWindow.webContents.send('game:patch_progress', progress)
      })
      launcher.on('patch_error', (error) => {
        logger.error(`Error patching ${error.filename}: ${error.message}`)
        mainWindow.webContents.send('game:patch_error', error)
      })
      launcher.on('patch_end', (info) => {
        logger.log(`Patched ${info.amount} files.`)
        mainWindow.webContents.send('game:patch_end', info)
      })

      launcher.on('launch_check_java', () => {
        logger.log('Checking Java...')
        mainWindow.webContents.send('game:launch_check_java')
      })
      launcher.on('java_info', (info) => {
        logger.log(`Using Java ${info.version} ${info.arch}`)
        mainWindow.webContents.send('game:java_info', info)
      })

      launcher.on('launch_clean', () => {
        logger.log('Cleaning game directory...')
        mainWindow.webContents.send('game:launch_clean')
      })
      launcher.on('clean_progress', (progress) => {
        mainWindow.webContents.send('game:clean_progress', progress)
      })
      launcher.on('clean_end', (info) => {
        logger.log(`Cleaned ${info.amount} files.`)
        mainWindow.webContents.send('game:clean_end', info)
      })

      launcher.on('launch_launch', (info) => {
        logger.log(`Launching Minecraft ${info.version} (${info.type}${info.loaderVersion ? ` ${info.loaderVersion}` : ''})...`)
        mainWindow.webContents.send('game:launch_launch', info)

        // Activer la surveillance de déconnexion après le démarrage du moteur de jeu
        setTimeout(() => {
          disconnectWatchArmed = true
        }, 3000)

        if (settings.launcherAction === 'close') {
          actionTimer = setTimeout(() => app.quit(), 5000)
        } else if (settings.launcherAction === 'hide') {
          actionTimer = setTimeout(() => mainWindow.minimize(), 5000)
        }
        mainWindow.webContents.send('game:launched')
      })

      launcher.on('launch_data', (message: string) => {
        logger.log(message)

        // Détection de déconnexion du serveur Athéna
        if (disconnectWatchArmed && activeMinecraftPid && !isExitingOnDisconnect) {
          if (DISCONNECT_PATTERNS.some((pattern) => pattern.test(message))) {
            logger.info(`[Athéna-Guard] Déconnexion détectée via les logs : "${message}". Fermeture automatique de Minecraft...`)
            killMinecraft()
          }
        }

        mainWindow.webContents.send('game:launch_data', message)
      })

      launcher.on('launch_close', (code: number) => {
        logger.log(`Minecraft fermé avec code ${code}.`)
        if (actionTimer) {
          clearTimeout(actionTimer)
          actionTimer = null
        }

        // Toujours restaurer la fenêtre du launcher lorsque Minecraft se ferme
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        }

        mainWindow.webContents.send('game:launch_close', isExitingOnDisconnect ? 0 : code)
        isExitingOnDisconnect = false
      })

      launcher.on('launch_debug', (message) => {
        logger.debug(message)
        mainWindow.webContents.send('game:launch_debug', message)
      })
      launcher.on('patch_debug', (message) => {
        mainWindow.webContents.send('game:patch_debug', message)
      })

      try {
        void launcher.launch().catch((err) => {
          logger.error('Launcher error:', err)
          mainWindow.webContents.send('game:launch_close', 1)
        })
      } catch (err) {
        logger.error('Launcher error:', err)
        mainWindow.webContents.send('game:launch_close', 1)
      }
    }
  )
}
