// scripts/check-dist-assets.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = 'dist'
const bad = []
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (['.html', '.css', '.js'].includes(extname(p))) {
      const txt = readFileSync(p, 'utf8')
      if (txt.includes('/src/static/')) bad.push(p)
    }
  }
}
walk(ROOT)
if (bad.length) {
  console.error('Chemins /src/static/ non résolus dans le build :', bad)
  process.exit(1)
}
console.log('OK: aucun chemin /src/static/ dans dist')
