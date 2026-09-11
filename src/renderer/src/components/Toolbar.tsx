import { useEffect, useRef, useState, type JSX, type MouseEvent, type SubmitEvent } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, ReloadIcon, StopIcon } from '@renderer/components/Icons'
import styles from '@renderer/components/Toolbar.module.css'

interface ToolbarProps {
  url: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onNavigate: (input: string) => void
}

export default function Toolbar({
  url,
  isLoading,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onStop,
  onNavigate
}: ToolbarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(url)
  const [isEditing, setIsEditing] = useState(false)

  // The bar reflects the page unless the user is typing in it.
  useEffect(() => {
    if (!isEditing) setDraft(url)
  }, [url, isEditing])

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onNavigate(draft)
    inputRef.current?.blur()
  }

  // Focusing selects everything, so keep the click from collapsing that to a caret.
  const handleMouseDown = (event: MouseEvent<HTMLInputElement>): void => {
    if (document.activeElement === event.currentTarget) return
    event.preventDefault()
    event.currentTarget.focus()
  }

  return (
    <div className={styles.toolbar}>
      <nav className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={onBack}
          disabled={!canGoBack}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={onForward}
          disabled={!canGoForward}
          title="Forward"
          aria-label="Forward"
        >
          <ArrowRightIcon />
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={isLoading ? onStop : onReload}
          title={isLoading ? 'Stop' : 'Reload'}
          aria-label={isLoading ? 'Stop' : 'Reload'}
        >
          {isLoading ? <StopIcon /> : <ReloadIcon />}
        </button>
      </nav>

      <form className={styles.addressForm} onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className={styles.address}
          value={draft}
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="Search or enter address"
          aria-label="Address"
          onChange={(event) => setDraft(event.target.value)}
          onMouseDown={handleMouseDown}
          onFocus={(event) => {
            setIsEditing(true)
            event.currentTarget.select()
          }}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            setDraft(url)
            event.currentTarget.blur()
          }}
        />
      </form>

      {isLoading && <div className={styles.progress} />}
    </div>
  )
}
