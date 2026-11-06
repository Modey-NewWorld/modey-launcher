import { solarIcon as solar } from '../../../components/icon'
import { showServers } from '../../../router'
import { startLaunch } from '../../../services/launch'
import { isComingSoonProfile, isMaintenanceProfile, isDisabledProfile } from '../../../services/profiles'
import { getCachedServerInfo, setCachedServerInfo, pingServer, getServerTarget } from '../../../services/serverStatus'
import { bannerCache } from '../../../services/bannerCache'
import { homeState } from '../state'
import { getLastPlayedServer, getServerHistory } from './serverHistory'
import { checkIsAdmin } from './hero'
import bgImage from '../../../static/images/bg-thumb.webp'
import cardAthena from '../../../static/images/servers/card-athena.webp'
import { BRAND } from '../../../config/brand'
import { launcherConfig } from '../../../services/launcherConfig'

const KNOWN_SOLAR_ICONS = new Set([
  'server', 'shield', 'crown', 'sparkles', 'rocket', 'box',
  'compass', 'bolt', 'star', 'gamepad', 'cup'
])

export function renderResumeAndHistory(onSelectProfile: (profile: any) => void) {
  renderResume(onSelectProfile)
  renderHistory(onSelectProfile)
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 60) return "À l'instant"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `Il y a ${diffMin} min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `Il y a ${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `Il y a ${diffDays}j`
}

function getTargetServerIconUrl(profile: any, slug: string): string {
  const meta = launcherConfig.getServer(slug)
  const rawUrl = profile?.iconUrl || profile?.modey?.iconUrl || meta?.iconUrl
  if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:'))) {
    return rawUrl
  }
  if (rawUrl && rawUrl.startsWith('/')) {
    return `${BRAND.apiUrl}${rawUrl}`
  }
  return `${BRAND.apiUrl}/api/servers/${slug}/icon`
}


function getTargetServerBanner(profile: any, slug: string, name?: string): string {
  const meta = launcherConfig.getServer(slug)
  const isAthena =
    slug === 'athena' ||
    slug === 'modey-athena' ||
    profile?.slug === 'athena' ||
    profile?.id === 'modey-athena' ||
    (name && (name.toLowerCase().includes('athéna') || name.toLowerCase().includes('athena'))) ||
    profile?.name?.toLowerCase()?.includes('athéna') ||
    profile?.name?.toLowerCase()?.includes('athena')

  const remoteUrl = profile?.bannerUrl || profile?.modey?.bannerUrl || meta?.bannerUrl
  if (remoteUrl) {
    const cached = bannerCache.getBanner(slug, remoteUrl)
    if (cached) return cached
  }

  if (isAthena) {
    return cardAthena
  }

  return bgImage
}

