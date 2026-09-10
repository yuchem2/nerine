import type { NerineApi } from './index'

declare global {
  interface Window {
    nerine: NerineApi
  }
}

export {}
