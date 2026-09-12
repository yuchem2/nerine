import type { JSX } from 'react'
import IconButton from '@renderer/components/IconButton'
import { MinusIcon, PlusIcon } from '@renderer/components/Icons'
import styles from '@renderer/overlay/ZoomPopup.module.css'

interface ZoomPopupProps {
  state: Nerine.ZoomState
}

export default function ZoomPopup({ state }: ZoomPopupProps): JSX.Element {
  const { zoomAction } = window.nerine.overlay

  return (
    <div
      className={styles.popup}
      onMouseEnter={() => zoomAction('hold')}
      onMouseLeave={() => zoomAction('release')}
    >
      <IconButton
        size={22}
        label="Zoom out"
        holdFocus
        disabled={!state.canZoomOut}
        onClick={() => zoomAction('out')}
      >
        <MinusIcon size={14} />
      </IconButton>

      <span className={styles.percent}>{state.percent}%</span>

      <IconButton
        size={22}
        label="Zoom in"
        holdFocus
        disabled={!state.canZoomIn}
        onClick={() => zoomAction('in')}
      >
        <PlusIcon size={14} />
      </IconButton>

      <button
        type="button"
        className={styles.reset}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => zoomAction('reset')}
      >
        Reset
      </button>
    </div>
  )
}
