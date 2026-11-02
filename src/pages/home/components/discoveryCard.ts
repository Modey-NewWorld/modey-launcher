import { Dialog } from '../../../components/dialog'
import { isComingSoonProfile } from '../../../services/profiles'
import { launcherConfig } from '../../../services/launcherConfig'
import { homeState } from '../state'

export function renderDiscovery(onSelectProfile: (profile: any) => void) {
  const container = document.getElementById('discovery-container')
  if (!container) return

  const fbMeta = launcherConfig.getFreeBuild()
  const freeBuildProfile = homeState.allProfiles.find((p) => p.slug === 'free-build' || p.slug === fbMeta?.name)

  container.innerHTML = `
    <div class="discovery-compact-card" id="btn-discovery-open">
      <div class="discovery-compact-left">
        <div class="discovery-compact-icon"><svg class="solar-icon solar-linear" aria-hidden="true"><use href="#solar-box-linear"></use></svg></div>
        <div class="discovery-compact-text">
          <span class="discovery-compact-title">${fbMeta?.name || 'Free Build'}</span>
          <span class="discovery-compact-sub">Le bac à sable créatif de Modey</span>
        </div>
      </div>
      <div class="discovery-compact-right">
        <span class="badge-soon">Bientôt</span>
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-arrow-right-bold"></use></svg>
      </div>
    </div>
  `

  document.getElementById('btn-discovery-open')?.addEventListener('click', async () => {
    if (freeBuildProfile && !isComingSoonProfile(freeBuildProfile)) {
      onSelectProfile(freeBuildProfile)
    } else {
      await Dialog.show(
        `${fbMeta?.name || 'Free Build'} — Arrive bientôt\n\n${fbMeta?.teaser?.description || 'Construction libre, parcelles créatives et outils sans limites.'}\n\nMinecraft ${fbMeta?.minecraftVersion || '1.21.1'} • NeoForge ${fbMeta?.loaderVersion || '21.1.169'}`,
        [{ text: 'Compris', type: 'ok' }]
      )
    }
  })
}

export async function markNotified() {
  if (homeState.notified) return
  homeState.notified = true
  await Dialog.show('Tu seras notifié de l’ouverture de Free Build dès son lancement !', [{ text: 'Super !', type: 'ok' }])
}
