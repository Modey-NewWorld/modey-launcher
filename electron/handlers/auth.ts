import { ipcMain, app } from 'electron'
import { MicrosoftAuth } from 'eml-lib'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { AUTH_SERVER_URL, AUTH_API_URL } from '../const'
import { IPC } from '../ipc-channels'

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
  ipcMain.handle(IPC.auth.loginCustom, async (_event, identifier: string, password?: string) => {
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
        ;(account as any).role = data.user?.role || 'citizen'
        ;(account as any).roleLabel = data.user?.roleLabel
        ;(account as any).roleColor = data.user?.roleColor
        ;(account as any).roleGradient = data.user?.roleGradient
        ;(account as any).roleShadow = data.user?.roleShadow
        ;(account as any).canBypassMaintenance = Boolean(data.user?.canBypassMaintenance)

        fs.writeFileSync(sessionPath, JSON.stringify(account))
        saveAccount(account.name, account.uuid, data.user?.email)

        logger.info(`Connexion sécurisée validée pour le joueur : ${account.name} (Rôle: ${(account as any).role})`)
        return { success: true, account } as IAuthResponse
      } catch (apiErr) {
        logger.error('Serveur Modey Auth injoignable :', apiErr)
        return {
          success: false,
          error: "Désolé, les serveurs d'authentification Modey sont actuellement indisponibles. Cela ne vient pas de vous, nous faisons le maximum pour réparer et rétablir le service au plus vite !"
        } as IAuthResponse
      }
    } catch (err: any) {
      logger.error('Failed custom login:', err)
      return { success: false, error: err.message ?? 'Erreur lors de la connexion' } as IAuthResponse
    }
  })

  // Inscription personnalisée (Création d'un nouveau compte joueur)
  ipcMain.handle(IPC.auth.registerCustom, async (_event, payload: { email: string; username: string; password: string }) => {
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
      ;(account as any).role = data.user?.role || 'citizen'
      ;(account as any).roleLabel = data.user?.roleLabel
      ;(account as any).roleColor = data.user?.roleColor
      ;(account as any).roleGradient = data.user?.roleGradient
      ;(account as any).roleShadow = data.user?.roleShadow
      ;(account as any).canBypassMaintenance = Boolean(data.user?.canBypassMaintenance)

      fs.writeFileSync(sessionPath, JSON.stringify(account))
      saveAccount(account.name, account.uuid, data.user.email)

      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed register:', err)
      return { success: false, error: 'Désolé, les serveurs d\'authentification Modey sont momentanément indisponibles. Cela ne vient pas de vous, réessayez dans quelques instants.' } as IAuthResponse
    }
  })

  // Liste des comptes locaux enregistrés
  ipcMain.handle(IPC.auth.listAccounts, async () => {
    return loadSavedAccounts()
  })

  // Suppression d'un compte local
  ipcMain.handle(IPC.auth.removeAccount, async (_event, username: string) => {
    try {
      const list = loadSavedAccounts().filter((acc) => acc.name.toLowerCase() !== username.toLowerCase())
      fs.writeFileSync(accountsPath, JSON.stringify(list, null, 2))
      if (fs.existsSync(sessionPath)) {
        try {
          const current = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'))
          if (current?.name?.toLowerCase() === username.toLowerCase()) {
            fs.unlinkSync(sessionPath)
          }
        } catch (_) {}
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Connexion Microsoft (Optionnelle)
  ipcMain.handle(IPC.auth.login, async () => {
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
  ipcMain.handle(IPC.auth.refresh, async () => {
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
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 4000)
            const valResp = await fetch(`${AUTH_API_URL}/api/auth/validate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken: savedSession.accessToken, clientToken: savedSession.clientToken }),
              signal: controller.signal
            })
            clearTimeout(timeoutId)
            const valData = await valResp.json()
            if (valResp.ok && valData.valid) {
              if (!(savedSession.meta as any)?.url) {
                (savedSession.meta as any).url = AUTH_SERVER_URL
              }
              if (valData.user?.role) {
                (savedSession as any).role = valData.user.role
                ;(savedSession as any).roleLabel = valData.user.roleLabel
                ;(savedSession as any).roleColor = valData.user.roleColor
                ;(savedSession as any).roleGradient = valData.user.roleGradient
                ;(savedSession as any).roleShadow = valData.user.roleShadow
                ;(savedSession as any).canBypassMaintenance = Boolean(valData.user.canBypassMaintenance)
              } else if (!(savedSession as any).role) {
                (savedSession as any).role = 'citizen'
              }
              fs.writeFileSync(sessionPath, JSON.stringify(savedSession))
              return { success: true, account: savedSession } as IAuthResponse
            }
            // Réponse explicite du serveur : la session est révoquée ou invalide
            return { success: false, error: 'Session expirée. Veuillez vous reconnecter.' } as any
          } catch (e: any) {
            logger.warn('Serveur Modey Auth injoignable ou erreur réseau lors du rafraîchissement :', e)
            // NE PAS DÉCONNECTER LE JOUEUR : Le serveur est éteint ou le joueur n'a pas Internet
            return {
              success: false,
              isServiceUnavailable: true,
              account: savedSession,
              error: 'Services Modey momentanément indisponibles'
            } as any
          }
        }

        // Si c'est un ancien compte hors-ligne / crack, on ne le restaure pas automatiquement
        if ((savedSession.meta as any)?.type === 'crack') {
          return { success: false, error: 'Compte local non authentifié. Veuillez vous connecter avec votre compte joueur Modey.' } as any
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

  ipcMain.handle(IPC.auth.logout, async () => {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath)
    }
    return { success: true }
  })
}
