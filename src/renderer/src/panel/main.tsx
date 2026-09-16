import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Panel from '@renderer/panel/Panel'
import '@renderer/styles/tokens.css'
import '@renderer/panel/base.css'

const container = document.getElementById('root')
if (!container) throw new Error('Could not find the #root element')

createRoot(container).render(
  <StrictMode>
    <Panel />
  </StrictMode>
)
