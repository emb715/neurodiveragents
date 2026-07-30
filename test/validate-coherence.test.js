/**
 * validate-coherence.test.js
 *
 * Semantic coherence tests for agent files.
 * Concern: do cross-references between sections hold together?
 *
 * These tests are purely static — no LLM calls, no API cost.
 * They catch a class of bugs the schema tests cannot: internal drift
 * between sections that are individually valid but mutually inconsistent.
 *
 * Checks:
 * 1. Handoff targets (→ ndv-X, ndv-X (Name)) resolve to real agent slugs
 * 2. Mandatory Pipeline entries resolve to real agent slugs
 * 3. Mandatory Pipeline agents are all Tier 1 or Tier 2 (never Tier 3)
 * 4. Brief Contract bullets each map to a named field somewhere in the body
 * 5. Self-Validation Protocol references BRIEF_REJECTED on every Tier 1/2 agent
 * 6. Out of Scope section exists and contains at least one handoff on non-residual agents
 * 7. No agent names a non-existent slug in any cross-reference
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  AGENTS_DIR,
  TIER1, TIER2, TIER3,
  parseFrontmatter, agentFiles, readAgent,
} from './helpers.js'

// ─── fleet inventory ─────────────────────────────────────────────────────────

// All valid slugs in the fleet — derived live from agents/ so adding an agent
// automatically expands what cross-references may resolve to.
const ALL_SLUGS = new Set(
  readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
)

const ALL_TIERS = new Set([...TIER1, ...TIER2, ...TIER3])

// Agents exempt from the "must have Out of Scope + handoffs" check.
// ndv-honest is a fleet-level residual — no domain boundary, no handoff targets by design.
const RESIDUAL_AGENTS = new Set(['ndv-honest'])

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract all ndv-* slugs referenced in a block of text.
 * Matches: ndv-foo, `ndv-foo`, ndv-foo (Name), → ndv-foo
 */
function extractSlugs(text) {
  const matches = text.match(/ndv-[a-z]+/g) ?? []
  return [...new Set(matches)]
}

/**
 * Extract the body of a named ## section.
 * Returns empty string if section not found.
 */
function extractSection(body, sectionName) {
  // Bug fix: with the m flag, $ matches end-of-line, so the lazy [\s\S]*? stops
  // at end of the header line — only the ## header itself is captured.
  // Fix: no m flag ($ = end-of-string), \n## as next-section boundary, group 1 return.
  const pattern = new RegExp('(?:^|\n)(## ' + sectionName + '[\\s\\S]*?)(?=\n## |$)')
  const match = body.match(pattern)
  return match ? match[1] : ''
}

/**
 * Extract bullet text from a markdown section.
 * Returns array of bullet strings (without leading "- " or "* ").
 */
function extractBullets(sectionText) {
  return (sectionText.match(/^[-*]\s+(.+)$/gm) ?? [])
    .map(b => b.replace(/^[-*]\s+/, '').trim().replace(/\*\*/g, ''))
}

// ─── 1. Handoff targets resolve to real agent slugs ──────────────────────────

describe('coherence: handoff targets resolve to real agent slugs', () => {
  for (const agent of agentFiles()) {
    if (RESIDUAL_AGENTS.has(agent.name)) continue

    test(agent.name + ' — all handoff targets are real agent slugs', () => {
      const { body } = parseFrontmatter(agent.content, agent.file)

      // Strip code blocks — slug-like patterns inside ``` are examples, not references
      const stripped = body.replace(/```[\s\S]*?```/g, '')

      // Find all → ndv-X lines (Out of Scope and Output Format handoff lines)
      const handoffLines = stripped.match(/→\s*ndv-[a-z]+[^\n]*/g) ?? []
      const slugsInHandoffs = handoffLines.flatMap(line => extractSlugs(line))

      const invalid = slugsInHandoffs.filter(s => !ALL_SLUGS.has(s))
      assert.deepEqual(
        invalid,
        [],
        `${agent.file}: handoff targets that do not exist as agent files: ${invalid.join(', ')}\n` +
        `Valid slugs: ${[...ALL_SLUGS].sort().join(', ')}`
      )
    })
  }
})

