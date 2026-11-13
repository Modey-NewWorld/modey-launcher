import { WalkingAnimation } from 'skinview3d'
import { skin, auth } from '../../../ipc'
import { getUser } from '../../../state'
import shared, { DEFAULT_STUDIO_ROTATION_Y, DEFAULT_SKIN, normalizeSkinUrl } from '../../../shared'
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

/** Synchronise l'état visuel des boutons de contrôle (rotation, animation) avec le viewer actif */
export function syncStudioControls() {
  const v = viewer()
  if (!v) return
  rotating = Boolean(v.autoRotate)
  el('btn-rotate')?.classList.toggle('active', rotating)
  syncAnimationBtn()
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
    nameEl.innerText = customName || (isCustom ? 'Skin personnalisé' : 'Steve')
  }

  if (formatEl && active?.url) {
    if (active.url.includes('localhost') || active.url.includes('/skins/')) {
      formatEl.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-server-bold"></use></svg>&nbsp;Modey Core`
      formatEl.title = active.url
    } else {
      formatEl.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-box-bold"></use></svg>&nbsp;Minecraft`
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
    v.playerObject.rotation.y = DEFAULT_STUDIO_ROTATION_Y
    document.querySelectorAll('.face-btn').forEach((b) => b.classList.remove('active'))
  })

  el('btn-animation')?.addEventListener('click', () => {
    shared.setStudioAnimationEnabled(!shared.isStudioAnimationEnabled())
    applyAnimationState()
    syncAnimationBtn()
  })

  const fileInput = el('input-import-skin') as HTMLInputElement | null
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      await processSkinFile(file, hooks)
    } finally {
      fileInput.value = ''
    }
  })

  syncAnimationBtn()
}

/**
 * Valide, vérifie le quota dynamique et enregistre un skin sur le serveur Modey.
 * Utilisé à la fois par l'explorateur de fichiers et par le glisser-déposer (Drag & Drop).
 */
