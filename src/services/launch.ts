import { game, profiles, settings } from '../ipc'
import { getUser } from '../state'
import { targetFor } from './serverStatus'
import { Dialog } from '../components/dialog'
import { isComingSoonProfile, isMaintenanceProfile, isDisabledProfile, checkCanBypass, fetchProfiles } from './profiles'
import { isOnlineState } from './connectivity'
import { FALLBACK_MC_VERSION, FALLBACK_LOADER, FALLBACK_LOADER_VERSION } from './launcherConfig'
import logger from 'electron-log/renderer'

/** Pont d'affichage de la progression — implémenté par components/progressBar.ts. */
export interface LaunchProgressSink {
  setIndeterminate(active: boolean): void
  setLabel(text: string): void
  setPercent(text: string): void
  setWidth(ratio01: number): void
  show(): void
  hide(): void
  reset(): void
}

export interface LaunchUi {
  progress: LaunchProgressSink
  setPlayVisible(visible: boolean): void
  setPlayEnabled(enabled: boolean): void
  getProfile: () => any
  isComingSoon: () => boolean
  showBlockedDetails: () => Promise<void>
  onGameClosed: () => void
}

let ui: LaunchUi | null = null
let totalToDownload = 0
let totalDownloadedByType: { type: string; size: number }[] = []
let isLaunching = false

async function resolveCustomServerPassword(profile: any, host: string, port: number): Promise<{ cancelled: boolean; password?: string }> {
  const customKey = 'modey_custom_servers'
  let list: any[] = []
  try {
    const raw = window.localStorage?.getItem(customKey)
    list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) list = []
  } catch {
    list = []
  }

  const idx = list.findIndex((c) => c?.slug === profile?.slug || c?.id === profile?.id)
  const entry = idx >= 0 ? list[idx] : null
  const addr = port && port !== 25565 ? `${host}:${port}` : host

  let currentPassword = typeof entry?.password === 'string' ? entry.password : ''
  const probe = await profiles.resolveCustom(addr, currentPassword).catch(() => null)

  if (probe?.requiresPassword) {
    let unlocked = false
    while (!unlocked) {
      const promptMsg = currentPassword
        ? `Le mot de passe du serveur privé « ${profile?.name || host} » a changé ou est invalide.\nVeuillez saisir le nouveau mot de passe :`
        : `Le serveur privé « ${profile?.name || host} » est protégé par mot de passe.\nVeuillez saisir le mot de passe d'accès :`
      const entered = await Dialog.prompt(promptMsg, '', `Accès Privé — ${profile?.name || host}`, true)
      if (!entered) {
        return { cancelled: true }
      }
      const verify = await profiles.resolveCustom(addr, entered).catch(() => null)
      if (!verify?.requiresPassword) {
        currentPassword = entered
        unlocked = true
        const meta = verify?.standaloneMeta || verify?.profile
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            password: entered,
            requiresPassword: true,
            needsPasswordPrompt: false,
            ...(meta?.passwordVersion ? { passwordVersion: meta.passwordVersion } : {}),
            ...(meta?.updaterUrl ? { updaterUrl: meta.updaterUrl } : {})
          }
          try { window.localStorage?.setItem(customKey, JSON.stringify(list)) } catch {}
        }
        if (meta && profile) {
          if (meta.updaterUrl) profile.updaterUrl = meta.updaterUrl
          if (profile.modey && meta.updaterUrl) profile.modey.updaterUrl = meta.updaterUrl
        }
      } else {
        currentPassword = entered
        await Dialog.show(
          verify.error || 'Mot de passe incorrect pour ce serveur privé.',
          [{ text: 'Réessayer', type: 'ok' }],
          'Accès Refusé'
        )
      }
    }
  } else if (probe?.standaloneMeta && idx >= 0) {
    const meta = probe.standaloneMeta
    if (meta.passwordVersion !== list[idx].passwordVersion || list[idx].needsPasswordPrompt) {
      list[idx] = {
        ...list[idx],
        requiresPassword: Boolean(meta.requiresPassword),
        needsPasswordPrompt: false,
        ...(meta.passwordVersion ? { passwordVersion: meta.passwordVersion } : {})
      }
      try { window.localStorage?.setItem(customKey, JSON.stringify(list)) } catch {}
    }
  }

  return { cancelled: false, password: currentPassword || undefined }
}

