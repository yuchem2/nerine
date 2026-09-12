import type { Input, WebContents } from 'electron'
import type { Command } from './commands'

const IS_MAC = process.platform === 'darwin'

interface Binding {
  code: string
  /** Cmd on macOS, Ctrl everywhere else. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  command: Command
  passThrough?: boolean
}

// Alt+Arrow is word movement in macOS text fields, so there it is the bracket pair.
const NAVIGATION: Binding[] = IS_MAC
  ? [
      { code: 'BracketLeft', mod: true, command: { name: 'page:back' } },
      { code: 'BracketRight', mod: true, command: { name: 'page:forward' } }
    ]
  : [
      { code: 'ArrowLeft', alt: true, command: { name: 'page:back' } },
      { code: 'ArrowRight', alt: true, command: { name: 'page:forward' } }
    ]

const TAB_SLOTS: Binding[] = Array.from({ length: 9 }, (_, slot) => ({
  code: `Digit${slot + 1}`,
  mod: true,
  // The ninth slot is the last tab, however many there are.
  command: { name: 'tab:select', index: slot === 8 ? -1 : slot }
}))

const BINDINGS: Binding[] = [
  { code: 'KeyT', mod: true, command: { name: 'tab:new' } },
  { code: 'KeyW', mod: true, command: { name: 'tab:close' } },
  { code: 'Tab', mod: true, command: { name: 'tab:next' } },
  { code: 'Tab', mod: true, shift: true, command: { name: 'tab:previous' } },
  ...TAB_SLOTS,
  { code: 'KeyL', mod: true, command: { name: 'address:focus' } },
  ...NAVIGATION,
  { code: 'KeyR', mod: true, command: { name: 'page:reload' } },
  { code: 'KeyR', mod: true, shift: true, command: { name: 'page:hard-reload' } },
  { code: 'F5', command: { name: 'page:reload' } },
  { code: 'F5', shift: true, command: { name: 'page:hard-reload' } },
  // The page sees this one too: web apps close their own dialogs with it.
  { code: 'Escape', command: { name: 'page:stop' }, passThrough: true },
  { code: 'Equal', mod: true, command: { name: 'zoom:in' } },
  { code: 'Equal', mod: true, shift: true, command: { name: 'zoom:in' } },
  { code: 'Minus', mod: true, command: { name: 'zoom:out' } },
  { code: 'Digit0', mod: true, command: { name: 'zoom:reset' } },
  { code: 'F12', command: { name: 'devtools:toggle' } },
  { code: 'KeyI', mod: true, shift: true, command: { name: 'devtools:toggle' } }
]

/**
 * Focus usually sits in a page view, so the chrome renderer never sees these keys.
 * The main process reads them instead, and a match does not reach the page.
 */
export function attachShortcuts(contents: WebContents, run: (command: Command) => void): void {
  contents.on('before-input-event', (event, input) => {
    // Holding a key down would open tabs by the dozen.
    if (input.type !== 'keyDown' || input.isAutoRepeat) return

    const binding = match(input)
    if (!binding) return

    run(binding.command)
    if (!binding.passThrough) event.preventDefault()
  })
}

function match(input: Input): Binding | null {
  // The modifier this platform does not use for shortcuts has to stay clear.
  if (IS_MAC ? input.control : input.meta) return null
  const mod = IS_MAC ? input.meta : input.control

  return (
    BINDINGS.find(
      (binding) =>
        binding.code === input.code &&
        mod === (binding.mod ?? false) &&
        input.shift === (binding.shift ?? false) &&
        input.alt === (binding.alt ?? false)
    ) ?? null
  )
}
