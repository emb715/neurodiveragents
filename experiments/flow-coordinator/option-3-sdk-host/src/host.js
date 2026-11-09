/**
 * host.js: the event loop around one coordinator and many thread workers.
 *
 * Every input becomes one event. Events reach the coordinator one at a time;
 * each wake gets the event and the ledger, nothing else. Workers run in
 * parallel and report back as events. What the host enforces in code, so the
 * coordinator can't get it wrong:
 *
 *   - a worker's transcript never reaches the coordinator (summary, handoffs, files only)
 *   - two threads never own the same file at once; the second one is queued
 *   - queued threads start by themselves when their files free up
 *   - a quiet thread gets one check-in event, then is aborted and marked incomplete
 *   - a restart resumes in-flight threads from the ledger, never starts them twice
 *
 * The model is behind `runner` (runners/sdk.js for real, runners/scripted.js
 * for tests) and the chat is behind `surface`.
 */

import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Ledger } from './ledger.js'
import { readReply, threadFooter } from './protocol.js'
import * as P from './prompts.js'
import { createWorktree } from './worktree.js'
import { REPO_ROOT } from '../../adapter/assemble.mjs'

// Host-neutral tool specs. runners/sdk.js turns them into MCP tools; the
// scripted runner calls the handlers directly.
export const TOOL_SPECS = {
  start_thread: {
    description: 'Open a thread for one task. The brief is its first message. Files are the files the task owns; leave empty only if the task has no stated scope (it then owns every file).',
    params: {
      agent: { type: 'string', description: 'ndv-* agent slug' },
      brief: { type: 'string', description: 'The full Flow brief' },
      files: { type: 'array', optional: true, description: 'Files this task owns' },
      scale: { type: 'enum', values: ['S0', 'S1', 'S2'], optional: true },
    },
  },
  message_thread: {
    description: 'Write into an existing thread: a re-brief, a check-in, an answer.',
    params: { id: { type: 'string', description: 'Thread ID, e.g. T3 or 3' }, text: { type: 'string' } },
  },
  read_thread: {
    description: "A thread's state, files, summary and handoffs. Never its transcript.",
    params: { id: { type: 'string' } },
  },
  post_message: {
    description: 'Write to the person in the chat. Plain sentences, no ledger vocabulary.',
    params: { text: { type: 'string' } },
  },
  request_decision: {
    description: 'Put one decision in front of the person: two to four options, one recommended.',
    params: {
      question: { type: 'string' },
      options: { type: 'array' },
      recommended: { type: 'number', description: 'Index of the recommended option, from 0' },
    },
  },
  write_ledger: {
    description: 'Add a note to a ledger row, or close it as done or incomplete. Files and queueing are host-owned.',
    params: {
      id: { type: 'string' },
      note: { type: 'string', optional: true },
      state: { type: 'enum', values: ['done', 'incomplete'], optional: true },
    },
  },
  save_fact: {
    description: 'Save one durable project fact a thread reported.',
    params: { fact: { type: 'string' }, source: { type: 'string', optional: true, description: 'Thread ID it came from' } },
  },
}

const HOUR = 60 * 60 * 1000

export class Host {
  constructor({
    storeDir, runner, surface, repoRoot = REPO_ROOT, agentsDir = P.DEFAULT_AGENTS_DIR,
    coordinatorPrompt, maxThreads = 4, quietMs = 2 * HOUR, worktrees = true, now = () => Date.now(),
    log = () => {},
  }) {
    Object.assign(this, { storeDir, runner, surface, repoRoot, agentsDir, maxThreads, quietMs, worktrees, now, log })
    mkdirSync(join(storeDir, 'threads'), { recursive: true })
    this.coordinatorPrompt = coordinatorPrompt ?? P.coordinatorSystemPrompt(agentsDir)
    this.ledger = new Ledger(join(storeDir, 'ledger.json'))
    this.statePath = join(storeDir, 'state.json')
    this.state = existsSync(this.statePath)
      ? JSON.parse(readFileSync(this.statePath, 'utf8'))
      : { coordinatorSession: null, decisions: [] }
    this.queue = []
    this.busy = null
    this.running = new Map() // id -> { promise, ctrl }
    this.pending = new Map() // id -> [text] waiting for the worker to stop
    this.startedFromQueue = []
  }

