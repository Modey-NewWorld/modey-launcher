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

export async function fetchNews(): Promise<INews[]> {
  try {
    return (await newsIpc.getNews()) || []
  } catch {
    return []
  }
}
