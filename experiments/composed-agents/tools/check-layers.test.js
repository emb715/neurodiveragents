// Static persona-loss and layer-boundary checks for composed agents.
// Free and deterministic: catches the realistic way a persona gets lost
// (a layer missing, renamed, or not reaching the build), not drift in tone.
//   node --test experiments/composed-agents/tools/check-layers.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = join(HERE, '..')   // experiments/composed-agents
const ROOT = join(BASE, '..', '..')
const fm = t => Object.fromEntries([...(t.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').matchAll(/^\s*([a-z-]+):\s*(.+)$/gm)].map(m => [m[1], m[2].trim()]))
const body = t => t.replace(/^---\n[\s\S]*?\n---\n/, '')
const skill = n => readFileSync(join(BASE, 'skills', n, 'SKILL.md'), 'utf8')
// Fixed phrases where a character name is an ordinary word (same list as split_agent.py).
const PROTECT = ['| Signal |', '### Flow', 'Signal-to-noise', 'signal-to-noise', 'Edge case', 'Boy Scout', 'Complexity Signal']
const ROLES = JSON.parse(readFileSync(join(BASE, 'roles.json'), 'utf8'))
const fill = (t, name) => t.replace(/\{\{([a-z-]+)\}\}/g, (_, r) => r === 'name' ? name : ROLES[r])
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
const sources = readdirSync(join(BASE, 'agents')).filter(f => f.endsWith('.src.md') && f !== 'ndv-inspect.src.md')

for (const src of sources) {
  const slug = src.replace('.src.md', '')
  const text = readFileSync(join(BASE, 'agents', src), 'utf8')
  const refs = [...text.matchAll(/^@skill ([a-z0-9-]+)$/gm)].map(m => m[1])

  test(`${slug}: one identity first, then only domains`, () => {
    assert.ok(refs[0]?.startsWith('ndv-neurotype-'), `first @skill must be a neurotype, got ${refs[0]}`)
    assert.equal(refs.filter(r => r.startsWith('ndv-neurotype-')).length, 1, 'exactly one identity')
    assert.ok(refs.slice(1).every(r => r.startsWith('ndv-domain-')), 'domains after the identity')
    for (const r of refs) assert.ok(existsSync(join(BASE, 'skills', r, 'SKILL.md')), `${r} exists`)
    const listed = text.match(/\nskills:\n((?:  - .*\n)+)/)?.[1].match(/ndv-[a-z0-9-]+/g)
    assert.deepEqual(listed, refs, 'frontmatter skills: matches the @skill lines, in order')
  })

  test(`${slug}: the name lives in the agent file, the rest of the persona in the identity skill`, () => {
    const name = text.match(/^You are \*\*(\w+)\*\*\.\n@skill (\S+)$/m)
    assert.ok(name, '"You are **Name**." sits directly above the identity @skill line')
    assert.equal(name[2], refs[0])
    const id = skill(refs[0])
    assert.equal(fm(id).layer, 'identity')
    assert.doesNotMatch(body(id), /You are \*\*/, 'no name line in the identity skill')
    assert.match(body(id), /^## Primordial Rule$|PRIMORDIAL RULE:/m, 'Primordial Rule')
    if (refs.length > 1) assert.match(body(id), /^## What \{\{name\}\} Never Does$/m, 'Never Does')
    assert.ok(!body(id).includes('## Cognitive Core'), 'one persona text, no second copy')
  })

  test(`${slug}: I/O and handoffs live in the agent file, not in a skill`, () => {
    const CONTRACT = /^## (Out of Scope|Handoffs|Brief Contract|Self-Validation Protocol|Output Format|Parallelism Strategy|Mandatory Pipeline)/
    for (const r of refs) for (const sec of sectionsOf(body(skill(r))))
      assert.doesNotMatch(sec, CONTRACT, `${r} carries a contract section: ${sec.split('\n')[0]}`)
    const original = execFileSync('git', ['-C', ROOT, 'show', `HEAD:agents/${slug}.md`], { encoding: 'utf8' })
    for (const sec of sectionsOf(body(original)).filter(x => CONTRACT.test(x)))
      assert.ok(text.includes(sec), `agent file keeps ${sec.split('\n')[0]} verbatim`)
  })

  test(`${slug}: skills name no other agent, only roles that resolve`, () => {
    for (const r of refs) {
      const t = body(skill(r))
      if (r !== refs[0]) assert.equal(fm(skill(r)).layer, 'domain')
      assert.deepEqual(namesIn(t, null), [], `${r} names an agent`)
      for (const [, role] of t.matchAll(/\{\{([a-z-]+)\}\}/g)) assert.ok(role === 'name' || ROLES[role], `${r}: {{${role}}} is in roles.json`)
    }
  })

  test(`${slug}: the inline build contains the name and the identity verbatim`, () => {
    const built = execFileSync('node', [join(HERE, 'compose.mjs'), join(BASE, 'agents', src), '--inline'], { encoding: 'utf8' })
    const name = text.match(/^You are \*\*(\w+)\*\*\.$/m)[1]
    const [first, ...rest] = sectionsOf(body(skill(refs[0])))
    assert.ok(built.includes(`You are **${name}**. ${fill(first, name)}`), 'name line and persona paragraph join in the build')
    for (const part of rest)
      assert.ok(built.includes(fill(part, name)), `identity part reaches the build unchanged: ${part.slice(0, 60)}`)
        assert.ok(!/^@skill /m.test(built), 'no unresolved @skill lines')
    assert.ok(!/\{\{[a-z-]+\}\}/.test(built), 'no unresolved roles')
    assert.ok(!/^skills:/m.test(built), 'no skills: frontmatter in the flat build')
  })

  test(`${slug}: the runtime build loads the identity first`, () => {
    const built = execFileSync('node', [join(HERE, 'compose.mjs'), join(BASE, 'agents', src), '--runtime'], { encoding: 'utf8' })
    const loads = [...built.matchAll(/load the `([a-z0-9-]+)` skill/g)].map(m => m[1])
    assert.deepEqual(loads, refs)
  })
}
