import { app, type WebContents } from 'electron'

const ENABLED = process.env['NERINE_PERF'] === '1'
// Let the page settle before timing the next one.
const SETTLE_MS = 200

const startedAt = new Map<number, number>()
let firstLoadDone = false
let walking = false

/**
 * Times page loads and, given a URL list, walks through it and quits.
 * Off unless NERINE_PERF is set, so a normal run pays nothing.
 */
export function trackPage(contents: WebContents): void {
  if (!ENABLED) return

  time(contents)

  const urls = (process.env['NERINE_PERF_URLS'] ?? '').split(',').filter(Boolean)
  if (urls.length === 0 || walking) return
  walking = true
  walk(contents, urls)
}

function emit(metric: string, url: string, ms: number): void {
  process.stdout.write(`[perf] ${JSON.stringify({ metric, url, ms: Math.round(ms) })}\n`)
}

function time(contents: WebContents): void {
  contents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument) return
    startedAt.set(contents.id, performance.now())
  })

  contents.on('did-finish-load', () => {
    const start = startedAt.get(contents.id)
    if (start === undefined) return
    startedAt.delete(contents.id)

    const url = contents.getURL()
    emit('load', url, performance.now() - start)

    if (!firstLoadDone) {
      firstLoadDone = true
      // Process start to first painted page, which is what the web view layer costs.
      emit('startup', url, performance.now())
    }
  })

  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return
    startedAt.delete(contents.id)
    emit('failed', `${url} (${code} ${description})`, 0)
  })
}

function walk(contents: WebContents, urls: string[]): void {
  let index = 0

  const next = (): void => {
    if (index >= urls.length) {
      app.quit()
      return
    }
    const url = urls[index]
    index += 1
    void contents.loadURL(url).catch(() => undefined)
  }

  contents.on('did-finish-load', () => setTimeout(next, SETTLE_MS))
  contents.on('did-fail-load', () => setTimeout(next, SETTLE_MS))
}
