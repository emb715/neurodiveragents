/**
 * Adversarial tests for two specific code blocks in bin/ndv.js
 *
 * BLOCK 1: Claude Code agent files written by the opencode global install (~/.claude/agents/)
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
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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

// ─── BLOCK 1: Claude Code agent files (opencode global → ~/.claude/agents/) ───
//
// The opencode global install writes the Claude Code format files (agents/
// source, verbatim) into ~/.claude/agents/. It used to symlink the OpenCode
// format files there; those have no name:, so Claude Code never registered them.

const claudeDir = home => join(home, '.claude', 'agents')
const opencodeDir = home => join(home, '.config', 'opencode', 'agents')

test('claude files: ~/.claude/agents/ absent: created with regular files identical to agents/ source', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-create-'))
  try {
    assert.ok(!existsSync(claudeDir(fakeHome)), 'precondition: dir must be absent')
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    const entries = readdirSync(claudeDir(fakeHome)).filter(f => f.endsWith('.md'))
    assert.equal(entries.length, REAL_AGENT_COUNT)
    for (const entry of entries) {
      const p = join(claudeDir(fakeHome), entry)
      assert.ok(lstatSync(p).isFile() && !lstatSync(p).isSymbolicLink(), `${entry} must be a regular file`)
      assert.equal(readFileSync(p, 'utf8'), readFileSync(join(AGENTS_DIR, entry), 'utf8'), `${entry} must match the source`)
      assert.match(readFileSync(p, 'utf8'), new RegExp(`^---\\nname: ${entry.replace('.md', '')}\\n`), `${entry} must start with name: <stem>`)
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude files: each tool gets its own format, OpenCode files carry no Claude Code keys', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-split-'))
  try {
    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)
    for (const entry of readdirSync(opencodeDir(fakeHome)).filter(f => f.endsWith('.md'))) {
      const oc = readFileSync(join(opencodeDir(fakeHome), entry), 'utf8')
      const fm = oc.match(/^---\n([\s\S]*?)^---\n/m)[1]
      assert.doesNotMatch(fm, /^(name|tools|disallowedTools):/m, `${entry}: OpenCode file must not carry Claude Code keys`)
      assert.match(fm, /^mode: /m, `${entry}: mode missing`)
      assert.match(fm, /^permission:\n/m, `${entry}: permission missing`)
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude files: old symlinks to the OpenCode files are replaced, and the OpenCode files are not overwritten through them', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-oldlinks-'))
  try {
    // Arrange: the old shim layout, an OpenCode file plus a symlink to it
    mkdirSync(opencodeDir(fakeHome), { recursive: true })
    mkdirSync(claudeDir(fakeHome), { recursive: true })
    const ocFile = join(opencodeDir(fakeHome), SAMPLE_AGENT)
    writeFileSync(ocFile, '---\ndescription: old\nmode: subagent\n---\n')
    symlinkSync(ocFile, join(claudeDir(fakeHome), SAMPLE_AGENT))

    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)

    const linkPath = join(claudeDir(fakeHome), SAMPLE_AGENT)
    assert.ok(!lstatSync(linkPath).isSymbolicLink(), 'old symlink must be replaced by a regular file')
    assert.equal(readFileSync(linkPath, 'utf8'), readFileSync(join(AGENTS_DIR, SAMPLE_AGENT), 'utf8'))
    assert.doesNotMatch(readFileSync(ocFile, 'utf8'), /^name:/m, 'OpenCode file was overwritten with Claude Code content')
    assert.ok((r.stdout + r.stderr).includes('replaced 1 old symlink(s)'), `expected the replaced-link note; got:\n${r.stdout}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude files: pre-existing dangling symlink: must be skipped, not overwritten', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-dangling-'))
  try {
    mkdirSync(claudeDir(fakeHome), { recursive: true })
    const danglingTarget = join(fakeHome, 'nonexistent', 'path', SAMPLE_AGENT)
    const linkPath = join(claudeDir(fakeHome), SAMPLE_AGENT)
    symlinkSync(danglingTarget, linkPath)
    assert.ok(!existsSync(linkPath), 'precondition: symlink target must not exist (dangling)')

    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)
    assert.equal(readlinkSync(linkPath), danglingTarget, `Dangling symlink was overwritten, install clobbered ${SAMPLE_AGENT}`)
    assert.ok(!existsSync(danglingTarget), 'install must not write through a dangling symlink')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude files: valid symlink to some other real file: replaced, and the other file is untouched', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-wrongtarget-'))
  try {
    mkdirSync(claudeDir(fakeHome), { recursive: true })
    const otherFile = join(fakeHome, 'some-other-real.md')
    writeFileSync(otherFile, '# I am a real file, but the wrong target')
    const linkPath = join(claudeDir(fakeHome), SAMPLE_AGENT)
    symlinkSync(otherFile, linkPath)

    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)
    assert.ok(!lstatSync(linkPath).isSymbolicLink(), 'symlink must be replaced by a regular file')
    assert.equal(readFileSync(otherFile, 'utf8'), '# I am a real file, but the wrong target', 'wrong-target file content was modified (data loss)')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude files: regular file that is not a fleet agent: must NOT be clobbered, and is reported by name', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-regular-'))
  try {
    mkdirSync(claudeDir(fakeHome), { recursive: true })
    const filePath = join(claudeDir(fakeHome), SAMPLE_AGENT)
    const originalContent = '# This is a pre-existing non-ndv file — do not clobber me'
    writeFileSync(filePath, originalContent)

    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)
    assert.equal(readFileSync(filePath, 'utf8'), originalContent, 'file content was overwritten')
    const out = r.stdout + r.stderr
    assert.ok(out.includes('1 file(s) in'), `expected the kept-file warning with a count; got:\n${out}`)
    assert.ok(out.includes(SAMPLE_AGENT), 'kept file must be named in the warning')
    assert.ok(out.includes(`Wrote ${REAL_AGENT_COUNT - 1} Claude Code agent(s)`), `summary must count only what was written; got:\n${out}`)
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude files: stale fleet copy (name: matches the stem) is refreshed', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-stale-'))
  try {
    mkdirSync(claudeDir(fakeHome), { recursive: true })
    const stem = SAMPLE_AGENT.replace('.md', '')
    const filePath = join(claudeDir(fakeHome), SAMPLE_AGENT)
    writeFileSync(filePath, `---\nname: ${stem}\ndescription: stale\n---\nold body\n`)

    const r = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)
    assert.equal(readFileSync(filePath, 'utf8'), readFileSync(join(AGENTS_DIR, SAMPLE_AGENT), 'utf8'))
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude files: second install is idempotent: same files, full count, no warnings', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-repeat-'))
  try {
    const r1 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r1.status, 0, `first install failed: ${r1.stderr}`)
    const before = readdirSync(claudeDir(fakeHome)).sort()
    const r2 = ndvGlobal(['install', 'opencode', '--global'], fakeHome)
    assert.equal(r2.status, 0, `second install failed: ${r2.stderr}`)
    assert.deepEqual(readdirSync(claudeDir(fakeHome)).sort(), before)
    const out = r2.stdout + r2.stderr
    assert.ok(out.includes(`Wrote ${REAL_AGENT_COUNT} Claude Code agent(s)`), `expected full count; got:\n${out}`)
    assert.ok(!out.includes('left in place'), 'repeat install must not warn about kept files')
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

test('claude install: writes never follow a symlink into the OpenCode files', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cc-claudeinstall-'))
  try {
    // Arrange: old shim layout, then a Claude Code global install on top
    mkdirSync(opencodeDir(fakeHome), { recursive: true })
    mkdirSync(claudeDir(fakeHome), { recursive: true })
    const ocFile = join(opencodeDir(fakeHome), SAMPLE_AGENT)
    const ocContent = '---\ndescription: oc\nmode: subagent\n---\n'
    writeFileSync(ocFile, ocContent)
    symlinkSync(ocFile, join(claudeDir(fakeHome), SAMPLE_AGENT))

    const r = ndvGlobal(['install', 'claude', '--global'], fakeHome)
    assert.equal(r.status, 0, `install failed: ${r.stderr}`)
    assert.equal(readFileSync(ocFile, 'utf8'), ocContent, 'claude install wrote through the symlink into the OpenCode file')
    assert.ok(!lstatSync(join(claudeDir(fakeHome), SAMPLE_AGENT)).isSymbolicLink())
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
