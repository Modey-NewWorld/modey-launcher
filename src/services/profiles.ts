import { profiles as profilesIpc } from '../ipc'
import freeBuildConfig from '../../config/free-build-profile.json'

export type ProfileStatus = 'live' | 'maintenance' | 'comingSoon' | 'disabled'

// Un profil est en travaux, bientôt disponible ou désactivé selon les flags Modey ou l'AdminTool
export function getProfileModeyStatus(profile: any): ProfileStatus {
  if (!profile) return 'disabled'
  if (profile.modey?.status) return profile.modey.status
  if (profile.slug === freeBuildConfig.slug || !profile.ip || !profile.port) return 'comingSoon'
  return 'live'
}

export const isComingSoonProfile = (profile: any) => getProfileModeyStatus(profile) === 'comingSoon'
export const isMaintenanceProfile = (profile: any) => getProfileModeyStatus(profile) === 'maintenance'
export const isDisabledProfile = (profile: any) => getProfileModeyStatus(profile) === 'disabled' || profile.modey?.enabled === false

export const isAthenaProfile = (profile: any) => !profile || profile.slug === 'athena'

export async function fetchProfiles(): Promise<any[]> {
  return ((await profilesIpc.get()) as any[]) || []
}
