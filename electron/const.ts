import { getRuntimeConfig } from './runtimeConfig'
import { resolveJava21Path } from './utils/javaDetector'

const config = getRuntimeConfig()

export const ADMINTOOL_URL = config.admintoolUrl
// URL de l'Auth-Server Modey (Yggdrasil + authlib-injector)
export const AUTH_SERVER_URL = config.authUrl
export const AUTH_API_URL = config.apiBase

/**
 * Résout dynamiquement l'exécutable Java 21 du système
 */
export function getSystemJava21Path(customPath?: string): string {
  return resolveJava21Path(customPath).path
}

// Versions et loader par défaut (fallback si non fournis par le profil serveur)
export const DEFAULT_MC_VERSION = '1.21.1'
export const DEFAULT_LOADER = 'neoforge'
export const DEFAULT_LOADER_VERSION = '21.1.169'
