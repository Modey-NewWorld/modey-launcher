import { auth } from '../ipc'
import { logout as clearSession, setView } from '../state'
import { Dialog } from '../components/dialog'

/** Déconnexion confirmée : rappel de la règle du compte unique, déconnexion serveur & locale, retour au login. */
export async function confirmLogout(): Promise<void> {
  const confirmed = await Dialog.show(
    "Il n'est pas autorisé par les règles du serveur d'avoir plusieurs comptes.\n\nÊtes-vous sûr de vouloir vous déconnecter de votre compte Modey ?", 
    [
      { text: 'Annuler', type: 'cancel' },
      { text: 'Se déconnecter', type: 'danger' }
    ]
  )
  if (!confirmed) return
  await auth.logout()
  clearSession()
  setView('login')
}
