import { server } from '../ipc'
import type { IServerStatus } from 'eml-lib'
import { launcherConfig } from './launcherConfig'

export interface ServerProbe {
  status: IServerStatus | null
  pingMs: number
  online: boolean
}

/** Sonde unique du launcher : mesure du ping + statut joueurs. Ne lève jamais. */
export async function pingServer(host: string, port?: number): Promise<ServerProbe> {
  const startedAt = performance.now()
  try {
    const status = await server.getStatus(host, port)
    return {
      status,
      online: !!status,
      pingMs: Math.max(1, Math.round(performance.now() - startedAt))
    }
  } catch {
    return { status: null, online: false, pingMs: 0 }
  }
}

export const targetFor = (profile: any) => {
  const defaultMeta = launcherConfig.getDefaultServer()
  return {
    host: profile?.ip || defaultMeta?.ip || '127.0.0.1',
    port: profile?.port || defaultMeta?.port || 25565
  }
}

export const getServerTarget = (profiles: any[], slug?: string) => {
  const targetSlug = slug || 'athena'
  const found = profiles.find((p) => p.slug === targetSlug || p.name?.toLowerCase() === targetSlug.toLowerCase()) || profiles[0]
  const defaultMeta = launcherConfig.getDefaultServer()
  return {
    host: found?.ip || defaultMeta?.ip || '127.0.0.1',
    port: found?.port || defaultMeta?.port || 25565
  }
}

export const athenaTarget = getServerTarget
