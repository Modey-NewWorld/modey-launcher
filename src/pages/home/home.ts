import { checkAndShowUpdateToast } from '../../services/updateToast'
import shared from '../../shared'
import { settings, system } from '../../ipc'
import { Dialog } from '../../components/dialog'
import { createProgressBar } from '../../components/progressBar'
import { setRouterHooks, showServerSettings, showServers } from '../../router'
import { fetchProfiles, isComingSoonProfile } from '../../services/profiles'
import { targetFor } from '../../services/serverStatus'
import { FALLBACK_MC_VERSION, FALLBACK_LOADER_VERSION } from '../../services/launcherConfig'
import { startLaunch, bindLaunch } from '../../services/launch'
import { refreshProfileServer } from '../profile/profile'
import { refreshServerCard } from '../servers/servers'
import { homeState } from './state'
import { renderHero, updateServerStatus, checkIsAdmin, initHeroGallery } from './components/hero'
import { loadNews } from './components/newsList'
import { renderDiscovery } from './components/discoveryCard'
import { renderResumeAndHistory } from './components/resumeCards'
import { renderFriendsList, renderNotificationsList, initRailTabs } from './components/socialSidebar'
import { recordPlayedServer } from './components/serverHistory'
import { renderDropdown, updateCurrentProfileName, bindSidebar } from './components/sidebar'
import { launcherConfig } from '../../services/launcherConfig'
import logoUrl from '../../static/images/logo.png'
import bgThumbUrl from '../../static/images/bg-thumb.webp'
import bgUrl from '../../static/images/bg.webp'
import homeHtmlRaw from './index.html?raw'
import './home.scss'
import './components/newsList.scss'
import './components/discoveryCard.scss'

const el = (id: string) => document.getElementById(id)

const ASSET_MAP: Record<string, string> = {
  '@STATIC_LOGO@': logoUrl,
  '@STATIC_BG_THUMB@': bgThumbUrl,
  '@STATIC_BG@': bgUrl
}

function hydrateAssets(html: string): string {
  return Object.entries(ASSET_MAP).reduce(
    (acc, [from, to]) => acc.split(from).join(to),
    html
  )
}

const homeHtml = hydrateAssets(homeHtmlRaw)

// Fragment HTML de la page Accueil (+ sidebar) injecté dans le shell.
const mount = el('view-home')
if (mount && !mount.querySelector('.modey-sidebar')) mount.insertAdjacentHTML('afterbegin', homeHtml)

export function selectProfile(profile: any) {
  homeState.selectedProfile = profile
  shared.selectedProfile = profile
  updateCurrentProfileName(profile)
  renderDropdown(selectProfile)
  renderHero(profile)
  renderDiscovery(selectProfile)
  renderResumeAndHistory(selectProfile)
  updateServerStatus(profile)
  refreshProfileServer()
}

async function loadProfiles() {
  homeState.allProfiles = await fetchProfiles()
  if (homeState.allProfiles.length > 0) {
    selectProfile(homeState.allProfiles[0])
  }
  refreshServerCard()
}

async function loadHeader() {
  try {
    const [config, sysInfo] = await Promise.all([settings.get(), system.getInfo()])
    const perkRam = el('perk-ram')
    if (perkRam) perkRam.innerText = `Optimisation auto (${Math.round(+config.memory.max)} Go recommandés)`
    const versionLabel = el('launcher-version-label')
    if (versionLabel && sysInfo.version) versionLabel.innerText = `Version ${sysInfo.version}`
  } catch {
    /*perk garde sa valeur par défaut*/
  }
}

