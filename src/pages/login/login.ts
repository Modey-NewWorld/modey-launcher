import { setUser, setView } from '../../state'
import { auth, maintenance } from '../../ipc'
import { renderMaintenanceView } from '../../init'
import { Dialog } from '../../components/dialog'
import { loadSkinAssets } from '../../services/skin'
import { isOnlineState } from '../../services/connectivity'
import logger from 'electron-log/renderer'
import logoUrl from '../../static/images/logo.png'
import loginHtmlRaw from './index.html?raw'
import './login.scss'

const el = (id: string) => document.getElementById(id)

const ASSET_MAP: Record<string, string> = {
  '@STATIC_LOGO@': logoUrl
}

function hydrateAssets(html: string): string {
  return Object.entries(ASSET_MAP).reduce(
    (acc, [from, to]) => acc.split(from).join(to),
    html
  )
}

// Fragment HTML de la page de connexion injecté dans le shell avec le logo packagé par Vite.
const loginHtml = hydrateAssets(loginHtmlRaw)
const mount = el('view-login')
if (mount) mount.innerHTML = loginHtml

export async function initLogin() {
  const form = el('form-login-custom') as HTMLFormElement | null
  const inputUsername = el('input-username') as HTMLInputElement | null
  const inputEmail = el('input-email') as HTMLInputElement | null
  const inputPassword = el('input-password') as HTMLInputElement | null
  const groupEmail = el('group-email') as HTMLDivElement | null
  const labelUsername = el('label-username') as HTMLLabelElement | null
  const usernameHint = el('username-hint') as HTMLElement | null
  const btnSubmit = el('btn-login-custom') as HTMLButtonElement | null
  const btnSubmitText = el('btn-submit-text') as HTMLElement | null

  const form2FA = el('form-login-2fa') as HTMLFormElement | null
  const input2FACode = el('input-2fa-code') as HTMLInputElement | null
  const btnSubmit2FA = el('btn-submit-2fa') as HTMLButtonElement | null
  const btnSubmit2FAText = el('btn-submit-2fa-text') as HTMLElement | null
  const btnCancel2FA = el('btn-cancel-2fa') as HTMLButtonElement | null

  const tabLogin = el('tab-auth-login') as HTMLButtonElement | null
  const tabRegister = el('tab-auth-register') as HTMLButtonElement | null

  let mode: 'login' | 'register' = 'login'
  let active2FATempToken: string | null = null

  async function finalizeSession(session: any) {
    const mn = await maintenance.get()
    const account = session.account
    const userRole = ((account as any)?.role || 'citizen').toLowerCase()
    const canBypass = Boolean(
      (account as any)?.canBypassMaintenance ||
      userRole === 'founder' ||
      userRole === 'super_admin' ||
      userRole === 'admin'
    )

    if (mn && canBypass) {
      renderMaintenanceView(mn, session)
      return
    }

    const { skins, capes, avatar } = await loadSkinAssets(session.account)
    setUser(session.account, { skins, capes, avatar })
    setView('home')
  }

  function switchMode(newMode: 'login' | 'register') {
    mode = newMode
    if (mode === 'login') {
      tabLogin?.classList.add('active')
      tabRegister?.classList.remove('active')
      if (groupEmail) groupEmail.style.display = 'none'
      if (labelUsername) labelUsername.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg> Pseudo ou Email'
      if (inputUsername) inputUsername.placeholder = 'Votre pseudo ou email'
      if (usernameHint) usernameHint.innerText = 'Votre identifiant de joueur'
      if (btnSubmitText) btnSubmitText.innerText = 'Se connecter à Modey'
    } else {
      tabRegister?.classList.add('active')
      tabLogin?.classList.remove('active')
      if (groupEmail) groupEmail.style.display = 'flex'
      if (labelUsername) labelUsername.innerHTML = '<svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg> Nom de joueur (Pseudo unique)'
      if (inputUsername) inputUsername.placeholder = 'Ex: Alex_75, JeanMartin'
      if (usernameHint) usernameHint.innerText = '3 à 16 caractères (unique pour chaque joueur)'
      if (btnSubmitText) btnSubmitText.innerText = 'Créer mon compte joueur'
    }
  }

  tabLogin?.addEventListener('click', () => switchMode('login'))
  tabRegister?.addEventListener('click', () => switchMode('register'))

  // Soumission identifiants principaux
  if (form && inputUsername && inputPassword && btnSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()

      if (!navigator.onLine || !isOnlineState()) {
        await Dialog.show(
          "Vous n'êtes actuellement pas connecté à Internet.\n\nUne connexion réseau active est requise pour vous connecter à votre compte Modey.",
          [{ text: 'Compris', type: 'ok' }],
          'Connexion Réseau Interrompue'
        )
        return
      }

      const username = inputUsername.value.trim()
      const password = inputPassword.value
      const email = inputEmail ? inputEmail.value.trim() : ''

      if (mode === 'register') {
        if (!email) {
          await Dialog.show('Veuillez renseigner votre adresse email.', [{ text: 'OK', type: 'ok' }])
          return
        }
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
          await Dialog.show('Le pseudo doit comporter entre 3 et 16 caractères (lettres, chiffres, underscore uniquement).', [{ text: 'Compris', type: 'ok' }])
          return
        }
      }

      if (password.length < 6) {
        await Dialog.show('Le mot de passe doit comporter au moins 6 caractères.', [{ text: 'OK', type: 'ok' }])
        return
      }

      const originalHtml = btnSubmit.innerHTML
      btnSubmit.disabled = true
      btnSubmit.innerHTML = `<svg class="solar-icon spin" aria-hidden="true"><use href="#modey-spinner"></use></svg> ${mode === 'register' ? 'Création du compte...' : 'Connexion à la cité...'}`

      try {
        let session
        if (mode === 'register') {
          session = await auth.registerCustom({ email, username, password })
        } else {
          session = await auth.loginCustom(username, password)
        }

        // Si double authentification (2FA) requise
        if ((session as any).requires2FA) {
          active2FATempToken = (session as any).tempToken
          form.style.display = 'none'
          const tabs = el('view-login')?.querySelector('.auth-tabs') as HTMLElement | null
          if (tabs) tabs.style.display = 'none'
          if (form2FA) {
            form2FA.style.display = 'flex'
            if (input2FACode) {
              input2FACode.value = ''
              setTimeout(() => input2FACode.focus(), 100)
            }
          }
          return
        }

        if (session.success) {
          await finalizeSession(session)
        } else {
          logger.error(session.error)
          await Dialog.show(session.error || "Erreur d'authentification", [{ text: 'OK', type: 'ok' }])
        }
      } catch (err: any) {
        logger.error(err)
        await Dialog.show('Une erreur inattendue est survenue.', [{ text: 'OK', type: 'ok' }])
      } finally {
        btnSubmit.disabled = false
        btnSubmit.innerHTML = originalHtml
      }
    })
  }

  // Soumission 2FA
  if (form2FA && input2FACode && btnSubmit2FA) {
    form2FA.addEventListener('submit', async (e) => {
      e.preventDefault()

      const code = input2FACode.value.trim()
      if (!code || !active2FATempToken) {
        await Dialog.show('Veuillez saisir votre code de sécurité à 6 chiffres.', [{ text: 'OK', type: 'ok' }])
        return
      }

      const originalText = btnSubmit2FAText?.innerText || 'Valider le code de sécurité'
      btnSubmit2FA.disabled = true
      if (btnSubmit2FAText) btnSubmit2FAText.innerText = 'Vérification...'

      try {
        const res = await auth.login2FA(active2FATempToken, code)
        if (res.success) {
          await finalizeSession(res)
        } else {
          await Dialog.show(res.error || 'Code Google Authenticator incorrect.', [{ text: 'Réessayer', type: 'ok' }])
        }
      } catch (err: any) {
        logger.error(err)
        await Dialog.show('Une erreur inattendue est survenue lors de la validation 2FA.', [{ text: 'OK', type: 'ok' }])
      } finally {
        btnSubmit2FA.disabled = false
        if (btnSubmit2FAText) btnSubmit2FAText.innerText = originalText
      }
    })
  }

  // Annulation 2FA / Retour
  btnCancel2FA?.addEventListener('click', () => {
    active2FATempToken = null
    if (form2FA) form2FA.style.display = 'none'
    if (form) form.style.display = 'flex'
    const tabs = el('view-login')?.querySelector('.auth-tabs') as HTMLElement | null
    if (tabs) tabs.style.display = 'flex'
  })
}
