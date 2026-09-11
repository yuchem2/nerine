import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Overlay from '@renderer/overlay/Overlay'
import '@renderer/styles/tokens.css'
import '@renderer/overlay/base.css'

const container = document.getElementById('root')
if (!container) throw new Error('Could not find the #root element')

createRoot(container).render(
  <StrictMode>
    <Overlay />
  </StrictMode>
)
