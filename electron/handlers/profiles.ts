import { ipcMain } from 'electron'
import { Profiles } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, AUTH_API_URL } from '../const'

export function registerProfilesHandlers() {
  ipcMain.handle('profiles:get', async () => {
    const profiles = new Profiles(ADMINTOOL_URL)

    try {
      const list = await profiles.getProfiles()

      // Récupérer les métadonnées dynamiques de la Console Modey (/admin)
      let modeyMeta: Record<string, any> = {}
      try {
        const resp = await fetch(`${AUTH_API_URL}/api/modey/launcher`)
        if (resp.ok) {
          const data = await resp.json()
          if (data.success && data.servers) {
            modeyMeta = data.servers
          }
        }
      } catch (metaErr) {
        logger.warn('Modey launcher metadata inaccessible, utilisation des valeurs par défaut:', metaErr)
      }

      // Fusionner les profils avec les métadonnées Modey
      const enriched = list.map((p) => {
        const meta = modeyMeta[p.slug]
        return {
          ...p,
          modey: meta || {
            status: (!p.ip || !p.port) ? 'comingSoon' : 'live',
            enabled: Boolean(p.ip && p.port),
            autoBlockIfOffline: true,
            maintenanceMessage: '',
            bannerUrl: '',
            tags: [],
            teaser: null
          }
        }
      })

      const sorted = [enriched.find((p) => p.isDefault)!, ...enriched.filter((p) => !p.isDefault)].filter(Boolean)
      return sorted
    } catch (err) {
      logger.error('Failed to fetch profiles:', err)
      return null
    }
  })
}

