/**
 * Agent file validation — structural contracts for LLM consumption.
 *
 * agents/<name>.md    — machine-consumed by Claude Code / OpenCode / Cursor
 * humans/<name>.human.md — human-readable character profiles
 *
 * Both must satisfy their respective schemas for every agent in the fleet.
 *
 * Authoring-guide checks (scoped to changed files in CI via CHANGED_AGENTS env var):
 * - No file references in model body
 * - No skill references in model body
 * - Required sections present
 * - Routing entries exist in CLAUDE.md, ndv-flow.md, humans/ndv-agents.md
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const AGENTS_DIR = join(ROOT, 'agents')
const HUMANS_DIR = join(ROOT, 'humans')

// When set, authoring-guide checks run only on these agent names (no path, no extension).
// CI sets this via the diff-scoped job.
// When unset locally, the describe blocks run but produce no tests (agentsToAudit = []).
const CHANGED_AGENTS = process.env.CHANGED_AGENTS
  ? process.env.CHANGED_AGENTS.split(',').map(s => s.trim()).filter(Boolean)
  : null

// ─── constants ───────────────────────────────────────────────────────────────

const VALID_TOOLS = new Set(['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Task'])

const MIN_DESCRIPTION_LENGTH = 50
const MIN_BODY_LINES = 5

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseFrontmatter(content, filePath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  assert.ok(match, `${filePath}: missing or malformed YAML frontmatter (must start with --- block)`)

  const raw = match[1]
  const body = match[2]

  // Minimal YAML field extraction — no external dep
  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return m ? m[1].trim() : null
  }

  // tools is a YAML list
  const toolsMatch = raw.match(/^tools:\s*\n((?:  - .+\n?)+)/m)
  const tools = toolsMatch
    ? toolsMatch[1].match(/- (.+)/g).map(l => l.replace('- ', '').trim())
    : []

  return { raw, body, get, tools }
}

function agentFiles() {
  return readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      file: f,
      name: f.replace('.md', ''),
      path: join(AGENTS_DIR, f),
      content: readFileSync(join(AGENTS_DIR, f), 'utf8'),
    }))
}

function humanFiles() {
  return readdirSync(HUMANS_DIR)
    .filter(f => f.endsWith('.human.md'))
    .map(f => ({
      file: f,
      name: f.replace('.human.md', ''),
      path: join(HUMANS_DIR, f),
      content: readFileSync(join(HUMANS_DIR, f), 'utf8'),
    }))
}

// ─── agent file schema ───────────────────────────────────────────────────────

describe('agent files (agents/*.md)', () => {
  const agents = agentFiles()

  test('at least one agent file exists', () => {
    assert.ok(agents.length >= 1, 'No agent files found in agents/')
  })

  for (const agent of agents) {
    describe(agent.file, () => {

      test('has valid YAML frontmatter block', () => {
        // Just calling parseFrontmatter asserts the block exists
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

      test('frontmatter: model field present and non-empty', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const model = get('model')
        assert.ok(model, `${agent.file}: frontmatter missing "model" field`)
        assert.ok(model.length > 0, `${agent.file}: "model" field is empty`)
      })

      test('frontmatter: effort field present and non-empty', () => {
        const { get } = parseFrontmatter(agent.content, agent.file)
        const effort = get('effort')
        assert.ok(effort, `${agent.file}: frontmatter missing "effort" field`)
        assert.ok(effort.length > 0, `${agent.file}: "effort" field is empty`)
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
        // Allow <br> as it's sometimes used in tables
        const nonBr = htmlTags.filter(t => t.toLowerCase() !== '<br>')
        assert.deepEqual(nonBr, [], `${agent.file}: raw HTML tags found: ${nonBr.join(', ')}`)
      })

      test('body: no TODO or FIXME markers outside code blocks (agent file must be complete)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        // Strip fenced code blocks before checking — grep examples inside ``` are legitimate
        const stripped = body.replace(/```[\s\S]*?```/g, '')
        const todos = stripped.match(/\b(TODO|FIXME)\b/g) ?? []
        assert.deepEqual(todos, [], `${agent.file}: unresolved ${todos.join(', ')} in agent body (outside code blocks)`)
      })

      test('body: uses bold character name in first paragraph (identity anchor for LLM)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const firstPara = body.split('\n\n')[0]
        // Character name is embedded as **Name** in the first paragraph
        const boldMatch = firstPara.match(/\*\*([^*]+)\*\*/)
        assert.ok(
          boldMatch,
          `${agent.file}: no bold name found in first paragraph — LLM needs identity anchor like "You are **Name**."`
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
        assert.match(
          human.content,
          /^## Who is .+\?/m,
          `${human.file}: missing "## Who is X?" section`
        )
      })

      test('has ## Neurotype section', () => {
        assert.match(
          human.content,
          /^## Neurotype/m,
          `${human.file}: missing "## Neurotype" section`
        )
      })

      test('has ## When to use section', () => {
        assert.match(
          human.content,
          /^## When to use/m,
          `${human.file}: missing "## When to use" section`
        )
      })

      test('has ## Invocation section with a code block', () => {
        assert.match(
          human.content,
          /^## Invocation/m,
          `${human.file}: missing "## Invocation" section`
        )
        const afterInvocation = human.content.split(/^## Invocation/m)[1] ?? ''
        assert.match(
          afterInvocation,
          /```/,
          `${human.file}: ## Invocation section has no code block — must include usage examples`
        )
      })

      test('Invocation code block contains at least one "Use ndv-" example', () => {
        const afterInvocation = human.content.split(/^## Invocation/m)[1] ?? ''
        assert.match(
          afterInvocation,
          /Use ndv-\w+/,
          `${human.file}: Invocation block must contain at least one "Use ndv-<name>" example`
        )
      })

      test('no empty sections (## header with no content before next ##)', () => {
        const sections = human.content.split(/^## /m).slice(1)
        for (const section of sections) {
          const lines = section.split('\n')
          const header = lines[0].trim()
          const body = lines.slice(1).join('\n').trim()
          assert.ok(
            body.length > 0,
            `${human.file}: section "## ${header}" is empty`
          )
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
    assert.deepEqual(
      missing,
      [],
      `Agents missing a human file: ${missing.join(', ')}\nCreate humans/<name>.human.md for each.`
    )
  })

  test('every human file has a corresponding agent file', () => {
    const orphaned = [...humanNames].filter(n => !agentNames.has(n))
    assert.deepEqual(
      orphaned,
      [],
      `Human files with no agent: ${orphaned.join(', ')}\nEither add the agent or remove the human file.`
    )
  })

  test('character name in human H1 matches bold name in agent body', () => {
    for (const agent of agentFiles()) {
      const humanPath = join(HUMANS_DIR, `${agent.name}.human.md`)
      try {
        const humanContent = readFileSync(humanPath, 'utf8')
        const h1 = humanContent.match(/^# (.+)/m)
        if (!h1) continue

        const characterInH1 = h1[1].split(' — ')[0].trim()

        // Extract character from first bold in agent body ("You are **Name**.")
        const { body } = parseFrontmatter(agent.content, agent.file)
        const firstPara = body.split('\n\n')[0]
        const boldMatch = firstPara.match(/\*\*([^*]+)\*\*/)
        if (!boldMatch) continue // caught by identity anchor test above

        assert.equal(
          characterInH1,
          boldMatch[1],
          `Character mismatch: ${agent.file} body says "${boldMatch[1]}" but ${agent.name}.human.md H1 says "${characterInH1}"`
        )
      } catch (e) {
        if (e.code === 'ENOENT') continue // caught by symmetry test
        throw e
      }
    }
  })
})

// ─── authoring-guide checks (scoped to changed agents in CI) ─────────────────
//
// Run only against changed agents (CHANGED_AGENTS env var set by CI).
// When unset, agentsToAudit is empty — describe blocks register but produce no tests.
// This keeps the existing fleet (already vetted on main) outside these checks.

const agentsToAudit = CHANGED_AGENTS
  ? agentFiles().filter(a => CHANGED_AGENTS.includes(a.name))
  : []

describe('authoring-guide: model body constraints', () => {
  if (agentsToAudit.length === 0) {
    test('no changed agent files to audit', () => {
      // Nothing to check — pass trivially
    })
    return
  }

  for (const agent of agentsToAudit) {
    describe(agent.file, () => {

      test('body: no file references (no markdown links, relative paths, or fleet filenames)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        // Strip fenced code blocks — examples inside ``` are legitimate
        const stripped = body.replace(/```[\s\S]*?```/g, '')

        // Markdown links: [text](path)
        const mdLinks = stripped.match(/\[[^\]]+\]\([^)]+\)/g) ?? []
        assert.deepEqual(
          mdLinks,
          [],
          `${agent.file}: markdown links found (ADR-001 — no file references): ${mdLinks.join(', ')}`
        )

        // Relative paths pointing to fleet dirs: agents/, humans/, docs/, skills/, modules/
        const fleetPaths = stripped.match(/\b(agents|humans|docs|skills|modules)\/\S+/g) ?? []
        assert.deepEqual(
          fleetPaths,
          [],
          `${agent.file}: fleet directory references found: ${fleetPaths.join(', ')}`
        )

        // Filenames with .md extension (fleet doc references)
        const mdFiles = stripped.match(/\b[\w-]+\.md\b/g) ?? []
        assert.deepEqual(
          mdFiles,
          [],
          `${agent.file}: .md filename references found: ${mdFiles.join(', ')}`
        )
      })

      test('body: no skill references (agents produce skills, never consume them)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        const stripped = body.replace(/```[\s\S]*?```/g, '')

        // Patterns: "apply ndv-", "load ndv-", "use skill", "invoke skill"
        const skillRefs = stripped.match(/\b(apply|load|invoke|use skill)\s+ndv-\w+/gi) ?? []
        assert.deepEqual(
          skillRefs,
          [],
          `${agent.file}: skill consumption references found: ${skillRefs.join(', ')}`
        )
      })

      test('body: required sections present (Out of Scope, Primordial Rule, Output Format, What [Name] Never Does)', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)

        const required = [
          { pattern: /^## Out of Scope/m, label: '## Out of Scope' },
          { pattern: /^## Primordial Rule/m, label: '## Primordial Rule' },
          { pattern: /^## Output Format/m, label: '## Output Format' },
          { pattern: /^## What .+ Never Does/m, label: '## What [Name] Never Does' },
        ]

        for (const { pattern, label } of required) {
          assert.match(
            body,
            pattern,
            `${agent.file}: missing required section "${label}" (authoring-guide §4)`
          )
        }
      })

      test('body: Parallelism Strategy section present', () => {
        const { body } = parseFrontmatter(agent.content, agent.file)
        assert.match(
          body,
          /^## Parallelism Strategy/m,
          `${agent.file}: missing "## Parallelism Strategy" section (authoring-guide §4)`
        )
      })

    })
  }
})

// ─── authoring-guide: routing completeness ───────────────────────────────────
//
// Every new agent must appear in all three routing files.
// Checked only for changed/new agent files.

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
    // Extract character name from "You are **Name**." in first body paragraph
    const { body } = parseFrontmatter(agent.content, agent.file)
    const boldMatch = body.split('\n\n')[0].match(/\*\*([^*]+)\*\*/)
    const characterName = boldMatch ? boldMatch[1] : null

    describe(agent.file, () => {

      test('CLAUDE.md routing table references this agent', () => {
        assert.ok(
          claudeMd.includes(agent.name),
          `${agent.file}: not found in CLAUDE.md routing table — add a row (authoring-guide §5)`
        )
      })

      test('agents/ndv-flow.md Routing Table references this agent', () => {
        assert.ok(
          flowMd.includes(agent.name),
          `${agent.file}: not found in ndv-flow.md Routing Table — add a row (authoring-guide §5)`
        )
      })

      test('humans/ndv-agents.md fleet table references this agent (by slug or character name)', () => {
        // ndv-agents.md uses character names in the table, not slugs — check both
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
        // Extract NDV_BLOCK constant — between the template literal delimiters
        const ndvBlockMatch = ndvJs.match(/const NDV_BLOCK\s*=\s*`([\s\S]*?)`/)
        const ndvBlock = ndvBlockMatch ? ndvBlockMatch[1] : ''
        assert.ok(
          ndvBlock.includes(agent.name),
          `${agent.file}: not found in NDV_BLOCK constant in bin/ndv.js — add a routing row`
        )
      })

      test('bin/ndv.js installCopilot() header routing table references this agent', () => {
        const ndvJsPath = join(ROOT, 'bin', 'ndv.js')
        const ndvJs = existsSync(ndvJsPath) ? readFileSync(ndvJsPath, 'utf8') : ''
        // Extract the header string inside installCopilot() — between its template literal delimiters
        const copilotFnMatch = ndvJs.match(/function installCopilot\(\)\s*\{([\s\S]*?)\n\}/)
        const copilotFn = copilotFnMatch ? copilotFnMatch[1] : ''
        const headerMatch = copilotFn.match(/const header\s*=\s*`([\s\S]*?)`/)
        const header = headerMatch ? headerMatch[1] : ''
        assert.ok(
          header.includes(agent.name),
          `${agent.file}: not found in installCopilot() header string in bin/ndv.js — add a routing row`
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
        // Absence is allowed — only validate when the field is present
        if (mode === null) return
        assert.ok(
          VALID_MODES.has(mode),
          `${agent.file}: invalid mode="${mode}" — must be one of: ${[...VALID_MODES].join(', ')}`
        )
      })

    })
  }
})
