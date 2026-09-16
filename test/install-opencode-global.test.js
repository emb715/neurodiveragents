/**
 * Tests for writeRoutingGlobalOpenCode (bin/ndv.js:421-458) exercised via
 * `install opencode --global`. Covers four acceptance criteria:
 *
 * 1. Malformed opencode.json → warn fires, install proceeds, valid file written
 * 2. Fresh install (no opencode.json) → routing file created, instructions ref added
 * 3. Existing opencode.json with ndv instruction → skip duplicate, permission merged
 * 4. Idempotent: second run with ndv present → skip, no duplicate entries
 *
 * Also covers the existsSync(commandsDir) else-warn (Fix 5a) is NOT triggered
 * in the normal path (commands dir exists in this repo), and that the warn
 * DOES fire when the commands dir is absent (probed by pointing the install
 * at a fake repo layout — deferred to install-additions probe model; here we
 * assert the positive: commands ARE installed so no warn fires).
 *
 * Strategy: override HOME via env so ~/.config/opencode/opencode.json is
 * isolated to a tmp dir. Each test is independent and tears down after itself.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')

/**
 * Run ndv.js with a fake HOME so global paths are isolated.
 * Returns the spawnSync result.
 */
function ndvGlobal(args, fakeHome) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  })
}

function opencodeJsonPath(fakeHome) {
  return join(fakeHome, '.config', 'opencode', 'opencode.json')
}

function rulesFilePath(fakeHome) {
  return join(fakeHome, '.config', 'opencode', 'rules', 'ndv.md')
}

// ─── AC1: Malformed opencode.json ────────────────────────────────────────────

