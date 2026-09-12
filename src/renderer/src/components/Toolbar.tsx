import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type MouseEvent,
  type RefObject,
  type SubmitEvent
} from 'react'
import IconButton from '@renderer/components/IconButton'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CrossIcon,
  ReloadIcon,
  ZoomIcon
} from '@renderer/components/Icons'
import { toDisplayUrl } from '@renderer/lib/url'
import styles from '@renderer/components/Toolbar.module.css'

interface ToolbarProps {
  url: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomFactor: number
  // Held by the chrome, which focuses the address bar when the main process asks.
  inputRef: RefObject<HTMLInputElement | null>
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onNavigate: (input: string) => void
  onFocusPage: () => void
  onToggleZoom: () => void
}

export default function Toolbar({
  url,
  isLoading,
  canGoBack,
  canGoForward,
  zoomFactor,
  inputRef,
  onBack,
  onForward,
  onReload,
  onStop,
  onNavigate,
  onFocusPage,
  onToggleZoom
}: ToolbarProps): JSX.Element {
  const fieldRef = useRef<HTMLDivElement>(null)
  const display = toDisplayUrl(url)
  const [draft, setDraft] = useState(display)
  const [isEditing, setIsEditing] = useState(false)
  const percent = Math.round(zoomFactor * 100)

  // The bar reflects the page unless the user is typing in it.
  useEffect(() => {
    if (!isEditing) setDraft(display)
  }, [display, isEditing])

  // Selecting has to wait for the raw URL to reach the DOM.
  useEffect(() => {
    if (isEditing) inputRef.current?.select()
  }, [isEditing, inputRef])

  // The zoom popup hangs below the field, which only the main process can draw over a page.
  useEffect(() => {
    const field = fieldRef.current
    if (!field) return

    const report = (): void => {
      const { right, bottom } = field.getBoundingClientRect()
      window.nerine.chrome.reportZoomAnchor({ x: Math.round(right), y: Math.round(bottom) })
    }
    const observer = new ResizeObserver(report)
    observer.observe(field)
    report()

    return () => observer.disconnect()
  }, [])

  // Leaving the bar hands the keyboard back to the page.
  const leave = (): void => {
    inputRef.current?.blur()
    onFocusPage()
  }

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onNavigate(draft)
    leave()
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
        <IconButton label="Back" onClick={onBack} disabled={!canGoBack}>
          <ArrowLeftIcon />
        </IconButton>
        <IconButton label="Forward" onClick={onForward} disabled={!canGoForward}>
          <ArrowRightIcon />
        </IconButton>
        <IconButton label={isLoading ? 'Stop' : 'Reload'} onClick={isLoading ? onStop : onReload}>
          {isLoading ? <CrossIcon /> : <ReloadIcon />}
        </IconButton>
      </nav>

      <form className={styles.addressForm} onSubmit={handleSubmit}>
        <div ref={fieldRef} className={styles.field}>
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
            onFocus={() => {
              setIsEditing(true)
              setDraft(url)
            }}
            onBlur={() => setIsEditing(false)}
            onKeyDown={(event) => {
              // Blur puts the page URL back, so Escape only has to leave the field.
              if (event.key === 'Escape') leave()
            }}
          />
          {percent !== 100 && (
            <IconButton size={22} label={`Zoom ${percent}%`} onClick={onToggleZoom}>
              <ZoomIcon size={14} direction={percent > 100 ? 'in' : 'out'} />
            </IconButton>
          )}
        </div>
      </form>

      {isLoading && <div className={styles.progress} />}
    </div>
  )
}
