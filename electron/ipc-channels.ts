/**
 * Source UNIQUE des noms de canaux IPC (main ↔ preload/renderer).
 * Aucune chaîne de canal ne doit être écrite en dur ailleurs.
 */
export const IPC = {
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    isMaximized: 'window:isMaximized',
    maximized: 'window:maximized'
  },
  auth: {
    /** @internal — login Microsoft, conservation EML, pas d'UI Modey */
    login: 'auth:login',
    loginCustom: 'auth:login-custom',
    registerCustom: 'auth:register-custom',
    /** @internal — multi-comptes EML, pas d'UI Modey */
    listAccounts: 'auth:list-accounts',
    /** @internal */
    removeAccount: 'auth:remove-account',
    refresh: 'auth:refresh',
    logout: 'auth:logout'
  },
  profiles: {
    get: 'profiles:get'
  },
  server: {
    status: 'server:status'
  },
  news: {
    getNews: 'news:get_news',
    getCategories: 'news:get_categories'
  },
  background: {
    get: 'background:get'
  },
  maintenance: {
    get: 'maintenance:get'
  },
  bootstraps: {
    check: 'bootstraps:check',
    download: 'bootstraps:download',
    install: 'bootstraps:install',
    downloadProgress: 'bootstraps:download_progress',
    downloadEnd: 'bootstraps:download_end',
    error: 'bootstraps:error'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    pickJava: 'settings:pick_java'
  },
  system: {
    info: 'system:info',
    getLoginItem: 'system:get_login_item',
    setLoginItem: 'system:set_login_item'
  },
  files: {
    info: 'files:info',
    openRoot: 'files:open_root',
    pickDir: 'files:pick_dir',
    setRoot: 'files:set_root',
    resetRoot: 'files:reset_root',
    listInstances: 'files:list_instances',
    deleteInstance: 'files:delete_instance',
    openInstance: 'files:open_instance'
  },
  skin: {
    reload: 'skin:reload',
    getSkin: 'skin:get_skin',
    getCape: 'skin:get_cape',
    getAvatar: 'skin:get_avatar',
    updateSkin: 'skin:update_skin',
    switchCape: 'skin:switch_cape',
    deleteSkin: 'skin:delete_skin',
    renameSkin: 'skin:rename_skin',
    hideCape: 'skin:hide_cape'
  },
  game: {
    launch: 'game:launch',
    kill: 'game:kill',
    launchComputeDownload: 'game:launch_compute_download',
    launchDownload: 'game:launch_download',
    downloadProgress: 'game:download_progress',
    downloadError: 'game:download_error',
    downloadEnd: 'game:download_end',
    launchInstallLoader: 'game:launch_install_loader',
    launchExtractNatives: 'game:launch_extract_natives',
    extractProgress: 'game:extract_progress',
    extractEnd: 'game:extract_end',
    launchCopyAssets: 'game:launch_copy_assets',
    copyProgress: 'game:copy_progress',
    copyEnd: 'game:copy_end',
    launchPatchLoader: 'game:launch_patch_loader',
    patchProgress: 'game:patch_progress',
    patchError: 'game:patch_error',
    patchEnd: 'game:patch_end',
    launchCheckJava: 'game:launch_check_java',
    javaInfo: 'game:java_info',
    launchClean: 'game:launch_clean',
    cleanProgress: 'game:clean_progress',
    cleanEnd: 'game:clean_end',
    launchLaunch: 'game:launch_launch',
    launched: 'game:launched',
    launchData: 'game:launch_data',
    launchClose: 'game:launch_close',
    /** @internal — debug moteur EML, jamais consommé côté renderer */
    launchDebug: 'game:launch_debug',
    /** @internal */
    patchDebug: 'game:patch_debug'
  }
} as const
