import type { Account, IAvatar, ICape, ISkin } from 'eml-lib'
import { SkinViewer, WalkingAnimation } from 'skinview3d'
import { skin } from './ipc'
import { Dialog } from './components/dialog'
import logger from 'electron-log/renderer'

const DEFAULT_SKIN = {
  id: 'steve',
  url: 'http://textures.minecraft.net/texture/d5c4ee5ce20aed9e33e866c66caa37178606234b3721084bf01d13320fb2eb3f',
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
        preserveDrawingBuffer: true
      })

      shared.mainSkinViewer.animation = new WalkingAnimation()
      shared.mainSkinViewer.animation!.speed = 0.3
      shared.mainSkinViewer.camera.position.set(-20, -2, 35)
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

    // Toujours charger le modèle standard classic 4px
    shared.mainSkinViewer.loadSkin(activeSkin.url, { model: 'default' })
    if (activeCape) shared.mainSkinViewer.loadCape(activeCape.url)
    else shared.mainSkinViewer.resetCape()
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
        height: 300
      })

      shared.auxiliarySkinViewer.animation = new WalkingAnimation()
      shared.auxiliarySkinViewer.animation!.progress = 0.5
      shared.auxiliarySkinViewer.animation!.speed = 0
      shared.auxiliarySkinViewer.zoom = 0.95
      shared.auxiliarySkinViewer.camera.position.set(-20, -2, 35)
      shared.auxiliarySkinViewer.controls.enabled = false
    }

    // Ordonner : les skins personnalisés en premier, et Steve / Alex toujours en dernier
    const customSkins: ISkin[] = []
    const defaultSkins: ISkin[] = []

    for (const s of shared.skins ?? []) {
      if (s.id === 'steve' || s.id === 'alex') {
        defaultSkins.push(s)
      } else {
        customSkins.push(s)
      }
    }

    // Steve puis Alex en fin de casier
    defaultSkins.sort((a) => (a.id === 'steve' ? -1 : 1))
    const orderedSkins = [...customSkins, ...defaultSkins]

    for (const s of (orderedSkins as (ISkin & { name?: string })[])) {
      const skinDiv = document.createElement('div')
      skinDiv.classList.add('skin-preview')
      if (s.state === 'active') skinDiv.classList.add('active')

      // Sélection d'un skin dans le casier
      skinDiv.addEventListener('click', async () => {
        if (s.state === 'active') return
        try {
          shared.skins = await skin.updateSkin(s.url, 'classic')
          await shared.resetMainView()
          await shared.resetSkinViews()
          // Mettre à jour immédiatement la photo de profil (avatar) et les infos d'identité
          const { updateAvatarFromSkinUrl } = await import('./state')
          await updateAvatarFromSkinUrl(s.url)
          const { refreshProfileIdentity } = await import('./pages/profile/profile')
          refreshProfileIdentity()
          document.getElementById('profile-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
        } catch (err) {
          logger.error('Error occurred while changing the skin:', err)
          await Dialog.show('Une erreur est survenue lors de la sélection du skin. Veuillez réessayer.', [{ text: 'Fermer', type: 'ok' }])
        }
      })

      const isSteve = s.id === 'steve'
      const isAlex = s.id === 'alex'
      const isDefault = isSteve || isAlex

      // Barre d'actions au survol (Renommer + Supprimer) pour les skins personnalisés
      if (!isDefault) {
        const actionsWrap = document.createElement('div')
        actionsWrap.classList.add('skin-card-actions')

        // Bouton Renommer
        const editBtn = document.createElement('button')
        editBtn.classList.add('btn-skin-action', 'btn-rename-skin')
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>'
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
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>'
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
      const displayName = s.name || (isSteve ? 'Steve' : isAlex ? 'Alex' : 'Personnalisé')
      skinLabel.innerText = displayName
      skinLabel.title = displayName
      skinDiv.title = `${displayName} (${s.state === 'active' ? 'Actif' : 'Cliquer pour équiper'})`

      if (shared.cachedSkinThumbnails.has(source)) {
        skinImg.src = shared.cachedSkinThumbnails.get(source)!
      } else {
        await shared.auxiliarySkinViewer.loadSkin(s.url, { model: 'default' })
        shared.auxiliarySkinViewer.render()

        skinImg.src = shared.auxiliarySkinViewer.canvas.toDataURL()
        shared.cachedSkinThumbnails.set(source, skinImg.src)
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
    capeSpan.innerHTML = '<i class="fa-solid fa-ban" style="display: block; font-size: 54px; color: #525252; position: relative; top: -5px;"></i>'
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

export default shared

