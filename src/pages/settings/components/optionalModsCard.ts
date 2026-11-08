import { optionalMods } from '../../../ipc'
import type { IOptionalModItem } from '../../../../electron/handlers/optionalMods'
import { Dialog } from '../../../components/dialog'
import { fetchModDetails, formatCategoryLabel, type IModDetails } from '../../../services/modrinth'
import { renderMarkdownToHtml } from '../../../components/newsModal'
import logger from 'electron-log/renderer'

const el = (id: string) => document.getElementById(id)

let currentSlug = ''
let isLoading = false
let requestSeq = 0
let cachedMods: IOptionalModItem[] = []
let selectedModId: string | null = null
let filterQuery = ''

export function initOptionalModsCard() {
  const refreshBtn = el('btn-refresh-optional-mods')
  refreshBtn?.addEventListener('click', () => {
    if (currentSlug && currentSlug !== 'global') {
      isLoading = false
      refreshOptionalMods(currentSlug)
    }
  })

  const searchInput = el('opt-mods-search-input') as HTMLInputElement | null
  searchInput?.addEventListener('input', () => {
    filterQuery = searchInput.value.trim().toLowerCase()
    renderSidebarList()
  })
}

function formatBytes(bytes: number): string {
  const num = Number(bytes)
  if (!num || isNaN(num) || num <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'Ko', 'Mo', 'Go']
  const i = Math.floor(Math.log(num) / Math.log(k))
  const idx = Math.min(sizes.length - 1, Math.max(0, i))
  return `${(num / Math.pow(k, idx)).toFixed(1)} ${sizes[idx]}`
}

