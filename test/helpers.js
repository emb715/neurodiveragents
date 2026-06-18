/**
 * Shared test helpers for the neurodiveragents test suite.
 * Imported by validate-schema.test.js, validate-authoring.test.js, validate-contracts.test.js
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(__dirname, '..')
export const AGENTS_DIR = join(ROOT, 'agents')
export const HUMANS_DIR = join(ROOT, 'humans')

export const VALID_TOOLS = new Set(['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'Task'])
export const MIN_DESCRIPTION_LENGTH = 50
export const MIN_BODY_LINES = 5

export const TIER1 = ['ndv-build', 'ndv-refactor', 'ndv-optimize', 'ndv-telemetry']
export const TIER2 = ['ndv-review', 'ndv-architect', 'ndv-secure', 'ndv-tester', 'ndv-diagnose', 'ndv-accessibility', 'ndv-design']
export const TIER3 = ['ndv-research', 'ndv-explain', 'ndv-scope', 'ndv-forecast', 'ndv-signal', 'ndv-flow', 'ndv-honest']

export function parseFrontmatter(content, filePath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  assert.ok(match, `${filePath}: missing or malformed YAML frontmatter (must start with --- block)`)

  const raw = match[1]
  const body = match[2]

  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return m ? m[1].trim() : null
  }

  const toolsMatch = raw.match(/^tools:\s*\n((?:  - .+\n?)+)/m)
  const tools = toolsMatch
    ? toolsMatch[1].match(/- (.+)/g).map(l => l.replace('- ', '').trim())
    : []

  return { raw, body, get, tools }
}

export function agentFiles() {
  return readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      file: f,
      name: f.replace('.md', ''),
      path: join(AGENTS_DIR, f),
      content: readFileSync(join(AGENTS_DIR, f), 'utf8'),
    }))
}

export function humanFiles() {
  return readdirSync(HUMANS_DIR)
    .filter(f => f.endsWith('.human.md'))
    .map(f => ({
      file: f,
      name: f.replace('.human.md', ''),
      path: join(HUMANS_DIR, f),
      content: readFileSync(join(HUMANS_DIR, f), 'utf8'),
    }))
}

export function readAgent(name) {
  return readFileSync(join(AGENTS_DIR, name + '.md'), 'utf8')
}
