import { GoogleGenAI } from '@google/genai'
import { AiError, type Adapter, type Answer, type AskRequest, type Model } from '../types'

// The catalogue also holds embedding and image models, which this panel cannot use.
const CHAT_ACTION = 'generateContent'

/*
 * Picture, sound and embedding models answer generateContent too, so the action alone
 * does not sort them out.
 */
const NOT_CHAT = /image|imagen|veo|tts|audio|embedding|aqa|live/i

export const geminiAdapter: Adapter = {
  id: 'gemini',
  label: 'Gemini',
  // Google's daily quota turns over at midnight Pacific, wherever the machine happens to be.
  site: 'https://gemini.google.com/app',
  quota: { kind: 'calendar', zone: 'America/Los_Angeles' },
  fallbackModels: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', chat: true }],

  async ask(key: string, request: AskRequest, onDelta: (text: string) => void): Promise<Answer> {
    try {
      const stream = await client(key).models.generateContentStream({
        model: request.model,
        // Gemini calls the assistant 'model', and every turn is a list of parts.
        contents: request.messages.map((entry) => ({
          role: entry.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: entry.text }]
        })),
        config: { systemInstruction: request.system, abortSignal: request.signal }
      })

      let text = ''
      // The last chunk's usage is the total, since Google counts the whole answer there.
      let usage: Answer['usage'] = null
      for await (const chunk of stream) {
        const delta = chunk.text ?? ''
        if (delta) {
          text += delta
          onDelta(delta)
        }
        // Thinking is billed as output here, so it is counted as output.
        const chunkUsage = chunk.usageMetadata
        if (chunkUsage) {
          usage = {
            input: chunkUsage.promptTokenCount ?? 0,
            output: (chunkUsage.candidatesTokenCount ?? 0) + (chunkUsage.thoughtsTokenCount ?? 0)
          }
        }
      }
      return { text: text.trim(), usage }
    } catch (failure) {
      throw translate(failure, 'ask')
    }
  },

  async listModels(key: string): Promise<Model[]> {
    try {
      const page = await client(key).models.list()
      // Whether the model answers this endpoint is the provider's word. Whether it
      // answers in words is ours, so that reading only sets a model aside.
      const models: Model[] = []
      for (const model of page.page) {
        const id = (model.name ?? '').replace(/^models\//, '')
        if (!id || !model.supportedActions?.includes(CHAT_ACTION)) continue
        models.push({ id, label: model.displayName || id, chat: !NOT_CHAT.test(id) })
      }
      return models.sort((left, right) => left.label.localeCompare(right.label))
    } catch (failure) {
      throw translate(failure, 'key')
    }
  },

  async verify(key: string): Promise<void> {
    try {
      await client(key).models.list()
    } catch (failure) {
      throw translate(failure, 'key')
    }
  }
}

function client(key: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: key })
}

/**
 * This SDK reports over HTTP status rather than error classes, so the status is read. A
 * 400 means the key while we are only listing models, and the request itself once there
 * is a model and a conversation to get wrong.
 */
function translate(failure: unknown, during: 'key' | 'ask'): AiError {
  if (failure instanceof Error && failure.name === 'AbortError') {
    return new AiError('cancelled', 'Stopped.')
  }

  const status = statusOf(failure)
  if (status === 401 || status === 403 || refusesKey(failure) || (status === 400 && during === 'key')) {
    return new AiError('bad-key', 'Google did not accept that key.')
  }
  if (status === 429) {
    return new AiError('rate-limit', 'Google is rate limiting this key. Try again shortly.')
  }
  if (status === undefined) {
    return new AiError('offline', 'Could not reach Google.')
  }
  return new AiError('unknown', `Google returned an error (${status}).`)
}

/** A 400 carries its real reason in the body, and this is the one worth naming. */
function refusesKey(failure: unknown): boolean {
  return failure instanceof Error && failure.message.includes('API_KEY_INVALID')
}

function statusOf(failure: unknown): number | undefined {
  if (!failure || typeof failure !== 'object') return undefined
  const status = (failure as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}
