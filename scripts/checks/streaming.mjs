import { setTimeout as wait } from 'node:timers/promises'
import { withBrowser } from './harness.mjs'

export const name = 'streaming'

const MARKERS = ['ONE_MARKER', 'TWO_MARKER', 'THREE_MARKER', 'FOUR_MARKER', 'FIVE_MARKER', 'SIX_MARKER']
const REPLY = MARKERS.join(' ')

async function type(panel, question) {
  await panel.evaluate(`
    (() => {
      const box = document.querySelector('textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(box, ${JSON.stringify(question)})
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)
}

/** Polls the panel's own text until a marker shows up or the wait runs out. */
async function waitForMarker(panel, marker, tries = 40) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await panel.evaluate(`document.body.innerText.includes(${JSON.stringify(marker)})`)) return true
    await wait(100)
  }
  return false
}

export default async function streaming({ ok }) {
  await withBrowser(async (browser) => {
    const { panel, provider } = browser
    provider.setReply(REPLY)

    // Off: this is about how an answer streams in, not about what goes out with a question.
    if (await browser.chipOn()) await browser.toggleChip()

    await type(panel, 'Say the markers.')
    await browser.click(panel, 'Send')

    let sawPartial = false
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const text = await panel.evaluate('document.body.innerText')
      if (text.includes(MARKERS[0]) && !text.includes(MARKERS[MARKERS.length - 1])) {
        sawPartial = true
        break
      }
      if (text.includes(MARKERS[MARKERS.length - 1])) break
      await wait(100)
    }
    ok('the answer is shown before it is complete', sawPartial)
    ok('the full answer follows', await waitForMarker(panel, MARKERS[MARKERS.length - 1]))
    ok(
      'the streamed pieces settle into one answer',
      await panel.evaluate(`document.body.innerText.includes(${JSON.stringify(REPLY)})`)
    )

    // Its own markers, since the first answer is still on screen and would otherwise pass for a second.
    const AGAIN = MARKERS.map((marker) => `AGAIN_${marker}`)
    provider.setReply(AGAIN.join(' '))
    await type(panel, 'Say them again.')
    await browser.click(panel, 'Send')
    ok('the second question starts streaming', await waitForMarker(panel, AGAIN[0]))
    await browser.click(panel, 'Stop')

    await wait(400)
    ok(
      'what streamed in before the stop is kept',
      await panel.evaluate(`document.body.innerText.includes(${JSON.stringify(AGAIN[0])})`)
    )
    ok(
      'the rest of the answer never arrives',
      !(await panel.evaluate(`document.body.innerText.includes(${JSON.stringify(AGAIN[AGAIN.length - 1])})`))
    )
  })
}
