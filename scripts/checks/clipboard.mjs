import { execFileSync } from 'node:child_process'
import { withBrowser } from './harness.mjs'

export const name = 'clipboard'

/*
 * Reading the clipboard back needs the platform's own tool, and only Windows is wired up
 * here. Whatever was on it is put back afterwards: a check should not cost someone what
 * they had copied.
 */
const powershell = (command) =>
  execFileSync('powershell', ['-NoProfile', '-Command', command]).toString()

/*
 * A single quoted PowerShell string is literal, with only the quote itself to escape.
 * JSON escaping looks close enough to work and is not: a quote or a backslash from it
 * closes the string early or survives onto the clipboard as a literal character.
 */
const literal = (text) => `'${text.replaceAll("'", "''")}'`

export default async function clipboard({ ok, note, skip }) {
  if (process.platform !== 'win32') {
    skip('only Windows can read the clipboard back here')
    return
  }

  let held = null
  try {
    held = powershell('Get-Clipboard -Raw')
  } catch {
    // Something not text was on it, and that is not ours to read or to give back.
  }

  try {
    await withBrowser(async (browser) => {
      await browser.goto('article.html')
      powershell(`Set-Clipboard -Value ${literal('CLIPBOARD_UNTOUCHED')}`)

      await browser.chrome.evaluate('window.nerine.panel.copyPage()')
      note('prompt', await browser.answerPrompt('Copy'))

      const copied = powershell('Get-Clipboard -Raw')
      ok('something was copied', copied !== 'CLIPBOARD_UNTOUCHED')
      ok('the block has the title', copied.includes('Page: An Article With Chrome Around It'))
      ok('the block has the address', copied.includes('URL: http://127.0.0.1'))
      ok('the block has the article', copied.includes('ARTICLE_MARKER'))
      ok('the clipboard block is cleaned up too', !copied.includes('NAV_NOISE'))
      ok('the block is delimited', copied.trimEnd().endsWith('[end of page]'))
    })
  } finally {
    // Back to what it held, blank included. What could not be read is cleared rather than
    // left holding a page nobody asked to copy.
    if (held) powershell(`Set-Clipboard -Value ${literal(held)}`)
    else powershell('$null | Set-Clipboard')
  }
}
