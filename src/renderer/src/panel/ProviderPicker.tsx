import { useEffect, useRef, useState, type JSX } from 'react'
import styles from '@renderer/panel/ProviderPicker.module.css'

export interface Choice {
  id: Nerine.Provider
  label: string
  saved: boolean
}

interface Props {
  choices: Choice[]
  value: Nerine.Provider
  onChange: (id: Nerine.Provider) => void
}

/** Drawn rather than native: the list the OS opens under a select ignores our styling. */
export default function ProviderPicker({ choices, value, onChange }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = choices.find((choice) => choice.id === value) ?? choices[0]

  useEffect(() => {
    if (!open) return

    const away = (event: MouseEvent): void => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className={styles.picker} ref={box}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className={styles.label}>{current.label}</span>
        {current.saved && <span className={styles.saved}>key saved</span>}
        <span className={`${styles.chevron} ${open ? styles.up : ''}`} />
      </button>

      {open && (
        <ul className={styles.list} role="listbox">
          {choices.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                role="option"
                aria-selected={choice.id === value}
                className={`${styles.option} ${choice.id === value ? styles.picked : ''}`}
                onClick={() => {
                  onChange(choice.id)
                  setOpen(false)
                }}
              >
                <span className={styles.label}>{choice.label}</span>
                {choice.saved && <span className={styles.saved}>key saved</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
