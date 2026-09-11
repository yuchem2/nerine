import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface PageState {
  url: string
  title: string
  faviconUrl: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

// Never expose ipcRenderer itself. Each channel gets a wrapper.
const api = {
  page: {
    read: (): Promise<PageState | null> => ipcRenderer.invoke('page:read-state'),
    navigate: (url: string): void => ipcRenderer.send('page:navigate', url),
    goBack: (): void => ipcRenderer.send('page:go-back'),
    goForward: (): void => ipcRenderer.send('page:go-forward'),
    reload: (): void => ipcRenderer.send('page:reload'),
    stop: (): void => ipcRenderer.send('page:stop'),
    onState: (listener: (state: PageState) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, state: PageState): void => listener(state)
      ipcRenderer.on('page:state', handler)
      return () => {
        ipcRenderer.removeListener('page:state', handler)
      }
    }
  },
  chrome: {
    // The page view sits below the chrome, so the main process needs its height.
    reportHeight: (height: number): void => ipcRenderer.send('chrome:height', height)
  }
} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('nerine', api)
}

export type NerineApi = typeof api
