import { server } from '../ipc'
import type { IServerStatus } from 'eml-lib'
import profileConfig from '../../config/athena-profile.json'

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

export const targetFor = (profile: any) => ({
  host: profile?.ip || profileConfig.server.host,
  port: profile?.port || profileConfig.server.port
})

export const athenaTarget = (profiles: any[]) => {
  const athena = profiles.find((p) => p.slug === 'athena')
  return { host: athena?.ip || profileConfig.server.host, port: athena?.port || profileConfig.server.port }
}
