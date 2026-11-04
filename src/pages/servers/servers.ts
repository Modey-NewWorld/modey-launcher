import { Dialog } from '../../components/dialog'
import { showAccueil } from '../../router'
import { pingServer, getServerTarget } from '../../services/serverStatus'
import { homeState } from '../home/state'
import { launcherConfig } from '../../services/launcherConfig'
import { openDiscordInvite } from '../../services/discord'
import { isComingSoonProfile } from '../../services/profiles'
import serversHtml from './index.html?raw'
import './servers.scss'

import bgAthena from '../../static/images/bg.webp'

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
  pingMs: number | null
  playersOnline: number | null
  playersMax: number | null
  online: boolean
  isComingSoon: boolean
  description: string
  tags: string[]
  bannerUrl: string
  detailBannerUrl: string
  websiteUrl?: string
  isOfficial: boolean
  profileRef?: any
}

// Cache des pings réels (aucun faux ping / joueur inventé)
const pingLiveCache: Record<string, { online: boolean; pingMs: number; playersOnline: number; playersMax: number }> = {}

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
    .trim()
}

function getLatencySignalSvg() {
  return `<svg class="latency-signal" viewBox="0 0 16 12" width="13" height="11" fill="currentColor"><rect x="0" y="9" width="3" height="3" rx="1"/><rect x="4.5" y="6" width="3" height="6" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>`
}

/**
 * Construit dynamiquement la liste des serveurs à partir des profils réels
 * et des métadonnées du launcherConfig, sans jamais inventer de faux serveurs.
 */
function buildServersList(): ServerItem[] {
  const list: ServerItem[] = []
  const allProfiles = homeState.allProfiles || []
  const allConfigs = launcherConfig.getAllServers()
  const processedSlugs = new Set<string>()

  // 1. Profils issus de homeState
  for (const p of allProfiles) {
    const slug = p.slug || p.id
    if (!slug) continue
    processedSlugs.add(slug)

    const meta = launcherConfig.getServer(slug)
    const isComingSoon = isComingSoonProfile(p) || meta?.status === 'comingSoon'

    const tags: string[] = Array.isArray(p.tags) && p.tags.length > 0
      ? p.tags
      : (Array.isArray(p.modey?.tags) && p.modey.tags.length > 0
        ? p.modey.tags
        : (meta?.tags || []))

    const version = p.minecraftVersion || p.modey?.minecraftVersion || meta?.minecraftVersion || '1.21.1'
    const name = p.name || meta?.name || slug
    const subtitle = p.subtitle || meta?.subtitle || `Europe (FR) • ${version}`
    const location = p.location || p.modey?.location || meta?.location || 'Europe (France)'
    const description = p.description || p.modey?.description || meta?.teaser?.description || p.teaser?.description || p.subtitle || ''
    const banner = p.bannerUrl || p.modey?.bannerUrl || meta?.bannerUrl || bgAthena

    const iconName = p.modey?.launcherIcon || (meta ? meta.launcherIcon : undefined) || p.launcherIcon || (isComingSoon ? 'box' : 'crown')
    const solarIconRef = iconName === 'crown' ? '#solar-crown-bold' : (iconName === 'shield' ? '#solar-shield-bold' : (iconName === 'box' ? '#solar-box-bold' : '#solar-server-bold'))
    const iconSvg = `<svg class="solar-icon solar-bold ${iconName === 'crown' ? 'server-icon-gold' : ''}" aria-hidden="true"><use href="${solarIconRef}"></use></svg>`

    const cachedPing = pingLiveCache[slug]

    list.push({
      id: slug,
      slug,
      name,
      iconSvg,
      subtitle,
      location,
      version,
      pingMs: cachedPing?.pingMs ?? null,
      playersOnline: cachedPing?.playersOnline ?? null,
      playersMax: cachedPing?.playersMax ?? null,
      online: cachedPing?.online ?? false,
      isComingSoon,
      description,
      tags,
      bannerUrl: banner,
      detailBannerUrl: banner,
      websiteUrl: 'https://modey.fr',
      isOfficial: true,
      profileRef: p
    })
  }

  // 2. Serveurs configurés dans launcherConfig mais non encore chargés dans homeState
  for (const [slug, meta] of Object.entries(allConfigs)) {
    if (processedSlugs.has(slug)) continue
    processedSlugs.add(slug)

    const isComingSoon = meta.status === 'comingSoon'
    const version = meta.minecraftVersion || '1.21.1'
    const tags = meta.tags || []
    const banner = meta.bannerUrl || bgAthena

    const iconName = meta.launcherIcon || (isComingSoon ? 'box' : 'crown')
    const solarIconRef = iconName === 'crown' ? '#solar-crown-bold' : (iconName === 'shield' ? '#solar-shield-bold' : (iconName === 'box' ? '#solar-box-bold' : '#solar-server-bold'))
    const iconSvg = `<svg class="solar-icon solar-bold ${iconName === 'crown' ? 'server-icon-gold' : ''}" aria-hidden="true"><use href="${solarIconRef}"></use></svg>`

    const cachedPing = pingLiveCache[slug]

    list.push({
      id: slug,
      slug,
      name: meta.name || slug,
      iconSvg,
      subtitle: `Europe (FR) • ${version}`,
      location: meta.location || 'Europe (France)',
      version,
      pingMs: cachedPing?.pingMs ?? null,
      playersOnline: cachedPing?.playersOnline ?? null,
      playersMax: cachedPing?.playersMax ?? null,
      online: cachedPing?.online ?? false,
      isComingSoon,
      description: meta.teaser?.description || '',
      tags,
      bannerUrl: banner,
      detailBannerUrl: banner,
      websiteUrl: meta.mapUrl || 'https://modey.fr',
      isOfficial: true
    })
  }

  return list
}

