import '@fortawesome/fontawesome-free/css/all.min.css'
import './static/styles/_variables.scss'
import './static/styles/main.scss'
import './static/styles/screens.scss'
import './static/styles/loading.scss'
import './static/styles/maintenance.scss'
import './static/styles/update.scss'

import { initTitlebar } from './components/titlebar'
import { initLogin } from './pages/login/login'
import { initHome, selectProfile } from './pages/home/home'
import { initServers } from './pages/servers/servers'
import { initProfile } from './pages/profile/profile'
import { initSettings } from './pages/settings/settings'
import { bootstrap } from './init'

initTitlebar()
initLogin()
initHome()
initServers({ onSelectProfile: selectProfile })
initProfile()
initSettings()

bootstrap()
