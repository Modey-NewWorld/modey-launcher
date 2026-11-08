import { app, ipcMain } from 'electron'
import { type Account, type ISkin, Skin } from 'eml-lib'
import path from 'node:path'
import fs from 'node:fs'
import logger from 'electron-log/main'
import { IPC } from '../ipc-channels'
import { AUTH_API_URL, AUTH_SERVER_URL } from '../const'

export function normalizeSkinUrl(url: string | null | undefined): string {
  if (!url) return ''
  let clean = url.trim()
  clean = clean.replace(/^http:\/\/192\.168\.1\.\d+(:\d+)?/, AUTH_API_URL)
  clean = clean.replace(/^http:\/\/localhost(:\d+)?/, AUTH_API_URL)
  clean = clean.replace(/^https?:\/\/api\.modey\.flowcrea\.fr/, AUTH_API_URL)
  return clean
}

let skin: Skin | null = null
/** Résolu à la demande pour respecter le dossier `userData` du mode portable. */
const skinPath = () => path.join(app.getPath('userData'), 'skins.json')
const DEFAULT_SKINS: ISkin[] = [
  {
    id: 'steve',
    url: 'http://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb',
    variant: 'classic',
    state: 'inactive'
  }
]

export function registerSkinHandlers() {
  ipcMain.handle(IPC.skin.reload, async (_event, account?: Account) => {
    if (account?.meta?.type === 'crack') {
      return null
    }
    try {
      if (!skin && account) {
        skin = new Skin(account)
        await skin.reload()
      } else if (skin) {
        await skin.reload()
      } else {
        return null
      }
    } catch (err) {
      logger.warn('Skin reload skipped:', err)
      return null
    }
  })

  ipcMain.handle(IPC.skin.getSkin, async (_event, account?: Account) => {
    if (account?.meta?.type === 'crack') {
      return await getSkins(true)
    }
    try {
      if (account && !skin) {
        skin = new Skin(account)
      } else if (!account && !skin) {
        return await getSkins(true)
      }
      return await getSkins()
    } catch {
      return await getSkins()
    }
  })

  ipcMain.handle(IPC.skin.getCape, async (_event, account?: Account) => {
    if (account?.meta?.type === 'crack') {
      return []
    }
    try {
      if (account && !skin) {
        skin = new Skin(account)
      } else if (!account && !skin) {
        return []
      }
      return await skin!.getCape()
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.skin.getAvatar, async (_event, account?: Account) => {
    if (account?.meta?.type === 'crack') {
      return { url: `https://minotar.net/helm/${account.name}/64` }
    }
    try {
      if (account && !skin) {
        skin = new Skin(account)
      } else if (!account && !skin) {
        return null
      }
      return await skin!.getAvatar()
    } catch {
      return account ? { url: `https://minotar.net/helm/${account.name}/64` } : null
    }
  })

  ipcMain.handle(IPC.skin.updateSkin, async (_event, source: string | ArrayBuffer, _model?: 'classic' | 'slim') => {
    if (!skin) {
      return { success: false, error: 'No skin loaded' }
    }

    const isSteve = source === DEFAULT_SKINS[0].url || source === 'steve'

    // Cas 1 : Sélection de Steve (skin par défaut)
    if (isSteve) {
      const activeUrl = DEFAULT_SKINS[0].url
      // Mettre à jour l'auth server pour supprimer le skin custom (revient à Steve par défaut)
      try {
        const token = (skin as any)?.account?.accessToken
        const url = (skin as any)?.account?.meta?.url || AUTH_SERVER_URL
        if (token && url) {
          await fetch(`${url}/minecraft/profile/skins`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
        }
      } catch (err) {
        logger.warn('Failed to delete skin on auth-server for default skin selection:', err)
      }

      // Marquer tous les skins custom comme inactifs dans le cache
      if (fs.existsSync(skinPath())) {
        try {
          const cached = (JSON.parse(fs.readFileSync(skinPath(), 'utf-8') || '[]') as (ISkin & { name?: string })[])
            .map((s) => ({ ...s, state: 'inactive' as const }))
          fs.writeFileSync(skinPath(), JSON.stringify(cached, null, 2))
        } catch (_) {}
      }

      // Vider le cache mémoire interne de eml-lib
      if (skin) {
        ;(skin as any).skins = []
        ;(skin as any).cached = true
      }

      return await getSkins(true, [
        {
          id: 'steve',
          url: activeUrl,
          state: 'active',
          variant: 'classic'
        }
      ])
    }

    // Cas 2 : Sélection d'un skin existant dans le casier par URL
    if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
      const activeUrl = normalizeSkinUrl(source)
      try {
        const token = (skin as any)?.account?.accessToken
        const url = (skin as any)?.account?.meta?.url || AUTH_SERVER_URL
        if (token && url) {
          const res = await fetch(`${url}/minecraft/profile/skins/active`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ url: activeUrl, variant: _model || 'classic' })
          })
          if (!res.ok) {
            const errBody: any = await res.json().catch(() => ({}))
            const msg = errBody?.errorMessage || errBody?.error || 'Erreur activation skin'
            return { error: msg, errorMessage: msg }
          }
        }
      } catch (err: any) {
        logger.error('Failed to activate existing skin on auth-server:', err)
        return { error: err.message, errorMessage: err.message }
      }

      if (skin) {
        ;(skin as any).skins = [
          {
            id: activeUrl,
            url: activeUrl,
            state: 'active',
            variant: _model || 'classic'
          }
        ]
        ;(skin as any).cached = true
      }

      return await getSkins(true, [
        {
          id: 'active_skin',
          url: activeUrl,
          state: 'active',
          variant: _model || 'classic'
        }
      ])
    }

    // Cas 3 : Import d'un nouveau skin (fichier binaire ou data URL)
    let skinSource: string | Blob
    if (source instanceof ArrayBuffer) {
      skinSource = new Blob([source], { type: 'image/png' })
    } else if (typeof source === 'string' && source.startsWith('data:')) {
      const res = await fetch(source)
      skinSource = await res.blob()
    } else {
      skinSource = source
    }

    try {
      await skin.updateSkin(skinSource, _model || 'classic')
    } catch (err: any) {
      logger.error('Failed to update skin:', err)
      const message = err?.response?.data?.errorMessage || err?.message || 'Erreur lors de la mise à jour du skin'
      return { error: message, errorMessage: message }
    }

    const fetched = ((await skin.getSkin()) as ISkin[])
    const activeFromServer = fetched.find((s) => s.state === 'active') || fetched[0]
    const activeUrl = normalizeSkinUrl(activeFromServer ? activeFromServer.url : (typeof source === 'string' ? source : ''))
    const customSkinId = 'skin_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6)

    const newSkins = [
      {
        id: customSkinId,
        url: activeUrl,
        state: 'active' as const,
        variant: (_model || 'classic') as 'classic' | 'slim'
      }
    ]

    await appendSkin(...newSkins)

    return await getSkins(true, newSkins)
  })

  ipcMain.handle(IPC.skin.deleteSkin, async (_event, id: string) => {
    if (!fs.existsSync(skinPath())) {
      return null
    }

    try {
      const data = JSON.parse(fs.readFileSync(skinPath(), 'utf-8')) as (ISkin & { name?: string })[]
      const target = data.find((s) => s.id === id)
      const isActive = target?.state === 'active'

      // Supprimer le skin du fichier de cache
      let newSkins = data.filter((s) => s.id !== id)

      // Supprimer le fichier de skin sur le serveur Auth / Yggdrasil
      try {
        const token = (skin as any)?.account?.accessToken
        const url = (skin as any)?.account?.meta?.url || AUTH_SERVER_URL
        if (token && url) {
          // On passe l'identifiant / URL du fichier pour que le serveur le supprime sur disque
          await fetch(`${url}/minecraft/profile/skins?url=${encodeURIComponent(target?.url || '')}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          })
        }
      } catch (e) {
        logger.warn('Failed to delete skin on server:', e)
      }

      if (isActive) {
        if (skin) {
          ;(skin as any).skins = []
          ;(skin as any).cached = true
        }
        newSkins = newSkins.map((s) => ({ ...s, state: 'inactive' as const }))
      }

      fs.writeFileSync(skinPath(), JSON.stringify(newSkins, null, 2))
      return await getSkins(true, [
        {
          id: 'steve',
          url: DEFAULT_SKINS[0].url,
          state: 'active',
          variant: 'classic'
        }
      ])
    } catch (err: any) {
      logger.error('Failed to delete skin from cache:', err)
      return null
    }
  })

  ipcMain.handle(IPC.skin.renameSkin, async (_event, id: string, name: string) => {
    if (!fs.existsSync(skinPath())) {
      return null
    }

    try {
      const data = JSON.parse(fs.readFileSync(skinPath(), 'utf-8')) as (ISkin & { name?: string })[]
      const cleanName = (name || '').trim()
      const updated = data.map((s) => {
        if (s.id === id) {
          return { ...s, name: cleanName }
        }
        return s
      })
      fs.writeFileSync(skinPath(), JSON.stringify(updated, null, 2))
      return await getSkins(true)
    } catch (err: any) {
      logger.error('Failed to rename skin:', err)
      return null
    }
  })

  ipcMain.handle(IPC.skin.switchCape, async (_event, id: string) => {
    if (!skin) {
      return { success: false, error: 'No skin loaded' }
    }

    try {
      const token = (skin as any)?.account?.accessToken
      const url = (skin as any)?.account?.meta?.url || AUTH_SERVER_URL
      if (token && url) {
        await fetch(`${url}/minecraft/profile/capes/active`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ url: id })
        }).catch(() => {})
      }
      await skin.switchCape(id)
      return skin.getCape()
    } catch (err: any) {
      logger.error('Failed to switch cape:', err)
      return null
    }
  })

  // ipcMain.handle('skin:delete_cape', async (_event) => {
  // }) --- Not implemented with Microsoft accounts ---

  ipcMain.handle(IPC.skin.hideCape, async (_event) => {
    if (!skin) {
      return { success: false, error: 'No skin loaded' }
    }

    try {
      const token = (skin as any)?.account?.accessToken
      const url = (skin as any)?.account?.meta?.url || AUTH_SERVER_URL
      if (token && url) {
        await fetch(`${url}/minecraft/profile/capes/active`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {})
      }
      await skin.hideCape()
      return skin.getCape()
    } catch (err: any) {
      logger.error('Failed to hide cape:', err)
      return null
    }
  })
}

/**
 * If `skipFetch` is `true`, `inject` must include the active skin.
 */
async function getSkins(skipFetch = false, inject: (ISkin & { name?: string })[] = []) {
  let serverActiveUrl: string | null = null
  let serverWardrobe: (ISkin & { name?: string })[] = []

  if (!skipFetch && skin) {
    try {
      const account = (skin as any)?.account
      const token = account?.accessToken
      const authUrl = account?.meta?.url || AUTH_SERVER_URL
      if (token && authUrl) {
        const res = await fetch(`${authUrl}/minecraft/profile/skins`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const body: any = await res.json()
          if (Array.isArray(body?.skins)) {
            for (const s of body.skins) {
              const normUrl = normalizeSkinUrl(s.url)
              if (!normUrl) continue
              if (s.state === 'ACTIVE') {
                serverActiveUrl = normUrl
              }
              serverWardrobe.push({
                id: s.id || ('skin_' + Math.random().toString(36).substring(2, 8)),
                url: normUrl,
                name: s.name,
                state: s.state === 'ACTIVE' ? 'active' : 'inactive',
                variant: (s.variant === 'SLIM' ? 'slim' : 'classic') as 'classic' | 'slim'
              })
            }
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch server wardrobe skins:', err)
    }

    if (!serverActiveUrl) {
      try {
        const data = (await skin.getSkin()) as ISkin[]
        const active = data.find((s) => s.state === 'active')
        if (active) serverActiveUrl = normalizeSkinUrl(active.url)
      } catch (err) {
        logger.warn('Failed to get server skins:', err)
      }
    }
  }

  const injectedActive = inject.find((s) => s.state === 'active')
  const effectiveActiveUrl = normalizeSkinUrl(injectedActive ? injectedActive.url : serverActiveUrl)

  let localCache: (ISkin & { name?: string })[] = []
  try {
    if (fs.existsSync(skinPath())) {
      const raw = JSON.parse(fs.readFileSync(skinPath(), 'utf-8') || '[]') as (ISkin & { name?: string })[]
      const seenUrls = new Set<string>()

      for (const s of raw) {
        if (!s || !s.url) continue
        const normUrl = normalizeSkinUrl(s.url)
        // Ignorer Steve s'il s'était retrouvé dans skins.json
        if (s.id === 'steve' || normUrl === DEFAULT_SKINS[0].url) continue
        if (seenUrls.has(normUrl)) continue
        seenUrls.add(normUrl)

        localCache.push({
          id: s.id || ('skin_' + Math.random().toString(36).substring(2, 8)),
          url: normUrl,
          name: s.name,
          state: effectiveActiveUrl
            ? (normUrl === effectiveActiveUrl ? 'active' : 'inactive')
            : (s.state === 'active' ? 'active' : 'inactive'),
          variant: (s.variant === 'slim' ? 'slim' : 'classic') as 'classic' | 'slim'
        })
      }
    }
  } catch (err) {
    logger.warn('Failed to read skins from cache:', err)
  }

  // Synchroniser et fusionner avec le casier officiel distant
  for (const srvSkin of serverWardrobe) {
    const existing = localCache.find((s) => s.url === srvSkin.url)
    if (existing) {
      if (!existing.name && srvSkin.name) existing.name = srvSkin.name
      if (effectiveActiveUrl) {
        existing.state = existing.url === effectiveActiveUrl ? 'active' : 'inactive'
      }
    } else {
      localCache.push({
        ...srvSkin,
        state: effectiveActiveUrl ? (srvSkin.url === effectiveActiveUrl ? 'active' : 'inactive') : srvSkin.state
      })
    }
  }

  // Injecter les skins fournis en paramètre s'ils ne sont pas déjà dans le cache
  for (const inj of inject) {
    if (!inj || !inj.url) continue
    const normInjUrl = normalizeSkinUrl(inj.url)
    if (inj.id === 'steve' || normInjUrl === DEFAULT_SKINS[0].url) {
      continue
    }
    const found = localCache.find((s) => s.url === normInjUrl)
    if (found) {
      if (inj.state === 'active') found.state = 'active'
      if (inj.name) found.name = inj.name
    } else {
      localCache.unshift({
        id: inj.id || ('skin_' + Date.now().toString(36)),
        url: normInjUrl,
        name: inj.name,
        state: inj.state || 'inactive',
        variant: 'classic'
      })
    }
  }

  // Si un skin est actif, tous les autres doivent être inactive
  const isAnyCustomActive = localCache.some((s) => s.state === 'active' && s.url === effectiveActiveUrl)
  if (isAnyCustomActive) {
    localCache = localCache.map((s) => ({
      ...s,
      state: s.url === effectiveActiveUrl ? 'active' : 'inactive'
    }))
  }

  try {
    fs.writeFileSync(skinPath(), JSON.stringify(localCache, null, 2))
  } catch (_) {}

  // Déterminer l'état de Steve
  const isSteveActive = effectiveActiveUrl === DEFAULT_SKINS[0].url || !isAnyCustomActive

  const trailingDefaults: (ISkin & { name?: string })[] = [
    {
      ...DEFAULT_SKINS[0],
      name: 'Steve',
      state: isSteveActive ? 'active' : 'inactive'
    }
  ]

  return [...localCache, ...trailingDefaults]
}

async function appendSkin(...skins: (ISkin & { name?: string })[]) {
  const normalizedSkins = skins
    .filter((s) => s && s.url && s.id !== 'steve' && s.url !== DEFAULT_SKINS[0].url)
    .map((s) => ({
      ...s,
      url: normalizeSkinUrl(s.url),
      variant: 'classic' as const
    }))
  const activeSkin = normalizedSkins.find((s) => s.state === 'active')

  if (!fs.existsSync(skinPath())) {
    try {
      fs.writeFileSync(skinPath(), JSON.stringify(normalizedSkins, null, 2))
    } catch (err: any) {
      logger.error('Failed to write skin to cache:', err)
    }
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(skinPath(), 'utf-8') || '[]') as (ISkin & { name?: string })[]
      const seen = new Set<string>()
      let existing: (ISkin & { name?: string })[] = []

      for (const s of raw) {
        if (!s || !s.url) continue
        const norm = normalizeSkinUrl(s.url)
        if (s.id === 'steve' || norm === DEFAULT_SKINS[0].url || seen.has(norm)) continue
        seen.add(norm)
        existing.push({
          ...s,
          url: norm,
          state: activeSkin ? 'inactive' : s.state
        })
      }

      for (const item of normalizedSkins) {
        const found = existing.find((e) => e.url === item.url)
        if (found) {
          found.state = item.state
          if (item.name) found.name = item.name
        } else {
          existing.unshift(item)
        }
      }

      fs.writeFileSync(skinPath(), JSON.stringify(existing, null, 2))
    } catch (err: any) {
      logger.error('Failed to update skin cache:', err)
    }
  }
}
