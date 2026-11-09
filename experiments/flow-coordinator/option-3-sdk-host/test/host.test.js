// Deterministic tests for the option-3 host: a scripted model, no tokens.
// Run: npm test (inside experiments/flow-coordinator/option-3-sdk-host)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Host, TOOL_SPECS } from '../src/host.js'
import { ScriptedRunner } from '../src/runners/scripted.js'
import { readReply, parseHandoffs, parseFiles } from '../src/protocol.js'
import { agentTools, DEFAULT_AGENTS_DIR } from '../src/prompts.js'
import { createWorktree } from '../src/worktree.js'
import { hostBlocks, adapterBody } from '../../adapter/assemble.mjs'

const HOUR = 3_600_000
const done = (id, body = 'Did the work.', extra = '') => `${body}\nFILES: src/a.ts\n${extra}\nTASK_${id}_COMPLETE`

function setup({ coordinator, worker, ...opts } = {}) {
  const storeDir = mkdtempSync(join(tmpdir(), 'ndv-host-'))
  const clock = { t: 1_000_000 }
  const runner = new ScriptedRunner({ coordinator, worker })
  const posts = []
  const decisions = []
  const host = new Host({
    storeDir, runner, worktrees: false, now: () => clock.t, coordinatorPrompt: 'test prompt',
    surface: { post: t => posts.push(t), askDecision: d => decisions.push(d) },
    ...opts,
  })
  return { host, runner, clock, posts, decisions, storeDir, cleanup: () => rmSync(storeDir, { recursive: true, force: true }) }
}

// A worker that waits until the test releases it.
function gate() {
  const waiting = new Map()
  return {
    worker: ({ id }) => new Promise(res => waiting.set(id, res)),
    release: (id, text) => { waiting.get(id)(text); waiting.delete(id) },
    waiting,
  }
}

const tick = () => new Promise(r => setImmediate(r))
const until = async cond => { while (!cond()) await tick() }

// ─── protocol ────────────────────────────────────────────────────────────────

test('protocol: reads all three handoff shapes, the file line and the sentinel', () => {
  const text = [
    'Summary line.',
    '→ ndv-secure (vulnerability) · src/auth/reset.ts: tokens never expire',
    '-> ndv-tester (coverage) · src/x.ts: no tests',
    '**Handoff → ndv-diagnose (root cause):** crash in parser',
    'FILES: `src/a.ts`, src/b.ts.',
    'TASK_4_COMPLETE',
  ].join('\n')
  const hs = parseHandoffs(text)
  assert.deepEqual(hs.map(h => h.agent), ['ndv-secure', 'ndv-tester', 'ndv-diagnose'])
  assert.equal(hs[0].location, 'src/auth/reset.ts')
  assert.equal(hs[0].description, 'tokens never expire')
  assert.match(hs[2].description, /crash in parser/)
  assert.deepEqual(parseFiles(text), ['src/a.ts', 'src/b.ts'])
  const r = readReply(text, '4')
  assert.equal(r.complete, true)
  assert.equal(r.summary, 'Summary line.')
  assert.equal(readReply(text, '5').complete, false, 'another task\'s sentinel does not close this one')
})

test('protocol: a worker\'s tools are its agent file\'s tools list', () => {
  assert.deepEqual(agentTools(DEFAULT_AGENTS_DIR, 'ndv-flow'), ['Read', 'Glob', 'Task'])
})

// ─── context discipline ──────────────────────────────────────────────────────

test('the coordinator never sees more than the capped summary of a reply', async () => {
  const long = Array.from({ length: 260 }, (_, i) => (i === 250 ? 'TAILMARKER' : 'word')).join(' ')
  const { host, runner, cleanup } = setup({
    coordinator: async ({ call, wake }) => {
      if (wake === 1) await call('start_thread', { agent: 'ndv-build', brief: 'Do X', files: ['src/a.ts'] })
    },
    worker: ({ id }) => done(id, long),
  })
  host.chat('go')
  await host.idle()
  const finished = runner.wakes.find(w => w.startsWith('EVENT: thread-finished'))
  assert.ok(finished, 'a thread-finished wake happened')
  assert.doesNotMatch(finished, /TAILMARKER/)
  assert.doesNotMatch(runner.wakes.join('\n'), /Do X\n\nYou are working in a thread/, 'the brief footer never echoes back')
  cleanup()
})

// ─── file ownership ──────────────────────────────────────────────────────────

test('overlapping files: the second thread is queued, then starts by itself', async () => {
  const g = gate()
  const replies = []
  const { host, runner, cleanup } = setup({
    coordinator: async ({ call, wake }) => {
      if (wake === 1) {
        replies.push(await call('start_thread', { agent: 'ndv-build', brief: 'A', files: ['src/auth/reset.ts'] }))
        replies.push(await call('start_thread', { agent: 'ndv-secure', brief: 'B', files: ['src/auth/reset.ts', 'src/x.ts'] }))
      }
    },
    worker: g.worker,
  })
  host.chat('two tasks, same file')
  await until(() => replies.length === 2)
  assert.match(replies[1], /QUEUED T2 behind T1 \(shared: src\/auth\/reset\.ts\)/)
  assert.equal(runner.workerCalls.length, 1, 'only T1 runs')
  assert.equal(host.ledger.get('2').state, 'queued')
  g.release('1', done('1'))
  while (!g.waiting.has('2')) await tick()
  assert.equal(host.ledger.get('1').state, 'done')
  assert.equal(host.ledger.get('2').state, 'in-flight')
  g.release('2', done('2'))
  await host.idle()
  assert.equal(host.ledger.get('2').state, 'done')
  assert.match(runner.wakes.join('\n'), /Started from the queue since your last wake: T2/)
  cleanup()
})

