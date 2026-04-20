#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { createInterface } from 'readline'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(__dirname, '..', 'agents')

// Tools not supported by each target platform.
// Agents that require any of these tools are skipped on install for that platform.
const UNSUPPORTED_TOOLS = {
  opencode: new Set(['Task']),
  cursor: new Set(['Task']),
}

// Extract the YAML list of tools from Claude Code frontmatter
function parseAgentTools(content) {
  const match = content.match(/^tools:\s*\n((?:  - .+\n?)+)/m)
  return match
    ? match[1].match(/- (.+)/g).map(l => l.replace('- ', '').trim())
    : []
}

// Derive OpenCode permission block from Claude Code tools list.
// Claude Code tools → OpenCode permission semantics:
//   Write or Edit present → edit: allow   (absent → edit: deny)
//   Bash present          → bash: allow   (absent → bash: deny)
//   webfetch present      → webfetch: allow
// Task is stripped (handled as skipped agent upstream).
function deriveOpenCodePermissions(tools) {
  const hasEdit = tools.includes('Write') || tools.includes('Edit')
  const hasBash = tools.includes('Bash')
  const hasWebfetch = tools.includes('WebFetch')
  const lines = []
  lines.push(`  edit: ${hasEdit ? 'allow' : 'deny'}`)
  lines.push(`  bash: ${hasBash ? 'allow' : 'deny'}`)
  if (hasWebfetch) lines.push(`  webfetch: allow`)
  return `permission:\n${lines.join('\n')}`
}

// Rewrite frontmatter for OpenCode native agents:
// - Strip tools: list (Claude Code only, causes OpenCode validation error)
// - Strip effort: (Claude Code only, unknown key in OpenCode)
// - Rewrite model: to anthropic/<model> provider-prefixed format
// - Inject mode: subagent and permission: block derived from tools
function transformForOpenCode(content) {
  const tools = parseAgentTools(content)

  // Extract frontmatter block
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(^---\n)/m)
  if (!fmMatch) return content

  let fm = fmMatch[2]
  const body = content.slice(fmMatch[0].length)

  // Strip tools: block
  fm = fm.replace(/^tools:\s*\n((?:  - .+\n?)+)/m, '')
  // Strip effort: line
  fm = fm.replace(/^effort:.*\n/m, '')
  // Rewrite model: bare name → anthropic/<name>
  fm = fm.replace(/^(model:\s*)(.+)$/m, (_, prefix, val) => {
    const v = val.trim()
    return `${prefix}${v.includes('/') ? v : `anthropic/${v}`}`
  })
  // Inject mode and permission before closing ---
  const permissions = deriveOpenCodePermissions(tools)
  fm = fm.trimEnd() + `\nmode: subagent\n${permissions}\n`

  return `---\n${fm}---\n${body}`
}

const HOME = homedir()

const TOOLS = {
  claude: {
    dest: '.claude/agents',
    ext: '.md',
    routingFile: 'CLAUDE.md',
    global: {
      dest: join(HOME, '.claude', 'agents'),
      ext: '.md',
      routingFile: null, // Claude Code has no global routing file — agents dir is enough
    },
  },
  opencode: {
    dest: '.opencode/agents',
    ext: '.md',
    routingFile: '.opencode/AGENTS.md',
    global: {
      dest: join(HOME, '.config', 'opencode', 'agents'),
      ext: '.md',
      routingFile: join(HOME, '.config', 'opencode', 'opencode.json'),
    },
  },
  cursor: {
    dest: '.cursor/rules',
    ext: '.mdc',
    routingFile: '.cursor/rules/ndv.mdc',
    global: {
      dest: join(HOME, '.cursor', 'rules'),
      ext: '.mdc',
      routingFile: null,
    },
  },
}

