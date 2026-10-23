import { app, ipcMain } from 'electron'
import { type Account, type ISkin, Skin } from 'eml-lib'
import path from 'node:path'
import fs from 'node:fs'
import logger from 'electron-log/main'
import { IPC } from '../ipc-channels'

let skin: Skin | null = null
const skinPath = path.join(app.getPath('userData'), 'skins.json')
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
        const url = (skin as any)?.account?.meta?.url
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
      if (fs.existsSync(skinPath)) {
        try {
          const cached = (JSON.parse(fs.readFileSync(skinPath, 'utf-8') || '[]') as (ISkin & { name?: string })[])
            .map((s) => ({ ...s, state: 'inactive' as const }))
          fs.writeFileSync(skinPath, JSON.stringify(cached, null, 2))
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

    // Cas 2 : Sélection d'un skin personnalisé déjà présent dans le casier ou import
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
      await skin.updateSkin(skinSource, 'classic')
    } catch (err: any) {
      logger.error('Failed to update skin:', err)
      return null
    }

    const fetched = ((await skin.getSkin()) as ISkin[])
    const activeFromServer = fetched.find((s) => s.state === 'active') || fetched[0]
    const activeUrl = activeFromServer ? activeFromServer.url : (typeof source === 'string' ? source : '')
    const customSkinId = 'skin_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6)

    const newSkins = [
      {
        id: customSkinId,
        url: activeUrl,
        state: 'active' as const,
        variant: 'classic' as const
      }
    ]

    await appendSkin(...newSkins)

    return await getSkins(true, newSkins)
  })

  ipcMain.handle(IPC.skin.deleteSkin, async (_event, id: string) => {
    if (!fs.existsSync(skinPath)) {
      return null
    }

    try {
      const data = JSON.parse(fs.readFileSync(skinPath, 'utf-8')) as (ISkin & { name?: string })[]
      const target = data.find((s) => s.id === id)
      const isActive = target?.state === 'active'

      // Supprimer le skin du fichier de cache
      let newSkins = data.filter((s) => s.id !== id)

      // Supprimer le fichier de skin sur le serveur Auth / Yggdrasil
      try {
        const token = (skin as any)?.account?.accessToken
        const url = (skin as any)?.account?.meta?.url
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

      fs.writeFileSync(skinPath, JSON.stringify(newSkins, null, 2))
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
    if (!fs.existsSync(skinPath)) {
      return null
    }

    try {
      const data = JSON.parse(fs.readFileSync(skinPath, 'utf-8')) as (ISkin & { name?: string })[]
      const cleanName = (name || '').trim()
      const updated = data.map((s) => {
        if (s.id === id) {
          return { ...s, name: cleanName }
        }
        return s
      })
      fs.writeFileSync(skinPath, JSON.stringify(updated, null, 2))
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

  if (!skipFetch && skin) {
    try {
      const data = (await skin.getSkin()) as ISkin[]
      const active = data.find((s) => s.state === 'active')
      if (active) serverActiveUrl = active.url
    } catch (err) {
      logger.warn('Failed to get server skins:', err)
    }
  }

  const injectedActive = inject.find((s) => s.state === 'active')
  const effectiveActiveUrl = injectedActive ? injectedActive.url : serverActiveUrl

  let localCache: (ISkin & { name?: string })[] = []
  try {
    if (fs.existsSync(skinPath)) {
      localCache = (JSON.parse(fs.readFileSync(skinPath, 'utf-8') || '[]') as (ISkin & { name?: string })[])
        .map((s) => ({
          id: s.id || ('skin_' + Math.random().toString(36).substring(2, 8)),
          url: s.url,
          name: s.name,
          state: effectiveActiveUrl
            ? (s.url === effectiveActiveUrl ? 'active' : 'inactive')
            : (s.state === 'active' ? 'active' : 'inactive'),
          variant: 'classic' as const
        }))
    }
  } catch (err) {
    logger.warn('Failed to read skins from cache:', err)
  }

  // Injecter les skins fournis en paramètre s'ils ne sont pas déjà dans le cache
  for (const inj of inject) {
    if (inj.id === 'steve' || inj.url === DEFAULT_SKINS[0].url) {
      continue
    }
    const found = localCache.find((s) => s.url === inj.url)
    if (found) {
      if (inj.state === 'active') found.state = 'active'
      if (inj.name) found.name = inj.name
    } else {
      localCache.unshift({
        id: inj.id || ('skin_' + Date.now().toString(36)),
        url: inj.url,
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
    fs.writeFileSync(skinPath, JSON.stringify(localCache, null, 2))
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
  const normalizedSkins = skins.map((s) => ({ ...s, variant: 'classic' as const }))
  const activeSkin = normalizedSkins.find((s) => s.state === 'active')
  if (!fs.existsSync(skinPath)) {
    try {
      fs.writeFileSync(skinPath, JSON.stringify(normalizedSkins, null, 2))
    } catch (err: any) {
      logger.error('Failed to write skin to cache:', err)
    }
  } else {
    try {
      let existing = (JSON.parse(fs.readFileSync(skinPath, 'utf-8') || '[]') as (ISkin & { name?: string })[])
        .map((s) => ({
          ...s,
          state: activeSkin ? 'inactive' as const : s.state
        }))

      for (const item of normalizedSkins) {
        const found = existing.find((e) => e.url === item.url)
        if (found) {
          found.state = item.state
          if (item.name) found.name = item.name
        } else {
          existing.unshift(item)
        }
      }

      fs.writeFileSync(skinPath, JSON.stringify(existing, null, 2))
    } catch (err: any) {
      logger.error('Failed to update skin cache:', err)
    }
  }
}

