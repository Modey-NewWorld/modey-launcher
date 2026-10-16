import type Electron from 'electron'
import { ipcMain } from 'electron'
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

  ipcMain.handle(IPC.bootstraps.check, async () => {
    try {
      return await bootstraps?.checkForUpdate()
    } catch (err) {
      logger.error('Error checking for bootstraps update', err)
      return { updateAvailable: false }
    }
  })

  ipcMain.handle(IPC.bootstraps.download, async () => {
    return await bootstraps?.download()
  })

  ipcMain.handle(IPC.bootstraps.install, async () => {
    return await bootstraps?.runUpdate()
  })
}


