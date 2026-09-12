import { useEffect, useRef, type JSX } from 'react'
import styles from '@renderer/overlay/Dialog.module.css'

interface DialogProps {
  request: Nerine.OverlayRequest
  onAnswer: (confirmed: boolean) => void
}

export default function Dialog({ request, onAnswer }: DialogProps): JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Cancel holds focus: the page chose this action, not the person answering for it.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div
      className={styles.backdrop}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onAnswer(false)
      }}
    >
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={request.title}>
        <h1 className={styles.title}>{request.title}</h1>
        <p className={styles.message}>{request.message}</p>
        {request.detail && <p className={styles.detail}>{request.detail}</p>}

        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.button}
            onClick={() => onAnswer(false)}
          >
            {request.cancelLabel}
          </button>
          <button type="button" className={styles.button} onClick={() => onAnswer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