function formatDownloads(count?: number): string {
  if (!count || count <= 0) return ''
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`
  return `${count}`
}

function cleanModDisplayName(rawName?: string): string {
  if (!rawName) return 'Mod Optionnel'
  return rawName
    .replace(/\.jar$/i, '')
    .replace(/[-_]neoforge[-_].*$/i, '')
    .replace(/[-_]fabric[-_].*$/i, '')
    .replace(/[-_]forge[-_].*$/i, '')
    .replace(/[-_]mc\d+.*$/i, '')
    .replace(/[-_]\d+\.\d+.*$/i, '')
    .replace(/[-_]/g, ' ')
    .trim()
}

export async function refreshOptionalMods(slug: string) {
  currentSlug = slug
  const thisSeq = ++requestSeq
  const container = el('optional-mods-list-container')
  const inspector = el('optional-mod-inspector')
  const badge = el('optional-mods-badge')
  if (!container || slug === 'global') return

  if (isLoading) return
  isLoading = true

  if (badge) {
    badge.innerText = 'Chargement...'
  }

  container.innerHTML = `
    <div class="optional-mods-placeholder" style="background:var(--bg-surface-alt); border:1px dashed var(--line-strong); border-radius:10px; padding:24px 16px; text-align:center; color:var(--ink-500); font-size:13px;">
      <svg class="solar-icon solar-bold spin" style="font-size:24px; color:var(--accent); margin-bottom:8px; display:inline-block;" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>
      <div>Recherche des mods facultatifs pour ${slug}...</div>
    </div>
  `

  try {
    const list: IOptionalModItem[] = await optionalMods.list(slug)
    if (thisSeq !== requestSeq) return // Stale request drop

    cachedMods = Array.isArray(list) ? list : []
    const activeCount = cachedMods.filter((m) => m.isEnabled).length
    if (badge) {
      badge.innerText = `${activeCount}/${cachedMods.length} actif(s)`
    }

    if (cachedMods.length === 0) {
      container.innerHTML = `
        <div class="optional-mods-placeholder" style="background:var(--bg-surface-alt); border:1px dashed var(--line-strong); border-radius:10px; padding:24px 16px; text-align:center; color:var(--ink-500); font-size:13px;">
          <svg class="solar-icon solar-bold" style="font-size:26px; color:var(--ink-400); margin-bottom:8px; display:inline-block;" aria-hidden="true"><use href="#solar-box-bold"></use></svg>
          <div style="font-weight:600; color:var(--ink-700); margin-bottom:4px;">Aucun mod optionnel</div>
          <div style="font-size:12px;">Tous les mods nécessaires sont déjà synchronisés avec le serveur.</div>
        </div>
      `
      if (inspector) {
        inspector.innerHTML = `
          <div class="opt-mods-inspector-empty">
            <svg class="solar-icon solar-bold" style="font-size:40px; color:var(--ink-400); margin-bottom:10px;" aria-hidden="true"><use href="#solar-box-bold"></use></svg>
            <div style="font-weight:600; color:var(--ink-700); margin-bottom:4px;">Aucun mod optionnel disponible</div>
            <div style="font-size:12px; color:var(--ink-500); max-width:300px; line-height:1.5;">Le profil ${slug} ne comporte pas de mods facultatifs à configurer pour le moment.</div>
          </div>
        `
      }
      return
    }

    // Sélection par défaut : conserver le mod actuellement actif ou sélectionner le premier
    if (!selectedModId || !cachedMods.some((m) => m.id === selectedModId)) {
      selectedModId = cachedMods[0].id
    }

    renderSidebarList()
    inspectSelectedMod()
  } catch (err) {
    if (thisSeq !== requestSeq) return
    logger.error('Failed to load optional mods:', err)
    if (badge) {
      badge.innerText = 'Indisponible'
    }
    container.innerHTML = `
      <div class="optional-mods-placeholder" style="background:#fef2f2; border:1px dashed #fca5a5; border-radius:10px; padding:18px; text-align:center; color:#991b1b; font-size:13px;">
        <svg class="solar-icon solar-bold" style="font-size:22px; color:#ef4444; margin-bottom:8px; display:inline-block;" aria-hidden="true"><use href="#solar-danger-bold"></use></svg>
        <div style="font-weight:600; margin-bottom:4px;">Impossible de charger les mods</div>
        <button type="button" class="opt-btn opt-btn--retry" style="display:inline-flex; align-items:center; gap:6px; margin-top:8px; padding:6px 14px; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg> Réessayer
        </button>
      </div>
    `
    const retryBtn = container.querySelector<HTMLButtonElement>('.opt-btn--retry')
    retryBtn?.addEventListener('click', () => {
      isLoading = false
      refreshOptionalMods(slug)
    })
  } finally {
    isLoading = false
  }
}

function renderSidebarList() {
  const container = el('optional-mods-list-container')
  if (!container) return

  const filtered = cachedMods.filter((mod) => {
    if (!filterQuery) return true
    const disp = cleanModDisplayName(mod.name).toLowerCase()
    const raw = mod.name.toLowerCase()
    return disp.includes(filterQuery) || raw.includes(filterQuery)
  })

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="optional-mods-placeholder" style="background:var(--bg-surface-alt); border:1px dashed var(--line-strong); border-radius:10px; padding:20px; text-align:center; color:var(--ink-500); font-size:12.5px;">
        <svg class="solar-icon solar-bold" style="font-size:20px; color:var(--ink-400); margin-bottom:6px;" aria-hidden="true"><use href="#solar-magnifier-linear"></use></svg>
        <div>Aucun mod ne correspond à "${filterQuery}"</div>
      </div>
    `
    return
  }

  container.innerHTML = ''

  for (const mod of filtered) {
    const card = document.createElement('div')
    const isSelected = mod.id === selectedModId
    card.className = `opt-mod-card ${isSelected ? 'is-selected' : ''} ${mod.isEnabled ? 'is-enabled' : ''}`
    card.dataset.modId = mod.id

    const displayName = cleanModDisplayName(mod.name)
    const sizeStr = formatBytes(mod.size)

    let statusPill = ''
    if (!mod.isInstalled) {
      statusPill = '<span class="opt-status-pill opt-status-pill--not-installed">Dispo</span>'
    } else if (mod.isEnabled) {
      statusPill = '<span class="opt-status-pill opt-status-pill--enabled">Actif</span>'
    } else {
      statusPill = '<span class="opt-status-pill opt-status-pill--disabled">En pause</span>'
    }

    let actionBtnHtml = ''
    if (!mod.isInstalled) {
      actionBtnHtml = `
        <button type="button" class="opt-icon-btn opt-icon-btn--download" title="Télécharger">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-download-bold"></use></svg>
        </button>
      `
    } else {
      const toggleIcon = mod.isEnabled ? '#solar-check-bold' : '#solar-power-bold'
      const toggleClass = mod.isEnabled ? 'is-on' : 'is-off'
      actionBtnHtml = `
        <button type="button" class="opt-toggle-switch ${toggleClass}" title="${mod.isEnabled ? 'Désactiver' : 'Activer'}">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="${toggleIcon}"></use></svg>
        </button>
      `
    }

    card.innerHTML = `
      <div class="opt-mod-card-icon-wrap" id="opt-mod-icon-${mod.id}">
        <svg class="solar-icon solar-bold opt-mod-fallback-icon" aria-hidden="true"><use href="#solar-box-bold"></use></svg>
      </div>
      <div class="opt-mod-card-info">
        <div class="opt-mod-card-title">${displayName}</div>
        <div class="opt-mod-card-meta">
          ${statusPill}
          <span class="opt-mod-card-size">${sizeStr}</span>
        </div>
      </div>
      <div class="opt-mod-card-action">
        ${actionBtnHtml}
      </div>
    `

    // Clic pour sélectionner et afficher l'inspecteur
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      if (target.closest('.opt-mod-card-action')) return
      selectedModId = mod.id
      renderSidebarList()
      inspectSelectedMod()
    })

    // Action rapide Téléchargement
    const dlBtn = card.querySelector<HTMLButtonElement>('.opt-icon-btn--download')
    dlBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      dlBtn.disabled = true
      dlBtn.innerHTML = '<svg class="solar-icon solar-bold spin" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>'
      try {
        const res = await optionalMods.install(currentSlug, mod.id)
        if (!res.success) {
          await Dialog.show(res.error || "Impossible d'installer le mod.", [{ text: 'OK', type: 'ok' }])
        }
      } catch (err) {
        logger.error('Install error:', err)
      }
      await refreshOptionalMods(currentSlug)
    })

    // Action rapide Toggle
    const toggleBtn = card.querySelector<HTMLButtonElement>('.opt-toggle-switch')
    toggleBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      toggleBtn.disabled = true
      toggleBtn.innerHTML = '<svg class="solar-icon solar-bold spin" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>'
      try {
        const res = await optionalMods.toggle(currentSlug, mod.id, !mod.isEnabled)
        if (!res.success) {
          await Dialog.show(res.error || "Impossible d'activer/désactiver le mod.", [{ text: 'OK', type: 'ok' }])
        }
      } catch (err) {
        logger.error('Toggle error:', err)
      }
      await refreshOptionalMods(currentSlug)
    })

    container.appendChild(card)

    // Chargement asynchrone de l'icône Modrinth
    fetchModDetails(mod.name, mod.sha1).then((details) => {
      if (details?.iconUrl) {
        const iconWrap = document.getElementById(`opt-mod-icon-${mod.id}`)
        if (iconWrap) {
          iconWrap.innerHTML = `<img src="${details.iconUrl}" alt="" class="opt-mod-icon-img" loading="lazy" />`
        }
      }
    })
  }
}

