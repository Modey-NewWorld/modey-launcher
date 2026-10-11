import { getUser, setUser, setView, logout as clearSession } from '../state'
import { auth, server, skin } from '../ipc'
import shared from '../shared'
import { WalkingAnimation } from 'skinview3d'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'
import profileConfig from '../../config/athena-profile.json'
import freeBuildConfig from '../../config/free-build-profile.json'

let profileModel: 'classic' | 'slim' = 'classic'
let rotating = false
let emailVisible = false
let cachedEmail: string | null = null

const RANKS: Record<string, string> = {
  athena: 'Citoyen de la Cité',
  'free-build': 'Bâtisseur'
}

const isComingSoon = (p: any) => !p || p.slug === freeBuildConfig.slug || !p.ip || !p.port

function selectedOrDefault() {
  return shared.selectedProfile ?? { slug: 'athena', name: 'Athéna', ip: null, port: null }
}

function viewer() {
  return shared.mainSkinViewer
}

/** Nom affiché dans le studio : variante du skin actif. */
export function refreshStudioMeta() {
  const active = shared.skins?.find((s) => s.state === 'active')
  const nameEl = document.getElementById('studio-skin-name')
  if (nameEl) {
    const variant = active?.variant === 'slim' ? '(3px)' : '(4px)'
    const label = active && active.id !== 'steve' && active.id !== 'alex' ? `${active.id} ${variant}` : `Alex ${variant}`
    nameEl.innerText = label
  }
  if (active?.variant) {
    profileModel = active.variant === 'slim' ? 'slim' : 'classic'
    syncModelButtons()
  }
  syncCapeUI()
}

function syncModelButtons() {
  document.getElementById('btn-model-classic')?.classList.toggle('active', profileModel === 'classic')
  document.getElementById('btn-model-slim')?.classList.toggle('active', profileModel === 'slim')
}

function applyModelToViewer() {
  const v = viewer()
  const active = shared.skins?.find((s) => s.state === 'active')
  if (!v || !active) return
  v.loadSkin(active.url, { model: profileModel === 'slim' ? 'slim' : 'default' })
}

function syncCapeUI() {
  const check = document.getElementById('check-cape') as HTMLInputElement | null
  const label = document.getElementById('cape-check-label')
  const pill = document.getElementById('studio-cape')
  const activeCape = shared.capes?.find((c) => c.state === 'active')
  if (check) {
    check.checked = !!activeCape
    check.disabled = !shared.capes || shared.capes.length === 0
  }
  if (label) label.innerText = activeCape ? `Afficher la cape ${activeCape.alias ?? ''} (Exclusif)` : 'Afficher la cape'
  if (pill) pill.innerText = activeCape ? `Cape ${activeCape.alias ?? ''} : Activée` : 'Aucune cape'
}

/** Identité : nom, UUID, email masqué, type de compte, avatar. */
export function refreshProfileIdentity() {
  const user = getUser() ?? shared.account
  const nameEl = document.getElementById('profile-id-name')
  const badgeEl = document.getElementById('profile-id-badge')
  const avatarEl = document.getElementById('profile-id-avatar') as HTMLImageElement | null
  const uuidEl = document.getElementById('profile-uuid')
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
  const emailEl = document.getElementById('profile-email')
  const eyeBtn = document.getElementById('btn-toggle-email') as HTMLButtonElement | null
  const eyeIcon = document.getElementById('email-eye-icon')
  if (emailEl) emailEl.innerText = !cachedEmail ? '—' : emailVisible ? cachedEmail : '••••••••'
  if (eyeBtn) eyeBtn.disabled = !cachedEmail
  if (eyeIcon) eyeIcon.className = emailVisible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'
}

