export const ADMINTOOL_URL = process.env.MODEY_ADMINTOOL_URL || 'https://api.modey.flowcrea.fr'
// URL de l'Auth-Server Modey (Yggdrasil + authlib-injector)
export const AUTH_SERVER_URL = process.env.MODEY_AUTH_URL || 'https://api.modey.flowcrea.fr/api/yggdrasil'
export const AUTH_API_URL = process.env.MODEY_API_URL || 'https://api.modey.flowcrea.fr'
// Chemin Java 21 système de référence (fallback si java absent du PATH)
export const SYSTEM_JAVA_21_PATH = 'C:\\Program Files\\Java\\jdk-21.0.10\\bin\\java.exe'

// Versions et loader par défaut (fallback si non fournis par le profil serveur)
export const DEFAULT_MC_VERSION = '1.21.1'
export const DEFAULT_LOADER = 'neoforge'
export const DEFAULT_LOADER_VERSION = '21.1.169'
