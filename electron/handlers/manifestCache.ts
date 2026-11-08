// launcher/electron/handlers/manifestCache.ts
// Cache en mémoire pour le manifeste Files-Updater avec déduplication de requêtes en vol et support ETag (#32)

import logger from 'electron-log/main'

interface CachedManifest {
  data: any
  etag?: string
  cachedAt: number
}

const memoryManifests = new Map<string, CachedManifest>()
const inflightRequests = new Map<string, Promise<any>>()

/**
 * Récupère le manifeste de distribution avec déduplication, cache 30s et ETag 304 Not Modified
 */
export async function fetchServerManifest(adminToolUrl: string, slug: string): Promise<any> {
  const cleanSlug = (slug || 'athena').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
  const now = Date.now()

  // 1. Vérifier si un cache récent (< 30 secondes) est disponible
  const cached = memoryManifests.get(cleanSlug)
  if (cached && now - cached.cachedAt < 30000) {
    return cached.data
  }

  // 2. Dédupliquer les requêtes parallèles identiques en cours de traitement
  if (inflightRequests.has(cleanSlug)) {
    return inflightRequests.get(cleanSlug)
  }

  const promise = (async () => {
    try {
      const headers: Record<string, string> = {}
      if (cached?.etag) {
        headers['If-None-Match'] = cached.etag
      }

      const url = `${adminToolUrl}/api/files-updater/${cleanSlug}`
      const resp = await fetch(url, { headers }).catch((err) => {
        logger.warn(`[ManifestCache] Erreur réseau lors de la récupération du manifeste (${cleanSlug}) :`, err)
        return null
      })

      if (!resp) {
        if (cached) return cached.data
        return null
      }

      // Si le serveur renvoie 304 Not Modified, rafraîchir l'horodatage et renvoyer le cache existant
      if (resp.status === 304 && cached) {
        cached.cachedAt = Date.now()
        logger.info(`[ManifestCache] 304 Not Modified reçu pour ${cleanSlug} (0 octet transféré)`)
        return cached.data
      }

      if (!resp.ok) {
        if (cached) return cached.data
        return null
      }

      const newEtag = resp.headers.get('etag') || undefined
      const data = await resp.json()

      memoryManifests.set(cleanSlug, {
        data,
        etag: newEtag,
        cachedAt: Date.now()
      })

      return data
    } catch (err) {
      logger.warn(`[ManifestCache] Exception lors du parsing du manifeste (${cleanSlug}) :`, err)
      if (cached) return cached.data
      throw err
    } finally {
      inflightRequests.delete(cleanSlug)
    }
  })()

  inflightRequests.set(cleanSlug, promise)
  return promise
}

/**
 * Invalide manuellement le cache pour un slug
 */
export function invalidateManifestCache(slug?: string): void {
  if (slug) {
    const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
    memoryManifests.delete(cleanSlug)
  } else {
    memoryManifests.clear()
  }
}
