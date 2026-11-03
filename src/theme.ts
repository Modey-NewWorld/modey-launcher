export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

type ThemeChangeCallback = (theme: ResolvedTheme, preference: ThemePreference) => void

const STORAGE_KEY = 'modey-theme'
const listeners: Set<ThemeChangeCallback> = new Set()

function getSystemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function getTheme(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

export function getResolvedTheme(): ResolvedTheme {
  const pref = getTheme()
  if (pref === 'system') {
    return getSystemTheme()
  }
  return pref
}

export function applyTheme(pref: ThemePreference): void {
  const resolved = pref === 'system' ? getSystemTheme() : pref
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved)
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, pref)
  }
  if (typeof window !== 'undefined' && window.api?.window?.setTitleBarTheme) {
    window.api.window.setTitleBarTheme(resolved === 'dark')
  }
  listeners.forEach((cb) => {
    try {
      cb(resolved, pref)
    } catch (e) {
      console.error('[theme] listener error:', e)
    }
  })
}

export function setTheme(pref: ThemePreference): void {
  applyTheme(pref)
}

export function onThemeChange(cb: ThemeChangeCallback): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function initTheme(): void {
  if (typeof window !== 'undefined' && window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', () => {
      if (getTheme() === 'system') {
        applyTheme('system')
      }
    })
  }
  applyTheme(getTheme())
}
