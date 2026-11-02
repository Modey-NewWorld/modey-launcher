import './static/styles/_fonts.scss'
import './static/styles/_variables.scss'
import './static/styles/main.scss'
import './static/styles/screens.scss'
import './static/styles/loading.scss'
import './static/styles/maintenance.scss'
import './static/styles/update.scss'

import { initTheme } from './theme'
import { initTitlebar } from './components/titlebar'
import { initLogin } from './pages/login/login'
import { initHome, selectProfile } from './pages/home/home'
import { initServers } from './pages/servers/servers'
import { initProfile } from './pages/profile/profile'
import { initSettings } from './pages/settings/settings'
import { bootstrap } from './init'

initTheme()
initTitlebar()
initLogin()
initHome()
initServers({ onSelectProfile: selectProfile })
initProfile()
initSettings()

bootstrap()

// Veille en arrière-plan : fige les animations tant que le launcher dort
window.api.system.onSleep((asleep) => document.body.classList.toggle('is-asleep', asleep))
