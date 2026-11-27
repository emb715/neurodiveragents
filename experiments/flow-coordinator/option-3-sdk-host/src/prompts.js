/**
 * prompts.js: every prompt the host sends, built from repo files.
 *
 * The coordinator's system prompt comes from adapter/assemble.mjs, the same
 * builder option 2 and the eval use. A worker's system prompt is its agent
 * file minus frontmatter, the rule bin/claude-flow already applies.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { assemble, stripFrontmatter, REPO_ROOT } from '../../adapter/assemble.mjs'

export const DEFAULT_AGENTS_DIR = join(REPO_ROOT, 'agents')

export function coordinatorSystemPrompt(agentsDir = DEFAULT_AGENTS_DIR) {
  return assemble('sdk-host', { agentsDir })
}

export function agentExists(agentsDir, slug) {
  return /^ndv-[a-z]+$/.test(slug) && existsSync(join(agentsDir, slug + '.md'))
}

export function workerSystemPrompt(agentsDir, slug) {
  return stripFrontmatter(readFileSync(join(agentsDir, slug + '.md'), 'utf8'))
}

// The agent's own `tools:` list is the worker's allowed tool set. Read from
// the frontmatter, so an agent that may not edit files can't edit them here.
export function agentTools(agentsDir, slug) {
  const text = readFileSync(join(agentsDir, slug + '.md'), 'utf8')
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? ''
  const block = fm.match(/^tools:\s*\n((?:\s+-\s+.+\n?)+)/m)?.[1] ?? ''
  return block.split('\n').map(l => l.replace(/^\s+-\s+/, '').trim()).filter(Boolean)
}

const DESCRIBE = {
  chat: e => `The person wrote in the chat:\n${e.text}`,
  'person-in-thread': e => `The person wrote in thread T${e.id} directly (the thread has the message):\n${e.text}`,
  'thread-finished': e => [
    `Thread T${e.id} (${e.agent}) finished.`,
    `Summary: ${e.summary || '(none)'}`,
    `Files: ${e.files.length ? e.files.join(', ') : '(none listed)'}`,
    e.widened.length ? `Files outside its row, now added to it: ${e.widened.join(', ')}` : null,
    `Handoffs: ${e.handoffs.length ? '\n' + e.handoffs.map(h => `→ ${h.agent} (${h.domain}) · ${h.location}: ${h.description}`).join('\n') : 'none'}`,
  ].filter(Boolean).join('\n'),
  'thread-replied': e => `Thread T${e.id} (${e.agent}) replied without finishing:\n${e.summary}`,
  'thread-rejected': e => `Thread T${e.id} (${e.agent}) rejected its brief (rejection ${e.count}): ${e.reason}`,
  'thread-quiet': e => `Thread T${e.id} (${e.agent}) has been quiet for ${e.minutes} minutes.`,
  'thread-incomplete': e => `Thread T${e.id} (${e.agent}) stayed quiet after the check-in and is now incomplete. Its files are released.`,
  'thread-failed': e => `Thread T${e.id} (${e.agent}) failed: ${e.error}. Its files are released.`,
  'decision-answered': e => `The person answered decision D${e.id} ("${e.question}"): ${e.answer}`,
  'host-restarted': e => `The host restarted. Threads resumed from the ledger: ${e.resumed.length ? e.resumed.map(i => 'T' + i).join(', ') : 'none'}.`,
}

export function wakePrompt(event, ledgerTable, started = []) {
  const describe = DESCRIBE[event.type]
  if (!describe) throw new Error(`Unknown event type "${event.type}"`)
  return [
    `EVENT: ${event.type}`,
    describe(event),
    started.length ? `Started from the queue since your last wake: ${started.map(i => 'T' + i).join(', ')}` : null,
    'LEDGER:',
    ledgerTable,
    'Act with your tools. End the turn when nothing more can happen until the next event.',
  ].filter(Boolean).join('\n\n')
}

export const RESUME_PROMPT = 'The host restarted while you were working. If you had finished, repeat your final reply exactly. Otherwise continue the task and finish it.'
