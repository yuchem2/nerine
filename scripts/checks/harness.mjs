import { createServer } from 'node:http'
import { readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as wait } from 'node:timers/promises'
import { launch } from './drive.mjs'
import { fakeProvider } from './provider.mjs'

const FIXTURES = join(import.meta.dirname, 'fixtures')

/** Serves the fixtures on a port the OS picks, so a busy machine cannot collide. */
async function serveFixtures() {
  const server = createServer((request, response) => {
    const name = request.url.split(/[?#]/)[0].replace(/^\//, '')
    try {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(readFileSync(join(FIXTURES, name), 'utf8'))
    } catch {
      response.writeHead(404)
      response.end('not found')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

/*
 * A browser to run a check against: its own profile in the temp directory so the real one
 * is never read or written, a fake key so the panel reaches the conversation, and handles
 * on the views a check has to drive.
 */
export async function withBrowser(run) {
  const profile = mkdtempSync(join(tmpdir(), 'nerine-check-'))
  const provider = fakeProvider()
  const fixtures = await serveFixtures()
  const app = await launch({ OPENAI_BASE_URL: await provider.listen() }, profile)
  const { find, attach, targets } = app

  const opened = []
  try {
    const chrome = await attach(await find((target) => target.url.endsWith('/index.html')))
    await chrome.until('typeof window.nerine === "object"')

    const panelView = async () => {
      const view = await attach(await find((target) => target.url.endsWith('/panel.html')))
      await view.until('typeof window.ai === "object"')
      return view
    }

    await chrome.evaluate('window.nerine.panel.toggle()')
    let panel = await panelView()
    // A key has to be on file before the panel draws a conversation rather than settings.
    await panel.evaluate(`window.ai.keys.save('openai', 'sk-fake-key-for-checks')`)
    // The panel reads its keys once, on mount, so it is closed and opened to see them.
    await chrome.evaluate('window.nerine.panel.toggle()')
    await wait(900)
    await chrome.evaluate('window.nerine.panel.toggle()')
    panel = await panelView()
    await panel.until('!!document.querySelector("textarea")')

    const browser = {
      chrome,
      panel,
      provider,
      origin: fixtures.origin,
      targets,

      /** Opens a fixture and waits for the page itself to say it is there. */
      goto: async (name, ready = '!!document.body') => {
        await chrome.evaluate(`window.nerine.page.navigate('${fixtures.origin}/${name}')`)
        const view = await attach(await find((target) => target.url.includes(name)))
        await view.until(ready)
        await wait(500)
        opened.push(view)
        return view
      },

      /** Types a question and sends it, the way a person does. */
      ask: async (question) => {
        await panel.evaluate(`
          (() => {
            const box = document.querySelector('textarea')
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
            setter.call(box, ${JSON.stringify(question)})
            box.dispatchEvent(new Event('input', { bubbles: true }))
          })()
        `)
        await click(panel, 'Send')
        // An answer now streams in over real time rather than landing in one piece.
        await wait(2200)
      },

      /** Answers the prompt that stands between a page and a provider, and says what it read. */
      answerPrompt: async (label) => {
        const overlay = await attach(await find((target) => target.url.endsWith('/overlay.html')))
        await overlay.until(buttonExists(label))
        // Read before the click: answering it takes the words off the screen.
        const said = await overlay.evaluate('document.body.innerText')
        await click(overlay, label)
        // Confirming is what starts the ask, so this is the wait that has to cover streaming.
        await wait(2200)
        opened.push(overlay)
        return said.split(String.fromCharCode(10)).filter(Boolean).join(' / ')
      },

      chip: () => panel.evaluate(`document.querySelector('[aria-pressed]')?.textContent ?? null`),
      chipOn: () =>
        panel.evaluate(`document.querySelector('[aria-pressed]')?.getAttribute('aria-pressed') === 'true'`),
      toggleChip: () => panel.evaluate(`document.querySelector('[aria-pressed]').click()`),
      click: (view, label) => click(view, label)
    }

    await run(browser)
  } finally {
    for (const view of [...opened]) view.close()
    await app.stop()
    fixtures.close()
    provider.close()
    // Windows lets go of the profile a moment after the process does, so this gives it
    // a few tries and then leaves it to the temp directory rather than failing a check.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await wait(400)
      try {
        rmSync(profile, { recursive: true, force: true })
        break
      } catch {
        // Still held.
      }
    }
  }
}

const buttonExists = (label) =>
  `[...document.querySelectorAll('button')].some((b) => b.textContent === ${JSON.stringify(label)})`

async function click(view, label) {
  const hit = await view.evaluate(`
    (() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent === ${JSON.stringify(label)})
      if (!button) return false
      button.click()
      return true
    })()
  `)
  if (!hit) throw new Error(`no button labelled ${label}`)
}