async function inspectSelectedMod() {
  const inspector = el('optional-mod-inspector')
  if (!inspector) return

  const mod = cachedMods.find((m) => m.id === selectedModId)
  if (!mod) {
    inspector.innerHTML = `
      <div class="opt-mods-inspector-empty">
        <svg class="solar-icon solar-bold" style="font-size:36px; color:var(--ink-400); margin-bottom:8px;" aria-hidden="true"><use href="#solar-box-bold"></use></svg>
        <div style="font-weight:600; color:var(--ink-700); margin-bottom:4px;">Sélectionnez un mod</div>
        <div style="font-size:12px; color:var(--ink-500); max-width:320px; line-height:1.5;">Choisissez un mod dans la liste pour découvrir sa présentation, ses captures d'écran, GIFs et spécifications techniques.</div>
      </div>
    `
    return
  }

  const cleanName = cleanModDisplayName(mod.name)
  const sizeStr = formatBytes(mod.size)

  // Affiche un état d'attente fluide dans l'inspecteur
  inspector.innerHTML = `
    <div class="opt-inspector-content">
      <div class="opt-inspector-header">
        <div class="opt-inspector-hero">
          <div class="opt-inspector-icon-wrap" id="inspector-icon-slot">
            <svg class="solar-icon solar-bold" style="font-size:32px; color:var(--accent);" aria-hidden="true"><use href="#solar-box-bold"></use></svg>
          </div>
          <div class="opt-inspector-main-info">
            <h2 class="opt-inspector-title" id="inspector-mod-title">${cleanName}</h2>
            <div class="opt-inspector-meta-row" id="inspector-mod-meta">
              <span class="opt-inspector-filename"><svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-file-zip-bold"></use></svg> ${mod.name}</span>
              <span>•</span>
              <span>${sizeStr}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="opt-inspector-body">
        <div class="opt-inspector-loading-strip">
          <svg class="solar-icon solar-bold spin" style="font-size:18px; color:var(--accent);" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>
          <span>Chargement de la fiche détaillée depuis Modrinth...</span>
        </div>
      </div>
    </div>
  `

  const details = await fetchModDetails(mod.name, mod.sha1)

  // Si l'utilisateur a changé de mod pendant le fetch, abandonner
  if (selectedModId !== mod.id) return

  renderFullInspector(mod, details)
}

