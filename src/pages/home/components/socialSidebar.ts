import { getUser } from '../../../state'
import { Dialog } from '../../../components/dialog'
import { openDiscordInvite } from '../../../services/discord'

// Palette & pixel-art Minecraft heads (viewBox 0 0 8 8)
export function getHeadSvg(type: 'alex' | 'lucas' | 'maxime' | 'emma' | 'theo' | 'lea' | 'florian'): string {
  switch (type) {
    case 'florian':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#D59F72"/>
        <rect x="0" y="0" width="8" height="3" fill="#2E2015"/>
        <rect x="0" y="3" width="1" height="2" fill="#2E2015"/>
        <rect x="7" y="3" width="1" height="2" fill="#2E2015"/>
        <rect x="1" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="3" width="1" height="1" fill="#2563EB"/>
        <rect x="5" y="3" width="1" height="1" fill="#2563EB"/>
        <rect x="6" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="4" width="2" height="1" fill="#BF895E"/>
        <rect x="2" y="6" width="4" height="1" fill="#1C140E"/>
      </svg>`
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
        <rect x="0" y="0" width="8" height="8" fill="#D39775"/>
        <rect x="0" y="0" width="8" height="3" fill="#1C1815"/>
        <rect x="0" y="3" width="1" height="2" fill="#1C1815"/>
        <rect x="7" y="3" width="1" height="2" fill="#1C1815"/>
        <rect x="1" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="3" width="1" height="1" fill="#432616"/>
        <rect x="5" y="3" width="1" height="1" fill="#432616"/>
        <rect x="6" y="3" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="4" width="2" height="1" fill="#A86C4E"/>
        <rect x="2" y="5" width="4" height="2" fill="#33241A"/>
      </svg>`
    case 'lea':
      return `<svg class="friend-mc-head" viewBox="0 0 8 8" shape-rendering="crispEdges">
        <rect x="0" y="0" width="8" height="8" fill="#ECC2A0"/>
        <rect x="0" y="0" width="8" height="4" fill="#1A1816"/>
        <rect x="0" y="4" width="1" height="3" fill="#1A1816"/>
        <rect x="7" y="4" width="1" height="3" fill="#1A1816"/>
        <rect x="1" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="2" y="4" width="1" height="1" fill="#9333EA"/>
        <rect x="5" y="4" width="1" height="1" fill="#9333EA"/>
        <rect x="6" y="4" width="1" height="1" fill="#FFFFFF"/>
        <rect x="3" y="5" width="2" height="1" fill="#D39775"/>
      </svg>`
  }
}

export type FriendStatus = 'online' | 'dnd' | 'offline'

export interface FriendItem {
  id: string
  name: string
  type: 'alex' | 'lucas' | 'maxime' | 'emma' | 'florian'
  status: FriendStatus
  server: string
}

let userSelfStatus: 'online' | 'dnd' = 'online'

const friendsData: FriendItem[] = [
  {
    id: 'alex',
    name: 'Alex',
    type: 'alex',
    status: 'online',
    server: 'Athéna'
  },
  {
    id: 'lucas',
    name: 'Lucas',
    type: 'lucas',
    status: 'dnd',
    server: 'Valloria'
  },
  {
    id: 'maxime',
    name: 'Maxime',
    type: 'maxime',
    status: 'online',
    server: 'Athéna'
  },
  {
    id: 'emma',
    name: 'Emma',
    type: 'emma',
    status: 'offline',
    server: 'Hors ligne'
  }
]

function getStatusDotHtml(status: FriendStatus, id?: string): string {
  const title = status === 'online' ? 'En ligne' : status === 'dnd' ? 'Ne pas déranger' : 'Hors ligne'
  const idAttr = id ? ` id="${id}"` : ''
  return `<span class="friend-status-dot ${status}"${idAttr} title="${title}"></span>`
}

