/**
 * routing-context.mjs — the routing text a host model actually sees.
 *
 * Shared by scripts/eval-routing.mjs (feeds it to the model) and
 * test/validate-routing.test.js (checks canonical fixture anchors against it).
 * One extraction, two consumers: a canonical case can only claim an anchor
 * that is present in the exact text the eval scores against.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function routingContext(root = ROOT) {
  const md = readFileSync(join(root, 'CLAUDE.md'), 'utf8')
  const table = md.match(/## Routing Table[\s\S]*?(?=\n## )/)?.[0] ?? ''
  const conflict = md.match(/## Conflict Resolution[\s\S]*?(?=\n## |$)/)?.[0] ?? ''
  return { table, conflict, text: table && conflict ? table + '\n\n' + conflict : '' }
}
