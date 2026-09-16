import { WebContentsView, type BrowserWindow, type Rectangle, type WebContents } from 'electron'
import { refreshLayout } from './layout'
import type { DevToolsFrame, DevToolsSide } from '../preload'

/*
 * DevTools draws in a view we own so it can sit next to the page instead of in its own
 * window. Two things about that are not visible from the code: `contents.closeDevTools()`
 * must never be called, because after it the page can never show DevTools again, not even
 * through a fresh view; and `contents.isDevToolsOpened()` stays false once DevTools has
 * been redirected, so the map below is the only record of what is open.
 */

// What the page and DevTools each keep when the split is dragged to an extreme. The
// DevTools figure covers its bar as well, since the bar rides along with it.
const LIMITS: Record<DevToolsSide, { self: number; page: number }> = {
  left: { self: 260, page: 200 },
  bottom: { self: 184, page: 120 },
  right: { self: 260, page: 200 }
}

const ORDER: DevToolsSide[] = ['left', 'bottom', 'right']

// Chrome the page and DevTools leave for us: a gap that resizes the split, and a bar
// above DevTools that carries its buttons. Both are drawn by the chrome renderer.
const GAP = 6
const BAR = 24

// The view paints before the front end does, so it starts on the chrome color.
const BACKGROUND = '#16161b'

interface Docked {
  window: BrowserWindow
  view: WebContentsView
}

interface Split {
  page: Rectangle
  /** The bar and the view below it, or null while DevTools is closed. */
  bar: Rectangle | null
  devtools: Rectangle | null
}

const docked = new Map<number, Docked>()

// Every tab docks the same way, the way a browser remembers one dock side.
let side: DevToolsSide = 'bottom'
const fraction: Record<DevToolsSide, number> = { left: 0.4, bottom: 0.45, right: 0.4 }

export function isDevToolsOpen(contents: WebContents): boolean {
  return docked.has(contents.id)
}

/** Returns the new view, so the caller can give it the keys it needs. */
export function openDevTools(window: BrowserWindow, contents: WebContents): WebContentsView | null {
  if (docked.has(contents.id)) return null

  const view = new WebContentsView()
  view.setBackgroundColor(BACKGROUND)
  window.contentView.addChildView(view)
  contents.setDevToolsWebContents(view.webContents)
  contents.openDevTools({ mode: 'detach' })

  docked.set(contents.id, { window, view })
  refreshLayout()
  return view
}

/** Closes by destroying the view. The session dies with it and rebinding still works. */
export function closeDevTools(contents: WebContents): void {
  const open = docked.get(contents.id)
  if (!open) return

  docked.delete(contents.id)
  if (!open.window.isDestroyed()) open.window.contentView.removeChildView(open.view)
  if (!open.view.webContents.isDestroyed()) open.view.webContents.close()
  refreshLayout()
}

/** Hidden tabs keep their session, so switching back costs nothing. */
export function setDevToolsVisible(contents: WebContents, visible: boolean): void {
  docked.get(contents.id)?.view.setVisible(visible)
}

/** Places the DevTools view in the area and returns what is left for the page. */
export function placeDevTools(contents: WebContents, area: Rectangle): Rectangle {
  const { page, devtools } = split(contents, area)
  if (devtools) docked.get(contents.id)?.view.setBounds(devtools)
  return page
}

/** What the chrome renderer has to draw around DevTools. */
export function devToolsFrame(contents: WebContents, area: Rectangle): DevToolsFrame | null {
  const { page, bar } = split(contents, area)
  if (!bar) return null

  const seam =
    side === 'bottom'
      ? { x: area.x, y: page.y + page.height, width: area.width, height: GAP }
      : {
          x: side === 'right' ? page.x + page.width : page.x - GAP,
          y: area.y,
          width: GAP,
          height: area.height
        }

  return { side, seam, bar }
}

/** Puts the split under the pointer. Stored clamped, or the drag sticks at the limits. */
export function resizeDevTools(area: Rectangle, point: { x: number; y: number }): void {
  const room = roomIn(area)
  if (room === 0) return

  fraction[side] = sizeFor(room, reachOf(area, point)) / room
  refreshLayout()
}

/** 'cycle' is what the keyboard sends, since a key cannot name a side. */
export function dockDevTools(next: DevToolsSide | 'cycle'): void {
  side = next === 'cycle' ? ORDER[(ORDER.indexOf(side) + 1) % ORDER.length] : next
  refreshLayout()
}

/** The slice DevTools gets is the bar with its view under it. */
function split(contents: WebContents, area: Rectangle): Split {
  if (!docked.has(contents.id)) return { page: area, bar: null, devtools: null }

  const room = roomIn(area)
  const size = sizeFor(room, Math.round(room * fraction[side]))

  if (side === 'bottom') {
    const top = area.y + area.height - size
    return {
      page: { ...area, height: room - size },
      bar: { x: area.x, y: top, width: area.width, height: BAR },
      devtools: { x: area.x, y: top + BAR, width: area.width, height: Math.max(size - BAR, 0) }
    }
  }

  const x = side === 'right' ? area.x + area.width - size : area.x
  return {
    page:
      side === 'right'
        ? { ...area, width: room - size }
        : { ...area, x: area.x + size + GAP, width: room - size },
    bar: { x, y: area.y, width: size, height: BAR },
    devtools: { x, y: area.y + BAR, width: size, height: Math.max(area.height - BAR, 0) }
  }
}

/** How far the pointer sits from the edge DevTools is docked against. */
function reachOf(area: Rectangle, point: { x: number; y: number }): number {
  if (side === 'bottom') return area.y + area.height - point.y
  if (side === 'right') return area.x + area.width - point.x
  return point.x - area.x
}

function roomIn(area: Rectangle): number {
  return Math.max((side === 'bottom' ? area.height : area.width) - GAP, 0)
}

/** Neither side may be squeezed out, and in a small window the limits give way in order. */
function sizeFor(room: number, wanted: number): number {
  const largest = Math.max(room - LIMITS[side].page, 0)
  return Math.min(Math.max(wanted, Math.min(LIMITS[side].self, largest)), largest)
}
