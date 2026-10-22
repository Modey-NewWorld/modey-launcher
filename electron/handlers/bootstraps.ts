import type Electron from 'electron'
import { ipcMain, app } from 'electron'
import { Bootstraps } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'
import { IPC } from '../ipc-channels'

let bootstraps: Bootstraps | null = null

export function registerBootstrapHandlers(mainWindow: Electron.BrowserWindow) {
  if (!bootstraps) {
    bootstraps = new Bootstraps(ADMINTOOL_URL)

    bootstraps.on('download_progress', (data) => {
      mainWindow.webContents.send(IPC.bootstraps.downloadProgress, data)
    })

    bootstraps.on('download_end', (data) => {
      mainWindow.webContents.send(IPC.bootstraps.downloadEnd, data)
    })

    bootstraps.on('bootstraps_error', (data) => {
      mainWindow.webContents.send(IPC.bootstraps.error, data)
    })
  }

  // Vérification de mise à jour intelligente via l'API Modey / GitHub
  ipcMain.handle(IPC.bootstraps.check, async () => {
    try {
      const currentVersion = app.getVersion()
      const res = await fetch(`${ADMINTOOL_URL}/api/modey/launcher-version`, {
        headers: { 'Accept': 'application/json' }
      })

      if (res.ok) {
        const data = await res.json()
        const latestVersion = (data.latestVersion || data.currentVersion || '').replace(/^v/, '')

        // Si une version plus récente est disponible
        if (latestVersion && latestVersion !== currentVersion) {
          return {
            updateAvailable: true,
            currentVersion,
            latestVersion,
            mandatory: Boolean(data.mandatory),
            downloadUrl: data.downloadUrl,
            updateInfo: {
              releaseName: `Modey Launcher v${latestVersion}`,
              releaseNotes: data.releaseNotes,
              releaseDate: new Date()
            }
          }
        }

        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion
        }
      }

      // Fallback sur le checkForUpdate standard d'eml-lib
      return await bootstraps?.checkForUpdate()
    } catch (err) {
      logger.error('Error checking for bootstraps update', err)
      return { updateAvailable: false, currentVersion: app.getVersion() }
    }
  })

  ipcMain.handle(IPC.bootstraps.download, async () => {
    return await bootstraps?.download()
  })

  ipcMain.handle(IPC.bootstraps.install, async () => {
    return await bootstraps?.runUpdate()
  })
}
