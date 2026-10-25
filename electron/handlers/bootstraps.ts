import fs from 'node:fs'
import path from 'node:path'
import type Electron from 'electron'
import { ipcMain, app } from 'electron'
import { Bootstraps } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'
import { IPC } from '../ipc-channels'

let bootstraps: Bootstraps | null = null

function isVersionHigher(latest: string, current: string): boolean {
  const parse = (v: string) => (v || '').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [lMaj = 0, lMin = 0, lPatch = 0] = parse(latest)
  const [cMaj = 0, cMin = 0, cPatch = 0] = parse(current)
  if (lMaj > cMaj) return true
  if (lMaj < cMaj) return false
  if (lMin > cMin) return true
  if (lMin < cMin) return false
  return lPatch > cPatch
}

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

  ipcMain.handle(IPC.bootstraps.check, async () => {
    try {
      const currentVersion = app.getVersion()
      
      // Récupérer le canal configuré par l'utilisateur (stable ou beta)
      let channel = 'stable'
      try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json')
        if (fs.existsSync(settingsPath)) {
          const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
          if (s.betaChannel) channel = 'beta'
        }
      } catch (_) {}

      const url = `${ADMINTOOL_URL}/api/modey/launcher-version?channel=${encodeURIComponent(channel)}&currentVersion=${encodeURIComponent(currentVersion)}`
      const res = await fetch(url, {
        headers: { Accept: 'application/json' }
      })

      if (res.ok) {
        const data = await res.json()
        const latestVersion = (data.latestVersion || data.currentVersion || '').replace(/^v/, '')

        // On ne déclenche la mise à jour QUE si la version distante est STRICTEMENT supérieure
        if (latestVersion && isVersionHigher(latestVersion, currentVersion)) {
          return {
            updateAvailable: true,
            currentVersion,
            latestVersion,
            channel: data.channel || channel,
            mandatory: Boolean(data.mandatory),
            minRequiredVersion: data.minRequiredVersion || '',
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
          latestVersion: latestVersion || currentVersion,
          channel: data.channel || channel
        }
      }

      return { updateAvailable: false, currentVersion: app.getVersion() }
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
