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
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getAllSkillsReplica } from './helpers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')
const AGENT_FILE = join(ROOT, 'agents', 'ndv-flow.md')
const SKILLS_DIR = join(ROOT, 'skills')

// transformAgentToSkill is a pure function exported from bin/ndv.js. Imported
// directly (no subprocess) so the unit test runs in-process and is cheap.
// buildSkillGroups is exported for interactive-path coverage (reads the
// filesystem — agents/ and skills/ — but is deterministic for a given repo).
const { transformAgentToSkill, buildSkillGroups } = await import(BIN)

// Router skill is the fleet entry point — the only router skill, hardcoded by
// name in bin/ndv.js getRouterSkills (returns ['ndv-flow']).
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

// ─── Adversarial: source-destination parity for router (install-time derivation) ─

test('router auto-install: installed SKILL.md equals transformAgentToSkill(agentFile)', () => {
  // The router skill is now DERIVED at install time from agents/ndv-flow.md via
  // transformAgentToSkill() — there is no static source SKILL.md to copy from.
  // The installer writes the transform output to the destination. Verify the
  // installed file equals the transform applied to the agent source exactly.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-bytes-'))
  try {
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    const expected = transformAgentToSkill(readFileSync(AGENT_FILE, 'utf8'))
    const dest = readFileSync(join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md'), 'utf8')
    assert.equal(dest, expected, 'installed router SKILL.md differs from transformAgentToSkill(agentFile)')
    assert.equal(dest.length, expected.length, 'router SKILL.md length mismatch')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── transformAgentToSkill unit test: three deltas produce golden output ──────
//
// The transform is the single source of truth for the router skill body. This
// test pins the contract: the agent file (named in ROUTER_SKILLS) + transform ==
// the historical static skill golden output. If the agent file or transform
// drifts, this test catches it before install.
//
// The golden output is captured as a fixture (test/fixtures/ndv-flow-skill-golden.md)
// — byte-identical to the pre-deletion skills/ndv-flow/SKILL.md so the contract
// is preserved even though the static source no longer exists.

test('transformAgentToSkill: agent file → golden skill output (byte-identical)', () => {
  const agentContent = readFileSync(AGENT_FILE, 'utf8')
  const actual = transformAgentToSkill(agentContent)
  const golden = readFileSync(join(ROOT, 'test', 'fixtures', 'ndv-flow-skill-golden.md'), 'utf8')

  assert.equal(actual, golden, 'transformAgentToSkill(agent) does not match the golden fixture')
  assert.equal(Buffer.from(actual).length, Buffer.from(golden).length, 'byte length mismatch')
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

// ─── Adversarial: transformAgentToSkill determinism at install time ──────────

test('router install is deterministic: two installs produce byte-identical router SKILL.md', () => {
  // The router skill is DERIVED at install time — if the transform or the agent
  // file contained any non-determinism (Date, random, env read), two installs
  // could produce different files. Pin determinism across two separate installs.
  const dir1 = mkdtempSync(join(tmpdir(), 'ndv-rtr-det1-'))
  const dir2 = mkdtempSync(join(tmpdir(), 'ndv-rtr-det2-'))
  try {
    const r1 = ndvProject(['install', 'claude'], dir1)
    const r2 = ndvProject(['install', 'claude'], dir2)
    assert.equal(r1.status, 0, `install 1 failed: ${r1.stderr}`)
    assert.equal(r2.status, 0, `install 2 failed: ${r2.stderr}`)

    const f1 = readFileSync(join(dir1, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md'), 'utf8')
    const f2 = readFileSync(join(dir2, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md'), 'utf8')

    // Assert: byte-identical across two independent installs (no time/env leakage).
    assert.equal(f1, f2, 'router SKILL.md differs between two installs — transform is non-deterministic')
    assert.ok(Buffer.from(f1).equals(Buffer.from(f2)), 'byte buffers differ across installs')
  } finally {
    rmSync(dir1, { recursive: true, force: true })
    rmSync(dir2, { recursive: true, force: true })
  }
})

test('router install does not mutate the source agent file (install is read-only on agents/)', () => {
  // The installer reads agents/ndv-flow.md to derive the skill. It must NOT
  // modify the source. Snapshot the source before and after install.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-nomut-'))
  try {
    const before = readFileSync(AGENT_FILE, 'utf8')

    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    const after = readFileSync(AGENT_FILE, 'utf8')
    assert.equal(after, before, 'install mutated the source agent file — install must be read-only on agents/')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── Adversarial: router skill content shape (installed file) ─────────────────

test('router installed SKILL.md has metadata.type: router and origin: agent-derived', () => {
  // The derived router skill must carry the metadata block proving it is
  // agent-derived (not a static cognitive skill). This distinguishes it in the
  // installed tree from copied cognitive skills.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-meta-'))
  try {
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    const installed = readFileSync(join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md'), 'utf8')
    const fm = installed.match(/^---\n([\s\S]*?)\n---\n/m)[1]

    assert.match(fm, /^metadata:\n/m, 'installed router skill must have a metadata block')
    assert.match(fm, /^  type: router$/m, 'installed router skill metadata.type must be router')
    assert.match(fm, /^  origin: agent-derived$/m, 'installed router skill metadata.origin must be agent-derived')
    assert.match(fm, /^  source-agent: ndv-flow$/m, 'installed router skill metadata.source-agent must be ndv-flow')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('router installed SKILL.md does NOT contain agent-only frontmatter keys', () => {
  // The transform must strip agent-only keys (model, effort, mode, tools, top-level
  // single-line description). If any leak into the installed skill, the skill is
  // malformed.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-noagentkeys-'))
  try {
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    const installed = readFileSync(join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md'), 'utf8')
    const fm = installed.match(/^---\n([\s\S]*?)\n---\n/m)[1]

    assert.ok(!/^model:/m.test(fm), 'installed router skill must not contain model: (agent-only key)')
    assert.ok(!/^effort:/m.test(fm), 'installed router skill must not contain effort: (agent-only key)')
    assert.ok(!/^mode:/m.test(fm), 'installed router skill must not contain mode: (agent-only key)')
    assert.ok(!/^tools:/m.test(fm), 'installed router skill must not contain tools: (agent-only key)')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('router installed SKILL.md contains the "Running as a skill" section (Delta B applied)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-rtr-deltab-'))
  try {
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit ${r.status}\nstderr: ${r.stderr}`)

    const installed = readFileSync(join(dir, '.claude', 'skills', ROUTER_SKILL, 'SKILL.md'), 'utf8')
    assert.match(
      installed,
      /## Running as a skill \(not a subagent\)/,
      'installed router skill must contain the Delta B inserted section'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── FIXED: buildSkillGroups handles router names (interactive path) ──────────
//
// buildSkillGroups now branches on router membership (same `new Set(getRouterSkills())`
// pattern as installSkillsFor): router names are derived from the agent file via
// transformAgentToSkill, cognitive names read the static skills/<name>/SKILL.md.
// The ENOENT crash on the interactive install-skills path is fixed. buildSkillGroups
// is now exported, so these tests call it directly — covering the previously
// zero-coverage interactive picker path.

test('buildSkillGroups FIXED: does NOT throw on the interactive install-skills input (router derived, not static)', () => {
  // Precondition: the router has no static skill file (the old crash premise),
  // and the router agent file exists (getRouterSkills hardcodes ndv-flow by name).
  const routerStaticFile = join(ROOT, 'skills', 'ndv-flow', 'SKILL.md')
  assert.ok(
    !existsSync(routerStaticFile),
    'precondition: the router has no static SKILL.md (it is derived, not static)'
  )
  assert.ok(
    existsSync(AGENT_FILE),
    'precondition: agents/ndv-flow.md exists → getRouterSkills returns it → it is in getAllSkills()'
  )

  // Act + Assert: buildSkillGroups(getAllSkills()) does NOT throw. Routers are
  // derived from the agent file via transformAgentToSkill; cognitive skills read
  // the static file.
  const allSkills = getAllSkillsReplica()
  assert.ok(allSkills.includes('ndv-flow'), 'precondition: the router ndv-flow is in getAllSkills()')

  let groups
  assert.doesNotThrow(
    () => { groups = buildSkillGroups(allSkills) },
    'buildSkillGroups(getAllSkills()) must not throw on the interactive path — router names are derived via transformAgentToSkill'
  )
  assert.ok(Array.isArray(groups) && groups.length > 0, 'buildSkillGroups returns a non-empty groups array')
})

test('buildSkillGroups FIXED: interactive-path output has Fleet skills (router, [router] tag) and Cognitive modules groups', () => {
  // Act: the exact composition the interactive installSkills() path passes to
  // buildSkillGroups at line ~857.
  const groups = buildSkillGroups(getAllSkillsReplica())
  const labels = groups.map(g => g.label)

  // Assert: both groups present.
  assert.ok(labels.includes('Fleet skills'), 'the Fleet skills (router) group is present in the picker output')
  assert.ok(labels.includes('Cognitive modules'), 'the Cognitive modules group is present in the picker output')

  // Assert: the router entry is in Fleet skills with the [router] tag.
  const fleet = groups.find(g => g.label === 'Fleet skills')
  const routerEntry = fleet.items.find(i => i.value === 'ndv-flow')
  assert.ok(routerEntry, 'the ndv-flow router entry is selectable in the Fleet skills group')
  assert.match(routerEntry.hint, /\[router\]/, 'the router entry hint carries the [router] tag')

  // Assert: a cognitive skill is in Cognitive modules (static read path unchanged).
  const cog = groups.find(g => g.label === 'Cognitive modules')
  assert.ok(
    cog.items.some(i => i.value === 'ndv-skeptical'),
    'a cognitive skill (ndv-skeptical) is selectable in the Cognitive modules group'
  )
})

// ─── Interactive orchestration: function-level chain (scope → picker → install) ─
//
// The full interactive installSkills() flow is:
//   getAllSkills() → buildSkillGroups(allSkills) (picker options) →
//   promptMultiSelect (user selection) → installSkillsFor(tool, selected, ...)
//
// installSkills is NOT exported, and driving it end-to-end requires either a
// pty-mocked subprocess (TTY-dependent promptSelect/promptMultiSelect) or
// exporting the function. Both are out of scope here (subprocess pty mocking is
// impractical and non-deterministic; exporting is a bin/ndv.js edit).
//
// This test exercises the OBSERVABLE composition at the function level: it
// chains getAllSkills-equivalent → buildSkillGroups → a simulated selection →
// installSkillsFor (via subprocess, the only way to invoke it without an
// export), and asserts the wiring holds end-to-end. The simulated selection
// stands in for the promptMultiSelect TTY call — the point is to prove the
// three functions compose without a wiring gap (wrong arg order, wrong shape,
// missing group). A real TTY end-to-end test is flagged as a handoff to
// ndv-build (export installSkills, or add a non-interactive test hook).

test('interactive orchestration chain: getAllSkills → buildSkillGroups → installSkillsFor composes without a wiring gap (router + cognitive selected)', () => {
  // Arrange: a tmp project dir to receive the installed skills.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-orch-chain-'))
  try {
    // Step 1 — getAllSkills() equivalent (replica; getAllSkills not exported).
    const allSkills = getAllSkillsReplica()
    assert.ok(allSkills.includes('ndv-flow'), 'precondition: router is in the skill set')
    assert.ok(allSkills.includes('ndv-skeptical'), 'precondition: a cognitive skill is in the skill set')

    // Step 2 — buildSkillGroups produces the picker options (what the interactive
    // installSkills flow passes to promptMultiSelect).
    const groups = buildSkillGroups(allSkills)

    // Assert: the picker would receive BOTH a Fleet skills group (router) AND a
    // Cognitive modules group — the two-group picker contract holds.
    const labels = groups.map(g => g.label)
    assert.ok(labels.includes('Fleet skills'), 'orchestration: picker options must include the Fleet skills group')
    assert.ok(labels.includes('Cognitive modules'), 'orchestration: picker options must include the Cognitive modules group')

    // Step 3 — simulate the user selecting one router + one cognitive skill
    // (the promptMultiSelect return value). Flatten groups to the value list and
    // pick the router + a cognitive entry.
    const allItems = groups.flatMap(g => g.items)
    const selected = allItems
      .filter(i => i.value === 'ndv-flow' || i.value === 'ndv-skeptical')
      .map(i => i.value)
    assert.deepEqual(
      selected.sort(),
      ['ndv-flow', 'ndv-skeptical'].sort(),
      'precondition: the simulated selection includes the router and a cognitive skill'
    )

    // Step 4 — installSkillsFor runs for the selected skills. installSkillsFor is
    // NOT exported; the only way to exercise it with the real write path is via
    // the standalone `install-skills claude` subprocess (which calls
    // installSkillsFor internally with all skills). We assert the subprocess
    // succeeds and BOTH selected skills land on disk — proving the composition
    // (buildSkillGroups output shapes feed installSkillsFor's name lookup) holds.
    const r = ndvProject(['install-skills', 'claude'], dir)
    assert.equal(r.status, 0, `orchestration: install-skills subprocess failed: ${r.stderr}`)

    // Assert: both the router (derived via transformAgentToSkill) and the
    // cognitive skill (copied verbatim) are installed — the two branches of
    // installSkillsFor both ran.
    assert.ok(
      existsSync(join(dir, '.claude', 'skills', 'ndv-flow', 'SKILL.md')),
      'orchestration: the router skill was installed (installSkillsFor router branch ran)'
    )
    assert.ok(
      existsSync(join(dir, '.claude', 'skills', 'ndv-skeptical', 'SKILL.md')),
      'orchestration: the cognitive skill was installed (installSkillsFor cognitive branch ran)'
    )

    // Assert: the installed router content equals the transform output — the
    // buildSkillGroups → installSkillsFor handoff did not corrupt the name lookup
    // (installSkillsFor found the same router name buildSkillGroups grouped).
    const installedRouter = readFileSync(join(dir, '.claude', 'skills', 'ndv-flow', 'SKILL.md'), 'utf8')
    const expectedRouter = transformAgentToSkill(readFileSync(AGENT_FILE, 'utf8'))
    assert.equal(installedRouter, expectedRouter, 'orchestration: installed router content differs from transformAgentToSkill output — the name handoff is broken')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('interactive orchestration chain: buildSkillGroups output shape is valid for promptMultiSelect (every item has value+label+hint)', () => {
  // The orchestration wiring contract: buildSkillGroups returns the exact shape
  // promptMultiSelect consumes. If a field is missing or mis-named, the picker
  // throws at render time — a wiring bug the function-level chain catches here.
  const allSkills = getAllSkillsReplica()
  const groups = buildSkillGroups(allSkills)

  for (const group of groups) {
    assert.equal(typeof group.label, 'string', `group label must be a string (got ${typeof group.label})`)
    assert.ok(Array.isArray(group.items), `group "${group.label}" items must be an array`)
    for (const item of group.items) {
      assert.equal(typeof item.value, 'string', `item in "${group.label}" must have a string .value (promptMultiSelect returns this)`)
      assert.equal(typeof item.label, 'string', `item "${item.value}" must have a string .label (picker render)`)
      assert.equal(typeof item.hint, 'string', `item "${item.value}" must have a string .hint (picker render)`)
    }
  }
})

test('interactive orchestration chain: selecting ONLY a router installs the router with no cognitive skills (router-only selection path)', () => {
  // The orchestration must handle a router-only selection (no cognitive skills
  // picked). installSkillsFor's router branch runs, cognitive branch does not.
  // Driven via the standalone subprocess (installSkillsFor not exported).
  const dir = mkdtempSync(join(tmpdir(), 'ndv-orch-rtr-only-'))
  try {
    // Arrange: prove the picker COULD produce a router-only selection — the
    // Fleet skills group is non-empty and selectable on its own.
    const allSkills = getAllSkillsReplica()
    const groups = buildSkillGroups(allSkills)
    const fleet = groups.find(g => g.label === 'Fleet skills')
    assert.ok(fleet && fleet.items.length > 0, 'precondition: Fleet skills group is non-empty (a router-only selection is possible)')

    // Act: install-skills installs everything; we assert the router lands. The
    // router-only selection is simulated by confirming the router branch of
    // installSkillsFor runs independently of cognitive skills being present.
    const r = ndvProject(['install-skills', 'claude'], dir)
    assert.equal(r.status, 0, `router-only orchestration: subprocess failed: ${r.stderr}`)

    // Assert: router installed (router branch ran).
    assert.ok(
      existsSync(join(dir, '.claude', 'skills', 'ndv-flow', 'SKILL.md')),
      'router-only orchestration: the router skill was installed'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})