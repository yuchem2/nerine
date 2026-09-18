import { withBrowser } from './harness.mjs'

export const name = 'readability'

export default async function readability({ ok, note }) {
  await withBrowser(async (browser) => {
    const { panel } = browser

    // capture is the extractor entire, so it is called straight rather than through a question.
    const grab = async (fixture, ready) => {
      await browser.goto(fixture, ready)
      return panel.evaluate(`window.ai.page.capture('openai')`)
    }

    // The first capture asks where the text is going before it hands any over.
    await browser.goto('article.html')
    await panel.evaluate(`window.__first = window.ai.page.capture('openai'); 1`)
    await browser.answerPrompt('Send')
    const article = await panel.evaluate('window.__first')

    ok('the article body is taken', article.text.includes('ARTICLE_MARKER'))
    ok('the nav is left behind', !article.text.includes('NAV_NOISE'))
    ok('the aside is left behind', !article.text.includes('ASIDE_NOISE'))
    ok('the footer is left behind', !article.text.includes('FOOTER_NOISE'))
    note('article', `${article.text.length} chars`)

    const app = await grab('app.html')
    ok('an app with no article still hands over its text', app.text.includes('APP_MARKER'))
    ok('every row is there', (app.text.match(/APP_MARKER/g) ?? []).length === 3)
    note('app', JSON.stringify(app.text.replace(/\s+/g, ' ').slice(0, 80)))

    const hostile = await grab('hostile.html', 'window.__readWatched !== undefined')
    ok('the isolated world holds with the library injected', hostile.text.includes('REAL_BODY_MARKER'))
    ok('and the page still cannot substitute for it', !hostile.text.includes('POISONED_BY_PAGE'))
  })
}
