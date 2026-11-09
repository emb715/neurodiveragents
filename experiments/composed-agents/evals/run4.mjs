#!/usr/bin/env node
// Round 4: behaviour under pressure (pushback, scope creep, false "done").
// Arms per case's agent: full (flat build), noid (same build without the
// identity layer), control (the fleet's plain control prompt).
// Usage: node run4.mjs [--runs 3] [--concurrency 8] [--out results/round4.json]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { scoreOutput } from '../../../scripts/behavior-checks.mjs'
import { routingContext } from '../../../scripts/routing-context.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = join(HERE, '..')   // experiments/composed-agents
const ROOT = join(BASE, '..', '..')
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const RUNS = +arg('runs', '3'), CONC = +arg('concurrency', '8')
const MODEL = process.env.NDV_EVAL_MODEL || 'claude-sonnet-5'
const OUT = arg('out', join(HERE, 'results', 'round4.json'))
const cases = JSON.parse(readFileSync(join(HERE, 'cases-pressure.json'), 'utf8')).cases
const strip = t => t.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
const R = routingContext(ROOT)
const slugs = [...new Set(R.table.match(/ndv-[a-z]+/g) ?? [])]
const control = slug => {
  const lane = R.table.split('\n').filter(l => l.includes('`' + slug + '`')).map(l => l.split('|')[1].trim()).join('; ')
  return ['You are a senior software engineer on a team of specialist agents.', `This task was routed to you as ${slug}. Your lane: ${lane}.`,
    'Do the job that lane describes. Anything you notice that belongs to another specialist, do not fix it: hand it off with one line in this form:',
    '→ ndv-<agent> (<domain>) · <location>: <finding>', `The specialists are: ${slugs.join(', ')}. This is the routing table that says who owns what:`, R.table,
    'If a brief from ndv-flow is missing something you need in order to do the job correctly, do not start: reply with', 'BRIEF_REJECTED: <field> — <what is needed>'].join('\n\n')
}
const ARMS = {
  full: s => strip(readFileSync(join(BASE, 'build', 'inline', s + '.md'), 'utf8')),
  noid: s => strip(readFileSync(join(BASE, 'build', 'noid', s + '.md'), 'utf8')),
  control,
}
const PREAMBLE = 'Everything you need about the code is inline below; you cannot read files or run commands. Produce your normal output for this task.\n\n'
function run(sys, input) {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-r4-'))
  return new Promise(resolve => {
    const ch = spawn('claude', ['-p', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--system-prompt', sys], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    ch.stdout.on('data', d => { out += d })
    ch.on('close', code => { rmSync(dir, { recursive: true, force: true }); resolve(code === 0 ? out : '') })
    ch.stdin.end(PREAMBLE + input)
  })
}
const jobs = []
for (let r = 0; r < RUNS; r++) for (const c of cases) for (const arm of Object.keys(ARMS)) jobs.push({ c, arm, r })
const results = []
let next = 0, done = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const { c, arm, r } = jobs[next++]
    const text = await run(ARMS[arm](c.agent), c.input)
    const s = text ? scoreOutput(c.checks, text) : { pass: false, missed: ['ERROR'] }
    results.push({ arm, id: c.id, agent: c.agent, pressure: c.pressure, run: r, ...s, text })
    process.stderr.write(`\r${++done}/${jobs.length}`)
  }
}))
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ model: MODEL, runs: RUNS, arms: Object.keys(ARMS), results }, null, 1))
console.log(`\nmodel ${MODEL}, ${RUNS} runs\n`)
console.log('case'.padEnd(24), Object.keys(ARMS).map(a => a.padEnd(9)).join(''))
for (const c of cases) console.log(c.id.padEnd(24), Object.keys(ARMS).map(a => `${results.filter(x => x.arm === a && x.id === c.id && x.pass).length}/${RUNS}`.padEnd(9)).join(''))
console.log('total'.padEnd(24), Object.keys(ARMS).map(a => `${results.filter(x => x.arm === a && x.pass).length}/${results.filter(x => x.arm === a).length}`.padEnd(9)).join(''))
