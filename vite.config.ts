import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 7174
  },
  plugins: [
    electron([
      {
        entry: 'electron/main.ts'
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false
          }
        },
        onstart(options) {
          options.reload()
        }
      }
    ])
  ]
})

