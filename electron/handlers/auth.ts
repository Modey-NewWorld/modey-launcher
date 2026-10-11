import { ipcMain, app } from 'electron'
import { MicrosoftAuth } from 'eml-lib'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { AUTH_SERVER_URL, AUTH_API_URL } from '../const'

const sessionPath = path.join(app.getPath('userData'), 'session.json')
const accountsPath = path.join(app.getPath('userData'), 'accounts.json')

export type IAuthResponse = { success: true; account: Account } | { success: false; error: string }

export interface IStoredAccount {
  name: string
  uuid: string
  email?: string
  lastUsed: number
}

function loadSavedAccounts(): IStoredAccount[] {
  try {
    if (fs.existsSync(accountsPath)) {
      const data = fs.readFileSync(accountsPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    logger.warn('Failed to read accounts.json:', err)
  }
  return []
}

function saveAccount(name: string, uuid: string, email?: string) {
  try {
    const list = loadSavedAccounts().filter((acc) => acc.name.toLowerCase() !== name.toLowerCase())
    list.unshift({
      name,
      uuid,
      email,
      lastUsed: Date.now()
    })
    fs.writeFileSync(accountsPath, JSON.stringify(list, null, 2))
  } catch (err) {
    logger.warn('Failed to save to accounts.json:', err)
  }
}

export function registerAuthHandlers(mainWindow: Electron.BrowserWindow) {
  const msAuth = new MicrosoftAuth(mainWindow)

  // Connexion personnalisée (Modey / Pseudo / Email + Mot de passe)
  ipcMain.handle('auth:login-custom', async (_event, identifier: string, password?: string) => {
    try {
      if (!identifier || identifier.trim().length < 3) {
        return { success: false, error: 'Identifiant invalide (minimum 3 caractères).' } as IAuthResponse
      }

      const cleanIdent = identifier.trim()

      if (!password || password.trim().length === 0) {
        return { success: false, error: 'Le mot de passe de votre compte Modey est obligatoire pour vous identifier.' } as IAuthResponse
      }

      // Vérification sécurisée auprès du serveur d'authentification Modey
      try {
        const resp = await fetch(`${AUTH_API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: cleanIdent, password })
        })

        const data = await resp.json()
        if (!resp.ok || !data.success) {
          return { success: false, error: data.error || 'Identifiant ou mot de passe incorrect.' } as IAuthResponse
        }

        const account: Account = {
          name: data.selectedProfile.name,
          uuid: data.selectedProfile.id,
          clientToken: data.clientToken,
          accessToken: data.accessToken,
          meta: {
            online: true,
            type: 'yggdrasil',
            url: AUTH_SERVER_URL
          }
        }
        ;(account as any).email = data.user?.email

        fs.writeFileSync(sessionPath, JSON.stringify(account))
        saveAccount(account.name, account.uuid, data.user?.email)

        logger.info(`Connexion sécurisée validée pour le citoyen : ${account.name}`)
        return { success: true, account } as IAuthResponse
      } catch (apiErr) {
        logger.error('Serveur Modey Auth injoignable :', apiErr)
        return {
          success: false,
          error: `Impossible de joindre le serveur d'authentification Modey (${AUTH_API_URL}). Veuillez vérifier que le serveur est allumé.`
        } as IAuthResponse
      }
    } catch (err: any) {
      logger.error('Failed custom login:', err)
      return { success: false, error: err.message ?? 'Erreur lors de la connexion' } as IAuthResponse
    }
  })

  // Inscription personnalisée (Création d'un nouveau compte citoyen)
  ipcMain.handle('auth:register-custom', async (_event, payload: { email: string; username: string; password: string }) => {
    try {
      const resp = await fetch(`${AUTH_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await resp.json()
      if (!resp.ok || !data.success) {
        return { success: false, error: data.error || 'Erreur lors de l\'inscription.' } as IAuthResponse
      }

      const account: Account = {
        name: data.selectedProfile.name,
        uuid: data.selectedProfile.id,
        clientToken: data.clientToken,
        accessToken: data.accessToken,
        meta: {
          online: true,
          type: 'yggdrasil',
          url: AUTH_SERVER_URL
        }
      }
      ;(account as any).email = data.user.email

      fs.writeFileSync(sessionPath, JSON.stringify(account))
      saveAccount(account.name, account.uuid, data.user.email)

      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed register:', err)
      return { success: false, error: 'Impossible de contacter le serveur d\'authentification Modey.' } as IAuthResponse
    }
  })

  // Liste des comptes locaux enregistrés
  ipcMain.handle('auth:list-accounts', async () => {
    return loadSavedAccounts()
  })

  // Suppression d'un compte local
  ipcMain.handle('auth:remove-account', async (_event, username: string) => {
    try {
      const list = loadSavedAccounts().filter((acc) => acc.name.toLowerCase() !== username.toLowerCase())
      fs.writeFileSync(accountsPath, JSON.stringify(list, null, 2))
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Connexion Microsoft (Optionnelle)
  ipcMain.handle('auth:login', async () => {
    try {
      const account = await msAuth.auth()
      fs.writeFileSync(sessionPath, JSON.stringify(account))
      saveAccount(account.name, account.uuid)
      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed to login via Microsoft:', err)
      return { success: false, error: err.message ?? 'Unknown error' }
    }
  })

  // Rafraîchissement / Restauration de session
  ipcMain.handle('auth:refresh', async () => {
    if (!fs.existsSync(sessionPath)) {
      return { success: false } as { success: false }
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8')
      const savedSession = JSON.parse(data) as Account

      if (savedSession && savedSession.uuid) {
        // Si c'est un compte Modey (Yggdrasil)
        if ((savedSession.meta as any)?.type === 'yggdrasil') {
          try {
            const valResp = await fetch(`${AUTH_API_URL}/api/auth/validate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken: savedSession.accessToken, clientToken: savedSession.clientToken })
            })
            const valData = await valResp.json()
            if (valResp.ok && valData.valid) {
              if (!(savedSession.meta as any)?.url) {
                (savedSession.meta as any).url = AUTH_SERVER_URL
              }
              return { success: true, account: savedSession } as IAuthResponse
            }
          } catch (e) {
            logger.warn('Impossible de valider la session auprès de Modey Auth:', e)
          }
          // Si la session est expirée ou invalide sur l'Auth-Server, forcer la reconnexion
          return { success: false, error: 'Session expirée. Veuillez vous reconnecter.' } as any
        }

        // Si c'est un ancien compte hors-ligne / crack, on ne le restaure pas automatiquement
        if ((savedSession.meta as any)?.type === 'crack') {
          return { success: false, error: 'Compte local non authentifié. Veuillez vous connecter avec votre compte citoyen Modey.' } as any
        }

        // Si c'est un compte Microsoft
        const valid = await msAuth.validate(savedSession)
        if (valid) {
          return { success: true, account: savedSession } as IAuthResponse
        }
        const account = await msAuth.refresh(savedSession)
        fs.writeFileSync(sessionPath, JSON.stringify(account))
        return { success: true, account } as IAuthResponse
      }
      return { success: false }
    } catch (err: any) {
      logger.error('Failed to refresh session:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath)
    }
    return { success: true }
  })
}
