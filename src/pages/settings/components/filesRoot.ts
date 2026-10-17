import { files } from '../../../ipc'
import { Dialog } from '../../../components/dialog'
import { refreshFilesList } from './filesList'
import logger from 'electron-log/renderer'

const el = (id: string) => document.getElementById(id)

let busy = false

function setStatus(text: string) {
  const statusEl = el('files-status')
  if (!statusEl) return
  statusEl.innerText = text
  statusEl.classList.toggle('hidden', !text)
}

async function showError(message: string) {
  await Dialog.show(message, [{ text: 'OK', type: 'ok' }], 'Fichiers du jeu')
}

async function refreshInfo() {
  try {
    const info = await files.info()
    const pathEl = el('files-root-path')
    if (pathEl) {
      pathEl.innerText = info.exists ? info.currentPath : `${info.currentPath} — dossier introuvable`
      pathEl.classList.toggle('path-box--error', !info.exists)
    }
    el('files-reset-root')?.classList.toggle('hidden', !info.relocated)
  } catch (err) {
    logger.error('files.info failed:', err)
  }
}

async function applyRoot(dir: string, moveExisting: boolean) {
  busy = true
  setStatus(moveExisting ? 'Déplacement en cours… ne fermez pas le launcher.' : 'Suppression des anciens fichiers… ne fermez pas le launcher.')
  const changeBtn = el('files-change-root') as HTMLButtonElement | null
  const resetBtn = el('files-reset-root') as HTMLButtonElement | null
  if (changeBtn) changeBtn.disabled = true
  if (resetBtn) resetBtn.disabled = true
  try {
    const res = await files.setRoot(dir, moveExisting)
    if (!res.success) await showError(res.error ?? 'Impossible de changer l’emplacement.')
    else await refreshFilesList()
  } catch (err) {
    logger.error('files.setRoot failed:', err)
    await showError('Une erreur inattendue est survenue.')
  } finally {
    busy = false
    if (changeBtn) changeBtn.disabled = false
    if (resetBtn) resetBtn.disabled = false
    setStatus('')
    await refreshInfo()
  }
}

async function onChangeRoot() {
  if (busy) return
  const dir = await files.pickDir()
  if (!dir) return

  const choice = await Dialog.show<'move' | 'fresh' | false>(
    `Nouvel emplacement :\n${dir}\n\n« Déplacer » conserve vos fichiers téléchargés. « Tout recommencer » supprime les fichiers actuels (tout sera retéléchargé au prochain lancement).`,
    [
      { text: 'Annuler', type: 'cancel' },
      { text: 'Tout recommencer', type: 'danger', action: () => 'fresh' as const },
      { text: 'Déplacer', type: 'ok', action: () => 'move' as const }
    ],
    'Changer l’emplacement des fichiers'
  )
  if (!choice) return
  await applyRoot(dir, choice === 'move')
}

async function onResetRoot() {
  if (busy) return
  const confirmed = await Dialog.show(
    'Déplacer les fichiers du jeu vers l’emplacement par défaut (%APPDATA%) ?',
    [
      { text: 'Annuler', type: 'cancel' },
      { text: 'Rétablir', type: 'ok' }
    ],
    'Rétablir l’emplacement par défaut'
  )
  if (!confirmed) return
  busy = true
  setStatus('Remise en place des fichiers… ne fermez pas le launcher.')
  try {
    const res = await files.resetRoot()
    if (!res.success) await showError(res.error ?? 'Impossible de rétablir l’emplacement.')
    else await refreshFilesList()
  } finally {
    busy = false
    setStatus('')
    await refreshInfo()
  }
}

/** Branchement des boutons de la carte « Emplacement des fichiers ». */
export function initFilesRoot() {
  refreshInfo()
  el('files-open-root')?.addEventListener('click', async () => {
    const res = await files.openRoot()
    if (!res.success) await showError(res.error ?? 'Impossible d’ouvrir le dossier.')
  })
  el('files-change-root')?.addEventListener('click', onChangeRoot)
  el('files-reset-root')?.addEventListener('click', onResetRoot)
}

/** Rafraîchit chemin + liste à l'ouverture de la page Paramètres. */
export async function refreshFilesCard() {
  if (busy) return
  await refreshInfo()
  await refreshFilesList()
}
