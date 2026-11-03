/**
 * launcher/src/services/roles.ts
 * Référentiel unifié des rôles et permissions RBAC pour le Launcher Modey.
 * Consomme l'endpoint dynamique /api/roles avec cache mémoire et fallback canonique sécurisé.
 */

export interface RoleDefinition {
  slug: string
  name: string
  hierarchy_level: number
  weight: number
  color: string
  badge_icon: string
  is_system: boolean
  luckPermsGroup: string
  description: string
  permissions: string[]
}

export const ROLE_ALIASES: Record<string, string> = {
  superadmin: 'super_admin',
  super_administrateur: 'super_admin',
  modo: 'moderator',
  supermodo: 'super_moderator',
  dev: 'developer',
  developpeur: 'developer',
  player: 'citizen',
  joueur: 'citizen',
  default: 'citizen',
  user: 'citizen'
}

export const STAFF_ROLES = [
  'founder',
  'super_admin',
  'superadmin',
  'admin',
  'super_moderator',
  'moderator',
  'developer',
  'dev'
]

export const DEFAULT_BYPASS_ROLES = [
  'founder',
  'super_admin',
  'admin',
  'moderator'
]

export const CANONICAL_ROLES: Record<string, RoleDefinition> = {
  founder: {
    slug: 'founder',
    name: 'Fondateur',
    hierarchy_level: 100,
    weight: 100,
    color: '#e53935',
    badge_icon: 'crown',
    is_system: true,
    luckPermsGroup: 'founder',
    description: 'Accès absolu et gouvernance suprême de la plateforme Modey',
    permissions: ['*']
  },
  super_admin: {
    slug: 'super_admin',
    name: 'Super Admin',
    hierarchy_level: 90,
    weight: 90,
    color: '#d81b60',
    badge_icon: 'shield-halved',
    is_system: true,
    luckPermsGroup: 'super_admin',
    description: "Supervision globale, gestion de l'infrastructure et des paramètres",
    permissions: ['admin.access', 'server.power', 'server.edit', 'bypass.maintenance', 'bypass.whitelist']
  },
  admin: {
    slug: 'admin',
    name: 'Admin',
    hierarchy_level: 80,
    weight: 80,
    color: '#fb8c00',
    badge_icon: 'shield',
    is_system: true,
    luckPermsGroup: 'admin',
    description: 'Gestion des serveurs, joueurs et actualités',
    permissions: ['admin.access', 'server.power', 'server.edit', 'bypass.maintenance', 'bypass.whitelist']
  },
  super_moderator: {
    slug: 'super_moderator',
    name: 'Super Modo',
    hierarchy_level: 70,
    weight: 70,
    color: '#8e24aa',
    badge_icon: 'gavel',
    is_system: true,
    luckPermsGroup: 'super_moderator',
    description: 'Modération avancée et approbations',
    permissions: ['admin.access', 'server.command', 'bypass.maintenance', 'bypass.whitelist']
  },
  moderator: {
    slug: 'moderator',
    name: 'Modo',
    hierarchy_level: 60,
    weight: 60,
    color: '#1e88e5',
    badge_icon: 'hammer',
    is_system: true,
    luckPermsGroup: 'moderator',
    description: 'Modération des joueurs et surveillance',
    permissions: ['admin.access', 'server.command', 'bypass.maintenance', 'bypass.whitelist']
  },
  developer: {
    slug: 'developer',
    name: 'Développeur',
    hierarchy_level: 50,
    weight: 50,
    color: '#43a047',
    badge_icon: 'code',
    is_system: true,
    luckPermsGroup: 'developer',
    description: 'Maintenance technique et redémarrages',
    permissions: ['admin.access', 'server.power', 'server.edit', 'bypass.maintenance']
  },
  builder: {
    slug: 'builder',
    name: 'Constructeur',
    hierarchy_level: 30,
    weight: 30,
    color: '#ffb74d',
    badge_icon: 'cubes',
    is_system: true,
    luckPermsGroup: 'builder',
    description: 'Constructeur',
    permissions: ['launcher.access']
  },
  vip: {
    slug: 'vip',
    name: 'VIP',
    hierarchy_level: 20,
    weight: 20,
    color: '#fbc02d',
    badge_icon: 'star',
    is_system: true,
    luckPermsGroup: 'vip',
    description: 'Membre VIP',
    permissions: ['launcher.access', 'bypass.whitelist']
  },
  citizen: {
    slug: 'citizen',
    name: 'Joueur',
    hierarchy_level: 10,
    weight: 10,
    color: '#78909c',
    badge_icon: 'user',
    is_system: true,
    luckPermsGroup: 'default',
    description: 'Joueur standard de la communauté Modey',
    permissions: ['launcher.access']
  },
  player: {
    slug: 'player',
    name: 'Joueur',
    hierarchy_level: 10,
    weight: 10,
    color: '#78909c',
    badge_icon: 'user',
    is_system: true,
    luckPermsGroup: 'default',
    description: 'Joueur standard de la communauté Modey',
    permissions: ['launcher.access']
  }
}

