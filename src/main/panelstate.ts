import { app } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isProvider } from './secrets'
import type { PanelMode, ProviderId } from '../preload'

/*
 * What the panel should look like when it opens again. The session keeps the sign in, so
 * what is left to remember is which mode was on, whose site it was, where in that site,
 * and at what zoom.
 */

const FILE = 'panel.json'
const MAX_URL = 2000

export interface PanelState {
  mode: PanelMode
  provider: ProviderId
  url: string | null
  zoom: number
  /** Whether copying the page block to the clipboard has been explained and accepted. */
  shared: boolean
  /** Whether sending the page to a provider has been explained and accepted. */
  attached: boolean
}

export const FIRST_RUN: PanelState = {
  mode: 'chat',
  provider: 'anthropic',
  url: null,
  // A panel is far narrower than the desktop these sites are drawn for.
  zoom: 0.6,
  shared: false,
  attached: false
}

export async function readPanelState(): Promise<PanelState> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file(), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return FIRST_RUN

    const { mode, provider, url, zoom } = parsed as Record<string, unknown>
    return {
      mode: mode === 'site' ? 'site' : 'chat',
      provider: isProvider(provider) ? provider : FIRST_RUN.provider,
      url: typeof url === 'string' && url.length <= MAX_URL && url.startsWith('https://') ? url : null,
      zoom: typeof zoom === 'number' && zoom > 0 ? zoom : FIRST_RUN.zoom,
      shared: (parsed as Record<string, unknown>).shared === true,
      attached: (parsed as Record<string, unknown>).attached === true
    }
  } catch {
    // Nothing remembered is the same as a first run.
    return FIRST_RUN
  }
}

/** Written through a temporary file, so a crash mid write cannot leave half a state. */
export async function writePanelState(state: PanelState): Promise<void> {
  const target = file()
  const temporary = `${target}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(state), 'utf8')
    await rename(temporary, target)
  } catch {
    // A panel that cannot remember still opens.
  }
}

function file(): string {
  return join(app.getPath('userData'), FILE)
}
