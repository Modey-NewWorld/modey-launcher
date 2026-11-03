import { ipcMain, app, screen, BrowserWindow } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { IPC } from '../ipc-channels'
import { currentRoot } from './files'
import { getRuntimeConfig, getDynamicMemoryLimits } from '../runtimeConfig'

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

export interface ISystemInfo {
  totalMem: number // in GB
  resolution: {
    width: number
    height: number
  }
  version: string
}

export interface IServerGameSettings {
  memory?: {
    min: number
    max: number
  }
  optionalMods?: Record<string, boolean>
}

export interface IGameSettings {
  java: string
  memory: {
    min: number
    max: number
  }
  serverSettings?: Record<string, IServerGameSettings>
  resolution: {
    width: number
    height: number
    fullscreen: boolean
  }
  launcherAction: 'close' | 'keep' | 'hide'
  /** Délai de veille en arrière-plan en secondes (0 = désactivée). */
  backgroundSleep: number
  launchAtStartup: boolean
  autoUpdateCheck: boolean
  betaChannel?: boolean
  uiScale: number
}

const defaultMemoryLimits = getDynamicMemoryLimits()

export const DEFAULT_SETTINGS: IGameSettings = {
  java: 'bundled',
  memory: {
    min: defaultMemoryLimits.minGb,
    max: defaultMemoryLimits.maxGb
  },
  serverSettings: {},
  resolution: {
    width: 1280,
    height: 720,
    fullscreen: false
  },
  launcherAction: 'keep',
  backgroundSleep: 0,
  launchAtStartup: false,
  autoUpdateCheck: true,
  betaChannel: false,
  uiScale: 1
}

export const UI_SCALE_MIN = 0.75
export const UI_SCALE_MAX = 1.5

function clampScale(value: number): number {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value))
}

export function getSavedUiScale(): number {
  try {
    if (!fs.existsSync(settingsPath)) return DEFAULT_SETTINGS.uiScale
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const scale = Number(data.uiScale)
    return Number.isFinite(scale) ? clampScale(scale) : DEFAULT_SETTINGS.uiScale
  } catch (err) {
    logger.error('Error reading uiScale:', err)
    return DEFAULT_SETTINGS.uiScale
  }
}

function applyUiScale(scale: number) {
  const factor = clampScale(scale)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.setZoomFactor(factor)
  }
}

export function getSavedBackgroundSleep(): number {
  try {
    if (!fs.existsSync(settingsPath)) return DEFAULT_SETTINGS.backgroundSleep
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    const seconds = Number(data.backgroundSleep)
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  } catch (err) {
    logger.error('Error reading backgroundSleep:', err)
    return 0
  }
}

/**
 * Lit le fichier server-settings.json dans le dossier d'instance %APPDATA%\.modey\<slug>
 * s'il existe et a été modifié manuellement par l'utilisateur.
 */
export function readLocalServerConfig(slug: string): IServerGameSettings | null {
  try {
    const root = currentRoot()
    const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
    const configPath = path.join(root, cleanSlug, 'server-settings.json')
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return data
    }
  } catch (err) {
    logger.warn(`Impossible de lire server-settings.json pour ${slug}:`, err)
  }
  return null
}

/**
 * Écrit / met à jour le fichier server-settings.json dans le dossier d'instance.
 */
export function writeLocalServerConfig(slug: string, cfg: IServerGameSettings): void {
  try {
    const root = currentRoot()
    const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
    const dirPath = path.join(root, cleanSlug)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
    const configPath = path.join(dirPath, 'server-settings.json')
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
    logger.info(`[Settings] Configuration synchronisée dans ${configPath}`)
  } catch (err) {
    logger.warn(`Impossible d'écrire server-settings.json pour ${slug}:`, err)
  }
}

export function readAllSettingsWithSync(): IGameSettings {
  let settings: IGameSettings = { ...DEFAULT_SETTINGS }
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8')
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    }
  } catch (err) {
    logger.error('Error reading settings:', err)
  }

  if (!settings.serverSettings) {
    settings.serverSettings = {}
  }

  // Synchronisation bidirectionnelle : lire tous les dossiers de serveurs existants
  try {
    const root = currentRoot()
    if (fs.existsSync(root)) {
      const entries = fs.readdirSync(root, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const srvSlug = entry.name
          const localCfg = readLocalServerConfig(srvSlug)
          if (localCfg) {
            // Fusionner avec la priorité sur le fichier local du serveur s'il existe
            settings.serverSettings[srvSlug] = {
              ...(settings.serverSettings[srvSlug] || {}),
              ...localCfg
            }
          }
        }
      }
    }
  } catch (scanErr) {
    logger.warn('Scan des dossiers de serveurs pour configuration:', scanErr)
  }

  return settings
}

export function registerSettingsHandlers() {
  ipcMain.handle(IPC.settings.get, async () => {
    return readAllSettingsWithSync()
  })

  ipcMain.handle(IPC.settings.set, async (_event, newSettings: IGameSettings) => {
    try {
      const toWrite: IGameSettings = {
        ...newSettings,
        backgroundSleep: Math.max(0, Number(newSettings.backgroundSleep) || 0),
        uiScale: clampScale(Number(newSettings.uiScale) || DEFAULT_SETTINGS.uiScale)
      }
      fs.writeFileSync(settingsPath, JSON.stringify(toWrite, null, 2))
      applyUiScale(toWrite.uiScale)

      // Synchroniser les fichiers server-settings.json dans chaque dossier d'instance
      if (toWrite.serverSettings) {
        for (const [slug, cfg] of Object.entries(toWrite.serverSettings)) {
          if (cfg) {
            writeLocalServerConfig(slug, cfg)
          }
        }
      }

      return true
    } catch (err) {
      logger.error('Error writing settings:', err)
      return false
    }
  })

  ipcMain.handle(IPC.system.info, async () => {
    const totalMemBytes = os.totalmem()
    const totalMemGB = Math.round(totalMemBytes / 1024 / 1024 / 1024)

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    return {
      totalMem: totalMemGB,
      resolution: { width, height },
      version: app.getVersion()
    }
  })

  ipcMain.handle(IPC.system.getRuntimeConfig, async () => {
    return getRuntimeConfig()
  })
}
