import { Dialog } from '../../../components/dialog'
import { BRAND } from '../../../config/brand'

// Palette & pixel-art Minecraft heads (viewBox 0 0 8 8)
function getHeadSvg(type: 'alex' | 'lucas' | 'maxime' | 'emma' | 'theo' | 'lea'): string {
  switch (type) {
    case 'alex':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#ECC2A0"/>
        <rect x="0" y="0" width="8" height="3" fill="#C65C2E"/>
        <rect x="0" y="3" width="1" height="3" fill="#A8471D"/>
        <rect x="7" y="3" width="1" height="2" fill="#C65C2E"/>
        <rect x="1" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="4" width="1" height="1" fill="#388E3C"/>
        <rect x="5" y="4" width="1" height="1" fill="#388E3C"/>
        <rect x="6" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="5" width="2" height="1" fill="#DFA987"/>
        <rect x="3" y="6" width="2" height="1" fill="#C07860"/>
      </svg>`
    case 'lucas':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#D9A066"/>
        <rect x="0" y="0" width="8" height="2" fill="#4A3222"/>
        <rect x="0" y="2" width="1" height="2" fill="#4A3222"/>
        <rect x="7" y="2" width="1" height="2" fill="#4A3222"/>
        <rect x="2" y="2" width="4" height="1" fill="#3B2616"/>
        <rect x="1" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="3" width="1" height="1" fill="#2E52CC"/>
        <rect x="5" y="3" width="1" height="1" fill="#2E52CC"/>
        <rect x="6" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="4" width="2" height="1" fill="#BD8B56"/>
        <rect x="3" y="5" width="2" height="1" fill="#6B4423"/>
      </svg>`
    case 'maxime':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#D59F72"/>
        <rect x="0" y="0" width="8" height="3" fill="#241B16"/>
        <rect x="0" y="3" width="1" height="3" fill="#241B16"/>
        <rect x="7" y="3" width="1" height="3" fill="#241B16"/>
        <rect x="1" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="3" width="1" height="1" fill="#4A6B82"/>
        <rect x="5" y="3" width="1" height="1" fill="#4A6B82"/>
        <rect x="6" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="4" width="2" height="1" fill="#BF895E"/>
        <rect x="2" y="6" width="4" height="1" fill="#1B1410"/>
      </svg>`
    case 'emma':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#F7D3B5"/>
        <rect x="0" y="0" width="8" height="3" fill="#E6C24C"/>
        <rect x="0" y="3" width="1" height="4" fill="#CCA535"/>
        <rect x="7" y="3" width="1" height="4" fill="#E6C24C"/>
        <rect x="1" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="3" width="1" height="1" fill="#3B82F6"/>
        <rect x="5" y="3" width="1" height="1" fill="#3B82F6"/>
        <rect x="6" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="4" width="2" height="1" fill="#E5BDA0"/>
        <rect x="3" y="5" width="2" height="1" fill="#E08B8B"/>
      </svg>`
    case 'theo':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#DCAB7D"/>
        <rect x="0" y="0" width="8" height="3" fill="#2563EB"/>
        <rect x="0" y="2" width="8" height="1" fill="#1D4ED8"/>
        <rect x="0" y="3" width="1" height="1" fill="#382415"/>
        <rect x="7" y="3" width="1" height="1" fill="#382415"/>
        <rect x="1" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="4" width="1" height="1" fill="#1F2937"/>
        <rect x="5" y="4" width="1" height="1" fill="#1F2937"/>
        <rect x="6" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="5" width="2" height="1" fill="#B88A60"/>
      </svg>`
    case 'lea':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#E8BA9B"/>
        <rect x="0" y="0" width="8" height="2" fill="#5C2B14"/>
        <rect x="0" y="2" width="8" height="1" fill="#8B5CF6"/>
        <rect x="0" y="3" width="1" height="4" fill="#5C2B14"/>
        <rect x="7" y="3" width="1" height="4" fill="#5C2B14"/>
        <rect x="1" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="4" width="1" height="1" fill="#9333EA"/>
        <rect x="5" y="4" width="1" height="1" fill="#9333EA"/>
        <rect x="6" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="5" width="2" height="1" fill="#D39775"/>
      </svg>`
  }
}

