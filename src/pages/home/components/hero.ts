import { solarIcon as solar } from '../../../components/icon'
import { isComingSoonProfile, isMaintenanceProfile, isDisabledProfile } from '../../../services/profiles'
import { pingServer, targetFor } from '../../../services/serverStatus'
import { getUser } from '../../../state'
import { launcherConfig, FALLBACK_MC_VERSION } from '../../../services/launcherConfig'
import { bannerCache } from '../../../services/bannerCache'
import bgImage from '../../../static/images/bg.webp'

const DEFAULT_TAGS = ['Survie', 'Communauté', 'Aventure']
const STAFF_ROLES = ['founder', 'admin', 'moderator', 'developer', 'dev']

const el = (id: string) => document.getElementById(id)

const serverStatusCache: Record<string, { online: boolean; timestamp: number }> = {}

export function checkIsAdmin(): boolean {
  const user = getUser() as any
  const role = (user?.role || 'citizen').toLowerCase()
  return STAFF_ROLES.includes(role)
}

export function renderHero(profile: any) {
  const isSoon = isComingSoonProfile(profile)
  const isMaint = isMaintenanceProfile(profile)
  const isDisabled = isDisabledProfile(profile)
  const isAdmin = checkIsAdmin()

  const serverSlug = profile?.slug || 'athena'
  const serverMeta = launcherConfig.getServer(serverSlug) || (isSoon ? launcherConfig.getFreeBuild() : launcherConfig.getDefaultServer())

  const profileKey = profile?.id ?? 'default'
  const cachedStatus = serverStatusCache[profileKey]
  const isOffline = cachedStatus !== undefined && !cachedStatus.online && !isSoon

  const officialBadge = el('hero-official-badge')
  if (officialBadge) {
    if (isSoon) {
      officialBadge.style.display = 'none'
    } else {
      officialBadge.style.display = 'inline-flex'
      officialBadge.innerText = 'Serveur officiel'
    }
  }

  const heroVersion = el('hero-version')
  if (heroVersion) {
    const mc = profile?.modey?.minecraftVersion || serverMeta?.minecraftVersion || FALLBACK_MC_VERSION
    heroVersion.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-box-bold"></use></svg>&nbsp;${mc}`
  }

  const heroEl = el('hero')
  if (heroEl) {
    const remoteBanner = profile?.modey?.bannerUrl || serverMeta?.bannerUrl
    const effectiveBanner = bannerCache.getBanner(serverSlug, remoteBanner) || bgImage
    heroEl.style.backgroundImage = `linear-gradient(180deg, rgba(15, 23, 42, 0.15) 0%, rgba(15, 23, 42, 0.88) 80%), url('${effectiveBanner}'), url('${bgImage}')`
    heroEl.style.backgroundSize = 'cover'
    heroEl.style.backgroundPosition = 'center'
    heroEl.style.backgroundRepeat = 'no-repeat'
    heroEl.style.backgroundColor = '#131B26'
    if (isSoon || isMaint || isDisabled || isOffline) {
      heroEl.classList.add('hero-unavailable')
    } else {
      heroEl.classList.remove('hero-unavailable')
    }
  }

  const heroTitle = el('hero-title')
  if (heroTitle) {
    const displayName = profile?.name || serverMeta?.name || (isSoon ? 'Free Build' : 'Athéna')
    heroTitle.innerHTML = `<svg class="solar-icon solar-bold" style="color: var(--founder-gold); margin-right: 10px;" aria-hidden="true"><use href="#solar-crown-bold"></use></svg>${displayName}`
  }

  const customDesc = profile?.modey?.teaser?.description || serverMeta?.teaser?.description
  const heroDesc = el('hero-desc')
  if (heroDesc) {
    if (customDesc) heroDesc.innerText = customDesc
    else if (isSoon) heroDesc.innerText = 'Le serveur créatif libre de Modey n\'est pas encore actif. Prépare tes idées : il ouvrira à tous les joueurs, sans whitelist.'
    else heroDesc.innerText = 'Un monde vivant centré sur l\'aventure communautaire et la construction de cités prospères. Fonde ta ville, commerce et écris ton histoire.'
  }

  const heroTags = el('hero-tags')
  if (heroTags) {
    const rawTags = profile?.modey?.tags !== undefined ? profile?.modey?.tags : serverMeta?.tags
    let tags: string[] = []
    if (Array.isArray(rawTags)) {
      tags = rawTags
    } else if (isSoon) {
      tags = ['Créatif', 'Plots', 'Schématiques', 'Concours']
    } else {
      tags = DEFAULT_TAGS
    }

    if (tags.length === 0) {
      heroTags.innerHTML = ''
      heroTags.style.display = 'none'
    } else {
      heroTags.style.display = 'flex'
      heroTags.innerHTML = tags.map((t: string) => `<span class="hero-tag">${t}</span>`).join('')
    }
  }

  applyPlayButtonState(profile, { isSoon, isMaint, isDisabled, isOffline, isAdmin })
}

