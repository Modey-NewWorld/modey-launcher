import { isComingSoonProfile, isMaintenanceProfile, isDisabledProfile, isAthenaProfile } from '../../../services/profiles'
import { pingServer, targetFor } from '../../../services/serverStatus'
import { getUser } from '../../../state'
import profileConfig from '../../../../config/athena-profile.json'
import freeBuildConfig from '../../../../config/free-build-profile.json'

const ATHENA_TAGS = ['Survie RP', 'Économie', 'Villes & Métropoles', 'Quêtes scénarisées']
const STAFF_ROLES = ['founder', 'admin', 'moderator', 'developer', 'dev']

const el = (id: string) => document.getElementById(id)

// Cache le dernier statut de probe pour le profil actif
const serverStatusCache: Record<string, { online: boolean; timestamp: number }> = {}

function checkIsAdmin(): boolean {
  const user = getUser() as any
  const role = (user?.role || 'citizen').toLowerCase()
  return STAFF_ROLES.includes(role)
}

export function renderHero(profile: any) {
  const isSoon = isComingSoonProfile(profile)
  const isMaint = isMaintenanceProfile(profile)
  const isDisabled = isDisabledProfile(profile)
  const isAdmin = checkIsAdmin()

  // Vérifier si le serveur est réputé hors-ligne via le cache de ping
  const profileKey = profile?.id ?? 'default'
  const cachedStatus = serverStatusCache[profileKey]
  const isOffline = cachedStatus !== undefined && !cachedStatus.online && !isSoon

  const heroVersion = el('hero-version')
  if (heroVersion) {
    const mc = isSoon ? freeBuildConfig.minecraftVersion : profileConfig.minecraftVersion
    const loader = isSoon ? freeBuildConfig.modLoader.version : profileConfig.modLoader.version
    heroVersion.innerHTML = `<i class="fa-solid fa-cube"></i>&nbsp;Minecraft ${mc} • NeoForge ${loader}`
  }

  const heroEl = el('hero')
  if (heroEl) {
    const customBanner = profile?.modey?.bannerUrl
    if (customBanner) {
      heroEl.style.background = `linear-gradient(180deg, rgba(10, 20, 40, 0.15) 0%, rgba(10, 20, 40, 0.82) 78%), url('${customBanner}') center / cover no-repeat, #24365c`
    } else {
      heroEl.style.background = `linear-gradient(180deg, rgba(10, 20, 40, 0.05) 0%, rgba(10, 20, 40, 0.55) 78%), url('/src/static/images/bg.png') center / cover no-repeat, #24365c`
    }
  }

  const heroTitle = el('hero-title')
  if (heroTitle) {
    const iconUrl = profile?.modey?.iconUrl
    const iconImg = iconUrl
      ? `<img src="${iconUrl}" style="width:26px; height:26px; object-fit:contain; border-radius:5px; vertical-align:middle; margin-right:8px; box-shadow:0 2px 6px rgba(0,0,0,0.4);" />`
      : ''
    heroTitle.innerHTML = `${iconImg}${profile?.name ?? (isSoon ? 'Free Build' : 'Athéna')}`
  }

  const customDesc = profile?.modey?.teaser?.description
  const heroDesc = el('hero-desc')
  if (heroDesc) {
    if (customDesc) heroDesc.innerText = customDesc
    else if (isSoon) heroDesc.innerText = freeBuildConfig.teaser.description
    else heroDesc.innerText = 'Un monde vivant. Des villes à construire. Une aventure à partager.'
  }

  const heroTags = el('hero-tags')
  if (heroTags) {
    const modeyTags = profile?.modey?.tags
    const tags = modeyTags && modeyTags.length > 0 ? modeyTags : isSoon ? (freeBuildConfig.teaser.features as { title: string }[]).map((f) => f.title) : ATHENA_TAGS
    heroTags.innerHTML = tags.map((t: string) => `<span class="hero-tag">${t}</span>`).join('')
  }

  const heroFoot = el('hero-foot-note')
  if (heroFoot) {
    if (isMaint) heroFoot.innerHTML = `<i class="fa-solid fa-wrench" style="color:#f59e0b"></i>&nbsp;${profile?.modey?.maintenanceMessage || 'Maintenance technique en cours'}${isAdmin ? ' • Accès Admin accordé' : ''}`
    else if (isSoon) heroFoot.innerHTML = `<i class="fa-solid fa-hourglass-half"></i>&nbsp;${freeBuildConfig.statusLabel} • Minecraft ${freeBuildConfig.minecraftVersion}`
    else if (isDisabled) heroFoot.innerHTML = `<i class="fa-solid fa-ban" style="color:#ef4444"></i>&nbsp;Lancement désactivé par l'administration${isAdmin ? ' • Accès Admin accordé' : ''}`
    else if (isOffline) heroFoot.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#ea580c"></i>&nbsp;Serveur hors ligne ou injoignable${isAdmin ? ' • Accès Admin accordé' : ''}`
    else heroFoot.innerHTML = `<i class="fa-solid fa-circle-check"></i>&nbsp;Prêt au lancement • Dernière version installée`
  }

  applyPlayButtonState(profile, { isSoon, isMaint, isDisabled, isOffline, isAdmin })
}

