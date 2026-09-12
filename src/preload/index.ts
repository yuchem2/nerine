import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface TabState {
  id: number
  url: string
  title: string
  faviconUrl: string | null
  isLoading: boolean
  zoomFactor: number
  canGoBack: boolean
  canGoForward: boolean
}

export interface BrowserState {
  tabs: TabState[]
  activeId: number
}

export interface OverlayRequest {
  title: string
  message: string
  detail?: string
  confirmLabel: string
  cancelLabel: string
}

export interface ZoomState {
  percent: number
  canZoomIn: boolean
  canZoomOut: boolean
}

/** hold and release keep the popup open while the pointer is on it. */
export type ZoomAction = 'in' | 'out' | 'reset' | 'hold' | 'release'

export interface OverlayMenuItem {
  id: string
  label: string
  enabled: boolean
}

export type OverlayMenuEntry = OverlayMenuItem | 'separator'

export interface OverlayMenuRequest {
  /** Window coordinates, since the overlay covers everything the window draws. */
  x: number
  y: number
  entries: OverlayMenuEntry[]
  /** Filled in by the main process: the renderer learns its own size a frame late. */
  viewport: { width: number; height: number }
}

// Never expose ipcRenderer itself. Each channel gets a wrapper.
const api = {
  tabs: {
    read: (): Promise<BrowserState | null> => ipcRenderer.invoke('tabs:read'),
    create: (): void => ipcRenderer.send('tabs:create'),
    close: (id: number): void => ipcRenderer.send('tabs:close', id),
    activate: (id: number): void => ipcRenderer.send('tabs:activate', id),
    onState: (listener: (state: BrowserState) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, state: BrowserState): void => listener(state)
      ipcRenderer.on('tabs:state', handler)
      return () => {
        ipcRenderer.removeListener('tabs:state', handler)
      }
    }
  },
  page: {
    navigate: (url: string): void => ipcRenderer.send('page:navigate', url),
    goBack: (): void => ipcRenderer.send('page:go-back'),
    goForward: (): void => ipcRenderer.send('page:go-forward'),
    reload: (): void => ipcRenderer.send('page:reload'),
    stop: (): void => ipcRenderer.send('page:stop'),
    focus: (): void => ipcRenderer.send('page:focus')
  },
  chrome: {
    // The page views sit below the chrome, so the main process needs its height.
    reportHeight: (height: number): void => ipcRenderer.send('chrome:height', height),
    reportZoomAnchor: (anchor: { x: number; y: number }): void =>
      ipcRenderer.send('chrome:zoom-anchor', anchor),
    toggleZoomPopup: (): void => ipcRenderer.send('chrome:zoom-popup'),
    onFocusAddress: (listener: () => void): (() => void) => {
      const handler = (): void => listener()
      ipcRenderer.on('chrome:focus-address', handler)
      return () => {
        ipcRenderer.removeListener('chrome:focus-address', handler)
      }
    }
  },
  // Used by the overlay page only. The chrome never draws over a web page.
  overlay: {
    onShow: (listener: (request: OverlayRequest) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, request: OverlayRequest): void => listener(request)
      ipcRenderer.on('overlay:show', handler)
      return () => {
        ipcRenderer.removeListener('overlay:show', handler)
      }
    },
    respond: (confirmed: boolean): void => ipcRenderer.send('overlay:respond', confirmed),
    onMenu: (listener: (request: OverlayMenuRequest) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, request: OverlayMenuRequest): void =>
        listener(request)
      ipcRenderer.on('overlay:menu', handler)
      return () => {
        ipcRenderer.removeListener('overlay:menu', handler)
      }
    },
    pick: (id: string | null): void => ipcRenderer.send('overlay:pick', id),
    onZoom: (listener: (state: ZoomState | null) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, state: ZoomState | null): void => listener(state)
      ipcRenderer.on('overlay:zoom', handler)
      return () => {
        ipcRenderer.removeListener('overlay:zoom', handler)
      }
    },
    zoomAction: (action: ZoomAction): void => ipcRenderer.send('overlay:zoom-action', action)
  }
} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('nerine', api)
}

export type NerineApi = typeof api