const NDV_BLOCK = `<!-- ndv:start -->
# neurodiveragents

This project uses the neurodiveragents fleet. When a task matches an agent domain, use the Task tool with the matching subagent_type. Pass full context in the prompt — subagents have no prior conversation history.

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

1. Use the Task tool with \`subagent_type: ndv-<specialist>\`
2. Pass full context in the prompt (task description, relevant files, error messages, goals) — subagents have no prior conversation history
3. For parallel work: spawn multiple Task calls in a single message

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

// For opencode global: inject ndv routing into ~/.config/opencode/opencode.json
// instead of a markdown file — opencode.json is the global config entry point
function writeRoutingGlobalOpenCode(jsonPath) {
  let config = {}
  if (existsSync(jsonPath)) {
    try { config = JSON.parse(readFileSync(jsonPath, 'utf8')) } catch {}
    if (config.instructions && config.instructions.some(i => i.includes('ndv'))) {
      console.log(`  ndv already in ${jsonPath} — skipping`)
      return
    }
  }
  // OpenCode supports `instructions` array pointing to rule files
  // We write the routing block to a standalone file and reference it
  const rulesDir = join(HOME, '.config', 'opencode', 'rules')
  const rulesFile = join(rulesDir, 'ndv.md')
  mkdirSync(rulesDir, { recursive: true })
  writeFileSync(rulesFile, NDV_BLOCK + '\n')
  config.instructions = [...(config.instructions ?? []), `${rulesFile}`]
  writeFileSync(jsonPath, JSON.stringify(config, null, 2) + '\n')
  console.log(`  ndv routing written to ${rulesFile}`)
  console.log(`  Referenced in ${jsonPath}`)
}

function install(toolName, isGlobal = false) {
  const tool = TOOLS[toolName]
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`)
    console.error(`Available: ${Object.keys(TOOLS).join(', ')}`)
    process.exit(1)
  }

  const target = isGlobal ? tool.global : tool
  if (isGlobal && !target) {
    console.error(`Global install not supported for ${toolName}`)
    process.exit(1)
  }

  const scope = isGlobal ? 'global' : 'project'
  console.log(`\n  Installing ${toolName} agents (${scope})...\n`)

  mkdirSync(target.dest, { recursive: true })

  const unsupported = UNSUPPORTED_TOOLS[toolName] ?? new Set()
  const agents = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'))
  const skipped = []

  for (const agent of agents) {
    const src = join(AGENTS_DIR, agent)
    const content = readFileSync(src, 'utf8')

    const agentTools = parseAgentTools(content)
    const blockedTool = agentTools.find(t => unsupported.has(t))
    if (blockedTool) {
      skipped.push({ agent, blockedTool })
      continue
    }

    const destName = agent.replace('.md', target.ext)
    const destContent = toolName === 'opencode' ? transformForOpenCode(content) : content
    writeFileSync(join(target.dest, destName), destContent)
  }

  // OpenCode: install ndv-flow as a subtask2-compatible slash command
  const commandFallbacks = new Set()
  if (toolName === 'opencode') {
    const commandsDir = join(AGENTS_DIR, '..', 'commands', 'opencode')
    const destCommandsDir = isGlobal
      ? join(HOME, '.config', 'opencode', 'commands')
      : '.opencode/commands'
    if (existsSync(commandsDir)) {
      mkdirSync(destCommandsDir, { recursive: true })
      const commands = readdirSync(commandsDir).filter(f => f.endsWith('.md'))
      for (const cmd of commands) {
        writeFileSync(join(destCommandsDir, cmd), readFileSync(join(commandsDir, cmd), 'utf8'))
        commandFallbacks.add(cmd)
      }

      // Inject subtask2 into the right opencode.json
      const SUBTASK2 = '@spoons-and-mirrors/subtask2@latest'
      const opencodeJson = isGlobal
        ? join(HOME, '.config', 'opencode', 'opencode.json')
        : 'opencode.json'
      let config = {}
      if (existsSync(opencodeJson)) {
        try { config = JSON.parse(readFileSync(opencodeJson, 'utf8')) } catch {}
      }
      const plugins = config.plugin ?? []
      if (!plugins.includes(SUBTASK2)) {
        config.plugin = [...plugins, SUBTASK2]
        writeFileSync(opencodeJson, JSON.stringify(config, null, 2) + '\n')
        console.log(`  subtask2 added to ${opencodeJson}`)
      } else {
        console.log(`  subtask2 already present — skipping`)
      }
    }
  }

  console.log(`Agents installed to ${target.dest}/`)
  if (skipped.length > 0) {
    for (const { agent } of skipped) {
      if (commandFallbacks.has(agent)) {
        console.log(`  ${agent.replace('.md', '')} → installed as /${agent.replace('.md', '')} slash command (subtask2)`)
      } else {
        console.log(`  Skipped ${agent} — not supported by ${toolName}`)
      }
    }
  }
  if (commandFallbacks.size > 0) {
    console.log(`  Requires subtask2 for fleet orchestration:`)
    console.log(`    https://github.com/spoons-and-mirrors/subtask2`)
  }

  // Routing
  if (isGlobal && toolName === 'opencode') {
    writeRoutingGlobalOpenCode(target.routingFile)
  } else if (!isGlobal && target.routingFile) {
    writeRouting(target.routingFile)
  }
  // cursor and claude global: agents dir is enough, no routing file needed

  console.log(`\nDone. Fleet installed ${isGlobal ? 'globally' : 'for this project'}.`)
  if (isGlobal) {
    console.log(`Agents available in every ${toolName} project automatically.`)
  }
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
    ['Agent', 'Description'],
    ['-----', '-----------'],
  ]
  for (const agent of agents) {
    const content = readFileSync(join(AGENTS_DIR, agent), 'utf8')
    const match = content.match(/^description:\s*(.+)$/m)
    const description = match ? match[1].trim().slice(0, 60) + (match[1].trim().length > 60 ? '…' : '') : '—'
    rows.push([agent.replace('.md', ''), description])
  }
  for (const [a, b] of rows) {
    console.log(`  ${a.padEnd(20)} ${b}`)
  }
}

