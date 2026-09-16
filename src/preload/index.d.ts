import type {
  BrowserState,
  DevToolsFrame as Frame,
  DevToolsSide as Side,
  KeyState as Secret,
  NerineApi,
  OverlayMenuEntry,
  OverlayMenuItem,
  OverlayMenuRequest,
  OverlayRequest as Request,
  PanelFrame as Aside,
  ProviderId as Vendor,
  Rect as Rectangle,
  TabState,
  ZoomState as Zoom
} from './index'
import type { NerineAiApi } from './panel'

declare global {
  interface Window {
    nerine: NerineApi
    /** The AI panel renderer only. The chrome does not get this one. */
    ai: NerineAiApi
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
    type Panel = Aside
    type Rect = Rectangle
    type Key = Secret
    type Provider = Vendor
  }
}

export {}
