import { setView, getUser } from '../state'
import { game, news, server, settings, profiles } from '../ipc'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import logger from 'electron-log/renderer'
import profileConfig from '../../config/athena-profile.json'
import { Dialog } from './dialog'

marked.use({
  renderer: {
    link(link) {
      const href = link.href ?? '#'
      const titleAttr = link.title ? ` title="${link.title}"` : ''
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${link.text}</a>`
    }
  }
})

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })
}

const parseNews = (rawContent: string) =>
  DOMPurify.sanitize(marked.parse(rawContent) as string, {
    ADD_ATTR: ['target']
  })

const backgroundColor = (color: string) => {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 0.1)`
}

export function initHome() {
  const body = document.body
  const playBtn = document.getElementById('btn-play')
  const settingsBtn = document.getElementById('btn-settings')
  const skinBtn = document.getElementById('btn-skin')
  const progressContainer = document.getElementById('launch-progress-container')
  const progressBar = document.getElementById('launch-progress-bar')
  const progressLabel = document.getElementById('launch-progress-label')
  const progressPercent = document.getElementById('launch-progress-percent')
  const statusDot = document.getElementById('server-status-dot')
  const statusText = document.getElementById('server-status-text')
  const playerCount = document.getElementById('player-count')
  const newsList = document.getElementById('news-list')
  const profileSelector = document.getElementById('profile-selector')
  const profileDropdown = document.getElementById('profile-dropdown')
  const currentProfileName = document.getElementById('current-profile-name')

  let selectedProfile: any = null
  let allProfiles: any[] = []
  let totalToDownload = 0
  let totalDownloadedByType: { type: string; size: number }[] = []

  const loadProfiles = async () => {
    allProfiles = (await profiles.get()) || []
    if (allProfiles.length > 0) {
      selectProfile(allProfiles[0])
      renderDropdown()
    }
  }

  const renderDropdown = () => {
    if (!profileDropdown) return
    profileDropdown.innerHTML = allProfiles
      .map(
        (p) => `
      <div class="profile-option ${selectedProfile?.id === p.id ? 'active' : ''}" data-id="${p.id}">
        ${p.name}
      </div>
    `
      )
      .join('')

    profileDropdown.querySelectorAll('.profile-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).dataset.id
        const profile = allProfiles.find((p) => p.id === id)
        if (profile) selectProfile(profile)
        profileSelector?.classList.remove('open')
      })
    })
  }

  const selectProfile = (profile: any) => {
    selectedProfile = profile
    if (currentProfileName) currentProfileName.innerText = profile.name
    renderDropdown()
    updateServerStatus()
  }

  const getServerTarget = () => ({
    host: selectedProfile?.ip || profileConfig.server.host,
    port: selectedProfile?.port || profileConfig.server.port
  })

  const updateServerStatus = async () => {
    if (statusDot) {
      statusDot.classList.remove('online', 'offline')
      statusDot.classList.add('pinging')
    }
    if (statusText) statusText.innerHTML = 'Vérification...'
    if (playerCount) playerCount.innerHTML = ''

    const target = getServerTarget()
    const status = await server.getStatus(target.host, target.port)

    if (status) {
      if (statusDot) {
        statusDot.classList.remove('pinging', 'offline')
        statusDot.classList.add('online')
      }
      if (statusText) statusText.innerHTML = 'En ligne'

      if (playerCount) {
        playerCount.innerHTML = `<i class="fa-fw fa-solid fa-users"></i>&nbsp;&nbsp;${status.players.online.toLocaleString()} / ${status.players.max.toLocaleString()} citoyens`
      }
    } else {
      if (statusDot) {
        statusDot.classList.remove('pinging', 'online')
        statusDot.classList.add('offline')
      }
      if (statusText) statusText.innerHTML = 'Hors ligne'
      if (playerCount) playerCount.innerHTML = ''
    }
  }

  const loadNews = async () => {
    if (!newsList) return
    newsList.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">Chargement des actualités...</div>'
    const feed = await news.getNews()

    newsList.innerHTML = ''

    if (!feed || feed.length === 0) {
      newsList.innerHTML = '<div style="text-align:center; color: #888;">Aucune actualité pour le moment.</div>'
      return
    }

    feed.forEach((item: any) => {
      let tagsHTML = ''
      item.tags?.forEach((tag: any) => {
        tagsHTML += `<span class="tag" style="color: ${tag.color}; background-color: ${backgroundColor(tag.color)}">${tag.name}</span>`
      })
      const articleHTML = `
        <article class="news-article">
          <div class="article-meta">
            <div class="author">
              <img src="https://minotar.net/helm/${item.author?.username || 'Steve'}/24" alt="Author" />
              <span>${item.author?.username ?? 'Modey Staff'}</span>
            </div>
            <span class="separator">•</span>
            <span class="date">${formatDate(item.createdAt)}</span>
            <span class="separator">•</span>
            <div class="tags-container">${tagsHTML}</div>
          </div>

          <h3>${item.title}</h3>
          
          ${item.image ? `<img src="${item.image}" alt="News Image" onerror="this.style.display='none'"/>` : ''}

          <div class="article-content">
            ${parseNews(item.content)}
          </div>
        </article>
      `

      newsList.insertAdjacentHTML('beforeend', articleHTML)
    })
  }

  loadProfiles()
  updateServerStatus()
  loadNews()

  const setIndeterminate = (active: boolean) => {
    if (!progressBar || !progressPercent) return

    if (active) {
      progressBar.classList.add('indeterminate')
      progressPercent.style.display = 'none'
    } else {
      progressBar.classList.remove('indeterminate')
      progressPercent.style.display = 'block'
    }
  }

  settingsBtn?.addEventListener('click', () => {
    setView('settings')
  })

  skinBtn?.addEventListener('click', () => {
    setView('settings')
    setTimeout(() => {
      const skinTabBtn = document.querySelector('.nav-btn[data-tab="skin"]') as HTMLElement | null
      skinTabBtn?.click()
    }, 50)
  })

  playBtn?.addEventListener('click', async () => {
    setIndeterminate(true)
    if (playBtn) playBtn.style.display = 'none'
    if (progressContainer) progressContainer.classList.remove('hidden')
    if (progressBar) progressBar.style.width = '0%'
    if (progressPercent) progressPercent.innerText = '0%'
    if (progressLabel) progressLabel.innerText = 'Initialisation du lancement...'

    totalToDownload = 0
    totalDownloadedByType = []

    const user = getUser()
    if (!user) return

    const config = await settings.get()
    const target = getServerTarget()

    logger.log(`Lancement pour ${user.name} vers ${target.host}:${target.port}`)
    game.launch({
      account: user,
      settings: config,
      profileSlug: selectedProfile?.slug || 'athena',
      serverIp: target.host,
      serverPort: target.port
    })
  })

  profileSelector?.querySelector('.selected-profile')?.addEventListener('click', () => {
    profileSelector.classList.toggle('open')
  })

  body.addEventListener('click', (e) => {
    if (!profileSelector?.contains(e.target as Node)) {
      profileSelector?.classList.remove('open')
    }
  })

  // Gestion précise et explicite des étapes de chargement
  game.launchComputeDownload(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Vérification des fichiers de jeu...'
    if (progressPercent) progressPercent.innerText = ''
  })

  game.launchDownload((download) => {
    setIndeterminate(false)
    totalToDownload = download.total.size
    if (progressLabel) progressLabel.innerText = 'Téléchargement des composants...'
  })

  game.downloadProgress((progress) => {
    if (!totalDownloadedByType.find((t) => t.type === progress.type)) {
      totalDownloadedByType.push({ type: progress.type, size: progress.downloaded.size })
    } else {
      totalDownloadedByType[totalDownloadedByType.findIndex((t) => t.type === progress.type)].size = progress.downloaded.size
    }
    if (progressBar && progressLabel && progressPercent) {
      const downloadedSum = totalDownloadedByType.reduce((acc, curr) => acc + curr.size, 0)
      const ratio = totalToDownload > 0 ? downloadedSum / totalToDownload : 0
      progressBar.style.width = `${Math.min(ratio * 100, 100)}%`

      let labelText = 'Téléchargement des fichiers...'
      if (progress.type === 'JAVA') labelText = 'Téléchargement de Java 21...'
      else if (progress.type === 'FORGE' || progress.type === 'NEOFORGE') labelText = 'Téléchargement de NeoForge...'
      else if (progress.type === 'MOD') labelText = 'Téléchargement des mods...'
      else if (progress.type === 'ASSET') labelText = 'Téléchargement des ressources...'

      progressLabel.innerText = labelText
      progressPercent.innerText = `${Math.round(Math.min(ratio * 100, 100))}%`
    }
  })

  game.launchInstallLoader(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Installation de NeoForge 21.1.169...'
    if (progressPercent) progressPercent.innerText = ''
  })

  game.launchExtractNatives(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Extraction des bibliothèques natives...'
  })

  game.launchCopyAssets(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Copie des ressources du jeu...'
  })

  game.launchPatchLoader(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Configuration du ModLoader NeoForge...'
  })

  game.launchCheckJava(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Vérification de Java 21...'
  })

  game.launchClean(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Nettoyage des fichiers temporaires...'
  })

  game.launchLaunch(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Démarrage de Minecraft 1.21.1...'
  })

  game.launched(() => {
    setIndeterminate(true)
    if (progressLabel) progressLabel.innerText = 'Minecraft est lancé — Connexion à Athéna...'
  })

  // Quand Minecraft se ferme (soit normalement, soit par déconnexion, soit par erreur)
  game.launchClose(async (code: number) => {
    setIndeterminate(false)
    if (progressContainer) progressContainer.classList.add('hidden')
    if (playBtn) {
      playBtn.style.display = 'block'
      playBtn.removeAttribute('disabled')
    }
    if (progressBar) progressBar.style.width = '0%'
    if (progressPercent) progressPercent.innerText = ''

    // Rafraîchir l'état du serveur
    updateServerStatus()

    if (code !== 0 && code !== null) {
      logger.warn(`Minecraft s'est arrêté avec le code ${code}`)
      await Dialog.show(
        `Minecraft s'est arrêté de manière inattendue (Code de sortie : ${code}).\nConsultez les fichiers logs si le problème persiste.`,
        [{ text: 'Compris', type: 'ok' }]
      )
    }
  })
}
