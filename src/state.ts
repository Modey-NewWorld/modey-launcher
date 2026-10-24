import type { Account, IAvatar, ICape, ISkin } from 'eml-lib'
import logger from 'electron-log/renderer'
import shared from './shared'

export type ViewName = 'loading' | 'login' | 'home' | 'settings'
export type BlockingViewName = 'maintenance' | 'update'

export function getUser() {
  return shared.account
}

export async function setUser(account: Account, assets: { skins: ISkin[] | null; capes: ICape[] | null; avatar: IAvatar | null }) {
  shared.account = account
  shared.skins = assets.skins
  shared.capes = assets.capes
  shared.avatar = assets.avatar
  await updateUserInterface()
}

export function logout() {
  shared.account = null
  shared.skins = null
  shared.capes = null
  shared.avatar = null
  const nameEl = document.getElementById('user-name')
  if (nameEl) nameEl.innerText = ''
}

export async function updateAvatarFromSkinUrl(skinUrl: string) {
  if (!skinUrl) return
  try {
    const res = await fetch(skinUrl)
    const blob = await res.blob()
    const img = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    const size = 128
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    // Tête de base (8,8 8x8)
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size)
    // Couche chapeau / casque (40,8 8x8)
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size)
    const avatarUrl = canvas.toDataURL('image/png')
    shared.avatar = { id: shared.account?.uuid ?? 'user', url: avatarUrl }

    // Mettre à jour immédiatement les éléments DOM de photo de profil
    const homeAvatar = document.getElementById('user-avatar') as HTMLImageElement | null
    const profileAvatar = document.getElementById('profile-id-avatar') as HTMLImageElement | null
    if (homeAvatar) homeAvatar.src = avatarUrl
    if (profileAvatar) profileAvatar.src = avatarUrl
  } catch (err) {
    logger.warn('Failed to generate avatar from skin:', err)
  }
}

export async function updateUserInterface() {
  if (!shared.account || !shared.skins) return

  logger.log('Updating UI for user:', shared.account.name)

  const nameEl = document.getElementById('user-name')
  const avatarEl = document.getElementById('user-avatar') as HTMLImageElement
  const userCardEl = document.getElementById('user-card')
  const roleBadgeEl = document.getElementById('user-role-badge')

  if (nameEl) nameEl.innerText = shared.account.name
  if (avatarEl) avatarEl.src = shared.avatar?.url ?? 'https://minotar.net/avatar/steve/256.png'

  // Si un skin actif existe, synchroniser l'avatar immédiatement depuis sa texture
  const activeSkin = shared.skins?.find((s) => s.state === 'active')
  if (activeSkin?.url) {
    updateAvatarFromSkinUrl(activeSkin.url).catch(() => {})
  }

  const rawRole = ((shared.account as any)?.role || 'citizen').toLowerCase()
  const roleLabels: Record<string, string> = {
    founder: 'Fondateur',
    admin: 'Admin',
    moderator: 'Modérateur',
    developer: 'Développeur',
    dev: 'Développeur',
    builder: 'Builder',
    citizen: 'Citoyen'
  }
  const displayRole = roleLabels[rawRole] || (rawRole.charAt(0).toUpperCase() + rawRole.slice(1))

  if (userCardEl) {
    userCardEl.setAttribute('data-role', rawRole)
  }
  if (roleBadgeEl) {
    roleBadgeEl.innerText = displayRole
    roleBadgeEl.setAttribute('data-role', rawRole)
    roleBadgeEl.className = `modey-role-badge role-${rawRole}`
  }

  shared.resetMainView()
  shared.resetSkinViews()
  shared.resetCapesViews()
}

export function setView(view: ViewName) {
  document.body.classList.add('loaded')
  document.querySelector('div#view-loading')?.classList.add('loaded')

  const target = document.querySelector(`.view[data-view="${view}"]`) as HTMLElement
  if (!target) return logger.error(`View ${view} not found`)

  const isOverlay = target.classList.contains('overlay')

  if (!isOverlay) {
    document.querySelectorAll('.view').forEach((el) => {
      if (!el.classList.contains('overlay')) {
        el.classList.remove('active')
      }
    })
  }

  target.classList.add('active')
}

export function setBlockingView(view: BlockingViewName) {
  document.body.classList.add('loaded')
  setTimeout(() => {
    document.querySelector('div#view-loading')?.classList.add('loaded')
  }, 200)
  setTimeout(() => {
    document.querySelector(`div#view-${view}`)?.classList.add('loaded')
  }, 100)
}

export function clearBlockingView(view?: BlockingViewName) {
  document.body.classList.add('loaded')
  document.querySelector('div#view-loading')?.classList.add('loaded')
  if (view) {
    document.querySelector(`div#view-${view}`)?.classList.remove('loaded')
  } else {
    document.querySelectorAll('.maintenance, .update').forEach((el) => el.classList.remove('loaded'))
  }
}
