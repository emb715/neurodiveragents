/**
 * validate-routing.test.js
 *
 * Static integrity tests for the behavioral routing eval fixture.
 * Concern: is the fixture itself trustworthy enough to score a model against?
 *
 * These tests are purely static — no LLM calls, no API cost. They do NOT
 * measure routing accuracy; that is scripts/eval-routing.mjs, which is
 * opt-in and runs a model against this same fixture.
 *
 * The split matters: a routing eval whose fixture has drifted (expects a
 * deleted agent, covers only easy cases, contradicts the routing table)
 * produces a number that looks like a measurement and is not one. These
 * tests are the gate on that.
 *
 * Checks:
 * 1. Fixture parses and declares a version
 * 2. Every `expect` resolves to a real agent slug
 * 3. Case ids are unique; task text is unique and substantive
 * 4. Every agent in agents/ is the expected answer for at least one case
 * 5. Every case carries at least one tag from the declared vocabulary
 * 6. Conflict cases cite a rule and name a plausible competing agent
 * 7. The fixture retains enough hard cases to stay discriminating
 * 8. Every agent named in the routing_source sections still exists
 * 9. Canonical cases are forced by a verbatim anchor in the routing context
 *    the eval feeds the model; judgment cases name the contested alternative
 * 10. The committed eval baseline was recorded against this exact fixture
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { AGENTS_DIR, ROOT } from './helpers.js'
import { routingContext } from '../scripts/routing-context.mjs'

const FIXTURE_PATH = join(ROOT, 'test', 'fixtures', 'routing-cases.json')

const ALL_SLUGS = new Set(
  readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
)

// Minimum share of cases that must be hard (conflict or residual). A fixture
// that decays into all-direct cases scores ~100% on any model and stops
// telling you anything — this is the guard against that decay.
const MIN_HARD_CASE_RATIO = 0.5
const MIN_TASK_LENGTH = 20

// Cap on author-judgment cases. The headline score should be dominated by
// cases the routing table forces — otherwise it mostly measures agreement
// with the fixture author.
const MAX_JUDGMENT_RATIO = 0.25

// ─── 1. Fixture loads ────────────────────────────────────────────────────────

describe('routing fixture: structural integrity', () => {
  test('fixture file exists', () => {
    assert.ok(existsSync(FIXTURE_PATH), 'test/fixtures/routing-cases.json is missing')
  })

  test('fixture is valid JSON with a version and a cases array', () => {
    const f = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    assert.equal(typeof f.version, 'number', 'fixture must declare a numeric version')
    assert.ok(Array.isArray(f.cases), 'fixture must have a cases array')
    assert.ok(f.cases.length > 0, 'fixture must have at least one case')
  })

  test('fixture declares its routing_source and tag_vocabulary', () => {
    const f = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    assert.ok(Array.isArray(f.routing_source) && f.routing_source.length > 0,
      'fixture must declare which routing tables it is testing')
    assert.ok(Array.isArray(f.tag_vocabulary) && f.tag_vocabulary.length > 0,
      'fixture must declare its tag vocabulary')
  })
})

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
const TAGS = new Set(fixture.tag_vocabulary)

// ─── 2-3. Per-case validity ──────────────────────────────────────────────────

describe('routing fixture: every case is well-formed', () => {
  for (const c of fixture.cases) {
    test(c.id + ' — expects a real agent slug', () => {
      assert.ok(ALL_SLUGS.has(c.expect),
        `${c.id}: expects "${c.expect}", which is not an agent file.\n` +
        `Valid slugs: ${[...ALL_SLUGS].sort().join(', ')}`)
    })

    test(c.id + ' — has substantive task text', () => {
      assert.equal(typeof c.task, 'string', `${c.id}: task must be a string`)
      assert.ok(c.task.trim().length >= MIN_TASK_LENGTH,
        `${c.id}: task text is ${c.task.trim().length} chars, minimum is ${MIN_TASK_LENGTH}. ` +
        `Terse cases test keyword matching, not routing judgment.`)
    })

    test(c.id + ' — has a stated rationale', () => {
      assert.ok(typeof c.why === 'string' && c.why.trim().length > 0,
        `${c.id}: every case needs a "why" — an expected answer nobody can justify is not a test, it is a guess`)
    })

    test(c.id + ' — tags are all in the declared vocabulary', () => {
      assert.ok(Array.isArray(c.tags) && c.tags.length > 0, `${c.id}: needs at least one tag`)
      const unknown = c.tags.filter(t => !TAGS.has(t))
      assert.deepEqual(unknown, [],
        `${c.id}: unknown tags ${unknown.join(', ')}. Vocabulary: ${[...TAGS].join(', ')}`)
    })
  }
})

describe('routing fixture: no duplicates', () => {
  test('case ids are unique', () => {
    const ids = fixture.cases.map(c => c.id)
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
    assert.deepEqual([...new Set(dupes)], [], `duplicate case ids: ${[...new Set(dupes)].join(', ')}`)
  })

  test('task text is unique', () => {
    const norm = fixture.cases.map(c => c.task.trim().toLowerCase())
    const dupes = norm.filter((t, i) => norm.indexOf(t) !== i)
    assert.deepEqual([...new Set(dupes)], [],
      `duplicate task text — duplicated cases inflate the score without adding coverage`)
  })
})

// ─── 4. Coverage ─────────────────────────────────────────────────────────────

describe('routing fixture: fleet coverage', () => {
  test('every agent is the expected answer for at least one case', () => {
    const covered = new Set(fixture.cases.map(c => c.expect))
    const missing = [...ALL_SLUGS].filter(s => !covered.has(s)).sort()
    assert.deepEqual(missing, [],
      `agents with no routing case: ${missing.join(', ')}.\n` +
      `Adding an agent without adding a routing case means its routing is unmeasured.`)
  })
})

// ─── 5. Discriminating power ─────────────────────────────────────────────────

describe('routing fixture: stays discriminating', () => {
  test(`at least ${MIN_HARD_CASE_RATIO * 100}% of cases are conflict or residual`, () => {
    const hard = fixture.cases.filter(c => c.tags.includes('conflict') || c.tags.includes('residual'))
    const ratio = hard.length / fixture.cases.length
    assert.ok(ratio >= MIN_HARD_CASE_RATIO,
      `only ${hard.length}/${fixture.cases.length} (${(ratio * 100).toFixed(0)}%) cases are hard. ` +
      `Minimum is ${MIN_HARD_CASE_RATIO * 100}%. Easy cases pass on any model and measure nothing.`)
  })

  test('every conflict case names the reading it beats', () => {
    // A conflict case is only useful if the competing answer is identifiable —
    // otherwise a wrong model answer cannot be attributed to a specific
    // boundary. Two accepted forms: cite a numbered Conflict Resolution rule
    // in `why`, or use the `<winner>-not-<loser>` id convention.
    const conflicts = fixture.cases.filter(c => c.tags.includes('conflict'))
    const unattributable = conflicts.filter(c => {
      if (/rule \d/i.test(c.why)) return false
      const m = c.id.match(/^conflict-([a-z]+)-not-([a-z]+)-\d+$/)
      return !(m && ALL_SLUGS.has('ndv-' + m[1]) && ALL_SLUGS.has('ndv-' + m[2]))
    })
    assert.deepEqual(unattributable.map(c => c.id), [],
      `conflict cases that name neither a rule nor a competing agent: ${unattributable.map(c => c.id).join(', ')}.\n` +
      `Use id form conflict-<winner>-not-<loser>-NN, or cite "Rule N" in why.`)
  })

  test('conflict case ids that name a loser do not expect that loser', () => {
    const mismatched = fixture.cases
      .filter(c => c.tags.includes('conflict'))
      .map(c => ({ c, m: c.id.match(/^conflict-([a-z]+)-not-([a-z]+)-\d+$/) }))
      .filter(({ c, m }) => m && (c.expect !== 'ndv-' + m[1] || c.expect === 'ndv-' + m[2]))
    assert.deepEqual(mismatched.map(({ c }) => c.id), [],
      `case id contradicts its own expected answer — the id says which agent should win`)
  })

  test('conflict coverage spans at least 6 distinct expected agents', () => {
    const agents = new Set(fixture.cases.filter(c => c.tags.includes('conflict')).map(c => c.expect))
    assert.ok(agents.size >= 6,
      `conflict cases resolve to only ${agents.size} distinct agents. ` +
      `Concentrated conflict coverage tests one boundary repeatedly, not the table.`)
  })
})

// ─── 6. Routing tables the fixture claims to test still exist ────────────────

describe('routing fixture: declared routing sources resolve', () => {
  for (const src of fixture.routing_source) {
    const [file] = src.split('#')
    test(`${src} — source file exists`, () => {
      assert.ok(existsSync(join(ROOT, file)), `routing_source names ${file}, which does not exist`)
    })
  }

  test('every agent slug in the fixture appears in CLAUDE.md routing table', () => {
    const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
    const expected = [...new Set(fixture.cases.map(c => c.expect))]
    const absent = expected.filter(slug => !claudeMd.includes(slug)).sort()
    assert.deepEqual(absent, [],
      `agents expected by the fixture but absent from CLAUDE.md: ${absent.join(', ')}.\n` +
      `A model reading CLAUDE.md cannot route to an agent the file never names.`)
  })
})

// ─── 7. Canonical vs judgment basis ──────────────────────────────────────────
//
// A wrong expected answer never fails a test — it marks a correct model wrong
// and prompts a "fix" to a routing table that was right. The basis split keeps
// those two failure sources apart: canonical misses indict the table or the
// model, judgment misses indict the fixture first.

describe('routing fixture: canonical vs judgment basis', () => {
  const BASES = new Set(fixture.basis_vocabulary ?? [])
  const { text: context } = routingContext(ROOT)
  const contextLines = context.split('\n')

  test('fixture declares basis_vocabulary as canonical + judgment', () => {
    assert.deepEqual([...BASES].sort(), ['canonical', 'judgment'])
  })

  test('routing context is extractable from CLAUDE.md', () => {
    assert.ok(context.length > 0,
      'could not extract ## Routing Table and ## Conflict Resolution from CLAUDE.md — anchors cannot be verified')
  })

  for (const c of fixture.cases) {
    test(c.id + ' — declares a valid basis', () => {
      assert.ok(BASES.has(c.basis), `${c.id}: basis "${c.basis}" is not one of ${[...BASES].join(', ')}`)
    })

    if (c.basis === 'canonical') {
      test(c.id + ' — canonical anchor appears on a routing line that names the expected agent', () => {
        assert.ok(typeof c.anchor === 'string' && c.anchor.length > 0,
          `${c.id}: canonical cases must carry an anchor`)
        const lines = contextLines.filter(l => l.includes(c.anchor))
        assert.ok(lines.length > 0,
          `${c.id}: anchor ${JSON.stringify(c.anchor)} is not in the routing context the eval sends the model. ` +
          `Either the routing table changed, or this case is judgment, not canonical.`)
        assert.ok(lines.some(l => l.includes(c.expect)),
          `${c.id}: anchor ${JSON.stringify(c.anchor)} exists, but no line containing it names ${c.expect}. ` +
          `Lines found:\n${lines.map(l => '  ' + l.trim()).join('\n')}`)
      })
    }

    if (c.basis === 'judgment') {
      test(c.id + ' — judgment case names a real contested alternative', () => {
        assert.ok(ALL_SLUGS.has(c.contest), `${c.id}: contest "${c.contest}" is not a real agent slug`)
        assert.notEqual(c.contest, c.expect, `${c.id}: contest must differ from expect`)
      })
    }
  }

  test(`judgment cases are at most ${MAX_JUDGMENT_RATIO * 100}% of the fixture`, () => {
    const judgment = fixture.cases.filter(c => c.basis === 'judgment')
    const ratio = judgment.length / fixture.cases.length
    assert.ok(ratio <= MAX_JUDGMENT_RATIO,
      `${judgment.length}/${fixture.cases.length} (${(ratio * 100).toFixed(0)}%) cases are judgment. ` +
      `Above ${MAX_JUDGMENT_RATIO * 100}% the score mostly measures agreement with the fixture author.`)
  })
})

// ─── 8. Eval baseline matches this fixture ───────────────────────────────────
//
// `npm run eval:gate` compares a release candidate against
// routing-baseline.json. A baseline recorded against a different fixture
// compares different tests, so the gate reports INCONCLUSIVE — at release
// time. Catching the mismatch here moves that discovery to the PR that
// edited the fixture: re-run `npm run eval:baseline` and commit the result.

describe('routing fixture: eval baseline is current', () => {
  const BASELINE_PATH = join(ROOT, 'test', 'fixtures', 'routing-baseline.json')
  // Must match the fingerprint in scripts/eval-gate.mjs.
  const fixtureSha = createHash('sha256').update(readFileSync(FIXTURE_PATH, 'utf8')).digest('hex').slice(0, 16)

  test('routing-baseline.json exists', () => {
    assert.ok(existsSync(BASELINE_PATH), 'test/fixtures/routing-baseline.json is missing — run npm run eval:baseline')
  })

  const baselineFile = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : { models: {} }

  test('baseline records at least one model', () => {
    assert.ok(Object.keys(baselineFile.models ?? {}).length > 0, 'baseline has no models')
  })

  for (const [model, b] of Object.entries(baselineFile.models ?? {})) {
    test(`${model} — baseline was recorded against the current fixture`, () => {
      assert.equal(b.fixture_sha, fixtureSha,
        `${model}: baseline fixture_sha ${b.fixture_sha} ≠ current ${fixtureSha}. ` +
        `The fixture changed after the baseline was recorded — run npm run eval:baseline and commit routing-baseline.json.`)
    })

    test(`${model} — baseline carries a canonical floor and an escalation ceiling`, () => {
      assert.equal(typeof b.canonical?.floor, 'number', `${model}: canonical.floor missing`)
      assert.equal(typeof b.escalation?.ceiling, 'number', `${model}: escalation.ceiling missing`)
      assert.ok(b.runs >= 1, `${model}: baseline must come from at least one run`)
    })
  }
})
