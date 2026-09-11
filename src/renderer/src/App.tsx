import { useEffect, useRef, type JSX } from 'react'
import type { WebviewTag } from 'electron'
import TabBar from '@renderer/components/TabBar'
import Toolbar from '@renderer/components/Toolbar'
import { useWebviewNavigation } from '@renderer/hooks/useWebviewNavigation'
import { HOME_URL } from '@renderer/lib/url'
import styles from '@renderer/App.module.css'

export default function App(): JSX.Element {
  const webviewRef = useRef<WebviewTag>(null)
  const { url, title, faviconUrl, isLoading, canGoBack, canGoForward, ...actions } =
    useWebviewNavigation(webviewRef)

  // The tab strip carries the page title, so this only feeds the taskbar and alt-tab.
  useEffect(() => {
    document.title = title ? `${title} - Nerine` : 'Nerine'
  }, [title])

  return (
    <div className={styles.app}>
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
      {/* src stays fixed: navigation goes through loadURL so React never fights the guest. */}
      <webview ref={webviewRef} className={styles.view} src={HOME_URL} />
    </div>
  )
}
