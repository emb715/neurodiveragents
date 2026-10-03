#!/usr/bin/env node
/**
 * Routing-eval provider: Anthropic Messages API, called directly.
 * Prompt on stdin, slug on stdout.
 *
 * This is the clean-room measurement. No CLI, no hooks, no plugins, no
 * CLAUDE.md of any level — only the system prompt below and the prompt the
 * runner pipes in. Use it when claude.sh cannot run --bare (no API key for the
 * CLI) or when the number has to be reproducible outside one developer's shell.
 *
 * Key:      NDV_ANTHROPIC_API_KEY, else ANTHROPIC_API_KEY.
 * Base URL: NDV_ANTHROPIC_BASE_URL (default https://api.anthropic.com/v1).
 *           Point it at an Anthropic-compatible gateway to score through one.
 * Model:    NDV_EVAL_MODEL (the gate's model id).
 * Aliases:  NDV_ANTHROPIC_MODEL_ALIASES, comma-separated `label=served-id`.
 *           Some gateways resolve a bare alias to a different snapshot than
 *           Anthropic does. The gate's label is the model it measures, so map
 *           the label to the id the gateway must receive. The model id the
 *           gateway reports back is echoed on stderr when it differs from both
 *           the label and the mapped id, so a silent substitution is visible.
 *
 * Rate limits (429) and transient upstream errors are retried with backoff
 * that grows to cover a one-minute metering window. Anything else exits
 * non-zero with the provider's error on stderr (auth, unknown model, truncated
 * reply) so the runner records an error, never a wrong answer.
 *
 * Gateways meter requests per minute. Run the baseline with --concurrency 2
 * through a gateway; the default 4 trips the quota on every pass.
 */

import { readFileSync } from 'node:fs'

const model = process.env.NDV_EVAL_MODEL
if (!model) {
  console.error('NDV_EVAL_MODEL is required for the anthropic provider')
  process.exit(2)
}

const key = process.env.NDV_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
if (!key) {
  console.error('anthropic provider needs NDV_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY')
  process.exit(2)
}

const base = (process.env.NDV_ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1').replace(/\/$/, '')
const host = new URL(base).host

const aliases = Object.fromEntries(
  (process.env.NDV_ANTHROPIC_MODEL_ALIASES || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(pair => pair.split('=').map(s => s.trim()))
    .filter(([label, served]) => label && served),
)
const requestModel = aliases[model] ?? model

// Anthropic's own API authenticates with x-api-key. Gateways in front of it
// generally take a Bearer token; sending both to a gateway is harmless and
// avoids a per-host switch.
const headers = {
  'content-type': 'application/json',
  'anthropic-version': '2023-06-01',
  ...(host === 'api.anthropic.com' ? { 'x-api-key': key } : { Authorization: `Bearer ${key}`, 'x-api-key': key }),
}

const payload = JSON.stringify({
  model: requestModel,
  // The answer is one slug, but gateways may enable extended thinking by
  // default and the thinking block counts against this cap. 256 truncated a
  // contested case mid-thought and the reply had no text block at all.
  max_tokens: 4096,
  system: 'You are a task router. Follow the routing instructions in the user message exactly and reply with only the requested agent slug.',
  messages: [{ role: 'user', content: readFileSync(0, 'utf8') }],
})

// Rate limits and transient upstream failures are retried here, not left to
// the runner: the runner's --retries re-asks misses, and a provider error
// voids the whole baseline run. Retry-After is honoured when present.
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504, 529])
const MAX_ATTEMPTS = 7
const sleep = ms => new Promise(r => setTimeout(r, ms))

let res, body
for (let attempt = 1; ; attempt++) {
  res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(180_000),
  }).catch(e => ({ ok: false, status: 0, text: async () => e.message, headers: new Headers() }))
  body = await res.text()
  if (res.ok) break
  const retryable = res.status === 0 || RETRY_STATUS.has(res.status)
  if (!retryable || attempt >= MAX_ATTEMPTS) {
    console.error(`anthropic HTTP ${res.status || 'network'} after ${attempt} attempt(s): ${body.slice(0, 300)}`)
    process.exit(1)
  }
  const retryAfter = Number(res.headers.get('retry-after'))
  const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(5_000 * 2 ** (attempt - 1), 75_000)
  await sleep(wait + Math.floor(Math.random() * 1_000))
}

let json
try { json = JSON.parse(body) } catch {
  console.error(`anthropic returned non-JSON: ${body.slice(0, 300)}`)
  process.exit(1)
}

// Thinking-enabled models return a thinking block before the text block.
const text = (json.content ?? []).find(c => c.type === 'text')?.text
if (!text) {
  console.error(`anthropic reply had no text block (stop_reason=${json.stop_reason}, blocks=${(json.content ?? []).map(c => c.type).join(',') || 'none'})`)
  process.exit(1)
}

// A gateway serving a different snapshot than requested is a measurement
// error if it goes unnoticed. The alias map is meant to prevent it; this line
// proves it did.
if (json.model && json.model !== model && json.model !== requestModel) {
  console.error(`anthropic provider: asked for ${requestModel}, gateway served ${json.model}`)
}

process.stdout.write(text)
