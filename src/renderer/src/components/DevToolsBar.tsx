import type { JSX } from 'react'
import IconButton from '@renderer/components/IconButton'
import { CrossIcon, DockIcon } from '@renderer/components/Icons'
import styles from '@renderer/components/DevToolsBar.module.css'

interface Props {
  frame: Nerine.DevTools
}

const SIDES: { side: Nerine.DevToolsSide; label: string }[] = [
  { side: 'left', label: 'Dock to left' },
  { side: 'bottom', label: 'Dock to bottom' },
  { side: 'right', label: 'Dock to right' }
]

/**
 * The strip above DevTools. DevTools is a view of its own, so this is the only place the
 * browser can put controls for it. It carries no title: the panel below says what it is.
 */
export default function DevToolsBar({ frame }: Props): JSX.Element {
  const { bar } = frame

  return (
    <div
      className={styles.bar}
      style={{ left: bar.x, top: bar.y, width: bar.width, height: bar.height }}
    >
      {SIDES.map(({ side, label }) => (
        <IconButton
          key={side}
          label={label}
          size={20}
          active={side === frame.side}
          holdFocus
          onClick={() => window.nerine.devtools.dock(side)}
        >
          <DockIcon size={13} side={side} />
        </IconButton>
      ))}
      <IconButton
        label="Close DevTools"
        size={20}
        holdFocus
        onClick={() => window.nerine.devtools.toggle()}
      >
        <CrossIcon size={13} />
      </IconButton>
    </div>
  )
}
