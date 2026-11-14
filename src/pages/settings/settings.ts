import { getTheme, setTheme, onThemeChange, type ThemePreference } from "../../theme"
import { settings, system, profiles, files, game, auth } from '../../ipc'
import type { IGameSettings, IServerGameSettings } from '../../../electron/handlers/settings'
import { Dialog } from '../../components/dialog'
import { getUser } from '../../state'
import { setRouterHooks, closeSettings, showProfile } from '../../router'
import { initUpdateCard } from './components/updateCard'
import { initFilesRoot, refreshFilesCard } from './components/filesRoot'
import { initOptionalModsCard, refreshOptionalMods } from './components/optionalModsCard'
import { launcherConfig } from '../../services/launcherConfig'
import { openDiscordInvite, openDiscordConnect, getApiBase } from '../../services/discord'
import logger from 'electron-log/renderer'
import shared from '../../shared'
import settingsHtml from './index.html?raw'
import './settings.scss'

const el = (id: string) => document.getElementById(id)

// La page Réglages est une sous-page de #view-home (fin de conteneur).
const mount = el('view-home')
if (mount && !el('settings-page')) mount.insertAdjacentHTML('beforeend', settingsHtml)

const resolutionList = [
  { label: 'Auto (défaut)', value: '854x480', width: 854, height: 480 },
  { label: 'Plein écran', value: 'fullscreen', width: 854, height: 480 },
  { label: '2560x1440 (1440p)', value: '2560x1440', width: 2560, height: 1440 },
  { label: '1920x1080 (1080p)', value: '1920x1080', width: 1920, height: 1080 },
  { label: '1600x900', value: '1600x900', width: 1600, height: 900 },
  { label: '1366x768', value: '1366x768', width: 1366, height: 768 },
  { label: '1280x1024', value: '1280x1024', width: 1280, height: 1024 },
  { label: '1280x720 (720p)', value: '1280x720', width: 1280, height: 720 },
  { label: '1024x768', value: '1024x768', width: 1024, height: 768 },
  { label: '800x600', value: '800x600', width: 800, height: 600 }
]

let currentSettings: IGameSettings
let currentSelectedTarget: string = 'global' // 'global' ou '<slug>'
let activeServerCategory: string = 'performance'
let allKnownProfiles: any[] = []
let serverMemoryTouched = false
let portableMode = false

type SettingsViewKind = 'global' | 'server'

interface SettingsCategory {
  id: string
  label: string
  icon: string
}

interface SettingsSubitem {
  cardId: string
  label: string
}

const GLOBAL_CATEGORIES: SettingsCategory[] = [
  { id: 'account', label: 'Compte & sécurité', icon: 'solar-user-bold' },
  { id: 'privacy', label: 'Données & confidentialité', icon: 'solar-shield-bold' },
  { id: 'game', label: 'Jeu & performance', icon: 'solar-gamepad-bold' },
  { id: 'interface', label: 'Interface & comportement', icon: 'solar-monitor-bold' },
  { id: 'storage', label: 'Mises à jour & stockage', icon: 'solar-download-bold' },
  { id: 'about', label: 'À propos & licences', icon: 'solar-info-bold' }
]

const GLOBAL_SUBITEMS: Record<string, SettingsSubitem[]> = {
  account: [
    { cardId: 'account-profile-card', label: 'Informations du compte' },
    { cardId: 'account-security-card', label: 'Mot de passe et sécurité' },
    { cardId: 'account-danger-card', label: 'Suppression du compte' }
  ],
  privacy: [
    { cardId: 'privacy-telemetry-card', label: 'Télémétrie & diagnostics' },
    { cardId: 'privacy-social-card', label: 'Visibilité & présence' },
    { cardId: 'privacy-data-card', label: 'Données personnelles & RGPD' }
  ],
  game: [
    { cardId: 'ram-card', label: 'Mémoire RAM' },
    { cardId: 'java-card', label: 'Moteur Java & Lancement' }
  ],
  interface: [
    { cardId: 'appearance-card', label: 'Thème & Apparence' },
    { cardId: 'behavior-card', label: 'Comportement du launcher' }
  ],
  storage: [
    { cardId: 'update-card', label: 'Mises à jour' },
    { cardId: 'files-card', label: 'Fichiers & Stockage' }
  ],
  about: [
    { cardId: 'about-card', label: 'Modey Launcher & Licences' }
  ]
}

const SERVER_CATEGORIES: SettingsCategory[] = [
  { id: 'performance', label: 'Performance', icon: 'solar-cpu-bold' },
  { id: 'content', label: 'Contenu', icon: 'solar-box-bold' },
  { id: 'maintenance', label: 'Fichiers & maintenance', icon: 'solar-wrench-bold' }
]

const lastCategoryByView: Record<SettingsViewKind, string> = {
  global: GLOBAL_CATEGORIES[0].id,
  server: SERVER_CATEGORIES[0].id
}

let activeCategory = GLOBAL_CATEGORIES[0].id

function currentViewKind(): SettingsViewKind {
  return currentSelectedTarget === 'global' ? 'global' : 'server'
}

function currentCategories(): SettingsCategory[] {
  return currentViewKind() === 'global' ? GLOBAL_CATEGORIES : SERVER_CATEGORIES
}

export function setHeaderTitle(parentLabel: string, childLabel?: string, onBack?: () => void) {
  const titleEl = el('settings-active-cat-title')
  if (!titleEl) return

  if (!childLabel) {
    titleEl.innerText = parentLabel
    return
  }

  titleEl.innerHTML = `
    <button type="button" class="breadcrumb-parent-btn" id="btn-header-breadcrumb-back" title="Retour à ${parentLabel}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
      <span>${parentLabel}</span>
    </button>
    <span class="breadcrumb-sep">/</span>
    <span class="breadcrumb-child">${childLabel}</span>
  `

  if (onBack) {
    titleEl.querySelector('#btn-header-breadcrumb-back')?.addEventListener('click', onBack)
  }
}

function renderCategoryTabs() {
  const bar = el('settings-category-bar')
  if (!bar) return

  const isGlobal = currentSelectedTarget === 'global'

  bar.innerHTML = ''
  for (const cat of GLOBAL_CATEGORIES) {
    const isCatActive = isGlobal && cat.id === activeCategory

    const group = document.createElement('div')
    group.className = 'settings-category-group'
    group.dataset.cat = cat.id

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `settings-category-tab ${isCatActive ? 'active' : ''}`
    btn.dataset.cat = cat.id
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', String(isCatActive))
    btn.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#${cat.icon}"></use></svg><span>${cat.label}</span>`
    btn.addEventListener('click', () => {
      if (currentSelectedTarget !== 'global') {
        applyServerSelection('global')
      }
      setCategory(cat.id)
    })
    group.appendChild(btn)

    // Arborescence des sous-sections dépliables uniquement si la catégorie générale est active
    if (isCatActive) {
      const subitems = GLOBAL_SUBITEMS[cat.id] || []
      if (subitems.length > 0) {
        const tree = document.createElement('div')
        tree.className = 'settings-subitems-tree'
        subitems.forEach((sub, idx) => {
          const subBtn = document.createElement('button')
          subBtn.type = 'button'
          subBtn.className = `settings-subitem-tab ${idx === 0 ? 'active' : ''}`
          subBtn.dataset.targetCard = sub.cardId
          subBtn.innerText = sub.label
          subBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            scrollToCard(sub.cardId)
          })
          tree.appendChild(subBtn)
        })
        group.appendChild(tree)
      }
    }

    bar.appendChild(group)
  }

  if (isGlobal) {
    const currentCat = GLOBAL_CATEGORIES.find((c) => c.id === activeCategory)
    if (currentCat) {
      setHeaderTitle(currentCat.label)
    }
  }

  applyCategoryFilter()
}

