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
  const athena = launcherConfig.getAthena()
  return {
    host: profile?.ip || athena?.ip || '127.0.0.1',
    port: profile?.port || athena?.port || 25565
  }
}

export const athenaTarget = (profiles: any[]) => {
  const athena = profiles.find((p) => p.slug === 'athena')
  const athenaMeta = launcherConfig.getAthena()
  return {
    host: athena?.ip || athenaMeta?.ip || '127.0.0.1',
    port: athena?.port || athenaMeta?.port || 25565
  }
}
