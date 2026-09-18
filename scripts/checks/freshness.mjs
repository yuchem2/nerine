import { withBrowser } from './harness.mjs'

export const name = 'page freshness'

export default async function freshness({ ok, note }) {
  await withBrowser(async (browser) => {
    const { provider } = browser

    const spa = await browser.goto('spa.html', 'document.body.innerText.includes("LIST_MARKER")')
    await browser.ask('What is on this page?')
    await browser.answerPrompt('Send')
    ok('the list went out', provider.sent(0).includes('LIST_MARKER'))

    // Opening a message changes the address, the way a mail app does.
    await spa.evaluate(`location.hash = '#one'`)
    await spa.until('document.body.innerText.includes("ITEM_ONE_MARKER")')
    note('the chip now reads', await browser.chip())

    await browser.ask('Summarise the message I am looking at now.')
    ok('the opened message went with it', provider.sent(1).includes('ITEM_ONE_MARKER'))
    ok(
      'the prompt calls the newest page the current one',
      provider.instructions(1).includes('is what they are looking at now')
    )

    // Nothing navigates at all here: only what is on screen changes.
    const live = await browser.goto('live.html', 'document.body.innerText.includes("BEFORE_MARKER")')
    await browser.ask('And this one?')
    await live.evaluate('window.swap()')
    await live.until('document.body.innerText.includes("AFTER_MARKER")')
    await browser.ask('What does it say now?')
    ok('content that changed without the address went out', provider.sent(3).includes('AFTER_MARKER'))

    const sends = provider.seen.length
    await browser.ask('Anything else?')
    const carrying = provider.last().body.input.filter((turn) =>
      String(turn.content).includes('AFTER_MARKER')
    )
    ok('a question sent again', provider.seen.length === sends + 1)
    ok('an unchanged page is not resent', carrying.length === 1)
    ok(
      'and it is still called current',
      String(provider.last().body.instructions).includes('is what they are looking at now')
    )

    await browser.toggleChip()
    await browser.ask('And with the chip off?')
    ok(
      'with the chip off the prompt no longer calls it current',
      String(provider.last().body.instructions).includes('may be none of them')
    )
  })
}
