import { ipcMain, type BrowserWindow, type Rectangle } from 'electron'

// The renderer measures its chrome and reports the real height. This covers the first frames.
const FALLBACK_CHROME_HEIGHT = 79

let chromeHeight = FALLBACK_CHROME_HEIGHT
const listeners = new Set<() => void>()

/** The area under the chrome, where pages live. */
export function pageBounds(window: BrowserWindow): Rectangle {
  const { width, height } = window.getContentBounds()
  return { x: 0, y: chromeHeight, width, height: Math.max(height - chromeHeight, 0) }
}

/** Everything the window draws, chrome included. A modal covers all of it. */
export function contentBounds(window: BrowserWindow): Rectangle {
  const { width, height } = window.getContentBounds()
  return { x: 0, y: 0, width, height }
}

export function onLayoutChange(listener: () => void): void {
  listeners.add(listener)
}

/** For changes that do not come from the window, such as DevTools taking a slice. */
export function refreshLayout(): void {
  notify()
}

export function watchLayout(window: BrowserWindow): void {
  window.on('resize', notify)
}

export function registerLayoutIpc(): void {
  ipcMain.on('chrome:height', (_event, height: number) => {
    chromeHeight = Math.round(height)
    notify()
  })
}

function notify(): void {
  for (const listener of listeners) listener()
}
