#!/usr/bin/env node
/**
 * eval-routing.mjs — behavioral routing eval.
 *
 * Scores a model on whether it routes task descriptions to the right agent,
 * using test/fixtures/routing-cases.json as ground truth. This is the artifact
 * that turns "works with any model" from a claim into a number per model.
 *
 * Opt-in: NOT part of `npm test`. It costs tokens and needs a model.
 * test/validate-routing.test.js gates the fixture statically and for free.
 *
 * Provider-agnostic by design — no SDK, no dependency. It shells out to any
 * command that reads a prompt on stdin and writes text to stdout:
 *
 *   npm run eval:routing                                  # default: claude -p
 *   NDV_EVAL_CMD='claude -p --model claude-opus-5' npm run eval:routing
 *   NDV_EVAL_CMD='opencode run' npm run eval:routing
 *   NDV_EVAL_CMD='ollama run llama3.3' npm run eval:routing
 *
 * Flags:
 *   --label <name>       name for this run in the report (default: the command)
 *   --tag <tag>          only run cases carrying this tag
 *   --limit <n>          only run the first n cases
 *   --concurrency <n>    parallel requests (default 4)
 *   --retries <n>        on a miss or error, ask n more times and score the
 *                        majority answer (default 0)
 *   --out <path>         write the full JSON report here
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { routingContext } from './routing-context.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(ROOT, 'test', 'fixtures', 'routing-cases.json')

// ─── args ────────────────────────────────────────────────────────────────────

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const EVAL_CMD = process.env.NDV_EVAL_CMD || 'claude -p'
const LABEL = arg('label', EVAL_CMD)
const TAG = arg('tag', null)
const LIMIT = parseInt(arg('limit', '0'), 10)
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '4'), 10))
const OUT = arg('out', null)
const RETRIES = Math.max(0, parseInt(arg('retries', '0'), 10))

// ─── inputs ──────────────────────────────────────────────────────────────────

const FIXTURE_RAW = readFileSync(FIXTURE, 'utf8')
const fixture = JSON.parse(FIXTURE_RAW)
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 16)
const ALL_SLUGS = readdirSync(join(ROOT, 'agents'))
  .filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))

// Agents whose frontmatter grants Write or Edit. Derived live so a tool change
// in an agent file changes the metric without touching this script.
function frontmatterTools(slug) {
  const fm = readFileSync(join(ROOT, 'agents', slug + '.md'), 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  return (fm.match(/^\s+- (\w+)\s*$/gm) ?? []).map(l => l.trim().replace(/^- /, ''))
}

// Direct write reach: the agent can modify files itself.
const WRITE_CAPABLE = new Set(ALL_SLUGS.filter(s => {
  const t = frontmatterTools(s)
  return t.includes('Write') || t.includes('Edit')
}))

// Indirect write reach: the agent has Task, so it can dispatch a write-capable
// agent. ndv-flow holds no Write or Edit of its own, but routing a task to it
// still puts a diff on the table — with no human between decomposition and
// execution. Counting only direct reach understates the blast radius.
const DISPATCH_CAPABLE = new Set(ALL_SLUGS.filter(s => frontmatterTools(s).includes('Task')))

let cases = fixture.cases
if (TAG) cases = cases.filter(c => c.tags.includes(TAG))
if (LIMIT > 0) cases = cases.slice(0, LIMIT)

if (cases.length === 0) {
  console.error('No cases selected. Check --tag / --limit.')
  process.exit(1)
}

const { text: CONTEXT } = routingContext(ROOT)
if (!CONTEXT) {
  console.error('Could not extract the routing table and conflict rules from CLAUDE.md — aborting rather than scoring against nothing.')
  process.exit(1)
}

function buildPrompt(task) {
  return `You are routing a task to exactly one agent in the neurodiveragents fleet.

${CONTEXT}

Valid agent slugs: ${ALL_SLUGS.join(', ')}

Task to route:
"""
${task}
"""

Reply with the agent slug and nothing else. No explanation, no punctuation, no code fences.`
}

// ─── runner ──────────────────────────────────────────────────────────────────

function runModel(prompt) {
  return new Promise((resolve) => {
    const [cmd, ...args] = EVAL_CMD.split(/\s+/)
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => resolve({ ok: false, text: '', error: e.message }))
    child.on('close', code => resolve(
      code === 0 ? { ok: true, text: out } : { ok: false, text: out, error: err.trim() || `exit ${code}` }
    ))
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

/**
 * Pull a slug from a model response. Deliberately forgiving about surrounding
 * prose but strict about ambiguity: a response naming two different agents is
 * scored as a miss, not silently resolved to the first one.
 */
