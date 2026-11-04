import { Dialog } from '../../components/dialog'
import { showAccueil } from '../../router'
import { pingServer, athenaTarget } from '../../services/serverStatus'
import { homeState } from '../home/state'
import { launcherConfig } from '../../services/launcherConfig'
import { openDiscordInvite } from '../../services/discord'
import serversHtml from './index.html?raw'
import './servers.scss'

import bgAthena from '../../static/images/bg.webp'
import cardAthena from '../../static/images/servers/card-athena.webp'
import bannerValloria from '../../static/images/servers/card-valloria.webp'
import bannerBuildCity from '../../static/images/servers/card-buildcity.webp'
import bannerSurvival from '../../static/images/servers/card-survival.webp'

const el = (id: string) => document.getElementById(id)

// Insertion au DOM si nécessaire
const mount = el('view-home')
if (mount && !el('servers-page')) mount.insertAdjacentHTML('beforeend', serversHtml)

export interface ServerItem {
  id: string
  slug: string
  name: string
  iconSvg: string
  subtitle: string
  location: string
  version: string
  pingMs: number
  playersOnline: number
  playersMax: number
  online: boolean
  description: string
  tags: string[]
  bannerUrl: string
  detailBannerUrl: string
  websiteUrl?: string
  isOfficial: boolean
}

const SERVERS_DATA: ServerItem[] = [
  {
    id: 'athena',
    slug: 'athena',
    name: 'Athéna',
    iconSvg: `<svg class="solar-icon solar-bold server-icon-gold" aria-hidden="true"><use href="#solar-crown-bold"></use></svg>`,
    subtitle: 'Europe (FR) • 1.21.1',
    location: 'Europe (France)',
    version: '1.21.1',
    pingMs: 5,
    playersOnline: 0,
    playersMax: 40,
    online: true,
    description: "Un monde vivant centré sur l'aventure communautaire et la construction de cités prospères. Fonde ta ville, commerce et écris ton histoire.",
    tags: ['Survie', 'Villes', 'Aventure', 'Communauté', 'Économie'],
    bannerUrl: cardAthena,
    detailBannerUrl: bgAthena,
    websiteUrl: 'https://modey.fr',
    isOfficial: true
  },
  {
    id: 'valloria',
    slug: 'valloria',
    name: 'Valloria',
    iconSvg: `<svg class="server-custom-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 6l7 12H3L8 9.5l3 4.5L14 6z"/></svg>`,
    subtitle: 'Europe (FR) • 1.21.1',
    location: 'Europe (France)',
    version: '1.21.1',
    pingMs: 12,
    playersOnline: 0,
    playersMax: 30,
    online: true,
    description: "Explore un monde riche en paysages et en secrets. Découvre des donjons, des villages et relève des défis en solo ou en équipe.",
    tags: ['Survie', 'Aventure', 'Donjons', 'Exploration'],
    bannerUrl: bannerValloria,
    detailBannerUrl: bannerValloria,
    websiteUrl: 'https://modey.fr',
    isOfficial: true
  },
  {
    id: 'buildcity',
    slug: 'free-build',
    name: 'BuildCity',
    iconSvg: `<svg class="server-custom-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3L2 8v2h20V8L12 3zm-7 9v6h2v-6H5zm5 0v6h4v-6h-4zm7 0v6h2v-6h-2zM2 20v2h20v-2H2z"/></svg>`,
    subtitle: 'Europe (FR) • 1.21.1',
    location: 'Europe (France)',
    version: '1.21.1',
    pingMs: 8,
    playersOnline: 0,
    playersMax: 20,
    online: true,
    description: "Un mode 100% construction, sans limite ! Laisse libre cours à ton imagination et bâtis ta ville de rêve avec la communauté.",
    tags: ['Créatif', 'Construction', 'Communauté'],
    bannerUrl: bannerBuildCity,
    detailBannerUrl: bannerBuildCity,
    websiteUrl: 'https://modey.fr',
    isOfficial: true
  },
  {
    id: 'survival_plus',
    slug: 'survival-plus',
    name: 'Survival+',
    iconSvg: `<svg class="server-custom-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.92 5L5 6.92l4.88 4.88-1.41 1.41-1.42-.71-1.41 1.41 2.12 2.12L3 20.78l1.22 1.22 4.75-4.75 2.12 2.12 1.41-1.41-.71-1.42 1.41-1.41 4.88 4.88L20 18.08l-4.88-4.88 1.41-1.41 1.42.71 1.41-1.41-2.12-2.12L22 4.22 20.78 3l-4.75 4.75-2.12-2.12-1.41 1.41.71 1.42-1.41 1.41L6.92 5z"/></svg>`,
    subtitle: 'Europe (FR) • 1.21.1',
    location: 'Europe (France)',
    version: '1.21.1',
    pingMs: 15,
    playersOnline: 0,
    playersMax: 25,
    online: true,
    description: "Survis, explore, améliore ton équipement et progresse dans un monde plus difficile et plus réaliste.",
    tags: ['Survie', 'Hardcore', 'Économie', 'Coop'],
    bannerUrl: bannerSurvival,
    detailBannerUrl: bannerSurvival,
    websiteUrl: 'https://modey.fr',
    isOfficial: true
  }
]