export function renderFriendsList() {
  const container = document.getElementById('friends-list-container')
  if (!container) return

  const friends = [
    {
      name: 'Alex',
      type: 'alex' as const,
      online: true,
      sub: 'Athéna • Explore sa ville',
      action: true
    },
    {
      name: 'Lucas',
      type: 'lucas' as const,
      online: true,
      sub: 'Valloria • En aventure',
      action: true
    },
    {
      name: 'Maxime',
      type: 'maxime' as const,
      online: true,
      sub: 'Athéna • Construit sa maison',
      action: true
    },
    {
      name: 'Emma',
      type: 'emma' as const,
      online: false,
      sub: 'Hors ligne • Il y a 2h',
      action: false
    },
    {
      name: 'Théo',
      type: 'theo' as const,
      online: false,
      sub: 'Hors ligne • Il y a 5h',
      action: false
    },
    {
      name: 'Léa',
      type: 'lea' as const,
      online: false,
      sub: 'Hors ligne • Il y a 1j',
      action: false
    }
  ]

  container.innerHTML = friends
    .map(
      (f) => `
    <div class="friend-card ${f.online ? 'is-online' : 'is-offline'}">
      <div class="friend-avatar-wrap">
        ${getHeadSvg(f.type)}
        ${f.online ? '<span class="friend-online-dot"></span>' : ''}
      </div>
      <div class="friend-info">
        <div class="friend-name-row">
          <span class="friend-name">${f.name}</span>
          ${f.online ? '<span class="status-dot-inline online"></span>' : ''}
        </div>
        <div class="friend-sub">${f.sub}</div>
      </div>
      ${f.action ? '<button type="button" class="btn-friend-join">Rejoindre</button>' : ''}
    </div>
  `
    )
    .join('')

  // Boutons et liens d'action
  const showSoonDialog = () => {
    Dialog.show(
      'Liste d\'amis Modey\n\nCette fonction arrive bientôt ! L\'activité de tes amis et la connexion directe seront disponibles très prochainement.',
      [{ text: 'Compris', type: 'ok' }]
    )
  }

  container.querySelectorAll('.btn-friend-join').forEach((b) => b.addEventListener('click', showSoonDialog))
  document.getElementById('friends-view-all')?.addEventListener('click', showSoonDialog)
  document.getElementById('friends-all-link')?.addEventListener('click', showSoonDialog)
}

export function renderNotificationsList() {
  const container = document.getElementById('notifications-list-container')
  if (!container) return

  // Squelettes abstraits sous l'overlay frosted glass (aucun faux message inventé)
  container.innerHTML = `
    <div class="notif-skeleton-list">
      <div class="notif-skeleton-item">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-bar title"></div>
          <div class="skeleton-bar sub"></div>
        </div>
      </div>
      <div class="notif-skeleton-item">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-bar title"></div>
          <div class="skeleton-bar sub"></div>
        </div>
      </div>
      <div class="notif-skeleton-item">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-lines">
          <div class="skeleton-bar title"></div>
          <div class="skeleton-bar sub"></div>
        </div>
      </div>
    </div>
  `

  const showNotifsDialog = async () => {
    await Dialog.show(
      'Centre de notifications Modey\n\nCette fonction arrive très bientôt ! Vos alertes de serveur, messages et invitations s\'afficheront ici.',
      [{ text: 'Compris', type: 'ok' }]
    )
  }

  document.getElementById('notifs-view-all')?.addEventListener('click', showNotifsDialog)

  document.getElementById('btn-discord-join')?.addEventListener('click', () => {
    window.open(BRAND.discordUrl, '_blank')
  })
}

export function initRailTabs() {}
