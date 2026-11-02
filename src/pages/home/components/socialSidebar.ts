import { Dialog } from '../../../components/dialog'

export function initRailTabs() {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.rail-tabs-nav button[role="tab"]')
  const panels = document.querySelectorAll<HTMLElement>('.rail-tab-content .rail-panel')
  if (!tabs.length || !panels.length) return

  const activateTab = (tabId: string) => {
    tabs.forEach((tab) => {
      const active = tab.id === tabId
      tab.classList.toggle('active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
      tab.tabIndex = active ? 0 : -1
    })
    panels.forEach((panel) => {
      const targetId = document.getElementById(tabId)?.getAttribute('aria-controls')
      const active = panel.id === targetId
      panel.classList.toggle('active', active)
      panel.hidden = !active
    })
    try {
      localStorage.setItem('modey.home.railTab', tabId)
    } catch (_) {}
  }

  const savedTab = localStorage.getItem('modey.home.railTab')
  const initialTab = savedTab && document.getElementById(savedTab) ? savedTab : 'tab-btn-friends'
  activateTab(initialTab)

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab.id))
    tab.addEventListener('keydown', (e) => {
      let nextIndex = index
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
      else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
      else if (e.key === 'Home') nextIndex = 0
      else if (e.key === 'End') nextIndex = tabs.length - 1
      else return

      e.preventDefault()
      tabs[nextIndex].focus()
      activateTab(tabs[nextIndex].id)
    })
  })
}

export function renderFriendsList() {
  const container = document.getElementById('friends-list-container')
  if (!container) return

  container.innerHTML = `
    <div class="friends-soon-overlay">
      <div class="friends-soon-content">
        <div class="soon-icon"><svg class="solar-icon solar-linear" aria-hidden="true"><use href="#solar-friends-linear"></use></svg></div>
        <div class="soon-title">Cette fonction arrive bientôt</div>
        <div class="soon-desc">L'activité de tes amis et la connexion directe seront disponibles très prochainement.</div>
      </div>
    </div>
  `

  document.getElementById('friends-view-all')?.addEventListener('click', async () => {
    await Dialog.show(
      'Liste d\'amis Modey\n\nLa gestion sociale et l\'activité en direct de vos amis arrivent dans une prochaine mise à jour du launcher !',
      [{ text: 'Compris', type: 'ok' }]
    )
  })
}

export function renderNotificationsList() {
  const container = document.getElementById('notifications-list-container')
  if (!container) return

  // Aucune fausse notification injectée : affiche l'état réel (vide)
  container.innerHTML = `
    <div class="notifs-empty">
      <svg class="solar-icon solar-linear" aria-hidden="true"><use href="#solar-bell-linear"></use></svg>
      <span>Aucune nouvelle notification</span>
    </div>
  `

  document.getElementById('notifs-view-all')?.addEventListener('click', async () => {
    await Dialog.show('Centre de notifications\n\nToutes vos alertes et notifications s\'afficheront ici.', [
      { text: 'Compris', type: 'ok' }
    ])
  })

  document.getElementById('btn-discord-join')?.addEventListener('click', () => {
    const url = 'https://discord.gg/modey'
    window.open(url, '_blank')
  })
}