function closeAccountSubpages() {
  const sub2fa = el('account-subpage-2fa')
  const subSessions = el('account-subpage-sessions')
  const subSso = el('account-subpage-sso')
  if (sub2fa) sub2fa.style.display = 'none'
  if (subSessions) subSessions.style.display = 'none'
  if (subSso) subSso.style.display = 'none'

  const profileCard = el('account-profile-card')
  const securityCard = el('account-security-card')
  const dangerCard = el('account-danger-card')
  if (profileCard) profileCard.style.display = ''
  if (securityCard) securityCard.style.display = ''
  if (dangerCard) dangerCard.style.display = ''

  const currentCat = currentCategories().find((c) => c.id === activeCategory)
  if (currentCat) {
    setHeaderTitle(currentCat.label)
  }
}

function scrollToCard(cardId: string) {
  closeAccountSubpages()
  const card = el(cardId)
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    document.querySelectorAll<HTMLElement>('.settings-subitem-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.targetCard === cardId)
    })
  }
}

function setCategory(categoryId: string) {
  closeAccountSubpages()
  activeCategory = categoryId
  lastCategoryByView[currentViewKind()] = categoryId
  renderCategoryTabs()
  el('settings-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
}

function setServerCategory(zoneId: string) {
  activeServerCategory = zoneId
  refreshServerPillTabs()

  const profile = allKnownProfiles.find((p) => p.slug === currentSelectedTarget)
  const serverName = profile?.name || launcherConfig.getServer(currentSelectedTarget)?.name || currentSelectedTarget
  const zoneObj = SERVER_CATEGORIES.find((z) => z.id === zoneId)
  const zoneLabel = zoneObj?.label || zoneId

  setHeaderTitle(serverName, zoneLabel, () => {
    applyServerSelection('global')
  })

  applyCategoryFilter()

  if (zoneId === 'content') {
    try { refreshOptionalMods(currentSelectedTarget) } catch (e) { logger.warn(e) }
  } else if (zoneId === 'maintenance') {
    try { updateServerLocationCard(currentSelectedTarget) } catch (e) { logger.warn(e) }
  }

  el('settings-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
}

function applyCategoryFilter() {
  const isGlobal = currentSelectedTarget === 'global'
  const viewId = isGlobal ? 'global-settings-view' : 'server-settings-view'
  const view = el(viewId)
  if (!view) return

  const targetCategory = isGlobal ? activeCategory : activeServerCategory

  view.querySelectorAll<HTMLElement>('.settings-card').forEach((card) => {
    card.hidden = card.dataset.cat !== targetCategory
  })

  const serverView = el('server-settings-view')
  const scrollEl = el('settings-scroll')
  const isContent = !isGlobal && activeServerCategory === 'content'

  if (serverView) {
    serverView.classList.toggle('is-content-mode', isContent)
  }
  if (scrollEl) {
    scrollEl.classList.toggle('is-cat-content', isContent)
  }
}

function initCategoryKeyboardNav() {
  const bar = el('settings-category-bar')
  if (!bar) return

  bar.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const categories = currentCategories()
    const currentIndex = categories.findIndex((c) => c.id === activeCategory)
    if (currentIndex < 0) return

    let nextIndex = currentIndex
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % categories.length
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + categories.length) % categories.length
    }

    const nextCat = categories[nextIndex]
    if (nextCat) {
      e.preventDefault()
      setCategory(nextCat.id)
      const tabBtn = bar.querySelector<HTMLButtonElement>(`button[data-cat="${nextCat.id}"]`)
      tabBtn?.focus()
    }
  })
}

function getModeyAvatarSrc(): string {
  if (shared.avatar?.url) return shared.avatar.url
  const homeAvatar = document.getElementById('user-avatar') as HTMLImageElement | null
  if (homeAvatar?.src && !homeAvatar.src.includes('minotar.net')) {
    return homeAvatar.src
  }
  const profileAvatar = document.getElementById('profile-id-avatar') as HTMLImageElement | null
  if (profileAvatar?.src && !profileAvatar.src.includes('minotar.net')) {
    return profileAvatar.src
  }
  return shared.avatar?.url || ''
}

