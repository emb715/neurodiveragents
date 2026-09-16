/**
 * validate-flow-protocol.test.js
 *
 * Structural tests for the orchestration protocol in agents/ndv-flow.md.
 * Concern: Flow is a state machine written in prose. These tests gate the
 * parts of it that are mechanically checkable, so drift fails CI instead of
 * failing silently at dispatch time.
 *
 * Purely static — no LLM calls, no API cost. They verify the protocol is
 * internally consistent and complete; they do not verify a model obeys it.
 *
 * Checks:
 * 1. Flow's routing table names every agent in the fleet except itself
 * 2. Conflict Resolution rules are contiguously numbered from 1
 * 3. The sentinel token is declared and used in one consistent form
 * 4. The sub-agent return contract declares a numeric word cap
 * 5. Handoff emit grammar and handoff parse grammar agree
 * 6. The handoff ledger declares its status vocabulary and failure state
 * 7. BRIEF_REJECTED has a declared escalation path with a bounded retry count
 * 8. Parallel Safety Algorithm specifies overlap detection and serialization
 * 9. Named cross-references resolve to real sections
 * 10. Flow's routing table and CLAUDE.md's agree on agent coverage and on a
 *     declared set of high-value routing signals
 * 11. What ships agrees with what is measured: CLAUDE.md's managed block is
 *     byte-identical to NDV_BLOCK, and the Copilot header has the same
 *     routing rows
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENTS_DIR, ROOT, parseFrontmatter, readAgent } from './helpers.js'

const FLOW = readAgent('ndv-flow')
const { body } = parseFrontmatter(FLOW, 'ndv-flow.md')

const ALL_SLUGS = new Set(
  readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
)

function section(name) {
  const m = body.match(new RegExp('(?:^|\n)## ' + name + '([\\s\\S]*?)(?=\n## |$)'))
  return m ? m[1] : ''
}

// Fenced code blocks hold templates and examples — they are the literal
// contract text in this file, so most checks need them. `prose` is for
// checks that must not match an example.
const prose = body.replace(/```[\s\S]*?```/g, '')

// ─── 1. Routing table covers the fleet ───────────────────────────────────────

describe('flow protocol: routing table coverage', () => {
  const table = section('Routing Table')

  test('Routing Table section exists', () => {
    assert.ok(table.length > 0, 'ndv-flow.md has no ## Routing Table section')
  })

  test('routing table names every agent except ndv-flow itself', () => {
    const named = new Set(table.match(/ndv-[a-z]+/g) ?? [])
    const missing = [...ALL_SLUGS].filter(s => s !== 'ndv-flow' && !named.has(s)).sort()
    assert.deepEqual(missing, [],
      `agents absent from Flow's routing table: ${missing.join(', ')}.\n` +
      `Flow cannot dispatch to an agent its own table never names.`)
  })

  test('routing table does not name ndv-flow (no self-dispatch)', () => {
    assert.ok(!/ndv-flow/.test(table), 'Flow routing table names ndv-flow — self-dispatch is a loop')
  })

  test('every slug named anywhere in ndv-flow.md resolves to a real agent', () => {
    const named = [...new Set(body.match(/ndv-[a-z]+/g) ?? [])]
    const invalid = named.filter(s => !ALL_SLUGS.has(s)).sort()
    assert.deepEqual(invalid, [], `ndv-flow.md names non-existent agents: ${invalid.join(', ')}`)
  })
})

// ─── 2. Conflict Resolution numbering ────────────────────────────────────────

describe('flow protocol: conflict resolution', () => {
  const cr = section('Conflict Resolution[^\\n]*')

  test('Conflict Resolution section exists', () => {
    assert.ok(cr.length > 0, 'ndv-flow.md has no ## Conflict Resolution section')
  })

  test('rules are contiguously numbered from 1', () => {
    const nums = (cr.match(/^\d+\./gm) ?? []).map(n => parseInt(n, 10))
    assert.ok(nums.length >= 2, 'Conflict Resolution needs at least two ordered rules')
    const expected = Array.from({ length: nums.length }, (_, i) => i + 1)
    assert.deepEqual(nums, expected,
      `Conflict Resolution rules are numbered ${nums.join(',')} — must be contiguous from 1, ` +
      `because the section header says "use highest-priority match" and a gap makes priority ambiguous`)
  })

  test('every rule number cited by the routing fixture exists', () => {
    // Keeps routing-cases.json honest: a case citing "Rule 6" must have a
    // Rule 6 to cite. Renumbering Conflict Resolution without updating the
    // fixture would otherwise leave cases justified by a rule that is gone.
    const nums = (cr.match(/^\d+\./gm) ?? []).map(n => parseInt(n, 10))
    const max = Math.max(...nums)

    const fixture = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'routing-cases.json'), 'utf8'))
    const cited = fixture.cases.flatMap(c =>
      [...c.why.matchAll(/rule (\d+)/gi)].map(m => ({ id: c.id, rule: parseInt(m[1], 10) })))

    const dangling = cited.filter(({ rule }) => rule < 1 || rule > max)
    assert.deepEqual(dangling, [],
      `routing fixture cites Conflict Resolution rules that do not exist ` +
      `(ndv-flow.md defines 1-${max}): ${dangling.map(d => d.id + ' → Rule ' + d.rule).join(', ')}`)
  })
})

// ─── 3-4. Sentinel and return contract ───────────────────────────────────────

describe('flow protocol: sentinel discipline', () => {
  test('the sentinel token is declared in canonical form', () => {
    assert.match(body, /TASK_\[ID\]_COMPLETE/,
      'ndv-flow.md must declare the sentinel as TASK_[ID]_COMPLETE')
  })

  test('the brief template binds the sentinel with an exactness instruction', () => {
    assert.match(body, /End with exactly:\s*TASK_\[ID\]_COMPLETE/,
      'the brief template must say "End with exactly: TASK_[ID]_COMPLETE" — ' +
      'without the exactness clause the sentinel is unparseable')
  })

  test('sentinel references use one consistent token form', () => {
    // Catches TASK_COMPLETE / TASK_{ID}_COMPLETE / TASKID_COMPLETE drift.
    const variants = [...new Set(body.match(/TASK[_\[{][^\s`]*COMPLETE/g) ?? [])]
    assert.deepEqual(variants, ['TASK_[ID]_COMPLETE'],
      `multiple sentinel token forms present: ${variants.join(', ')}. ` +
      `Sub-agents emit what the template says; Flow matches what the protocol says. They must be identical.`)
  })

  test('the sentinel is referenced by the incomplete-run path', () => {
    assert.match(prose, /no sentinel/i,
      'ndv-flow.md must state what happens when no sentinel arrives')
  })

  test('the return contract declares a numeric word cap', () => {
    assert.match(body, /Max \d+ words/,
      'the brief template must cap sub-agent return length numerically — ' +
      'an uncapped return inflates Flow context and voids the token claim')
  })
})

// ─── 5. Handoff grammar consistency ──────────────────────────────────────────

describe('flow protocol: handoff grammar', () => {
  test('the emit grammar is declared in the Dispatch Protocol', () => {
    assert.match(body, /Handoff format \(emit BEFORE sentinel\):\s*→/,
      'Dispatch Protocol must declare the handoff emit format')
  })

  test('the parse grammar is declared in the Post-Group Protocol', () => {
    const pg = section('Post-Group Protocol[^\\n]*')
    assert.ok(pg.length > 0, 'ndv-flow.md has no ## Post-Group Protocol section')
    assert.match(pg, /→ \[agent\]/, 'Post-Group Protocol must declare how handoff lines are parsed')
  })

  test('emit and parse grammars agree on arrow and field separator', () => {
    // The real bug this catches: someone edits the emit template and not the
    // parser spec, and every handoff silently stops being routed.
    const emit = body.match(/Handoff format \(emit BEFORE sentinel\): (.+)/)?.[1] ?? ''
    const pg = section('Post-Group Protocol[^\\n]*')
    const parse = pg.match(/parse every `(→ \[agent\][^`]*)`/)?.[1] ?? ''

    assert.ok(emit.length > 0, 'could not locate the handoff emit grammar')
    assert.ok(parse.length > 0, 'could not locate the handoff parse grammar')

    for (const token of ['→', '·', '[agent]']) {
      assert.ok(emit.includes(token), `emit grammar is missing ${token}: ${emit}`)
      assert.ok(parse.includes(token), `parse grammar is missing ${token}: ${parse}`)
    }
  })
})

// ─── 6. Handoff ledger ───────────────────────────────────────────────────────

describe('flow protocol: handoff ledger', () => {
  test('the ledger line declares its status vocabulary', () => {
    const ledger = body.match(/\[agent\] ← \[task ID\].*status:\s*(.+)/)?.[1] ?? ''
    assert.ok(ledger.length > 0, 'ndv-flow.md has no handoff ledger line')
    for (const status of ['dispatched', 'pending']) {
      assert.ok(ledger.includes(status), `ledger status vocabulary is missing "${status}": ${ledger}`)
    }
  })

  test('pending is declared a failure state', () => {
    assert.match(prose, /status `pending` is a failure state|pending is a failure state/,
      'the ledger must declare that a pending handoff is a failure state')
  })

  test('What Flow Never Does prohibits completing with a pending handoff', () => {
    const never = section('What Flow Never Does')
    assert.ok(never.length > 0, 'ndv-flow.md has no ## What Flow Never Does section')
    assert.match(never, /complete while any handoff has status `pending`/,
      'the pending-handoff prohibition must be listed under What Flow Never Does')
  })
})

// ─── 7. BRIEF_REJECTED escalation ────────────────────────────────────────────

describe('flow protocol: BRIEF_REJECTED escalation', () => {
  test('the rejection format is declared in the brief template', () => {
    assert.match(body, /BRIEF_REJECTED: \[missing field\]/,
      'the brief template must declare the BRIEF_REJECTED response format')
  })

  test('the escalation path bounds the retry count', () => {
    const esc = body.match(/\*\*On BRIEF_REJECTED:\*\*[\s\S]*?(?=\n\*\*|\n## )/)?.[0] ?? ''
    assert.ok(esc.length > 0, 'ndv-flow.md has no **On BRIEF_REJECTED:** escalation block')
    assert.match(esc, /second time|twice/i, 'escalation must define what happens on the second rejection')
    assert.match(esc, /Third rejection|third/i,
      'escalation must define a terminal state — an unbounded retry loop is a hang, not a protocol')
  })
})

// ─── 8. Parallel safety ──────────────────────────────────────────────────────

describe('flow protocol: parallel safety', () => {
  const ps = section('Parallel Safety Algorithm')

  test('Parallel Safety Algorithm section exists', () => {
    assert.ok(ps.length > 0, 'ndv-flow.md has no ## Parallel Safety Algorithm section')
  })

  test('the algorithm keys on file overlap', () => {
    assert.match(ps, /overlap|intersect|same file|shared/i,
      'parallel safety must be defined in terms of file overlap between tasks')
  })

  test('overlapping tasks are serialized, not merely flagged', () => {
    assert.match(ps, /sequential|serial/i,
      'the algorithm must state that overlapping tasks run sequentially — ' +
      'detecting an overlap without serializing it is a concurrent-write bug')
  })
})

// ─── 9. Cross-reference integrity ────────────────────────────────────────────

describe('flow protocol: named cross-references resolve', () => {
  test('every "see X" reference names a real section or subsection', () => {
    const headers = new Set([
      ...(body.match(/^## (.+)$/gm) ?? []).map(h => h.replace(/^## /, '').trim().toLowerCase()),
      ...(body.match(/^\*\*(.+?)[:—]/gm) ?? []).map(h => h.replace(/^\*\*/, '').trim().toLowerCase()),
    ])
    const refs = [...new Set((body.match(/\(see ([A-Z][^)]+)\)/g) ?? [])
      .map(r => r.replace(/\(see /, '').replace(/\)$/, '').trim().toLowerCase()))]

    const unresolved = refs.filter(r => ![...headers].some(h => h.startsWith(r) || r.startsWith(h)))
    assert.deepEqual(unresolved, [],
      `cross-references with no matching section: ${unresolved.join(', ')}.\n` +
      `Sections present: ${[...headers].join(' | ')}`)
  })

  test('every protocol named in What Flow Never Does exists as a section', () => {
    const never = section('What Flow Never Does')
    const named = [...new Set((never.match(/[A-Z][a-z]+(?:-[A-Z][a-z]+)? [Pp]rotocol/g) ?? [])
      .map(s => s.toLowerCase()))]
    const headers = (body.match(/^## (.+)$/gm) ?? []).map(h => h.toLowerCase())
    const unresolved = named.filter(n => !headers.some(h => h.includes(n.replace(/ protocol$/, ''))))
    assert.deepEqual(unresolved, [],
      `What Flow Never Does references protocols with no section: ${unresolved.join(', ')}`)
  })
})

