import shared from '../../shared'
import { settings, system } from '../../ipc'
import { Dialog } from '../../components/dialog'
import { createProgressBar } from '../../components/progressBar'
import { setRouterHooks } from '../../router'
import { fetchProfiles, isComingSoonProfile } from '../../services/profiles'
import { targetFor } from '../../services/serverStatus'
import { startLaunch, bindLaunch } from '../../services/launch'
import { refreshProfileServer } from '../profile/profile'
import { refreshAthenaCard } from '../servers/servers'
import { homeState } from './state'
import { renderHero, updateServerStatus } from './components/hero'
import { loadNews } from './components/newsList'
import { renderDiscovery } from './components/discoveryCard'
import { renderDropdown, updateCurrentProfileName, bindSidebar } from './components/sidebar'
import freeBuildConfig from '../../../config/free-build-profile.json'
import profileConfig from '../../../config/athena-profile.json'
import homeHtml from './index.html?raw'
import './home.scss'
import './components/newsList.scss'
import './components/discoveryCard.scss'

const el = (id: string) => document.getElementById(id)

// Fragment HTML de la page Accueil (+ sidebar) injecté dans le shell.
// afterbegin (et non innerHTML) : les sous-pages Serveurs/Profil/Réglages sont
// déjà montées par leurs modules (les imports évaluent avant le corps du module).
const mount = el('view-home')
if (mount && !mount.querySelector('.modey-sidebar')) mount.insertAdjacentHTML('afterbegin', homeHtml)

export function selectProfile(profile: any) {
  homeState.selectedProfile = profile
  shared.selectedProfile = profile
  updateCurrentProfileName(profile)
  renderDropdown(selectProfile)
  renderHero(profile)
  renderDiscovery(selectProfile)
  updateServerStatus(profile)
  refreshProfileServer()
}

async function loadProfiles() {
  homeState.allProfiles = await fetchProfiles()
  if (homeState.allProfiles.length > 0) {
    selectProfile(homeState.allProfiles[0])
  }
  refreshAthenaCard()
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
  if (isComingSoonProfile(profile)) {
    await Dialog.show(
      `Free Build — ${freeBuildConfig.statusLabel}.\n\n${freeBuildConfig.teaser.description}\n\nCe qu'il proposera :\n${(freeBuildConfig.teaser.features as { title: string; text: string }[]).map((f) => `• ${f.title} : ${f.text}`).join('\n')}\n\nMinecraft ${freeBuildConfig.minecraftVersion} • NeoForge ${freeBuildConfig.modLoader.version}`,
      [{ text: 'Compris', type: 'ok' }]
    )
    return
  }
  await Dialog.show(
    `${profile?.name ?? 'Athéna'} — Serveur officiel.\n\nUn monde vivant. Des villes à construire. Une aventure à partager.\n\nMinecraft ${profileConfig.minecraftVersion} • NeoForge ${profileConfig.modLoader.version}\nConnexion : ${targetFor(profile).host}:${targetFor(profile).port}`,
    [{ text: 'Compris', type: 'ok' }]
  )
}

export function initHome() {
  loadProfiles()
  loadHeader()
  updateServerStatus(homeState.selectedProfile)
  loadNews()
  renderHero(homeState.selectedProfile)
  renderDiscovery(selectProfile)
  refreshAthenaCard()
  bindSidebar()

  setRouterHooks({ onShowServers: refreshAthenaCard })

  el('btn-details')?.addEventListener('click', showServerDetails)

  const playBtn = el('btn-play')
  const playHeroBtn = el('btn-play-hero')
  playBtn?.addEventListener('click', startLaunch)
  playHeroBtn?.addEventListener('click', startLaunch)

  bindLaunch({
    progress: createProgressBar({ container: 'launch-progress-container', bar: 'launch-progress-bar', label: 'launch-progress-label', percent: 'launch-progress-percent' }),
    setPlayVisible(visible) {
      if (playBtn) playBtn.style.display = visible ? 'flex' : 'none'
      if (playHeroBtn) playHeroBtn.style.display = visible ? 'flex' : 'none'
    },
    setPlayEnabled(enabled) {
      const b = playBtn as HTMLButtonElement | null
      if (!b) return
      if (enabled) b.removeAttribute('disabled')
      else b.setAttribute('disabled', 'true')
    },
    getProfile: () => homeState.selectedProfile,
    isComingSoon: () => isComingSoonProfile(homeState.selectedProfile),
    showBlockedDetails: () => showServerDetails(),
    onGameClosed: () => {
      renderHero(homeState.selectedProfile)
      updateServerStatus(homeState.selectedProfile)
    }
  })
}
