import { getTheme, setTheme, onThemeChange, type ThemePreference } from "../../theme"
import { settings, system, profiles, files, game } from '../../ipc'
import type { IGameSettings, IServerGameSettings } from '../../../electron/handlers/settings'
import { Dialog } from '../../components/dialog'
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

export async function initSettings() {
  const sysInfo = await system.getInfo()
  currentSettings = await settings.get()
  if (!currentSettings.serverSettings) {
    currentSettings.serverSettings = {}
  }

  initUIListeners()
  initDualSlider(sysInfo)
  initUiScale()
  initFormValues(sysInfo.resolution)
  populateAbout(sysInfo)
  initUpdateCard(sysInfo.version ?? '')
  initFilesRoot()
  initOptionalModsCard()
  await initServerPillTabs()
  initServerLocationCardListeners()

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
    if (!currentSettings.serverSettings) currentSettings.serverSettings = {}
    delete currentSettings.serverSettings[currentSelectedTarget]

    syncServerRamSliders(currentSettings.memory.min, currentSettings.memory.max)
    updateServerBadgeRam(currentSelectedTarget, null)
    await saveSettings()
    await Dialog.show('La mémoire RAM de ce serveur a été réalignée sur le profil général.', [{ text: 'OK', type: 'ok' }])
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
  serverRamMin?.addEventListener('input', saveSettingsDebounced)
  serverRamMax?.addEventListener('input', saveSettingsDebounced)
  launcherActionSelect?.addEventListener('change', saveSettingsDebounced)
  backgroundSleepSelect?.addEventListener('change', saveSettingsDebounced)
  javaSelect?.addEventListener('change', saveSettingsDebounced)

  // Contrôles spécifiques au serveur sélectionné
  const serverResSelect = el('server-resolution-select') as HTMLSelectElement | null
  const serverJvmArgs = el('server-jvm-args') as HTMLInputElement | null
  serverResSelect?.addEventListener('change', saveSettingsDebounced)
  serverJvmArgs?.addEventListener('input', saveSettingsDebounced)

  // Actions de Maintenance & Diagnostics
  const serverRepairBtn = el('server-repair-btn') as HTMLButtonElement | null
  serverRepairBtn?.addEventListener('click', async () => {
    if (currentSelectedTarget === 'global') return
    const originalContent = serverRepairBtn.innerHTML
    serverRepairBtn.disabled = true
    serverRepairBtn.innerHTML = '<svg class="solar-icon solar-bold spin" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>&nbsp;Vérification en cours...'
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
    java: javaSelect.value === 'bundled' ? 'bundled' : 'path',
    launcherAction: launcherActionSelect.value as 'close' | 'keep' | 'hide',
    backgroundSleep: Number(backgroundSleepSelect?.value) || 0,
    uiScale: getUiScaleValue()
  }

  if (currentSelectedTarget !== 'global') {
    const srvMin = parseFloat(serverMinInput?.value || String(minRam))
    const srvMax = parseFloat(serverMaxInput?.value || String(maxRam))
    const serverResSelect = el('server-resolution-select') as HTMLSelectElement | null
    const jvmInput = el('server-jvm-args') as HTMLInputElement | null

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

    newSettings.serverSettings![currentSelectedTarget] = {
      ...(newSettings.serverSettings![currentSelectedTarget] || {}),
      memory: {
        min: srvMin,
        max: srvMax
      },
      resolution: parsedResolution,
      jvmArgs: jvmArgsVal,
      useDefaultJvmArgs: true
    }
    updateServerBadgeRam(currentSelectedTarget, srvMax)
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
  if (javaSelect) javaSelect.value = currentSettings.java === 'bundled' ? 'bundled' : 'custom'

  const uiScaleInput = el('ui-scale') as HTMLInputElement
  if (uiScaleInput) uiScaleInput.value = String(Math.round((currentSettings.uiScale ?? 1) * 100))
  updateUiScaleUI()

  minInput?.dispatchEvent(new Event('input'))
}
