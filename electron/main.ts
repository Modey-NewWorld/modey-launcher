import { app, BrowserWindow, Menu, nativeTheme, shell, ipcMain, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { registerAuthHandlers } from './handlers/auth'
import { registerLauncherHandlers } from './handlers/launcher/index'
import { registerSettingsHandlers, getSavedUiScale, getSavedBackgroundSleep } from './handlers/settings'
import { registerFilesHandlers } from './handlers/files'
import { registerOptionalModsHandlers } from './handlers/optionalMods'
import { registerServerHandlers } from './handlers/server'
import { registerNewsHandlers } from './handlers/news'
import { registerBackgroundHandlers } from './handlers/background'
import { registerMaintenanceHandlers } from './handlers/maintenance'
import { registerBootstrapHandlers } from './handlers/bootstraps'
import logger from 'electron-log/main'
import { registerProfilesHandlers } from './handlers/profiles'
import { registerSkinHandlers } from './handlers/skin'
import { Stats } from 'eml-lib'
import { ADMINTOOL_URL } from './const'
import { IPC } from './ipc-channels'
import { initPortable, isPortable } from './portable'

// Doit rester avant toute lecture de app.getPath('userData') : les handlers
// résolvent leurs chemins à la demande, mais Electron doit connaître le
// dossier de données avant la création de la session/caches.
initPortable()

const APP_TITLE = 'Modey Launcher'
// Doit rester synchronisé avec --titlebar-height dans _variables.scss / main.scss
const TITLEBAR_HEIGHT = 36
const BG_COLOR_LIGHT = '#F0F4F8'
const BG_COLOR_DARK = '#0B1017'
const getInitialBgColor = () => (nativeTheme.shouldUseDarkColors ? BG_COLOR_DARK : BG_COLOR_LIGHT)

let mainWindow: BrowserWindow | null = null

if (process.env.VITE_DEV_SERVER_URL) {
  app.setName(APP_TITLE)
}

function createWindow() {
  const isWin = process.platform === 'win32'
  const isDark = nativeTheme.shouldUseDarkColors

  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(1320, Math.floor(workArea.width * 0.94))
  const height = Math.min(820, Math.floor(workArea.height * 0.94))
  const minWidth = Math.min(1024, workArea.width)
  const minHeight = Math.min(680, workArea.height)

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    center: true,
    title: APP_TITLE,
    autoHideMenuBar: true,
    backgroundColor: getInitialBgColor(),
    show: false,
    titleBarStyle: 'hidden',
    ...(isWin
      ? {
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: isDark ? '#F1F5F9' : '#0F172A',
            height: TITLEBAR_HEIGHT
          }
        }
      : {}),
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
  ipcMain.on(IPC.window.setTitleBarTheme, (_event, dark: boolean) => {
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      try {
        mainWindow.setTitleBarOverlay({
          color: '#00000000',
          symbolColor: dark ? '#F1F5F9' : '#0F172A',
          height: TITLEBAR_HEIGHT
        })
      } catch (err) {
        console.warn('Failed to update titleBarOverlay:', err)
      }
    }
  })
  mainWindow.on('maximize', () => mainWindow?.webContents.send(IPC.window.maximized, true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send(IPC.window.maximized, false))

  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      try {
        mainWindow.setTitleBarOverlay({
          color: '#00000000',
          symbolColor: nativeTheme.shouldUseDarkColors ? '#F1F5F9' : '#0F172A',
          height: TITLEBAR_HEIGHT
        })
      } catch {}
    }
  })

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
    try {
      mainWindow?.webContents.setZoomFactor(getSavedUiScale())
    } catch {}
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
  // Ne jamais toucher au %APPDATA% de la machine hôte en mode portable.
  if (isPortable()) return
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
  if (isPortable()) {
    logger.info('[Modey Launcher] Mode portable actif — données dans le dossier ModeyData de la clé USB.')
  }
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
    registerOptionalModsHandlers()
  }

  // Télémétrie anonyme Modey (Stats)
  try {
    const stats = new Stats(ADMINTOOL_URL, app.getVersion())
    void stats.initialize().catch((err: any) => {
      logger.warn('[Stats] Initialisation de télémétrie ignorée :', err?.message || err)
    })
  } catch (statsErr: any) {
    logger.warn('[Stats] Erreur instanciation stats :', statsErr?.message || statsErr)
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

