import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { WebviewTag } from 'electron'

// Electron's <webview> is not in the DOM typings.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<WebviewTag>, WebviewTag> & {
        src?: string
        partition?: string
      }
    }
  }
}
