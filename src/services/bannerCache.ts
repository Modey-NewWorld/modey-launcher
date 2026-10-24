import defaultBannerUrl from '../static/images/bg.png'
import logger from 'electron-log/renderer'

const BANNER_URL_MAP_KEY = 'modey_banner_url_map'
const BANNER_BLOB_PREFIX = 'modey_cached_banner_'

/**
 * Service de mise en cache intelligente des bannières serveur.
 * - Affiche immédiatement la dernière image déjà téléchargée et stockée en local (Base64).
 * - Ne télécharge l'image distante QUE si l'URL ou son horodatage a changé dans l'infra.
 */
class BannerCacheService {
  /**
   * Obtient l'image de bannière à afficher :
   * Renvoie immédiatement l'image locale en cache si l'URL distante n'a pas changé.
   * Si l'URL a changé, télécharge la nouvelle image en arrière-plan et met à jour le cache.
   */
  public getBanner(slug: string, remoteUrl?: string): string {
    const fallback = defaultBannerUrl
    if (!remoteUrl) return fallback

    const cachedDataUrl = this.getCachedImage(slug)
    const lastKnownRemoteUrl = this.getLastUrl(slug)

    // Si on a déjà l'image en cache et que l'URL distante est strictement identique, on réutilise le cache local
    if (cachedDataUrl && lastKnownRemoteUrl === remoteUrl) {
      return cachedDataUrl
    }

    // Si l'URL a changé ou si on n'a pas encore l'image en cache, lancer le téléchargement en tâche de fond
    this.downloadAndCache(slug, remoteUrl)

    // Renvoyer en attendant soit l'ancienne image en cache (transition fluide), soit l'URL distante / fallback
    return cachedDataUrl || remoteUrl || fallback
  }

  private getCachedImage(slug: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(`${BANNER_BLOB_PREFIX}${slug}`)
      }
    } catch {
      // Ignorer
    }
    return null
  }

  private getLastUrl(slug: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(BANNER_URL_MAP_KEY)
        if (raw) {
          const map = JSON.parse(raw)
          return map[slug] || null
        }
      }
    } catch {
      // Ignorer
    }
    return null
  }

  private setLastUrl(slug: string, url: string) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(BANNER_URL_MAP_KEY)
        const map = raw ? JSON.parse(raw) : {}
        map[slug] = url
        window.localStorage.setItem(BANNER_URL_MAP_KEY, JSON.stringify(map))
      }
    } catch {
      // Ignorer
    }
  }

  private async downloadAndCache(slug: string, url: string) {
    try {
      const resp = await fetch(url)
      if (!resp.ok) return
      const blob = await resp.blob()

      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        if (base64) {
          try {
            window.localStorage.setItem(`${BANNER_BLOB_PREFIX}${slug}`, base64)
            this.setLastUrl(slug, url)
            logger.info(`[BannerCache] ✅ Nouvelle bannière téléchargée et stockée en cache local pour ${slug}`)

            // Notifier si l'élément hero est présent pour appliquer à chaud sans rechargement
            const heroEl = document.getElementById('hero')
            if (heroEl) {
              heroEl.style.background = `linear-gradient(180deg, rgba(10, 20, 40, 0.15) 0%, rgba(10, 20, 40, 0.82) 78%), url('${base64}') center / cover no-repeat, #24365c`
            }
          } catch (e) {
            logger.warn(`[BannerCache] Impossible de sauvegarder la bannière dans le stockage local :`, e)
          }
        }
      }
      reader.readAsDataURL(blob)
    } catch (err) {
      logger.warn(`[BannerCache] Échec du téléchargement de la bannière ${url} :`, err)
    }
  }
}

export const bannerCache = new BannerCacheService()
