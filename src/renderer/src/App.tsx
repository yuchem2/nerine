import type { JSX } from 'react'
import styles from '@renderer/App.module.css'

export default function App(): JSX.Element {
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>Nerine</h1>
      <p className={styles.subtitle}>Phase 0.1. An empty window, and nothing else.</p>
    </main>
  )
}
