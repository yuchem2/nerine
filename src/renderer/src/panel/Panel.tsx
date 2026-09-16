import { useEffect, useState, type JSX } from 'react'
import Chat from '@renderer/panel/Chat'
import Settings from '@renderer/panel/Settings'
import styles from '@renderer/panel/Panel.module.css'

export default function Panel(): JSX.Element {
  const [keys, setKeys] = useState<Nerine.Key[] | null>(null)
  const [provider, setProvider] = useState<Nerine.Provider>('anthropic')
  const [editingKeys, setEditingKeys] = useState(false)

  useEffect(() => {
    void window.ai.keys.read().then((state) => {
      setKeys(state)
      // Start on a provider that is ready to use, if there is one.
      setProvider(state.find((key) => key.configured)?.provider ?? state[0].provider)
    })
  }, [])

  if (!keys) return <div className={styles.panel} />

  const ready = keys.filter((key) => key.configured)
  const settled = (state: Nerine.Key[]): void => {
    setKeys(state)
    const first = state.find((key) => key.configured)
    if (first && !state.some((key) => key.configured && key.provider === provider)) {
      setProvider(first.provider)
    }
  }

  return (
    <div className={styles.panel}>
      {ready.length === 0 || editingKeys ? (
        <Settings
          keys={keys}
          picked={provider}
          onPick={setProvider}
          onChange={settled}
          onDone={ready.length > 0 ? () => setEditingKeys(false) : undefined}
        />
      ) : (
        <Chat
          ready={ready}
          provider={provider}
          onProvider={setProvider}
          onSettings={() => setEditingKeys(true)}
        />
      )}
    </div>
  )
}
