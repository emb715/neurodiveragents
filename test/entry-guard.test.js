import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')

const tmpDirs = []

function cleanup() {
  while (tmpDirs.length) {
    const dir = tmpDirs.pop()
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

after(cleanup)

// Regression test for the entry-point guard symlink bug.
//
// bin/ndv.js line ~1129 guards the command dispatcher with:
//   const isMainEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
//
// The original code used path.resolve() instead of realpathSync. Under a global
// npm install, the bin shim on PATH is a symlink into node_modules/.bin while
// import.meta.url resolves to the real path after Node's loader follows
// symlinks. path.resolve() does NOT resolve symlinks, so the old comparison
// failed → isMainEntry was false → the entire command dispatcher was skipped
// → the CLI produced zero output and exited 0 silently.
//
// This test reproduces that topology: it creates a symlink to bin/ndv.js in a
// tmpdir and invokes the symlink with a real command (`list`). With the
// realpathSync fix, isMainEntry is true, the dispatcher runs, and `list`
// prints agent names to stdout. With the old resolve() code, stdout would be
// empty and the test would fail.
test('entry-point guard resolves symlinks: invoking bin/ndv.js via a symlink still runs the command dispatcher', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ndv-entry-guard-'))
  // Register cleanup before any fallible operation so a symlinkSync throw
  // does not leak the tmpdir.
  tmpDirs.push(tmp)

  // Symlink name must be `ndv.js` so process.argv[1] ends with ndv.js — mirrors
  // the real global-install layout where the PATH shim is named after the bin.
  const linkPath = join(tmp, 'ndv.js')
  symlinkSync(BIN, linkPath)

  const result = spawnSync(process.execPath, [linkPath, 'list'], {
    cwd: tmp,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\nstderr: ${result.stderr}`)
  assert.ok(result.stdout.length > 0, 'expected non-empty stdout from `ndv list`, got empty output (entry-point guard likely did not resolve symlinks)')
  // `ndv list` prints agent names; sanity-check at least one ndv- entry appears.
  assert.ok(/ndv-/.test(result.stdout), `expected agent names in stdout, got:\n${result.stdout}`)
})

// Additional belt-and-suspenders check: the same symlink invoked with no
// command (→ `help`) must also produce output. This covers the `undefined`
// branch of the dispatcher, confirming the guard lets execution reach it.
test('entry-point guard resolves symlinks: invoking bin/ndv.js via a symlink with no command prints help', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ndv-entry-guard-help-'))
  // Register cleanup before any fallible operation so a symlinkSync throw
  // does not leak the tmpdir.
  tmpDirs.push(tmp)

  const linkPath = join(tmp, 'ndv.js')
  symlinkSync(BIN, linkPath)

  const result = spawnSync(process.execPath, [linkPath], {
    cwd: tmp,
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, `expected exit 0, got ${result.status}\nstderr: ${result.stderr}`)
  assert.ok(result.stdout.length > 0, 'expected non-empty stdout from `ndv` (help), got empty output')
  // help() in bin/ndv.js prints a "Usage:" line — assert it reaches stdout so
  // the test fails on a banner-only or whitespace-only output.
  assert.ok(/Usage:/.test(result.stdout), `expected help text containing "Usage:" in stdout, got:\n${result.stdout}`)
})