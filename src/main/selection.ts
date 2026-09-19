import type { WebContents } from 'electron'
import { canExtract } from './ai/extract'

/** A world of its own: nothing here shares state with the extractor's. */
const WORLD = 2

// A selection this long is someone picking a whole page, not a snippet to ask about.
const MAX_SELECTION = 6000

export interface Selected {
  text: string
  /** Viewport-relative, the way `getBoundingClientRect` reports it. */
  rect: { x: number; y: number; width: number; height: number }
}

const SCRIPT = `(() => {
  const selection = window.getSelection()
  const text = selection ? selection.toString().trim() : ''
  if (!text || selection.rangeCount === 0) return null
  const { x, y, width, height } = selection.getRangeAt(0).getBoundingClientRect()
  if (width === 0 && height === 0) return null
  return { text: text.slice(0, ${MAX_SELECTION}), rect: { x, y, width, height } }
})()`

export async function readSelection(contents: WebContents): Promise<Selected | null> {
  if (!canExtract(contents.getURL())) return null
  try {
    const result: unknown = await contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code: SCRIPT }])
    return isSelected(result) ? result : null
  } catch {
    // A page that will not run our script has nothing to hand over.
    return null
  }
}

function isSelected(value: unknown): value is Selected {
  return !!value && typeof value === 'object' && typeof (value as Selected).text === 'string'
}
