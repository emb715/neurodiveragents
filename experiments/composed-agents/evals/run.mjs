#!/usr/bin/env node
// Composed-agent experiment runner (local only, costs tokens).
//
// Arms, same cases, same model:
//   original  today's agents/ndv-diagnose.md as the system prompt
//   inline    the composed source rendered flat by compose.mjs --inline
//   runtime   the composed source rendered by compose.mjs --runtime; the two
//             skills sit in the run dir's .claude/skills and only the Skill
//             tool is available, so the agent must load its own layers
//   nopersona runtime, but the agent file names only the domain skill (ablation)
//   selfload  no agent file at all, a plain engineer prompt; the skills are
//             available, so any layer that loads does so by its description
//   control   the fleet's own control prompt (lane + routing table + shared
//             protocol, no neurotype, no domain knowledge)
//
// Usage: node run.mjs [--runs 3] [--arms a,b] [--concurrency 4] [--out results/x.json]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
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
const RUNS = +arg('runs', '3')
const ARMS = arg('arms', 'original,inline,runtime,selfload,control').split(',')
const CONC = +arg('concurrency', '4')
const MODEL = process.env.NDV_EVAL_MODEL || 'claude-sonnet-5'
const OUT = arg('out', join(HERE, 'results', `run-${Date.now()}.json`))
const cases = JSON.parse(readFileSync(join(HERE, arg('cases', 'cases.json')), 'utf8')).cases

const strip = t => t.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
const SKILLS = ['ndv-skeptical', 'ndv-domain-debugging']

const R = routingContext(ROOT)
const slugs = [...new Set(R.table.match(/ndv-[a-z]+/g) ?? [])]
const lane = R.table.split('\n').filter(l => l.includes('`ndv-diagnose`')).map(l => l.split('|')[1].trim()).join('; ')
const control = [
  'You are a senior software engineer on a team of specialist agents.',
  `This task was routed to you as ndv-diagnose. Your lane: ${lane}.`,
  'Do the job that lane describes. Anything you notice that belongs to another specialist, do not fix it: hand it off with one line in this form:',
  '→ ndv-<agent> (<domain>) · <location>: <finding>',
  `The specialists are: ${slugs.join(', ')}. This is the routing table that says who owns what:`,
  R.table,
  'If a brief from ndv-flow is missing something you need in order to do the job correctly, do not start: reply with',
  'BRIEF_REJECTED: <field> — <what is needed>',
].join('\n\n')

const SYSTEM = {
  original: strip(readFileSync(join(ROOT, 'agents', 'ndv-diagnose.md'), 'utf8')),
  inline: strip(readFileSync(join(BASE, 'build', 'inline', 'ndv-diagnose.md'), 'utf8')),
  runtime: strip(readFileSync(join(BASE, 'build', 'runtime', 'ndv-diagnose.md'), 'utf8')),
  nopersona: strip(readFileSync(join(BASE, 'build', 'runtime', 'ndv-diagnose.nopersona.md'), 'utf8')),
  selfload: 'You are a senior software engineer. Do the task in the user message.',
  control,
}
const WITH_SKILLS = new Set(['runtime', 'nopersona', 'selfload'])
const PREAMBLE = 'Everything you need about the code is inline below; you cannot read files or run commands. Produce your normal output for this task.\n\n'

function run(arm, c) {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-comp-'))
  if (WITH_SKILLS.has(arm)) for (const s of SKILLS) cpSync(join(BASE, 'skills', s), join(dir, '.claude', 'skills', s), { recursive: true })
  const args = ['-p', '--model', MODEL, '--tools', WITH_SKILLS.has(arm) ? 'Skill' : '', '--strict-mcp-config',
    '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--system-prompt', SYSTEM[arm]]
  return new Promise(resolve => {
    const ch = spawn('claude', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    ch.stdout.on('data', d => { out += d }); ch.stderr.on('data', d => { err += d })
    ch.on('close', code => {
      rmSync(dir, { recursive: true, force: true })
      let text = '', loaded = []
      for (const line of out.split('\n')) {
        if (!line.trim()) continue
        let e; try { e = JSON.parse(line) } catch { continue }
        if (e.type === 'assistant') for (const b of e.message.content) if (b.type === 'tool_use' && b.name === 'Skill') loaded.push(b.input.skill)
        if (e.type === 'result') text = e.result ?? ''
      }
      resolve({ ok: code === 0 && !!text, text, loaded, error: code ? err.slice(-300) : undefined })
    })
    ch.stdin.end(PREAMBLE + c.input)
  })
}

const jobs = []
for (let r = 0; r < RUNS; r++) for (const arm of ARMS) for (const c of cases) jobs.push({ arm, c, r })
const results = []
let next = 0, done = 0
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < jobs.length) {
    const { arm, c, r } = jobs[next++]
    const res = await run(arm, c)
    const s = res.ok ? scoreOutput(c.checks, res.text) : { pass: false, missed: ['ERROR'] }
    results.push({ arm, id: c.id, kind: c.kind, run: r, ...s, loaded: res.loaded, error: res.error, text: res.text })
    process.stderr.write(`\r${++done}/${jobs.length}`)
  }
}))
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ model: MODEL, runs: RUNS, arms: ARMS, results }, null, 1))

console.log(`\nmodel ${MODEL}, ${RUNS} runs\n`)
console.log('arm'.padEnd(10), 'pass'.padEnd(8), 'finds'.padEnd(8), 'lane'.padEnd(8), 'brief'.padEnd(8), 'gap'.padEnd(8), 'loaded persona / domain')
for (const arm of ARMS) {
  const rs = results.filter(x => x.arm === arm)
  const f = k => { const s = rs.filter(x => !k || x.kind === k); return `${s.filter(x => x.pass).length}/${s.length}` }
  const ld = WITH_SKILLS.has(arm) ? `${rs.filter(x => x.loaded.includes('ndv-skeptical')).length}/${rs.length} / ${rs.filter(x => x.loaded.includes('ndv-domain-debugging')).length}/${rs.length}` : '-'
  console.log(arm.padEnd(10), f().padEnd(8), f('finds').padEnd(8), f('lane').padEnd(8), f('brief').padEnd(8), f('gap').padEnd(8), ld)
}
console.log('\nper case (passes across runs)')
for (const c of cases) console.log('  ' + c.id.padEnd(28), ARMS.map(a => `${a}:${results.filter(x => x.arm === a && x.id === c.id && x.pass).length}`).join('  '))
console.log('\nreport:', OUT)
