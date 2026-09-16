import type { JSX, MouseEvent } from 'react'
import styles from '@renderer/components/Seam.module.css'

interface Props {
  rect: Nerine.Rect
  onResize: (point: { x: number; y: number }) => void
  /** A gutter separates two surfaces. A seam only splits one of them in two. */
  gutter?: boolean
}

/**
 * The strip a view leaves for the chrome, and the handle that resizes it. The window
 * keeps delivering the drag here even once the pointer is over a view, so the whole
 * gesture is read in this process.
 */
export default function Seam({ rect, onResize, gutter = false }: Props): JSX.Element {
  const startDrag = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()

    const move = (moved: globalThis.MouseEvent): void => {
      onResize({ x: moved.clientX, y: moved.clientY })
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
      className={`${styles.seam} ${gutter ? styles.gutter : ''}`}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        cursor: rect.width > rect.height ? 'ns-resize' : 'ew-resize'
      }}
      title="Drag to resize"
      onMouseDown={startDrag}
    />
  )
}