function applyPlayButtonState(
  profile: any,
  state: { isSoon: boolean; isMaint: boolean; isDisabled: boolean; isOffline: boolean; isAdmin: boolean }
) {
  const { isSoon, isMaint, isDisabled, isOffline, isAdmin } = state

  const srvName = profile?.name ?? 'Athéna'

  let heroLabel = `Jouer à ${srvName}`
  let heroIcon = 'play'
  let heroDisabled = false
  let heroBypass = false

  let sidebarLabel = `Jouer à ${srvName}`
  let sidebarIcon = 'play'
  let sidebarDisabled = false

  if (isSoon) {
    if (isAdmin) {
      heroLabel = 'Bientôt • Lancer (Staff)'
      heroIcon = 'hourglass'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Bientôt • Lancer (Staff)'
      sidebarIcon = 'hourglass'
      sidebarDisabled = false
    } else {
      heroLabel = 'Bientôt disponible'
      heroIcon = 'hourglass'
      heroDisabled = true

      sidebarLabel = 'Bientôt disponible'
      sidebarIcon = 'hourglass'
      sidebarDisabled = true
    }
  } else if (isMaint) {
    if (isAdmin) {
      heroLabel = 'Maintenance (Staff)'
      heroIcon = 'tuning'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Maintenance • Lancer (Staff)'
      sidebarIcon = 'tuning'
      sidebarDisabled = false
    } else {
      heroLabel = 'En maintenance'
      heroIcon = 'tuning'
      heroDisabled = true

      sidebarLabel = 'En maintenance'
      sidebarIcon = 'tuning'
      sidebarDisabled = true
    }
  } else if (isDisabled) {
    if (isAdmin) {
      heroLabel = 'Désactivé (Staff)'
      heroIcon = 'forbidden'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Désactivé • Lancer (Staff)'
      sidebarIcon = 'forbidden'
      sidebarDisabled = false
    } else {
      heroLabel = 'Désactivé'
      heroIcon = 'forbidden'
      heroDisabled = true

      sidebarLabel = 'Désactivé'
      sidebarIcon = 'forbidden'
      sidebarDisabled = true
    }
  } else if (isOffline) {
    if (isAdmin) {
      heroLabel = 'Hors ligne (Staff)'
      heroIcon = 'danger'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Hors ligne • Lancer (Staff)'
      sidebarIcon = 'danger'
      sidebarDisabled = false
    } else {
      heroLabel = 'Serveur hors ligne'
      heroIcon = 'danger'
      heroDisabled = true

      sidebarLabel = 'Serveur hors ligne'
      sidebarIcon = 'danger'
      sidebarDisabled = true
    }
  }

  const playHeroBtn = el('btn-play-hero') as HTMLButtonElement | null
  if (playHeroBtn) {
    playHeroBtn.innerHTML = `${solar(heroIcon, 'bold')}&nbsp;&nbsp;<span>${heroLabel}</span>`
    if (heroDisabled) {
      playHeroBtn.setAttribute('disabled', 'true')
      playHeroBtn.classList.add('btn-disabled')
      playHeroBtn.classList.remove('btn-admin-bypass')
    } else {
      playHeroBtn.removeAttribute('disabled')
      playHeroBtn.classList.remove('btn-disabled')
      if (heroBypass) playHeroBtn.classList.add('btn-admin-bypass')
      else playHeroBtn.classList.remove('btn-admin-bypass')
    }
  }

  const sidebarBtn = el('btn-play') as HTMLButtonElement | null
  if (sidebarBtn) {
    sidebarBtn.innerHTML = `${solar(sidebarIcon, 'bold')}<span>${sidebarLabel}</span>`
    if (sidebarDisabled) {
      sidebarBtn.setAttribute('disabled', 'true')
      sidebarBtn.classList.add('btn-disabled')
      sidebarBtn.classList.remove('btn-admin-bypass')
    } else {
      sidebarBtn.removeAttribute('disabled')
      sidebarBtn.classList.remove('btn-disabled')
      if (heroBypass) sidebarBtn.classList.add('btn-admin-bypass')
      else sidebarBtn.classList.remove('btn-admin-bypass')
    }
  }


}

