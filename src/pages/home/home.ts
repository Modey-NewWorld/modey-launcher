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
import { launcherConfig } from '../../services/launcherConfig'
import logoUrl from '../../static/images/logo.png'
import homeHtmlRaw from './index.html?raw'
import './home.scss'
import './components/newsList.scss'
import './components/discoveryCard.scss'

const el = (id: string) => document.getElementById(id)

// Remplacement du chemin absolu /src/static/images/logo.png par l'URL packagée par Vite
const homeHtml = homeHtmlRaw.replace('/src/static/images/logo.png', logoUrl)

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
  const serverSlug = profile?.slug || 'athena'
  const meta = launcherConfig.getServer(serverSlug) || (isComingSoonProfile(profile) ? launcherConfig.getFreeBuild() : launcherConfig.getAthena())

  if (isComingSoonProfile(profile)) {
    const features = meta?.teaser?.features || [
      { title: 'Monde créatif libre', text: 'Plots personnels + monde plat pour construire sans limites.' },
      { title: 'Outils de build', text: 'Outils de construction et partage de schématiques.' },
      { title: 'Ouvert à tous', text: 'Accessible à tous les joueurs Modey.' }
    ]
    await Dialog.show(
      `${meta?.name || 'Free Build'} — ${meta?.maintenanceMessage || 'Serveur non actif — Arrive bientôt'}.\n\n${meta?.teaser?.description || ''}\n\nCe qu'il proposera :\n${features.map((f: { title: string; text?: string }) => `• ${f.title}${f.text ? ` : ${f.text}` : ''}`).join('\n')}\n\nMinecraft ${meta?.minecraftVersion || '1.21.1'} • NeoForge ${meta?.loaderVersion || '21.1.169'}`,
      [{ text: 'Compris', type: 'ok' }]
    )
    return
  }
  await Dialog.show(
    `${profile?.name ?? meta?.name ?? 'Athéna'} — Serveur officiel.\n\n${meta?.teaser?.description || 'Un monde vivant. Des villes à construire. Une aventure à partager.'}\n\nMinecraft ${meta?.minecraftVersion || '1.21.1'} • NeoForge ${meta?.loaderVersion || '21.1.169'}\nConnexion : ${targetFor(profile).host}:${targetFor(profile).port}`,
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
    isComingSoon: () => isComingSoonProfile(homeState.selectedProfile),
    showBlockedDetails: () => showServerDetails(),
    onGameClosed: () => {
      renderHero(homeState.selectedProfile)
      updateServerStatus(homeState.selectedProfile)
    }
  })
}
