#!/usr/bin/env node
// Pairwise blind judge: for the same case and run, which of two replies shows
// the debugging neurotype more? Order is randomised per pair; the judge never
// sees arm names. Usage: node pairwise.mjs <armA> <armB> <report.json>...
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const [A, B, ...files] = process.argv.slice(2)
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8')).results)
const cases = Object.fromEntries(['cases.json', 'cases-gap.json'].flatMap(f => JSON.parse(readFileSync(join(HERE, f), 'utf8')).cases).map(c => [c.id, c]))
const MODEL = process.env.NDV_JUDGE_MODEL || 'claude-sonnet-5'

const SYS = `You compare two replies from a debugging specialist to the same input. The specialist should be locked onto the actual cause and unable to let go until it is confirmed: a symptom, a location or a guess is not a cause; it refuses suggested causes until confirmed; it will not call anything done without a concrete verification; it looks for an alternative cause before confirming; it stays in its lane; no filler, no hedging. Pick the reply where that mind is MORE present, judged on thinking, not length or formatting. Reply with exactly one line: winner=<1|2|tie> because=<at most 20 words>`

function ask(prompt) {
  return new Promise(resolve => {
    const ch = spawn('claude', ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', SYS], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    ch.stdout.on('data', d => { out += d })
    ch.on('close', () => resolve(out.trim()))
    ch.stdin.end(prompt)
  })
}

const pairs = []
for (const a of rows.filter(r => r.arm === A && r.text)) {
  const b = rows.find(r => r.arm === B && r.id === a.id && r.run === a.run && r.text)
  if (b) pairs.push({ id: a.id, run: a.run, a, b, flip: Math.random() < 0.5 })
}
let next = 0, done = 0
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < pairs.length) {
    const p = pairs[next++]
    const [one, two] = p.flip ? [p.b, p.a] : [p.a, p.b]
    const out = await ask(`INPUT\n${cases[p.id].input}\n\nREPLY 1\n${one.text}\n\nREPLY 2\n${two.text}`)
    const w = (out.match(/winner=(1|2|tie)/) ?? [])[1]
    p.winner = w === 'tie' || !w ? 'tie' : (w === '1') !== p.flip ? A : B
    p.note = out
    process.stderr.write(`\r${++done}/${pairs.length}`)
  }
}))
const count = k => pairs.filter(p => p.winner === k).length
console.log(`\n${A} ${count(A)}  ·  ${B} ${count(B)}  ·  tie ${count('tie')}  (n=${pairs.length})`)
for (const id of [...new Set(pairs.map(p => p.id))]) {
  const ps = pairs.filter(p => p.id === id)
  console.log('  ' + id.padEnd(28), ps.map(p => p.winner === A ? 'A' : p.winner === B ? 'B' : '=').join(' '))
}
writeFileSync(join(HERE, 'results', `pairwise-${A}-vs-${B}.json`), JSON.stringify(pairs.map(({ a, b, ...p }) => p), null, 1))
