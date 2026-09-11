import { dialog, ipcMain, shell, WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { trackPage } from './perf'
import type { BrowserState, TabState } from '../preload'

const HOME_URL = 'https://google.com'
const NEW_TAB_URL = 'about:blank'
// The renderer measures its chrome and reports the real height. This covers the first frames.
const FALLBACK_CHROME_HEIGHT = 79

interface Tab {
  id: number
  view: WebContentsView
  faviconUrl: string | null
}

interface Tabs {
  read: () => BrowserState
  create: (url: string, activate: boolean) => void
  close: (id: number) => void
  select: (id: number) => void
  activeContents: () => WebContents | null
  setChromeHeight: (height: number) => void
}

let tabs: Tabs | null = null

/** Owns every page in the window and keeps the renderer told about them. */
export function attachTabs(window: BrowserWindow): void {
  const open: Tab[] = []
  let activeId = -1
  let chromeHeight = FALLBACK_CHROME_HEIGHT

  let asking = false

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
      const { response } = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Open in another application',
        message: `Let another application handle this ${protocol.replace(':', '')} link?`,
        detail: url.length > 200 ? `${url.slice(0, 200)}...` : url,
        buttons: ['Open', 'Cancel'],
        // Cancel is the default, so a stray keypress cannot open anything.
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (response === 0) await shell.openExternal(url)
    } finally {
      asking = false
    }
  }

  const find = (id: number): Tab | undefined => open.find((tab) => tab.id === id)
  const active = (): Tab | undefined => find(activeId)

  // Hidden tabs are laid out too, so switching never shows a stale size.
  const layout = (): void => {
    const { width, height } = window.getContentBounds()
    for (const tab of open) {
      tab.view.setBounds({ x: 0, y: chromeHeight, width, height: Math.max(height - chromeHeight, 0) })
    }
  }

  const toState = (tab: Tab): TabState => {
    const contents = tab.view.webContents
    return {
      id: tab.id,
      url: contents.getURL(),
      title: contents.getTitle(),
      faviconUrl: tab.faviconUrl,
      isLoading: contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward()
    }
  }

  const read = (): BrowserState => ({ tabs: open.map(toState), activeId })

  const publish = (): void => {
    if (window.isDestroyed()) return
    window.webContents.send('tabs:state', read())
  }

  const select = (id: number): void => {
    const tab = find(id)
    if (!tab) return

    for (const other of open) other.view.setVisible(other.id === id)
    activeId = id
    layout()
    tab.view.webContents.focus()
    publish()
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

  window.on('resize', layout)
  window.on('closed', () => {
    tabs = null
  })

  tabs = {
    read,
    create,
    close,
    select,
    activeContents: () => active()?.view.webContents ?? null,
    setChromeHeight: (height) => {
      chromeHeight = Math.round(height)
      layout()
    }
  }

  create(HOME_URL, true)
}

/** Registered once, so reopening a window does not stack duplicate handlers. */
export function registerTabsIpc(): void {
  ipcMain.handle('tabs:read', () => tabs?.read() ?? null)
  ipcMain.on('tabs:create', () => tabs?.create(NEW_TAB_URL, true))
  ipcMain.on('tabs:close', (_event, id: number) => tabs?.close(id))
  ipcMain.on('tabs:activate', (_event, id: number) => tabs?.select(id))
  ipcMain.on('chrome:height', (_event, height: number) => tabs?.setChromeHeight(height))

  ipcMain.on('page:navigate', (_event, url: string) => {
    void tabs?.activeContents()?.loadURL(url).catch(() => undefined)
  })
  ipcMain.on('page:go-back', () => tabs?.activeContents()?.navigationHistory.goBack())
  ipcMain.on('page:go-forward', () => tabs?.activeContents()?.navigationHistory.goForward())
  ipcMain.on('page:reload', () => tabs?.activeContents()?.reload())
  ipcMain.on('page:stop', () => tabs?.activeContents()?.stop())
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
