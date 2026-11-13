import type { Account, IAvatar, ICape, ISkin } from 'eml-lib'
import { SkinViewer, WalkingAnimation } from 'skinview3d'
import { skin } from './ipc'
import { Dialog } from './components/dialog'
import logger from 'electron-log/renderer'
import { onThemeChange } from './theme'
import { getApiBaseUrl } from './services/runtime'


export const DEFAULT_STUDIO_ROTATION_Y = -Math.PI / 4

interface StudioSessionState {
  cameraPosition: { x: number; y: number; z: number }
  playerRotationY: number
  autoRotate: boolean
}

let studioSessionState: StudioSessionState | null = null

export function normalizeSkinUrl(url: string | null | undefined): string {
  if (!url) return ''
  let clean = url.trim()
  const domain = getApiBaseUrl()
  clean = clean.replace(/^https?:\/\/192\.168\.1\.\d+(:\d+)?/, domain)
  clean = clean.replace(/^https?:\/\/localhost(:\d+)?/, domain)
  clean = clean.replace(/^https?:\/\/api\.modey\.flowcrea\.fr(:\d+)?/, domain)
  return clean
}

export function createSkin2DThumbnail(img: CanvasImageSource, isSlim = false): string {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 150
  const ctx = canvas.getContext('2d')
  if (!ctx) return createFallbackThumbnail()

  ctx.imageSmoothingEnabled = false

  // Personnage centré en vue face pixel-art propre
  const headSize = 44
  const headX = Math.round((canvas.width - headSize) / 2)
  const headY = 12
  // Tête de base (8,8, 8x8) + Chapeau (40,8, 8x8)
  ctx.drawImage(img, 8, 8, 8, 8, headX, headY, headSize, headSize)
  ctx.drawImage(img, 40, 8, 8, 8, headX, headY, headSize, headSize)

  // Torso (20,20, 8x12) + Veste (20,36, 8x12)
  const bodyW = 44
  const bodyH = 58
  const bodyX = headX
  const bodyY = headY + headSize
  ctx.drawImage(img, 20, 20, 8, 12, bodyX, bodyY, bodyW, bodyH)
  ctx.drawImage(img, 20, 36, 8, 12, bodyX, bodyY, bodyW, bodyH)

  // Bras
  const armW = isSlim ? 16 : 20
  const armH = 58
  // Bras droit (44,20, 4x12)
  ctx.drawImage(img, 44, 20, 4, 12, bodyX - armW, bodyY, armW, armH)
  // Bras gauche (36,52, 4x12)
  const imgH = (img as any).naturalHeight || (img as any).height || 64
  if (imgH >= 64) {
    ctx.drawImage(img, 36, 52, 4, 12, bodyX + bodyW, bodyY, armW, armH)
  } else {
    ctx.drawImage(img, 44, 20, 4, 12, bodyX + bodyW, bodyY, armW, armH)
  }

  // Jambes
  const legW = 20
  const legH = 22
  const legY = bodyY + bodyH
  ctx.drawImage(img, 4, 20, 4, 12, bodyX + 2, legY, legW, legH)
  if (imgH >= 64) {
    ctx.drawImage(img, 20, 52, 4, 12, bodyX + bodyW - legW - 2, legY, legW, legH)
  } else {
    ctx.drawImage(img, 4, 20, 4, 12, bodyX + bodyW - legW - 2, legY, legW, legH)
  }

  return canvas.toDataURL()
}

function createFallbackThumbnail(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 150
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const cs = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null
    ctx.fillStyle = cs ? cs.getPropertyValue('--bg-sunken').trim() || '#131B26' : '#131B26'
    ctx.fillRect(0, 0, 120, 150)
    ctx.fillStyle = cs ? cs.getPropertyValue('--ink-500').trim() || '#94A3B8' : '#94A3B8'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Skin', 60, 80)
  }
  return canvas.toDataURL()
}

export const DEFAULT_SKIN = {
  id: 'steve',
  url: 'http://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb',
  variant: 'classic',
  state: 'active'
}

