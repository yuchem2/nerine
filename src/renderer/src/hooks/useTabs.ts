import { useCallback, useEffect, useState } from 'react'
import { toNavigationUrl } from '@renderer/lib/url'

export interface Browser {
  tabs: Nerine.Tab[]
  active: Nerine.Tab | null
  activeId: number
  createTab: () => void
  closeTab: (id: number) => void
  selectTab: (id: number) => void
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  focusPage: () => void
  navigate: (input: string) => void
}

const EMPTY: Nerine.State = { tabs: [], activeId: -1 }

/** Mirrors the tabs the main process owns and drives the active one. */
export function useTabs(): Browser {
  const [state, setState] = useState<Nerine.State>(EMPTY)

  useEffect(() => {
    // Pull once, since the pages keep running while the chrome reloads in development.
    void window.nerine.tabs.read().then((current) => {
      if (current) setState(current)
    })
    return window.nerine.tabs.onState(setState)
  }, [])

  const navigate = useCallback((input: string) => {
    const target = toNavigationUrl(input)
    if (target) window.nerine.page.navigate(target)
  }, [])

  return {
    tabs: state.tabs,
    active: state.tabs.find((tab) => tab.id === state.activeId) ?? null,
    activeId: state.activeId,
    createTab: window.nerine.tabs.create,
    closeTab: window.nerine.tabs.close,
    selectTab: window.nerine.tabs.activate,
    goBack: window.nerine.page.goBack,
    goForward: window.nerine.page.goForward,
    reload: window.nerine.page.reload,
    stop: window.nerine.page.stop,
    focusPage: window.nerine.page.focus,
    navigate
  }
}
