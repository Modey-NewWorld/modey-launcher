import { setBlockingView, setUser, setView } from './state'
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

  if (mn) {
    const start = mn.startTime ? new Date(mn.startTime as Date) : null
    const end = mn.endTime ? new Date(mn.endTime as Date) : null
    const maintenanceTitle = document.getElementById('maintenance-title')
    const maintenanceIcon = document.getElementById('maintenance-icon')
    if (maintenanceTitle) maintenanceTitle.innerText = 'Maintenance du Launcher'
    if (maintenanceIcon) maintenanceIcon.innerHTML = '<i class="fa-solid fa-gears"></i>'
    if (start && end) {
      maintenanceDates.innerText = `Du ${start.toLocaleString([], dateFormatOptions)} au ${end.toLocaleString([], dateFormatOptions)}`
    } else if (end) {
      maintenanceDates.innerText = `Fin estimée : ${end.toLocaleString([], dateFormatOptions)}`
    } else {
      maintenanceDates.innerText = 'Maintenance générale en cours'
    }
    maintenanceReason.innerText = mn.message ?? 'Le launcher est actuellement en maintenance. Nous serons de retour très vite !'

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
  }
  try {
    const [_, session] = await Promise.all([preloadImage(bgUrl), auth.refresh()])

    if (bgElement) bgElement.style.backgroundImage = `url('${bgUrl}')`

    if (session.success) {
      const { skins, capes, avatar } = await loadSkinAssets(session.account)
      setUser(session.account, { skins, capes, avatar })
      setView('home')
    } else if ((session as any).isServiceUnavailable) {
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
