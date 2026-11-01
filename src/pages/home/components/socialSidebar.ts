import { Dialog } from '../../../components/dialog'

export function renderFriendsList() {
  const container = document.getElementById('friends-list-container')
  if (!container) return

  container.innerHTML = `
    <div class="friends-soon-overlay">
      <div class="friends-soon-content">
        <div class="soon-icon"><i class="fa-solid fa-user-group"></i></div>
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
      <i class="fa-regular fa-bell-slash"></i>
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