// ─── 2. Mandatory Pipeline entries resolve to real agent slugs ───────────────

describe('coherence: Mandatory Pipeline entries resolve to real agent slugs', () => {
  for (const name of TIER1) {
    test(name + ' — Mandatory Pipeline names only real agent slugs', () => {
      const content = readAgent(name)
      const { body } = parseFrontmatter(content, name + '.md')
      const pipelineSection = extractSection(body, 'Mandatory Pipeline')

      if (!pipelineSection) return // absence caught by validate-contracts.test.js

      const slugs = extractSlugs(pipelineSection)
      const invalid = slugs.filter(s => s !== name && !ALL_SLUGS.has(s))
      assert.deepEqual(
        invalid,
        [],
        `${name}.md: Mandatory Pipeline references non-existent agent slugs: ${invalid.join(', ')}`
      )
    })
  }
})

// ─── 3. Mandatory Pipeline agents are Tier 1 or Tier 2 (never Tier 3) ────────
//
// A Tier 3 agent in a Mandatory Pipeline is incoherent: Tier 3 agents are
// advisory — they produce no gates. Naming one as a blocking downstream agent
// means the pipeline would block on an agent that cannot fulfill a blocking role.

describe('coherence: Mandatory Pipeline agents are not Tier 3', () => {
  const TIER3_SET = new Set(TIER3)

  for (const name of TIER1) {
    test(name + ' — Mandatory Pipeline does not name Tier 3 agents', () => {
      const content = readAgent(name)
      const { body } = parseFrontmatter(content, name + '.md')
      const pipelineSection = extractSection(body, 'Mandatory Pipeline')

      if (!pipelineSection) return

      const slugs = extractSlugs(pipelineSection).filter(s => s !== name)
      const tier3InPipeline = slugs.filter(s => TIER3_SET.has(s))
      assert.deepEqual(
        tier3InPipeline,
        [],
        `${name}.md: Mandatory Pipeline names Tier 3 agents (advisory, cannot gate): ${tier3InPipeline.join(', ')}\n` +
        `Mandatory Pipeline must only name Tier 1 or Tier 2 agents.`
      )
    })
  }
})

// ─── 4. Brief Contract bullets each correspond to a body concept ─────────────
//
// Each Brief Contract bullet declares a required field. That field must appear
// as a concept somewhere in the agent's domain protocols — if it doesn't, the
// contract is asserting a requirement the agent never uses.
//
// We test the weaker version: each bullet's first significant word (the field
// name) appears somewhere in the body outside the Brief Contract section itself.
// This catches bullets that were copy-pasted from another agent and don't
// correspond to anything this agent's protocols reference.

describe('coherence: Brief Contract bullets reference concepts present in the agent body', () => {
  for (const name of [...TIER1, ...TIER2]) {
    test(name + ' — Brief Contract bullets reference concepts in the body', () => {
      const content = readAgent(name)
      const { body } = parseFrontmatter(content, name + '.md')
      const contractSection = extractSection(body, 'Brief Contract')

      if (!contractSection) return // absence caught by validate-contracts.test.js

      const bullets = extractBullets(contractSection)
      // Body with Brief Contract section removed — we check the rest
      const bodyWithoutContract = body.replace(contractSection, '')

      const orphaned = []
      for (const bullet of bullets) {
        // Extract first significant word (skip articles, prepositions)
        const words = bullet.toLowerCase().split(/\W+/).filter(w =>
          w.length > 3 &&
          !['what', 'that', 'this', 'with', 'from', 'have', 'been', 'will', 'when', 'which', 'each', 'their', 'the', 'being', 'were', 'they', 'about', 'into', 'your', 'most', 'concern', 'trigger', 'produced', 'assessed'].includes(w)
        )
        if (words.length === 0) continue
        const keyWord = words[0]
        if (!bodyWithoutContract.toLowerCase().includes(keyWord)) {
          orphaned.push(`"${bullet}" (key word: "${keyWord}" not found outside Brief Contract)`)
        }
      }

      assert.deepEqual(
        orphaned,
        [],
        `${name}.md: Brief Contract bullets whose key concept does not appear elsewhere in the body:\n` +
        orphaned.map(b => `  - ${b}`).join('\n') + '\n' +
        'These bullets may be copy-pasted from another agent or reference a concept this agent never uses.'
      )
    })
  }
})

