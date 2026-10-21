import { Dialog } from '../../components/dialog'
import { showAccueil } from '../../router'
import { pingServer, athenaTarget } from '../../services/serverStatus'
import { homeState } from '../home/state'
import { markNotified } from '../home/components/discoveryCard'
import { launcherConfig } from '../../services/launcherConfig'
import serversHtml from './index.html?raw'
import './servers.scss'

const el = (id: string) => document.getElementById(id)

// La page Serveurs est une sous-page de #view-home (fin de conteneur).
const mount = el('view-home')
if (mount && !el('servers-page')) mount.insertAdjacentHTML('beforeend', serversHtml)

/** Carte Athéna de la page Serveurs : statut live indépendant du profil sélectionné. */
export async function refreshAthenaCard() {
  const athena = homeState.allProfiles.find((p) => p.slug === 'athena')
  const athenaMeta = launcherConfig.getAthena()
  const athenaCard = el('server-card-athena')
  if (athenaCard && athena) {
    const banner = athena.modey?.bannerUrl || athenaMeta?.bannerUrl
    const bannerEl = athenaCard.querySelector('.server-banner') as HTMLElement | null
    if (bannerEl && banner) {
      bannerEl.style.background = `linear-gradient(180deg, rgba(10, 20, 40, 0.1) 0%, rgba(10, 20, 40, 0.75) 82%), url('${banner}') center / cover no-repeat, #24365c`
    }
    const iconUrl = athena.modey?.iconUrl || athenaMeta?.iconUrl
    const titleEl = athenaCard.querySelector('.server-banner-title h2') as HTMLElement | null
    if (titleEl && iconUrl) {
      titleEl.innerHTML = `<img src="${iconUrl}" style="width:24px; height:24px; object-fit:contain; border-radius:4px; vertical-align:middle; margin-right:6px;" /> ${athena.name || athenaMeta?.name}`
    }
  }

  const srvStatusBadge = el('srv-status-badge')
  const srvPing = el('srv-ping')
  const srvPlayers = el('srv-players')
  const perkPlayers = el('perk-players')

  if (srvStatusBadge) srvStatusBadge.innerHTML = '<span class="status-dot pinging"></span>&nbsp;Vérification...'
  const t = athenaTarget(homeState.allProfiles)
  const probe = await pingServer(t.host, t.port)
  if (probe.online && probe.status) {
    const mcVer = athena?.modey?.minecraftVersion || athenaMeta?.minecraftVersion || '1.21.1'
    if (srvStatusBadge) srvStatusBadge.innerHTML = `<span class="status-dot online"></span>&nbsp;Disponible • ${mcVer}`
    if (srvPing) srvPing.innerHTML = `<i class="fa-solid fa-signal"></i>&nbsp;${probe.pingMs} ms`
    const txt = `${probe.status.players.online.toLocaleString()} / ${probe.status.players.max.toLocaleString()}`
    if (srvPlayers) srvPlayers.innerHTML = `<i class="fa-solid fa-users"></i>&nbsp;${txt}`
    if (perkPlayers) perkPlayers.innerText = `${probe.status.players.online.toLocaleString()} aventuriers en ligne`
  } else {
    if (srvStatusBadge) srvStatusBadge.innerHTML = '<span class="status-dot offline"></span>&nbsp;Hors ligne'
    if (srvPing) srvPing.innerHTML = '<i class="fa-solid fa-signal"></i>&nbsp;—'
    if (srvPlayers) srvPlayers.innerHTML = '<i class="fa-solid fa-users"></i>&nbsp;—'
  }
}

// TODO(site web) : "Découvrir" devra ouvrir la page dédiée du serveur
// (ex. https://modey.gg/serveurs/athena) dans le navigateur. Pas de site
// pour l'instant → dialogue récapitulatif en attendant.
async function showAthenaDetails() {
  const t = athenaTarget(homeState.allProfiles)
  const athena = homeState.allProfiles.find((p) => p.slug === 'athena')
  const athenaMeta = launcherConfig.getAthena()
  const mcVer = athena?.modey?.minecraftVersion || athenaMeta?.minecraftVersion || '1.21.1'
  const loaderVer = athena?.modey?.loaderVersion || athenaMeta?.loaderVersion || '21.1.169'
  await Dialog.show(
    `${athena?.name || athenaMeta?.name || 'Athéna'} — Serveur officiel.\n\n${athenaMeta?.teaser?.description || 'Un monde vivant centré sur l\'aventure communautaire et la construction de cités prospères. Fonde ta ville, commerce et écris ton histoire.'}\n\nMinecraft ${mcVer} • NeoForge ${loaderVer}\nConnexion : ${t.host}:${t.port}`,
    [{ text: 'Compris', type: 'ok' }]
  )
}

export function initServers(hooks: { onSelectProfile: (profile: any) => void }) {
  el('btn-srv-discover')?.addEventListener('click', showAthenaDetails)
  el('btn-srv-select')?.addEventListener('click', () => {
    const athena = homeState.allProfiles.find((p) => p.slug === 'athena')
    if (athena) hooks.onSelectProfile(athena)
    showAccueil()
    el('modey-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
  })
  el('btn-select-freebuild')?.addEventListener('click', () => {
    const fbMeta = launcherConfig.getFreeBuild()
    const freeBuild = homeState.allProfiles.find((p) => p.slug === 'free-build' || p.slug === fbMeta?.name)
    if (freeBuild) hooks.onSelectProfile(freeBuild)
    showAccueil()
    el('modey-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
  })
  el('btn-notify-servers')?.addEventListener('click', markNotified)
}