let rolesCache: Record<string, RoleDefinition> | null = null

export function normalizeRole(role?: string): string {
  if (!role) return 'citizen'
  const clean = String(role).trim().toLowerCase()
  return ROLE_ALIASES[clean] || clean
}

export function isStaff(role?: string): boolean {
  const norm = normalizeRole(role)
  return STAFF_ROLES.includes(norm) || norm === 'founder'
}

export function getRoleInfo(role?: string): RoleDefinition {
  const norm = normalizeRole(role)
  if (rolesCache && rolesCache[norm]) {
    return rolesCache[norm]
  }
  return CANONICAL_ROLES[norm] || CANONICAL_ROLES.citizen
}

export function checkCanBypass(profile?: any, user?: any): boolean {
  if (!user) return false
  const role = (user.role || 'citizen').toLowerCase()
  const norm = normalizeRole(role)
  if (norm === 'founder' || norm === 'super_admin') return true

  const perms: string[] = Array.isArray(user.permissions) ? user.permissions : []
  if (
    perms.includes('*') ||
    perms.includes('server:bypass_maintenance') ||
    perms.includes('launcher:bypass_maintenance') ||
    perms.includes('bypass.maintenance')
  ) {
    return true
  }

  const bypassRoles: string[] = profile?.modey?.bypassRoles || DEFAULT_BYPASS_ROLES
  if (bypassRoles.map((r: string) => normalizeRole(r)).includes(norm)) return true

  return STAFF_ROLES.includes(norm)
}

export async function fetchRoles(apiBaseUrl?: string): Promise<Record<string, RoleDefinition>> {
  if (rolesCache) return rolesCache
  const base = apiBaseUrl || 'https://api.modey.flowcrea.fr'
  try {
    const res = await fetch(`${base}/api/roles?format=list`).catch(() => null)
    if (res && res.ok) {
      const list = await res.json()
      if (Array.isArray(list) && list.length > 0) {
        const mapped: Record<string, RoleDefinition> = {}
        for (const item of list) {
          if (item && item.slug) {
            mapped[item.slug] = {
              slug: item.slug,
              name: item.name || item.slug,
              hierarchy_level: item.hierarchy_level || 10,
              weight: item.weight || item.hierarchy_level || 10,
              color: item.color || '#9e9e9e',
              badge_icon: item.badge_icon || 'shield',
              is_system: Boolean(item.is_system),
              luckPermsGroup: item.luckPermsGroup || item.slug,
              description: item.description || '',
              permissions: Array.isArray(item.permissions) ? item.permissions : []
            }
          }
        }
        rolesCache = { ...CANONICAL_ROLES, ...mapped }
        return rolesCache
      }
    }
  } catch (_) {}

  rolesCache = { ...CANONICAL_ROLES }
  return rolesCache
}
