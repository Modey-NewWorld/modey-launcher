import { getTheme, setTheme, onThemeChange, type ThemePreference } from "../../theme"
import { settings, system, profiles, files, game, auth } from '../../ipc'
import type { IGameSettings, IServerGameSettings } from '../../../electron/handlers/settings'
import { Dialog } from '../../components/dialog'
import { getUser } from '../../state'
import { setRouterHooks } from '../../router'
import { initUpdateCard } from './components/updateCard'
import { initFilesRoot, refreshFilesCard } from './components/filesRoot'
import { initOptionalModsCard, refreshOptionalMods } from './components/optionalModsCard'
import { launcherConfig } from '../../services/launcherConfig'
import { openDiscordInvite } from '../../services/discord'
import logger from 'electron-log/renderer'
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
let allKnownProfiles: any[] = []
let serverMemoryTouched = false
let portableMode = false

type SettingsViewKind = 'global' | 'server'

interface SettingsCategory {
  id: string
  label: string
  icon: string
}

const GLOBAL_CATEGORIES: SettingsCategory[] = [
  { id: 'account', label: 'Compte & sécurité', icon: 'solar-shield-check-bold' },
  { id: 'game', label: 'Jeu & performance', icon: 'solar-gamepad-bold' },
  { id: 'interface', label: 'Interface & comportement', icon: 'solar-monitor-bold' },
  { id: 'storage', label: 'Mises à jour & stockage', icon: 'solar-download-bold' },
  { id: 'about', label: 'À propos & licences', icon: 'solar-info-bold' }
]

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

function renderCategoryTabs() {
  const bar = el('settings-category-bar')
  if (!bar) return

  const categories = currentCategories()
  if (!categories.some((cat) => cat.id === activeCategory)) {
    const stored = lastCategoryByView[currentViewKind()]
    activeCategory = categories.some((cat) => cat.id === stored) ? stored : categories[0].id
  }

  bar.innerHTML = ''
  for (const cat of categories) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `settings-category-tab ${cat.id === activeCategory ? 'active' : ''}`
    btn.dataset.cat = cat.id
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', String(cat.id === activeCategory))
    btn.innerHTML = `<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#${cat.icon}"></use></svg><span>${cat.label}</span>`
    btn.addEventListener('click', () => setCategory(cat.id))
    bar.appendChild(btn)
  }

  applyCategoryFilter()
}

function setCategory(categoryId: string) {
  activeCategory = categoryId
  lastCategoryByView[currentViewKind()] = categoryId

  document.querySelectorAll<HTMLElement>('.settings-category-tab').forEach((btn) => {
    const isActive = btn.dataset.cat === categoryId
    btn.classList.toggle('active', isActive)
    btn.setAttribute('aria-selected', String(isActive))
  })

  applyCategoryFilter()
}

