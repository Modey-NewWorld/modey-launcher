const LAST_PLAYED_KEY = 'modey_last_played_server'
const HISTORY_KEY = 'modey_servers_history'

export interface ServerHistoryItem {
  slug: string
  name: string
  playedAt: number
}

export function recordPlayedServer(slug: string, name: string) {
  const now = Date.now()
  try {
    localStorage.setItem(LAST_PLAYED_KEY, JSON.stringify({ slug, name, playedAt: now }))
    const raw = localStorage.getItem(HISTORY_KEY)
    let list: ServerHistoryItem[] = raw ? JSON.parse(raw) : []
    list = list.filter((i) => i.slug !== slug)
    list.unshift({ slug, name, playedAt: now })
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    /* ignore storage errors */
  }
}

export function getLastPlayedServer(): ServerHistoryItem | null {
  try {
    const raw = localStorage.getItem(LAST_PLAYED_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return null
}

export function getServerHistory(): ServerHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* ignore */
  }
  return []
}
