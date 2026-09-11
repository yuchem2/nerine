import { useCallback, useEffect, useState, type RefObject } from 'react'
import type {
  DidNavigateEvent,
  DidNavigateInPageEvent,
  PageFaviconUpdatedEvent,
  PageTitleUpdatedEvent,
  WebviewTag
} from 'electron'
import { toNavigationUrl } from '@renderer/lib/url'

export interface WebviewNavigation {
  url: string
  title: string
  faviconUrl: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  navigate: (input: string) => void
}

/** Mirrors one web view's navigation state and drives it. */
export function useWebviewNavigation(ref: RefObject<WebviewTag | null>): WebviewNavigation {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  useEffect(() => {
    const view = ref.current
    if (!view) return

    // History is only readable once the guest page is attached, so never call this earlier.
    const syncHistory = (): void => {
      setCanGoBack(view.canGoBack())
      setCanGoForward(view.canGoForward())
    }

    const onDomReady = (): void => {
      setUrl(view.getURL())
      syncHistory()
    }
    const onStartLoading = (): void => setIsLoading(true)
    const onStopLoading = (): void => {
      setIsLoading(false)
      syncHistory()
    }
    const onNavigate = (event: DidNavigateEvent): void => {
      setUrl(event.url)
      setFaviconUrl(null)
      syncHistory()
    }
    const onNavigateInPage = (event: DidNavigateInPageEvent): void => {
      if (!event.isMainFrame) return
      setUrl(event.url)
      syncHistory()
    }
    const onTitleUpdated = (event: PageTitleUpdatedEvent): void => setTitle(event.title)
    const onFaviconUpdated = (event: PageFaviconUpdatedEvent): void => {
      setFaviconUrl(event.favicons[0] ?? null)
    }

    view.addEventListener('dom-ready', onDomReady)
    view.addEventListener('did-start-loading', onStartLoading)
    view.addEventListener('did-stop-loading', onStopLoading)
    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate-in-page', onNavigateInPage)
    view.addEventListener('page-title-updated', onTitleUpdated)
    view.addEventListener('page-favicon-updated', onFaviconUpdated)

    return () => {
      view.removeEventListener('dom-ready', onDomReady)
      view.removeEventListener('did-start-loading', onStartLoading)
      view.removeEventListener('did-stop-loading', onStopLoading)
      view.removeEventListener('did-navigate', onNavigate)
      view.removeEventListener('did-navigate-in-page', onNavigateInPage)
      view.removeEventListener('page-title-updated', onTitleUpdated)
      view.removeEventListener('page-favicon-updated', onFaviconUpdated)
    }
  }, [ref])

  const goBack = useCallback(() => ref.current?.goBack(), [ref])
  const goForward = useCallback(() => ref.current?.goForward(), [ref])
  const reload = useCallback(() => ref.current?.reload(), [ref])
  const stop = useCallback(() => ref.current?.stop(), [ref])

  const navigate = useCallback(
    (input: string) => {
      const target = toNavigationUrl(input)
      if (target) void ref.current?.loadURL(target)
    },
    [ref]
  )

  return {
    url,
    title,
    faviconUrl,
    isLoading,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    reload,
    stop,
    navigate
  }
}
