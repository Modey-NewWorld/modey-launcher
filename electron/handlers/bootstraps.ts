import fs from 'node:fs'
import path from 'node:path'
import child_process from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type Electron from 'electron'
import { ipcMain, app } from 'electron'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'
import { IPC } from '../ipc-channels'

let latestDownloadUrl = ''
let latestTargetVersion = ''
let downloadedInstallerPath = ''

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

async function downloadFileWithProgress(
  url: string,
  destinationPath: string,
  onProgress: (downloaded: number, total: number) => void
): Promise<void> {
  const resp = await fetch(url, { redirect: 'follow' })
  if (!resp.ok) {
    throw new Error(`Erreur HTTP lors du téléchargement : ${resp.status} ${resp.statusText}`)
  }

  const contentLengthHeader = resp.headers.get('content-length')
  const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0

  if (!resp.body) {
    throw new Error('Le corps de la réponse de téléchargement est vide.')
  }

  const fileStream = fs.createWriteStream(destinationPath)
  let downloadedBytes = 0

  // @ts-ignore
  const nodeReadable = Readable.fromWeb(resp.body)

  nodeReadable.on('data', (chunk: Buffer) => {
    downloadedBytes += chunk.length
    onProgress(downloadedBytes, totalBytes)
  })

  await pipeline(nodeReadable, fileStream)
}

export function registerBootstrapHandlers(mainWindow: Electron.BrowserWindow) {
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

        latestTargetVersion = latestVersion
        latestDownloadUrl = data.downloadUrl || `https://github.com/Modey-NewWorld/modey-launcher/releases/download/v${latestVersion}/Modey-Launcher-Setup-${latestVersion}.exe`

        if (latestVersion && isVersionHigher(latestVersion, currentVersion)) {
          return {
            updateAvailable: true,
            currentVersion,
            latestVersion,
            channel: data.channel || channel,
            mandatory: Boolean(data.mandatory),
            minRequiredVersion: data.minRequiredVersion || '',
            downloadUrl: latestDownloadUrl,
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
    try {
      if (!latestDownloadUrl) {
        throw new Error('Aucune URL de téléchargement disponible.')
      }

      const tempDir = app.getPath('temp')
      const fileName = `Modey-Launcher-Setup-${latestTargetVersion || 'update'}.exe`
      downloadedInstallerPath = path.join(tempDir, fileName)

      logger.info(`[Update] Téléchargement depuis ${latestDownloadUrl} vers ${downloadedInstallerPath}`)

      let lastPercent = -1
      await downloadFileWithProgress(latestDownloadUrl, downloadedInstallerPath, (downloaded, total) => {
        const percent = total > 0 ? Math.floor((downloaded / total) * 100) : 0
        if (percent !== lastPercent || percent === 100) {
          lastPercent = percent
          mainWindow.webContents.send(IPC.bootstraps.downloadProgress, {
            downloaded: { amount: 0, size: downloaded },
            total: { amount: 1, size: total },
            speed: 0,
            type: 'BOOTSTRAP'
          })
        }
      })

      const finalSize = fs.existsSync(downloadedInstallerPath) ? fs.statSync(downloadedInstallerPath).size : 0
      logger.info(`[Update] Téléchargement terminé avec succès (${finalSize} octets) : ${downloadedInstallerPath}`)

      mainWindow.webContents.send(IPC.bootstraps.downloadEnd, {
        downloaded: { amount: 1, size: finalSize }
      })

      return downloadedInstallerPath
    } catch (err: any) {
      logger.error('[Update] Erreur lors du téléchargement de la mise à jour :', err)
      mainWindow.webContents.send(IPC.bootstraps.error, {
        message: err?.message || 'Erreur réseau lors du téléchargement'
      })
      throw err
    }
  })

  ipcMain.handle(IPC.bootstraps.install, async () => {
    try {
      if (!downloadedInstallerPath || !fs.existsSync(downloadedInstallerPath)) {
        throw new Error("Le fichier d'installation est introuvable sur le disque.")
      }

      logger.info(`[Update] Lancement du nouvel installateur : ${downloadedInstallerPath}`)
      const child = child_process.spawn(downloadedInstallerPath, [], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()

      setTimeout(() => {
        app.quit()
      }, 600)

      return true
    } catch (err: any) {
      logger.error('[Update] Impossible de lancer le nouvel installateur :', err)
      throw err
    }
  })
}
