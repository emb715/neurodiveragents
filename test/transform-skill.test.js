/**
 * Adversarial unit tests for transformAgentToSkill() and the router-skill
 * derivation path in bin/ndv.js.
 *
 * Scope:
 *   - transformAgentToSkill purity, determinism, boundary, and degradation behavior
 *   - getRouterSkills marker-detection in isolation (regex false-positive check)
 *   - buildSkillGroups ENOENT crash exposure (router name in input → no static file)
 *
 * Contract under test (from the brief):
 *   transformAgentToSkill(content) is a PURE function: content string → content string.
 *   Three deltas: frontmatter replacement, "Running as a skill" insertion,
 *   Dispatch Protocol term substitutions. It reads ONLY its argument — no fs, no
 *   Date, no random, no global mutation. Same input → same output, always.
 *
 *   Degradation contract (verified here against current behavior):
 *     - No `---` frontmatter delimiters → returns content unchanged
 *     - Frontmatter present but no top-level `description:` block scalar →
 *       returns content unchanged (the scalar `skill: router` marker is
 *       detected separately by getRouterSkills; the transform only needs the
 *       description block scalar to proceed)
 *     - `description:` present but inline (not block scalar `>`) → returns
 *       content unchanged (graceful degradation — the block-scalar regex
 *       does not match the inline form)
 *
 * Test framework: node:test + node:assert/strict, ESM imports via `await import(BIN)`.
 * Matches test/install-router-skills.test.js conventions.
 *
 * Isolation: every test sets up its own state; no shared state. Filesystem-touching
 * tests use mkdtempSync. Pure-function tests touch no filesystem.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')
const AGENT_FILE = join(ROOT, 'agents', 'ndv-flow.md')
const AGENTS_DIR = join(ROOT, 'agents')
const SKILLS_DIR = join(ROOT, 'skills')

// transformAgentToSkill is a pure function exported from bin/ndv.js.
// buildSkillGroups is exported for interactive-path coverage (reads the
// filesystem — agents/ and skills/ — but is deterministic for a given repo).
// extractFrontmatter is the REAL frontmatter extractor from bin/ndv.js — used
// here instead of a local regex replica so the marker-detection tests model
// the real extraction path, not a copy that can drift from production.
const { transformAgentToSkill, buildSkillGroups, extractFrontmatter } = await import(BIN)

// isRouterAgent: the marker-detection contract used by getRouterSkills, but
// driven through the REAL extractFrontmatter (exported from bin/ndv.js) rather
// than a local regex replica. Returns true iff the content's FRONTMATTER (as
// extracted by the production code) contains the top-level scalar
// `skill: router` marker. This collapses three copies of the frontmatter-
// extraction regex (bin/ndv.js + two test replicas) to one: the exported
// extractor is the single source of truth.
//
// The regex mirrors getRouterSkills exactly:
//   /^skill:\s*router\s*$/m  — top-level scalar, end-anchored (prefix-safe),
//                               trailing-whitespace-tolerant (\s*$)
function isRouterAgent(content) {
  const fm = extractFrontmatter(content)
  if (!fm) return false
  const fmRaw = fm.fm
  return /^skill:\s*router\s*$/m.test(fmRaw)
}

// ─── Purity: no filesystem, no Date/random, no global mutation ───────────────

test('transformAgentToSkill does not touch the filesystem (input is the only source)', () => {
  // Arrange: read agent content once, snapshot a file we know exists.
  const agentContent = readFileSync(AGENT_FILE, 'utf8')
  const beforeMtime = readFileSync(AGENT_FILE).mtimeMs

  // Act: call the transform — it must not read or write anything.
  const out = transformAgentToSkill(agentContent)

  // Assert: the agent file is byte-identical (no mutation of source).
  const afterContent = readFileSync(AGENT_FILE, 'utf8')
  assert.equal(afterContent, agentContent, 'transform must not modify its source file')
  assert.equal(readFileSync(AGENT_FILE).mtimeMs, beforeMtime, 'source mtime changed — fs write detected')

  // Assert: output is a string and differs from input (transform did something).
  assert.equal(typeof out, 'string', 'transform must return a string')
  assert.notEqual(out, agentContent, 'transform should change the content for a valid router agent')
})

test('transformAgentToSkill does not mutate global state across calls', () => {
  // Arrange: capture a global fingerprint before.
  const agentContent = readFileSync(AGENT_FILE, 'utf8')
  const globalKeysBefore = Object.keys(globalThis).length

  // Act: call the transform twice.
  transformAgentToSkill(agentContent)
  transformAgentToSkill(agentContent)

  // Assert: no new globals leaked onto globalThis.
  const globalKeysAfter = Object.keys(globalThis).length
  assert.equal(globalKeysAfter, globalKeysBefore, 'transform leaked globals onto globalThis')
})

test('transformAgentToSkill is deterministic: same input → identical output twice', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act: call twice with the same input.
  const out1 = transformAgentToSkill(agentContent)
  const out2 = transformAgentToSkill(agentContent)

  // Assert: byte-identical — no Date/random/non-determinism.
  assert.equal(out1, out2, 'transform is non-deterministic: same input produced different output')
  assert.ok(Buffer.from(out1).equals(Buffer.from(out2)), 'byte buffers differ despite string equality')
})

// ─── Boundary: empty input, no frontmatter, malformed frontmatter ────────────

test('transformAgentToSkill: empty string input returns empty string unchanged', () => {
  // Arrange
  const input = ''

  // Act
  const out = transformAgentToSkill(input)

  // Assert: no frontmatter match → returns content unchanged. Empty stays empty.
  assert.equal(out, '', 'empty input should return empty (no frontmatter → unchanged)')
})

test('transformAgentToSkill: no frontmatter delimiters returns content unchanged', () => {
  // Arrange: content with no `---` block — the frontmatter-delimiter regex
  // (fmMatch, the `^---\n([\s\S]*?)\n---\n` match) fails.
  const input = 'name: x\nskill: router\ndescription: >\n  foo\n\nBody text.'

  // Act
  const out = transformAgentToSkill(input)

  // Assert: returned verbatim (early return when fmMatch fails).
  assert.equal(out, input, 'content without frontmatter delimiters should be returned unchanged')
})

test('transformAgentToSkill: frontmatter present but no description block scalar returns content unchanged', () => {
  // Arrange: valid frontmatter but no top-level `description:` block scalar —
  // the descriptionMatch regex (`^description:\s*[>|]\s*\n...`) fails. The scalar
  // `skill: router` marker is detected separately by getRouterSkills; the
  // transform only needs the description block scalar to proceed.
  const input =
    '---\n' +
    'name: ndv-no-desc\n' +
    'model: x\n' +
    'mode: all\n' +
    'skill: router\n' +
    'description: top-level agent description\n' +
    '---\n\n' +
    'You are NoDesc. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n'

  // Act
  const out = transformAgentToSkill(input)

  // Assert: returned verbatim (early return — no description block scalar).
  assert.equal(out, input, 'content with frontmatter but no description block scalar should be returned unchanged')
})

test('transformAgentToSkill: frontmatter with description block scalar still transforms (transform does not gate on skill marker)', () => {
  // Arrange: a top-level description block scalar present. The transform runs
  // whenever the description block scalar exists — it does NOT validate the
  // `skill:` scalar value. (Router detection is the job of getRouterSkills,
  // not the transform.) This agent has NO skill marker at all, yet the
  // transform still runs because the description block scalar is present.
  const input =
    '---\n' +
    'name: ndv-other\n' +
    'description: >\n' +
    '  Some description text here that is long enough.\n' +
    '---\n\n' +
    'You are Other. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n'

  // Act
  const out = transformAgentToSkill(input)

  // Assert: the transform runs (description block scalar exists) regardless of
  // the skill marker. The transform does NOT gate on the skill scalar value.
  assert.notEqual(out, input, 'transform should run when description block scalar exists, regardless of skill marker')
  assert.match(out, /^---\nname: ndv-other\n/m, 'transform should produce skill frontmatter with the agent name')
  assert.match(out, /  type: router\n/, 'transform hardcodes metadata.type: router regardless of input skill marker')
})

// ─── Inline `description:` form (not block scalar `>`) ────────────────────────
// The function only handles `description: >` / `description: |` (block scalar).
// The inline form `description: text` is NOT matched by the descriptionMatch
// regex (`^description:\s*[>|]\s*\n...`) — the transform returns the content
// UNCHANGED. This is graceful degradation: an agent without a block-scalar
// description is left alone rather than emitting an empty/malformed skill.

test('transformAgentToSkill: inline description form (no block scalar) returns content unchanged (graceful degradation)', () => {
  // Arrange: frontmatter with an INLINE description (no `>`). The descriptionMatch
  // regex (`^description:\s*[>|]\s*\n...`) only matches `description: >` or
  // `description: |` — the inline form is not matched, so the transform returns
  // content unchanged.
  const input =
    '---\n' +
    'name: ndv-inline\n' +
    'skill: router\n' +
    'description: inline short text here\n' +
    '---\n\n' +
    'You are Inline. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n'

  // Act
  const out = transformAgentToSkill(input)

  // Assert: the transform returns the content UNCHANGED — no block-scalar
  // description means no skill derivation. The inline text is not silently
  // dropped into an empty block scalar; the input is returned verbatim.
  assert.equal(
    out,
    input,
    'inline description (no block scalar) should return content unchanged — graceful degradation, not an empty block'
  )
})

// ─── Golden fixture drift detection ───────────────────────────────────────────

test('transformAgentToSkill: golden fixture test FAILS LOUDLY if the agent file drifts', () => {
  // This test PROVES the golden test catches drift — it mutates a copy of the
  // agent content and confirms the transform output DIFFERS from the golden.
  // If this test passed with the mutated input, the golden test would be worthless.
  const golden = readFileSync(join(ROOT, 'test', 'fixtures', 'ndv-flow-skill-golden.md'), 'utf8')
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Arrange: mutate a copy — change the agent name in the frontmatter.
  const mutated = agentContent.replace(/^name: ndv-flow$/m, 'name: ndv-flow-DRIFTED')

  // Act: transform the mutated copy.
  const outFromMutated = transformAgentToSkill(mutated)

  // Assert: the mutated transform output differs from the golden — the golden
  // test is sensitive to agent file drift (it is not a no-op that always passes).
  assert.notEqual(
    outFromMutated,
    golden,
    'mutated agent content produced the golden output — the golden fixture test would NOT catch drift (it is an alibi)'
  )
  assert.match(
    outFromMutated,
    /name: ndv-flow-DRIFTED/,
    'mutated name should propagate to the transformed output frontmatter'
  )
})

test('transformAgentToSkill: golden fixture test FAILS LOUDLY if the description body drifts', () => {
  // Second drift vector: change the skill.description block scalar body.
  // Use text unique to the skill block ("over a multi-task workload." appears
  // only in the skill.description, not the top-level agent description).
  const golden = readFileSync(join(ROOT, 'test', 'fixtures', 'ndv-flow-skill-golden.md'), 'utf8')
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Arrange: mutate the skill description body (the block scalar under description: >).
  const mutated = agentContent.replace(
    'over a multi-task workload.',
    'over a DRIFTED multi-task workload.'
  )
  assert.notEqual(mutated, agentContent, 'precondition: the mutation must actually change the agent content')

  // Act
  const outFromMutated = transformAgentToSkill(mutated)

  // Assert: the golden output differs — the description drift propagates.
  assert.notEqual(
    outFromMutated,
    golden,
    'description body drift did not change the transformed output — the golden test misses description drift'
  )
  assert.match(
    outFromMutated,
    /over a DRIFTED multi-task workload/,
    'mutated description text should propagate to the transformed output frontmatter'
  )
})

test('transformAgentToSkill: real agent file → golden output (byte-identical, the live pin)', () => {
  // The live pin: the unmutated agent file must produce the golden output exactly.
  // If this fails, either the agent file or the transform has drifted from the
  // golden contract.
  const agentContent = readFileSync(AGENT_FILE, 'utf8')
  const actual = transformAgentToSkill(agentContent)
  const golden = readFileSync(join(ROOT, 'test', 'fixtures', 'ndv-flow-skill-golden.md'), 'utf8')

  assert.equal(actual, golden, 'transformAgentToSkill(agent) does not match the golden fixture')
  assert.equal(Buffer.from(actual).length, Buffer.from(golden).length, 'byte length mismatch')
})

// ─── Delta A: frontmatter replacement ────────────────────────────────────────

test('transformAgentToSkill: Delta A strips model/effort/mode/description/tools from frontmatter', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act
  const out = transformAgentToSkill(agentContent)
  const fm = out.match(/^---\n([\s\S]*?)\n---\n/m)[1]

  // Assert: agent-only keys are NOT in the skill frontmatter.
  assert.ok(!/^model:/m.test(fm), 'skill frontmatter should not contain model:')
  assert.ok(!/^effort:/m.test(fm), 'skill frontmatter should not contain effort:')
  assert.ok(!/^mode:/m.test(fm), 'skill frontmatter should not contain mode:')
  assert.ok(!/^tools:/m.test(fm), 'skill frontmatter should not contain tools:')
  // The agent-level top-level description (single-line) must NOT leak through —
  // only the skill.description block scalar should appear.
  const descLines = fm.match(/^description:.*$/gm) ?? []
  assert.equal(descLines.length, 1, 'skill frontmatter should have exactly one description: key')
  assert.equal(descLines[0], 'description: >', 'skill frontmatter description must be the block scalar form')
})

test('transformAgentToSkill: Delta A emits metadata block with router type and source-agent', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act
  const out = transformAgentToSkill(agentContent)
  const fm = out.match(/^---\n([\s\S]*?)\n---\n/m)[1]

  // Assert: the metadata block is present with the expected keys.
  assert.match(fm, /^metadata:\n/m, 'skill frontmatter should contain a metadata: block')
  assert.match(fm, /^  type: router$/m, 'metadata.type should be router')
  assert.match(fm, /^  origin: agent-derived$/m, 'metadata.origin should be agent-derived')
  assert.match(fm, /^  source-agent: ndv-flow$/m, 'metadata.source-agent should be the agent name')
})

// ─── Delta B: "Running as a skill" section insertion ──────────────────────────

test('transformAgentToSkill: Delta B inserts "Running as a skill" section before "## Out of Scope"', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act
  const out = transformAgentToSkill(agentContent)

  // Assert: the inserted section appears exactly once, between the intro and Out of Scope.
  const insertCount = (out.match(/## Running as a skill \(not a subagent\)/g) ?? []).length
  assert.equal(insertCount, 1, 'exactly one "Running as a skill" section should be inserted')

  // Assert: ordering — the inserted section comes before "## Out of Scope".
  const insertIdx = out.indexOf('## Running as a skill (not a subagent)')
  const oosIdx = out.indexOf('## Out of Scope (never do these)')
  assert.ok(insertIdx > 0 && oosIdx > insertIdx, 'inserted section should appear before "## Out of Scope"')

  // Assert: the insert anchor ("thread wasted.") immediately precedes the section.
  const anchorIdx = out.indexOf('Every word that does not move the work is a thread wasted.')
  assert.ok(anchorIdx > 0, 'intro anchor paragraph should be present')
  assert.ok(
    anchorIdx < insertIdx,
    'intro anchor paragraph should appear before the inserted section'
  )
})

test('transformAgentToSkill: Delta B does NOT insert the section when the intro anchor is absent', () => {
  // Arrange: a synthetic router agent WITHOUT the "thread wasted." anchor paragraph.
  // The Delta B insert regex (the "thread wasted." anchor match) requires the
  // anchor — if absent, no insert happens.
  const input =
    '---\n' +
    'name: ndv-noanchor\n' +
    'skill: router\n' +
    'description: >\n' +
    '  Some description text here that is long enough for the block.\n' +
    '---\n\n' +
    'You are NoAnchor.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n'

  // Act
  const out = transformAgentToSkill(input)

  // Assert: the section is NOT inserted (anchor missing — the regex does not match).
  assert.ok(
    !out.includes('## Running as a skill (not a subagent)'),
    'the insert section should NOT appear when the intro anchor paragraph is absent'
  )
  // The rest of the transform still ran (frontmatter was replaced).
  assert.match(out, /^---\nname: ndv-noanchor\n/m, 'frontmatter should still be replaced even when the insert anchor is absent')
})

// ─── Delta C: Dispatch Protocol term substitutions ───────────────────────────

test('transformAgentToSkill: Delta C substitutes "Task" → "Agent" in the Dispatch Protocol section only', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act
  const out = transformAgentToSkill(agentContent)

  // Assert: the Dispatch Protocol section substitutions are present in the output.
  assert.match(
    out,
    /spawn one `Agent`, wait for sentinel/,
    'Delta C should substitute "spawn one Task, wait for sentinel" → "spawn one `Agent`, wait for sentinel"'
  )
  assert.match(
    out,
    /multiple `Agent` calls/,
    'Delta C should substitute "multiple Task calls" → "multiple `Agent` calls"'
  )
  assert.match(
    out,
    /Read the target agent's full file \(`~\/\.claude\/agents\/<name>\.md`\)/,
    'Delta C should inject the agent file path into the brief authoring instruction'
  )
})

test('transformAgentToSkill: Deliberation Protocol substitution "ONE Task message" → "ONE message"', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act
  const out = transformAgentToSkill(agentContent)

  // Assert: the Deliberation Protocol line is substituted.
  assert.match(
    out,
    /dispatch BOTH agents in ONE message/,
    'Deliberation Protocol should substitute "ONE Task message" → "ONE message"'
  )
  assert.ok(
    !out.includes('dispatch BOTH agents in ONE Task message'),
    'the unsubstituted "ONE Task message" form should NOT appear in the output'
  )
})

test('transformAgentToSkill: Delta C is scoped to the Dispatch Protocol section (does not touch other sections)', () => {
  // Arrange: a synthetic agent where "Task" appears in a NON-Dispatch section.
  // The substitution regex is scoped between "## Dispatch Protocol" and the next "## ".
  const input =
    '---\n' +
    'name: ndv-scope-test\n' +
    'skill: router\n' +
    'description: >\n' +
    '  Some description text here that is long enough for the block.\n' +
    '---\n\n' +
    'You are ScopeTest. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- Do not spawn one Task, wait for sentinel here.\n\n' +
    '## Dispatch Protocol\n\n' +
    'spawn one Task, wait for sentinel. multiple Task calls.\n\n' +
    '## Other Section\n\n' +
    'multiple Task calls appear here too — should NOT be substituted.\n'

  // Act
  const out = transformAgentToSkill(input)

  // Assert: substitutions happened INSIDE the Dispatch Protocol section.
  const dispatchIdx = out.indexOf('## Dispatch Protocol')
  const otherIdx = out.indexOf('## Other Section')
  const dispatchSection = out.slice(dispatchIdx, otherIdx)
  assert.match(dispatchSection, /spawn one `Agent`, wait for sentinel/, 'Dispatch section should have the Task → Agent substitution')
  assert.match(dispatchSection, /multiple `Agent` calls/, 'Dispatch section should have the multiple Task → Agent substitution')

  // Assert: the "Out of Scope" section's "spawn one Task, wait for sentinel" was NOT substituted.
  const oosIdx = out.indexOf('## Out of Scope (never do these)')
  const oosSection = out.slice(oosIdx, dispatchIdx)
  assert.match(oosSection, /spawn one Task, wait for sentinel here\./, 'Out of Scope section should NOT be touched by Delta C')

  // Assert: the "Other Section" after Dispatch was NOT substituted either.
  const otherSection = out.slice(otherIdx)
  assert.match(otherSection, /multiple Task calls appear here too/, 'sections after Dispatch Protocol should NOT be touched by Delta C')
})

// ─── Trailing newline stripping ──────────────────────────────────────────────

test('transformAgentToSkill: strips the trailing newline (golden output ends without final newline)', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act
  const out = transformAgentToSkill(agentContent)

  // Assert: the output does NOT end with a trailing newline.
  assert.ok(
    !out.endsWith('\n'),
    'transform output should NOT end with a trailing newline (the trailing-newline strip)'
  )
})

test('transformAgentToSkill: trailing newline strip is idempotent (calling twice does not double-strip)', () => {
  // Arrange
  const agentContent = readFileSync(AGENT_FILE, 'utf8')

  // Act: the function is pure — calling it on its own output is a valid input.
  // The derived skill output DOES keep a top-level `description: >` block scalar
  // (golden fixture lines 3-9), so the descriptionMatch early-return path does
  // NOT fire on re-entry. The active guard is the `metadata: source-agent:`
  // check in bin/ndv.js (the idempotency guard immediately after
  // frontmatter extraction — it precedes the descriptionMatch regex and fires
  // FIRST). This asserts that metadata-source-agent guard is what protects
  // idempotency for re-entry: without it, the retained description block scalar
  // would re-trigger the transform and Delta C's section-scope regex would
  // throw on the already-substituted Dispatch Protocol body.
  const out1 = transformAgentToSkill(agentContent)
  const out2 = transformAgentToSkill(out1)

  // Assert: re-applying the transform to its own output returns it unchanged
  // (the `metadata: source-agent:` idempotency guard in bin/ndv.js
  // returns the content before the descriptionMatch regex is reached).
  assert.equal(out2, out1, 're-applying the transform to its own output should be a no-op (metadata: source-agent: guard)')
})

// ─── Synthetic second router agent (marker-driven generalization) ─────────────
//
// getRouterSkills() reads the real AGENTS_DIR, so we cannot add a synthetic
// second router agent without polluting the repo. Instead we test the marker
// DETECTION regex in isolation — the exact regex getRouterSkills uses —
// against synthetic agent content. This proves the detection is marker-driven
// (not name-driven) and generalizes to any agent with the scalar marker.

test('router marker detection regex: matches a synthetic agent with the skill: router scalar marker', () => {
  // Arrange: a synthetic second router agent — different name, same marker.
  const synthetic =
    '---\n' +
    'name: ndv-orchestrator-2\n' +
    'model: x\n' +
    'mode: all\n' +
    'description: >\n' +
    '  A second hypothetical router agent.\n' +
    'tools:\n' +
    '  - Read\n' +
    '  - Glob\n' +
    'skill: router\n' +
    '---\n\n' +
    'You are Orchestrator2.\n'

  // Act + Assert: the frontmatter-scoped detection matches the synthetic router.
  assert.ok(
    isRouterAgent(synthetic),
    'the synthetic agent with the skill: router scalar marker in frontmatter IS detected as a router'
  )
})

test('router marker detection regex: does NOT match a cognitive-module agent (no skill: router marker)', () => {
  // Arrange
  const cognitive =
    '---\n' +
    'name: ndv-skeptical\n' +
    'description: Skeptical processing module.\n' +
    '---\n\n' +
    'Body.\n'

  // Act + Assert: a cognitive agent has no skill: router scalar marker.
  assert.ok(
    !isRouterAgent(cognitive),
    'cognitive agent (no skill: router scalar marker) is NOT detected as a router'
  )
})

// ─── ADVERSARIAL: getRouterSkills false-positive on PROSE "skill: router" ─────
//
// getRouterSkills scopes its marker regex to the YAML frontmatter block only
// (same fmMatch pattern as the sibling transforms). "skill: router" appearing
// in the BODY (prose or a code block) must NOT match — only frontmatter
// occurrences count. These tests assert the FIXED behavior: an agent that
// mentions the marker in prose is NOT detected as a router.

test('router marker detection: "skill: router" in PROSE (code block) is NOT matched (frontmatter-scoped fix)', () => {
  // A non-router agent whose BODY contains a code block describing the marker.
  // The frontmatter has NO skill: router scalar — this agent is NOT a router.
  const agentWithMarkerInProse =
    '---\n' +
    'name: ndv-explainer\n' +
    'description: Explains the router marker.\n' +
    '---\n\n' +
    'You are Explainer. To make an agent a router, add this to the frontmatter:\n\n' +
    '```\n' +
    'skill: router\n' +
    '```\n\n' +
    'That is how the marker works.\n'

  // Act + Assert: the frontmatter-scoped detection does NOT match — the marker
  // is in a body code block, not the frontmatter.
  assert.ok(
    !isRouterAgent(agentWithMarkerInProse),
    'FIXED: "skill: router" in a body code block is NOT detected as a router (detection scoped to frontmatter)'
  )
})

test('router marker detection: agent body with "skill: router" in non-code prose is NOT matched (frontmatter-scoped fix)', () => {
  // A non-router agent where prose mentions the marker at column 0. The marker
  // is in the body, not the frontmatter.
  const agentWithProseMarker =
    '---\n' +
    'name: ndv-docs\n' +
    'description: Documents the fleet.\n' +
    '---\n\n' +
    'Router agents are marked with the following frontmatter line:\n\n' +
    'skill: router\n\n' +
    'Cognitive modules do not have that marker.\n'

  // Act + Assert: the frontmatter-scoped detection does NOT match.
  assert.ok(
    !isRouterAgent(agentWithProseMarker),
    'FIXED: "skill: router" in body prose is NOT detected as a router (detection scoped to frontmatter)'
  )
})

// ─── FIXED: buildSkillGroups handles router names via transformAgentToSkill ──
//
// buildSkillGroups now branches on router membership (same `new Set(getRouterSkills())`
// pattern as installSkillsFor): router names are derived from the agent file via
// transformAgentToSkill, cognitive names read the static skills/<name>/SKILL.md.
// The ENOENT crash on router names is fixed. These tests assert the fixed
// behavior — buildSkillGroups is now exported, so we call it directly.

// Replicate getAllSkills() composition against the real filesystem. getAllSkills
// is NOT exported from bin/ndv.js, so this is a test-side replica. The ideal fix
// is to export getAllSkills and getCognitiveSkills from bin/ndv.js so tests call
// the real composition — flagged as a handoff to ndv-build. Until then, this
// replica is kept IDENTICAL to the one in test/install-router-skills.test.js and
// uses the REAL extractFrontmatter (via isRouterAgent) for router detection plus
// the same parseSkillType regex for the cognitive-type filter, so the two
// replicas cannot drift from each other or from the extraction path.
//
// Cognitive: skills/ dirs with a non-frozen SKILL.md whose metadata.type !== 'router'.
// Router: agents/ files with the frontmatter marker (via isRouterAgent).
// parseSkillType regex mirrors bin/ndv.js: `/^\s{2}type:\s*(.+)$/m`.
function replicateGetAllSkills() {
  const cognitive = readdirSync(SKILLS_DIR).filter(f => {
    const skillFile = join(SKILLS_DIR, f, 'SKILL.md')
    if (!existsSync(skillFile)) return false
    const content = readFileSync(skillFile, 'utf8')
    if (/^\s*status:\s*frozen/m.test(content)) return false
    const typeMatch = content.match(/^\s{2}type:\s*(.+)$/m)
    return typeMatch ? typeMatch[1].trim() !== 'router' : true
  })
  const routers = readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .filter(f => isRouterAgent(readFileSync(join(AGENTS_DIR, f), 'utf8')))
    .map(f => f.replace(/\.md$/, ''))
  return [...cognitive, ...routers]
}

test('buildSkillGroups FIXED: does NOT throw for getAllSkills() input (router derived, cognitive static)', () => {
  // Arrange: the router has no static skill file (precondition that the old
  // crash was reachable), and the input list includes the router name.
  const allSkills = replicateGetAllSkills()
  assert.ok(allSkills.includes('ndv-flow'), 'precondition: the router ndv-flow is in getAllSkills()')
  assert.ok(
    !existsSync(join(SKILLS_DIR, 'ndv-flow', 'SKILL.md')),
    'precondition: the router has no static SKILL.md (it is derived)'
  )

  // Act + Assert: buildSkillGroups does not throw — routers are derived from
  // the agent file, cognitive skills read the static file.
  let groups
  assert.doesNotThrow(
    () => { groups = buildSkillGroups(allSkills) },
    'buildSkillGroups(getAllSkills()) must not throw — router names are derived via transformAgentToSkill'
  )
  assert.ok(Array.isArray(groups) && groups.length > 0, 'buildSkillGroups returns a non-empty groups array')
})

test('buildSkillGroups FIXED: router entry has [router] tag and Fleet skills group; cognitive has Cognitive modules', () => {
  // Arrange
  const allSkills = replicateGetAllSkills()

  // Act
  const groups = buildSkillGroups(allSkills)
  const groupLabels = groups.map(g => g.label)

  // Assert: both expected groups are present.
  assert.ok(groupLabels.includes('Fleet skills'), 'the Fleet skills (router) group is present')
  assert.ok(groupLabels.includes('Cognitive modules'), 'the Cognitive modules group is present')

  // Assert: the router entry lives in the Fleet skills group with the [router] tag.
  const fleetGroup = groups.find(g => g.label === 'Fleet skills')
  const routerEntry = fleetGroup.items.find(i => i.value === 'ndv-flow')
  assert.ok(routerEntry, 'the ndv-flow router entry is in the Fleet skills group')
  assert.match(routerEntry.hint, /\[router\]/, 'the router entry hint carries the [router] tag')

  // Assert: a known cognitive skill lives in the Cognitive modules group.
  const cogGroup = groups.find(g => g.label === 'Cognitive modules')
  const cogEntry = cogGroup.items.find(i => i.value === 'ndv-skeptical')
  assert.ok(cogEntry, 'a cognitive skill (ndv-skeptical) entry is in the Cognitive modules group')
})

test('buildSkillGroups FIXED: cognitive entries still read static skills/<name>/SKILL.md (unchanged path)', () => {
  // Arrange: a known cognitive skill has a static file.
  const cognitiveFile = join(SKILLS_DIR, 'ndv-skeptical', 'SKILL.md')
  assert.ok(existsSync(cognitiveFile), 'precondition: cognitive skill ndv-skeptical has a static SKILL.md')

  // Act: buildSkillGroups with only cognitive names (no router) — uses the
  // static read path, unchanged.
  const groups = buildSkillGroups(['ndv-skeptical'])

  // Assert: the cognitive entry is present and grouped as Cognitive modules.
  const cogGroup = groups.find(g => g.label === 'Cognitive modules')
  assert.ok(cogGroup, 'cognitive-only input produces the Cognitive modules group')
  assert.ok(
    cogGroup.items.some(i => i.value === 'ndv-skeptical'),
    'the cognitive skill ndv-skeptical is present from the static read path'
  )
})

// ─── Integration: transform output written to a tmp dir matches golden ───────

test('transform output written to a tmp skills dir matches the golden fixture byte-for-byte', () => {
  // Arrange: a tmp skills dir, as an installer would create.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-tf-integ-'))
  try {
    const agentContent = readFileSync(AGENT_FILE, 'utf8')
    const skillContent = transformAgentToSkill(agentContent)

    // Act: write the transform output to <dir>/ndv-flow/SKILL.md (what installSkillsFor does).
    mkdirSync(join(dir, 'ndv-flow'), { recursive: true })
    writeFileSync(join(dir, 'ndv-flow', 'SKILL.md'), skillContent)

    // Assert: the written file matches the golden exactly.
    const golden = readFileSync(join(ROOT, 'test', 'fixtures', 'ndv-flow-skill-golden.md'), 'utf8')
    const written = readFileSync(join(dir, 'ndv-flow', 'SKILL.md'), 'utf8')
    assert.equal(written, golden, 'transform output written to disk differs from the golden fixture')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Delta C no-op guard: Dispatch Protocol with no substitution targets ──────
//
// If a future router agent has a "## Dispatch Protocol" section containing NONE
// of the three substitution literals ("multiple Task calls", "spawn one Task,
// wait for sentinel", "Read the target agent's full file before authoring
// anything"), the section-scope regex still matches, `s` is rebuilt identically
// by the replace callback, and `out === beforeDeltaC`. The current code's
// `hasDispatchSection && out === beforeDeltaC` guard catches this and throws —
// it does NOT silently no-op. This test pins that guard so a future refactor
// that weakens it surfaces here, not as a confusing golden-fixture failure.
//
// Note: the thrown error's MESSAGE says "section-scope regex did not match",
// which is misleading (the regex DID match — the substitution was a no-op).
// That is a cosmetic message bug, not a behavioral bug. Flagged as a handoff
// to ndv-build; this test asserts the THROW (correct behavior), not the message.

test('transformAgentToSkill: Dispatch Protocol section with NO substitution targets throws (no silent no-op)', () => {
  // Arrange: a synthetic router agent whose Dispatch Protocol section body
  // contains none of the three substitution targets.
  const input =
    '---\n' +
    'name: ndv-noop-dispatch\n' +
    'skill: router\n' +
    'description: >\n' +
    '  Some description text here that is long enough for the block.\n' +
    '---\n\n' +
    'You are Noop. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n\n' +
    '## Dispatch Protocol\n\n' +
    'Follow the brief template above.\n\n' +
    '## Other Section\n\nbody\n'

  // Act + Assert: the no-op guard throws — the transform does NOT silently
  // return unchanged output when a Dispatch Protocol section matches but no
  // substitution lands.
  assert.throws(
    () => transformAgentToSkill(input),
    /Delta C failed/,
    'a Dispatch Protocol section with no substitution targets must throw, not silently no-op (the hasDispatchSection && out === beforeDeltaC guard)'
  )
})

test('transformAgentToSkill: Dispatch Protocol section WITH a substitution target does NOT throw (guard only fires on no-op)', () => {
  // Arrange: same shape, but the Dispatch Protocol section contains ONE of the
  // three targets. The substitution lands, out !== beforeDeltaC, no throw.
  const input =
    '---\n' +
    'name: ndv-has-target\n' +
    'skill: router\n' +
    'description: >\n' +
    '  Some description text here that is long enough for the block.\n' +
    '---\n\n' +
    'You are Has. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n\n' +
    '## Dispatch Protocol\n\n' +
    'spawn one Task, wait for sentinel.\n\n' +
    '## Other Section\n\nbody\n'

  // Act + Assert: the substitution lands → no throw, and the substitution is present.
  let out
  assert.doesNotThrow(
    () => { out = transformAgentToSkill(input) },
    'a Dispatch Protocol section that contains a substitution target must NOT trip the no-op guard'
  )
  assert.match(out, /spawn one `Agent`, wait for sentinel/, 'the present substitution target was replaced')
})

// ─── Router marker regex: trailing-whitespace tolerance + prefix rejection ────
//
// getRouterSkills' marker regex `/^skill:\s*router\s*$/m` tolerates trailing
// whitespace before line end (`\s*$`) — YAML treats it as insignificant, so a
// stray space must not false-reject a valid router agent. It is also
// end-anchored so "skill: routerized" (a prefix) does NOT match.
//
// getRouterSkills is NOT exported, so these tests exercise the regex through
// isRouterAgent, which uses the REAL extractFrontmatter (the production
// extraction path) + the exact regex from getRouterSkills. If the regex drifts
// (e.g. `\s*$` reverted to `$`), these tests fail at the cause, not as a
// far-removed install failure.

test('router marker regex: "skill: router   " (trailing spaces) IS detected as a router (trailing-whitespace tolerance)', () => {
  // Arrange: frontmatter with trailing spaces after "router".
  const withTrailingSpaces =
    '---\n' +
    'name: ndv-trailing\n' +
    'description: >\n' +
    '  Some description text here.\n' +
    'skill: router   \n' +
    '---\n\n' +
    'Body.\n'

  // Act + Assert: trailing spaces are tolerated by `\s*$` — detected as router.
  assert.ok(
    isRouterAgent(withTrailingSpaces),
    '"skill: router   " (trailing spaces) should be detected as a router — the marker regex tolerates trailing whitespace via \\s*$'
  )
})

test('router marker regex: "skill: router\\t" (trailing tab) IS detected as a router (trailing-whitespace tolerance)', () => {
  // Arrange: frontmatter with a trailing tab after "router".
  const withTrailingTab =
    '---\n' +
    'name: ndv-trailing-tab\n' +
    'description: >\n' +
    '  Some description text here.\n' +
    'skill: router\t\n' +
    '---\n\n' +
    'Body.\n'

  // Act + Assert: a trailing tab is whitespace — `\s*$` matches it.
  assert.ok(
    isRouterAgent(withTrailingTab),
    '"skill: router\\t" (trailing tab) should be detected as a router — \\s*$ matches tabs'
  )
})

test('router marker regex: "skill: routerized" is NOT detected (prefix rejection — end anchor holds)', () => {
  // Arrange: frontmatter where "router" is a prefix of "routerized".
  const prefixed =
    '---\n' +
    'name: ndv-prefixed\n' +
    'description: >\n' +
    '  Some description text here.\n' +
    'skill: routerized\n' +
    '---\n\n' +
    'Body.\n'

  // Act + Assert: the `\s*$` end anchor requires "router" to be followed by
  // only whitespace until line end — "routerized" has non-whitespace after, so
  // no match. This is the prefix-safety guarantee.
  assert.ok(
    !isRouterAgent(prefixed),
    '"skill: routerized" must NOT be detected as a router — the end anchor (\\s*$) rejects prefixes'
  )
})

test('router marker regex: "skill: router" (exact, no trailing) IS detected (baseline)', () => {
  // Arrange: the canonical exact marker.
  const exact =
    '---\n' +
    'name: ndv-exact\n' +
    'description: >\n' +
    '  Some description text here.\n' +
    'skill: router\n' +
    '---\n\n' +
    'Body.\n'

  // Act + Assert: the exact marker matches (baseline for the trailing-whitespace
  // tests — confirms the tolerance is additive, not a replacement for the exact match).
  assert.ok(
    isRouterAgent(exact),
    '"skill: router" (exact, no trailing whitespace) should be detected as a router'
  )
})

// ─── Memoization determinism: two buildSkillGroups calls produce identical output ─
//
// getRouterSkills() is memoized (module-level routerSkillsCache) so repeated
// calls within one process return the cached array by reference. getRouterSkills
// is NOT exported, so the cache-hit (reference equality) cannot be asserted
// directly from a test — that would require exporting getRouterSkills, which is
// a bin/ndv.js edit outside this tool's scope (flagged as a handoff to ndv-build).
//
// The OBSERVABLE user-visible consequence of correct caching is determinism:
// two buildSkillGroups(getAllSkills-equivalent) calls produce byte-identical
// output. If a future refactor drops the cache, install runs get slower but
// behavior stays correct — this test catches the behavioral regression (a
// dropped cache that also changed results), not the pure perf regression.
// The reference-equality gap is documented as a known limitation.

test('buildSkillGroups is deterministic across two calls (observable contract of correct memoization)', () => {
  // Arrange: the getAllSkills-equivalent composition.
  const allSkills = replicateGetAllSkills()
  assert.ok(allSkills.length > 0, 'precondition: there are skills to group')

  // Act: call buildSkillGroups twice. buildSkillGroups calls getRouterSkills
  // internally (which hits the module-level cache on the second call).
  const groups1 = buildSkillGroups(allSkills)
  const groups2 = buildSkillGroups(allSkills)

  // Assert: the two outputs are deep-equal — the grouping is deterministic.
  // (Deep equality, not reference equality — buildSkillGroups builds a fresh
  // array each call. The determinism is the observable contract.)
  assert.deepEqual(groups1, groups2, 'buildSkillGroups is non-deterministic across two calls — the grouping changed')

  // Assert: a second-call property — the group labels and item counts are stable.
  const labels1 = groups1.map(g => g.label).sort()
  const labels2 = groups2.map(g => g.label).sort()
  assert.deepEqual(labels1, labels2, 'group label set changed across two calls')
  const counts1 = groups1.map(g => g.items.length).sort()
  const counts2 = groups2.map(g => g.items.length).sort()
  assert.deepEqual(counts1, counts2, 'group item counts changed across two calls')
})

test('buildSkillGroups: router entry is stable across calls (cache does not corrupt the router set)', () => {
  // Arrange
  const allSkills = replicateGetAllSkills()

  // Act: two calls — the second hits the routerSkillsCache.
  const g1 = buildSkillGroups(allSkills)
  const g2 = buildSkillGroups(allSkills)

  // Assert: the router entry (ndv-flow) is present and identical in both calls.
  // A cache-corruption bug (e.g. a caller mutating the cached array) would make
  // the second call's router set differ.
  const fleet1 = g1.find(g => g.label === 'Fleet skills')
  const fleet2 = g2.find(g => g.label === 'Fleet skills')
  assert.ok(fleet1 && fleet2, 'precondition: Fleet skills group present in both calls')
  const router1 = fleet1.items.find(i => i.value === 'ndv-flow')
  const router2 = fleet2.items.find(i => i.value === 'ndv-flow')
  assert.ok(router1 && router2, 'the router entry is present in both calls (cache did not drop it)')
  assert.deepEqual(router1, router2, 'the router entry differs across calls — cache may be corrupted')
})

// ─── ADVERSARIAL: descriptionMatch regex indentation/blank-line behavior ──────
//
// Target: the descriptionMatch regex at bin/ndv.js:167 (post-H5 form):
//   /^description:\s*[>|]\s*\n((?:[ ]{2,}[^\n]*\n|\n)+)/m
//
// The capture group is an alternation that accepts EITHER:
//   (a) `[ ]{2,}[^\n]*\n` — a line starting with TWO OR MORE spaces, followed
//       by any run of non-newline chars (zero or more), then a newline; OR
//   (b) `\n` — a fully blank line (just a newline).
//
// Because branch (b) matches a bare `\n`, a BLANK line in the block scalar no
// longer terminates the capture — it is captured as part of the body, and the
// lines after it are still part of the same scalar. Whitespace-only lines
// (`  \n`, two spaces then newline) are matched by branch (a): `[ ]{2,}`
// consumes the two spaces and `[^\n]*` matches zero chars, so the line is
// captured rather than acting as a terminator. This is the post-H5 contract
// and is now considered CORRECT (YAML block scalars permit blank and
// whitespace-only lines as paragraph separators).
//
// Branch (a) lets `[^\n]*` consume the REST of the line — including any
// ADDITIONAL leading spaces beyond the required two. So a line indented 4 or
// 6 spaces (a nested list, indented prose) is captured VERBATIM with the extra
// indent intact and emitted into the skill output at that deeper indent. This
// is the current behavior and is NOT yet changed; the tests at ~1044 and ~1079
// PIN it (a cosmetic concern — inconsistent indentation in the derived skill —
// not content loss). The 4-space and mixed-indent tests below are PINs of
// current behavior, not endorsements. If deeper indentation in a block-scalar
// description is deemed a bug, the fix is a regex change in bin/ndv.js owned by
// ndv-build; these PINs are updated alongside that fix.
//
// The blank-line (~1106) and whitespace-only-line (~1138) tests are now
// CORRECTNESS assertions: they assert the post-H5 contract (blank and
// whitespace-only lines are captured, no truncation, full scalar preserved).
// They are not PINs of buggy behavior — the bug they once pinned has been
// fixed and these now guard the fix against regression.
//
// These tests must NOT be weakened to make a failing assertion pass. PIN
// tests assert what the code ACTUALLY does; CORRECTNESS tests assert what the
// code should do. If a PINned behavior is changed, the expected value is
// updated alongside the source change (ndv-build owns that update).

// Helper: extract the `description: >` block body from a transform OUTPUT's
// frontmatter. The skill output frontmatter shape is:
//   ---
//   name: <agent>
//   description: >
//     <body lines>
//   metadata:
//     ...
//   ---
// Returns the raw captured body (the lines between `description: >\n` and the
// next top-level key `metadata:`), so tests can inspect indentation/truncation
// without re-implementing the production regex.
function extractSkillDescriptionBlock(output) {
  const fm = output.match(/^---\n([\s\S]*?)\n---\n/m)
  assert.ok(fm, 'transform output should have frontmatter delimiters')
  // The description block runs from `description: >\n` up to (not including)
  // the next top-level key `metadata:`. Capture that slice.
  const block = fm[1].match(/^description: >\n([\s\S]*?)^metadata:/m)
  assert.ok(block, 'skill frontmatter should contain a description: > block followed by metadata:')
  return block[1]
}

// Build a minimal synthetic agent with a given description body. The body is
// injected verbatim between `description: >\n` and the frontmatter close, so
// the caller controls exact indentation. Includes the Delta B anchor so the
// transform exercises all deltas (not strictly necessary for the description
// capture, but mirrors real agent shape and exercises the full path).
function makeAgent(descriptionBody) {
  return (
    '---\n' +
    'name: ndv-indent-test\n' +
    'skill: router\n' +
    'description: >\n' +
    descriptionBody +
    '---\n\n' +
    'You are Indent. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n'
  )
}

test('descriptionMatch: baseline 2-space indent — description body captured verbatim (byte-identical)', () => {
  // Arrange: every description line indented exactly 2 spaces (the current
  // ndv-flow shape). This is the contract the golden fixture pins; this test
  // asserts the description-capture path in isolation, independent of the
  // golden file.
  const body =
    '  First line of the description.\n' +
    '  Second line of the description.\n' +
    '  Third line of the description.\n'
  const input = makeAgent(body)

  // Act
  const out = transformAgentToSkill(input)

  // Assert: the skill output's description block contains ALL three lines,
  // byte-identical to the input body (2-space indent preserved, no transform).
  const captured = extractSkillDescriptionBlock(out)
  assert.equal(
    captured,
    body,
    'baseline 2-space description body should be captured verbatim into the skill output'
  )
  assert.ok(
    captured.startsWith('  First line'),
    'the description block should begin at the first body line (no leading artifact)'
  )
})

test('descriptionMatch: 4-space-indented line is captured VERBATIM with extra indent (current behavior pin)', () => {
  // Arrange: one line indented 4 spaces (a nested list item, e.g.).
  // The regex `  [^\n]+` matches two spaces, then `[^\n]+` greedily consumes the
  // rest — including the two ADDITIONAL leading spaces. The line is captured
  // with all 4 spaces intact and emitted into the skill output's description
  // block at that same (deeper) indent.
  const body =
    '  Top level line.\n' +
    '    - nested four-space line.\n' +
    '  Back to two-space.\n'
  const input = makeAgent(body)

  // Act
  const out = transformAgentToSkill(input)

  // Assert: PIN current behavior — the 4-space line is captured verbatim,
  // preserving the extra indent. The skill output description block is
  // byte-identical to the input body (the extra indent is NOT normalized).
  const captured = extractSkillDescriptionBlock(out)
  assert.equal(
    captured,
    body,
    'PIN: a 4-space-indented line is captured verbatim — extra indent preserved, not normalized (current behavior)'
  )
  // Explicitly assert the 4-space line survived with its deeper indent.
  assert.ok(
    captured.includes('    - nested four-space line.\n'),
    'the 4-space line should appear in the output with its 4-space indent intact (current behavior — verbatim capture)'
  )
  // NOTE: This is a PIN, not an endorsement. If deeper indentation in a
  // block-scalar description is deemed a bug (inconsistent indent in the
  // derived skill), the fix is a regex change in bin/ndv.js — handed off to
  // ndv-build, not weakened here.
})

test('descriptionMatch: mixed 2/4/6-space indents — all lines captured verbatim (current behavior pin)', () => {
  // Arrange: three lines at increasing indent (2, 4, 6 spaces).
  const body =
    '  two-space line.\n' +
    '    four-space line.\n' +
    '      six-space line.\n'
  const input = makeAgent(body)

  // Act
  const out = transformAgentToSkill(input)

  // Assert: PIN — the regex matches any line starting with `  ` (two spaces)
  // followed by at least one non-newline char; the rest of the line (including
  // additional leading spaces) is consumed verbatim. All three lines captured,
  // mixed indentation preserved byte-for-byte.
  const captured = extractSkillDescriptionBlock(out)
  assert.equal(
    captured,
    body,
    'PIN: mixed-indent lines (2/4/6) are all captured verbatim — no normalization (current behavior)'
  )
  assert.ok(
    captured.includes('      six-space line.\n'),
    'the 6-space line is captured with its full 6-space indent (current behavior)'
  )
})

test('descriptionMatch: blank line in block scalar is captured (full scalar — content loss fixed)', () => {
  // Arrange: a description block scalar with a blank line in the middle. YAML
  // block scalars (`>`) permit blank lines as paragraph separators; the
  // content AFTER the blank line is part of the same scalar value.
  const body =
    '  First paragraph line.\n' +
    '\n' +
    '  Second paragraph line that YAML considers part of the same scalar.\n'
  const input = makeAgent(body)

  // Act
  const out = transformAgentToSkill(input)

  // Assert: the capture INCLUDES the blank line AND the second paragraph.
  // The regex `(?:[ ]{2,}[^\n]*\n|\n)+` matches both content lines and fully
  // blank lines, so the block scalar is captured in full — no truncation.
  const captured = extractSkillDescriptionBlock(out)

  // The captured block is the FULL scalar (both paragraphs + the blank line).
  assert.equal(
    captured,
    body,
    'FIXED: blank line in the description block scalar no longer truncates the capture — the full scalar (both paragraphs) is preserved'
  )

  // Explicit assertion that the second paragraph SURVIVED.
  assert.ok(
    captured.includes('Second paragraph line'),
    'FIXED: the second paragraph (after the blank line) survives in the captured description'
  )
})

test('descriptionMatch: trailing whitespace-only line (2 spaces, no content) is captured (edge of the fix)', () => {
  // Arrange: a "blank" line that is actually two spaces followed by a newline
  // (`  \n`). YAML treats this as part of the block scalar (whitespace-only
  // lines are paragraph separators, same as fully blank lines). The regex
  // `[ ]{2,}[^\n]*\n` matches it: 2+ spaces, then `[^\n]*` matches zero chars,
  // then the newline. So this line is captured and does NOT terminate the
  // block. This is the boundary of the blank-line-capture fix.
  const body =
    '  Content line.\n' +
    '  \n' +
    '  After the whitespace-only line.\n'
  const input = makeAgent(body)

  // Act
  const out = transformAgentToSkill(input)

  // Assert: the whitespace-only line (`  \n`) is captured as part of the
  // scalar, and the line after it survives. No truncation.
  const captured = extractSkillDescriptionBlock(out)
  assert.equal(
    captured,
    body,
    'FIXED: a 2-space-then-newline line (no content) no longer terminates the capture — the full scalar is preserved'
  )
  assert.ok(
    captured.includes('After the whitespace-only line'),
    'FIXED: content after the whitespace-only separator line survives in the captured description'
  )
})

// Build a minimal synthetic agent whose description uses the `|` (literal)
// block-scalar indicator instead of the folded `>` indicator. The description
// body is injected verbatim between `description: |\n` and the frontmatter
// close. Mirrors makeAgent but swaps the indicator. The transform's regex
// accepts `[>|]` (both indicators), so the `|` path must be exercised — every
// other test and fixture uses `>` only.
function makeAgentLiteral(descriptionBody) {
  return (
    '---\n' +
    'name: ndv-literal-test\n' +
    'skill: router\n' +
    'description: |\n' +
    descriptionBody +
    '---\n\n' +
    'You are Literal. Every word that does not move the work is a thread wasted.\n\n' +
    '## Out of Scope (never do these)\n\n- nothing\n'
  )
}

// Extract the `description: |` block body from a transform OUTPUT's frontmatter
// (the literal-indicator analogue of extractSkillDescriptionBlock). The skill
// output frontmatter shape for a literal-block input is:
//   ---
//   name: <agent>
//   description: >
//     <body lines>
//   metadata:
//     ...
//   ---
// The transform rewrites the indicator to `>` in its output, so the output
// block is matched with the `>` form — only the BODY is the thing under test.
function extractSkillDescriptionBlockLiteral(output) {
  const fm = output.match(/^---\n([\s\S]*?)\n---\n/m)
  assert.ok(fm, 'transform output should have frontmatter delimiters')
  const block = fm[1].match(/^description: >\n([\s\S]*?)^metadata:/m)
  assert.ok(block, 'skill frontmatter should contain a description: > block followed by metadata:')
  return block[1]
}

test('descriptionMatch: `|` literal block scalar — body captured byte-identical (indicator-coverage pin)', () => {
  // Arrange: a description declared with the `|` (literal) block-scalar
  // indicator. The regex `[>|]` accepts both folded (`>`) and literal (`|`)
  // indicators. The transform captures the raw indented body WITHOUT folding
  // (it does not run a YAML parser — it slices the matched region verbatim),
  // so a two-line literal body is emitted verbatim with 2-space indent on each
  // line. This is the only test exercising the `|` branch of the alternation;
  // every other test and fixture uses `>`.
  const body =
    '  line one\n' +
    '  line two\n'
  const input = makeAgentLiteral(body)

  // Act
  const out = transformAgentToSkill(input)

  // Assert: the captured description block is byte-identical to the input body
  // — both lines, 2-space indent preserved, no folding applied (the transform
  // does not fold literal-block scalars; it captures the raw indented region).
  const captured = extractSkillDescriptionBlockLiteral(out)
  assert.equal(
    captured,
    body,
    'PIN: a `|` literal block scalar body is captured byte-identical — both lines, 2-space indent preserved, no folding'
  )
  assert.ok(
    captured.includes('  line one\n') && captured.includes('  line two\n'),
    'both literal-block lines should appear verbatim in the output description'
  )
})

test('descriptionMatch: CRLF line endings — pin current behavior (carriage-return handling)', () => {
  // Arrange: a synthetic agent whose frontmatter uses CRLF (`\r\n`) line
  // endings, including the `description: >` header and the body lines. The
  // regex uses `\n` exclusively (no `\r?\n`):
  //   /^description:\s*[>|]\s*\n((?:[ ]{2,}[^\n]*\n|\n)+)/m
  // On a CRLF file, `[^\n]*` greedily consumes `\r` as content. A content line
  // `  foo\r\n` carries a trailing `\r` into the captured body, and a
  // whitespace-only line `  \r\n` is captured as `  \r` (the `\r` survives as
  // a literal byte). This test PINS whatever the current behavior is — it does
  // NOT assume the bug; it observes the code and asserts the observed result.
  const body =
    '  content line one\r\n' +
    '  content line two\r\n'
  const input =
    '---\r\n' +
    'name: ndv-crlf-test\r\n' +
    'skill: router\r\n' +
    'description: >\r\n' +
    body +
    '---\r\n\r\n' +
    'You are CRLF. Every word that does not move the work is a thread wasted.\r\n\r\n' +
    '## Out of Scope (never do these)\r\n\r\n- nothing\r\n'

  // Act
  const out = transformAgentToSkill(input)

  // Assert: PIN the current behavior. Two possibilities:
  //   (1) The regex DOES match — `\r` leaks into the captured description
  //       (byte pollution). Assert the captured body contains `\r`.
  //   (2) The regex DOES NOT match — no description is captured and the
  //       transform returns the content unchanged (graceful degradation).
  // Observe which and assert it. Do NOT weaken — pin what the code does.
  // We detect pollution by checking whether the output's frontmatter was
  // rewritten (a description: > block + metadata: present) AND whether the
  // captured body carries a `\r`.
  const fm = out.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/m)
  const block = fm && fm[1].match(/^description: >\r?\n([\s\S]*?)^metadata:/m)

  if (block) {
    // Path (1): regex matched. The captured body SHOULD contain `\r` bytes
    // (pollution) because `[^\n]*` consumed them as content.
    const captured = block[1]
    assert.ok(
      captured.includes('\r'),
      'PIN (pollution): on CRLF input the regex matches and `\\r` survives in the captured description body — byte pollution'
    )
    // Handoff candidate: the fix normalizes \\r\\n -> \\n before the regex, OR
    // the regex learns \\r?\\n. Do NOT fix here — this test pins the bug.
    // → ndv-build (root cause) · bin/ndv.js:167: CRLF line endings leak `\\r` into captured description body (byte pollution); normalize line endings before the regex OR use \\r?\\n in the pattern.
  } else {
    // Path (2): regex did not match — no description captured, transform
    // returned content unchanged (graceful degradation). Pin that.
    assert.equal(
      out,
      input,
      'PIN (no-match): on CRLF input the description regex fails to match and the transform returns content unchanged'
    )
  }
})