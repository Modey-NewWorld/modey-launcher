import { getUser } from '../../state'
import shared from '../../shared'
import { bindStudio, refreshStudioMeta } from './components/studio3d'
import profileHtml from './index.html?raw'
import './profile.scss'

let emailVisible = false
let cachedEmail: string | null = null

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
}

function syncEmailUI() {
  const emailEl = el('profile-email')
  const eyeBtn = el('btn-toggle-email') as HTMLButtonElement | null
  const eyeIcon = el('email-eye-icon')
  if (emailEl) emailEl.innerText = !cachedEmail ? '—' : emailVisible ? cachedEmail : '••••••••'
  if (eyeBtn) eyeBtn.disabled = !cachedEmail
  if (eyeIcon) eyeIcon.className = emailVisible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'
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

  refreshProfileIdentity()
}
