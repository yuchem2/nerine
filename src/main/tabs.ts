import { ipcMain, shell, WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import {
  copyPageForAi,
  runCommand,
  showContextMenu,
  showSiteMenu,
  type Command,
  type CommandContext
} from './commands'
import {
  closeDevTools,
  devToolsFrame,
  placeDevTools,
  resizeDevTools,
  setDevToolsVisible
} from './devtools'
import { canExtract, extractPage } from './ai/extract'
import { cardBounds, onLayoutChange, pageBounds } from './layout'
import {
  acceptPageAttach,
  askSelection,
  focusPanel,
  pageAttachAccepted,
  panelFrame,
  resizePanel,
  setPanelProvider,
  showChat,
  showSite,
  tellPanelPage,
  translateLanguages,
  zoomSite
} from './panel'
import {
  confirm,
  hideSelectionButton,
  hideZoom,
  holdZoom,
  isZoomShowing,
  menu,
  showSelectionButton,
  showZoom
} from './overlay'
import { readSelection } from './selection'
import { trackPage } from './perf'
import { adapterFor } from './ai/registry'
import { PAGE_LIMIT } from './ai/prompt'
import { isProvider } from './secrets'
import { attachShortcuts } from './shortcuts'
import { DEFAULT_ZOOM, nextZoom } from './zoom'
import type {
  BrowserState,
  DevToolsFrame,
  DevToolsSide,
  PageContext,
  PageHandle,
  PanelFrame,
  PanelMode,
  ProviderId,
  Rect,
  TabState,
  ZoomAction,
  ZoomState
} from '../preload'

const HOME_URL = 'https://google.com'
const NEW_TAB_URL = 'about:blank'
// The scheme is the only part of the prompt a link supplies, so it cannot run long.
const MAX_SCHEME_LABEL = 32

const SELECTION_POLL_MS = 400
// Wide enough for both buttons: 'Explain' and 'Translate' side by side, with room to spare.
// Too tight and 'Translate' clips, which cost more than looks: a click aimed at the letters
// that got cut lands past the view, on the page, and that click is what clears the selection.
const SELECTION_BUTTON = { width: 208, height: 32, gap: 8 }

interface Tab {
  id: number
  view: WebContentsView
  faviconUrl: string | null
}

export interface Tabs {
  read: () => BrowserState
  newTab: () => void
  create: (url: string, activate: boolean) => void
  close: (id: number) => void
  closeActive: () => void
  select: (id: number) => void
  /** A negative index means the last tab. */
  selectAt: (index: number) => void
  cycle: (delta: number) => void
  zoom: (direction: 1 | -1) => void
  resetZoom: () => void
  toggleZoomPopup: () => void
  resizeDevTools: (point: { x: number; y: number }) => void
  activeContents: () => WebContents | null
}

let context: CommandContext | null = null

/** Owns every page in the window and keeps the renderer told about them. */
export function attachTabs(window: BrowserWindow): void {
  const open: Tab[] = []
  let activeId = -1
  let asking = false
  let lastChrome = ''
  let lastPage = ''
  let lastSelection = ''
  // The button answers once and hides; the same text picked again should not bring it back.
  let actionedSelection = ''

  /**
   * The page picked this scheme, not the user, so anything unfamiliar is confirmed
   * first. file: never goes out: a page could point it at any path on the machine.
   */
  const handOff = async (url: string): Promise<void> => {
    const protocol = protocolOf(url)
    if (protocol === '' || protocol === 'file:') return

    if (QUIET_SCHEMES.has(protocol)) {
      await shell.openExternal(url)
      return
    }
    // One prompt at a time, so a page cannot stack them.
    if (asking) return
    asking = true
    try {
      const scheme = protocol.replace(':', '')
      const confirmed = await confirm({
        title: 'Open in another application',
        message:
          scheme.length <= MAX_SCHEME_LABEL
            ? `Let another application handle this ${scheme} link?`
            : 'Let another application handle this link?',
        // Truncated, so a long URL cannot push what matters out of view.
        detail: url.length > 200 ? `${url.slice(0, 200)}...` : url,
        confirmLabel: 'Open',
        cancelLabel: 'Cancel'
      })
      // The prompt held focus while it was up, so the page takes it back either way.
      active()?.view.webContents.focus()
      if (confirmed) await shell.openExternal(url)
    } finally {
      asking = false
    }
  }

  const find = (id: number): Tab | undefined => open.find((tab) => tab.id === id)
  const active = (): Tab | undefined => find(activeId)

  // Hidden tabs are laid out too, so switching never shows a stale size.
  const layout = (): void => {
    // Tearing DevTools down on the way out runs this once more, with nothing to measure.
    if (window.isDestroyed()) return

    const bounds = pageBounds(window)
    for (const tab of open) tab.view.setBounds(placeDevTools(tab.view.webContents, bounds))

    // The chrome draws the strips the views leave it, so it hears where they moved.
    const next = JSON.stringify([frame(), panel(), card()])
    if (next === lastChrome) return
    lastChrome = next
    publish()
  }

  const toState = (tab: Tab): TabState => {
    const contents = tab.view.webContents
    return {
      id: tab.id,
      url: contents.getURL(),
      title: contents.getTitle(),
      faviconUrl: tab.faviconUrl,
      isLoading: contents.isLoading(),
      zoomFactor: contents.getZoomFactor(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward()
    }
  }

  const frame = (): DevToolsFrame | null => {
    const tab = active()
    if (!tab || window.isDestroyed()) return null
    return devToolsFrame(tab.view.webContents, pageBounds(window))
  }

  const panel = (): PanelFrame | null => (window.isDestroyed() ? null : panelFrame(window))
  const card = (): Rect | null => (window.isDestroyed() ? null : cardBounds(window))

  const read = (): BrowserState => ({
    tabs: open.map(toState),
    activeId,
    devTools: frame(),
    panel: panel(),
    card: card()
  })

  const publish = (): void => {
    if (window.isDestroyed()) return
    window.webContents.send('tabs:state', read())
    tellPage()
  }

  const tellPage = (): void => {
    const page = facingPage()
    const next = JSON.stringify(page)
    if (next === lastPage) return
    lastPage = next
    tellPanelPage(page)
  }

  /** Polls the active tab for a selection, since nothing pushes one out on its own. */
  const pollSelection = async (): Promise<void> => {
    const tab = active()
    if (!tab) return

    const found = await readSelection(tab.view.webContents)
    const text = found?.text ?? ''
    if (text === lastSelection) return
    lastSelection = text

    if (!found || text === actionedSelection) {
      hideSelectionButton()
      return
    }

    // getBoundingClientRect answers in the page's own CSS pixels, which a page zoom scales
    // against the view's actual size: 1 CSS px is `zoom` view pixels, not one.
    const zoom = tab.view.webContents.getZoomFactor()
    const rectX = found.rect.x * zoom
    const rectY = found.rect.y * zoom
    const rectHeight = found.rect.height * zoom

    const area = pageBounds(window)
    const above = area.y + rectY - SELECTION_BUTTON.height - SELECTION_BUTTON.gap
    const rect = {
      x: Math.min(Math.max(area.x + rectX, area.x), area.x + area.width - SELECTION_BUTTON.width),
      y: above >= area.y ? above : area.y + rectY + rectHeight + SELECTION_BUTTON.gap,
      width: SELECTION_BUTTON.width,
      height: SELECTION_BUTTON.height
    }

    showSelectionButton(rect, (action) => {
      if (action !== 'explain' && action !== 'translate') return
      actionedSelection = text
      hideSelectionButton()

      if (action === 'explain') {
        askSelection(window, 'explain', text)
        return
      }

      // A short, fixed list rather than every language there is, so picking one stays quick.
      const choices = translateLanguages()
      void menu({
        x: rect.x,
        y: rect.y + rect.height + SELECTION_BUTTON.gap,
        entries: choices.map(({ id, label }) => ({ id, label, enabled: true }))
      }).then((picked) => {
        const chosen = choices.find((choice) => choice.id === picked)
        if (chosen) askSelection(window, 'translate', text, chosen.name)
      })
    })
  }

  const select = (id: number): void => {
    const tab = find(id)
    if (!tab) return

    for (const other of open) {
      other.view.setVisible(other.id === id)
      // DevTools keeps its session while the tab is away, so it only goes out of sight.
      setDevToolsVisible(other.view.webContents, other.id === id)
    }
    // The popup belongs to the tab it was opened for.
    hideZoom()
    hideSelectionButton()
    lastSelection = ''
    actionedSelection = ''
    activeId = id
    layout()
    tab.view.webContents.focus()
    publish()
  }

  const selectAt = (index: number): void => {
    const tab = index < 0 ? open[open.length - 1] : open[index]
    if (tab) select(tab.id)
  }

  const cycle = (delta: number): void => {
    const index = open.findIndex((tab) => tab.id === activeId)
    if (index === -1) return
    select(open[(index + delta + open.length) % open.length].id)
  }

  const zoomState = (tab: Tab): ZoomState => {
    const factor = tab.view.webContents.getZoomFactor()
    return {
      percent: Math.round(factor * 100),
      canZoomIn: nextZoom(factor, 1) !== null,
      canZoomOut: nextZoom(factor, -1) !== null
    }
  }

  const zoomTab = (tab: Tab, direction: 1 | -1): void => {
    const factor = nextZoom(tab.view.webContents.getZoomFactor(), direction)
    if (factor !== null) tab.view.webContents.setZoomFactor(factor)
    publish()
    if (tab.id === activeId) void showZoom(zoomState(tab))
  }

  const create = (url: string, activate: boolean): void => {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const tab: Tab = { id: view.webContents.id, view, faviconUrl: null }

    open.push(tab)
    window.contentView.addChildView(view)
    view.setVisible(false)
    watch(tab)
    trackPage(view.webContents)
    void view.webContents.loadURL(url)

    if (activate) select(tab.id)
    else {
      layout()
      publish()
    }
  }

  const close = (id: number): void => {
    const index = open.findIndex((tab) => tab.id === id)
    if (index === -1) return

    const [tab] = open.splice(index, 1)
    closeDevTools(tab.view.webContents)
    window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()

    if (open.length === 0) {
      window.close()
      return
    }
    if (activeId === id) select(open[Math.min(index, open.length - 1)].id)
    else publish()
  }

  const watch = (tab: Tab): void => {
    const contents = tab.view.webContents

    contents.on('did-start-loading', publish)
    contents.on('did-stop-loading', publish)
    contents.on('did-navigate-in-page', publish)
    contents.on('page-title-updated', publish)
    contents.on('did-navigate', () => {
      tab.faviconUrl = null
      publish()
    })
    contents.on('page-favicon-updated', (_event, favicons) => {
      tab.faviconUrl = favicons[0] ?? null
      publish()
    })

    // Ctrl and the wheel arrives here rather than as a key.
    contents.on('zoom-changed', (_event, direction) => {
      zoomTab(tab, direction === 'in' ? 1 : -1)
    })

    attachShortcuts(contents, dispatch)
    contents.on('context-menu', (_event, params) => {
      void showContextMenu(params, ctx)
    })

    // A link that wants its own window becomes a tab. Only other schemes leave.
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (isPageUrl(url)) create(url, disposition !== 'background-tab')
      else void handOff(url)
      return { action: 'deny' }
    })

    contents.on('will-navigate', (details) => {
      if (isPageUrl(details.url)) return
      details.preventDefault()
      void handOff(details.url)
    })
  }

  const controller: Tabs = {
    read,
    newTab: () => create(NEW_TAB_URL, true),
    create,
    close,
    closeActive: () => close(activeId),
    select,
    selectAt,
    cycle,
    zoom: (direction) => {
      const tab = active()
      if (tab) zoomTab(tab, direction)
    },
    resetZoom: () => {
      const tab = active()
      if (!tab) return
      tab.view.webContents.setZoomFactor(DEFAULT_ZOOM)
      publish()
      // Back to normal is its own feedback: the button in the address bar goes away.
      hideZoom()
    },
    toggleZoomPopup: () => {
      const tab = active()
      if (!tab) return
      if (isZoomShowing()) hideZoom()
      else void showZoom(zoomState(tab))
    },
    resizeDevTools: (point) => {
      if (!window.isDestroyed()) resizeDevTools(pageBounds(window), point)
    },
    activeContents: () => active()?.view.webContents ?? null
  }
  const ctx: CommandContext = { window, tabs: controller }

  onLayoutChange(layout)
  const selectionTimer = setInterval(() => void pollSelection(), SELECTION_POLL_MS)
  window.on('closed', () => {
    clearInterval(selectionTimer)
    for (const tab of open) closeDevTools(tab.view.webContents)
    context = null
  })

  context = ctx
  create(HOME_URL, true)
}

