import { withBrowser } from './harness.mjs'

export const name = 'text selection'

const SELECT_FIRST_PARAGRAPH = `
  (() => {
    const range = document.createRange()
    range.selectNodeContents(document.querySelector('p'))
    const chosen = window.getSelection()
    chosen.removeAllRanges()
    chosen.addRange(range)
  })()
`

export default async function selection({ ok }) {
  await withBrowser(async (browser) => {
    const { provider } = browser
    provider.setReply('SELECTION_ANSWER')

    const page = await browser.goto('article.html')
    await page.evaluate(SELECT_FIRST_PARAGRAPH)

    const overlay = await browser.overlay()
    await overlay.until(`[...document.querySelectorAll('button')].some((b) => b.textContent === 'Explain')`)
    ok('both floating buttons appear over the selection', await overlay.evaluate(`
      [...document.querySelectorAll('button')].map((b) => b.textContent).join(',') === 'Explain,Translate'
    `))

    await browser.click(overlay, 'Explain')

    const panel = browser.panel
    await panel.until(`document.body.innerText.includes('ARTICLE_MARKER')`)
    ok(
      'the question quotes the selection',
      await panel.evaluate(`document.body.innerText.includes('Explain this')`)
    )
    ok(
      'nothing else from the page rode along',
      !(await panel.evaluate(`document.body.innerText.includes('NAV_NOISE')`))
    )

    await panel.until(`document.body.innerText.includes('SELECTION_ANSWER')`)
    ok('an answer comes back', true)

    // A fresh selection, since the one just acted on will not bring the buttons back.
    provider.setReply('TRANSLATE_ANSWER')
    await page.evaluate(`
      (() => {
        const range = document.createRange()
        range.selectNodeContents(document.querySelectorAll('p')[1])
        const chosen = window.getSelection()
        chosen.removeAllRanges()
        chosen.addRange(range)
      })()
    `)
    await overlay.until(`[...document.querySelectorAll('button')].some((b) => b.textContent === 'Translate')`)
    await browser.click(overlay, 'Translate')

    // A short list of languages follows, one of them marked as the machine's own.
    await overlay.until(`[...document.querySelectorAll('button')].length > 1`)
    ok(
      'the default language is called out as one',
      await overlay.evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('(default)'))`)
    )
    const picked = await overlay.evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')].find((b) => !b.textContent.includes('(default)'))
        button.click()
        return button.textContent
      })()
    `)

    await panel.until(`document.body.innerText.includes('Translate this into ${picked}')`)
    ok('translate asks for the language that was picked', true)
    await panel.until(`document.body.innerText.includes('TRANSLATE_ANSWER')`)
    ok('and gets its own answer', true)
  })
}
