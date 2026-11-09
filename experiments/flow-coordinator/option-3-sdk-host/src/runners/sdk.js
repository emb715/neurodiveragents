/**
 * runners/sdk.js: the real model, through the Claude Agent SDK.
 *
 * Coordinator: one session, resumed by ID on every wake. Its only built-in
 * tools are read-only (Read, Glob, Grep: Flow reads an agent's Brief Contract
 * before writing its brief). Everything that acts goes through the host's
 * in-process MCP server, so the host sees and enforces every action.
 *
 * Worker: one session per thread, in that thread's worktree. Built-in tools
 * are exactly the agent's own `tools:` list, pre-approved; anything else is
 * denied (permissionMode 'dontAsk'). Project settings load, so the repo's
 * CLAUDE.md reaches the worker as it would any Claude Code session.
 */

import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const READ_ONLY = ['Read', 'Glob', 'Grep']

function zodShape(params) {
  return Object.fromEntries(Object.entries(params).map(([name, p]) => {
    let t = p.type === 'array' ? z.array(z.string())
      : p.type === 'number' ? z.number()
      : p.type === 'enum' ? z.enum(p.values)
      : z.string()
    if (p.description) t = t.describe(p.description)
    return [name, p.optional ? t.optional() : t]
  }))
}

async function collect(q, onActivity) {
  let sessionId
  let text = ''
  for await (const m of q) {
    if (m.session_id) sessionId = m.session_id
    onActivity?.(sessionId)
    if (m.type === 'result') {
      if (m.subtype !== 'success' || m.is_error) throw new Error(`session ended: ${m.subtype}`)
      text = m.result
    }
  }
  return { text, sessionId }
}

export class SdkRunner {
  constructor({ coordinatorModel, workerModel, cwd, maxTurns } = {}) {
    Object.assign(this, { coordinatorModel, workerModel, cwd, maxTurns })
  }

  async coordinator({ prompt, systemPrompt, sessionId, tools }) {
    const server = createSdkMcpServer({
      name: 'coordinator',
      version: '0.0.0',
      tools: Object.entries(tools).map(([name, t]) =>
        tool(name, t.description, zodShape(t.params), async args => ({
          content: [{ type: 'text', text: String(await t.handler(args)) }],
        }))),
    })
    const q = query({
      prompt,
      options: {
        systemPrompt,
        ...(sessionId ? { resume: sessionId } : {}),
        mcpServers: { coordinator: server },
        tools: READ_ONLY,
        allowedTools: [...READ_ONLY, ...Object.keys(tools).map(n => `mcp__coordinator__${n}`)],
        permissionMode: 'dontAsk',
        settingSources: [], // the system prompt is the whole instruction set
        ...(this.cwd ? { cwd: this.cwd } : {}),
        ...(this.coordinatorModel ? { model: this.coordinatorModel } : {}),
        ...(this.maxTurns ? { maxTurns: this.maxTurns } : {}),
      },
    })
    return collect(q)
  }

  async worker({ systemPrompt, prompt, cwd, tools, sessionId, signal, onActivity }) {
    const abortController = new AbortController()
    signal?.addEventListener('abort', () => abortController.abort(), { once: true })
    const q = query({
      prompt,
      options: {
        systemPrompt,
        ...(sessionId ? { resume: sessionId } : {}),
        cwd,
        tools,
        allowedTools: tools,
        permissionMode: 'dontAsk',
        settingSources: ['project'],
        abortController,
        ...(this.workerModel ? { model: this.workerModel } : {}),
        ...(this.maxTurns ? { maxTurns: this.maxTurns } : {}),
      },
    })
    return collect(q, onActivity)
  }
}