// ─── 5. Self-Validation Protocol references BRIEF_REJECTED ──────────────────
//
// Already covered by validate-contracts.test.js — included here as a coherence
// check in context: an agent with a Self-Validation Protocol that never mentions
// what to do when validation fails is incoherent.

describe('coherence: Self-Validation Protocol specifies rejection format', () => {
  for (const name of [...TIER1, ...TIER2]) {
    test(name + ' — Self-Validation Protocol references BRIEF_REJECTED', () => {
      const content = readAgent(name)
      const { body } = parseFrontmatter(content, name + '.md')
      const svSection = extractSection(body, 'Self-Validation Protocol')

      if (!svSection) return // absence caught by validate-contracts.test.js

      assert.match(
        svSection,
        /BRIEF_REJECTED/,
        `${name}.md: Self-Validation Protocol does not specify the rejection format.\n` +
        'Add: BRIEF_REJECTED: [field] — [what is needed]\n' +
        'Without this, the agent has a validation gate with no defined output on failure.'
      )
    })
  }
})

// ─── 6. Non-residual agents have Out of Scope with at least one handoff ──────
//
// An agent with no handoff targets in Out of Scope is a black hole — work
// enters, but findings that belong to other domains have nowhere to go.
// The only legitimate exception is ndv-honest (residual, no domain boundary).

describe('coherence: non-residual agents declare at least one Out of Scope handoff', () => {
  for (const agent of agentFiles()) {
    if (RESIDUAL_AGENTS.has(agent.name)) continue

    test(agent.name + ' — Out of Scope section contains at least one handoff target', () => {
      const { body } = parseFrontmatter(agent.content, agent.file)
      const outOfScopeSection = extractSection(body, 'Out of Scope.*')

      assert.ok(
        outOfScopeSection.length > 0,
        `${agent.file}: no Out of Scope section found. Non-residual agents must declare domain boundaries.`
      )

      const slugs = extractSlugs(outOfScopeSection)
      const validTargets = slugs.filter(s => ALL_SLUGS.has(s) && s !== agent.name)
      assert.ok(
        validTargets.length > 0,
        `${agent.file}: Out of Scope section has no handoff targets resolving to real agent slugs.\n` +
        `Found slugs: ${slugs.join(', ') || '(none)'}\n` +
        'Every non-residual agent must route out-of-scope findings to at least one specialist.'
      )
    })
  }
})

// ─── 7. No agent references itself in a handoff ──────────────────────────────
//
// An agent routing to itself is a loop. It indicates a copy-paste error in the
// Out of Scope or Output Format section.

describe('coherence: no agent routes to itself in a handoff', () => {
  for (const agent of agentFiles()) {
    test(agent.name + ' — does not handoff to itself', () => {
      const { body } = parseFrontmatter(agent.content, agent.file)
      const stripped = body.replace(/```[\s\S]*?```/g, '')
      const handoffLines = stripped.match(/→\s*ndv-[a-z]+[^\n]*/g) ?? []
      const selfRefs = handoffLines.filter(line => line.includes(agent.name))
      assert.deepEqual(
        selfRefs,
        [],
        `${agent.file}: agent routes to itself in a handoff line:\n` +
        selfRefs.map(l => `  ${l.trim()}`).join('\n')
      )
    })
  }
})
