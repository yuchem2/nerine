export const HOME_URL = 'https://google.com'
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
