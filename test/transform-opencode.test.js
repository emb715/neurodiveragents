/**
 * Direct unit tests for transformForOpenCode() in bin/ndv.js.
 *
 * Scope:
 *   - transformForOpenCode as a PURE function (no filesystem, no CLI spawn)
 *   - Two-layer gate: agentFilename === 'ndv-flow.md' (primary guard) AND the
 *     literal instruction match (defensive belt-and-suspenders, also the actual
 *     replace mechanism)
 *   - /g flag on the replace regex — all occurrences of the literal get the
 *     path hint, not just the first
 *
 * Contract under test (from the brief):
 *   transformForOpenCode(content, isGlobal, agentFilename) rewrites Claude Code
 *   frontmatter into OpenCode-native frontmatter (always, regardless of filename)
 *   and additionally injects a host-specific path hint into ndv-flow's
 *   "Read the target agent's full file before authoring anything" instruction —
 *   but ONLY when agentFilename === 'ndv-flow.md'. The injected path always
 *   contains the literal placeholder `<name>` (angle brackets), never a
 *   substituted real agent name — substitution happens at read time, not
 *   install time.
 *
 * Test framework: node:test + node:assert/strict, ESM imports via `await import(BIN)`.
 * Matches test/transform-skill.test.js conventions.
 *
 * Isolation: every test sets up its own state; no shared state. This file
 * touches no filesystem writes and spawns no CLI process — transformForOpenCode
 * is called directly as a pure function.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')
const FLOW_AGENT_FILE = join(ROOT, 'agents', 'ndv-flow.md')
const BUILD_AGENT_FILE = join(ROOT, 'agents', 'ndv-build.md')

// transformForOpenCode is a pure function exported from bin/ndv.js.
const { transformForOpenCode } = await import(BIN)

const BARE_INSTRUCTION = "Read the target agent's full file before authoring anything"

// ─── ndv-flow.md + isGlobal=true → global opencode path hint injected ────────

test('transformForOpenCode: ndv-flow.md + isGlobal=true injects the global opencode agents path, bare instruction absent', () => {
  // Arrange
  const flowContent = readFileSync(FLOW_AGENT_FILE, 'utf8')

  // Act
  const out = transformForOpenCode(flowContent, true, 'ndv-flow.md')

  // Assert: global path hint present with the `<name>` placeholder.
  assert.match(
    out,
    /~\/\.config\/opencode\/agents\/<name>\.md/,
    'expected global opencode agents path with <name> placeholder to be injected'
  )
  // Assert: the bare (un-hinted) instruction no longer appears verbatim.
  assert.ok(
    !out.includes(BARE_INSTRUCTION),
    'bare instruction (without path hint) should not remain in output'
  )
})

// ─── ndv-flow.md + isGlobal=false → project opencode path hint injected ──────

test('transformForOpenCode: ndv-flow.md + isGlobal=false injects the project opencode agents path, bare instruction absent', () => {
  // Arrange
  const flowContent = readFileSync(FLOW_AGENT_FILE, 'utf8')

  // Act
  const out = transformForOpenCode(flowContent, false, 'ndv-flow.md')

  // Assert: project-relative path hint present with the `<name>` placeholder.
  assert.match(
    out,
    /\.opencode\/agents\/<name>\.md/,
    'expected project opencode agents path with <name> placeholder to be injected'
  )
  // Assert: the bare (un-hinted) instruction no longer appears verbatim.
  assert.ok(
    !out.includes(BARE_INSTRUCTION),
    'bare instruction (without path hint) should not remain in output'
  )
})

// ─── Non-flow agent → filename gate blocks the body replace entirely ─────────

test('transformForOpenCode: non-flow agent (ndv-build.md) leaves body unchanged regardless of isGlobal (filename gate blocks the replace)', () => {
  // Arrange: a real agent file that does not carry the "Read the target
  // agent's full file..." instruction at all — but even if it did, the
  // filename gate must block the replace since agentFilename !== 'ndv-flow.md'.
  const buildContent = readFileSync(BUILD_AGENT_FILE, 'utf8')

  // Act: call with both isGlobal values — body must be identical either way.
  const outGlobal = transformForOpenCode(buildContent, true, 'ndv-build.md')
  const outProject = transformForOpenCode(buildContent, false, 'ndv-build.md')

  // Assert: frontmatter transform still ran (mode: injected), but the body
  // portion is byte-identical across isGlobal values, and byte-identical to
  // the body portion of the original content — the filename gate blocks the
  // body replace even though frontmatter still transforms.
  const fmMatch = buildContent.match(/^(---\n)([\s\S]*?)(^---\n)/m)
  const originalBody = buildContent.slice(fmMatch[0].length)

  const globalBody = outGlobal.slice(outGlobal.indexOf('\n---\n') + '\n---\n'.length)
  const projectBody = outProject.slice(outProject.indexOf('\n---\n') + '\n---\n'.length)

  assert.equal(globalBody, originalBody, 'body should be unchanged when agentFilename is not ndv-flow.md (isGlobal=true)')
  assert.equal(projectBody, originalBody, 'body should be unchanged when agentFilename is not ndv-flow.md (isGlobal=false)')
  assert.equal(globalBody, projectBody, 'body must be identical regardless of isGlobal when filename gate blocks the replace')
})

// ─── /g flag: literal appearing twice → both occurrences get the path hint ───

test('transformForOpenCode: literal instruction appearing twice in ndv-flow.md content gets the path hint on BOTH occurrences (/g flag)', () => {
  // Arrange: synthetic content with valid frontmatter and the literal
  // instruction duplicated in the body.
  const input =
    '---\n' +
    'name: ndv-flow\n' +
    'description: >\n' +
    '  Fleet orchestrator.\n' +
    'mode: agent\n' +
    'tools:\n' +
    '  - Task\n' +
    '---\n\n' +
    "You are Flow. Read the target agent's full file before authoring anything.\n\n" +
    "Reminder: Read the target agent's full file before authoring anything, again.\n"

  // Act
  const out = transformForOpenCode(input, true, 'ndv-flow.md')

  // Assert: both occurrences were rewritten with the path hint.
  const hintOccurrences = (out.match(/~\/\.config\/opencode\/agents\/<name>\.md/g) ?? []).length
  assert.equal(hintOccurrences, 2, 'expected both occurrences of the literal to receive the path hint (/g flag)')

  // Assert: no bare (un-hinted) occurrence remains.
  assert.ok(!out.includes(BARE_INSTRUCTION), 'no bare instruction should remain after the /g replace')
})

// ─── Degradation: no frontmatter delimiters → returns content unchanged ──────

test('transformForOpenCode: no frontmatter delimiters returns content unchanged (existing degradation behavior)', () => {
  // Arrange: content with no `---` block — the frontmatter-delimiter regex
  // (fmMatch) fails, triggering the early return.
  const input = "name: x\nRead the target agent's full file before authoring anything.\nBody text."

  // Act
  const out = transformForOpenCode(input, true, 'ndv-flow.md')

  // Assert: returned verbatim (early return when fmMatch fails) — even though
  // agentFilename is 'ndv-flow.md' and the literal is present, the frontmatter
  // gate short-circuits before the body transform is ever reached.
  assert.equal(out, input, 'content without frontmatter delimiters should be returned unchanged')
})

// ─── Injected path always uses the literal placeholder, not a real name ──────

test('transformForOpenCode: injected path always contains the literal placeholder <name> (angle brackets), never a substituted real agent name', () => {
  // Arrange
  const flowContent = readFileSync(FLOW_AGENT_FILE, 'utf8')

  // Act
  const outGlobal = transformForOpenCode(flowContent, true, 'ndv-flow.md')
  const outProject = transformForOpenCode(flowContent, false, 'ndv-flow.md')

  // Assert: the literal placeholder `<name>` appears verbatim (angle brackets
  // preserved) — substitution to a real agent slug (e.g. `ndv-build`) never
  // happens at install time.
  assert.match(outGlobal, /<name>\.md/, 'expected literal <name> placeholder in global output')
  assert.match(outProject, /<name>\.md/, 'expected literal <name> placeholder in project output')

  // Assert: no real agent filename slug was substituted in place of <name>.
  assert.ok(!/agents\/ndv-flow\.md`/.test(outGlobal), 'placeholder should not be substituted with a real agent name')
})

// ─── ADVERSARIAL: gate bypass attempts, missing arg, and content/gate mismatch ─
//
// The six tests above are the happy path and clean boundaries. The gate is a
// strict `===` string comparison — that is exactly the kind of code a lazy
// caller or a future refactor breaks quietly. Everything below assumes the
// gate is guilty (silently fails open, or crashes) until proven innocent.

// ─── Gate bypass: wrong-case filename must NOT match (case-sensitive gate) ───

test('transformForOpenCode: uppercase/mixed-case filename variants do NOT bypass the gate (case-sensitive ===, fails closed)', () => {
  // Arrange: content carrying the literal instruction, so if the gate were
  // case-insensitive (or absent), the replace would fire.
  const input =
    '---\n' +
    'name: ndv-flow\n' +
    'mode: agent\n' +
    '---\n\n' +
    "Read the target agent's full file before authoring anything.\n"

  const caseVariants = ['NDV-FLOW.MD', 'Ndv-Flow.md', 'ndv-Flow.MD', 'NDV-flow.md']

  for (const variant of caseVariants) {
    // Act
    const out = transformForOpenCode(input, true, variant)

    // Assert: the strict `===` comparison does not match any case variant —
    // no path hint injected, bare instruction survives untouched.
    assert.ok(
      !out.includes('opencode/agents/<name>.md'),
      `case variant "${variant}" must NOT trigger injection (gate is case-sensitive)`
    )
    assert.ok(
      out.includes("Read the target agent's full file before authoring anything"),
      `case variant "${variant}" must leave the bare instruction untouched`
    )
  }

  // Note on intent: this is almost certainly the CORRECT behavior — the real
  // call site (bin/ndv.js ~line 505/519) derives agentFilename directly from
  // `readdirSync(AGENTS_DIR)` filenames on a case-sensitive filesystem convention
  // (all agent files are lowercase `ndv-*.md` by repo convention), so a
  // case-mismatched variant reaching this function would indicate a bug
  // upstream (e.g. a renamed file), not something the gate should paper over
  // by being lenient. Failing closed (no injection) is the safe default here.
  // Flagged to ndv-diagnose below only as a documentation note, not because
  // this test found a live bug.
})

// ─── Gate bypass: path-segment-qualified filename must NOT match ────────────

test('transformForOpenCode: path-qualified agentFilename ("agents/ndv-flow.md", "./ndv-flow.md") does NOT bypass the gate (exact bare-filename match required)', () => {
  // Arrange
  const input =
    '---\n' +
    'name: ndv-flow\n' +
    'mode: agent\n' +
    '---\n\n' +
    "Read the target agent's full file before authoring anything.\n"

  const pathVariants = ['agents/ndv-flow.md', './ndv-flow.md', '/abs/path/ndv-flow.md', 'ndv-flow.md/']

  for (const variant of pathVariants) {
    // Act
    const out = transformForOpenCode(input, true, variant)

    // Assert: exact-match gate rejects anything that is not the bare filename —
    // this fails CLOSED (no injection), which is the safe direction. If a
    // future refactor changed the call site to pass a full/relative path
    // instead of the bare `agent` entry from readdirSync, this test would
    // start failing and surface the regression immediately rather than
    // silently producing un-hinted ndv-flow.md installs.
    assert.ok(
      !out.includes('opencode/agents/<name>.md'),
      `path-qualified variant "${variant}" must NOT trigger injection (exact bare-filename match only)`
    )
  }
})

// ─── Regression pin: the real call site passes the BARE filename, not a path ─
//
// Traced bin/ndv.js: `const agents = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))`
// (~line 505) followed by `for (const agent of agents)` (~line 508) and
// `transformForOpenCode(content, isGlobal, agent)` (~line 520). `readdirSync`
// without `{ withFileTypes: true }` returns bare entry names only (no path
// segments prepended) — so `agent` for the flow file is always the bare
// string `'ndv-flow.md'`. This test pins that exact value shape so a refactor
// that switches to `withFileTypes: true` + `.name`, or that joins AGENTS_DIR
// into the identifier, is caught here instead of silently breaking the gate
// in production.

test('transformForOpenCode: regression pin — bare filename shape ("ndv-flow.md", no path segments) is required for the gate to fire', () => {
  // Arrange: exact shape readdirSync(AGENTS_DIR) produces for the flow agent.
  const bareFilename = 'ndv-flow.md'
  const input =
    '---\n' +
    'name: ndv-flow\n' +
    'mode: agent\n' +
    '---\n\n' +
    "Read the target agent's full file before authoring anything.\n"

  // Act
  const out = transformForOpenCode(input, true, bareFilename)

  // Assert: the bare shape DOES trigger injection — pinning the contract that
  // the call site must keep passing readdirSync's bare entry name verbatim.
  assert.ok(
    out.includes('opencode/agents/<name>.md'),
    'bare filename "ndv-flow.md" (readdirSync entry shape) must trigger the gate'
  )
})

// ─── Missing third argument: caller forgets agentFilename entirely ──────────

test('transformForOpenCode: called with agentFilename omitted (2-arg call) does not crash and fails CLOSED (no injection)', () => {
  // Arrange: content that would trigger injection if the gate were somehow
  // satisfied by `undefined`.
  const input =
    '---\n' +
    'name: ndv-flow\n' +
    'mode: agent\n' +
    '---\n\n' +
    "Read the target agent's full file before authoring anything.\n"

  // Act: simulate a caller that forgot the third parameter entirely.
  let out
  assert.doesNotThrow(() => {
    out = transformForOpenCode(input, true)
  }, 'transformForOpenCode must not throw when agentFilename is omitted')

  // Assert: fails closed — `undefined === 'ndv-flow.md'` is false, so no
  // injection happens and the bare instruction survives untouched.
  assert.ok(
    !out.includes('opencode/agents/<name>.md'),
    'omitted agentFilename must not trigger injection (undefined !== "ndv-flow.md")'
  )
  assert.ok(
    out.includes("Read the target agent's full file before authoring anything"),
    'bare instruction must survive untouched when agentFilename is omitted'
  )
  // Assert: frontmatter transform still runs independently of the gate —
  // only the body replace is gated, not the whole function.
  assert.match(out, /^mode: subagent$/m, 'frontmatter transform must still run when agentFilename is omitted')
})

// ─── Gate satisfied but literal instruction absent from content ────────────

test('transformForOpenCode: agentFilename === "ndv-flow.md" but the literal instruction is absent from content — no crash, no orphaned/malformed injection', () => {
  // Arrange: valid frontmatter, correct gate-satisfying filename, but the
  // literal "Read the target agent's full file before authoring anything"
  // string has been edited out of the body (simulating future drift in
  // ndv-flow.md's prose without a matching update to this function).
  const input =
    '---\n' +
    'name: ndv-flow\n' +
    'mode: agent\n' +
    '---\n\n' +
    'You are Flow. Go read the file before you do anything, please.\n' +
    'No literal match here at all.\n'

  // Act
  let out
  assert.doesNotThrow(() => {
    out = transformForOpenCode(input, true, 'ndv-flow.md')
  }, 'transformForOpenCode must not throw when the literal instruction is absent from content')

  // Assert: no orphaned path hint anywhere in the output — the replace is a
  // no-op string replace on an absent literal, so the path fragment must not
  // appear at all (it only ever gets written wrapped around the literal).
  assert.ok(
    !out.includes('opencode/agents/<name>.md'),
    'no orphaned path hint should appear when the literal instruction is absent from content'
  )
  assert.ok(
    !out.includes('<name>.md'),
    'the <name> placeholder must not leak into output when there is no instruction to attach it to'
  )
  // Assert: the unrelated body text is preserved verbatim (no mangling).
  assert.ok(
    out.includes('You are Flow. Go read the file before you do anything, please.'),
    'unrelated body text must be preserved verbatim when the literal does not match'
  )
})
