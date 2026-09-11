import { ipcMain, WebContentsView, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { contentBounds, onLayoutChange } from './layout'
import type { OverlayRequest } from '../preload'

interface Overlay {
  window: BrowserWindow
  view: WebContentsView | null
  ready: Promise<void>
  showing: boolean
  answer: ((confirmed: boolean) => void) | null
}

let overlay: Overlay | null = null

/** A transparent layer above the pages, for UI the chrome renderer cannot reach over them. */
export function attachOverlay(window: BrowserWindow): void {
  overlay = { window, view: null, ready: Promise.resolve(), showing: false, answer: null }

  onLayoutChange(() => {
    if (overlay?.view) overlay.view.setBounds(contentBounds(overlay.window))
  })

  window.on('closed', () => {
    overlay?.answer?.(false)
    overlay = null
  })
}

export function registerOverlayIpc(): void {
  ipcMain.on('overlay:respond', (_event, confirmed: boolean) => {
    if (!overlay?.answer) return

    const answer = overlay.answer
    overlay.answer = null
    overlay.showing = false
    overlay.view?.setVisible(false)
    overlay.window.focus()
    answer(confirmed)
  })
}

/** Resolves false rather than hanging if the overlay is busy or the window is gone. */
export async function confirm(request: OverlayRequest): Promise<boolean> {
  if (!overlay || overlay.showing) return false

  const current = overlay
  current.showing = true

  const view = ensureView(current)
  // The page has to exist before it can be told what to draw.
  await current.ready

  if (overlay !== current) return false

  const { window } = current
  // Re-parenting puts it back on top of tabs created since the last time.
  window.contentView.removeChildView(view)
  window.contentView.addChildView(view)
  view.setBounds(contentBounds(window))
  view.setVisible(true)
  view.webContents.focus()
  view.webContents.send('overlay:show', request)

  return new Promise((resolve) => {
    current.answer = resolve
  })
}

function ensureView(current: Overlay): WebContentsView {
  if (current.view) return current.view

  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  // Alpha comes first in Electron's hex. Fully transparent drops the layer, so this is
  // the smallest alpha that still composites. The dim itself is painted by the page.
  view.setBackgroundColor('#01000000')
  view.setVisible(false)

  current.ready = new Promise((resolve) => {
    view.webContents.once('did-finish-load', () => resolve())
  })

  // Only development sets this, so its presence is the whole check.
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) void view.webContents.loadURL(`${rendererUrl}/overlay.html`)
  else void view.webContents.loadFile(join(import.meta.dirname, '../renderer/overlay.html'))

  current.view = view
  return view
}
