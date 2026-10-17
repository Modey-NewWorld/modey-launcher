import { app } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Résout le chemin vers authlib-injector.jar.
 * En production (app packagée) : dans process.resourcesPath/assets/
 * En développement : dans le dossier assets/ à la racine du projet
 */
export function getAuthlibInjectorPath(): string | null {
  const inResources = path.join(process.resourcesPath || '', 'assets', 'authlib-injector.jar')
  const inProject = path.join(app.getAppPath(), '..', 'assets', 'authlib-injector.jar')
  const devPath = path.join(app.getAppPath(), 'assets', 'authlib-injector.jar')

  for (const candidate of [inResources, inProject, devPath]) {
    if (fs.existsSync(candidate)) {
      logger.info(`[Modey Launcher] authlib-injector trouvé : ${candidate}`)
      return candidate
    }
  }

  logger.warn('[Modey Launcher] ⚠️  authlib-injector.jar introuvable ! La sécurité anti-crack ne sera pas active.')
  return null
}
