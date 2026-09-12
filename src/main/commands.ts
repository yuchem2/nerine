import { clipboard, type BrowserWindow, type ContextMenuParams, type WebContents } from 'electron'
import { pageBounds } from './layout'
import { menu } from './overlay'
import type { OverlayMenuEntry } from '../preload'
import type { Tabs } from './tabs'

// Electron reads zoom as 1.2^level, and half steps are what its own zoom roles use.
const ZOOM_STEP = 0.5
const ZOOM_LIMIT = 5

export interface CommandContext {
  window: BrowserWindow
  tabs: Tabs
}

/** Everything a key or a menu entry can ask the browser to do. */
export type Command =
  | { name: 'tab:new' | 'tab:close' | 'tab:next' | 'tab:previous' }
  | { name: 'tab:select'; index: number }
  | { name: 'address:focus' }
  | { name: 'page:back' | 'page:forward' | 'page:reload' | 'page:hard-reload' | 'page:stop' }
  | { name: 'zoom:in' | 'zoom:out' | 'zoom:reset' }
  | { name: 'edit:cut' | 'edit:copy' | 'edit:paste' | 'edit:select-all' }
  | { name: 'devtools:toggle' }
  | { name: 'devtools:inspect'; point: { x: number; y: number } }
  | { name: 'link:open' | 'link:copy'; url: string }

interface Entry {
  id: string
  label: string
  enabled: boolean
  command: Command
}

type Part = Entry | 'separator'

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
    case 'link:open':
      tabs.create(command.url, true)
      return
    case 'link:copy':
      clipboard.writeText(command.url)
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
    case 'edit:cut':
      contents.cut()
      return
    case 'edit:copy':
      contents.copy()
      return
    case 'edit:paste':
      contents.paste()
      return
    case 'edit:select-all':
      contents.selectAll()
      return
    case 'devtools:toggle':
      if (contents.isDevToolsOpened()) contents.closeDevTools()
      else openDevTools(contents)
      return
    case 'devtools:inspect':
      openDevTools(contents)
      contents.inspectElement(command.point.x, command.point.y)
      return
  }
}

/** Draws the page context menu in the overlay and runs whatever gets picked. */
export async function showContextMenu(
  params: ContextMenuParams,
  ctx: CommandContext
): Promise<void> {
  const contents = ctx.tabs.activeContents()
  if (!contents) return

  const parts = partsFor(params, contents)
  const picked = await menu({
    ...overlayPoint(params, contents, ctx.window),
    entries: parts.map(toOverlayEntry)
  })

  // The overlay held focus while it was up, so the page takes it back either way.
  contents.focus()

  const chosen = parts.filter(isEntry).find((entry) => entry.id === picked)
  if (chosen) runCommand(chosen.command, ctx)
}

function partsFor(params: ContextMenuParams, contents: WebContents): Part[] {
  const { editFlags } = params
  const inspect: Entry = {
    id: 'inspect',
    label: 'Inspect element',
    enabled: true,
    command: { name: 'devtools:inspect', point: { x: params.x, y: params.y } }
  }

  if (params.linkURL) {
    return [
      {
        id: 'open-link',
        label: 'Open link in new tab',
        enabled: true,
        command: { name: 'link:open', url: params.linkURL }
      },
      {
        id: 'copy-link',
        label: 'Copy link address',
        enabled: true,
        command: { name: 'link:copy', url: params.linkURL }
      },
      'separator',
      inspect
    ]
  }

  if (params.isEditable) {
    return [
      { id: 'cut', label: 'Cut', enabled: editFlags.canCut, command: { name: 'edit:cut' } },
      { id: 'copy', label: 'Copy', enabled: editFlags.canCopy, command: { name: 'edit:copy' } },
      { id: 'paste', label: 'Paste', enabled: editFlags.canPaste, command: { name: 'edit:paste' } },
      'separator',
      {
        id: 'select-all',
        label: 'Select all',
        enabled: editFlags.canSelectAll,
        command: { name: 'edit:select-all' }
      },
      'separator',
      inspect
    ]
  }

  if (params.selectionText) {
    return [
      { id: 'copy', label: 'Copy', enabled: editFlags.canCopy, command: { name: 'edit:copy' } },
      'separator',
      inspect
    ]
  }

  return [
    {
      id: 'back',
      label: 'Back',
      enabled: contents.navigationHistory.canGoBack(),
      command: { name: 'page:back' }
    },
    {
      id: 'forward',
      label: 'Forward',
      enabled: contents.navigationHistory.canGoForward(),
      command: { name: 'page:forward' }
    },
    { id: 'reload', label: 'Reload', enabled: true, command: { name: 'page:reload' } },
    'separator',
    inspect
  ]
}

/** The page reports its own zoomed coordinates, the overlay draws in the window's. */
function overlayPoint(
  params: ContextMenuParams,
  contents: WebContents,
  window: BrowserWindow
): { x: number; y: number } {
  const zoom = contents.getZoomFactor()
  const page = pageBounds(window)

  return { x: Math.round(params.x * zoom) + page.x, y: Math.round(params.y * zoom) + page.y }
}

function toOverlayEntry(part: Part): OverlayMenuEntry {
  if (part === 'separator') return part
  return { id: part.id, label: part.label, enabled: part.enabled }
}

function isEntry(part: Part): part is Entry {
  return part !== 'separator'
}

function zoom(contents: WebContents, delta: number): void {
  const level = contents.getZoomLevel() + delta
  contents.setZoomLevel(Math.max(Math.min(level, ZOOM_LIMIT), -ZOOM_LIMIT))
}

// Docked DevTools would fight us for the bounds of a view we place ourselves.
function openDevTools(contents: WebContents): void {
  if (!contents.isDevToolsOpened()) contents.openDevTools({ mode: 'detach' })
}
