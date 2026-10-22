import type { IGameSettings, ISystemInfo } from '../electron/handlers/settings'
import type { IFilesInfo, IInstanceInfo } from '../electron/handlers/files'
import type { IAuthResponse } from '../electron/handlers/auth'
import type { Account, BootstrapsEvents, DownloaderEvents, IAvatar, IBackground, IBootstraps, ICape, IMaintenance, INews, IServerStatus, INewsCategory, LauncherEvents, ISkin } from 'eml-lib'

declare global {
  interface Window {
    api: {
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
        isMaximized: () => Promise<boolean>
        onMaximized: (callback: (maximized: boolean) => void) => void
      }
      auth: {
        loginCustom: (identifier: string, password?: string) => Promise<IAuthResponse>
        registerCustom: (payload: { email: string; username: string; password: string }) => Promise<IAuthResponse>
        refresh: () => Promise<IAuthResponse>
        logout: () => Promise<{ success: boolean }>
      }
      skin: {
        reload: (account?: Account) => Promise<void | null>
        getSkin: (account?: Account) => Promise<ISkin[] | null>
        getCape: (account?: Account) => Promise<ICape[] | null>
        getAvatar: (account?: Account) => Promise<IAvatar | null>
        updateSkin: (source: string | ArrayBuffer, model?: 'classic' | 'slim') => Promise<ISkin[] | null>
        switchCape: (id: string) => Promise<ICape[] | null>
        deleteSkin: (id: string) => Promise<ISkin[] | null>
        renameSkin: (id: string, name: string) => Promise<ISkin[] | null>
        hideCape: () => Promise<ICape[] | null>
      }
      profiles: {
        get: () => Promise<any[]>
      }
      server: {
        getStatus: (ip: string, port?: number) => Promise<IServerStatus | null>
      }
      news: {
        getNews: () => Promise<INews[]>
      }
      background: {
        get: () => Promise<IBackground | null>
      }
      maintenance: {
        get: () => Promise<IMaintenance | null>
      }
      bootstraps: {
        check: () => Promise<IBootstraps>
        download: () => Promise<string>
        install: () => Promise<void>
        downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => void
        downloadError: (callback: (value: DownloaderEvents['download_error'][0]) => void) => void
        downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => void
        error: (callback: (value: BootstrapsEvents['bootstraps_error'][0]) => void) => void
      }
      game: {
        launch: (payload: { account: Account; settings: IGameSettings; profileSlug: string; serverIp?: string; serverPort?: number; minecraftVersion?: string; loaderType?: 'neoforge' | 'forge' | 'fabric' | 'quilt' | 'vanilla'; loaderVersion?: string }) => Promise<void>

        launchComputeDownload: (callback: () => void) => void

        launchDownload: (callback: (value: LauncherEvents['launch_download'][0]) => void) => void
        downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => void
        downloadError: (callback: (value: DownloaderEvents['download_error'][0]) => void) => void
        downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => void

        launchInstallLoader: (callback: (value: LauncherEvents['launch_install_loader'][0]) => void) => void

        launchExtractNatives: (callback: () => void) => void
        launchCopyAssets: (callback: () => void) => void
        launchPatchLoader: (callback: () => void) => void
        launchCheckJava: (callback: () => void) => void

        launchClean: (callback: () => void) => void
        launchLaunch: (callback: (value: LauncherEvents['launch_launch'][0]) => void) => void
        launched: (callback: () => void) => void

        launchClose: (callback: (code: number | null) => void) => void
      }
      settings: {
        get: () => Promise<IGameSettings>
        set: (s: IGameSettings) => Promise<boolean>
      }
      system: {
        getInfo: () => Promise<ISystemInfo>
        onSleep: (callback: (asleep: boolean) => void) => void
      }
      files: {
        info: () => Promise<IFilesInfo>
        openRoot: () => Promise<{ success: boolean; error?: string }>
        pickDir: () => Promise<string | null>
        setRoot: (dir: string, moveExisting: boolean) => Promise<{ success: boolean; error?: string }>
        resetRoot: () => Promise<{ success: boolean; error?: string }>
        listInstances: () => Promise<IInstanceInfo[]>
        deleteInstance: (slug: string) => Promise<{ success: boolean; error?: string }>
        openInstance: (slug: string) => Promise<{ success: boolean; error?: string }>
      }
    }
  }
}

// Type importé uniquement pour la déclaration globale (categories : réservé futur site web).
export type INewsCategoryRef = INewsCategory

