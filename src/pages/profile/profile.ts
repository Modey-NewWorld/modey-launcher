import { getUser } from '../../state'
import shared from '../../shared'
import { bindStudio, refreshStudioMeta } from './components/studio3d'
import { Dialog } from '../../components/dialog'
import { getApiBaseUrl } from '../../services/runtime'
import { openDiscordInvite, openDiscordConnect, updateDiscordConfigFromStatus } from '../../services/discord'
import profileHtml from './index.html?raw'
import './profile.scss'

let emailVisible = false
let cachedEmail: string | null = null

const API_BASE = getApiBaseUrl()

const el = (id: string) => document.getElementById(id)

// La page Profil est une sous-page de #view-home (fin de conteneur).
const mount = el('view-home')
if (mount && !el('profile-page')) mount.insertAdjacentHTML('beforeend', profileHtml)

/** Identité : nom, UUID, email masqué, type de compte, avatar. */
export function refreshProfileIdentity() {
  const user = getUser() ?? shared.account
  const nameEl = el('profile-id-name')
  const badgeEl = el('profile-id-badge')
  const avatarEl = el('profile-id-avatar') as HTMLImageElement | null
  const uuidEl = el('profile-uuid')
  if (nameEl) nameEl.innerText = user?.name ?? '—'
  if (badgeEl) badgeEl.innerText = (user as any)?.meta?.type === 'msa' ? 'Compte Microsoft vérifié' : 'Compte joueur vérifié'
  if (avatarEl) avatarEl.src = shared.avatar?.url ?? 'https://minotar.net/avatar/steve/256.png'
  if (uuidEl) uuidEl.innerText = user?.uuid ?? '—'
  cachedEmail = (user as any)?.email ?? null
  emailVisible = false
  syncEmailUI()
  refreshStudioMeta()
  refreshDiscordStatus()

  const mcBadge = el('minecraft-license-badge')
  if (mcBadge) {
    const isMsa = (user as any)?.meta?.type === 'msa'
    mcBadge.innerText = isMsa ? 'Licence vérifiée' : 'Non vérifié'
    mcBadge.style.color = isMsa ? 'var(--success, #22C55E)' : 'var(--ink-500)'
  }
}

function syncEmailUI() {
  const emailEl = el('profile-email')
  const eyeBtn = el('btn-toggle-email') as HTMLButtonElement | null
  const eyeIcon = el('email-eye-icon')
  if (emailEl) emailEl.innerText = !cachedEmail ? '—' : emailVisible ? cachedEmail : '••••••••'
  if (eyeBtn) eyeBtn.disabled = !cachedEmail
  if (eyeIcon) {
    const use = eyeIcon.querySelector('use');
    if (use) use.setAttribute('href', emailVisible ? '#solar-eye-closed-bold' : '#solar-eye-bold');
  }
}