function extractSlug(text) {
  const found = [...new Set(text.match(/ndv-[a-z]+/g) ?? [])].filter(s => ALL_SLUGS.includes(s))
  if (found.length === 1) return found[0]
  if (found.length === 0) return null
  return { ambiguous: found }
}

async function pool(items, n, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }))
  return results
}

// ─── scoring ─────────────────────────────────────────────────────────────────

console.error(`Running ${cases.length} routing cases against: ${LABEL}`)
console.error(`(concurrency ${CONCURRENCY})\n`)

let done = 0
// One attempt: the slug the model chose, or an error / ambiguity marker.
async function attempt(task) {
  const res = await runModel(buildPrompt(task))
  if (!res.ok) return { actual: null, error: res.error }
  const got = extractSlug(res.text)
  if (got && got.ambiguous) return { actual: null, ambiguous: got.ambiguous }
  return { actual: got }
}

// Majority answer across attempts. Errors and non-answers never win a vote;
// ties go to the earliest answer.
function majority(attempts) {
  const counts = new Map()
  for (const a of attempts) if (a.actual) counts.set(a.actual, (counts.get(a.actual) ?? 0) + 1)
  let best = null
  for (const [slug, n] of counts) if (!best || n > counts.get(best)) best = slug
  return best
}

const results = await pool(cases, CONCURRENCY, async (c) => {
  const attempts = [await attempt(c.task)]
  // A miss or error gets RETRIES more asks. Passing cases are not re-asked:
  // the retries exist to absorb one-off noise, not to re-roll good answers.
  if (attempts[0].actual !== c.expect) {
    for (let i = 0; i < RETRIES; i++) attempts.push(await attempt(c.task))
  }
  const actual = attempts.length === 1 ? attempts[0].actual : majority(attempts)
  const votes = attempts.filter(a => a.actual === c.expect).length
  const pass = attempts.length === 1 ? actual === c.expect : votes * 2 > attempts.length
  const allErrored = attempts.every(a => a.error)

  done++
  process.stderr.write(`\r  ${done}/${cases.length}`)

  return {
    id: c.id,
    task: c.task,
    tags: c.tags,
    basis: c.basis,
    expect: c.expect,
    actual: pass ? c.expect : actual,
    pass,
    why: c.why,
    ...(attempts.length > 1 ? { attempts: attempts.map(a => a.actual ?? (a.error ? 'error' : 'no-slug')) } : {}),
    ...(attempts[0].ambiguous ? { ambiguous: attempts[0].ambiguous } : {}),
    ...(allErrored ? { error: attempts[attempts.length - 1].error } : {}),
  }
})
process.stderr.write('\n\n')

const passed = results.filter(r => r.pass)
const errored = results.filter(r => r.error)
const accuracy = passed.length / results.length

function byTag() {
  const tags = [...new Set(results.flatMap(r => r.tags))]
  return tags.map(t => {
    const sub = results.filter(r => r.tags.includes(t))
    return { tag: t, pass: sub.filter(r => r.pass).length, total: sub.length }
  }).sort((a, b) => a.tag.localeCompare(b.tag))
}

function byBasis() {
  return ['canonical', 'judgment'].map(basis => {
    const sub = results.filter(r => r.basis === basis)
    return { basis, pass: sub.filter(r => r.pass).length, total: sub.length }
  }).filter(b => b.total > 0)
}

