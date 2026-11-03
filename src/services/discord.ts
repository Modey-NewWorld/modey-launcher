/**
 * launcher/src/services/discord.ts
 * Gestion dynamique de l'intégration Discord (Liens de connexion & d'invitation)
 * Récupérés dynamiquement depuis l'API Modey Core pour éviter toute URL codée en dur.
 */

import { BRAND } from '../config/brand'
import { Dialog } from '../components/dialog'

export interface IDiscordConfig {
  connectUrl: string
  inviteUrl: string
  loginUrl: string
}

let cachedConfig: IDiscordConfig | null = null

export function getApiBase(): string {
  return BRAND.apiUrl || 'https://api.modey.flowcrea.fr'
}

/**
 * Récupère la configuration Discord dynamique depuis le backend
 */
export async function fetchDiscordConfig(force = false): Promise<IDiscordConfig> {
  if (cachedConfig && !force) {
    return cachedConfig
  }

  const apiBase = getApiBase()
  try {
    const res = await fetch(`${apiBase}/api/auth/discord/config`)
    if (res.ok) {
      const data = await res.json()
      cachedConfig = {
        connectUrl: data.connectUrl || '',
        inviteUrl: data.inviteUrl || '',
        loginUrl: data.loginUrl || `${apiBase}/api/auth/discord/login`
      }
      return cachedConfig
    }
  } catch (_) {}

  // Fallback dynamique sans URL en dur
  return {
    connectUrl: `${apiBase}/api/auth/discord/login`,
    inviteUrl: '',
    loginUrl: `${apiBase}/api/auth/discord/login`
  }
}

/**
 * Met à jour le cache à partir de la réponse /status si disponible
 */
export function updateDiscordConfigFromStatus(statusData: any) {
  if (!statusData) return
  if (!cachedConfig) {
    cachedConfig = {
      connectUrl: statusData.connectUrl || '',
      inviteUrl: statusData.inviteUrl || '',
      loginUrl: `${getApiBase()}/api/auth/discord/login`
    }
  } else {
    if (statusData.connectUrl) cachedConfig.connectUrl = statusData.connectUrl
    if (statusData.inviteUrl) cachedConfig.inviteUrl = statusData.inviteUrl
  }
}

/**
 * Ouvre le lien d'invitation officiel Discord configuré sur le serveur
 */
export async function openDiscordInvite() {
  const config = await fetchDiscordConfig()
  const targetUrl = config.inviteUrl || `${getApiBase()}/api/auth/discord/login`

  if (!config.inviteUrl) {
    const confirmed = await Dialog.show(
      "Rejoindre le Discord Modey\n\nLe lien d'invitation direct n'a pas encore été renseigné dans la console d'administration.\n\nSouhaitez-vous vous connecter à Modey avec Discord pour synchroniser vos accès ?",
      [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Continuer', type: 'ok' }
      ]
    )
    if (!confirmed) return
  }

  window.open(targetUrl, '_blank')
}

/**
 * Ouvre le flux de liaison / connexion de compte Discord
 */
export async function openDiscordConnect(token?: string) {
  const apiBase = getApiBase()
  const loginUrl = token
    ? `${apiBase}/api/auth/discord/login?token=${encodeURIComponent(token)}`
    : `${apiBase}/api/auth/discord/login`

  window.open(loginUrl, '_blank')
}
