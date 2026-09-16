import OpenAI from 'openai'
import { AiError, type Adapter, type AskRequest, type Model } from '../types'

/*
 * Anything that is not a chat model would only clutter the picker. The prefix lets the
 * chat families through, and the second pattern drops the ones among them that answer in
 * pictures or sound, or that take a completion rather than a conversation.
 */
const CHAT_FAMILY = /^(gpt|o\d)/
const NOT_CHAT = /image|audio|realtime|transcribe|tts|instruct|moderation|embedding/i

export const openaiAdapter: Adapter = {
  id: 'openai',
  label: 'ChatGPT',
  fallbackModels: [{ id: 'gpt-5.1', label: 'GPT-5.1', chat: true }],

  async ask(key: string, request: AskRequest): Promise<string> {
    try {
      const response = await client(key).responses.create(
        {
          model: request.model,
          instructions: request.system,
          input: request.messages.map((entry) => ({ role: entry.role, content: entry.text }))
        },
        { signal: request.signal }
      )
      return response.output_text.trim()
    } catch (failure) {
      throw translate(failure)
    }
  },

  async listModels(key: string): Promise<Model[]> {
    try {
      const page = await client(key).models.list()
      // The family is the gate, since whisper and dall-e cannot hold a conversation at
      // all. Within it, the ones that answer in pictures or sound are only set aside.
      return page.data
        .filter((model) => CHAT_FAMILY.test(model.id))
        .map((model) => ({ id: model.id, label: model.id, chat: !NOT_CHAT.test(model.id) }))
        .sort((left, right) => left.id.localeCompare(right.id))
    } catch (failure) {
      throw translate(failure)
    }
  },

  async verify(key: string): Promise<void> {
    try {
      await client(key).models.list()
    } catch (failure) {
      throw translate(failure)
    }
  }
}

function client(key: string): OpenAI {
  return new OpenAI({ apiKey: key })
}

function translate(failure: unknown): AiError {
  if (failure instanceof OpenAI.APIUserAbortError) {
    return new AiError('cancelled', 'Stopped.')
  }
  if (failure instanceof OpenAI.AuthenticationError || failure instanceof OpenAI.PermissionDeniedError) {
    return new AiError('bad-key', 'OpenAI did not accept that key.')
  }
  if (failure instanceof OpenAI.RateLimitError) {
    return new AiError('rate-limit', 'OpenAI is rate limiting this key. Try again shortly.')
  }
  if (failure instanceof OpenAI.APIConnectionError) {
    return new AiError('offline', 'Could not reach OpenAI.')
  }
  if (failure instanceof OpenAI.APIError) {
    return new AiError('unknown', `OpenAI returned an error (${failure.status ?? 'no status'}).`)
  }
  return new AiError('unknown', 'OpenAI could not be reached.')
}