/** Synchronisation & état Discord */
export async function refreshDiscordStatus() {
  const token = shared.account?.accessToken
  const unlinkedView = el('discord-unlinked-view')
  const linkedView = el('discord-linked-view')
  const badgeStatus = el('discord-badge-status')
  const userTag = el('discord-user-tag')
  const userAvatar = el('discord-user-avatar') as HTMLImageElement | null

  if (!token) {
    if (unlinkedView) unlinkedView.style.display = 'block'
    if (linkedView) linkedView.style.display = 'none'
    if (badgeStatus) {
      badgeStatus.innerText = 'Non synchronisé'
      badgeStatus.className = 'discord-status-badge'
    }
    return
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/discord/status?token=${encodeURIComponent(token)}`)
    const data = await res.json()
    if (data) updateDiscordConfigFromStatus(data)

    if (data && data.linked) {
      if (unlinkedView) unlinkedView.style.display = 'none'
      if (linkedView) linkedView.style.display = 'block'
      if (badgeStatus) {
        badgeStatus.innerText = 'Synchronisé'
        badgeStatus.className = 'discord-status-badge linked'
      }
      if (userTag) userTag.innerText = `@${data.discord_username || 'Membre'}`
      if (userAvatar) {
        userAvatar.src = data.discord_avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'
      }
    } else {
      if (unlinkedView) unlinkedView.style.display = 'block'
      if (linkedView) linkedView.style.display = 'none'
      if (badgeStatus) {
        badgeStatus.innerText = 'Non synchronisé'
        badgeStatus.className = 'discord-status-badge'
      }
    }
  } catch (_) {
    // Si serveur injoignable, laisser l'état par défaut sans crash
  }
}

/** Stub de compatibilité : les widgets statut jeu / Athéna ont été supprimés de la page profil. */
export async function refreshProfileServer() {
  // Statuts serveur supprimés de la page profil
}

export function initProfile() {
  bindStudio({ onSkinChanged: refreshProfileIdentity })

  el('btn-toggle-email')?.addEventListener('click', () => {
    if (!cachedEmail) return
    emailVisible = !emailVisible
    syncEmailUI()
  })

  // Bouton : Lier mon compte Discord (URL dynamique via Modey Core)
  el('btn-link-discord')?.addEventListener('click', () => {
    openDiscordConnect(shared.account?.accessToken)

    // Poller quelques fois pour rafraîchir l'interface dès que la liaison est terminée
    setTimeout(refreshDiscordStatus, 3000)
    setTimeout(refreshDiscordStatus, 8000)
    setTimeout(refreshDiscordStatus, 15000)
  })

  // Boutons : Rejoindre / Ouvrir le Discord officiel (dynamique)
  el('btn-join-discord')?.addEventListener('click', () => {
    openDiscordInvite()
  })
  el('btn-open-discord')?.addEventListener('click', () => {
    openDiscordInvite()
  })

  // Bouton : Dissocier le compte Discord (avec état de chargement et retrait de rôle)
  const unlinkBtn = el('btn-unlink-discord') as HTMLButtonElement | null
  unlinkBtn?.addEventListener('click', async () => {
    const confirmed = await Dialog.show(
      'Êtes-vous sûr de vouloir dissocier votre compte Discord de votre profil Modey ?\n\nVos rôles seront immédiatement retirés sur le serveur Discord et vous perdrez vos accès aux salons réservés aux joueurs.',
      [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Dissocier', type: 'danger' }
      ]
    )
    if (!confirmed) return

    const token = shared.account?.accessToken
    if (!token) return

    const originalHtml = unlinkBtn.innerHTML
    unlinkBtn.disabled = true
    unlinkBtn.innerHTML = '<svg class="solar-icon spin" aria-hidden="true"><use href="#modey-spinner"></use></svg>&nbsp;Dissociation en cours...'

    try {
      const res = await fetch(`${API_BASE}/api/auth/discord/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })

      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Erreur serveur (${res.status})`)
      }

      await refreshDiscordStatus()
    } catch (err: any) {
      await Dialog.show(`Impossible de dissocier le compte Discord : ${err?.message || 'Erreur réseau'}`)
    } finally {
      if (unlinkBtn) {
        unlinkBtn.disabled = false
        unlinkBtn.innerHTML = originalHtml
      }
    }
  })

  refreshProfileIdentity()

  // Slider horizontal ultra-fluide pour la galerie de skins (lerp wheel + glisse inertielle)
  const skinGallery = el('skin-gallery')
  if (skinGallery) {
    let isDown = false
    let startX = 0
    let scrollStart = 0
    let lastX = 0
    let lastTime = 0
    let velocity = 0
    let momentumRAF: number | null = null
    let wheelRAF: number | null = null
    let targetScroll = skinGallery.scrollLeft
    let hasMoved = false

    const stopMomentum = () => {
      if (momentumRAF !== null) {
        cancelAnimationFrame(momentumRAF)
        momentumRAF = null
      }
    }

    const stopWheel = () => {
      if (wheelRAF !== null) {
        cancelAnimationFrame(wheelRAF)
        wheelRAF = null
      }
    }

    // Molette avec défilement doux et contrôlé (lerp)
    skinGallery.addEventListener('wheel', (e) => {
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (delta !== 0) {
        e.preventDefault()
        stopMomentum()

        const maxScroll = skinGallery.scrollWidth - skinGallery.clientWidth
        // Défilement modéré (vitesse douce et maîtrisée)
        targetScroll = Math.max(0, Math.min(maxScroll, targetScroll + delta * 0.4))

        if (wheelRAF === null) {
          const animateWheel = () => {
            const current = skinGallery.scrollLeft
            const diff = targetScroll - current
            if (Math.abs(diff) < 0.5) {
              skinGallery.scrollLeft = targetScroll
              wheelRAF = null
              return
            }
            skinGallery.scrollLeft = current + diff * 0.14
            wheelRAF = requestAnimationFrame(animateWheel)
          }
          wheelRAF = requestAnimationFrame(animateWheel)
        }
      }
    }, { passive: false })

    // Glissement à la souris (drag 1:1)
    skinGallery.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('.btn-skin-action')) return
      isDown = true
      hasMoved = false
      stopMomentum()
      stopWheel()
      targetScroll = skinGallery.scrollLeft
      startX = e.pageX - skinGallery.offsetLeft
      scrollStart = skinGallery.scrollLeft
      lastX = e.pageX
      lastTime = performance.now()
      velocity = 0
    })

    window.addEventListener('mouseup', () => {
      if (!isDown) return
      isDown = false
      setTimeout(() => skinGallery.classList.remove('is-dragging'), 30)

      // Inertie très douce et courte au relâchement rapide
      if (Math.abs(velocity) > 0.15) {
        let currentVelocity = Math.max(-10, Math.min(10, velocity * 4))
        const applyMomentum = () => {
          if (Math.abs(currentVelocity) < 0.3) {
            momentumRAF = null
            targetScroll = skinGallery.scrollLeft
            return
          }
          skinGallery.scrollLeft -= currentVelocity
          targetScroll = skinGallery.scrollLeft
          currentVelocity *= 0.82 // arrêt rapide et naturel
          momentumRAF = requestAnimationFrame(applyMomentum)
        }
        momentumRAF = requestAnimationFrame(applyMomentum)
      } else {
        targetScroll = skinGallery.scrollLeft
      }
    })

    skinGallery.addEventListener('mousemove', (e) => {
      if (!isDown) return
      const now = performance.now()
      const dt = now - lastTime
      const x = e.pageX - skinGallery.offsetLeft
      const walk = x - startX

      if (Math.abs(walk) > 2) {
        hasMoved = true
        skinGallery.classList.add('is-dragging')
        e.preventDefault()
        skinGallery.scrollLeft = scrollStart - walk
        targetScroll = skinGallery.scrollLeft

        if (dt > 0) {
          velocity = (e.pageX - lastX) / dt
        }
        lastX = e.pageX
        lastTime = now
      }
    })

    // Empêcher l'équipement accidentel d'un skin si l'utilisateur glissait
    skinGallery.addEventListener('click', (e) => {
      if (hasMoved) {
        e.stopImmediatePropagation()
        e.preventDefault()
        hasMoved = false
      }
    }, true)
  }

  bindLockerDragAndDrop()
}

/**
 * Active le glisser-déposer (Drag & Drop) d'un skin PNG directement sur la carte Casier.
 */
function bindLockerDragAndDrop() {
  const lockerCard = document.querySelector('.locker-card') as HTMLElement | null
  if (!lockerCard) return

  let dragCounter = 0

  lockerCard.addEventListener('dragenter', (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter++
    lockerCard.classList.add('is-dragover')
  })

  lockerCard.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  })

  lockerCard.addEventListener('dragleave', (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      lockerCard.classList.remove('is-dragover')
    }
  })

  lockerCard.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter = 0
    lockerCard.classList.remove('is-dragover')

    const file = e.dataTransfer?.files?.[0]
    if (!file) return

    const { processSkinFile } = await import('./components/studio3d')
    await processSkinFile(file, { onSkinChanged: refreshProfileIdentity })
  })
}
