import os from 'os'

export interface RuntimeConfig {
  apiBase: string
  authUrl: string
  admintoolUrl: string
  ramMin: number
  ramMax: number
  totalSystemRamMb: number
}

export function getRuntimeConfig(): RuntimeConfig {
  const apiBase = (process.env.MODEY_API_URL || 'https://api.modey.flowcrea.fr').replace(/\/+$/, '')
  const authUrl = (process.env.MODEY_AUTH_URL || `${apiBase}/api/yggdrasil`).replace(/\/+$/, '')
  const admintoolUrl = (process.env.MODEY_ADMINTOOL_URL || apiBase).replace(/\/+$/, '')

  const totalSystemRamMb = Math.floor(os.totalmem() / (1024 * 1024))
  // RAM Min : 1024 Mo (1 Go)
  const ramMin = 1024
  // RAM Max : 75% de la mémoire totale ou total - 2048 Mo, minimum 2048 Mo
  const calculatedMax = Math.min(Math.floor(totalSystemRamMb * 0.75), Math.max(2048, totalSystemRamMb - 2048))
  const ramMax = Math.max(ramMin, calculatedMax)

  return {
    apiBase,
    authUrl,
    admintoolUrl,
    ramMin,
    ramMax,
    totalSystemRamMb
  }
}
