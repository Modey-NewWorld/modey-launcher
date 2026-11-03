import { clearBlockingView, setBlockingView, setUser, setView } from './state'
import { auth, background, bootstraps, maintenance } from './ipc'
import { createProgressBar } from './components/progressBar'
import { loadSkinAssets } from './services/skin'
import { initRuntimeConfig } from './services/runtime'
import logger from 'electron-log/renderer'

import defaultBgUrl from './static/images/bg.webp'
const DEFAULT_BACKGROUND = defaultBgUrl
const dateFormatOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = url
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })
}

export function renderMaintenanceView(mn: any, session: any) {
  const maintenanceDates = document.getElementById('maintenance-dates')!
  const maintenanceReason = document.getElementById('maintenance-reason')!
  const maintenanceTitle = document.getElementById('maintenance-title')
  const maintenanceIcon = document.getElementById('maintenance-icon')
  const staffBadgeEl = document.getElementById('maintenance-staff-badge')
  const btnBypass = document.getElementById('btn-maint-bypass') as HTMLButtonElement | null
  const btnRetry = document.getElementById('btn-maint-retry')
  const btnLogout = document.getElementById('btn-maint-logout')

  if (maintenanceTitle) maintenanceTitle.innerText = 'Maintenance du Launcher'
  if (maintenanceIcon) maintenanceIcon.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-tuning-bold"></use></svg>'

  const start = mn?.startTime ? new Date(mn.startTime as Date) : null
  const end = mn?.endTime ? new Date(mn.endTime as Date) : null

  if (start && end) {
    if (maintenanceDates) maintenanceDates.innerText = `Du ${start.toLocaleString([], dateFormatOptions)} au ${end.toLocaleString([], dateFormatOptions)}`
  } else if (end) {
    if (maintenanceDates) maintenanceDates.innerText = `Fin estimée : ${end.toLocaleString([], dateFormatOptions)}`
  } else {
    if (maintenanceDates) maintenanceDates.innerText = 'Maintenance générale en cours'
  }

  if (maintenanceReason) {
    maintenanceReason.innerText = mn?.message ?? 'Le launcher est actuellement en maintenance. Nous serons de retour très vite !'
  }

  if (btnRetry) {
    btnRetry.onclick = () => window.location.reload()
  }

  const account = session && session.success ? session.account : null
  const userRole = (account ? ((account as any).role || 'citizen') : '').toLowerCase()
  const canBypass = Boolean(
    (account as any)?.canBypassMaintenance ||
    userRole === 'founder' ||
    userRole === 'super_admin' ||
    userRole === 'admin'
  )

  if (btnLogout) {
    if (account) {
      btnLogout.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-logout-bold"></use></svg>&nbsp;Changer de compte'
      btnLogout.onclick = async () => {
        await auth.logout()
        window.location.reload()
      }
    } else {
      btnLogout.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-shield-bold"></use></svg>&nbsp;Connexion Staff'
      btnLogout.onclick = () => {
        clearBlockingView('maintenance')
        setView('login')
      }
    }
  }

  if (canBypass && account) {
    const roleLabel = (account as any).roleLabel || (userRole.charAt(0).toUpperCase() + userRole.slice(1))
    const isFounder = userRole === 'founder'
    const isAdmin = userRole === 'admin'
    const roleColorVar = isFounder ? 'var(--founder-gold)' : isAdmin ? 'var(--role-admin-color)' : 'var(--accent)'
    const roleBgVar = isFounder ? 'var(--founder-bg)' : isAdmin ? 'var(--role-admin-bg)' : 'var(--accent-soft)'
    const roleBorderVar = isFounder ? 'var(--founder-border)' : isAdmin ? 'var(--role-admin-border)' : 'var(--accent)'

    if (staffBadgeEl) {
      staffBadgeEl.style.display = 'inline-flex'
      staffBadgeEl.style.background = roleBgVar
      staffBadgeEl.style.color = roleColorVar
      staffBadgeEl.style.border = `1.5px solid ${roleBorderVar}`
      staffBadgeEl.style.boxShadow = 'var(--shadow-sm)'
      staffBadgeEl.innerHTML = `<svg class="solar-icon solar-bold" style="color:${roleColorVar}; font-size:14px;" aria-hidden="true"><use href="#solar-shield-bold"></use></svg><span class="badge-text">Privilège Staff Détecté : <strong style="color:${roleColorVar}; font-weight:800;">${roleLabel}</strong> • Bypass Autorisé</span>`
    }

    if (btnBypass) {
      btnBypass.style.display = 'inline-flex'
      btnBypass.style.background = roleColorVar
      btnBypass.style.boxShadow = 'var(--shadow-md)'
      btnBypass.style.color = 'var(--bg-surface)'
      btnBypass.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-login-bold"></use></svg>&nbsp;Accéder au Launcher'
      btnBypass.title = `Maintenance en cours : accès autorisé grâce à votre rôle ${roleLabel}`

      btnBypass.onclick = async () => {
        btnBypass.disabled = true
        btnBypass.innerHTML = '<svg class="solar-icon solar-linear spin" aria-hidden="true"><use href="#solar-refresh-linear"></use></svg> Accès en cours...'
        try {
          if (session && session.account) {
            const { skins, capes, avatar } = await loadSkinAssets(session.account)
            await setUser(session.account, { skins, capes, avatar })
          }
        } catch (e) {
          logger.error('Error entering launcher via bypass:', e)
        }
        document.body.classList.add('loaded')
        document.querySelector('div#view-loading')?.classList.add('loaded')
        clearBlockingView('maintenance')
        setView('home')
      }
    }
  } else {
    if (staffBadgeEl) staffBadgeEl.style.display = 'none'
    if (btnBypass) btnBypass.style.display = 'none'
  }

  setBlockingView('maintenance')
}