  // ─── public inputs ─────────────────────────────────────────────────────────

  chat(text) { this.#enqueue({ type: 'chat', text }) }

  personToThread(id, text) {
    const row = this.ledger.get(id)
    this.#deliver(row, text)
    this.#enqueue({ type: 'person-in-thread', id: row.id, text })
  }

  answerDecision(id, answer) {
    const d = this.state.decisions.find(x => x.id === Number(id))
    if (!d) throw new Error(`No decision D${id}`)
    d.answer = answer
    this.#saveState()
    this.#enqueue({ type: 'decision-answered', id: d.id, question: d.question, answer })
  }

  // Resume after a restart: every in-flight row continues in its own session.
  // Same rows, same IDs, no new threads.
  start() {
    const resumed = []
    for (const row of this.ledger.inFlight()) {
      if (row.sessionId) this.#launch(row, P.RESUME_PROMPT, { resume: true })
      else this.#launch(row, row.brief + '\n\n' + threadFooter(row.id))
      resumed.push(row.id)
    }
    this.#releaseQueue()
    if (resumed.length) this.#enqueue({ type: 'host-restarted', resumed })
    return resumed
  }

  startTimer(everyMs = 60_000) {
    this.timer = setInterval(() => this.tick(), everyMs)
    this.timer.unref?.()
  }

  stop() {
    clearInterval(this.timer)
    for (const { ctrl } of this.running.values()) ctrl.abort()
  }

  // Resolves once no event is waiting and no worker is running.
  async idle() {
    while (this.busy || this.running.size) {
      await Promise.allSettled([this.busy, ...[...this.running.values()].map(r => r.promise)].filter(Boolean))
    }
  }

  // Quiet threads: one check-in event, then abort and incomplete.
  tick(at = this.now()) {
    for (const row of this.ledger.inFlight()) {
      if (!this.running.has(row.id)) continue // waiting on the coordinator, not stuck
      const idle = at - row.lastActivity
      if (row.checkedIn && idle >= 2 * this.quietMs) {
        this.running.get(row.id).ctrl.abort()
        this.ledger.update(row.id, { state: 'incomplete', note: 'quiet after check-in' })
        this.pending.delete(row.id)
        this.#releaseQueue()
        this.#enqueue({ type: 'thread-incomplete', id: row.id, agent: row.agent })
      } else if (!row.checkedIn && idle >= this.quietMs) {
        this.ledger.update(row.id, { checkedIn: true })
        this.#enqueue({ type: 'thread-quiet', id: row.id, agent: row.agent, minutes: Math.round(idle / 60000) })
      }
    }
  }

  // ─── coordinator tools ─────────────────────────────────────────────────────

  tools() {
    const h = {
      start_thread: a => this.#startThread(a),
      message_thread: ({ id, text }) => this.#messageThread(id, text),
      read_thread: ({ id }) => {
        const r = this.ledger.get(id)
        return JSON.stringify({ id: 'T' + r.id, agent: r.agent, state: r.state, files: r.files, summary: r.summary, handoffs: r.handoffs })
      },
      post_message: ({ text }) => {
        appendFileSync(join(this.storeDir, 'chat.jsonl'), JSON.stringify({ from: 'coordinator', at: this.now(), text }) + '\n')
        this.surface.post(text)
        return 'Posted.'
      },
      request_decision: ({ question, options, recommended = 0 }) => {
        const d = { id: this.state.decisions.length + 1, question, options, recommended, answer: null }
        this.state.decisions.push(d)
        this.#saveState()
        this.surface.askDecision(d)
        return `Decision D${d.id} posted. The answer arrives as an event.`
      },
      write_ledger: ({ id, note, state }) => {
        const row = this.ledger.get(id)
        if (state === 'incomplete' && this.running.has(row.id)) this.running.get(row.id).ctrl.abort()
        this.ledger.update(row.id, { ...(note ? { note } : {}), ...(state ? { state } : {}) })
        if (state) this.#releaseQueue()
        return `T${row.id} updated.`
      },
      save_fact: ({ fact, source }) => {
        this.ledger.addFact(fact, source)
        appendFileSync(join(this.storeDir, 'facts.md'), `- ${fact}${source ? ` (source: ${source})` : ''}\n`)
        return 'Saved.'
      },
    }
    return Object.fromEntries(Object.entries(TOOL_SPECS).map(([name, spec]) => [name, { ...spec, handler: h[name] }]))
  }

  #startThread({ agent, brief, files = [], scale = 'S1' }) {
    if (!P.agentExists(this.agentsDir, agent)) return `Unknown agent "${agent}". Nothing started.`
    if (!brief?.trim()) return 'Empty brief. Nothing started.'
    const blockers = this.ledger.blockers(files)
    const full = this.ledger.inFlight().length >= this.maxThreads
    if (blockers.length || full) {
      const behind = blockers.map(b => `T${b.row.id}`).join(', ')
      const shared = [...new Set(blockers.flatMap(b => b.shared))].join(', ')
      const row = this.ledger.add({ agent, brief, files, scale, state: 'queued', note: blockers.length ? `behind ${behind}` : 'thread limit' })
      return blockers.length
        ? `QUEUED T${row.id} behind ${behind} (shared: ${shared}). It starts by itself when they close.`
        : `QUEUED T${row.id}: ${this.maxThreads} threads already running. It starts when one closes.`
    }
    const row = this.ledger.add({ agent, brief, files, scale, state: 'in-flight' })
    this.ledger.update(row.id, { started: this.now(), cwd: this.#cwd(row) })
    this.#launch(row, brief + '\n\n' + threadFooter(row.id))
    return `Started T${row.id} (${agent}).`
  }

  #messageThread(id, text) {
    const row = this.ledger.get(id)
    if (row.state === 'queued') return `T${row.id} has not started yet; put this in its brief by starting it again after it closes, or wait.`
    if (this.running.has(row.id)) {
      this.#deliver(row, text)
      return `T${row.id} is working; the message is delivered when it next stops.`
    }
    if (row.state === 'incomplete') return `T${row.id} is closed as incomplete (${row.note || 'no note'}). Start a new thread if the work is still needed.`
    if (row.state !== 'in-flight') {
      const blockers = this.ledger.blockers(row.files, row.id)
      if (blockers.length) return `T${row.id} can't reopen: T${blockers[0].row.id} owns ${blockers[0].shared.join(', ')}.`
      this.ledger.update(row.id, { state: 'in-flight' })
    }
    this.#deliver(row, text)
    return `Sent to T${row.id}.`
  }

  // ─── workers ───────────────────────────────────────────────────────────────

  #cwd(row) {
    return this.worktrees ? createWorktree(this.repoRoot, this.storeDir, row.id) : this.repoRoot
  }

