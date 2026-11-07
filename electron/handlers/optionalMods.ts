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

function resolveModFileName(dir: string, modId: string): string {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir)
    if (files.includes(modId)) return modId
    if (files.includes(`${modId}.jar`)) return `${modId}.jar`
    const matched = files.find((f) => f.replace(/\.jar$/i, '') === modId || f.startsWith(modId))
    if (matched) return matched
  }
  return modId.endsWith('.jar') ? modId : `${modId}.jar`
}

/**
 * Nettoie et purge les mods facultatifs qui ne sont plus présents sur le serveur.
 * Supprime les fichiers obsolètes dans optional-mods/, dans mods/, et nettoie server-settings.json.
 */
export function pruneOrphanedOptionalMods(
  slug: string,
  remoteOptionalMods: any[] = [],
  officialFiles: any[] = []
): { deletedFromOpt: string[]; deletedFromMods: string[]; cleanedSettings: string[] } {
  const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
  const instDir = instancePathFor(cleanSlug)
  const optDir = path.join(instDir, 'optional-mods')
  const modsDir = path.join(instDir, 'mods')

  const deletedFromOpt: string[] = []
  const deletedFromMods: string[] = []
  const cleanedSettings: string[] = []

  // 1. Liste des noms et IDs de mods optionnels autorisés par le serveur
  const validOptionalFileNames = new Set<string>()
  const validOptionalModIds = new Set<string>()

  for (const m of remoteOptionalMods || []) {
    if (!m) continue
    const fname = m.name || m.path || (m.id ? `${m.id}.jar` : '')
    if (fname) {
      validOptionalFileNames.add(fname)
      validOptionalFileNames.add(path.basename(fname))
    }
    if (m.id) {
      validOptionalModIds.add(m.id)
    }
  }

  // 2. Liste des mods officiels obligatoires (ne jamais y toucher !)
  const officialModNames = new Set<string>()
  for (const f of officialFiles || []) {
    if (!f) continue
    const subfolder = f.subfolder || ''
    const relPath = f.path || f.name || ''
    if (subfolder === 'mods' || relPath.startsWith('mods/')) {
      const bname = path.basename(relPath)
      officialModNames.add(bname)
      if (f.name) officialModNames.add(f.name)
    }
  }

  // 3. Purge du dossier optional-mods/ local
  if (fs.existsSync(optDir)) {
    try {
      const filesInOpt = fs.readdirSync(optDir)
      for (const file of filesInOpt) {
        if (!validOptionalFileNames.has(file)) {
          try {
            fs.unlinkSync(path.join(optDir, file))
            deletedFromOpt.push(file)
            logger.info(`[Prune OptionalMods] Supprimé de optional-mods/ (supprimé du serveur) : ${file}`)
          } catch (delErr) {
            logger.warn(`[Prune OptionalMods] Échec suppression optional-mods/${file}:`, delErr)
          }
        }
      }
    } catch (readErr) {
      logger.warn('[Prune OptionalMods] Erreur lecture dossier optional-mods:', readErr)
    }
  }

  // 4. Purge du dossier mods/ actif : supprimer les mods retirés du serveur
  if (fs.existsSync(modsDir)) {
    try {
      const filesInMods = fs.readdirSync(modsDir)
      for (const file of filesInMods) {
        if (!file.endsWith('.jar')) continue

        // Ne jamais supprimer les mods officiels
        if (officialModNames.has(file)) continue

        // Si ce n'est pas un mod optionnel serveur valide, c'est un mod orphelin / retiré !
        if (!validOptionalFileNames.has(file)) {
          try {
            fs.unlinkSync(path.join(modsDir, file))
            deletedFromMods.push(file)
            logger.info(`[Prune OptionalMods] Supprimé de mods/ (mod orphelin / retiré du serveur) : ${file}`)
          } catch (delErr) {
            logger.warn(`[Prune OptionalMods] Échec suppression mods/${file}:`, delErr)
          }
        }
      }
    } catch (readErr) {
      logger.warn('[Prune OptionalMods] Erreur lecture dossier mods:', readErr)
    }
  }

  // 5. Nettoyage des clés obsolètes dans server-settings.json
  try {
    const localCfg = readLocalServerConfig(cleanSlug)
    if (localCfg?.optionalMods) {
      let modified = false
      for (const key of Object.keys(localCfg.optionalMods)) {
        const baseKey = key.replace(/\.jar$/i, '')
        const isKnownOptional =
          validOptionalFileNames.has(key) ||
          validOptionalModIds.has(key) ||
          validOptionalModIds.has(baseKey)
        if (!isKnownOptional) {
          delete localCfg.optionalMods[key]
          cleanedSettings.push(key)
          modified = true
        }
      }
      if (modified) {
        writeLocalServerConfig(cleanSlug, localCfg)
        logger.info(`[Prune OptionalMods] Clés obsolètes purgées de server-settings.json:`, cleanedSettings)
      }
    }
  } catch (cfgErr) {
    logger.warn('[Prune OptionalMods] Erreur nettoyage config locale:', cfgErr)
  }

  return { deletedFromOpt, deletedFromMods, cleanedSettings }
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
      const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${cleanSlug}`).catch(() => null)
      if (!resp || !resp.ok) return []
      let data: any = {}
      try {
        data = await resp.json()
      } catch {
        return []
      }
      const remoteOptionalMods: any[] = Array.isArray(data.optionalMods) ? data.optionalMods : []

      // Purger immédiatement les mods orphelins (qui ont été supprimés côté serveur)
      pruneOrphanedOptionalMods(cleanSlug, remoteOptionalMods, data.files || [])

      // Lire la configuration locale pour savoir quels mods sont activés
      const localCfg = readLocalServerConfig(cleanSlug)
      const optionalModsStates: Record<string, boolean> = localCfg?.optionalMods || {}

      const localOptFiles = fs.existsSync(optDir) ? fs.readdirSync(optDir) : []
      const localActiveMods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir) : []

      const result: IOptionalModItem[] = remoteOptionalMods
        .filter((rem) => rem && (rem.name || rem.path || rem.id))
        .map((rem) => {
          const fileName = rem.name || rem.path || `${rem.id}.jar`
          const modId = rem.id || fileName
          const isPresentInOpt = localOptFiles.includes(fileName)
          const isPresentInActive = localActiveMods.includes(fileName)
          const isInstalled = isPresentInOpt || isPresentInActive

          // Déterminer l'état actif :
          const explicitState = optionalModsStates[modId] !== undefined ? optionalModsStates[modId] : optionalModsStates[fileName]
          const isEnabled = explicitState !== undefined ? explicitState === true : isPresentInActive

        // Si le mod est installé et activé mais pas encore copié dans mods/, on le copie
        if (isEnabled && isPresentInOpt && !isPresentInActive) {
          try {
            fs.copyFileSync(path.join(optDir, fileName), path.join(modsDir, fileName))
          } catch (_) {}
        }

        // Si expressément désactivé mais présent dans mods/, on le retire
        if (explicitState === false && isPresentInActive) {
          try {
            fs.unlinkSync(path.join(modsDir, fileName))
          } catch (_) {}
        }

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
        const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${cleanSlug}`).catch(() => null)
        if (!resp || !resp.ok) return { success: false, error: 'Impossible de joindre le serveur de distribution.' }
        let data: any = {}
        try {
          data = await resp.json()
        } catch {
          return { success: false, error: 'Réponse invalide du serveur de distribution.' }
        }
        const mod = (data.optionalMods || []).find((m: any) => m.id === modId || m.name === modId)
        if (!mod || !mod.url) return { success: false, error: 'Mod optionnel introuvable dans le catalogue.' }

        const cleanName = sanitizeFileName(mod.name || `${modId}.jar`)
        const targetOptPath = path.join(optDir, cleanName)

        // Télécharger le fichier
        const fileResp = await fetch(mod.url).catch(() => null)
        if (!fileResp || !fileResp.ok) return { success: false, error: `Erreur téléchargement (${fileResp ? fileResp.status : 'réseau'})` }
        const arrayBuf = await fileResp.arrayBuffer()
        await fsp.writeFile(targetOptPath, Buffer.from(arrayBuf))

        // Par défaut lors de l'installation, on l'active directement
        const targetActivePath = path.join(modsDir, cleanName)
        await fsp.copyFile(targetOptPath, targetActivePath)

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (!currentCfg.optionalMods) currentCfg.optionalMods = {}
        currentCfg.optionalMods[mod.id] = true
        currentCfg.optionalMods[cleanName] = true
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
        const fileName = resolveModFileName(optDir, modId)
        const optPath = path.join(optDir, fileName)
        const activePath = path.join(modsDir, fileName)

        if (fs.existsSync(optPath)) await fsp.unlink(optPath)
        if (fs.existsSync(activePath)) await fsp.unlink(activePath)

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (currentCfg.optionalMods) {
          delete currentCfg.optionalMods[modId]
          delete currentCfg.optionalMods[fileName]
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

        let fileName = resolveModFileName(optDir, modId)
        let optPath = path.join(optDir, fileName)
        const activePath = path.join(modsDir, fileName)

        if (enable) {
          if (!fs.existsSync(optPath)) {
            // Tentative de téléchargement automatique si manquant
            const resp = await fetch(`${ADMINTOOL_URL}/api/files-updater/${cleanSlug}`)
            if (resp.ok) {
              const data = await resp.json()
              const mod = (data.optionalMods || []).find((m: any) => m.id === modId || m.name === modId || m.name === fileName)
              if (mod && mod.url) {
                const fileResp = await fetch(mod.url)
                if (fileResp.ok) {
                  const arrayBuf = await fileResp.arrayBuffer()
                  fileName = sanitizeFileName(mod.name)
                  optPath = path.join(optDir, fileName)
                  await fsp.writeFile(optPath, Buffer.from(arrayBuf))
                }
              }
            }
          }

          if (!fs.existsSync(optPath)) {
            return { success: false, error: "Le mod n'est pas encore téléchargé. Cliquez sur Installer." }
          }
          await fsp.copyFile(optPath, activePath)
        } else {
          if (fs.existsSync(activePath)) {
            try { await fsp.unlink(activePath) } catch (_) {}
          }
          // S'assurer de retirer toute variante dans mods/
          const modBase = modId.replace(/\.jar$/i, '')
          if (fs.existsSync(modsDir)) {
            for (const f of fs.readdirSync(modsDir)) {
              if (f === fileName || f.replace(/\.jar$/i, '') === modBase) {
                try { await fsp.unlink(path.join(modsDir, f)) } catch (_) {}
              }
            }
          }
        }

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (!currentCfg.optionalMods) currentCfg.optionalMods = {}
        currentCfg.optionalMods[modId] = enable
        currentCfg.optionalMods[fileName] = enable
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
