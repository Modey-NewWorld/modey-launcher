// scripts/preview.mjs
// Aperçu statique de dist/ avec stub IPC pour mesurer et tester sans Electron
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = 7185
const DIST = path.resolve('dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml'
}

const STUB = `
<script>
  // Stub IPC pour prévisualisation navigateur
  const noop = () => Promise.resolve(null)
  const anyFn = new Proxy(noop, { get: () => anyFn })
  window.api = new Proxy({
    app: { getVersion: () => Promise.resolve('26.1.3') },
    auth: { getSavedSession: () => Promise.resolve(null) },
    profiles: { getActive: () => Promise.resolve(null), getAll: () => Promise.resolve([]) }
  }, { get: (target, prop) => target[prop] || anyFn })
</script>
`

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0]
  if (reqPath === '/') reqPath = '/index.html'

  const filePath = path.join(DIST, reqPath)
  if (!fs.existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found: ' + reqPath)
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'

  if (ext === '.html') {
    let content = fs.readFileSync(filePath, 'utf8')
    content = content.replace('<head>', '<head>' + STUB)
    res.writeHead(200, { 'Content-Type': mime })
    res.end(content)
  } else {
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
  }
})

server.listen(PORT, () => {
  console.log(`Preview running at http://127.0.0.1:${PORT}`)
})
