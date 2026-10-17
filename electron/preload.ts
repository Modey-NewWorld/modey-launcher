import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc-channels'
import type { IGameSettings, ISystemInfo } from './handlers/settings'
import type { IFilesInfo, IInstanceInfo } from './handlers/files'
import type { IAuthResponse } from './handlers/auth'
import type { Account, BootstrapsEvents, DownloaderEvents, IAvatar, IBackground, IBootstraps, ICape, IMaintenance, INews, IServerStatus, ISkin, LauncherEvents } from 'eml-lib'

console.log('Preload script loaded')

contextBridge.exposeInMainWorld('api', {
  window: {
    minimize: () => ipcRenderer.send(IPC.window.minimize),
    maximize: () => ipcRenderer.send(IPC.window.maximize),
    close: () => ipcRenderer.send(IPC.window.close),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.window.isMaximized),
    onMaximized: (callback: (maximized: boolean) => void) =>
      ipcRenderer.on(IPC.window.maximized, (_event, maximized) => callback(maximized))
  },
  auth: {
    loginCustom: (identifier: string, password?: string): Promise<IAuthResponse> =>
      ipcRenderer.invoke(IPC.auth.loginCustom, identifier, password),
    registerCustom: (payload: { email: string; username: string; password: string }): Promise<IAuthResponse> =>
      ipcRenderer.invoke(IPC.auth.registerCustom, payload),
    refresh: (): Promise<IAuthResponse> => ipcRenderer.invoke(IPC.auth.refresh),
    logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.auth.logout)
  },
  profiles: {
    get: (): Promise<any[]> => ipcRenderer.invoke(IPC.profiles.get)
  },
  game: {
    launch: (payload: { account: Account; settings: IGameSettings; profileSlug: string; serverIp?: string; serverPort?: number }) => {
      ipcRenderer.invoke(IPC.game.launch, payload)
    },

    launchComputeDownload: (callback: () => void) => ipcRenderer.on(IPC.game.launchComputeDownload, (_event) => callback()),

    launchDownload: (callback: (value: LauncherEvents['launch_download'][0]) => void) =>
      ipcRenderer.on(IPC.game.launchDownload, (_event, value) => callback(value)),
    downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) =>
      ipcRenderer.on(IPC.game.downloadProgress, (_event, value) => callback(value)),
    downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) =>
      ipcRenderer.on(IPC.game.downloadEnd, (_event, value) => callback(value)),

    launchInstallLoader: (callback: (value: LauncherEvents['launch_install_loader'][0]) => void) =>
      ipcRenderer.on(IPC.game.launchInstallLoader, (_event, value) => callback(value)),

    launchExtractNatives: (callback: () => void) => ipcRenderer.on(IPC.game.launchExtractNatives, (_event) => callback()),
    launchCopyAssets: (callback: () => void) => ipcRenderer.on(IPC.game.launchCopyAssets, (_event) => callback()),
    launchPatchLoader: (callback: () => void) => ipcRenderer.on(IPC.game.launchPatchLoader, (_event) => callback()),
    launchCheckJava: (callback: () => void) => ipcRenderer.on(IPC.game.launchCheckJava, (_event) => callback()),

    launchClean: (callback: () => void) => ipcRenderer.on(IPC.game.launchClean, (_event) => callback()),
    launchLaunch: (callback: (value: LauncherEvents['launch_launch'][0]) => void) =>
      ipcRenderer.on(IPC.game.launchLaunch, (_event, value) => callback(value)),
    launched: (callback: () => void) => ipcRenderer.on(IPC.game.launched, (_event) => callback()),

    launchClose: (callback: (value: number | null) => void) => ipcRenderer.on(IPC.game.launchClose, (_event, value) => callback(value))
  },
  skin: {
    reload: (account: Account): Promise<void | null> => ipcRenderer.invoke(IPC.skin.reload, account),
    getSkin: (account?: Account): Promise<ISkin[] | null> => ipcRenderer.invoke(IPC.skin.getSkin, account),
    getCape: (account?: Account): Promise<ICape[] | null> => ipcRenderer.invoke(IPC.skin.getCape, account),
    getAvatar: (account?: Account): Promise<IAvatar | null> => ipcRenderer.invoke(IPC.skin.getAvatar, account),
    updateSkin: (source: string | Blob, model?: 'classic' | 'slim'): Promise<ISkin[] | null> => ipcRenderer.invoke(IPC.skin.updateSkin, source, model),
    switchCape: (id: string): Promise<ICape[] | null> => ipcRenderer.invoke(IPC.skin.switchCape, id),
    deleteSkin: (id: string): Promise<ISkin[] | null> => ipcRenderer.invoke(IPC.skin.deleteSkin, id),
    renameSkin: (id: string, name: string): Promise<ISkin[] | null> => ipcRenderer.invoke(IPC.skin.renameSkin, id, name),
    hideCape: (): Promise<ICape[] | null> => ipcRenderer.invoke(IPC.skin.hideCape)
  },
  server: {
    getStatus: (ip: string, port?: number): Promise<IServerStatus> => ipcRenderer.invoke(IPC.server.status, ip, port)
  },
  news: {
    getNews: (): Promise<INews[]> => ipcRenderer.invoke(IPC.news.getNews)
  },
  background: {
    get: (): Promise<IBackground | null> => ipcRenderer.invoke(IPC.background.get)
  },
  maintenance: {
    get: (): Promise<IMaintenance | null> => ipcRenderer.invoke(IPC.maintenance.get)
  },
  bootstraps: {
    check: (): Promise<IBootstraps> => ipcRenderer.invoke(IPC.bootstraps.check),
    download: (): Promise<string> => ipcRenderer.invoke(IPC.bootstraps.download),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.bootstraps.install),
    downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) =>
      ipcRenderer.on(IPC.bootstraps.downloadProgress, (_event, value) => callback(value)),
    downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) =>
      ipcRenderer.on(IPC.bootstraps.downloadEnd, (_event, value) => callback(value)),
    error: (callback: (value: BootstrapsEvents['bootstraps_error'][0]) => void) =>
      ipcRenderer.on(IPC.bootstraps.error, (_event, value) => callback(value))
  },
  settings: {
    get: (): Promise<IGameSettings> => ipcRenderer.invoke(IPC.settings.get),
    set: (s: IGameSettings): Promise<boolean> => ipcRenderer.invoke(IPC.settings.set, s)
  },
  system: {
    getInfo: (): Promise<ISystemInfo> => ipcRenderer.invoke(IPC.system.info),
    onSleep: (callback: (asleep: boolean) => void) =>
      ipcRenderer.on(IPC.system.sleep, (_event, asleep: boolean) => callback(asleep))
  },
  files: {
    info: (): Promise<IFilesInfo> => ipcRenderer.invoke(IPC.files.info),
    openRoot: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC.files.openRoot),
    pickDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.files.pickDir),
    setRoot: (dir: string, moveExisting: boolean): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.files.setRoot, dir, moveExisting),
    resetRoot: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke(IPC.files.resetRoot),
    listInstances: (): Promise<IInstanceInfo[]> => ipcRenderer.invoke(IPC.files.listInstances),
    deleteInstance: (slug: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.files.deleteInstance, slug),
    openInstance: (slug: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.files.openInstance, slug)
  }
})
