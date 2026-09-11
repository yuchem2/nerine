import { useEffect, useRef, useState, type JSX } from 'react'
import styles from '@renderer/overlay/Overlay.module.css'

export default function Overlay(): JSX.Element | null {
  const [request, setRequest] = useState<Nerine.OverlayRequest | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => window.nerine.overlay.onShow(setRequest), [])

  // Cancel holds focus: the page chose this action, not the person answering for it.
  useEffect(() => {
    if (request) cancelRef.current?.focus()
  }, [request])

  if (!request) return null

  const answer = (confirmed: boolean): void => {
    setRequest(null)
    window.nerine.overlay.respond(confirmed)
  }

  return (
    <div
      className={styles.backdrop}
      onKeyDown={(event) => {
        if (event.key === 'Escape') answer(false)
      }}
    >
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={request.title}>
        <h1 className={styles.title}>{request.title}</h1>
        <p className={styles.message}>{request.message}</p>
        {request.detail && <p className={styles.detail}>{request.detail}</p>}

        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.button} onClick={() => answer(false)}>
            {request.cancelLabel}
          </button>
          <button type="button" className={styles.button} onClick={() => answer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