export const auth = {
  loginCustom: async (identifier: string, password?: string) => await window.api.auth.loginCustom(identifier, password),
  registerCustom: async (payload: { email: string; username: string; password: string }) => await window.api.auth.registerCustom(payload),
  logout: async () => await window.api.auth.logout(),
  refresh: async () => await window.api.auth.refresh()
}

export const skin = {
  reload: async (account?: Account) => await window.api.skin.reload(account),
  getSkin: async (account?: Account) => await window.api.skin.getSkin(account),
  getCape: async (account?: Account) => await window.api.skin.getCape(account),
  getAvatar: async (account?: Account) => await window.api.skin.getAvatar(account),
  updateSkin: async (source: string | ArrayBuffer, model: 'classic' | 'slim') => await window.api.skin.updateSkin(source, model),
  switchCape: async (id: string) => await window.api.skin.switchCape(id),
  deleteSkin: async (id: string) => await window.api.skin.deleteSkin(id),
  renameSkin: async (id: string, name: string) => await window.api.skin.renameSkin(id, name),
  hideCape: async () => await window.api.skin.hideCape()
}

export const profiles = {
  get: async () => await window.api.profiles.get()
}

export const server = {
  getStatus: async (ip: string, port?: number) => await window.api.server.getStatus(ip, port)
}

export const news = {
  getNews: async () => await window.api.news.getNews()
}

export const background = {
  get: async () => await window.api.background.get()
}

export const maintenance = {
  get: async () => await window.api.maintenance.get()
}

export const bootstraps = {
  check: async () => await window.api.bootstraps.check(),
  download: async () => await window.api.bootstraps.download(),
  install: async () => await window.api.bootstraps.install(),
  downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => window.api.bootstraps.downloadProgress(callback),
  downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => window.api.bootstraps.downloadEnd(callback),
  error: (callback: (value: BootstrapsEvents['bootstraps_error'][0]) => void) => window.api.bootstraps.error(callback)
}

export const game = {
  launch: async (payload: { account: Account; settings: IGameSettings; profileSlug: string; serverIp?: string; serverPort?: number; minecraftVersion?: string; loaderType?: 'neoforge' | 'forge' | 'fabric' | 'quilt' | 'vanilla'; loaderVersion?: string }) =>
    await window.api.game.launch(payload),
  launchComputeDownload: (callback: () => void) => window.api.game.launchComputeDownload(callback),
  launchDownload: (callback: (value: LauncherEvents['launch_download'][0]) => void) => window.api.game.launchDownload(callback),
  downloadProgress: (callback: (value: DownloaderEvents['download_progress'][0]) => void) => window.api.game.downloadProgress(callback),
  downloadError: (callback: (value: DownloaderEvents['download_error'][0]) => void) => window.api.game.downloadError(callback),
  downloadEnd: (callback: (value: DownloaderEvents['download_end'][0]) => void) => window.api.game.downloadEnd(callback),
  launchInstallLoader: (callback: (value: LauncherEvents['launch_install_loader'][0]) => void) => window.api.game.launchInstallLoader(callback),
  launchExtractNatives: (callback: () => void) => window.api.game.launchExtractNatives(callback),
  launchCopyAssets: (callback: () => void) => window.api.game.launchCopyAssets(callback),
  launchPatchLoader: (callback: () => void) => window.api.game.launchPatchLoader(callback),
  launchCheckJava: (callback: () => void) => window.api.game.launchCheckJava(callback),
  launchClean: (callback: () => void) => window.api.game.launchClean(callback),
  launchLaunch: (callback: (value: LauncherEvents['launch_launch'][0]) => void) => window.api.game.launchLaunch(callback),
  launched: (callback: () => void) => window.api.game.launched(callback),
  launchClose: (callback: (code: number | null) => void) => window.api.game.launchClose(callback)
}

export const settings = {
  get: () => window.api.settings.get(),
  set: (s: IGameSettings) => window.api.settings.set(s)
}

export const system = {
  getInfo: () => window.api.system.getInfo(),
  onSleep: (callback: (asleep: boolean) => void) => window.api.system.onSleep(callback)
}

export const files = {
  info: async () => await window.api.files.info(),
  openRoot: async () => await window.api.files.openRoot(),
  pickDir: async () => await window.api.files.pickDir(),
  setRoot: async (dir: string, moveExisting: boolean) => await window.api.files.setRoot(dir, moveExisting),
  resetRoot: async () => await window.api.files.resetRoot(),
  listInstances: async () => await window.api.files.listInstances(),
  deleteInstance: async (slug: string) => await window.api.files.deleteInstance(slug),
  openInstance: async (slug: string) => await window.api.files.openInstance(slug)
}
