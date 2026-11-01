import { Dialog } from '../../../components/dialog'
import { isComingSoonProfile } from '../../../services/profiles'
import { launcherConfig } from '../../../services/launcherConfig'
import { homeState } from '../state'
import bgImage from '../../../static/images/bg.png'

export function renderDiscovery(onSelectProfile: (profile: any) => void) {
  const container = document.getElementById('discovery-container')
  if (!container) return

  const fbMeta = launcherConfig.getFreeBuild()
  const freeBuildProfile = homeState.allProfiles.find((p) => p.slug === 'free-build' || p.slug === fbMeta?.name)

  const items = [
    {
      id: 'free-build',
      name: fbMeta?.name || 'Free Build',
      desc: 'Construction libre, parcelles créatives & outils sans limites.',
      badge: 'Bientôt',
      badgeClass: 'badge-soon',
      icon: 'fa-cubes',
      profile: freeBuildProfile
    }
  ]

  container.innerHTML = items
    .map(
      (item) => `
    <div class="discovery-card-banner" data-id="${item.id}" style="background: linear-gradient(180deg, rgba(15, 23, 42, 0.2) 0%, rgba(15, 23, 42, 0.85) 85%), url('${bgImage}') center / cover no-repeat;">
      <div class="discovery-banner-badge ${item.badgeClass}">${item.badge}</div>
      <div class="discovery-banner-content">
        <div class="discovery-banner-title"><i class="fa-solid ${item.icon}"></i> ${item.name}</div>
        <div class="discovery-banner-desc">${item.desc}</div>
      </div>
      <button class="discovery-banner-btn" id="btn-discovery-notify"><i class="fa-solid fa-bell"></i> Être notifié</button>
    </div>
  `
    )
    .join('')

  document.getElementById('btn-discovery-notify')?.addEventListener('click', (e) => {
    e.stopPropagation()
    markNotified()
  })

  container.querySelectorAll('.discovery-card-banner').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.id
      const found = items.find((i) => i.id === id)
      if (found?.profile && !isComingSoonProfile(found.profile)) {
        onSelectProfile(found.profile)
      } else {
        const desc = fbMeta?.teaser?.description || 'Le serveur créatif libre de Modey n\'est pas encore actif. Il ouvrira prochainement à tous les joueurs.'
        await Dialog.show(
          `${found?.name || 'Free Build'} — Arrive bientôt\n\n${desc}`,
          [{ text: 'Compris', type: 'ok' }]
        )
      }
    })
  })
}

export async function markNotified() {
  if (homeState.notified) return
  homeState.notified = true
  await Dialog.show('Tu seras notifié de l’ouverture de Free Build dès son lancement !', [{ text: 'Super !', type: 'ok' }])
}
