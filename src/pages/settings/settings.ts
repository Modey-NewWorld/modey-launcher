import { settings, system } from '../../ipc'
import type { IGameSettings } from '../../../electron/handlers/settings'
import { Dialog } from '../../components/dialog'
import { setRouterHooks } from '../../router'
import { initUpdateCard } from './components/updateCard'
import { initFilesRoot, refreshFilesCard } from './components/filesRoot'
import logger from 'electron-log/renderer'
import settingsHtml from './index.html?raw'
import './settings.scss'

const el = (id: string) => document.getElementById(id)

// La page RÃ©glages est une sous-page de #view-home (fin de conteneur).
const mount = el('view-home')
if (mount && !el('settings-page')) mount.insertAdjacentHTML('beforeend', settingsHtml)

const resolutionList = [
  { label: 'Auto (dÃ©faut)', value: '854x480', width: 854, height: 480 },
  { label: 'Plein Ã©cran', value: 'fullscreen', width: 854, height: 480 },
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

export async function initSettings() {
  const sysInfo = await system.getInfo()
  currentSettings = await settings.get()

  initUIListeners()
  initDualSlider(sysInfo)
  initUiScale()
  initFormValues(sysInfo.resolution)
  populateAbout(sysInfo)
  initUpdateCard(sysInfo.version ?? '')
  initFilesRoot()
  setRouterHooks({ onShowSettings: refreshFilesCard })
}

function populateAbout(sysInfo: any) {
  const versionEl = el('settings-version')
  const emllibEl = el('settings-emllib')
  const electronEl = el('settings-electron')
  const osEl = el('settings-os')
  if (versionEl) versionEl.innerText = sysInfo.version ?? 'â€”'
  if (emllibEl) emllibEl.innerText = '2.3.5'
  if (electronEl) electronEl.innerText = process.versions.electron ?? 'â€”'
  if (osEl) osEl.innerText = `${process.platform} ${process.arch}`
}

async function initUIListeners() {
  const ramMin = el('ram-min') as HTMLInputElement
  const ramMax = el('ram-max') as HTMLInputElement
  const resolutionSelect = el('resolution-select') as HTMLSelectElement
  const launcherActionSelect = el('launcher-action-select') as HTMLSelectElement
  const backgroundSleepSelect = el('background-sleep-select') as HTMLSelectElement
  const javaSelect = el('java-select') as HTMLSelectElement

  ramMin?.addEventListener('input', saveSettingsDebounced)
  ramMax?.addEventListener('input', saveSettingsDebounced)
  resolutionSelect?.addEventListener('change', saveSettingsDebounced)
  launcherActionSelect?.addEventListener('change', saveSettingsDebounced)
  backgroundSleepSelect?.addEventListener('change', saveSettingsDebounced)
  javaSelect?.addEventListener('change', saveSettingsDebounced)
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveSettingsDebounced() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveSettings, 300)
}

async function saveSettings() {
  const minInput = el('ram-min') as HTMLInputElement
  const maxInput = el('ram-max') as HTMLInputElement
  const launcherActionSelect = el('launcher-action-select') as HTMLSelectElement
  const backgroundSleepSelect = el('background-sleep-select') as HTMLSelectElement
  const resolutionSelect = el('resolution-select') as HTMLSelectElement
  const javaSelect = el('java-select') as HTMLSelectElement

  const newSettings: IGameSettings = {
    ...currentSettings,
    memory: {
      min: parseFloat(minInput.value),
      max: parseFloat(maxInput.value)
    },
    resolution: {
      height: resolutionList.find((r) => r.value === resolutionSelect.value)?.height ?? 854,
      width: resolutionList.find((r) => r.value === resolutionSelect.value)?.width ?? 480,
      fullscreen: resolutionSelect.value === 'fullscreen'
    },
    java: javaSelect.value === 'bundled' ? 'bundled' : 'path',
    launcherAction: launcherActionSelect.value as 'close' | 'keep' | 'hide',
    backgroundSleep: Number(backgroundSleepSelect?.value) || 0,
    betaChannel: (el('settings-beta-channel') as HTMLInputElement)?.checked ?? false,
    uiScale: getUiScaleValue()
  }

  try {
    await settings.set(newSettings)
    currentSettings = newSettings
    logger.log('Settings saved')
  } catch (err) {
    logger.error('Failed to save settings:', err)
    await Dialog.show('Impossible de sauvegarder les paramÃ¨tres.', [{ text: 'OK', type: 'ok' }])
  }
}

