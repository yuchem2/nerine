import pageContext from './page-context.mjs'
import readability from './readability.mjs'
import freshness from './freshness.mjs'
import markdown from './markdown.mjs'
import clipboard from './clipboard.mjs'
import streaming from './streaming.mjs'

/*
 * Drives the built app and asks it what it did. Nothing here needs a key or reaches a
 * provider: a fake one stands in, on its own profile in the temp directory, so a run
 * never reads or writes the keys and settings of the browser in daily use.
 */

const SUITES = [pageContext, readability, freshness, markdown, clipboard, streaming]

const only = process.argv[2]
let failed = 0

for (const suite of SUITES) {
  const title = suite.name.replace(/([A-Z])/g, ' $1').toLowerCase()
  if (only && !title.includes(only)) continue

  console.log(`\n${title}`)
  const report = {
    ok: (label, passed, detail = '') => {
      if (!passed) failed += 1
      console.log(`  ${passed ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
    },
    note: (label, value) => console.log(`        ${label}: ${value}`),
    skip: (why) => console.log(`  skip  ${why}`)
  }

  try {
    await suite(report)
  } catch (failure) {
    failed += 1
    console.log(`  FAIL  the suite threw: ${failure.message}`)
  }
}

console.log(failed === 0 ? '\nall checks passed' : `\n${failed} check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
