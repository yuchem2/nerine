import { useState, type JSX, type MouseEvent } from 'react'
import { CrossIcon, PageIcon, PlusIcon, SparkIcon } from '@renderer/components/Icons'
import styles from '@renderer/components/TabBar.module.css'

interface TabBarProps {
  tabs: Nerine.Tab[]
  activeId: number
  onSelect: (id: number) => void
  onClose: (id: number) => void
  onCreate: () => void
  onAskAi: () => void
  isPanelOpen: boolean
}

export default function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCreate,
  onAskAi,
  isPanelOpen
}: TabBarProps): JSX.Element {
  // Chromium reports /favicon.ico even where there is none, so track what failed to load.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())

  const closeTab = (event: MouseEvent, id: number): void => {
    event.stopPropagation()
    onClose(id)
  }

  return (
    <div className={styles.bar}>
      {tabs.map((tab) => {
        const favicon = tab.faviconUrl && !broken.has(tab.faviconUrl) ? tab.faviconUrl : null

        return (
          <div
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeId ? styles.active : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className={styles.icon}>
              {favicon ? (
                <img
                  className={styles.favicon}
                  src={favicon}
                  alt=""
                  onError={() => setBroken((failed) => new Set(failed).add(favicon))}
                />
              ) : (
                <PageIcon size={13} />
              )}
            </span>
            <span className={styles.title}>{tab.title || 'New tab'}</span>
            <button
              type="button"
              className={styles.close}
              onClick={(event) => closeTab(event, tab.id)}
              title="Close tab"
              aria-label="Close tab"
            >
              <CrossIcon size={12} />
            </button>
          </div>
        )
      })}

      <button
        type="button"
        className={styles.newTab}
        onClick={onCreate}
        title="New tab"
        aria-label="New tab"
      >
        <PlusIcon size={14} />
      </button>

      {/* The strip already ends where the window controls begin, so these land beside them. */}
      <button
        type="button"
        className={`${styles.askAi} ${isPanelOpen ? styles.askAiOpen : ''}`}
        onClick={onAskAi}
        title="Ask AI"
        aria-label="Ask AI"
      >
        <SparkIcon size={14} />
        <span>Ask AI</span>
      </button>
      <span className={styles.divider} aria-hidden="true" />
    </div>
  )
}
