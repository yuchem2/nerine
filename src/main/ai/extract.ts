import type { WebContents } from 'electron'
import { PAGE_LIMIT, trimPage } from './prompt'

/*
 * What a page says, read out of the page itself. Only http and https are pages: every
 * other scheme is the browser's own or the filesystem.
 */

/*
 * Not the main world. There a page can watch the read happen and can stand in for what it
 * returns by redefining what we call. Chromium keeps [1 << 20, 1 << 29) for extensions
 * and Electron keeps 999 for contextIsolation, so a low id is ours to take.
 */
const WORLD = 1

const READ_TEXT = '(() => (document.body ? document.body.innerText : ""))()'

export interface Extracted {
  title: string
  url: string
  text: string
  /** Characters the block will carry once trimmed and cut, which is what a user is told. */
  size: number
}

/** Everything else a tab can hold is the browser's own page or the filesystem. */
export function canExtract(url: string): boolean {
  return /^https?:\/\//.test(url)
}

export async function extractPage(contents: WebContents): Promise<Extracted | null> {
  const url = contents.getURL()
  if (!canExtract(url)) return null

  const text = await read(contents)
  return {
    title: contents.getTitle(),
    url,
    text,
    size: Math.min(trimPage(text).length, PAGE_LIMIT)
  }
}

async function read(contents: WebContents): Promise<string> {
  try {
    const text: unknown = await contents.executeJavaScriptInIsolatedWorld(WORLD, [
      { code: READ_TEXT }
    ])
    return typeof text === 'string' ? text : ''
  } catch {
    // A page that will not run our script has nothing to hand over.
    return ''
  }
}
