import { useEffect, useState, type JSX } from 'react'
import KeyRow from '@renderer/panel/KeyRow'
import ProviderPicker from '@renderer/panel/ProviderPicker'
import styles from '@renderer/panel/Panel.module.css'

const NAMES: Record<Nerine.Provider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  gemini: 'Gemini'
}

export default function Panel(): JSX.Element {
  const [keys, setKeys] = useState<Nerine.Key[] | null>(null)
  const [picked, setPicked] = useState<Nerine.Provider>('anthropic')

  useEffect(() => {
    void window.ai.keys.read().then((state) => {
      setKeys(state)
      // Start on a provider that is ready to use, if there is one.
      setPicked(state.find((key) => key.configured)?.provider ?? state[0].provider)
    })
  }, [])

  if (!keys) return <div className={styles.panel} />

  const selected = keys.find((key) => key.provider === picked) ?? keys[0]
  // The machine answers the same for every provider, so any row speaks for all of them.
  const sessionOnly = keys.every((key) => !key.persisted)

  return (
    <div className={styles.panel}>
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
        <ProviderPicker
          choices={keys.map((key) => ({
            id: key.provider,
            label: NAMES[key.provider],
            saved: key.configured
          }))}
          value={selected.provider}
          onChange={setPicked}
        />
      </div>

      <KeyRow name={NAMES[selected.provider]} state={selected} onChange={setKeys} />
    </div>
  )
}
