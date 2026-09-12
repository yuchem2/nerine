import { ipcMain, WebContentsView, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { contentBounds, onLayoutChange } from './layout'
import type { OverlayMenuRequest, OverlayRequest } from '../preload'

interface Overlay {
  window: BrowserWindow
  view: WebContentsView | null
  ready: Promise<void>
  showing: boolean
  answer: ((value: unknown) => void) | null
  dismiss: (() => void) | null
}

let overlay: Overlay | null = null

/** A transparent layer above the pages, for UI the chrome renderer cannot reach over them. */
export function attachOverlay(window: BrowserWindow): void {
  overlay = {
    window,
    view: null,
    ready: Promise.resolve(),
    showing: false,
    answer: null,
    dismiss: null
  }

  onLayoutChange(() => {
    if (overlay?.view) overlay.view.setBounds(contentBounds(overlay.window))
  })

  window.on('closed', () => {
    overlay?.dismiss?.()
    overlay = null
  })
}

export function registerOverlayIpc(): void {
  ipcMain.on('overlay:respond', (_event, confirmed: boolean) => settle(confirmed))
  ipcMain.on('overlay:pick', (_event, id: string | null) => settle(id))
}

/** Resolves false rather than hanging if the overlay is busy or the window is gone. */
export function confirm(request: OverlayRequest): Promise<boolean> {
  return present((view) => view.webContents.send('overlay:show', request), false)
}

/** Resolves the id of the entry that was picked, or null if the menu was dismissed. */
export function menu(request: OverlayMenuRequest): Promise<string | null> {
  return present<string | null>((view) => view.webContents.send('overlay:menu', request), null)
}

async function present<T>(show: (view: WebContentsView) => void, cancelled: T): Promise<T> {
  // One at a time, so a page cannot stack them.
  if (!overlay || overlay.showing) return cancelled

  const current = overlay
  current.showing = true

  const view = ensureView(current)
  // The page has to exist before it can be told what to draw.
  await current.ready

  if (overlay !== current) return cancelled

  const { window } = current
  // Re-parenting puts it back on top of tabs created since the last time.
  window.contentView.removeChildView(view)
  window.contentView.addChildView(view)
  view.setBounds(contentBounds(window))
  view.setVisible(true)
  view.webContents.focus()
  show(view)

  return new Promise<T>((resolve) => {
    // One slot serves every kind of request, so the value is typed at the call site.
    current.answer = resolve as (value: unknown) => void
    current.dismiss = () => resolve(cancelled)
  })
}

function settle(value: unknown): void {
  if (!overlay?.answer) return

  const answer = overlay.answer
  overlay.answer = null
  overlay.dismiss = null
  overlay.showing = false
  overlay.view?.setVisible(false)
  answer(value)
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
