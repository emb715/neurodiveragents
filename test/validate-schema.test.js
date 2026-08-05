/**
 * validate-schema.test.js
 *
 * Structural schema tests for agent and human files.
 * Concern: does each file satisfy its format contract?
 *
 * Runs on every agent and human file unconditionally.
 * Does not depend on CHANGED_AGENTS.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  AGENTS_DIR, HUMANS_DIR, ROOT,
  VALID_TOOLS, MIN_DESCRIPTION_LENGTH, MIN_BODY_LINES,
  parseFrontmatter, agentFiles, humanFiles,
} from './helpers.js'

// ─── agent file schema ───────────────────────────────────────────────────────

describe('agent files (agents/*.md)', () => {
  const agents = agentFiles()

  test('at least one agent file exists', () => {
    assert.ok(agents.length >= 1, 'No agent files found in agents/')
  })

  for (const agent of agents) {
    describe(agent.file, () => {

      test('has valid YAML frontmatter block', () => {
        parseFrontmatter(agent.content, agent.file)
      })

      test('frontmatter: name field present and non-empty', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const name = get('name')
        assert.ok(name, `${agent.file}: frontmatter missing "name" field`)
        assert.ok(name.length > 0, `${agent.file}: "name" field is empty`)
      })

      test('frontmatter: name matches filename', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const name = get('name')
        assert.equal(
          name,
          agent.name,
          `${agent.file}: frontmatter name="${name}" does not match filename "${agent.name}"`
        )
      })

      test('frontmatter: description present and substantive (>50 chars)', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const desc = get('description')
        assert.ok(desc, `${agent.file}: frontmatter missing "description" field`)
        assert.ok(
          desc.length >= MIN_DESCRIPTION_LENGTH,
          `${agent.file}: description too short (${desc.length} chars, min ${MIN_DESCRIPTION_LENGTH}) — this is the routing signal, make it substantive`
        )
      })

      test('frontmatter: description does not start with agent name (routing signal, not a label)', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const desc = get('description') ?? ''
        const name = get('name') ?? ''
        assert.ok(
          !desc.toLowerCase().startsWith(name.toLowerCase()),
          `${agent.file}: description starts with the agent name — write the routing trigger, not a label`
        )
      })

      test('frontmatter: no "model" field (host-injected, not source-authored)', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const model = get('model')
        assert.equal(model, null, `${agent.file}: "model" field must be absent — the host injects the model, source files are model-agnostic`)
      })

      test('frontmatter: no "effort" field (host-injected, not source-authored)', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const effort = get('effort')
        assert.equal(effort, null, `${agent.file}: "effort" field must be absent — the host injects the effort level, source files are effort-agnostic`)
      })

      test('frontmatter: no "agent" field (invalid Claude Code key, must be absent)', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const agentField = get('agent')
        assert.equal(agentField, null, `${agent.file}: "agent" field must be removed — it is not a valid Claude Code frontmatter key`)
      })

      test('frontmatter: tools list present and non-empty', () => {
        const { tools } = parseFrontmatter(agent.content, agent.file)
        assert.ok(tools.length > 0, `${agent.file}: frontmatter "tools" list is missing or empty`)
      })

      test('frontmatter: all tools are in the known valid set', () => {
        const { tools } = parseFrontmatter(agent.content, agent.file)
        const invalid = tools.filter(t => !VALID_TOOLS.has(t))
        assert.deepEqual(
          invalid,
          [],
          `${agent.file}: unknown tools: ${invalid.join(', ')} — valid tools are: ${[...VALID_TOOLS].join(', ')}`
        )
      })

      test('body: not empty (agent must have instructions)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const lines = body.trim().split('\n').filter(l => l.trim().length > 0)
        assert.ok(
          lines.length >= MIN_BODY_LINES,
          `${agent.file}: body has only ${lines.length} non-empty lines (min ${MIN_BODY_LINES}) — LLM has nothing to act on`
        )
      })

      test('body: no raw HTML tags (breaks markdown rendering in some tools)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const htmlTags = body.match(/<[a-z][^>]*>/gi) ?? []
        const nonBr = htmlTags.filter(t => t.toLowerCase() !== '<br>')
        assert.deepEqual(nonBr, [], `${agent.file}: raw HTML tags found: ${nonBr.join(', ')}`)
      })

      test('body: no TODO or FIXME markers outside code blocks (agent file must be complete)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const stripped = body.replace(/```[\s\S]*?```/g, '')
        const todos = stripped.match(/\b(TODO|FIXME)\b/g) ?? []
        assert.deepEqual(todos, [], `${agent.file}: unresolved ${todos.join(', ')} in agent body (outside code blocks)`)
      })

      test('body: uses bold character name in first paragraph (identity anchor for LLM)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const firstPara = body.split('\n\n')[0]
        const boldMatch = firstPara.match(/\*\*([^*]+)\*\*/)
        assert.ok(
          boldMatch,
          `${agent.file}: no bold name found in first paragraph — LLM needs identity anchor like "You are **Name**."`
        )
      })

    })
  }
})

// ─── agent frontmatter: mode field validation ────────────────────────────────

