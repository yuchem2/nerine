import type { JSX } from 'react'
import styles from '@renderer/overlay/SelectionButton.module.css'

const pick = (action: string): void => window.nerine.overlay.selectionPick(action)

export default function SelectionButton(): JSX.Element {
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.button}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick('explain')}
      >
        Explain
      </button>
      <button
        type="button"
        className={styles.button}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pick('translate')}
      >
        Translate
      </button>
    </div>
  )
}
