import { app, BrowserWindow, Menu, nativeTheme, shell, ipcMain } from 'electron'
import path from 'node:path'
import { registerAuthHandlers } from './handlers/auth'
import { registerLauncherHandlers } from './handlers/launcher/index'
import { registerSettingsHandlers, getSavedUiScale } from './handlers/settings'
import { registerFilesHandlers } from './handlers/files'
import { registerServerHandlers } from './handlers/server'
import { registerNewsHandlers } from './handlers/news'
import { registerBackgroundHandlers } from './handlers/background'
import { registerMaintenanceHandlers } from './handlers/maintenance'
import { registerBootstrapHandlers } from './handlers/bootstraps'
import logger from 'electron-log/main'
import { registerProfilesHandlers } from './handlers/profiles'
import { registerSkinHandlers } from './handlers/skin'
import { IPC } from './ipc-channels'

const APP_TITLE = 'Modey Launcher'
const BG_COLOR = '#F0F4F8'

let mainWindow: BrowserWindow | null = null

if (process.env.VITE_DEV_SERVER_URL) {
  app.setName(APP_TITLE)
}

function createWindow() {
  nativeTheme.themeSource = 'light'

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1000,
    minHeight: 700,
    title: APP_TITLE,
    autoHideMenuBar: true,
    backgroundColor: BG_COLOR,
    show: false,
    frame: false,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    }
  })

  ipcMain.on(IPC.window.minimize, () => mainWindow?.minimize())
  ipcMain.on(IPC.window.maximize, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on(IPC.window.close, () => mainWindow?.close())
  ipcMain.handle(IPC.window.isMaximized, () => mainWindow?.isMaximized() ?? false)
  mainWindow.on('maximize', () => mainWindow?.webContents.send(IPC.window.maximized, true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send(IPC.window.maximized, false))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // mainWindow.removeMenu()

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Échelle UI du launcher (Paramètres → Taille du launcher), réappliquée à chaque (re)chargement
  mainWindow.webContents.on('did-finish-load', () => mainWindow?.webContents.setZoomFactor(getSavedUiScale()))

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function configureAppMenu() {
  app.setAboutPanelOptions({
    applicationName: APP_TITLE,
    applicationVersion: app.getVersion(),
    version: 'Build 2026.1',
    copyright: 'Copyright Â© 2026 EML',
    credits: 'Developed with EML Lib & Electron',
    iconPath: path.join(__dirname, '../build/icon.png')
  })

  const template: any[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ]
      : []),

    {
      label: 'File',
      submenu: [{ role: 'close' }]
    },

    {
      label: 'Edit',
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]
    },

    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  logger.initialize()
  configureAppMenu()
  createWindow()

  if (mainWindow) {
    registerAuthHandlers(mainWindow)
    registerProfilesHandlers()
    registerServerHandlers()
    registerSkinHandlers()
    registerNewsHandlers()
    registerBackgroundHandlers()
    registerMaintenanceHandlers()
    registerBootstrapHandlers(mainWindow)
    registerLauncherHandlers(mainWindow)
    registerSettingsHandlers()
    registerFilesHandlers()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

