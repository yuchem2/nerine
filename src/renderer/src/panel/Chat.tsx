import { useEffect, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from 'react'
import Picker from '@renderer/panel/Picker'
import { NAMES } from '@renderer/panel/providers'
import styles from '@renderer/panel/Chat.module.css'

interface Props {
  /** Only providers with a key on file. */
  ready: Nerine.Key[]
  provider: Nerine.Provider
  onProvider: (provider: Nerine.Provider) => void
  onSettings: () => void
}

/*
 * The chosen model and the list it came from are preferences, so they live with the panel
 * rather than in the key store. The cached list is what the picker shows while the
 * provider is being asked again, and what it keeps if that fails.
 */
const remembered = (provider: Nerine.Provider): string | null => read(`model:${provider}`)

const remember = (provider: Nerine.Provider, model: string): void =>
  write(`model:${provider}`, model)

const cachedModels = (provider: Nerine.Provider): Nerine.Model[] => {
  const raw = read(`models:${provider}`)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Nerine.Model[]) : []
  } catch {
    return []
  }
}

const cacheModels = (provider: Nerine.Provider, models: Nerine.Model[]): void =>
  write(`models:${provider}`, JSON.stringify(models))

interface Ask {
  at: number
  input: number
  output: number
}

interface Spent {
  input: number
  output: number
  asks: number
}

const NOTHING_SPENT: Spent = { input: 0, output: 0, asks: 0 }

// Long enough to cover any window a provider counts by, short enough to stay small.
const KEEP_MS = 48 * 3_600_000

/*
 * Each answer is kept with the moment it came, and the panel adds up the ones inside
 * whatever span the provider counts by. Storing the sum instead would fix the span at the
 * moment of writing, which is exactly what a rolling window will not have.
 */
const asksOf = (provider: Nerine.Provider): Ask[] => {
  const raw = read(`usage:${provider}`)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAsk)
  } catch {
    return []
  }
}

const recordAsk = (provider: Nerine.Provider, usage: Nerine.Usage | null): Ask[] => {
  const fresh = Date.now() - KEEP_MS
  const asks = [
    ...asksOf(provider).filter((ask) => ask.at >= fresh),
    { at: Date.now(), input: usage?.input ?? 0, output: usage?.output ?? 0 }
  ]
  write(`usage:${provider}`, JSON.stringify(asks))
  return asks
}

const spentSince = (asks: Ask[], since: number): Spent =>
  asks
    .filter((ask) => ask.at >= since)
    .reduce(
      (total, ask) => ({
        input: total.input + ask.input,
        output: total.output + ask.output,
        asks: total.asks + 1
      }),
      NOTHING_SPENT
    )

function isAsk(value: unknown): value is Ask {
  if (!value || typeof value !== 'object') return false
  const ask = value as Record<string, unknown>
  return (
    typeof ask.at === 'number' && typeof ask.input === 'number' && typeof ask.output === 'number'
  )
}

/** Says which span the figure covers, since that is the provider's choice and not ours. */
function told(spent: Spent, period: Nerine.Window): string {
  const counted = `${spent.input} in, ${spent.output} out`
  return period.zone
    ? `${counted} since midnight ${period.zone}`
    : `${counted} over ${period.label.toLowerCase()}`
}

/** Counts run to the thousands quickly, and the exact figure is not the point. */
function short(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  return `${(tokens / 1000).toFixed(tokens < 9950 ? 1 : 0)}k`
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A panel that cannot remember still works.
  }
}