function help() {
  console.log(`
  ndv — neurodiveragents fleet installer

  Usage:
    npx neurodiveragents install [tool] [--global]
    npx neurodiveragents list
    npx neurodiveragents help

  Tools:
    claude      Claude Code    →  .claude/agents/ + CLAUDE.md
    opencode    OpenCode       →  .opencode/agents/ + .opencode/AGENTS.md
    cursor      Cursor         →  .cursor/rules/ + .cursor/rules/ndv.mdc
    copilot     GitHub Copilot →  .github/copilot-instructions.md

  Flags:
    --global, -g   Install into your home config dir — available in every project
                   claude   → ~/.claude/agents/
                   opencode → ~/.config/opencode/agents/
                   cursor   → ~/.cursor/rules/

  Examples:
    npx neurodiveragents install claude
    npx neurodiveragents install opencode --global
    npx neurodiveragents install cursor --global
    npx neurodiveragents install copilot
  `)
}

const TOOL_OPTIONS = [
  { key: '1', name: 'claude',   label: 'Claude Code',    signals: ['.claude', 'CLAUDE.md'] },
  { key: '2', name: 'opencode', label: 'OpenCode',       signals: ['.opencode', 'opencode.json'] },
  { key: '3', name: 'cursor',   label: 'Cursor',         signals: ['.cursor'] },
  { key: '4', name: 'copilot',  label: 'GitHub Copilot', signals: ['.github/copilot-instructions.md'] },
]

function detectTools() {
  return TOOL_OPTIONS.filter(o => o.signals.some(s => existsSync(join(process.cwd(), s))))
}

async function promptTool() {
  const detected = detectTools()

  console.log('\n  Which AI tool are you installing for?\n')
  if (detected.length > 0) {
    console.log('  Detected in this project:')
    for (const { key, label, name } of TOOL_OPTIONS) {
      if (detected.some(d => d.name === name)) {
        console.log(`    ${key})  ${label}  ✓`)
      }
    }
    console.log()
    console.log('  Other options:')
    for (const { key, label, name } of TOOL_OPTIONS) {
      if (!detected.some(d => d.name === name)) {
        console.log(`    ${key})  ${label}`)
      }
    }
  } else {
    for (const { key, label } of TOOL_OPTIONS) {
      console.log(`    ${key})  ${label}`)
    }
  }
  console.log()

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question('  Enter number: ', (answer) => {
      rl.close()
      const choice = TOOL_OPTIONS.find(o => o.key === answer.trim())
      if (!choice) {
        console.error(`\n  Invalid choice: "${answer.trim()}"`)
        process.exit(1)
      }
      resolve(choice.name)
    })
  })
}

const [,, cmd, ...rest] = process.argv
const isGlobal = rest.includes('--global') || rest.includes('-g')
const arg = rest.find(a => !a.startsWith('-'))

switch (cmd) {
  case 'install': {
    const tool = arg ?? await promptTool()
    if (tool === 'copilot') {
      if (isGlobal) {
        console.error('Global install not supported for copilot — copilot has no global config location.')
        process.exit(1)
      }
      installCopilot()
    } else {
      install(tool, isGlobal)
    }
    break
  }
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
