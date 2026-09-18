import { createServer } from 'node:http'

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
        json({
          id: 'resp_fake',
          object: 'response',
          created_at: 0,
          status: 'completed',
          model: 'gpt-5.1',
          output: [
            {
              id: 'msg_fake',
              type: 'message',
              status: 'completed',
              role: 'assistant',
              content: [{ type: 'output_text', text: reply, annotations: [] }]
            }
          ],
          usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 }
        })
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
