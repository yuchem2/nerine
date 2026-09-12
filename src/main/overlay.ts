import { ipcMain, WebContentsView, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { contentBounds, onLayoutChange } from './layout'
import type { OverlayMenuRequest, OverlayRequest, ZoomState } from '../preload'

/*
 * Alpha comes first in Electron's hex. A dialog or a menu covers the whole content area
 * and paints its own dim, so it keeps the smallest alpha that still composites. The zoom
 * popup is a small rounded card: it needs real transparency or its corners show a dark
 * block instead of the page.
 */
const DIM_BACKGROUND = '#01000000'
const CLEAR_BACKGROUND = '#00000000'

// The zoom popup hangs under the address bar and leaves on its own.
const POPUP = { width: 200, height: 40, gap: 6 }
const POPUP_LINGER = 2500

interface Overlay {
  window: BrowserWindow
  view: WebContentsView | null
  ready: Promise<void>
  /** 'blocking' is a dialog or a menu, which covers everything and takes focus. */
  mode: 'idle' | 'blocking' | 'zoom'
  answer: ((value: unknown) => void) | null
  dismiss: (() => void) | null
  linger: NodeJS.Timeout | null
  /** Bottom right of the address bar, reported by the chrome. */
  anchor: { x: number; y: number }
}

let overlay: Overlay | null = null

/** A transparent layer above the pages, for UI the chrome renderer cannot reach over them. */
export function attachOverlay(window: BrowserWindow): void {
  overlay = {
    window,
    view: null,
    ready: Promise.resolve(),
    mode: 'idle',
    answer: null,
    dismiss: null,
    linger: null,
    anchor: { x: 0, y: 0 }
  }

  onLayoutChange(() => {
    if (!overlay?.view) return
    // The popup is placed against a rect the chrome measured, so a resize takes it down.
    if (overlay.mode === 'zoom') closeZoom(overlay)
    else if (overlay.mode === 'blocking') overlay.view.setBounds(contentBounds(overlay.window))
  })

  window.on('closed', () => {
    overlay?.dismiss?.()
    overlay = null
  })
}

export function registerOverlayIpc(): void {
  ipcMain.on('overlay:respond', (_event, confirmed: boolean) => settle(confirmed))
  ipcMain.on('overlay:pick', (_event, id: string | null) => settle(id))
  ipcMain.on('chrome:zoom-anchor', (_event, anchor: { x: number; y: number }) => {
    if (overlay) overlay.anchor = anchor
  })
}

/** Resolves false rather than hanging if the overlay is busy or the window is gone. */
export function confirm(request: OverlayRequest): Promise<boolean> {
  return present((view) => view.webContents.send('overlay:show', request), false)
}

interface Viewport {
  width: number
  height: number
}

/** Resolves the id of the entry that was picked, or null if the menu was dismissed. */
export function menu(request: Omit<OverlayMenuRequest, 'viewport'>): Promise<string | null> {
  return present<string | null>((view, viewport) => {
    view.webContents.send('overlay:menu', { ...request, viewport })
  }, null)
}

async function present<T>(
  show: (view: WebContentsView, viewport: Viewport) => void,
  cancelled: T
): Promise<T> {
  // One at a time, so a page cannot stack them.
  if (!overlay || overlay.mode === 'blocking') return cancelled

  const current = overlay
  closeZoom(current)
  current.mode = 'blocking'

  const view = ensureView(current)
  // The page has to exist before it can be told what to draw.
  await current.ready

  if (overlay !== current) return cancelled

  const { window } = current
  // Re-parenting puts it back on top of tabs created since the last time.
  window.contentView.removeChildView(view)
  window.contentView.addChildView(view)
  // The same rect goes to the renderer: reading it back can hand over the previous size.
  const area = contentBounds(window)
  view.setBackgroundColor(DIM_BACKGROUND)
  view.setBounds(area)
  view.setVisible(true)
  view.webContents.focus()
  show(view, { width: area.width, height: area.height })

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
  overlay.mode = 'idle'
  overlay.view?.setVisible(false)
  answer(value)
}

/** Shows the zoom row under the address bar. Skipped while a dialog or a menu is up. */
export async function showZoom(state: ZoomState): Promise<void> {
  if (!overlay || overlay.mode === 'blocking') return

  const current = overlay
  const view = ensureView(current)
  await current.ready

  if (overlay !== current || current.mode === 'blocking') return

  const { window, anchor } = current
  // Already up: re-parenting or re-showing it here makes every step of a zoom flicker.
  if (current.mode !== 'zoom') {
    window.contentView.removeChildView(view)
    window.contentView.addChildView(view)
    view.setBackgroundColor(CLEAR_BACKGROUND)
    view.setVisible(true)
  }
  view.setBounds({
    x: Math.max(anchor.x - POPUP.width, POPUP.gap),
    y: anchor.y + POPUP.gap,
    width: POPUP.width,
    height: POPUP.height
  })
  // No focus: the Ctrl+0 that follows has to reach the page, not this layer.
  view.webContents.send('overlay:zoom', state)
  current.mode = 'zoom'
  linger(current)
}

export function hideZoom(): void {
  if (overlay) closeZoom(overlay)
}

export function isZoomShowing(): boolean {
  return overlay?.mode === 'zoom'
}

/** Holds the popup open while the pointer is on it. */
export function holdZoom(hold: boolean): void {
  if (!overlay || overlay.mode !== 'zoom') return

  if (hold) clearLinger(overlay)
  else linger(overlay)
}

function linger(current: Overlay): void {
  clearLinger(current)
  current.linger = setTimeout(() => closeZoom(current), POPUP_LINGER)
}

function clearLinger(current: Overlay): void {
  if (!current.linger) return
  clearTimeout(current.linger)
  current.linger = null
}

function closeZoom(current: Overlay): void {
  clearLinger(current)
  if (overlay !== current || current.mode !== 'zoom') return

  current.mode = 'idle'
  current.view?.setVisible(false)
  current.view?.webContents.send('overlay:zoom', null)
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
  view.setBackgroundColor(DIM_BACKGROUND)
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
