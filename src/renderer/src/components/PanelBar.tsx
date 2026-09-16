import { useRef, type JSX } from 'react'
import IconButton from '@renderer/components/IconButton'
import { CrossIcon, MinusIcon, PlusIcon } from '@renderer/components/Icons'
import Seam from '@renderer/components/Seam'
import styles from '@renderer/components/PanelBar.module.css'

interface Props {
  frame: Nerine.Panel
  /** The tab the copy would take, named so the button cannot mean the site instead. */
  pageTitle: string
  onClose: () => void
}

/** Characters run to the thousands, and the exact figure is not the point. */
function short(characters: number): string {
  return characters < 1000 ? String(characters) : `${Math.round(characters / 1000)}k`
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
export default function PanelBar({ frame, pageTitle, onClose }: Props): JSX.Element {
  const { gutter, card, header, body, footer, mode, site, copied } = frame
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
      {footer && (
        <div
          className={styles.footer}
          style={{ left: footer.x, top: footer.y, width: footer.width, height: footer.height }}
        >
          <button
            type="button"
            className={styles.copy}
            title={
              pageTitle
                ? `Copies the tab showing ${pageTitle}, for pasting into the site`
                : 'Copies the page in the tab, for pasting into the site'
            }
            onClick={() => window.nerine.panel.copyPage()}
          >
            {copied > 0 ? `Copied ${short(copied)} characters` : `Copy tab: ${pageTitle || 'this page'}`}
          </button>
        </div>
      )}
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
