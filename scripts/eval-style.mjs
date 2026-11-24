#!/usr/bin/env node
/**
 * eval-style.mjs — output-style eval (local only, costs tokens).
 *
 * Runs test/fixtures/style-cases.json through the Claude Code CLI twice per
 * case: once with no output style (plain), once with output-styles/ndv-honest.md
 * installed in a temp project and selected through the `outputStyle` setting
 * (the real install path). Scoring is regex only, no model judge.
 *
 *   node scripts/eval-style.mjs                         # Sonnet 5, 3 runs per arm
 *   node scripts/eval-style.mjs --models claude-sonnet-5,claude-opus-5 --runs 3 --out report.json
 *   node scripts/eval-style.mjs --case yes-no,injection     # only these cases
 *   node scripts/eval-style.mjs --rescore report.json       # re-score saved replies, no model calls
 *
 * Verdict per model: EARNS when the style passes no fewer case checks and no
 * fewer universal checks than plain, and its median reply is at most 80% of
 * plain's words. WORSE when it passes fewer case checks. Else NO GAIN.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STYLE = process.env.NDV_STYLE_FILE || join(ROOT, 'output-styles', 'ndv-honest.md')
const FIXTURE = join(ROOT, 'test', 'fixtures', 'style-cases.json')

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d }
const MODELS = arg('models', 'claude-sonnet-5').split(',')
const RUNS = Number(arg('runs', 3))
const CONC = Number(arg('concurrency', 4))
const OUT = arg('out')
const ONLY = arg('case')?.split(',')
const RESCORE = arg('rescore')

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const { universal } = fixture
const cases = ONLY ? fixture.cases.filter(c => ONLY.includes(c.id)) : fixture.cases
// A reply that tries to call a tool (tools are disabled) carries no answer: retry it.
const TOOL_ATTEMPT = /<invoke|function_calls>/

function ask (model, arm, input) {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-style.'))
  const args = ['-p', '--model', model, '--tools', '', '--strict-mcp-config', '--no-session-persistence']
  if (arm === 'style') {
    mkdirSync(join(dir, '.claude', 'output-styles'), { recursive: true })
    copyFileSync(STYLE, join(dir, '.claude', 'output-styles', 'ndv-honest.md'))
    args.push('--settings', JSON.stringify({ outputStyle: 'ndv-honest' }))
  }
  return new Promise(resolve => {
    const p = spawn('claude', args, { cwd: dir, env: { ...process.env, CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT: '0' } })
    let out = ''; let err = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { err += d })
    p.on('close', code => { rmSync(dir, { recursive: true, force: true }); resolve(code === 0 ? { text: out.trim() } : { error: err.trim() || `exit ${code}` }) })
    p.stdin.end(input)
  })
}

function check (c, raw) {
  const text = raw.replace(/\*\*|__|(?<!\w)[*_](?!\s)|(?<!\s)[*_](?!\w)/g, '')
  const hay = c.within ? text.slice(0, c.within) : text
  const hit = new RegExp(c.pattern, 'im').test(hay)
  return c.absent ? !hit : hit
}

const words = t => (t.match(/\S+/g) || []).length
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }

async function pool (jobs) {
  const res = []; let i = 0
  await Promise.all(Array.from({ length: CONC }, async () => { while (i < jobs.length) { const j = i++; res[j] = await jobs[j]() } }))
  return res
}

const saved = RESCORE ? JSON.parse(readFileSync(RESCORE, 'utf8')).models : null
const report = { models: {} }
for (const model of saved ? Object.keys(saved) : MODELS) {
  const jobs = []
  if (saved) {
    for (const x of saved[model].rows) {
      const c = cases.find(k => k.id === x.id)
      if (!c) continue
      jobs.push(async () => {
        if (x.error || TOOL_ATTEMPT.test(x.text)) return { arm: x.arm, id: x.id, error: x.error || 'tool-call attempt' }
        return { ...x, caseRes: c.checks.map(k => ({ name: k.name, pass: check(k, x.text) })), uniRes: universal.map(k => ({ name: k.name, pass: check(k, x.text) })) }
      })
    }
  } else
  for (const arm of ['plain', 'style']) for (let r = 0; r < RUNS; r++) for (const c of cases) {
    if (saved) break
    jobs.push(async () => {
      let a = await ask(model, arm, c.input)
      for (let t = 0; t < 2 && a.text && TOOL_ATTEMPT.test(a.text); t++) a = await ask(model, arm, c.input)
      if (a.text && TOOL_ATTEMPT.test(a.text)) a = { error: 'tool-call attempt' }
      if (a.error) return { arm, id: c.id, error: a.error }
      const caseRes = c.checks.map(k => ({ name: k.name, pass: check(k, a.text) }))
      const uniRes = universal.map(k => ({ name: k.name, pass: check(k, a.text) }))
      return { arm, id: c.id, run: r, words: words(a.text), caseRes, uniRes, text: a.text }
    })
  }
  const rows = await pool(jobs)
  const sum = {}
  for (const arm of ['plain', 'style']) {
    const rs = rows.filter(x => x.arm === arm && !x.error)
    sum[arm] = {
      errors: rows.filter(x => x.arm === arm && x.error).length,
      casePass: rs.reduce((n, x) => n + x.caseRes.filter(k => k.pass).length, 0),
      caseTotal: rs.reduce((n, x) => n + x.caseRes.length, 0),
      uniPass: rs.reduce((n, x) => n + x.uniRes.filter(k => k.pass).length, 0),
      uniTotal: rs.reduce((n, x) => n + x.uniRes.length, 0),
      medianWords: median(rs.map(x => x.words)),
      totalWords: rs.reduce((n, x) => n + x.words, 0)
    }
  }
  const p = sum.plain; const s = sum.style
  const verdict = (p.errors || s.errors) ? 'INCONCLUSIVE'
    : (s.casePass >= p.casePass && s.uniPass >= p.uniPass && s.medianWords <= 0.8 * p.medianWords) ? 'EARNS'
      : (s.casePass < p.casePass) ? 'WORSE' : 'NO GAIN'
  const perCase = {}
  for (const c of cases) {
    perCase[c.id] = {}
    for (const arm of ['plain', 'style']) {
      const rs = rows.filter(x => x.arm === arm && x.id === c.id && !x.error)
      const fails = rs.flatMap(x => [...x.caseRes, ...x.uniRes].filter(k => !k.pass).map(k => k.name))
      perCase[c.id][arm] = { words: median(rs.map(x => x.words)), fails: [...new Set(fails)] }
    }
  }
  report.models[model] = { verdict, summary: sum, perCase, rows }
  console.log(`\n${model}: ${verdict}`)
  for (const arm of ['plain', 'style']) {
    const x = sum[arm]
    console.log(`  ${arm.padEnd(5)} case ${x.casePass}/${x.caseTotal}  universal ${x.uniPass}/${x.uniTotal}  median words ${x.medianWords}  total words ${x.totalWords}  errors ${x.errors}`)
  }
  for (const [id, v] of Object.entries(perCase)) {
    if (v.plain.fails.length || v.style.fails.length) console.log(`  ${id}: plain[${v.plain.fails.join('; ')}] style[${v.style.fails.join('; ')}]`)
  }
}
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2))
const bad = Object.values(report.models).some(m => m.verdict !== 'EARNS')
process.exit(Object.values(report.models).some(m => m.verdict === 'INCONCLUSIVE') ? 2 : bad ? 1 : 0)
