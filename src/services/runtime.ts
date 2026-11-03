/**
 * launcher/src/services/runtime.ts
 * Fournisseur synchrone et asynchrone de la configuration d'exécution du Launcher Modey.
 * Alimenté dynamiquement par le process principal Electron via IPC.
 */

import { system } from '../ipc'
import type { RuntimeConfig } from '../../electron/runtimeConfig'

let cachedRuntimeConfig: RuntimeConfig | null = null

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBase: (import.meta.env?.VITE_MODEY_API_URL as string) || 'https://api.modey.flowcrea.fr',
  authUrl: (import.meta.env?.VITE_MODEY_AUTH_URL as string) || 'https://api.modey.flowcrea.fr/api/yggdrasil',
  admintoolUrl: (import.meta.env?.VITE_MODEY_ADMINTOOL_URL as string) || 'https://api.modey.flowcrea.fr',
  ramMin: 1024,
  ramMax: 8192,
  totalSystemRamMb: 16384
}

export async function initRuntimeConfig(): Promise<RuntimeConfig> {
  if (cachedRuntimeConfig) return cachedRuntimeConfig
  try {
    const config = await system.getRuntimeConfig()
    if (config) {
      cachedRuntimeConfig = config
      return config
    }
  } catch (_) {}
  cachedRuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG }
  return cachedRuntimeConfig
}

export function getRuntimeConfigSync(): RuntimeConfig {
  return cachedRuntimeConfig || DEFAULT_RUNTIME_CONFIG
}

export function getApiBaseUrl(): string {
  return getRuntimeConfigSync().apiBase
}

export function getAuthUrl(): string {
  return getRuntimeConfigSync().authUrl
}

export function getAdmintoolUrl(): string {
  return getRuntimeConfigSync().admintoolUrl
}
