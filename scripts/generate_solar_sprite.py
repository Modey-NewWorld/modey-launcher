import json
import pathlib

ROOT = pathlib.Path(__file__).parent.parent

with open(ROOT / 'node_modules/@iconify-json/solar/icons.json', 'r', encoding='utf-8') as f:
    solar_db = json.load(f)

solar_icons = solar_db['icons']

# (alias, solar_bold_name, solar_linear_name)
mapping = [
    # Navigation & Core
    ('home', 'home-2-bold', 'home-2-linear'),
    ('server', 'server-2-bold', 'server-2-linear'),
    ('user', 'user-bold', 'user-linear'),
    ('settings', 'settings-minimalistic-bold', 'settings-minimalistic-linear'),
    ('play', 'play-bold', 'play-linear'),
    
    # Volet Social & Rail
    ('friends', 'users-group-rounded-bold', 'users-group-rounded-linear'),
    ('bell', 'bell-bing-bold', 'bell-linear'),
    ('history', 'history-bold', 'history-linear'),
    ('broadcast', 'transmission-circle-bold', 'transmission-circle-linear'),
    ('chat', 'chat-round-line-bold', 'chat-round-line-linear'),
    
    # News & Discovery
    ('feed', 'feed-bold', 'feed-linear'),
    ('notes', 'notes-bold', 'notes-linear'),
    ('rocket', 'rocket-2-bold', 'rocket-2-linear'),
    ('sparkles', 'stars-bold', 'stars-linear'),
    ('crown', 'crown-bold', 'crown-linear'),
    ('box', 'box-bold', 'box-linear'),
    
    # Actions & Buttons
    ('check', 'check-circle-bold', 'check-circle-linear'),
    ('check-simple', 'check-read-bold', 'check-read-linear'),
    ('close', 'close-circle-bold', 'close-circle-linear'),
    ('close-simple', 'close-square-bold', 'close-square-linear'),
    ('info', 'info-circle-bold', 'info-circle-linear'),
    ('danger', 'danger-triangle-bold', 'danger-triangle-linear'),
    ('danger-circle', 'danger-circle-bold', 'danger-circle-linear'),
    ('forbidden', 'forbidden-circle-bold', 'forbidden-circle-linear'),
    ('add', 'add-circle-bold', 'add-circle-linear'),
    ('minus', 'minus-circle-bold', 'minus-circle-linear'),
    ('refresh', 'restart-bold', 'restart-linear'),
    ('refresh-alt', 'refresh-bold', 'refresh-linear'),
    ('clock', 'clock-circle-bold', 'clock-circle-linear'),
    ('hourglass', 'hourglass-bold', 'hourglass-linear'),
    
    # Outils, Fichiers, Modding
    ('folder', 'folder-bold', 'folder-linear'),
    ('folder-open', 'folder-open-bold', 'folder-open-linear'),
    ('download', 'download-minimalistic-bold', 'download-minimalistic-linear'),
    ('upload', 'upload-minimalistic-bold', 'upload-minimalistic-linear'),
    ('trash', 'trash-bin-minimalistic-bold', 'trash-bin-minimalistic-linear'),
    ('pen', 'pen-bold', 'pen-linear'),
    ('copy', 'copy-bold', 'copy-linear'),
    ('file-zip', 'folder-zip-bold', 'folder-zip-linear'),
    ('sliders', 'slider-minimalistic-horizontal-bold', 'slider-minimalistic-horizontal-linear'),
    ('cpu', 'cpu-bold', 'cpu-linear'),
    ('power', 'power-bold', 'power-linear'),
    ('tuning', 'tuning-bold', 'tuning-linear'),
    ('cup', 'cup-hot-bold', 'cup-hot-linear'),
    ('gamepad', 'gamepad-bold', 'gamepad-linear'),
    ('git-branch', 'git-branch-bold', 'git-branch-linear'),
    ('scale', 'scale-bold', 'scale-linear'),
    ('bolt', 'bolt-bold', 'bolt-linear'),
    ('wifi', 'wi-fi-router-bold', 'wi-fi-router-linear'),
    ('signal', 'station-minimalistic-bold', 'station-minimalistic-linear'),
    
    # Auth & Profil
    ('key', 'key-square-bold', 'key-square-linear'),
    ('lock', 'lock-keyhole-bold', 'lock-keyhole-linear'),
    ('eye', 'eye-bold', 'eye-linear'),
    ('eye-closed', 'eye-closed-bold', 'eye-closed-linear'),
    ('logout', 'logout-2-bold', 'logout-2-linear'),
    ('login', 'login-2-bold', 'login-2-linear'),
    ('shield', 'shield-check-bold', 'shield-check-linear'),
    ('shield-simple', 'shield-bold', 'shield-linear'),
    ('card', 'card-bold', 'card-linear'),
    ('t-shirt', 't-shirt-bold', 't-shirt-linear'),
    ('link', 'link-circle-bold', 'link-circle-linear'),
    ('unlink', 'unlink-bold', 'unlink-linear'),
    ('clapperboard', 'clapperboard-play-bold', 'clapperboard-play-linear'),
    
    # Window controls & Flèches
    ('magnifier', 'rounded-magnifier-bold', 'rounded-magnifier-linear'),
    ('magnifier-zoom-in', 'rounded-magnifer-zoom-in-bold', 'rounded-magnifier-zoom-in-linear'),
    ('magnifier-zoom-out', 'rounded-magnifer-zoom-out-bold', 'rounded-magnifier-zoom-out-linear'),
    ('arrow-right', 'arrow-right-bold', 'arrow-right-linear'),
    ('arrow-up-right', 'arrow-right-up-bold', 'arrow-right-up-linear'),
    ('arrow-left', 'arrow-left-bold', 'arrow-left-linear'),
    ('maximize', 'maximize-square-2-bold', 'maximize-square-2-linear'),
    ('minimize', 'minimize-square-2-bold', 'minimize-square-2-linear'),
    ('window', 'widget-bold', 'widget-linear'),
]

