const KNOWN_SOLAR_ICONS = new Set([
  'server', 'shield', 'crown', 'sparkles', 'rocket', 'box',
  'compass', 'bolt', 'star', 'gamepad', 'cup', 'lock'
])

function resolveServerIconSvg(iconUrl?: string, iconName?: string, isCrown = false, size = 20): string {
  if (iconUrl) {
    return `<img src="${iconUrl}" style="width:${size}px; height:${size}px; object-fit:contain; border-radius:4px; vertical-align:middle;" />`
  }
  const cleanName = (iconName || 'server').toLowerCase().trim()
  const resolvedRef = KNOWN_SOLAR_ICONS.has(cleanName) ? `#solar-${cleanName}-bold` : '#solar-server-bold'
  return `<svg class="solar-icon solar-bold ${cleanName === 'crown' || isCrown ? 'server-icon-gold' : ''}" aria-hidden="true"><use href="${resolvedRef}"></use></svg>`
}

import { Dialog } from '../../components/dialog'
import { showAccueil } from '../../router'
import { pingServer, getServerTarget, setCachedServerInfo } from '../../services/serverStatus'
import { homeState } from '../home/state'
import { profiles } from '../../ipc'
import { launcherConfig } from '../../services/launcherConfig'
import { BRAND } from '../../config/brand'
import { openDiscordInvite } from '../../services/discord'
import { isComingSoonProfile } from '../../services/profiles'
import { checkIsAdmin } from '../home/components/hero'
import serversHtml from './index.html?raw'
import './servers.scss'

import bgAthena from '../../static/images/bg.webp'
import cardAthena from '../../static/images/servers/card-athena.webp'
import inspectorAthena from '../../static/images/servers/inspector-athena.webp'

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
  isProtected?: boolean
  description: string
  tags: string[]
  bannerUrl: string
  detailBannerUrl: string
  websiteUrl?: string
  isOfficial: boolean
  isVerified?: boolean
  isCustom?: boolean
  profileRef?: any
}

interface CustomServerEntry {
  id: string
  slug: string
  name: string
  ip: string
  port: number
  password?: string
  requiresPassword?: boolean
  passwordVersion?: string
  needsPasswordPrompt?: boolean
  version?: string
  loader?: string
  loaderVersion?: string
  description?: string
  tags?: string[]
  bannerUrl?: string
  iconUrl?: string
  updaterUrl?: string
  clientConfig?: any
  createdAt: number
}

