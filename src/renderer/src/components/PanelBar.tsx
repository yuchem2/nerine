import { useRef, type JSX } from 'react'
import IconButton from '@renderer/components/IconButton'
import { CrossIcon, MinusIcon, PlusIcon } from '@renderer/components/Icons'
import Seam from '@renderer/components/Seam'
import styles from '@renderer/components/PanelBar.module.css'

interface Props {
  frame: Nerine.Panel
  onClose: () => void
}

const SITE_NAMES: Record<Nerine.Provider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  gemini: 'Gemini'
}

/**
 * The AI card: the header the panel view cannot draw for itself, and the surface behind
 * it. The view is rounded to the same radius, so its cut corners land on this rather than
 * on the window.
 */
export default function PanelBar({ frame, onClose }: Props): JSX.Element {
  const { gutter, card, header, body, mode, site } = frame
  const siteButton = useRef<HTMLButtonElement>(null)

  const openSiteList = (): void => {
    const box = siteButton.current?.getBoundingClientRect()
    if (box) window.nerine.panel.siteMenu({ x: Math.round(box.left), y: Math.round(box.bottom) })
  }

  return (
    <>
      <Seam rect={gutter} onResize={window.nerine.panel.resize} gutter />
      <div
        className={styles.card}
        style={{ left: card.x, top: card.y, width: card.width, height: card.height }}
      >
        <div className={styles.header} style={{ height: header }}>
          <div className={styles.modes} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'chat'}
              className={`${styles.mode} ${mode === 'chat' ? styles.on : ''}`}
              onClick={() => window.nerine.panel.setMode('chat', null)}
            >
              Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'site'}
              className={`${styles.mode} ${mode === 'site' ? styles.on : ''}`}
              onClick={() => window.nerine.panel.setMode('site', null)}
            >
              Site
            </button>
          </div>

          {mode === 'site' && (
            <>
              <button
                ref={siteButton}
                type="button"
                className={styles.site}
                title="Choose whose site to show"
                onClick={openSiteList}
              >
                {SITE_NAMES[site.provider]}
                <span className={`${styles.chevron} ${site.loading ? styles.turning : ''}`} />
              </button>
              <IconButton
                label={`Zoom out (${site.zoom}%)`}
                size={20}
                holdFocus
                onClick={() => window.nerine.panel.zoomSite(-1)}
              >
                <MinusIcon size={12} />
              </IconButton>
              <IconButton
                label={`Zoom in (${site.zoom}%)`}
                size={20}
                holdFocus
                onClick={() => window.nerine.panel.zoomSite(1)}
              >
                <PlusIcon size={12} />
              </IconButton>
            </>
          )}

          <span className={styles.divider} aria-hidden="true" />
          <IconButton label="Close the AI panel" size={22} holdFocus onClick={onClose}>
            <CrossIcon size={13} />
          </IconButton>
        </div>
      </div>
      {mode === 'site' && site.waiting && (
        <div
          className={styles.waitingBody}
          style={{ left: body.x, top: body.y, width: body.width, height: body.height }}
        >
          <span className={styles.spinner} />
          <span className={styles.waitingText}>Opening {SITE_NAMES[site.provider]}</span>
        </div>
      )}
    </>
  )
}