test('a task with no stated files owns every file', async () => {
  const g = gate()
  const replies = []
  const { host, cleanup } = setup({
    coordinator: async ({ call, wake }) => {
      if (wake === 1) {
        await call('start_thread', { agent: 'ndv-research', brief: 'look around' })
        replies.push(await call('start_thread', { agent: 'ndv-build', brief: 'B', files: ['src/z.ts'] }))
      }
    },
    worker: g.worker,
  })
  host.chat('go')
  await until(() => replies.length === 1)
  assert.match(replies[0], /QUEUED T2 behind T1/)
  host.stop()
  cleanup()
})

test('a thread steered onto new files widens its row, and a task needing them waits', async () => {
  const g = gate()
  const replies = []
  const { host, cleanup } = setup({
    coordinator: async ({ call, prompt }) => {
      if (prompt.includes('EVENT: chat')) await call('start_thread', { agent: 'ndv-build', brief: 'A', files: ['src/a.ts'] })
      if (prompt.includes('EVENT: thread-replied')) {
        replies.push(await call('start_thread', { agent: 'ndv-refactor', brief: 'B', files: ['src/b.ts'] }))
      }
    },
    worker: g.worker,
  })
  host.chat('go')
  while (!g.waiting.has('1')) await tick()
  // The person told T1 to also change b.ts; its reply says so but does not finish.
  g.release('1', 'Also updating b.ts as asked.\nFILES: src/a.ts, src/b.ts')
  await host.idle()
  assert.deepEqual(host.ledger.get('1').files, ['src/a.ts', 'src/b.ts'])
  assert.match(replies[0], /QUEUED T2 behind T1 \(shared: src\/b\.ts\)/)
  cleanup()
})

test('the thread limit queues, and a free slot starts the queued thread', async () => {
  const g = gate()
  const { host, cleanup } = setup({
    maxThreads: 1,
    coordinator: async ({ call, wake }) => {
      if (wake === 1) {
        await call('start_thread', { agent: 'ndv-build', brief: 'A', files: ['a'] })
        await call('start_thread', { agent: 'ndv-build', brief: 'B', files: ['b'] })
      }
    },
    worker: g.worker,
  })
  host.chat('go')
  await until(() => host.ledger.rows.length === 2)
  assert.equal(host.ledger.get('2').note, 'thread limit')
  g.release('1', done('1'))
  while (!g.waiting.has('2')) await tick()
  g.release('2', done('2'))
  await host.idle()
  cleanup()
})

// ─── handoffs, rejections, decisions ─────────────────────────────────────────

test('a handoff in a finished reply reaches the coordinator and the ledger', async () => {
  const { host, runner, cleanup } = setup({
    coordinator: async ({ call, wake }) => {
      if (wake === 1) await call('start_thread', { agent: 'ndv-build', brief: 'A', files: ['src/a.ts'] })
    },
    worker: ({ id }) => done(id, 'Built it.', '→ ndv-secure (vulnerability) · src/auth/reset.ts: tokens never expire'),
  })
  host.chat('go')
  await host.idle()
  assert.match(runner.wakes[1], /→ ndv-secure \(vulnerability\) · src\/auth\/reset\.ts: tokens never expire/)
  assert.equal(host.ledger.get('1').handoffs[0].agent, 'ndv-secure')
  assert.match(host.ledger.table(), /→ ndv-secure: tokens never expire/)
  cleanup()
})

test('a brief rejected three times closes the row and frees its files', async () => {
  const { host, runner, cleanup } = setup({
    coordinator: async ({ call, prompt, wake }) => {
      if (wake === 1) await call('start_thread', { agent: 'ndv-build', brief: 'A', files: ['src/a.ts'] })
      else if (prompt.includes('thread-rejected')) await call('message_thread', { id: 'T1', text: 'Re-brief with file target src/a.ts' })
    },
    worker: () => 'BRIEF_REJECTED: target files — which file\nTASK_1_COMPLETE',
  })
  host.chat('go')
  await host.idle()
  assert.equal(host.ledger.get('1').state, 'incomplete')
  assert.equal(runner.workerCalls.length, 3)
  assert.equal(runner.workerCalls[1].sessionId, 'worker-T1', 're-brief resumes the same session')
  cleanup()
})