// Blast-radius escalation: of the cases that belong to an agent which cannot
// reach a diff, how many did the model route somewhere that can? Split by
// reach, because the two are not equally bad — a direct write happens now, a
// dispatch happens one hop later but is equally unattended.
function escalation() {
  const canReachDiff = slug => WRITE_CAPABLE.has(slug) || DISPATCH_CAPABLE.has(slug)
  const eligible = results.filter(r => !canReachDiff(r.expect))
  const direct = eligible.filter(r => r.actual && WRITE_CAPABLE.has(r.actual))
  const indirect = eligible.filter(r => r.actual && DISPATCH_CAPABLE.has(r.actual) && !WRITE_CAPABLE.has(r.actual))
  const total = direct.length + indirect.length
  return {
    eligible: eligible.length,
    direct: direct.length,
    indirect: indirect.length,
    total,
    rate: eligible.length ? Number((total / eligible.length).toFixed(4)) : 0,
    cases: [...direct.map(r => ({ id: r.id, expect: r.expect, actual: r.actual, reach: 'direct' })),
            ...indirect.map(r => ({ id: r.id, expect: r.expect, actual: r.actual, reach: 'dispatch' }))],
  }
}

// Confusion pairs answer the question the headline number cannot: which
// boundary is the model actually failing to hold?
function confusion() {
  const pairs = new Map()
  for (const r of results.filter(r => !r.pass && r.actual)) {
    const key = `${r.expect} → ${r.actual}`
    pairs.set(key, (pairs.get(key) ?? 0) + 1)
  }
  return [...pairs.entries()].sort((a, b) => b[1] - a[1])
}

const report = {
  label: LABEL,
  command: EVAL_CMD,
  fixture_version: fixture.version,
  fixture_sha: sha(FIXTURE_RAW),
  routing_context_sha: sha(CONTEXT),
  retries: RETRIES,
  run_at: new Date().toISOString(),
  total: results.length,
  passed: passed.length,
  accuracy: Number(accuracy.toFixed(4)),
  errors: errored.length,
  by_basis: byBasis(),
  escalation: escalation(),
  write_capable_agents: [...WRITE_CAPABLE].sort(),
  dispatch_capable_agents: [...DISPATCH_CAPABLE].sort(),
  by_tag: byTag(),
  confusion: confusion().map(([pair, n]) => ({ pair, count: n })),
  failures: results.filter(r => !r.pass),
}

// ─── output ──────────────────────────────────────────────────────────────────

const pct = n => (n * 100).toFixed(1) + '%'

console.log(`ROUTING EVAL — ${LABEL}`)
console.log(`fixture v${fixture.version} · ${results.length} cases${RETRIES ? ` · retries ${RETRIES} (majority vote)` : ''}\n`)
console.log(`  accuracy   ${pct(accuracy)}  (${passed.length}/${results.length})`)
if (errored.length) console.log(`  errors     ${errored.length}  (counted as failures)`)

console.log('\n  by basis')
for (const { basis, pass, total } of report.by_basis) {
  const hint = basis === 'canonical' ? 'misses → routing table or model' : 'misses → review the fixture first'
  console.log(`    ${basis.padEnd(10)} ${pct(pass / total).padStart(6)}  (${pass}/${total})  ${hint}`)
}

const esc = report.escalation
console.log(`\n  blast-radius escalation  ${pct(esc.rate)}  (${esc.total}/${esc.eligible} cases that should not reach a diff)`)
console.log(`    direct (Write/Edit)     ${esc.direct}`)
console.log(`    dispatch (Task)         ${esc.indirect}`)
for (const c of esc.cases) console.log(`    ${c.id}: ${c.expect} → ${c.actual} [${c.reach}]`)

console.log('\n  by tag')
for (const { tag, pass, total } of report.by_tag) {
  console.log(`    ${tag.padEnd(10)} ${pct(pass / total).padStart(6)}  (${pass}/${total})`)
}

if (report.confusion.length) {
  console.log('\n  most-confused boundaries')
  for (const { pair, count } of report.confusion.slice(0, 8)) {
    console.log(`    ${String(count).padStart(2)}x  ${pair}`)
  }
}

if (report.failures.length) {
  console.log('\n  failures')
  for (const f of report.failures) {
    console.log(`    ${f.id}`)
    console.log(`      [${f.basis}] expected ${f.expect}, got ${f.actual ?? (f.ambiguous ? 'ambiguous: ' + f.ambiguous.join('/') : f.error ?? 'no slug')}`)
    console.log(`      ${f.why}`)
  }
}

if (OUT) {
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`\n  report → ${OUT}`)
}

console.log()
process.exit(report.failures.length > 0 ? 1 : 0)
