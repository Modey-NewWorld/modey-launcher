import { profiles as profilesIpc } from '../ipc'
import { launcherConfig } from './launcherConfig'

export type ProfileStatus = 'live' | 'maintenance' | 'comingSoon' | 'disabled'

// Un profil est en travaux, bientôt disponible ou désactivé selon les flags Modey ou l'AdminTool
export function getProfileModeyStatus(profile: any): ProfileStatus {
  if (!profile) return 'disabled'
  if (profile.modey?.status) return profile.modey.status
  const fb = launcherConfig.getFreeBuild()
  if (profile.slug === 'free-build' || profile.slug === fb?.name || !profile.ip || !profile.port) return 'comingSoon'
  return 'live'
}

export const isComingSoonProfile = (profile: any) => getProfileModeyStatus(profile) === 'comingSoon'
export const isMaintenanceProfile = (profile: any) => getProfileModeyStatus(profile) === 'maintenance'
export const isDisabledProfile = (profile: any) => getProfileModeyStatus(profile) === 'disabled' || profile.modey?.enabled === false

export const isAthenaProfile = (profile: any) => !profile || profile.slug === 'athena'

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
        minecraftVersion: p.modey.minecraftVersion || p.version || '1.21.1',
        loader: p.modey.loader || p.loaderVersion?.type || 'neoforge',
        loaderVersion: p.modey.loaderVersion || p.loaderVersion?.version || '21.1.169'
      }
    }
  }
  if (Object.keys(updates).length > 0) {
    launcherConfig.updateServers(updates)
  }
  return list
}