/** Infos dépendantes du serveur sélectionné : favori, rang, synchro, ping. */
export async function refreshProfileServer() {
  const p = selectedOrDefault()
  const favEl = document.getElementById('profile-fav-server')
  const rankEl = document.getElementById('profile-rank')
  const dotEl = document.getElementById('profile-server-dot')
  const titleEl = document.getElementById('sync-title')
  const subEl = document.getElementById('sync-sub')
  const pingEl = document.getElementById('sync-ping')
  if (favEl) favEl.innerText = p.name ?? 'Athéna'
  if (rankEl) rankEl.innerText = RANKS[p.slug] ?? 'Joueur'

  if (isComingSoon(p)) {
    if (dotEl) (dotEl as HTMLElement).style.background = '#e53935'
    if (titleEl) titleEl.innerText = `Free Build n'est pas encore actif — aperçu local`
    if (subEl) subEl.innerText = freeBuildConfig.teaser.description
    if (pingEl) pingEl.innerText = '—'
    return
  }

  const host = p.ip || profileConfig.server.host
  const port = p.port || profileConfig.server.port
  try {
    const startedAt = performance.now()
    const st = await server.getStatus(host, port)
    const ping = Math.max(1, Math.round(performance.now() - startedAt))
    if (dotEl) (dotEl as HTMLElement).style.background = st ? '#2e7d32' : '#e53935'
    if (pingEl) pingEl.innerText = st ? `${ping} ms` : '—'
    if (titleEl) titleEl.innerText = p.slug === 'athena' ? "Synchronisé avec le Royaume d'Athéna" : `Synchronisé avec ${p.name}`
    if (subEl && st) {
      subEl.innerText = `Votre skin actuel et vos capes sont visibles immédiatement par l'ensemble des ${st.players.online.toLocaleString()} joueurs en ligne.`
    }
    // Populate Athena status card
    if (p.slug === 'athena') {
      const citizenship = document.getElementById('athena-citizenship')
      const job = document.getElementById('athena-job')
      const city = document.getElementById('athena-city')
      const playtime = document.getElementById('athena-playtime')
      const wealth = document.getElementById('athena-wealth')
      const achievements = document.getElementById('athena-achievements')
      const reputation = document.getElementById('athena-reputation')
      const lastseen = document.getElementById('athena-lastseen')
      if (citizenship) citizenship.innerText = 'Citoyen confirmé'
      if (job) job.innerText = '—' // TODO: API serveur
      if (city) city.innerText = '—'
      if (playtime) playtime.innerText = '—'
      if (wealth) wealth.innerText = '—'
      if (achievements) achievements.innerText = '0 / —'
      if (reputation) reputation.innerText = 'Neutre'
      if (lastseen) lastseen.innerText = new Date().toLocaleString('fr-FR')
    }
  } catch {
    if (dotEl) (dotEl as HTMLElement).style.background = '#e53935'
    if (pingEl) pingEl.innerText = '—'
  }
}