export async function processSkinFile(file: File, hooks?: { onSkinChanged?: () => void }): Promise<boolean> {
  if (!file) return false

  // 1. Validation de l'extension / type de fichier
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  if (!isPng) {
    await Dialog.show(
      "Fichier non supporté :\nVeuillez sélectionner ou glisser une image de skin au format PNG (.png).",
      [{ text: 'OK', type: 'ok' }],
      'Format invalide'
    )
    return false
  }

  try {
    // 2. Vérification des restrictions de compte (permissions / blocage)
    const user = getUser() || shared.account
    const userPermissions = (user as any)?.permissions || []
    const isSkinBlocked = userPermissions.includes('launcher:no_custom_skin') || (user as any)?.skin_disabled === true
    if (isSkinBlocked) {
      await Dialog.show(
        "Votre compte ne vous autorise pas à importer de skins personnalisés sur le réseau Modey.",
        [{ text: 'Fermer', type: 'ok' }],
        'Importation restreinte'
      )
      return false
    }

    // 3. Interroger le serveur pour rafraîchir le quota dynamique selon le rôle
    try {
      const authRes = await auth.refresh()
      if (authRes && authRes.success && authRes.account) {
        shared.account = authRes.account
      }
    } catch (_) {}

    const currentUser = shared.account || getUser()
    const currentCustomSkins = (shared.skins || []).filter(
      (s) => s && s.url && s.id !== 'steve' && s.id !== 'alex' && normalizeSkinUrl(s.url) !== DEFAULT_SKIN.url
    )
    let maxSkins: number = typeof (currentUser as any)?.maxSkins === 'number' && (currentUser as any).maxSkins > 0
      ? (currentUser as any).maxSkins
      : 0
    if (!maxSkins) {
      const role = ((currentUser as any)?.role || 'citizen').toLowerCase()
      if (role === 'founder' || role === 'admin') maxSkins = 50
      else if (role === 'moderator' || role === 'developer' || role === 'dev') maxSkins = 20
      else if (role === 'builder') maxSkins = 15
      else maxSkins = 5
    }

    if (currentCustomSkins.length >= maxSkins) {
      await Dialog.show(
        `Votre casier a atteint sa capacité maximale (${maxSkins} skin${maxSkins > 1 ? 's' : ''} personnalisé${maxSkins > 1 ? 's' : ''} max pour votre rôle).\nVeuillez supprimer un skin de votre casier avant d'en ajouter un nouveau.`,
        [{ text: 'Compris', type: 'ok' }],
        'Casier plein'
      )
      return false
    }

    // 4. Décodage de l'image et vérification des dimensions (64x64 ou 64x32)
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: 'image/png' })
    let img: ImageBitmap
    try {
      img = await createImageBitmap(blob)
    } catch (err) {
      await Dialog.show(
        "Impossible de lire le fichier image. Assurez-vous qu'il s'agit d'une image PNG valide.",
        [{ text: 'OK', type: 'ok' }],
        'Fichier illisible'
      )
      return false
    }

    if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
      await Dialog.show(
        `Format de skin non supporté :\nVotre image fait ${img.width}×${img.height} pixels. Veuillez utiliser une image PNG de dimension 64×64 pixels (ou 64×32 classique).`,
        [{ text: 'OK', type: 'ok' }],
        'Dimensions non conformes'
      )
      return false
    }

    // 5. Détection du modèle slim (3px / Alex)
    let isSlim = false
    if (img.height === 64) {
      const offCanvas = document.createElement('canvas')
      offCanvas.width = 64
      offCanvas.height = 64
      const ctx = offCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        // Bras droit 4px : x: 54..55, y: 20..31 (si tous ces pixels ont alpha === 0, c'est un modèle slim 3px)
        const armData = ctx.getImageData(54, 20, 2, 12).data
        let hasOpaqueArmPixel = false
        for (let i = 3; i < armData.length; i += 4) {
          if (armData[i] > 10) {
            hasOpaqueArmPixel = true
            break
          }
        }
        if (!hasOpaqueArmPixel) {
          isSlim = true
        }
      }
    }

    if (isSlim) {
      await Dialog.show(
        "Modèle de skin non pris en charge :\nLes skins fins (Slim 3px / Alex) ne sont pas disponibles actuellement sur Modey. Veuillez utiliser un skin au format classique (4px / Steve).",
        [{ text: 'Compris', type: 'ok' }],
        'Format Slim non disponible'
      )
      return false
    }

    // 6. Enregistrement sur le serveur
    const result = await skin.updateSkin(buffer, 'classic')
    if (!result || !Array.isArray(result)) {
      let rawMsg = (result as any)?.errorMessage || (result as any)?.error || ''
      let cleanMsg = rawMsg
      try {
        const jsonMatch = rawMsg.match(/\{.*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.errorMessage) cleanMsg = parsed.errorMessage
          else if (parsed.error) cleanMsg = parsed.error
        }
      } catch (_) {}

      const isQuotaError = cleanMsg && (cleanMsg.includes('casier') || cleanMsg.includes('capacit') || cleanMsg.includes('quota') || cleanMsg.includes('max'))
      await Dialog.show(
        cleanMsg && isQuotaError
          ? cleanMsg
          : (cleanMsg || "Une erreur est survenue lors de l'enregistrement de votre skin. Veuillez réessayer."),
        [{ text: 'OK', type: 'ok' }],
        isQuotaError ? 'Casier plein' : 'Erreur'
      )
      return false
    }

    shared.skins = result
    await shared.resetMainView()
    await shared.resetSkinViews()

    // 7. Mettre à jour immédiatement la photo de profil (avatar) du joueur
    const activeSkin = shared.skins.find((s) => s.state === 'active')
    if (activeSkin?.url) {
      const { updateAvatarFromSkinUrl } = await import('../../../state')
      await updateAvatarFromSkinUrl(activeSkin.url)
    }

    hooks?.onSkinChanged?.()
    return true
  } catch (err) {
    logger.error('Erreur import skin:', err)
    await Dialog.show("Impossible d'importer ce skin pour le moment.", [{ text: 'OK', type: 'ok' }])
    return false
  }
}
