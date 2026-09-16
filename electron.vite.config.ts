import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Each section has to be present or electron-vite skips building it.
  main: {
    // The provider SDKs ship their own shims and resolve badly when bundled.
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      rollupOptions: {
        // The chrome and the AI panel get their own bridge, so neither sees the other's
        // channels.
        input: {
          index: resolve('src/preload/index.ts'),
          panel: resolve('src/preload/panel.ts')
        },
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
        // Pages the chrome renderer cannot draw itself: the overlay sits above the web
        // pages, and the panel is a view of its own beside them.
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
          panel: resolve('src/renderer/panel.html')
        }
      }
    },
    plugins: [react()]
  }
})
