import type { ProviderId } from '../../preload'

/*
 * The shapes every provider is translated into. Nothing above this layer knows which SDK
 * is underneath, and nothing below it knows what the browser is asking for.
 */

export type Role = 'user' | 'assistant'

export interface ChatMessage {
  role: Role
  text: string
  /** The page that came with this turn. Only a question ever carries one. */
  page?: PageBlock
}

/** A page as the model gets it: what it is, where it is, and what it says. */
export interface PageBlock {
  title: string
  url: string
  text: string
}

export interface AskRequest {
  model: string
  /** Standing instructions, which each adapter passes the way its provider expects. */
  system: string
  messages: ChatMessage[]
  signal?: AbortSignal
}

export interface Usage {
  input: number
  output: number
}

export interface Answer {
  text: string
  /** Null when the provider sent no count with the answer. */
  usage: Usage | null
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

/**
 * How a provider counts a day. Google's turns over at midnight on its own clock, while
 * OpenAI's is the last 24 hours from whenever you ask. A tally kept the other way resets
 * at the wrong moment and says nothing about how close a limit is.
 */
export type Quota = { kind: 'calendar'; zone: string } | { kind: 'rolling'; hours: number }

export interface Adapter {
  id: ProviderId
  label: string
  /** Where the provider's own chat lives, for people who would rather sign in to it. */
  site: string
  quota: Quota
  /** Offered before a key exists to ask the provider what it actually has. */
  fallbackModels: Model[]
  /** Called with each fragment of text as it arrives, ahead of the full answer. */
  ask: (key: string, request: AskRequest, onDelta: (text: string) => void) => Promise<Answer>
  listModels: (key: string) => Promise<Model[]>
  /** Throws an AiError the moment the provider turns the key away. */
  verify: (key: string) => Promise<void>
}