/**
 * Ping réel des serveurs actifs
 */
async function probeLiveServers() {
  const servers = buildServersList()

  for (const s of servers) {
    if (s.isComingSoon) continue

    const t = getServerTarget(homeState.allProfiles, s.slug)
    const host = s.profileRef?.server?.host || s.profileRef?.ip || t.host
    const port = s.profileRef?.server?.port || s.profileRef?.port || t.port || 25565

    if (host) {
      try {
        const probe = await pingServer(host, port)
        if (probe.online && probe.status) {
          pingLiveCache[s.id] = {
            online: true,
            pingMs: probe.pingMs,
            playersOnline: probe.status.players.online,
            playersMax: probe.status.players.max
          }
        } else {
          pingLiveCache[s.id] = { online: false, pingMs: 0, playersOnline: 0, playersMax: 0 }
        }
      } catch {
        pingLiveCache[s.id] = { online: false, pingMs: 0, playersOnline: 0, playersMax: 0 }
      }
    }
  }

  updateDisplay()
}

/**
 * Génère dynamiquement les filtres de catégories selon les tags des serveurs réels
 */
function updateCategoryPills(servers: ServerItem[]) {
  const container = el('servers-filter-tags')
  if (!container) return

  const allTags: string[] = []
  for (const s of servers) {
    for (const t of s.tags) {
      if (!allTags.some((ex) => normalizeTag(ex) === normalizeTag(t))) {
        allTags.push(t)
      }
    }
  }

  const tagsList = ['Tous', ...allTags]
  container.innerHTML = tagsList
    .map((tag) => {
      const isAll = tag === 'Tous'
      const tagSlug = isAll ? 'all' : normalizeTag(tag)
      const isActive = activeFilterTag === tagSlug
      return `<button class="filter-pill ${isActive ? 'active' : ''}" data-tag="${tagSlug}">${tag}</button>`
    })
    .join('')

  container.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'))
      pill.classList.add('active')
      activeFilterTag = pill.getAttribute('data-tag') || 'all'
      renderCards()
    })
  })
}

function updateOnlineCounter(servers: ServerItem[]) {
  const counterEl = el('servers-online-counter')
  if (!counterEl) return
  const onlineCount = servers.filter((s) => s.online).length
  counterEl.textContent = onlineCount <= 1 ? `${onlineCount} serveur en ligne` : `${onlineCount} serveurs en ligne`
}

function getFilteredAndSortedServers(servers: ServerItem[]): ServerItem[] {
  let list = [...servers]

  // Filtre par catégorie (tag)
  if (activeFilterTag !== 'all') {
    const targetTag = normalizeTag(activeFilterTag)
    list = list.filter((s) => s.tags.some((t) => normalizeTag(t) === targetTag))
  }

  // Filtre par texte
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
    list.sort((a, b) => (b.playersOnline || 0) - (a.playersOnline || 0))
  } else if (sortMode === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return list
}