// ─── 10. Router parity: ndv-flow.md vs CLAUDE.md ─────────────────────────────
//
// Two routing tables ship: CLAUDE.md routes the host model, ndv-flow.md routes
// Flow's dispatches. They are allowed to word signals differently — Flow's
// table carries dispatch-specific detail. They are NOT allowed to disagree on
// which agents exist, or to let the host router go missing a signal the
// dispatcher has: that makes the same task route two different ways depending
// on who read it.
//
// Verbatim equality is deliberately not enforced. SIGNAL_PARITY is the
// maintained list of phrases that must reach both tables.

const SIGNAL_PARITY = [
  { signal: 'ATDD', agent: 'ndv-tester' },
  { signal: 'acceptance tests first', agent: 'ndv-tester' },
  { signal: '"does X exist"', agent: 'ndv-research' },
  { signal: '"find any reference to Z"', agent: 'ndv-research' },
  { signal: 'pipeline investigation', agent: 'ndv-research' },
  { signal: 'a11y', agent: 'ndv-accessibility' },
  { signal: 'N=1/N=10/N=100', agent: 'ndv-build' },
]

function routingTables(md) {
  // CLAUDE.md may carry more than one routing block; every one of them routes
  // some model, so every one is checked.
  return [...md.matchAll(/## Routing Table[\s\S]*?(?=\n## )/g)].map(m => m[0])
}

describe('flow protocol: router parity with CLAUDE.md', () => {
  const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
  const hostTables = routingTables(claudeMd)
  const flowTable = section('Routing Table')

  test('CLAUDE.md contains at least one routing table', () => {
    assert.ok(hostTables.length > 0, 'no ## Routing Table found in CLAUDE.md')
  })

  hostTables.forEach((table, i) => {
    test(`CLAUDE.md routing table #${i + 1} covers the same agents as Flow's`, () => {
      const host = new Set(table.match(/ndv-[a-z]+/g) ?? [])
      const flow = new Set(flowTable.match(/ndv-[a-z]+/g) ?? [])
      // Flow never routes to itself; the host router must be able to.
      flow.add('ndv-flow')
      const missingFromHost = [...flow].filter(a => !host.has(a)).sort()
      const extraInHost = [...host].filter(a => !flow.has(a)).sort()
      assert.deepEqual(missingFromHost, [],
        `agents Flow routes to but CLAUDE.md table #${i + 1} does not: ${missingFromHost.join(', ')}`)
      assert.deepEqual(extraInHost, [],
        `agents in CLAUDE.md table #${i + 1} that Flow cannot dispatch: ${extraInHost.join(', ')}`)
    })
  })

  for (const { signal, agent } of SIGNAL_PARITY) {
    test(`signal parity: ${JSON.stringify(signal)} reaches both routers`, () => {
      const inFlow = flowTable.includes(signal)
      assert.ok(inFlow, `${signal} is not in ndv-flow.md's routing table — remove it from SIGNAL_PARITY or restore it`)
      const missing = hostTables
        .map((t, i) => ({ i: i + 1, has: t.includes(signal) }))
        .filter(t => !t.has)
        .map(t => '#' + t.i)
      assert.deepEqual(missing, [],
        `${JSON.stringify(signal)} routes to ${agent} in ndv-flow.md but is missing from CLAUDE.md routing table(s) ${missing.join(', ')}. ` +
        `The host model would route this task differently than Flow does.`)
    })
  }
})

// ─── 11. Shipped routing text matches the measured routing text ──────────────
//
// The routing eval scores CLAUDE.md. Users never receive this repo's
// CLAUDE.md — `ndv install` writes NDV_BLOCK (Claude/OpenCode) or the Copilot
// header. If those drift from CLAUDE.md, the eval measures a routing table
// that does not ship. CLAUDE.md's <!-- ndv:start/end --> block is the
// installer's own block, so it must match NDV_BLOCK exactly.

describe('flow protocol: shipped routing text matches CLAUDE.md', () => {
  const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
  const binSrc = readFileSync(join(ROOT, 'bin', 'ndv.js'), 'utf8')

  test('CLAUDE.md has one well-formed ndv:start → ndv:end block', () => {
    const starts = [...claudeMd.matchAll(/<!-- ndv:start -->/g)].map(m => m.index)
    const ends = [...claudeMd.matchAll(/<!-- ndv:end -->/g)].map(m => m.index)
    assert.equal(starts.length, 1, `expected one ndv:start marker, found ${starts.length}`)
    assert.equal(ends.length, 1, `expected one ndv:end marker, found ${ends.length}`)
    assert.ok(starts[0] < ends[0], 'ndv:start must come before ndv:end')
  })

  test('CLAUDE.md managed block is byte-identical to NDV_BLOCK', async () => {
    const { NDV_BLOCK } = await import(join(ROOT, 'bin', 'ndv.js'))
    const start = claudeMd.indexOf('<!-- ndv:start -->')
    const end = claudeMd.indexOf('<!-- ndv:end -->') + '<!-- ndv:end -->'.length
    assert.equal(claudeMd.slice(start, end), NDV_BLOCK,
      'CLAUDE.md\'s ndv block differs from NDV_BLOCK in bin/ndv.js. Edit the routing table in both, ' +
      'or the eval measures text that `ndv install` does not ship.')
  })

  test('Copilot header routing rows match NDV_BLOCK (backticks aside)', async () => {
    // Copilot renders agent names without code spans; otherwise the rows must
    // be the same, so Copilot users get the same routing as Claude/OpenCode.
    const { NDV_BLOCK } = await import(join(ROOT, 'bin', 'ndv.js'))
    const at = binSrc.indexOf('# neurodiveragents — Copilot Instructions')
    assert.ok(at !== -1, 'Copilot header not found in bin/ndv.js')
    const header = binSrc.slice(at, binSrc.indexOf('<!-- ndv:end -->', at))
    const rows = text => (text.match(/^\| (?!When the task|-).*$/gm) ?? []).map(r => r.replace(/`/g, ''))
    const shipped = rows(NDV_BLOCK.slice(0, NDV_BLOCK.indexOf('## Proactive Application')))
    assert.ok(shipped.length > 0, 'no routing rows found in NDV_BLOCK')
    assert.deepEqual(rows(header), shipped,
      'Copilot header routing table differs from NDV_BLOCK — update both templates in bin/ndv.js together')
  })
})
