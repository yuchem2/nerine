import { useEffect, useState, type JSX } from 'react'
import Dialog from '@renderer/overlay/Dialog'
import Menu from '@renderer/overlay/Menu'
import SelectionButton from '@renderer/overlay/SelectionButton'
import ZoomPopup from '@renderer/overlay/ZoomPopup'

/** Routes whatever the main process asks for onto the layer above the pages. */
export default function Overlay(): JSX.Element | null {
  const [dialog, setDialog] = useState<Nerine.OverlayRequest | null>(null)
  const [menu, setMenu] = useState<Nerine.OverlayMenu | null>(null)
  const [zoom, setZoom] = useState<Nerine.ZoomState | null>(null)
  const [selecting, setSelecting] = useState(false)

  useEffect(() => window.nerine.overlay.onShow(setDialog), [])
  useEffect(() => window.nerine.overlay.onMenu(setMenu), [])
  useEffect(() => window.nerine.overlay.onZoom(setZoom), [])
  useEffect(() => window.nerine.overlay.onSelection((showing) => setSelecting(showing === true)), [])

  if (menu) {
    return (
      <Menu
        request={menu}
        onPick={(id) => {
          setMenu(null)
          window.nerine.overlay.pick(id)
        }}
      />
    )
  }

  if (dialog) {
    return (
      <Dialog
        request={dialog}
        onAnswer={(confirmed) => {
          setDialog(null)
          window.nerine.overlay.respond(confirmed)
        }}
      />
    )
  }

  if (zoom) return <ZoomPopup state={zoom} />
  if (selecting) return <SelectionButton />

  return null
}
