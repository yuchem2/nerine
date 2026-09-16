import type { JSX, MouseEvent } from 'react'
import styles from '@renderer/components/DevToolsSeam.module.css'

interface Props {
  rect: Nerine.Rect
}

/**
 * The gap between the page and DevTools, and the only strip of chrome the views leave
 * uncovered. The window keeps delivering the drag here even once the pointer is over a
 * page, so the whole gesture is read in this process.
 */
export default function DevToolsSeam({ rect }: Props): JSX.Element {
  const horizontal = rect.width > rect.height

  const startDrag = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()

    const move = (moved: globalThis.MouseEvent): void => {
      window.nerine.devtools.resize({ x: moved.clientX, y: moved.clientY })
    }

    const stop = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
  }

  return (
    <div
      className={styles.seam}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        cursor: horizontal ? 'ns-resize' : 'ew-resize'
      }}
      title="Drag to resize"
      onMouseDown={startDrag}
    />
  )
}
