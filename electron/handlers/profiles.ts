import { ipcMain } from 'electron'
import { Profile } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, AUTH_API_URL } from '../const'
import { IPC } from '../ipc-channels'

// Gestionnaire unique de profils conservant les jetons de profils protégés en mémoire
const profileManager = new Profile(ADMINTOOL_URL)
const unlockedProfileTokens = new Map<string, string>()

export function registerProfilesHandlers() {
  ipcMain.handle(IPC.profiles.auth, async (_event, slug: string, password: string) => {
    try {
      if (!slug || !password) {
        return { success: false, error: 'Slug et mot de passe requis' }
      }
      const res = await profileManager.auth(slug, password)
      if (res?.slug && res?.token) {
        unlockedProfileTokens.set(res.slug, res.token)
      }
      logger.info(`[Profile Auth] Profil '${slug}' déverrouillé avec succès.`)
      return { success: true, slug: res.slug, token: res.token }
    } catch (err: any) {
      logger.warn(`[Profile Auth] Échec du déverrouillage de '${slug}':`, err?.message || err)
      return { success: false, error: err?.message || 'Mot de passe incorrect' }
    }
  })

  ipcMain.handle(IPC.profiles.resolveCustom, async (_event, query: string, password?: string) => {
    try {
      const cleanQuery = String(query || '').trim()
      if (!cleanQuery) {
        return { success: false, found: false, error: 'Adresse IP ou identifiant requis' }
      }
      const resp = await fetch(`${AUTH_API_URL}/api/profiles/resolve-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, password: password || '' })
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data?.success) {
        if (data.slug && data.token) {
          unlockedProfileTokens.set(data.slug, data.token)
        }
        return data
      }
      if (data?.found && data?.requiresPassword) {
        return {
          success: false,
          found: true,
          requiresPassword: true,
          error: data?.message || 'Mot de passe requis'
        }
      }

      // Fallback local/standalone : interroger /server-meta sur le Files-Updater (port 3008 par défaut)
      const colonIdx = cleanQuery.lastIndexOf(':')
      const probeHost = colonIdx > 0 && /^\d+$/.test(cleanQuery.slice(colonIdx + 1))
        ? cleanQuery.slice(0, colonIdx).trim()
        : cleanQuery
      if (probeHost && !probeHost.includes('/')) {
        try {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 900)
          const metaResp = await fetch(`http://${probeHost}:3008/server-meta`, { signal: ctrl.signal })
          clearTimeout(timer)
          if (metaResp.ok) {
            const metaJson = await metaResp.json().catch(() => null)
            if (metaJson?.success && metaJson?.name) {
              return {
                success: false,
                found: false,
                standaloneMeta: metaJson
              }
            }
          }
        } catch {}
      }

      return {
        success: false,
        found: Boolean(data?.found),
        requiresPassword: Boolean(data?.requiresPassword),
        error: data?.message || 'Serveur introuvable'
      }
    } catch (err: any) {
      logger.warn('[Profile ResolveCustom] Erreur réseau :', err?.message || err)
      return { success: false, found: false, error: err?.message || 'Impossible de contacter le réseau Modey' }
    }
  })

  ipcMain.handle(IPC.profiles.get, async () => {
    try {
      let list = await profileManager.getProfiles()

      // Si des profils privés/cachés ont été déverrouillés dans la session, fusionner leurs accès
      if (unlockedProfileTokens.size > 0) {
        try {
          const tokensHeader = Array.from(unlockedProfileTokens.values()).join(',')
          const extraResp = await fetch(`${ADMINTOOL_URL}/api/profiles`, {
            headers: { 'X-Profile-Tokens': tokensHeader }
          })
          if (extraResp.ok) {
            const extraData = await extraResp.json()
            const unlockedList: any[] = Array.isArray(extraData?.profiles) ? extraData.profiles : []
            if (unlockedList.length > 0) {
              const baseList = Array.isArray(list) ? [...list] : []
              for (const up of unlockedList) {
                const idx = baseList.findIndex((p: any) => p.slug === up.slug)
                if (idx >= 0) {
                  if (up.visibility === 'PUBLIC' && baseList[idx].visibility !== 'PUBLIC') {
                    baseList[idx] = up
                  }
                } else {
                  baseList.push(up)
                }
              }
              list = baseList
            }
          }
        } catch (unlockErr) {
          logger.warn('[Profiles] Erreur lors de la récupération des profils déverrouillés:', unlockErr)
        }
      }

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
      const normalizeAssetUrl = (u?: string) => (u && u.startsWith('/')) ? `${AUTH_API_URL}${u}` : u

      const enriched = list.map((p: any) => {
        const meta = modeyMeta[p.slug]
        if (meta) {
          if (meta.bannerUrl) meta.bannerUrl = normalizeAssetUrl(meta.bannerUrl)
          if (meta.iconUrl) meta.iconUrl = normalizeAssetUrl(meta.iconUrl)
        }
        const normalizedProfileBanner = normalizeAssetUrl(p.bannerUrl)
        const normalizedProfileIcon = normalizeAssetUrl(p.iconUrl)
        const isAthena = p.slug === 'athena' || p.id === 'modey-athena' || p.name === 'Athéna'
        const hasIp = Boolean(p.ip || (p as any).server?.host || (p as any).host || isAthena)
        const hasPort = Boolean(p.port || (p as any).server?.port || isAthena)
        const resolvedUpdaterUrl = String(p.updaterUrl || meta?.updaterUrl || '').trim() || undefined
        return {
          ...p,
          updaterUrl: resolvedUpdaterUrl,
          bannerUrl: normalizedProfileBanner || meta?.bannerUrl || '',
          iconUrl: normalizedProfileIcon || meta?.iconUrl || '',
          description: p.description || meta?.description || meta?.teaser?.description || '',
          tags: Array.isArray(p.tags) ? p.tags : (Array.isArray(meta?.tags) ? meta.tags : []),
          modey: meta || {
            status: (!hasIp || !hasPort) ? 'comingSoon' : 'live',
            enabled: Boolean(hasIp && hasPort),
            autoBlockIfOffline: true,
            maintenanceMessage: '',
            description: p.description || '',
            bannerUrl: normalizedProfileBanner || '',
            iconUrl: normalizedProfileIcon || '',
            launcherIcon: p.launcherIcon || 'cube',
            minecraftVersion: p.minecraftVersion || '1.21.1',
            loader: p.loader || 'neoforge',
            loaderVersion: p.loaderVersion || '',
            tags: Array.isArray(p.tags) ? p.tags : [],
            teaser: p.teaser || (p.description ? { description: p.description } : null)
          }
        }
      })

      const sorted = [enriched.find((p: any) => p.isDefault)!, ...enriched.filter((p: any) => !p.isDefault)].filter(Boolean)
      return sorted
    } catch (err) {
      logger.error('Failed to fetch profiles:', err)
      return null
    }
  })
}