/** Opens a URL as a tab, for the parts of main that have no command of their own. */
export function openTab(url: string): void {
  context?.tabs.create(url, true)
}

/** What the panel puts on its attach chip. The text stays here until it is asked for. */
function facingPage(): PageHandle | null {
  const contents = context?.tabs.activeContents()
  if (!contents) return null

  const url = contents.getURL()
  return canExtract(url) ? { title: contents.getTitle(), url } : null
}

/**
 * The page's text, for a question about to go out. Where it is going is said once and
 * agreed to first: the clipboard and a provider are different destinations, so agreeing
 * to one says nothing about the other.
 */
async function capturePage(provider: ProviderId): Promise<PageContext | null> {
  const contents = context?.tabs.activeContents()
  if (!contents) return null

  const page = await extractPage(contents)
  if (!page) return null

  if (!pageAttachAccepted()) {
    const label = adapterFor(provider).label
    const agreed = await confirm({
      title: `Send this page to ${label}`,
      message: `Its title, address and ${page.size.toLocaleString()} characters of text go to ${label} along with your question. Long pages are cut at ${PAGE_LIMIT.toLocaleString()}.`,
      detail: page.url.length > 200 ? `${page.url.slice(0, 200)}...` : page.url,
      confirmLabel: 'Send',
      cancelLabel: 'Cancel'
    })
    // The prompt held the keyboard while it was up, so the composer takes it back.
    focusPanel()
    if (!agreed) return null
    acceptPageAttach()
  }

  return { title: page.title, url: page.url, text: page.text }
}

