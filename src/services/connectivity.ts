import logger from 'electron-log/renderer'

type ConnectivityListener = (online: boolean) => void

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
const listeners: Set<ConnectivityListener> = new Set()
let fadeTimeout: any = null

export function isOnlineState(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : isOnline
}

export function onConnectivityChange(listener: ConnectivityListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyListeners(online: boolean) {
  for (const listener of listeners) {
    try {
      listener(online)
    } catch (err) {
      logger.error('[Connectivity] Erreur dans le callback subscriber:', err)
    }
  }
}

export function showOfflineBanner(customText?: string) {
  const banner = document.getElementById('network-offline-banner')
  const iconUse = document.getElementById('network-banner-icon')
  const textEl = document.getElementById('network-banner-text')

  if (fadeTimeout) {
    clearTimeout(fadeTimeout)
    fadeTimeout = null
  }

  if (banner) {
    banner.classList.remove('hidden', 'restored')
    banner.classList.add('offline')
  }
  if (iconUse) {
    iconUse.setAttribute('href', '#solar-wifi-bold')
  }
  if (textEl) {
    textEl.innerText = customText || 'Connexion Internet interrompue — Vous êtes actuellement hors-ligne.'
  }
  document.body.classList.add('network-offline')
}

export function showRestoredBanner(customText?: string) {
  const banner = document.getElementById('network-offline-banner')
  const iconUse = document.getElementById('network-banner-icon')
  const textEl = document.getElementById('network-banner-text')

  if (fadeTimeout) {
    clearTimeout(fadeTimeout)
    fadeTimeout = null
  }

  if (banner) {
    banner.classList.remove('hidden', 'offline')
    banner.classList.add('restored')
  }
  if (iconUse) {
    iconUse.setAttribute('href', '#solar-check-bold')
  }
  if (textEl) {
    textEl.innerText = customText || 'Connexion rétablie — Synchronisation en direct...'
  }
  document.body.classList.remove('network-offline')

  fadeTimeout = setTimeout(() => {
    hideBanner()
  }, 2800)
}

export function hideBanner() {
  const banner = document.getElementById('network-offline-banner')
  if (banner) {
    banner.classList.add('hidden')
  }
}

export function initConnectivity() {
  window.addEventListener('online', () => {
    logger.info('[Connectivity] Réseau en ligne détecté.')
    isOnline = true
    showRestoredBanner()
    notifyListeners(true)
  })

  window.addEventListener('offline', () => {
    logger.warn('[Connectivity] Déconnexion réseau détectée.')
    isOnline = false
    showOfflineBanner()
    notifyListeners(false)
  })

  // Vérification de l'état initial
  if (!navigator.onLine) {
    isOnline = false
    showOfflineBanner()
  }
}
