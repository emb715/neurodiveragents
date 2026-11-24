import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const style = readFileSync(new URL('../output-styles/ndv-honest.md', import.meta.url), 'utf8')
const doc = readFileSync(new URL('../docs/output-style.md', import.meta.url), 'utf8')

test('output style has the Claude Code frontmatter it relies on', () => {
  const fm = style.match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(fm, 'frontmatter missing')
  assert.match(fm[1], /^name: ndv-honest$/m)
  assert.match(fm[1], /^description: .+$/m)
  assert.match(fm[1], /^keep-coding-instructions: true$/m)
})

test('claude.ai paste block matches the output style body', () => {
  const body = style.replace(/^---\n[\s\S]*?\n---\n/, '').trim().replace(/\*\*Honest\*\*/, 'Honest')
  const block = doc.match(/```text\n([\s\S]*?)\n```/)
  assert.ok(block, 'paste block missing from docs/output-style.md')
  assert.equal(block[1].trim(), body)
})
