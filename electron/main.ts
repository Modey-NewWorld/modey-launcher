import { app, BrowserWindow, Menu, nativeTheme, shell, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { registerAuthHandlers } from './handlers/auth'
import { registerLauncherHandlers } from './handlers/launcher/index'
import { registerSettingsHandlers, getSavedUiScale, getSavedBackgroundSleep } from './handlers/settings'
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
    minWidth: 1280,
    minHeight: 720,
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

  // Veille en arrière-plan : la fenêtre réduite/inactive descend à ~1 image/s
  // et fige les animations du renderer après le délai configuré.
  let sleepTimer: ReturnType<typeof setTimeout> | null = null
  let isSleeping = false

  const wakeWindow = () => {
    if (sleepTimer) {
      clearTimeout(sleepTimer)
      sleepTimer = null
    }
    if (!isSleeping || !mainWindow) return
    isSleeping = false
    mainWindow.webContents.setFrameRate(60)
    mainWindow.webContents.send(IPC.system.sleep, false)
    logger.info('[Modey Launcher] Veille arrière-plan : réveil')
  }

  const armWindowSleep = () => {
    if (sleepTimer) clearTimeout(sleepTimer)
    const delay = getSavedBackgroundSleep()
    if (delay <= 0) return
    sleepTimer = setTimeout(() => {
      sleepTimer = null
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (!mainWindow.isMinimized() && mainWindow.isFocused()) return
      isSleeping = true
      mainWindow.webContents.setFrameRate(1)
      mainWindow.webContents.send(IPC.system.sleep, true)
      logger.info(`[Modey Launcher] Veille arrière-plan activée (après ${delay}s d'inactivité)`)
    }, delay * 1000)
  }

  mainWindow.on('blur', armWindowSleep)
  mainWindow.on('minimize', armWindowSleep)
  mainWindow.on('focus', wakeWindow)
  mainWindow.on('restore', wakeWindow)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // mainWindow.removeMenu()

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Échelle UI du launcher (Paramètres → Taille du launcher), réappliquée à chaque (re)chargement
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(getSavedUiScale())
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

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

// Migration temporaire v26.1.1 : nettoyage automatique de l'ancien dossier AppData résiduel "Modey Launcher — Athéna"
// TODO: Supprimer cette fonction de nettoyage à partir de la version 26.2.0
function cleanupLegacyAthenaFolder() {
  try {
    const appData = app.getPath('appData')
    const candidates = [
      path.join(appData, 'Modey Launcher — Athéna'),
      path.join(appData, 'Modey Launcher - Athéna')
    ]

    for (const legacyPath of candidates) {
      if (fs.existsSync(legacyPath)) {
        logger.info(`[Migration v26.1.1] Ancien dossier résiduel détecté, suppression en cours : ${legacyPath}`)
        fs.rmSync(legacyPath, { recursive: true, force: true })
        logger.info(`[Migration v26.1.1] Ancien dossier résiduel supprimé avec succès.`)
      }
    }
  } catch (err) {
    logger.warn('[Migration v26.1.1] Impossible de supprimer automatiquement le dossier legacy :', err)
  }
}

app.whenReady().then(() => {
  logger.initialize()
  cleanupLegacyAthenaFolder()
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

