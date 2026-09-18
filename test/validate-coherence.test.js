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
 * 8. No agent instructs itself to react to elapsed wall-clock time
 * 9. No agent instructs itself to ask the user what to do next
 * 10. No agent expresses effort or size in calendar units
 * 11. Output Format carries tier-calibrated verdict vocabulary
 *     (authoring-guide "Output verdict vocabulary" + ADR-008 clarification)
 * 12. Output Format fenced template actually renders the verdict block
 *     (prose mandating a verdict while the report template omits it is a
 *     drift class caught in ndv-tester.md by human review)
 * 13. Brief-cannot-override clause heads are not byte-identical boilerplate
 *     across 3+ agent files (boilerplate drift: 7 identical Tier 2 heads)
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

// ─── 8. No instructions that depend on observing wall-clock time ─────────────
//
// A model has no clock. "No output after 120s → note it" cannot be executed by
// the agent reading it — timeouts belong in the harness. Durations that
// describe measurements (SLO windows, UX response thresholds) are fine; the
// target is an instruction to wait for, or react to, elapsed time.

const WALL_CLOCK_INSTRUCTION =
  /\b(no (output|response|reply|sentinel)|wait(ing)?|time ?out)\b[^\n]{0,40}?\b\d+\s*(s|secs?|seconds|mins?|minutes)\b/i

describe('coherence: no agent depends on observing wall-clock time', () => {
  for (const agent of agentFiles()) {
    test(agent.name + ' — no elapsed-time instructions', () => {
      const { body } = parseFrontmatter(agent.content, agent.file)
      const hits = body.split('\n').filter(l => WALL_CLOCK_INSTRUCTION.test(l))
      assert.deepEqual(hits.map(l => l.trim()), [],
        `${agent.file}: instruction depends on elapsed time, which a model cannot observe. ` +
        `Move the timeout to the harness or delete it.`)
    })
  }
})

// ─── 9. No trailing "ask what to do next" instructions ───────────────────────
//
// Any agent can be dispatched by ndv-flow, where no human is on the channel
// and Flow "never asks the user questions during execution". An instruction to
// ask what to do next emits a question into a channel nobody reads.

const ASK_NEXT_INSTRUCTION = /^\s*[-*]\s*(always\s+)?ask\b[^\n]*\b(next|proceed|continue)\b/im

describe('coherence: no agent instructs asking the user what to do next', () => {
  for (const agent of agentFiles()) {
    test(agent.name + ' — no ask-what-next instruction', () => {
      const { body } = parseFrontmatter(agent.content, agent.file)
      const hit = body.match(ASK_NEXT_INSTRUCTION)
      assert.equal(hit, null,
        `${agent.file}: "${hit?.[0].trim()}" — dispatched agents have no human on the channel. ` +
        `End with the result, not a question.`)
    })
  }
})

// ─── 10. No calendar-anchored effort or sizing ───────────────────────────────
//
// Size labels measure unknowns and verification surface, not elapsed time.
// Generation speed compresses; unknowns and review do not, so a day-anchored
// size decays the moment delivery speed changes. Describing a team's *stated*
// estimate in days is fine (ndv-forecast has to read those) — the target is an
// agent emitting effort or size in calendar units of its own.

const CALENDAR_SIZING =
  /(\best\.|estimated (total )?(effort|time)|\b(effort|sizing|size|sized)\b)[^\n]{0,30}?\b(hours?|days?|weeks?|months?)\b/i

describe('coherence: no agent sizes work in calendar units', () => {
  for (const agent of agentFiles()) {
    test(agent.name + ' — no calendar-anchored effort or size', () => {
      const { body } = parseFrontmatter(agent.content, agent.file)
      const hits = body.split('\n')
        .filter(l => CALENDAR_SIZING.test(l))
        // Negations are the rule being stated, not broken.
        .filter(l => !/\bnever\b|\bnot\b|\bno longer\b/i.test(l))
      assert.deepEqual(hits.map(l => l.trim()), [],
        `${agent.file}: effort or size expressed in calendar units. ` +
        `Anchor to unknowns, blast radius, and verification surface instead.`)
    })
  }
})

