// launcher/src/components/newsModal.ts
/**
 * Modal d'affichage immersif des actualités et annonces officielles Modey.
 * Affiche le Markdown stylé, les métadonnées (date, heure, auteur, catégorie),
 * l'icône carrée 1:1, les sources cliquables et le lien direct vers le web.
 */

import '../static/styles/newsModal.scss'

export interface INewsModalItem {
  id?: string | number
  title: string
  content?: string
  summary?: string
  slug?: string
  category?: string
  icon?: string
  icon_url?: string
  image?: string
  image_url?: string
  author?: string
  createdAt?: string
  created_at?: string
  publishedAt?: string
  published_at?: string
  sourceLinks?: Array<{ label?: string; url: string }>
  source_links?: Array<{ label?: string; url: string }>
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolveMediaSrc(url?: string): string {
  if (!url) return ''
  const trimmed = String(url).trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed
  }
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `https://api.modey.flowcrea.fr${cleanPath}`
}

export function renderMarkdownToHtml(md: string): string {
  if (!md) return ''

  // Échappement HTML initial pour la sécurité
  let html = escapeHtml(md)

  // Blocs de code ```code```
  html = html.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (_m, code) => {
    return `<pre class="md-pre"><code>${code.trim()}</code></pre>`
  })

  // Code en ligne `code`
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')

  // Images ![alt](url)
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt, url) => {
    const safeUrl = url.trim().replace(/^javascript:/i, '')
    return `<div class="md-img-wrap"><img class="md-img" src="${safeUrl}" alt="${alt}" loading="lazy" /></div>`
  })

  // Liens cliquables [text](url) - s'ouvrent dans le navigateur externe
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (_m, text, url) => {
    const safeUrl = url.trim().replace(/^javascript:/i, '')
    return `<a class="md-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text} <svg class="md-ext-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg></a>`
  })

  // Citations > text
  html = html.replace(/^>\s?(.*)$/gm, '<blockquote class="md-quote"><div class="md-quote-bar"></div><div class="md-quote-text">$1</div></blockquote>')

  // Titres H1, H2, H3, H4
  html = html.replace(/^#### (.*$)/gm, '<h5 class="md-h5">$1</h5>')
  html = html.replace(/^### (.*$)/gm, '<h4 class="md-h4">$1</h4>')
  html = html.replace(/^## (.*$)/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^# (.*$)/gm, '<h2 class="md-h2">$1</h2>')

  // Formatage gras, italique et barré
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>')

  // Listes à puces - item ou * item
  html = html.replace(/^[\*\-]\s+(.*)$/gm, '<li class="md-li">$1</li>')
  html = html.replace(/((?:<li class="md-li">.*<\/li>\s*)+)/g, '<ul class="md-ul">$1</ul>')

  // Listes numérotées 1. item
  html = html.replace(/^\d+\.\s+(.*)$/gm, '<li class="md-oli">$1</li>')
  html = html.replace(/((?:<li class="md-oli">.*<\/li>\s*)+)/g, '<ol class="md-ol">$1</ol>')

  // Paragraphes
  const blocks = html.split(/\n{2,}/)
  html = blocks.map(b => {
    const trimmed = b.trim()
    if (!trimmed) return ''
    if (/^<(h\d|blockquote|pre|ul|ol|div class="md-img-wrap")/.test(trimmed)) {
      return trimmed
    }
    return `<p class="md-p">${trimmed.replace(/\n/g, '<br/>')}</p>`
  }).filter(Boolean).join('\n')

  return html
}

function formatNewsDateTime(dateVal?: string | number): string {
  if (!dateVal) return 'Date récente'
  const d = new Date(typeof dateVal === 'string' && !isNaN(Number(dateVal)) ? Number(dateVal) : dateVal)
  if (isNaN(d.getTime())) return 'Date récente'
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export class NewsModal {
  private static getOrCreateOverlay(): HTMLElement {
    let overlay = document.getElementById('news-reader-modal-overlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'news-reader-modal-overlay'
      overlay.className = 'news-modal-overlay hidden'
      document.body.appendChild(overlay)
    }
    return overlay
  }

  public static show(item: INewsModalItem): void {
    const overlay = this.getOrCreateOverlay()

    const rawBanner = resolveMediaSrc(item.image || item.image_url)
    const rawIcon = resolveMediaSrc(item.icon || item.icon_url)
    const author = item.author || 'Équipe Modey'
    const category = (item.category || 'announcement').toLowerCase()

    let catLabel = 'Annonce'
    let catClass = 'badge-announcement'
    if (category === 'update' || category === 'patchnote' || (item.title || '').toLowerCase().includes('mise à jour')) {
      catLabel = category === 'patchnote' ? 'Patchnote' : 'Mise à jour'
      catClass = 'badge-update'
    } else if (category === 'maintenance' || (item.title || '').toLowerCase().includes('maintenance')) {
      catLabel = 'Maintenance'
      catClass = 'badge-maintenance'
    } else if (category === 'event' || (item.title || '').toLowerCase().includes('événement')) {
      catLabel = 'Événement'
      catClass = 'badge-event'
    } else if (category === 'community') {
      catLabel = 'Communauté'
      catClass = 'badge-community'
    }

    const dateStr = formatNewsDateTime(item.publishedAt || item.published_at || item.createdAt || item.created_at)
    const contentHtml = renderMarkdownToHtml(item.content || '')
    const summaryText = (item.summary || '').trim()

    const sources = item.sourceLinks || item.source_links || []
    let sourcesHtml = ''
    if (Array.isArray(sources) && sources.length > 0) {
      sourcesHtml = `
        <div class="news-modal-sources-section">
          <div class="news-modal-sources-title">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Sources & Références Officielles
          </div>
          <div class="news-modal-sources-list">
            ${sources.map(s => `
              <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="news-source-chip">
                <span>${escapeHtml(s.label || s.url)}</span>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            `).join('')}
          </div>
        </div>
      `
    }

    const webUrl = item.slug
      ? `https://modey.flowcrea.fr/actualites/${encodeURIComponent(item.slug)}`
      : 'https://modey.flowcrea.fr/actualites'

    overlay.innerHTML = `
      <div class="news-modal-box">
        <!-- Bannière si présente -->
        ${rawBanner ? `
          <div class="news-modal-banner" style="background-image: url('${escapeHtml(rawBanner)}');">
            <div class="news-modal-banner-gradient"></div>
            <button class="news-modal-close-btn" id="news-modal-close-x" aria-label="Fermer">✕</button>
          </div>
        ` : `
          <button class="news-modal-close-btn standalone" id="news-modal-close-x" aria-label="Fermer">✕</button>
        `}

        <div class="news-modal-scrollable">
          <!-- En-tête de l'article -->
          <div class="news-modal-header">
            <div class="news-modal-top-meta">
              <span class="news-modal-badge ${catClass}">${catLabel}</span>
              <span class="news-modal-date">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${escapeHtml(dateStr)}
              </span>
              <span class="news-modal-author">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${escapeHtml(author)}
              </span>
            </div>

            <!-- Titre & Icône 1:1 -->
            <div class="news-modal-title-row">
              ${rawIcon ? `
                <div class="news-modal-1to1-icon" style="background-image: url('${escapeHtml(rawIcon)}');"></div>
              ` : ''}
              <h2 class="news-modal-title">${escapeHtml(item.title)}</h2>
            </div>

            <!-- Teaser / Résumé court SEO si présent -->
            ${summaryText ? `
              <div class="news-modal-summary-box">
                <div class="news-modal-summary-icon">📌</div>
                <div class="news-modal-summary-text">${escapeHtml(summaryText)}</div>
              </div>
            ` : ''}
          </div>

          <!-- Corps Markdown formaté -->
          <div class="news-modal-content md-rendered">
            ${contentHtml || '<p class="md-p" style="color:var(--ink-400); font-style:italic;">Aucun contenu détaillé pour cette annonce.</p>'}
          </div>

          <!-- Section Sources & Références -->
          ${sourcesHtml}
        </div>

        <!-- Pied de page avec actions -->
        <div class="news-modal-footer">
          <a href="${webUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm news-modal-web-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Consulter sur le Web
          </a>
          <button class="btn btn-primary btn-sm" id="news-modal-btn-close">Fermer</button>
        </div>
      </div>
    `

    overlay.classList.remove('hidden')

    const closeHandler = () => {
      overlay.classList.add('hidden')
      window.removeEventListener('keydown', escListener)
    }

    const escListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHandler()
    }

    window.addEventListener('keydown', escListener)

    const closeBtnX = document.getElementById('news-modal-close-x')
    if (closeBtnX) closeBtnX.onclick = closeHandler

    const closeBtnFoot = document.getElementById('news-modal-btn-close')
    if (closeBtnFoot) closeBtnFoot.onclick = closeHandler

    overlay.onclick = (e) => {
      if (e.target === overlay) closeHandler()
    }
  }
}
