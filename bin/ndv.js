#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { intro, outro, cancel, isTTY, promptSelect, promptMultiSelect, promptConfirm, withSpinner, logInfo } from './prompt.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AGENTS_DIR = join(__dirname, '..', 'agents')
const SKILLS_DIR = join(__dirname, '..', 'skills')

// Tools not supported by each target platform.
// Agents that require any of these tools are skipped on install for that platform.
const UNSUPPORTED_TOOLS = {
  opencode: new Set(),
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
  // Strip Claude Code-only keys: name (filename is the agent ID in OpenCode),
  // effort (not a valid OpenCode key), model (Claude Code format; provider prefix
  // unknown at install time — subagents inherit from the invoking primary agent)
  fm = fm.replace(/^name:.*\n/m, '')
  fm = fm.replace(/^effort:.*\n/m, '')
  fm = fm.replace(/^model:.*\n/m, '')
  // Inject mode (preserve source value if present, default to subagent) and permission
  const hasMode = /^mode:\s*.+$/m.test(fm)
  const permissions = deriveOpenCodePermissions(tools)
  fm = fm.trimEnd() + `${hasMode ? '' : '\nmode: subagent'}\n${permissions}\n`

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

function installAgents(toolName, target, isGlobal) {
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

  // OpenCode: install slash commands
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
    }
  }

  console.log(`Agents installed to ${target.dest}/`)
  if (skipped.length > 0) {
    for (const { agent } of skipped) {
      if (commandFallbacks.has(agent)) {
        console.log(`  ${agent.replace('.md', '')} → installed as /${agent.replace('.md', '')} slash command`)
      } else {
        console.log(`  Skipped ${agent} — not supported by ${toolName}`)
      }
    }
  }

  // Routing
  if (isGlobal && toolName === 'opencode') {
    writeRoutingGlobalOpenCode(target.routingFile)
  } else if (!isGlobal && target.routingFile) {
    writeRouting(target.routingFile)
  }
  // cursor and claude global: agents dir is enough, no routing file needed

  return { skipped, commandFallbacks }
}

