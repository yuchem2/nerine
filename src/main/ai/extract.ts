import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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

/*
 * Readability runs inside the page rather than here. The DOM is already built there, and
 * whatever scripts put on the page is part of it: sending the HTML out to be parsed again
 * would cost more and arrive with less. It is externalized like the SDKs, so the library
 * is read off disk rather than bundled, once per run.
 */
const resolveFrom = createRequire(import.meta.url)
let library: string | null = null

function readability(): string {
  library ??= readFileSync(resolveFrom.resolve('@mozilla/readability/Readability.js'), 'utf8')
  return library
}

// Under this an article is too thin to take over the whole page it was found in.
const MIN_ARTICLE = 200

/**
 * The article if there is one, the whole page if there is not. An app rather than a
 * document, which is most of what a browser holds open, has no article to find: without
 * the fallback those pages would hand over nothing at all.
 */
function script(): string {
  return `(() => {
${readability()}
const whole = document.body ? document.body.innerText : ''
try {
  // Readability rewrites what it walks, so it is given a copy and the page keeps its own.
  const article = new Readability(document.cloneNode(true)).parse()
  const text = article && article.textContent ? article.textContent.trim() : ''
  return text.length >= ${MIN_ARTICLE} ? text : whole
} catch (failure) {
  return whole
}
})()`
}

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
      { code: script() }
    ])
    return typeof text === 'string' ? text : ''
  } catch {
    // A page that will not run our script has nothing to hand over.
    return ''
  }
}
