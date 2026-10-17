import { Dialog } from '../../../components/dialog'
import { isComingSoonProfile } from '../../../services/profiles'
import freeBuildConfig from '../../../../config/free-build-profile.json'
import { homeState } from '../state'

/** Carte "À découvrir" : teaser Free Build tant qu'il n'est pas actif. */
export function renderDiscovery(onSelectProfile: (profile: any) => void) {
  const discoveryCard = document.getElementById('discovery-card')
  if (!discoveryCard) return
  const freeBuild = homeState.allProfiles.find((p) => p.slug === freeBuildConfig.slug)
  const freeBuildActive = freeBuild && !isComingSoonProfile(freeBuild)
  const features = (freeBuildConfig.teaser.features as { title: string }[]).map((f) => `<span>${f.title}</span>`).join('')

  if (freeBuildActive) {
    discoveryCard.innerHTML = `
      <div class="discovery-top">
        <div class="discovery-icon"><i class="fa-solid fa-cubes"></i></div>
        <strong>Free Build est ouvert !</strong>
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
  renderDiscovery(() => {})
  const srvNotify = document.getElementById('btn-notify-servers')
  if (srvNotify) {
    srvNotify.classList.add('notified')
    srvNotify.innerHTML = '<i class="fa-solid fa-bell"></i>&nbsp;Notifié ✓'
  }
}