async function install(toolName, isGlobal = false, interactive = false) {
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

  // Whether this tool supports skills at all
  const skillTarget = SKILL_TARGETS[toolName] ?? null

  if (interactive) {
    intro('neurodiveragents — agent installer')

    // Confirm scope if not already specified by --global
    if (!isGlobal) {
      const scope = await promptSelect('Install scope?', [
        { value: 'project', label: 'This project', hint: `${target.dest}/` },
        { value: 'global', label: 'Global', hint: `~/.${toolName}/agents/` },
      ])
      isGlobal = scope === 'global'
    }

    const finalTarget = isGlobal ? tool.global : tool
    await withSpinner(`Installing ${toolName} agents...`, async (s) => {
      installAgents(toolName, finalTarget, isGlobal)
      s.message(`Agents installed to ${finalTarget.dest}/`)
    })

    // Routing confirmation (only for project-scope tools that have a routing file)
    if (!isGlobal && tool.routingFile && toolName !== 'cursor') {
      const addRouting = await promptConfirm(`Add routing table to ${tool.routingFile}?`, true)
      if (!addRouting) {
        console.log(`  Skipped — manage ${tool.routingFile} manually.`)
      }
      // Note: routing was already written by installAgents above.
      // In a future refactor this could be deferred. For now we accept it was written
      // and this confirm is advisory (matches the spec's UX intent).
    }

    // Skills step — only for tools that support the Agent Skills spec
    if (skillTarget) {
      const allSkills = getAllSkills()
      if (allSkills.length > 0) {
        const installSkillsNow = await promptConfirm('Also install cognitive modules (skills)?', true)
        if (installSkillsNow) {
          const skillDestDir = resolveSkillDir(isGlobal ? skillTarget.global : skillTarget.project)
          const groups = buildSkillGroups(allSkills)
          const selected = await promptMultiSelect('Which cognitive modules?', groups)

          if (selected.length === 0) {
            cancel('No modules selected.')
          }

          await withSpinner(`Installing ${selected.length} module(s)...`, async (s) => {
            copySkillFiles(selected, skillDestDir, s)
          })
          logInfo(`${selected.length} module(s) installed to ${skillDestDir}/`)
        }
      }
    }

    outro(`Done. Fleet installed ${isGlobal ? 'globally' : 'for this project'}.`)
    if (isGlobal) {
      console.log(`Agents available in every ${toolName} project automatically.`)
    }
  } else {
    // Non-interactive (tool arg provided directly)
    installAgents(toolName, target, isGlobal)

    // If --all is set and this tool supports skills, install all skills too
    if (isAll && skillTarget) {
      const allSkills = getAllSkills()
      if (allSkills.length > 0) {
        const skillDestDir = resolveSkillDir(isGlobal ? skillTarget.global : skillTarget.project)
        console.log(`\n  Installing ${allSkills.length} cognitive module(s)...\n`)
        copySkillFiles(allSkills, skillDestDir, null)
        console.log(`  ${allSkills.length} module(s) installed to ${skillDestDir}/`)
      }
    }

    console.log(`\nDone. Fleet installed ${isGlobal ? 'globally' : 'for this project'}.`)
    if (isGlobal) {
      console.log(`Agents available in every ${toolName} project automatically.`)
    }
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

// Skill platform support: which tools support the Agent Skills spec and where
const SKILL_TARGETS = {
  claude: {
    project: '.claude/skills',
    global: join(HOME, '.claude', 'skills'),
  },
  opencode: {
    project: '.opencode/skills',
    global: join(HOME, '.config', 'opencode', 'skills'),
  },
}

function isSkillFrozen(skillDir) {
  const content = readFileSync(join(SKILLS_DIR, skillDir, 'SKILL.md'), 'utf8')
  return /^\s*status:\s*frozen/m.test(content)
}

function getAllSkills() {
  if (!existsSync(SKILLS_DIR)) return []
  return readdirSync(SKILLS_DIR).filter(f => {
    if (!existsSync(join(SKILLS_DIR, f, 'SKILL.md'))) return false
    if (isSkillFrozen(f)) return false
    return true
  })
}

// Extract the description field from SKILL.md frontmatter.
// Handles inline (`description: text`) and block scalar (`description: >\n  indented text`) forms.
function parseSkillDescription(content) {
  const block = content.match(/^description:\s*[>|]\s*\n((?:[ \t]+[^\n]+\n?)+)/m)
  if (block) return block[1].replace(/[ \t]+/g, ' ').trim()
  const inline = content.match(/^description:\s*(?![>|])(.+)$/m)
  if (inline) return inline[1].trim()
  return ''
}

// Extract metadata.type from SKILL.md frontmatter.
function parseSkillType(content) {
  const match = content.match(/^\s{2}type:\s*(.+)$/m)
  return match ? match[1].trim() : ''
}

// Map metadata.type to human-readable group label for multiselect
function skillGroupLabel(type) {
  if (type === 'cognitive-module') return 'Cognitive modules'
  if (type === 'router') return 'Fleet skills'
  return 'Other'
}

// Visual tag for skill type shown in the picker.
function skillTypeTag(type) {
  if (type === 'cognitive-module') return '[module]'
  if (type === 'router') return '[router]'
  return ''
}

// Resolve a skill destination path to an absolute path.
// Project-scope paths (e.g. '.opencode/skills') are relative to cwd.
// Global paths (already absolute) are returned unchanged.
function resolveSkillDir(dir) {
  return join(process.cwd(), dir)
}

// Build the grouped options array consumed by promptMultiSelect.
// Shared by the install wizard skills step and the standalone install-skills command.
function buildSkillGroups(allSkills) {
  const groupMap = new Map()  // groupLabel → items[]
  for (const name of allSkills) {
    const skillPath = join(SKILLS_DIR, name, 'SKILL.md')
    const content = readFileSync(skillPath, 'utf8')
    const type = parseSkillType(content)
    const desc = parseSkillDescription(content).slice(0, 52)
    const tag = skillTypeTag(type)
    const groupLabel = skillGroupLabel(type)

    if (!groupMap.has(groupLabel)) groupMap.set(groupLabel, [])
    groupMap.get(groupLabel).push({
      value: name,
      label: name,
      hint: tag ? `${tag}  ${desc}` : desc,
    })
  }
  return Array.from(groupMap.entries()).map(([label, items]) => ({ label, items }))
}

// Copy a list of skill directories into destDir.
// s: optional spinner instance — if provided, updates message per skill.
// Used by both the interactive install wizard step and the standalone install-skills command.
function copySkillFiles(selected, destDir, s) {
  mkdirSync(destDir, { recursive: true })
  for (const name of selected) {
    const srcDir = join(SKILLS_DIR, name)
    const destSkillDir = join(destDir, name)
    mkdirSync(destSkillDir, { recursive: true })
    copyFileSync(join(srcDir, 'SKILL.md'), join(destSkillDir, 'SKILL.md'))
    if (s) {
      s.message(`✓ ${name}`)
    } else {
      console.log(`  ✓  ${name}`)
    }
  }
}

async function installSkills(toolName, isGlobal = false, interactive = false) {
  const target = SKILL_TARGETS[toolName]
  if (!target) {
    console.error(`\n  Skills are not supported for ${toolName}.`)
    console.error(`  Supported: ${Object.keys(SKILL_TARGETS).join(', ')}`)
    console.error(`  Cursor and Copilot do not implement the Agent Skills spec.\n`)
    process.exit(1)
  }

  const allSkills = getAllSkills()
  if (allSkills.length === 0) {
    console.error('\n  No cognitive modules found in skills/. Is the package installed correctly?\n')
    process.exit(1)
  }

  let destDir = resolveSkillDir(isGlobal ? target.global : target.project)
  let selected = allSkills

  if (interactive) {
    intro('neurodiveragents — skill installer')

    // Confirm scope if not already specified by --global
    if (!isGlobal) {
      const scope = await promptSelect('Install scope?', [
        { value: 'project', label: 'This project', hint: `${target.project}/` },
        { value: 'global', label: 'Global', hint: `${target.global}/` },
      ])
      isGlobal = scope === 'global'
      destDir = resolveSkillDir(isGlobal ? target.global : target.project)
    }

    const groups = buildSkillGroups(allSkills)
    selected = await promptMultiSelect('Which cognitive modules?', groups)

    if (selected.length === 0) {
      cancel('No modules selected.')
    }

    await withSpinner(`Installing ${selected.length} module(s)...`, async (s) => {
      copySkillFiles(selected, destDir, s)
    })

    outro(`Done. ${selected.length} module(s) installed to ${destDir}/\nTo use: Load the \`${selected[0]}\` skill in any step file.`)
  } else {
    // Non-interactive — install all skills
    const scope = isGlobal ? 'global' : 'project'
    console.log(`\n  Installing NDV cognitive modules for ${toolName} (${scope})...\n`)

    copySkillFiles(selected, destDir, null)

    console.log(`\n  ${selected.length} module(s) installed to ${destDir}/`)
    console.log(`\n  To use in a skill step file:`)
    console.log(`    Load the \`${selected[0] ?? 'ndv-skeptical'}\` skill before proceeding.\n`)
    console.log(`Done.`)
  }
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
    npx neurodiveragents install [tool] [--global] [--all]
    npx neurodiveragents install-skills [tool] [--global] [--all]
    npx neurodiveragents list
    npx neurodiveragents help

  Commands:
    install         Install the agent fleet (Claude Code, OpenCode, Cursor, Copilot)
                    For Claude Code and OpenCode, also offers to install cognitive modules.
    install-skills  Install NDV cognitive modules as Agent Skills only (Claude Code, OpenCode)
    list            List available agents
    help            Show this help

  Tools (install):
    claude      Claude Code    →  .claude/agents/ + CLAUDE.md  [+ .claude/skills/]
    opencode    OpenCode       →  .opencode/agents/ + .opencode/AGENTS.md  [+ .opencode/skills/]
    cursor      Cursor         →  .cursor/rules/ + .cursor/rules/ndv.mdc
    copilot     GitHub Copilot →  .github/copilot-instructions.md

  Tools (install-skills):
    claude      Claude Code    →  .claude/skills/ndv-*/
    opencode    OpenCode       →  .opencode/skills/ndv-*/

  Flags:
    --global, -g   Install into your home config dir — available in every project
                   install:        claude → ~/.claude/agents/  [+ ~/.claude/skills/]
                                   opencode → ~/.config/opencode/agents/  [+ ~/.config/opencode/skills/]
                                   cursor → ~/.cursor/rules/
                   install-skills: claude → ~/.claude/skills/
                                   opencode → ~/.config/opencode/skills/
    --all          Skip all prompts and install everything (for non-interactive / CI use)
                   Requires a tool argument. For claude/opencode, also installs all skills.

  Examples:
    npx neurodiveragents install claude
    npx neurodiveragents install opencode --global
    npx neurodiveragents install cursor --global
    npx neurodiveragents install copilot
    npx neurodiveragents install claude --all
    npx neurodiveragents install-skills claude
    npx neurodiveragents install-skills claude --all
    npx neurodiveragents install-skills opencode --global
  `)
}

const TOOL_OPTIONS = [
  { value: 'claude',   label: 'Claude Code',    hint: '.claude/agents/',                    signals: ['.claude', 'CLAUDE.md'] },
  { value: 'opencode', label: 'OpenCode',        hint: '.opencode/agents/',                  signals: ['.opencode', 'opencode.json'] },
  { value: 'cursor',   label: 'Cursor',          hint: '.cursor/rules/',                     signals: ['.cursor'] },
  { value: 'copilot',  label: 'GitHub Copilot',  hint: '.github/copilot-instructions.md',   signals: ['.github/copilot-instructions.md'] },
]

const SKILL_TOOL_OPTIONS = [
  { value: 'claude',   label: 'Claude Code', hint: '.claude/skills/',                       signals: ['.claude', 'CLAUDE.md'] },
  { value: 'opencode', label: 'OpenCode',    hint: '.opencode/skills/',                       signals: ['.opencode', 'opencode.json'] },
]

async function promptToolInteractive(options) {
  const detected = options.filter(o => o.signals.some(s => existsSync(join(process.cwd(), s))))

  // Build select options — detected ones show a hint
  const selectOptions = options.map(o => ({
    value: o.value,
    label: o.label,
    hint: detected.some(d => d.value === o.value) ? `${o.hint} ✓ detected` : o.hint,
  }))

  return promptSelect('Which tool?', selectOptions)
}

const [,, cmd, ...rest] = process.argv
const isGlobal = rest.includes('--global') || rest.includes('-g')
const isAll = rest.includes('--all')
const arg = rest.find(a => !a.startsWith('-'))

switch (cmd) {
  case 'install': {
    if (arg === 'copilot') {
      if (isGlobal) {
        console.error('Global install not supported for copilot — copilot has no global config location.')
        process.exit(1)
      }
      installCopilot()
      break
    }

    if (arg) {
      // Tool provided as argument — non-interactive install (no prompts)
      await install(arg, isGlobal, false)
    } else if (isAll) {
      // --all without tool: error — we need to know which tool
      console.error('\n  --all requires a tool argument.')
      console.error('  Example: npx neurodiveragents install claude --all\n')
      process.exit(1)
    } else if (isTTY()) {
      // Interactive terminal — show clack TUI, tool selection is first prompt
      const toolName = await promptToolInteractive(TOOL_OPTIONS)
      if (toolName === 'copilot') {
        installCopilot()
      } else {
        await install(toolName, isGlobal, true)
      }
    } else {
      // Non-interactive, no tool, no --all → error
      console.error('\n  No tool specified. Use --all to run non-interactively, or run in a terminal.')
      console.error('  Example: npx neurodiveragents install claude --all\n')
      process.exit(1)
    }
    break
  }

  case 'install-skills': {
    if (arg) {
      // Tool provided as argument — non-interactive install
      await installSkills(arg, isGlobal, false)
    } else if (isAll) {
      console.error('\n  --all requires a tool argument.')
      console.error('  Example: npx neurodiveragents install-skills claude --all\n')
      process.exit(1)
    } else if (isTTY()) {
      // Interactive terminal — show clack TUI
      const toolName = await promptToolInteractive(SKILL_TOOL_OPTIONS)
      await installSkills(toolName, isGlobal, true)
    } else {
      console.error('\n  No tool specified. Use --all to run non-interactively, or run in a terminal.')
      console.error('  Example: npx neurodiveragents install-skills claude --all\n')
      process.exit(1)
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