let activeFilterTag = 'all'
let searchQuery = ''
let sortMode = 'popularity'
let selectedServerId = 'athena'
let onSelectProfileCallback: ((profile: any) => void) | null = null

function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getLatencySignalSvg() {
  return `<svg class="latency-signal" viewBox="0 0 16 12" width="13" height="11" fill="currentColor"><rect x="0" y="9" width="3" height="3" rx="1"/><rect x="4.5" y="6" width="3" height="6" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>`
}

/** Met à jour la latence et les joueurs pour Athéna via le probe live */
export async function refreshAthenaCard() {
  const athena = SERVERS_DATA.find((s) => s.id === 'athena')
  if (!athena) return

  const athenaProfile = homeState.allProfiles.find((p) => p.slug === 'athena')
  const athenaMeta = launcherConfig.getAthena()
  if (athenaProfile && athenaMeta) {
    if (athenaMeta.teaser?.description) {
      athena.description = athenaMeta.teaser.description
    }
  }

  const t = athenaTarget(homeState.allProfiles)
  try {
    const probe = await pingServer(t.host, t.port)
    if (probe.online && probe.status) {
      athena.online = true
      athena.pingMs = probe.pingMs || 5
      athena.playersOnline = probe.status.players.online
      athena.playersMax = probe.status.players.max
    } else {
      athena.online = false
      athena.pingMs = 0
      athena.playersOnline = 0
    }
  } catch {
    // Garde les valeurs par défaut
  }

  updateOnlineBadge()
  renderCards()
  if (selectedServerId === 'athena') {
    renderInspector(athena)
  }
}

function updateOnlineBadge() {
  const counterEl = el('servers-online-counter')
  if (!counterEl) return
  const onlineCount = SERVERS_DATA.filter((s) => s.online).length
  counterEl.textContent = onlineCount <= 1 ? `${onlineCount} serveur en ligne` : `${onlineCount} serveurs en ligne`
}

function getFilteredAndSortedServers(): ServerItem[] {
  let list = [...SERVERS_DATA]

  // Filtre de tag
  if (activeFilterTag !== 'all') {
    const targetTag = normalizeTag(activeFilterTag)
    list = list.filter((s) => s.tags.some((t) => normalizeTag(t) === targetTag))
  }

  // Filtre de recherche texte
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim()
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    )
  }

  // Tri
  if (sortMode === 'players') {
    list.sort((a, b) => b.playersOnline - a.playersOnline)
  } else if (sortMode === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  // 'popularity' conserve l'ordre de SERVERS_DATA par défaut

  return list
}