export async function bootstrap() {
  logger.log('Initializing Launcher...')
  await initRuntimeConfig().catch((e) => logger.warn('Runtime config init fallback:', e))

  const bgElement = document.querySelector('.app-background') as HTMLElement
  const maintenanceDates = document.getElementById('maintenance-dates')!
  const maintenanceReason = document.getElementById('maintenance-reason')!
  const updateProgress = createProgressBar({
    container: 'update-progress-container',
    bar: 'update-progress-bar',
    label: 'update-progress-label',
    percent: 'update-progress-percent'
  })

  const up = await bootstraps.check()
  const bg = await background.get()
  const mn = await maintenance.get()
  const bgUrl = bg?.file?.url ?? DEFAULT_BACKGROUND

  if (up.updateAvailable && (up as any).mandatory) {
    setBlockingView('update')

    const errorContainer = document.getElementById('update-error-container')
    const errorText = document.getElementById('update-error-text')
    const retryBtn = document.getElementById('btn-update-retry')
    const manualBtn = document.getElementById('btn-update-manual')

    const startMandatoryUpdate = async () => {
      if (errorContainer) errorContainer.style.display = 'none'
      updateProgress.setIndeterminate(false)
      updateProgress.reset()
      updateProgress.setLabel('Préparation de la mise à jour...')
      updateProgress.setPercent('0%')

      bootstraps.downloadProgress((value: any) => {
        updateProgress.setLabel('Téléchargement de la mise à jour...')
        const downloaded = value?.downloaded?.size || 0
        const total = value?.total?.size || value?.total?.amount || 0
        if (total > 0) {
          const ratio = Math.min(downloaded / total, 1)
          updateProgress.setWidth(ratio)
          updateProgress.setPercent(`${(ratio * 100).toFixed(1)}%`)
        }
      })

      bootstraps.downloadEnd(async () => {
        updateProgress.setIndeterminate(true)
        updateProgress.setLabel('Lancement de l\'installation...')
        updateProgress.setPercent('100%')
        setTimeout(async () => {
          try {
            await bootstraps.install()
          } catch (err: any) {
            logger.error('Failed to trigger update installer:', err)
          }
        }, 800)
      })

      bootstraps.error((err: any) => {
        logger.error('Error while downloading bootstraps:', err)
        updateProgress.setLabel('Échec du téléchargement')
        if (errorContainer) {
          errorContainer.style.display = 'flex'
          if (errorText) errorText.innerText = err?.message || 'Erreur lors du téléchargement de la mise à jour.'
        }
      })

      try {
        await bootstraps.download()
      } catch (err: any) {
        logger.error('bootstrap.download call threw:', err)
        updateProgress.setLabel('Échec du téléchargement')
        if (errorContainer) {
          errorContainer.style.display = 'flex'
          if (errorText) errorText.innerText = err?.message || 'Impossible de télécharger la mise à jour.'
        }
      }
    }

    if (retryBtn) retryBtn.onclick = () => startMandatoryUpdate()
    if (manualBtn) {
      manualBtn.onclick = () => {
        const url = (up as any).downloadUrl || 'https://github.com/Modey-NewWorld/modey-launcher/releases'
        window.open(url, '_blank')
      }
    }

    await startMandatoryUpdate()
    return
  }

  // Restauration de session en parallèle du chargement de l'image de fond
  let session: any = null
  try {
    const [_, sess] = await Promise.all([preloadImage(bgUrl), auth.refresh()])
    session = sess
  } catch (err) {
    logger.warn('Failed to refresh session at bootstrap:', err)
  }

  if (bgElement) bgElement.style.backgroundImage = `url('${bgUrl}')`

  // Si une maintenance est active sur le Launcher :
  // Tout le monde voit la page de maintenance au démarrage (même fondateur),
  // mais les rôles avec bypass maintenance ont le bouton "Accéder au Launcher" de la couleur de leur grade !
  if (mn) {
    document.body.classList.add('loaded')
    document.querySelector('div#view-loading')?.classList.add('loaded')
    renderMaintenanceView(mn, session)
    return
  }

  try {
    if (session && session.success) {
      const { skins, capes, avatar } = await loadSkinAssets(session.account)
      setUser(session.account, { skins, capes, avatar })
      setView('home')
    } else if (session && (session as any).isServiceUnavailable) {
      // Services Modey injoignables ou hors-ligne, mais session locale préservée !
      const isOnline = navigator.onLine
      const maintenanceTitle = document.getElementById('maintenance-title')
      const maintenanceIcon = document.getElementById('maintenance-icon')
      if (maintenanceTitle) {
        maintenanceTitle.innerText = isOnline ? 'Services Modey Indisponibles' : 'Connexion Réseau Requise'
      }
      if (maintenanceIcon) {
        maintenanceIcon.innerHTML = isOnline ? '<svg class="solar-icon solar-linear" aria-hidden="true"><use href="#solar-server-linear"></use></svg>' : '<svg class="solar-icon solar-linear" aria-hidden="true"><use href="#solar-wifi-linear"></use></svg>'
      }
      if (maintenanceDates) {
        maintenanceDates.innerText = isOnline
          ? `Compte : ${(session as any).account?.name || 'Joueur'} (Session sauvegardée)`
          : 'Vous êtes actuellement hors-ligne'
      }
      if (maintenanceReason) {
        maintenanceReason.innerText = isOnline
          ? "Désolé, les serveurs d'authentification Modey sont momentanément déconnectés ou en cours de maintenance.\nCela ne vient pas de vous, nous faisons le maximum pour réparer et rétablir le service au plus vite !"
          : "Vous n'êtes pas connecté à Internet. Veuillez vérifier votre câble Ethernet ou votre connexion Wi-Fi, puis cliquez sur Réessayer."
      }

      const btnRetry = document.getElementById('btn-maint-retry')
      if (btnRetry) btnRetry.onclick = () => window.location.reload()
      const btnLogout = document.getElementById('btn-maint-logout')
      if (btnLogout) {
        btnLogout.onclick = async () => {
          await auth.logout()
          window.location.reload()
        }
      }
      setBlockingView('maintenance')
      return
    } else {
      setView('login')
    }
  } catch (err) {
    logger.error('Error while initializing launcher:', err)
    if (bgElement) bgElement.style.backgroundImage = `url('${DEFAULT_BACKGROUND}')`
    setView('login')
  } finally {
    document.body.classList.add('loaded')
    document.querySelector('div#view-loading')?.classList.add('loaded')
  }
}
