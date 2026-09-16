import { ipcMain } from 'electron'
import { SYSTEM_PROMPT } from './prompt'
import { adapterFor } from './registry'
import { AiError, type ChatMessage } from './types'
import { isProvider, readKey } from '../secrets'
import type { ModelList, ProviderId } from '../../preload'

/*
 * The connection between the browser and an adapter. It finds the key, hands the
 * conversation over and keeps the handle a cancel needs. The conversation itself lives in
 * the panel: this process holds nothing between one question and the next.
 */

// A question longer than this is a paste gone wrong, not something to send.
const MAX_TEXT = 200_000
const MAX_MESSAGES = 200

const running = new Map<number, AbortController>()

export async function ask(
  id: number,
  provider: ProviderId,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
  const key = await readKey(provider)
  if (!key) {
    throw new AiError('no-key', 'Add a key for this provider first.')
  }

  const controller = new AbortController()
  running.set(id, controller)
  try {
    return await adapterFor(provider).ask(key, {
      model,
      system: SYSTEM_PROMPT,
      messages,
      signal: controller.signal
    })
  } finally {
    running.delete(id)
  }
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

export function registerAiIpc(): void {
  ipcMain.handle('ai:models', (_event, provider: unknown) => {
    if (!isProvider(provider)) throw new Error('Unknown provider.')
    return models(provider)
  })

  ipcMain.handle('ai:ask', (_event, request: unknown) => {
    const asked = parse(request)
    return ask(asked.id, asked.provider, asked.model, asked.messages)
  })

  ipcMain.on('ai:cancel', (_event, id: unknown) => {
    if (typeof id === 'number') cancel(id)
  })
}

interface Asked {
  id: number
  provider: ProviderId
  model: string
  messages: ChatMessage[]
}

/** The panel is ours, but nothing that crosses the bridge is taken on trust. */
function parse(request: unknown): Asked {
  if (!request || typeof request !== 'object') throw new Error('Malformed request.')
  const { id, provider, model, messages } = request as Record<string, unknown>

  if (typeof id !== 'number') throw new Error('Malformed request.')
  if (!isProvider(provider)) throw new Error('Unknown provider.')
  if (typeof model !== 'string' || model.length === 0 || model.length > 200) {
    throw new Error('Unknown model.')
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new Error('Malformed conversation.')
  }

  return { id, provider, model, messages: messages.map(toMessage) }
}

function toMessage(value: unknown): ChatMessage {
  if (!value || typeof value !== 'object') throw new Error('Malformed conversation.')
  const { role, text } = value as Record<string, unknown>

  if (role !== 'user' && role !== 'assistant') throw new Error('Malformed conversation.')
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT) {
    throw new Error('Malformed conversation.')
  }
  return { role, text }
}