export default function Chat({ ready, provider, onProvider, onSettings }: Props): JSX.Element {
  const [models, setModels] = useState<Nerine.Model[]>([])
  const [model, setModel] = useState('')
  const [turns, setTurns] = useState<Nerine.Turn[]>([])
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [asks, setAsks] = useState<Ask[]>([])
  const [period, setPeriod] = useState<Nerine.Window | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current = true

    const settle = (listed: Nerine.Model[]): void => {
      if (!current || listed.length === 0) return
      setModels(listed)
      const saved = remembered(provider)
      const pick =
        listed.find((entry) => entry.id === saved) ??
        listed.find((entry) => entry.chat) ??
        listed[0]
      setModel(pick.id)
    }

    setAsks(asksOf(provider))
    void window.ai.chat.usageWindow(provider).then((window) => {
      if (current) setPeriod(window)
    })

    // The cache answers at once, the provider answers when it answers. A guess is only
    // worth showing while there is nothing better on hand.
    const kept = cachedModels(provider)
    settle(kept)
    void window.ai.chat.models(provider).then(({ models: listed, live }) => {
      if (!live && kept.length > 0) return
      settle(listed)
      if (live) cacheModels(provider, listed)
    })

    return () => {
      current = false
    }
  }, [provider])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, asking])

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const question = draft.trim()
    if (question.length === 0 || asking !== null || model === '') return

    const history: Nerine.Turn[] = [...turns, { role: 'user', text: question }]
    const id = Date.now()
    setTurns(history)
    setDraft('')
    setError('')
    setAsking(id)

    try {
      const answer = await window.ai.chat.ask({ id, provider, model, messages: history })
      setTurns([...history, { role: 'assistant', text: answer.text }])
      setAsks(recordAsk(provider, answer.usage))
      // A rolling span moves on, so the window is asked for again with each answer.
      void window.ai.chat.usageWindow(provider).then(setPeriod)
    } catch (failure) {
      setError(reasonFrom(failure))
    } finally {
      setAsking(null)
    }
  }

  const keys = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter sends, and a newline needs a modifier, as it does everywhere else.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send(event as unknown as FormEvent)
    }
  }

  const spent = period ? spentSince(asks, period.since) : NOTHING_SPENT

  return (
    <div className={styles.chat}>
      <div className={styles.bar}>
        {ready.length > 1 && (
          <Picker
            label="Provider"
            choices={ready.map((key) => ({ id: key.provider, label: NAMES[key.provider] }))}
            value={provider}
            onChange={(id) => onProvider(id as Nerine.Provider)}
          />
        )}
        <Picker
          label="Model"
          choices={[...models]
            .sort((left, right) => Number(right.chat) - Number(left.chat))
            .map((entry) => ({
              id: entry.id,
              label: entry.label,
              group: entry.chat ? 'Chat' : 'Other'
            }))}
          value={model}
          onChange={(id) => {
            setModel(id)
            remember(provider, id)
          }}
        />
        <button type="button" className={styles.settings} onClick={onSettings}>
          Keys
        </button>
      </div>

      {period && spent.asks > 0 && (
        <p className={styles.spent} title={told(spent, period)}>
          {period.label} {short(spent.input + spent.output)} tokens over {spent.asks}{' '}
          {spent.asks === 1 ? 'ask' : 'asks'}
        </p>
      )}

      <div className={styles.thread}>
        {turns.length === 0 && !asking && (
          <p className={styles.empty}>Ask anything.</p>
        )}

        {turns.map((turn, index) => (
          <div key={index} className={turn.role === 'user' ? styles.asked : styles.answered}>
            {turn.text}
          </div>
        ))}

        {asking !== null && <div className={styles.waiting}>Thinking</div>}
        {error && <p className={styles.error}>{error}</p>}
        <div ref={end} />
      </div>

      <form className={styles.composer} onSubmit={send}>
        <textarea
          className={styles.input}
          value={draft}
          rows={2}
          placeholder="Ask the model"
          aria-label="Message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={keys}
        />
        {asking !== null ? (
          <button
            type="button"
            className={styles.stop}
            onClick={() => window.ai.chat.cancel(asking)}
          >
            Stop
          </button>
        ) : (
          <button type="submit" className={styles.send} disabled={draft.trim().length === 0}>
            Send
          </button>
        )}
      </form>
    </div>
  )
}

/** Electron prefixes a handler's error with its own wrapper, which is no use to anyone. */
function reasonFrom(failure: unknown): string {
  if (!(failure instanceof Error)) return 'That did not go through.'
  return failure.message
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^\w*Error:\s*/, '')
}
