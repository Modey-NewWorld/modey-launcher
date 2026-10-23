import { ipcMain, shell, dialog, app } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { IPC } from '../ipc-channels'
import { hasActiveMinecraft } from './launcher/process'

export interface IFilesInfo {
  defaultRoot: string
  currentPath: string
  relocated: boolean
  exists: boolean
}

export interface IInstanceInfo {
  slug: string
  path: string
  size: number
}

type OpResult = { success: boolean; error?: string }

const DEFAULT_ROOT = path.join(process.env.APPDATA ?? app.getPath('appData'), '.modey')
const STAGING = `${DEFAULT_ROOT}.ancien`

function linkType(): 'junction' | 'dir' {
  return process.platform === 'win32' ? 'junction' : 'dir'
}

/** Retourne la cible si le chemin est un lien (junction), sinon null. */
function readJunction(target: string): string | null {
  try {
    if (!fs.lstatSync(target).isSymbolicLink()) return null
    return fs.readlinkSync(target)
  } catch {
    return null
  }
}

/** Même logique d'assainissement que EML (sanitizeSlug). */
function sanitizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

/** true si `inner` se trouve dans `outer` (ou est égal à celui-ci). */
function containsPath(outer: string, inner: string): boolean {
  const rel = path.relative(path.resolve(outer), path.resolve(inner))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isEmptyDir(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length === 0
  } catch {
    return true
  }
}

async function dirSize(dir: string): Promise<number> {
  let total = 0
  const walk = async (current: string) => {
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) {
        try {
          total += (await fsp.stat(full)).size
        } catch {
          /* fichier disparu, ignoré */
        }
      }
    }
  }
  await walk(dir)
  return total
}

/** Déplace un dossier : rename rapide, fallback copie inter-volumes. */
async function moveDir(src: string, dst: string): Promise<void> {
  try {
    await fsp.rename(src, dst)
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err
    await fsp.cp(src, dst, { recursive: true })
    await fsp.rm(src, { recursive: true, force: true })
  }
}

function makeLink(linkPath: string, target: string) {
  fs.symlinkSync(target, linkPath, linkType())
}

function fail(error: string): OpResult {
  return { success: false, error }
}

/** Racine effective des fichiers du jeu (suit la junction si présente). */
function currentRoot(): string {
  return readJunction(DEFAULT_ROOT) ?? DEFAULT_ROOT
}

/**
 * Change l'emplacement des fichiers du jeu.
 * Principe : EML écrit toujours dans %APPDATA%\.modey-athena — ce chemin devient
 * une junction (lien) vers le dossier choisi, transparent pour le jeu.
 */