export function renderPartyGroup() {
  const container = document.getElementById('party-group-container')
  if (!container) return

  const user = getUser() as any
  const currentUsername = user?.name || user?.username || 'Citoyen'

  container.innerHTML = `
    <div class="party-group-head">
      <span class="party-group-title">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-crown-bold"></use></svg>
        Mon Groupe
      </span>
      <span class="party-badge">Aperçu • Bientôt disponible</span>
    </div>
    <div class="party-self-card" id="party-self-card" role="button" tabindex="0" title="Gérer mon profil de groupe">
      <div class="friend-avatar-wrap">
        ${getHeadSvg('florian')}
        ${getStatusDotHtml(userSelfStatus, 'party-self-status-dot')}
      </div>
      <div class="friend-info">
        <div class="friend-name-row">
          <span class="friend-name">${currentUsername}</span>
          <span class="party-role-tag">Chef</span>
        </div>
        <div class="friend-sub" id="party-self-sub">Athéna</div>
      </div>
      <div class="party-card-chevron">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-arrow-right-bold"></use></svg>
      </div>
    </div>
  `

  document.getElementById('party-self-card')?.addEventListener('click', openSelfPancarte)
}

function updateSelfStatusInUI() {
  const dot = document.getElementById('party-self-status-dot')
  if (dot) {
    dot.className = `friend-status-dot ${userSelfStatus}`
    dot.title = userSelfStatus === 'online' ? 'En ligne' : 'Ne pas déranger'
  }
}

export function renderFriendsList() {
  // 1. Initialise la zone Groupe en haut
  renderPartyGroup()

  // 2. Initialise la liste des amis
  const container = document.getElementById('friends-list-container')
  if (!container) return

  container.innerHTML = friendsData
    .map(
      (f) => `
    <div class="friend-card ${f.status}" data-friend-id="${f.id}" role="button" tabindex="0" title="Options pour ${f.name}">
      <div class="friend-avatar-wrap">
        ${getHeadSvg(f.type)}
        ${getStatusDotHtml(f.status)}
      </div>
      <div class="friend-info">
        <div class="friend-name-row">
          <span class="friend-name">${f.name}</span>
        </div>
        <div class="friend-sub">${f.server}</div>
      </div>
    </div>
  `
    )
    .join('')

  // Clic sur un ami pour ouvrir la pancarte d'actions
  container.querySelectorAll<HTMLElement>('.friend-card').forEach((card) => {
    card.addEventListener('click', () => {
      const fid = card.dataset.friendId
      const target = friendsData.find((item) => item.id === fid)
      if (target) {
        openFriendPancarte(target)
      }
    })
  })

  document.getElementById('friends-view-all')?.addEventListener('click', async () => {
    await Dialog.show(
      'Liste d\'amis Modey\n\nCette fonction arrive bientôt ! L\'activité de tes amis et la connexion directe seront disponibles très prochainement.',
      [{ text: 'Compris', type: 'ok' }]
    )
  })
}

function closePancarteModal() {
  const existing = document.getElementById('pancarte-modal-backdrop')
  if (existing) {
    existing.remove()
  }
}

function openSelfPancarte() {
  closePancarteModal()

  const backdrop = document.createElement('div')
  backdrop.id = 'pancarte-modal-backdrop'
  backdrop.className = 'pancarte-modal-backdrop'

  backdrop.innerHTML = `
    <div class="pancarte-modal-card">
      <div class="pancarte-head">
        <h5>
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-crown-bold"></use></svg>
          Mon Groupe
        </h5>
        <button class="btn-close-pancarte" id="btn-close-pancarte" aria-label="Fermer">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-close-bold"></use></svg>
        </button>
      </div>

      <div class="pancarte-profile-row">
        <div class="pancarte-avatar-wrap">
          ${getHeadSvg('florian')}
          ${getStatusDotHtml(userSelfStatus)}
        </div>
        <div class="pancarte-profile-info">
          <div class="pancarte-name-row">
            <span class="pancarte-name">${(getUser() as any)?.name || (getUser() as any)?.username || 'Citoyen'}</span>
            <span class="party-role-tag">Chef</span>
          </div>
          <div class="pancarte-status-badge">
            <span class="status-indicator ${userSelfStatus}"></span>
            <span>${userSelfStatus === 'online' ? 'En ligne' : 'Ne pas déranger'} • Athéna</span>
          </div>
        </div>
      </div>

      <div class="pancarte-section-label">Changer mon statut :</div>
      <div class="status-switch-row">
        <button type="button" class="status-switch-btn ${userSelfStatus === 'online' ? 'active' : ''}" id="btn-status-online">
          <span class="status-indicator online"></span> En ligne
        </button>
        <button type="button" class="status-switch-btn ${userSelfStatus === 'dnd' ? 'active' : ''}" id="btn-status-dnd">
          <span class="status-indicator dnd"></span> Ne pas déranger
        </button>
      </div>

      <div class="pancarte-notice">
        <strong>Groupe d'escouade</strong><br>
        La gestion du groupe (invitations directes, salon vocal, verrouillage) arrive très prochainement.
      </div>

      <button type="button" class="pancarte-action-btn primary" id="btn-pancarte-close-action">
        Fermer
      </button>
    </div>
  `

  document.body.appendChild(backdrop)

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePancarteModal()
  })
  backdrop.querySelector('#btn-close-pancarte')?.addEventListener('click', closePancarteModal)
  backdrop.querySelector('#btn-pancarte-close-action')?.addEventListener('click', closePancarteModal)

  backdrop.querySelector('#btn-status-online')?.addEventListener('click', () => {
    userSelfStatus = 'online'
    updateSelfStatusInUI()
    openSelfPancarte()
  })

  backdrop.querySelector('#btn-status-dnd')?.addEventListener('click', () => {
    userSelfStatus = 'dnd'
    updateSelfStatusInUI()
    openSelfPancarte()
  })
}

