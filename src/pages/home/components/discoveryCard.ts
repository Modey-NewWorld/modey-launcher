import { Dialog } from '../../../components/dialog'
import { isComingSoonProfile } from '../../../services/profiles'
import { launcherConfig } from '../../../services/launcherConfig'
import { homeState } from '../state'

/** Carte "À découvrir" : teaser Free Build ou autre serveur tant qu'il n'est pas actif. */
export function renderDiscovery(onSelectProfile: (profile: any) => void) {
  const discoveryCard = document.getElementById('discovery-card')
  if (!discoveryCard) return

  const fbMeta = launcherConfig.getFreeBuild()
  const freeBuild = homeState.allProfiles.find((p) => p.slug === 'free-build' || p.slug === fbMeta?.name)
  const freeBuildActive = freeBuild && !isComingSoonProfile(freeBuild)

  const featuresList = fbMeta?.teaser?.features || [
    { title: 'Monde créatif libre' },
    { title: 'Outils de build' },
    { title: 'Ouvert à tous' },
    { title: 'Concours & events' }
  ]
  const features = featuresList.map((f: { title: string }) => `<span>${f.title}</span>`).join('')

  if (freeBuildActive) {
    discoveryCard.innerHTML = `
      <div class="discovery-top">
        <div class="discovery-icon"><i class="fa-solid fa-cubes"></i></div>
        <strong>${fbMeta?.name || 'Free Build'} est ouvert !</strong>
      </div>
      <p>Le bac à sable créatif de Modey est en ligne. Sélectionne-le dans Serveurs et lance-toi.</p>
      <div class="discovery-bottom">
        <div class="discovery-features">${features}</div>
        <button class="discovery-notify" id="btn-discover-play"><i class="fa-solid fa-play"></i>&nbsp;Jouer</button>
      </div>`
    document.getElementById('btn-discover-play')?.addEventListener('click', () => {
      if (freeBuild) onSelectProfile(freeBuild)
      document.getElementById('modey-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    })
    return
  }

  discoveryCard.innerHTML = `
    <div class="discovery-top">
      <div class="discovery-icon"><i class="fa-solid fa-lock"></i></div>
      <strong>De nouveaux univers arrivent bientôt sur Modey</strong>
    </div>
    <p>D'autres serveurs communautaires rejoindront le catalogue prochainement. Restez à l'affût des prochaines intégrations officielles.</p>
    <div class="discovery-bottom">
      <div class="discovery-features">${features}</div>
      <button class="discovery-notify ${homeState.notified ? 'notified' : ''}" id="btn-notify">
        <i class="fa-solid fa-bell"></i>&nbsp;${homeState.notified ? 'Notifié ✓' : 'Être notifié'}
      </button>
    </div>`
  document.getElementById('btn-notify')?.addEventListener('click', markNotified)
}

export async function markNotified() {
  if (homeState.notified) return
  homeState.notified = true
  await Dialog.show('Tu seras notifié de l’ouverture de Free Build dans le fil d’actualités. À très vite !', [{ text: 'Super !', type: 'ok' }])
}
