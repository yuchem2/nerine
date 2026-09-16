import { ipcMain, type BrowserWindow, type Rectangle } from 'electron'

// The renderer measures its chrome and reports the real height. This covers the first frames.
const FALLBACK_CHROME_HEIGHT = 79

// A page narrower than this is not worth keeping, so the panel gives way first.
const MIN_PAGE_WIDTH = 320

/*
 * With the panel open the area under the chrome holds two cards, so it takes on window
 * spacing: GAP around the pair and GUTTER between them. With the panel closed the page
 * keeps the whole area and none of this applies.
 */
const GAP = 8
const GUTTER = 10

/*
 * A view cannot round two of its corners and leave the other two square, and a rounded
 * parent does not clip it either. So the chrome draws the card and keeps a band of it
 * above and below the views, which is where the corners live. The views stay square.
 */
export const CARD_EDGE = 10

let chromeHeight = FALLBACK_CHROME_HEIGHT
let panelWidth = 0
const listeners = new Set<() => void>()

export function isPanelLaidOut(): boolean {
  return panelWidth > 0
}

/** The card the page and its DevTools share, or null while the page fills the window. */
export function cardBounds(window: BrowserWindow): Rectangle | null {
  const { width, height } = window.getContentBounds()
  const panel = laidOut(width)
  if (panel === 0) return null

  return {
    x: GAP,
    y: chromeHeight + GAP,
    width: Math.max(width - panel - GUTTER - GAP * 2, 0),
    height: Math.max(height - chromeHeight - GAP * 2, 0)
  }
}

/** Where the page and its DevTools sit: the whole area, or inside the card's bands. */
export function pageBounds(window: BrowserWindow): Rectangle {
  const card = cardBounds(window)
  if (!card) {
    const { width, height } = window.getContentBounds()
    return { x: 0, y: chromeHeight, width, height: Math.max(height - chromeHeight, 0) }
  }

  return {
    x: card.x,
    y: card.y + CARD_EDGE,
    width: card.width,
    height: Math.max(card.height - CARD_EDGE * 2, 0)
  }
}

/** The card the panel draws in, alongside the page. */
export function panelBounds(window: BrowserWindow): Rectangle {
  const { width, height } = window.getContentBounds()
  const panel = laidOut(width)

  return {
    x: width - panel - GAP,
    y: chromeHeight + GAP,
    width: panel,
    height: Math.max(height - chromeHeight - GAP * 2, 0)
  }
}

/** The gutter between the two cards, which drags the split. */
export function gutterBounds(window: BrowserWindow): Rectangle {
  const panel = panelBounds(window)
  return { x: panel.x - GUTTER, y: panel.y, width: GUTTER, height: panel.height }
}

/** The widest the panel may get. Clamping here keeps a drag from sticking at the limit. */
export function maxPanelWidth(window: BrowserWindow): number {
  const { width } = window.getContentBounds()
  return Math.max(width - MIN_PAGE_WIDTH - GUTTER - GAP * 2, 0)
}

/** Zero closes the panel. The page keeps its minimum whatever the panel asks for. */
export function setPanelWidth(width: number): void {
  panelWidth = Math.max(Math.round(width), 0)
  notify()
}

function laidOut(width: number): number {
  if (panelWidth === 0) return 0
  return Math.min(panelWidth, Math.max(width - MIN_PAGE_WIDTH - GUTTER - GAP * 2, 0))
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
