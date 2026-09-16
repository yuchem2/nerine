import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { installAppMenu } from './appmenu'
import { registerLayoutIpc, watchLayout } from './layout'
import { attachOverlay, registerOverlayIpc } from './overlay'
import { attachPanel } from './panel'
import { registerAiIpc } from './ai/ask'
import { adapterFor } from './ai/registry'
import { registerSecretsIpc } from './secrets'
import { attachShortcuts } from './shortcuts'
import { attachTabs, dispatch, openTab, registerTabsIpc } from './tabs'

const isDev = !app.isPackaged

// The OS paints the window controls, so it needs concrete colors instead of CSS tokens.
const TITLE_BAR = {
  height: 40,
  color: '#101014',
  symbolColor: '#b8b8c2'
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 480,
    minHeight: 360,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR,
    backgroundColor: '#101014',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Avoid a blank white flash before the first paint.
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Nothing in the chrome opens a second window, so hand these to the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  watchLayout(mainWindow)
  attachOverlay(mainWindow)
  attachPanel(mainWindow)
  attachTabs(mainWindow)
  // The chrome has focus while the address bar is in use, so it needs the keys too.
  attachShortcuts(mainWindow.webContents, dispatch)

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  installAppMenu()
  registerLayoutIpc()
  registerOverlayIpc()
  registerTabsIpc()
  registerAiIpc()
  registerSecretsIpc({
    check: (provider, key) => adapterFor(provider).verify(key),
    openPage: openTab
  })
  createWindow()

  app.on('activate', () => {
    // macOS reopens from the dock.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
