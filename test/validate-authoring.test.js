/**
 * validate-authoring.test.js
 *
 * Authoring-guide compliance tests.
 * Concern: does each changed agent follow the authoring guide rules?
 *
 * Scoped to CHANGED_AGENTS env var (set by CI diff job).
 * When unset locally, describe blocks register but produce no tests.
 *
 * Unconditional blocks (guide-rule pinning, ADR clarifications) assert the
 * amended guide/ADR text itself. They are NOT scoped by CHANGED_AGENTS: the
 * guide is one document, and a revert there must fail every run, not only
 * runs where an agent file happens to be diffed.
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

// ─── authoring-guide: guide-rule pinning (UNCONDITIONAL) ─────────────────────
//
// Pins the amended guide text (docs/authoring-guide.md). Regexes are anchored
// on stable tokens (section names, "verdict", "budget", "adversarial") so a
// legitimate rewording does not break them — but a REVERT to the old wording
// does. Two assertions pin the old forms as absent, so reverting is a red test.
//
// These check the guide document, not agent files, so they run regardless of
// CHANGED_AGENTS.

describe('authoring-guide: amended rules present (unconditional pinning)', () => {
  const guidePath = join(ROOT, 'docs', 'authoring-guide.md')
  const guide = existsSync(guidePath) ? readFileSync(guidePath, 'utf8') : ''

  test('docs/authoring-guide.md exists', () => {
    assert.ok(existsSync(guidePath), 'docs/authoring-guide.md is missing')
  })

  test('verdict-vocabulary paragraph exists with all three tier depths', () => {
    // New wording: tier-calibrated paragraph after the tier lists, before
    // "Model file rules". Anchored on stable tokens, not exact prose.
    const m = guide.match(
      /\*\*Output verdict vocabulary \(tier-calibrated\):\*\*[\s\S]*?(?=\n\*\*Model file rules)/
    )
    assert.ok(m, 'docs/authoring-guide.md: "Output verdict vocabulary (tier-calibrated)" paragraph is missing — it must sit between the tier lists and "Model file rules"')
    const paragraph = m[0]
    assert.match(paragraph, /Tier 1[\s\S]*?verdict[\s\S]*?exact command[\s\S]*?adversarial probe/i,
      'guide verdict-vocabulary paragraph: Tier 1 depth (verdict + exact command + adversarial probe) missing')
    assert.match(paragraph, /Tier 2[\s\S]*?verdict[\s\S]*?adversarial probe/i,
      'guide verdict-vocabulary paragraph: Tier 2 depth (verdict + evidence + adversarial probe) missing')
    assert.match(paragraph, /Tier 3[\s\S]*?evidence line only where the domain permits|Tier 3[\s\S]*?omit it rather than force/i,
      'guide verdict-vocabulary paragraph: Tier 3 depth (evidence line only where the domain permits; prose agents omit it) missing')
  })

  test('line ~97: abstract agnostic templates permitted — new wording present', () => {
    assert.match(guide,
      /No codebase-specific examples[^\n]*abstract[^\n]*(?:codebase-agnostic|agnostic) format templates are permitted/i,
      'docs/authoring-guide.md: the amended examples rule is missing — abstract, codebase-agnostic format templates must be explicitly permitted (old blanket "No examples" wording must not return)')
  })

  test('old blanket "No examples" wording is GONE', () => {
    assert.ok(
      !/^-\s*No examples \(bash, code, codebase-specific patterns\)\s*$/m.test(guide),
      'docs/authoring-guide.md: the old blanket "- No examples (bash, code, codebase-specific patterns)" bullet has returned — it forbids the abstract templates the amended rule permits. Restore the amended wording.'
    )
  })

  test('"Token-efficient throughout" bullet demands structural budgets, not token counts', () => {
    const bullet = guide.match(/^-\s*Token-efficient throughout.*$/m)?.[0] ?? ''
    assert.match(bullet, /structural budget|lines, bullets, or items/i,
      'docs/authoring-guide.md: "Token-efficient throughout" bullet lost the structural-budget amendment — it must authorize structural budgets (lines, bullets, items), not token counts')
    assert.ok(
      !/\b\d+\s*tokens\b/i.test(bullet),
      'docs/authoring-guide.md: "Token-efficient throughout" bullet pins a bare token count — the amendment replaced token ceilings (they rot across hosts) with structural budgets'
    )
  })

  test('point-of-failure restatement bullet exists (fault containment)', () => {
    assert.match(guide,
      /^-\s*Constraints repeated at the point of failure[^\n]*(point of failure|fault containment)/im,
      'docs/authoring-guide.md: the point-of-failure restatement bullet is missing from Model file rules — constraints a protocol step could violate must be restated at that step'
    )
  })
})

// ─── decisions.md: ADR clarifications (UNCONDITIONAL) ────────────────────────
//
// No existing test read docs/decisions.md before this block; this is the most
// fitting existing home (validate-authoring already pins guide-level rules).

describe('decisions.md: ADR clarifications present (unconditional pinning)', () => {
  const decisionsPath = join(ROOT, 'docs', 'decisions.md')
  const decisions = existsSync(join(ROOT, 'docs', 'decisions.md'))
    ? readFileSync(join(ROOT, 'docs', 'decisions.md'), 'utf8') : ''

  test('docs/decisions.md exists', () => {
    assert.ok(existsSync(join(ROOT, 'docs', 'decisions.md')), 'docs/decisions.md is missing')
  })

  test('ADR-001 carries the abstract-templates clarification', () => {
    // Scoped to the ADR-001 section so a later copy of similar wording in
    // another ADR cannot mask a deletion here.
    const section = decisions.match(/## ADR-001 [\s\S]*?(?=\n## ADR-002)/)?.[0] ?? ''
    assert.ok(section, 'docs/decisions.md: ADR-001 section not found')
    assert.match(section, /Clarification:[^\n]*abstract[^\n]*(?:format templates|codebase-agnostic)[^\n]*permitted/i,
      'docs/decisions.md ADR-001: the abstract-templates clarification sentence is missing (abstract, codebase-agnostic format templates are rules, not examples, and are permitted)')
  })

  test('ADR-008 carries the output-verdict clarification', () => {
    const section = decisions.match(/## ADR-008 [\s\S]*?(?=\n## ADR-009)/)?.[0] ?? ''
    assert.ok(section, 'docs/decisions.md: ADR-008 section not found')
    assert.match(section, /Clarification:[^\n]*(?:output-verdict|verdict)[^\n]*(?:Output Format|tier-appropriate)/i,
      'docs/decisions.md ADR-008: the output-verdict clarification sentence is missing (output-verdict verification lives in each agent\'s Output Format at tier-appropriate depth and does not constitute a Self-Validation Protocol section)')
  })
})

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
