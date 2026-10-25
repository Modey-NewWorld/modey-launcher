import { bootstraps } from '../ipc'
import { showSettings } from '../router'
import logger from 'electron-log/renderer'

const SNOOZE_STORAGE_KEY = 'modey_update_snooze_until'

/**
 * Service gérant la mini-popup (Toast) de mise à jour au-dessus du bouton Jouer
 */
export async function checkAndShowUpdateToast() {
  const toastEl = document.getElementById('update-toast-popup')
  const versionEl = document.getElementById('toast-update-version')
  const titleEl = document.getElementById('toast-update-title')
  const btnUpdate = document.getElementById('btn-toast-update')
  const btnDismiss = document.getElementById('btn-toast-dismiss')
  const btnSnoozeToggle = document.getElementById('btn-toast-snooze-toggle')
  const snoozeMenu = document.getElementById('toast-snooze-menu')

  if (!toastEl) return

  // 1. Vérifier si un rappel a été différé par le joueur
  try {
    const snoozedUntil = localStorage.getItem(SNOOZE_STORAGE_KEY)
    if (snoozedUntil && Date.now() < Number(snoozedUntil)) {
      // Encore en période de silence, ne pas afficher la popup
      return
    }
  } catch (_) {}

  // 2. Interroger la présence d'une nouvelle version
  try {
    const res = await bootstraps.check()
    if (!res || !res.updateAvailable) {
      toastEl.style.display = 'none'
      return
    }

    // Si la mise à jour est obligatoire, l'écran plein écran de démarrage s'en charge déjà
    if ((res as any).mandatory) {
      toastEl.style.display = 'none'
      return
    }

    // Afficher la mini-popup
    if (versionEl) versionEl.innerText = `v${res.latestVersion}`
    if (titleEl) {
      titleEl.innerText = (res as any).channel === 'beta' 
        ? `Nouvelle version Bêta v${res.latestVersion} disponible !`
        : `Modey Launcher v${res.latestVersion} est disponible !`
    }
    toastEl.style.display = 'flex'

    // Clic sur "Mettre à jour" : basculer vers les paramètres pour installer
    btnUpdate?.addEventListener('click', () => {
      toastEl.style.display = 'none'
      showSettings()
      // Déclencher le bouton d'installation dans les paramètres
      setTimeout(() => {
        const installBtn = document.getElementById('update-install-btn') as HTMLButtonElement | null
        const checkBtn = document.getElementById('update-check-btn') as HTMLButtonElement | null
        if (installBtn && !installBtn.classList.contains('hidden')) {
          installBtn.click()
        } else if (checkBtn) {
          checkBtn.click()
        }
      }, 200)
    })

    // Clic sur fermer (croix) : masque pour cette session
    btnDismiss?.addEventListener('click', () => {
      toastEl.style.display = 'none'
    })

    // Toggle menu Snooze (Plus tard)
    btnSnoozeToggle?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (snoozeMenu) {
        snoozeMenu.style.display = snoozeMenu.style.display === 'none' ? 'flex' : 'none'
      }
    })

    // Fermer le menu si clic en dehors
    document.addEventListener('click', () => {
      if (snoozeMenu) snoozeMenu.style.display = 'none'
    })

    // Clic sur une durée de rappel (1j, 3j, 7j, 30j)
    toastEl.querySelectorAll('.snooze-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        const days = Number((item as HTMLElement).dataset.days) || 7
        const snoozeTime = Date.now() + (days * 24 * 60 * 60 * 1000)
        try {
          localStorage.setItem(SNOOZE_STORAGE_KEY, String(snoozeTime))
        } catch (_) {}
        toastEl.style.display = 'none'
        if (snoozeMenu) snoozeMenu.style.display = 'none'
      })
    })

  } catch (err) {
    logger.warn('Échec vérification update toast:', err)
  }
}