import { setUser, setView } from '../../state'
import { auth } from '../../ipc'
import { Dialog } from '../../components/dialog'
import { loadSkinAssets } from '../../services/skin'
import logger from 'electron-log/renderer'
import loginHtml from './index.html?raw'
import './login.scss'

const el = (id: string) => document.getElementById(id)

// Fragment HTML de la page de connexion injecté dans le shell.
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

  const tabLogin = el('tab-auth-login') as HTMLButtonElement | null
  const tabRegister = el('tab-auth-register') as HTMLButtonElement | null

  let mode: 'login' | 'register' = 'login'

  function switchMode(newMode: 'login' | 'register') {
    mode = newMode
    if (mode === 'login') {
      tabLogin?.classList.add('active')
      tabRegister?.classList.remove('active')
      if (groupEmail) groupEmail.style.display = 'none'
      if (labelUsername) labelUsername.innerHTML = '<i class="fa-solid fa-user"></i> Pseudo ou Email'
      if (inputUsername) inputUsername.placeholder = 'Votre pseudo ou email'
      if (usernameHint) usernameHint.innerText = 'Votre identifiant de joueur'
      if (btnSubmitText) btnSubmitText.innerText = 'Se connecter à Modey'
    } else {
      tabRegister?.classList.add('active')
      tabLogin?.classList.remove('active')
      if (groupEmail) groupEmail.style.display = 'flex'
      if (labelUsername) labelUsername.innerHTML = '<i class="fa-solid fa-user"></i> Nom de joueur (Pseudo unique)'
      if (inputUsername) inputUsername.placeholder = 'Ex: Alex_75, JeanMartin'
      if (usernameHint) usernameHint.innerText = '3 à 16 caractères (unique pour chaque joueur)'
      if (btnSubmitText) btnSubmitText.innerText = 'Créer mon compte joueur'
    }
  }

  tabLogin?.addEventListener('click', () => switchMode('login'))
  tabRegister?.addEventListener('click', () => switchMode('register'))

  if (form && inputUsername && inputPassword && btnSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()

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
      btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${mode === 'register' ? 'Création du compte...' : 'Connexion à la cité...'}`

      try {
        let session
        if (mode === 'register') {
          session = await auth.registerCustom({ email, username, password })
        } else {
          session = await auth.loginCustom(username, password)
        }

        if (session.success) {
          const { skins, capes, avatar } = await loadSkinAssets(session.account)
          setUser(session.account, { skins, capes, avatar })
          setView('home')
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
}
