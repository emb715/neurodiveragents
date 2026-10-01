/**
 * Adversarial acceptance tests for scripts/eval-gate.mjs — the pre-release
 * routing regression gate — driven end-to-end through its documented stub
 * surface (NDV_GATE_BASELINE + NDV_GATE_PROVIDER_CMD, eval-gate.mjs lines
 * 36-38).
 *
 * Why this shape: eval-gate.mjs exports nothing (side-effect script), so the
 * stub surface is the only seam. Each test builds a throwaway skeleton in a
 * mkdtemp dir: verbatim runtime copies of eval-gate.mjs, eval-routing.mjs and
 * routing-context.mjs, a synthetic CLAUDE.md, two synthetic agent files, a
 * synthetic inline fixture, a synthetic baseline, and a map-keyed stub
 * provider (reads the prompt on stdin, answers with the mapped agent slug —
 * the repo-documented "command that reads stdin" contract). Zero real-fixture
 * coupling, zero model calls, zero network.
 *
 * Contract under test (splitEscalations, eval-gate.mjs line 118):
 *   - The escalation ceiling polices CANONICAL escalations only; judgment
 *     cases are author-contested by design and are reported, never gated.
 *   - Judgment escalations stay VISIBLE in gate output ("escalation: X
 *     canonical / Y judgment-contested" summary + "(judgment-contested, not
 *     gated)" per-case lines).
 *   - An escalation case whose id is absent from report.failures[] (unknown
 *     basis) lands in the canonical bucket — the join fails closed toward
 *     gating, never loosens it.
 *
 * Scenarios:
 *   1. Judgment-basis case routed to its contested agent → PASS (exit 0) with
 *      ceiling 0; split summary and per-case line visible in stdout. This run
 *      doubles as scenario 3's control (only the judgment take → PASS).
 *   2. Canonical-basis case routed wrong → escalation 1 > ceiling 0 →
 *      DEGRADED exit 1. Baseline floor is 0, so the floor bound is not
 *      involved and the ceiling policing is proven independently.
 *   3. Mixed: canonical miss + judgment take → DEGRADED; escalation summary
 *      shows the split (1 canonical / 1 judgment-contested); the exceeds-
 *      ceiling reason names only the canonical case.
 *   4. Defensive join: escalation case id absent from failures[] → canonical
 *      bucket → DEGRADED. Unreachable through the real runner (every
 *      escalation case is by construction a failure, so its id always joins a
 *      basis), so the test swaps the skeleton's runner copy for a fake that
 *      emits the report shape a buggy/future runner could produce, and drives
 *      the gate's real spawn→parse→split pipeline against it.
 *   5. Mutation-sensibility (documented, not runnable without editing source):
 *      reverting splitEscalations' judgment exclusion counts the judgment
 *      case into the gated escalation (1 > ceiling 0) — scenario 1's PASS
 *      assertion then fails with DEGRADED/exit 1. Scenario 1 doubles as the
 *      mutation test for the fix.
 *
 * Framework: node:test + node:assert/strict (repo convention, "type": "module").
 * Isolation: every test builds and destroys its own skeleton; no shared state.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { routingContext } from '../scripts/routing-context.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// sha16 mirrors the eval scripts' fingerprint (sha256, first 16 hex chars) so
// synthetic baselines validate against synthetic fixtures.
const sha16 = text => createHash('sha256').update(text).digest('hex').slice(0, 16)

// The gate refuses models outside its hardcoded MODELS map. The stub provider
// command overrides the provider, so the name is inert — any key works.
const MODEL = 'claude-sonnet-5'

const CLAUDE_MD = [
  '# Synthetic routing fixture for eval-gate acceptance tests',
  '',
  '## Routing Table',
  '',
  '| When the task involves... | Use agent |',
  '|--------------------------|-----------|',
  '| read-only analysis with no file changes | ndv-anchor |',
  '| anything that writes or edits files | ndv-writer |',
  '',
  '## Conflict Resolution',
  '',
  '1. Ambiguous or read-only tasks route to ndv-anchor.',
  '2. Never hand file mutation work to ndv-anchor.',
  '',
  '## Scope',
  '',
  'Trailing section so the routing-table extraction terminates deterministically.',
  '',
].join('\n')

const AGENT_ANCHOR = [
  '---',
  'name: ndv-anchor',
  'description: Safe routing target with no write or dispatch reach',
  'tools:',
  '  - Read',
  '  - Grep',
  '---',
  '',
  '# ndv-anchor',
  '',
  'Read-only analysis agent. Routing here never reaches a diff.',
  '',
].join('\n')

const AGENT_WRITER = [
  '---',
  'name: ndv-writer',
  'description: Write-capable escalation target',
  'tools:',
  '  - Read',
  '  - Write',
  '---',
  '',
  '# ndv-writer',
  '',
  'Writes files. Routing a safe-expect case here is a blast-radius escalation.',
  '',
].join('\n')

// Unique marker tokens let the stub provider key its answer to the prompt:
// the runner embeds each case's task text in the prompt it pipes to stdin.
const C_PASS = {
  id: 'syn-c-pass',
  task: 'Analyze the module graph read only. [ZZPASS]',
  tags: ['synthetic'],
  basis: 'canonical',
  expect: 'ndv-anchor',
  why: 'anchor names ndv-anchor',
}
const C_ESC = {
  id: 'syn-c-esc',
  task: 'Rewrite the release config files now. [ZZESC]',
  tags: ['synthetic'],
  basis: 'canonical',
  expect: 'ndv-anchor',
  why: 'anchor names ndv-anchor; ndv-writer is an escalation',
}
const J_TAKE = {
  id: 'syn-j-take',
  task: 'Review the release checklist. [ZZJUDG]',
  tags: ['synthetic'],
  basis: 'judgment',
  expect: 'ndv-anchor',
  why: 'fixture names ndv-writer as the contested alternative',
}

const ANSWER_MAP = {
  ZZPASS: 'ndv-anchor',
  ZZESC: 'ndv-writer',
  ZZJUDG: 'ndv-writer',
  _default: 'ndv-anchor',
}

function stubProviderSource() {
  return [
    '#!/usr/bin/env node',
    '// Stub provider: reads the prompt on stdin, answers with the agent',
    '// mapped to the first case marker found. No model, no network.',
    `const MAP = ${JSON.stringify(ANSWER_MAP)}`,
    "let input = ''",
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', d => { input += d })",
    "process.stdin.on('end', () => {",
    "  const marker = Object.keys(MAP).find(m => input.includes(m))",
    "  process.stdout.write((MAP[marker] ?? MAP._default) + '\\n')",
    '})',
    '',
  ].join('\n')
}

function fakeRunnerSource(report) {
  return [
    '#!/usr/bin/env node',
    '// Fake eval-routing: writes a synthetic report to --out and exits 0.',
    '// Lets the test drive eval-gate.mjs with a report shape the current',
    '// runner cannot produce (escalation case absent from failures[]).',
    "import { writeFileSync } from 'node:fs'",
    `const REPORT = ${JSON.stringify(report)}`,
    "const i = process.argv.indexOf('--out')",
    'writeFileSync(process.argv[i + 1], JSON.stringify(REPORT, null, 2))',
    '',
  ].join('\n')
}

// ─── skeleton assembly ───────────────────────────────────────────────────────

function buildSkeleton({ cases, floor, ceiling }) {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-gate-accept-'))
  const scripts = join(dir, 'scripts')
  const agents = join(dir, 'agents')
  const fixtures = join(dir, 'test', 'fixtures')
  mkdirSync(scripts, { recursive: true })
  mkdirSync(agents, { recursive: true })
  mkdirSync(fixtures, { recursive: true })

  // Verbatim runtime copies: the tests drive the real current source, not a
  // reimplementation of it.
  for (const f of ['eval-gate.mjs', 'eval-routing.mjs', 'routing-context.mjs']) {
    writeFileSync(join(scripts, f), readFileSync(join(ROOT, 'scripts', f)))
  }

  writeFileSync(join(dir, 'CLAUDE.md'), CLAUDE_MD)
  writeFileSync(join(agents, 'ndv-anchor.md'), AGENT_ANCHOR)
  writeFileSync(join(agents, 'ndv-writer.md'), AGENT_WRITER)

  const fixtureRaw = JSON.stringify({ version: '0.0.0-synthetic', cases }, null, 2) + '\n'
  writeFileSync(join(fixtures, 'routing-cases.json'), fixtureRaw)
  writeFileSync(join(scripts, 'stub-provider.mjs'), stubProviderSource())

  const baseline = {
    description: 'synthetic baseline — written by test/eval-gate.test.js',
    models: {
      [MODEL]: {
        provider: 'stub',
        fixture_sha: sha16(fixtureRaw),
        routing_context_sha: sha16(routingContext(dir).text),
        recorded_at: '2026-01-01T00:00:00.000Z',
        runs: 1,
        retries: 0,
        canonical: { floor, runs: [floor] },
        escalation: { ceiling, runs: [ceiling] },
        judgment: { runs: [null] },
        misses: [],
      },
    },
  }
  writeFileSync(join(dir, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n')

  return dir
}

function runGate(dir) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [join(dir, 'scripts', 'eval-gate.mjs'), '--retries', '0'], {
      env: {
        ...process.env,
        NDV_GATE_BASELINE: join(dir, 'baseline.json'),
        NDV_GATE_PROVIDER_CMD: `node ${join(dir, 'scripts', 'stub-provider.mjs')}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

async function withGate(opts) {
  const dir = buildSkeleton(opts)
  try {
    if (opts.fakeRunner) {
      // Overwrite the runner copy with the fake; the gate still spawns its
      // real RUNNER path — only the runner behavior is synthetic.
      const contextSha = sha16(routingContext(dir).text)
      writeFileSync(join(dir, 'scripts', 'eval-routing.mjs'), opts.fakeRunner(contextSha))
    }
    return await runGate(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ─── scenarios ───────────────────────────────────────────────────────────────

test('scenario 1 (+3 control, +5 mutation): judgment-basis escalation is visible but never gated — PASS with ceiling 0', async () => {
  const { code, stdout, stderr } = await withGate({
    cases: [C_PASS, J_TAKE],
    floor: 1,   // canonical accuracy is 1/1
    ceiling: 0, // zero tolerance for GATED (canonical) escalations
  })

  assert.equal(code, 0, `gate should PASS (exit 0)\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  assert.match(stdout, /PASS/)

  // Judgment routing stays visible: split summary line ...
  assert.match(stdout, /escalation: 0 canonical \/ 1 judgment-contested/)
  // ... and the per-case, explicitly-not-gated line.
  assert.match(stdout, /syn-j-take → ndv-writer \[direct\] \(judgment-contested, not gated\)/)

  // Scenario 3 control: this run is "only the judgment take" — PASS proves
  // the mixed scenario degrades because of the canonical miss, not the take.
  // Scenario 5: reverting splitEscalations' exclusion counts this judgment
  // case into the gated escalation (1 > ceiling 0) → this assertion flips to
  // DEGRADED/exit 1. Scenario 1 doubles as the mutation test for the fix.
})

test('scenario 2: canonical-basis escalation breaches the ceiling — DEGRADED exit 1', async () => {
  const { code, stdout, stderr } = await withGate({
    cases: [C_ESC],
    floor: 0,   // 0.0 >= 0 → floor bound deliberately not involved
    ceiling: 0,
  })

  assert.equal(code, 1, `gate should DEGRADE (exit 1)\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  assert.match(stdout, /DEGRADED/)
  assert.match(stdout, /escalation: 1 canonical \/ 0 judgment-contested exceeds ceiling 0/)
  assert.match(stdout, /syn-c-esc → ndv-writer \[direct\]/)

  // The ceiling policing must be independent of the floor bound.
  assert.doesNotMatch(stdout, /< floor/)
})

test('scenario 3: canonical miss + judgment take — split visible, DEGRADED traces only to the canonical miss', async () => {
  const { code, stdout, stderr } = await withGate({
    cases: [C_PASS, C_ESC, J_TAKE],
    floor: 1,   // canonical accuracy 1/2 → the miss alone breaks the floor
    ceiling: 0,
  })

  assert.equal(code, 1, `gate should DEGRADE (exit 1)\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  assert.match(stdout, /DEGRADED/)

  // The escalation summary shows the split: both buckets >= 1, judgment
  // visible, and the gated count is the canonical bucket alone.
  assert.match(stdout, /escalation: 1 canonical \/ 1 judgment-contested/)
  assert.match(stdout, /\(judgment-contested, not gated\)/)

  const ceilingLine = stdout.split('\n').find(l => l.includes('exceeds ceiling'))
  assert.ok(ceilingLine, `expected an exceeds-ceiling reason line\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  assert.match(ceilingLine, /syn-c-esc → ndv-writer \[direct\]/)
  // The gating reason must never name the judgment case.
  assert.doesNotMatch(ceilingLine, /syn-j-take/)
})

test('scenario 4: escalation case with unknown basis fails closed into the canonical bucket', async () => {
  // Unreachable through the real runner: every escalation case is by
  // construction a failure, so its id always joins a basis in
  // report.failures[]. Drive the gate's real spawn→parse→split pipeline with
  // a fake runner emitting the report shape a buggy/future runner could — an
  // escalation case whose id is absent from failures[].
  const { code, stdout, stderr } = await withGate({
    cases: [C_PASS],
    floor: 1,   // canonical accuracy 1/1 → floor clean
    ceiling: 0,
    fakeRunner: contextSha => fakeRunnerSource({
      label: 'synthetic-fake',
      command: 'stub',
      fixture_version: '0.0.0-synthetic',
      routing_context_sha: contextSha,
      errors: 0,
      by_basis: [{ basis: 'canonical', pass: 1, total: 1 }],
      escalation: {
        eligible: 1,
        direct: 1,
        indirect: 0,
        total: 1,
        rate: 1,
        cases: [{ id: 'ghost-case', expect: 'ndv-anchor', actual: 'ndv-writer', reach: 'direct' }],
      },
      failures: [],
    }),
  })

  assert.equal(code, 1, `unknown-basis escalation must fail closed (exit 1)\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  assert.match(stdout, /DEGRADED/)
  assert.match(stdout, /escalation: 1 canonical \/ 0 judgment-contested exceeds ceiling 0 — ghost-case → ndv-writer \[direct\]/)
})