function syncAnimationBtn() {
  const btn = document.getElementById('btn-animation')
  const label = document.getElementById('animation-btn-label')
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

export function initProfile() {
  document.getElementById('btn-face')?.addEventListener('click', (e) => {
    document.querySelectorAll('.face-btn').forEach((b) => b.classList.remove('active'))
    ;(e.target as HTMLElement).classList.add('active')
    const v = viewer()
    if (v) v.playerObject.rotation.y = 0
  })
  document.getElementById('btn-back')?.addEventListener('click', (e) => {
    document.querySelectorAll('.face-btn').forEach((b) => b.classList.remove('active'))
    ;(e.target as HTMLElement).classList.add('active')
    const v = viewer()
    if (v) v.playerObject.rotation.y = Math.PI
  })

  document.getElementById('btn-rotate')?.addEventListener('click', (e) => {
    const v = viewer()
    if (!v) return
    rotating = !rotating
    v.autoRotate = rotating
    v.autoRotateSpeed = 1.2
    ;(e.currentTarget as HTMLElement).classList.toggle('active', rotating)
  })

  document.getElementById('btn-animation')?.addEventListener('click', () => {
    shared.setStudioAnimationEnabled(!shared.isStudioAnimationEnabled())
    applyAnimationState()
    syncAnimationBtn()
  })

  document.getElementById('btn-model-classic')?.addEventListener('click', () => {
    profileModel = 'classic'
    syncModelButtons()
    applyModelToViewer()
  })
  document.getElementById('btn-model-slim')?.addEventListener('click', () => {
    profileModel = 'slim'
    syncModelButtons()
    applyModelToViewer()
  })

  document.getElementById('check-cape')?.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked
    try {
      if (checked) {
        const first = shared.capes?.[0]
        if (first) shared.capes = await skin.switchCape(first.id)
      } else {
        shared.capes = await skin.hideCape()
      }
      await shared.resetMainView()
      await shared.resetCapesViews()
      syncCapeUI()
    } catch (err) {
      logger.error('Erreur cape:', err)
      await Dialog.show("Impossible de changer la cape pour le moment.", [{ text: 'OK', type: 'ok' }])
    }
  })

  const fileInput = document.getElementById('input-import-skin') as HTMLInputElement | null
  document.getElementById('btn-import-skin')?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    if (!file) return
    try {
      const result = await skin.updateSkin(await file.arrayBuffer(), profileModel)
      if (!result) {
        await Dialog.show('Skin invalide. Utilisez un fichier PNG 64×64.', [{ text: 'OK', type: 'ok' }])
        return
      }
      shared.skins = result
      await shared.resetMainView()
      await shared.resetSkinViews()
      refreshProfileIdentity()
    } catch (err) {
      logger.error('Erreur import skin:', err)
      await Dialog.show("Impossible d'importer ce skin pour le moment.", [{ text: 'OK', type: 'ok' }])
    } finally {
      fileInput.value = ''
    }
  })

  document.getElementById('btn-download-skin')?.addEventListener('click', () => {
    const v = viewer()
    if (!v) return
    const a = document.createElement('a')
    a.href = v.canvas.toDataURL('image/png')
    a.download = `${getUser()?.name ?? 'skin'}.png`
    a.click()
  })

  document.getElementById('btn-skin-cancel')?.addEventListener('click', async () => {
    await shared.resetMainView()
    refreshStudioMeta()
  })

  document.getElementById('btn-skin-save')?.addEventListener('click', async () => {
    const user = getUser()
    if (!user) return
    try {
      const avatar = await skin.getAvatar()
      if (avatar) shared.avatar = avatar
      await setUser(user, { skins: shared.skins, capes: shared.capes, avatar: shared.avatar })
      refreshProfileIdentity()
      await Dialog.show('Apparence enregistrée et synchronisée.', [{ text: 'Super !', type: 'ok' }])
    } catch (err) {
      logger.error('Erreur sauvegarde skin:', err)
    }
  })

  document.getElementById('btn-stats')?.addEventListener('click', async () => {
    await Dialog.show('Les statistiques détaillées (temps de jeu, succès) arrivent bientôt.', [{ text: 'OK', type: 'ok' }])
  })

  document.getElementById('btn-refresh-athena')?.addEventListener('click', async () => {
    refreshProfileServer()
    await Dialog.show('Statut citoyen Athéna rafraîchi.', [{ text: 'OK', type: 'ok' }])
  })

  document.getElementById('btn-toggle-email')?.addEventListener('click', () => {
    if (!cachedEmail) return
    emailVisible = !emailVisible
    syncEmailUI()
  })

  document.getElementById('btn-logout-profile')?.addEventListener('click', async () => {
    if (
      await Dialog.show('Se déconnecter du compte Modey ?', [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Déconnexion', type: 'danger' }
      ])
    ) {
      await auth.logout()
      clearSession()
      setView('login')
    }
  })

  document.getElementById('btn-refresh-cache')?.addEventListener('click', async () => {
    const user = getUser()
    if (!user) return
    try {
      await skin.reload(user)
      const [s, c, a] = await Promise.all([skin.getSkin(), skin.getCape(), skin.getAvatar()])
      shared.skins = s
      shared.capes = c
      shared.avatar = a
      await shared.resetMainView()
      await shared.resetSkinViews()
      await shared.resetCapesViews()
      refreshProfileIdentity()
      await refreshProfileServer()
      const sub = document.getElementById('sync-sub')
      if (sub) sub.innerText += ` Cache rafraîchi à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`
    } catch (err) {
      logger.error('Erreur rafraîchissement cache:', err)
    }
  })

  syncModelButtons()
  syncAnimationBtn()
  refreshProfileIdentity()
}