function openFriendPancarte(f: FriendItem) {
  closePancarteModal()

  const statusLabel =
    f.status === 'online'
      ? '<span class="status-indicator online"></span><span>En ligne • ' + f.server + '</span>'
      : f.status === 'dnd'
        ? '<span class="status-indicator dnd"></span><span>Ne pas déranger • ' + f.server + '</span>'
        : '<span class="status-indicator offline"></span><span>Hors ligne</span>'

  const backdrop = document.createElement('div')
  backdrop.id = 'pancarte-modal-backdrop'
  backdrop.className = 'pancarte-modal-backdrop'

  backdrop.innerHTML = `
    <div class="pancarte-modal-card">
      <div class="pancarte-head">
        <h5>
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg>
          Profil de joueur
        </h5>
        <button class="btn-close-pancarte" id="btn-close-pancarte" aria-label="Fermer">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-close-bold"></use></svg>
        </button>
      </div>

      <div class="pancarte-profile-row">
        <div class="pancarte-avatar-wrap">
          ${getHeadSvg(f.type)}
          ${getStatusDotHtml(f.status)}
        </div>
        <div class="pancarte-profile-info">
          <span class="pancarte-name">${f.name}</span>
          <div class="pancarte-status-badge">${statusLabel}</div>
        </div>
      </div>

      <div class="pancarte-section-label">Actions :</div>
      <div class="pancarte-actions-list">
        <button type="button" class="pancarte-action-btn" id="btn-action-invite">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-add-bold"></use></svg>
          <span>Inviter dans le groupe</span>
        </button>

        <button type="button" class="pancarte-action-btn" id="btn-action-join">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-friends-bold"></use></svg>
          <span>Rejoindre le groupe</span>
        </button>

        <button type="button" class="pancarte-action-btn discord" id="btn-action-discord">
          <svg class="discord-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>
          <span>Envoyer un message sur Discord</span>
        </button>
      </div>
    </div>
  `

  document.body.appendChild(backdrop)

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePancarteModal()
  })
  backdrop.querySelector('#btn-close-pancarte')?.addEventListener('click', closePancarteModal)

  backdrop.querySelector('#btn-action-invite')?.addEventListener('click', async () => {
    closePancarteModal()
    await Dialog.show(
      `Invitation envoyée !\n\n${f.name} a reçu une notification pour rejoindre votre groupe.`,
      [{ text: 'Super', type: 'ok' }]
    )
  })

  backdrop.querySelector('#btn-action-join')?.addEventListener('click', async () => {
    closePancarteModal()
    await Dialog.show(
      `Demande de groupe envoyée !\n\nVotre demande pour rejoindre le groupe de ${f.name} a été transmise.`,
      [{ text: 'Compris', type: 'ok' }]
    )
  })

  backdrop.querySelector('#btn-action-discord')?.addEventListener('click', () => {
    closePancarteModal()
    openDiscordInvite()
  })
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
    openDiscordInvite()
  })
}

export function initRailTabs() {}
