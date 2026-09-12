import { useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import styles from '@renderer/overlay/Menu.module.css'

interface MenuProps {
  request: Nerine.OverlayMenu
  onPick: (id: string | null) => void
}

// Keeps the menu off the very edge of the window.
const EDGE = 4

export default function Menu({ request, onPick }: MenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState({ left: request.x, top: request.y })
  const [cursor, setCursor] = useState(-1)

  const targets = request.entries.filter(isItem).filter((item) => item.enabled)

  // Flip instead of overflowing when the click landed near an edge.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const { width, height } = menu.getBoundingClientRect()
    const view = request.viewport
    setSpot({
      left: place(request.x, width, view.width),
      top: place(request.y, height, view.height)
    })
    setCursor(-1)
    menu.focus({ preventScroll: true })
  }, [request])

  const move = (delta: number): void => {
    if (targets.length === 0) return
    setCursor((current) => {
      const next = current + delta
      return next < 0 ? targets.length - 1 : next % targets.length
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      onPick(null)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' && targets[cursor]) onPick(targets[cursor].id)
  }

  const highlighted = targets[cursor]?.id

  return (
    <div
      className={styles.layer}
      onMouseDown={() => onPick(null)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: spot.left, top: spot.top }}
        role="menu"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {request.entries.map((entry, index) =>
          entry === 'separator' ? (
            <div key={`separator-${index}`} className={styles.separator} />
          ) : (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className={`${styles.item} ${entry.id === highlighted ? styles.highlighted : ''}`}
              disabled={!entry.enabled}
              onClick={() => onPick(entry.id)}
              onMouseEnter={() => setCursor(targets.findIndex((item) => item.id === entry.id))}
            >
              {entry.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}

/** Flips the menu when it would run past the edge, and never lets it leave the window. */
function place(at: number, size: number, limit: number): number {
  const flipped = at + size > limit ? at - size : at
  return Math.max(Math.min(flipped, limit - size - EDGE), EDGE)
}

function isItem(entry: Nerine.MenuEntry): entry is Nerine.MenuItem {
  return entry !== 'separator'
}