symbols = []
for alias, b_name, l_name in mapping:
    b_body = solar_icons[b_name]['body']
    l_body = solar_icons[l_name]['body']
    symbols.append(f'<symbol id="solar-{alias}-bold" viewBox="0 0 24 24">{b_body}</symbol>')
    symbols.append(f'<symbol id="solar-{alias}-linear" viewBox="0 0 24 24">{l_body}</symbol>')

sprite_xml = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none;" id="solar-icons-sprite">\n<defs>\n' + '\n'.join(symbols) + '\n</defs>\n</svg>'

# Save standalone sprite
out_svg = ROOT / 'src/static/icons/solar-sprite.svg'
out_svg.write_text(sprite_xml, encoding='utf-8')
print(f'Wrote {len(symbols)} symbols to {out_svg}')

# Embed in index.html for zero latency & offline DOM use
index_html = ROOT / 'index.html'
html_content = index_html.read_text(encoding='utf-8')

# Remove existing sprite if present
if '<svg xmlns="http://www.w3.org/2000/svg" style="display:none;" id="solar-icons-sprite">' in html_content:
    parts = html_content.split('<svg xmlns="http://www.w3.org/2000/svg" style="display:none;" id="solar-icons-sprite">')
    post = parts[1].split('</svg>', 1)[1]
    html_content = parts[0] + post

# Insert right after <body>
html_content = html_content.replace('<body>', '<body>\n  ' + sprite_xml)
index_html.write_text(html_content, encoding='utf-8')
print('Embedded sprite into index.html')

# Generate helper in src/components/icon.ts
icon_ts = ROOT / 'src/components/icon.ts'
ts_content = '''/**
 * Solar Icons Helper (Solar Icons — 480 Design, CC BY 4.0)
 * Rendu par Sprite SVG local intégré, zéro CDN.
 */
export type SolarVariant = 'bold' | 'linear'

export function solarIcon(name: string, variant: SolarVariant = 'linear', extraClass = '', extraAttrs = ''): string {
  const cls = ['solar-icon', `solar-${variant}`, extraClass].filter(Boolean).join(' ')
  return `<svg class="${cls}" aria-hidden="true" ${extraAttrs}><use href="#solar-${name}-${variant}"></use></svg>`
}
'''
icon_ts.write_text(ts_content, encoding='utf-8')
print('Generated src/components/icon.ts')
