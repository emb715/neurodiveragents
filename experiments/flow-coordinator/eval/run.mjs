#!/usr/bin/env node
/**
 * run.mjs: does coordinator mode beat a plain model, and does it beat Flow alone?
 *
 * Three arms, the same cases, the same model:
 *
 *   control  a plain coordinator prompt that carries everything the fleet
 *            shares: the routing table, the handoff line, BRIEF_REJECTED, the
 *            ledger format. No Flow, no adapter. Built the way
 *            scripts/eval-behavior.mjs builds its control.
 *   flow     agents/ndv-flow.md as it ships (option 1: claude-flow ndv-flow)
 *   adapter  Flow plus adapter/coordinator.md plus the sdk-host binding
 *            (options 2 and 3 load exactly this text)
 *
 * Every arm gets the same ACTIONS block, so the only difference between arms
 * is Flow and the adapter. Scoring is scripts/behavior-checks.mjs: regexes,
 * no model judge. Costs tokens; never part of `npm run validate`.
 *
 *   node experiments/flow-coordinator/eval/run.mjs                          # Haiku 4.5 + Sonnet 5, 1 run
 *   node experiments/flow-coordinator/eval/run.mjs --models claude-sonnet-5 --runs 3
 *   node experiments/flow-coordinator/eval/run.mjs --case direct-question --arms adapter
 *   node experiments/flow-coordinator/eval/run.mjs --print adapter           # show an arm's system prompt
 *   node experiments/flow-coordinator/eval/run.mjs --dry                     # build every prompt, call nothing
 *
 * Flags: --models a,b · --arms control,flow,adapter · --runs n · --case id,id ·
 *        --provider claude|anthropic|ollama · --concurrency n · --out path
 *
 * Verdict per model, counted in checks passed across all runs:
 *   adapter vs control: EARNS (more) · NO GAIN (equal) · WORSE (fewer)
 *   adapter vs flow:    GAIN · NO GAIN · WORSE
 * Ship rule (the project's): EARNS and GAIN on every model.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { scoreOutput } from '../../../scripts/behavior-checks.mjs'
import { routingContext } from '../../../scripts/routing-context.mjs'
import { assemble, flowBody, REPO_ROOT } from '../adapter/assemble.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_FILE = join(REPO_ROOT, '.env')
try { process.loadEnvFile?.(ENV_FILE) } catch { /* no .env */ }

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const PROVIDERS = {
  claude: `sh ${join(REPO_ROOT, 'scripts', 'eval-providers', 'claude.sh')}`,
  anthropic: `node ${join(REPO_ROOT, 'scripts', 'eval-providers', 'anthropic.mjs')}`,
  ollama: `node ${join(REPO_ROOT, 'scripts', 'eval-providers', 'ollama.mjs')}`,
}
const MODELS = arg('models', 'claude-haiku-4-5-20251001,claude-sonnet-5').split(',')
const ARMS = arg('arms', 'control,flow,adapter').split(',')
const RUNS = Math.max(1, parseInt(arg('runs', '1'), 10))
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '4'), 10))
const PROVIDER = PROVIDERS[arg('provider', 'claude')]
const ONLY = arg('case', null)?.split(',')
const OUT = arg('out', null)
const DRY = process.argv.includes('--dry')

const fixture = JSON.parse(readFileSync(join(HERE, 'coordinator-cases.json'), 'utf8'))
const cases = ONLY ? fixture.cases.filter(c => ONLY.includes(c.id)) : fixture.cases
if (!cases.length) { console.error('No cases selected.'); process.exit(1) }

// ─── prompts ────────────────────────────────────────────────────────────────

export const ACTIONS = `## How you act in this session

You have no tools. You act by writing action lines. Each action goes on ONE line, exactly in one of these forms. Anything else you write is a private note that reaches nobody.

start_thread(agent=ndv-x, files=[path, path], scale=S0|S1|S2, brief="...")
message_thread(id=T3, text="...")
post_message(text="...")
request_decision(question="...", options=["...", "..."], recommended=0)
write_ledger(id=T3, state=queued|in-flight|done|incomplete, files=[path, path], note="...")
save_fact(fact="...")

start_thread opens a thread with one specialist; the brief is its first message. message_thread writes into an existing thread. post_message writes to the person in the chat. request_decision puts a choice in front of the person. write_ledger records or changes a ledger row (a new task you are not starting yet gets a new row: write_ledger(id=new, state=queued, ...)). save_fact saves a durable project fact to project memory.`

function controlPrompt() {
  const { table } = routingContext(REPO_ROOT)
  const slugs = [...new Set(table.match(/ndv-[a-z]+/g) ?? [])]
  return [
    'You are the coordinator of a project chat on a team of specialist agents. A person writes in the chat; specialists do the work in threads that run for a long time. You are woken once per event, with the event and the ledger.',
    'Route each task to the specialist that owns it. Keep the person informed. Track which thread owns which files in the ledger, one row per thread: T[ID] | agent | files owned | scale | state | open handoffs. States: queued, in-flight, done, incomplete.',
    'Specialists hand findings outside their lane to another specialist with one line in this form:\n→ ndv-<agent> (<domain>) · <location>: <finding>',
    'A specialist that is missing something it needs in its brief replies with:\nBRIEF_REJECTED: <field> — <what is needed>',
    `The specialists are: ${slugs.join(', ')}. This is the routing table that says who owns what:`,
    table,
  ].join('\n\n')
}

