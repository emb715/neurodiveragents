#!/usr/bin/env node
/**
 * eval-gate.mjs — pre-release routing regression gate (local only).
 *
 *   npm run eval:baseline                    # record: 3 runs per default model
 *   npm run eval:baseline -- --models glm-5.3-flash --runs 3
 *   npm run eval:gate                        # compare: 1 run per baselined model
 *   npm run eval:gate -- --models claude-haiku-4-5-20251001
 *
 * Baseline (test/fixtures/routing-baseline.json), per model:
 *   canonical.floor     lowest canonical accuracy seen across baseline runs
 *   escalation.ceiling  highest canonical blast-radius escalation count seen
 *                       (judgment-contested cases excluded — see splitEscalations)
 *   judgment            recorded for context, never gated
 *
 * Gate verdict, per model:
 *   PASS          canonical >= floor and escalation <= ceiling
 *   DEGRADED      either bound broken                         → exit 1
 *   INCONCLUSIVE  provider errors, or the fixture changed since
 *                 the baseline was recorded                   → exit 2
 *
 * Floors come from the worst of several runs and misses are re-asked
 * (--retries, majority vote), so one noisy answer does not fail a release.
 * A fixture edit invalidates the baseline: the numbers would no longer
 * describe the same test.
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(ROOT, 'test', 'fixtures', 'routing-cases.json')
// NDV_GATE_BASELINE and NDV_GATE_PROVIDER_CMD exist for exercising the gate
// with stub models; normal use sets neither.
const BASELINE = process.env.NDV_GATE_BASELINE || join(ROOT, 'test', 'fixtures', 'routing-baseline.json')
const RUNNER = join(ROOT, 'scripts', 'eval-routing.mjs')

const PROVIDERS = {
  claude: `sh ${join(ROOT, 'scripts', 'eval-providers', 'claude.sh')}`,
  ollama: `node ${join(ROOT, 'scripts', 'eval-providers', 'ollama.mjs')}`,
}

// Models the gate knows how to reach. DEFAULT_MODELS is what a bare
// `eval:baseline` records; others (e.g. GLM) are opt-in via --models.
const MODELS = {
  'claude-opus-5': 'claude',
  'claude-sonnet-5': 'claude',
  'claude-haiku-4-5-20251001': 'claude',
  'glm-5.3-flash': 'ollama',
}
const DEFAULT_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const BASELINE_MODE = process.argv.includes('--baseline')
const RUNS = Math.max(1, parseInt(arg('runs', '3'), 10))
const RETRIES = Math.max(0, parseInt(arg('retries', '2'), 10))
const CONCURRENCY = arg('concurrency', '4')

const fixtureSha = createHash('sha256').update(readFileSync(FIXTURE, 'utf8')).digest('hex').slice(0, 16)
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { models: {} }

const requested = arg('models', null)?.split(',').map(s => s.trim()).filter(Boolean)
const models = requested ?? (BASELINE_MODE ? DEFAULT_MODELS : Object.keys(baseline.models))

const unknown = models.filter(m => !MODELS[m])
if (unknown.length) {
  console.error(`Unknown model(s): ${unknown.join(', ')}. Known: ${Object.keys(MODELS).join(', ')}`)
  process.exit(2)
}
if (models.length === 0) {
  console.error('No baseline recorded yet. Run: npm run eval:baseline')
  process.exit(2)
}

// ─── one runner invocation → parsed report ───────────────────────────────────

function runOnce(model, label) {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-gate-'))
  const out = join(dir, 'report.json')
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      RUNNER, '--label', label, '--retries', String(RETRIES), '--concurrency', CONCURRENCY, '--out', out,
    ], {
      env: { ...process.env, NDV_EVAL_CMD: process.env.NDV_GATE_PROVIDER_CMD || PROVIDERS[MODELS[model]], NDV_EVAL_MODEL: model },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    child.on('close', () => {
      const report = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null
      rmSync(dir, { recursive: true, force: true })
      resolve(report)
    })
  })
}

const basisAccuracy = (report, basis) => {
  const b = report.by_basis.find(x => x.basis === basis)
  return b && b.total ? Number((b.pass / b.total).toFixed(4)) : null
}

// Split blast-radius escalations by fixture basis. Judgment cases are
// author-contested by design — the fixture itself names the contested
// alternative as a possibility — so routing a judgment case to that
// alternative is a fixture-review signal, not a release-gating escalation.
// Canonical cases carry anchors: a canonical escalation means the routing
// table failed to hold, and that is what the ceiling polices.
//
// The runner's escalation cases ({id, expect, actual, reach}) carry no basis,
// but every escalation case is by construction a failure (actual diverges from
// expect toward a write/dispatch-capable agent), and report.failures carries
// basis per case id. Case ids are unique in the fixture, so the join is exact.
function splitEscalations(report) {
  const basisById = new Map(report.failures.map(f => [f.id, f.basis]))
  const withBasis = report.escalation.cases.map(c => ({ ...c, basis: basisById.get(c.id) }))
  const canonical = withBasis.filter(c => c.basis !== 'judgment')
  const judgment = withBasis.filter(c => c.basis === 'judgment')
  return {
    canonicalCount: canonical.length,
    judgmentCount: judgment.length,
    canonicalCases: canonical,
    judgmentCases: judgment,
  }
}

// "escalation: 0 canonical / 1 judgment-contested" — judgment stays visible
// so operators see the behavior instead of it silently vanishing from the gate.
const escalationLabel = s =>
  `escalation: ${s.canonicalCount} canonical / ${s.judgmentCount} judgment-contested`

const pct = n => (n === null || n === undefined) ? '—' : (n * 100).toFixed(1) + '%'

// ─── baseline mode ───────────────────────────────────────────────────────────

if (BASELINE_MODE) {
  let failed = false
  for (const model of models) {
    const reports = []
    for (let r = 1; r <= RUNS; r++) {
      console.error(`\n[baseline] ${model} — run ${r}/${RUNS}`)
      const report = await runOnce(model, `${model} baseline ${r}/${RUNS}`)
      if (!report || report.errors > 0) {
        console.error(`[baseline] ${model}: run ${r} had ${report ? report.errors + ' provider error(s)' : 'no report'} — not recording a baseline from it`)
        reports.length = 0
        failed = true
        break
      }
      reports.push(report)
    }
    if (!reports.length) continue

    const canonical = reports.map(r => basisAccuracy(r, 'canonical'))
    const splits = reports.map(splitEscalations)
    const canonicalEscalations = splits.map(s => s.canonicalCount)
    baseline.models[model] = {
      provider: MODELS[model],
      fixture_sha: fixtureSha,
      routing_context_sha: reports[0].routing_context_sha,
      recorded_at: new Date().toISOString(),
      runs: reports.length,
      retries: RETRIES,
      canonical: { floor: Math.min(...canonical), runs: canonical },
      escalation: { ceiling: Math.max(...canonicalEscalations), runs: canonicalEscalations },
      judgment: { runs: reports.map(r => basisAccuracy(r, 'judgment')) },
      misses: [...new Set(reports.flatMap(r => r.failures.map(f => `${f.id} → ${f.actual ?? 'none'}`)))].sort(),
    }
    const judgmentEscalations = splits.map(s => s.judgmentCount)
    console.error(`[baseline] ${model}: canonical floor ${pct(Math.min(...canonical))}, escalation ceiling ${Math.max(...canonicalEscalations)} (canonical)` +
      (judgmentEscalations.some(n => n > 0) ? `, judgment-contested ${judgmentEscalations.join(' / ')}` : ''))
  }

  baseline.description = 'Routing eval baseline. Written by `npm run eval:baseline`, read by `npm run eval:gate`. Do not edit by hand.'
  const ordered = { description: baseline.description, models: Object.fromEntries(Object.entries(baseline.models).sort()) }
  writeFileSync(BASELINE, JSON.stringify(ordered, null, 2) + '\n')
  console.log(`\nBaseline written → ${BASELINE}`)
  for (const [m, b] of Object.entries(ordered.models)) {
    console.log(`  ${m.padEnd(28)} canonical ≥ ${pct(b.canonical.floor).padStart(6)}   escalation ≤ ${b.escalation.ceiling}   judgment ${b.judgment.runs.map(pct).join(' / ')}`)
  }
  process.exit(failed ? 2 : 0)
}

// ─── gate mode ───────────────────────────────────────────────────────────────

const rows = []
for (const model of models) {
  const b = baseline.models[model]
  if (!b) {
    rows.push({ model, verdict: 'INCONCLUSIVE', reasons: ['no baseline for this model — run eval:baseline --models ' + model] })
    continue
  }
  if (b.fixture_sha !== fixtureSha) {
    rows.push({ model, verdict: 'INCONCLUSIVE', reasons: ['fixture changed since baseline — re-run eval:baseline'] })
    continue
  }

  console.error(`\n[gate] ${model}`)
  const report = await runOnce(model, `${model} gate`)
  if (!report || report.errors > 0) {
    rows.push({ model, verdict: 'INCONCLUSIVE', reasons: [report ? `${report.errors} provider error(s): ${report.failures.find(f => f.error)?.error.split('\n')[0]}` : 'runner produced no report'] })
    continue
  }

  const canonical = basisAccuracy(report, 'canonical')
  const esc = splitEscalations(report)
  // The ceiling polices canonical escalations only. Judgment cases are
  // author-contested by design — see splitEscalations — and are reported,
  // never gated.
  const escalation = esc.canonicalCount
  const reasons = []
  if (canonical < b.canonical.floor) {
    const known = new Set(b.misses.map(m => m.split(' → ')[0]))
    const fresh = report.failures.filter(f => f.basis === 'canonical' && !known.has(f.id))
    reasons.push(`canonical ${pct(canonical)} < floor ${pct(b.canonical.floor)}` +
      (fresh.length ? ` — new misses: ${fresh.map(f => `${f.id} (${f.expect} → ${f.actual ?? 'none'})`).join(', ')}` : ''))
  }
  if (escalation > b.escalation.ceiling) {
    reasons.push(escalationLabel(esc) + ` exceeds ceiling ${b.escalation.ceiling} — ` +
      esc.canonicalCases.map(c => `${c.id} → ${c.actual} [${c.reach}]`).join(', '))
  }
  const judgmentEscalations = esc.judgmentCases.map(c => `${c.id} → ${c.actual} [${c.reach}] (judgment-contested, not gated)`)

  rows.push({
    model,
    verdict: reasons.length ? 'DEGRADED' : 'PASS',
    reasons,
    canonical, floor: b.canonical.floor,
    escalation, ceiling: b.escalation.ceiling,
    escalationLabel: escalationLabel(esc),
    judgmentEscalations,
    judgment: basisAccuracy(report, 'judgment'),
    contextChanged: report.routing_context_sha !== b.routing_context_sha,
  })
}

console.log('\nROUTING EVAL GATE')
for (const r of rows) {
  const nums = r.canonical !== undefined
    ? `canonical ${pct(r.canonical)} (floor ${pct(r.floor)})  ${r.escalationLabel} (ceiling ${r.ceiling})  judgment ${pct(r.judgment)}`
    : ''
  console.log(`  ${r.verdict.padEnd(13)} ${r.model.padEnd(28)} ${nums}`)
  for (const reason of r.reasons) console.log(`                ↳ ${reason}`)
  for (const j of r.judgmentEscalations ?? []) console.log(`                ↳ ${j}`)
  if (r.contextChanged) console.log('                ↳ routing text changed since baseline (this is what was tested)')
}

const degraded = rows.some(r => r.verdict === 'DEGRADED')
const inconclusive = rows.some(r => r.verdict === 'INCONCLUSIVE')
console.log(`\n${degraded ? '✖  Routing degraded against baseline.' : inconclusive ? '⚠  Gate inconclusive — see reasons above.' : '✔  No routing degradation against baseline.'}`)
process.exit(degraded ? 1 : inconclusive ? 2 : 0)
