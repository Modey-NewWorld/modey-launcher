import { showAccueil, showServers, showProfile, showSettings, setActiveNav } from '../../../router'
import { confirmLogout } from '../../../services/auth'
import { homeState } from '../state'
import '../sidebar.scss'
import './userCard.scss'

const el = (id: string) => document.getElementById(id)

export function updateCurrentProfileName(profile: any) {
  const currentProfileName = el('current-profile-name')
  if (!currentProfileName) return
  const iconUrl = profile?.modey?.iconUrl
  const iconImg = iconUrl
    ? `<img src="${iconUrl}" style="width:16px; height:16px; object-fit:contain; border-radius:3px; margin-right:6px; vertical-align:middle;" />`
    : ''
  currentProfileName.innerHTML = `${iconImg}${profile.name}`
}

export function renderDropdown(onSelectProfile: (profile: any) => void) {
  const profileDropdown = el('profile-dropdown')
  if (!profileDropdown) return
  profileDropdown.innerHTML = homeState.allProfiles
    .map((p) => {
      const iconUrl = p.modey?.iconUrl
      const iconImg = iconUrl
        ? `<img src="${iconUrl}" style="width:18px; height:18px; object-fit:contain; border-radius:4px; margin-right:8px; vertical-align:middle;" />`
        : `<i class="fa-solid fa-cube" style="margin-right:8px; opacity:0.7;"></i>`
      return `
        <div class="profile-option ${homeState.selectedProfile?.id === p.id ? 'active' : ''}" data-id="${p.id}" style="display:flex; align-items:center;">
          ${iconImg} <span>${p.name}</span>
        </div>
      `
    })
    .join('')

  profileDropdown.querySelectorAll('.profile-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.id
      const profile = homeState.allProfiles.find((p) => p.id === id)
      if (profile) onSelectProfile(profile)
      el('profile-selector')?.classList.remove('open')
    })
  })
}

function closeUserMenu() {
  el('user-menu')?.classList.remove('open')
  el('user-card')?.classList.remove('open')
}

/** Nav principale, sélecteur de profil, menu utilisateur + fermeture extérieure. */
export function bindSidebar() {
  el('nav-home')?.addEventListener('click', () => {
    showAccueil()
    el('modey-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
  })
  el('nav-servers')?.addEventListener('click', showServers)
  el('nav-profile')?.addEventListener('click', showProfile)

  el('user-card')?.addEventListener('click', (e) => {
    e.stopPropagation()
    el('user-menu')?.classList.toggle('open')
    el('user-card')?.classList.toggle('open')
  })
  el('user-menu-profile')?.addEventListener('click', () => {
    closeUserMenu()
    showProfile()
  })
  el('user-menu-settings')?.addEventListener('click', () => {
    closeUserMenu()
    showSettings()
  })
  el('user-menu-logout')?.addEventListener('click', async () => {
    closeUserMenu()
    await confirmLogout()
  })

  el('profile-selector')?.querySelector('.selected-profile')?.addEventListener('click', () => {
    el('profile-selector')?.classList.toggle('open')
  })

  document.body.addEventListener('click', (e) => {
    const profileSelector = el('profile-selector')
    const userMenu = el('user-menu')
    const userCard = el('user-card')
    if (!profileSelector?.contains(e.target as Node)) profileSelector?.classList.remove('open')
    if (!userMenu?.contains(e.target as Node) && !userCard?.contains(e.target as Node)) closeUserMenu()
  })

  setActiveNav(el('nav-home'))
}