const CUSTOM_SERVERS_KEY = 'modey_custom_servers'

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function loadCustomServers(): CustomServerEntry[] {
  try {
    const raw = window.localStorage?.getItem(CUSTOM_SERVERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCustomServers(entries: CustomServerEntry[]) {
  try {
    window.localStorage?.setItem(CUSTOM_SERVERS_KEY, JSON.stringify(entries))
  } catch {}
}

function parseAddressInput(rawInput: string): { host: string; port: number } {
  const clean = rawInput.trim()
  const colonIdx = clean.lastIndexOf(':')
  if (colonIdx > 0 && /^\d+$/.test(clean.slice(colonIdx + 1))) {
    const port = parseInt(clean.slice(colonIdx + 1), 10)
    return {
      host: clean.slice(0, colonIdx).trim(),
      port: port > 0 && port <= 65535 ? port : 25565
    }
  }
  return { host: clean, port: 25565 }
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
    const isProtected = p.visibility === 'PROTECTED' || Boolean((p as any).isProtected)
    const isComingSoon = !isProtected && (isComingSoonProfile(p) || meta?.status === 'comingSoon')

    const tags: string[] = Array.isArray(p.tags)
      ? p.tags
      : (Array.isArray(p.modey?.tags)
        ? p.modey.tags
        : (Array.isArray(meta?.tags) ? meta.tags : []))

    const version = p.minecraftVersion || p.modey?.minecraftVersion || meta?.minecraftVersion || '1.21.1'
    const name = p.name || meta?.name || slug
    const subtitle = p.subtitle || meta?.subtitle || `Europe (FR) • ${version}`
    const location = p.location || p.modey?.location || meta?.location || 'Europe (France)'
    const description = p.description || p.modey?.description || meta?.teaser?.description || p.teaser?.description || p.subtitle || ''
    const isAthena = slug === 'athena' || p.id === 'modey-athena' || p.name === 'Athéna'
    const isOfficial = Boolean((p as any).isOfficial ?? (p as any).is_official ?? isAthena)
    const isVerified = Boolean((p as any).isVerified ?? (p as any).is_verified ?? isOfficial)
    const defaultBanner = isAthena ? cardAthena : bgAthena
    const defaultDetail = isAthena ? inspectorAthena : bgAthena
    const rawBanner = p.bannerUrl || p.modey?.bannerUrl || meta?.bannerUrl
    const normalizeImg = (u?: string) => (u && u.startsWith('/')) ? `${BRAND.apiUrl}${u}` : u
    const banner = normalizeImg(rawBanner) || defaultBanner
    const detailBanner = normalizeImg(rawBanner) || defaultDetail

    const rawIconUrl = p.iconUrl || p.modey?.iconUrl || meta?.iconUrl
    const iconUrl = normalizeImg(rawIconUrl)
    const iconName = p.modey?.launcherIcon || (meta ? meta.launcherIcon : undefined) || p.launcherIcon || (isComingSoon ? 'box' : 'server')
    const iconSvg = resolveServerIconSvg(iconUrl, iconName, iconName === 'crown')

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
      isProtected,
      description,
      tags,
      bannerUrl: banner,
      detailBannerUrl: detailBanner,
      websiteUrl: BRAND.websiteUrl,
      isOfficial,
      isVerified,
      profileRef: p
    })
  }

  // 2. Serveurs configurés dans launcherConfig mais non encore chargés dans homeState
  const isStaff = checkIsAdmin()
  for (const [slug, meta] of Object.entries(allConfigs)) {
    if (processedSlugs.has(slug)) continue
    processedSlugs.add(slug)

    const vis = ((meta as any).visibility || 'PUBLIC').toUpperCase()
    const isComingSoon = meta.status === 'comingSoon'
    if ((vis === 'HIDDEN' || (!meta.enabled && !isComingSoon)) && !isStaff) {
      continue
    }

    const version = meta.minecraftVersion || '1.21.1'
    const tags = meta.tags || []
    const isAthena = slug === 'athena'
    const defaultBanner = isAthena ? cardAthena : bgAthena
    const defaultDetail = isAthena ? inspectorAthena : bgAthena
    const normalizeImg = (u?: string) => (u && u.startsWith('/')) ? `${BRAND.apiUrl}${u}` : u
    const banner = normalizeImg(meta.bannerUrl) || defaultBanner
    const detailBanner = normalizeImg(meta.bannerUrl) || defaultDetail

    const iconUrl = normalizeImg(meta.iconUrl)
    const iconName = meta.launcherIcon || (isComingSoon ? 'box' : 'server')
    const iconSvg = resolveServerIconSvg(iconUrl, iconName, iconName === 'crown')

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
      detailBannerUrl: detailBanner,
      websiteUrl: meta.mapUrl || BRAND.websiteUrl,
      isOfficial: Boolean((meta as any).isOfficial ?? isAthena),
      isVerified: Boolean((meta as any).isVerified ?? isAthena)
    })
  }

  // 3. Serveurs personnalisés ajoutés par le joueur (IP + port + mot de passe optionnel)
  const customServers = loadCustomServers()
  for (const c of customServers) {
    if (!c.ip || processedSlugs.has(c.slug)) continue
    processedSlugs.add(c.slug)

    const cachedPing = pingLiveCache[c.id] || pingLiveCache[c.slug]
    const mcVer = c.version || '1.21.1'
    const iconSvg = resolveServerIconSvg(c.iconUrl, c.password ? 'lock' : 'server', false)

    list.push({
      id: c.id,
      slug: c.slug,
      name: c.name || c.ip,
      iconSvg,
      subtitle: `${c.ip}:${c.port}`,
      location: 'Serveur personnalisé',
      version: mcVer,
      pingMs: cachedPing?.pingMs ?? null,
      playersOnline: cachedPing?.playersOnline ?? null,
      playersMax: cachedPing?.playersMax ?? null,
      online: cachedPing?.online ?? false,
      isComingSoon: false,
      isProtected: false,
      description: c.description || `Connexion directe vers ${c.ip}:${c.port}.`,
      tags: Array.isArray(c.tags) && c.tags.length > 0 ? c.tags : ['Personnalisé'],
      bannerUrl: c.bannerUrl || bgAthena,
      detailBannerUrl: c.bannerUrl || bgAthena,
      isOfficial: false,
      isVerified: false,
      isCustom: true,
      profileRef: {
        id: c.id,
        slug: c.slug,
        name: c.name || c.ip,
        ip: c.ip,
        port: c.port,
        server: { host: c.ip, port: c.port },
        updaterUrl: c.updaterUrl,
        version: mcVer,
        bannerUrl: c.bannerUrl,
        iconUrl: c.iconUrl,
        description: c.description,
        tags: c.tags,
        isCustomServer: true,
        ...(c.clientConfig ? { clientConfig: c.clientConfig } : {}),
        modey: {
          name: c.name || c.ip,
          ip: c.ip,
          port: c.port,
          status: 'live',
          enabled: true,
          autoBlockIfOffline: false,
          updaterUrl: c.updaterUrl,
          minecraftVersion: mcVer,
          loader: String(c.loader || 'vanilla').toLowerCase() === 'paper' ? 'vanilla' : (c.loader || 'vanilla'),
          loaderVersion: c.loaderVersion || '',
          ...(c.clientConfig ? { clientConfig: c.clientConfig } : {})
        }
      }
    })
  }

  return list
}

