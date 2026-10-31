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
 *    and never to the agent itself
 * 7. Every Tier 1 and Tier 2 agent (the ones with a Brief Contract) has a
 *    `brief` case that expects BRIEF_REJECTED; no other agent does
 * 8. A committed behavior baseline was recorded against this exact fixture
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { AGENTS_DIR, ROOT, TIER1, TIER2 } from './helpers.js'
import { checkRegex } from '../scripts/behavior-checks.mjs'

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
