import { withBrowser } from './harness.mjs'

export const name = 'markdown'

const ANSWER = [
  '## Heading two',
  '',
  'A paragraph with **bold**, *italic*, `inline code` and a [link](LINK).',
  '',
  '- first bullet',
  '- second bullet',
  '',
  '1. first number',
  '2. second number',
  '',
  '| Column | Other |',
  '| --- | --- |',
  '| a | b |',
  '',
  '> a quotation',
  '',
  '---',
  '',
  '```js',
  'const answer = 1',
  '```',
  '',
  '<script>window.INJECTED = true</script>',
  '<img src="x" onerror="window.INJECTED = true">',
  ''
].join('\n')

export default async function markdown({ ok }) {
  await withBrowser(async (browser) => {
    const { panel, provider } = browser
    provider.setReply(ANSWER.replace('LINK', `${browser.origin}/article.html`))

    // Off: this is about how an answer is drawn, not about what goes out with a question.
    await browser.goto('article.html')
    if (await browser.chipOn()) await browser.toggleChip()
    await browser.ask('Show me **every** kind of markup.')

    // Scoped to the answer: the page has script tags of its own and they are not it.
    const inAnswer = "document.querySelector('h2').parentElement"
    const has = (selector) => panel.evaluate(`!!${inAnswer}.querySelector(${JSON.stringify(selector)})`)
    const count = (selector) =>
      panel.evaluate(`${inAnswer}.querySelectorAll(${JSON.stringify(selector)}).length`)

    ok('a heading is a heading', await has('h2'))
    ok('bold is bold', await has('strong'))
    ok('italic is italic', await has('em'))
    ok('inline code is code', await has('code'))
    ok('a fenced block is a block', await has('pre code'))
    ok('a bullet list has its items', (await count('ul li')) === 2)
    ok('a numbered list has its items', (await count('ol li')) === 2)
    ok('a table is a table', await has('table th'))
    ok('a quotation is quoted', await has('blockquote'))
    ok('a rule is a rule', await has('hr'))
    ok('a link is a link', await has('a[href]'))
    ok(
      'the table scrolls on its own',
      await panel.evaluate(
        `getComputedStyle(document.querySelector('table').parentElement).overflowX === 'auto'`
      )
    )

    ok('raw script in an answer is not an element', !(await has('script')))
    ok('raw img in an answer is not an element', !(await has('img')))
    ok('nothing in the answer ran', (await panel.evaluate('window.INJECTED === undefined')) === true)
    ok(
      'the question stays literal',
      await panel.evaluate(`document.body.innerText.includes('Show me **every** kind of markup.')`)
    )

    // A link has to take the browser, never the panel.
    await panel.evaluate(`document.querySelector('a[href]').click()`)
    const open = await browser.targets()
    ok('the panel did not follow the link', open.some((target) => target.url.endsWith('/panel.html')))
    ok('the link opened as a tab', open.some((target) => target.url.includes('article.html')))
    ok('the conversation is still there', await has('table'))
  })
}
