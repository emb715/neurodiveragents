// Static persona-loss and layer-boundary checks for composed agents.
// Free and deterministic: catches the realistic way a persona gets lost
// (a layer missing, renamed, or not reaching the build), not drift in tone.
//   node --test experiments/composed-agents/check-layers.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const MARK = '<!-- ndv:workflow-only -->'
const fm = t => Object.fromEntries([...(t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').matchAll(/^\s*([a-z-]+):\s*(.+)$/gm)].map(m => [m[1], m[2].trim()]))
const body = t => t.replace(/^---\n[\s\S]*?\n---\n/, '')
const skill = n => readFileSync(join(ROOT, 'skills', n, 'SKILL.md'), 'utf8')
// Fixed phrases where a character name is an ordinary word (same list as split_agent.py).
const PROTECT = ['| Signal |', '### Flow', 'Signal-to-noise', 'signal-to-noise', 'Edge case', 'Boy Scout', 'Complexity Signal']
const ROLES = JSON.parse(readFileSync(join(HERE, 'roles.json'), 'utf8'))
const fill = t => t.replace(/\{\{([a-z-]+)\}\}/g, (_, r) => ROLES[r])
// every agent slug and character name in the fleet
const AGENTS = readdirSync(join(ROOT, 'agents')).filter(f => /^ndv-.*\.md$/.test(f)).map(f => f.slice(0, -3))
const CHARS = Object.fromEntries(AGENTS.map(a => [a, readFileSync(join(ROOT, 'agents', a + '.md'), 'utf8').match(/You are \*\*(\w+)\*\*/)?.[1]]).filter(([, c]) => c))
// names a layer must not contain: every agent slug, every character but `own`
const namesIn = (t, own) => {
  const masked = PROTECT.reduce((s, ph) => s.split(ph).join(''), t)
  return [...AGENTS.filter(a => new RegExp(`(?<![\\w-])${a}(?![\\w-])`).test(masked)),
          ...Object.values(CHARS).filter(c => c !== own && new RegExp(`\\b${c}\\b`).test(masked))]
}
const sectionsOf = md => { const out = []; let cur = [], fence = false; for (const l of md.split('\n')) { if (l.startsWith('```')) fence = !fence; if (l.startsWith('## ') && !fence) { out.push(cur.join('\n').trim()); cur = [] } cur.push(l) } out.push(cur.join('\n').trim()); return out.filter(Boolean) }
const sources = readdirSync(HERE).filter(f => f.endsWith('.src.md') && f !== 'ndv-inspect.src.md')

for (const src of sources) {
  const slug = src.replace('.src.md', '')
  const text = readFileSync(join(HERE, src), 'utf8')
  const refs = [...text.matchAll(/^@skill ([a-z0-9-]+)$/gm)].map(m => m[1])

  test(`${slug}: one identity first, then only domains`, () => {
    assert.ok(refs[0]?.startsWith('ndv-neurotype-'), `first @skill must be a neurotype, got ${refs[0]}`)
    assert.equal(refs.filter(r => r.startsWith('ndv-neurotype-')).length, 1, 'exactly one identity')
    assert.ok(refs.slice(1).every(r => r.startsWith('ndv-domain-')), 'domains after the identity')
    for (const r of refs) assert.ok(existsSync(join(ROOT, 'skills', r, 'SKILL.md')), `${r} exists`)
    const listed = text.match(/\nskills:\n((?:  - .*\n)+)/)?.[1].match(/ndv-[a-z0-9-]+/g)
    assert.deepEqual(listed, refs, 'frontmatter skills: matches the @skill lines, in order')
  })

  test(`${slug}: identity skill carries the whole persona`, () => {
    const id = skill(refs[0])
    assert.equal(fm(id).layer, 'identity')
    const core = body(id).split(MARK)[0]
    assert.match(core, /You are \*\*\w+\*\*/, 'persona paragraph')
    assert.match(core, /^## Primordial Rule$|PRIMORDIAL RULE:/m, 'Primordial Rule')
    if (refs.length > 1) assert.match(core, /^## What \w+ Never Does$/m, 'Never Does')
    const module = fm(id).module
    assert.equal(id.includes(MARK), module !== '-', 'workflow-only part exactly when a published module exists')
  })

  test(`${slug}: skills name no other agent, only roles that resolve`, () => {
    const own = skill(refs[0]).match(/You are \*\*(\w+)\*\*/)[1]
    for (const r of refs) {
      const t = body(skill(r)).split(MARK)[0]
      if (r !== refs[0]) assert.equal(fm(skill(r)).layer, 'domain')
      assert.deepEqual(namesIn(t, r === refs[0] ? own : null), [], `${r} names other agents`)
      for (const [, role] of t.matchAll(/\{\{([a-z-]+)\}\}/g)) assert.ok(ROLES[role], `${r}: {{${role}}} is in roles.json`)
    }
  })

  test(`${slug}: the inline build contains the identity verbatim and nothing workflow-only`, () => {
    const built = execFileSync('node', [join(HERE, 'compose.mjs'), join(HERE, src), '--inline'], { encoding: 'utf8' })
    for (const part of sectionsOf(body(skill(refs[0])).split(MARK)[0]))
      assert.ok(built.includes(fill(part)), `identity part reaches the build unchanged: ${part.slice(0, 60)}`)
    assert.ok(!built.includes('## Cognitive Core'), 'workflow-only section stays out')
    assert.ok(!/^@skill /m.test(built), 'no unresolved @skill lines')
    assert.ok(!/\{\{[a-z-]+\}\}/.test(built), 'no unresolved roles')
    assert.ok(!/^skills:/m.test(built), 'no skills: frontmatter in the flat build')
  })

  test(`${slug}: the runtime build loads the identity first`, () => {
    const built = execFileSync('node', [join(HERE, 'compose.mjs'), join(HERE, src), '--runtime'], { encoding: 'utf8' })
    const loads = [...built.matchAll(/load the `([a-z0-9-]+)` skill/g)].map(m => m[1])
    assert.deepEqual(loads, refs)
  })
}
