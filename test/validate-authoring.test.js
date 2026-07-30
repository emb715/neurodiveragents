/**
 * validate-authoring.test.js
 *
 * Authoring-guide compliance tests.
 * Concern: does each changed agent follow the authoring guide rules?
 *
 * Scoped to CHANGED_AGENTS env var (set by CI diff job).
 * When unset locally, describe blocks register but produce no tests.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  ROOT, AGENTS_DIR, HUMANS_DIR,
  parseFrontmatter, agentFiles,
} from './helpers.js'

// When set, authoring-guide checks run only on these agent names (no path, no extension).
const CHANGED_AGENTS = process.env.CHANGED_AGENTS
  ? process.env.CHANGED_AGENTS.split(',').map(s => s.trim()).filter(Boolean)
  : null

const agentsToAudit = CHANGED_AGENTS
  ? agentFiles().filter(a => CHANGED_AGENTS.includes(a.name))
  : []

// ─── authoring-guide: model body constraints ─────────────────────────────────

describe('authoring-guide: model body constraints', () => {
  if (agentsToAudit.length === 0) {
    test('no changed agent files to audit', () => {})
    return
  }

  for (const agent of agentsToAudit) {
    describe(agent.file, () => {

      test('body: no file references (no markdown links, relative paths, or fleet filenames)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const stripped = body.replace(/```[\s\S]*?```/g, '')

        const mdLinks = stripped.match(/\[[^\]]+\]\([^)]+\)/g) ?? []
        assert.deepEqual(mdLinks, [], `${agent.file}: markdown links found (ADR-001 — no file references): ${mdLinks.join(', ')}`)

        const fleetPaths = stripped.match(/\b(agents|humans|docs|skills|modules)\/\S+/g) ?? []
        assert.deepEqual(fleetPaths, [], `${agent.file}: fleet directory references found: ${fleetPaths.join(', ')}`)

        const mdFiles = stripped.match(/\b[\w-]+\.md\b/g) ?? []
        assert.deepEqual(mdFiles, [], `${agent.file}: .md filename references found: ${mdFiles.join(', ')}`)
      })

      test('body: no skill references (agents produce skills, never consume them)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const stripped = body.replace(/```[\s\S]*?```/g, '')
        const skillRefs = stripped.match(/\b(apply|load|invoke|use skill)\s+ndv-\w+/gi) ?? []
        assert.deepEqual(skillRefs, [], `${agent.file}: skill consumption references found: ${skillRefs.join(', ')}`)
      })

      test('body: required sections present (Out of Scope, Primordial Rule, Output Format, What [Name] Never Does)', { skip: agent.name === 'ndv-honest' ? 'ndv-honest is a fleet-level residual agent — structural sections do not apply' : false }, () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const required = [
          { pattern: /^## Out of Scope/m, label: '## Out of Scope' },
          { pattern: /^## Primordial Rule/m, label: '## Primordial Rule' },
          { pattern: /^## Output Format/m, label: '## Output Format' },
          { pattern: /^## What .+ Never Does/m, label: '## What [Name] Never Does' },
        ]
        for (const { pattern, label } of required) {
          assert.match(body, pattern, `${agent.file}: missing required section "${label}" (authoring-guide §4)`)
        }
      })

    })
  }
})

// ─── authoring-guide: routing completeness ───────────────────────────────────

describe('authoring-guide: routing completeness', () => {
  if (agentsToAudit.length === 0) {
    test('no changed agent files to audit', () => {})
    return
  }

  const claudeMdPath = join(ROOT, 'CLAUDE.md')
  const flowMdPath = join(AGENTS_DIR, 'ndv-flow.md')
  const agentsDoctrinePath = join(HUMANS_DIR, 'ndv-agents.md')

  const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : ''
  const flowMd = existsSync(flowMdPath) ? readFileSync(flowMdPath, 'utf8') : ''
  const agentsDoctrine = existsSync(agentsDoctrinePath) ? readFileSync(agentsDoctrinePath, 'utf8') : ''

  for (const agent of agentsToAudit) {
    const { body } = parseFrontmatter(agent.content, agent.file)
    const boldMatch = body.split('\n\n')[0].match(/\*\*([^*]+)\*\*/)
    const characterName = boldMatch ? boldMatch[1] : null

    describe(agent.file, () => {

      test('CLAUDE.md routing table references this agent', () => {
        assert.ok(claudeMd.includes(agent.name), `${agent.file}: not found in CLAUDE.md routing table — add a row (authoring-guide §5)`)
      })

      test('agents/ndv-flow.md Routing Table references this agent', () => {
        assert.ok(flowMd.includes(agent.name), `${agent.file}: not found in ndv-flow.md Routing Table — add a row (authoring-guide §5)`)
      })

      test('humans/ndv-agents.md fleet table references this agent (by slug or character name)', () => {
        const foundBySlug = agentsDoctrine.includes(agent.name)
        const foundByName = characterName ? agentsDoctrine.includes(characterName) : false
        assert.ok(
          foundBySlug || foundByName,
          `${agent.file}: not found in humans/ndv-agents.md fleet table (checked slug "${agent.name}" and character "${characterName}") — add agent and doctrine section (authoring-guide §5)`
        )
      })

      test('bin/ndv.js NDV_BLOCK routing table references this agent', () => {
        const ndvJsPath = join(ROOT, 'bin', 'ndv.js')
        const ndvJs = existsSync(ndvJsPath) ? readFileSync(ndvJsPath, 'utf8') : ''
        const ndvBlockStart = ndvJs.indexOf('const NDV_BLOCK')
        const ndvBlockEnd = ndvJs.indexOf('<!-- ndv:end -->', ndvBlockStart)
        const ndvBlock = ndvBlockStart >= 0 ? ndvJs.slice(ndvBlockStart, ndvBlockEnd > 0 ? ndvBlockEnd : undefined) : ''
        assert.ok(ndvBlock.includes(agent.name), `${agent.file}: not found in NDV_BLOCK constant in bin/ndv.js — add a routing row`)
      })

      test('bin/ndv.js installCopilot() header routing table references this agent', () => {
        const ndvJsPath = join(ROOT, 'bin', 'ndv.js')
        const ndvJs = existsSync(ndvJsPath) ? readFileSync(ndvJsPath, 'utf8') : ''
        const fnStart = ndvJs.indexOf('function installCopilot()')
        const fnBody = fnStart >= 0 ? ndvJs.slice(fnStart) : ''
        const headerMatch = fnBody.match(/const header\s*=\s*`([\s\S]*?)`/)
        const header = headerMatch ? headerMatch[1] : ''
        assert.ok(header.includes(agent.name), `${agent.file}: not found in installCopilot() header string in bin/ndv.js — add a routing row`)
      })

    })
  }
})
