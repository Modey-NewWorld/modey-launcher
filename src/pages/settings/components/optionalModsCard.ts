import { optionalMods } from '../../../ipc'
import type { IOptionalModItem } from '../../../../electron/handlers/optionalMods'
import { Dialog } from '../../../components/dialog'
import logger from 'electron-log/renderer'

const el = (id: string) => document.getElementById(id)

let currentSlug = ''
let isLoading = false

export function initOptionalModsCard() {
  const refreshBtn = el('btn-refresh-optional-mods')
  refreshBtn?.addEventListener('click', () => {
    if (currentSlug && currentSlug !== 'global') {
      refreshOptionalMods(currentSlug)
    }
  })
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'Ko', 'Mo', 'Go']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function cleanModDisplayName(rawName: string): string {
  return rawName
    .replace(/\.jar$/i, '')
    .replace(/[-_]neoforge[-_].*$/i, '')
    .replace(/[-_]fabric[-_].*$/i, '')
    .replace(/[-_]mc\d+.*$/i, '')
    .replace(/[-_]\d+\.\d+.*$/i, '')
    .replace(/[-_]/g, ' ')
    .trim()
}

export async function refreshOptionalMods(slug: string) {
  currentSlug = slug
  const container = el('optional-mods-list-container')
  const badge = el('optional-mods-badge')
  if (!container || slug === 'global') return

  if (isLoading) return
  isLoading = true

  container.innerHTML = `
    <div class="optional-mods-placeholder" style="grid-column:1 / -1; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; padding:18px; text-align:center; color:#64748b; font-size:13px;">
      <i class="ph ph-spinner spin" style="font-size:22px; color:#8b5cf6; margin-bottom:8px; display:inline-block;"></i>
      <div>Recherche des mods facultatifs pour ${slug}...</div>
    </div>
  `

  try {
    const list: IOptionalModItem[] = await optionalMods.list(slug)
    isLoading = false

    if (badge) {
      badge.innerText = `${list.length} disponible(s)`
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="optional-mods-placeholder" style="grid-column:1 / -1; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; padding:18px; text-align:center; color:#64748b; font-size:13px;">
          <i class="ph ph-package" style="font-size:24px; color:#94a3b8; margin-bottom:8px; display:inline-block;"></i>
          <div style="font-weight:600; color:#334155; margin-bottom:4px;">Aucun mod optionnel disponible pour ce serveur</div>
          <div>Tous les mods essentiels sont déjà installés et synchronisés d'office avec le serveur.</div>
        </div>
      `
      return
    }

    container.innerHTML = ''

    for (const mod of list) {
      const card = document.createElement('div')
      card.className = `optional-mod-card ${mod.isEnabled ? 'is-active' : ''}`
      card.id = `opt-mod-card-${mod.id}`

      const displayName = cleanModDisplayName(mod.name)
      const sizeStr = formatBytes(mod.size)

      let actionHtml = ''
      if (!mod.isInstalled) {
        actionHtml = `
          <button type="button" class="opt-btn opt-btn--install" id="btn-install-${mod.id}">
            <i class="ph ph-download-simple"></i> Télécharger
          </button>
        `
      } else {
        const toggleClass = mod.isEnabled ? 'opt-btn--toggle-on' : 'opt-btn--toggle-off'
        const toggleIcon = mod.isEnabled ? 'ph-toggle-right' : 'ph-toggle-left'
        const toggleText = mod.isEnabled ? 'Activé' : 'Désactivé'

        actionHtml = `
          <button type="button" class="opt-btn ${toggleClass}" id="btn-toggle-${mod.id}" title="${mod.isEnabled ? 'Désactiver ce mod' : 'Activer ce mod'}">
            <i class="ph ${toggleIcon}"></i> <span>${toggleText}</span>
          </button>
          <button type="button" class="opt-btn opt-btn--delete" id="btn-del-${mod.id}" title="Désinstaller complètement ce mod">
            <i class="ph ph-trash"></i>
          </button>
        `
      }

      card.innerHTML = `
        <div class="optional-mod-head">
          <div class="optional-mod-info">
            <div class="optional-mod-name">${displayName}</div>
            <div class="optional-mod-meta">
              <span><i class="ph ph-file-zip"></i> ${mod.name}</span>
              <span>•</span>
              <span>${sizeStr}</span>
            </div>
          </div>
          <span class="slot-count-tag" style="background:${mod.isEnabled ? '#dcfce7' : '#f1f5f9'}; color:${mod.isEnabled ? '#15803d' : '#64748b'};">
            ${mod.isEnabled ? 'En jeu' : mod.isInstalled ? 'Prêt' : 'En ligne'}
          </span>
        </div>
        <div class="optional-mod-actions">
          <span style="font-size:11.5px; color:#64748b;">
            ${mod.isEnabled ? '<i class="ph ph-check-circle" style="color:#10b981;"></i> Actif au lancement' : (mod.isInstalled ? '<i class="ph ph-pause" style="color:#f59e0b;"></i> En pause' : '<i class="ph ph-cloud" style="color:#8b5cf6;"></i> Non téléchargé')}
          </span>
          <div style="display:flex; align-items:center; gap:6px;">
            ${actionHtml}
          </div>
        </div>
      `

      container.appendChild(card)

      // Brancher les interactions
      const installBtn = card.querySelector(`#btn-install-${mod.id}`)
      installBtn?.addEventListener('click', async () => {
        installBtn.innerHTML = '<i class="ph ph-spinner spin"></i> Installation...'
        installBtn.setAttribute('disabled', 'true')
        try {
          const res = await optionalMods.install(slug, mod.id)
          if (!res.success) {
            await Dialog.show(res.error || "Impossible d'installer le mod.", [{ text: 'OK', type: 'ok' }])
          }
        } catch (err) {
          logger.error('Install error:', err)
        }
        await refreshOptionalMods(slug)
      })

      const toggleBtn = card.querySelector(`#btn-toggle-${mod.id}`)
      toggleBtn?.addEventListener('click', async () => {
        const nextState = !mod.isEnabled
        toggleBtn.innerHTML = '<i class="ph ph-spinner spin"></i>'
        try {
          const res = await optionalMods.toggle(slug, mod.id, nextState)
          if (!res.success) {
            await Dialog.show(res.error || "Impossible d'activer/désactiver le mod.", [{ text: 'OK', type: 'ok' }])
          }
        } catch (err) {
          logger.error('Toggle error:', err)
        }
        await refreshOptionalMods(slug)
      })

      const delBtn = card.querySelector(`#btn-del-${mod.id}`)
      delBtn?.addEventListener('click', async () => {
        const confirm = await Dialog.show(
          `Voulez-vous vraiment désinstaller le mod optionnel "${displayName}" ?\nIl sera supprimé du dossier de jeu.`,
          [
            { text: 'Annuler', type: 'cancel' },
            { text: 'Désinstaller', type: 'ok' }
          ]
        )
        if (confirm) {
          delBtn.innerHTML = '<i class="ph ph-spinner spin"></i>'
          try {
            const res = await optionalMods.uninstall(slug, mod.id)
            if (!res.success) {
              await Dialog.show(res.error || 'Impossible de désinstaller le mod.', [{ text: 'OK', type: 'ok' }])
            }
          } catch (err) {
            logger.error('Delete error:', err)
          }
          await refreshOptionalMods(slug)
        }
      })
    }
  } catch (err) {
    isLoading = false
    logger.error('Failed to load optional mods:', err)
    container.innerHTML = `
      <div class="optional-mods-placeholder" style="grid-column:1 / -1; background:#fef2f2; border:1px dashed #fca5a5; border-radius:10px; padding:18px; text-align:center; color:#991b1b; font-size:13px;">
        <i class="ph ph-warning-circle" style="font-size:22px; color:#ef4444; margin-bottom:8px; display:inline-block;"></i>
        <div>Impossible de charger les mods facultatifs. Vérifiez votre connexion.</div>
      </div>
    `
  }
}
