import athenaDefault from '../../config/athena-profile.json'
import freeBuildDefault from '../../config/free-build-profile.json'

export const FALLBACK_MC_VERSION = '1.21.1'
export const FALLBACK_LOADER = 'neoforge'
export const FALLBACK_LOADER_VERSION = '21.1.265'

export interface ServerMeta {
  name: string
  subtitle?: string
  ip: string
  port: number
  mapUrl?: string
  status: 'live' | 'maintenance' | 'comingSoon' | 'disabled'
  enabled: boolean
  autoBlockIfOffline: boolean
  maintenanceMessage?: string
  bannerUrl?: string
  iconUrl?: string
  launcherIcon?: string
  tags?: string[]
  gallery?: string[]
  location?: string
  teaser?: {
    description?: string
    features?: Array<{ title: string; text?: string; icon?: string }>
    headline?: string
    cta?: string
  }
  minecraftVersion: string
  loader: string
  loaderVersion: string
  visibility?: string
  isOfficial?: boolean
  isVerified?: boolean
  accessMode?: string
  maintenanceEnabled?: boolean
  bypassRoles?: string[]
  updatedAt?: number
}

const CACHE_KEY = 'modey_launcher_servers_cache'

class LauncherConfigService {
  private cache: Record<string, ServerMeta> = {}

  constructor() {
    this.initDefaultCache()
    this.loadFromStorage()
  }

  private initDefaultCache() {
    this.cache = {
      athena: {
        name: athenaDefault.name || 'Athéna',
        ip: athenaDefault.server?.host || '127.0.0.1',
        port: athenaDefault.server?.port || 25565,
        status: 'live',
        enabled: true,
        isOfficial: true,
        isVerified: true,
        visibility: 'PUBLIC',
        autoBlockIfOffline: true,
        maintenanceMessage: '',
        bannerUrl: '',
        iconUrl: '',
        launcherIcon: 'shield-halved',
        tags: (athenaDefault as any).tags || ['Survie', 'Villes', 'Aventure', 'Communauté', 'Économie'],
        location: (athenaDefault as any).location || 'Europe (France)',
        teaser: {
          description: (athenaDefault as any).description || 'Un monde vivant centré sur l\'aventure communautaire et la construction de cités prospères. Fonde ta ville, commerce et écris ton histoire.'
        },
        minecraftVersion: athenaDefault.minecraftVersion || FALLBACK_MC_VERSION,
        loader: athenaDefault.modLoader?.type || FALLBACK_LOADER,
        loaderVersion: athenaDefault.modLoader?.version || FALLBACK_LOADER_VERSION
      },
      'free-build': {
        name: freeBuildDefault.name || 'Free Build',
        ip: freeBuildDefault.server?.host || '',
        port: freeBuildDefault.server?.port || 0,
        status: 'comingSoon',
        enabled: false,
        isOfficial: true,
        isVerified: true,
        visibility: 'PUBLIC',
        autoBlockIfOffline: true,
        maintenanceMessage: freeBuildDefault.statusLabel || 'Serveur non actif — Arrive bientôt',
        bannerUrl: '',
        iconUrl: '',
        launcherIcon: 'wand-magic-sparkles',
        tags: (freeBuildDefault as any).tags || ['Créatif', 'Construction', 'Communauté'],
        location: (freeBuildDefault as any).location || 'Europe (France)',
        teaser: freeBuildDefault.teaser,
        minecraftVersion: freeBuildDefault.minecraftVersion || FALLBACK_MC_VERSION,
        loader: freeBuildDefault.modLoader?.type || FALLBACK_LOADER,
        loaderVersion: freeBuildDefault.modLoader?.version || FALLBACK_LOADER_VERSION
      }
    }
  }

  private loadFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            this.cache = { ...this.cache, ...parsed }
          }
        }
      }
    } catch {
      // Ignorer
    }
  }

  private saveToStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache))
      }
    } catch {
      // Ignorer
    }
  }

  public getServer(slug: string): ServerMeta | undefined {
    return this.cache[slug]
  }

  public getAllServers(): Record<string, ServerMeta> {
    return this.cache
  }

  public updateServers(servers: Record<string, ServerMeta>) {
    this.cache = { ...this.cache, ...servers }
    this.saveToStorage()
  }

  /**
   * Remplace le cache local par la liste autoritative renvoyée par l'API Modey
   * afin de purger immédiatement les anciens serveurs supprimés ou masqués.
   */
  public replaceServers(servers: Record<string, ServerMeta>) {
    this.cache = { ...servers }
    this.saveToStorage()
  }

  public getDefaultServer(): ServerMeta {
    return this.cache['athena'] || this.cache['modey-athena'] || (this.cache[Object.keys(this.cache)[0]] as ServerMeta)
  }

  public getAthena(): ServerMeta {
    return this.getDefaultServer()
  }

  public getFreeBuild(): ServerMeta {
    return this.cache['free-build'] || (this.cache['modey-free-build'] as ServerMeta)
  }
}

export const launcherConfig = new LauncherConfigService()