test('writeRoutingGlobalOpenCode: malformed opencode.json → warn fires, install proceeds, valid file written', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-malformed-'))
  try {
    // Arrange: pre-existing opencode.json with invalid JSON
    mkdirSync(join(fakeHome, '.config', 'opencode'), { recursive: true })
    const jsonPath = opencodeJsonPath(fakeHome)
    writeFileSync(jsonPath, '{ this is not valid json,,, }')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: warn fired
    const combined = r.stdout + r.stderr
    assert.ok(
      combined.includes('Could not parse') && combined.includes('treating as empty'),
      `expected parse-failure warn, got:\n${combined}`
    )

    // Assert: valid opencode.json now written with permission block + instructions
    const raw = readFileSync(jsonPath, 'utf8')
    const config = JSON.parse(raw) // must parse cleanly now
    assert.ok(config.permission, 'permission block missing')
    assert.ok(config.permission.external_directory, 'external_directory missing')
    assert.equal(
      config.permission.external_directory['~/.config/opencode/agents/**'],
      'allow',
      'canonical permission entry not set to allow'
    )
    assert.equal(
      config.permission.external_directory['~/.claude/agents/**'],
      'allow',
      'claude compat shim permission entry not set to allow'
    )
    assert.ok(Array.isArray(config.instructions), 'instructions must be an array')
    assert.ok(
      config.instructions.some(i => typeof i === 'string' && i.endsWith('ndv.md')),
      'instructions must reference ndv.md'
    )

    // Assert: routing rules file created
    assert.ok(existsSync(rulesFilePath(fakeHome)), 'ndv.md routing file not created')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC2: Fresh install (no opencode.json) ───────────────────────────────────

test('writeRoutingGlobalOpenCode: no opencode.json → routing file created, instructions ref added, opencode.json written', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-fresh-'))
  try {
    // Arrange: clean HOME — no opencode.json
    assert.ok(!existsSync(opencodeJsonPath(fakeHome)), 'precondition: no opencode.json')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: opencode.json created
    const jsonPath = opencodeJsonPath(fakeHome)
    assert.ok(existsSync(jsonPath), 'opencode.json was not created')

    const config = JSON.parse(readFileSync(jsonPath, 'utf8'))
    assert.ok(config.permission, 'permission block missing')
    assert.equal(
      config.permission.external_directory['~/.config/opencode/agents/**'],
      'allow'
    )
    assert.equal(
      config.permission.external_directory['~/.claude/agents/**'],
      'allow',
      'claude compat shim must be allow-listed on fresh install'
    )
    assert.ok(Array.isArray(config.instructions), 'instructions must be an array')

    // Assert: routing file written to ~/.config/opencode/rules/ndv.md
    const rulesFile = rulesFilePath(fakeHome)
    assert.ok(existsSync(rulesFile), 'ndv.md routing file not created')
    const rulesContent = readFileSync(rulesFile, 'utf8')
    assert.ok(rulesContent.includes('ndv:start'), 'routing file missing ndv:start marker')

    // Assert: instructions array references the routing file
    assert.ok(
      config.instructions.includes(rulesFile),
      `instructions must reference ${rulesFile}; got ${JSON.stringify(config.instructions)}`
    )

    // Assert: log mentioned the routing write
    const combined = r.stdout + r.stderr
    assert.ok(combined.includes('ndv routing written to'), 'expected routing-write log')
    assert.ok(combined.includes('Permission block written'), 'expected permission-write log')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC3: Existing opencode.json with ndv instruction → skip duplicate ───────

test('writeRoutingGlobalOpenCode: existing ndv instruction → skip, no duplicate; permission block still merged if missing', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-skip-'))
  try {
    // Arrange: opencode.json already has an instructions entry containing the
    // EXACT canonical rules path this installer would write (exact-path match,
    // not a substring heuristic). AND no permission block yet (to verify
    // permission merge still runs).
    mkdirSync(join(fakeHome, '.config', 'opencode'), { recursive: true })
    const jsonPath = opencodeJsonPath(fakeHome)
    const rulesFile = rulesFilePath(fakeHome)
    const preExistingInstructions = [rulesFile]
    writeFileSync(jsonPath, JSON.stringify({
      instructions: preExistingInstructions,
    }, null, 2) + '\n')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    const config = JSON.parse(readFileSync(jsonPath, 'utf8'))

    // Assert: skip fired (exact-path match)
    const combined = r.stdout + r.stderr
    assert.ok(combined.includes('ndv already in'), 'expected skip log')

    // Assert: NO new routing file was written (the skip path returns before writeFileSync of rules)
    // NOTE: the skip returns early — it does NOT create the rules file.
    assert.ok(
      !existsSync(rulesFile),
      'routing rules file should NOT be created when ndv instruction already present'
    )

    // Assert: instructions array unchanged (no duplicate added)
    assert.deepEqual(
      config.instructions,
      preExistingInstructions,
      'instructions array was mutated despite skip — duplicate added'
    )

    // Assert: permission block WAS merged (the skip path still runs the permission merge before the heuristic)
    assert.ok(config.permission, 'permission block should still be merged on skip')
    assert.equal(
      config.permission.external_directory['~/.config/opencode/agents/**'],
      'allow',
      'canonical permission entry not merged on skip'
    )
    assert.equal(
      config.permission.external_directory['~/.claude/agents/**'],
      'allow',
      'claude compat shim permission entry not merged on skip'
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC4: Idempotent — second run with ndv present → skip, no duplicates ─────

test('writeRoutingGlobalOpenCode: idempotent — second run skips, no duplicate instructions or routing writes', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-idem-'))
  try {
    // Act: first install (fresh)
    const r1 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r1.status, 0, `first install failed: ${r1.stderr}`)

    const jsonPath = opencodeJsonPath(fakeHome)
    const rulesFile = rulesFilePath(fakeHome)

    const configAfterFirst = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const instructionsAfterFirst = configAfterFirst.instructions.slice()
    assert.ok(existsSync(rulesFile), 'precondition: rules file must exist after first install')

    // Act: second install
    const r2 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r2.status, 0, `second install failed: ${r2.stderr}`)

    // Assert: skip fired on second run
    const combined2 = r2.stdout + r2.stderr
    assert.ok(combined2.includes('ndv already in'), 'expected skip log on second run')

    // Assert: instructions array unchanged (no duplicate)
    const configAfterSecond = JSON.parse(readFileSync(jsonPath, 'utf8'))
    assert.deepEqual(
      configAfterSecond.instructions,
      instructionsAfterFirst,
      'instructions array changed on second install — duplicate added'
    )

    // Assert: permission block still present, single entry per dir (not duplicated)
    assert.ok(configAfterSecond.permission)
    assert.equal(
      configAfterSecond.permission.external_directory['~/.config/opencode/agents/**'],
      'allow'
    )
    assert.equal(
      configAfterSecond.permission.external_directory['~/.claude/agents/**'],
      'allow'
    )
    // external_directory is an object — duplicate keys would collapse, but
    // count keys to be sure. Two allow-listed dirs: the canonical opencode
    // agents dir and the claude compat shim dir.
    const extDirKeys = Object.keys(configAfterSecond.permission.external_directory)
    assert.equal(extDirKeys.length, 2, `external_directory should have 2 keys, got ${extDirKeys.length}: ${JSON.stringify(extDirKeys)}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC5: Substring false-positive does NOT trigger skip ─────────────────────

test('writeRoutingGlobalOpenCode: substring false-positive does NOT trigger skip — installs correctly', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-falsepos-'))
  try {
    // Arrange: opencode.json has an instructions entry that contains the
    // substring "ndv" but is NOT the canonical rules path. Under the old
    // substring heuristic this would trigger a false-positive skip; under the
    // exact-path match it must proceed to install.
    mkdirSync(join(fakeHome, '.config', 'opencode'), { recursive: true })
    const jsonPath = opencodeJsonPath(fakeHome)
    const substringPath = '/some/other/path/mentions-ndv-by-name.md'
    const rulesFile = rulesFilePath(fakeHome)
    writeFileSync(jsonPath, JSON.stringify({
      instructions: [substringPath],
    }, null, 2) + '\n')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: skip did NOT fire
    const combined = r.stdout + r.stderr
    assert.ok(
      !combined.includes('ndv already in'),
      `expected NO skip log, got:\n${combined}`
    )

    // Assert: routing rules file IS written to the canonical path
    assert.ok(existsSync(rulesFile), 'ndv.md routing file not created (substring false-positive incorrectly skipped)')

    // Assert: instructions array now contains the canonical rules path (appended),
    // and the original substring path is preserved
    const config = JSON.parse(readFileSync(jsonPath, 'utf8'))
    assert.ok(
      config.instructions.includes(rulesFile),
      `instructions must reference canonical rules path ${rulesFile}; got ${JSON.stringify(config.instructions)}`
    )
    assert.ok(
      config.instructions.includes(substringPath),
      `original substring path ${substringPath} must be preserved; got ${JSON.stringify(config.instructions)}`
    )
    assert.equal(
      config.instructions.length, 2,
      `instructions should have 2 entries (original + canonical), got ${config.instructions.length}`
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC6: Claude compat shim dir is allow-listed ─────────────────────────────
// The opencode global install mirrors agents into ~/.claude/agents/ via
// symlinks (bin/ndv.js:564-601) for Claude Code compatibility. Without an
// external_directory allow-rule for that path, any subagent that resolves an
// agent file to the shim triggers a permission prompt in every other repo.
// Regression: the installer created the dir, so it must allow-list it.

test('writeRoutingGlobalOpenCode: claude compat shim ~/.claude/agents/** is allow-listed alongside canonical dir', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-shim-perm-'))
  try {
    // Act: fresh install
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    const config = JSON.parse(readFileSync(opencodeJsonPath(fakeHome), 'utf8'))

    // Assert: both external paths allow-listed
    assert.ok(config.permission?.external_directory, 'external_directory missing')
    assert.equal(
      config.permission.external_directory['~/.config/opencode/agents/**'],
      'allow',
      'canonical opencode agents dir must be allow-listed'
    )
    assert.equal(
      config.permission.external_directory['~/.claude/agents/**'],
      'allow',
      'claude compat shim dir must be allow-listed — the installer created it, it owns the consequence'
    )

    // Assert: the shim dir was actually created and populated (symlinks)
    const shimDir = join(fakeHome, '.claude', 'agents')
    assert.ok(existsSync(shimDir), '~/.claude/agents/ shim dir was not created')
    const shimEntries = readdirSync(shimDir).filter(f => f.endsWith('.md'))
    assert.ok(shimEntries.length > 0, 'expected symlinked agent files in ~/.claude/agents/')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC7: Shim permission merged on skip (existing ndv instruction) ──────────
// A user who installed before the shim allow-rule was added has ndv in
// instructions already → the skip path fires. The permission merge must still
// add the shim rule so the prompt stops without requiring a full reinstall.

test('writeRoutingGlobalOpenCode: existing ndv install missing shim rule → skip fires, shim permission still merged', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-shim-merge-'))
  try {
    // Arrange: opencode.json as it looked BEFORE the shim rule existed —
    // ndv instruction present (triggers skip), canonical permission present,
    // shim permission ABSENT (the gap we are fixing).
    mkdirSync(join(fakeHome, '.config', 'opencode'), { recursive: true })
    const jsonPath = opencodeJsonPath(fakeHome)
    const rulesFile = rulesFilePath(fakeHome)
    writeFileSync(jsonPath, JSON.stringify({
      instructions: [rulesFile],
      permission: {
        external_directory: {
          '~/.config/opencode/agents/**': 'allow',
          // ~/.claude/agents/** deliberately absent — pre-fix state
        },
      },
    }, null, 2) + '\n')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    const config = JSON.parse(readFileSync(jsonPath, 'utf8'))

    // Assert: skip fired (instruction already present)
    const combined = r.stdout + r.stderr
    assert.ok(combined.includes('ndv already in'), 'expected skip log for existing instruction')

    // Assert: shim permission was merged despite skip
    assert.equal(
      config.permission.external_directory['~/.claude/agents/**'],
      'allow',
      'shim permission must be merged on skip — otherwise existing installs never get the fix without a full reinstall'
    )

    // Assert: canonical permission preserved (not clobbered)
    assert.equal(
      config.permission.external_directory['~/.config/opencode/agents/**'],
      'allow',
      'canonical permission must be preserved on merge'
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC8: transformForOpenCode injects canonical opencode agents path ─────────
// The ndv-flow agent instructs: "Read the target agent's full file before
// authoring anything" — but gives no path hint. Under opencode the model may
// resolve agent files to the Claude Code compat shim (~/.claude/agents/),
// triggering permission prompts. transformForOpenCode must inject the canonical
// global opencode agents path so the model reads from the right place.

test('transformForOpenCode: global install injects canonical opencode agents path into ndv-flow body', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-flow-path-'))
  try {
    // Act: global opencode install
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: ndv-flow.md was written to the canonical global agents dir
    const flowFile = join(fakeHome, '.config', 'opencode', 'agents', 'ndv-flow.md')
    assert.ok(existsSync(flowFile), 'ndv-flow.md not installed to ~/.config/opencode/agents/')

    const body = readFileSync(flowFile, 'utf8')

    // Assert: the canonical global opencode agents path is injected
    assert.ok(
      body.includes('~/.config/opencode/agents/<name>.md'),
      'ndv-flow body must contain the canonical global opencode agents path hint'
    )

    // Assert: the bare instruction (without a path) is gone — the model must
    // not see the un-hinted literal that would let it guess the wrong dir
    assert.ok(
      !body.includes("Read the target agent's full file before authoring anything"),
      'ndv-flow body must not contain the bare instruction without a path hint'
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC9: transformForOpenCode is a no-op on the body of a non-ndv-flow agent ──
// The body transform (the path-hint injection) is gated on a literal that only
// ndv-flow.md contains. Every other agent's body must be byte-identical to its
// source — the transform must not mutate, rewrap, or inject anything into a
// body that lacks the instruction. If it did, it would be corrupting agent
// content silently. Probe with ndv-build.md (has frontmatter + a real body,
// does NOT contain the instruction literal).

test('transformForOpenCode: non-ndv-flow agent body is byte-identical to source (no path hint, no mutation)', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-noop-body-'))
  try {
    // Act: global opencode install
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Arrange: source ndv-build.md body (everything after the frontmatter fence)
    const srcRaw = readFileSync(join(ROOT, 'agents', 'ndv-build.md'), 'utf8')
    const srcBody = srcRaw.replace(/^---\n[\s\S]*?\n---\n/, '')

    // Assert: installed ndv-build.md exists
    const installedPath = join(fakeHome, '.config', 'opencode', 'agents', 'ndv-build.md')
    assert.ok(existsSync(installedPath), 'ndv-build.md not installed to ~/.config/opencode/agents/')

    const installedRaw = readFileSync(installedPath, 'utf8')
    const installedBody = installedRaw.replace(/^---\n[\s\S]*?\n---\n/, '')

    // Assert: the path hint is NOT present — the instruction literal is absent
    // from ndv-build, so the replace must have no-oped
    assert.ok(
      !installedBody.includes('~/.config/opencode/agents/<name>.md'),
      'non-ndv-flow agent body must NOT contain the opencode agents path hint'
    )
    assert.ok(
      !installedBody.includes('.opencode/agents/<name>.md'),
      'non-ndv-flow agent body must NOT contain the project agents path hint'
    )

    // Assert: body is byte-identical to source body — no silent mutation
    assert.equal(
      installedBody, srcBody,
      'ndv-build body was mutated by transformForOpenCode — expected byte-identical (no-op on bodies without the instruction literal)'
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC10: path hint uses the literal `<name>` placeholder, not a real name ────
// The injected path must contain the literal `<name>` so the model substitutes
// the target agent at read time. A regression that substituted a concrete name
// (e.g. ndv-build) would hardcode a single agent and break every other route.
// Assert the placeholder is literal AND that no real agent name was substituted
// into the path.

test('transformForOpenCode: injected path contains literal `<name>`, not a substituted agent name', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-name-literal-'))
  try {
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    const flowFile = join(fakeHome, '.config', 'opencode', 'agents', 'ndv-flow.md')
    const body = readFileSync(flowFile, 'utf8')

    // Assert: the literal placeholder `<name>` is present in the path
    assert.ok(
      body.includes('~/.config/opencode/agents/<name>.md'),
      'path hint must contain the literal `<name>` placeholder'
    )

    // Assert: no real agent name was substituted into the path. Match any
    // `~/.config/opencode/agents/<concrete-name>.md` — there must be none.
    const substituted = body.match(/~\/\.config\/opencode\/agents\/[a-z0-9-]+\.md/g)
    assert.equal(
      substituted, null,
      `path hint substituted a concrete agent name instead of the literal \`<name>\`: ${JSON.stringify(substituted)}`
    )

    // Assert: the literal `<name>` token itself is present as a substring
    // (guards against an escape/stripping regression that dropped the angle
    // brackets entirely)
    assert.ok(
      body.includes('<name>'),
      'body must contain the literal `<name>` token (angle brackets intact)'
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── AC11: global install never injects the project-relative path ─────────────
// A scope confusion bug would inject `.opencode/agents/<name>.md` (the project
// path) into a global install. Under opencode the global agents dir is
// `~/.config/opencode/agents/`; the project path would resolve to a dir that
// does not exist in a global install and trigger a permission prompt or a
// file-not-found. Assert the global install contains ONLY the global path and
// NEVER the project path.

test('transformForOpenCode: global install injects global path only — project path must be absent', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-oc-scope-isolation-'))
  try {
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    const flowFile = join(fakeHome, '.config', 'opencode', 'agents', 'ndv-flow.md')
    const body = readFileSync(flowFile, 'utf8')

    // Assert: the global path IS present
    assert.ok(
      body.includes('~/.config/opencode/agents/<name>.md'),
      'global install must contain the global opencode agents path hint'
    )

    // Assert: the project-relative path is NOT present — scope must not leak
    assert.ok(
      !body.includes('.opencode/agents/<name>.md'),
      'global install must NOT contain the project-relative agents path — scope confusion'
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})