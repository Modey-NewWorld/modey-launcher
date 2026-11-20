import { auth } from '../ipc'
import shared from '../shared'
import logger from 'electron-log/renderer'

export interface IEmailVerificationModalOptions {
  email: string
  onVerified: () => void
}

let resendInterval: any = null
let resendCooldownSeconds = 0

function ensureModalDOM(): HTMLElement {
  let overlay = document.getElementById('email-verification-modal-overlay')
  if (overlay) return overlay

  const html = `
    <div id="email-verification-modal-overlay" class="dialog-overlay hidden" style="z-index: 10000;">
      <div class="dialog-box" style="max-width: 440px; padding: 24px; box-sizing: border-box;">
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 4px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(30,136,229,0.15); display: flex; align-items: center; justify-content: center; color: var(--primary); flex-shrink: 0;">
            <svg class="solar-icon solar-bold" style="font-size: 26px;" aria-hidden="true"><use href="#solar-shield-check-bold"></use></svg>
          </div>
          <div>
            <h3 style="margin: 0; padding: 0; border: none; font-size: 15px; font-weight: 700; color: var(--ink-900);">Vérification de sécurité</h3>
            <p style="margin: 3px 0 0; font-size: 11.5px; color: var(--ink-700);">Validation d'email requise pour lancer le jeu</p>
          </div>
        </div>

        <div style="background: rgba(30,136,229,0.06); border: 1px solid rgba(30,136,229,0.2); border-radius: 10px; padding: 12px 14px; font-size: 12px; line-height: 1.5; color: var(--ink-900);">
          Pour sécuriser votre compte et vos accès en jeu, veuillez valider votre adresse email officielle :
          <div style="margin-top: 5px; font-weight: 700; color: var(--primary); word-break: break-all;" id="evm-email-label"></div>
        </div>

        <form id="evm-form" style="display: flex; flex-direction: column; gap: 14px; margin-top: 4px;">
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label for="evm-code-input" style="font-size: 12px; font-weight: 600; color: var(--ink-900); display: flex; align-items: center; gap: 6px;">
              <svg class="solar-icon solar-bold" style="font-size: 15px;" aria-hidden="true"><use href="#solar-key-bold"></use></svg>
              <span>Code de vérification (6 chiffres)</span>
            </label>
            <input type="text" id="evm-code-input" placeholder="000 000" maxlength="7" autocomplete="one-time-code" style="text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 6px; width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1px solid var(--line); background: var(--bg-surface); color: var(--ink-900); border-radius: 10px; outline: none; font-family: inherit;" />
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--ink-700); margin-top: 2px;">
              <span id="evm-info-text">Code envoyé à votre adresse</span>
              <button type="button" id="evm-btn-resend" style="background: none; border: none; padding: 0; color: var(--primary); font-size: 11px; cursor: pointer; text-decoration: underline; font-family: inherit;">
                Renvoyer le code
              </button>
            </div>
          </div>

          <div id="evm-status-message" style="display: none; font-size: 11.5px; border-radius: 8px; padding: 8px 12px; line-height: 1.4;"></div>

          <div class="dialog-actions" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
            <button type="button" id="evm-btn-cancel" class="btn btn-secondary" style="padding: 9px 16px;">Annuler</button>
            <button type="submit" id="evm-btn-submit" class="btn btn-primary" style="padding: 9px 18px; display: flex; align-items: center; gap: 8px;">
              <svg class="solar-icon solar-bold" aria-hidden="true"><use href="#solar-play-bold"></use></svg>
              <span id="evm-btn-submit-text">Valider et Jouer</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `
  document.body.insertAdjacentHTML('beforeend', html)
  overlay = document.getElementById('email-verification-modal-overlay')!
  return overlay
}

export class EmailVerificationModal {
  public static async show(options: IEmailVerificationModalOptions): Promise<void> {
    const overlay = ensureModalDOM()

    const emailLabel = document.getElementById('evm-email-label') as HTMLElement | null
    const codeInput = document.getElementById('evm-code-input') as HTMLInputElement | null
    const infoText = document.getElementById('evm-info-text') as HTMLElement | null
    const resendBtn = document.getElementById('evm-btn-resend') as HTMLButtonElement | null
    const cancelBtn = document.getElementById('evm-btn-cancel') as HTMLButtonElement | null
    const submitBtn = document.getElementById('evm-btn-submit') as HTMLButtonElement | null
    const submitBtnText = document.getElementById('evm-btn-submit-text') as HTMLElement | null
    const statusMsg = document.getElementById('evm-status-message') as HTMLElement | null
    const form = document.getElementById('evm-form') as HTMLFormElement | null

    if (emailLabel) emailLabel.innerText = options.email
    if (codeInput) {
      codeInput.value = ''
      setTimeout(() => codeInput.focus(), 100)
    }
    if (statusMsg) {
      statusMsg.style.display = 'none'
      statusMsg.innerText = ''
    }

    const showStatus = (text: string, isError = true) => {
      if (!statusMsg) return
      statusMsg.style.display = 'block'
      statusMsg.innerText = text
      if (isError) {
        statusMsg.style.background = 'rgba(239, 68, 68, 0.12)'
        statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.3)'
        statusMsg.style.color = '#ef4444'
      } else {
        statusMsg.style.background = 'rgba(34, 197, 94, 0.12)'
        statusMsg.style.border = '1px solid rgba(34, 197, 94, 0.3)'
        statusMsg.style.color = '#22c55e'
      }
    }

