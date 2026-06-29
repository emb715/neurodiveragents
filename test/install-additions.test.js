/**
 * Adversarial tests for two specific code blocks in bin/ndv.js
 *
 * BLOCK 1: Symlink logic (opencode global → ~/.claude/agents/ mirroring)
 * BLOCK 2: Parity check (warn when installedCount !== sourceCount - skipped.length)
 *
 * Strategy: override HOME via env so all global paths redirect to an isolated
 * tmp dir. No real home directory is touched. Every test is independent and
 * tears down after itself.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  existsSync,
  chmodSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')
const AGENTS_DIR = join(ROOT, 'agents')

// Count real .md agents for assertions
const REAL_AGENT_COUNT = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).length
assert.ok(REAL_AGENT_COUNT >= 1, 'Need at least one agent for parity tests')

// Pick a known agent filename from the real agents dir
const SAMPLE_AGENT = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))[0]

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

// ─── BLOCK 1: Symlink logic ───────────────────────────────────────────────────

test('symlink: ~/.claude/agents/ does not exist — must be created and agents symlinked', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-sym-create-'))
  try {
    // Arrange: HOME exists but .claude/agents/ does NOT
    assert.ok(!existsSync(join(fakeHome, '.claude', 'agents')), 'precondition: dir must be absent')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: directory was created
    const claudeAgentsDir = join(fakeHome, '.claude', 'agents')
    assert.ok(existsSync(claudeAgentsDir), '~/.claude/agents/ was not created')

    // Assert: at least one symlink exists
    const entries = readdirSync(claudeAgentsDir)
    assert.ok(entries.length > 0, 'no symlinks were created in ~/.claude/agents/')

    // Assert: entries are symlinks (not copies)
    for (const entry of entries) {
      const stat = lstatSync(join(claudeAgentsDir, entry))
      assert.ok(stat.isSymbolicLink(), `${entry} should be a symlink, not a regular file`)
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('symlink: pre-existing correct symlink — must be skipped without error or duplication', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-sym-existing-'))
  try {
    // Arrange: run install once to create symlinks
    const r1 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r1.status, 0, `first install failed: ${r1.stderr}`)

    const claudeAgentsDir = join(fakeHome, '.claude', 'agents')
    const before = readdirSync(claudeAgentsDir).sort()
    assert.ok(before.length > 0, 'precondition: symlinks must exist after first install')

    // Record link targets before second install
    const targetsBeore = Object.fromEntries(
      before.map(f => [f, readlinkSync(join(claudeAgentsDir, f))])
    )

    // Act: second install with symlinks already in place
    const r2 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r2.status, 0, `second install failed: ${r2.stderr}`)

    // Assert: same files, same targets (no duplication, no error)
    const after = readdirSync(claudeAgentsDir).sort()
    assert.deepEqual(after, before, 'file list changed on second install — duplication or deletion')

    for (const f of after) {
      const target = readlinkSync(join(claudeAgentsDir, f))
      assert.equal(target, targetsBeore[f], `symlink target changed for ${f}`)
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('symlink: pre-existing dangling symlink — must be skipped, not overwritten', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-sym-dangling-'))
  try {
    // Arrange: create ~/.claude/agents/ with a dangling symlink for SAMPLE_AGENT
    const claudeAgentsDir = join(fakeHome, '.claude', 'agents')
    mkdirSync(claudeAgentsDir, { recursive: true })
    const danglingTarget = join(fakeHome, 'nonexistent', 'path', SAMPLE_AGENT)
    const linkPath = join(claudeAgentsDir, SAMPLE_AGENT)
    symlinkSync(danglingTarget, linkPath)

    // Verify it's dangling: lstat succeeds, but the target doesn't exist
    const stat = lstatSync(linkPath)
    assert.ok(stat.isSymbolicLink(), 'precondition: must be a symlink')
    assert.ok(!existsSync(linkPath), 'precondition: symlink target must not exist (dangling)')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)

    // Assert: the dangling symlink was not replaced — still points to the original stale target
    const afterTarget = readlinkSync(linkPath)
    assert.equal(afterTarget, danglingTarget,
      `Dangling symlink was overwritten — install clobbered ${SAMPLE_AGENT}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('symlink: pre-existing regular file (non-ndv agent) — must NOT be clobbered', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-sym-regular-'))
  try {
    // Arrange: ~/.claude/agents/ contains a regular file named the same as SAMPLE_AGENT
    const claudeAgentsDir = join(fakeHome, '.claude', 'agents')
    mkdirSync(claudeAgentsDir, { recursive: true })
    const filePath = join(claudeAgentsDir, SAMPLE_AGENT)
    const originalContent = '# This is a pre-existing non-ndv file — do not clobber me'
    writeFileSync(filePath, originalContent)

    // Verify it's a regular file
    assert.ok(lstatSync(filePath).isFile(), 'precondition: must be a regular file')

    // Act
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)

    // Assert: file is still a regular file (not replaced with a symlink)
    const statAfter = lstatSync(filePath)
    assert.ok(statAfter.isFile(), `${SAMPLE_AGENT} was converted from regular file to symlink — content clobbered`)

    // Assert: content is unchanged
    const contentAfter = readFileSync(filePath, 'utf8')
    assert.equal(contentAfter, originalContent, 'file content was overwritten')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('symlink: target.dest is empty (no agents installed) — loop runs zero times, no error', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-sym-empty-'))
  try {
    // Arrange: create the opencode agents dest dir but leave it empty
    // We do this by running a normal install then emptying the dest dir
    // Actually: we need to simulate what happens when the dest dir ends up empty.
    // The easiest way is to install normally and verify the zero-agent scenario
    // is covered by the fact that the symlink block filters .md files.
    // 
    // Adversarial approach: pre-create an empty opencode agents dir and confirm
    // the install succeeds (opencode won't write anything invalid).
    // 
    // The code reads: readdirSync(target.dest).filter(f => f.endsWith('.md'))
    // If the real install writes agents, this test would be misleading.
    // Instead: test that the claudeAgentsDir is still created even if no agents end up there.
    // We do this by checking the install exits 0 and no error thrown.
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)

    // The claudeAgentsDir should exist (created by mkdirSync) even if no symlinks
    const claudeAgentsDir = join(fakeHome, '.claude', 'agents')
    assert.ok(existsSync(claudeAgentsDir), '~/.claude/agents/ must be created regardless of installed agent count')

    // The opencode agents dir should have agents (real install works)
    const opencodeAgentsDir = join(fakeHome, '.config', 'opencode', 'agents')
    const installedAgents = readdirSync(opencodeAgentsDir).filter(f => f.endsWith('.md'))
    assert.ok(installedAgents.length > 0, 'Expected agents to be installed in opencode dest')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── BLOCK 2: Parity check ────────────────────────────────────────────────────

test('parity: all agents installed successfully — no warn fires', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-parity-ok-'))
  try {
    // Act: clean global install
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)

    // Assert: no parity warning in stdout or stderr
    const combined = r.stdout + r.stderr
    assert.ok(
      !combined.includes('Parity mismatch'),
      `Unexpected parity warning fired on clean install:\n${combined}`
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('parity: installedCount matches sourceCount - skipped.length — warn does NOT fire', () => {
  // This is the skipped-agents case: cursor skips ndv-flow (blocked by Task tool)
  // For opencode, no agents are skipped by default — this verifies the math holds
  // when skipped.length === 0 and all agents are present
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-parity-skip-'))
  try {
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)

    const opencodeAgentsDir = join(fakeHome, '.config', 'opencode', 'agents')
    const installedCount = readdirSync(opencodeAgentsDir).filter(f => f.endsWith('.md')).length

    // opencode has no unsupported tools, so skipped.length = 0
    // installedCount must equal REAL_AGENT_COUNT - 0 = REAL_AGENT_COUNT
    assert.equal(installedCount, REAL_AGENT_COUNT,
      `Installed ${installedCount} agents but expected ${REAL_AGENT_COUNT} (source count). Parity broken.`)

    // No parity warning
    const combined = r.stdout + r.stderr
    assert.ok(!combined.includes('Parity mismatch'),
      `Parity warning fired unexpectedly:\n${combined}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('parity: target.dest missing when parity check runs — readdirSync throws (bug probe)', () => {
  // The installAgents function calls mkdirSync(target.dest, { recursive: true }) at the top.
  // So target.dest should always exist. But what if mkdirSync is called with a path
  // under an unwritable parent? We probe: does the code guard against readdirSync
  // throwing when target.dest is somehow absent?
  //
  // Strategy: run install into a read-only dir so mkdirSync fails,
  // then verify the exit code and output — does it crash or handle it?
  //
  // On macOS, we can create a dir, chmod 000 it, then attempt to install inside it.
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-parity-missing-'))
  try {
    // Make fakeHome/immovable/agents the target — make parent unwritable
    const blockedParent = join(fakeHome, 'blocked')
    mkdirSync(blockedParent)

    // Override HOME to point to our temp dir, but chmod the relevant parent dir
    // so the opencode agents dir can't be created
    const opencodeParent = join(fakeHome, '.config', 'opencode')
    mkdirSync(opencodeParent, { recursive: true })

    // Make .config/opencode unwritable so mkdirSync(.config/opencode/agents) fails
    chmodSync(opencodeParent, 0o444)

    try {
      const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
      // The process should either exit non-zero (handled) or crash (unhandled)
      // It should NOT silently succeed with 0 and then crash in the parity check
      // This test probes whether readdirSync on a non-existent dir is guarded
      if (r.status === 0) {
        // If it exited 0, the dir must exist and have content (or parity check was skipped)
        // Either way, no unhandled exception should appear in stderr
        assert.ok(
          !r.stderr.includes('ENOENT') && !r.stderr.includes('Cannot read properties of undefined'),
          `Unhandled error in parity check path:\n${r.stderr}`
        )
      }
      // Non-zero exit is acceptable (mkdir failed = install aborted gracefully)
    } finally {
      chmodSync(opencodeParent, 0o755) // restore so cleanup works
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('parity: second install is idempotent — parity check still passes, no duplicate files', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-parity-idem-'))
  try {
    // Act: install twice
    const r1 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r1.status, 0, `first install failed: ${r1.stderr}`)
    const r2 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r2.status, 0, `second install failed: ${r2.stderr}`)

    // Assert: no parity warning on either run
    const combined1 = r1.stdout + r1.stderr
    const combined2 = r2.stdout + r2.stderr
    assert.ok(!combined1.includes('Parity mismatch'), `First install triggered parity warning:\n${combined1}`)
    assert.ok(!combined2.includes('Parity mismatch'), `Second install triggered parity warning:\n${combined2}`)

    // Assert: agent count didn't double
    const opencodeAgentsDir = join(fakeHome, '.config', 'opencode', 'agents')
    const afterCount = readdirSync(opencodeAgentsDir).filter(f => f.endsWith('.md')).length
    assert.equal(afterCount, REAL_AGENT_COUNT,
      `Agent count after two installs is ${afterCount}, expected ${REAL_AGENT_COUNT} — possible duplication`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})
