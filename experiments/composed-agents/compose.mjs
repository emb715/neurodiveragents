#!/usr/bin/env node
// Compose an agent source file whose body invokes skills with `@skill <name>`
// lines into one of two renderings:
//   --inline   flat agent file: each skill's body (frontmatter stripped, text
//              below the workflow-only marker dropped) stands in for its
//              @skill line; `skills:` dropped from frontmatter. When the source
//              carries an `ndv:layout` comment, sections are emitted in that
//              order (the original agent's), so the flat file reads like today's.
//              For platforms without Agent Skills, and for system-prompt evals.
//   --runtime  agent file that loads its skills at run time: each @skill line
//              becomes a load instruction; `skills:` kept for platforms that
//              preload skills from agent frontmatter.
// Skills name other agents by role ({{security}}); both renderings resolve the
// roles from roles.json (--roles to use another mapping): --inline writes the
// agent names in place, --runtime adds a role table for the skills it loads.
// Usage: node compose.mjs <src.md> --inline|--runtime [--skills-dir dir] [--roles file]
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [src, mode = '--inline'] = process.argv.slice(2)
const i = process.argv.indexOf('--skills-dir')
const SKILLS = i > 0 ? process.argv[i + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills')
const MARK = '<!-- ndv:workflow-only -->'
const r = process.argv.indexOf('--roles')
const ROLES = JSON.parse(readFileSync(r > 0 ? process.argv[r + 1] : join(dirname(fileURLToPath(import.meta.url)), 'roles.json'), 'utf8'))
const ROLE = /\{\{([a-z-]+)\}\}/g
const agentFor = role => { if (!ROLES[role]) throw new Error(`no agent for role {{${role}}} in roles file`); return ROLES[role] }
const fill = t => t.replace(ROLE, (_, role) => agentFor(role))

const text = readFileSync(src, 'utf8')
const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
if (!m) throw new Error('no frontmatter')
let [, fm, body] = m
const layoutMatch = body.match(/<!-- ndv:layout (\[.*?\]) -->\n*/)
const layout = layoutMatch ? JSON.parse(layoutMatch[1]) : null
body = body.replace(/<!-- ndv:layout .*? -->\n*/, '')

const skillBody = name => {
  const p = join(SKILLS, name, 'SKILL.md')
  if (!existsSync(p)) throw new Error(`@skill ${name}: ${p} not found`)
  return readFileSync(p, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').split(MARK)[0].trim()
}

// Split markdown into [preamble, ...sections] on level-2 headings outside code fences.
function sections(md) {
  const out = []; let cur = []; let fence = false
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) fence = !fence
    if (line.startsWith('## ') && !fence) { out.push(cur.join('\n').trim()); cur = [] }
    cur.push(line)
  }
  out.push(cur.join('\n').trim())
  return out
}

if (mode === '--inline') {
  body = fill(body.replace(/^@skill ([a-z0-9-]+)\s*$/gm, (_, name) => skillBody(name)))
  layout?.forEach((t, k) => { layout[k] = fill(t) })
  fm = fm.replace(/\nskills:\n(  - .*\n?)+/, '\n').replace(/\n+$/, '')
  if (layout) {
    const [pre, ...secs] = sections(body)
    const title = s => s.split('\n')[0].slice(3).trim()
    const byTitle = new Map(secs.map(s => [title(s), s]))
    const ordered = []
    for (const t of layout) {
      if (t === 'Self-Validation Protocol' && byTitle.has('Domain Soundness Checks')) { ordered.push(byTitle.get('Domain Soundness Checks')); byTitle.delete('Domain Soundness Checks') }
      if (byTitle.has(t)) { ordered.push(byTitle.get(t)); byTitle.delete(t) }
    }
    body = [pre, ...ordered, ...byTitle.values()].filter(Boolean).join('\n\n')
  }
} else {
  const used = [...new Set([...body.matchAll(/^@skill ([a-z0-9-]+)\s*$/gm)].flatMap(m => [...skillBody(m[1]).matchAll(ROLE)].map(x => x[1])))]
  body = body.replace(/^@skill ([a-z0-9-]+)\s*$/gm, (_, name) =>
    `Before anything else, load the \`${name}\` skill with the Skill tool and apply all of it. It is a required part of this agent, not optional reference.`)
  if (used.length) body += `\n\n## Roles\n\nThe skills name other agents by role, as \`{{role}}\`. In this fleet:\n\n${used.map(x => `- \`{{${x}}}\` → \`${agentFor(x)}\``).join('\n')}`
}
process.stdout.write(`---\n${fm}\n---\n\n${body.trim()}\n`)
