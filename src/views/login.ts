import { setUser, setView } from '../state'
import { auth, skin } from '../ipc'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'

export async function initLogin() {
  const form = document.getElementById('form-login-custom') as HTMLFormElement | null
  const inputUsername = document.getElementById('input-username') as HTMLInputElement | null
  const inputEmail = document.getElementById('input-email') as HTMLInputElement | null
  const inputPassword = document.getElementById('input-password') as HTMLInputElement | null
  const groupEmail = document.getElementById('group-email') as HTMLDivElement | null
  const labelUsername = document.getElementById('label-username') as HTMLLabelElement | null
  const usernameHint = document.getElementById('username-hint') as HTMLElement | null
  const btnSubmit = document.getElementById('btn-login-custom') as HTMLButtonElement | null
  const btnSubmitText = document.getElementById('btn-submit-text') as HTMLElement | null

  const tabLogin = document.getElementById('tab-auth-login') as HTMLButtonElement | null
  const tabRegister = document.getElementById('tab-auth-register') as HTMLButtonElement | null

  let mode: 'login' | 'register' = 'login'

  // Gestion des onglets Se connecter / Créer un compte
  function switchMode(newMode: 'login' | 'register') {
    mode = newMode
    if (mode === 'login') {
      tabLogin?.classList.add('active')
      tabRegister?.classList.remove('active')
      if (groupEmail) groupEmail.style.display = 'none'
      if (labelUsername) labelUsername.innerHTML = '<i class="fa-solid fa-user"></i> Pseudo ou Email'
      if (inputUsername) inputUsername.placeholder = 'Votre pseudo ou email'
      if (usernameHint) usernameHint.innerText = 'Votre identifiant de joueur'
      if (btnSubmitText) btnSubmitText.innerText = 'Se connecter à Athéna'
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

  // 1. Gestion de la soumission du formulaire (compte unique Modey : pseudo/email + mot de passe)
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
          await Dialog.show(
            'Le pseudo doit comporter entre 3 et 16 caractères (lettres, chiffres, underscore uniquement).',
            [{ text: 'Compris', type: 'ok' }]
          )
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
          let skins: any = []
          let capes: any = []
          let avatar: any = null

          try {
            const [__, s, c, a] = await Promise.all([
              skin.reload(session.account),
              skin.getSkin(),
              skin.getCape(),
              skin.getAvatar()
            ])
            skins = s
            capes = c
            avatar = a
          } catch (skinErr) {
            logger.warn('Erreur chargement skin :', skinErr)
          }

          setUser(session.account, { skins, capes, avatar })
          setView('home')
        } else {
          logger.error(session.error)
          await Dialog.show(session.error || 'Erreur d\'authentification', [{ text: 'OK', type: 'ok' }])
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
