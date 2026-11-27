/**
 * progress.js: one short line per thing the coordinator or a worker does.
 *
 * Found when EMB first ran the host: a wake can take a minute and the
 * terminal showed nothing until the coordinator posted. Runners report each
 * tool call through onProgress; this turns it into a line a person can scan.
 */

import { basename } from 'node:path'

const clip = (s, n = 60) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

// Coordinator tools arrive as mcp__coordinator__<name>; workers use built-ins.
export function describeTool(name, input = {}) {
  const short = name.replace(/^mcp__coordinator__/, '')
  switch (short) {
    case 'start_thread': return `starting a thread: ${input.agent ?? '?'}${input.files?.length ? ` on ${input.files.join(', ')}` : ''}`
    case 'message_thread': return `writing to thread ${String(input.id ?? '?').replace(/^T?/, 'T')}`
    case 'read_thread': return `reading thread ${String(input.id ?? '?').replace(/^T?/, 'T')}`
    case 'post_message': return null // the message itself is printed by the surface
    case 'request_decision': return null // so is the decision
    case 'write_ledger': return `updating the ledger for ${String(input.id ?? '?').replace(/^T?/, 'T')}`
    case 'save_fact': return `saving a fact: ${clip(input.fact)}`
    case 'Read': return `reading ${input.file_path ? basename(input.file_path) : 'a file'}`
    case 'Glob': return `listing ${clip(input.pattern, 40)}`
    case 'Grep': return `searching for ${clip(input.pattern, 40)}`
    case 'Edit': case 'MultiEdit': return `editing ${input.file_path ?? 'a file'}`
    case 'Write': return `writing ${input.file_path ?? 'a file'}`
    case 'Bash': return `running ${clip(input.command)}`
    case 'Task': return `asking ${input.subagent_type ?? 'a subagent'}`
    default: return `using ${short}`
  }
}

// Pull the tool calls out of one Agent SDK message.
export function toolCalls(message) {
  if (message?.type !== 'assistant') return []
  const content = message.message?.content
  return Array.isArray(content) ? content.filter(b => b.type === 'tool_use') : []
}