const ARM_PROMPTS = {
  control: () => controlPrompt(),
  flow: () => flowBody(),
  adapter: () => assemble('sdk-host'),
}

const TMP = mkdtempSync(join(tmpdir(), 'ndv-coord-eval-'))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
const systemFile = Object.fromEntries(ARMS.map(arm => {
  if (!ARM_PROMPTS[arm]) { console.error(`Unknown arm ${arm}`); process.exit(2) }
  const path = join(TMP, `${arm}.md`)
  writeFileSync(path, ARM_PROMPTS[arm]() + '\n\n' + ACTIONS)
  return [arm, path]
}))

if (process.argv.includes('--print')) {
  process.stdout.write(readFileSync(systemFile[arg('print', 'adapter')], 'utf8'))
  process.exit(0)
}

// ─── runner ─────────────────────────────────────────────────────────────────

function runModel(env, prompt) {
  return new Promise(resolve => {
    const [cmd, ...args] = PROVIDER.split(/\s+/)
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => resolve({ ok: false, text: '', error: e.message }))
    child.on('close', code => resolve(code === 0 ? { ok: true, text: out } : { ok: false, text: out, error: err.trim() || `exit ${code}` }))
    child.stdin.end(prompt)
  })
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]) }
  }))
  return out
}

const jobs = MODELS.flatMap(model => ARMS.flatMap(arm => cases.flatMap(c =>
  Array.from({ length: RUNS }, (_, run) => ({ model, arm, c, run })))))

if (DRY) {
  console.log(`${jobs.length} calls would run: ${MODELS.length} models × ${ARMS.length} arms × ${cases.length} cases × ${RUNS} runs`)
  for (const arm of ARMS) console.log(`  ${arm}: ${readFileSync(systemFile[arm], 'utf8').length} chars of system prompt`)
  process.exit(0)
}

let done = 0
console.error(`Running ${jobs.length} calls (concurrency ${CONCURRENCY})`)
const results = await pool(jobs, CONCURRENCY, async ({ model, arm, c, run }) => {
  const res = await runModel({ NDV_EVAL_MODEL: model, NDV_EVAL_SYSTEM_FILE: systemFile[arm], NDV_EVAL_MAX_TOKENS: '16000' }, c.input)
  const scored = res.ok ? scoreOutput(c.checks, res.text) : { pass: false, missed: c.checks.map(() => 'error') }
  done++
  process.stderr.write(`\r  ${done}/${jobs.length}`)
  return {
    model, arm, case: c.id, run, pass: scored.pass, missed: scored.missed,
    checks_passed: c.checks.length - scored.missed.length, checks_total: c.checks.length,
    ...(res.ok ? {} : { error: res.error }), output: res.text,
  }
})
process.stderr.write('\n')

// ─── report ─────────────────────────────────────────────────────────────────

const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0)
const verdict = (a, b, win) => a > b ? win : a === b ? 'NO GAIN' : 'WORSE'
const report = { run_at: new Date().toISOString(), fixture_version: fixture.version, runs: RUNS, models: {} }

for (const model of MODELS) {
  const mine = results.filter(r => r.model === model)
  const arm = a => {
    const rs = mine.filter(r => r.arm === a)
    return { checks: sum(rs, r => r.checks_passed), of: sum(rs, r => r.checks_total), cases: rs.filter(r => r.pass).length, of_cases: rs.length, errors: rs.filter(r => r.error).length }
  }
  const arms = Object.fromEntries(ARMS.map(a => [a, arm(a)]))
  const m = { arms }
  if (arms.adapter && arms.control) m.adapter_vs_control = verdict(arms.adapter.checks, arms.control.checks, 'EARNS')
  if (arms.adapter && arms.flow) m.adapter_vs_flow = verdict(arms.adapter.checks, arms.flow.checks, 'GAIN')
  m.per_case = Object.fromEntries(cases.map(c => [c.id, Object.fromEntries(ARMS.map(a => {
    const rs = mine.filter(r => r.arm === a && r.case === c.id)
    return [a, `${sum(rs, r => r.checks_passed)}/${sum(rs, r => r.checks_total)}`]
  }))]))
  report.models[model] = m

  console.log(`\nCOORDINATOR EVAL: ${model} · ${cases.length} cases · ${RUNS} run(s)`)
  for (const [a, v] of Object.entries(arms)) console.log(`  ${a.padEnd(8)} checks ${v.checks}/${v.of} · cases ${v.cases}/${v.of_cases}${v.errors ? ` · errors ${v.errors}` : ''}`)
  if (m.adapter_vs_control) console.log(`  adapter vs control: ${m.adapter_vs_control}`)
  if (m.adapter_vs_flow) console.log(`  adapter vs flow:    ${m.adapter_vs_flow}`)
  console.log('\n  case                     ' + ARMS.map(a => a.padEnd(9)).join(''))
  for (const [id, row] of Object.entries(m.per_case)) console.log(`  ${id.padEnd(25)}${ARMS.map(a => row[a].padEnd(9)).join('')}`)
}

const all = Object.values(report.models)
report.ship = all.every(m => m.adapter_vs_control === 'EARNS' && m.adapter_vs_flow === 'GAIN')
console.log(`\nShip rule (EARNS and GAIN on every model): ${report.ship ? 'MET' : 'NOT MET'}`)

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ ...report, results }, null, 2))
  console.log(`Report: ${OUT}`)
}
process.exit(results.some(r => r.error) ? 2 : 0)
