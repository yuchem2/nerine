import type { BrowserWindow, WebContents } from 'electron'
import type { Tabs } from './tabs'

// Electron reads zoom as 1.2^level, and half steps are what its own zoom roles use.
const ZOOM_STEP = 0.5
const ZOOM_LIMIT = 5

export interface CommandContext {
  window: BrowserWindow
  tabs: Tabs
}

/** Everything a key can ask the browser to do. */
export type Command =
  | { name: 'tab:new' | 'tab:close' | 'tab:next' | 'tab:previous' }
  | { name: 'tab:select'; index: number }
  | { name: 'address:focus' }
  | { name: 'page:back' | 'page:forward' | 'page:reload' | 'page:hard-reload' | 'page:stop' }
  | { name: 'zoom:in' | 'zoom:out' | 'zoom:reset' }
  | { name: 'devtools:toggle' }

export function runCommand(command: Command, ctx: CommandContext): void {
  const { tabs } = ctx

  switch (command.name) {
    case 'tab:new':
      tabs.newTab()
      return
    case 'tab:close':
      tabs.closeActive()
      return
    case 'tab:next':
      tabs.cycle(1)
      return
    case 'tab:previous':
      tabs.cycle(-1)
      return
    case 'tab:select':
      tabs.selectAt(command.index)
      return
    case 'address:focus':
      ctx.window.webContents.focus()
      ctx.window.webContents.send('chrome:focus-address')
      return
  }

  const contents = tabs.activeContents()
  if (!contents) return

  switch (command.name) {
    case 'page:back':
      contents.navigationHistory.goBack()
      return
    case 'page:forward':
      contents.navigationHistory.goForward()
      return
    case 'page:reload':
      contents.reload()
      return
    case 'page:hard-reload':
      contents.reloadIgnoringCache()
      return
    case 'page:stop':
      contents.stop()
      return
    case 'zoom:in':
      zoom(contents, ZOOM_STEP)
      return
    case 'zoom:out':
      zoom(contents, -ZOOM_STEP)
      return
    case 'zoom:reset':
      contents.setZoomLevel(0)
      return
    case 'devtools:toggle':
      // Docked DevTools would fight us for the bounds of a view we place ourselves.
      if (contents.isDevToolsOpened()) contents.closeDevTools()
      else contents.openDevTools({ mode: 'detach' })
      return
  }
}

function zoom(contents: WebContents, delta: number): void {
  const level = contents.getZoomLevel() + delta
  contents.setZoomLevel(Math.max(Math.min(level, ZOOM_LIMIT), -ZOOM_LIMIT))
}