    const startCooldown = (seconds = 60) => {
      if (resendInterval) clearInterval(resendInterval)
      resendCooldownSeconds = seconds
      if (resendBtn) {
        resendBtn.disabled = true
        resendBtn.style.opacity = '0.5'
        resendBtn.style.cursor = 'not-allowed'
      }

      const updateLabel = () => {
        if (resendBtn) {
          if (resendCooldownSeconds > 0) {
            resendBtn.innerText = `Renvoyer (${resendCooldownSeconds}s)`
          } else {
            resendBtn.innerText = 'Renvoyer le code'
          }
        }
      }

      updateLabel()
      resendInterval = setInterval(() => {
        resendCooldownSeconds--
        if (resendCooldownSeconds <= 0) {
          clearInterval(resendInterval)
          resendInterval = null
          if (resendBtn) {
            resendBtn.disabled = false
            resendBtn.style.opacity = '1'
            resendBtn.style.cursor = 'pointer'
          }
        }
        updateLabel()
      }, 1000)
    }

    const closeModal = () => {
      if (resendInterval) clearInterval(resendInterval)
      overlay.classList.add('hidden')
    }

    // Auto-formatting OTP
    if (codeInput) {
      codeInput.oninput = () => {
        const raw = codeInput.value.replace(/\D/g, '').slice(0, 6)
        if (raw.length > 3) {
          codeInput.value = `${raw.slice(0, 3)} ${raw.slice(3)}`
        } else {
          codeInput.value = raw
        }
      }
    }

    // Bouton Renvoyer
    if (resendBtn) {
      resendBtn.onclick = async () => {
        if (resendCooldownSeconds > 0) return
        try {
          if (infoText) infoText.innerText = 'Envoi en cours...'
          const res = await auth.sendEmailVerification(options.email)
          if (res.success) {
            if (infoText) infoText.innerText = 'Nouveau code envoyé !'
            showStatus('Un nouveau code de vérification vous a été expédié par email.', false)
            startCooldown(60)
          } else {
            if (infoText) infoText.innerText = 'Échec de renvoi'
            showStatus(res.error || "Impossible d'envoyer le code.", true)
          }
        } catch (err: any) {
          showStatus(err.message || 'Erreur réseau.', true)
        }
      }
    }

    // Bouton Annuler
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        closeModal()
      }
    }

    // Soumission du formulaire
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault()
        const code = codeInput ? codeInput.value.replace(/\s+/g, '').trim() : ''
        if (code.length !== 6) {
          showStatus('Veuillez saisir les 6 chiffres du code reçu par email.', true)
          codeInput?.focus()
          return
        }

        if (submitBtn) submitBtn.disabled = true
        if (submitBtnText) submitBtnText.innerText = 'Vérification...'

        try {
          const res = await auth.confirmEmailVerification(options.email, code)
          if (res.success) {
            showStatus('Email validé avec succès ! Démarrage du jeu...', false)
            if (shared.account) {
              ;(shared.account as any).emailVerified = true
            }
            setTimeout(() => {
              closeModal()
              options.onVerified()
            }, 600)
          } else {
            showStatus(res.error || 'Code incorrect ou expiré. Veuillez vérifier votre saisie.', true)
            if (submitBtn) submitBtn.disabled = false
            if (submitBtnText) submitBtnText.innerText = 'Valider et Jouer'
            codeInput?.select()
          }
        } catch (err: any) {
          logger.error('Failed to confirm email OTP:', err)
          showStatus(err.message || 'Erreur de connexion aux serveurs Modey.', true)
          if (submitBtn) submitBtn.disabled = false
          if (submitBtnText) submitBtnText.innerText = 'Valider et Jouer'
        }
      }
    }

    // Afficher la modale
    overlay.classList.remove('hidden')

    // Envoyer immédiatement un code au joueur pour qu'il soit prêt
    try {
      startCooldown(60)
      auth.sendEmailVerification(options.email).catch((e) => {
        logger.warn('Auto send verification email failed:', e)
      })
    } catch (_) {}
  }
}
