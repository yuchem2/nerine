import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AskAnswer,
  AskRequest,
  KeyState,
  ModelList,
  PageContext,
  PageHandle,
  ProviderId,
  SaveResult,
  UsageWindow
} from './index'

/*
 * The AI panel is its own renderer and gets its own bridge. It can ask about keys and set
 * them, and that is all: the tab, zoom and DevTools channels the chrome uses are not here.
 */
const api = {
  keys: {
    read: (): Promise<KeyState[]> => ipcRenderer.invoke('keys:read'),
    save: (provider: ProviderId, key: string): Promise<SaveResult> =>
      ipcRenderer.invoke('keys:save', provider, key),
    clear: (provider: ProviderId): Promise<KeyState[]> => ipcRenderer.invoke('keys:clear', provider),
    // Main owns the address, so the panel cannot ask for a tab on any URL it likes.
    openPage: (provider: ProviderId): void => ipcRenderer.send('keys:open-page', provider)
  },
  panel: {
    // The chrome draws the header, so it has to be told what the panel settled on.
    using: (provider: ProviderId): void => ipcRenderer.send('panel:provider', provider)
  },
  page: {
    /** Which page is in front of the panel, or null when the tab is not one. */
    read: (): Promise<PageHandle | null> => ipcRenderer.invoke('page:read'),
    /** The page's text, once the person has been told where it goes and agreed. */
    capture: (provider: ProviderId): Promise<PageContext | null> =>
      ipcRenderer.invoke('page:capture', provider),
    /** A link in an answer. Main checks the scheme: a model wrote this address. */
    openLink: (url: string): void => ipcRenderer.send('page:open-link', url),
    onChange: (listener: (page: PageHandle | null) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, page: PageHandle | null): void => listener(page)
      ipcRenderer.on('page:current', handler)
      return () => {
        ipcRenderer.removeListener('page:current', handler)
      }
    }
  },
  chat: {
    models: (provider: ProviderId): Promise<ModelList> => ipcRenderer.invoke('ai:models', provider),
    // The answer arrives as a run of events, not one reply, so onDelta hears it as it comes.
    ask: (request: AskRequest, onDelta: (text: string) => void): Promise<AskAnswer> =>
      new Promise((resolve, reject) => {
        const delta = (_event: IpcRendererEvent, id: number, text: string): void => {
          if (id === request.id) onDelta(text)
        }
        const done = (_event: IpcRendererEvent, id: number, answer: AskAnswer): void => {
          if (id !== request.id) return
          cleanup()
          resolve(answer)
        }
        const failed = (_event: IpcRendererEvent, id: number, message: string): void => {
          if (id !== request.id) return
          cleanup()
          reject(new Error(message))
        }
        const cleanup = (): void => {
          ipcRenderer.removeListener('ai:delta', delta)
          ipcRenderer.removeListener('ai:done', done)
          ipcRenderer.removeListener('ai:error', failed)
        }
        ipcRenderer.on('ai:delta', delta)
        ipcRenderer.on('ai:done', done)
        ipcRenderer.on('ai:error', failed)
        ipcRenderer.send('ai:ask', request)
      }),
    cancel: (id: number): void => ipcRenderer.send('ai:cancel', id),
    usageWindow: (provider: ProviderId): Promise<UsageWindow> =>
      ipcRenderer.invoke('ai:usage-window', provider)
  }
} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('ai', api)
}

export type NerineAiApi = typeof api
