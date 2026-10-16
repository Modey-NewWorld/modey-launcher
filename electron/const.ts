export const ADMINTOOL_URL = process.env.MODEY_ADMINTOOL_URL || 'http://localhost:3005'
// URL de l'Auth-Server Modey (Yggdrasil + authlib-injector)
export const AUTH_SERVER_URL = process.env.MODEY_AUTH_URL || 'http://localhost:3005/api/yggdrasil'
export const AUTH_API_URL = process.env.MODEY_API_URL || 'http://localhost:3005'
// Chemin Java 21 système de référence (fallback si java absent du PATH)
export const SYSTEM_JAVA_21_PATH = 'C:\Program Files\Java\jdk-21.0.10\bin\java.exe'