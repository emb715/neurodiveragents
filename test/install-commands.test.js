/**
 * Acceptance tests for Claude Code slash command installation in bin/ndv.js.
 *
 * Covers the `ndv install claude` code path that copies `commands/claude/*.md`
 * to `.claude/commands/` (project) or `~/.claude/commands/` (global).
 *
 * Behavioral contract:
 *   - ndv install claude            → copies commands/claude/*.md to .claude/commands/
 *   - ndv install claude --global   → copies commands/claude/*.md to ~/.claude/commands/
 *   - Idempotent: re-install does not duplicate, corrupt, or error
 *   - Files match source byte-for-byte
 *   - Destination dir is created when absent
 *
 * Isolation: every test runs in its own mkdtempSync tmp dir (project) or fake
 * HOME (global). No real filesystem state is touched. Tests are independent.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  chmodSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')
const SRC_COMMANDS_DIR = join(ROOT, 'commands', 'claude')

// Source command files — the bytes the installer must reproduce exactly.
const SRC_COMMANDS = readdirSync(SRC_COMMANDS_DIR).filter(f => f.endsWith('.md'))
assert.ok(SRC_COMMANDS.length >= 1, 'Expected at least one command in commands/claude/')

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

// ─── project scope ───────────────────────────────────────────────────────────

test('claude commands (project): copies all commands/claude/*.md to .claude/commands/', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cmd-proj-'))
  try {
    // Arrange: destination dir does not exist yet
    assert.ok(!existsSync(join(dir, '.claude', 'commands')), 'precondition: dest must be absent')

    // Act
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: dir was created
    assert.ok(existsSync(join(dir, '.claude', 'commands')), 'dest dir .claude/commands/ was not created')

    // Assert: every source command is present
    const installed = readdirSync(join(dir, '.claude', 'commands'))
    for (const cmd of SRC_COMMANDS) {
      assert.ok(installed.includes(cmd), `missing command file: ${cmd}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude commands (project): copied files match source byte-for-byte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cmd-bytes-'))
  try {
    ndvProject(['install', 'claude'], dir)

    for (const cmd of SRC_COMMANDS) {
      const src = readFileSync(join(SRC_COMMANDS_DIR, cmd))
      const dest = readFileSync(join(dir, '.claude', 'commands', cmd))
      // Buffer compare — catches truncation, encoding, newline mangling
      assert.ok(src.equals(dest), `${cmd} content differs from source`)
      // Explicit byte-length assertion for clarity in failure output
      assert.equal(dest.length, src.length, `${cmd} length mismatch: ${dest.length} vs ${src.length}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude commands (project): destination dir is created when absent (no pre-create needed)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cmd-mkdir-'))
  try {
    // Arrange: neither .claude nor .claude/commands exist
    assert.ok(!existsSync(join(dir, '.claude')), 'precondition: .claude/ must be absent')

    // Act
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: nested dir was created recursively
    assert.ok(existsSync(join(dir, '.claude', 'commands')), '.claude/commands/ not created from scratch')
    const installed = readdirSync(join(dir, '.claude', 'commands'))
    assert.ok(installed.length >= SRC_COMMANDS.length, 'expected all source commands installed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude commands (project): idempotent — second install does not duplicate or error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cmd-idem-'))
  try {
    // Act: install twice
    const r1 = ndvProject(['install', 'claude'], dir)
    assert.equal(r1.status, 0, `first install failed: ${r1.stderr}`)

    const r2 = ndvProject(['install', 'claude'], dir)
    assert.equal(r2.status, 0, `second install failed: ${r2.stderr}`)

    // Assert: file count unchanged (writeFileSync overwrites, no duplication)
    const installed = readdirSync(join(dir, '.claude', 'commands')).sort()
    const expected = [...SRC_COMMANDS].sort()
    assert.deepEqual(installed, expected, 'file list changed on re-install — duplication or extra files')

    // Assert: byte content still matches source after re-install
    for (const cmd of SRC_COMMANDS) {
      const src = readFileSync(join(SRC_COMMANDS_DIR, cmd))
      const dest = readFileSync(join(dir, '.claude', 'commands', cmd))
      assert.ok(src.equals(dest), `${cmd} corrupted by second install`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── global scope ────────────────────────────────────────────────────────────

test('claude commands (global): copies all commands/claude/*.md to ~/.claude/commands/', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cmd-glob-'))
  try {
    // Arrange: ~/.claude/commands does not exist
    assert.ok(!existsSync(join(fakeHome, '.claude', 'commands')), 'precondition: global dest must be absent')

    // Act
    const r = ndvGlobal(['install', 'claude', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: global dest dir was created
    const destDir = join(fakeHome, '.claude', 'commands')
    assert.ok(existsSync(destDir), '~/.claude/commands/ was not created for global install')

    // Assert: every source command present
    const installed = readdirSync(destDir)
    for (const cmd of SRC_COMMANDS) {
      assert.ok(installed.includes(cmd), `missing global command file: ${cmd}`)
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude commands (global): copied files match source byte-for-byte', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cmd-gbytes-'))
  try {
    ndvGlobal(['install', 'claude', '--global'], fakeHome)

    const destDir = join(fakeHome, '.claude', 'commands')
    for (const cmd of SRC_COMMANDS) {
      const src = readFileSync(join(SRC_COMMANDS_DIR, cmd))
      const dest = readFileSync(join(destDir, cmd))
      assert.ok(src.equals(dest), `global ${cmd} content differs from source`)
      assert.equal(dest.length, src.length, `global ${cmd} length mismatch`)
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude commands (global): idempotent — second install does not duplicate or error', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cmd-gidem-'))
  try {
    const r1 = ndvGlobal(['install', 'claude', '--global'], fakeHome)
    assert.equal(r1.status, 0, `first global install failed: ${r1.stderr}`)

    const r2 = ndvGlobal(['install', 'claude', '--global'], fakeHome)
    assert.equal(r2.status, 0, `second global install failed: ${r2.stderr}`)

    const destDir = join(fakeHome, '.claude', 'commands')
    const installed = readdirSync(destDir).sort()
    const expected = [...SRC_COMMANDS].sort()
    assert.deepEqual(installed, expected, 'global file list changed on re-install')

    for (const cmd of SRC_COMMANDS) {
      const src = readFileSync(join(SRC_COMMANDS_DIR, cmd))
      const dest = readFileSync(join(destDir, cmd))
      assert.ok(src.equals(dest), `global ${cmd} corrupted by second install`)
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── adversarial: pre-existing state ─────────────────────────────────────────

test('claude commands (project): pre-existing .claude/commands/ with stale file is overwritten, not duplicated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cmd-stale-'))
  try {
    // Arrange: dest dir exists with a stale/truncated version of a command
    const destDir = join(dir, '.claude', 'commands')
    mkdirSync(destDir, { recursive: true })
    const staleCmd = SRC_COMMANDS[0]
    writeFileSync(join(destDir, staleCmd), '# STALE CONTENT — should be overwritten\n')

    // Act
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: stale content was replaced with source content (byte-identical)
    const src = readFileSync(join(SRC_COMMANDS_DIR, staleCmd))
    const dest = readFileSync(join(destDir, staleCmd))
    assert.ok(src.equals(dest), 'stale command file was not overwritten with source bytes')

    // Assert: no extra/duplicate files
    const installed = readdirSync(destDir).sort()
    const expected = [...SRC_COMMANDS].sort()
    assert.deepEqual(installed, expected, 'unexpected file list after overwriting stale file')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude commands (project): pre-existing non-ndv file in dest is left in place, not deleted', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cmd-foreign-'))
  try {
    // Arrange: dest dir exists with a foreign file (user's own command)
    const destDir = join(dir, '.claude', 'commands')
    mkdirSync(destDir, { recursive: true })
    const foreignFile = 'my-custom-command.md'
    const foreignContent = '# My custom command — do not delete me\n'
    writeFileSync(join(destDir, foreignFile), foreignContent)

    // Act
    const r = ndvProject(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: foreign file still present and unchanged
    assert.ok(existsSync(join(destDir, foreignFile)), 'foreign command file was deleted by install')
    const after = readFileSync(join(destDir, foreignFile), 'utf8')
    assert.equal(after, foreignContent, 'foreign command file content was modified')

    // Assert: ndv commands also present alongside the foreign file
    const installed = readdirSync(destDir)
    for (const cmd of SRC_COMMANDS) {
      assert.ok(installed.includes(cmd), `missing ndv command: ${cmd}`)
    }
    assert.ok(installed.includes(foreignFile), 'foreign file should still be listed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude commands (project): install into read-only dest dir fails gracefully (no silent corruption)', () => {
  // Probe: if .claude/commands exists but is unwritable, does install crash or skip?
  // The install uses writeFileSync — we expect a non-zero exit or a handled error,
  // never a silent success with missing files.
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cmd-ro-'))
  try {
    const destDir = join(dir, '.claude', 'commands')
    mkdirSync(destDir, { recursive: true })
    chmodSyncReadOnly(destDir)

    const r = ndvProject(['install', 'claude'], dir)

    // Either it errored out (non-zero) OR it succeeded and wrote files.
    // What is NOT acceptable: exit 0 with an empty/stale dest dir.
    if (r.status === 0) {
      const installed = readdirSync(destDir).filter(f => f.endsWith('.md'))
      assert.ok(
        installed.length >= SRC_COMMANDS.length,
        `exit 0 but only ${installed.length} commands present — silent write failure`
      )
    }
    // Non-zero exit is acceptable — install aborted gracefully.
  } finally {
    // restore perms so cleanup works
    try { restorePerms(destDir) } catch {}
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── helpers for the read-only probe ─────────────────────────────────────────

function chmodSyncReadOnly(p) {
  chmodSync(p, 0o555)
}
function restorePerms(p) {
  chmodSync(p, 0o755)
}