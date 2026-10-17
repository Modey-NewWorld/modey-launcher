import type { BrowserWindow } from 'electron'
import { app } from 'electron'
import logger from 'electron-log/main'
import { exec } from 'node:child_process'

// Gestion du processus Minecraft actif
let activeMinecraftPid: number | null = null
let isExitingOnDisconnect = false

export function isExitingByDisconnect() {
  return isExitingOnDisconnect
}

export function setExitingByDisconnect(value: boolean) {
  isExitingOnDisconnect = value
}

export function trackMinecraftPid(pid: number | null) {
  activeMinecraftPid = pid
}

export function hasActiveMinecraft() {
  return !!activeMinecraftPid
}

/** Arrête complètement le processus Minecraft (ferme le jeu et tous les sous-processus). */
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

/** Timer post-lancement : fermeture/minimisation du launcher selon les préférences. */
export function schedulePostLaunchAction(mainWindow: BrowserWindow, launcherAction: 'close' | 'keep' | 'hide'): ReturnType<typeof setTimeout> | null {
  if (launcherAction === 'close') return setTimeout(() => app.quit(), 5000)
  if (launcherAction === 'hide') return setTimeout(() => mainWindow.minimize(), 5000)
  return null
}
