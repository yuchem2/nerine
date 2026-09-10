import { contextBridge } from 'electron'

// Never expose ipcRenderer itself. Add one wrapped channel at a time.
const api = {} as const

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('nerine', api)
}

export type NerineApi = typeof api
