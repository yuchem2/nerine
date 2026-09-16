import type { ProviderId } from '../../preload'

/*
 * The shapes every provider is translated into. Nothing above this layer knows which SDK
 * is underneath, and nothing below it knows what the browser is asking for.
 */

export type Role = 'user' | 'assistant'

export interface ChatMessage {
  role: Role
  text: string
}

export interface AskRequest {
  model: string
  /** Standing instructions, which each adapter passes the way its provider expects. */
  system: string
  messages: ChatMessage[]
  signal?: AbortSignal
}

export interface Model {
  id: string
  label: string
  /**
   * Whether this is one to chat with. Only Anthropic says outright what a model is for,
   * so elsewhere this is a reading of the name, and the picker sets aside rather than
   * hides what fails it.
   */
  chat: boolean
}

export type Failure = 'no-key' | 'bad-key' | 'rate-limit' | 'offline' | 'cancelled' | 'unknown'

/** What the panel is allowed to hear about a failure. Provider errors stop here. */
export class AiError extends Error {
  constructor(
    readonly failure: Failure,
    message: string
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export interface Adapter {
  id: ProviderId
  label: string
  /** Offered before a key exists to ask the provider what it actually has. */
  fallbackModels: Model[]
  ask: (key: string, request: AskRequest) => Promise<string>
  listModels: (key: string) => Promise<Model[]>
  /** Throws an AiError the moment the provider turns the key away. */
  verify: (key: string) => Promise<void>
}
