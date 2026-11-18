import { refreshProfileIdentity, refreshProfileServer } from './pages/profile/profile'
import { syncStudioControls } from './pages/profile/components/studio3d'
import { applyServerSelection } from './pages/settings/settings'
import shared from './shared'

interface RouterHooks {
  onShowServers?: () => void
  onShowSettings?: () => void
}

let hooks: RouterHooks = {}

/** Les pages peuvent brancher un rafraîchissement à l'ouverture d'une page (fusion, pas d'écrasement). */
export function setRouterHooks(h: RouterHooks) {
  hooks = { ...hooks, ...h }
}

const el = (id: string) => document.getElementById(id)

export function setActiveNav(active: HTMLElement | null) {
  document.querySelectorAll('.modey-nav-item').forEach((item) => {
    item.classList.remove('active')
    const use = item.querySelector('use')
    if (use) {
      const href = use.getAttribute('href') || ''
      if (href.endsWith('-bold')) {
        use.setAttribute('href', href.replace('-bold', '-linear'))
      }
    }
  })
  if (active) {
    active.classList.add('active')
    const use = active.querySelector('use')
    if (use) {
      const href = use.getAttribute('href') || ''
      if (href.endsWith('-linear')) {
        use.setAttribute('href', href.replace('-linear', '-bold'))
      }
    }
  }
}

export function showAccueil() {
  closeSettings()
  shared.pauseStudio()
  setActiveNav(el('nav-home'))
  if (el('modey-main')) el('modey-main')!.style.display = 'flex'
  if (el('servers-page')) el('servers-page')!.style.display = 'none'
  if (el('profile-page')) el('profile-page')!.style.display = 'none'
}

export function showServers() {
  closeSettings()
  shared.pauseStudio()
  setActiveNav(el('nav-servers'))
  if (el('modey-main')) el('modey-main')!.style.display = 'none'
  if (el('servers-page')) el('servers-page')!.style.display = 'flex'
  if (el('profile-page')) el('profile-page')!.style.display = 'none'
  hooks.onShowServers?.()
}

export function showProfile() {
  closeSettings()
  setActiveNav(el('nav-profile'))
  if (el('modey-main')) el('modey-main')!.style.display = 'none'
  if (el('servers-page')) el('servers-page')!.style.display = 'none'
  if (el('profile-page')) el('profile-page')!.style.display = 'flex'
  refreshProfileIdentity()
  refreshProfileServer()
  shared.resumeStudio()
  syncStudioControls()
  el('profile-scroll')?.scrollTo({ top: 0 })
}

export function showSettings(serverSlug?: string) {
  shared.pauseStudio()

  // S'assurer qu'une vue principale reste visible en arrière-plan flouté
  if (el('modey-main')?.style.display === 'none' &&
      el('servers-page')?.style.display === 'none' &&
      el('profile-page')?.style.display === 'none') {
    if (el('modey-main')) el('modey-main')!.style.display = 'flex'
    setActiveNav(el('nav-home'))
  }

  const modal = el('settings-page')
  if (modal) {
    modal.style.display = 'flex'
  }
  hooks.onShowSettings?.()
  applyServerSelection(serverSlug || 'global')
}

export function closeSettings() {
  const modal = el('settings-page')
  if (modal) {
    modal.style.display = 'none'
  }
  // Reprendre le studio 3D si la page profil est active en arrière-plan
  if (el('profile-page')?.style.display === 'flex') {
    shared.resumeStudio()
  }
}

export function showServerSettings(serverSlug: string) {
  showSettings(serverSlug)
}