async function initAccountSettings() {
  const user = getUser()
  if (!user) return

  // 1. Profil joueur
  const avatarEl = el('settings-account-avatar') as HTMLImageElement | null
  const usernameEl = el('settings-account-username')
  const emailEl = el('settings-account-email')
  const btnRevealEmail = el('btn-reveal-email') as HTMLButtonElement | null
  const btnEditAvatar = el('btn-edit-avatar') as HTMLButtonElement | null

  if (avatarEl) {
    const avatarSrc = getModeyAvatarSrc()
    if (avatarSrc) avatarEl.src = avatarSrc
  }
  if (usernameEl) usernameEl.innerText = user.name

  // Email avec masquage avant l'arobase et affichage au clic
  const rawEmail = ((user as any).email || '').trim()
  let isEmailRevealed = false

  function maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email || 'Compte joueur officiel Modey'
    const atIndex = email.indexOf('@')
    const localPart = email.substring(0, atIndex)
    const domainPart = email.substring(atIndex)
    const maskLen = Math.max(localPart.length, 12)
    return '*'.repeat(maskLen) + domainPart
  }

  function updateEmailDisplay() {
    if (!emailEl) return
    if (!rawEmail) {
      emailEl.innerText = 'Compte joueur officiel Modey'
      if (btnRevealEmail) btnRevealEmail.style.display = 'none'
      return
    }

    if (!rawEmail.includes('@')) {
      emailEl.innerText = rawEmail
      if (btnRevealEmail) btnRevealEmail.style.display = 'none'
      return
    }

    if (btnRevealEmail) {
      btnRevealEmail.style.display = 'inline-flex'
      btnRevealEmail.innerText = isEmailRevealed ? 'Masquer' : 'Afficher'
      btnRevealEmail.setAttribute('aria-label', isEmailRevealed ? "Masquer l'adresse e-mail" : "Afficher l'adresse e-mail")
    }
    emailEl.innerText = isEmailRevealed ? rawEmail : maskEmail(rawEmail)
  }

  updateEmailDisplay()

  btnRevealEmail?.addEventListener('click', () => {
    isEmailRevealed = !isEmailRevealed
    updateEmailDisplay()
  })

  // Modification d'avatar -> Redirection vers le profil & casier
  btnEditAvatar?.addEventListener('click', () => {
    closeSettings()
    showProfile()
  })

  // UUID Modey
  const uuidEl = el('settings-account-uuid')
  const btnCopyUuid = el('btn-copy-uuid') as HTMLButtonElement | null
  const accountUuid = user.uuid || (user as any)?.id || ''
  if (uuidEl) {
    uuidEl.innerText = accountUuid || '—'
  }
  btnCopyUuid?.addEventListener('click', async () => {
    if (!accountUuid) return
    try {
      await navigator.clipboard.writeText(accountUuid)
      btnCopyUuid.setAttribute('title', 'Copié !')
      btnCopyUuid.innerHTML = '<svg class="solar-icon solar-bold" style="color:var(--success);" aria-hidden="true"><use href="#solar-check-read-bold"></use></svg>'
      setTimeout(() => {
        btnCopyUuid.setAttribute('title', "Copier l'UUID Modey")
        btnCopyUuid.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-copy-bold"></use></svg>'
      }, 2000)
    } catch (_) {
      // fallback
    }
  })

  // Statut Licence Propriétaire Minecraft
  const mcEl = el('settings-account-minecraft')
  if (mcEl) {
    const isMsa = (user as any)?.meta?.type === 'msa'
    if (isMsa) {
      mcEl.innerText = 'Licence vérifiée'
      mcEl.className = 'discord-row-status is-active'
    } else {
      mcEl.innerText = 'Non vérifié'
      mcEl.className = 'discord-row-status is-inactive'
    }
  }

  // Synchronisation Serveur Discord
  const discordEl = el('settings-account-discord')
  const btnSyncDiscord = el('btn-sync-discord') as HTMLButtonElement | null
  const apiBase = getApiBase()

  async function checkSettingsDiscordStatus() {
    const token = (user as any)?.accessToken || shared.account?.accessToken
    if (!token) {
      if (discordEl) {
        discordEl.innerText = 'Non synchronisé'
        discordEl.className = 'discord-row-status is-inactive'
      }
      return
    }
    try {
      const res = await fetch(`${apiBase}/api/auth/discord/status?token=${encodeURIComponent(token)}`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.linked) {
          if (discordEl) {
            discordEl.innerText = `@${data.discord_username || 'Synchronisé'}`
            discordEl.className = 'discord-row-status is-active'
          }
          if (btnSyncDiscord) {
            btnSyncDiscord.setAttribute('title', 'Compte Discord synchronisé')
          }
          return
        }
      }
      if (discordEl) {
        discordEl.innerText = 'Non synchronisé'
        discordEl.className = 'discord-row-status is-inactive'
      }
    } catch {
      if (discordEl) {
        discordEl.innerText = 'Non synchronisé'
        discordEl.className = 'discord-row-status is-inactive'
      }
    }
  }

  checkSettingsDiscordStatus()

  btnSyncDiscord?.addEventListener('click', () => {
    openDiscordConnect(shared.account?.accessToken)
    setTimeout(checkSettingsDiscordStatus, 3000)
    setTimeout(checkSettingsDiscordStatus, 8000)
    setTimeout(checkSettingsDiscordStatus, 15000)
  })

  // 2. Double Authentification (2FA)
  const badge2FA = el('settings-2fa-badge')
  const banner2FA = el('settings-2fa-status-banner')
  const btnSetup2FA = el('btn-settings-setup-2fa') as HTMLButtonElement | null
  const btnDisable2FA = el('btn-settings-disable-2fa') as HTMLButtonElement | null

  // Modal 2FA
  const modalDialog = el('modal-2fa-setup-dialog')
  const btnCloseModal = el('btn-close-modal-2fa')
  const btnCancelModal = el('btn-modal-2fa-cancel')
  const btnConfirmModal = el('btn-modal-2fa-confirm') as HTMLButtonElement | null
  const qrImg = el('modal-2fa-qr-img') as HTMLImageElement | null
  const secretCode = el('modal-2fa-secret-code')
  const recoveryList = el('modal-2fa-recovery-list')
  const inputConfirmCode = el('input-confirm-2fa-code') as HTMLInputElement | null
  const btnCopySecret = el('btn-copy-2fa-secret')

  async function refresh2FAStatus() {
    try {
      const res = await auth.get2FAStatus()
      const isEnabled = Boolean(res?.enabled)

      if (badge2FA) {
        badge2FA.innerText = isEnabled ? '2FA Active' : 'Non activée'
        badge2FA.className = `settings-2fa-badge ${isEnabled ? 'is-active' : 'is-inactive'}`
      }

      const pill2FA = el('settings-2fa-status-pill')
      if (pill2FA) {
        pill2FA.innerText = isEnabled ? 'Activé' : 'Non activé'
        pill2FA.className = `discord-row-status ${isEnabled ? 'is-active' : 'is-inactive'}`
      }

      if (banner2FA) {
        banner2FA.className = `settings-2fa-status-banner ${isEnabled ? 'is-active' : 'is-inactive'}`
        if (isEnabled) {
          banner2FA.innerHTML = `
            <svg class="solar-icon solar-bold settings-2fa-banner-icon" aria-hidden="true"><use href="#solar-shield-check-bold"></use></svg>
            <div class="settings-2fa-banner-text">
              <strong>Votre compte est protégé par une application d'authentification (2FA).</strong>
              <span class="settings-2fa-banner-desc">Chaque nouvelle connexion requiert un code temporaire généré sur votre smartphone (Google Authenticator, Authy, etc.).</span>
            </div>
          `
          if (btnSetup2FA) btnSetup2FA.style.display = 'none'
          if (btnDisable2FA) btnDisable2FA.style.display = 'inline-flex'
        } else {
          banner2FA.innerHTML = `
            <svg class="solar-icon solar-bold settings-2fa-banner-icon" aria-hidden="true"><use href="#solar-shield-warning-bold"></use></svg>
            <div class="settings-2fa-banner-text">
              <strong>Protection 2FA recommandée.</strong>
              <span class="settings-2fa-banner-desc">Activez une application d'authentification pour sécuriser votre compte citoyen contre les accès non autorisés.</span>
            </div>
          `
          if (btnSetup2FA) btnSetup2FA.style.display = 'inline-flex'
          if (btnDisable2FA) btnDisable2FA.style.display = 'none'
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch 2FA status:', err)
    }
  }

  // Ouvrir modal configuration
  btnSetup2FA?.addEventListener('click', async () => {
    try {
      const origText = btnSetup2FA.innerHTML
      btnSetup2FA.disabled = true
      btnSetup2FA.innerText = 'Chargement...'

      const setupData = await auth.setup2FA()
      btnSetup2FA.disabled = false
      btnSetup2FA.innerHTML = origText

      if (!setupData || !setupData.success) {
        await Dialog.show(setupData?.error || 'Impossible d\'initialiser la configuration 2FA.', [{ text: 'OK', type: 'ok' }])
        return
      }

      if (qrImg) qrImg.src = setupData.qrCodeDataUrl
      if (secretCode) secretCode.innerText = setupData.secret
      if (recoveryList) {
        recoveryList.innerHTML = (setupData.recoveryCodes || []).map((code: string) => `<span>${code}</span>`).join('')
      }
      if (inputConfirmCode) inputConfirmCode.value = ''

      if (modalDialog) modalDialog.style.display = 'flex'
      setTimeout(() => inputConfirmCode?.focus(), 150)
    } catch (err) {
      logger.error('Error during 2FA setup:', err)
      await Dialog.show('Une erreur est survenue lors de l\'initialisation de la 2FA.', [{ text: 'OK', type: 'ok' }])
    }
  })

  // Copier la clé secrète
  btnCopySecret?.addEventListener('click', () => {
    const text = secretCode?.innerText || ''
    if (text) {
      navigator.clipboard.writeText(text)
      btnCopySecret.innerText = 'Copié !'
      setTimeout(() => { if (btnCopySecret) btnCopySecret.innerText = 'Copier' }, 2000)
    }
  })

  const closeModal = () => { if (modalDialog) modalDialog.style.display = 'none' }
  btnCloseModal?.addEventListener('click', closeModal)
  btnCancelModal?.addEventListener('click', closeModal)

  // Valider et activer la 2FA
  btnConfirmModal?.addEventListener('click', async () => {
    const code = inputConfirmCode?.value.trim() || ''
    if (!code) {
      await Dialog.show('Veuillez saisir le code à 6 chiffres de Google Authenticator.', [{ text: 'OK', type: 'ok' }])
      return
    }

    const origText = btnConfirmModal.innerText
    btnConfirmModal.disabled = true
    btnConfirmModal.innerText = 'Vérification...'

    try {
      const res = await auth.enable2FA(code)
      if (res.success) {
        closeModal()
        await Dialog.show('La double authentification avec Google Authenticator est désormais active sur votre compte !', [{ text: 'Parfait', type: 'ok' }], 'Sécurité Active')
        await refresh2FAStatus()
      } else {
        await Dialog.show(res.error || 'Code incorrect. Vérifiez l\'heure de votre smartphone et réessayez.', [{ text: 'Réessayer', type: 'ok' }])
      }
    } catch (err: any) {
      logger.error(err)
      await Dialog.show('Erreur lors de l\'activation de la double authentification.', [{ text: 'OK', type: 'ok' }])
    } finally {
      btnConfirmModal.disabled = false
      btnConfirmModal.innerText = origText
    }
  })

  // Désactiver 2FA
  btnDisable2FA?.addEventListener('click', async () => {
    const confirmed = await Dialog.show(
      'Êtes-vous sûr de vouloir désactiver la double authentification ? Votre compte sera moins sécurisé.',
      [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Désactiver', type: 'ok' }
      ],
      'Désactivation de la 2FA'
    )
    if (!confirmed) return

    const password = prompt('Saisissez votre mot de passe de compte Modey pour confirmer la désactivation :')
    if (!password) return

    try {
      const res = await auth.disable2FA(password)
      if (res.success) {
        await Dialog.show('La double authentification a été désactivée.', [{ text: 'OK', type: 'ok' }])
        await refresh2FAStatus()
      } else {
        await Dialog.show(res.error || 'Mot de passe incorrect.', [{ text: 'OK', type: 'ok' }])
      }
    } catch (err: any) {
      logger.error(err)
      await Dialog.show('Erreur lors de la désactivation de la 2FA.', [{ text: 'OK', type: 'ok' }])
    }
  })

  // 3. Sessions actives
  const sessionsList = el('settings-sessions-list')
  const btnRevokeOthers = el('btn-settings-revoke-others')

  async function loadSessions() {
    if (!sessionsList) return
    try {
      const res = await auth.getSessions()
      const list = res.sessions || []

      const pillSessions = el('settings-sessions-count-pill')
      if (pillSessions) {
        const count = list.length
        pillSessions.innerText = `${count} appareil${count > 1 ? 's' : ''}`
      }

      if (list.length === 0) {
        sessionsList.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:12px;">Aucune session trouvée.</div>'
        return
      }

      sessionsList.innerHTML = list.map((s: any) => {
        const lastActive = s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Récemment'
        return `
          <div class="settings-session-item">
            <div class="session-info">
              <svg class="solar-icon solar-bold session-icon" aria-hidden="true"><use href="#solar-monitor-bold"></use></svg>
              <div>
                <div class="session-device">
                  ${s.deviceName}
                  ${s.isCurrent ? '<span class="session-current-badge">Cet appareil</span>' : ''}
                </div>
                <div class="session-meta">
                  IP: ${s.ipAddress} · Dernière activité : ${lastActive}
                </div>
              </div>
            </div>
            ${!s.isCurrent ? `
              <button type="button" class="btn-revoke-single" data-token="${s.token}">
                Déconnecter
              </button>
            ` : ''}
          </div>
        `
      }).join('')

      sessionsList.querySelectorAll<HTMLButtonElement>('.btn-revoke-single').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const token = btn.dataset.token
          if (token) {
            btn.disabled = true
            btn.innerText = '...'
            await auth.revokeSession(token)
            await loadSessions()
          }
        })
      })
    } catch (err) {
      logger.warn('Failed to load sessions:', err)
      sessionsList.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:12px;">Impossible de charger la liste des sessions.</div>'
    }
  }

  btnRevokeOthers?.addEventListener('click', async () => {
    const confirmed = await Dialog.show(
      'Déconnecter toutes les autres sessions ? Les autres appareils connectés à votre compte devront se reconnecter.',
      [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Déconnecter les autres', type: 'ok' }
      ],
      'Déconnexion globale'
    )
    if (!confirmed) return

    try {
      await auth.revokeOtherSessions()
      await Dialog.show('Toutes les autres sessions ont été déconnectées.', [{ text: 'OK', type: 'ok' }])
      await loadSessions()
    } catch (err: any) {
      logger.error(err)
      await Dialog.show('Erreur lors de la déconnexion des sessions.', [{ text: 'OK', type: 'ok' }])
    }
  })

  // 4. Gestion des sous-pages (Style Discord)
  const sub2fa = el('account-subpage-2fa')
  const subSessions = el('account-subpage-sessions')
  const subSso = el('account-subpage-sso')
  const profileCard = el('account-profile-card')
  const securityCard = el('account-security-card')
  const dangerCard = el('account-danger-card')
  const scrollEl = el('settings-scroll')

  const openSubpage = (targetSubpage: HTMLElement | null, subpageLabel: string) => {
    if (!targetSubpage) return
    if (profileCard) profileCard.style.display = 'none'
    if (securityCard) securityCard.style.display = 'none'
    if (dangerCard) dangerCard.style.display = 'none'
    if (sub2fa) sub2fa.style.display = 'none'
    if (subSessions) subSessions.style.display = 'none'
    if (subSso) subSso.style.display = 'none'

    targetSubpage.style.display = 'flex'
    targetSubpage.querySelectorAll<HTMLElement>('.settings-card').forEach((card) => {
      card.hidden = false
      card.style.display = 'flex'
    })

    document.querySelectorAll<HTMLElement>('.settings-subitem-tab').forEach((tab) => tab.classList.remove('active'))

    setHeaderTitle('Compte & sécurité', subpageLabel, () => closeSubpages())
    scrollEl?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeSubpages = () => {
    closeAccountSubpages()
    document.querySelectorAll<HTMLElement>('.settings-subitem-tab').forEach((tab, idx) => {
      tab.classList.toggle('active', idx === 0)
    })
    scrollEl?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  el('btn-goto-2fa')?.addEventListener('click', () => {
    openSubpage(sub2fa, 'Authentification à multi-facteurs')
    refresh2FAStatus()
  })
  el('row-2fa-action')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.btn-discord-nav-row')) return
    openSubpage(sub2fa, 'Authentification à multi-facteurs')
    refresh2FAStatus()
  })

  el('btn-goto-sessions')?.addEventListener('click', () => {
    openSubpage(subSessions, 'Appareils connectés')
    loadSessions()
  })
  el('row-sessions-action')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.btn-discord-nav-row')) return
    openSubpage(subSessions, 'Appareils connectés')
    loadSessions()
  })

  el('btn-goto-sso')?.addEventListener('click', () => {
    openSubpage(subSso, 'Connexion rapide (SSO)')
  })
  el('row-sso-action')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.btn-discord-nav-row')) return
    openSubpage(subSso, 'Connexion rapide (SSO)')
  })

  await refresh2FAStatus()
  await loadSessions()
}