function renderCards() {
  const grid = el('servers-cards-grid')
  if (!grid) return

  const allServers = buildServersList()
  const servers = getFilteredAndSortedServers(allServers)

  if (servers.length === 0) {
    grid.innerHTML = `
      <div class="servers-empty-state">
        <svg class="solar-icon solar-linear" aria-hidden="true"><use href="#solar-magnifier-linear"></use></svg>
        <p>Aucun serveur ne correspond à votre sélection.</p>
      </div>
    `
    return
  }

  grid.innerHTML = servers
    .map((s) => {
      const isSelected = s.id === selectedServerId
      let statusHtml = ''
      let playersHtml = ''
      let pingHtml = ''
      let joinBtnHtml = ''

      if (s.isComingSoon) {
        statusHtml = `<span class="card-badge card-badge-status"><span class="status-dot coming-soon"></span>&nbsp;Arrive bientôt</span>`
        playersHtml = `<span class="card-badge card-badge-players"><svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>&nbsp;—</span>`
        pingHtml = `<span>—</span>`
        joinBtnHtml = `
          <button class="btn-card-join" data-action="join" data-server-id="${s.id}">
            <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-check-bold"></use></svg>
            <span>Sélectionner</span>
          </button>
        `
      } else if (s.online) {
        statusHtml = `<span class="card-badge card-badge-status"><span class="status-dot online"></span>&nbsp;En ligne</span>`
        playersHtml = `<span class="card-badge card-badge-players"><svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>&nbsp;${s.playersOnline ?? 0}/${s.playersMax ?? 40}</span>`
        pingHtml = `${getLatencySignalSvg()}<span>${s.pingMs ?? 0} ms</span>`
        joinBtnHtml = `
          <button class="btn-card-join" data-action="join" data-server-id="${s.id}">
            <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-play-bold"></use></svg>
            <span>Rejoindre</span>
          </button>
        `
      } else {
        statusHtml = `<span class="card-badge card-badge-status"><span class="status-dot offline"></span>&nbsp;Hors ligne</span>`
        playersHtml = `<span class="card-badge card-badge-players"><svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>&nbsp;—</span>`
        pingHtml = `<span>—</span>`
        joinBtnHtml = `
          <button class="btn-card-join" data-action="join" data-server-id="${s.id}">
            <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-play-bold"></use></svg>
            <span>Rejoindre</span>
          </button>
        `
      }

      const tagsHtml = s.tags.map((tag) => `<span class="server-tag-chip">${tag}</span>`).join('')

      return `
        <article class="server-card-item ${isSelected ? 'is-selected' : ''}" data-server-id="${s.id}">
          <div class="card-banner" style="background-image: url('${s.bannerUrl}')">
            <div class="card-banner-overlay"></div>
            <div class="card-banner-top">
              ${statusHtml}
              ${playersHtml}
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
                ${pingHtml}
              </div>
            </div>
            <p class="card-description">${s.description}</p>
            <div class="card-tags-list">
              ${tagsHtml}
            </div>
            <div class="card-footer-row">
              ${joinBtnHtml}
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

  grid.querySelectorAll('.server-card-item').forEach((card) => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const joinBtn = target.closest('[data-action="join"]')
      const serverId = card.getAttribute('data-server-id')
      if (!serverId) return

      const servers = buildServersList()
      const server = servers.find((s) => s.id === serverId)
      if (!server) return

      if (joinBtn) {
        handleJoinServer(server)
        return
      }

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

  const joinBtn = el('btn-inspector-join')

  if (bannerEl) {
    bannerEl.style.backgroundImage = `linear-gradient(180deg, rgba(15, 23, 42, 0.2) 0%, rgba(15, 23, 42, 0.75) 100%), url('${server.detailBannerUrl}')`
  }

  if (badgeStatus) {
    if (server.isComingSoon) {
      badgeStatus.innerHTML = `<span class="status-dot coming-soon"></span>&nbsp;Arrive bientôt`
    } else if (server.online) {
      badgeStatus.innerHTML = `<span class="status-dot online"></span>&nbsp;En ligne`
    } else {
      badgeStatus.innerHTML = `<span class="status-dot offline"></span>&nbsp;Hors ligne`
    }
  }

  if (badgePlayersCount) {
    badgePlayersCount.textContent = server.isComingSoon
      ? '—'
      : (server.online ? `${server.playersOnline}/${server.playersMax}` : '—')
  }

  if (iconEl) iconEl.innerHTML = server.iconSvg
  if (nameEl) nameEl.textContent = server.name
  if (subEl) subEl.textContent = server.subtitle

  if (tagsEl) {
    tagsEl.innerHTML = server.tags.map((t) => `<span class="inspector-tag-chip">${t}</span>`).join('')
  }

  if (latencyValEl) {
    latencyValEl.textContent = server.online ? `${server.pingMs} ms` : '—'
  }
  if (playersValEl) {
    playersValEl.textContent = server.isComingSoon
      ? '—'
      : (server.online ? `${server.playersOnline} / ${server.playersMax}` : '—')
  }
  if (versionValEl) versionValEl.textContent = server.version

  if (descEl) descEl.textContent = server.description
  if (locEl) locEl.textContent = server.location
  if (verEl) verEl.textContent = server.version
  if (plEl) {
    plEl.textContent = server.isComingSoon
      ? '—'
      : (server.online ? `${server.playersOnline} / ${server.playersMax}` : '—')
  }
  if (latEl) {
    latEl.textContent = server.online ? `${server.pingMs} ms` : '—'
  }

  if (joinBtn) {
    if (server.isComingSoon) {
      joinBtn.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-check-bold"></use></svg><span>Sélectionner ce serveur</span>`
    } else {
      joinBtn.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-play-bold"></use></svg><span>Rejoindre ce serveur</span>`
    }
  }

  // Galerie de captures d'écran
  const gallerySection = el('inspector-gallery-section')
  const galleryGrid = el('inspector-gallery-grid')
  const serverMeta = launcherConfig.getServer(server.slug)
  const gallery: string[] = server.profileRef?.gallery || server.profileRef?.modey?.gallery || serverMeta?.gallery || []

  if (gallerySection && galleryGrid) {
    if (Array.isArray(gallery) && gallery.length > 0) {
      gallerySection.style.display = 'block'
      galleryGrid.innerHTML = gallery.map((imgUrl, idx) => `
        <div style="aspect-ratio:16/9; border-radius:6px; overflow:hidden; background:#000; cursor:pointer;" onclick="window.open('${imgUrl}', '_blank')">
          <img src="${imgUrl}" alt="Capture ${idx + 1}" style="width:100%; height:100%; object-fit:cover; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" />
        </div>
      `).join('')
    } else {
      gallerySection.style.display = 'none'
      galleryGrid.innerHTML = ''
    }
  }
}

