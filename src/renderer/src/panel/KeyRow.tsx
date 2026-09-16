import { useState, type FormEvent, type JSX } from 'react'
import styles from '@renderer/panel/KeyRow.module.css'

interface Props {
  /** Only for the field's label. The selector above already names the provider. */
  name: string
  state: Nerine.Key
  onChange: (keys: Nerine.Key[]) => void
}

/** Electron prefixes a handler's error with its own wrapper, which is no use to anyone. */
function reasonFrom(failure: unknown): string {
  if (!(failure instanceof Error)) return 'Could not save that key.'
  return failure.message
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^\w*Error:\s*/, '')
}

export default function KeyRow({ name, state, onChange }: Props): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unchecked, setUnchecked] = useState(false)

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (draft.trim().length === 0 || busy) return

    setBusy(true)
    setError('')
    try {
      const { keys, checked } = await window.ai.keys.save(state.provider, draft)
      onChange(keys)
      setUnchecked(!checked)
      // Nothing keeps the key here once main has it.
      setDraft('')
    } catch (failure) {
      setError(reasonFrom(failure))
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    setUnchecked(false)
    try {
      onChange(await window.ai.keys.clear(state.provider))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.row}>
      {state.configured ? (
        <div className={styles.head}>
          <p className={styles.saved}>
            {unchecked ? 'Key saved, not checked' : 'Key saved'}
            {state.hint && <span className={styles.hint}> ending {state.hint}</span>}
          </p>
          <button type="button" className={styles.link} onClick={clear} disabled={busy}>
            Remove
          </button>
        </div>
      ) : (
        <>
          <form className={styles.form} onSubmit={save}>
            <input
              className={styles.field}
              type="password"
              value={draft}
              spellCheck={false}
              autoComplete="off"
              placeholder="Paste the API key"
              aria-label={`${name} API key`}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className={styles.save} disabled={busy || draft.length === 0}>
              Save
            </button>
          </form>
          <button
            type="button"
            className={styles.link}
            onClick={() => window.ai.keys.openPage(state.provider)}
          >
            Get a key
          </button>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