function initPrivacySettings() {
  const toggleCrash = el('toggle-crash-reports') as HTMLInputElement | null
  const toggleTelemetry = el('toggle-telemetry') as HTMLInputElement | null
  const toggleDiscordRpc = el('toggle-discord-rpc') as HTMLInputElement | null

  // Paramètres non fonctionnels pour l'instant : verrouillés et désactivés
  if (toggleCrash) {
    toggleCrash.checked = false
    toggleCrash.disabled = true
  }

  if (toggleTelemetry) {
    toggleTelemetry.checked = false
    toggleTelemetry.disabled = true
  }

  if (toggleDiscordRpc) {
    toggleDiscordRpc.checked = false
    toggleDiscordRpc.disabled = true
  }

  const btnClearCache = el('btn-clear-web-cache')
  btnClearCache?.addEventListener('click', async () => {
    const confirmed = await Dialog.show(
      'Voulez-vous vider le cache local du launcher ? Cela libérera de l\'espace disque sans affecter vos données de compte ni vos mondes de jeu.',
      [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Vider le cache', type: 'ok' }
      ],
      'Nettoyage du cache'
    )
    if (!confirmed) return

    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key && (key.startsWith('skin_') || key.startsWith('cache_') || key.startsWith('cape_'))) {
          localStorage.removeItem(key)
        }
      }
      await Dialog.show('Le cache local et les données temporaires ont été réinitialisés avec succès.', [{ text: 'Parfait', type: 'ok' }], 'Cache vidé')
    } catch (err: any) {
      logger.error('Erreur lors du vidage du cache:', err)
      await Dialog.show('Une erreur est survenue lors de la réinitialisation du cache.', [{ text: 'OK', type: 'ok' }])
    }
  })

  const btnPrivacyPolicy = el('btn-view-privacy-policy')
  btnPrivacyPolicy?.addEventListener('click', async () => {
    await Dialog.show(
      'Modey s\'engage à respecter votre vie privée. Vos identifiants sont chiffrés, aucune donnée personnelle sensible n\'est transmise à des tiers, et vos mots de passe ne sont jamais stockés en clair. Vous pouvez exercer vos droits d\'accès ou de suppression à tout moment.',
      [{ text: 'Fermer', type: 'ok' }],
      'Charte de Confidentialité'
    )
  })
}

