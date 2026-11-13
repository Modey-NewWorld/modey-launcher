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
  clean = clean.replace(/^http:\/\/192\.168\.1\.\d+(:\d+)?/, domain)
  clean = clean.replace(/^http:\/\/localhost(:\d+)?/, domain)
  clean = clean.replace(/^http:\/\/api\.modey\.flowcrea\.fr/, domain)
  return clean
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

const DEFAULT_SKIN = {
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
        renderPaused: true
      })

      shared.auxiliarySkinViewer.animation = new WalkingAnimation()
      shared.auxiliarySkinViewer.animation!.progress = 0.5
      shared.auxiliarySkinViewer.animation!.speed = 0
      shared.auxiliarySkinViewer.zoom = 0.95
      shared.auxiliarySkinViewer.camera.position.set(-20, -2, 35)
      shared.auxiliarySkinViewer.playerObject.rotation.y = DEFAULT_STUDIO_ROTATION_Y
      shared.auxiliarySkinViewer.controls.enabled = false
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

    for (const s of (orderedSkins as (ISkin & { name?: string })[])) {
      const skinDiv = document.createElement('div')
      skinDiv.classList.add('skin-preview')
      if (s.state === 'active') skinDiv.classList.add('active')

      let isBroken = false

      // Sélection d'un skin dans le casier
      skinDiv.addEventListener('click', async () => {
        if (isBroken) {
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

        if (s.state === 'active') return
        try {
          const cleanTargetUrl = normalizeSkinUrl(s.url)
          const updated = await skin.updateSkin(cleanTargetUrl, 'classic')
          if (updated && Array.isArray(updated)) {
            shared.skins = updated
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
          await shared.auxiliarySkinViewer.loadSkin(cleanUrl, { model: skinModel })
          shared.auxiliarySkinViewer.render()

          skinImg.src = shared.auxiliarySkinViewer.canvas.toDataURL()
          shared.cachedSkinThumbnails.set(source, skinImg.src)
        }
      } catch (err) {
        logger.warn('Failed to render thumbnail for skin:', cleanUrl, err)
        skinImg.src = createFallbackThumbnail()
        skinImg.alt = displayName
        isBroken = true
        skinDiv.classList.add('skin-broken')
        skinDiv.title = `${displayName} (Introuvable — Cliquez pour retirer)`
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

