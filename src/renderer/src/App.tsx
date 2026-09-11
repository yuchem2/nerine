import { useEffect, useRef, type JSX } from 'react'
import TabBar from '@renderer/components/TabBar'
import Toolbar from '@renderer/components/Toolbar'
import { usePageNavigation } from '@renderer/hooks/usePageNavigation'
import styles from '@renderer/App.module.css'

export default function App(): JSX.Element {
  const chromeRef = useRef<HTMLDivElement>(null)
  const { url, title, faviconUrl, isLoading, canGoBack, canGoForward, ...actions } =
    usePageNavigation()

  // The tab strip carries the page title, so this only feeds the taskbar and alt-tab.
  useEffect(() => {
    document.title = title ? `${title} - Nerine` : 'Nerine'
  }, [title])

  // The page is a native view, so the main process needs to know how tall the chrome is.
  useEffect(() => {
    const chrome = chromeRef.current
    if (!chrome) return

    const report = (): void => window.nerine.chrome.reportHeight(chrome.getBoundingClientRect().height)
    const observer = new ResizeObserver(report)
    observer.observe(chrome)
    report()

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={chromeRef} className={styles.chrome}>
      <TabBar title={title} faviconUrl={faviconUrl} />
      <Toolbar
        url={url}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={actions.goBack}
        onForward={actions.goForward}
        onReload={actions.reload}
        onStop={actions.stop}
        onNavigate={actions.navigate}
      />
    </div>
  )
}
