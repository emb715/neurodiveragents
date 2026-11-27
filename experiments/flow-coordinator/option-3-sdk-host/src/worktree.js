/**
 * worktree.js: one git worktree per thread.
 *
 * The ledger stops two threads writing the same files; a worktree makes a
 * mistake there recoverable instead of a silent overwrite. Each thread works
 * on its own branch, ndv/T<ID>, and merging back is a person's decision.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function createWorktree(repoRoot, storeDir, id) {
  const dir = join(storeDir, 'worktrees', `T${id}`)
  if (existsSync(dir)) return dir // resumed after a restart
  mkdirSync(join(storeDir, 'worktrees'), { recursive: true })
  const branch = `ndv/T${id}`
  const exists = (() => {
    try { execFileSync('git', ['-C', repoRoot, 'rev-parse', '--verify', '-q', branch], { stdio: 'ignore' }); return true } catch { return false }
  })()
  const args = exists ? ['worktree', 'add', dir, branch] : ['worktree', 'add', '-b', branch, dir, 'HEAD']
  execFileSync('git', ['-C', repoRoot, ...args], { stdio: 'ignore' })
  return dir
}
