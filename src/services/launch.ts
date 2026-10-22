import { game, settings } from '../ipc'
import { getUser } from '../state'
import { targetFor } from './serverStatus'
import { Dialog } from '../components/dialog'
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

export async function startLaunch() {
  if (!ui || isLaunching) return
  const user = getUser()
  if (!user) return
  if (ui.isComingSoon()) {
    await ui.showBlockedDetails()
    return
  }

  const profile = ui.getProfile()
  const profileSlug = profile?.slug || 'athena'
  let forceClean = false

  // Si le joueur a la permission no_cleaning, vérifier s'il possède des mods supplémentaires
  if ((user as any)?.hasNoCleaning) {
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
    const mcVersion = profile?.modey?.minecraftVersion || profile?.version || '1.21.1'
    const ldrType = (profile?.modey?.loader || profile?.loaderVersion?.type || 'neoforge') as any
    const ldrVersion = profile?.modey?.loaderVersion || profile?.loaderVersion?.version || '21.1.169'

    await game.launch({
      account: user,
      settings: config,
      profileSlug: profileSlug,
      serverIp: target.host,
      serverPort: target.port,
      minecraftVersion: mcVersion,
      loaderType: ldrType,
      loaderVersion: ldrVersion,
      forceClean: forceClean
    })
  } catch (err) {
    logger.error('Erreur lors du déclenchement du lancement:', err)
    isLaunching = false
    ui.setPlayEnabled(true)
    ui.setPlayVisible(true)
    ui.progress.hide()
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
    progress.setLabel('Installation de NeoForge 21.1.169...')
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
    progress.setLabel('Configuration du ModLoader NeoForge...')
  })

  game.launchCheckJava(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Vérification de Java 21...')
  })

  game.launchClean(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Nettoyage des fichiers temporaires...')
  })

  game.launchLaunch(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Démarrage de Minecraft 1.21.1...')
  })

  game.launched(() => {
    progress.setIndeterminate(true)
    progress.setLabel('Minecraft est lancé — Connexion à Athéna...')
  })

  game.launchClose(async (code: number | null) => {
    isLaunching = false
    progress.setIndeterminate(false)
    progress.hide()
    launchUi.setPlayVisible(true)
    launchUi.setPlayEnabled(true)
    launchUi.onGameClosed()
    progress.reset()

    if (code !== 0 && code !== null) {
      const errCode = code === -1 ? 'ERR_LAUNCH_PROCESS_FAIL' : `ERR_GAME_EXIT_${code}`
      logger.warn(`Minecraft arrêt inattendu : ${errCode} (code ${code})`)
      const msg =
        code === -1
          ? `[ERR_LAUNCH_FAILED] Impossible d'initialiser le moteur de jeu Minecraft.\nVeuillez vérifier la configuration Java et vos logs.`
          : `[${errCode}] Minecraft s'est arrêté de manière inattendue (Code de sortie : ${code}).\nConsultez les fichiers logs si le problème persiste.`
      await Dialog.show(msg, [{ text: 'Compris', type: 'ok' }])
    }
  })
}
