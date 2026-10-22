import { showAccueil, showServers, showProfile, showSettings, setActiveNav } from '../../../router'
import { confirmLogout } from '../../../services/auth'
import { launcherConfig } from '../../../services/launcherConfig'
import { homeState } from '../state'
import '../sidebar.scss'
import './userCard.scss'

const el = (id: string) => document.getElementById(id)

function getProfileIconHtml(profile: any, size: number = 18): string {
  const slug = profile?.slug || 'athena'
  const meta = launcherConfig.getServer(slug)
  const iconUrl = profile?.modey?.iconUrl || meta?.iconUrl

  if (iconUrl) {
    return `<img src="${iconUrl}" style="width:${size}px; height:${size}px; object-fit:contain; border-radius:4px; margin-right:8px; vertical-align:middle;" />`
  }

  const iconName = profile?.modey?.launcherIcon || meta?.launcherIcon || (slug === 'athena' ? 'shield-halved' : (slug === 'free-build' ? 'wand-magic-sparkles' : 'cube'))
  return `<i class="fa-solid fa-${iconName}" style="width:${size}px; text-align:center; margin-right:8px; font-size:${size - 3}px; opacity:0.85; color:var(--primary);"></i>`
}

export function updateCurrentProfileName(profile: any) {
  const currentProfileName = el('current-profile-name')
  if (!currentProfileName) return
  const slug = profile?.slug || 'athena'
  const meta = launcherConfig.getServer(slug)
  const iconHtml = getProfileIconHtml(profile, 16)
  currentProfileName.innerHTML = `${iconHtml}${profile?.name || meta?.name || 'Athéna'}`
}

export function renderDropdown(onSelectProfile: (profile: any) => void) {
  const profileDropdown = el('profile-dropdown')
  if (!profileDropdown) return
  profileDropdown.innerHTML = homeState.allProfiles
    .map((p) => {
      const slug = p.slug || 'athena'
      const meta = launcherConfig.getServer(slug)
      const iconHtml = getProfileIconHtml(p, 18)
      return `
        <div class="profile-option ${homeState.selectedProfile?.id === p.id ? 'active' : ''}" data-id="${p.id}" style="display:flex; align-items:center;">
          ${iconHtml} <span>${p.name || meta?.name}</span>
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