const shared = {
  account: null as Account | null,
  skins: null as ISkin[] | null,
  capes: null as ICape[] | null,
  avatar: null as IAvatar | null,
  selectedProfile: null as any,
  mainSkinViewer: null as SkinViewer | null,
  auxiliarySkinViewer: null as SkinViewer | null,
  cachedSkinThumbnails: new Map<string, string>(),
  cachedCapeThumbnails: new Map<string, string>(),
  /** Préférence studio 3D : animation de marche (persistée en local, survit au redémarrage). */
  isStudioAnimationEnabled: () => localStorage.getItem('modey-studio-animation') !== 'off',
  setStudioAnimationEnabled: (enabled: boolean) => localStorage.setItem('modey-studio-animation', enabled ? 'on' : 'off'),
  /**
   * `skins` should be updated before calling this function.
   */
  resetMainView: async () => {
    const skinCanvasSettingsEl = document.getElementById('skin-container') as HTMLCanvasElement
    if (!skinCanvasSettingsEl) return

    const activeSkin = shared.skins?.find((s) => s.state === 'active') ?? DEFAULT_SKIN
    const activeCape = shared.capes?.find((c) => c.state === 'active')

    const parent = skinCanvasSettingsEl.parentElement
    const targetWidth = parent ? Math.max(parent.clientWidth, 260) : 480
    const targetHeight = parent ? Math.max(parent.clientHeight, 300) : 520

    if (!shared.mainSkinViewer) {
      shared.mainSkinViewer = new SkinViewer({
        canvas: skinCanvasSettingsEl,
        width: targetWidth,
        height: targetHeight,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        preserveDrawingBuffer: false
      })

      shared.mainSkinViewer.animation = new WalkingAnimation()
      shared.mainSkinViewer.animation!.speed = 0.3
      shared.mainSkinViewer.camera.position.set(-20, -2, 35)
      shared.mainSkinViewer.playerObject.rotation.y = DEFAULT_STUDIO_ROTATION_Y
      // Activer le zoom avec des limites contrôlées (évite de traverser le joueur ou de s'éloigner trop)
      shared.mainSkinViewer.controls.enableZoom = true
      shared.mainSkinViewer.controls.minDistance = 15
      shared.mainSkinViewer.controls.maxDistance = 75
      shared.mainSkinViewer.controls.enablePan = false
      shared.mainSkinViewer.controls.rotateSpeed = 0.5
      shared.mainSkinViewer.controls.update()

      // Observer les changements de taille de la fenêtre et du conteneur en temps réel
      if (parent && typeof ResizeObserver !== 'undefined') {
        const resizeObs = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const w = Math.round(entry.contentRect.width)
            const h = Math.round(entry.contentRect.height)
            if (w > 100 && h > 100 && shared.mainSkinViewer) {
              shared.mainSkinViewer.setSize(w, h)
            }
          }
        })
        resizeObs.observe(parent)
      }
    } else {
      shared.mainSkinViewer.setSize(targetWidth, targetHeight)
      shared.mainSkinViewer.controls.enableZoom = true
      shared.mainSkinViewer.controls.minDistance = 15
      shared.mainSkinViewer.controls.maxDistance = 75
      if (!shared.restoreStudioSessionState()) {
        shared.mainSkinViewer.playerObject.rotation.y = DEFAULT_STUDIO_ROTATION_Y
      }
    }

    // Respecte la préférence sauvegardée (bouton Animation de la page Mon Profil)
    if (shared.isStudioAnimationEnabled()) {
      if (!shared.mainSkinViewer.animation) {
        shared.mainSkinViewer.animation = new WalkingAnimation()
        shared.mainSkinViewer.animation.speed = 0.3
      }
    } else {
      shared.mainSkinViewer.animation = null
    }

    // Modèle classique 4px ou slim 3px selon les métadonnées du skin
    const skinModel = (activeSkin as any)?.variant === 'slim' ? 'slim' : 'default'
    shared.mainSkinViewer.loadSkin(normalizeSkinUrl(activeSkin.url), { model: skinModel })
    if (activeCape) shared.mainSkinViewer.loadCape(activeCape.url)
    else shared.mainSkinViewer.resetCape()
  },
  /** Sauvegarde l'orientation, la caméra et la rotation 360 en mémoire vive (RAM de session) */
  saveStudioSessionState: () => {
    if (!shared.mainSkinViewer) return
    studioSessionState = {
      cameraPosition: {
        x: shared.mainSkinViewer.camera.position.x,
        y: shared.mainSkinViewer.camera.position.y,
        z: shared.mainSkinViewer.camera.position.z
      },
      playerRotationY: shared.mainSkinViewer.playerObject.rotation.y,
      autoRotate: Boolean(shared.mainSkinViewer.autoRotate)
    }
  },
  /** Restaure l'état 3D enregistré lors de la session active */
  restoreStudioSessionState: () => {
    if (!shared.mainSkinViewer) return false
    if (!studioSessionState) return false
    shared.mainSkinViewer.camera.position.set(
      studioSessionState.cameraPosition.x,
      studioSessionState.cameraPosition.y,
      studioSessionState.cameraPosition.z
    )
    shared.mainSkinViewer.playerObject.rotation.y = studioSessionState.playerRotationY
    shared.mainSkinViewer.autoRotate = studioSessionState.autoRotate
    if (studioSessionState.autoRotate) {
      shared.mainSkinViewer.autoRotateSpeed = 1.2
    }
    return true
  },
  /** Met en pause la boucle de rendu WebGL et fige la caméra en RAM pour économiser le GPU */
  pauseStudio: () => {
    if (!shared.mainSkinViewer) return
    shared.saveStudioSessionState()
    shared.mainSkinViewer.renderPaused = true
  },
  /** Relance la boucle WebGL et restaure l'état de session du studio 3D */
  resumeStudio: () => {
    if (!shared.mainSkinViewer) return
    shared.restoreStudioSessionState()
    shared.mainSkinViewer.renderPaused = false
    shared.mainSkinViewer.render()
  },
  /**
   * `skins` should be updated before calling this function.
   */
  resetSkinViews: async () => {
    const skinGallerySettingsEl = document.getElementById('skin-gallery')!
    if (!skinGallerySettingsEl) return

    skinGallerySettingsEl.innerHTML = ''

    if (!shared.auxiliarySkinViewer) {
      shared.auxiliarySkinViewer = new SkinViewer({
        canvas: document.createElement('canvas'),
        width: 240,
        height: 300,
        pixelRatio: 1,
        renderPaused: true,
        preserveDrawingBuffer: true
      })

      shared.auxiliarySkinViewer.animation = new WalkingAnimation()
      shared.auxiliarySkinViewer.animation!.progress = 0.5
      shared.auxiliarySkinViewer.animation!.speed = 0
      shared.auxiliarySkinViewer.zoom = 0.95
      shared.auxiliarySkinViewer.camera.position.set(-20, -2, 35)
      shared.auxiliarySkinViewer.controls.enabled = false
      shared.auxiliarySkinViewer.controls.update()
      if (shared.auxiliarySkinViewer.animation) {
        shared.auxiliarySkinViewer.animation.update(shared.auxiliarySkinViewer.playerObject, 0)
      }
    }

    // Ordonner : les skins personnalisés uniques en premier, et un seul Steve en dernier
    const customSkins: (ISkin & { name?: string })[] = []
    const defaultSkins: (ISkin & { name?: string })[] = []
    const seenUrls = new Set<string>()

    for (const s of shared.skins ?? []) {
      if (!s || !s.url) continue
      const norm = normalizeSkinUrl(s.url)
      const isSteve = s.id === 'steve' || s.id === 'alex' || norm === DEFAULT_SKIN.url
      if (isSteve) {
        if (defaultSkins.length === 0) {
          defaultSkins.push({ ...s, url: DEFAULT_SKIN.url, id: 'steve', name: 'Steve' })
        }
      } else {
        if (!seenUrls.has(norm)) {
          seenUrls.add(norm)
          customSkins.push({ ...s, url: norm })
        }
      }
    }

    if (defaultSkins.length === 0) {
      defaultSkins.push({
        id: 'steve',
        url: DEFAULT_SKIN.url,
        variant: 'classic',
        state: customSkins.some(c => c.state === 'active') ? 'inactive' : 'active',
        name: 'Steve'
      })
    }

    const orderedSkins = [...customSkins, ...defaultSkins]

    // Quota dynamique selon le serveur et le rôle du compte
    const user = shared.account
    let maxSkins: number = typeof (user as any)?.maxSkins === 'number' && (user as any).maxSkins > 0
      ? (user as any).maxSkins
      : 0
    if (!maxSkins) {
      const role = ((user as any)?.role || 'citizen').toLowerCase()
      if (role === 'founder' || role === 'admin') maxSkins = 50
      else if (role === 'moderator' || role === 'developer' || role === 'dev') maxSkins = 20
      else if (role === 'builder') maxSkins = 15
      else maxSkins = 5
    }

    // Case d'import/ajout en tout premier si le quota n'est pas encore atteint
    if (customSkins.length < maxSkins) {
      const addCard = document.createElement('div')
      addCard.classList.add('skin-preview', 'skin-add-card')
      addCard.id = 'btn-add-skin-card'
      addCard.setAttribute('role', 'button')
      addCard.setAttribute('tabindex', '0')
      addCard.setAttribute('aria-label', 'Ajouter un nouveau skin')
      addCard.title = `Ajouter un skin (${customSkins.length}/${maxSkins} utilisé${customSkins.length > 1 ? 's' : ''})`
      addCard.innerHTML = `
        <div class="skin-add-inner">
          <div class="skin-add-icon">
            <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-upload-bold"></use></svg>
          </div>
          <span class="skin-add-title">Ajouter un skin</span>
          <span class="skin-add-sub">PNG 64×64</span>
        </div>
      `
      const triggerUpload = () => {
        const fileInput = document.getElementById('input-import-skin') as HTMLInputElement | null
        fileInput?.click()
      }
      addCard.addEventListener('click', triggerUpload)
      addCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          triggerUpload()
        }
      })
      skinGallerySettingsEl.appendChild(addCard)
    }

    for (const s of (orderedSkins as (ISkin & { name?: string })[])) {
      const skinDiv = document.createElement('div')
      skinDiv.classList.add('skin-preview')
      if (s.state === 'active') skinDiv.classList.add('active')

      // Sélection d'un skin dans le casier
      skinDiv.addEventListener('click', async () => {
        if (s.state === 'active') return
        try {
          const cleanTargetUrl = normalizeSkinUrl(s.url)
          const updated = await skin.updateSkin(cleanTargetUrl, 'classic')
          if (updated && Array.isArray(updated)) {
            shared.skins = updated
          } else if ((updated as any)?.error || (updated as any)?.errorMessage) {
            const errStr = String((updated as any)?.errorMessage || (updated as any)?.error || '').toLowerCase()
            if (errStr.includes('404') || errStr.includes('introuvable') || errStr.includes('not found') || errStr.includes('inexistant')) {
              const confirmed = await Dialog.show(
                `Ce fichier de skin est introuvable sur le serveur.\n\nSouhaitez-vous retirer cette entrée vide de votre casier ?`,
                [
                  { text: 'Annuler', type: 'cancel' },
                  { text: 'Retirer du casier', type: 'danger' }
                ],
                'Skin introuvable'
              )
              if (confirmed) {
                try {
                  shared.skins = await skin.deleteSkin(s.id)
                  await shared.resetMainView()
                  await shared.resetSkinViews()
                } catch (delErr) {
                  logger.error('Erreur retrait skin introuvable:', delErr)
                }
              }
              return
            }
          }

          await shared.resetMainView()
          await shared.resetSkinViews()
          // Mettre à jour immédiatement la photo de profil (avatar) et les infos d'identité
          const { updateAvatarFromSkinUrl } = await import('./state')
          await updateAvatarFromSkinUrl(cleanTargetUrl)
          const { refreshProfileIdentity } = await import('./pages/profile/profile')
          refreshProfileIdentity()
          document.getElementById('profile-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
        } catch (err) {
          logger.error('Error occurred while changing the skin:', err)
          await Dialog.show('Une erreur est survenue lors de la sélection du skin. Veuillez réessayer.', [{ text: 'Fermer', type: 'ok' }])
        }
      })

      const isSteve = s.id === 'steve'
      const isDefault = isSteve

      // Barre d'actions au survol (Renommer + Supprimer) pour les skins personnalisés
      if (!isDefault) {
        const actionsWrap = document.createElement('div')
        actionsWrap.classList.add('skin-card-actions')

        // Bouton Renommer
        const editBtn = document.createElement('button')
        editBtn.classList.add('btn-skin-action', 'btn-rename-skin')
        editBtn.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-pen-bold"></use></svg>'
        editBtn.title = 'Renommer ce skin'
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation()
          const currentName = s.name || 'Personnalisé'
          const newName = await Dialog.prompt('Entrez un nouveau nom pour ce skin :', currentName, 'Renommer le skin')
          if (newName !== null && newName.trim() !== '') {
            try {
              shared.skins = await skin.renameSkin(s.id, newName.trim())
              await shared.resetSkinViews()
              const { refreshProfileIdentity } = await import('./pages/profile/profile')
              refreshProfileIdentity()
            } catch (err) {
              logger.error('Erreur renommage skin:', err)
              await Dialog.show('Impossible de renommer le skin.', [{ text: 'OK', type: 'ok' }])
            }
          }
        })
        actionsWrap.appendChild(editBtn)

        // Bouton Supprimer
        const deleteBtn = document.createElement('button')
        deleteBtn.classList.add('btn-skin-action', 'btn-delete-skin')
        deleteBtn.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-trash-bold"></use></svg>'
        deleteBtn.title = 'Supprimer ce skin du casier'
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation()
          const confirmed = await Dialog.show(
            `Êtes-vous sûr de vouloir supprimer le skin "${s.name || 'Personnalisé'}" de votre casier ?`,
            [
              { text: 'Annuler', type: 'cancel' },
              { text: 'Supprimer', type: 'danger' }
            ],
            'Supprimer le skin'
          )
          if (!confirmed) return

          try {
            shared.skins = await skin.deleteSkin(s.id)
            await shared.resetMainView()
            await shared.resetSkinViews()
          } catch (err) {
            logger.error('Error occurred while deleting the skin:', err)
            await Dialog.show('Une erreur est survenue lors de la suppression du skin.', [{ text: 'OK', type: 'ok' }])
          }
        })
        actionsWrap.appendChild(deleteBtn)

        skinDiv.appendChild(actionsWrap)
      }

      const source = `${s.url}-classic`
      const skinImg = document.createElement('img') as HTMLImageElement
      skinImg.draggable = false
      const skinLabel = document.createElement('span')
      const displayName = s.name || (isSteve ? 'Steve' : 'Personnalisé')
      skinLabel.innerText = displayName
      skinLabel.title = displayName
      skinDiv.title = `${displayName} (${s.state === 'active' ? 'Actif' : 'Cliquer pour équiper'})`

      const cleanUrl = normalizeSkinUrl(s.url)
      const skinModel = (s as any)?.variant === 'slim' ? 'slim' : 'default'
      try {
        if (shared.cachedSkinThumbnails.has(source)) {
          skinImg.src = shared.cachedSkinThumbnails.get(source)!
        } else {
          // 1. Récupérer le skin sous forme de data URL via IPC pour éviter tout problème CORS dans Electron
          let skinSource = cleanUrl
          try {
            const dataUrl = await skin.getSkinDataUrl(cleanUrl)
            if (dataUrl) skinSource = dataUrl
          } catch (_) {}

          try {
            await shared.auxiliarySkinViewer.loadSkin(skinSource, { model: skinModel })
            shared.auxiliarySkinViewer.controls.update()
            if (shared.auxiliarySkinViewer.animation) {
              shared.auxiliarySkinViewer.animation.update(shared.auxiliarySkinViewer.playerObject, 0)
            }
            shared.auxiliarySkinViewer.render()

            skinImg.src = shared.auxiliarySkinViewer.canvas.toDataURL()
            shared.cachedSkinThumbnails.set(source, skinImg.src)
          } catch (render3dErr) {
            // 2. Si le moteur 3D échoue (WebGL occupé ou glitch), générer immédiatement l'aperçu 2D pixel-art
            const img = new Image()
            img.crossOrigin = 'anonymous'
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve()
              img.onerror = reject
              img.src = skinSource
            })
            skinImg.src = createSkin2DThumbnail(img, (s as any)?.variant === 'slim')
            shared.cachedSkinThumbnails.set(source, skinImg.src)
          }
        }
      } catch (err) {
        logger.warn('Failed to render thumbnail for skin:', cleanUrl, err)
        skinImg.src = createFallbackThumbnail()
        skinImg.alt = displayName
      }

      skinDiv.appendChild(skinImg)
      skinDiv.appendChild(skinLabel)
      skinGallerySettingsEl?.appendChild(skinDiv)
    }
  },
  /**
   * `capes` should be updated before calling this function.
   */
  resetCapesViews: async () => {
    const capeGallerySettingsEl = document.getElementById('cape-gallery')
    if (!capeGallerySettingsEl) return
    const inactive = !shared.capes?.some((c) => c.state === 'active')

    capeGallerySettingsEl.innerHTML = ''

    const capeDiv = document.createElement('div')
    capeDiv.classList.add('cape-preview')
    if (inactive) capeDiv.classList.add('active')
    capeDiv.addEventListener('click', async () => {
      if (!inactive) {
        try {
          shared.capes = await skin.hideCape()
          shared.resetMainView()
          shared.resetCapesViews()
          document.getElementById('profile-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
        } catch (err) {
          logger.error('Error occurred while unequipping the cape:', err)
          await Dialog.show('An error occurred while unequipping the cape. Please try again in few minutes.', [{ text: 'Close', type: 'ok' }])
        }
      }
    })

    const capeSpan = document.createElement('span')
    capeSpan.innerHTML = '<svg class="solar-icon solar-bold" style="display: block; font-size: 54px; color: var(--ink-400); position: relative; top: -5px;"></i>'
    capeDiv.appendChild(capeSpan)
    capeGallerySettingsEl?.appendChild(capeDiv)

    for (const c of shared.capes ?? []) {
      const capeDiv = document.createElement('div')
      capeDiv.classList.add('cape-preview')
      if (c.state === 'active') capeDiv.classList.add('active')
      capeDiv.addEventListener('click', async () => {
        if (c.state === 'active') return
        try {
          shared.capes = await skin.switchCape(c.id)
          shared.resetMainView()
          shared.resetCapesViews()
          document.getElementById('profile-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
        } catch (err) {
          logger.error('Error occurred while changing the cape:', err)
          await Dialog.show('An error occurred while changing the cape. Please try again in few minutes.', [{ text: 'Close', type: 'ok' }])
        }
      })

      const capeImg = document.createElement('img') as HTMLImageElement
      const capeSpan = document.createElement('span')
      if (shared.cachedCapeThumbnails.has(c.url)) {
        capeImg.src = shared.cachedCapeThumbnails.get(c.url)!
        capeDiv.appendChild(capeImg)
        capeGallerySettingsEl?.appendChild(capeDiv)
      } else {
        const req = await fetch(c.url)
        const blob = await req.blob()
        const img = await createImageBitmap(blob)

        const canvas = document.createElement('canvas')
        canvas.width = 100
        canvas.height = 160

        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 1, 1, 10, 16, 0, 0, 100, 160)

        capeImg.src = canvas.toDataURL()
        shared.cachedCapeThumbnails.set(c.url, capeImg.src)
      }

      capeSpan.innerHTML = c.alias
      capeDiv.appendChild(capeImg)
      capeDiv.appendChild(capeSpan)
      capeGallerySettingsEl?.appendChild(capeDiv)
    }
  }
}

onThemeChange(() => {
  if (shared.mainSkinViewer) {
    shared.mainSkinViewer.render()
  }
})

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      shared.pauseStudio()
    } else {
      const profilePage = document.getElementById('profile-page')
      if (profilePage && profilePage.style.display !== 'none') {
        shared.resumeStudio()
      }
    }
  })
}

export default shared

