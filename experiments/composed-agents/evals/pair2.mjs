#!/usr/bin/env node
// Pairwise blind judge on task quality for round 2. For the same case and run,
// which reply is the better piece of work for this input? The judge never sees
// arm names; order is randomised. Usage: node pair2.mjs <report.json> A:B [A:B ...]
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const [file, ...specs] = process.argv.slice(2)
const rows = JSON.parse(readFileSync(file, 'utf8')).results
const cases = Object.fromEntries(['cases.json', 'cases-gap.json', 'cases-review.json'].flatMap(f => JSON.parse(readFileSync(join(HERE, f), 'utf8')).cases).map(c => [c.id, c]))
const MODEL = process.env.NDV_JUDGE_MODEL || 'claude-sonnet-5'

const ROLE = {
  'ndv-diagnose': 'a debugging specialist. Good work finds and confirms the actual root cause (not a symptom, location or guess), refuses unconfirmed suggested causes, gives a concrete verification, hands security and performance work to the right specialist instead of doing it, and rejects briefs that cannot be acted on',
  'ndv-review': 'a code reviewer. Good work registers every real defect, minor ones included, classifies them by severity, writes no code fixes, hands security, performance and similar work to the right specialist, and rejects briefs that cannot be acted on',
}
const sys = agent => `You compare two replies from ${ROLE[agent]}. Both answer the same input. Pick the better piece of work for that input, judged on substance, not length or formatting; no filler and no hedging count in a reply's favour. Reply with exactly one line: winner=<1|2|tie> because=<at most 20 words>`

function ask(system, prompt) {
  return new Promise(resolve => {
    const ch = spawn('claude', ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', system], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    ch.stdout.on('data', d => { out += d })
    ch.on('close', () => resolve(out.trim()))
    ch.stdin.end(prompt)
  })
}

const pairs = []
for (const spec of specs) {
  const [A, B] = spec.split(':')
  for (const a of rows.filter(r => r.arm === A && r.text)) {
    const b = rows.find(r => r.arm === B && r.id === a.id && r.run === a.run && r.text)
    if (b) pairs.push({ spec, A, B, id: a.id, run: a.run, a, b, flip: Math.random() < 0.5 })
  }
}
let next = 0, done = 0
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < pairs.length) {
    const p = pairs[next++]
    const [one, two] = p.flip ? [p.b, p.a] : [p.a, p.b]
    const out = await ask(sys(cases[p.id].agent), `INPUT\n${cases[p.id].input}\n\nREPLY 1\n${one.text}\n\nREPLY 2\n${two.text}`)
    const w = (out.match(/winner=(1|2|tie)/) ?? [])[1]
    p.winner = w === 'tie' || !w ? 'tie' : (w === '1') !== p.flip ? p.A : p.B
    p.note = out
    process.stderr.write(`\r${++done}/${pairs.length}`)
  }
}))
console.log()
for (const spec of specs) {
  const ps = pairs.filter(p => p.spec === spec), [A, B] = spec.split(':')
  console.log(`${A} ${ps.filter(p => p.winner === A).length}  ·  ${B} ${ps.filter(p => p.winner === B).length}  ·  tie ${ps.filter(p => p.winner === 'tie').length}  (n=${ps.length})`)
}
writeFileSync(join(HERE, 'results', 'pairwise-round2.json'), JSON.stringify(pairs.map(({ a, b, ...p }) => p), null, 1))
