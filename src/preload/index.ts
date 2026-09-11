import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface TabState {
  id: number
  url: string
  title: string
  faviconUrl: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface BrowserState {
  tabs: TabState[]
  activeId: number
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
    stop: (): void => ipcRenderer.send('page:stop')
  },
  chrome: {
    // The page views sit below the chrome, so the main process needs its height.
    reportHeight: (height: number): void => ipcRenderer.send('chrome:height', height)
  }
} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('nerine', api)
}

export type NerineApi = typeof api
