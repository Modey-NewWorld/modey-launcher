import { maintenance } from '../ipc'
import { fetchProfiles, getProfileModeyStatus } from './profiles'
import { renderMaintenanceView } from '../init'
import { getUser, clearBlockingView } from '../state'
import shared from '../shared'
import { homeState } from '../pages/home/state'
import { renderHero, updateServerStatus } from '../pages/home/components/hero'
import { loadNews } from '../pages/home/components/newsList'
import { renderResumeAndHistory } from '../pages/home/components/resumeCards'
import { renderDropdown, updateCurrentProfileName } from '../pages/home/components/sidebar'
import { selectProfile } from '../pages/home/home'
import { refreshServerCard } from '../pages/servers/servers'
import { refreshProfileServer } from '../pages/profile/profile'
import { checkAndShowUpdateToast } from './updateToast'
import { isOnlineState, onConnectivityChange } from './connectivity'
import logger from 'electron-log/renderer'

let syncTimer: any = null
let isSyncing = false
let lastSyncTime = 0
const SYNC_INTERVAL_MS = 30000 // 30 secondes
const MIN_FOCUS_SYNC_INTERVAL_MS = 20000 // Anti-spam focus : 20s minimum entre 2 syncs

/**
 * Exécute un cycle de synchronisation en direct :
 * 1. Vérification de la maintenance globale du launcher
 * 2. Rafraîchissement des profils serveurs et mise à jour dynamique du statut/bouton Jouer
 * 3. Rafraîchissement des actualités (silencieux sans squelette)
 * 4. Actualisation du ping serveur et du nombre de joueurs connectés (silencieux)
 * 5. Vérification des mises à jour du launcher
 */
export async function triggerLiveSync(options?: { silent?: boolean; force?: boolean }): Promise<void> {
  const silent = options?.silent ?? true
  const force = options?.force ?? false
  const now = Date.now()

  if (!force && now - lastSyncTime < 4000) return
  if (isSyncing) return
  if (!isOnlineState()) {
    logger.debug('[LiveSync] Machine hors-ligne, synchronisation suspendue.')
    return
  }

  isSyncing = true
  lastSyncTime = Date.now()

  try {
    // 1. Maintenance globale du Launcher
    try {
      const mn = await maintenance.get()
      const account = getUser() as any
      if (mn) {
        const userRole = (account ? (account.role || 'citizen') : '').toLowerCase()
        const canBypass = Boolean(
          account?.canBypassMaintenance ||
          userRole === 'founder' ||
          userRole === 'super_admin' ||
          userRole === 'admin'
        )
        if (!canBypass) {
          logger.warn('[LiveSync] Maintenance globale détectée en direct. Verrouillage du launcher.')
          renderMaintenanceView(mn, { success: true, account })
          isSyncing = false
          return
        }
      } else {
        clearBlockingView('maintenance')
      }
    } catch (maintErr) {
      logger.warn('[LiveSync] Erreur probe maintenance:', maintErr)
    }

    // 2. Synchronisation des profils de serveurs
    try {
      const freshProfiles = await fetchProfiles()
      if (Array.isArray(freshProfiles) && freshProfiles.length > 0) {
        homeState.allProfiles = freshProfiles

        const current = homeState.selectedProfile
        if (current) {
          const fresh = freshProfiles.find(
            (p: any) => (p.slug || p.id) === (current.slug || current.id)
          )

          if (fresh) {
            const oldStatus = getProfileModeyStatus(current)
            const newStatus = getProfileModeyStatus(fresh)
            const oldEnabled = current.modey?.enabled
            const newEnabled = fresh.modey?.enabled
            const oldMsg = current.modey?.maintenanceMessage
            const newMsg = fresh.modey?.maintenanceMessage

            const hasChanged =
              oldStatus !== newStatus ||
              Boolean(oldEnabled) !== Boolean(newEnabled) ||
              oldMsg !== newMsg ||
              current.updaterUrl !== fresh.updaterUrl

            Object.assign(current, fresh)
            shared.selectedProfile = current

            if (hasChanged) {
              logger.info(`[LiveSync] Statut du serveur ${current.slug} mis à jour : ${oldStatus} -> ${newStatus}`)
              renderHero(current)
              updateCurrentProfileName(current)
              renderDropdown(selectProfile)
              renderResumeAndHistory(selectProfile)
              refreshServerCard()
              refreshProfileServer()
            }
          }
        }
      }
    } catch (profErr) {
      logger.warn('[LiveSync] Erreur sync profils:', profErr)
    }

    // 3. Synchronisation des actualités (silencieuse sans flash squelette)
    try {
      await loadNews(silent)
    } catch (newsErr) {
      logger.warn('[LiveSync] Erreur sync actualités:', newsErr)
    }

    // 4. Ping serveur & joueurs connectés (silencieux sans reset de texte)
    try {
      if (homeState.selectedProfile) {
        await updateServerStatus(homeState.selectedProfile, silent)
      }
    } catch (statusErr) {
      logger.warn('[LiveSync] Erreur ping serveur:', statusErr)
    }

    // 5. Toast mise à jour launcher
    try {
      await checkAndShowUpdateToast()
    } catch (upErr) {
      logger.warn('[LiveSync] Erreur check update toast:', upErr)
    }
  } catch (err) {
    logger.error('[LiveSync] Erreur globale lors du cycle de sync:', err)
  } finally {
    isSyncing = false
  }
}

/**
 * Démarre le synchronisateur automatique en arrière-plan.
 */
export function startLiveSync(): void {
  stopLiveSync()
  lastSyncTime = Date.now()

  // Déclencher un cycle régulier silencieux
  syncTimer = setInterval(() => {
    if (document.hidden || document.body.classList.contains('is-asleep')) return
    triggerLiveSync({ silent: true })
  }, SYNC_INTERVAL_MS)

  // Réveil mesuré au retour sur la fenêtre ou changement de visibilité (avec anti-rebond)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !document.body.classList.contains('is-asleep')) {
      if (Date.now() - lastSyncTime >= MIN_FOCUS_SYNC_INTERVAL_MS) {
        triggerLiveSync({ silent: true })
      }
    }
  })

  window.addEventListener('focus', () => {
    if (!document.hidden && !document.body.classList.contains('is-asleep')) {
      if (Date.now() - lastSyncTime >= MIN_FOCUS_SYNC_INTERVAL_MS) {
        triggerLiveSync({ silent: true })
      }
    }
  })

  // Synchronisation dès que la connectivité Internet revient
  onConnectivityChange((online) => {
    if (online) {
      triggerLiveSync({ silent: true, force: true })
    } else {
      // Si déconnexion, mettre à jour l'affichage serveur pour indiquer l'indisponibilité réseau
      if (homeState.selectedProfile) {
        renderHero(homeState.selectedProfile)
      }
    }
  })
}

/**
 * Arrête le synchronisateur.
 */
export function stopLiveSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}