  #deliver(row, text) {
    if (this.running.has(row.id)) {
      this.pending.set(row.id, [...(this.pending.get(row.id) ?? []), text])
    } else {
      this.#launch(row, text, { resume: Boolean(row.sessionId) })
    }
  }

  #launch(row, prompt, { resume = false } = {}) {
    const ctrl = new AbortController()
    this.ledger.update(row.id, { lastActivity: this.now(), checkedIn: false })
    const promise = (async () => {
      try {
        const res = await this.runner.worker({
          id: row.id,
          agent: row.agent,
          systemPrompt: P.workerSystemPrompt(this.agentsDir, row.agent),
          tools: P.agentTools(this.agentsDir, row.agent),
          prompt,
          cwd: row.cwd ?? this.repoRoot,
          sessionId: resume ? row.sessionId : undefined,
          signal: ctrl.signal,
          onActivity: sid => {
            row.lastActivity = this.now()
            row.checkedIn = false
            if (sid && !row.sessionId) {
              row.sessionId = sid
              this.ledger.save() // a restart must find the session to resume
            }
          },
        })
        if (ctrl.signal.aborted) return
        this.#onReply(row, prompt, res)
      } catch (err) {
        if (ctrl.signal.aborted) return // tick() or write_ledger already closed it
        this.ledger.update(row.id, { state: 'incomplete', note: `failed: ${err.message}` })
        this.#releaseQueue()
        this.#enqueue({ type: 'thread-failed', id: row.id, agent: row.agent, error: err.message })
      } finally {
        this.running.delete(row.id)
        const waiting = this.pending.get(row.id)
        this.pending.delete(row.id)
        if (waiting?.length && this.ledger.get(row.id).state !== 'incomplete') {
          this.#launch(row, waiting.join('\n\n'), { resume: Boolean(row.sessionId) })
        }
      }
    })()
    this.running.set(row.id, { promise, ctrl })
  }

  #onReply(row, prompt, { text, sessionId }) {
    appendFileSync(join(this.storeDir, 'threads', `T${row.id}.md`),
      `## → T${row.id}\n\n${prompt}\n\n## ← ${row.agent}\n\n${text}\n\n`)
    if (sessionId) row.sessionId = sessionId
    const r = readReply(text, row.id)
    const base = { id: row.id, agent: row.agent }

    if (r.rejected) {
      const count = row.rejections + 1
      this.ledger.update(row.id, { rejections: count, ...(count >= 3 ? { state: 'incomplete', note: 'brief rejected three times' } : {}) })
      if (count >= 3) this.#releaseQueue()
      this.#enqueue({ ...base, type: 'thread-rejected', count, reason: r.rejected })
      return
    }

    const widened = this.ledger.widen(row.id, r.files)
    if (r.complete) {
      this.ledger.update(row.id, { state: 'done', handoffs: r.handoffs, summary: r.summary, sessionId: row.sessionId })
      this.#releaseQueue()
      this.#enqueue({ ...base, type: 'thread-finished', summary: r.summary, files: r.files, widened, handoffs: r.handoffs })
    } else {
      this.ledger.update(row.id, { summary: r.summary, sessionId: row.sessionId })
      this.#enqueue({ ...base, type: 'thread-replied', summary: r.summary })
    }
  }

  // Start every queued row whose files are free, oldest first.
  #releaseQueue() {
    for (const row of this.ledger.rows.filter(r => r.state === 'queued')) {
      if (this.ledger.inFlight().length >= this.maxThreads) break
      if (this.ledger.blockers(row.files, row.id).length) continue
      this.ledger.update(row.id, { state: 'in-flight', started: this.now(), note: '' })
      this.ledger.update(row.id, { cwd: this.#cwd(row) })
      this.#launch(row, row.brief + '\n\n' + threadFooter(row.id))
      this.startedFromQueue.push(row.id)
    }
  }

  // ─── coordinator wakes ─────────────────────────────────────────────────────

  #enqueue(event) {
    this.queue.push(event)
    if (this.busy) return
    this.busy = (async () => {
      while (this.queue.length) {
        const e = this.queue.shift()
        try { await this.#wake(e) } catch (err) { this.log(`coordinator error on ${e.type}: ${err.message}`) }
      }
      this.busy = null
    })()
  }

  async #wake(event) {
    const prompt = P.wakePrompt(event, this.ledger.table(), this.startedFromQueue.splice(0))
    const res = await this.runner.coordinator({
      prompt,
      systemPrompt: this.coordinatorPrompt,
      sessionId: this.state.coordinatorSession,
      tools: this.tools(),
    })
    if (res?.sessionId && res.sessionId !== this.state.coordinatorSession) {
      this.state.coordinatorSession = res.sessionId
      this.#saveState()
    }
  }

  #saveState() {
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2))
  }
}