async function setRoot(newDir: string, moveExisting: boolean): Promise<OpResult> {
  if (hasActiveMinecraft()) {
    return fail("Le jeu est en cours d'exécution. Fermez Minecraft avant de modifier les fichiers.")
  }

  const target = path.resolve(newDir)
  const oldLink = readJunction(DEFAULT_ROOT)

  if (oldLink !== null && samePath(oldLink, target)) return fail("C'est déjà l'emplacement actuel des fichiers.")
  if (oldLink === null && samePath(DEFAULT_ROOT, target)) return fail("C'est déjà l'emplacement actuel des fichiers.")
  // Refuse un dossier parent (ex. %APPDATA% lui-même) ou un sous-dossier des fichiers du jeu :
  // la junction pointant vers un ancêtre/descendant de .modey-athena créerait une boucle.
  if (containsPath(target, DEFAULT_ROOT) || containsPath(DEFAULT_ROOT, target)) {
    return fail('Dossier invalide : il ne peut contenir ni se trouver à l’intérieur des fichiers du jeu actuels.')
  }
  if (fs.existsSync(target) && !isEmptyDir(target)) return fail('Le dossier sélectionné n’est pas vide. Choisissez un dossier vide ou annulez.')

  // 1. Libère le nom EML (.modey-athena) — les données vont dans le staging ou restent sur oldLink
  if (oldLink !== null) {
    try {
      fs.rmdirSync(DEFAULT_ROOT)
    } catch (err: any) {
      return fail(`Impossible de retirer l’ancien lien : ${err?.message ?? err}`)
    }
  } else if (fs.existsSync(DEFAULT_ROOT)) {
    try {
      if (fs.existsSync(STAGING)) await fsp.rm(STAGING, { recursive: true, force: true })
      await fsp.rename(DEFAULT_ROOT, STAGING)
    } catch (err: any) {
      return fail(`Impossible de préparer l’ancien dossier : ${err?.message ?? err}`)
    }
  }

  // 2. Nouveau lien (la cible peut encore être inexistante : junction valide)
  try {
    makeLink(DEFAULT_ROOT, target)
  } catch (err: any) {
    if (oldLink === null && fs.existsSync(STAGING)) {
      try {
        await fsp.rename(STAGING, DEFAULT_ROOT)
      } catch {
        /* best effort */
      }
    } else if (oldLink !== null) {
      try {
        makeLink(DEFAULT_ROOT, oldLink)
      } catch {
        /* best effort */
      }
    }
    return fail(`Impossible de créer le lien vers le dossier : ${err?.message ?? err}`)
  }

  // 3. Données : déplacement ou suppression (selon le choix explicite de l'utilisateur)
  const dataPath = oldLink ?? STAGING
  try {
    if (fs.existsSync(dataPath)) {
      if (moveExisting) await moveDir(dataPath, target)
      else await fsp.rm(dataPath, { recursive: true, force: true })
    }
  } catch (err: any) {
    // Rollback : retire le nouveau lien et restaure l'ancien état
    try {
      fs.rmdirSync(DEFAULT_ROOT)
    } catch {
      /* best effort */
    }
    if (oldLink !== null) {
      try {
        makeLink(DEFAULT_ROOT, oldLink)
      } catch {
        /* best effort */
      }
      if (moveExisting) {
        try {
          if (fs.existsSync(target)) await fsp.rm(target, { recursive: true, force: true })
        } catch {
          /* best effort */
        }
      }
    } else if (fs.existsSync(STAGING)) {
      try {
        await fsp.rename(STAGING, DEFAULT_ROOT)
      } catch {
        /* best effort */
      }
      try {
        if (fs.existsSync(target)) await fsp.rm(target, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
    return fail(`Échec du déplacement : ${err?.message ?? err}`)
  }

  // 4. Assure que la cible existe (affichage, ouverture)
  try {
    if (!fs.existsSync(target)) await fsp.mkdir(target, { recursive: true })
  } catch {
    /* non bloquant */
  }

  logger.info(`[Files] Fichiers du jeu → ${target} (déplacement: ${moveExisting})`)
  return { success: true }
}

/** Remet l'emplacement par défaut (%APPDATA%\.modey-athena réel). */
async function resetRoot(): Promise<OpResult> {
  if (hasActiveMinecraft()) {
    return fail("Le jeu est en cours d'exécution. Fermez Minecraft avant de modifier les fichiers.")
  }
  const oldLink = readJunction(DEFAULT_ROOT)
  if (!oldLink) return fail("L'emplacement est déjà celui par défaut.")

  try {
    fs.rmdirSync(DEFAULT_ROOT)
  } catch (err: any) {
    return fail(`Impossible de retirer le lien : ${err?.message ?? err}`)
  }
  try {
    if (fs.existsSync(oldLink)) await moveDir(oldLink, DEFAULT_ROOT)
    logger.info(`[Files] Fichiers du jeu restaurés → ${DEFAULT_ROOT}`)
    return { success: true }
  } catch (err: any) {
    try {
      makeLink(DEFAULT_ROOT, oldLink)
    } catch {
      /* best effort */
    }
    return fail(`Impossible de restaurer l’emplacement par défaut : ${err?.message ?? err}`)
  }
}

/** Chemin d'instance pour un slug, protégé contre les traversées de chemin. */
function instancePathFor(slug: string): string {
  const root = path.resolve(currentRoot())
  const clean = sanitizeSlug(slug)
  const full = path.resolve(root, clean)
  if (clean.length === 0 || !full.startsWith(root + path.sep)) {
    throw new Error('Nom de serveur invalide.')
  }
  return full
}

export function registerFilesHandlers() {
  ipcMain.handle(IPC.files.info, (): IFilesInfo => {
    const link = readJunction(DEFAULT_ROOT)
    const currentPath = link ?? DEFAULT_ROOT
    return {
      defaultRoot: DEFAULT_ROOT,
      currentPath,
      relocated: link !== null,
      exists: fs.existsSync(currentPath)
    }
  })

  ipcMain.handle(IPC.files.openRoot, async (): Promise<OpResult> => {
    const errStr = await shell.openPath(currentRoot())
    return errStr ? { success: false, error: errStr } : { success: true }
  })

  ipcMain.handle(IPC.files.pickDir, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir le dossier des fichiers du jeu',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Sélectionner'
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.files.setRoot, (_event, dir: string, moveExisting: boolean) => setRoot(dir, Boolean(moveExisting)))

  ipcMain.handle(IPC.files.resetRoot, () => resetRoot())

  ipcMain.handle(IPC.files.listInstances, async (): Promise<IInstanceInfo[]> => {
    const root = currentRoot()
    if (!fs.existsSync(root)) return []
    const entries = await fsp.readdir(root, { withFileTypes: true })
    const instances: IInstanceInfo[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(root, entry.name)
      instances.push({ slug: entry.name, path: full, size: await dirSize(full) })
    }
    instances.sort((a, b) => b.size - a.size)
    return instances
  })

  ipcMain.handle(IPC.files.deleteInstance, async (_event, slug: string): Promise<OpResult> => {
    if (hasActiveMinecraft()) {
      return fail("Le jeu est en cours d'exécution. Fermez Minecraft avant de supprimer ses fichiers.")
    }
    try {
      const full = instancePathFor(slug)
      if (!fs.existsSync(full)) return fail('Ce dossier de jeu n’existe plus.')
      await fsp.rm(full, { recursive: true, force: true })
      logger.info(`[Files] Fichiers supprimés : ${full}`)
      return { success: true }
    } catch (err: any) {
      return fail(`Impossible de supprimer : ${err?.message ?? err}`)
    }
  })

  ipcMain.handle(IPC.files.openInstance, async (_event, slug: string): Promise<OpResult> => {
    try {
      const full = instancePathFor(slug)
      const errStr = await shell.openPath(full)
      return errStr ? { success: false, error: errStr } : { success: true }
    } catch (err: any) {
      return fail(`Impossible d’ouvrir le dossier : ${err?.message ?? err}`)
    }
  })
}
