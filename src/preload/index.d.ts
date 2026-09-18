import type {
  AskAnswer as Replied,
  TokenUsage as Spend,
  UsageWindow as Period,
  AskRequest as Question,
  BrowserState,
  ChatModel as Listed,
  ChatTurn as Said,
  ModelList as Listing,
  DevToolsFrame as Frame,
  DevToolsSide as Side,
  KeyState as Secret,
  NerineApi,
  OverlayMenuEntry,
  OverlayMenuItem,
  OverlayMenuRequest,
  OverlayRequest as Request,
  PageContext as Attached,
  PageHandle as Facing,
  PanelFrame as Aside,
  PanelMode as Showing,
  ProviderId as Vendor,
  Rect as Rectangle,
  SaveResult as Stored,
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
    type PanelMode = Showing
    type Rect = Rectangle
    type Key = Secret
    type Saved = Stored
    type Model = Listed
    type Models = Listing
    type Turn = Said
    type Page = Attached
    type PageHandle = Facing
    type Ask = Question
    type Answer = Replied
    type Usage = Spend
    type Window = Period
    type Provider = Vendor
  }
}

export {}
