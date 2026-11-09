#!/usr/bin/env node
// Round 3: does the right identity change the outcome? Each case is fixed to a
// domain; the system prompt is that domain composed flat with each of three
// identities (no runtime loading, so only the identity varies). Score = share
// of planted items the reply names.
// Usage: node run3.mjs [--runs 3] [--concurrency 8] [--out results/round3.json]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const RUNS = +arg('runs', '3'), CONC = +arg('concurrency', '8')
const MODEL = process.env.NDV_EVAL_MODEL || 'claude-sonnet-5'
const OUT = arg('out', join(HERE, 'results', 'round3.json'))
const cases = JSON.parse(readFileSync(join(HERE, 'cases-identity.json'), 'utf8')).cases
const IDS = ['ndv-neurotype-skeptical', 'ndv-neurotype-total-perception', 'ndv-neurotype-vigilant']
// Skills carry {{name}} and {{role}} placeholders; the agent file normally supplies the name.
const ROLES = JSON.parse(readFileSync(join(HERE, 'roles.json'), 'utf8'))
const NAMES = { 'ndv-neurotype-skeptical': 'Pierce', 'ndv-neurotype-total-perception': 'Acute', 'ndv-neurotype-vigilant': 'Ward' }
let current = null
const skill = n => readFileSync(join(ROOT, 'skills', n, 'SKILL.md'), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  .replace(/\{\{([a-z-]+)\}\}/g, (_, r) => r === 'name' ? NAMES[current] : ROLES[r])
const system = (id, dom) => { current = id; return `You are **${NAMES[id]}**. ${skill(id)}\n\n${skill(dom)}` }
const PREAMBLE = 'Everything you need about the code is inline below; you cannot read files or run commands. Produce your normal output for this task.\n\n'

function run(sys, input) {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-r3-'))
  return new Promise(resolve => {
    const ch = spawn('claude', ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', sys], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    ch.stdout.on('data', d => { out += d })
    ch.on('close', code => { rmSync(dir, { recursive: true, force: true }); resolve(code === 0 ? out : '') })
    ch.stdin.end(PREAMBLE + input)
  })
}

const jobs = []
for (let r = 0; r < RUNS; r++) for (const c of cases) for (const id of IDS) jobs.push({ c, id, r })
const results = []
let next = 0, done = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const { c, id, r } = jobs[next++]
    const text = await run(system(id, c.domain), c.input)
    const found = c.items.filter(it => new RegExp(it.pattern, 'i').test(text)).map(it => it.name)
    results.push({ id: c.id, identity: id, native: id === c.native, run: r, score: found.length / c.items.length, found, words: text.split(/\s+/).length, text })
    process.stderr.write(`\r${++done}/${jobs.length}`)
  }
}))
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ model: MODEL, runs: RUNS, results }, null, 1))
const short = id => id.replace('ndv-neurotype-', '')
console.log(`\nmodel ${MODEL}, ${RUNS} runs. Mean share of planted items found (words). * = native identity for the domain\n`)
console.log('case'.padEnd(26), IDS.map(i => short(i).padEnd(22)).join(''))
for (const c of cases) {
  const cell = id => { const rs = results.filter(x => x.id === c.id && x.identity === id); const s = rs.reduce((a, x) => a + x.score, 0) / rs.length, w = rs.reduce((a, x) => a + x.words, 0) / rs.length; return `${(s * 100).toFixed(0)}% (${w.toFixed(0)})${id === c.native ? ' *' : ''}`.padEnd(22) }
  console.log(c.id.padEnd(26), IDS.map(cell).join(''))
}
const nat = results.filter(x => x.native), non = results.filter(x => !x.native)
console.log(`\nnative identity ${(100 * nat.reduce((a, x) => a + x.score, 0) / nat.length).toFixed(0)}%  vs  other identities ${(100 * non.reduce((a, x) => a + x.score, 0) / non.length).toFixed(0)}%`)
