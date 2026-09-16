import { clipboard, type BrowserWindow, type ContextMenuParams, type WebContents } from 'electron'
import { closeDevTools, dockDevTools, isDevToolsOpen, openDevTools } from './devtools'
import { pageBlock, trimPage, PAGE_LIMIT } from './ai/prompt'
import { adapters } from './ai/registry'
import {
  acceptPageSharing,
  markPageCopied,
  pageSharingAccepted,
  showSite,
  siteProvider,
  togglePanel
} from './panel'
import { pageBounds } from './layout'
import { confirm, menu } from './overlay'
import { attachShortcuts, DEVTOOLS_KEYS } from './shortcuts'
import type { DevToolsSide, OverlayMenuEntry } from '../preload'
import type { Tabs } from './tabs'

export interface CommandContext {
  window: BrowserWindow
  tabs: Tabs
}

/** Everything a key or a menu entry can ask the browser to do. */
export type Command =
  | { name: 'tab:new' | 'tab:close' | 'tab:next' | 'tab:previous' }
  | { name: 'tab:select'; index: number }
  | { name: 'address:focus' }
  | { name: 'panel:toggle' }
  | { name: 'page:back' | 'page:forward' | 'page:reload' | 'page:hard-reload' | 'page:stop' }
  | { name: 'zoom:in' | 'zoom:out' | 'zoom:reset' }
  | { name: 'edit:cut' | 'edit:copy' | 'edit:paste' | 'edit:select-all' }
  | { name: 'devtools:toggle' }
  | { name: 'devtools:inspect'; point: { x: number; y: number } }
  | { name: 'devtools:dock'; side: DevToolsSide | 'cycle' }
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
    case 'zoom:in':
      tabs.zoom(1)
      return
    case 'zoom:out':
      tabs.zoom(-1)
      return
    case 'zoom:reset':
      tabs.resetZoom()
      return
    case 'panel:toggle':
      togglePanel(ctx.window)
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
      if (isDevToolsOpen(contents)) {
        closeDevTools(contents)
        // DevTools held focus while it was up, so the page takes it back.
        contents.focus()
      } else showDevTools(contents, ctx)
      return
    case 'devtools:inspect':
      showDevTools(contents, ctx)
      contents.inspectElement(command.point.x, command.point.y)
      return
    case 'devtools:dock':
      // Moving a closed DevTools would change the layout with nothing on screen to show it.
      if (isDevToolsOpen(contents)) dockDevTools(command.side)
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

/** Which site the panel shows. Every provider is here: a site needs no key. */
export async function showSiteMenu(
  point: { x: number; y: number },
  ctx: CommandContext
): Promise<void> {
  const current = siteProvider()
  const picked = await menu({
    ...point,
    entries: adapters().map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      enabled: adapter.id !== current
    }))
  })

  const chosen = adapters().find((adapter) => adapter.id === picked)
  if (chosen) showSite(ctx.window, chosen.id)
}

/**
 * Hands the page to whichever site is open, by way of the clipboard. Typing into someone
 * else's composer would mean reaching into their page, which this does not do.
 */
export async function copyPageForAi(ctx: CommandContext): Promise<void> {
  const contents = ctx.tabs.activeContents()
  if (!contents) return

  const url = contents.getURL()
  if (!url.startsWith('http')) return

  // What the page says, as a reader sees it. Scripts on the page cannot see this run.
  const text: string = await contents.executeJavaScript(
    'document.body ? document.body.innerText : ""',
    true
  )

  const size = Math.min(trimPage(text).length, PAGE_LIMIT)
  if (!pageSharingAccepted()) {
    const agreed = await confirm({
      title: 'Copy this page for the AI',
      message: `Its title, address and ${size.toLocaleString()} characters of text go to your clipboard, for you to paste where you like. Long pages are cut at ${PAGE_LIMIT.toLocaleString()}.`,
      detail: url.length > 200 ? `${url.slice(0, 200)}...` : url,
      confirmLabel: 'Copy',
      cancelLabel: 'Cancel'
    })
    contents.focus()
    if (!agreed) return
    acceptPageSharing()
  }

  clipboard.writeText(pageBlock({ title: contents.getTitle(), url, text }))
  // The count goes on the button, since what it costs to ask is worth knowing first.
  markPageCopied(size)
}

/** DevTools takes the keyboard while it has focus, so it carries its own toggle back. */
function showDevTools(contents: WebContents, ctx: CommandContext): void {
  const view = openDevTools(ctx.window, contents)
  if (view) {
    attachShortcuts(view.webContents, (command) => runCommand(command, ctx), DEVTOOLS_KEYS)
  }
}
