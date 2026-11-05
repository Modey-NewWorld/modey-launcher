import { ipcMain, BrowserWindow } from 'electron'
import { Launcher } from 'eml-lib'
import type { Account } from 'eml-lib'
import type { IGameSettings } from '../settings'
import { readLocalServerConfig, writeLocalServerConfig } from '../settings'
import { instancePathFor } from '../files'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, AUTH_SERVER_URL, getSystemJava21Path, DEFAULT_MC_VERSION, DEFAULT_LOADER, DEFAULT_LOADER_VERSION } from '../../const'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { IPC } from '../../ipc-channels'
import { getDynamicMemoryLimits } from '../../runtimeConfig'
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
      const cleanSlug = (profileSlug || 'athena').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
      const instDir = instancePathFor(cleanSlug)
      const pathModule = require('node:path')
      const modsDir = pathModule.join(instDir, 'mods')
      const optDir = pathModule.join(instDir, 'optional-mods')
      if (!fs.existsSync(modsDir)) return { hasExtra: false, extraMods: [] }

      const localFiles = fs.readdirSync(modsDir).filter((f: string) => f.endsWith('.jar'))
      const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${cleanSlug}`)
      if (!resp.ok) return { hasExtra: false, extraMods: [] }
      const data = await resp.json()
      const officialFiles = (data.files || []).map((f: any) => f.name)
      const allowedOptionalFiles = (data.optionalMods || []).map((f: any) => f.name)
      const localOptFiles = fs.existsSync(optDir) ? fs.readdirSync(optDir) : []
      const allowedSet = new Set([...officialFiles, ...allowedOptionalFiles, ...localOptFiles])
      const extraMods = localFiles.filter((f: string) => !allowedSet.has(f))
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

      // Garde-fou strict : vérifier si le serveur cible est restreint (maintenance, comingSoon, désactivé)
      try {
        const metaResp = await fetch(`${AUTH_SERVER_URL}/api/modey/launcher`).catch(() => null)
        if (metaResp && metaResp.ok) {
          const metaData = await metaResp.json()
          const serverInfo = metaData?.servers?.[profileSlug]
          if (serverInfo) {
            const isRestricted = serverInfo.status === 'comingSoon' || serverInfo.status === 'maintenance' || serverInfo.enabled === false || serverInfo.maintenanceEnabled === true
            if (isRestricted) {
              const userRole = String((account as any)?.role || 'citizen').toLowerCase()
              const userPerms: string[] = Array.isArray((account as any)?.permissions) ? (account as any).permissions : []
              const bypassRoles: string[] = Array.isArray(serverInfo.bypassRoles)
                ? serverInfo.bypassRoles.map((r: string) => r.toLowerCase())
                : ['founder', 'super_admin', 'admin', 'moderator']
              
              const isStaff = userRole === 'founder' || userRole === 'super_admin' || userRole === 'superadmin' ||
                ['admin', 'moderator', 'developer', 'dev', 'super_moderator'].includes(userRole) ||
                bypassRoles.includes(userRole) ||
                userPerms.includes('*') ||
                userPerms.includes('server:bypass_maintenance') ||
                userPerms.includes('launcher:bypass_maintenance')

              if (!isStaff) {
                logger.warn(`[Modey Launcher] Accès refusé pour ${account.name} (rôle: ${userRole}) vers ${profileSlug} (statut: ${serverInfo.status})`)
                throw new Error(`Accès refusé : le serveur '${serverInfo.name || profileSlug}' est actuellement restreint (${serverInfo.status || 'maintenance'}). Seul le personnel autorisé peut s'y connecter.`)
              }
            }
          }
        }
      } catch (authErr: any) {
        if (authErr?.message?.includes('Accès refusé')) throw authErr
        logger.warn('[Modey Launcher] Impossible de vérifier les restrictions serveur en amont :', authErr)
      }


      let java: { install: 'auto' } | { install: 'manual'; absolutePath: string } = { install: 'auto' }
      if (settings.java === 'system' || (settings.java && settings.java !== 'bundled')) {
        const javaExe = getSystemJava21Path(settings.java === 'system' ? undefined : settings.java)
        java = { install: 'manual', absolutePath: javaExe }
      }

      // Synchroniser avec server-settings.json s'il a été édité sur disque
      const localDiskCfg = readLocalServerConfig(profileSlug)
      if (localDiskCfg) {
        if (!settings.serverSettings) settings.serverSettings = {}
        settings.serverSettings[profileSlug] = {
          ...(settings.serverSettings[profileSlug] || {}),
          ...localDiskCfg
        }
      }

      // Résolution d'écran dédiée par serveur (avec repli sur la valeur par défaut ou globale)
      const serverRes = settings.serverSettings?.[profileSlug]?.resolution
      const localRes = localDiskCfg?.resolution
      const globalRes = settings.resolution
      const effectiveRes = serverRes || localRes || globalRes || { width: 1280, height: 720, fullscreen: false }

      const host = serverIp || '127.0.0.1'
      const port = serverPort || 25565
      const gameArgs = ['--quickPlayMultiplayer', `${host}:${port}`, '--quickPlayPath', 'quickPlay.json']

      let actionTimer: ReturnType<typeof setTimeout> | null = null

      const targetMcVersion = minecraftVersion || DEFAULT_MC_VERSION
      const targetLoaderType = loaderType || DEFAULT_LOADER
      const targetLoaderVersion = loaderVersion || DEFAULT_LOADER_VERSION

      // Arguments JVM personnalisés par serveur
      const serverJvmArgs = settings.serverSettings?.[profileSlug]?.jvmArgs ?? localDiskCfg?.jvmArgs
      const useDefaultJvmArgs = settings.serverSettings?.[profileSlug]?.useDefaultJvmArgs ?? localDiskCfg?.useDefaultJvmArgs ?? true

      // Résolution de la RAM (dédiée par serveur si définie, sinon RAM globale)
      const serverMemory = settings.serverSettings?.[profileSlug]?.memory
      const defaultMemory = getDynamicMemoryLimits()
      const effectiveMemory = serverMemory && typeof serverMemory.max === 'number'
        ? serverMemory
        : (settings.memory || { min: defaultMemory.minGb, max: defaultMemory.maxGb })
      const ramMinMb = Math.max(512, Math.round((effectiveMemory.min || defaultMemory.minGb) * 1024))
      const ramMaxMb = Math.max(ramMinMb + 512, Math.round((effectiveMemory.max || defaultMemory.maxGb) * 1024))

      // Sauvegarder la configuration effective dans server-settings.json pour ce serveur
      writeLocalServerConfig(profileSlug, {
        memory: effectiveMemory,
        optionalMods: settings.serverSettings?.[profileSlug]?.optionalMods || localDiskCfg?.optionalMods || {},
        resolution: effectiveRes,
        jvmArgs: serverJvmArgs,
        useDefaultJvmArgs: useDefaultJvmArgs
      })

      logger.log(`Launching Minecraft ${targetMcVersion} (${targetLoaderType} ${targetLoaderVersion}) for profile ${profileSlug} with server target ${host}:${port} [RAM: ${ramMinMb}M-${ramMaxMb}M, Res: ${effectiveRes.fullscreen ? 'fullscreen' : `${effectiveRes.width}x${effectiveRes.height}`}]`)

      // 1. Synchroniser les mods optionnels pour ce profil avant lancement
      try {
        const cleanSlug = profileSlug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        const instDir = instancePathFor(cleanSlug)
        const optDir = require('node:path').join(instDir, 'optional-mods')
        const modsDir = require('node:path').join(instDir, 'mods')

        if (fs.existsSync(optDir)) {
          const optModsConfig = settings.serverSettings?.[profileSlug]?.optionalMods || localDiskCfg?.optionalMods || {}
          const optFiles = fs.readdirSync(optDir)

          for (const file of optFiles) {
            const modId = file.replace(/\.jar$/i, '')
            const isEnabled = optModsConfig[modId] === true || (optModsConfig[modId] === undefined && optModsConfig[file] === true)
            const isExplicitlyDisabled = optModsConfig[modId] === false || optModsConfig[file] === false
            const activePath = require('node:path').join(modsDir, file)
            const optPath = require('node:path').join(optDir, file)

            if (isEnabled) {
              if (!fs.existsSync(activePath) && fs.existsSync(optPath)) {
                fs.copyFileSync(optPath, activePath)
                logger.info(`[Launcher Sync] Mod optionnel activé synchronisé dans mods/: ${file}`)
              }
            } else if (isExplicitlyDisabled) {
              if (fs.existsSync(activePath)) {
                fs.unlinkSync(activePath)
                logger.info(`[Launcher Sync] Mod optionnel désactivé retiré de mods/: ${file}`)
              }
            }
          }
        }
      } catch (optSyncErr) {
        logger.warn('[Launcher Sync] Erreur lors de la synchronisation des mods optionnels avant lancement:', optSyncErr)
      }

      // 2. Récupérer et enrichir les règles d'exclusion de nettoyage décidées par le serveur
      let serverCleaningIgnored: string[] = [
        'crash-reports/',
        'logs/',
        'resourcepacks/',
        'resources/',
        'saves/',
        'shaderpacks/',
        'screenshots/',
        'optional-mods/',
        'options.txt',
        'optionsof.txt',
        'quickPlay.json',
        'servers.dat',
        'server-settings.json',
        'config/iris.properties',
        'config/sodium-options.json',
        'config/fancymenu/',
        'config/drippyloadingscreen/'
      ]

      try {
        const updaterResp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${profileSlug}`)
        if (updaterResp.ok) {
          const updaterManifest = await updaterResp.json()
          if (Array.isArray(updaterManifest.cleaningIgnored)) {
            for (const item of updaterManifest.cleaningIgnored) {
              if (!serverCleaningIgnored.includes(item)) serverCleaningIgnored.push(item)
            }
          }
          if (Array.isArray(updaterManifest.optionalMods)) {
            for (const m of updaterManifest.optionalMods) {
              const activeModPath = `mods/${m.name}`
              if (!serverCleaningIgnored.includes(activeModPath)) {
                serverCleaningIgnored.push(activeModPath)
              }
            }
          }
        }
      } catch (manifestErr) {
        logger.warn('Failed to fetch cleaning rules from server:', manifestErr)
      }

      // Protéger aussi les mods optionnels installés localement contre toute suppression
      try {
        const localOptDir = require('node:path').join(instancePathFor(profileSlug), 'optional-mods')
        if (fs.existsSync(localOptDir)) {
          const localFiles = fs.readdirSync(localOptDir)
          for (const f of localFiles) {
            const activePath = `mods/${f}`
            if (!serverCleaningIgnored.includes(activePath)) {
              serverCleaningIgnored.push(activePath)
            }
          }
        }
      } catch (_) {}

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
        window: {
          width: effectiveRes.fullscreen ? 1280 : (effectiveRes.width || 1280),
          height: effectiveRes.fullscreen ? 720 : (effectiveRes.height || 720),
          fullscreen: !!effectiveRes.fullscreen
        },
        account: account,
        cleaning: {
          enabled: forceClean ? true : !(account as any)?.hasNoCleaning,
          ignored: serverCleaningIgnored
        },
        java: java,
        memory: {
          min: ramMinMb,
          max: ramMaxMb
        }
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

          // Injection des arguments JVM personnalisés par serveur
          if (serverJvmArgs && typeof serverJvmArgs === 'string' && serverJvmArgs.trim().length > 0) {
            const customTokens = serverJvmArgs.trim().split(/\s+/).filter(Boolean)
            if (customTokens.length > 0) {
              args.unshift(...customTokens)
              logger.info(`[Modey Launcher] ⚡ Arguments JVM personnalisés injectés pour ${profileSlug} : ${customTokens.join(' ')}`)
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
              const str = data.toString('utf8').replace(/\n$/, '')
              logger.info(`[Minecraft stdout] ${str}`)
              ;(launcher as any).emit('launch_data', str)
            })
            minecraft.stderr.on('data', (data: Buffer) => {
              const str = data.toString('utf8').replace(/\n$/, '')
              logger.error(`[Minecraft stderr] ${str}`)
              ;(launcher as any).emit('launch_data', str)
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

  // Vérification & Réparation de l'intégrité des fichiers du serveur
  ipcMain.handle(IPC.game.verifyIntegrity, async (_event, slug: string) => {
    try {
      const cleanSlug = (slug || 'athena').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
      const instDir = instancePathFor(cleanSlug)
      logger.info(`[Integrity] Début de la vérification des fichiers pour : ${cleanSlug}`)

      const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${cleanSlug}`).catch(() => null)
      if (!resp || !resp.ok) {
        return { success: false, error: 'Impossible de joindre le serveur de distribution pour vérifier les fichiers.' }
      }
      const manifest = await resp.json()
      const filesList: any[] = Array.isArray(manifest.files) ? manifest.files : []
      let repairedCount = 0
      let validCount = 0

      for (const item of filesList) {
        if (!item.path || !item.url) continue
        const targetFile = path.join(instDir, item.path)
        let needsDownload = false

        if (!fs.existsSync(targetFile)) {
          needsDownload = true
        } else if (item.sha1) {
          try {
            const buf = fs.readFileSync(targetFile)
            const sha1 = crypto.createHash('sha1').update(buf).digest('hex')
            if (sha1.toLowerCase() !== item.sha1.toLowerCase()) {
              needsDownload = true
            } else {
              validCount++
            }
          } catch {
            needsDownload = true
          }
        } else {
          validCount++
        }

        if (needsDownload) {
          const dir = path.dirname(targetFile)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          const fileResp = await fetch(item.url).catch(() => null)
          if (fileResp && fileResp.ok) {
            const arrayBuf = await fileResp.arrayBuffer()
            fs.writeFileSync(targetFile, Buffer.from(arrayBuf))
            repairedCount++
            logger.info(`[Integrity Repair] Fichier réparé/mis à jour : ${item.path}`)
          } else {
            logger.warn(`[Integrity Repair] Échec de téléchargement pour : ${item.path}`)
          }
        }
      }

      logger.info(`[Integrity] Terminé pour ${cleanSlug}: ${validCount} valides, ${repairedCount} réparés sur ${filesList.length} fichiers`)
      return {
        success: true,
        total: filesList.length,
        valid: validCount,
        repaired: repairedCount
      }
    } catch (err: any) {
      logger.error('[Integrity Repair] Erreur lors de la vérification :', err)
      return { success: false, error: err?.message || 'Erreur inconnue lors de la vérification.' }
    }
  })
}
