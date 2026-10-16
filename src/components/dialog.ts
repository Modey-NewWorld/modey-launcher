import logger from 'electron-log/renderer'
import html from './dialog.html?raw'
import '../static/styles/dialog.scss'

if (!document.getElementById('custom-dialog')) {
  document.body.insertAdjacentHTML('beforeend', html)
}

export type ButtonType = 'ok' | 'cancel' | 'danger' | 'other'

export interface DialogButton {
  text: string
  type: ButtonType
  action?: () => any
}

class DialogSystem {
  private readonly overlay: HTMLElement
  private readonly messageEl: HTMLElement
  private readonly titleEl: HTMLElement
  private readonly buttonsEl: HTMLElement

  constructor() {
    this.overlay = document.getElementById('custom-dialog')!
    this.messageEl = document.getElementById('dialog-message')!
    this.titleEl = document.getElementById('dialog-title')!
    this.buttonsEl = document.getElementById('dialog-buttons')!
  }

  public async show<T = boolean>(message: string, buttons?: DialogButton[], title?: string): Promise<T> {
    return new Promise<T>((resolve) => {
      this.messageEl.innerText = message
      this.buttonsEl.innerHTML = ''

      if (title) {
        this.titleEl.innerText = title
        this.titleEl.classList.remove('hidden')
      } else {
        this.titleEl.classList.add('hidden')
      }

      const configButtons = buttons ?? [
        { text: 'Annuler', type: 'cancel' },
        { text: 'OK', type: 'ok' }
      ]

      configButtons.forEach((btnConfig) => {
        const btn = document.createElement('button')
        btn.innerText = btnConfig.text
        const variant = btnConfig.type === 'ok' ? 'primary' : btnConfig.type === 'danger' ? 'danger' : 'secondary'
        btn.className = `btn btn-${variant}`

        btn.onclick = async () => {
          this.close()

          if (btnConfig.action) {
            const result = await btnConfig.action()
            resolve(result !== undefined ? result : (true as any))
          } else {
            switch (btnConfig.type) {
              case 'cancel':
                resolve(false as any)
                break
              case 'ok':
              case 'danger':
                resolve(true as any)
                break
              case 'other':
                logger.warn("The 'other' type button requires an action!")
                resolve(null as any)
                break
            }
          }
        }

        this.buttonsEl.appendChild(btn)
      })

      this.overlay.classList.remove('hidden')
    })
  }

  public async prompt(message: string, defaultValue = '', title?: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.messageEl.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px; width:100%;">
          <span>${message}</span>
          <input type="text" id="dialog-prompt-input" value="${defaultValue}" style="width:100%; padding:10px 12px; border:1px solid #dce4ef; border-radius:8px; font-size:13px; font-family:inherit; outline:none;" />
        </div>
      `
      this.buttonsEl.innerHTML = ''

      if (title) {
        this.titleEl.innerText = title
        this.titleEl.classList.remove('hidden')
      } else {
        this.titleEl.classList.add('hidden')
      }

      const input = document.getElementById('dialog-prompt-input') as HTMLInputElement | null

      const cancelBtn = document.createElement('button')
      cancelBtn.innerText = 'Annuler'
      cancelBtn.className = 'btn btn-secondary'
      cancelBtn.onclick = () => {
        this.close()
        resolve(null)
      }

      const okBtn = document.createElement('button')
      okBtn.innerText = 'Confirmer'
      okBtn.className = 'btn btn-primary'
      okBtn.onclick = () => {
        const val = input?.value.trim() ?? ''
        this.close()
        resolve(val)
      }

      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') okBtn.click()
        if (e.key === 'Escape') cancelBtn.click()
      })

      this.buttonsEl.appendChild(cancelBtn)
      this.buttonsEl.appendChild(okBtn)
      this.overlay.classList.remove('hidden')
      setTimeout(() => input?.focus(), 50)
    })
  }

  private close() {
    this.overlay.classList.add('hidden')
  }
}

export const Dialog = new DialogSystem()
