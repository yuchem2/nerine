import { useEffect, useRef, type JSX } from 'react'
import DevToolsBar from '@renderer/components/DevToolsBar'
import DevToolsSeam from '@renderer/components/DevToolsSeam'
import TabBar from '@renderer/components/TabBar'
import Toolbar from '@renderer/components/Toolbar'
import { useTabs } from '@renderer/hooks/useTabs'
import styles from '@renderer/App.module.css'

export default function App(): JSX.Element {
  const chromeRef = useRef<HTMLDivElement>(null)
  const addressRef = useRef<HTMLInputElement>(null)
  const browser = useTabs()
  const { active } = browser

  // The tab strip carries the page title, so this only feeds the taskbar and alt-tab.
  useEffect(() => {
    const title = active?.title
    document.title = title ? `${title} - Nerine` : 'Nerine'
  }, [active?.title])

  // The pages are native views, so the main process needs to know how tall the chrome is.
  useEffect(() => {
    const chrome = chromeRef.current
    if (!chrome) return

    const report = (): void =>
      window.nerine.chrome.reportHeight(chrome.getBoundingClientRect().height)
    const observer = new ResizeObserver(report)
    observer.observe(chrome)
    report()

    return () => observer.disconnect()
  }, [])

  // Keyboard shortcuts are read in the main process, wherever the focus happens to be.
  useEffect(
    () =>
      window.nerine.chrome.onFocusAddress(() => {
        addressRef.current?.focus()
      }),
    []
  )

  return (
    <>
      <div ref={chromeRef} className={styles.chrome}>
        <TabBar
          tabs={browser.tabs}
          activeId={browser.activeId}
          onSelect={browser.selectTab}
          onClose={browser.closeTab}
          onCreate={browser.createTab}
        />
        <Toolbar
          url={active?.url ?? ''}
          isLoading={active?.isLoading ?? false}
          canGoBack={active?.canGoBack ?? false}
          canGoForward={active?.canGoForward ?? false}
          zoomFactor={active?.zoomFactor ?? 1}
          inputRef={addressRef}
          onBack={browser.goBack}
          onForward={browser.goForward}
          onReload={browser.reload}
          onStop={browser.stop}
          onNavigate={browser.navigate}
          onFocusPage={browser.focusPage}
          onToggleZoom={browser.toggleZoomPopup}
        />
      </div>
      {browser.devTools && (
        <>
          <DevToolsSeam rect={browser.devTools.seam} />
          <DevToolsBar frame={browser.devTools} />
        </>
      )}
    </>
  )
}
