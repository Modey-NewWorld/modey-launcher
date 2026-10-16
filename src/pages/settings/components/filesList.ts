import { files, profiles } from '../../../ipc'
import { Dialog } from '../../../components/dialog'
import logger from 'electron-log/renderer'

const el = (id: string) => document.getElementById(id)

let profileNames: Record<string, string> = {}

function escapeHtml(value: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, (c) => map[c]!)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  let value = bytes / 1024
  const units = ['Ko', 'Mo', 'Go', 'To']
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`
}

/** Liste des instances de jeu (un dossier par serveur) avec taille + actions. */
export async function refreshFilesList() {
  const listEl = el('files-list')
  if (!listEl) return
  listEl.innerHTML = '<p class="muted">Chargement…</p>'
  try {
    const [instances, profileList] = await Promise.all([files.listInstances(), profiles.get().catch(() => null)])

    profileNames = {}
    if (Array.isArray(profileList)) {
      for (const p of profileList) {
        if (p?.slug) profileNames[p.slug] = p.name || p.slug
      }
    }

    if (!instances.length) {
      listEl.innerHTML = '<p class="muted">Aucun fichier téléchargé pour le moment. Les fichiers apparaîtront ici après un lancement.</p>'
      return
    }

    listEl.innerHTML = ''
    for (const inst of instances) {
      const name = profileNames[inst.slug] ?? inst.slug
      const row = document.createElement('div')
      row.className = 'files-row'
      row.innerHTML = `
        <div class="files-row-info">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(inst.slug)} · ${formatSize(inst.size)}</span>
        </div>
        <div class="files-row-actions">
          <button type="button" class="settings-btn settings-btn--small" data-act="open"><i class="fa-solid fa-folder-open"></i>&nbsp;Ouvrir</button>
          <button type="button" class="settings-btn settings-btn--danger settings-btn--small" data-act="del"><i class="fa-solid fa-trash"></i>&nbsp;Supprimer</button>
        </div>`

      row.querySelector('[data-act="open"]')?.addEventListener('click', async () => {
        const res = await files.openInstance(inst.slug)
        if (!res.success) await Dialog.show(res.error ?? 'Impossible d’ouvrir le dossier.', [{ text: 'OK', type: 'ok' }], 'Fichiers du jeu')
      })

      row.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
        const confirmed = await Dialog.show(
          `Supprimer tous les fichiers de « ${name} » ?\n(${formatSize(inst.size)} — tout sera retéléchargé au prochain lancement.)`,
          [
            { text: 'Annuler', type: 'cancel' },
            { text: 'Supprimer', type: 'danger' }
          ],
          'Supprimer les fichiers du jeu'
        )
        if (!confirmed) return
        const res = await files.deleteInstance(inst.slug)
        if (!res.success) await Dialog.show(res.error ?? 'Impossible de supprimer ces fichiers.', [{ text: 'OK', type: 'ok' }], 'Fichiers du jeu')
        await refreshFilesList()
      })

      listEl.appendChild(row)
    }
  } catch (err) {
    logger.error('files.listInstances failed:', err)
    listEl.innerHTML = '<p class="muted">Impossible de charger la liste des fichiers.</p>'
  }
}
