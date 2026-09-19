import { ipcMain, type WebContents } from 'electron'
import { pageBlock, systemPrompt, type PageStanding } from './prompt'
import { adapterFor } from './registry'
import { AiError, type Answer, type ChatMessage, type PageBlock } from './types'
import { isProvider, readKey } from '../secrets'
import type { ModelList, ProviderId, UsageWindow } from '../../preload'

/*
 * The connection between the browser and an adapter. It finds the key, hands the
 * conversation over and keeps the handle a cancel needs. The conversation itself lives in
 * the panel: this process holds nothing between one question and the next.
 */

// A question longer than this is a paste gone wrong, not something to send.
const MAX_TEXT = 200_000
const MAX_MESSAGES = 200
// A page is cut to PAGE_LIMIT on the way out, so this only keeps a bad payload small.
const MAX_PAGE_TEXT = 400_000
const MAX_URL = 2000
const MAX_TITLE = 500

const running = new Map<number, AbortController>()

export async function ask(asked: Asked, onDelta: (text: string) => void): Promise<Answer> {
  const { id, provider, messages } = asked
  const key = await readKey(provider)
  if (!key) {
    throw new AiError('no-key', 'Add a key for this provider first.')
  }

  const controller = new AbortController()
  running.set(id, controller)
  try {
    return await adapterFor(provider).ask(
      key,
      {
        model: asked.model,
        system: systemPrompt(standingOf(asked)),
        messages: messages.map(fold),
        signal: controller.signal
      },
      onDelta
    )
  } finally {
    running.delete(id)
  }
}

/**
 * A page that has not changed is not resent, so the panel says whether the newest one is
 * still what they are looking at. Reading that off the last turn alone would call every
 * follow up about the same page stale.
 */
function standingOf({ messages, pageIsCurrent }: Asked): PageStanding {
  if (!messages.some((entry) => entry.page)) return 'none'
  return pageIsCurrent ? 'current' : 'earlier'
}

/**
 * A page rides on the turn it was attached to and is folded into that turn's text here,
 * so no adapter has to know a page can come with a question.
 */
function fold(entry: ChatMessage): ChatMessage {
  if (!entry.page) return entry
  return { role: entry.role, text: `${pageBlock(entry.page)}
${entry.text}` }
}

export function cancel(id: number): void {
  running.get(id)?.abort()
}

/**
 * The provider's own list once there is a key, and the adapter's guess before that. The
 * caller is told which it got, since a guess must not displace a list it has kept.
 */
export async function models(provider: ProviderId): Promise<ModelList> {
  const adapter = adapterFor(provider)
  const key = await readKey(provider)
  if (!key) return { models: adapter.fallbackModels, live: false }

  try {
    const listed = await adapter.listModels(key)
    if (listed.length > 0) return { models: listed, live: true }
  } catch {
    // A list we cannot fetch is no reason to block the panel.
  }
  return { models: adapter.fallbackModels, live: false }
}

/** The span a tally should cover, worked out from how the provider counts its own. */
export function usageWindow(provider: ProviderId): UsageWindow {
  const quota = adapterFor(provider).quota
  const now = Date.now()

  if (quota.kind === 'rolling') {
    return { since: now - quota.hours * 3_600_000, label: `Last ${quota.hours}h`, zone: null }
  }

  return { since: midnightIn(quota.zone, now), label: 'Today', zone: zoneName(quota.zone, now) }
}

/** When the current day began in that zone, as an instant. */
function midnightIn(zone: string, now: number): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)

  const [year, month, day] = parts.split('-').map(Number)
  // Midnight there written as though it were UTC, then moved by that zone's offset.
  return Date.UTC(year, month - 1, day) - offsetOf(zone, now)
}

function offsetOf(zone: string, at: number): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value

  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '')
  if (!match) return 0

  const minutes = Number(match[2]) * 60 + Number(match[3])
  return (match[1] === '-' ? -minutes : minutes) * 60_000
}

function zoneName(zone: string, at: number): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? zone
  )
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:usage-window', (_event, provider: unknown) => {
    if (!isProvider(provider)) throw new Error('Unknown provider.')
    return usageWindow(provider)
  })

  ipcMain.handle('ai:models', (_event, provider: unknown) => {
    if (!isProvider(provider)) throw new Error('Unknown provider.')
    return models(provider)
  })

  ipcMain.on('ai:ask', (event, request: unknown) => {
    void streamTo(event.sender, request)
  })

  ipcMain.on('ai:cancel', (_event, id: unknown) => {
    if (typeof id === 'number') cancel(id)
  })
}

/** An answer arrives as a run of events, so this travels over `send`/`on` rather than `invoke`. */
async function streamTo(sender: WebContents, request: unknown): Promise<void> {
  let asked: Asked
  try {
    asked = parse(request)
  } catch {
    // Nothing names an id to reply to, so a malformed request is just dropped.
    return
  }

  try {
    const answer = await ask(asked, (text) => sender.send('ai:delta', asked.id, text))
    sender.send('ai:done', asked.id, answer)
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : 'That did not go through.'
    sender.send('ai:error', asked.id, message)
  }
}

interface Asked {
  id: number
  provider: ProviderId
  model: string
  messages: ChatMessage[]
  /** Whether the newest page in the conversation is still the one in front of them. */
  pageIsCurrent: boolean
}

/** The panel is ours, but nothing that crosses the bridge is taken on trust. */
function parse(request: unknown): Asked {
  if (!request || typeof request !== 'object') throw new Error('Malformed request.')
  const { id, provider, model, messages, pageIsCurrent } = request as Record<string, unknown>

  if (typeof id !== 'number') throw new Error('Malformed request.')
  if (!isProvider(provider)) throw new Error('Unknown provider.')
  if (typeof model !== 'string' || model.length === 0 || model.length > 200) {
    throw new Error('Unknown model.')
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new Error('Malformed conversation.')
  }

  return {
    id,
    provider,
    model,
    messages: messages.map(toMessage),
    pageIsCurrent: pageIsCurrent === true
  }
}

function toMessage(value: unknown): ChatMessage {
  if (!value || typeof value !== 'object') throw new Error('Malformed conversation.')
  const { role, text, page } = value as Record<string, unknown>

  if (role !== 'user' && role !== 'assistant') throw new Error('Malformed conversation.')
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT) {
    throw new Error('Malformed conversation.')
  }
  // An answer never carries a page, so one on that side is a request gone wrong.
  if (page === undefined || role === 'assistant') return { role, text }
  return { role, text, page: toPage(page) }
}

function toPage(value: unknown): PageBlock {
  if (!value || typeof value !== 'object') throw new Error('Malformed page.')
  const { title, url, text } = value as Record<string, unknown>

  if (typeof title !== 'string' || title.length > MAX_TITLE) throw new Error('Malformed page.')
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL) {
    throw new Error('Malformed page.')
  }
  if (typeof text !== 'string' || text.length > MAX_PAGE_TEXT) throw new Error('Malformed page.')

  return { title, url, text }
}
