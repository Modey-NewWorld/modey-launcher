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
    const profile = ui.getProfile()
    const target = targetFor(profile)

    logger.log(`Lancement pour ${user.name} vers ${target.host}:${target.port}`)
    await game.launch({
      account: user,
      settings: config,
      profileSlug: profile?.slug || 'athena',
      serverIp: target.host,
      serverPort: target.port
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
      logger.warn(`Minecraft s'est arrêté avec le code ${code}`)
      await Dialog.show(
        `Minecraft s'est arrêté de manière inattendue (Code de sortie : ${code}).\nConsultez les fichiers logs si le problème persiste.`,
        [{ text: 'Compris', type: 'ok' }]
      )
    }
  })
}