describe('agent frontmatter: mode field valid values (when present)', () => {
  const VALID_MODES = new Set(['agent', 'subagent', 'all'])
  const agents = agentFiles()

  for (const agent of agents) {
    describe(agent.file, () => {

      test('mode field (if present) must be one of: agent, subagent, all', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const mode = get('mode')
        if (mode === null) return
        assert.ok(
          VALID_MODES.has(mode),
          `${agent.file}: invalid mode="${mode}" — must be one of: ${[...VALID_MODES].join(', ')}`
        )
      })

    })
  }
})

// ─── human file schema ───────────────────────────────────────────────────────

describe('human files (humans/*.human.md)', () => {
  const humans = humanFiles()

  test('at least one human file exists', () => {
    assert.ok(humans.length >= 1, 'No human files found in humans/')
  })

  for (const human of humans) {
    describe(human.file, () => {

      test('H1 follows pattern "Character — ndv-agentname"', () => {
        const h1 = human.content.match(/^# (.+)/m)
        assert.ok(h1, `${human.file}: missing H1 title`)
        assert.match(
          h1[1],
          /^.+ — ndv-\w+$/,
          `${human.file}: H1 must follow "Character — ndv-agentname" pattern, got: "${h1[1]}"`
        )
      })

      test('H1 agent slug matches filename', () => {
        const h1 = human.content.match(/^# (.+)/m)
        assert.ok(h1, `${human.file}: missing H1`)
        const slugMatch = h1[1].match(/ndv-(\w+)$/)
        assert.ok(slugMatch, `${human.file}: H1 does not contain ndv-<name> slug`)
        assert.equal(
          `ndv-${slugMatch[1]}`,
          human.name,
          `${human.file}: H1 slug "ndv-${slugMatch[1]}" does not match filename "${human.name}"`
        )
      })

      test('has ## Who is X? section', () => {
        assert.match(human.content, /^## Who is .+\?/m, `${human.file}: missing "## Who is X?" section`)
      })

      test('has ## Neurotype section', () => {
        assert.match(human.content, /^## Neurotype/m, `${human.file}: missing "## Neurotype" section`)
      })

      test('has ## When to use section', () => {
        assert.match(human.content, /^## When to use/m, `${human.file}: missing "## When to use" section`)
      })

      test('has ## Invocation section with a code block', () => {
        assert.match(human.content, /^## Invocation/m, `${human.file}: missing "## Invocation" section`)
        const afterInvocation = human.content.split(/^## Invocation/m)[1] ?? ''
        assert.match(afterInvocation, /```/, `${human.file}: ## Invocation section has no code block — must include usage examples`)
      })

      test('Invocation code block contains at least one "Use ndv-" example', () => {
        const afterInvocation = human.content.split(/^## Invocation/m)[1] ?? ''
        assert.match(afterInvocation, /Use ndv-\w+/, `${human.file}: Invocation block must contain at least one "Use ndv-<name>" example`)
      })

      test('no empty sections (## header with no content before next ##)', () => {
        const sections = human.content.split(/^## /m).slice(1)
        for (const section of sections) {
          const lines = section.split('\n')
          const header = lines[0].trim()
          const body = lines.slice(1).join('\n').trim()
          assert.ok(body.length > 0, `${human.file}: section "## ${header}" is empty`)
        }
      })

    })
  }
})

// ─── cross-file symmetry ─────────────────────────────────────────────────────

describe('symmetry: every agent file must have a human file and vice versa', () => {
  const agentNames = new Set(agentFiles().map(a => a.name))
  const humanNames = new Set(humanFiles().map(h => h.name))

  test('every agent has a corresponding human file', () => {
    const missing = [...agentNames].filter(n => !humanNames.has(n))
    assert.deepEqual(missing, [], `Agents missing a human file: ${missing.join(', ')}\nCreate humans/<name>.human.md for each.`)
  })

  test('every human file has a corresponding agent file', () => {
    const orphaned = [...humanNames].filter(n => !agentNames.has(n))
    assert.deepEqual(orphaned, [], `Human files with no agent: ${orphaned.join(', ')}\nEither add the agent or remove the human file.`)
  })

  test('character name in human H1 matches bold name in agent body', () => {
    for (const agent of agentFiles()) {
      const humanPath = join(HUMANS_DIR, `${agent.name}.human.md`)
      try {
        const humanContent = readFileSync(humanPath, 'utf8')
        const h1 = humanContent.match(/^# (.+)/m)
        if (!h1) continue
        const characterInH1 = h1[1].split(' — ')[0].trim()
        const { body } = parseFrontmatter(agent.content, agent.file)
        const firstPara = body.split('\n\n')[0]
        const boldMatch = firstPara.match(/\*\*([^*]+)\*\*/)
        if (!boldMatch) continue
        assert.equal(
          characterInH1,
          boldMatch[1],
          `Character mismatch: ${agent.file} body says "${boldMatch[1]}" but ${agent.name}.human.md H1 says "${characterInH1}"`
        )
      } catch (e) {
        if (e.code === 'ENOENT') continue
        throw e
      }
    }
  })
})