/** Runs a command against the window that owns the tabs. */
export function dispatch(command: Command): void {
  if (context) runCommand(command, context)
}

/** Registered once, so reopening a window does not stack duplicate handlers. */
export function registerTabsIpc(): void {
  ipcMain.handle('tabs:read', () => context?.tabs.read() ?? null)
  ipcMain.on('tabs:create', () => dispatch({ name: 'tab:new' }))
  ipcMain.on('tabs:close', (_event, id: number) => context?.tabs.close(id))
  ipcMain.on('tabs:activate', (_event, id: number) => context?.tabs.select(id))

  ipcMain.on('page:navigate', (_event, url: string) => {
    void context?.tabs
      .activeContents()
      ?.loadURL(url)
      .catch(() => undefined)
  })
  ipcMain.on('page:go-back', () => dispatch({ name: 'page:back' }))
  ipcMain.on('page:go-forward', () => dispatch({ name: 'page:forward' }))
  ipcMain.on('page:reload', () => dispatch({ name: 'page:reload' }))
  ipcMain.on('page:stop', () => dispatch({ name: 'page:stop' }))
  ipcMain.on('page:focus', () => context?.tabs.activeContents()?.focus())
  ipcMain.on('chrome:zoom-popup', () => context?.tabs.toggleZoomPopup())
  ipcMain.on('panel:toggle', () => dispatch({ name: 'panel:toggle' }))
  ipcMain.on('panel:resize', (_event, point: { x: number; y: number }) => {
    if (context) resizePanel(context.window, point)
  })
  ipcMain.on('panel:provider', (_event, provider: unknown) => {
    setPanelProvider(isProvider(provider) ? provider : null)
  })
  ipcMain.on('panel:mode', (_event, mode: PanelMode, provider: ProviderId | null) => {
    if (!context) return
    if (mode === 'site') showSite(context.window, provider ?? undefined)
    else showChat(context.window)
  })
  ipcMain.on('panel:site-menu', (_event, point: { x: number; y: number }) => {
    if (context) void showSiteMenu(point, context)
  })
  ipcMain.on('panel:site-zoom', (_event, direction: 1 | -1 | 0) => zoomSite(direction))
  ipcMain.handle('page:read', () => facingPage())
  ipcMain.on('page:open-link', (_event, url: unknown) => {
    // A model wrote this address, not the person, so only the two schemes a tab is for.
    if (typeof url === 'string' && /^https?:\/\//.test(url)) context?.tabs.create(url, true)
  })
  ipcMain.handle('page:capture', async (_event, provider: unknown) => {
    if (!isProvider(provider)) throw new Error('Unknown provider.')
    return capturePage(provider)
  })
  ipcMain.on('panel:copy-page', () => {
    if (context) void copyPageForAi(context)
  })
  ipcMain.on('devtools:resize', (_event, point: { x: number; y: number }) => {
    context?.tabs.resizeDevTools(point)
  })
  ipcMain.on('devtools:dock', (_event, side: DevToolsSide) => {
    dispatch({ name: 'devtools:dock', side })
  })
  ipcMain.on('devtools:toggle', () => dispatch({ name: 'devtools:toggle' }))
  ipcMain.on('overlay:zoom-action', (_event, action: ZoomAction) => {
    if (action === 'hold' || action === 'release') {
      holdZoom(action === 'hold')
      return
    }
    if (action === 'reset') dispatch({ name: 'zoom:reset' })
    else dispatch({ name: action === 'in' ? 'zoom:in' : 'zoom:out' })
  })
}

// Schemes the browser renders itself. Everything else belongs to another application.
const PAGE_SCHEMES = new Set(['http:', 'https:', 'about:'])
// Well known enough to hand over without asking.
const QUIET_SCHEMES = new Set(['mailto:', 'tel:', 'sms:', 'webcal:'])

function isPageUrl(url: string): boolean {
  return PAGE_SCHEMES.has(protocolOf(url))
}

function protocolOf(url: string): string {
  try {
    return new URL(url).protocol
  } catch {
    return ''
  }
}
