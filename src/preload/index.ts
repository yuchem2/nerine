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

export type ProviderId = 'anthropic' | 'openai' | 'gemini'

export interface KeyState {
  provider: ProviderId
  configured: boolean
  /** Last few characters, so a saved key can be told apart. Empty for a short one. */
  hint: string
  /** False when the machine has no secure store and the key lives for this run only. */
  persisted: boolean
}

export interface ChatModel {
  id: string
  label: string
  /** False for the ones the picker keeps below the line, such as image models. */
  chat: boolean
}

export interface ModelList {
  models: ChatModel[]
  /** False when this is the adapter's guess rather than the provider's own answer. */
  live: boolean
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AskRequest {
  /** The renderer's handle on this question, which is also how it cancels one. */
  id: number
  provider: ProviderId
  model: string
  messages: ChatTurn[]
}

export interface SaveResult {
  keys: KeyState[]
  /** False when the provider could not be reached to confirm the key. */
  checked: boolean
}

/** Window coordinates, since the chrome draws these around views it does not own. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type DevToolsSide = 'left' | 'bottom' | 'right'

export interface DevToolsFrame {
  side: DevToolsSide
  /** The gap that resizes the split. */
  seam: Rect
  /** The strip above DevTools that carries its buttons. */
  bar: Rect
}

export interface PanelFrame {
  /** The space between the two cards, which drags the split. */
  gutter: Rect
  /** The whole panel card. The chrome paints it, the view sits inside it. */
  card: Rect
  /** Height of the header row at the top of the card. */
  header: number
}

export interface BrowserState {
  tabs: TabState[]
  activeId: number
  /** Null while DevTools is closed. */
  devTools: DevToolsFrame | null
  /** Null while the AI panel is closed. */
  panel: PanelFrame | null
  /** The card the page and DevTools share. Null while the page fills the window. */
  card: Rect | null
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
  panel: {
    toggle: (): void => ipcRenderer.send('panel:toggle'),
    // The seam is chrome, so the drag is read there and sent here.
    resize: (point: { x: number; y: number }): void => ipcRenderer.send('panel:resize', point)
  },
  devtools: {
    // Dragged from the chrome: the seam and the bar are the strips the views leave to us.
    resize: (point: { x: number; y: number }): void => ipcRenderer.send('devtools:resize', point),
    dock: (side: DevToolsSide): void => ipcRenderer.send('devtools:dock', side),
    toggle: (): void => ipcRenderer.send('devtools:toggle')
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
