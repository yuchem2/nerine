import { useState, type FormEvent, type JSX } from 'react'
import styles from '@renderer/panel/KeyRow.module.css'

interface Props {
  /** Only for the field's label. The selector above already names the provider. */
  name: string
  state: Nerine.Key
  onChange: (keys: Nerine.Key[]) => void
}

export default function KeyRow({ name, state, onChange }: Props): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (draft.trim().length === 0 || busy) return

    setBusy(true)
    setError('')
    try {
      onChange(await window.ai.keys.save(state.provider, draft))
      // Nothing keeps the key here once main has it.
      setDraft('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save that key.')
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
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
            Key saved{state.hint && <span className={styles.hint}> ending {state.hint}</span>}
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
