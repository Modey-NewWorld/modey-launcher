import { setView, getUser, logout as clearSession } from '../state'
import { auth, game, news, server, settings, profiles } from '../ipc'
import shared from '../shared'
import { refreshProfileServer, refreshProfileIdentity } from './profile'
import logger from 'electron-log/renderer'
import profileConfig from '../../config/athena-profile.json'
import freeBuildConfig from '../../config/free-build-profile.json'
import { Dialog } from './dialog'

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })
}

const backgroundColor = (color: string) => {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 0.1)`
}

export function initHome() {
  const body = document.body
  const playBtn = document.getElementById('btn-play')
  const playHeroBtn = document.getElementById('btn-play-hero')
  const detailsBtn = document.getElementById('btn-details')
  const newsAllBtn = document.getElementById('btn-news-all')
  const navHome = document.getElementById('nav-home')
  const navServers = document.getElementById('nav-servers')
  const navProfile = document.getElementById('nav-profile')
  const userCard = document.getElementById('user-card')
  const userMenu = document.getElementById('user-menu')
  const userMenuProfile = document.getElementById('user-menu-profile')
  const userMenuSettings = document.getElementById('user-menu-settings')
  const userMenuLogout = document.getElementById('user-menu-logout')
  const helloEl = document.getElementById('home-hello')
  const accountBadge = document.getElementById('home-account-badge')
  const chipRam = document.getElementById('chip-ram')
  const chipPing = document.getElementById('chip-ping')
  const heroTitle = document.getElementById('hero-title')
  const heroDesc = document.getElementById('hero-desc')
  const heroTags = document.getElementById('hero-tags')
  const heroFoot = document.getElementById('hero-foot-note')
  const heroStatus = document.getElementById('hero-status')
  const discoveryCard = document.getElementById('discovery-card')
  const modeyScroll = document.getElementById('modey-scroll')
  const accueilMain = document.getElementById('modey-main')
  const serversPage = document.getElementById('servers-page')
  const profilePage = document.getElementById('profile-page')
  const settingsPage = document.getElementById('settings-page')
  const athenaSidebar = document.getElementById('athena-status-sidebar')
  const athenaCitizenship = document.getElementById('athena-citizenship')
  const athenaJob = document.getElementById('athena-job')
  const athenaCity = document.getElementById('athena-city')
  const athenaPlaytime = document.getElementById('athena-playtime')
  const athenaWealth = document.getElementById('athena-wealth')
  const athenaAchievements = document.getElementById('athena-achievements')
  const athenaReputation = document.getElementById('athena-reputation')
  const athenaLastseen = document.getElementById('athena-lastseen')
  const profileScroll = document.getElementById('profile-scroll')
  const serverSearch = document.getElementById('server-search') as HTMLInputElement | null
  const serversFilters = document.getElementById('servers-filters')
  const srvStatusBadge = document.getElementById('srv-status-badge')
  const srvPing = document.getElementById('srv-ping')
  const srvPlayers = document.getElementById('srv-players')
  const perkRam = document.getElementById('perk-ram')
  const perkPlayers = document.getElementById('perk-players')
  const btnSrvDiscover = document.getElementById('btn-srv-discover')
  const btnSrvSelect = document.getElementById('btn-srv-select')
  const btnSelectFreebuild = document.getElementById('btn-select-freebuild')
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
  let newsFeed: any[] = []
  let notified = false

  // Un profil est "bientôt dispo" quand l'AdminTool ne lui a pas encore
  // assigné d'IP/port (serveur non actif) ou slug free-build explicite.
  const isComingSoonProfile = (profile: any) =>
    !profile || profile.slug === freeBuildConfig.slug || !profile.ip || !profile.port

  const isAthenaProfile = (profile: any) => !profile || profile.slug === 'athena'

  // Met à jour la sidebar de statut Athéna (uniquement pour Athéna)
  const updateAthenaSidebar = () => {
    const isAthena = isAthenaProfile(selectedProfile)
    if (athenaSidebar) athenaSidebar.style.display = isAthena ? 'block' : 'none'
    if (isAthena) populateAthenaSidebar()
  }

  const populateAthenaSidebar = () => {
    if (athenaCitizenship) athenaCitizenship.innerText = 'Citoyen confirmé'
    if (athenaJob) athenaJob.innerText = '—'
    if (athenaCity) athenaCity.innerText = '—'
    if (athenaPlaytime) athenaPlaytime.innerText = '—'
    if (athenaWealth) athenaWealth.innerText = '—'
    if (athenaAchievements) athenaAchievements.innerText = '0 / —'
    if (athenaReputation) athenaReputation.innerText = 'Neutre'
    if (athenaLastseen) athenaLastseen.innerText = new Date().toLocaleString('fr-FR')
  }

  const stripMarkdown = (md: string) =>
    md
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
      .replace(/[#>*_`~|-]/g, '')
      .replace(/\n+/g, ' ')
      .trim()

  const readingTime = (md: string) => {
    const words = stripMarkdown(md).split(/\s+/).filter(Boolean).length
    return Math.max(1, Math.ceil(words / 180))
  }

  const loadProfiles = async () => {
    allProfiles = (await profiles.get()) || []
    if (allProfiles.length > 0) {
      selectProfile(allProfiles[0])
      renderDropdown()
    }
    refreshAthenaCard()
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
    shared.selectedProfile = profile
    if (currentProfileName) currentProfileName.innerText = profile.name
    renderDropdown()
    renderHero()
    renderDiscovery()
    updateServerStatus()
    refreshProfileServer()
    updateAthenaSidebar()
  }

  const ATHENA_TAGS = ['Survie RP', 'Économie', 'Villes & Métropoles', 'Quêtes scénarisées']

  const renderHero = () => {
    const comingSoon = isComingSoonProfile(selectedProfile)
    const playLabel = comingSoon ? 'Bientôt disponible' : `Jouer à ${selectedProfile?.name ?? 'Athéna'}`
    const playIcon = comingSoon ? 'fa-hourglass-half' : 'fa-play'
    const heroVersion = document.getElementById('hero-version')

    if (heroVersion) {
      const mc = comingSoon ? freeBuildConfig.minecraftVersion : profileConfig.minecraftVersion
      const loader = comingSoon ? freeBuildConfig.modLoader.version : profileConfig.modLoader.version
      heroVersion.innerHTML = `<i class="fa-solid fa-cube"></i>&nbsp;Minecraft ${mc} • NeoForge ${loader}`
    }

    if (heroTitle) heroTitle.innerText = comingSoon ? 'Free Build' : (selectedProfile?.name ?? 'Athéna')
    if (heroDesc) heroDesc.innerText = comingSoon ? freeBuildConfig.teaser.description : 'Un monde vivant. Des villes à construire. Une aventure à partager.'
    if (heroTags) {
      const tags = comingSoon
        ? (freeBuildConfig.teaser.features as { title: string }[]).map((f) => f.title)
        : ATHENA_TAGS
      heroTags.innerHTML = tags.map((t) => `<span class="hero-tag">${t}</span>`).join('')
    }
    if (heroFoot) {
      heroFoot.innerHTML = comingSoon
        ? `<i class="fa-solid fa-hourglass-half"></i>&nbsp;${freeBuildConfig.statusLabel} • Minecraft ${freeBuildConfig.minecraftVersion}`
        : `<i class="fa-solid fa-circle-check"></i>&nbsp;Prêt au lancement • Dernière version installée`
    }

    for (const btn of [playBtn, playHeroBtn]) {
      const b = btn as HTMLButtonElement | null
      if (!b) continue
      if (comingSoon) {
        b.setAttribute('disabled', 'true')
        b.classList.add('btn-disabled')
      } else {
        b.removeAttribute('disabled')
        b.classList.remove('btn-disabled')
      }
    }
    if (playBtn) playBtn.innerHTML = `<i class="fa-solid fa-play"></i><span>${playLabel}</span>`
    if (playHeroBtn) playHeroBtn.innerHTML = `<i class="fa-solid ${playIcon}"></i>&nbsp;&nbsp;${playLabel}`
  }

  // Carte "À découvrir" : teaser Free Build tant qu'il n'est pas actif.
  const renderDiscovery = () => {
    if (!discoveryCard) return
    const freeBuild = allProfiles.find((p) => p.slug === freeBuildConfig.slug)
    const freeBuildActive = freeBuild && !isComingSoonProfile(freeBuild)
    const features = (freeBuildConfig.teaser.features as { title: string }[]).map((f) => `<span>${f.title}</span>`).join('')

    if (freeBuildActive) {
      discoveryCard.innerHTML = `
        <div class="discovery-icon"><i class="fa-solid fa-cubes"></i></div>
        <div class="discovery-text">
          <strong>Free Build est ouvert !</strong>
          <p>Le bac à sable créatif de Modey est en ligne. Sélectionne-le dans Serveurs et lance-toi.</p>
          <div class="discovery-features">${features}</div>
        </div>
        <button class="discovery-notify" id="btn-discover-play"><i class="fa-solid fa-play"></i>&nbsp;Jouer</button>`
      document.getElementById('btn-discover-play')?.addEventListener('click', () => {
        if (freeBuild) selectProfile(freeBuild)
        modeyScroll?.scrollTo({ top: 0, behavior: 'smooth' })
      })
      return
    }

    discoveryCard.innerHTML = `
      <div class="discovery-icon"><i class="fa-solid fa-lock"></i></div>
      <div class="discovery-text">
        <strong>De nouveaux univers arrivent bientôt sur Modey</strong>
        <p>D'autres serveurs communautaires rejoindront le catalogue prochainement. Restez à l'affût des prochaines intégrations officielles.</p>
        <div class="discovery-features">${features}</div>
      </div>
      <button class="discovery-notify ${notified ? 'notified' : ''}" id="btn-notify">
        <i class="fa-solid fa-bell"></i>&nbsp;${notified ? 'Notifié ✓' : 'Être notifié'}
      </button>`
    document.getElementById('btn-notify')?.addEventListener('click', markNotified)
  }

  const markNotified = async () => {
    if (notified) return
    notified = true
    await Dialog.show('Tu seras notifié de l’ouverture de Free Build dans le fil d’actualités. À très vite !', [{ text: 'Super !', type: 'ok' }])
    renderDiscovery()
    const srvNotify = document.getElementById('btn-notify-servers')
    if (srvNotify) {
      srvNotify.classList.add('notified')
      srvNotify.innerHTML = '<i class="fa-solid fa-bell"></i>&nbsp;Notifié ✓'
    }
  }

  const getServerTarget = () => ({
    host: selectedProfile?.ip || profileConfig.server.host,
    port: selectedProfile?.port || profileConfig.server.port
  })

  const updateServerStatus = async () => {
    // Profil "bientôt" : pas de ping, on affiche directement non actif.
    if (isComingSoonProfile(selectedProfile)) {
      if (statusDot) {
        statusDot.classList.remove('pinging', 'online')
        statusDot.classList.add('offline')
      }
      if (statusText) statusText.innerHTML = 'Bientôt disponible'
      if (heroStatus) heroStatus.title = freeBuildConfig.statusLabel
      if (playerCount) playerCount.innerHTML = ''
      if (chipPing) chipPing.innerHTML = '<span class="modey-ping-dot" style="background:#e53935"></span>&nbsp;Ping moyen: <strong>&nbsp;—</strong>'
      return
    }

    if (statusDot) {
      statusDot.classList.remove('online', 'offline')
      statusDot.classList.add('pinging')
    }
    if (statusText) statusText.innerHTML = 'Vérification...'
    if (playerCount) playerCount.innerHTML = ''

    const target = getServerTarget()
    const startedAt = performance.now()
    const status = await server.getStatus(target.host, target.port)
    const pingMs = Math.max(1, Math.round(performance.now() - startedAt))

    if (status) {
      if (statusDot) {
        statusDot.classList.remove('pinging', 'offline')
        statusDot.classList.add('online')
      }
      if (statusText) statusText.innerHTML = `Disponible • v${profileConfig.minecraftVersion}`
      if (chipPing) chipPing.innerHTML = `<span class="modey-ping-dot"></span>&nbsp;Ping moyen: <strong>&nbsp;${pingMs} ms</strong>`

      if (playerCount) {
        const occupantLabel = isAthenaProfile(selectedProfile) ? 'citoyens connectés' : 'joueurs connectés'
        playerCount.innerHTML = `${status.players.online.toLocaleString()} / ${status.players.max.toLocaleString()} ${occupantLabel}`
      }
    } else {
      if (statusDot) {
        statusDot.classList.remove('pinging', 'online')
        statusDot.classList.add('offline')
      }
      if (statusText) statusText.innerHTML = 'Hors ligne'
      if (playerCount) playerCount.innerHTML = ''
      if (chipPing) chipPing.innerHTML = '<span class="modey-ping-dot" style="background:#e53935"></span>&nbsp;Ping moyen: <strong>&nbsp;—</strong>'
    }
  }

  const getAthenaTarget = () => {
    const athena = allProfiles.find((p) => p.slug === 'athena')
    return { host: athena?.ip || profileConfig.server.host, port: athena?.port || profileConfig.server.port }
  }

  // Carte Athéna de la page Serveurs : statut live indépendant du profil sélectionné.
  const refreshAthenaCard = async () => {
    if (srvStatusBadge) srvStatusBadge.innerHTML = '<span class="status-dot pinging"></span>&nbsp;Vérification...'
    try {
      const t = getAthenaTarget()
      const startedAt = performance.now()
      const st = await server.getStatus(t.host, t.port)
      const pingMs = Math.max(1, Math.round(performance.now() - startedAt))
      if (st) {
        if (srvStatusBadge) srvStatusBadge.innerHTML = `<span class="status-dot online"></span>&nbsp;Disponible • ${profileConfig.minecraftVersion}`
        if (srvPing) srvPing.innerHTML = `<i class="fa-solid fa-signal"></i>&nbsp;${pingMs} ms`
        const txt = `${st.players.online.toLocaleString()} / ${st.players.max.toLocaleString()}`
        if (srvPlayers) srvPlayers.innerHTML = `<i class="fa-solid fa-users"></i>&nbsp;${txt}`
        if (perkPlayers) perkPlayers.innerText = `${st.players.online.toLocaleString()} aventuriers en ligne`
      } else {
        throw new Error('offline')
      }
    } catch {
      if (srvStatusBadge) srvStatusBadge.innerHTML = '<span class="status-dot offline"></span>&nbsp;Hors ligne'
      if (srvPing) srvPing.innerHTML = '<i class="fa-solid fa-signal"></i>&nbsp;—'
      if (srvPlayers) srvPlayers.innerHTML = '<i class="fa-solid fa-users"></i>&nbsp;—'
    }
  }

  // TODO(site web) : "Découvrir" devra ouvrir la page dédiée du serveur
  // (ex. https://modey.gg/serveurs/athena) dans le navigateur. Pas de site
  // pour l'instant → dialogue récapitulatif en attendant.
  const showAthenaDetails = async () => {
    const t = getAthenaTarget()
    await Dialog.show(
      `Athéna — Serveur officiel.\n\nUn monde vivant centré sur l'aventure communautaire et la construction de cités prospères. Fonde ta ville, commerce et écris ton histoire.\n\nMinecraft ${profileConfig.minecraftVersion} • NeoForge ${profileConfig.modLoader.version}\nConnexion : ${t.host}:${t.port}`,
      [{ text: 'Compris', type: 'ok' }]
    )
  }

  const loadHeader = async () => {
    const user = getUser()
    if (helloEl) helloEl.innerText = user?.name ? `Bonjour ${user.name} 👋` : 'Bonjour 👋'
    if (accountBadge) {
      const type = (user as any)?.meta?.type
      accountBadge.innerText = type === 'msa' ? 'Compte Microsoft vérifié' : 'Compte joueur vérifié'
    }
    try {
      const config = await settings.get()
      const ramGo = (+config.memory.max).toFixed(1).replace('.', ',')
      if (chipRam) chipRam.innerHTML = `<i class="fa-solid fa-memory"></i>&nbsp;RAM allouée: <strong>&nbsp;${ramGo} Go</strong>`
      if (perkRam) perkRam.innerText = `Optimisation auto (${Math.round(+config.memory.max)} Go recommandés)`
    } catch {
      /*ram chip garde sa valeur par défaut*/
    }
  }

  const loadNews = async () => {
    if (!newsList) return
    newsList.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">Chargement des actualités...</div>'
    const feed = await news.getNews()
    newsFeed = feed || []

    newsList.innerHTML = ''

    if (!feed || feed.length === 0) {
      newsList.innerHTML = '<div style="text-align:center; color: #888;">Aucune actualité pour le moment.</div>'
      return
    }

    feed.forEach((item: any, index: number) => {
      let tagsHTML = ''
      item.tags?.slice(0, 1).forEach((tag: any) => {
        tagsHTML += `<span class="tag" style="color: ${tag.color}; background-color: ${backgroundColor(tag.color)}">${tag.name}</span>`
      })
      const excerpt = stripMarkdown(item.content || '').slice(0, 140) + '...'
      const articleHTML = `
        <article class="news-article">
          <div class="article-meta">
            <div class="tags-container">${tagsHTML || '<span class="tag">Annonce officielle</span>'}</div>
            <span class="date">${formatDate(item.createdAt)}</span>
            <span class="open-ext" data-index="${index}">↗</span>
          </div>

          <h3>${item.title}</h3>

          <div class="article-content">
            <p>${excerpt}</p>
          </div>
          <div class="article-foot">
            <span><i class="fa-solid fa-clock"></i>&nbsp;${readingTime(item.content || '')} min de lecture</span>
            <button data-index="${index}">Consulter →</button>
          </div>
        </article>
      `

      newsList.insertAdjacentHTML('beforeend', articleHTML)
    })

    newsList.querySelectorAll('button[data-index], .open-ext[data-index]').forEach((el) => {
      el.addEventListener('click', async () => {
        const item = newsFeed[Number((el as HTMLElement).dataset.index)]
        if (!item) return
        await Dialog.show(`${item.title}\n\n${stripMarkdown(item.content || '')}`, [{ text: 'Fermer', type: 'ok' }])
      })
    })
  }

  const showServerDetails = async () => {
    if (isComingSoonProfile(selectedProfile)) {
      await Dialog.show(
        `Free Build — ${freeBuildConfig.statusLabel}.\n\n${freeBuildConfig.teaser.description}\n\nCe qu'il proposera :\n${(freeBuildConfig.teaser.features as { title: string; text: string }[]).map((f) => `• ${f.title} : ${f.text}`).join('\n')}\n\nMinecraft ${freeBuildConfig.minecraftVersion} • NeoForge ${freeBuildConfig.modLoader.version}`,
        [{ text: 'Compris', type: 'ok' }]
      )
      return
    }
    await Dialog.show(
      `${selectedProfile?.name ?? 'Athéna'} — Serveur officiel.\n\nUn monde vivant. Des villes à construire. Une aventure à partager.\n\nMinecraft ${profileConfig.minecraftVersion} • NeoForge ${profileConfig.modLoader.version}\nConnexion : ${getServerTarget().host}:${getServerTarget().port}`,
      [{ text: 'Compris', type: 'ok' }]
    )
  }

  loadProfiles()
  loadHeader()
  updateServerStatus()
  loadNews()
  renderHero()
  renderDiscovery()
  refreshAthenaCard()

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

  const setActiveNav = (active: HTMLElement | null) => {
    document.querySelectorAll('.modey-nav-item').forEach((el) => el.classList.remove('active'))
    active?.classList.add('active')
  }

  const showAccueil = () => {
    setActiveNav(navHome)
    if (accueilMain) accueilMain.style.display = 'flex'
    if (serversPage) serversPage.style.display = 'none'
    if (profilePage) profilePage.style.display = 'none'
    if (settingsPage) settingsPage.style.display = 'none'
  }

  const showServers = () => {
    setActiveNav(navServers)
    if (accueilMain) accueilMain.style.display = 'none'
    if (serversPage) serversPage.style.display = 'flex'
    if (profilePage) profilePage.style.display = 'none'
    if (settingsPage) settingsPage.style.display = 'none'
    refreshAthenaCard()
  }

  const showProfile = () => {
    setActiveNav(navProfile)
    if (accueilMain) accueilMain.style.display = 'none'
    if (serversPage) serversPage.style.display = 'none'
    if (settingsPage) settingsPage.style.display = 'none'
    if (profilePage) profilePage.style.display = 'flex'
    refreshProfileIdentity()
    refreshProfileServer()
    profileScroll?.scrollTo({ top: 0 })
  }

  const showSettings = () => {
    if (accueilMain) accueilMain.style.display = 'none'
    if (serversPage) serversPage.style.display = 'none'
    if (profilePage) profilePage.style.display = 'none'
    if (settingsPage) settingsPage.style.display = 'flex'
    document.querySelectorAll('.modey-nav-item').forEach((el) => el.classList.remove('active'))
  }

  let activeFilter = 'tous'

  const applyServersFilter = () => {
    const q = (serverSearch?.value || '').toLowerCase().trim()
    document.querySelectorAll('.servers-grid .server-card').forEach((card) => {
      const el = card as HTMLElement
      const tags = (el.dataset.tags || '').toLowerCase()
      const name = (el.dataset.name || '').toLowerCase()
      const okFilter = activeFilter === 'tous' || tags.includes(activeFilter)
      const okSearch = !q || name.includes(q)
      el.style.display = okFilter && okSearch ? '' : 'none'
    })
  }

  navHome?.addEventListener('click', () => {
    showAccueil()
    modeyScroll?.scrollTo({ top: 0, behavior: 'smooth' })
  })

  navServers?.addEventListener('click', showServers)

  navProfile?.addEventListener('click', showProfile)

  const closeUserMenu = () => {
    userMenu?.classList.remove('open')
    userCard?.classList.remove('open')
  }

  userCard?.addEventListener('click', (e) => {
    e.stopPropagation()
    userMenu?.classList.toggle('open')
    userCard?.classList.toggle('open')
  })
  userMenuProfile?.addEventListener('click', () => {
    closeUserMenu()
    showProfile()
  })
  userMenuSettings?.addEventListener('click', () => {
    closeUserMenu()
    showSettings()
  })
  userMenuLogout?.addEventListener('click', async () => {
    closeUserMenu()
    if (
      await Dialog.show('Se déconnecter du compte Modey ?', [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Déconnexion', type: 'danger' }
      ])
    ) {
      await auth.logout()
      clearSession()
      setView('login')
    }
  })
  detailsBtn?.addEventListener('click', showServerDetails)
  newsAllBtn?.addEventListener('click', () => {
    loadNews()
    document.querySelector('.modey-news')?.scrollIntoView({ behavior: 'smooth' })
  })

  const startLaunch = async () => {
    if (isComingSoonProfile(selectedProfile)) {
      await showServerDetails()
      return
    }

    setIndeterminate(true)
    if (playBtn) playBtn.style.display = 'none'
    if (playHeroBtn) (playHeroBtn as HTMLButtonElement).style.display = 'none'
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
  }

  playBtn?.addEventListener('click', startLaunch)
  playHeroBtn?.addEventListener('click', startLaunch)

  btnSrvDiscover?.addEventListener('click', showAthenaDetails)
  btnSrvSelect?.addEventListener('click', () => {
    const athena = allProfiles.find((p) => p.slug === 'athena')
    if (athena) selectProfile(athena)
    showAccueil()
    modeyScroll?.scrollTo({ top: 0, behavior: 'smooth' })
  })
  btnSelectFreebuild?.addEventListener('click', () => {
    const freeBuild = allProfiles.find((p) => p.slug === freeBuildConfig.slug)
    if (freeBuild) selectProfile(freeBuild)
    showAccueil()
    modeyScroll?.scrollTo({ top: 0, behavior: 'smooth' })
  })
  document.getElementById('btn-notify-servers')?.addEventListener('click', markNotified)

  serverSearch?.addEventListener('input', applyServersFilter)
  serversFilters?.querySelectorAll('.filter-pill[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      serversFilters.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      activeFilter = (btn as HTMLElement).dataset.filter || 'tous'
      applyServersFilter()
    })
  })

  document.getElementById('btn-refresh-athena-sidebar')?.addEventListener('click', async () => {
    updateAthenaSidebar()
    await Dialog.show('Statut citoyen Athéna rafraîchi.', [{ text: 'OK', type: 'ok' }])
  })

  profileSelector?.querySelector('.selected-profile')?.addEventListener('click', () => {
    profileSelector.classList.toggle('open')
  })

  body.addEventListener('click', (e) => {
    if (!profileSelector?.contains(e.target as Node)) {
      profileSelector?.classList.remove('open')
    }
    if (!userMenu?.contains(e.target as Node) && !userCard?.contains(e.target as Node)) {
      closeUserMenu()
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
      playBtn.style.display = 'flex'
      playBtn.removeAttribute('disabled')
    }
    if (playHeroBtn) {
      ;(playHeroBtn as HTMLButtonElement).style.display = 'flex'
    }
    renderHero()
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
