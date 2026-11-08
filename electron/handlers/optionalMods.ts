import { ipcMain } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { IPC } from '../ipc-channels'
import { instancePathFor } from './files'
import { ADMINTOOL_URL } from '../const'
import { readLocalServerConfig, writeLocalServerConfig } from './settings'
import { fetchServerManifest } from './manifestCache'

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

/**
 * Calcule l'empreinte SHA1 d'un fichier sur disque
 */
export function computeFileSha1(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    return crypto.createHash('sha1').update(buf).digest('hex').toLowerCase()
  } catch {
    return null
  }
}

/**
 * Migre l'ancien dossier legacy optional-mods/ vers le dossier mods/
 * en respectant les états .jar (activé) ou .jar.disabled (désactivé).
 */
function migrateLegacyOptionalModsDir(
  instDir: string,
  modsDir: string,
  validModsMap: Map<string, { id: string; name: string; sha1: string }>,
  optModsConfig: Record<string, boolean>
) {
  const legacyOptDir = path.join(instDir, 'optional-mods')
  if (!fs.existsSync(legacyOptDir)) return

  try {
    const files = fs.readdirSync(legacyOptDir)
    for (const f of files) {
      const srcPath = path.join(legacyOptDir, f)
      const baseName = f.replace(/\.disabled$/i, '')
      const modInfo = validModsMap.get(baseName) || validModsMap.get(baseName.replace(/\.jar$/i, ''))

      if (modInfo) {
        // Déterminer si le mod doit être activé (.jar) ou désactivé (.jar.disabled)
        const isEnabled =
          optModsConfig[modInfo.id] === true ||
          (optModsConfig[modInfo.id] === undefined && optModsConfig[modInfo.name] === true)

        const targetFileName = isEnabled ? modInfo.name : `${modInfo.name}.disabled`
        const targetPath = path.join(modsDir, targetFileName)

        if (!fs.existsSync(targetPath)) {
          try {
            fs.copyFileSync(srcPath, targetPath)
            logger.info(`[Migrate OptionalMods] ${f} migré vers mods/${targetFileName}`)
          } catch (_) {}
        }
      }

      try {
        fs.unlinkSync(srcPath)
      } catch (_) {}
    }

    try {
      fs.rmdirSync(legacyOptDir)
      logger.info('[Migrate OptionalMods] Ancien dossier optional-mods supprimé avec succès.')
    } catch (_) {}
  } catch (err) {
    logger.warn('[Migrate OptionalMods] Erreur migration ancien dossier optional-mods:', err)
  }
}

/**
 * Nettoie et purge les mods facultatifs qui ne sont plus présents sur le serveur.
 * Supprime les fichiers obsolètes ou falsifiés dans mods/, et nettoie server-settings.json.
 */
