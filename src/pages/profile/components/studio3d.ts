import { WalkingAnimation } from 'skinview3d'
import { skin } from '../../../ipc'
import { getUser } from '../../../state'
import shared from '../../../shared'
import { Dialog } from '../../../components/dialog'
import logger from 'electron-log/renderer'

let rotating = false

const el = (id: string) => document.getElementById(id)

function viewer() {
  return shared.mainSkinViewer
}

function syncAnimationBtn() {
  const btn = el('btn-animation')
  const label = el('animation-btn-label')
  const enabled = shared.isStudioAnimationEnabled()
  btn?.classList.toggle('active', enabled)
  if (label) label.innerText = enabled ? 'Animation : ON' : 'Animation : OFF'
}

function applyAnimationState() {
  const v = viewer()
  if (!v) return
  if (shared.isStudioAnimationEnabled()) {
    if (!v.animation) {
      v.animation = new WalkingAnimation()
      v.animation.speed = 0.3
    }
  } else {
    v.animation = null
  }
}

export function refreshStudioMeta() {
  const active = shared.skins?.find((s) => s.state === 'active')
  const nameEl = el('studio-skin-name')
  const formatEl = el('studio-format')
  
  if (nameEl) {
    const isCustom = active && active.id !== 'steve' && active.id !== 'alex'
    const customName = (active as any)?.name
    nameEl.innerText = customName || (isCustom ? 'Skin personnalisé' : (active?.id === 'alex' ? 'Alex' : 'Steve'))
  }

  if (formatEl && active?.url) {
    if (active.url.includes('localhost') || active.url.includes('/skins/')) {
      formatEl.innerHTML = `<i class="fa-solid fa-server"></i> Modey Core`
      formatEl.title = active.url
    } else {
      formatEl.innerHTML = `<i class="fa-solid fa-cloud"></i> Minecraft`
      formatEl.title = active.url
    }
  }
}

/** Écouteurs du studio 3D (vue face/dos, rotation 360, animation, import/téléchargement). */
export function bindStudio(hooks: { onSkinChanged: () => void }) {
  el('btn-face')?.addEventListener('click', (e) => {
    document.querySelectorAll('.face-btn').forEach((b) => b.classList.remove('active'))
    ;(e.target as HTMLElement).classList.add('active')
    const v = viewer()
    if (v) v.playerObject.rotation.y = 0
  })

  el('btn-back')?.addEventListener('click', (e) => {
    document.querySelectorAll('.face-btn').forEach((b) => b.classList.remove('active'))
    ;(e.target as HTMLElement).classList.add('active')
    const v = viewer()
    if (v) v.playerObject.rotation.y = Math.PI
  })

  el('btn-rotate')?.addEventListener('click', (e) => {
    const v = viewer()
    if (!v) return
    rotating = !rotating
    v.autoRotate = rotating
    v.autoRotateSpeed = 1.2
    ;(e.currentTarget as HTMLElement).classList.toggle('active', rotating)
  })

  el('btn-zoom-in')?.addEventListener('click', () => {
    const v = viewer()
    if (!v) return
    const currentDist = v.camera.position.length()
    if (currentDist > 18) {
      v.camera.position.multiplyScalar(0.85)
    }
  })

  el('btn-zoom-out')?.addEventListener('click', () => {
    const v = viewer()
    if (!v) return
    const currentDist = v.camera.position.length()
    if (currentDist < 70) {
      v.camera.position.multiplyScalar(1.15)
    }
  })

  el('btn-zoom-reset')?.addEventListener('click', () => {
    const v = viewer()
    if (!v) return
    v.camera.position.set(-20, -2, 35)
    v.playerObject.rotation.y = 0
    document.querySelectorAll('.face-btn').forEach((b) => b.classList.remove('active'))
    el('btn-face')?.classList.add('active')
  })

  el('btn-animation')?.addEventListener('click', () => {
    shared.setStudioAnimationEnabled(!shared.isStudioAnimationEnabled())
    applyAnimationState()
    syncAnimationBtn()
  })

  const fileInput = el('input-import-skin') as HTMLInputElement | null
  el('btn-import-skin')?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      // Modèle classique 4px par défaut pour tous les skins personnalisés
      const result = await skin.updateSkin(await file.arrayBuffer(), 'classic')
      if (!result) {
        await Dialog.show('Skin invalide. Utilisez un fichier PNG 64×64.', [{ text: 'OK', type: 'ok' }])
        return
      }
      shared.skins = result
      await shared.resetMainView()
      await shared.resetSkinViews()

      // Mettre à jour immédiatement la photo de profil (avatar) du joueur
      const activeSkin = shared.skins.find((s) => s.state === 'active')
      if (activeSkin?.url) {
        const { updateAvatarFromSkinUrl } = await import('../../../state')
        await updateAvatarFromSkinUrl(activeSkin.url)
      }

      hooks.onSkinChanged()
    } catch (err) {
      logger.error('Erreur import skin:', err)
      await Dialog.show("Impossible d'importer ce skin pour le moment.", [{ text: 'OK', type: 'ok' }])
    } finally {
      fileInput.value = ''
    }
  })

  el('btn-download-skin')?.addEventListener('click', () => {
    const v = viewer()
    if (!v) return
    const a = document.createElement('a')
    a.href = v.canvas.toDataURL('image/png')
    a.download = `${getUser()?.name ?? 'skin'}.png`
    a.click()
  })

  syncAnimationBtn()
}