test('a decision goes to the surface and its answer comes back as a wake', async () => {
  const { host, runner, decisions, posts, cleanup } = setup({
    coordinator: async ({ call, prompt }) => {
      if (prompt.includes('EVENT: chat')) await call('request_decision', { question: 'Pick one?', options: ['A', 'B'], recommended: 0 })
      if (prompt.includes('EVENT: decision-answered')) await call('post_message', { text: 'Going with B.' })
    },
  })
  host.chat('go')
  await host.idle()
  assert.equal(decisions[0].id, 1)
  host.answerDecision(1, 'B')
  await host.idle()
  assert.match(runner.wakes[1], /answered decision D1 \("Pick one\?"\): B/)
  assert.deepEqual(posts, ['Going with B.'])
  cleanup()
})

test('save_fact writes the facts file', async () => {
  const { host, storeDir, cleanup } = setup({
    coordinator: async ({ call }) => { await call('save_fact', { fact: 'Unit tests run with pnpm test:unit', source: 'T2' }) },
  })
  host.chat('go')
  await host.idle()
  assert.match(readFileSync(join(storeDir, 'facts.md'), 'utf8'), /pnpm test:unit \(source: T2\)/)
  cleanup()
})

// ─── quiet threads ───────────────────────────────────────────────────────────

test('a quiet thread gets one check-in, then is aborted and marked incomplete', async () => {
  const { host, runner, clock, cleanup } = setup({
    coordinator: async ({ call, prompt, wake }) => {
      if (wake === 1) await call('start_thread', { agent: 'ndv-build', brief: 'A', files: ['src/a.ts'] })
      if (prompt.includes('EVENT: thread-quiet')) await call('message_thread', { id: '1', text: 'Still going?' })
    },
    worker: () => new Promise(() => {}), // stuck forever
  })
  host.chat('go')
  while (runner.workerCalls.length === 0) await tick()
  clock.t += 2 * HOUR
  host.tick()
  host.tick() // a second tick in the same window does not repeat the check-in
  await new Promise(r => setTimeout(r, 10))
  assert.equal(runner.wakes.filter(w => w.startsWith('EVENT: thread-quiet')).length, 1)
  clock.t += 2 * HOUR
  host.tick()
  await host.idle()
  assert.equal(host.ledger.get('1').state, 'incomplete')
  assert.equal(runner.workerCalls.length, 1, 'no second thread on the stuck thread\'s files; the queued check-in is dropped')
  assert.ok(runner.wakes.some(w => w.startsWith('EVENT: thread-incomplete')))
  cleanup()
})

// ─── restart ─────────────────────────────────────────────────────────────────

test('a restart resumes in-flight threads in their own sessions, with no duplicates', async () => {
  const first = setup({
    coordinator: async ({ call, wake }) => {
      if (wake === 1) await call('start_thread', { agent: 'ndv-build', brief: 'A', files: ['src/a.ts'] })
    },
    worker: () => new Promise(() => {}),
  })
  first.host.chat('go')
  while (first.runner.workerCalls.length === 0) await tick()
  first.host.stop() // the process dies mid-thread
  await tick()

  const runner = new ScriptedRunner({ worker: ({ id }) => done(id) })
  const host = new Host({
    storeDir: first.storeDir, runner, worktrees: false, coordinatorPrompt: 'x',
    surface: { post() {}, askDecision() {} },
  })
  assert.deepEqual(host.start(), ['1'])
  await host.idle()
  assert.equal(host.ledger.rows.length, 1)
  assert.equal(runner.workerCalls.length, 1)
  assert.equal(runner.workerCalls[0].sessionId, 'worker-T1')
  assert.match(runner.workerCalls[0].prompt, /host restarted/)
  assert.equal(host.ledger.get('1').state, 'done')
  assert.match(runner.wakes[0], /EVENT: host-restarted/)
  first.cleanup()
})

// ─── worktrees ───────────────────────────────────────────────────────────────

test('each thread gets its own worktree on branch ndv/T<ID>', () => {
  const repo = mkdtempSync(join(tmpdir(), 'ndv-repo-'))
  const store = mkdtempSync(join(tmpdir(), 'ndv-store-'))
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe' }).toString()
  git('init', '-q')
  writeFileSync(join(repo, 'f.txt'), 'x')
  git('add', '.')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')
  const dir = createWorktree(repo, store, '7')
  assert.ok(existsSync(join(dir, 'f.txt')))
  assert.match(git('branch', '--list', 'ndv/T7'), /ndv\/T7/)
  assert.equal(createWorktree(repo, store, '7'), dir, 'a resumed thread reuses its worktree')
  rmSync(repo, { recursive: true, force: true })
  rmSync(store, { recursive: true, force: true })
})

// ─── the adapter and the host agree ──────────────────────────────────────────

test('every action in coordinator.md has a host tool, and the sdk-host binding names it', () => {
  const actions = [...adapterBody().matchAll(/^\| `([a-z_]+)\(/gm)].map(m => m[1])
  assert.deepEqual(actions.sort(), Object.keys(TOOL_SPECS).filter(t => t !== 'read_thread').sort())
  const block = hostBlocks()['sdk-host']
  for (const a of actions) assert.match(block, new RegExp('`mcp__coordinator__' + a + '`'))
})