async function handleJoinServer(server: ServerItem) {
  // Sélection du profil réel associé
  const profile = server.profileRef || homeState.allProfiles.find(
    (p) => p.slug === server.slug || p.slug === server.id
  )

  if (profile && onSelectProfileCallback) {
    onSelectProfileCallback(profile)
    showAccueil()
    el('modey-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  await Dialog.show(
    `${server.name} — Serveur Officiel Modey\n\nCe monde est actuellement en préparation et sera accessible très prochainement !\n\nEn attendant, rejoins notre serveur principal Athéna ou notre Discord officiel pour suivre les ouvertures.`,
    [{ text: 'Compris', type: 'ok' }]
  )
}

function updateDisplay() {
  const servers = buildServersList()
  updateOnlineCounter(servers)
  updateCategoryPills(servers)
  renderCards()

  let selected = servers.find((s) => s.id === selectedServerId)
  if (!selected && servers.length > 0) {
    selected = servers[0]
    selectedServerId = selected.id
  }
  if (selected) {
    renderInspector(selected)
  }
}

/**
 * Fonction publique appelée pour rafraîchir l'affichage dès que les profils sont disponibles
 */
export async function refreshServerCard(_slug?: string) {
  await probeLiveServers()
}

export function initServers(hooks: { onSelectProfile: (profile: any) => void }) {
  onSelectProfileCallback = hooks.onSelectProfile

  // Recherche textuelle
  const searchInput = el('servers-search-input') as HTMLInputElement | null
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value
    renderCards()
  })

  // Menu de tri
  const sortSelect = el('servers-sort-select') as HTMLSelectElement | null
  sortSelect?.addEventListener('change', () => {
    sortMode = sortSelect.value
    renderCards()
  })

  // Bouton Rejoindre de l'inspecteur
  el('btn-inspector-join')?.addEventListener('click', () => {
    const servers = buildServersList()
    const server = servers.find((s) => s.id === selectedServerId)
    if (server) handleJoinServer(server)
  })

  // Discord
  el('btn-shortcut-discord')?.addEventListener('click', () => {
    openDiscordInvite()
  })

  // Site web
  el('btn-shortcut-website')?.addEventListener('click', () => {
    const servers = buildServersList()
    const server = servers.find((s) => s.id === selectedServerId)
    const url = server?.websiteUrl || 'https://modey.fr'
    window.open(url, '_blank')
  })

  // Affichage initial
  updateDisplay()

  // Déclenche le ping réel
  probeLiveServers()
}
