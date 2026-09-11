import { useCallback, useEffect, useState } from 'react'
import { toNavigationUrl } from '@renderer/lib/url'

export interface PageNavigation extends Nerine.State {
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  navigate: (input: string) => void
}

const EMPTY: Nerine.State = {
  url: '',
  title: '',
  faviconUrl: null,
  isLoading: true,
  canGoBack: false,
  canGoForward: false
}

/** Mirrors the page the main process owns and drives it through the bridge. */
export function usePageNavigation(): PageNavigation {
  const [state, setState] = useState<Nerine.State>(EMPTY)

  useEffect(() => {
    // Pull once, since the page keeps loading while the chrome reloads in development.
    void window.nerine.page.read().then((current) => {
      if (current) setState(current)
    })
    return window.nerine.page.onState(setState)
  }, [])

  const navigate = useCallback((input: string) => {
    const target = toNavigationUrl(input)
    if (target) window.nerine.page.navigate(target)
  }, [])

  return {
    ...state,
    goBack: window.nerine.page.goBack,
    goForward: window.nerine.page.goForward,
    reload: window.nerine.page.reload,
    stop: window.nerine.page.stop,
    navigate
  }
}
