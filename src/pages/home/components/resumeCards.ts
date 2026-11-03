import { solarIcon as solar } from '../../../components/icon'
import { showServers } from '../../../router'
import { startLaunch } from '../../../services/launch'
import { isComingSoonProfile, isMaintenanceProfile, isDisabledProfile } from '../../../services/profiles'
import { bannerCache } from '../../../services/bannerCache'
import { homeState } from '../state'
import { getLastPlayedServer, getServerHistory } from './serverHistory'
import { checkIsAdmin } from './hero'
import bgImage from '../../../static/images/bg-thumb.webp'

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

function renderResume(onSelectProfile: (profile: any) => void) {
  const container = document.getElementById('resume-container')
  if (!container) return

  const last = getLastPlayedServer()
  const current = homeState.selectedProfile || homeState.allProfiles[0]
  const targetProfile = last
    ? homeState.allProfiles.find((p) => p.slug === last.slug || p.name === last.name) || current
    : current

  const serverName = targetProfile?.name || last?.name || 'Athéna'
  const timeText = last ? formatRelativeTime(last.playedAt) : 'Prêt à jouer'
  const banner = (targetProfile?.slug && bannerCache.getBanner(targetProfile.slug)) || bgImage

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

  let playLabel = 'Rejoindre'
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
      <div class="resume-card-header">
        <div class="resume-card-thumb" style="background-image: url('${banner}')"></div>
        <div class="resume-card-meta">
          <div class="resume-card-title">${serverName}</div>
          <div class="resume-card-time">${timeText}</div>
        </div>
        <div class="resume-card-status">
          <span class="status-dot ${dotClass}"></span>
          <span>${statusText}</span>
        </div>
      </div>
      <div class="resume-card-actions">
        <button class="btn-resume-play ${disabled ? 'btn-disabled' : ''} ${isAdmin && (isSoon || isMaint || isDisabled) ? 'btn-admin-bypass' : ''}" id="btn-resume-play" ${disabled ? 'disabled' : ''}>
          ${solar(playIcon, "bold")} ${playLabel}
        </button>
        <button class="btn-resume-change" id="btn-resume-change">Changer de serveur</button>
      </div>
    </div>
  `

  document.getElementById('btn-resume-play')?.addEventListener('click', () => {
    if (targetProfile) onSelectProfile(targetProfile)
    startLaunch()
  })

  document.getElementById('btn-resume-change')?.addEventListener('click', () => {
    showServers()
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

  const cardsHtml = history
    .slice(0, 3)
    .map((item) => {
      const banner = bannerCache.getBanner(item.slug) || bgImage
      return `
        <div class="history-server-mini-card" data-slug="${item.slug}">
          <div class="mini-card-thumb" style="background-image: url('${banner}')"></div>
          <div class="mini-card-body">
            <div class="mini-card-title">${item.name}</div>
            <div class="mini-card-time">
              <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-clock-bold"></use></svg>
              <span>${formatRelativeTime(item.playedAt)}</span>
            </div>
            <div class="mini-card-status">
              <span class="status-dot online"></span>
              <span>En ligne</span>
            </div>
          </div>
        </div>
      `
    })
    .join('')

  const exploreMoreHtml = `
    <div class="history-server-mini-card history-server-add-card" id="btn-history-explore-more">
      <div class="add-card-circle">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-add-bold"></use></svg>
      </div>
      <div class="add-card-title">Explorer d'autres serveurs</div>
      <div class="add-card-arrow">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-arrow-right-bold"></use></svg>
      </div>
    </div>
  `

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