export async function startLaunch() {
  if (!ui || isLaunching) return
  const user = getUser() as any
  if (!user) return

  // Garde-fou réseau : vérification de la connectivité Internet
  if (!navigator.onLine || !isOnlineState()) {
    await Dialog.show(
      "Vous n'êtes actuellement pas connecté à Internet.\n\nUne connexion réseau active est requise pour synchroniser les composants de jeu et rejoindre les serveurs Modey.",
      [{ text: 'Compris', type: 'ok' }],
      'Connexion Réseau Interrompue'
    )
    return
  }

  const profile = ui.getProfile()

  // Vérification de sécurité en direct : s'assurer que le statut du serveur n'a pas basculé en maintenance
  try {
    const freshProfiles = await fetchProfiles()
    const fresh = freshProfiles.find((p: any) => (p.slug || p.id) === (profile?.slug || profile?.id))
    if (fresh) {
      Object.assign(profile, fresh)
    }
  } catch (err) {
    logger.warn('Pré-vérification en direct du profil échouée, utilisation du cache:', err)
  }

  const isSoon = isComingSoonProfile(profile)
  const isMaint = isMaintenanceProfile(profile)
  const isDisabled = isDisabledProfile(profile)
  const canBypass = checkCanBypass(profile, user)

  // Garde-fou de sécurité : vérification des droits d'accès
  if ((isSoon || isMaint || isDisabled) && !canBypass) {
    if (isSoon) {
      await ui.showBlockedDetails()
    } else if (isMaint) {
      await Dialog.show(
        `Le serveur est actuellement en maintenance technique.\n\n${profile?.modey?.maintenanceMessage || 'Des opérations techniques sont en cours. Seuls les membres du staff autorisés peuvent y accéder.'}`,
        [{ text: 'Compris', type: 'ok' }],
        'Accès Restreint'
      )
    } else {
      await Dialog.show(
        `Ce serveur a été temporairement désactivé par l'administration Modey.`,
        [{ text: 'Compris', type: 'ok' }],
        'Serveur Désactivé'
      )
    }
    return
  }

  const profileSlug = profile?.slug || 'athena'
  let forceClean = false

  // Si le joueur a la permission no_cleaning, vérifier s'il possède des mods supplémentaires
  if (user?.hasNoCleaning) {
    try {
      const extraCheck = await game.checkExtraMods(profileSlug)
      if (extraCheck.hasExtra && extraCheck.extraMods.length > 0) {
        const modsListText = extraCheck.extraMods.slice(0, 5).join('\n• ') + (extraCheck.extraMods.length > 5 ? `\n• ... et ${extraCheck.extraMods.length - 5} autre(s)` : '')
        const choice = await Dialog.show<string>(
          `Des mods supplémentaires personnalisés ont été détectés dans votre dossier :\n• ${modsListText}\n\nSouhaitez-vous nettoyer votre dossier de jeu (Clean) avant de vous connecter au serveur ?`,
          [
            { text: 'Garder mes mods (No Clean)', type: 'cancel', action: () => 'keep' },
            { text: 'Nettoyer le jeu (Clean)', type: 'danger', action: () => 'clean' }
          ],
          'Nettoyage du jeu (Cleaning)'
        )

        if (choice === 'clean') {
          forceClean = true
        }
      }
    } catch (checkErr) {
      logger.warn('Vérification mods supplémentaires échouée:', checkErr)
    }
  }

  let customPassword: string | undefined
  if (profile?.isCustomServer) {
    const targetPreview = targetFor(profile)
    const pwdResult = await resolveCustomServerPassword(profile, targetPreview.host, targetPreview.port)
    if (pwdResult.cancelled) return
    customPassword = pwdResult.password
  }

  isLaunching = true
  ui.setPlayEnabled(false)
  ui.setPlayVisible(false)
  ui.progress.setIndeterminate(true)
  ui.progress.show()
  ui.progress.reset()
  ui.progress.setLabel('Initialisation du lancement...')

  totalToDownload = 0
  totalDownloadedByType = []

  try {
    const config = await settings.get()
    const target = targetFor(profile)

    logger.log(`Lancement pour ${user.name} vers ${target.host}:${target.port}`)
    const mcVersion = profile?.modey?.minecraftVersion || profile?.version || FALLBACK_MC_VERSION
    const ldrType = (profile?.modey?.loader || profile?.loaderVersion?.type || FALLBACK_LOADER) as any
    const ldrVersion = profile?.modey?.loaderVersion || profile?.loaderVersion?.version || FALLBACK_LOADER_VERSION
    const updaterUrl = profile?.updaterUrl || profile?.modey?.updaterUrl || ''
    const isCustomServer = Boolean(profile?.isCustomServer)

    await game.launch({
      account: user,
      settings: config,
      profileSlug: profileSlug,
      serverIp: target.host,
      serverPort: target.port,
      minecraftVersion: mcVersion,
      loaderType: ldrType,
      loaderVersion: ldrVersion,
      updaterUrl: updaterUrl || undefined,
      isCustomServer,
      serverPassword: customPassword,
      forceClean: forceClean
    })
  } catch (err: any) {
    logger.error('Erreur lors du déclenchement du lancement:', err)
    isLaunching = false
    ui.setPlayEnabled(true)
    ui.setPlayVisible(true)
    ui.progress.hide()
    if (String(err?.message || '').includes('PASSWORD_REQUIRED')) {
      await Dialog.show(
        'Le mot de passe de ce serveur privé est requis ou a été modifié. Cliquez à nouveau sur Jouer pour saisir le nouveau mot de passe.',
        [{ text: 'Compris', type: 'ok' }],
        'Mot de passe requis'
      )
    }
  }
}