function renderFullInspector(mod: IOptionalModItem, details: IModDetails | null) {
  const inspector = el('optional-mod-inspector')
  if (!inspector) return

  const cleanName = details?.title || cleanModDisplayName(mod.name)
  const sizeStr = formatBytes(mod.size)
  const dls = formatDownloads(details?.downloads)

  // Actions HTML
  let actionButtonsHtml = ''
  if (!mod.isInstalled) {
    actionButtonsHtml = `
      <button type="button" class="btn btn-primary opt-btn-inspector-install">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-download-bold"></use></svg>
        <span>Installer ce mod</span>
      </button>
    `
  } else {
    const isEnabled = mod.isEnabled
    const toggleClass = isEnabled ? 'btn-success opt-btn--active' : 'btn-secondary opt-btn--paused'
    const toggleIcon = isEnabled ? '#solar-check-bold' : '#solar-power-bold'
    const toggleText = isEnabled ? 'Actif en jeu' : 'En pause (désactivé)'

    actionButtonsHtml = `
      <button type="button" class="btn ${toggleClass} opt-btn-inspector-toggle">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="${toggleIcon}"></use></svg>
        <span>${toggleText}</span>
      </button>
      <button type="button" class="btn btn-secondary opt-btn-inspector-delete" title="Désinstaller complètement ce mod">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-trash-bold"></use></svg>
        <span>Désinstaller</span>
      </button>
    `
  }

  // Tags catégories Modrinth
  const categoryChips = (details?.categories || [])
    .map((c) => `<span class="opt-tag-chip">${formatCategoryLabel(c)}</span>`)
    .join('')

  // Galerie captures & GIFs
  let galleryHtml = ''
  if (details?.gallery && details.gallery.length > 0) {
    const items = details.gallery
      .map(
        (g) => `
        <div class="opt-gallery-item" title="${escapeHtml(g.title || g.description || 'Capture d\'écran')}">
          <img src="${g.url}" alt="${escapeHtml(g.title || '')}" loading="lazy" />
          ${g.title ? `<span class="opt-gallery-caption">${escapeHtml(g.title)}</span>` : ''}
        </div>
      `
      )
      .join('')

    galleryHtml = `
      <div class="opt-inspector-section">
        <h4 class="opt-section-heading">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-clapperboard-bold"></use></svg>
          Captures d'écran &amp; Démonstration (${details.gallery.length})
        </h4>
        <div class="opt-gallery-strip">
          ${items}
        </div>
      </div>
    `
  }

  // Description & Markdown
  let contentHtml = ''
  if (details?.bodyHtml) {
    contentHtml = renderMarkdownToHtml(details.bodyHtml)
  } else if (details?.description) {
    contentHtml = `<p class="opt-lead-desc">${escapeHtml(details.description)}</p>`
  } else {
    contentHtml = `
      <div class="opt-no-content-notice">
        <p>Ce mod est configuré pour le profil <strong>${currentSlug}</strong>. Vous pouvez l'activer ou le désactiver selon vos préférences visuelles et d'ergonomie.</p>
      </div>
    `
  }

  // Liens officiels externes
  const officialLinks: string[] = []
  if (details?.modrinthUrl) {
    officialLinks.push(`
      <a href="${details.modrinthUrl}" target="_blank" rel="noopener noreferrer" class="opt-tech-link">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-arrow-up-right-bold"></use></svg> Modrinth
      </a>
    `)
  }
  if (details?.sourceUrl) {
    officialLinks.push(`
      <a href="${details.sourceUrl}" target="_blank" rel="noopener noreferrer" class="opt-tech-link">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-git-branch-bold"></use></svg> Code source
      </a>
    `)
  }
  if (details?.wikiUrl) {
    officialLinks.push(`
      <a href="${details.wikiUrl}" target="_blank" rel="noopener noreferrer" class="opt-tech-link">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-notes-bold"></use></svg> Wiki
      </a>
    `)
  }
  if (details?.discordUrl) {
    officialLinks.push(`
      <a href="${details.discordUrl}" target="_blank" rel="noopener noreferrer" class="opt-tech-link">
        <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-chat-bold"></use></svg> Discord
      </a>
    `)
  }

  inspector.innerHTML = `
    <div class="opt-inspector-content">
      <!-- Entête & Actions -->
      <div class="opt-inspector-header">
        <div class="opt-inspector-hero">
          <div class="opt-inspector-icon-wrap">
            ${
              details?.iconUrl
                ? `<img src="${details.iconUrl}" alt="" class="opt-inspector-icon-img" />`
                : `<svg class="solar-icon solar-bold" style="font-size:32px; color:var(--accent);" aria-hidden="true"><use href="#solar-box-bold"></use></svg>`
            }
          </div>
          <div class="opt-inspector-main-info">
            <h2 class="opt-inspector-title">${escapeHtml(cleanName)}</h2>
            <div class="opt-inspector-meta-row">
              ${details?.author ? `<span class="opt-inspector-author"><svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-user-bold"></use></svg> ${escapeHtml(details.author)}</span>` : ''}
              ${dls ? `<span class="opt-inspector-dls"><svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-download-bold"></use></svg> ${dls} téléchargements</span>` : ''}
              <span class="opt-inspector-filesize">${sizeStr}</span>
            </div>
            ${categoryChips ? `<div class="opt-inspector-categories">${categoryChips}</div>` : ''}
          </div>
        </div>

        <div class="opt-inspector-action-bar">
          ${actionButtonsHtml}
        </div>
      </div>

      <!-- Galerie visuelle -->
      ${galleryHtml}

      <!-- Présentation & Markdown -->
      <div class="opt-inspector-section">
        ${
          details?.description
            ? `<div class="opt-lead-banner">${escapeHtml(details.description)}</div>`
            : ''
        }
        <h4 class="opt-section-heading">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-notes-bold"></use></svg>
          Présentation du mod
        </h4>
        <div class="opt-mod-markdown">
          ${contentHtml}
        </div>
      </div>

      <!-- Fiche technique & métadonnées -->
      <div class="opt-inspector-section opt-tech-section">
        <h4 class="opt-section-heading">
          <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-tuning-bold"></use></svg>
          Spécifications techniques
        </h4>
        <div class="opt-tech-grid">
          <div class="opt-tech-row">
            <span class="opt-tech-label">Fichier :</span>
            <span class="opt-tech-val code">${escapeHtml(mod.name)}</span>
          </div>
          <div class="opt-tech-row">
            <span class="opt-tech-label">Empreinte SHA-1 :</span>
            <span class="opt-tech-val code opt-sha1" title="${mod.sha1}">${mod.sha1.slice(0, 16)}...</span>
          </div>
          <div class="opt-tech-row">
            <span class="opt-tech-label">Statut d'activation :</span>
            <span class="opt-tech-val">${mod.isEnabled ? 'Actif au prochain lancement' : mod.isInstalled ? 'Désactivé (.disabled)' : 'Non téléchargé'}</span>
          </div>
          ${
            officialLinks.length > 0
              ? `
            <div class="opt-tech-row">
              <span class="opt-tech-label">Liens externes :</span>
              <div class="opt-tech-links-list">${officialLinks.join('')}</div>
            </div>
          `
              : ''
          }
        </div>
      </div>
    </div>
  `

  // Écouteurs pour les boutons d'actions de l'inspecteur
  const installBtn = inspector.querySelector<HTMLButtonElement>('.opt-btn-inspector-install')
  installBtn?.addEventListener('click', async () => {
    installBtn.disabled = true
    installBtn.innerHTML = '<svg class="solar-icon solar-bold spin" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>&nbsp;Installation en cours...'
    try {
      const res = await optionalMods.install(currentSlug, mod.id)
      if (!res.success) {
        await Dialog.show(res.error || "Impossible d'installer le mod.", [{ text: 'OK', type: 'ok' }])
      }
    } catch (err) {
      logger.error('Install error:', err)
    }
    await refreshOptionalMods(currentSlug)
  })

  const toggleBtn = inspector.querySelector<HTMLButtonElement>('.opt-btn-inspector-toggle')
  toggleBtn?.addEventListener('click', async () => {
    toggleBtn.disabled = true
    toggleBtn.innerHTML = '<svg class="solar-icon solar-bold spin" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>&nbsp;Mise à jour...'
    try {
      const res = await optionalMods.toggle(currentSlug, mod.id, !mod.isEnabled)
      if (!res.success) {
        await Dialog.show(res.error || "Impossible d'activer/désactiver le mod.", [{ text: 'OK', type: 'ok' }])
      }
    } catch (err) {
      logger.error('Toggle error:', err)
    }
    await refreshOptionalMods(currentSlug)
  })

  const delBtn = inspector.querySelector<HTMLButtonElement>('.opt-btn-inspector-delete')
  delBtn?.addEventListener('click', async () => {
    const confirm = await Dialog.show(
      `Voulez-vous vraiment désinstaller le mod optionnel "${cleanName}" ?\nLe fichier sera supprimé du dossier de jeu.`,
      [
        { text: 'Annuler', type: 'cancel' },
        { text: 'Désinstaller', type: 'ok' }
      ]
    )
    if (confirm) {
      delBtn.disabled = true
      delBtn.innerHTML = '<svg class="solar-icon solar-bold spin" aria-hidden="true"><use href="#solar-refresh-bold"></use></svg>&nbsp;Suppression...'
      try {
        const res = await optionalMods.uninstall(currentSlug, mod.id)
        if (!res.success) {
          await Dialog.show(res.error || 'Impossible de désinstaller le mod.', [{ text: 'OK', type: 'ok' }])
        }
      } catch (err) {
        logger.error('Delete error:', err)
      }
      await refreshOptionalMods(currentSlug)
    }
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