export async function showServerDetails() {
  const profile = homeState.selectedProfile
  const serverSlug = profile?.slug || 'athena'
  const meta = launcherConfig.getServer(serverSlug) || (isComingSoonProfile(profile) ? launcherConfig.getFreeBuild() : launcherConfig.getDefaultServer())

  if (isComingSoonProfile(profile)) {
    const features = meta?.teaser?.features || [
      { title: 'Monde créatif libre', text: 'Plots personnels + monde plat pour construire sans limites.' },
      { title: 'Outils de build', text: 'Outils de construction et partage de schématiques.' },
      { title: 'Ouvert à tous', text: 'Accessible à tous les joueurs Modey.' }
    ]
    await Dialog.show(
      `${meta?.name || 'Free Build'} — ${meta?.maintenanceMessage || 'Serveur non actif — Arrive bientôt'}.\n\n${meta?.teaser?.description || ''}\n\nCe qu'il proposera :\n${features.map((f: { title: string; text?: string }) => `• ${f.title}${f.text ? ` : ${f.text}` : ''}`).join('\n')}\n\nMinecraft ${meta?.minecraftVersion || FALLBACK_MC_VERSION} • NeoForge ${meta?.loaderVersion || FALLBACK_LOADER_VERSION}`,
      [{ text: 'Compris', type: 'ok' }]
    )
    return
  }
  await Dialog.show(
    `${profile?.name ?? meta?.name ?? 'Athéna'}.\n\n${meta?.teaser?.description || 'Un monde vivant. Des villes à construire. Une aventure à partager.'}\n\nMinecraft ${meta?.minecraftVersion || FALLBACK_MC_VERSION} • NeoForge ${meta?.loaderVersion || FALLBACK_LOADER_VERSION}\nConnexion : ${targetFor(profile).host}:${targetFor(profile).port}`,
    [{ text: 'Compris', type: 'ok' }]
  )
}

export function initHome() {
  updateCurrentProfileName(homeState.selectedProfile)
  loadProfiles()
  loadHeader()
  updateServerStatus(homeState.selectedProfile)
  loadNews()
  renderHero(homeState.selectedProfile)
  initHeroGallery()
  renderDiscovery(selectProfile)
  renderResumeAndHistory(selectProfile)
  renderFriendsList()
  renderNotificationsList()
  initRailTabs()
  refreshServerCard()
  bindSidebar()
  checkAndShowUpdateToast()

  setRouterHooks({ onShowServers: refreshServerCard })

  el('btn-details')?.addEventListener('click', showServerDetails)
  el('btn-server-settings')?.addEventListener('click', () => {
    const slug = homeState.selectedProfile?.slug || 'athena'
    showServerSettings(slug)
  })

  // Liens "Voir tout"
  el('resume-view-all')?.addEventListener('click', showServers)
  el('history-view-all')?.addEventListener('click', showServers)
  el('news-view-all')?.addEventListener('click', () => {
    Dialog.show('Actualités Modey\n\nRetrouvez tous les patch notes et annonces sur notre Discord et site officiel.', [{ text: 'Compris', type: 'ok' }])
  })
  el('discovery-view-all')?.addEventListener('click', showServers)

  const playBtn = el('btn-play')
  const playHeroBtn = el('btn-play-hero')
  
  const handleLaunch = () => {
    const current = homeState.selectedProfile
    if (current) {
      recordPlayedServer(current.slug || 'athena', current.name || 'Athéna')
      renderResumeAndHistory(selectProfile)
    }
    startLaunch()
  }

  playBtn?.addEventListener('click', handleLaunch)
  playHeroBtn?.addEventListener('click', handleLaunch)

  bindLaunch({
    progress: createProgressBar({ container: 'launch-progress-container', bar: 'launch-progress-bar', label: 'launch-progress-label', percent: 'launch-progress-percent' }),
    setPlayVisible(visible) {
      if (playBtn) playBtn.style.display = visible ? 'flex' : 'none'
      if (playHeroBtn) playHeroBtn.style.display = visible ? 'flex' : 'none'
    },
    setPlayEnabled(enabled) {
      for (const btn of [playBtn, playHeroBtn]) {
        const b = btn as HTMLButtonElement | null
        if (!b) continue
        if (enabled) {
          b.removeAttribute('disabled')
          b.classList.remove('btn-disabled')
        } else {
          b.setAttribute('disabled', 'true')
          b.classList.add('btn-disabled')
        }
      }
    },
    getProfile: () => homeState.selectedProfile,
    isComingSoon: () => isComingSoonProfile(homeState.selectedProfile) && !checkIsAdmin(),
    showBlockedDetails: () => showServerDetails(),
    onGameClosed: () => {
      renderHero(homeState.selectedProfile)
  initHeroGallery()
      updateServerStatus(homeState.selectedProfile)
      renderResumeAndHistory(selectProfile)
    }
  })
}
