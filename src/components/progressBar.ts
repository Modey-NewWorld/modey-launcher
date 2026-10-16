import type { LaunchProgressSink } from '../services/launch'

export interface ProgressIds {
  container: string
  bar: string
  label: string
  percent: string
}

/** Barre de progression générique (lancement du jeu, mise à jour du launcher). */
export function createProgressBar(ids: ProgressIds): LaunchProgressSink {
  const container = document.getElementById(ids.container)
  const bar = document.getElementById(ids.bar)
  const label = document.getElementById(ids.label)
  const percent = document.getElementById(ids.percent)

  return {
    setIndeterminate(active: boolean) {
      if (!bar || !percent) return
      if (active) {
        bar.classList.add('indeterminate')
        percent.style.display = 'none'
      } else {
        bar.classList.remove('indeterminate')
        percent.style.display = 'block'
      }
    },
    setLabel(text: string) {
      if (label) label.innerText = text
    },
    setPercent(text: string) {
      if (percent) percent.innerText = text
    },
    setWidth(ratio01: number) {
      if (bar) bar.style.width = `${Math.min(Math.max(ratio01, 0) * 100, 100)}%`
    },
    show() {
      container?.classList.remove('hidden')
    },
    hide() {
      container?.classList.add('hidden')
    },
    reset() {
      this.setWidth(0)
      this.setPercent('')
    }
  }
}
