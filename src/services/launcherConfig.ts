import athenaDefault from '../../config/athena-profile.json'
import freeBuildDefault from '../../config/free-build-profile.json'

export interface ServerMeta {
  name: string
  ip: string
  port: number
  mapUrl?: string
  status: 'live' | 'maintenance' | 'comingSoon' | 'disabled'
  enabled: boolean
  autoBlockIfOffline: boolean
  maintenanceMessage?: string
  bannerUrl?: string
  iconUrl?: string
  tags?: string[]
  teaser?: {
    description?: string
    features?: Array<{ title: string; text?: string; icon?: string }>
    headline?: string
    cta?: string
  }
  minecraftVersion: string
  loader: string
  loaderVersion: string
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
        autoBlockIfOffline: true,
        maintenanceMessage: '',
        bannerUrl: '',
        iconUrl: '',
        tags: ['Survie RP', 'Économie', 'Villes & Métropoles', 'Create'],
        teaser: {
          description: 'Un monde persistant et vivant. Fondez vos cités et développez une véritable société.'
        },
        minecraftVersion: athenaDefault.minecraftVersion || '1.21.1',
        loader: athenaDefault.modLoader?.type || 'neoforge',
        loaderVersion: athenaDefault.modLoader?.version || '21.1.169'
      },
      'free-build': {
        name: freeBuildDefault.name || 'Free Build',
        ip: freeBuildDefault.server?.host || '',
        port: freeBuildDefault.server?.port || 0,
        status: 'comingSoon',
        enabled: false,
        autoBlockIfOffline: true,
        maintenanceMessage: freeBuildDefault.statusLabel || 'Serveur non actif — Arrive bientôt',
        bannerUrl: '',
        iconUrl: '',
        tags: ['Créatif', 'Plots', 'Schématiques', 'Concours'],
        teaser: freeBuildDefault.teaser,
        minecraftVersion: freeBuildDefault.minecraftVersion || '1.21.1',
        loader: freeBuildDefault.modLoader?.type || 'neoforge',
        loaderVersion: freeBuildDefault.modLoader?.version || '21.1.169'
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
      // Ignorer les erreurs de localStorage (mode headless ou sandbox)
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

  public getAthena(): ServerMeta {
    return this.cache['athena'] || this.cache['modey-athena'] || (this.cache[Object.keys(this.cache)[0]] as ServerMeta)
  }

  public getFreeBuild(): ServerMeta {
    return this.cache['free-build'] || this.cache['modey-free-build'] as ServerMeta
  }
}

export const launcherConfig = new LauncherConfigService()