export async function updateServerStatus(profile: any) {
  const isSoon = isComingSoonProfile(profile)
  const isMaint = isMaintenanceProfile(profile)
  const isDisabled = isDisabledProfile(profile)

  const serverStatusDot = el('server-status-dot')
  const serverStatusText = el('server-status-text')
  const playerCount = el('player-count')

  if (serverStatusDot) serverStatusDot.className = 'status-dot pinging'
  if (serverStatusText) serverStatusText.innerText = 'Vérification...'
  if (playerCount) playerCount.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-friends-bold"></use></svg>&nbsp;—'

  if (isSoon) {
    if (serverStatusDot) serverStatusDot.className = 'status-dot soon'
    if (serverStatusText) serverStatusText.innerText = 'Bientôt'
    if (playerCount) playerCount.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-friends-bold"></use></svg>&nbsp;0/40'
    renderHero(profile)
    return
  }

  if (isMaint) {
    if (serverStatusDot) serverStatusDot.className = 'status-dot maint'
    if (serverStatusText) serverStatusText.innerText = 'Maintenance'
    if (playerCount) playerCount.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-tuning-bold"></use></svg>&nbsp;Maintenance'
    renderHero(profile)
    return
  }

  if (isDisabled) {
    if (serverStatusDot) serverStatusDot.className = 'status-dot offline'
    if (serverStatusText) serverStatusText.innerText = 'Désactivé'
    if (playerCount) playerCount.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-forbidden-bold"></use></svg>&nbsp;Désactivé'
    renderHero(profile)
    return
  }

  const t = targetFor(profile)
  const probe = await pingServer(t.host, t.port)

  const profileKey = profile?.id ?? 'default'
  serverStatusCache[profileKey] = { online: probe.online, timestamp: Date.now() }

  if (probe.online && probe.status) {
    if (serverStatusDot) serverStatusDot.className = 'status-dot online'
    if (serverStatusText) serverStatusText.innerText = 'En ligne'
    if (playerCount) {
      playerCount.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-friends-bold"></use></svg>&nbsp;${probe.status.players.online}/${probe.status.players.max}`
    }
  } else {
    if (serverStatusDot) serverStatusDot.className = 'status-dot offline'
    if (serverStatusText) serverStatusText.innerText = 'Hors ligne'
    if (playerCount) playerCount.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-signal-bold"></use></svg>&nbsp;—'
  }

  renderHero(profile)
}


export function initHeroGallery() {
  const thumbs = document.querySelectorAll<HTMLElement>('.hero-gallery-thumb')
  const nextBtn = document.getElementById('hero-gallery-next')
  if (!thumbs.length) return

  let activeIndex = 0
  const setActive = (idx: number) => {
    activeIndex = (idx + thumbs.length) % thumbs.length
    thumbs.forEach((t, i) => t.classList.toggle('active', i === activeIndex))
  }

  thumbs.forEach((t, idx) => {
    t.addEventListener('click', () => setActive(idx))
  })

  nextBtn?.addEventListener('click', () => setActive(activeIndex + 1))
}
