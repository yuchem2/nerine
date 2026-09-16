import Anthropic from '@anthropic-ai/sdk'
import { AiError, type Adapter, type Answer, type AskRequest, type Model } from '../types'

// Long enough for an answer in a side panel, short enough to stay inside the SDK timeout.
const MAX_TOKENS = 16000

export const anthropicAdapter: Adapter = {
  id: 'anthropic',
  label: 'Claude',
  // Limits here are counted per minute, so the last day is the nearest useful span.
  quota: { kind: 'rolling', hours: 24 },
  fallbackModels: [
    { id: 'claude-opus-5', label: 'Claude Opus 5', chat: true },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', chat: true },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', chat: true }
  ],

  async ask(key: string, request: AskRequest): Promise<Answer> {
    try {
      const message = await client(key).messages.create(
        {
          model: request.model,
          max_tokens: MAX_TOKENS,
          system: request.system,
          messages: request.messages.map((entry) => ({
            role: entry.role,
            content: entry.text
          }))
        },
        { signal: request.signal }
      )

      // Thinking blocks come back empty by default, so only the text is of any use here.
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()

      // Cached input is input too, as far as a limit is concerned.
      const { usage } = message
      return {
        text,
        usage: {
          input:
            usage.input_tokens +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0),
          output: usage.output_tokens
        }
      }
    } catch (failure) {
      throw translate(failure)
    }
  },

  async listModels(key: string): Promise<Model[]> {
    try {
      // Everything this endpoint returns answers messages, and a model the account
      // cannot use is not returned at all.
      const page = await client(key).models.list({ limit: 50 })
      return page.data.map((model) => ({
        id: model.id,
        label: model.display_name || model.id,
        chat: true
      }))
    } catch (failure) {
      throw translate(failure)
    }
  },

  async verify(key: string): Promise<void> {
    try {
      await client(key).models.list({ limit: 1 })
    } catch (failure) {
      throw translate(failure)
    }
  }
}

function client(key: string): Anthropic {
  return new Anthropic({ apiKey: key })
}

/** The SDK's error classes are the only place this provider's shape is read. */
function translate(failure: unknown): AiError {
  if (failure instanceof Anthropic.APIUserAbortError) {
    return new AiError('cancelled', 'Stopped.')
  }
  if (failure instanceof Anthropic.AuthenticationError || failure instanceof Anthropic.PermissionDeniedError) {
    return new AiError('bad-key', 'Claude did not accept that key.')
  }
  if (failure instanceof Anthropic.RateLimitError) {
    return new AiError('rate-limit', 'Claude is rate limiting this key. Try again shortly.')
  }
  if (failure instanceof Anthropic.APIConnectionError) {
    return new AiError('offline', 'Could not reach Claude.')
  }
  if (failure instanceof Anthropic.APIError) {
    return new AiError('unknown', `Claude returned an error (${failure.status ?? 'no status'}).`)
  }
  return new AiError('unknown', 'Claude could not be reached.')
}