export async function initSettings() {
  const sysInfo = await system.getInfo()
  portableMode = !!sysInfo.portable
  currentSettings = await settings.get()
  if (!currentSettings.serverSettings) {
    currentSettings.serverSettings = {}
  }

  initUIListeners()
  initDualSlider(sysInfo)
  initUiScale()
  initFormValues(sysInfo.resolution)
  populateAbout(sysInfo)
  initPrivacySettings()
  initUpdateCard(sysInfo.version ?? '', {
    betaChannel: !!currentSettings.betaChannel,
    autoUpdateCheck: currentSettings.autoUpdateCheck !== false,
    portable: !!sysInfo.portable,
    onSettingsChange: saveSettingsDebounced
  })
  initFilesRoot()
  initOptionalModsCard()
  await initServerPillTabs()
  initServerLocationCardListeners()
  initCategoryKeyboardNav()
  await initAccountSettings()
  await applyServerSelection('global')

  // Écoute de l'événement de navigation directe vers un serveur
  window.addEventListener('select-settings-server', ((e: CustomEvent<{ slug: string }>) => {
    if (e.detail?.slug) {
      applyServerSelection(e.detail.slug)
    }
  }) as EventListener)

  // Fermeture de la modale Paramètres (Bouton croix, Clic backdrop, Touche Échap)
  el('btn-close-settings')?.addEventListener('click', closeSettings)

  const backdrop = el('settings-page')
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeSettings()
    }
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = el('settings-page')
      if (modal && modal.style.display !== 'none') {
        const modal2fa = el('modal-setup-2fa')
        if (modal2fa && modal2fa.style.display !== 'none') {
          return
        }
        closeSettings()
      }
    }
  })

  setRouterHooks({
    onShowSettings: () => {
      refreshFilesCard()
      refreshServerPillTabs()
      initAccountSettings()
      refreshSidebarUserCard()
    }
  })

  refreshSidebarUserCard()
  initSettingsSearch()
  initScrollSpy()
}

function refreshSidebarUserCard() {
  const user = getUser()
  const avatarEl = el('settings-sidebar-avatar') as HTMLImageElement | null
  const usernameEl = el('settings-sidebar-username')

  if (!user) return

  if (avatarEl) {
    const avatarSrc = getModeyAvatarSrc()
    if (avatarSrc) avatarEl.src = avatarSrc
  }
  if (usernameEl) {
    usernameEl.innerText = user.name
  }

  const btnGotoProfile = el('settings-btn-goto-profile')
  if (btnGotoProfile && !btnGotoProfile.dataset.bound) {
    btnGotoProfile.dataset.bound = 'true'
    btnGotoProfile.addEventListener('click', () => {
      closeSettings()
      showProfile()
    })
  }
}

function initSettingsSearch() {
  const input = el('settings-search-input') as HTMLInputElement | null
  const clearBtn = el('settings-search-clear') as HTMLButtonElement | null
  if (!input) return

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase()
    if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none'

    const viewId = currentViewKind() === 'global' ? 'global-settings-view' : 'server-settings-view'
    const view = el(viewId)
    if (!view) return

    const cards = view.querySelectorAll<HTMLElement>('.settings-card')

    if (!query) {
      applyCategoryFilter()
      return
    }

    cards.forEach((card) => {
      const text = (card.textContent || '').toLowerCase()
      const isMatch = text.includes(query)
      card.hidden = !isMatch
    })
  })

  clearBtn?.addEventListener('click', () => {
    input.value = ''
    clearBtn.style.display = 'none'
    applyCategoryFilter()
    input.focus()
  })
}

function initScrollSpy() {
  const scrollEl = el('settings-scroll')
  if (!scrollEl) return

  scrollEl.addEventListener('scroll', () => {
    const subitems = document.querySelectorAll<HTMLElement>('.settings-subitem-tab')
    if (!subitems.length) return

    let currentCardId: string | null = null
    const scrollRect = scrollEl.getBoundingClientRect()

    subitems.forEach((subBtn) => {
      const cardId = subBtn.dataset.targetCard
      if (!cardId) return
      const card = document.getElementById(cardId)
      if (!card || card.hidden) return
      const rect = card.getBoundingClientRect()
      if (rect.top <= scrollRect.top + 160 && rect.bottom >= scrollRect.top + 60) {
        currentCardId = cardId
      }
    })

    if (currentCardId) {
      subitems.forEach((subBtn) => {
        subBtn.classList.toggle('active', subBtn.dataset.targetCard === currentCardId)
      })
    }
  }, { passive: true })
}

function populateAbout(sysInfo: any) {
  const versionEl = el('settings-version')
  const emllibEl = el('settings-emllib')
  const electronEl = el('settings-electron')
  const osEl = el('settings-os')
  if (versionEl) versionEl.innerText = sysInfo.version ?? '—'
  if (emllibEl) emllibEl.innerText = '2.3.5'
  if (electronEl) electronEl.innerText = (typeof process !== 'undefined' && process.versions?.electron) ? process.versions.electron : '34.0.0'
  if (osEl) osEl.innerText = (typeof process !== 'undefined' && process.platform) ? `${process.platform} ${process.arch}` : 'Windows x64'

  el('settings-discord-link')?.addEventListener('click', (e) => {
    e.preventDefault()
    openDiscordInvite()
  })
}

async function initServerPillTabs() {
  const globalBtn = el('pill-tab-global')
  globalBtn?.addEventListener('click', () => {
    applyServerSelection('global')
  })

  await refreshServerPillTabs()
}

async function refreshServerPillTabs() {
  const container = el('settings-sidebar-servers') || el('settings-pills-servers')
  if (!container) return

  try {
    const list = await profiles.get()
    allKnownProfiles = Array.isArray(list) ? list : []
  } catch {
    allKnownProfiles = []
  }

  // Également vérifier si des profils ont des configurations locales sur disque ou dans settings
  const existingSlugs = new Set(allKnownProfiles.map((p) => p.slug))
  if (currentSettings.serverSettings) {
    for (const slug of Object.keys(currentSettings.serverSettings)) {
      if (!existingSlugs.has(slug)) {
        allKnownProfiles.push({ slug, name: slug })
        existingSlugs.add(slug)
      }
    }
  }

  container.innerHTML = ''

  allKnownProfiles.forEach((p) => {
    const isSelected = currentSelectedTarget === p.slug
    const srvName = p.name || launcherConfig.getServer(p.slug)?.name || p.slug
    const ramAllocated = currentSettings?.serverSettings?.[p.slug]?.memory?.max
    const badgeText = ramAllocated ? `${ramAllocated} Go` : 'Auto'

    const group = document.createElement('div')
    group.className = 'settings-server-group'
    group.dataset.target = p.slug

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `settings-server-item ${isSelected ? 'active' : ''}`
    btn.dataset.target = p.slug
    btn.id = `server-item-${p.slug}`

    btn.innerHTML = `
      <div class="server-item-left">
        <svg class="solar-icon solar-bold server-item-icon" aria-hidden="true"><use href="#solar-gamepad-bold"></use></svg>
        <span class="server-item-name">${srvName}</span>
      </div>
      <div class="server-item-right">
        <span class="server-item-ram-badge" id="server-ram-tag-${p.slug}">${badgeText}</span>
        <svg class="server-chevron ${isSelected ? 'is-open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
    `

    btn.addEventListener('click', () => {
      if (currentSelectedTarget === p.slug) {
        applyServerSelection('global')
      } else {
        applyServerSelection(p.slug)
      }
    })

    group.appendChild(btn)

    // Arborescence dépliée avec les différentes zones du serveur
    if (isSelected) {
      const tree = document.createElement('div')
      tree.className = 'settings-server-zones-tree'
      SERVER_CATEGORIES.forEach((zone) => {
        const isZoneActive = activeServerCategory === zone.id
        const zoneBtn = document.createElement('button')
        zoneBtn.type = 'button'
        zoneBtn.className = `settings-server-zone-tab ${isZoneActive ? 'active' : ''}`
        zoneBtn.dataset.zone = zone.id
        zoneBtn.innerHTML = `
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#${zone.icon}"></use></svg>
          <span>${zone.label}</span>
        `
        zoneBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          setServerCategory(zone.id)
        })
        tree.appendChild(zoneBtn)
      })
      group.appendChild(tree)
    }

    container.appendChild(group)
  })

  updateServerActiveState()
}

function updateServerActiveState() {
  document.querySelectorAll<HTMLElement>('.settings-server-item[data-target]').forEach((btn) => {
    const target = btn.dataset.target
    btn.classList.toggle('active', target === currentSelectedTarget)
  })
  document.querySelectorAll<HTMLElement>('.slot-pill-btn[data-target]').forEach((btn) => {
    const target = btn.dataset.target
    btn.classList.toggle('active', target === currentSelectedTarget)
  })
}