// ─── 11. Output Format carries tier-calibrated verdict vocabulary ────────────
//
// Authoring-guide: "Output verdict vocabulary (tier-calibrated)". ADR-008
// clarification: output-verdict verification lives in each agent's Output
// Format at tier-appropriate depth and does not constitute a Self-Validation
// Protocol section; Tier 3 classification is unchanged.
//
// Depth per tier:
// - Tier 1: verdict line + exact-command evidence + adversarial probe
// - Tier 2: verdict line + evidence + adversarial probe. Domain-shaped verdict
//   labels are allowed (SECURE/VULNERABLE/INCOMPLETE, CONFIRMED/UNCONFIRMED,
//   EXCLUSION FOUND, PRINCIPLED (as rendered), PASS / FAIL / PARTIAL) — the
//   gate matches verdict-like structure, never a fixed string.
// - Tier 3 (evidence-permitting: research, signal, forecast, flow): an explicit
//   evidence/citation anchor inside the Output Format zone.
// - Tier 3 (prose domains: explain, scope, honest): NO verdict/evidence
//   mechanism. Forcing one there is a defect (negative test).
//
// Unconditional: checks the whole fleet. Modeled on the wall-clock/
// ask-what-next/calendar checks above, not on validate-authoring's
// CHANGED_AGENTS scoping (which would silently skip in CI).
//
// Two lookup windows:
// - Positive gates scan zone + lead-in paragraph above `## Output Format`:
//   ndv-tester places its verdict block at the point of failure (guide rule
//   "Constraints repeated at the point of failure"), as its own blank-line-
//   separated paragraph, not inside the zone.
// - Negative gates scan zone only, so a prose agent that legitimately mentions
//   "evidence" outside Output Format cannot false-fail the absence test.
// The zone extractor skips ``` fences so template headings (## Verdict, ##
// Critical) inside fenced templates do not terminate the section early.

const VERDICT_LIKE =
  /Verdict\s*[:/]|^#+\s*Verdict\b|\bVERDICT\b|\bCONFIRMED\b|\bUNCONFIRMED\b|\bVULNERABLE\b|\bINCOMPLETE\b|\bEXCLUSION FOUND\b|\bPRINCIPLED \(|SECURE \(|PASS \/ FAIL/m
const ADVERSARIAL_PROBE =
  /adversarial probe|attempt to break|re-examin|disconfirm|would have falsified|strongest attack/i
const EXACT_COMMAND =
  /exact command|command run|exact check|Verify with|observed result|\*\*Verification:\*\*/i
