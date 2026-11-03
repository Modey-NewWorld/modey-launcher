import { profiles as profilesIpc } from '../ipc'
import { launcherConfig, FALLBACK_MC_VERSION, FALLBACK_LOADER, FALLBACK_LOADER_VERSION } from './launcherConfig'

export type ProfileStatus = 'live' | 'maintenance' | 'comingSoon' | 'disabled'

// Un profil est en travaux, bientôt disponible ou désactivé selon les flags Modey ou l'AdminTool
export function getProfileModeyStatus(profile: any): ProfileStatus {
  if (!profile) return 'disabled'
  if (profile.modey?.status) return profile.modey.status
  const fb = launcherConfig.getFreeBuild()
  if (profile.slug === 'free-build' || profile.slug === fb?.name) return 'comingSoon'
  return 'live'
}

export const isComingSoonProfile = (profile: any) => getProfileModeyStatus(profile) === 'comingSoon'
export const isMaintenanceProfile = (profile: any) => getProfileModeyStatus(profile) === 'maintenance'
export const isDisabledProfile = (profile: any) => getProfileModeyStatus(profile) === 'disabled' || profile.modey?.enabled === false

export const isAthenaProfile = (profile: any) => !profile || profile.slug === 'athena'

export const DEFAULT_BYPASS_ROLES = ['founder', 'super_admin', 'admin', 'moderator']
export const STAFF_ROLES = ['founder', 'super_admin', 'superadmin', 'admin', 'super_moderator', 'moderator', 'developer', 'dev']

export function checkCanBypass(profile?: any, user?: any): boolean {
  if (!user) return false
  const role = (user.role || 'citizen').toLowerCase()
  if (role === 'founder' || role === 'super_admin' || role === 'superadmin') return true
  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : []
  if (perms.includes('*') || perms.includes('server:bypass_maintenance') || perms.includes('launcher:bypass_maintenance')) return true
  const bypassRoles: string[] = profile?.modey?.bypassRoles || DEFAULT_BYPASS_ROLES
  if (bypassRoles.map((r: string) => r.toLowerCase()).includes(role)) return true
  return STAFF_ROLES.includes(role)
}

export async function fetchProfiles(): Promise<any[]> {
  const list = (((await profilesIpc.get()) as any[]) || [])
  // Mettre à jour le cache local du launcherConfig avec les métadonnées fraîches de l'infra
  const updates: Record<string, any> = {}
  for (const p of list) {
    if (p.slug && p.modey) {
      updates[p.slug] = {
        name: p.name || p.modey.name,
        ip: p.ip || p.modey.ip,
        port: p.port || p.modey.port,
        status: p.modey.status,
        enabled: p.modey.enabled,
        autoBlockIfOffline: p.modey.autoBlockIfOffline,
        maintenanceMessage: p.modey.maintenanceMessage,
        bannerUrl: p.modey.bannerUrl,
        iconUrl: p.modey.iconUrl,
        launcherIcon: p.modey.launcherIcon || 'cube',
        tags: p.modey.tags,
        teaser: p.modey.teaser,
        minecraftVersion: p.modey.minecraftVersion || p.version || FALLBACK_MC_VERSION,
        loader: p.modey.loader || p.loaderVersion?.type || FALLBACK_LOADER,
        loaderVersion: p.modey.loaderVersion || p.loaderVersion?.version || FALLBACK_LOADER_VERSION,
        accessMode: p.modey.accessMode || 'normal',
        maintenanceEnabled: Boolean(p.modey.maintenanceEnabled),
        bypassRoles: Array.isArray(p.modey.bypassRoles) ? p.modey.bypassRoles : ['founder', 'super_admin', 'admin', 'moderator']
      }
    }
  }
  if (Object.keys(updates).length > 0) {
    launcherConfig.updateServers(updates)
  }
  return list
}
