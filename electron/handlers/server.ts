import { ipcMain } from 'electron'
import { ServerStatus } from 'eml-lib'
import logger from 'electron-log/main'
import { IPC } from '../ipc-channels'
import net from 'node:net'

/**
 * Mesure la vraie latence réseau TCP (SYN -> SYN-ACK) vers le serveur de jeu
 * Exclut le temps de résolution DNS pour une mesure fidèle et stable dès la première requête.
 */
function measureTcpPing(ip: string, port: number = 25565, timeoutMs = 2500): Promise<number | null> {
  return new Promise((resolve) => {
    let connectStart = performance.now()
    const socket = new net.Socket()
    socket.setNoDelay(true)
    socket.setTimeout(timeoutMs)

    socket.on('lookup', () => {
      // Démarre le chronomètre juste après la résolution DNS
      connectStart = performance.now()
    })

    socket.on('connect', () => {
      const pingMs = Math.max(1, Math.round(performance.now() - connectStart))
      socket.destroy()
      resolve(pingMs)
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve(null)
    })

    socket.on('error', () => {
      socket.destroy()
      resolve(null)
    })

    socket.connect(port, ip)
  })
}

export function registerServerHandlers() {
  ipcMain.handle(IPC.server.status, async (_event, ip: string, port: number = 25565) => {
    try {
      const cleanIp = String(ip || '').trim()
      if (!cleanIp) return null
      const probeIp = cleanIp.toLowerCase() === 'localhost' ? '127.0.0.1' : cleanIp

      // Sonde TCP rapide en parallèle du protocole Minecraft pour un ping réseau précis
      const [tcpPing, status] = await Promise.all([
        measureTcpPing(probeIp, port),
        new ServerStatus(probeIp, port, 'modern', 774).getStatus().catch(() => null)
      ])

      if (status) {
        if (typeof tcpPing === 'number') {
          status.ping = tcpPing
        } else if (typeof status.ping === 'number') {
          status.ping = Math.max(1, status.ping)
        }
        return status
      }

      return null
    } catch (err) {
      logger.error('Failed to get server status:', err)
      return null
    }
  })
}
