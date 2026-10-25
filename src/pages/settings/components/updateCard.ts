import { bootstraps, settings } from '../../../ipc'
import { createProgressBar } from '../../../components/progressBar'
import logger from 'electron-log/renderer'

const el = (id: string) => document.getElementById(id)

/** Carte « Mises à jour » : vérification manuelle + flux téléch./install + sélecteur de canal. */
export async function initUpdateCard(version: string) {
  const currentEl = el('update-current-version')
  const latestEl = el('update-latest-version')
  const channelSelect = el('update-channel-select') as HTMLSelectElement | null
  const checkBtn = el('update-check-btn') as HTMLButtonElement | null
  const installBtn = el('update-install-btn') as HTMLButtonElement | null
  const statusEl = el('update-status-text')

  if (currentEl) currentEl.innerText = version || '—'

  // Charger le canal actuel depuis les réglages utilisateur
  try {
    const currentSettings = await settings.get()
    if (channelSelect) {
      channelSelect.value = currentSettings.betaChannel ? 'beta' : 'stable'
      
      channelSelect.addEventListener('change', async () => {
        const isBeta = channelSelect.value === 'beta'
        const updated = await settings.get()
        await settings.set({ ...updated, betaChannel: isBeta })
        logger.log(`Update channel changed to: ${channelSelect.value}`)
        // Lancer une vérification avec le nouveau canal sélectionné
        checkUpdates()
      })
    }
  } catch (err) {
    logger.error('Failed to load settings in updateCard:', err)
  }

  async function checkUpdates() {
    if (!checkBtn) return
    checkBtn.disabled = true
    if (statusEl) statusEl.innerText = 'Recherche de mise à jour…'
    try {
      const res = await bootstraps.check()
      if (latestEl) {
        latestEl.innerText = res?.latestVersion ? `v${res.latestVersion}` : (version ? `v${version}` : '—')
      }

      if (res?.updateAvailable) {
        if (statusEl) statusEl.innerText = `Mise à jour disponible : v${res.currentVersion} → v${res.latestVersion}`
        installBtn?.classList.remove('hidden')
      } else {
        if (statusEl) statusEl.innerText = `Vous êtes à jour (${res?.currentVersion ?? version}).`
        installBtn?.classList.add('hidden')
      }
    } catch (err) {
      logger.error('Update check failed:', err)
      if (statusEl) statusEl.innerText = 'Impossible de vérifier les mises à jour (serveur injoignable).'
    } finally {
      checkBtn.disabled = false
    }
  }

  checkBtn?.addEventListener('click', checkUpdates)

  // Lancement automatique au chargement pour afficher directement la dernière version disponible
  checkUpdates()

  installBtn?.addEventListener('click', async () => {
    installBtn.disabled = true
    checkBtn?.classList.add('hidden')

    const progress = createProgressBar({
      container: 'settings-update-progress-container',
      bar: 'settings-update-progress-bar',
      label: 'settings-update-progress-label',
      percent: 'settings-update-progress-percent'
    })
    progress.show()
    progress.setIndeterminate(false)
    progress.reset()
    progress.setLabel('Préparation de la mise à jour…')
    progress.setPercent('0%')
    if (statusEl) statusEl.innerText = 'Téléchargement en cours…'

    bootstraps.downloadProgress((value: any) => {
      progress.setLabel('Téléchargement de la mise à jour…')
      
      const downloaded = value?.downloaded?.size || 0
      const total = value?.total?.size || value?.total?.amount || 0
      
      let pct = 0
      if (total > 0) {
        pct = (downloaded / total) * 100
      } else if (value?.percent != null) {
        pct = Number(value.percent)
      }
      
      // Sécurité : borner entre 0 et 100 et limiter à 1 chiffre après la virgule
      const clampedPct = Math.min(100, Math.max(0, pct))
      progress.setWidth(clampedPct / 100)
      progress.setPercent(`${clampedPct.toFixed(1)}%`)
    })

    bootstraps.downloadEnd(async () => {
      progress.setIndeterminate(true)
      progress.setLabel('Installation…')
      if (statusEl) statusEl.innerText = 'Installation… le launcher va redémarrer.'
      try {
        await bootstraps.install()
      } catch (err) {
        logger.error('Update install failed:', err)
      }
    })

    bootstraps.error((err) => {
      logger.error('Update download error:', err)
      if (statusEl) statusEl.innerText = 'Erreur pendant le téléchargement. Réessayez.'
      installBtn.disabled = false
      progress.hide()
    })

    try {
      await bootstraps.download()
      logger.log('Update downloaded, restarting launcher...')
      setTimeout(() => window.location.reload(), 1000)
    } catch (err) {
      logger.error('Update download failed:', err)
      if (statusEl) statusEl.innerText = 'Échec du téléchargement. Réessayez.'
      installBtn.disabled = false
      progress.hide()
    }
  })
}