function applyPlayButtonState(
  profile: any,
  state: { isSoon: boolean; isMaint: boolean; isDisabled: boolean; isOffline: boolean; isAdmin: boolean }
) {
  const { isSoon, isMaint, isDisabled, isOffline, isAdmin } = state

  let playLabel = `Jouer à ${profile?.name ?? 'Athéna'}`
  let playIcon = 'fa-play'
  let disabled = false
  let adminBypass = false

  if (isSoon) {
    playLabel = 'Bientôt disponible'
    playIcon = 'fa-hourglass-half'
    disabled = true
  } else if (isMaint || isDisabled || isOffline) {
    if (isAdmin) {
      // Déblocage avec bouton orange pour le staff/admin
      adminBypass = true
      disabled = false
      if (isMaint) {
        playLabel = 'Maintenance • Lancer (Admin)'
        playIcon = 'fa-screwdriver-wrench'
      } else if (isDisabled) {
        playLabel = 'Désactivé • Lancer (Admin)'
        playIcon = 'fa-shield-halved'
      } else {
        playLabel = 'Hors-ligne • Lancer (Admin)'
        playIcon = 'fa-bolt'
      }
    } else {
      // Bloqué pour les joueurs normaux
      disabled = true
      if (isMaint) {
        playLabel = 'En maintenance'
        playIcon = 'fa-wrench'
      } else if (isDisabled) {
        playLabel = 'Serveur désactivé'
        playIcon = 'fa-ban'
      } else {
        playLabel = 'Serveur hors ligne'
        playIcon = 'fa-triangle-exclamation'
      }
    }
  }

  for (const btn of [el('btn-play'), el('btn-play-hero')]) {
    const b = btn as HTMLButtonElement | null
    if (!b) continue
    if (disabled) {
      b.setAttribute('disabled', 'true')
      b.classList.add('btn-disabled')
    } else {
      b.removeAttribute('disabled')
      b.classList.remove('btn-disabled')
    }

    if (adminBypass) {
      b.classList.add('btn-admin-bypass')
      b.title = 'Serveur en maintenance ou hors-ligne : lancement autorisé grâce à vos privilèges Staff / Admin.'
    } else {
      b.classList.remove('btn-admin-bypass')
      b.removeAttribute('title')
    }
  }

  const playBtn = el('btn-play')
  const playHeroBtn = el('btn-play-hero')
  if (playBtn) playBtn.innerHTML = `<i class="fa-solid ${playIcon}"></i><span>${playLabel}</span>`
  if (playHeroBtn) playHeroBtn.innerHTML = `<i class="fa-solid ${playIcon}"></i>&nbsp;&nbsp;${playLabel}`
}

export async function updateServerStatus(profile: any) {
  const statusDot = el('server-status-dot')
  const statusText = el('server-status-text')
  const playerCount = el('player-count')
  const heroStatus = el('hero-status')
  const profileKey = profile?.id ?? 'default'

  if (isComingSoonProfile(profile)) {
    if (statusDot) {
      statusDot.classList.remove('pinging', 'online')
      statusDot.classList.add('offline')
    }
    if (statusText) statusText.innerHTML = 'Bientôt disponible'
    if (heroStatus) heroStatus.title = freeBuildConfig.statusLabel
    if (playerCount) playerCount.innerHTML = ''
    serverStatusCache[profileKey] = { online: false, timestamp: Date.now() }
    renderHero(profile)
    return
  }

  if (statusDot) {
    statusDot.classList.remove('online', 'offline')
    statusDot.classList.add('pinging')
  }
  if (statusText) statusText.innerHTML = 'Vérification...'
  if (playerCount) playerCount.innerHTML = ''

  const target = targetFor(profile)
  const probe = await pingServer(target.host, target.port)
  const isOnline = Boolean(probe.online && probe.status)
  serverStatusCache[profileKey] = { online: isOnline, timestamp: Date.now() }

  if (isOnline && probe.status) {
    if (statusDot) {
      statusDot.classList.remove('pinging', 'offline')
      statusDot.classList.add('online')
    }
    if (statusText) statusText.innerHTML = `Disponible • v${profileConfig.minecraftVersion}`
    if (playerCount) {
      const occupantLabel = isAthenaProfile(profile) ? 'citoyens connectés' : 'joueurs connectés'
      playerCount.innerHTML = `${probe.status.players.online.toLocaleString()} / ${probe.status.players.max.toLocaleString()} ${occupantLabel}`
    }
  } else {
    if (statusDot) {
      statusDot.classList.remove('pinging', 'online')
      statusDot.classList.add('offline')
    }
    if (statusText) statusText.innerHTML = 'Hors ligne'
    if (playerCount) playerCount.innerHTML = ''
  }

  // Répercuter immédiatement l'état sur les boutons de lancement
  renderHero(profile)
}
