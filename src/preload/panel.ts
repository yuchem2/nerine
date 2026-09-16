import { contextBridge, ipcRenderer } from 'electron'
import type {
  AskAnswer,
  AskRequest,
  KeyState,
  ModelList,
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
  chat: {
    models: (provider: ProviderId): Promise<ModelList> => ipcRenderer.invoke('ai:models', provider),
    ask: (request: AskRequest): Promise<AskAnswer> => ipcRenderer.invoke('ai:ask', request),
    cancel: (id: number): void => ipcRenderer.send('ai:cancel', id),
    usageWindow: (provider: ProviderId): Promise<UsageWindow> =>
      ipcRenderer.invoke('ai:usage-window', provider)
  }
} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('ai', api)
}

export type NerineAiApi = typeof api
