import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workerPermission, inside, relativize } from '../src/guard.js'

const opts = { cwd: '/s/worktrees/T1', tools: ['Read', 'Edit', 'Write', 'Bash'] }

test('writes inside the worktree are allowed, outside are denied', () => {
  assert.equal(workerPermission('Write', { file_path: 'hello.txt' }, opts).behavior, 'allow')
  assert.equal(workerPermission('Edit', { file_path: '/s/worktrees/T1/src/a.ts' }, opts).behavior, 'allow')
  assert.equal(workerPermission('Write', { file_path: '/repo/hello.txt' }, opts).behavior, 'deny')
  assert.equal(workerPermission('Edit', { file_path: '../T2/a.ts' }, opts).behavior, 'deny')
})

test('a tool outside the agent\'s list is denied', () => {
  assert.equal(workerPermission('WebFetch', { url: 'x' }, opts).behavior, 'deny')
  assert.equal(workerPermission('Bash', { command: 'ls' }, opts).behavior, 'allow')
})

test('inside() and relativize() handle edge paths', () => {
  assert.equal(inside('/a/b', '/a/b'), true)
  assert.equal(inside('/a/b', '/a/bc/x'), false)
  assert.equal(relativize('see /a/b/x.ts and /a/b', '/a/b'), 'see x.ts and .')
})
