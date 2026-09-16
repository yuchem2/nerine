import { useEffect, useRef, useState, type JSX } from 'react'
import styles from '@renderer/panel/Picker.module.css'

export interface Choice {
  id: string
  label: string
  /** A word at the end of the row, such as whether a key is on file. */
  note?: string
  /** Rows carrying a new group name get a heading above them. */
  group?: string
}

interface Props {
  choices: Choice[]
  value: string
  onChange: (id: string) => void
  label: string
}

/** Drawn rather than native: the list the OS opens under a select ignores our styling. */
export default function Picker({ choices, value, onChange, label }: Props): JSX.Element {
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

  if (!current) return <></>

  return (
    <div className={styles.picker} ref={box}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className={styles.label} title={current.label}>
          {current.label}
        </span>
        {current.note && <span className={styles.note}>{current.note}</span>}
        <span className={`${styles.chevron} ${open ? styles.up : ''}`} />
      </button>

      {open && (
        <ul className={styles.list} role="listbox">
          {choices.map((choice, index) => (
            <li key={choice.id}>
              {choice.group && choice.group !== choices[index - 1]?.group && (
                <span className={styles.group}>{choice.group}</span>
              )}
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
                <span className={styles.label} title={choice.label}>
                  {choice.label}
                </span>
                {choice.note && <span className={styles.note}>{choice.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
