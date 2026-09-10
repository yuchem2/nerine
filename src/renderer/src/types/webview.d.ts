import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// Electron's <webview> is not in the DOM typings.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
      }
    }
  }
}