function renderCards() {
  const grid = el('servers-cards-grid')
  if (!grid) return

  const servers = getFilteredAndSortedServers()
  if (servers.length === 0) {
    grid.innerHTML = `
      <div class="servers-empty-state">
        <svg class="solar-icon solar-linear" aria-hidden="true"><use href="#solar-magnifier-linear"></use></svg>
        <p>Aucun serveur ne correspond à votre recherche.</p>
      </div>
    `
    return
  }

  grid.innerHTML = servers
    .map((s) => {
      const isSelected = s.id === selectedServerId
      const statusClass = s.online ? 'online' : 'offline'
      const statusText = s.online ? 'En ligne' : 'Hors ligne'
      const pingText = s.online ? `${s.pingMs} ms` : '—'

      const tagsHtml = s.tags
        .map((tag) => `<span class="server-tag-chip">${tag}</span>`)
        .join('')

      return `
        <article class="server-card-item ${isSelected ? 'is-selected' : ''}" data-server-id="${s.id}">
          <div class="card-banner" style="background-image: url('${s.bannerUrl}')">
            <div class="card-banner-overlay"></div>
            <div class="card-banner-top">
              <span class="card-badge card-badge-status">
                <span class="status-dot ${statusClass}"></span>&nbsp;${statusText}
              </span>
              <span class="card-badge card-badge-players">
                <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>&nbsp;${s.playersOnline}/${s.playersMax}
              </span>
            </div>
          </div>
          <div class="card-content">
            <div class="card-header-row">
              <div class="card-title-group">
                <span class="card-icon">${s.iconSvg}</span>
                <div>
                  <h3 class="card-name">${s.name}</h3>
                  <span class="card-subtitle">${s.subtitle}</span>
                </div>
              </div>
              <div class="card-latency text-green">
                ${getLatencySignalSvg()}
                <span>${pingText}</span>
              </div>
            </div>
            <p class="card-description">${s.description}</p>
            <div class="card-tags-list">
              ${tagsHtml}
            </div>
            <div class="card-footer-row">
              <button class="btn-card-join" data-action="join" data-server-id="${s.id}">
                <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-play-bold"></use></svg>
                <span>Rejoindre</span>
              </button>
              <button class="btn-card-details" data-action="details" data-server-id="${s.id}">
                <span>Voir les détails</span>
                <span class="arrow-right">→</span>
              </button>
            </div>
          </div>
        </article>
      `
    })
    .join('')

  // Bind clicks
  grid.querySelectorAll('.server-card-item').forEach((card) => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const joinBtn = target.closest('[data-action="join"]')
      const serverId = card.getAttribute('data-server-id')
      if (!serverId) return

      const server = SERVERS_DATA.find((s) => s.id === serverId)
      if (!server) return

      if (joinBtn) {
        handleJoinServer(server)
        return
      }

      // Sélectionne le serveur et affiche l'inspecteur
      selectedServerId = server.id
      renderCards()
      renderInspector(server)
    })
  })
}

