import { news as newsIpc } from '../ipc'
import type { INews } from 'eml-lib'

export const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const tagBackgroundColor = (color: string) => {
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 0.1)`
}

export const stripMarkdown = (md: string) =>
  md
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[#>*_`~|-]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

export const readingTime = (md: string) => {
  const words = stripMarkdown(md).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 180))
}

export interface INewsCategoryInfo {
  label: string
  className: string
}

/**
 * Résolution unifiée et déterministe de la catégorie d'une actualité.
 * Utilisée à la fois par l'accueil (cartes/bannières) et la modale immersive.
 */
export function resolveNewsCategory(item: {
  category?: string
  title?: string
  badge?: string
  badgeClass?: string
}): INewsCategoryInfo {
  if (item.badge && item.badgeClass) {
    return { label: item.badge, className: item.badgeClass }
  }

  const rawCat = (item.category || '').trim().toLowerCase()
  const rawTitle = (item.title || '').toLowerCase()

  // 1. Catégorie explicite officielle (définie dans l'Admin Panel ou par l'API)
  if (rawCat === 'maintenance') {
    return { label: 'Maintenance', className: 'badge-maintenance' }
  }
  if (rawCat === 'update') {
    return { label: 'Mise à jour', className: 'badge-update' }
  }
  if (rawCat === 'patchnote') {
    return { label: 'Patchnote', className: 'badge-update' }
  }
  if (rawCat === 'event') {
    return { label: 'Événement', className: 'badge-event' }
  }
  if (rawCat === 'community') {
    return { label: 'Communauté', className: 'badge-community' }
  }

  // 2. Fallback intelligent par détection sémantique dans le titre
  // La Maintenance est vérifiée EN PREMIER : une opération ou coupure d'infrastructure
  // prime sur le terme "mise à jour" (ex: "Maintenance en cours : Mise à jour réseau").
  if (rawTitle.includes('maintenance')) {
    return { label: 'Maintenance', className: 'badge-maintenance' }
  }
  if (rawTitle.includes('mise à jour') || rawTitle.includes('patchnote') || rawTitle.includes('changelog')) {
    return { label: 'Mise à jour', className: 'badge-update' }
  }
  if (rawTitle.includes('événement') || rawTitle.includes('evenement') || rawTitle.includes('tournoi')) {
    return { label: 'Événement', className: 'badge-event' }
  }
  if (rawTitle.includes('communauté') || rawTitle.includes('communaute') || rawTitle.includes('discord')) {
    return { label: 'Communauté', className: 'badge-community' }
  }

  return { label: 'Annonce', className: 'badge-announcement' }
}

export async function fetchNews(): Promise<INews[]> {
  try {
    return (await newsIpc.getNews()) || []
  } catch {
    return []
  }
}