export function pruneOrphanedOptionalMods(
  slug: string,
  remoteOptionalMods: any[] = [],
  officialFiles: any[] = []
): { deletedFromMods: string[]; cleanedSettings: string[] } {
  const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
  const instDir = instancePathFor(cleanSlug)
  const modsDir = path.join(instDir, 'mods')

  if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

  const deletedFromMods: string[] = []
  const cleanedSettings: string[] = []

  // Configuration locale pour déterminer l'état d'activation
  const localCfg = readLocalServerConfig(cleanSlug)
  const optModsConfig = localCfg?.optionalMods || {}

  // 1. Map des mods optionnels autorisés avec leur hash officiel
  const validModsMap = new Map<string, { id: string; name: string; sha1: string }>()
  const validOptionalFileNames = new Set<string>()
  const validOptionalModIds = new Set<string>()

  for (const m of remoteOptionalMods || []) {
    if (!m) continue
    const fname = m.name || m.path || (m.id ? `${m.id}.jar` : '')
    const modId = m.id || fname.replace(/\.jar$/i, '')
    const sha1 = (m.sha1 || '').toLowerCase()
    const info = { id: modId, name: fname, sha1 }
    validModsMap.set(fname, info)
    validModsMap.set(modId, info)
    if (fname) {
      validOptionalFileNames.add(fname)
      validOptionalFileNames.add(`${fname}.disabled`)
      validOptionalFileNames.add(path.basename(fname))
      validOptionalFileNames.add(`${path.basename(fname)}.disabled`)
    }
    if (modId) {
      validOptionalModIds.add(modId)
    }
  }

  // 2. Migration automatique de l'ancien dossier legacy optional-mods/ si présent
  migrateLegacyOptionalModsDir(instDir, modsDir, validModsMap, optModsConfig)

  // 3. Liste des mods officiels obligatoires (ne jamais y toucher !)
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

  // 4. Purge et contrôle d'intégrité SHA1 dans le dossier mods/
  if (fs.existsSync(modsDir)) {
    try {
      const filesInMods = fs.readdirSync(modsDir)
      for (const file of filesInMods) {
        const isJar = file.endsWith('.jar')
        const isDisabledJar = file.endsWith('.jar.disabled')
        if (!isJar && !isDisabledJar) continue

        // Ne jamais toucher aux mods officiels
        if (officialModNames.has(file)) continue

        const filePath = path.join(modsDir, file)
        const baseName = file.replace(/\.disabled$/i, '')
        const modInfo = validModsMap.get(baseName)

        if (!modInfo) {
          // Ce mod n'est ni officiel ni dans la liste optionnelle approuvée par le serveur : SUPPRESSION
          try {
            fs.unlinkSync(filePath)
            deletedFromMods.push(file)
            logger.info(`[Prune OptionalMods] Supprimé de mods/ (mod orphelin ou supprimé du serveur) : ${file}`)
          } catch (delErr) {
            logger.warn(`[Prune OptionalMods] Échec suppression mods/${file}:`, delErr)
          }
          continue
        }

        // Le mod est bien un mod optionnel serveur approuvé : CONTRÔLE STRICT DU HASH SHA1 !
        if (modInfo.sha1) {
          const localSha1 = computeFileSha1(filePath)
          if (localSha1 && localSha1 !== modInfo.sha1) {
            // ALERTE INTÉGRITÉ : Mod falsifié, modifié ou corrompu !
            logger.warn(
              `[OptionalMods Security] ⚠️ Falsification ou hash invalide détecté pour ${file} ! Attendu: ${modInfo.sha1}, Trouvé: ${localSha1}. Suppression immédiate.`
            )
            try {
              fs.unlinkSync(filePath)
              deletedFromMods.push(`${file} (falsifié/corrompu)`)
            } catch (_) {}
            continue
          }
        }
      }
    } catch (readErr) {
      logger.warn('[Prune OptionalMods] Erreur lecture dossier mods:', readErr)
    }
  }

  // 5. Nettoyage des clés obsolètes dans server-settings.json
  try {
    if (localCfg?.optionalMods) {
      let modified = false
      for (const key of Object.keys(localCfg.optionalMods)) {
        const baseKey = key.replace(/\.jar$/i, '').replace(/\.disabled$/i, '')
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

  return { deletedFromMods, cleanedSettings }
}

export function registerOptionalModsHandlers() {
  // 1. Lister les mods optionnels pour un serveur (manifest distant vs état local)
  ipcMain.handle(IPC.optionalMods.list, async (_event, slug: string): Promise<IOptionalModItem[]> => {
    try {
      const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
      const instDir = instancePathFor(cleanSlug)
      const modsDir = path.join(instDir, 'mods')

      if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

      // Récupérer le manifest distant
      const data: any = (await fetchServerManifest(ADMINTOOL_URL, cleanSlug)) || {}
      const remoteOptionalMods: any[] = Array.isArray(data.optionalMods) ? data.optionalMods : []

      // Purger immédiatement les mods orphelins et vérifier les hashs
      pruneOrphanedOptionalMods(cleanSlug, remoteOptionalMods, data.files || [])

      // Lire la configuration locale pour savoir quels mods sont activés
      const localCfg = readLocalServerConfig(cleanSlug)
      const optionalModsStates: Record<string, boolean> = localCfg?.optionalMods || {}
      const filesInMods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir) : []

      const result: IOptionalModItem[] = remoteOptionalMods
        .filter((rem) => rem && (rem.name || rem.path || rem.id))
        .map((rem) => {
          const fileName = rem.name || rem.path || `${rem.id}.jar`
          const disabledFileName = `${fileName}.disabled`
          const modId = rem.id || fileName.replace(/\.jar$/i, '')

          const isActivePresent = filesInMods.includes(fileName)
          const isDisabledPresent = filesInMods.includes(disabledFileName)
          const isInstalled = isActivePresent || isDisabledPresent

          // Déterminer l'état actif (config explicite prioritaire, sinon fichier actif présent)
          const explicitState =
            optionalModsStates[modId] !== undefined
              ? optionalModsStates[modId]
              : optionalModsStates[fileName] !== undefined
                ? optionalModsStates[fileName]
                : optionalModsStates[disabledFileName]

          const isEnabled = explicitState !== undefined ? explicitState === true : isActivePresent

          // Si le mod est installé, s'assurer que le nom sur disque reflète l'état activé/désactivé
          if (isInstalled) {
            const activePath = path.join(modsDir, fileName)
            const disabledPath = path.join(modsDir, disabledFileName)

            if (isEnabled && isDisabledPresent && !isActivePresent) {
              try {
                fs.renameSync(disabledPath, activePath)
                logger.info(`[OptionalMods] Renommé ${disabledFileName} -> ${fileName} (activé)`)
              } catch (_) {}
            } else if (!isEnabled && isActivePresent && !isDisabledPresent) {
              try {
                fs.renameSync(activePath, disabledPath)
                logger.info(`[OptionalMods] Renommé ${fileName} -> ${disabledFileName} (désactivé)`)
              } catch (_) {}
            }
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

  // 2. Installer (télécharger avec vérification SHA1) un mod optionnel directement dans mods/
  ipcMain.handle(
    IPC.optionalMods.install,
    async (_event, { slug, modId }: { slug: string; modId: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        const instDir = instancePathFor(cleanSlug)
        const modsDir = path.join(instDir, 'mods')

        if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

        // Chercher l'URL de téléchargement
        const data: any = await fetchServerManifest(ADMINTOOL_URL, cleanSlug)
        if (!data) return { success: false, error: 'Impossible de joindre le serveur de distribution.' }
        const mod = (data.optionalMods || []).find((m: any) => m.id === modId || m.name === modId)
        if (!mod || !mod.url) return { success: false, error: 'Mod optionnel introuvable dans le catalogue.' }

        const cleanName = sanitizeFileName(mod.name || `${modId}.jar`)
        const targetActivePath = path.join(modsDir, cleanName)
        const disabledPath = `${targetActivePath}.disabled`

        // Télécharger le fichier
        const fileResp = await fetch(mod.url).catch(() => null)
        if (!fileResp || !fileResp.ok) {
          return { success: false, error: `Erreur téléchargement (${fileResp ? fileResp.status : 'réseau'})` }
        }
        const arrayBuf = await fileResp.arrayBuffer()
        const buffer = Buffer.from(arrayBuf)

        // Vérification stricte du hash SHA1 reçu
        if (mod.sha1) {
          const downloadedSha1 = crypto.createHash('sha1').update(buffer).digest('hex').toLowerCase()
          if (downloadedSha1 !== mod.sha1.toLowerCase()) {
            return {
              success: false,
              error: 'Intégrité compromise : le hash SHA1 du fichier téléchargé ne correspond pas au serveur.'
            }
          }
        }

        // Supprimer toute ancienne version .disabled éventuelle
        if (fs.existsSync(disabledPath)) {
          try {
            await fsp.unlink(disabledPath)
          } catch (_) {}
        }

        // Écrire directement dans mods/<cleanName> (activé par défaut)
        await fsp.writeFile(targetActivePath, buffer)

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (!currentCfg.optionalMods) currentCfg.optionalMods = {}
        currentCfg.optionalMods[mod.id] = true
        currentCfg.optionalMods[cleanName] = true
        writeLocalServerConfig(cleanSlug, currentCfg)

        logger.info(`[OptionalMods] Mod installé, certifié SHA1 et activé : ${cleanName} sur ${cleanSlug}`)
        return { success: true }
      } catch (err: any) {
        logger.error(`[OptionalMods] Échec install mod ${modId} sur ${slug}:`, err)
        return { success: false, error: err?.message || String(err) }
      }
    }
  )

  // 3. Désinstaller (supprimer complètement du dossier mods/) un mod optionnel
  ipcMain.handle(
    IPC.optionalMods.uninstall,
    async (_event, { slug, modId }: { slug: string; modId: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        const instDir = instancePathFor(cleanSlug)
        const modsDir = path.join(instDir, 'mods')

        const cleanName = sanitizeFileName(modId.endsWith('.jar') ? modId : `${modId}.jar`)
        const activePath = path.join(modsDir, cleanName)
        const disabledPath = `${activePath}.disabled`

        if (fs.existsSync(activePath)) await fsp.unlink(activePath)
        if (fs.existsSync(disabledPath)) await fsp.unlink(disabledPath)

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (currentCfg.optionalMods) {
          delete currentCfg.optionalMods[modId]
          delete currentCfg.optionalMods[cleanName]
          delete currentCfg.optionalMods[`${cleanName}.disabled`]
          writeLocalServerConfig(cleanSlug, currentCfg)
        }

        logger.info(`[OptionalMods] Mod désinstallé complètement : ${cleanName} sur ${cleanSlug}`)
        return { success: true }
      } catch (err: any) {
        logger.error(`[OptionalMods] Échec désinstallation mod ${modId} sur ${slug}:`, err)
        return { success: false, error: err?.message || String(err) }
      }
    }
  )

  // 4. Activer ou désactiver (renommer .jar <-> .jar.disabled directement dans mods/)
  ipcMain.handle(
    IPC.optionalMods.toggle,
    async (
      _event,
      { slug, modId, enable }: { slug: string; modId: string; enable: boolean }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        const instDir = instancePathFor(cleanSlug)
        const modsDir = path.join(instDir, 'mods')

        if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true })

        const cleanName = sanitizeFileName(modId.endsWith('.jar') ? modId : `${modId}.jar`)
        const activePath = path.join(modsDir, cleanName)
        const disabledPath = `${activePath}.disabled`

        if (enable) {
          if (fs.existsSync(disabledPath)) {
            // Contrôler le SHA1 du fichier désactivé avant de le réactiver
            const data: any = await fetchServerManifest(ADMINTOOL_URL, cleanSlug)
            const modMeta = (data?.optionalMods || []).find(
              (m: any) => m.id === modId || m.name === modId || m.name === cleanName
            )
            if (modMeta && modMeta.sha1) {
              const localSha1 = computeFileSha1(disabledPath)
              if (localSha1 && localSha1 !== modMeta.sha1.toLowerCase()) {
                logger.warn(`[OptionalMods Toggle] Mod falsifié détecté (${cleanName}). Suppression du fichier altéré.`)
                try {
                  await fsp.unlink(disabledPath)
                } catch (_) {}
              }
            }
          }

          if (fs.existsSync(disabledPath)) {
            // Renommer .jar.disabled -> .jar
            await fsp.rename(disabledPath, activePath)
          } else if (!fs.existsSync(activePath)) {
            // Si le mod n'est pas présent, le télécharger officiellement
            const data: any = await fetchServerManifest(ADMINTOOL_URL, cleanSlug)
            if (!data) return { success: false, error: 'Impossible de joindre le serveur pour télécharger le mod.' }
            const mod = (data.optionalMods || []).find(
              (m: any) => m.id === modId || m.name === modId || m.name === cleanName
            )
            if (!mod || !mod.url) return { success: false, error: 'Mod optionnel introuvable sur le serveur.' }

            const fileResp = await fetch(mod.url)
            if (!fileResp.ok) return { success: false, error: 'Échec du téléchargement du mod officiel.' }
            const arrayBuf = await fileResp.arrayBuffer()
            const buffer = Buffer.from(arrayBuf)
            if (mod.sha1) {
              const hash = crypto.createHash('sha1').update(buffer).digest('hex').toLowerCase()
              if (hash !== mod.sha1.toLowerCase()) {
                return { success: false, error: 'Erreur d’intégrité SHA1 sur le fichier téléchargé.' }
              }
            }
            await fsp.writeFile(activePath, buffer)
          }
        } else {
          // Désactiver : renommer .jar -> .jar.disabled
          if (fs.existsSync(activePath)) {
            if (fs.existsSync(disabledPath)) {
              try {
                await fsp.unlink(disabledPath)
              } catch (_) {}
            }
            await fsp.rename(activePath, disabledPath)
          }
        }

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (!currentCfg.optionalMods) currentCfg.optionalMods = {}
        currentCfg.optionalMods[modId] = enable
        currentCfg.optionalMods[cleanName] = enable
        writeLocalServerConfig(cleanSlug, currentCfg)

        logger.info(
          `[OptionalMods] Mod ${cleanName} ${enable ? 'activé (.jar)' : 'désactivé (.jar.disabled)'} sur ${cleanSlug}`
        )
        return { success: true }
      } catch (err: any) {
        logger.error(`[OptionalMods] Échec toggle mod ${modId} sur ${slug}:`, err)
        return { success: false, error: err?.message || String(err) }
      }
    }
  )
}
