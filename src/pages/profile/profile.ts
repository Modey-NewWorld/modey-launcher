import { getUser } from '../../state'
import shared from '../../shared'
import { bindStudio, refreshStudioMeta } from './components/studio3d'
import { Dialog } from '../../components/dialog'
import profileHtml from './index.html?raw'
import './profile.scss'

let emailVisible = false
let cachedEmail: string | null = null

const API_BASE = 'https://api.modey.flowcrea.fr'

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
}

function syncEmailUI() {
  const emailEl = el('profile-email')
  const eyeBtn = el('btn-toggle-email') as HTMLButtonElement | null
  const eyeIcon = el('email-eye-icon')
  if (emailEl) emailEl.innerText = !cachedEmail ? '—' : emailVisible ? cachedEmail : '••••••••'
  if (eyeBtn) eyeBtn.disabled = !cachedEmail
  if (eyeIcon) eyeIcon.className = emailVisible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'
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

  // Bouton : Lier mon compte Discord
  el('btn-link-discord')?.addEventListener('click', () => {
    const token = shared.account?.accessToken
    const loginUrl = token
      ? `${API_BASE}/api/auth/discord/login?token=${encodeURIComponent(token)}`
      : `${API_BASE}/api/auth/discord/login`
    window.open(loginUrl)

    // Poller quelques fois pour rafraîchir l'interface dès que la liaison est terminée
    setTimeout(refreshDiscordStatus, 3000)
    setTimeout(refreshDiscordStatus, 8000)
    setTimeout(refreshDiscordStatus, 15000)
  })

  // Bouton : Dissocier le compte Discord
  el('btn-unlink-discord')?.addEventListener('click', async () => {
    const confirmed = await Dialog.show(
      'Êtes-vous sûr de vouloir dissocier votre compte Discord de votre profil Modey ?\n\nVous perdrez vos accès aux salons réservés aux joueurs sur le serveur Discord.',
      [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Dissocier', type: 'danger' }
      ]
    )
    if (!confirmed) return

    const token = shared.account?.accessToken
    if (!token) return

    try {
      await fetch(`${API_BASE}/api/auth/discord/unlink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      await refreshDiscordStatus()
    } catch (_) {}
  })

  refreshProfileIdentity()
}
