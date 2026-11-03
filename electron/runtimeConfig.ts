import os from 'os'

export interface RuntimeConfig {
  apiBase: string
  authUrl: string
  admintoolUrl: string
  ramMin: number
  ramMax: number
  totalSystemRamMb: number
}

export interface DynamicMemoryLimits {
  minGb: number
  maxGb: number
  totalGb: number
}

export function getDynamicMemoryLimits(): DynamicMemoryLimits {
  const totalGb = Math.floor(os.totalmem() / (1024 * 1024 * 1024))
  const minGb = totalGb <= 4 ? 1 : 2
  // Max par défaut : 75% de la RAM machine
  const maxGb = Math.max(minGb + 1, Math.floor(totalGb * 0.75))
  return {
    minGb,
    maxGb,
    totalGb
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  const apiBase = (process.env.MODEY_API_URL || 'https://api.modey.flowcrea.fr').replace(/\/+$/, '')
  const authUrl = (process.env.MODEY_AUTH_URL || `${apiBase}/api/yggdrasil`).replace(/\/+$/, '')
  const admintoolUrl = (process.env.MODEY_ADMINTOOL_URL || apiBase).replace(/\/+$/, '')

  const totalSystemRamMb = Math.floor(os.totalmem() / (1024 * 1024))
  const limits = getDynamicMemoryLimits()
  const ramMin = limits.minGb * 1024
  const ramMax = limits.maxGb * 1024

  return {
    apiBase,
    authUrl,
    admintoolUrl,
    ramMin,
    ramMax,
    totalSystemRamMb
  }
}
