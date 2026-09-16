import { session, WebContentsView, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import {
  CARD_EDGE,
  gutterBounds,
  maxPanelWidth,
  onLayoutChange,
  panelBounds,
  setPanelWidth
} from './layout'
import type { PanelFrame } from '../preload'

/*
 * The AI panel is its own view on its own session, not part of the chrome renderer. It
 * never has to reach over a page, so it sits beside one: the page and its DevTools split
 * what is left. Keeping it apart means a crash there leaves the tabs alone, and the site
 * mode that comes later can log in without touching the browsing session.
 */

const WIDTH = 380
const MIN_WIDTH = 280

// Native views cannot be animated by the renderer, so the width is stepped from here.
const GLIDE_MS = 170
const FRAME_MS = 16

// The card carries its own header, which the chrome paints because a view cannot round
// its own top corners against one.
const BAR = 32

const PARTITION = 'persist:ai'

// The view paints before the page does, so it starts on the chrome color.
const BACKGROUND = '#16161b'

interface Panel {
  window: BrowserWindow
  view: WebContentsView
  /** Where the width is right now, which a glide walks towards its target. */
  width: number
  glide: NodeJS.Timeout | null
  closing: boolean
}

let panel: Panel | null = null

export function attachPanel(window: BrowserWindow): void {
  onLayoutChange(() => {
    if (panel?.window === window) place(panel)
  })

  window.on('closed', () => {
    if (panel?.window !== window) return
    stopGlide(panel)
    panel = null
  })
}

export function isPanelOpen(): boolean {
  return panel !== null
}

export function togglePanel(window: BrowserWindow): void {
  if (!panel) openPanel(window)
  // Caught on the way out: turn around rather than finish closing and open again.
  else if (panel.closing) glide(panel, WIDTH, () => undefined, false)
  else closePanel()
}

export function openPanel(window: BrowserWindow): void {
  if (panel) return

  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/panel.cjs'),
      session: session.fromPartition(PARTITION),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  view.setBackgroundColor(BACKGROUND)
  window.contentView.addChildView(view)

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) void view.webContents.loadURL(`${rendererUrl}/panel.html`)
  else void view.webContents.loadFile(join(import.meta.dirname, '../renderer/panel.html'))

  panel = { window, view, width: 0, glide: null, closing: false }
  // The page area gives up the width, which is a layout change like any other.
  glide(panel, WIDTH, () => undefined, false)
}

export function closePanel(): void {
  if (!panel || panel.closing) return

  glide(panel, 0, destroy, true)
}

/** Steps the width towards a target, since the views cannot tween themselves. */
function glide(current: Panel, target: number, done: () => void, closing: boolean): void {
  stopGlide(current)
  current.closing = closing

  const from = current.width
  const started = Date.now()

  current.glide = setInterval(() => {
    const progress = Math.min((Date.now() - started) / GLIDE_MS, 1)
    // Eased out, so it settles instead of stopping dead.
    current.width = Math.round(from + (target - from) * (1 - (1 - progress) ** 3))
    setPanelWidth(current.width)

    if (progress < 1) return
    stopGlide(current)
    done()
  }, FRAME_MS)
}

function stopGlide(current: Panel): void {
  if (!current.glide) return
  clearInterval(current.glide)
  current.glide = null
}

function destroy(): void {
  if (!panel) return

  const { window, view } = panel
  panel = null
  if (!window.isDestroyed()) window.contentView.removeChildView(view)
  if (!view.webContents.isDestroyed()) view.webContents.close()
  setPanelWidth(0)
}

/** Drags the edge to the pointer. Stored clamped, or the drag sticks at the limits. */
export function resizePanel(window: BrowserWindow, point: { x: number }): void {
  if (!panel || panel.window !== window || window.isDestroyed()) return

  // A drag wins over whatever the glide was doing.
  stopGlide(panel)
  panel.closing = false

  const card = panelBounds(window)
  const wanted = Math.round(card.x + card.width - point.x)
  panel.width = Math.min(Math.max(wanted, MIN_WIDTH), maxPanelWidth(window))
  setPanelWidth(panel.width)
}

/** What the chrome draws for the panel, or null while it is closed. */
export function panelFrame(window: BrowserWindow): PanelFrame | null {
  if (!panel || panel.window !== window || window.isDestroyed()) return null

  const card = panelBounds(window)
  if (card.width === 0) return null

  return { gutter: gutterBounds(window), card, header: Math.min(BAR, card.height) }
}

function place(current: Panel): void {
  if (current.window.isDestroyed()) return

  const card = panelBounds(current.window)
  const header = Math.min(BAR, card.height)
  current.view.setBounds({
    x: card.x,
    y: card.y + header,
    width: card.width,
    height: Math.max(card.height - header - CARD_EDGE, 0)
  })
}
