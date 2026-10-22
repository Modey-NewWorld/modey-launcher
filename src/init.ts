import { clearBlockingView, setBlockingView, setUser, setView } from './state'
import { auth, background, bootstraps, maintenance } from './ipc'
import { createProgressBar } from './components/progressBar'
import { loadSkinAssets } from './services/skin'
import logger from 'electron-log/renderer'

const DEFAULT_BACKGROUND = '/src/static/images/bg.png'
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
  if (maintenanceIcon) maintenanceIcon.innerHTML = '<i class="fa-solid fa-gears"></i>'

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
      btnLogout.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Changer de compte'
      btnLogout.onclick = async () => {
        await auth.logout()
        window.location.reload()
      }
    } else {
      btnLogout.innerHTML = '<i class="fa-solid fa-user-shield"></i> Connexion Staff'
      btnLogout.onclick = () => {
        clearBlockingView('maintenance')
        setView('login')
      }
    }
  }

  if (canBypass && account) {
    const roleLabel = (account as any).roleLabel || (userRole.charAt(0).toUpperCase() + userRole.slice(1))
    const roleColor = (account as any).roleColor || (userRole === 'founder' ? '#ea580c' : userRole === 'admin' ? '#e11d48' : '#0284c7')
    const roleGradient = (account as any).roleGradient || `linear-gradient(135deg, ${roleColor} 0%, ${roleColor} 100%)`
    const roleShadow = (account as any).roleShadow || `${roleColor}70`

    if (staffBadgeEl) {
      staffBadgeEl.style.display = 'inline-flex'
      staffBadgeEl.style.background = '#fffbeb'
      staffBadgeEl.style.color = roleColor
      staffBadgeEl.style.border = `1.5px solid ${roleColor}`
      staffBadgeEl.style.boxShadow = `0 2px 12px ${roleShadow}20`
      staffBadgeEl.innerHTML = `<i class="fa-solid fa-shield-halved" style="color:${roleColor}; font-size:14px;"></i><span class="badge-text">Privilège Staff Détecté : <strong style="color:${roleColor}; font-weight:800;">${roleLabel}</strong> • Bypass Autorisé</span>`
    }

    if (btnBypass) {
      btnBypass.style.display = 'inline-flex'
      btnBypass.style.background = roleGradient
      btnBypass.style.boxShadow = `0 4px 16px ${roleShadow}`
      btnBypass.style.color = '#ffffff'
      btnBypass.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Accéder au Launcher'
      btnBypass.title = `Maintenance en cours : accès autorisé grâce à votre rôle ${roleLabel}`

      btnBypass.onclick = async () => {
        btnBypass.disabled = true
        btnBypass.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Accès en cours...'
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
    updateProgress.setIndeterminate(false)
    updateProgress.reset()
    updateProgress.setLabel('Préparation de la mise à jour...')
    updateProgress.setPercent('0%')
    setBlockingView('update')
    await new Promise((r) => setTimeout(r, 500))
    bootstraps.downloadProgress((value) => {
      updateProgress.setLabel('Téléchargement de la mise à jour...')
      const ratio = value.downloaded.size / value.total.amount
      updateProgress.setWidth(ratio)
      updateProgress.setPercent(`${(ratio * 100).toFixed(2)}%`)
    })
    bootstraps.downloadEnd(async () => {
      updateProgress.setIndeterminate(true)
      updateProgress.setLabel('Installation...')
      await bootstraps.install()
    })
    bootstraps.error((err) => {
      logger.error('Error while downloading bootstraps:', err)
    })
    await bootstraps.download()
    logger.log('Update installed, restarting launcher...')
    setTimeout(() => {
      window.location.reload()
    }, 1000)

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
        maintenanceIcon.innerHTML = isOnline ? '<i class="fa-solid fa-server"></i>' : '<i class="fa-solid fa-wifi"></i>'
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
