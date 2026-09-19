import { app, session, shell, WebContentsView, type BrowserWindow, type Rectangle } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { adapterFor } from './ai/registry'
import { FIRST_RUN, readPanelState, writePanelState, type PanelState } from './panelstate'
import { nextZoom } from './zoom'
import {
  CARD_EDGE,
  gutterBounds,
  maxPanelWidth,
  onLayoutChange,
  panelBounds,
  refreshLayout,
  setPanelWidth
} from './layout'
import type { PageHandle, PanelFrame, PanelMode, ProviderId } from '../preload'

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

// A site laid out for a desktop in a panel this narrow needs to start well under full
// size. This is not one of the zoom steps, so the first press lands on the nearest.
const SITE_ZOOM = 0.6

// A site that never finishes is still worth looking at rather than hiding for good.
const SWAP_LIMIT_MS = 10_000

// Long enough to read, short enough not to become part of the furniture.
const COPIED_MS = 2500

// The card carries its own header, which the chrome paints because a view cannot round
// its own top corners against one. Site mode adds a footer, which is where handing the
// page over belongs: the site's own composer is at the bottom too.
const BAR = 32
// The foot takes the card's bottom band with it: the button runs to the edge and
// carries the card's corners itself, so there is nothing to pad.
const FOOT = 30

const PARTITION = 'persist:ai'

// The view paints before the page does, so it starts on the chrome color.
const BACKGROUND = '#16161b'

interface Panel {
  window: BrowserWindow
  /** Our own page, which holds the conversation. */
  view: WebContentsView
  /** Resolves once `view` has loaded, so nothing is sent to it too soon. */
  ready: Promise<void>
  /** The provider's site, made the first time it is asked for. */
  site: WebContentsView | null
  siteOf: ProviderId | null
  /** Whose site the panel shows, which has nothing to do with whose key is on file. */
  siteProvider: ProviderId
  siteZoom: number
  siteLoading: boolean
  /** True from asking for another provider's site until that site can be seen. */
  siteSwapping: boolean
  swapLimit: NodeJS.Timeout | null
  copied: NodeJS.Timeout | null
  /** How much text the last copy carried, or zero once that has been said. */
  copiedAt: number
  /** Whichever provider the panel is chatting with, which only it knows. */
  provider: ProviderId | null
  mode: PanelMode
  /** Where the width is right now, which a glide walks towards its target. */
  width: number
  glide: NodeJS.Timeout | null
  closing: boolean
}

let panel: Panel | null = null

// What the last run left behind, read once so opening the panel never waits on disk.
let remembered: PanelState = FIRST_RUN

export function attachPanel(window: BrowserWindow): void {
  void readPanelState().then((state) => {
    remembered = state
  })

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
  const page = join(import.meta.dirname, '../renderer/panel.html')
  const own = rendererUrl ? `${rendererUrl}/panel.html` : pathToFileURL(page).href

  /*
   * Nothing replaces the conversation. An answer is written by a model and can hold any
   * address it likes: followed in here it would take the panel with it, so a link goes to
   * a tab and this view stays on the one page it was given.
   */
  view.webContents.on('will-navigate', (details) => {
    if (!details.url.startsWith(own)) details.preventDefault()
  })
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const ready = new Promise<void>((resolve) => {
    view.webContents.once('did-finish-load', () => resolve())
  })

  if (rendererUrl) void view.webContents.loadURL(own)
  else void view.webContents.loadFile(page)

  panel = {
    window,
    view,
    ready,
    site: null,
    siteOf: null,
    siteProvider: remembered.provider,
    siteZoom: remembered.zoom,
    siteLoading: false,
    siteSwapping: false,
    swapLimit: null,
    copied: null,
    copiedAt: 0,
    provider: null,
    mode: 'chat',
    width: 0,
    glide: null,
    closing: false
  }
  // The page area gives up the width, which is a layout change like any other.
  glide(panel, WIDTH, () => undefined, false)

  // Back to whatever was on last time, at the page it was left on.
  if (remembered.mode === 'site') showSite(window, remembered.provider, remembered.url)
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

  const { window, view, site } = panel
  clearTimeout(panel.swapLimit ?? undefined)
  clearTimeout(panel.copied ?? undefined)
  panel = null

  for (const child of [view, site]) {
    if (!child) continue
    if (!window.isDestroyed()) window.contentView.removeChildView(child)
    if (!child.webContents.isDestroyed()) child.webContents.close()
  }
  setPanelWidth(0)
}

/**
 * Shows the provider's own site instead of our conversation, on the panel's session so a
 * sign in there stays out of the browsing one. Both views stay alive: switching back and
 * forth should cost nothing and lose nothing.
 */
