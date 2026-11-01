import { ipcMain } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { IPC } from '../ipc-channels'
import { instancePathFor } from './files'
import { ADMINTOOL_URL } from '../const'
import { readLocalServerConfig, writeLocalServerConfig } from './settings'

export interface IOptionalModItem {
  id: string
  name: string
  url: string
  sha1: string
  size: number
  isInstalled: boolean
  isEnabled: boolean
}

function sanitizeFileName(filename: string): string {
  return path.basename(filename).replace(/[^a-zA-Z0-9_\-\.\+]/g, '_')
}

export function registerOptionalModsHandlers() {
  // 1. Lister les mods optionnels pour un serveur (manifest distant vs état local)
  ipcMain.handle(IPC.optionalMods.list, async (_event, slug: string): Promise<IOptionalModItem[]> => {
    try {
      const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
      const instDir = instancePathFor(cleanSlug)
      const optDir = path.join(instDir, 'optional-mods')
      const modsDir = path.join(instDir, 'mods')

      if (!fs.existsSync(optDir)) fs.mkdirSync(optDir, { recursive: true })
      if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

      // Récupérer le manifest distant
      const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${cleanSlug}`)
      if (!resp.ok) return []
      const data = await resp.json()
      const remoteOptionalMods: any[] = Array.isArray(data.optionalMods) ? data.optionalMods : []

      // Lire la configuration locale pour savoir quels mods sont activés
      const localCfg = readLocalServerConfig(cleanSlug)
      const optionalModsStates: Record<string, boolean> = localCfg?.optionalMods || {}

      const localOptFiles = fs.existsSync(optDir) ? fs.readdirSync(optDir) : []
      const localActiveMods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir) : []

      const result: IOptionalModItem[] = remoteOptionalMods.map((rem) => {
        const fileName = rem.name
        const isPresentInOpt = localOptFiles.includes(fileName)
        const isPresentInActive = localActiveMods.includes(fileName)
        const isInstalled = isPresentInOpt || isPresentInActive

        // Si présent dans activeMods ou marqué true dans la config
        const isEnabled = isPresentInActive || (optionalModsStates[rem.id] === true && isPresentInOpt)

        return {
          id: rem.id,
          name: rem.name,
          url: rem.url,
          sha1: rem.sha1,
          size: rem.size,
          isInstalled,
          isEnabled
        }
      })

      return result
    } catch (err) {
      logger.error(`[OptionalMods] Erreur listing pour ${slug}:`, err)
      return []
    }
  })

  // 2. Installer (télécharger) un mod optionnel
  ipcMain.handle(
    IPC.optionalMods.install,
    async (_event, { slug, modId }: { slug: string; modId: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        const instDir = instancePathFor(cleanSlug)
        const optDir = path.join(instDir, 'optional-mods')
        const modsDir = path.join(instDir, 'mods')

        if (!fs.existsSync(optDir)) fs.mkdirSync(optDir, { recursive: true })
        if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

        // Chercher l'URL de téléchargement
        const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${cleanSlug}`)
        if (!resp.ok) return { success: false, error: 'Impossible de joindre le serveur de distribution.' }
        const data = await resp.json()
        const mod = (data.optionalMods || []).find((m: any) => m.id === modId || m.name === modId)
        if (!mod || !mod.url) return { success: false, error: 'Mod optionnel introuvable dans le catalogue.' }

        const cleanName = sanitizeFileName(mod.name)
        const targetOptPath = path.join(optDir, cleanName)

        // Télécharger le fichier
        const fileResp = await fetch(mod.url)
        if (!fileResp.ok) return { success: false, error: `Erreur téléchargement HTTP ${fileResp.status}` }
        const arrayBuf = await fileResp.arrayBuffer()
        await fsp.writeFile(targetOptPath, Buffer.from(arrayBuf))

        // Par défaut lors de l'installation, on l'active directement
        const targetActivePath = path.join(modsDir, cleanName)
        await fsp.copyFile(targetOptPath, targetActivePath)

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (!currentCfg.optionalMods) currentCfg.optionalMods = {}
        currentCfg.optionalMods[mod.id] = true
        writeLocalServerConfig(cleanSlug, currentCfg)

        logger.info(`[OptionalMods] Mod installé et activé : ${cleanName} sur ${cleanSlug}`)
        return { success: true }
      } catch (err: any) {
        logger.error(`[OptionalMods] Échec install mod ${modId} sur ${slug}:`, err)
        return { success: false, error: err?.message || String(err) }
      }
    }
  )

  // 3. Désinstaller (supprimer du disque) un mod optionnel
  ipcMain.handle(
    IPC.optionalMods.uninstall,
    async (_event, { slug, modId }: { slug: string; modId: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        const instDir = instancePathFor(cleanSlug)
        const optDir = path.join(instDir, 'optional-mods')
        const modsDir = path.join(instDir, 'mods')

        // Identifier le nom du fichier
        let fileName = modId.endsWith('.jar') ? modId : `${modId}.jar`
        if (fs.existsSync(optDir)) {
          const matched = fs.readdirSync(optDir).find((f) => f.startsWith(modId) || f === fileName)
          if (matched) fileName = matched
        }

        const optPath = path.join(optDir, fileName)
        const activePath = path.join(modsDir, fileName)

        if (fs.existsSync(optPath)) await fsp.unlink(optPath)
        if (fs.existsSync(activePath)) await fsp.unlink(activePath)

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (currentCfg.optionalMods) {
          delete currentCfg.optionalMods[modId]
          writeLocalServerConfig(cleanSlug, currentCfg)
        }

        logger.info(`[OptionalMods] Mod désinstallé : ${fileName} sur ${cleanSlug}`)
        return { success: true }
      } catch (err: any) {
        logger.error(`[OptionalMods] Échec désinstallation mod ${modId} sur ${slug}:`, err)
        return { success: false, error: err?.message || String(err) }
      }
    }
  )

  // 4. Activer ou désactiver (copier / retirer du dossier mods actif)
  ipcMain.handle(
    IPC.optionalMods.toggle,
    async (
      _event,
      { slug, modId, enable }: { slug: string; modId: string; enable: boolean }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        const instDir = instancePathFor(cleanSlug)
        const optDir = path.join(instDir, 'optional-mods')
        const modsDir = path.join(instDir, 'mods')

        if (!fs.existsSync(optDir)) fs.mkdirSync(optDir, { recursive: true })
        if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

        let fileName = modId.endsWith('.jar') ? modId : `${modId}.jar`
        if (fs.existsSync(optDir)) {
          const matched = fs.readdirSync(optDir).find((f) => f.startsWith(modId) || f === fileName)
          if (matched) fileName = matched
        }

        const optPath = path.join(optDir, fileName)
        const activePath = path.join(modsDir, fileName)

        if (enable) {
          if (!fs.existsSync(optPath)) {
            return { success: false, error: "Le mod n'est pas encore téléchargé. Cliquez sur Installer." }
          }
          await fsp.copyFile(optPath, activePath)
        } else {
          if (fs.existsSync(activePath)) {
            await fsp.unlink(activePath)
          }
        }

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (!currentCfg.optionalMods) currentCfg.optionalMods = {}
        currentCfg.optionalMods[modId] = enable
        writeLocalServerConfig(cleanSlug, currentCfg)

        logger.info(`[OptionalMods] Mod ${fileName} ${enable ? 'activé' : 'désactivé'} sur ${cleanSlug}`)
        return { success: true }
      } catch (err: any) {
        logger.error(`[OptionalMods] Échec toggle mod ${modId} sur ${slug}:`, err)
        return { success: false, error: err?.message || String(err) }
      }
    }
  )
}
