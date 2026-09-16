import type { JSX } from 'react'
import KeyRow from '@renderer/panel/KeyRow'
import Picker from '@renderer/panel/Picker'
import { NAMES } from '@renderer/panel/providers'
import styles from '@renderer/panel/Settings.module.css'

interface Props {
  keys: Nerine.Key[]
  picked: Nerine.Provider
  onPick: (provider: Nerine.Provider) => void
  onChange: (keys: Nerine.Key[]) => void
  /** Absent until there is a key to go back to. */
  onDone?: () => void
}

export default function Settings({ keys, picked, onPick, onChange, onDone }: Props): JSX.Element {
  const selected = keys.find((key) => key.provider === picked) ?? keys[0]
  // The machine answers the same for every provider, so any row speaks for all of them.
  const sessionOnly = keys.every((key) => !key.persisted)

  return (
    <div className={styles.settings}>
      <p className={styles.intro}>
        Choose a provider and add its key. Keys stay on this machine and go nowhere except
        the requests you send to that provider.
      </p>

      {sessionOnly && (
        <p className={styles.warning}>
          This machine has no secure store, so keys are held until Nerine closes.
        </p>
      )}

      <div className={styles.field}>
        <span className={styles.label}>Provider</span>
        <Picker
          label="Provider"
          choices={keys.map((key) => ({
            id: key.provider,
            label: NAMES[key.provider],
            note: key.configured ? 'key saved' : undefined
          }))}
          value={selected.provider}
          onChange={(id) => onPick(id as Nerine.Provider)}
        />
      </div>

      <KeyRow name={NAMES[selected.provider]} state={selected} onChange={onChange} />

      {onDone && (
        <button type="button" className={styles.done} onClick={onDone}>
          Back to the conversation
        </button>
      )}
    </div>
  )
}
