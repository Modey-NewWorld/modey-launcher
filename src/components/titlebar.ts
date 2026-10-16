export function initTitlebar() {
  const btnMinimize = document.getElementById('btn-win-minimize')
  const btnMaximize = document.getElementById('btn-win-maximize')
  const btnClose = document.getElementById('btn-win-close')
  const maxIcon = document.getElementById('win-max-icon')

  btnMinimize?.addEventListener('click', () => window.api.window.minimize())
  btnMaximize?.addEventListener('click', () => window.api.window.maximize())
  btnClose?.addEventListener('click', () => window.api.window.close())

  window.api.window.onMaximized((maximized) => {
    if (maxIcon) {
      maxIcon.className = maximized ? 'fa-solid fa-copy' : 'fa-regular fa-square'
    }
  })
}