function initDualSlider(sysInfo: any) {
  const minInput = el('ram-min') as HTMLInputElement
  const maxInput = el('ram-max') as HTMLInputElement
  const fill = el('ram-track-fill')
  const minLabel = el('ram-min-label')
  const maxLabel = el('ram-max-label')
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

    // Feedback couleur dynamique selon la RAM allouÃ©e (vert / orange / rouge)
    const totalGB = sysInfo?.totalMem || 16
    const ratio = maxVal / totalGB
    if (ratio > 0.75) {
      fill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)'
    } else if (ratio > 0.5) {
      fill.style.background = 'linear-gradient(90deg, #10b981, #f59e0b)'
    } else {
      fill.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)'
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
    // Sauvegarde rapide pour que le zoom suive le curseur
    if (zoomTimer) clearTimeout(zoomTimer)
    zoomTimer = setTimeout(saveSettings, 120)
  })
  minus?.addEventListener('click', () => stepUiScale(-UI_SCALE_STEP_PCT))
  plus?.addEventListener('click', () => stepUiScale(UI_SCALE_STEP_PCT))
}

function initFormValues(resolution: { width: number; height: number }) {
  if (!currentSettings) return

  const minInput = el('ram-min') as HTMLInputElement
  const maxInput = el('ram-max') as HTMLInputElement
  const resolutionSelect = el('resolution-select') as HTMLSelectElement
  const launcherActionSelect = el('launcher-action-select') as HTMLSelectElement
  const javaSelect = el('java-select') as HTMLSelectElement

  if (minInput) minInput.value = String(currentSettings.memory.min)
  if (maxInput) maxInput.value = String(currentSettings.memory.max)

  if (resolutionSelect) {
    const availableResolutions = getAvailableResolutions(resolution)
    resolutionSelect.innerHTML = ''
    availableResolutions.forEach((res) => {
      const option = document.createElement('option')
      option.value = res.value
      option.innerText = res.label
      resolutionSelect.appendChild(option)
    })

    resolutionSelect.value = currentSettings.resolution.fullscreen ? 'fullscreen' : `${currentSettings.resolution.width}x${currentSettings.resolution.height}`
  }
  if (launcherActionSelect) launcherActionSelect.value = currentSettings.launcherAction
  const backgroundSleepSelect = el('background-sleep-select') as HTMLSelectElement
  if (backgroundSleepSelect) backgroundSleepSelect.value = String(currentSettings.backgroundSleep ?? 0)
  if (javaSelect) javaSelect.value = currentSettings.java === 'bundled' ? 'bundled' : 'custom'
  const betaChannelCb = el('settings-beta-channel') as HTMLInputElement
  if (betaChannelCb) betaChannelCb.checked = Boolean(currentSettings.betaChannel)
  betaChannelCb?.addEventListener('change', saveSettingsDebounced)

  const uiScaleInput = el('ui-scale') as HTMLInputElement
  if (uiScaleInput) uiScaleInput.value = String(Math.round((currentSettings.uiScale ?? 1) * 100))
  updateUiScaleUI()

  minInput.dispatchEvent(new Event('input'))
}

function getAvailableResolutions(systemResolution: { width: number; height: number }) {
  return resolutionList.filter((res) => res.width <= systemResolution.width && res.height <= systemResolution.height)
}
