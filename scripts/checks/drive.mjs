import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { setTimeout as wait } from 'node:timers/promises'
import electron from 'electron'

/*
 * Drives the built app over the remote debugging port. The chrome, the panel, the overlay
 * and every page are separate WebContents, so a check reaches each one as its own target
 * and talks to it the way DevTools would.
 */

/** A port of its own per run: a previous app still letting go of one would be answered instead. */
async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

export async function launch(env, profile) {
  const port = await freePort()
  const child = spawn(
    electron,
    ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`],
    { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'ignore'] }
  )

  const targets = async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    return response.json()
  }

  /** A target exists from the moment its view is made, so this waits for one to appear. */
  const find = async (match, tries = 40) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const hit = (await targets()).find(match)
      if (hit) return hit
      await wait(500)
    }
    const saw = (await targets()).map((target) => `${target.type} ${target.url}`).join('\n')
    throw new Error(`no target matched. saw:\n${saw}`)
  }

  const stop = async () => {
    child.kill()
    // Waited for, so the next run is not talking to this one on its way out.
    await Promise.race([once(child, 'exit'), wait(5000)])
  }

  for (let tries = 0; tries < 60; tries += 1) {
    await wait(500)
    try {
      await targets()
      return { child, port, targets, find, attach, stop }
    } catch {
      // The port is not up yet, which is the usual answer for the first second.
    }
  }
  await stop()
  throw new Error(`no debugger on ${port} after 30s`)
}

/** One socket per target, with evaluate on top of it. */
export async function attach(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })

  let nextId = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    const slot = pending.get(message.id)
    if (!slot) return
    pending.delete(message.id)
    if (message.error) slot.reject(new Error(JSON.stringify(message.error)))
    else slot.resolve(message.result)
  }

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = (nextId += 1)
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'threw')
    }
    return result.result.value
  }

  /** A target answers before it has loaded, so waiting on the page itself is the only way. */
  const until = async (expression, tries = 40) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      try {
        if (await evaluate(expression)) return
      } catch {
        // A page mid load has no document to ask, which is not an answer of no.
      }
      await wait(250)
    }
    throw new Error(`never true: ${expression}`)
  }

  return { evaluate, until, close: () => socket.close() }
}
