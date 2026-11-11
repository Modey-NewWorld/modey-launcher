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

let cachedLauncherMeta: { servers: Record<string, any>; cachedAt: number } | null = null

/**
 * Résout l'URL Files-Updater personnalisée d'un serveur via /api/modey/launcher si disponible
 */
export async function resolveUpdaterUrl(
  authApiUrl: string,
  slug: string,
  explicitUpdaterUrl?: string
): Promise<string | undefined> {
  const direct = explicitUpdaterUrl && explicitUpdaterUrl.trim() ? explicitUpdaterUrl.trim() : ''
  if (direct) return direct

  const cleanSlug = (slug || 'athena').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
  const now = Date.now()

  if (!cachedLauncherMeta || now - cachedLauncherMeta.cachedAt > 15000) {
    try {
      const resp = await fetch(`${authApiUrl}/api/modey/launcher`)
      if (resp.ok) {
        const data = await resp.json()
        if (data?.success && data?.servers) {
          cachedLauncherMeta = { servers: data.servers, cachedAt: now }
        }
      }
    } catch (_) {}
  }

  const srv = cachedLauncherMeta?.servers?.[cleanSlug]
  const u = srv?.updaterUrl ? String(srv.updaterUrl).trim() : ''
  return u || undefined
}

/**
 * Récupère le manifeste de distribution avec déduplication, cache 30s et ETag 304 Not Modified
 */
export async function fetchServerManifest(
  adminToolUrl: string,
  slug: string,
  customUpdaterUrl?: string,
  serverPassword?: string
): Promise<any> {
  const cleanSlug = (slug || 'athena').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
  const targetUrl = (customUpdaterUrl && customUpdaterUrl.trim())
    ? customUpdaterUrl.trim()
    : `${adminToolUrl}/api/files-updater/${cleanSlug}`
  const pwdKey = serverPassword ? `:pwd:${serverPassword.length}` : ''
  const cacheKey = `${cleanSlug}::${targetUrl}${pwdKey}`
  const now = Date.now()

  // 1. Vérifier si un cache récent (< 30 secondes) est disponible
  const cached = memoryManifests.get(cacheKey)
  if (cached && now - cached.cachedAt < 30000) {
    return cached.data
  }

  // 2. Dédupliquer les requêtes parallèles identiques en cours de traitement
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey)
  }

  const promise = (async () => {
    try {
      const headers: Record<string, string> = {}
      if (cached?.etag) {
        headers['If-None-Match'] = cached.etag
      }
      if (serverPassword && String(serverPassword).trim()) {
        headers['X-Modey-Server-Password'] = String(serverPassword).trim()
      }

      const resp = await fetch(targetUrl, { headers }).catch((err) => {
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

      if (resp.status === 401) {
        memoryManifests.delete(cacheKey)
        throw new Error('PASSWORD_REQUIRED')
      }

      if (!resp.ok) {
        if (cached) return cached.data
        return null
      }

      const newEtag = resp.headers.get('etag') || undefined
      const data = await resp.json()

      memoryManifests.set(cacheKey, {
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
      inflightRequests.delete(cacheKey)
    }
  })()

  inflightRequests.set(cacheKey, promise)
  return promise
}

/**
 * Invalide manuellement le cache pour un slug
 */
export function invalidateManifestCache(slug?: string): void {
  if (slug) {
    const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
    for (const key of memoryManifests.keys()) {
      if (key.startsWith(`${cleanSlug}::`)) {
        memoryManifests.delete(key)
      }
    }
  } else {
    memoryManifests.clear()
  }
  cachedLauncherMeta = null
}