function applyCategoryFilter() {
  const viewId = currentViewKind() === 'global' ? 'global-settings-view' : 'server-settings-view'
  const view = el(viewId)
  if (!view) return

  view.querySelectorAll<HTMLElement>('.settings-card').forEach((card) => {
    card.hidden = card.dataset.cat !== activeCategory
  })

  const scrollEl = el('settings-scroll')
  if (scrollEl) {
    scrollEl.classList.toggle('is-cat-content', activeCategory === 'content' && currentViewKind() === 'server')
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

async function initAccountSettings() {
  const user = getUser()
  if (!user) return

  // 1. Profil joueur
  const avatarEl = el('settings-account-avatar') as HTMLImageElement | null
  const usernameEl = el('settings-account-username')
  const emailEl = el('settings-account-email')
  const roleBadgeEl = el('settings-account-role-badge')
  const uuidEl = el('settings-account-uuid')

  if (avatarEl) {
    avatarEl.src = (user as any).avatar?.url || `https://minotar.net/avatar/${user.name}/64.png`
  }
  if (usernameEl) usernameEl.innerText = user.name
  if (emailEl) emailEl.innerText = (user as any).email || 'Compte joueur officiel Modey'
  if (uuidEl) uuidEl.innerText = user.uuid
  if (roleBadgeEl) {
    const rawRole = ((user as any).role || 'citizen').toLowerCase()
    roleBadgeEl.innerText = (user as any).roleLabel || (rawRole.charAt(0).toUpperCase() + rawRole.slice(1))
    if ((user as any).roleGradient) {
      roleBadgeEl.style.background = (user as any).roleGradient
      roleBadgeEl.style.color = '#ffffff'
    } else if ((user as any).roleColor) {
      roleBadgeEl.style.background = (user as any).roleColor
      roleBadgeEl.style.color = '#ffffff'
    }
  }

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
        badge2FA.style.background = isEnabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)'
        badge2FA.style.color = isEnabled ? '#22c55e' : '#f59e0b'
      }

      if (banner2FA) {
        if (isEnabled) {
          banner2FA.style.background = 'rgba(34, 197, 94, 0.08)'
          banner2FA.style.borderColor = 'rgba(34, 197, 94, 0.25)'
          banner2FA.innerHTML = `
            <svg class="solar-icon solar-bold" style="font-size:24px; color:#22c55e; flex-shrink:0;" aria-hidden="true"><use href="#solar-shield-check-bold"></use></svg>
            <div style="font-size:12.5px; color:var(--text-main); line-height:1.4;">
              <strong style="color:#22c55e;">Votre compte est protégé par la double authentification.</strong><br/>
              <span style="color:var(--text-muted); font-size:11.5px;">Chaque nouvelle connexion requiert un code généré par Google Authenticator sur votre smartphone.</span>
            </div>
          `
          if (btnSetup2FA) btnSetup2FA.style.display = 'none'
          if (btnDisable2FA) btnDisable2FA.style.display = 'inline-flex'
        } else {
          banner2FA.style.background = 'rgba(245, 158, 11, 0.08)'
          banner2FA.style.borderColor = 'rgba(245, 158, 11, 0.25)'
          banner2FA.innerHTML = `
            <svg class="solar-icon solar-bold" style="font-size:24px; color:#f59e0b; flex-shrink:0;" aria-hidden="true"><use href="#solar-shield-warning-bold"></use></svg>
            <div style="font-size:12.5px; color:var(--text-main); line-height:1.4;">
              <strong style="color:#fbbf24;">Protection 2FA recommandée.</strong><br/>
              <span style="color:var(--text-muted); font-size:11.5px;">Activez Google Authenticator pour sécuriser votre compte contre toute tentative d'intrusion.</span>
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

      if (list.length === 0) {
        sessionsList.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:12px;">Aucune session trouvée.</div>'
        return
      }

      sessionsList.innerHTML = list.map((s: any) => {
        const lastActive = s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Récemment'
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); padding:10px 14px; border-radius:10px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <svg class="solar-icon solar-bold" style="color:var(--primary); font-size:20px;"><use href="#solar-monitor-bold"></use></svg>
              <div>
                <div style="font-size:13px; font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:8px;">
                  ${s.deviceName}
                  ${s.isCurrent ? '<span style="font-size:10px; font-weight:700; color:#22c55e; background:rgba(34,197,94,0.15); padding:1px 6px; border-radius:10px;">Cet appareil</span>' : ''}
                </div>
                <div style="font-size:11px; color:var(--text-muted);">
                  IP: ${s.ipAddress} · Dernière activité : ${lastActive}
                </div>
              </div>
            </div>
            ${!s.isCurrent ? `
              <button type="button" class="settings-btn btn-revoke-single" data-token="${s.token}" style="padding:4px 10px; font-size:11px; color:var(--danger, #ef4444); border-color:rgba(239,68,68,0.25);">
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

  await refresh2FAStatus()
  await loadSessions()
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

  setRouterHooks({
    onShowSettings: () => {
      refreshFilesCard()
      refreshServerPillTabs()
      initAccountSettings()
    }
  })
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
  const container = el('settings-pills-servers')
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
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'slot-pill-btn'
    btn.dataset.target = p.slug
    btn.id = `pill-tab-server-${p.slug}`

    const srvName = p.name || launcherConfig.getServer(p.slug)?.name || p.slug
    const ramAllocated = currentSettings?.serverSettings?.[p.slug]?.memory?.max
    const badgeText = ramAllocated ? `${ramAllocated} Go` : 'Auto'

    btn.innerHTML = `
      <svg class="solar-icon solar-bold" style="color:var(--accent);" aria-hidden="true"><use href="#solar-gamepad-bold"></use></svg>
      <span>${srvName}</span>
      <span class="slot-count-tag" id="pill-badge-${p.slug}" title="RAM allouée">${badgeText}</span>
    `

    btn.addEventListener('click', () => {
      applyServerSelection(p.slug)
    })

    container.appendChild(btn)
  })

  // Synchroniser la classe active sur le bon onglet
  updatePillsActiveState()
}

function updatePillsActiveState() {
  document.querySelectorAll('.slot-pill-btn[data-target]').forEach((btn) => {
    const target = (btn as HTMLElement).dataset.target
    if (target === currentSelectedTarget) {
      btn.classList.add('active')
    } else {
      btn.classList.remove('active')
    }
  })
}

function updateServerBadgeRam(slug: string, maxRam: number | null) {
  const badge = el(`pill-badge-${slug}`)
  if (badge) {
    badge.innerText = maxRam ? `${maxRam} Go` : 'Auto'
  }
}

export async function applyServerSelection(targetSlug: string) {
  currentSelectedTarget = targetSlug
  updatePillsActiveState()

  const titleEl = el('settings-title')
  const subtitleEl = el('settings-subtitle')
  const globalView = el('global-settings-view')
  const serverView = el('server-settings-view')

  if (targetSlug === 'global') {
    if (titleEl) titleEl.innerText = 'Paramètres généraux'
    if (subtitleEl) subtitleEl.innerText = "Personnalise ton launcher, l'affichage, Java et tes fichiers de jeu généraux."

    if (globalView) {
      globalView.style.display = 'contents'
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

    if (titleEl) titleEl.innerText = `Paramètres : ${serverName}`
    if (subtitleEl) subtitleEl.innerText = `Personnalise la mémoire, les fichiers locaux et les extensions pour ${serverName}.`

    if (globalView) {
      globalView.style.display = 'none'
      globalView.classList.add('hidden')
    }
    if (serverView) {
      serverView.style.display = 'contents'
      serverView.classList.remove('hidden')
    }
  }

  // Mettre à jour la navigation par catégories et filtrer les cartes
  const kind: SettingsViewKind = targetSlug === 'global' ? 'global' : 'server'
  activeCategory = lastCategoryByView[kind]
  renderCategoryTabs()

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
