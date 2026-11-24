/**
 * `ndv install claude` installs output-styles/*.md to .claude/output-styles/
 * (project) or ~/.claude/output-styles/ (global). Installed, never selected:
 * no settings file is written. A user's own file of the same name is kept;
 * a stale fleet copy is refreshed; a symlink is never written through.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, lstatSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BIN = join(ROOT, 'bin', 'ndv.js')
const SRC = readFileSync(join(ROOT, 'output-styles', 'ndv-honest.md'), 'utf8')

const run = (args, cwd, home) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home } })

function withDirs (fn) {
  const cwd = mkdtempSync(join(tmpdir(), 'ndv-style-proj-'))
  const home = mkdtempSync(join(tmpdir(), 'ndv-style-home-'))
  try { fn(cwd, home) } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }) }
}

test('project install writes .claude/output-styles/ndv-honest.md byte-for-byte', () => withDirs((cwd, home) => {
  const r = run(['install', 'claude'], cwd, home)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(join(cwd, '.claude', 'output-styles', 'ndv-honest.md'), 'utf8'), SRC)
}))

test('global install writes ~/.claude/output-styles/ndv-honest.md', () => withDirs((cwd, home) => {
  const r = run(['install', 'claude', '--global'], cwd, home)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(join(home, '.claude', 'output-styles', 'ndv-honest.md'), 'utf8'), SRC)
}))

test('install does not select the style (no outputStyle written anywhere)', () => withDirs((cwd, home) => {
  run(['install', 'claude'], cwd, home)
  for (const f of [join(cwd, '.claude', 'settings.json'), join(cwd, '.claude', 'settings.local.json'), join(home, '.claude', 'settings.json')]) {
    if (existsSync(f)) assert.doesNotMatch(readFileSync(f, 'utf8'), /outputStyle/)
  }
}))

test('a stale fleet copy is refreshed', () => withDirs((cwd, home) => {
  const dir = join(cwd, '.claude', 'output-styles')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'ndv-honest.md'), SRC.replace('Every word must earn its place.', 'OLD TEXT.'))
  run(['install', 'claude'], cwd, home)
  assert.equal(readFileSync(join(dir, 'ndv-honest.md'), 'utf8'), SRC)
}))

test("a user's own file with the same name is kept and reported", () => withDirs((cwd, home) => {
  const dir = join(cwd, '.claude', 'output-styles')
  mkdirSync(dir, { recursive: true })
  const mine = '---\ndescription: mine\n---\n\nMy own style.\n'
  writeFileSync(join(dir, 'ndv-honest.md'), mine)
  const r = run(['install', 'claude'], cwd, home)
  assert.equal(readFileSync(join(dir, 'ndv-honest.md'), 'utf8'), mine)
  assert.match(r.stderr + r.stdout, /not a fleet output style/)
}))

test('a symlink at the destination is replaced, its target untouched', () => withDirs((cwd, home) => {
  const dir = join(cwd, '.claude', 'output-styles')
  mkdirSync(dir, { recursive: true })
  const other = join(cwd, 'other.md')
  writeFileSync(other, 'other file')
  symlinkSync(other, join(dir, 'ndv-honest.md'))
  run(['install', 'claude'], cwd, home)
  assert.equal(readFileSync(other, 'utf8'), 'other file')
  assert.ok(!lstatSync(join(dir, 'ndv-honest.md')).isSymbolicLink())
  assert.equal(readFileSync(join(dir, 'ndv-honest.md'), 'utf8'), SRC)
}))

test('other tools do not get the output style', () => withDirs((cwd, home) => {
  run(['install', 'cursor'], cwd, home)
  assert.ok(!existsSync(join(cwd, '.claude', 'output-styles')))
}))
