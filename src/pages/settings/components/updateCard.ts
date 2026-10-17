import { bootstraps } from '../../../ipc'
import { createProgressBar } from '../../../components/progressBar'
import logger from 'electron-log/renderer'

const el = (id: string) => document.getElementById(id)

/** Carte « Mises à jour » : vérification manuelle + flux téléch./install. */
export function initUpdateCard(version: string) {
  const currentEl = el('update-current-version')
  if (currentEl) currentEl.innerText = version || '—'

  const checkBtn = el('update-check-btn') as HTMLButtonElement | null
  const installBtn = el('update-install-btn') as HTMLButtonElement | null
  const statusEl = el('update-status-text')

  checkBtn?.addEventListener('click', async () => {
    checkBtn.disabled = true
    if (statusEl) statusEl.innerText = 'Recherche de mise à jour…'
    try {
      const res = await bootstraps.check()
      if (res?.updateAvailable) {
        if (statusEl) statusEl.innerText = `Mise à jour disponible : ${res.currentVersion} → ${res.latestVersion}`
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
  })

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

    bootstraps.downloadProgress((value) => {
      progress.setLabel('Téléchargement de la mise à jour…')
      const ratio = value.downloaded.size / value.total.amount
      progress.setWidth(ratio)
      progress.setPercent(`${(ratio * 100).toFixed(2)}%`)
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