function renderResume(onSelectProfile: (profile: any) => void) {
  const container = document.getElementById('resume-container')
  if (!container) return

  const defaultPlayable = homeState.allProfiles.find((p) => p.slug === 'athena') || homeState.allProfiles[0]
  const last = getLastPlayedServer()
  const targetProfile = last
    ? homeState.allProfiles.find((p) => p.slug === last.slug || p.name === last.name) || defaultPlayable
    : defaultPlayable

  const serverName = targetProfile?.name || last?.name || 'Athéna'
  const timeText = last ? formatRelativeTime(last.playedAt) : 'Prêt à jouer'
  const targetSlug = targetProfile?.slug || last?.slug || 'athena'
  const meta = launcherConfig.getServer(targetSlug)
  const isAthena =
    targetSlug === 'athena' ||
    targetSlug === 'modey-athena' ||
    targetProfile?.slug === 'athena' ||
    targetProfile?.id === 'modey-athena' ||
    serverName.toLowerCase().includes('athéna') ||
    serverName.toLowerCase().includes('athena')
  const hasCustomIcon = Boolean(targetProfile?.iconUrl || targetProfile?.modey?.iconUrl || meta?.iconUrl)
  const rawSolarIcon = isAthena
    ? 'crown'
    : (targetProfile?.modey?.launcherIcon || meta?.launcherIcon || 'server')
  const solarIconName = KNOWN_SOLAR_ICONS.has(rawSolarIcon.toLowerCase().trim()) ? rawSolarIcon.toLowerCase().trim() : (isAthena ? 'crown' : 'server')
  const iconUrl = getTargetServerIconUrl(targetProfile, targetSlug)

  const isSoon = isComingSoonProfile(targetProfile)
  const isMaint = isMaintenanceProfile(targetProfile)
  const isDisabled = isDisabledProfile(targetProfile)
  const isAdmin = checkIsAdmin()

  let statusText = 'En ligne'
  let dotClass = 'online'
  if (isSoon) {
    statusText = 'Bientôt'
    dotClass = 'soon'
  } else if (isMaint) {
    statusText = 'Maintenance'
    dotClass = 'maint'
  } else if (isDisabled) {
    statusText = 'Désactivé'
    dotClass = 'offline'
  }

  let playLabel = `Jouer à ${serverName}`
  let playIcon = 'play'
  let disabled = false

  if (isSoon) {
    if (isAdmin) {
      playLabel = 'Bientôt • Lancer (Staff)'
      playIcon = 'hourglass'
      disabled = false
    } else {
      playLabel = 'Bientôt disponible'
      playIcon = 'hourglass'
      disabled = true
    }
  } else if (isMaint) {
    if (isAdmin) {
      playLabel = 'Maintenance • Lancer (Staff)'
      playIcon = 'tuning'
      disabled = false
    } else {
      playLabel = 'En maintenance'
      playIcon = 'tuning'
      disabled = true
    }
  } else if (isDisabled) {
    if (isAdmin) {
      playLabel = 'Désactivé • Lancer (Staff)'
      playIcon = 'forbidden'
      disabled = false
    } else {
      playLabel = 'Serveur désactivé'
      playIcon = 'forbidden'
      disabled = true
    }
  }

  container.innerHTML = `
    <div class="resume-card-box">
      <div class="resume-card-top">
        <div class="resume-card-thumb">
          ${hasCustomIcon ? `<img src="${iconUrl}" alt="${serverName}" class="resume-card-icon-img" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />` : ''}
          <div class="resume-card-icon-fallback" style="${hasCustomIcon ? 'display: none;' : 'display: flex;'}">
            ${solar(solarIconName, 'bold')}
          </div>
        </div>
        <div class="resume-card-info">
          <div class="resume-card-title">${serverName}</div>
          <div class="resume-card-status">
            <span class="status-dot ${dotClass}"></span>
            <span>${statusText}</span>
          </div>
          <div class="resume-card-time">
            ${solar('clock', 'bold')}
            <span>${timeText}</span>
          </div>
        </div>
      </div>
      <div class="resume-card-actions">
        <button class="btn-resume-play ${disabled ? 'btn-disabled' : ''} ${isAdmin && (isSoon || isMaint || isDisabled) ? 'btn-admin-bypass' : ''}" id="btn-resume-play" ${disabled ? 'disabled' : ''}>
          ${solar(playIcon, 'bold')} <span>${playLabel}</span>
        </button>
      </div>
    </div>
  `

  document.getElementById('btn-resume-play')?.addEventListener('click', () => {
    if (targetProfile) onSelectProfile(targetProfile)
    startLaunch()
  })
}

