import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Each section has to be present or electron-vite skips building it.
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // A sandboxed preload cannot be ESM. Everything else stays ESM.
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        // The overlay is a second page: it draws above the web pages, which the chrome cannot.
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    },
    plugins: [react()]
  }
})
