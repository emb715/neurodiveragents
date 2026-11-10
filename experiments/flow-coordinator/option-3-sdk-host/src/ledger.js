/**
 * ledger.js: Flow's Dispatch Register, saved to disk.
 *
 * The coordinator is woken once per event and keeps nothing between wakes,
 * so the register can't live in its context. The host owns this file and
 * enforces the overlap rule in code; the coordinator sees it as a table.
 *
 * Row states use Flow's own words: queued, in-flight, done, incomplete.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'

export const STATES = ['queued', 'in-flight', 'done', 'incomplete']

export class Ledger {
  constructor(path) {
    this.path = path
    this.rows = []
    this.facts = []
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8'))
      this.rows = data.rows ?? []
      this.facts = data.facts ?? []
    }
  }

  save() {
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = this.path + '.tmp'
    writeFileSync(tmp, JSON.stringify({ rows: this.rows, facts: this.facts }, null, 2))
    renameSync(tmp, this.path) // a crash mid-write never leaves half a ledger
  }

  nextId() {
    return String(this.rows.reduce((n, r) => Math.max(n, Number(r.id) || 0), 0) + 1)
  }

  get(id) {
    const row = this.rows.find(r => r.id === String(id).replace(/^T/, ''))
    if (!row) throw new Error(`No ledger row T${id}`)
    return row
  }

  inFlight() {
    return this.rows.filter(r => r.state === 'in-flight')
  }

  // Flow: "A task with no stated file scope owns every file." So an empty
  // file list overlaps everything, in both directions.
  static overlap(a, b) {
    if (a.length === 0 || b.length === 0) return ['*']
    return a.filter(f => b.includes(f))
  }

  // Returns the blocking rows, each with the shared files.
  blockers(files, exceptId) {
    return this.inFlight()
      .filter(r => r.id !== exceptId)
      .map(r => ({ row: r, shared: Ledger.overlap(files, r.files) }))
      .filter(x => x.shared.length > 0)
  }

  add({ agent, brief, files = [], scale = 'S1', state, note }) {
    const row = {
      id: this.nextId(), agent, brief, files: [...files], scale, state,
      sessionId: null, checkedIn: false, rejections: 0,
      started: null, lastActivity: Date.now(), handoffs: [], summary: '', note: note ?? '',
    }
    this.rows.push(row)
    this.save()
    return row
  }

  update(id, patch) {
    const row = this.get(id)
    if (patch.state && !STATES.includes(patch.state)) throw new Error(`Unknown state "${patch.state}"`)
    Object.assign(row, patch)
    this.save()
    return row
  }

  // A thread's reply named files outside its row: the person may have
  // steered it. Widen before any other dispatch check.
  widen(id, files) {
    const row = this.get(id)
    const added = files.filter(f => !row.files.includes(f))
    if (row.files.length > 0 && added.length) row.files.push(...added)
    this.save()
    return added
  }

  addFact(fact, source) {
    if (!this.facts.some(f => f.fact === fact)) this.facts.push({ fact, source: source ?? '' })
    this.save()
  }

  // What the coordinator sees. No transcripts, no briefs in full.
  table() {
    if (this.rows.length === 0) return '(ledger empty)'
    const head = 'T[ID] | agent | files owned | scale | state | open handoffs'
    const lines = this.rows.map(r => [
      `T${r.id}`, r.agent, r.files.length ? r.files.join(', ') : '(all files)', r.scale, r.state,
      r.handoffs.length ? r.handoffs.map(h => `→ ${h.agent}: ${h.description}`).join('; ') : '-',
    ].join(' | '))
    return [head, ...lines].join('\n')
  }
}