function renderHistory(onSelectProfile: (profile: any) => void) {
  const container = document.getElementById('history-servers-container')
  if (!container) return

  const history = getServerHistory()
  const countBadge = document.getElementById('history-count-badge')
  if (countBadge) {
    countBadge.innerText = `${history.length} serveur${history.length > 1 ? 's' : ''}`
  }

  if (history.length === 0) {
    container.innerHTML = `
      <div class="history-empty-state">
        <div class="history-empty-icon">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-history-bold"></use></svg>
        </div>
        <div class="history-empty-text">Aucun serveur joué récemment</div>
        <button type="button" class="btn-history-discover" id="btn-history-discover-empty">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-compass-bold"></use></svg>
          <span>Explorer les mondes</span>
        </button>
      </div>
    `
    document.getElementById('btn-history-discover-empty')?.addEventListener('click', () => {
      showServers()
    })
    return
  }

  const currentSlug = homeState.selectedProfile?.slug || 'athena'

  const cardsHtml = history
    .slice(0, 3)
    .map((item) => {
      const profile = homeState.allProfiles.find((p) => p.slug === item.slug || p.name?.toLowerCase() === item.slug?.toLowerCase())
      const meta = launcherConfig.getServer(item.slug)
      const serverName = profile?.name || meta?.name || item.name || item.slug
      const targetSlug = profile?.slug || item.slug
      const isAthena =
        targetSlug === 'athena' ||
        targetSlug === 'modey-athena' ||
        profile?.slug === 'athena' ||
        profile?.id === 'modey-athena' ||
        serverName.toLowerCase().includes('athéna') ||
        serverName.toLowerCase().includes('athena')
      const hasCustomIcon = Boolean(profile?.iconUrl || profile?.modey?.iconUrl || meta?.iconUrl)
      const rawSolarIcon = isAthena
        ? 'crown'
        : (profile?.modey?.launcherIcon || meta?.launcherIcon || 'server')
      const solarIconName = KNOWN_SOLAR_ICONS.has(rawSolarIcon.toLowerCase().trim()) ? rawSolarIcon.toLowerCase().trim() : (isAthena ? 'crown' : 'server')
      const isCrown = solarIconName === 'crown' || isAthena
      const iconUrl = getTargetServerIconUrl(profile, targetSlug)
      const banner = getTargetServerBanner(profile, targetSlug, serverName)
      const isCurrent = currentSlug === targetSlug

      // Statut réel et joueurs du profil
      const isSoon = isComingSoonProfile(profile)
      const isMaint = isMaintenanceProfile(profile)
      const isDisabled = isDisabledProfile(profile)
      const cached = getCachedServerInfo(targetSlug) || (targetSlug === 'athena' ? getCachedServerInfo('modey-athena') : null)

      let dotClass = 'online'
      let statusLabel = 'En ligne'
      let playersText = cached && cached.online ? `${cached.playersOnline}/${cached.playersMax}` : '0/40'

      if (isSoon) {
        dotClass = 'soon'
        statusLabel = 'Arrive bientôt'
        playersText = '—'
      } else if (isMaint) {
        dotClass = 'maint'
        statusLabel = 'Maintenance'
        playersText = '—'
      } else if (isDisabled) {
        dotClass = 'offline'
        statusLabel = 'Désactivé'
        playersText = '—'
      } else if (cached && !cached.online) {
        dotClass = 'offline'
        statusLabel = 'Hors ligne'
        playersText = '—'
      }

      // Sonde d'arrière-plan si non présent en cache
      if (!isSoon && !isMaint && !isDisabled && !cached) {
        const t = getServerTarget(homeState.allProfiles, targetSlug)
        const host = profile?.server?.host || profile?.ip || t.host
        const port = profile?.server?.port || profile?.port || t.port || 25565
        pingServer(host, port).then((probe) => {
          if (probe.online && probe.status) {
            setCachedServerInfo(targetSlug, {
              online: true,
              playersOnline: probe.status.players.online,
              playersMax: probe.status.players.max,
              pingMs: probe.pingMs
            })
            const elPlayers = document.querySelector(`.history-server-mini-card[data-slug="${targetSlug}"] .mini-card-badge-players`)
            const elStatus = document.querySelector(`.history-server-mini-card[data-slug="${targetSlug}"] .mini-card-badge-status`)
            if (elPlayers) {
              elPlayers.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>&nbsp;${probe.status.players.online}/${probe.status.players.max}`
            }
            if (elStatus) {
              elStatus.innerHTML = `<span class="status-dot online"></span>&nbsp;En ligne`
            }
          }
        }).catch(() => {})
      }

      return `
        <div class="history-server-mini-card ${isCurrent ? 'is-active-server' : ''}" data-slug="${targetSlug}" title="Sélectionner ${serverName}">
          <div class="mini-card-thumb" style="background-image: url('${banner}')">
            <div class="mini-card-badges-top">
              <span class="mini-card-badge mini-card-badge-status">
                <span class="status-dot ${dotClass}"></span>&nbsp;${statusLabel}
              </span>
              <span class="mini-card-badge mini-card-badge-players">
                <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>&nbsp;${playersText}
              </span>
            </div>
            <div class="mini-card-icon-badge">
              ${hasCustomIcon ? `<img src="${iconUrl}" alt="${serverName}" class="mini-card-icon-img" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />` : ''}
              <div class="mini-card-icon-fallback" style="${hasCustomIcon ? 'display: none;' : 'display: flex;'}">
                <svg class="solar-icon solar-bold ${isCrown ? 'server-icon-gold' : ''}" aria-hidden="true"><use href="#solar-${solarIconName}-bold"></use></svg>
              </div>
            </div>
          </div>
          <div class="mini-card-body">
            <div class="mini-card-title" title="${serverName}">${serverName}</div>
            <div class="mini-card-time">
              <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-clock-bold"></use></svg>
              <span>${formatRelativeTime(item.playedAt)}</span>
            </div>
          </div>
        </div>
      `
    })
    .join('')

  const exploreMoreHtml = history.length < 3 ? `
    <div class="history-server-mini-card history-server-add-card" id="btn-history-explore-more" title="Explorer tous les mondes">
      <div class="add-card-plus">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-add-bold"></use></svg>
      </div>
      <div class="add-card-title">Explorer d'autres serveurs</div>
    </div>
  ` : ''

  container.innerHTML = cardsHtml + exploreMoreHtml

  container.querySelectorAll('.history-server-mini-card:not(.history-server-add-card)').forEach((node) => {
    node.addEventListener('click', () => {
      const slug = (node as HTMLElement).dataset.slug
      const target = homeState.allProfiles.find((p) => p.slug === slug || p.name?.toLowerCase() === slug?.toLowerCase())
      if (target) {
        onSelectProfile(target)
      } else {
        showServers()
      }
    })
  })

  document.getElementById('btn-history-explore-more')?.addEventListener('click', () => {
    showServers()
  })
}
