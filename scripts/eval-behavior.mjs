#!/usr/bin/env node
/**
 * eval-behavior.mjs — behavioral output eval (local only, costs tokens).
 *
 * The routing eval proves a task reaches the right agent. This one checks
 * that the agent does its job once the task is there. Each case in
 * test/fixtures/behavior-cases.json runs with the agent's own model file as
 * the system prompt, and the output is scored by deterministic checks:
 *
 *   finds  a defect planted inside the agent's domain is named
 *   lane   a defect planted outside the domain is handed to the right agent
 *   brief  a Flow brief missing a Brief Contract field is rejected
 *
 * No model judge: every check is a pattern on the output, so a score can be
 * reproduced from the saved report and argued with line by line.
 *
 *   npm run eval:behavior                                   # one run, default model
 *   npm run eval:behavior -- --agent ndv-secure --kind lane
 *   npm run eval:behavior:baseline                          # record floors (3 runs per model)
 *   npm run eval:behavior:gate                              # compare against the floors
 *   npm run eval:behavior:compare -- --agent ndv-upgrade    # agent file vs control, same cases
 *
 * Control arm (--arm control, and both arms under --compare): the same case,
 * the same model, with the agent file replaced by a plain prompt that still
 * carries everything the fleet shares — the agent's routing row (its lane),
 * the routing table (who else exists), the handoff line format and the
 * BRIEF_REJECTED convention. What the control lacks is exactly what the agent
 * file adds: the neurotype paragraph, the primordial rule, and the domain
 * protocols. An agent that does not beat its control on its own cases is
 * not paying for its place in the fleet.
 *
 * Provider: any command that reads the user prompt on stdin, reads the system
 * prompt from the file named by NDV_EVAL_SYSTEM_FILE, and writes the reply on
 * stdout. scripts/eval-providers/{claude.sh,anthropic.mjs,ollama.mjs} all do.
 * NDV_EVAL_CMD overrides the command for an ad hoc run.
 *
 * Flags:
 *   --agent <slug,...>  only these agents' cases
 *   --kind <kind>       only finds | lane | brief
 *   --limit <n>         only the first n selected cases
 *   --concurrency <n>   parallel requests (default 4)
 *   --retries <n>       on a fail or error, ask n more times; majority wins (default 0, gate/baseline 2)
 *   --out <path>        write the JSON report (single run only)
 *   --models <a,b>      baseline/gate: which models (default: the routing gate's three)
 *   --provider <name>   baseline: claude | anthropic | ollama (gate reuses the recorded one)
 *   --runs <n>          baseline and compare: runs per arm (default 3)
 *   --arm <arm>         run: agent (default) or control
 *   --compare           run both arms and report the per-agent difference
 *   --record            compare: write each agent's verdict for this model to
 *                       test/fixtures/agent-evidence.json (the static gate reads it)
 *
 * Gate verdict, per model: PASS (exit 0), DEGRADED (exit 1: below the floor),
 * INCONCLUSIVE (exit 2: provider errors, no baseline, or the fixture changed
 * since the baseline was recorded). Treat INCONCLUSIVE as "not checked".
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { scoreOutput, evidenceCasesSha } from './behavior-checks.mjs'
import { routingContext } from './routing-context.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env')
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === 'function') process.loadEnvFile(ENV_FILE)

const FIXTURE = process.env.NDV_BEHAVIOR_FIXTURE || join(ROOT, 'test', 'fixtures', 'behavior-cases.json')
const EVIDENCE = process.env.NDV_AGENT_EVIDENCE || join(ROOT, 'test', 'fixtures', 'agent-evidence.json')
const BASELINE = process.env.NDV_BEHAVIOR_BASELINE || join(ROOT, 'test', 'fixtures', 'behavior-baseline.json')

const PROVIDERS = {
  claude: `sh ${join(ROOT, 'scripts', 'eval-providers', 'claude.sh')}`,
  anthropic: `node ${join(ROOT, 'scripts', 'eval-providers', 'anthropic.mjs')}`,
  ollama: `node ${join(ROOT, 'scripts', 'eval-providers', 'ollama.mjs')}`,
}
const MODELS = {
  'claude-opus-5': 'claude',
  'claude-sonnet-5': 'claude',
  'claude-haiku-4-5-20251001': 'claude',
  'glm-5.3-flash': 'ollama',
}
const DEFAULT_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']

// ─── args ────────────────────────────────────────────────────────────────────

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const MODE = process.argv.includes('--baseline') ? 'baseline' : process.argv.includes('--gate') ? 'gate' : process.argv.includes('--compare') ? 'compare' : 'run'
const AGENT = arg('agent', null)
const KIND = arg('kind', null)
const LIMIT = parseInt(arg('limit', '0'), 10)
const CONCURRENCY = Math.max(1, parseInt(arg('concurrency', '4'), 10))
const RETRIES = Math.max(0, parseInt(arg('retries', MODE === 'run' || MODE === 'compare' ? '0' : '2'), 10))
const ARM = arg('arm', 'agent')
if (!['agent', 'control'].includes(ARM)) {
  console.error(`Unknown arm: ${ARM}. Known: agent, control`)
  process.exit(2)
}
const OUT = arg('out', null)
const RUNS = Math.max(1, parseInt(arg('runs', '3'), 10))
const PROVIDER_OVERRIDE = arg('provider', null)
if (PROVIDER_OVERRIDE && !PROVIDERS[PROVIDER_OVERRIDE]) {
  console.error(`Unknown provider: ${PROVIDER_OVERRIDE}. Known: ${Object.keys(PROVIDERS).join(', ')}`)
  process.exit(2)
}

// ─── inputs ──────────────────────────────────────────────────────────────────

const FIXTURE_RAW = readFileSync(FIXTURE, 'utf8')
const fixture = JSON.parse(FIXTURE_RAW)
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 16)
const FIXTURE_SHA = sha(FIXTURE_RAW)

let cases = fixture.cases
if (AGENT) cases = cases.filter(c => AGENT.split(',').includes(c.agent))
if (KIND) cases = cases.filter(c => c.kind === KIND)
if (LIMIT > 0) cases = cases.slice(0, LIMIT)
if (cases.length === 0) {
  console.error('No cases selected. Check --agent / --kind / --limit.')
  process.exit(1)
}
const PARTIAL = cases.length !== fixture.cases.length

// The model file minus its frontmatter is exactly what the host loads as the
// agent's system prompt. Read live, so an agent edit changes the score.
const TMP = mkdtempSync(join(tmpdir(), 'ndv-behavior-'))
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }))
const ROUTING = routingContext(ROOT)
const ALL_SLUGS = (ROUTING.table.match(/ndv-[a-z]+/g) ?? []).filter((v, i, a) => a.indexOf(v) === i)

// The control knows its lane and the fleet's shared protocol, nothing else.
function controlPrompt(slug) {
  const lane = ROUTING.table.split('\n').filter(l => l.startsWith('|') && l.includes('`' + slug + '`'))
    .map(l => l.split('|')[1].trim()).join('; ')
  return [
    'You are a senior software engineer on a team of specialist agents.',
    `This task was routed to you as ${slug}. Your lane: ${lane}.`,
    'Do the job that lane describes. Anything you notice that belongs to another specialist, do not fix it: hand it off with one line in this form:',
    '→ ndv-<agent> (<domain>) · <location>: <finding>',
    `The specialists are: ${ALL_SLUGS.join(', ')}. This is the routing table that says who owns what:`,
    ROUTING.table,
    'If a brief from ndv-flow is missing something you need in order to do the job correctly, do not start: reply with',
    'BRIEF_REJECTED: <field> — <what is needed>',
  ].join('\n\n')
}

const systemFiles = new Map()
function systemFile(slug, arm = ARM) {
  const key = arm + ':' + slug
  if (!systemFiles.has(key)) {
    const body = arm === 'control'
      ? controlPrompt(slug)
      : readFileSync(join(ROOT, 'agents', slug + '.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim()
    const path = join(TMP, `${arm}-${slug}.md`)
    writeFileSync(path, body)
    systemFiles.set(key, path)
  }
  return systemFiles.get(key)
}

const PREAMBLE = 'You have no tools in this session. Everything you need is inline below. Produce your normal output for this task.\n\n'

// ─── scoring ─────────────────────────────────────────────────────────────────

const score = (c, text) => scoreOutput(c.checks, text)
const agentSha = slug => sha(readFileSync(join(ROOT, 'agents', slug + '.md'), 'utf8'))
const casesSha = slug => evidenceCasesSha(fixture.cases, slug)

// ─── runner ──────────────────────────────────────────────────────────────────

function runModel(cmdline, env, prompt) {
  return new Promise((resolve) => {
    const [cmd, ...args] = cmdline.split(/\s+/)
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => resolve({ ok: false, text: '', error: e.message }))
    child.on('close', code => resolve(code === 0 ? { ok: true, text: out } : { ok: false, text: out, error: err.trim() || `exit ${code}` }))
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

async function pool(items, n, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i) }
  }))
  return results
}

async function runCases(cmdline, env, label, arm = ARM) {
  let done = 0
  console.error(`Running ${cases.length} behavior cases against: ${label} (concurrency ${CONCURRENCY})`)
  const results = await pool(cases, CONCURRENCY, async (c) => {
    // Agent replies run long (reports, code); the routing default of 4096 truncates them.
    const caseEnv = { NDV_EVAL_MAX_TOKENS: '16000', ...env, NDV_EVAL_SYSTEM_FILE: systemFile(c.agent, arm) }
    const attempts = []
    for (let i = 0; i <= RETRIES; i++) {
      const res = await runModel(cmdline, caseEnv, PREAMBLE + c.input)
      attempts.push(res.ok ? { ...score(c, res.text), text: res.text } : { pass: false, error: res.error })
      if (attempts[0].pass) break // passing cases are not re-asked
    }
    const wins = attempts.filter(a => a.pass).length
    const pass = attempts.length === 1 ? attempts[0].pass : wins * 2 > attempts.length
    const last = attempts[attempts.length - 1]
    done++
    process.stderr.write(`\r  ${done}/${cases.length}`)
    return {
      id: c.id, agent: c.agent, kind: c.kind, pass,
      ...(pass ? {} : { missed: last.missed ?? [], why: c.why }),
      ...(attempts.every(a => a.error) ? { error: last.error } : {}),
      ...(attempts.length > 1 ? { attempts: attempts.map(a => a.error ? 'error' : a.pass ? 'pass' : 'fail') } : {}),
      output: (attempts.find(a => a.pass) ?? last).text ?? '',
    }
  })
  process.stderr.write('\n')
  const passed = results.filter(r => r.pass).length
  const group = key => Object.fromEntries([...new Set(results.map(r => r[key]))].sort().map(k => {
    const sub = results.filter(r => r[key] === k)
    return [k, { pass: sub.filter(r => r.pass).length, total: sub.length }]
  }))
  return {
    label, arm, fixture_version: fixture.version, fixture_sha: FIXTURE_SHA, partial: PARTIAL, retries: RETRIES,
    run_at: new Date().toISOString(),
    total: results.length, passed, accuracy: Number((passed / results.length).toFixed(4)),
    errors: results.filter(r => r.error).length,
    by_kind: group('kind'), by_agent: group('agent'),
    failures: results.filter(r => !r.pass).map(({ output, ...r }) => r),
    results,
  }
}

const pct = n => (n * 100).toFixed(1) + '%'
function printReport(r) {
  console.log(`\nBEHAVIOR EVAL — ${r.label}`)
  console.log(`fixture v${r.fixture_version} · ${r.total} cases${r.retries ? ` · retries ${r.retries} (majority vote)` : ''}\n`)
  console.log(`  accuracy   ${pct(r.accuracy)}  (${r.passed}/${r.total})`)
  if (r.errors) console.log(`  errors     ${r.errors}  (counted as failures)`)
  console.log('\n  by kind')
  for (const [k, v] of Object.entries(r.by_kind)) console.log(`    ${k.padEnd(8)} ${pct(v.pass / v.total).padStart(6)}  (${v.pass}/${v.total})`)
  console.log('\n  by agent')
  for (const [k, v] of Object.entries(r.by_agent)) console.log(`    ${k.padEnd(18)} ${v.pass}/${v.total}`)
  if (r.failures.length) {
    console.log('\n  failures')
    for (const f of r.failures) {
      console.log(`    ${f.id}  ${f.error ? 'error: ' + f.error.slice(0, 120) : 'missed: ' + f.missed.join('; ')}`)
      console.log(`      ${f.why}`)
    }
  }
}

function providerFor(model, recorded) {
  const name = recorded ?? PROVIDER_OVERRIDE ?? MODELS[model]
  if (!name || !PROVIDERS[name]) {
    console.error(`No provider for model ${model}. Pass --provider (${Object.keys(PROVIDERS).join(', ')}).`)
    process.exit(2)
  }
  return name
}
const modelList = () => (arg('models', null)?.split(',').map(s => s.trim()).filter(Boolean)) ?? DEFAULT_MODELS

// ─── modes ───────────────────────────────────────────────────────────────────

if (MODE === 'run') {
  const cmd = process.env.NDV_EVAL_CMD || PROVIDERS.claude
  const report = await runCases(cmd, {}, arg('label', (process.env.NDV_EVAL_CMD ? cmd : `claude.sh (${process.env.NDV_EVAL_MODEL || 'claude-sonnet-5'})`) + (ARM === 'control' ? ' · control' : '')))
  printReport(report)
  if (OUT) { writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log(`\n  report → ${OUT}`) }
  process.exit(report.failures.length ? 1 : 0)
}

if (MODE === 'compare') {
  // Same cases, same model, same transport; only the system prompt differs.
  const cmd = process.env.NDV_EVAL_CMD || PROVIDERS.claude
  const model = process.env.NDV_EVAL_MODEL || 'claude-sonnet-5'
  const arms = { agent: [], control: [] }
  for (let i = 0; i < RUNS; i++) {
    for (const arm of ['agent', 'control']) {
      const r = await runCases(cmd, {}, `${model} · ${arm} · run ${i + 1}/${RUNS}`, arm)
      if (r.errors) { console.log(`INCONCLUSIVE — ${r.errors} provider error(s) in the ${arm} arm`); process.exit(2) }
      arms[arm].push(r)
    }
  }
  // Per agent and kind: passes summed across runs, out of cases × runs.
  const tally = (arm, agent, kind) => {
    let pass = 0, total = 0
    for (const r of arms[arm]) for (const x of r.results) {
      if (x.agent !== agent || (kind && x.kind !== kind)) continue
      total++; if (x.pass) pass++
    }
    return { pass, total }
  }
  const agents = [...new Set(cases.map(c => c.agent))].sort()
  const kinds = ['finds', 'lane', 'brief']
  const fmt = t => t.total ? `${t.pass}/${t.total}` : '—'
  console.log(`\nAGENT vs CONTROL — ${model} · ${RUNS} run(s) per arm · ${cases.length} cases\n`)
  console.log(`  ${'agent'.padEnd(18)} ${kinds.map(k => (k + ' a/c').padEnd(14)).join('')} verdict`)
  const verdicts = {}
  for (const a of agents) {
    const ag = tally('agent', a), ct = tally('control', a)
    // An agent earns its place by beating the control on its own cases, and
    // by not losing on its domain work (finds) while doing it. The control
    // already knows the lane, the handoff format and BRIEF_REJECTED, so a
    // lead built only on lane and brief while finds drop is protocol, not
    // domain value: that is NO GAIN, not EARNS.
    const agF = tally('agent', a, 'finds'), ctF = tally('control', a, 'finds')
    const verdict = ag.pass < ct.pass ? 'WORSE'
      : ag.pass > ct.pass && agF.pass >= ctF.pass ? 'EARNS'
      : 'NO GAIN'
    verdicts[a] = { verdict, agent: ag, control: ct, by_kind: Object.fromEntries(kinds.map(k => [k, { agent: tally('agent', a, k), control: tally('control', a, k) }])) }
    const cells = kinds.map(k => `${fmt(tally('agent', a, k))} / ${fmt(tally('control', a, k))}`.padEnd(14)).join('')
    console.log(`  ${a.padEnd(18)} ${cells} ${verdict}  (${ag.pass}/${ag.total} vs ${ct.pass}/${ct.total})`)
  }
  // Cases the control failed and the agent passed, and the reverse: the
  // concrete evidence behind each verdict.
  console.log('\n  per case (agent passes / control passes, across runs)')
  for (const c of cases) {
    const a = arms.agent.filter(r => r.results.find(x => x.id === c.id).pass).length
    const k = arms.control.filter(r => r.results.find(x => x.id === c.id).pass).length
    console.log(`    ${c.id.padEnd(28)} ${a}/${RUNS} vs ${k}/${RUNS}${a > k ? '  ← agent' : a < k ? '  ← control' : ''}`)
  }
  if (process.argv.includes('--record')) {
    // One entry per agent, one row per model. Pinned to the agent file and to
    // that agent's cases, so editing either makes the evidence stale.
    const ev = existsSync(EVIDENCE) ? JSON.parse(readFileSync(EVIDENCE, 'utf8')) : { description: 'Agent-vs-control evidence. Written by npm run eval:behavior:compare -- --record. Do not edit by hand.', agents: {} }
    for (const a of agents) {
      const entry = ev.agents[a] ?? {}
      const pin = { agent_sha: agentSha(a), cases_sha: casesSha(a) }
      const fresh = entry.agent_sha === pin.agent_sha && entry.cases_sha === pin.cases_sha
      ev.agents[a] = { ...pin, models: { ...(fresh ? entry.models : {}), [model]: {
        verdict: verdicts[a].verdict, runs: RUNS,
        agent: `${verdicts[a].agent.pass}/${verdicts[a].agent.total}`,
        control: `${verdicts[a].control.pass}/${verdicts[a].control.total}`,
        finds: `${verdicts[a].by_kind.finds.agent.pass}/${verdicts[a].by_kind.finds.agent.total} vs ${verdicts[a].by_kind.finds.control.pass}/${verdicts[a].by_kind.finds.control.total}`,
        recorded_at: new Date().toISOString(),
      } } }
    }
    writeFileSync(EVIDENCE, JSON.stringify(ev, null, 2) + '\n')
    console.log(`\n  evidence → ${EVIDENCE}`)
  }
  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ model, runs: RUNS, fixture_sha: FIXTURE_SHA, verdicts, arms }, null, 2))
    console.log(`\n  report → ${OUT}`)
  }
  process.exit(Object.values(verdicts).some(v => v.verdict !== 'EARNS') ? 1 : 0)
}

if (PARTIAL) {
  console.error('Baseline and gate always run the whole fixture. Drop --agent / --kind / --limit.')
  process.exit(2)
}

if (MODE === 'baseline') {
  const existing = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
  // Rows for models not re-recorded survive only if they describe this fixture.
  const keep = existing?.fixture_sha === FIXTURE_SHA ? existing.models : {}
  const models = { ...keep }
  for (const model of modelList()) {
    const provider = providerFor(model)
    const runs = []
    for (let i = 0; i < RUNS; i++) {
      const r = await runCases(PROVIDERS[provider], { NDV_EVAL_MODEL: model }, `${model} run ${i + 1}/${RUNS}`)
      if (r.errors) {
        console.error(`\n${model}: ${r.errors} provider error(s) in run ${i + 1}. Baseline not recorded for this model.`)
        process.exit(2)
      }
      runs.push(r)
    }
    // Floor = worst run. Stable = cases that passed in every run: a later miss
    // on one of these is named as a regression, not shrugged off as noise.
    const passedEverywhere = cases.map(c => c.id).filter(id => runs.every(r => r.results.find(x => x.id === id).pass))
    models[model] = {
      provider,
      floor: Math.min(...runs.map(r => r.passed)),
      runs: runs.map(r => r.passed),
      stable: passedEverywhere,
      recorded_at: new Date().toISOString(),
    }
    console.log(`${model}: floor ${models[model].floor}/${cases.length} (runs ${models[model].runs.join(', ')})`)
  }
  writeFileSync(BASELINE, JSON.stringify({ fixture_version: fixture.version, fixture_sha: FIXTURE_SHA, total: cases.length, retries: RETRIES, models }, null, 2) + '\n')
  console.log(`\nbaseline → ${BASELINE}`)
  process.exit(0)
}

// MODE === 'gate'
if (!existsSync(BASELINE)) {
  console.log('INCONCLUSIVE — no behavior baseline recorded. Run npm run eval:behavior:baseline first.')
  process.exit(2)
}
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
if (baseline.fixture_sha !== FIXTURE_SHA) {
  console.log(`INCONCLUSIVE — the fixture changed since the baseline was recorded (${baseline.fixture_sha} → ${FIXTURE_SHA}). Re-run eval:behavior:baseline.`)
  process.exit(2)
}
const gateModels = arg('models', null) ? modelList() : Object.keys(baseline.models)
let worst = 0
for (const model of gateModels) {
  const row = baseline.models[model]
  if (!row) { console.log(`${model}: INCONCLUSIVE — not in the baseline`); worst = Math.max(worst, 2); continue }
  const r = await runCases(PROVIDERS[providerFor(model, row.provider)], { NDV_EVAL_MODEL: model }, model)
  if (r.errors) { console.log(`${model}: INCONCLUSIVE — ${r.errors} provider error(s)`); worst = Math.max(worst, 2); continue }
  const regressions = r.failures.filter(f => row.stable.includes(f.id))
  const verdict = r.passed < row.floor ? 'DEGRADED' : 'PASS'
  console.log(`${model}: ${verdict} — ${r.passed}/${r.total} (floor ${row.floor})`)
  for (const f of regressions) console.log(`    regression ${f.id}: missed ${f.missed.join('; ')}`)
  if (verdict === 'DEGRADED') worst = Math.max(worst, 1)
}
process.exit(worst)
