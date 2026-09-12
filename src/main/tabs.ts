import { ipcMain, shell, WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { runCommand, type Command, type CommandContext } from './commands'
import { onLayoutChange, pageBounds } from './layout'
import { confirm } from './overlay'
import { trackPage } from './perf'
import { attachShortcuts } from './shortcuts'
import type { BrowserState, TabState } from '../preload'

const HOME_URL = 'https://google.com'
const NEW_TAB_URL = 'about:blank'
// The scheme is the only part of the prompt a link supplies, so it cannot run long.
const MAX_SCHEME_LABEL = 32

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
  activeContents: () => WebContents | null
}

let context: CommandContext | null = null

/** Owns every page in the window and keeps the renderer told about them. */
export function attachTabs(window: BrowserWindow): void {
  const open: Tab[] = []
  let activeId = -1
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
      if (confirmed) await shell.openExternal(url)
    } finally {
      asking = false
    }
  }

  const find = (id: number): Tab | undefined => open.find((tab) => tab.id === id)
  const active = (): Tab | undefined => find(activeId)

  // Hidden tabs are laid out too, so switching never shows a stale size.
  const layout = (): void => {
    const bounds = pageBounds(window)
    for (const tab of open) tab.view.setBounds(bounds)
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

  const selectAt = (index: number): void => {
    const tab = index < 0 ? open[open.length - 1] : open[index]
    if (tab) select(tab.id)
  }

  const cycle = (delta: number): void => {
    const index = open.findIndex((tab) => tab.id === activeId)
    if (index === -1) return
    select(open[(index + delta + open.length) % open.length].id)
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

    attachShortcuts(contents, dispatch)

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
    activeContents: () => active()?.view.webContents ?? null
  }
  const ctx: CommandContext = { window, tabs: controller }

  onLayoutChange(layout)
  window.on('closed', () => {
    context = null
  })

  context = ctx
  create(HOME_URL, true)
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
