import { createServer } from 'node:http'
import { setTimeout as wait } from 'node:timers/promises'

/*
 * Stands in for a provider, so a check never needs a real key and nothing it sends leaves
 * the machine. The adapter reaches it because the OpenAI SDK takes its base URL from the
 * environment, which means the adapter itself is exercised rather than mocked out.
 */
export function fakeProvider() {
  const seen = []
  let reply = 'FAKE_ANSWER'

  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      const json = (value) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify(value))
      }

      if (request.url.startsWith('/v1/models')) {
        json({ object: 'list', data: [{ id: 'gpt-5.1', object: 'model', created: 0, owned_by: 'fake' }] })
        return
      }

      if (request.url.startsWith('/v1/responses')) {
        seen.push({ auth: request.headers.authorization, body: JSON.parse(body || '{}') })
        void streamAnswer(response, reply)
        return
      }

      response.writeHead(404)
      response.end('{}')
    })
  })

  return {
    seen,
    /** Everything a question carried, as one string, for asking what went out. */
    sent: (index) => String(seen[index]?.body.input.map((turn) => turn.content).join('\n')),
    instructions: (index) => String(seen[index]?.body.instructions),
    last: () => seen[seen.length - 1],
    setReply: (text) => (reply = text),
    listen: async () => {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      return `http://127.0.0.1:${server.address().port}/v1`
    },
    close: () => server.close()
  }
}

// The SDK rebuilds the final response from the event run, so this has to be the real shape.
async function streamAnswer(response, text) {
  response.writeHead(200, { 'content-type': 'text/event-stream' })

  let sequence = 0
  const send = (event) =>
    response.write(`data: ${JSON.stringify({ ...event, sequence_number: (sequence += 1) })}\n\n`)

  const id = 'resp_fake'
  const itemId = 'msg_fake'
  send({ type: 'response.created', response: { id, object: 'response', created_at: 0, model: 'gpt-5.1', output: [] } })

  const item = { id: itemId, type: 'message', status: 'in_progress', role: 'assistant', content: [] }
  send({ type: 'response.output_item.added', output_index: 0, item })
  send({
    type: 'response.content_part.added',
    item_id: itemId,
    output_index: 0,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] }
  })

  const size = Math.max(1, Math.ceil(text.length / 6))
  for (let at = 0; at < text.length; at += size) {
    await wait(150)
    send({
      type: 'response.output_text.delta',
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: text.slice(at, at + size)
    })
  }

  send({ type: 'response.output_text.done', item_id: itemId, output_index: 0, content_index: 0, text })
  send({
    type: 'response.content_part.done',
    item_id: itemId,
    output_index: 0,
    content_index: 0,
    part: { type: 'output_text', text, annotations: [] }
  })
  const done = { ...item, status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
  send({ type: 'response.output_item.done', output_index: 0, item: done })
  send({
    type: 'response.completed',
    response: {
      id,
      object: 'response',
      created_at: 0,
      model: 'gpt-5.1',
      status: 'completed',
      output: [done],
      usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 }
    }
  })
  response.end()
}