export function showSite(window: BrowserWindow, provider?: ProviderId, at?: string | null): void {
  if (!panel || panel.window !== window) return

  const chosen = provider ?? panel.siteProvider
  const landing = adapterFor(chosen).site
  // Where it was left, as long as that is still the same provider's site.
  const url = at && at.startsWith(new URL(landing).origin) ? at : landing
  panel.siteProvider = chosen
  if (!panel.site) {
    const site = new WebContentsView({
      webPreferences: {
        session: session.fromPartition(PARTITION),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    site.setBackgroundColor(BACKGROUND)
    // A site that wants a window gets the browser, not a second panel.
    site.webContents.setWindowOpenHandler(({ url: opened }) => {
      void shell.openExternal(opened)
      return { action: 'deny' }
    })
    // A page left open is worth coming back to, so the address is kept as it moves.
    site.webContents.on('did-navigate', remember)
    site.webContents.on('did-navigate-in-page', remember)
    // The header says so while a site is on its way, which is most of what a switch shows.
    site.webContents.on('did-start-loading', () => loading(true))
    site.webContents.on('did-stop-loading', () => loading(false))
    // A document ready to read is the moment to look at it. Waiting for every last
    // subresource would hold a usable page behind the spinner.
    site.webContents.on('dom-ready', arrived)
    site.webContents.on('did-fail-load', arrived)
    window.contentView.addChildView(site)
    panel.site = site
  }

  if (panel.siteOf !== chosen) {
    // Another provider's site takes seconds to arrive. Rather than sit on the last one or
    // flash an empty view, the view stands aside and the chrome draws the wait.
    panel.siteSwapping = true
    panel.site.setVisible(false)
    clearTimeout(panel.swapLimit ?? undefined)
    panel.swapLimit = setTimeout(arrived, SWAP_LIMIT_MS)
    void panel.site.webContents.loadURL(url)
    panel.siteOf = chosen
  }
  panel.site.webContents.setZoomFactor(panel.siteZoom)

  panel.mode = 'site'
  show(panel)
  remember()
}

export function showChat(window: BrowserWindow): void {
  if (!panel || panel.window !== window) return
  panel.mode = 'chat'
  show(panel)
  remember()
}

/** Keeps what the next run should open with: which mode, whose site, where, at what zoom. */
function remember(): void {
  if (!panel) return

  const url = panel.site?.webContents.getURL()
  // Spread, so what was agreed to once is carried rather than listed here.
  remembered = {
    ...remembered,
    mode: panel.mode,
    provider: panel.siteProvider,
    url: url && url.startsWith('https://') ? url : remembered.url,
    zoom: panel.siteZoom
  }
  void writePanelState(remembered)
}

export function setPanelProvider(provider: ProviderId | null): void {
  if (!panel || panel.provider === provider) return
  panel.provider = provider
  refreshLayout()
}

/** The site arrives at desktop width, and the panel is not one. */
export function zoomSite(direction: 1 | -1 | 0): void {
  if (!panel?.site) return

  const factor = direction === 0 ? SITE_ZOOM : nextZoom(panel.siteZoom, direction)
  if (factor === null) return

  panel.siteZoom = factor
  panel.site.webContents.setZoomFactor(factor)
  refreshLayout()
  remember()
}

/** Whether copying the page block to the clipboard has been explained and accepted. */
export function pageSharingAccepted(): boolean {
  return remembered.shared
}

export function acceptPageSharing(): void {
  remembered = { ...remembered, shared: true }
  void writePanelState(remembered)
}

/** The same question for the other destination, which is a provider over the network. */
export function pageAttachAccepted(): boolean {
  return remembered.attached
}

export function acceptPageAttach(): void {
  remembered = { ...remembered, attached: true }
  void writePanelState(remembered)
}

/** Which page the conversation is sitting next to. Only the chat view is ever told. */
export function tellPanelPage(page: PageHandle | null): void {
  if (!panel || panel.view.webContents.isDestroyed()) return
  panel.view.webContents.send('page:current', page)
}

/** A prompt takes the keyboard while it is up, so the composer takes it back after. */
export function focusPanel(): void {
  if (!panel || panel.view.webContents.isDestroyed()) return
  panel.view.webContents.focus()
}

export type SelectionAction = 'explain' | 'translate'

/** Opens the panel on the selected text, the way one of the floating buttons asks for it. */
export function askSelection(
  window: BrowserWindow,
  action: SelectionAction,
  text: string,
  language?: string
): void {
  if (!panel || panel.window !== window) openPanel(window)
  if (!panel || panel.window !== window) return

  showChat(window)
  const current = panel
  const question = selectionQuestion(action, text, language)
  void current.ready.then(() => {
    if (panel === current) current.view.webContents.send('panel:ask-selection', question)
  })
}

function selectionQuestion(action: SelectionAction, text: string, language?: string): string {
  const quoted = `"${text}"`
  if (action === 'translate') return `Translate this into ${language ?? systemLanguage()}:\n\n${quoted}`
  // Written in English so the instruction itself never reads as what language to answer in.
  return `Explain this, replying in the language it is written in:\n\n${quoted}`
}

export interface LanguageChoice {
  id: string
  /** The language's own name, which is what goes to a provider. */
  name: string
  /** What the picker shows, which may say more than the name does. */
  label: string
}

// Enough to cover the common case without turning the picker into every language there is.
const QUICK_LANGUAGES = ['en', 'ko', 'ja', 'zh', 'es', 'fr']

/** The machine's own language pinned first, then a short, easy-to-scan list of common ones. */
export function translateLanguages(): LanguageChoice[] {
  const system = app.getLocale().split('-')[0]
  const codes = [system, ...QUICK_LANGUAGES.filter((code) => code !== system)]
  const names = new Intl.DisplayNames(['en'], { type: 'language' })

  return codes.map((code, index) => {
    const name = names.of(code) ?? code
    return { id: code, name, label: index === 0 ? `${name} (default)` : name }
  })
}

/** What to translate into when nobody has picked one, such as a direct call with none given. */
function systemLanguage(): string {
  return translateLanguages()[0].name
}

/** Says the page went to the clipboard, and how much of it, while that is worth saying. */
export function markPageCopied(characters: number): void {
  if (!panel) return

  clearTimeout(panel.copied ?? undefined)
  panel.copiedAt = characters
  panel.copied = setTimeout(() => {
    if (!panel) return
    panel.copiedAt = 0
    panel.copied = null
    refreshLayout()
  }, COPIED_MS)
  refreshLayout()
}

export function siteProvider(): ProviderId {
  return panel?.siteProvider ?? 'anthropic'
}

export function panelMode(): PanelMode {
  return panel?.mode ?? 'chat'
}

function loading(active: boolean): void {
  if (!panel || panel.siteLoading === active) return
  panel.siteLoading = active
  refreshLayout()
}

/** The new site has something to show, so it takes the card back. */
function arrived(): void {
  if (!panel?.siteSwapping) return

  clearTimeout(panel.swapLimit ?? undefined)
  panel.swapLimit = null
  panel.siteSwapping = false
  if (panel.mode === 'site') panel.site?.setVisible(true)
  refreshLayout()
}

/*
 * The one coming in is shown before the one going out is hidden. Doing both at once
 * leaves a frame where neither has painted, which is the flicker.
 */
function show(current: Panel): void {
  const mode = current.mode
  const incoming = mode === 'chat' ? current.view : current.site
  const outgoing = mode === 'chat' ? current.site : current.view

  place(current)
  // A site still on its way stays out of sight, so the wait is drawn instead.
  if (!(mode === 'site' && current.siteSwapping)) incoming?.setVisible(true)
  setTimeout(() => {
    // A second switch may have landed by now, and it owns what is on screen.
    if (panel === current && current.mode === mode && outgoing) outgoing.setVisible(false)
  }, FRAME_MS * 2)

  // The chrome draws the header, so it only knows the mode changed once it is told.
  refreshLayout()
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

  return {
    gutter: gutterBounds(window),
    card,
    header: header(card),
    mode: panel.mode,
    provider: panel.provider,
    body: bodyOf(card, header(card), footer(card, panel.mode)),
    footer:
      footer(card, panel.mode) === 0
        ? null
        : {
            x: card.x,
            y: card.y + card.height - footer(card, panel.mode),
            width: card.width,
            height: footer(card, panel.mode)
          },
    copied: panel.copiedAt,
    site: {
      provider: panel.siteProvider,
      zoom: Math.round(panel.siteZoom * 100),
      loading: panel.siteLoading,
      waiting: panel.siteSwapping
    }
  }
}

function place(current: Panel): void {
  if (current.window.isDestroyed()) return

  const card = panelBounds(current.window)
  const body = bodyOf(card, header(card), footer(card, current.mode))

  // Both are laid out, so the one out of sight is never shown at a stale size.
  current.view.setBounds(body)
  current.site?.setBounds(body)
}

/** What the card holds between its header and whatever sits at its foot. */
function bodyOf(card: Rectangle, top: number, bottom: number): Rectangle {
  // With no footer the band at the bottom of the card is what carries the corners.
  const edge = bottom === 0 ? CARD_EDGE : 0
  return {
    x: card.x,
    y: card.y + top,
    width: card.width,
    height: Math.max(card.height - top - bottom - edge, 0)
  }
}

function header(card: Rectangle): number {
  return Math.min(BAR, card.height)
}

/** Only the site needs one: our own page has a composer of its own down there. */
function footer(card: Rectangle, mode: PanelMode): number {
  if (mode !== 'site') return 0
  return Math.min(FOOT, Math.max(card.height - BAR, 0))
}