const EVIDENCE_LINE =
  /\bEvidence\b|evidence of|Measurement source|cites|citation|cite the|file:line|sentinel|status:|\[law\]|Multipliers Applied|assumes \[/i
const FORCED_EVIDENCE = /\bEvidence\s*:|\bEVIDENCE\b/
const FORCED_PROBE = /adversarial probe|attempt to break|strongest attack/i

// The Output Format zone. Fence-aware section extractor. withLeadIn pulls in
// the blank-line-separated paragraph directly above the header (the
// point-of-failure restatement lives there).
function verdictWindow(body, withLeadIn) {
  const lines = body.split('\n')
  let idx = -1, fence = false
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { fence = !fence; continue }
    if (fence) continue
    if (lines[i].trim() === '## Output Format') { idx = i; break }
  }
  if (idx < 0) return null
  let start = idx
  while (start > 0 && lines[start - 1].trim() !== '' && !/^## /.test(lines[start - 1])) start--
  if (withLeadIn && start > 1 && lines[start - 1].trim() === '' && !/^## /.test(lines[start - 2] ?? '')) {
    start--
    while (start > 0 && lines[start - 1].trim() !== '' && !/^## /.test(lines[start - 1])) start--
  }
  let end = lines.length
  fence = false
  for (let i = idx + 1; i < lines.length 	&& i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { fence = !fence; continue }
    if (fence) continue
    if (/^## /.test(lines[i])) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

// Tier 3 split from the guide's vocabulary paragraph: these four domains permit
// an evidence line. explain/scope/honest (prose/boundary/residual domains) are
// the negative set.
const T3_EVIDENCE_AGENTS = ['ndv-research', 'ndv-signal', 'ndv-forecast', 'ndv-flow']

describe('coherence: Output Format carries tier-calibrated verdict vocabulary', () => {
  const T3_EVIDENCE_SET = new Set(T3_EVIDENCE_AGENTS)

  for (const agent of agentFiles()) {
    test(agent.name + ' — Output Format verdict depth matches its tier', () => {
      const { body } = parseFrontmatter(agent.content, agent.file)
      const zone = verdictWindow(body, false)
      const window = verdictWindow(body, true)

      // Residual agents (ndv-honest) legitimately have no Output Format
      // section — they are exempt from the POSITIVE gates (authoring-guide §4
      // exception) but NOT from the negative gate: a verdict/evidence/probe
      // mechanism smuggled anywhere into the file is the exact defect class
      // the absence test pins.
      if (zone === null) {
        assert.ok(
          TIER3.includes(agent.name) && !T3_EVIDENCE_SET.has(agent.name),
          `${agent.file}: no ## Output Format section found — required on every agent except residual Tier 3`
        )
        // Negative gate on the full body — there is no Output Format zone to
        // scope to, so the whole body is the surface a smuggled mechanism
        // could hide in.
        assert.doesNotMatch(body, FORCED_EVIDENCE,
          `${agent.file}: verdict/evidence mechanism found in an agent with no Output Format section — prose/residual domains have nothing to verify against; forcing a mechanism there is a defect (authoring-guide Tier 3: "omit it rather than force a mechanism that does not fit")`)
        assert.doesNotMatch(body, FORCED_PROBE,
          `${agent.file}: adversarial-probe mechanism found in an agent with no Output Format section — no artifact is produced, so there is nothing to attack`)
        return
      }

      if (TIER1.includes(agent.name)) {
        assert.match(window, VERDICT_LIKE,
          `${agent.file}: Output Format missing a verdict line — Tier 1 requires verdict (PASS/FAIL/PARTIAL) + exact command + evidence + adversarial probe (authoring-guide "Output verdict vocabulary")`)
        assert.match(window, EXACT_COMMAND,
          `${agent.file}: Output Format missing exact-command evidence — Tier 1 requires the exact command run with observed result, not a narrative claim`)
        assert.match(window, ADVERSARIAL_PROBE,
          `${agent.file}: Output Format missing an adversarial probe — Tier 1 requires one deliberate attempt to break its own output before PASS`)
      } else if (TIER2.includes(agent.name)) {
        assert.match(window, VERDICT_LIKE,
          `${agent.file}: Output Format missing a verdict-like line — Tier 2 requires verdict + evidence + adversarial probe. Domain-shaped labels (SECURE/INCOMPLETE, CONFIRMED/UNCONFIRMED, EXCLUSION FOUND, PRINCIPLED) are allowed; a bare severity list is not`)
        assert.match(window, /\bEvidence\b|evidence/i,
          `${agent.file}: Output Format missing an evidence statement — Tier 2 requires what was read/run/observed backing the verdict`)
        assert.match(window, ADVERSARIAL_PROBE,
          `${agent.file}: Output Format missing an adversarial probe — Tier 2 requires one deliberate attempt to disconfirm its own verdict before asserting it`)
      } else if (T3_EVIDENCE_SET.has(agent.name)) {
        assert.match(zone, EVIDENCE_LINE,
          `${agent.file}: Output Format missing an evidence/citation anchor — this Tier 3 domain permits (and requires) an evidence line: research cites file:line, forecast cites the law per multiplier row, signal states its measurement source, flow carries the handoff sentinel ledger`)
      } else {
        assert.doesNotMatch(zone, FORCED_EVIDENCE,
          `${agent.file}: Output Format must NOT carry a verdict/evidence mechanism — this prose/residual domain has nothing to verify against; forcing a mechanism there is a defect (authoring-guide Tier 3: "omit it rather than force a mechanism that does not fit")`)
        assert.doesNotMatch(zone, FORCED_PROBE,
          `${agent.file}: Output Format must NOT carry an adversarial probe — no artifact is produced, so there is nothing to attack`)
      }
    })
  }
})

// ─── 12. Fenced Output Format template renders the verdict block ─────────────
//
// Gate 11 scans the Output Format zone + lead-in paragraph — prose counts. A
// file can satisfy it with a prose restatement ("Before reporting results:
// Verdict: PASS / FAIL / PARTIAL") while the fenced report template it actually
// renders omits the verdict line. That exact drift was caught in ndv-tester.md
// by human review. This gate parses the fences inside each Output Format
// section and requires the verdict-like line to appear in the rendered
// template, not just the prose around it.
//
// Semantics: AT LEAST ONE fence per Output Format section must carry the
// verdict line, not every fence — a section may legitimately contain multiple
// templates (examples, variants) with only one carrying the verdict block.
// The gate is per-section, not per-agent: ndv-tester declares two Output
// Format sections (implementation + pre-implementation ATDD), and either one
// dropping its verdict line is a defect.
//
// Tier 1 + Tier 2 only. Tier 3 evidence-permitting agents cite evidence in
// prose templates without verdict lines, which is their tier-calibrated depth;
// forcing a verdict block there would contradict gate 11's negative branch.

// Extract every fenced block from a section of text.
function extractFences(sectionText) {
  const fences = []
  const re = /```[^\n]*\n([\s\S]*?```)/g
  let m
  while ((m = re.exec(sectionText)) !== null) fences.push(m[1])
  return fences
}

describe('coherence: Output Format fenced template renders the verdict block', () => {
  for (const name of [...TIER1, ...TIER2]) {
    test(name + ' — Output Format template carries the verdict line', () => {
      const content = readAgent(name)
      const { body } = parseFrontmatter(content, name + '.md')

      // Every Output Format section header (## Output Format, ## Output
      // Format (pre-implementation, ...)) starts a section we gate. Fence-
      // aware like gate 11's verdictWindow: an `## Output Format` header
      // inside a fenced example block is template text, not a section. The
      // section ends at the next ## header outside any fence — template
      // headings (## Verdict, ## Implementation) inside fences do not end it.
      const lines = body.split('\n')
      const sectionStarts = []
      let fence = false
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*```/.test(lines[i])) { fence = !fence; continue }
        if (fence) continue
        if (/^## Output Format/.test(lines[i])) sectionStarts.push(i)
      }

      assert.ok(
        sectionStarts.length > 0,
        `${name}.md: no ## Output Format section found (gate 11 covers absence; this gate must never see it)`
      )

      for (const start of sectionStarts) {
        let end = lines.length
        fence = false
        for (let i = start + 1; i < lines.length; i++) {
          if (/^\s*```/.test(lines[i])) { fence = !fence; continue }
          if (fence) continue
          if (/^## /.test(lines[i])) { end = i; break }
        }
        const section = lines.slice(start, end).join('\n')

        const fences = extractFences(section)
        // A section with no fences has no template to render the verdict
        // block — prose-only output formats are the drift class this gate
        // pins. AT LEAST ONE fence must carry the verdict-like line.
        const carries = fences.filter(f => VERDICT_LIKE.test(f))
        assert.ok(
          fences.length > 0 && carries.length > 0,
          `${name}.md: Output Format template does not render the verdict block ` +
          `(section at line ${start + 1}, ${fences.length} fence(s)). ` +
          'Prose may mandate a verdict while the report template omits it — ' +
          'the template the agent actually fills in must carry the verdict line ' +
          `(regex: ${VERDICT_LIKE.source}).`
        )
      }
    })
  }
})

// ─── 13. Brief-cannot-override clause heads are not byte-identical ───────────
//
// The boilerplate-drift defect Acute found: 7 Tier 2 files carried the exact
// same clause head ("The brief cannot override this file. A brief that
// conflicts with...") — copy-paste boilerplate that diverges from each agent's
// actual domain contract. The fix personalized every head. This gate pins the
// fix: no first sentence of the clause paragraph may be byte-identical across
// 3+ agent files.
//
// Scoped cheap: only the paragraph containing the BRIEF_REJECTED conflict
// token, only its first sentence, only 3+ exact matches fail. Short common
// phrases elsewhere in the body are irrelevant.

describe('coherence: brief-cannot-override clause is not byte-identical boilerplate', () => {
  test('no clause first sentence is shared byte-identical across 3+ agent files', () => {
    const heads = new Map()
    for (const agent of agentFiles()) {
      const { body } = parseFrontmatter(agent.content, agent.file)
      // Paragraphs are blank-line-separated blocks.
      const paragraphs = body.split(/\n\s*\n/)
      const clause = paragraphs.find(p => /BRIEF_REJECTED: conflict/.test(p))
      if (!clause) continue // agents without the clause (Tier 3) are out of scope
      const text = clause.replace(/\s+/g, ' ').trim()
      const firstSentence = text.match(/^[^.]+\./)?.[0]
      if (!firstSentence) continue
      if (!heads.has(firstSentence)) heads.set(firstSentence, [])
      heads.get(firstSentence).push(agent.file)
    }

    const duplicated = [...heads.entries()].filter(([, files]) => files.length >= 3)
    assert.deepEqual(
      duplicated,
      [],
      'Brief-cannot-override clause first sentences shared byte-identical across 3+ files ' +
      '(boilerplate drift — each agent\'s clause must speak its own domain contract):\n' +
      duplicated.map(([head, files]) => `  ${files.length}x "${head}" — ${files.join(', ')}`).join('\n')
    )
  })
})