function updateServerBadgeRam(slug: string, maxRam: number | null) {
  const badge = el(`server-ram-tag-${slug}`) || el(`pill-badge-${slug}`)
  if (badge) {
    badge.innerText = maxRam ? `${maxRam} Go` : 'Auto'
  }
}

export async function applyServerSelection(targetSlug: string) {
  currentSelectedTarget = targetSlug
  updateServerActiveState()

  closeAccountSubpages()
  const globalView = el('global-settings-view')
  const serverView = el('server-settings-view')

  if (targetSlug === 'global') {
    const currentCat = GLOBAL_CATEGORIES.find((c) => c.id === activeCategory)
    setHeaderTitle(currentCat?.label || 'Compte & sécurité')

    if (globalView) {
      globalView.style.display = 'flex'
      globalView.classList.remove('hidden')
    }
    if (serverView) {
      serverView.style.display = 'none'
      serverView.classList.add('hidden')
    }

    // Synchroniser le slider de RAM globale
    syncGlobalRamSliders(currentSettings.memory.min, currentSettings.memory.max)
  } else {
    // Si ce profil n'est pas encore dans la liste connue, on l'ajoute
    let profile = allKnownProfiles.find((p) => p.slug === targetSlug)
    if (!profile) {
      profile = { slug: targetSlug, name: targetSlug }
      allKnownProfiles.push(profile)
      refreshServerPillTabs()
    }
    const serverName = profile?.name || launcherConfig.getServer(targetSlug)?.name || targetSlug
    const currentZone = SERVER_CATEGORIES.find((z) => z.id === activeServerCategory)
    setHeaderTitle(serverName, currentZone?.label || 'Performance', () => {
      applyServerSelection('global')
    })

    if (globalView) {
      globalView.style.display = 'none'
      globalView.classList.add('hidden')
    }
    if (serverView) {
      serverView.style.display = 'flex'
      serverView.classList.remove('hidden')
    }
  }

  // Mettre à jour la navigation et filtrer les cartes
  renderCategoryTabs()
  refreshServerPillTabs()
  applyCategoryFilter()

  if (targetSlug !== 'global') {
    // Mettre à jour l'emplacement et charger les mods optionnels
    try {
      await updateServerLocationCard(targetSlug)
    } catch (locErr) {
      logger.warn('Failed to update server location card:', locErr)
    }

    try {
      refreshOptionalMods(targetSlug)
    } catch (optErr) {
      logger.warn('Failed to refresh optional mods:', optErr)
    }

    // Charger la RAM spécifique ou fallback sur la globale
    serverMemoryTouched = false
    const srvMem = currentSettings.serverSettings?.[targetSlug]?.memory
    const ramMin = typeof srvMem?.min === 'number' ? srvMem.min : currentSettings.memory.min
    const ramMax = typeof srvMem?.max === 'number' ? srvMem.max : currentSettings.memory.max
    syncServerRamSliders(ramMin, ramMax)

    // Hydrater la résolution propre au serveur
    const srvRes = currentSettings.serverSettings?.[targetSlug]?.resolution
    const serverResSelect = el('server-resolution-select') as HTMLSelectElement | null
    if (serverResSelect) {
      if (!srvRes) {
        serverResSelect.value = 'default'
      } else if (srvRes.fullscreen) {
        serverResSelect.value = 'fullscreen'
      } else {
        serverResSelect.value = `${srvRes.width}x${srvRes.height}`
      }
    }

    // Hydrater les arguments JVM du serveur
    const jvmInput = el('server-jvm-args') as HTMLInputElement | null
    if (jvmInput) {
      jvmInput.value = currentSettings.serverSettings?.[targetSlug]?.jvmArgs || ''
    }

    // Hydrater le profil client (Optimisation / Shaders) si autorisé par le serveur
    const presetCard = el('server-client-preset-card') as HTMLElement | null
    const presetSelect = el('server-client-preset-select') as HTMLSelectElement | null
    const presetHint = el('server-client-preset-hint') as HTMLElement | null
    const currentProfile = allKnownProfiles.find((p) => p.slug === targetSlug)
    const clientCfg = currentProfile?.clientConfig || currentProfile?.modey?.clientConfig
    const effectiveLoader = String(clientCfg?.loader || currentProfile?.modey?.loader || currentProfile?.loader || '').toLowerCase()
    const allowClientChoice = Boolean(clientCfg?.allowClientChoice) || effectiveLoader === 'vanilla'
    if (presetCard && presetSelect) {
      presetCard.style.display = allowClientChoice ? '' : 'none'
      const allowedList: string[] = Array.isArray(clientCfg?.availableClientPresets) && clientCfg.availableClientPresets.length > 0
        ? clientCfg.availableClientPresets
        : ['vanilla', 'fabric-opti', 'fabric-shaders']
      Array.from(presetSelect.options).forEach((opt) => {
        if (opt.value === 'auto') {
          opt.hidden = false
        } else {
          opt.hidden = !allowedList.includes(opt.value)
        }
      })
      const savedPreset = currentSettings.serverSettings?.[targetSlug]?.clientPreset || 'auto'
      presetSelect.value = savedPreset
      if (presetHint && clientCfg?.defaultClientPreset) {
        const labels: Record<string, string> = {
          vanilla: 'Vanilla pur',
          'fabric-opti': 'Fabric Optimisation',
          'fabric-shaders': 'Fabric Shaders'
        }
        presetHint.innerText = `Ce serveur autorise le choix du profil client (défaut serveur : ${labels[clientCfg.defaultClientPreset] || clientCfg.defaultClientPreset}). Téléchargement direct depuis Modrinth au lancement.`
      }
    }
  }
}

function syncGlobalRamSliders(minVal: number, maxVal: number) {
  const minInput = el('ram-min') as HTMLInputElement | null
  const maxInput = el('ram-max') as HTMLInputElement | null
  if (minInput) minInput.value = String(minVal)
  if (maxInput) maxInput.value = String(maxVal)
  minInput?.dispatchEvent(new Event('input'))
}

function syncServerRamSliders(minVal: number, maxVal: number) {
  const minInput = el('server-ram-min') as HTMLInputElement | null
  const maxInput = el('server-ram-max') as HTMLInputElement | null
  if (minInput) minInput.value = String(minVal)
  if (maxInput) maxInput.value = String(maxVal)
  minInput?.dispatchEvent(new Event('input'))
}

async function updateServerLocationCard(slug: string) {
  const pathBox = el('server-instance-path')
  try {
    const filesInfo = await files.info()
    const separator = filesInfo.currentPath.includes('/') ? '/' : '\\'
    const fullPath = `${filesInfo.currentPath}${separator}${slug}`
    if (pathBox) pathBox.innerText = fullPath
  } catch (err) {
    if (pathBox) pathBox.innerText = `.../.modey/${slug}`
  }
}

function initServerLocationCardListeners() {
  const openFolderBtn = el('server-open-folder-btn')
  const resetRamBtn = el('server-reset-ram-btn')

  openFolderBtn?.addEventListener('click', async () => {
    if (currentSelectedTarget === 'global') return
    const res = await files.openInstance(currentSelectedTarget)
    if (!res.success) {
      await Dialog.show(res.error || 'Impossible d’ouvrir le dossier du serveur.', [{ text: 'OK', type: 'ok' }])
    }
  })

  resetRamBtn?.addEventListener('click', async () => {
    if (currentSelectedTarget === 'global') return
    const cfg = currentSettings.serverSettings?.[currentSelectedTarget]
    if (cfg) delete cfg.memory

    serverMemoryTouched = false
    syncServerRamSliders(currentSettings.memory.min, currentSettings.memory.max)
    updateServerBadgeRam(currentSelectedTarget, null)
    await saveSettings()
    await Dialog.show(
      'La mémoire RAM de ce serveur est de nouveau héritée du profil général. Les autres réglages du serveur ont été conservés.',
      [{ text: 'OK', type: 'ok' }]
    )
  })
}

