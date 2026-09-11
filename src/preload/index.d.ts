import type { BrowserState, NerineApi, OverlayRequest as Request, TabState } from './index'

declare global {
  interface Window {
    nerine: NerineApi
  }

  namespace Nerine {
    type Tab = TabState
    type State = BrowserState
    type OverlayRequest = Request
  }
}

export {}
