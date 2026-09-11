// %s is the query slot.
const SEARCH_TEMPLATE = 'https://google.com/search?q=%s'

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
// Anything outside this list (javascript:, data:) is searched, never navigated.
const SAFE_SCHEME = /^(https?|file|about):/i
const BARE_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i
const DOMAIN = /^[^\s/?#]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i

/** Turns address bar input into a URL to load, or null if there is nothing to do. */
export function toNavigationUrl(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  if (SAFE_SCHEME.test(value)) return value
  // Ahead of the scheme check, since "localhost:5173" reads as one.
  if (BARE_HOST.test(value)) return `http://${value}`
  if (HAS_SCHEME.test(value)) return toSearchUrl(value)
  if (DOMAIN.test(value)) return `https://${value}`

  return toSearchUrl(value)
}

function toSearchUrl(query: string): string {
  return SEARCH_TEMPLATE.replace('%s', encodeURIComponent(query))
}

/**
 * Trims a URL down for display. The scheme only disappears for https, so an
 * insecure page still says so, and the raw URL is what gets edited and copied.
 */
export function toDisplayUrl(url: string): string {
  if (!url) return ''

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  if (parsed.protocol !== 'https:') return url

  const host = parsed.host.replace(/^www\./, '')
  const rest = decode(parsed.pathname + parsed.search + parsed.hash)

  return rest === '/' ? host : host + rest
}

function decode(value: string): string {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}
