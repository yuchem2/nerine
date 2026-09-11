import { spawn, execSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import electron from 'electron'

const RUNS = Number(process.env.PERF_RUNS ?? 3)
const TIMEOUT_MS = 120_000
const HISTORY = resolve('perf/history.jsonl')

const URLS = [
  pathToFileURL(resolve('perf/fixtures/local.html')).href,
  'https://example.com',
  'https://www.google.com'
]

const sequence = Array.from({ length: RUNS }, () => URLS).flat()

const child = spawn(electron, ['.'], {
  env: {
    ...process.env,
    NERINE_PERF: '1',
    NERINE_PERF_URLS: sequence.join(',')
  },
  stdio: ['ignore', 'pipe', 'inherit']
})

const timer = setTimeout(() => {
  console.error(`No result after ${TIMEOUT_MS / 1000}s, killing the run.`)
  child.kill()
}, TIMEOUT_MS)

const samples = []
let rest = ''

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  const lines = (rest + chunk).split('\n')
  rest = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.startsWith('[perf] ')) continue
    samples.push(JSON.parse(line.slice(7)))
  }
})

child.on('exit', () => {
  clearTimeout(timer)
  report()
})

function report() {
  const startup = samples.find((s) => s.metric === 'startup')
  const failed = samples.filter((s) => s.metric === 'failed')
  // The first load is the window's own home page, already reported as startup.
  const loads = samples.filter((s) => s.metric === 'load').slice(1)

  if (loads.length === 0) {
    console.error('No samples. Is the build current? Run npm run build first.')
    process.exitCode = 1
    return
  }

  const rows = []
  for (const url of URLS) {
    const hit = loads.filter((s) => sameTarget(s.url, url)).map((s) => s.ms)
    if (hit.length === 0) continue
    rows.push({
      url: short(url),
      n: hit.length,
      median: median(hit),
      min: Math.min(...hit),
      max: Math.max(...hit)
    })
  }

  const startupLine = startup ? `${startup.ms} ms` : 'not measured'
  console.log(`\nstartup  ${startupLine}   (process start to first painted page)`)
  console.table(rows)
  for (const f of failed) console.error(`failed: ${f.url}`)

  mkdirSync('perf', { recursive: true })
  appendFileSync(
    HISTORY,
    JSON.stringify({
      at: new Date().toISOString(),
      commit: gitSha(),
      runs: RUNS,
      startupMs: startup?.ms ?? null,
      loads: Object.fromEntries(rows.map((r) => [r.url, r.median]))
    }) + '\n'
  )
  console.log(`\nAppended to ${HISTORY}`)
}

// Sites redirect, so compare hosts rather than the full URL.
function sameTarget(actual, wanted) {
  try {
    const a = new URL(actual)
    const b = new URL(wanted)
    if (a.protocol === 'file:' || b.protocol === 'file:') return a.protocol === b.protocol
    return a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '')
  } catch {
    return false
  }
}

function short(url) {
  return url.startsWith('file:') ? 'file (local fixture)' : new URL(url).hostname
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}
