import type { JSX } from 'react'
import styles from '@renderer/App.module.css'

// Phase 1 puts this behind an address bar, Phase 6.4 makes it a setting.
const HOME_URL = 'https://google.com'

export default function App(): JSX.Element {
  return <webview className={styles.view} src={HOME_URL} />
}