async function initUIListeners() {
  const ramMin = el('ram-min') as HTMLInputElement
  const ramMax = el('ram-max') as HTMLInputElement
  const serverRamMin = el('server-ram-min') as HTMLInputElement
  const serverRamMax = el('server-ram-max') as HTMLInputElement
  const launcherActionSelect = el('launcher-action-select') as HTMLSelectElement
  const backgroundSleepSelect = el('background-sleep-select') as HTMLSelectElement
  const javaSelect = el('java-select') as HTMLSelectElement

  ramMin?.addEventListener('input', saveSettingsDebounced)
  ramMax?.addEventListener('input', saveSettingsDebounced)
  serverRamMin?.addEventListener('input', () => { serverMemoryTouched = true; saveSettingsDebounced() })
  serverRamMax?.addEventListener('input', () => { serverMemoryTouched = true; saveSettingsDebounced() })
  launcherActionSelect?.addEventListener('change', saveSettingsDebounced)
  backgroundSleepSelect?.addEventListener('change', saveSettingsDebounced)
  javaSelect?.addEventListener('change', saveSettingsDebounced)

  const launchAtStartupInput = el('launch-at-startup') as HTMLInputElement | null
  launchAtStartupInput?.addEventListener('change', saveSettingsDebounced)

  // Contrôles spécifiques au serveur sélectionné
  const serverResSelect = el('server-resolution-select') as HTMLSelectElement | null
  const serverJvmArgs = el('server-jvm-args') as HTMLInputElement | null
  const serverPresetSelect = el('server-client-preset-select') as HTMLSelectElement | null
  serverResSelect?.addEventListener('change', saveSettingsDebounced)
  serverJvmArgs?.addEventListener('input', saveSettingsDebounced)
  serverPresetSelect?.addEventListener('change', saveSettingsDebounced)

  // Actions de Maintenance & Diagnostics
  const serverRepairBtn = el('server-repair-btn') as HTMLButtonElement | null
  serverRepairBtn?.addEventListener('click', async () => {
    if (currentSelectedTarget === 'global') return
    const originalContent = serverRepairBtn.innerHTML
    serverRepairBtn.disabled = true
    serverRepairBtn.innerHTML = '<svg class="solar-icon spin" aria-hidden="true"><use href="#modey-spinner"></use></svg>&nbsp;Vérification en cours...'
    try {
      const res = await game.verifyIntegrity(currentSelectedTarget)
      if (!res.success) {
        await Dialog.show(res.error || 'Erreur lors de la vérification des fichiers.', [{ text: 'Fermer', type: 'danger' }], 'Diagnostic Serveur')
      } else {
        await Dialog.show(
          `Vérification de l'installation terminée avec succès !\n\n• Fichiers totaux : ${res.total || 0}\n• Fichiers intègres : ${res.valid || 0}\n• Fichiers réparés/téléchargés : ${res.repaired || 0}`,
          [{ text: 'Super !', type: 'ok' }],
          'Vérification & Réparation'
        )
      }
    } catch (err: any) {
      logger.error('Repair failed:', err)
      await Dialog.show(`Échec du diagnostic : ${err?.message || err}`, [{ text: 'Fermer', type: 'danger' }], 'Erreur')
    } finally {
      serverRepairBtn.disabled = false
      serverRepairBtn.innerHTML = originalContent
    }
  })

  const serverOpenLogsBtn = el('server-open-logs-btn') as HTMLButtonElement | null
  serverOpenLogsBtn?.addEventListener('click', async () => {
    if (currentSelectedTarget === 'global') return
    const res = await files.openServerLogs(currentSelectedTarget)
    if (!res.success) {
      await Dialog.show(res.error || 'Impossible d’ouvrir le dossier des logs du serveur.', [{ text: 'OK', type: 'ok' }])
    }
  })

  // Notices licences tierces
  const noticesBtn = el('btn-view-third-party-notices') as HTMLButtonElement | null
  noticesBtn?.addEventListener('click', async () => {
    await Dialog.show(
      `NOTICES ET LICENCES TIERCES DU MODEY LAUNCHER\n\n` +
      `1. EML Template & Lib (MIT) © 2026 GoldFrite\n` +
      `2. skinview3d (MIT) © 2020-2023 invis_ghost\n` +
      `3. Solar Icons (CC BY 4.0) © 480 Design\n` +
      `4. Fond d'écran bg.png (CC BY-ND 3.0)\n` +
      `5. authlib-injector (AGPL-3.0 avec Exception explicite d'exécution autorisée)\n\n` +
      `Pour consulter les textes intégraux de chaque licence, consultez le fichier THIRD-PARTY-NOTICES.md packagé avec le launcher.`,
      [{ text: 'Fermer', type: 'ok' }],
      'Licences Tierces'
    )
  })

  // Sélecteur de Thème Clair / Sombre / Système
  const themeSelect = el('theme-select') as HTMLSelectElement | null
  if (themeSelect) {
    themeSelect.value = getTheme()
    themeSelect.addEventListener('change', () => {
      setTheme(themeSelect.value as ThemePreference)
    })
    onThemeChange((_, pref) => {
      if (themeSelect.value !== pref) themeSelect.value = pref
    })
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveSettingsDebounced() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveSettings, 300)
}

async function saveSettings() {
  const minInput = el('ram-min') as HTMLInputElement
  const maxInput = el('ram-max') as HTMLInputElement
  const serverMinInput = el('server-ram-min') as HTMLInputElement
  const serverMaxInput = el('server-ram-max') as HTMLInputElement
  const launcherActionSelect = el('launcher-action-select') as HTMLSelectElement
  const backgroundSleepSelect = el('background-sleep-select') as HTMLSelectElement
  const javaSelect = el('java-select') as HTMLSelectElement
  const channelSelect = el('update-channel-select') as HTMLSelectElement | null
  const autoUpdateCheck = el('auto-update-check') as HTMLInputElement | null
  const launchAtStartup = el('launch-at-startup') as HTMLInputElement | null

  const minRam = parseFloat(minInput?.value || '2')
  const maxRam = parseFloat(maxInput?.value || '8')

  const newSettings: IGameSettings = {
    ...currentSettings,
    memory: currentSelectedTarget === 'global'
      ? { min: minRam, max: maxRam }
      : currentSettings.memory,
    serverSettings: {
      ...(currentSettings.serverSettings || {})
    },
    resolution: currentSettings.resolution || {
      width: 1280,
      height: 720,
      fullscreen: false
    },
    java: javaSelect.value === 'system'
      ? 'system'
      : javaSelect.value === 'custom'
        ? currentSettings.java
        : 'bundled',
    launcherAction: launcherActionSelect.value as 'close' | 'keep' | 'hide',
    backgroundSleep: Number(backgroundSleepSelect?.value) || 0,
    launchAtStartup: portableMode
      ? false
      : launchAtStartup ? launchAtStartup.checked : currentSettings.launchAtStartup,
    autoUpdateCheck: autoUpdateCheck ? autoUpdateCheck.checked : currentSettings.autoUpdateCheck,
    betaChannel: channelSelect ? channelSelect.value === 'beta' : !!currentSettings.betaChannel,
    uiScale: getUiScaleValue()
  }

  if (currentSelectedTarget !== 'global') {
    const srvMin = parseFloat(serverMinInput?.value || String(minRam))
    const srvMax = parseFloat(serverMaxInput?.value || String(maxRam))
    const serverResSelect = el('server-resolution-select') as HTMLSelectElement | null
    const jvmInput = el('server-jvm-args') as HTMLInputElement | null
    const serverPresetSelect = el('server-client-preset-select') as HTMLSelectElement | null

    let parsedResolution: { width: number; height: number; fullscreen: boolean } | undefined
    if (serverResSelect && serverResSelect.value !== 'default') {
      const isFullscreen = serverResSelect.value === 'fullscreen'
      const matchRes = resolutionList.find((r) => r.value === serverResSelect.value)
      parsedResolution = {
        fullscreen: isFullscreen,
        width: matchRes?.width ?? 1280,
        height: matchRes?.height ?? 720
      }
    }

    const jvmArgsVal = jvmInput?.value?.trim() || ''
    const presetVal = serverPresetSelect?.value || 'auto'

    const existingCfg = newSettings.serverSettings![currentSelectedTarget] || {}
    const shouldPersistMemory = serverMemoryTouched || existingCfg.memory != null

    const nextCfg: IServerGameSettings = {
      ...existingCfg,
      resolution: parsedResolution,
      jvmArgs: jvmArgsVal,
      useDefaultJvmArgs: true
    }

    if (presetVal && presetVal !== 'auto') {
      nextCfg.clientPreset = presetVal
    } else {
      delete nextCfg.clientPreset
    }

    if (shouldPersistMemory) {
      nextCfg.memory = { min: srvMin, max: srvMax }
    } else {
      delete nextCfg.memory
    }

    newSettings.serverSettings![currentSelectedTarget] = nextCfg
    updateServerBadgeRam(currentSelectedTarget, shouldPersistMemory ? srvMax : null)
  }

  try {
    await settings.set(newSettings)
    currentSettings = newSettings
    logger.log('Settings saved', { target: currentSelectedTarget })
  } catch (err) {
    logger.error('Failed to save settings:', err)
    await Dialog.show('Impossible de sauvegarder les paramètres.', [{ text: 'OK', type: 'ok' }])
  }
}

