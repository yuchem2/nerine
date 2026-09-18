import { withBrowser } from './harness.mjs'

export const name = 'page context'

export default async function pageContext({ ok, note }) {
  await withBrowser(async (browser) => {
    const { provider, panel } = browser

    const page = await browser.goto('hostile.html', 'window.__readWatched !== undefined')
    ok(
      'the fixture really does poison a main world read',
      (await page.evaluate('document.body.innerText')) === 'POISONED_BY_PAGE'
    )
    ok('the chip names the page and starts attached', (await browser.chip()) === 'Hostile innerText')
    ok('the chip starts on', await browser.chipOn())

    // Nothing attached first, so the other half of the system prompt is exercised too.
    await browser.toggleChip()
    provider.setReply('BARE_ANSWER')
    await browser.ask('Nothing attached here.')

    ok('a question with nothing attached still goes', Boolean(provider.seen[0]))
    ok('nothing was attached to it', !provider.sent(0).includes('REAL_BODY_MARKER'))
    ok(
      'the system prompt says it cannot see a page',
      provider.instructions(0).includes('no page came with this question')
    )

    const before = await page.evaluate('window.__readWatched')
    provider.setReply('FAKE_ANSWER')
    await browser.toggleChip()
    await browser.ask('What does this page say?')

    const prompt = await browser.answerPrompt('Send')
    ok('the prompt names the provider before anything leaves', prompt.includes('Send this page to ChatGPT'))
    note('prompt', prompt)

    ok('the page is read without the page seeing it', (await page.evaluate('window.__readWatched')) === before)
    ok('the page text went with the question', provider.sent(1).includes('REAL_BODY_MARKER'))
    ok('what the page tried to substitute did not', !provider.sent(1).includes('POISONED_BY_PAGE'))
    ok('the block is delimited', provider.sent(1).includes('[end of page]'))
    ok('the address went too', provider.sent(1).includes('hostile.html'))
    ok('the question is still there', provider.sent(1).includes('What does this page say?'))
    ok('the system prompt is the one for a page', provider.instructions(1).includes('ending at [end of page]'))
    ok(
      'the answer is on screen',
      (await panel.evaluate('document.body.innerText')).includes('FAKE_ANSWER')
    )

    provider.setReply('SECOND_ANSWER')
    await browser.ask('And the second paragraph?')
    ok('the second question did not prompt again', provider.seen.length === 3)
    const carrying = provider.seen[2].body.input.filter((turn) =>
      String(turn.content).includes('REAL_BODY_MARKER')
    )
    ok('an unchanged page is carried once, not resent', carrying.length === 1)
    ok('the second question is there', provider.sent(2).includes('And the second paragraph?'))

    await browser.toggleChip()
    await browser.goto('article.html')
    await browser.ask('Third one.')
    ok('with the chip off nothing new is attached', !provider.sent(3).includes('ARTICLE_MARKER'))
    ok(
      'the prompt stops claiming the page is what they are looking at',
      provider.instructions(3).includes('may be none of them')
    )
  })
}
