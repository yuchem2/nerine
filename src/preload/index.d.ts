import type { NerineApi, PageState } from './index'

declare global {
  interface Window {
    nerine: NerineApi
  }

  namespace Nerine {
    type State = PageState
  }
}

export {}
