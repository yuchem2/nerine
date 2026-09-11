import type { JSX } from 'react'
import styles from '@renderer/components/TabBar.module.css'

interface TabBarProps {
  title: string
  faviconUrl: string | null
}

export default function TabBar({ title, faviconUrl }: TabBarProps): JSX.Element {
  return (
    <div className={styles.bar}>
      <div className={styles.tab}>
        {faviconUrl && <img className={styles.favicon} src={faviconUrl} alt="" />}
        <span className={styles.title}>{title || 'New tab'}</span>
      </div>
    </div>
  )
}
