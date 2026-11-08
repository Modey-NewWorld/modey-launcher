import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true
})

/**
 * Convertit du Markdown ou du Markdown contenant du HTML brut
 * en HTML nettoyé et sécurisé pour l'affichage dans le launcher.
 */
export function renderRichMarkdown(md: string): string {
  if (!md) return ''

  try {
    // 1. Parser le markdown et le HTML inline avec marked
    const rawHtml = marked.parse(md) as string

    // 2. Nettoyer le HTML résultant avec DOMPurify
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel', 'loading'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
    })

    // 3. S'assurer que tous les liens externes s'ouvrent dans une nouvelle fenêtre / navigateur externe
    return cleanHtml.replace(/<a\s+(?!.*?target=)/gi, '<a target="_blank" rel="noopener noreferrer" ')
  } catch (err) {
    console.warn('[Markdown] Error parsing markdown:', err)
    return escapeFallbackHtml(md)
  }
}

function escapeFallbackHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
