#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(__dirname, '..', 'agents')

const TOOLS = {
  claude: {
    dest: '.claude/agents',
    ext: '.md',
    routingFile: 'CLAUDE.md',
  },
  opencode: {
    dest: '.opencode/agents',
    ext: '.md',
    routingFile: '.opencode/AGENTS.md',
  },
  cursor: {
    dest: '.cursor/rules',
    ext: '.mdc',
    routingFile: '.cursor/rules/ndv.mdc',
  },
}

const NDV_BLOCK = `<!-- ndv:start -->
# neurodiveragents

This project uses the neurodiveragents fleet. When a task matches an agent domain, read the agent file and apply its patterns directly. Do not use the Task tool unless explicitly asked.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| Code review, PR, code smells, quality | \`ndv-review\` |
| Bug, failing test, root cause, stack trace | \`ndv-diagnose\` |
| Rename, extract, restructure, modernize syntax | \`ndv-refactor\` |
| Generate tests, improve coverage | \`ndv-tester\` |
| Security vulnerabilities, OWASP, auth issues | \`ndv-secure\` |
| Slow code, N+1 queries, bundle size, latency | \`ndv-optimize\` |
| Add logging, metrics, traces, health checks | \`ndv-telemetry\` |
| System design, SOLID violations, architecture review | \`ndv-architect\` |
| Technical docs, API docs, session notes | \`ndv-explain\` |
| No specialist match / direct opinionated answer only | \`ndv-honest\` |

## Proactive Application

Apply without being asked when the signal is clear:

- Stack trace shared → apply \`ndv-diagnose\`
- PR or files to review → apply \`ndv-review\`
- "it's slow" or slow query → apply \`ndv-optimize\`
- "clean this up" or rename → apply \`ndv-refactor\`
- Code with no tests → suggest \`ndv-tester\`
- Add logging or observability → apply \`ndv-telemetry\`

## Conflict Resolution (use highest-priority match)

1. Stack trace / exception / failing test / "debug" language → \`ndv-diagnose\` (even if the code is auth/payment)
2. Explicit vulnerability/audit/exploit language → \`ndv-secure\`
3. Explicit performance/latency/slow language → \`ndv-optimize\`
4. If still ambiguous: diagnose first with \`ndv-diagnose\`, then hand off
5. \`ndv-honest\` handles anything — it is a pure communication layer, not a router.

Example: "500 error + NullPointerException stack trace in login endpoint" → \`ndv-diagnose\`
Example: "Should we switch to pnpm?" → \`ndv-honest\`

## How to Apply

1. Read the agent file
2. Follow its workflow, checklist, and output format
3. Execute using available tools directly

## Parallelism Default

All agents default to parallel execution for 4-8 independent files/items.
<!-- ndv:end -->`

function writeRouting(routingFile) {
  const dir = dirname(routingFile)
  if (dir !== '.') mkdirSync(dir, { recursive: true })

  if (existsSync(routingFile)) {
    const content = readFileSync(routingFile, 'utf8')
    if (content.includes('ndv:start')) {
      console.log(`  ndv block already present in ${routingFile} — skipping`)
      return
    }
    appendFileSync(routingFile, `\n\n${NDV_BLOCK}\n`)
    console.log(`  Appended ndv routing block to existing ${routingFile}`)
  } else {
    writeFileSync(routingFile, `${NDV_BLOCK}\n`)
    console.log(`  Created ${routingFile}`)
  }
}

function install(toolName) {
  const tool = TOOLS[toolName]
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`)
    console.error(`Available: ${Object.keys(TOOLS).join(', ')}`)
    process.exit(1)
  }

  mkdirSync(tool.dest, { recursive: true })

  const agents = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))
  for (const agent of agents) {
    const src = join(AGENTS_DIR, agent)
    const destName = agent.replace('.md', tool.ext)
    copyFileSync(src, join(tool.dest, destName))
  }

  console.log(`Agents installed to ${tool.dest}/`)
  writeRouting(tool.routingFile)
  console.log(`Done. The full neurodiveragents fleet is ready.`)
}

function installCopilot() {
  const agents = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))
  const sections = []

  for (const agent of agents) {
    const content = readFileSync(join(AGENTS_DIR, agent), 'utf8')
    // strip YAML frontmatter
    const stripped = content.replace(/^---[\s\S]*?---\n/, '').trim()
    const name = agent.replace('.md', '')
    sections.push(`# Agent: ${name}\n\n${stripped}`)
  }

  const header = `# neurodiveragents — Copilot Instructions

This project uses the neurodiveragents fleet. When a task matches an agent domain, apply that agent's patterns directly.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| Code review, PR, code smells, quality | ndv-review |
| Bug, failing test, root cause, stack trace | ndv-diagnose |
| Rename, extract, restructure, modernize syntax | ndv-refactor |
| Generate tests, improve coverage | ndv-tester |
| Security vulnerabilities, OWASP, auth issues | ndv-secure |
| Slow code, N+1 queries, bundle size, latency | ndv-optimize |
| Add logging, metrics, traces, health checks | ndv-telemetry |
| System design, SOLID violations, architecture review | ndv-architect |
| Technical docs, API docs, session notes | ndv-explain |
| No specialist match / direct opinionated answer only | ndv-honest |

---

`

  const output = header + sections.join('\n\n---\n\n')
  mkdirSync('.github', { recursive: true })
  writeFileSync('.github/copilot-instructions.md', output)
  console.log(`Copilot instructions written to .github/copilot-instructions.md`)
}

function list() {
  const agents = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))
  const rows = [
    ['Agent', 'Character'],
    ['-----', '---------'],
  ]
  for (const agent of agents) {
    const content = readFileSync(join(AGENTS_DIR, agent), 'utf8')
    const match = content.match(/^agent:\s*(.+)$/m)
    const character = match ? match[1].trim() : '—'
    rows.push([agent.replace('.md', ''), character])
  }
  for (const [a, b] of rows) {
    console.log(`  ${a.padEnd(20)} ${b}`)
  }
}

function help() {
  console.log(`
  ndv — neurodiveragents fleet installer

  Usage:
    npx neurodiveragents install [tool]    Install agents into your project
    npx neurodiveragents install copilot   Generate .github/copilot-instructions.md
    npx neurodiveragents list              List available agents
    npx neurodiveragents help              Show this help

  Tools:
    claude      Claude Code  →  .claude/agents/ + CLAUDE.md
    opencode    OpenCode     →  .opencode/agents/ + .opencode/AGENTS.md
    cursor      Cursor       →  .cursor/rules/ + .cursor/rules/ndv.mdc
    copilot     GitHub Copilot → .github/copilot-instructions.md

  Examples:
    npx neurodiveragents install claude
    npx neurodiveragents install opencode
    npx neurodiveragents install cursor
    npx neurodiveragents install copilot
  `)
}

const [,, cmd, arg] = process.argv

switch (cmd) {
  case 'install':
    if (!arg) {
      console.error('Specify a tool: claude, opencode, cursor, or copilot')
      console.error('Example: npx neurodiveragents install claude')
      process.exit(1)
    }
    if (arg === 'copilot') {
      installCopilot()
    } else {
      install(arg)
    }
    break
  case 'list':
    list()
    break
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    help()
    break
  default:
    console.error(`Unknown command: ${cmd}`)
    help()
    process.exit(1)
}
