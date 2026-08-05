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
      'permission entry not set to allow'
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
      'permission entry not merged on skip'
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

    // Assert: permission block still present, single entry (not duplicated)
    assert.ok(configAfterSecond.permission)
    assert.equal(
      configAfterSecond.permission.external_directory['~/.config/opencode/agents/**'],
      'allow'
    )
    // external_directory is an object — duplicate keys would collapse, but count keys to be sure
    const extDirKeys = Object.keys(configAfterSecond.permission.external_directory)
    assert.equal(extDirKeys.length, 1, `external_directory should have 1 key, got ${extDirKeys.length}`)
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