import type { JSX } from 'react'
import IconButton from '@renderer/components/IconButton'
import { CrossIcon } from '@renderer/components/Icons'
import Seam from '@renderer/components/Seam'
import styles from '@renderer/components/PanelBar.module.css'

interface Props {
  frame: Nerine.Panel
  onClose: () => void
}

/**
 * The AI card: a header the panel view cannot draw for itself, and the surface behind it.
 * The view is rounded to the same radius, so its cut corners land on this rather than on
 * the window.
 */
export default function PanelBar({ frame, onClose }: Props): JSX.Element {
  const { gutter, card, header } = frame

  return (
    <>
      <Seam rect={gutter} onResize={window.nerine.panel.resize} gutter />
      <div
        className={styles.card}
        style={{ left: card.x, top: card.y, width: card.width, height: card.height }}
      >
        <div className={styles.header} style={{ height: header }}>
          <span className={styles.title}>Ask AI</span>
          <IconButton label="Close the AI panel" size={22} holdFocus onClick={onClose}>
            <CrossIcon size={13} />
          </IconButton>
        </div>
      </div>
    </>
  )
}
