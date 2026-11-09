#!/usr/bin/env node
// Blind judge for neurotype fidelity and scope discipline (ADR-004 rubric,
// 0-2 each). The judge sees the case, the reply and the neurotype it should
// show; never the arm. Usage: node judge.mjs results/round1.json
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const file = process.argv[2]
const data = JSON.parse(readFileSync(file, 'utf8'))
const cases = Object.fromEntries([...JSON.parse(readFileSync(join(HERE, 'cases.json'), 'utf8')).cases, ...JSON.parse(readFileSync(join(HERE, 'cases-gap.json'), 'utf8')).cases].map(c => [c.id, c]))
const MODEL = process.env.NDV_JUDGE_MODEL || 'claude-sonnet-5'

const RUBRIC = `You grade one reply from a debugging specialist. Score two dimensions, 0, 1 or 2.

Neurotype fidelity. The specialist should think like this: locked onto the actual cause; a symptom, a location or a guess is not a cause; refuses to accept a suggested cause without confirming it; states the root cause in one sentence; will not call it done without a concrete verification; deliberately looks for an alternative cause before confirming; no filler, no hedging, no softening.
  2 = this thinking is visible throughout. 1 = partly, or generic-engineer tone with some of it. 0 = generic assistant behaviour.
  If the right move for the input is to reject the brief or give a one-line config fix, doing that crisply IS full fidelity.

Scope discipline. The specialist diagnoses and proposes; it does not refactor, improve or clean up unrelated code, does not write security patches (hands them to ndv-secure), and hands performance work to ndv-optimize.
  2 = stays in lane. 1 = minor drift. 0 = does other agents' work.

Reply with exactly one line: fidelity=<0|1|2> scope=<0|1|2> because=<at most 20 words>`

function ask(prompt) {
  return new Promise(resolve => {
    const ch = spawn('claude', ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', RUBRIC], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    ch.stdout.on('data', d => { out += d })
    ch.on('close', () => resolve(out.trim()))
    ch.stdin.end(prompt)
  })
}

const todo = data.results.filter(r => r.text && r.judge === undefined)
let next = 0, done = 0
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < todo.length) {
    const r = todo[next++]
    const out = await ask(`INPUT\n${cases[r.id].input}\n\nREPLY\n${r.text}`)
    const m = out.match(/fidelity=(\d).*?scope=(\d)/)
    r.judge = m ? { fidelity: +m[1], scope: +m[2], note: out } : { error: out }
    process.stderr.write(`\r${++done}/${todo.length}`)
  }
}))
writeFileSync(file, JSON.stringify(data, null, 1))
console.log('\narm        fidelity  scope   (mean of 0-2, n)')
for (const arm of data.arms) {
  const js = data.results.filter(r => r.arm === arm && r.judge && r.judge.fidelity !== undefined).map(r => r.judge)
  const mean = k => (js.reduce((s, j) => s + j[k], 0) / js.length).toFixed(2)
  console.log(arm.padEnd(10), mean('fidelity').padEnd(9), mean('scope').padEnd(7), js.length)
}
