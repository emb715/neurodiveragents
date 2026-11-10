#!/usr/bin/env node
/**
 * assemble.mjs: build the coordinator system prompt for one host.
 *
 *   Flow's body (agents/ndv-flow.md, frontmatter stripped, read live and never edited)
 * + adapter/coordinator.md
 * + the one host block from adapter/bindings.md
 *
 * Every option loads the prompt through this file, so the three can't drift:
 * the option-2 launcher, the option-3 host and the eval runner all call it.
 *
 *   node assemble.mjs terminal        # print the prompt for a host
 *   node assemble.mjs --list          # list the hosts bindings.md defines
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = join(ADAPTER_DIR, '..', '..', '..')

// Same rule as bin/claude-flow: drop only the first frontmatter block.
export function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
}

export function flowBody(agentsDir = join(REPO_ROOT, 'agents')) {
  return stripFrontmatter(readFileSync(join(agentsDir, 'ndv-flow.md'), 'utf8'))
}

export function adapterBody() {
  return readFileSync(join(ADAPTER_DIR, 'coordinator.md'), 'utf8').trim()
}

// Host blocks are "## Host: <label> (`<id>`...)" headings; the id is the
// first backticked word, or the label when there is none.
export function hostBlocks() {
  const text = readFileSync(join(ADAPTER_DIR, 'bindings.md'), 'utf8')
  const parts = text.split(/^(?=## Host: )/m).slice(1)
  return Object.fromEntries(parts.map(p => {
    const heading = p.split('\n')[0]
    const label = heading.replace('## Host: ', '').split(' (')[0].trim()
    return [hostId(label), p.trim()]
  }))
}

function hostId(label) {
  if (label.startsWith('terminal')) return 'terminal'
  if (label.startsWith('claude.ai')) return 'claude-ai'
  if (label.startsWith('ndv-coordinator')) return 'sdk-host'
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export function assemble(host, { agentsDir } = {}) {
  const blocks = hostBlocks()
  if (!blocks[host]) throw new Error(`Unknown host "${host}". Known: ${Object.keys(blocks).join(', ')}`)
  return [flowBody(agentsDir), adapterBody(), blocks[host]].join('\n\n')
}

// The adapter alone, with its host block: what option 2 pastes into a host
// that already carries Flow some other way.
export function adapterOnly(host) {
  return [adapterBody(), hostBlocks()[host]].join('\n\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const host = process.argv[2]
  if (!host || host === '--list') {
    console.log(Object.keys(hostBlocks()).join('\n'))
    process.exit(host ? 0 : 1)
  }
  process.stdout.write(assemble(host) + '\n')
}