function initDualSlider(sysInfo: any) {
  setupDualSliderHelper('ram-min', 'ram-max', 'ram-track-fill', 'ram-min-label', 'ram-max-label', sysInfo)
  setupDualSliderHelper('server-ram-min', 'server-ram-max', 'server-ram-track-fill', 'server-ram-min-label', 'server-ram-max-label', sysInfo)
}

function setupDualSliderHelper(
  minId: string,
  maxId: string,
  fillId: string,
  minLabelId: string,
  maxLabelId: string,
  sysInfo: any
) {
  const minInput = el(minId) as HTMLInputElement
  const maxInput = el(maxId) as HTMLInputElement
  const fill = el(fillId)
  const minLabel = el(minLabelId)
  const maxLabel = el(maxLabelId)
  if (!minInput || !maxInput || !fill) return

  const totalGB = Math.max(8, Number(sysInfo?.totalMem) || 16)
  minInput.max = String(totalGB)
  maxInput.max = String(totalGB)

  const minBound = parseFloat(minInput.min) || 0.5
  const maxBound = totalGB
  const range = maxBound - minBound

  const gap = 0.5
  const updateSlider = () => {
    let minVal = parseFloat(minInput.value)
    let maxVal = parseFloat(maxInput.value)

    if (maxVal - minVal < gap) {
      if (minVal > maxVal - gap) {
        minInput.value = (maxVal - gap).toFixed(1)
        minVal = parseFloat(minInput.value)
      } else {
        maxInput.value = (minVal + gap).toFixed(1)
        maxVal = parseFloat(maxInput.value)
      }
    }

    if (minLabel) minLabel.innerText = `Min : ${minVal} Go`
    if (maxLabel) maxLabel.innerText = `Max : ${maxVal} Go (sur ${sysInfo?.totalMem || 16} Go)`

    const minPercent = Math.max(0, Math.min(100, ((minVal - minBound) / range) * 100))
    const maxPercent = Math.max(0, Math.min(100, ((maxVal - minBound) / range) * 100))

    fill.style.left = `${minPercent}%`
    fill.style.width = `${maxPercent - minPercent}%`

    // Feedback couleur dynamique selon la RAM allouée (vert / orange / rouge)
    const ratio = maxVal / totalGB
    if (ratio > 0.75) {
      fill.style.background = 'linear-gradient(90deg, var(--warning), var(--danger))'
    } else if (ratio > 0.5) {
      fill.style.background = 'linear-gradient(90deg, var(--success), var(--warning))'
    } else {
      fill.style.background = 'linear-gradient(90deg, var(--success), var(--accent))'
    }
  }

  minInput.addEventListener('input', updateSlider)
  maxInput.addEventListener('input', updateSlider)
  updateSlider()
}

const UI_SCALE_MIN_PCT = 75
const UI_SCALE_MAX_PCT = 150
const UI_SCALE_STEP_PCT = 5

function getUiScaleValue(): number {
  const input = el('ui-scale') as HTMLInputElement
  const pct = input ? parseInt(input.value, 10) : 100
  return Math.min(UI_SCALE_MAX_PCT, Math.max(UI_SCALE_MIN_PCT, pct)) / 100
}

function updateUiScaleUI() {
  const input = el('ui-scale') as HTMLInputElement
  const fill = el('ui-scale-fill')
  const value = el('ui-scale-value')
  if (!input) return

  const pct = parseInt(input.value, 10) || 100
  if (value) value.innerText = `${pct} %`
  if (fill) {
    const percent = ((pct - UI_SCALE_MIN_PCT) / (UI_SCALE_MAX_PCT - UI_SCALE_MIN_PCT)) * 100
    fill.style.left = '0%'
    fill.style.width = `${percent}%`
  }
}

function stepUiScale(delta: number) {
  const input = el('ui-scale') as HTMLInputElement
  if (!input) return
  const next = Math.min(UI_SCALE_MAX_PCT, Math.max(UI_SCALE_MIN_PCT, (parseInt(input.value, 10) || 100) + delta))
  input.value = String(next)
  input.dispatchEvent(new Event('input'))
}

let zoomTimer: ReturnType<typeof setTimeout> | null = null
function initUiScale() {
  const input = el('ui-scale') as HTMLInputElement
  const minus = el('ui-scale-minus')
  const plus = el('ui-scale-plus')
  if (!input) return

  input.addEventListener('input', () => {
    updateUiScaleUI()
    if (zoomTimer) clearTimeout(zoomTimer)
    zoomTimer = setTimeout(saveSettings, 120)
  })
  minus?.addEventListener('click', () => stepUiScale(-UI_SCALE_STEP_PCT))
  plus?.addEventListener('click', () => stepUiScale(UI_SCALE_STEP_PCT))
}

function initFormValues(_sysResolution: { width: number; height: number }) {
  if (!currentSettings) return

  const minInput = el('ram-min') as HTMLInputElement
  const maxInput = el('ram-max') as HTMLInputElement
  const launcherActionSelect = el('launcher-action-select') as HTMLSelectElement
  const javaSelect = el('java-select') as HTMLSelectElement

  if (minInput) minInput.value = String(currentSettings.memory.min)
  if (maxInput) maxInput.value = String(currentSettings.memory.max)

  if (launcherActionSelect) launcherActionSelect.value = currentSettings.launcherAction
  const backgroundSleepSelect = el('background-sleep-select') as HTMLSelectElement
  if (backgroundSleepSelect) backgroundSleepSelect.value = String(currentSettings.backgroundSleep ?? 0)

  const launchAtStartupInput = el('launch-at-startup') as HTMLInputElement | null
  if (launchAtStartupInput) launchAtStartupInput.checked = !!currentSettings.launchAtStartup

  // Le démarrage automatique n'a pas de sens depuis une clé USB.
  if (portableMode) {
    if (launchAtStartupInput) {
      launchAtStartupInput.checked = false
      launchAtStartupInput.disabled = true
    }
    el('launch-at-startup-portable-note')?.classList.remove('hidden')
  }

  const javaVal = currentSettings.java
  if (javaVal && javaVal !== 'bundled' && javaVal !== 'system') {
    let customOpt = javaSelect.querySelector<HTMLOptionElement>('option[value="custom"]')
    if (!customOpt) {
      customOpt = document.createElement('option')
      customOpt.value = 'custom'
      javaSelect.appendChild(customOpt)
    }
    customOpt.textContent = `Personnalisé (${javaVal})`
    javaSelect.value = 'custom'
  } else {
    javaSelect.value = javaVal === 'system' ? 'system' : 'bundled'
  }

  const uiScaleInput = el('ui-scale') as HTMLInputElement
  if (uiScaleInput) uiScaleInput.value = String(Math.round((currentSettings.uiScale ?? 1) * 100))
  updateUiScaleUI()

  minInput?.dispatchEvent(new Event('input'))
}
