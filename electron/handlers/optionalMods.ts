import { ipcMain } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { IPC } from '../ipc-channels'
import { instancePathFor } from './files'
import { ADMINTOOL_URL, AUTH_SERVER_URL } from '../const'
import { readLocalServerConfig, writeLocalServerConfig } from './settings'
import { fetchServerManifest, resolveUpdaterUrl } from './manifestCache'

export interface IOptionalModItem {
  id: string
  name: string
  url: string
  sha1: string
  size: number
  isInstalled: boolean
  isEnabled: boolean
  category?: 'mods' | 'shaderpacks' | 'resourcepacks' | string
  version?: string
}

function sanitizeFileName(filename: string): string {
  // Conserve les espaces, parenthèses, crochets, etc. Supprime uniquement les caractères interdits sur Windows/macOS/Linux: < > : " / \ | ? *
  return path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
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
    const cleanFname = sanitizeFileName(fname)
    const cleanModId = sanitizeFileName(modId)
    const sha1 = (m.sha1 || '').toLowerCase()
    const info = { id: modId, name: cleanFname, sha1 }

    validModsMap.set(fname, info)
    validModsMap.set(cleanFname, info)
    validModsMap.set(modId, info)
    validModsMap.set(cleanModId, info)

    if (fname) {
      validOptionalFileNames.add(fname)
      validOptionalFileNames.add(`${fname}.disabled`)
      validOptionalFileNames.add(cleanFname)
      validOptionalFileNames.add(`${cleanFname}.disabled`)
      validOptionalFileNames.add(path.basename(fname))
      validOptionalFileNames.add(`${path.basename(fname)}.disabled`)
    }
    if (modId) {
      validOptionalModIds.add(modId)
      validOptionalModIds.add(cleanModId)
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
          // Nom différent ou non reconnu par le serveur : SUPPRESSION IMMÉDIATE (même si le SHA-1 est identique)
          try {
            fs.unlinkSync(filePath)
            deletedFromMods.push(file)
            logger.info(`[Prune OptionalMods] Supprimé de mods/ (nom non reconnu par le serveur) : ${file}`)
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

      // Récupérer le manifest distant (décentralisé si configuré)
      const updaterUrl = await resolveUpdaterUrl(AUTH_SERVER_URL, cleanSlug)
      const data: any = (await fetchServerManifest(ADMINTOOL_URL, cleanSlug, updaterUrl)) || {}
      const optData = data.optional || {}
      const remoteOptionalMods: any[] = Array.isArray(optData.mods)
        ? optData.mods
        : (Array.isArray(data.optionalMods) ? data.optionalMods : [])
      const remoteOptionalShaders: any[] = Array.isArray(optData.shaderpacks) ? optData.shaderpacks : []
      const remoteOptionalResources: any[] = Array.isArray(optData.resourcepacks) ? optData.resourcepacks : []

      // Purger immédiatement les mods orphelins et vérifier les hashs
      pruneOrphanedOptionalMods(cleanSlug, remoteOptionalMods, data.files || [])

      // Lire la configuration locale pour savoir quels éléments sont activés
      const localCfg = readLocalServerConfig(cleanSlug)
      const optionalModsStates: Record<string, boolean> = localCfg?.optionalMods || {}
      const filesInMods = fs.existsSync(modsDir) ? fs.readdirSync(modsDir) : []

      const result: IOptionalModItem[] = []

      // 1. Mods optionnels
      for (const rem of remoteOptionalMods) {
        if (!rem || (!rem.name && !rem.path && !rem.id)) continue
        const fileName = rem.name || rem.path || `${rem.id}.jar`
        const cleanFileName = sanitizeFileName(fileName)
        const disabledFileName = `${fileName}.disabled`
        const cleanDisabledFileName = `${cleanFileName}.disabled`
        const modId = rem.id || fileName.replace(/\.jar$/i, '')
        const cleanModId = sanitizeFileName(modId)

        const isActivePresent = filesInMods.includes(fileName) || filesInMods.includes(cleanFileName)
        const isDisabledPresent = filesInMods.includes(disabledFileName) || filesInMods.includes(cleanDisabledFileName)
        const isInstalled = isActivePresent || isDisabledPresent

        const explicitState =
          optionalModsStates[modId] !== undefined
            ? optionalModsStates[modId]
            : optionalModsStates[cleanModId] !== undefined
              ? optionalModsStates[cleanModId]
              : optionalModsStates[fileName] !== undefined
                ? optionalModsStates[fileName]
                : optionalModsStates[cleanFileName] !== undefined
                  ? optionalModsStates[cleanFileName]
                  : optionalModsStates[disabledFileName] !== undefined
                    ? optionalModsStates[disabledFileName]
                    : optionalModsStates[cleanDisabledFileName]

        const isEnabled = explicitState !== undefined ? explicitState === true : isActivePresent

        if (isInstalled) {
          const actualActiveName = filesInMods.includes(fileName) ? fileName : cleanFileName
          const actualDisabledName = filesInMods.includes(disabledFileName) ? disabledFileName : cleanDisabledFileName
          const activePath = path.join(modsDir, actualActiveName)
          const disabledPath = path.join(modsDir, actualDisabledName)

          if (isEnabled && isDisabledPresent && !isActivePresent) {
            try {
              fs.renameSync(disabledPath, activePath)
              logger.info(`[OptionalMods] Renommé ${actualDisabledName} -> ${actualActiveName} (activé)`)
            } catch (_) {}
          } else if (!isEnabled && isActivePresent && !isDisabledPresent) {
            try {
              fs.renameSync(activePath, disabledPath)
              logger.info(`[OptionalMods] Renommé ${actualActiveName} -> ${actualDisabledName} (désactivé)`)
            } catch (_) {}
          }
        }

        result.push({
          id: rem.id,
          name: rem.name,
          url: rem.url,
          sha1: rem.sha1,
          size: rem.size,
          isInstalled,
          isEnabled,
          category: 'mods',
          version: rem.version || undefined
        })
      }

      // 2. Shaders optionnels
      const shadersDir = path.join(instDir, 'shaderpacks')
      const filesInShaders = fs.existsSync(shadersDir) ? fs.readdirSync(shadersDir) : []
      for (const rem of remoteOptionalShaders) {
        if (!rem || (!rem.name && !rem.id)) continue
        const fileName = rem.name || `${rem.id}.zip`
        const shaderId = rem.id || fileName.replace(/\.zip$/i, '')
        const isInstalled = filesInShaders.includes(fileName)
        const explicitState = optionalModsStates[shaderId] !== undefined ? optionalModsStates[shaderId] : optionalModsStates[fileName]
        const isEnabled = explicitState !== undefined ? explicitState === true : isInstalled

        result.push({
          id: rem.id,
          name: rem.name,
          url: rem.url,
          sha1: rem.sha1,
          size: rem.size,
          isInstalled,
          isEnabled,
          category: 'shaderpacks'
        })
      }

      // 3. Resourcepacks optionnels
      const resourceDir = path.join(instDir, 'resourcepacks')
      const filesInResources = fs.existsSync(resourceDir) ? fs.readdirSync(resourceDir) : []
      for (const rem of remoteOptionalResources) {
        if (!rem || (!rem.name && !rem.id)) continue
        const fileName = rem.name || `${rem.id}.zip`
        const resId = rem.id || fileName.replace(/\.zip$/i, '')
        const isInstalled = filesInResources.includes(fileName)
        const explicitState = optionalModsStates[resId] !== undefined ? optionalModsStates[resId] : optionalModsStates[fileName]
        const isEnabled = explicitState !== undefined ? explicitState === true : isInstalled

        result.push({
          id: rem.id,
          name: rem.name,
          url: rem.url,
          sha1: rem.sha1,
          size: rem.size,
          isInstalled,
          isEnabled,
          category: 'resourcepacks'
        })
      }

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

        // Chercher l'URL de téléchargement parmi mods, shaders et packs
        const updaterUrl = await resolveUpdaterUrl(AUTH_SERVER_URL, cleanSlug)
        const data: any = await fetchServerManifest(ADMINTOOL_URL, cleanSlug, updaterUrl)
        if (!data) return { success: false, error: 'Impossible de joindre le serveur de distribution.' }

        const optData = data.optional || {}
        const allOptional = [
          ...(Array.isArray(optData.mods) ? optData.mods : (data.optionalMods || [])),
          ...(Array.isArray(optData.shaderpacks) ? optData.shaderpacks : []),
          ...(Array.isArray(optData.resourcepacks) ? optData.resourcepacks : [])
        ]

        const cleanModId = sanitizeFileName(modId).toLowerCase()
        const rawModId = modId.toLowerCase()
        const mod = allOptional.find((m: any) => {
          if (!m) return false
          const mid = (m.id || '').toLowerCase()
          const mname = (m.name || '').toLowerCase()
          const mCleanName = sanitizeFileName(m.name || '').toLowerCase()
          return mid === rawModId || mid === cleanModId || mname === rawModId || mCleanName === cleanModId
        })
        if (!mod || !mod.url) return { success: false, error: 'Élément optionnel introuvable dans le catalogue.' }

        const category = mod.category || (mod.name?.endsWith('.zip') ? (mod.path?.includes('shader') ? 'shaderpacks' : 'resourcepacks') : 'mods')
        const targetDir = path.join(instDir, category === 'shaderpacks' ? 'shaderpacks' : (category === 'resourcepacks' ? 'resourcepacks' : 'mods'))
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })

        const defaultExt = category === 'mods' ? '.jar' : '.zip'
        const cleanName = sanitizeFileName(mod.name || (modId.includes('.') ? modId : `${modId}${defaultExt}`))
        const targetActivePath = path.join(targetDir, cleanName)
        const disabledPath = `${targetActivePath}.disabled`

        // Télécharger le fichier (encodage de l'URL pour gérer les espaces éventuels)
        const fileResp = await fetch(encodeURI(mod.url)).catch(() => null)
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
        if (mod.name) currentCfg.optionalMods[mod.name] = true
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

        const cleanName = sanitizeFileName(modId)
        const possiblePaths = [
          path.join(modsDir, modId.endsWith('.jar') ? modId : `${modId}.jar`),
          path.join(modsDir, `${modId.endsWith('.jar') ? modId : `${modId}.jar`}.disabled`),
          path.join(modsDir, cleanName.endsWith('.jar') ? cleanName : `${cleanName}.jar`),
          path.join(modsDir, `${cleanName.endsWith('.jar') ? cleanName : `${cleanName}.jar`}.disabled`),
          path.join(instDir, 'shaderpacks', modId.endsWith('.zip') ? modId : `${modId}.zip`),
          path.join(instDir, 'shaderpacks', cleanName.endsWith('.zip') ? cleanName : `${cleanName}.zip`),
          path.join(instDir, 'resourcepacks', modId.endsWith('.zip') ? modId : `${modId}.zip`),
          path.join(instDir, 'resourcepacks', cleanName.endsWith('.zip') ? cleanName : `${cleanName}.zip`)
        ]

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            try { await fsp.unlink(p) } catch (_) {}
          }
        }

        // Mettre à jour server-settings.json
        const currentCfg = readLocalServerConfig(cleanSlug) || {}
        if (currentCfg.optionalMods) {
          delete currentCfg.optionalMods[modId]
          delete currentCfg.optionalMods[cleanName]
          delete currentCfg.optionalMods[`${modId}.disabled`]
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

        const updaterUrl = await resolveUpdaterUrl(AUTH_SERVER_URL, cleanSlug)
        const data: any = await fetchServerManifest(ADMINTOOL_URL, cleanSlug, updaterUrl)
        const optData = data?.optional || {}
        const allOptional = [
          ...(Array.isArray(optData.mods) ? optData.mods : (data?.optionalMods || [])),
          ...(Array.isArray(optData.shaderpacks) ? optData.shaderpacks : []),
          ...(Array.isArray(optData.resourcepacks) ? optData.resourcepacks : [])
        ]
        const cleanModId = sanitizeFileName(modId).toLowerCase()
        const rawModId = modId.toLowerCase()
        const modMeta = allOptional.find((m: any) => {
          if (!m) return false
          const mid = (m.id || '').toLowerCase()
          const mname = (m.name || '').toLowerCase()
          const mCleanName = sanitizeFileName(m.name || '').toLowerCase()
          return mid === rawModId || mid === cleanModId || mname === rawModId || mCleanName === cleanModId
        })

        const rawFileName = modMeta?.name || (modId.endsWith('.jar') ? modId : `${modId}.jar`)
        const cleanName = sanitizeFileName(rawFileName)

        const candidates = [rawFileName, cleanName]
        let activePath = path.join(modsDir, cleanName)
        let disabledPath = `${activePath}.disabled`

        for (const c of candidates) {
          const act = path.join(modsDir, c)
          const dis = `${act}.disabled`
          if (fs.existsSync(act) || fs.existsSync(dis)) {
            activePath = act
            disabledPath = dis
            break
          }
        }

        if (enable) {
          if (fs.existsSync(disabledPath)) {
            // Contrôler le SHA1 du fichier désactivé avant de le réactiver
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
            if (!modMeta || !modMeta.url) return { success: false, error: 'Mod optionnel introuvable sur le serveur.' }

            const fileResp = await fetch(encodeURI(modMeta.url))
            if (!fileResp.ok) return { success: false, error: 'Échec du téléchargement du mod officiel.' }
            const arrayBuf = await fileResp.arrayBuffer()
            const buffer = Buffer.from(arrayBuf)
            if (modMeta.sha1) {
              const hash = crypto.createHash('sha1').update(buffer).digest('hex').toLowerCase()
              if (hash !== modMeta.sha1.toLowerCase()) {
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
        if (modMeta?.name) currentCfg.optionalMods[modMeta.name] = enable
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
