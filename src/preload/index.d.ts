import type { BrowserState, NerineApi, TabState } from './index'

declare global {
  interface Window {
    nerine: NerineApi
  }

  namespace Nerine {
    type Tab = TabState
    type State = BrowserState
  }
}

export {}