function renderInspector(server: ServerItem) {
  const bannerEl = el('inspector-banner')
  const badgeStatus = el('inspector-badge-status')
  const badgePlayersCount = el('inspector-players-count')
  const iconEl = el('inspector-server-icon')
  const nameEl = el('inspector-server-name')
  const subEl = el('inspector-server-sub')
  const tagsEl = el('inspector-tags')

  const latencyValEl = el('inspector-latency-text')
  const playersValEl = el('inspector-players-text')
  const versionValEl = el('inspector-version-text')

  const descEl = el('inspector-description')
  const locEl = el('inspector-info-location')
  const verEl = el('inspector-info-version')
  const plEl = el('inspector-info-players')
  const latEl = el('inspector-info-latency')

  if (bannerEl) {
    bannerEl.style.backgroundImage = `linear-gradient(180deg, rgba(15, 23, 42, 0.2) 0%, rgba(15, 23, 42, 0.75) 100%), url('${server.detailBannerUrl}')`
  }

  if (badgeStatus) {
    badgeStatus.innerHTML = `<span class="status-dot ${server.online ? 'online' : 'offline'}"></span>&nbsp;${server.online ? 'En ligne' : 'Hors ligne'}`
  }
  if (badgePlayersCount) {
    badgePlayersCount.textContent = `${server.playersOnline}/${server.playersMax}`
  }

  if (iconEl) iconEl.innerHTML = server.iconSvg
  if (nameEl) nameEl.textContent = server.name
  if (subEl) subEl.textContent = server.subtitle

  if (tagsEl) {
    tagsEl.innerHTML = server.tags.map((t) => `<span class="inspector-tag-chip">${t}</span>`).join('')
  }

  if (latencyValEl) latencyValEl.textContent = server.online ? `${server.pingMs} ms` : '—'
  if (playersValEl) playersValEl.textContent = `${server.playersOnline} / ${server.playersMax}`
  if (versionValEl) versionValEl.textContent = server.version

  if (descEl) descEl.textContent = server.description
  if (locEl) locEl.textContent = server.location
  if (verEl) verEl.textContent = server.version
  if (plEl) plEl.textContent = `${server.playersOnline} / ${server.playersMax}`
  if (latEl) latEl.textContent = server.online ? `${server.pingMs} ms` : '—'
}

async function handleJoinServer(server: ServerItem) {
  // Recherche du profil correspondant (Athéna ou FreeBuild)
  const profile = homeState.allProfiles.find(
    (p) => p.slug === server.slug || p.slug === server.id || (server.slug === 'free-build' && p.slug?.includes('free-build'))
  )

  if (profile && onSelectProfileCallback) {
    onSelectProfileCallback(profile)
    showAccueil()
    el('modey-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  // Si le serveur est en cours de déploiement / prochainement disponible
  await Dialog.show(
    `${server.name} — Serveur Officiel Modey\n\nCe serveur sera directement accessible très prochainement !\n\nEn attendant, rejoins notre serveur principal Athéna ou notre Discord officiel pour être tenu informé.`,
    [{ text: 'Compris', type: 'ok' }]
  )
}

export function initServers(hooks: { onSelectProfile: (profile: any) => void }) {
  onSelectProfileCallback = hooks.onSelectProfile

  // Search input
  const searchInput = el('servers-search-input') as HTMLInputElement | null
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value
    renderCards()
  })

  // Filter pills
  const filterContainer = el('servers-filter-tags')
  filterContainer?.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      filterContainer.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'))
      pill.classList.add('active')
      activeFilterTag = pill.getAttribute('data-tag') || 'all'
      renderCards()
    })
  })

  // Sort dropdown
  const sortSelect = el('servers-sort-select') as HTMLSelectElement | null
  sortSelect?.addEventListener('change', () => {
    sortMode = sortSelect.value
    renderCards()
  })

  // Inspector CTA Join button
  el('btn-inspector-join')?.addEventListener('click', () => {
    const server = SERVERS_DATA.find((s) => s.id === selectedServerId)
    if (server) handleJoinServer(server)
  })

  // Discord button
  el('btn-shortcut-discord')?.addEventListener('click', () => {
    openDiscordInvite()
  })

  // Website button
  el('btn-shortcut-website')?.addEventListener('click', () => {
    const server = SERVERS_DATA.find((s) => s.id === selectedServerId)
    const url = server?.websiteUrl || 'https://modey.fr'
    window.open(url, '_blank')
  })

  // Premier rendu
  updateOnlineBadge()
  renderCards()
  const initialServer = SERVERS_DATA.find((s) => s.id === selectedServerId) || SERVERS_DATA[0]
  renderInspector(initialServer)

  // Ping live d'Athéna
  refreshAthenaCard()
}
