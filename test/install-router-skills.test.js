/**
 * Acceptance tests for router-skill auto-install behavior in bin/ndv.js.
 *
 * Behavioral contract (from the brief):
 *   - installAgents() auto-installs router skills (metadata.type: router) ONLY for
 *     tools with SKILL_TARGETS[tool].autoInstallRouters === true (claude), in both
 *     project and global scope. OpenCode has autoInstallRouters: false — the
 *     ndv-flow router skill body references Claude Code's Agent tool dispatch syntax
 *     and is not portable to OpenCode.
 *   - Cognitive skills remain OPTIONAL — not auto-installed. Only installed via
 *     the interactive picker or --all.
 *   - Router skills are excluded from the picker and the --all block (both use
 *     getCognitiveSkills()) because they are already auto-installed (claude) or
 *     intentionally skipped (opencode).
 *   - Tools that do not support skills (cursor, copilot) get NO skills dir.
 *   - The standalone `ndv install-skills` command still uses getAllSkills() and
 *     installs everything including routers (unaffected by autoInstallRouters).
 *
 * Isolation: every test runs in its own mkdtempSync tmp dir (project) or fake HOME
 * (global). No real filesystem state is touched. Tests are independent.
 *
 * Test framework: node:test + assert/strict, spawnSync — matches install-commands.test.js
 *
 * NOTE: resolveSkillDir() was fixed to use resolve(dir) — global paths route
 * correctly. Tests below assert the fixed behavior.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')

// Router skill is the fleet entry point — the only metadata.type: router skill.
const ROUTER_SKILL = 'ndv-flow'
// A known cognitive-module skill used to assert optionality.
const COGNITIVE_SKILL = 'ndv-skeptical'

/**
 * Run ndv.js in a project-scoped cwd (tmp dir).
 */
function ndvProject(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
  })
}

/**
 * Run ndv.js with a fake HOME so global paths redirect to an isolated tmp dir.
 * Matches the ndvGlobal pattern from install-additions.test.js.
 */
function ndvGlobal(args, fakeHome) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  })
}

// ─── Router auto-install (installAgents path, project scope) ─────────────────

