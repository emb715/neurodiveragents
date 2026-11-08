#!/usr/bin/env node
// Round 2: one read-only core agent (ndv-inspect) assembled per task from the
// brief's Load line. Identity x domain matrix on two domains, against the
// original single-file agents. All four skills sit in the run dir, so the
// agent must pick the two the brief names.
//
// Usage: node run2.mjs [--runs 3] [--concurrency 8] [--only D-pierce,R-acute] [--out results/round2.json]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { scoreOutput } from '../../scripts/behavior-checks.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const RUNS = +arg('runs', '3'), CONC = +arg('concurrency', '8')
const MODEL = process.env.NDV_EVAL_MODEL || 'claude-sonnet-5'
const OUT = arg('out', join(HERE, 'results', 'round2.json'))
const strip = t => t.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
const load = f => JSON.parse(readFileSync(join(HERE, f), 'utf8')).cases

const SKILLS = ['ndv-skeptical', 'ndv-domain-debugging', 'ndv-total-perception', 'ndv-domain-code-review']
const CORE = strip(readFileSync(join(HERE, 'ndv-inspect.src.md'), 'utf8'))
const orig = slug => strip(readFileSync(join(HERE, `${slug}.original.md`), 'utf8'))

const diagnose = [...load('cases.json'), ...load('cases-gap.json')]
const review = load('cases-review.json')
const ARMS = [
  { name: 'D-orig', cases: diagnose, system: orig('ndv-diagnose') },
  { name: 'D-pierce', cases: diagnose, system: CORE, load: ['ndv-skeptical', 'ndv-domain-debugging'] },
  { name: 'D-acute', cases: diagnose, system: CORE, load: ['ndv-total-perception', 'ndv-domain-debugging'] },
  { name: 'D-none', cases: diagnose, system: CORE, load: ['ndv-domain-debugging'] },
  { name: 'R-orig', cases: review, system: orig('ndv-review') },
  { name: 'R-acute', cases: review, system: CORE, load: ['ndv-total-perception', 'ndv-domain-code-review'] },
  { name: 'R-pierce', cases: review, system: CORE, load: ['ndv-skeptical', 'ndv-domain-code-review'] },
  { name: 'R-none', cases: review, system: CORE, load: ['ndv-domain-code-review'] },
].filter(a => !arg('only') || arg('only').split(',').includes(a.name))

const PREAMBLE = 'Everything you need about the code is inline below; you cannot read files or run commands. Produce your normal output for this task.\n\n'

function run(arm, c) {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-r2-'))
  if (arm.load) for (const s of SKILLS) cpSync(join(ROOT, 'skills', s), join(dir, '.claude', 'skills', s), { recursive: true })
  const prompt = PREAMBLE + (arm.load ? `Load: ${arm.load.join(', ')}\n\n` : '') + c.input
  const args = ['-p', '--model', MODEL, '--tools', arm.load ? 'Skill' : '', '--strict-mcp-config',
    '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--system-prompt', arm.system]
  const t0 = Date.now()
  return new Promise(resolve => {
    const ch = spawn('claude', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    ch.stdout.on('data', d => { out += d }); ch.stderr.on('data', d => { err += d })
    ch.on('close', code => {
      rmSync(dir, { recursive: true, force: true })
      let text = '', loaded = [], usage = null
      for (const line of out.split('\n')) {
        let e; try { e = JSON.parse(line) } catch { continue }
        if (e.type === 'assistant') for (const b of e.message.content) if (b.type === 'tool_use' && b.name === 'Skill') loaded.push(b.input.skill)
        if (e.type === 'result') { text = e.result ?? ''; usage = { cost: e.total_cost_usd, turns: e.num_turns, ms: Date.now() - t0, in: e.usage?.input_tokens + (e.usage?.cache_read_input_tokens ?? 0) + (e.usage?.cache_creation_input_tokens ?? 0), out: e.usage?.output_tokens } }
      }
      resolve({ ok: code === 0 && !!text, text, loaded, usage, error: code ? err.slice(-300) : undefined })
    })
    ch.stdin.end(prompt)
  })
}

const jobs = []
for (let r = 0; r < RUNS; r++) for (const arm of ARMS) for (const c of arm.cases) jobs.push({ arm, c, r })
const results = []
let next = 0, done = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const { arm, c, r } = jobs[next++]
    const res = await run(arm, c)
    const s = res.ok ? scoreOutput(c.checks, res.text) : { pass: false, missed: ['ERROR'] }
    const exact = arm.load ? arm.load.every(x => res.loaded.includes(x)) && res.loaded.every(x => arm.load.includes(x)) : null
    results.push({ arm: arm.name, id: c.id, kind: c.kind, run: r, ...s, loaded: res.loaded, loadExact: exact, usage: res.usage, error: res.error, text: res.text })
    process.stderr.write(`\r${++done}/${jobs.length}`)
  }
}))
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ model: MODEL, runs: RUNS, arms: ARMS.map(a => a.name), results }, null, 1))

const avg = (xs, f) => xs.length ? xs.reduce((s, x) => s + (f(x) ?? 0), 0) / xs.length : 0
console.log(`\nmodel ${MODEL}, ${RUNS} runs\n`)
console.log('arm'.padEnd(10), 'pass'.padEnd(8), 'finds'.padEnd(8), 'lane'.padEnd(8), 'brief'.padEnd(8), 'gap'.padEnd(8), 'load ok'.padEnd(8), 'in tok'.padEnd(8), 'out tok'.padEnd(8), 'sec')
for (const arm of ARMS) {
  const rs = results.filter(x => x.arm === arm.name)
  const f = k => { const s = rs.filter(x => !k || x.kind === k); return s.length ? `${s.filter(x => x.pass).length}/${s.length}` : '-' }
  const lo = arm.load ? `${rs.filter(x => x.loadExact).length}/${rs.length}` : '-'
  console.log(arm.name.padEnd(10), f().padEnd(8), f('finds').padEnd(8), f('lane').padEnd(8), f('brief').padEnd(8), f('gap').padEnd(8), lo.padEnd(8),
    String(Math.round(avg(rs, x => x.usage?.in))).padEnd(8), String(Math.round(avg(rs, x => x.usage?.out))).padEnd(8), (avg(rs, x => x.usage?.ms) / 1000).toFixed(0))
}
console.log('\nreport:', OUT)
