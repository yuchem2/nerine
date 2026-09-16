import { anthropicAdapter } from './adapters/anthropic'
import { geminiAdapter } from './adapters/gemini'
import { openaiAdapter } from './adapters/openai'
import type { Adapter } from './types'
import type { ProviderId } from '../../preload'

/** One entry per provider. Adding another means writing an adapter and listing it here. */
const ADAPTERS: Record<ProviderId, Adapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter
}

export function adapterFor(provider: ProviderId): Adapter {
  return ADAPTERS[provider]
}

export function adapters(): Adapter[] {
  return Object.values(ADAPTERS)
}
