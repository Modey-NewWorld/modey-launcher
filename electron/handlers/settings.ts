import { ipcMain, app, screen, BrowserWindow } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { IPC } from '../ipc-channels'

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

export interface ISystemInfo {
  totalMem: number // in GB
  resolution: {
    width: number
    height: number
  }
  version: string
}

export interface IGameSettings {
  java: string
  memory: {
    min: number
    max: number
  }
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
  uiScale: number
}

export const DEFAULT_SETTINGS: IGameSettings = {
  java: 'bundled',
  memory: {
    min: 1,
    max: 4
  },
  resolution: {
    width: 1280,
    height: 720,
    fullscreen: false
  },
  launcherAction: 'keep',
  backgroundSleep: 0,
  launchAtStartup: false,
  autoUpdateCheck: true,
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

export function registerSettingsHandlers() {
  ipcMain.handle(IPC.settings.get, async () => {
    try {
      if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
        return DEFAULT_SETTINGS
      }
      const data = fs.readFileSync(settingsPath, 'utf-8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    } catch (err) {
      logger.error('Error reading settings:', err)
      return DEFAULT_SETTINGS
    }
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
}
