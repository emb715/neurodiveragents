#!/usr/bin/env node
/**
 * Routing-eval provider: Ollama. Prompt on stdin, slug on stdout.
 *
 * Uses Ollama's cloud API when OLLAMA_API_KEY is set, otherwise a local
 * server (OLLAMA_HOST, default http://127.0.0.1:11434).
 * Model: NDV_EVAL_MODEL (e.g. glm-5.3-flash).
 *
 * Exits non-zero with the provider's error on stderr (rate limits, quota,
 * unknown model) so the runner records an error instead of a wrong answer.
 */

import { readFileSync } from 'node:fs'

const model = process.env.NDV_EVAL_MODEL
if (!model) {
  console.error('NDV_EVAL_MODEL is required for the ollama provider')
  process.exit(2)
}

const key = process.env.OLLAMA_API_KEY
const base = key ? 'https://ollama.com' : (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434')

const res = await fetch(`${base}/api/chat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  },
  body: JSON.stringify({
    model,
    stream: false,
    think: false,
    messages: [
      { role: 'system', content: 'You are a task router. Follow the routing instructions in the user message exactly and reply with only the requested agent slug.' },
      { role: 'user', content: readFileSync(0, 'utf8') },
    ],
  }),
  signal: AbortSignal.timeout(120_000),
}).catch(e => {
  console.error(`ollama request failed: ${e.message}`)
  process.exit(1)
})

const body = await res.text()
if (!res.ok) {
  console.error(`ollama HTTP ${res.status}: ${body.slice(0, 300)}`)
  process.exit(1)
}

process.stdout.write(JSON.parse(body).message?.content ?? '')
