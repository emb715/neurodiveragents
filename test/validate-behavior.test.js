/**
 * validate-behavior.test.js
 *
 * Static integrity tests for the behavioral output eval fixture.
 * Concern: can the fixture be trusted to score what an agent produces?
 *
 * Purely static: no LLM calls. The score itself comes from
 * scripts/eval-behavior.mjs, which is opt-in and costs tokens.
 *
 * Checks:
 * 1. Fixture parses, declares a version and the three kinds
 * 2. Every case names a real agent and a declared kind; ids are unique
 * 3. Every check compiles through the scorer's own helper
 * 4. Every agent except ndv-honest has a `finds` case
 * 5. Every agent that declares handoffs has a `lane` case
 * 6. A lane case hands off to an agent named in that agent's Out of Scope,
 *    and never to the agent itself. ndv-flow is the exception: it dispatches
 *    out-of-lane work in its plan instead of writing a handoff line, so its
 *    lane case checks the dispatch
 * 7. Every Tier 1 and Tier 2 agent (the ones with a Brief Contract) has a
 *    `brief` case that expects BRIEF_REJECTED; no other agent does
 * 8. A committed behavior baseline was recorded against this exact fixture
 * 9. Every agent added after the original 18 proves it earns its place: at
 *    least 3 finds cases, and committed agent-vs-control evidence that is
 *    current for its agent file and its cases, on at least 2 models, with
 *    the verdict EARNS on every one
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { AGENTS_DIR, ROOT, TIER1, TIER2 } from './helpers.js'
import { checkRegex, evidenceCasesSha } from '../scripts/behavior-checks.mjs'

const FIXTURE_PATH = join(ROOT, 'test', 'fixtures', 'behavior-cases.json')
const BASELINE_PATH = join(ROOT, 'test', 'fixtures', 'behavior-baseline.json')
const RAW = readFileSync(FIXTURE_PATH, 'utf8')
const fixture = JSON.parse(RAW)
const cases = fixture.cases

const SLUGS = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
const KINDS = ['finds', 'lane', 'brief']
const BRIEF_AGENTS = new Set([...TIER1, ...TIER2])

const agentText = slug => readFileSync(join(AGENTS_DIR, slug + '.md'), 'utf8')
const outOfScope = slug => agentText(slug).match(/^## Out of Scope[^\n]*\n([\s\S]*?)(?=^## )/m)?.[1] ?? ''
const declaresHandoffs = slug => /ndv-[a-z]+/.test(outOfScope(slug).replaceAll(slug, ''))
const casesFor = (slug, kind) => cases.filter(c => c.agent === slug && c.kind === kind)

describe('behavior fixture: shape', () => {
  test('parses, declares a version and the three kinds', () => {
    assert.ok(Number.isInteger(fixture.version) && fixture.version > 0, 'version must be a positive integer')
    assert.deepEqual(Object.keys(fixture.kinds).sort(), [...KINDS].sort())
    assert.ok(Array.isArray(cases) && cases.length > 0)
  })

  test('ids are unique', () => {
    const ids = cases.map(c => c.id)
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`)
  })

  for (const c of cases) {
    test(`${c.id}: real agent, declared kind, substantive input, a reason`, () => {
      assert.ok(SLUGS.includes(c.agent), `unknown agent ${c.agent}`)
      assert.ok(KINDS.includes(c.kind), `unknown kind ${c.kind}`)
      assert.ok(typeof c.input === 'string' && c.input.length >= 80, 'input too short to plant anything')
      assert.ok(typeof c.why === 'string' && c.why.length >= 15, 'every case says what it plants')
      assert.ok(Array.isArray(c.checks) && c.checks.length > 0, 'at least one check')
    })

    test(`${c.id}: every check compiles`, () => {
      for (const ch of c.checks) {
        assert.doesNotThrow(() => checkRegex(ch), `bad check ${JSON.stringify(ch)}`)
        if (ch.handoff) assert.ok(SLUGS.includes(ch.handoff), `handoff to unknown agent ${ch.handoff}`)
        if (ch.within !== undefined) assert.ok(Number.isInteger(ch.within) && ch.within > 0, 'within must be a positive integer')
      }
    })
  }
})

describe('behavior fixture: coverage', () => {
  for (const slug of SLUGS) {
    if (slug !== 'ndv-honest') {
      test(`${slug} has a finds case`, () => {
        assert.ok(casesFor(slug, 'finds').length > 0)
      })
    }

    if (declaresHandoffs(slug)) {
      test(`${slug} has a lane case handing off to an agent its Out of Scope names`, () => {
        const lanes = casesFor(slug, 'lane')
        assert.ok(lanes.length > 0, 'no lane case')
        for (const c of lanes) {
          if (slug === 'ndv-flow') {
            assert.ok(c.checks.some(ch => ch.pattern && ch.pattern.includes('ndv-') && !ch.pattern.includes(slug)), `${c.id}: flow's lane case must check the out-of-lane dispatch`)
            continue
          }
          const targets = c.checks.filter(ch => ch.handoff).map(ch => ch.handoff)
          assert.ok(targets.length > 0, `${c.id}: a lane case must check a handoff`)
          for (const t of targets) {
            assert.notEqual(t, slug, `${c.id}: an agent cannot hand off to itself`)
            assert.ok(outOfScope(slug).includes(t), `${c.id}: ${slug}'s Out of Scope never names ${t}`)
          }
        }
      })
    }

    if (BRIEF_AGENTS.has(slug)) {
      test(`${slug} has a brief case that expects BRIEF_REJECTED`, () => {
        const briefs = casesFor(slug, 'brief')
        assert.ok(briefs.length > 0, 'no brief case')
        for (const c of briefs) assert.ok(c.checks.some(ch => ch.rejected), `${c.id}: brief case must expect BRIEF_REJECTED`)
        assert.match(agentText(slug), /BRIEF_REJECTED/, `${slug} has no BRIEF_REJECTED to emit`)
      })
    } else {
      test(`${slug} has no brief case (no Brief Contract)`, () => {
        assert.equal(casesFor(slug, 'brief').length, 0)
      })
    }
  }
})

describe('behavior fixture: baseline', () => {
  test('a committed baseline was recorded against this fixture', (t) => {
    if (!existsSync(BASELINE_PATH)) return t.skip('no baseline recorded yet — run npm run eval:behavior:baseline')
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    const sha = createHash('sha256').update(RAW).digest('hex').slice(0, 16)
    assert.equal(baseline.fixture_sha, sha, 'the fixture changed after the baseline was recorded: re-run npm run eval:behavior:baseline')
    assert.equal(baseline.total, cases.length)
  })
})

// ─── 9. New agents carry evidence that they beat the plain model ─────────────
//
// An agent that a plain model, told its lane and the fleet protocol, matches
// on its own cases is cost without benefit: more routing surface, more text to
// maintain, no better output. The original 18 predate this gate and are listed
// by name; every agent added after them must ship with evidence.

const PREDATES_EVIDENCE_GATE = new Set([
  'ndv-accessibility', 'ndv-architect', 'ndv-build', 'ndv-design', 'ndv-diagnose', 'ndv-explain',
  'ndv-flow', 'ndv-forecast', 'ndv-honest', 'ndv-optimize', 'ndv-refactor', 'ndv-research',
  'ndv-review', 'ndv-scope', 'ndv-secure', 'ndv-signal', 'ndv-telemetry', 'ndv-tester',
])
const EVIDENCE_PATH = join(ROOT, 'test', 'fixtures', 'agent-evidence.json')
const MIN_EVIDENCE_MODELS = 2
const MIN_FINDS_CASES = 3

describe('behavior evidence: agents added after the original 18 earn their place', () => {
  const evidence = existsSync(EVIDENCE_PATH) ? JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')).agents : {}
  for (const slug of SLUGS.filter(s => !PREDATES_EVIDENCE_GATE.has(s))) {
    test(`${slug} has at least ${MIN_FINDS_CASES} finds cases`, () => {
      assert.ok(casesFor(slug, 'finds').length >= MIN_FINDS_CASES,
        `${slug} has ${casesFor(slug, 'finds').length} finds case(s); one case cannot tell an agent from a lucky prompt`)
    })

    test(`${slug} has current agent-vs-control evidence: EARNS on ${MIN_EVIDENCE_MODELS}+ models`, () => {
      const e = evidence[slug]
      const run = `npm run eval:behavior:compare -- --agent ${slug} --record (per model, with NDV_EVAL_MODEL)`
      assert.ok(e, `no evidence for ${slug}. Run: ${run}`)
      const agentSha = createHash('sha256').update(agentText(slug)).digest('hex').slice(0, 16)
      assert.equal(e.agent_sha, agentSha, `${slug}.md changed after its evidence was recorded. Re-run: ${run}`)
      assert.equal(e.cases_sha, evidenceCasesSha(cases, slug), `${slug}'s cases changed after its evidence was recorded. Re-run: ${run}`)
      const models = Object.entries(e.models ?? {})
      assert.ok(models.length >= MIN_EVIDENCE_MODELS, `${slug} has evidence on ${models.length} model(s); need ${MIN_EVIDENCE_MODELS}`)
      // The verdict string is re-derived from the recorded counts, so an
      // evidence row written under an older, looser rule cannot pass.
      const frac = t => (t ?? '').split(/\s+vs\s+|\//).map(Number)
      for (const [name, m] of models) {
        const [ap, , cp] = [...frac(m.agent), ...frac(m.control)]
        const [fa, , fc] = frac(m.finds)
        assert.ok(m.finds, `${slug} evidence on ${name} has no finds counts. Re-run: ${run}`)
        const derived = ap < cp ? 'WORSE' : ap > cp && fa >= fc ? 'EARNS' : 'NO GAIN'
        assert.equal(m.verdict, derived, `${slug} evidence on ${name} says ${m.verdict} but its counts give ${derived}. Re-run: ${run}`)
      }
      const losing = models.filter(([, m]) => m.verdict !== 'EARNS').map(([name, m]) => `${name}: ${m.verdict} (${m.agent} vs ${m.control}, finds ${m.finds})`)
      assert.deepEqual(losing, [], `${slug} does not beat the plain model on: ${losing.join('; ')}. Fix the agent or drop it.`)
    })
  }
})