/** Abonne la machine de progression du lancement (events game.*). À appeler une seule fois. */
export function bindLaunch(launchUi: LaunchUi) {
  ui = launchUi
  const { progress } = launchUi

  game.launchComputeDownload(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Vérification des fichiers de jeu...')
    progress.setPercent('')
  })

  game.launchDownload((download) => {
    progress.setIndeterminate(false)
    totalToDownload = download.total.size
    progress.setLabel('Téléchargement des composants...')
  })

  game.downloadError(async (error: any) => {
    logger.error('Erreur téléchargement composant:', error)
    const fileName = error?.filename || 'inconnu'
    const errorDetails = error?.message || 'Erreur réseau de téléchargement'
    await Dialog.show(
      `[ERR_DOWNLOAD_FAILED] Échec du téléchargement du composant :\n${fileName}\n\nDétail : ${errorDetails}`,
      [{ text: 'Compris', type: 'ok' }]
    )
  })

  game.downloadProgress((value) => {
    const existing = totalDownloadedByType.find((t) => t.type === value.type)
    if (existing) existing.size = value.downloaded.size
    else totalDownloadedByType.push({ type: value.type, size: value.downloaded.size })

    const downloadedSum = totalDownloadedByType.reduce((acc, curr) => acc + curr.size, 0)
    const ratio = totalToDownload > 0 ? downloadedSum / totalToDownload : 0
    progress.setWidth(ratio)

    let labelText = 'Téléchargement des fichiers...'
    if (value.type === 'JAVA') labelText = 'Téléchargement de Java 21...'
    else if (value.type === 'FORGE' || value.type === 'NEOFORGE') labelText = 'Téléchargement de NeoForge...'
    else if (value.type === 'MOD') labelText = 'Téléchargement des mods...'
    else if (value.type === 'ASSET') labelText = 'Téléchargement des ressources...'

    progress.setLabel(labelText)
    progress.setPercent(`${Math.round(Math.min(ratio * 100, 100))}%`)
  })

  game.launchInstallLoader(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Installation du ModLoader...')
    progress.setPercent('')
  })

  game.launchExtractNatives(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Extraction des bibliothèques natives...')
  })

  game.launchCopyAssets(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Copie des ressources du jeu...')
  })

  game.launchPatchLoader(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Configuration du ModLoader...')
  })

  game.launchCheckJava(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Vérification de l\'environnement Java...')
  })

  game.launchClean(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Nettoyage des fichiers temporaires...')
  })

  game.launchLaunch(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Démarrage de Minecraft...')
  })

  game.launched(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Minecraft est lancé — Connexion au serveur...')
  })

  game.launchClose(async (payload: any) => {
    const code: number | null = typeof payload === 'number' ? payload : (payload?.code ?? null)
    const details: string | undefined = typeof payload === 'object' && payload ? payload.details : undefined

    isLaunching = false
    progress.setIndeterminate(false)
    progress.hide()
    launchUi.setPlayVisible(true)
    launchUi.setPlayEnabled(true)
    launchUi.onGameClosed()
    progress.reset()

    if (code !== 0 && code !== null) {
      const errCode = code === -1 ? 'ERR_LAUNCH_PROCESS_FAIL' : `ERR_GAME_EXIT_${code}`
      logger.warn(`Minecraft arrêt inattendu : ${errCode} (code ${code})${details ? ` | Détails: ${details}` : ''}`)
      let msg =
        code === -1
          ? `[ERR_LAUNCH_FAILED] Impossible d'initialiser le moteur de jeu Minecraft.\nVeuillez vérifier la configuration Java et vos logs.`
          : `[${errCode}] Minecraft s'est arrêté de manière inattendue (Code de sortie : ${code}).\nConsultez les fichiers logs si le problème persiste.`

      if (details) {
        msg = `[${errCode}] Problème détecté lors du chargement des mods :\n• ${details}\n\nVérifiez vos mods optionnels ou consultez les rapports de crash.`
      }

      await Dialog.show(msg, [{ text: 'Compris', type: 'ok' }])
    }
  })
}
