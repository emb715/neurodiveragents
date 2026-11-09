// Static checks on the coordinator eval fixture. No model calls.
// Run: node --test experiments/flow-coordinator/eval/cases.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkRegex, scoreOutput } from '../../../scripts/behavior-checks.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const { cases } = JSON.parse(readFileSync(join(HERE, 'coordinator-cases.json'), 'utf8'))

test('ids are unique and every case has input, checks and a why', () => {
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length)
  for (const c of cases) {
    assert.ok(c.input?.includes('EVENT: '), `${c.id}: input is a wake`)
    assert.ok(c.input.includes('LEDGER:'), `${c.id}: input carries the ledger`)
    assert.ok(c.checks?.length, `${c.id}: has checks`)
    assert.ok(c.why, `${c.id}: says why`)
  }
})

test('every check compiles', () => {
  for (const c of cases) for (const ch of c.checks) assert.doesNotThrow(() => checkRegex(ch), `${c.id}: ${ch.pattern}`)
})

test('every case has at least one check that can only pass by acting', () => {
  for (const c of cases) assert.ok(c.checks.some(ch => !ch.absent), `${c.id}: an empty reply must fail`)
})

test('an empty reply fails every case', () => {
  for (const c of cases) assert.equal(scoreOutput(c.checks, '').pass, false, c.id)
})

// One hand-written reply per case that a correct coordinator could give.
// If a check rejects these, the check is wrong, not the coordinator.
const GOOD = {
  'handoff-on-return': 'start_thread(agent=ndv-secure, files=[src/invoices/export.ts], scale=S1, brief="Fix path traversal")',
  'overlap-queues': 'write_ledger(id=new, state=queued, files=[src/auth/reset.ts], note="behind T1")\npost_message(text="Queued behind the security work on that file.")',
  'person-widened-thread': 'write_ledger(id=T1, state=in-flight, files=[src/invoices/export.ts, src/utils/date.ts], note="steered")',
  'silent-thread': 'message_thread(id=T3, text="Still working? Reply with where you are.")',
  'direct-question': 'post_message(text="Run pnpm test:unit. npm test needs a live Postgres.")',
  'one-file-change': 'start_thread(agent=ndv-build, files=[src/components/Header.tsx], scale=S0, brief="Change Save to Submit")',
  'rejected-twice': 'request_decision(question="Which export module: invoices or reports?", options=["src/invoices/export.ts", "src/reports/export.ts"], recommended=0)',
  'conflicting-advice': 'request_decision(question="Keep the session cache for speed or drop it for revocation?", options=["Keep, invalidate on revoke", "Remove"], recommended=0)',
  'plain-report': 'post_message(text="CSV export is done, the filename is sanitised, and 6 tests pass.")',
  'facts-to-memory': 'save_fact(fact="Unit tests run with pnpm test:unit; npm test needs Postgres")\nsave_fact(fact="Invoice totals are integer cents; format at the edge with formatCents()")',
}

test('a correct reply passes every case', () => {
  for (const c of cases) {
    const r = scoreOutput(c.checks, GOOD[c.id] ?? '')
    assert.ok(r.pass, `${c.id}: missed ${r.missed.join('; ')}`)
  }
})