/**
 * Ping réel des serveurs actifs
 */
async function probeLiveServers() {
  // Rafraîchir les métadonnées des serveurs personnalisés locaux/tiers si leur loader ou nom a évolué
  const customList = loadCustomServers()
  let customDirty = false
  for (const c of customList) {
    if (!c.ip) continue
    try {
      const addr = c.port && c.port !== 25565 ? `${c.ip}:${c.port}` : c.ip
      const res: any = await profiles.resolveCustom(addr, c.password || '').catch(() => null)
      if (res?.requiresPassword) {
        const nextVer = res.passwordVersion || c.passwordVersion || ''
        if (!c.needsPasswordPrompt || nextVer !== c.passwordVersion || !c.requiresPassword) {
          c.needsPasswordPrompt = true
          c.requiresPassword = true
          if (nextVer) c.passwordVersion = nextVer
          customDirty = true
        }
        continue
      }
      const meta = res?.profile || res?.standaloneMeta
      if (meta) {
        const nextName = (c.name && c.name !== c.ip && c.name !== 'localhost') ? c.name : (meta.name || c.name)
        const nextVer = meta.minecraftVersion || c.version
        const nextLoaderRaw = meta.loader || c.loader
        const nextLoader = String(nextLoaderRaw || '').toLowerCase() === 'paper' ? 'vanilla' : nextLoaderRaw
        const nextLoaderVer = meta.loaderVersion || c.loaderVersion
        const nextUpdater = meta.updaterUrl || c.updaterUrl
        const nextDesc = meta.description || c.description
        const nextTags = Array.isArray(meta.tags) && meta.tags.length > 0 ? meta.tags : c.tags
        const nextBanner = meta.bannerUrl || c.bannerUrl
        const nextIcon = meta.iconUrl || c.iconUrl
        const nextRequiresPwd = Boolean(meta.requiresPassword)
        const nextPwdVer = meta.passwordVersion || c.passwordVersion || ''
        const nextClientCfg = meta.clientConfig || (meta.allowClientChoice !== undefined || meta.serverLoader ? {
          serverLoader: meta.serverLoader,
          serverLoaderVersion: meta.serverLoaderVersion,
          mode: meta.clientMode,
          loader: nextLoader,
          loaderVersion: nextLoaderVer,
          allowClientChoice: Boolean(meta.allowClientChoice),
          availableClientPresets: meta.availableClientPresets || [],
          defaultClientPreset: meta.defaultClientPreset || 'vanilla',
          hasClientMods: Boolean(meta.hasClientMods)
        } : undefined)
        const clientCfgChanged = nextClientCfg && JSON.stringify(nextClientCfg) !== JSON.stringify(c.clientConfig || null)
        if (
          nextName !== c.name ||
          nextVer !== c.version ||
          nextLoader !== c.loader ||
          nextLoaderVer !== c.loaderVersion ||
          nextUpdater !== c.updaterUrl ||
          nextDesc !== c.description ||
          nextBanner !== c.bannerUrl ||
          nextIcon !== c.iconUrl ||
          nextRequiresPwd !== Boolean(c.requiresPassword) ||
          nextPwdVer !== (c.passwordVersion || '') ||
          c.needsPasswordPrompt ||
          clientCfgChanged
        ) {
          c.name = nextName
          c.version = nextVer
          if (nextLoader) c.loader = nextLoader
          if (nextLoaderVer) c.loaderVersion = nextLoaderVer
          if (nextUpdater) c.updaterUrl = nextUpdater
          if (nextDesc) c.description = nextDesc
          if (nextTags) c.tags = nextTags
          if (nextBanner) c.bannerUrl = nextBanner
          if (nextIcon) c.iconUrl = nextIcon
          c.requiresPassword = nextRequiresPwd
          if (nextPwdVer) c.passwordVersion = nextPwdVer
          c.needsPasswordPrompt = false
          if (nextClientCfg) c.clientConfig = nextClientCfg
          customDirty = true
        }
      }
    } catch {}
  }
  if (customDirty) {
    saveCustomServers(customList)
  }

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
          setCachedServerInfo(s.id, pingLiveCache[s.id])
          setCachedServerInfo(s.slug, pingLiveCache[s.id])
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

      if (s.isProtected) {
        statusHtml = `<span class="card-badge card-badge-status" style="border-color:rgba(245,158,11,0.35); color:#f59e0b;"><svg class="solar-icon solar-bold" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;margin-right:3px;" aria-hidden="true"><use href="#solar-lock-bold"></use></svg>Protégé</span>`
        playersHtml = `<span class="card-badge card-badge-players"><svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>&nbsp;—</span>`
        pingHtml = `<span>Privé</span>`
        joinBtnHtml = `
          <button class="btn-card-join" data-action="join" data-server-id="${s.id}">
            <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-lock-bold"></use></svg>
            <span>Déverrouiller</span>
          </button>
        `
      } else if (s.isComingSoon) {
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
            ${s.isCustom ? `<button type="button" class="btn-remove-custom-server" data-action="remove-custom" data-server-id="${s.id}" title="Retirer ce serveur personnalisé" aria-label="Retirer">&times;</button>` : ''}
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
                  <h3 class="card-name" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span>${escapeHtml(s.name)}</span>
                    ${s.isOfficial ? `<span class="badge-cert badge-official" title="Serveur Officiel Modey" style="font-size:10px; font-weight:800; background:linear-gradient(135deg, #f59e0b, #d97706); color:#fff; padding:1px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:3px;"><svg style="width:10px; height:10px; fill:currentColor;" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5m14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg> Officiel</span>` : (s.isVerified ? `<span class="badge-cert badge-verified" title="Serveur Partenaire Vérifié" style="font-size:10px; font-weight:800; background:#0284c7; color:#fff; padding:1px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:3px;"><svg style="width:10px; height:10px; fill:currentColor;" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg> Vérifié</span>` : (s.isCustom ? `<span class="badge-cert" title="Serveur Personnalisé" style="font-size:10px; font-weight:800; background:#475569; color:#fff; padding:1px 6px; border-radius:4px; display:inline-flex; align-items:center;">Personnalisé</span>` : ''))}
                  </h3>
                  <span class="card-subtitle">${escapeHtml(s.subtitle)}</span>
                </div>
              </div>
              <div class="card-latency text-green">
                ${pingHtml}
              </div>
            </div>
            <p class="card-description">${escapeHtml(s.description)}</p>
            ${s.tags && s.tags.length > 0 ? `<div class="card-tags-list">${tagsHtml}</div>` : ''}
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
      const removeBtn = target.closest('[data-action="remove-custom"]')
      if (removeBtn) {
        e.stopPropagation()
        const idToRemove = removeBtn.getAttribute('data-server-id')
        if (idToRemove) {
          const next = loadCustomServers().filter((c) => c.id !== idToRemove)
          saveCustomServers(next)
          if (selectedServerId === idToRemove) {
            selectedServerId = 'athena'
          }
          updateDisplay()
        }
        return
      }

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
    if (server.isProtected) {
      badgeStatus.innerHTML = `<span class="status-dot" style="background:#f59e0b;"></span>&nbsp;Protégé`
    } else if (server.isComingSoon) {
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
    if (server.tags && server.tags.length > 0) {
      tagsEl.style.display = 'flex'
      tagsEl.innerHTML = server.tags.map((t) => `<span class="inspector-tag-chip">${t}</span>`).join('')
    } else {
      tagsEl.style.display = 'none'
      tagsEl.innerHTML = ''
    }
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
    if (server.isProtected) {
      joinBtn.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-lock-bold"></use></svg><span>Déverrouiller le serveur</span>`
    } else if (server.isComingSoon) {
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

  if (profile && server.isCustom) {
    const customList = loadCustomServers()
    const customEntry = customList.find((c) => c.slug === server.slug || c.id === server.id)
    if (customEntry?.needsPasswordPrompt) {
      const pwd = await Dialog.prompt(
        `Le mot de passe du serveur privé « ${server.name} » a été modifié par son hébergeur.\nVeuillez saisir le nouveau mot de passe :`,
        '',
        `Accès Privé — ${server.name}`,
        true
      )
      if (!pwd) return
      const addr = customEntry.port && customEntry.port !== 25565 ? `${customEntry.ip}:${customEntry.port}` : customEntry.ip
      const verify = await profiles.resolveCustom(addr, pwd).catch(() => null)
      if (verify?.requiresPassword) {
        await Dialog.show(
          verify.error || 'Mot de passe incorrect pour ce serveur privé.',
          [{ text: 'Fermer', type: 'ok' }],
          'Accès Refusé'
        )
        return
      }
      customEntry.password = pwd
      customEntry.needsPasswordPrompt = false
      const meta = verify?.standaloneMeta || verify?.profile
      if (meta?.passwordVersion) customEntry.passwordVersion = meta.passwordVersion
      saveCustomServers(customList)
    }
  }

  if (profile && (profile.visibility === 'PROTECTED' || server.isProtected)) {
    const pwd = await Dialog.prompt(
      `Ce serveur est protégé par un mot de passe ou un code d'accès privé.\nVeuillez saisir le mot de passe pour le déverrouiller :`,
      '',
      `Accès Protégé — ${server.name}`,
      true
    )
    if (!pwd) return

    const authRes = await profiles.auth(server.slug, pwd)
    if (!authRes.success) {
      await Dialog.show(
        authRes.error || 'Mot de passe incorrect pour ce serveur.',
        [{ text: 'Fermer', type: 'ok' }],
        'Accès Refusé'
      )
      return
    }

    // Rafraîchir les profils auprès du serveur
    const refreshed = await profiles.get()
    if (refreshed && refreshed.length > 0) {
      homeState.allProfiles = refreshed
      const unlockedProfile = refreshed.find((p: any) => p.slug === server.slug)
      if (unlockedProfile && onSelectProfileCallback) {
        onSelectProfileCallback(unlockedProfile)
        showAccueil()
        el('modey-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }
  }

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
    const url = server?.websiteUrl || BRAND.websiteUrl
    window.open(url, '_blank')
  })

  // Modale d'ajout de serveur personnalisé / privé
  const modal = el('custom-server-modal')
  const form = el('custom-server-form') as HTMLFormElement | null
  const addrInput = el('custom-srv-address') as HTMLInputElement | null
  const passInput = el('custom-srv-password') as HTMLInputElement | null
  const nameInput = el('custom-srv-name') as HTMLInputElement | null
  const errBox = el('custom-srv-error')
  const submitBtn = el('btn-custom-srv-submit') as HTMLButtonElement | null

  const openCustomModal = () => {
    if (!modal) return
    if (addrInput) addrInput.value = ''
    if (passInput) passInput.value = ''
    if (nameInput) nameInput.value = ''
    if (errBox) {
      errBox.style.display = 'none'
      errBox.textContent = ''
    }
    modal.style.display = 'flex'
    modal.setAttribute('aria-hidden', 'false')
    setTimeout(() => addrInput?.focus(), 30)
  }

  const closeCustomModal = () => {
    if (!modal) return
    modal.style.display = 'none'
    modal.setAttribute('aria-hidden', 'true')
  }

  el('btn-add-custom-server')?.addEventListener('click', openCustomModal)
  el('btn-custom-srv-close')?.addEventListener('click', closeCustomModal)
  el('btn-custom-srv-cancel')?.addEventListener('click', closeCustomModal)
  modal?.addEventListener('click', (ev) => {
    if (ev.target === modal) closeCustomModal()
  })

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const rawAddress = addrInput?.value.trim() || ''
    const password = passInput?.value || ''
    const customName = nameInput?.value.trim() || ''

    if (!rawAddress) {
      if (errBox) {
        errBox.textContent = 'Veuillez saisir une adresse IP, un domaine ou un identifiant.'
        errBox.style.display = 'block'
      }
      return
    }

    if (errBox) errBox.style.display = 'none'
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.textContent = 'Vérification...'
    }

    try {
      // 1. Tenter de résoudre/déverrouiller un serveur privé ou caché du réseau Modey
      const resolved = await profiles.resolveCustom(rawAddress, password)
      if (resolved?.success && resolved.slug) {
        const refreshed = await profiles.get()
        if (Array.isArray(refreshed) && refreshed.length > 0) {
          homeState.allProfiles = refreshed
        }
        selectedServerId = resolved.slug
        closeCustomModal()
        await probeLiveServers()
        return
      }

      if (resolved?.found) {
        if (errBox) {
          errBox.textContent = resolved.requiresPassword && !password
            ? 'Ce serveur privé est protégé : veuillez saisir le mot de passe d\'accès.'
            : (resolved.error || 'Mot de passe incorrect pour ce serveur privé.')
          errBox.style.display = 'block'
        }
        if (resolved.requiresPassword) passInput?.focus()
        return
      }

      // 2. Sinon : serveur externe personnalisé par IP (ou serveur Modey standalone via /server-meta)
      const standaloneMeta = (resolved as any)?.standaloneMeta || null
      const { host, port: parsedPort } = parseAddressInput(rawAddress)
      const port = Number(standaloneMeta?.port || parsedPort || 25565)
      if (!host) {
        if (errBox) {
          errBox.textContent = 'Adresse IP ou domaine invalide.'
          errBox.style.display = 'block'
        }
        return
      }

      const probe = await pingServer(host, port).catch(() => null)
      const detectedVer = standaloneMeta?.minecraftVersion
        || String(probe?.status?.version || '').match(/\d+\.\d+(?:\.\d+)?/)?.[0]
        || '1.21.1'
      const cleanMotd = probe?.status?.motd
        ? String(probe.status.motd).replace(/§[0-9a-fk-or]/gi, '').replace(/\s+/g, ' ').trim()
        : ''
      const cleanSlug = standaloneMeta?.slug || `custom-${host.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${port}`
      const id = cleanSlug

      const list = loadCustomServers().filter((c) => c.id !== id)
      const rawMetaLoader = standaloneMeta?.loader
      const normalizedMetaLoader = String(rawMetaLoader || '').toLowerCase() === 'paper' ? 'vanilla' : rawMetaLoader
      const resolvedClientCfg = standaloneMeta?.clientConfig || (standaloneMeta?.allowClientChoice !== undefined || standaloneMeta?.serverLoader ? {
        serverLoader: standaloneMeta.serverLoader,
        serverLoaderVersion: standaloneMeta.serverLoaderVersion,
        mode: standaloneMeta.clientMode,
        loader: normalizedMetaLoader || 'vanilla',
        loaderVersion: standaloneMeta.loaderVersion || '',
        allowClientChoice: Boolean(standaloneMeta.allowClientChoice),
        availableClientPresets: standaloneMeta.availableClientPresets || [],
        defaultClientPreset: standaloneMeta.defaultClientPreset || 'vanilla',
        hasClientMods: Boolean(standaloneMeta.hasClientMods)
      } : undefined)
      list.push({
        id,
        slug: cleanSlug,
        name: customName || standaloneMeta?.name || cleanMotd || host,
        ip: host,
        port,
        ...(password ? { password } : {}),
        requiresPassword: Boolean(standaloneMeta?.requiresPassword),
        ...(standaloneMeta?.passwordVersion ? { passwordVersion: standaloneMeta.passwordVersion } : {}),
        needsPasswordPrompt: false,
        version: detectedVer,
        ...(normalizedMetaLoader ? { loader: normalizedMetaLoader } : {}),
        ...(standaloneMeta?.loaderVersion ? { loaderVersion: standaloneMeta.loaderVersion } : {}),
        ...(resolvedClientCfg ? { clientConfig: resolvedClientCfg } : {}),
        ...(standaloneMeta?.description || cleanMotd ? { description: standaloneMeta?.description || cleanMotd } : {}),
        ...(Array.isArray(standaloneMeta?.tags) ? { tags: standaloneMeta.tags } : {}),
        ...(standaloneMeta?.bannerUrl ? { bannerUrl: standaloneMeta.bannerUrl } : {}),
        ...(standaloneMeta?.iconUrl ? { iconUrl: standaloneMeta.iconUrl } : {}),
        ...(standaloneMeta?.updaterUrl ? { updaterUrl: standaloneMeta.updaterUrl } : {}),
        createdAt: Date.now()
      })
      saveCustomServers(list)

      if (probe && probe.online && probe.status) {
        pingLiveCache[id] = {
          online: true,
          pingMs: probe.pingMs,
          playersOnline: probe.status.players.online,
          playersMax: probe.status.players.max
        }
        setCachedServerInfo(id, pingLiveCache[id])
        setCachedServerInfo(cleanSlug, pingLiveCache[id])
      } else {
        pingLiveCache[id] = { online: false, pingMs: 0, playersOnline: 0, playersMax: 0 }
      }

      selectedServerId = id
      closeCustomModal()
      updateDisplay()
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.textContent = 'Ajouter'
      }
    }
  })

  // Affichage initial
  updateDisplay()

  // Déclenche le ping réel
  probeLiveServers()
}
