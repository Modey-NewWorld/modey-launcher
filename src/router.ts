import { refreshProfileIdentity, refreshProfileServer } from './pages/profile/profile'

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
  document.querySelectorAll('.modey-nav-item').forEach((el) => el.classList.remove('active'))
  active?.classList.add('active')
}

export function showAccueil() {
  setActiveNav(el('nav-home'))
  if (el('modey-main')) el('modey-main')!.style.display = 'flex'
  if (el('servers-page')) el('servers-page')!.style.display = 'none'
  if (el('profile-page')) el('profile-page')!.style.display = 'none'
  if (el('settings-page')) el('settings-page')!.style.display = 'none'
}

export function showServers() {
  setActiveNav(el('nav-servers'))
  if (el('modey-main')) el('modey-main')!.style.display = 'none'
  if (el('servers-page')) el('servers-page')!.style.display = 'flex'
  if (el('profile-page')) el('profile-page')!.style.display = 'none'
  if (el('settings-page')) el('settings-page')!.style.display = 'none'
  hooks.onShowServers?.()
}

export function showProfile() {
  setActiveNav(el('nav-profile'))
  if (el('modey-main')) el('modey-main')!.style.display = 'none'
  if (el('servers-page')) el('servers-page')!.style.display = 'none'
  if (el('settings-page')) el('settings-page')!.style.display = 'none'
  if (el('profile-page')) el('profile-page')!.style.display = 'flex'
  refreshProfileIdentity()
  refreshProfileServer()
  el('profile-scroll')?.scrollTo({ top: 0 })
}

export function showSettings() {
  if (el('modey-main')) el('modey-main')!.style.display = 'none'
  if (el('servers-page')) el('servers-page')!.style.display = 'none'
  if (el('profile-page')) el('profile-page')!.style.display = 'none'
  if (el('settings-page')) el('settings-page')!.style.display = 'flex'
  setActiveNav(null)
  hooks.onShowSettings?.()
}
