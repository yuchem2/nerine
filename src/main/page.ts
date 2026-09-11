import { ipcMain, shell, WebContentsView, type BrowserWindow, type WebContents } from 'electron'
import { trackPage } from './perf'
import type { PageState } from '../preload'

const HOME_URL = 'https://google.com'
// The renderer measures its chrome and reports the real height. This covers the first frames.
const FALLBACK_CHROME_HEIGHT = 79

interface Page {
  contents: WebContents
  readState: () => PageState
  setChromeHeight: (height: number) => void
}

let active: Page | null = null

/** Puts the page under the chrome and keeps the renderer told about its state. */
export function attachPage(window: BrowserWindow): void {
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const contents = view.webContents
  trackPage(contents)

  let chromeHeight = FALLBACK_CHROME_HEIGHT
  let faviconUrl: string | null = null

  const layout = (): void => {
    const { width, height } = window.getContentBounds()
    view.setBounds({
      x: 0,
      y: chromeHeight,
      width,
      height: Math.max(height - chromeHeight, 0)
    })
  }

  const readState = (): PageState => ({
    url: contents.getURL(),
    title: contents.getTitle(),
    faviconUrl,
    isLoading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward()
  })

  const publish = (): void => {
    if (window.isDestroyed()) return
    window.webContents.send('page:state', readState())
  }

  window.contentView.addChildView(view)
  layout()
  window.on('resize', layout)

  contents.on('did-start-loading', publish)
  contents.on('did-stop-loading', publish)
  contents.on('did-navigate-in-page', publish)
  contents.on('page-title-updated', publish)
  contents.on('did-navigate', () => {
    faviconUrl = null
    publish()
  })
  contents.on('page-favicon-updated', (_event, favicons) => {
    faviconUrl = favicons[0] ?? null
    publish()
  })

  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  active = {
    contents,
    readState,
    setChromeHeight: (height) => {
      chromeHeight = Math.round(height)
      layout()
    }
  }

  window.on('closed', () => {
    if (active?.contents === contents) active = null
  })

  void contents.loadURL(HOME_URL)
}

/** Registered once, so reopening a window does not stack duplicate handlers. */
export function registerPageIpc(): void {
  ipcMain.handle('page:read-state', () => active?.readState() ?? null)
  ipcMain.on('chrome:height', (_event, height: number) => active?.setChromeHeight(height))
  ipcMain.on('page:navigate', (_event, url: string) => {
    void active?.contents.loadURL(url).catch(() => undefined)
  })
  ipcMain.on('page:go-back', () => active?.contents.navigationHistory.goBack())
  ipcMain.on('page:go-forward', () => active?.contents.navigationHistory.goForward())
  ipcMain.on('page:reload', () => active?.contents.reload())
  ipcMain.on('page:stop', () => active?.contents.stop())
}
