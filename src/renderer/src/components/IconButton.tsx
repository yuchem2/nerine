import type { JSX, MouseEvent, ReactNode } from 'react'
import styles from '@renderer/components/IconButton.module.css'

interface IconButtonProps {
  /** Both the tooltip and the accessible name. */
  label: string
  onClick: () => void
  children: ReactNode
  size?: number
  disabled?: boolean
  /** For a group where one button is always the current choice. */
  active?: boolean
  /** Keeps the click from moving focus, for buttons that sit over a page. */
  holdFocus?: boolean
}

export default function IconButton({
  label,
  onClick,
  children,
  size = 26,
  disabled = false,
  active = false,
  holdFocus = false
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={`${styles.button} ${active ? styles.active : ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      onMouseDown={holdFocus ? (event: MouseEvent) => event.preventDefault() : undefined}
      disabled={disabled}
      aria-pressed={active || undefined}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}
