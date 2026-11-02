import { Dialog } from '../../../components/dialog'
import { isComingSoonProfile } from '../../../services/profiles'
import { launcherConfig } from '../../../services/launcherConfig'
import { homeState } from '../state'

export function renderDiscovery(onSelectProfile: (profile: any) => void) {
  const container = document.getElementById('discovery-container')
  if (!container) return

  const fbMeta = launcherConfig.getFreeBuild()
  const freeBuildProfile = homeState.allProfiles.find((p) => p.slug === 'free-build' || p.slug === fbMeta?.name)

  const items = [
    {
      id: 'free-build',
      title: fbMeta?.name || 'Free Build',
      desc: 'Construction libre, sans limites.',
      badge: 'Bientôt',
      badgeClass: 'badge-soon',
      icon: 'box'
    },
    {
      id: 'survival-plus',
      title: 'Survival+',
      desc: 'Plus de défis, plus de récompenses.',
      badge: 'Bientôt',
      badgeClass: 'badge-soon',
      icon: 'gamepad'
    },
    {
      id: 'pvp-arena',
      title: 'PvP Arena',
      desc: "Affronte d'autres joueurs.",
      badge: 'En développement',
      badgeClass: 'badge-dev',
      icon: 'tuning'
    }
  ]

  container.innerHTML = items
    .map(
      (item) => `
    <div class="discovery-row-item" data-id="${item.id}">
      <div class="discovery-row-icon">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-${item.icon}-bold"></use></svg>
      </div>
      <div class="discovery-row-content">
        <div class="discovery-row-title">${item.title}</div>
        <div class="discovery-row-desc">${item.desc}</div>
      </div>
      <div class="discovery-row-badge ${item.badgeClass}">${item.badge}</div>
    </div>
  `
    )
    .join('')

  container.querySelectorAll('.discovery-row-item').forEach((node) => {
    node.addEventListener('click', async () => {
      const id = (node as HTMLElement).dataset.id
      if (id === 'free-build' && freeBuildProfile && !isComingSoonProfile(freeBuildProfile)) {
        onSelectProfile(freeBuildProfile)
      } else {
        const item = items.find((i) => i.id === id)
        await Dialog.show(
          `${item?.title || 'Mode de jeu'} — ${item?.badge}\n\n${item?.desc || ''}\n\nCe mode sera accessible très prochainement aux citoyens de Modey.`,
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
