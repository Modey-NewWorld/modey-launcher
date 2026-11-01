import { isComingSoonProfile, isMaintenanceProfile, isDisabledProfile } from '../../../services/profiles'
import { pingServer, targetFor } from '../../../services/serverStatus'
import { getUser } from '../../../state'
import { launcherConfig } from '../../../services/launcherConfig'
import { bannerCache } from '../../../services/bannerCache'
import bgImage from '../../../static/images/bg.png'

const ATHENA_TAGS = ['Europe (FR)', 'Survie', 'Villes', 'Aventure', 'Communauté']
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
  const serverMeta = launcherConfig.getServer(serverSlug) || (isSoon ? launcherConfig.getFreeBuild() : launcherConfig.getAthena())

  const profileKey = profile?.id ?? 'default'
  const cachedStatus = serverStatusCache[profileKey]
  const isOffline = cachedStatus !== undefined && !cachedStatus.online && !isSoon

  const heroVersion = el('hero-version')
  if (heroVersion) {
    const mc = profile?.modey?.minecraftVersion || serverMeta?.minecraftVersion || '1.21.1'
    heroVersion.innerHTML = `<i class="fa-solid fa-cube"></i>&nbsp;${mc}`
  }

  const heroEl = el('hero')
  if (heroEl) {
    const remoteBanner = profile?.modey?.bannerUrl || serverMeta?.bannerUrl
    const effectiveBanner = bannerCache.getBanner(serverSlug, remoteBanner) || bgImage
    heroEl.style.background = `linear-gradient(180deg, rgba(15, 23, 42, 0.15) 0%, rgba(15, 23, 42, 0.88) 80%), url('${effectiveBanner}') center / cover no-repeat, #1e293b`
  }

  const heroTitle = el('hero-title')
  if (heroTitle) {
    heroTitle.innerHTML = `<i class="fa-solid fa-crown" style="color: #fbbf24; margin-right: 10px;"></i>${profile?.name ?? serverMeta?.name ?? (isSoon ? 'Free Build' : 'Athéna')}`
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
    const modeyTags = profile?.modey?.tags || serverMeta?.tags
    const tags = modeyTags && modeyTags.length > 0 ? modeyTags : isSoon ? ['Créatif', 'Plots', 'Schématiques', 'Concours'] : ATHENA_TAGS
    heroTags.innerHTML = tags.map((t: string) => `<span class="hero-tag">${t}</span>`).join('')
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
  let heroIcon = 'fa-play'
  let heroDisabled = false
  let heroBypass = false

  let sidebarLabel = `Jouer à ${srvName}`
  let sidebarIcon = 'fa-play'
  let sidebarDisabled = false

  if (isSoon) {
    if (isAdmin) {
      heroLabel = 'Bientôt • Lancer (Staff)'
      heroIcon = 'fa-hourglass-start'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Bientôt • Lancer (Staff)'
      sidebarIcon = 'fa-hourglass-start'
      sidebarDisabled = false
    } else {
      heroLabel = 'Bientôt disponible'
      heroIcon = 'fa-hourglass-start'
      heroDisabled = true

      sidebarLabel = 'Bientôt disponible'
      sidebarIcon = 'fa-hourglass-start'
      sidebarDisabled = true
    }
  } else if (isMaint) {
    if (isAdmin) {
      heroLabel = 'Maintenance (Staff)'
      heroIcon = 'fa-wrench'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Maintenance • Lancer (Staff)'
      sidebarIcon = 'fa-wrench'
      sidebarDisabled = false
    } else {
      heroLabel = 'En maintenance'
      heroIcon = 'fa-wrench'
      heroDisabled = true

      sidebarLabel = 'En maintenance'
      sidebarIcon = 'fa-wrench'
      sidebarDisabled = true
    }
  } else if (isDisabled) {
    if (isAdmin) {
      heroLabel = 'Désactivé (Staff)'
      heroIcon = 'fa-ban'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Désactivé • Lancer (Staff)'
      sidebarIcon = 'fa-ban'
      sidebarDisabled = false
    } else {
      heroLabel = 'Désactivé'
      heroIcon = 'fa-ban'
      heroDisabled = true

      sidebarLabel = 'Désactivé'
      sidebarIcon = 'fa-ban'
      sidebarDisabled = true
    }
  } else if (isOffline) {
    if (isAdmin) {
      heroLabel = 'Hors ligne (Staff)'
      heroIcon = 'fa-triangle-exclamation'
      heroDisabled = false
      heroBypass = true

      sidebarLabel = 'Hors ligne • Lancer (Staff)'
      sidebarIcon = 'fa-triangle-exclamation'
      sidebarDisabled = false
    } else {
      heroLabel = 'Serveur hors ligne'
      heroIcon = 'fa-triangle-exclamation'
      heroDisabled = true

      sidebarLabel = 'Serveur hors ligne'
      sidebarIcon = 'fa-triangle-exclamation'
      sidebarDisabled = true
    }
  }

  const playHeroBtn = el('btn-play-hero') as HTMLButtonElement | null
  if (playHeroBtn) {
    playHeroBtn.innerHTML = `<i class="fa-solid ${heroIcon}"></i>&nbsp;&nbsp;${heroLabel}`
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
    sidebarBtn.innerHTML = `<i class="fa-solid ${sidebarIcon}"></i><span>${sidebarLabel}</span>`
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

  const resumeBtn = el('btn-resume-play') as HTMLButtonElement | null
  if (resumeBtn) {
    const resumeText = heroLabel === `Jouer à ${srvName}` ? 'Rejoindre' : heroLabel
    resumeBtn.innerHTML = `<i class="fa-solid ${heroIcon}"></i> ${resumeText}`
    if (heroDisabled) {
      resumeBtn.setAttribute('disabled', 'true')
      resumeBtn.classList.add('btn-disabled')
      resumeBtn.classList.remove('btn-admin-bypass')
    } else {
      resumeBtn.removeAttribute('disabled')
      resumeBtn.classList.remove('btn-disabled')
      if (heroBypass) resumeBtn.classList.add('btn-admin-bypass')
      else resumeBtn.classList.remove('btn-admin-bypass')
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
  if (playerCount) playerCount.innerHTML = '<i class="fa-solid fa-users"></i>&nbsp;—'

  if (isSoon) {
    if (serverStatusDot) serverStatusDot.className = 'status-dot soon'
    if (serverStatusText) serverStatusText.innerText = 'Bientôt'
    if (playerCount) playerCount.innerHTML = '<i class="fa-solid fa-users"></i>&nbsp;0/40'
    renderHero(profile)
    return
  }

  if (isMaint) {
    if (serverStatusDot) serverStatusDot.className = 'status-dot maint'
    if (serverStatusText) serverStatusText.innerText = 'Maintenance'
    if (playerCount) playerCount.innerHTML = '<i class="fa-solid fa-wrench"></i>&nbsp;Maintenance'
    renderHero(profile)
    return
  }

  if (isDisabled) {
    if (serverStatusDot) serverStatusDot.className = 'status-dot offline'
    if (serverStatusText) serverStatusText.innerText = 'Désactivé'
    if (playerCount) playerCount.innerHTML = '<i class="fa-solid fa-ban"></i>&nbsp;Désactivé'
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
      playerCount.innerHTML = `<i class="fa-solid fa-users"></i>&nbsp;${probe.status.players.online}/${probe.status.players.max}`
    }
  } else {
    if (serverStatusDot) serverStatusDot.className = 'status-dot offline'
    if (serverStatusText) serverStatusText.innerText = 'Hors ligne'
    if (playerCount) playerCount.innerHTML = '<i class="fa-solid fa-signal"></i>&nbsp;—'
  }

  renderHero(profile)
}