test('router auto-install (claude, project): .claude/skills/ndv-flow/SKILL.md exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-claude-proj-'))
  try {
    // Arrange: dest must not pre-exist
    assert.ok(!existsSync(join(dir, '.claude', 'skills')), 'precondition: skills dir absent')

    // Act
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: router skill file present at expected project path
    const routerFile = join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(existsSync(routerFile), `router skill not auto-installed: ${routerFile}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('router auto-install (opencode, project): .opencode/skills/ndv-flow/SKILL.md NOT installed (autoInstallRouters:false)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-oco-proj-'))
  try {
    assert.ok(!existsSync(join(dir, '.opencode', 'skills')), 'precondition: skills dir absent')

    const r = ndvProject(['install', 'opencode'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: router skill NOT auto-installed for opencode (autoInstallRouters: false).
    // The ndv-flow router skill body references Claude Code's Agent tool dispatch
    // syntax and is not portable to OpenCode — only claude auto-installs routers.
    const routerFile = join(dir, '.opencode', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(!existsSync(routerFile), `router skill should NOT be auto-installed for opencode: ${routerFile}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Router auto-install (installAgents path, global scope) ──────────────────
// resolveSkillDir() was fixed to use resolve(dir) — global paths route correctly.

test('router auto-install (claude, global): ~/.claude/skills/ndv-flow/SKILL.md exists', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-rtr-claude-glob-'))
  try {
    assert.ok(!existsSync(join(fakeHome, '.claude', 'skills')), 'precondition: global skills dir absent')

    const r = ndvGlobal(['install', 'claude', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: router skill present in fake HOME (the contract: global install
    // routes skills to ~/.claude/skills/).
    const routerFile = join(fakeHome, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(existsSync(routerFile), `router skill not auto-installed globally: ${routerFile}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('router auto-install (opencode, global): ~/.config/opencode/skills/ndv-flow/SKILL.md NOT installed (autoInstallRouters:false)', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-rtr-oco-glob-'))
  try {
    assert.ok(!existsSync(join(fakeHome, '.config', 'opencode', 'skills')), 'precondition: global skills dir absent')

    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: router skill NOT auto-installed globally for opencode (autoInstallRouters: false).
    const routerFile = join(fakeHome, '.config', 'opencode', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(!existsSync(routerFile), `router skill should NOT be auto-installed globally for opencode: ${routerFile}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── Tools that do not support skills get NO skills dir ───────────────────────

test('no skills dir: cursor install does not create a skills directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-cursor-'))
  try {
    const r = ndvProject(['install', 'cursor'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: no .claude/skills, no .cursor/skills, no .opencode/skills created
    assert.ok(!existsSync(join(dir, '.claude', 'skills')), '.claude/skills should not be created for cursor')
    assert.ok(!existsSync(join(dir, '.cursor', 'skills')), '.cursor/skills should not be created for cursor')
    assert.ok(!existsSync(join(dir, '.opencode', 'skills')), '.opencode/skills should not be created for cursor')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('no skills dir: copilot install does not create a skills directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-copilot-'))
  try {
    const r = ndvProject(['install', 'copilot'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: no skills dir of any kind created
    assert.ok(!existsSync(join(dir, '.claude', 'skills')), '.claude/skills should not be created for copilot')
    assert.ok(!existsSync(join(dir, '.opencode', 'skills')), '.opencode/skills should not be created for copilot')
    assert.ok(!existsSync(join(dir, '.github', 'skills')), '.github/skills should not be created for copilot')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Idempotency ──────────────────────────────────────────────────────────────

test('router auto-install is idempotent: second install does not error and file still exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-idem-'))
  try {
    // Act: install twice
    const r1 = ndvProject(['install', 'claude'], dir)
    assert.equal(r1.status, 0, `first install failed: ${r1.stderr}`)

    const r2 = ndvProject(['install', 'claude'], dir)
    assert.equal(r2.status, 0, `second install failed: ${r2.stderr}`)

    // Assert: router skill still present after re-install
    const routerFile = join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(existsSync(routerFile), 'router skill disappeared after second install')

    // Assert: no duplicate router dirs (single ndv-flow entry)
    const skills = readdirSync(join(dir, '.claude', 'skills'))
    const routers = skills.filter(f => f === ROUTER_SKILL)
    assert.equal(routers.length, 1, `expected exactly one ${ROUTER_SKILL} dir, found ${routers.length}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Cognitive skills remain optional (not auto-installed) ────────────────────

test('cognitive skills optional: ndv-skeptical NOT present without --all or picker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-cogopt-'))
  try {
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: router IS present (auto-installed)
    assert.ok(
      existsSync(join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')),
      'router skill should be auto-installed'
    )

    // Assert: cognitive skill NOT present (must be opt-in)
    assert.ok(
      !existsSync(join(dir, '.claude', 'skills', COGNITIVE_SKILL)),
      `cognitive skill ${COGNITIVE_SKILL} was auto-installed — it must remain optional`
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Router excluded from --all block (uses getCognitiveSkills) ───────────────

test('--all installs cognitive skills AND router (router from auto-install, not from --all)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-all-'))
  try {
    const r = ndvProject(['install', 'claude', '--all'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: cognitive skill IS installed via --all block
    assert.ok(
      existsSync(join(dir, '.claude', 'skills', COGNITIVE_SKILL, 'SKILL.md')),
      `cognitive skill ${COGNITIVE_SKILL} should be installed by --all`
    )

    // Assert: router skill ALSO present (from auto-install, which runs in installAgents
    // before the --all block). The --all block uses getCognitiveSkills() so it does
    // NOT re-install the router — but auto-install already put it there.
    assert.ok(
      existsSync(join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')),
      'router skill should be present (from auto-install)'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--all does not duplicate router: exactly one ndv-flow dir after --all install', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-allnodup-'))
  try {
    const r = ndvProject(['install', 'claude', '--all'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: no duplicate router dirs — getCognitiveSkills excludes routers from
    // the --all block, and auto-install writes the router once. If the --all block
    // incorrectly used getAllSkills (which includes routers), the router would
    // still only appear once (copyFileSync overwrites), so this is a structural
    // sanity check, not a duplication detector. The real guard is that the
    // --all block does not independently list routers.
    const skills = readdirSync(join(dir, '.claude', 'skills'))
    const routers = skills.filter(f => f === ROUTER_SKILL)
    assert.equal(routers.length, 1, `expected one ${ROUTER_SKILL}, found ${routers.length}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--all (global): cognitive skills installed to fake HOME', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-rtr-allglob-'))
  try {
    const r = ndvGlobal(['install', 'claude', '--global', '--all'], fakeHome)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: cognitive skill installed to fake HOME (correct behavior)
    const cogFile = join(fakeHome, '.claude', 'skills', COGNITIVE_SKILL, 'SKILL.md')
    assert.ok(existsSync(cogFile), `cognitive skill should be installed to ${cogFile}`)

    // Assert: router also in fake HOME
    const routerFile = join(fakeHome, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(existsSync(routerFile), `router skill should be installed to ${routerFile}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── Standalone install-skills still installs routers (getAllSkills) ──────────

test('install-skills (standalone, project): ndv-flow installed via getAllSkills', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-skl-proj-'))
  try {
    const r = ndvProject(['install-skills', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: standalone install-skills uses getAllSkills() — includes routers
    const routerFile = join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(existsSync(routerFile), `router skill should be installed by standalone install-skills: ${routerFile}`)

    // Sanity: cognitive also installed (getAllSkills includes everything non-frozen)
    assert.ok(
      existsSync(join(dir, '.claude', 'skills', COGNITIVE_SKILL, 'SKILL.md')),
      `cognitive skill should also be installed by standalone install-skills`
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('install-skills (standalone, project): ndv-flow installed to .opencode/skills (flag-independent)', () => {
  // Guards the contract: the standalone `ndv install-skills opencode` command uses
  // getAllSkills() and installs EVERYTHING including routers — regardless of the
  // per-tool autoInstallRouters flag (which is false for opencode and only governs
  // the installAgents auto-install path). Only claude standalone was covered; this
  // closes the gap for opencode.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-skl-oco-'))
  try {
    assert.ok(!existsSync(join(dir, '.opencode', 'skills')), 'precondition: skills dir absent')

    // Act
    const r = ndvProject(['install-skills', 'opencode'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: router skill installed to .opencode/skills via the getAllSkills path,
    // even though SKILL_TARGETS.opencode.autoInstallRouters === false. The flag must
    // NOT leak into the standalone command.
    const routerFile = join(dir, '.opencode', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(existsSync(routerFile), `router skill should be installed by standalone install-skills opencode: ${routerFile}`)

    // Sanity: cognitive also installed (getAllSkills includes everything non-frozen)
    assert.ok(
      existsSync(join(dir, '.opencode', 'skills', COGNITIVE_SKILL, 'SKILL.md')),
      `cognitive skill should also be installed by standalone install-skills opencode`
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('install-skills (standalone, global): ndv-flow installed to fake HOME', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-rtr-skl-glob-'))
  try {
    const r = ndvGlobal(['install-skills', 'claude', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    // Assert: router installed to fake HOME via getAllSkills path
    const routerFile = join(fakeHome, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md')
    assert.ok(existsSync(routerFile), `router skill should be installed globally by standalone install-skills: ${routerFile}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('install-skills (standalone) rejects cursor (skills not supported)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-skl-cursor-'))
  try {
    const r = ndvProject(['install-skills', 'cursor'], dir)

    // Assert: non-zero exit — cursor does not support skills (SKILL_TARGETS has no entry)
    assert.notEqual(r.status, 0, 'install-skills cursor should fail (cursor does not support skills)')
    // Assert: error message names the tool
    assert.match(r.stderr, /not supported for cursor/i, 'expected "not supported for cursor" error')
    // Assert: no skills dir created
    assert.ok(!existsSync(join(dir, '.cursor', 'skills')), 'no .cursor/skills should be created')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Adversarial: source-destination parity for router ─────────────────────────

test('router auto-install: installed SKILL.md is byte-identical to source', () => {
  // The installer uses copyFileSync — no transform. Verify the installed file
  // matches the source exactly (catches truncation, encoding issues, or a future
  // bug that transforms router skills).
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-bytes-'))
  try {
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    const src = readFileSync(join(ROOT, 'skills', ROUTER_SKILL, 'SKILL.md'))
    const dest = readFileSync(join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md'))
    assert.ok(src.equals(dest), 'installed router SKILL.md differs from source')
    assert.equal(dest.length, src.length, 'router SKILL.md length mismatch')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Adversarial: SKILL_TARGETS lookup miss path ──────────────────────────────

test('SKILL_TARGETS miss: unknown tool does not create skills dir even if agents install', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-miss-'))
  try {
    // An unknown tool should be rejected before any install runs.
    const r = ndvProject(['install', 'nope'], dir)
    assert.notEqual(r.status, 0, 'unknown tool should not exit 0')

    // No skills dir created for an unknown tool
    assert.ok(!existsSync(join(dir, '.nope', 'skills')), 'no skills dir for unknown tool')
    assert.ok(!existsSync(join(dir, '.claude', 'skills')), 'no .claude/skills for unknown tool')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})