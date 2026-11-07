import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Mode portable : toutes les données du launcher et du jeu restent à côté de
 * l'exécutable (clé USB, disque externe, dossier décompressé) au lieu d'être
 * écrites dans %APPDATA%.
 *
 * Détection, par ordre de priorité :
 *  1. `PORTABLE_EXECUTABLE_DIR` (fourni par la cible `portable` d'electron-builder)
 *  2. `MODEY_PORTABLE=1` (utile pour les tests)
 *  3. présence de `portable.flag` ou du dossier `ModeyData` à côté de l'exe
 */
export interface PortableState {
  enabled: boolean
  rootDir: string | null
  dataDir: string | null
  gameRoot: string | null
}

const state: PortableState = {
  enabled: false,
  rootDir: null,
  dataDir: null,
  gameRoot: null
}

function findPortableRoot(): string | null {
  const fromEnv = process.env.PORTABLE_EXECUTABLE_DIR
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv.trim())

  if (process.env.MODEY_PORTABLE === '1') return path.dirname(process.execPath)

  if (!app.isPackaged) return null

  const exeDir = path.dirname(process.execPath)
  for (const marker of ['portable.flag', 'ModeyData']) {
    if (fs.existsSync(path.join(exeDir, marker))) return exeDir
  }

  return null
}

/**
 * Active le mode portable si un marqueur est présent. À appeler avant
 * `app.whenReady()` et avant toute lecture de `app.getPath('userData')`.
 */
export function initPortable(): PortableState {
  if (state.enabled) return state

  const rootDir = findPortableRoot()
  if (!rootDir) return state

  const dataDir = path.join(rootDir, 'ModeyData')
  const launcherDir = path.join(dataDir, 'launcher')
  const logsDir = path.join(launcherDir, 'logs')

  try {
    fs.mkdirSync(logsDir, { recursive: true })
    fs.mkdirSync(path.join(dataDir, '.modey'), { recursive: true })
    fs.accessSync(dataDir, fs.constants.W_OK)
  } catch (err) {
    // Support en lecture seule (cédérom, clé protégée) : on ne casse pas le
    // lancement, on retombe simplement sur le comportement installé classique.
    console.warn('[Modey Launcher] Mode portable indisponible (support en lecture seule ?) :', err)
    return state
  }

  app.setPath('userData', launcherDir)
  app.setPath('sessionData', launcherDir)
  try {
    app.setAppLogsPath(logsDir)
  } catch {
    /* non bloquant selon la version d'Electron */
  }

  state.enabled = true
  state.rootDir = rootDir
  state.dataDir = dataDir
  state.gameRoot = path.join(dataDir, '.modey')

  return state
}

export function isPortable(): boolean {
  return state.enabled
}

export function getPortableDataDir(): string | null {
  return state.dataDir
}

/** Racine EML des fichiers de jeu en mode portable (`ModeyData/.modey`). */
export function getPortableGameRoot(): string | null {
  return state.gameRoot
}

/**
 * EML calcule sa racine à partir de `process.env.APPDATA` dans le constructeur
 * du Launcher. On ne modifie la variable que le temps de l'instanciation pour
 * éviter d'impacter le reste du processus.
 */
export function withPortableAppData<T>(fn: () => T): T {
  if (!state.enabled || !state.dataDir) return fn()

  const previousAppData = process.env.APPDATA
  process.env.APPDATA = state.dataDir
  try {
    return fn()
  } finally {
    if (previousAppData === undefined) delete process.env.APPDATA
    else process.env.APPDATA = previousAppData
  }
}
