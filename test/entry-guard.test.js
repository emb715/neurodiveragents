import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

// Regression test for the entry-point guard's realpathSync-throw fallback branch.
//
// bin/ndv.js line ~1137 wraps the realpath comparison in try/catch:
//   try {
//     return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
//   } catch {
//     return resolve(process.argv[1]) === fileURLToPath(import.meta.url)
//   }
//
// The `try` branch is covered by the two symlink tests above. The `catch`
// branch (realpathSync throws on a hostile/degraded filesystem — EACCES, stale
// mount, ENOENT on argv[1] replaced between spawn and guard eval) has ZERO
// coverage. A future change weakening the realpath branch could silently
// regress to the exact silent-exit-0 class of bug the fix addressed: if the
// catch branch ever crashes (uncaught throw escaping the try/catch) or ever
// dispatches when it should not (resolve() spuriously matching under a
// symlink topology), the bug returns. This test pins the degraded-FS behavior:
// "does not crash, does not dispatch" — exit 0, empty stdout.
//
// Challenge: `isMainEntry` is a module-level constant evaluated at import
// time, so the throw must be in flight BEFORE bin/ndv.js is imported. We
// spawn a tiny ESM wrapper script that overwrites process.argv[1] with a
// guaranteed-nonexistent path (→ realpathSync throws ENOENT) and THEN
// imports bin/ndv.js. The catch branch fires; resolve() of the nonexistent
// path cannot equal bin's import.meta.url, so isMainEntry is false and the
// dispatcher is skipped. We assert exit 0 and empty stdout (no crash, no
// dispatch, no leaked output).
//
// Why a wrapper rather than a dangling symlink as argv[1]: Node's own module
// loader must successfully resolve argv[1] before bin/ndv.js ever runs, so
// argv[1] itself cannot be a path that makes realpathSync throw at load time
// (a dangling symlink or chmod-000 parent breaks the loader before the guard
// executes). The wrapper is loadable; it relocates the throw-trigger into
// argv[1] immediately before importing bin, so the throw is live exactly when
// the guard evaluates. This is deterministic and race-free.
test('entry-point guard catch branch: when realpathSync throws, the resolve()-based fallback does not crash and does not dispatch', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ndv-entry-guard-fallback-'))
  // Register cleanup before any fallible operation so a writeFileSync throw
  // does not leak the tmpdir.
  tmpDirs.push(tmp)

  // ESM wrapper: poison argv[1] with a nonexistent path so realpathSync throws
  // ENOENT inside bin/ndv.js's guard, then import bin/ndv.js. Using .mjs
  // guarantees ESM regardless of any package.json in the tmpdir or cwd.
  const wrapperPath = join(tmp, 'poison-argv.mjs')
  const wrapperSrc = [
    `import { fileURLToPath } from 'node:url'`,
    `// Force the realpathSync throw: argv[1] must not resolve on the filesystem.`,
    `process.argv[1] = '/nonexistent/neurodiveragents/bin/ndv.js'`,
    `await import(${JSON.stringify(BIN)})`,
    ``,
  ].join('\n')
  writeFileSync(wrapperPath, wrapperSrc)

  const result = spawnSync(process.execPath, [wrapperPath], {
    cwd: tmp,
    encoding: 'utf8',
  })

  // The fallback must not crash: exit 0 with no uncaught exception.
  assert.equal(result.status, 0, `expected exit 0 (fallback must not crash), got ${result.status}\nstderr: ${result.stderr}`)
  // The fallback must not dispatch: resolve(nonexistent) !== bin's
  // import.meta.url, so isMainEntry is false and the dispatcher is skipped →
  // no help/agent output. Empty stdout pins "does not dispatch". (A future
  // change that makes the catch branch crash, or that spuriously dispatches
  // under a degraded FS, breaks one of these two assertions.)
  assert.equal(result.stdout, '', `expected empty stdout (fallback must not dispatch), got:\n${result.stdout}`)
  assert.equal(result.stderr, '', `expected empty stderr (fallback must not crash), got:\n${result.stderr}`)
})