import type {
  BrowserState,
  DevToolsFrame as Frame,
  DevToolsSide as Side,
  Rect as Rectangle,
  NerineApi,
  OverlayMenuEntry,
  OverlayMenuItem,
  OverlayMenuRequest,
  OverlayRequest as Request,
  TabState,
  ZoomState as Zoom
} from './index'

declare global {
  interface Window {
    nerine: NerineApi
  }

  namespace Nerine {
    type Tab = TabState
    type State = BrowserState
    type OverlayRequest = Request
    type OverlayMenu = OverlayMenuRequest
    type MenuEntry = OverlayMenuEntry
    type MenuItem = OverlayMenuItem
    type ZoomState = Zoom
    type DevTools = Frame
    type DevToolsSide = Side
    type Rect = Rectangle
  }
}

export {}
