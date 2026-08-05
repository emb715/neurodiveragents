#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, copyFileSync, symlinkSync, lstatSync, unlinkSync, readlinkSync, realpathSync } from 'fs'
import { join, dirname, resolve } from 'path'
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
// - Normalize mode: preserve mode: all, coerce mode: agent → subagent, inject subagent when absent
// - Inject permission: block derived from tools
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
  // Normalize mode for OpenCode:
  // - mode: all → preserve (valid in OpenCode)
  // - mode: agent → coerce to subagent (Claude Code-only value)
  // - absent → inject subagent
  const sourceMode = (fm.match(/^mode:\s*(.+)$/m) ?? [])[1]?.trim()
  fm = fm.replace(/^mode:.*\n/m, '')
  const resolvedMode = sourceMode === 'all' ? 'all' : 'subagent'
  const permissions = deriveOpenCodePermissions(tools)
  fm = fm.trimEnd() + `\nmode: ${resolvedMode}\n${permissions}\n`

  return `---\n${fm}---\n${body}`
}

// Extract the YAML frontmatter block from an agent/skill file.
// Single source for the fmMatch pattern used across the transform/detection
// paths (transformAgentToSkill, getRouterSkills). Returns { fm, body } where
// `fm` is the raw frontmatter text (between the `---` fences, fences excluded)
// and `body` is the remainder, or `null` if no frontmatter delimiters are
// present. The regex is unchanged from its prior inline form — this is a
// mechanical extraction for DRY, not a parser upgrade.
function extractFrontmatter(content) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(^---\n)/m)
  if (!fmMatch) return null
  return { fm: fmMatch[2], body: content.slice(fmMatch[0].length) }
}

// YAML block-scalar body pattern, shared by the two regexes in
// transformAgentToSkill() (the idempotency guard and the descriptionMatch).
// A block-scalar body line is EITHER 2+-space-indented (content; `[^\n]*`
// allows trailing-only-whitespace lines like `  \n`) OR fully blank (a lone
// `\n`). The body continues until a column-0 non-blank line. Defined once here
// so the guard and the descriptionMatch cannot drift apart (H5 fixed the
// descriptionMatch's blank-line truncation; H8 ported the fix to the guard —
// a single source removes the port-the-fix step entirely). The per-site
// quantifier (`*` for the guard, `+` for the descriptionMatch) is applied at
// the call site, NOT here — only the alternation is shared. Escapes are
// doubled because this is a string fragment consumed by `new RegExp`.
const BLOCK_SCALAR_BODY = '(?:[ ]{2,}[^\\n]*\\n|\\n)'

// Derive a router skill file from an agent file at install time.
// Pure function: content string → content string. Sibling to transformForOpenCode().
//
// Three deterministic deltas against the agent source, producing the skill
// golden output:
//   Delta A — replace agent frontmatter with skill frontmatter
//     (name + description:block-scalar from the top-level `description:` key +
//     metadata block; strip model/effort/mode/tools)
//   Delta B — insert "Running as a skill (not a subagent)" section immediately
//     after the intro paragraph block (before "## Out of Scope")
//   Delta C — Dispatch Protocol term substitutions (Task → Agent, install path)
//   Plus: Deliberation Protocol "ONE Task message" → "ONE message", and trailing
//   newline stripped (the skill golden output ends without a final newline).
//
// Name-driven: the ROUTER_SKILLS constant names which agent files are routers,
// and getRouterSkills returns that constant (not by reading agents/). The
// transform reads the top-level `description:` block scalar as the single
// source for the skill description.
function transformAgentToSkill(content) {
  // Extract the YAML frontmatter block.
  const fm = extractFrontmatter(content)
  if (!fm) return content
  const fmRaw = fm.fm
  const body = fm.body

  // Parse agent name from the agent frontmatter.
  const nameMatch = fmRaw.match(/^name:\s*(.+)$/m)
  const agentName = nameMatch ? nameMatch[1].trim() : ''

  // Idempotency guard: if this content is ALREADY a derived skill (the
  // transform's own output carries `metadata: source-agent: <name>`), return
  // it unchanged. This preserves the prior idempotency contract — re-applying
  // the transform to its own output is a no-op. Without this guard, the
  // top-level `description:` block scalar in the derived skill would re-trigger
  // the transform (the derived skill keeps that block scalar), and Delta C's
  // section-scope regex would throw on the already-substituted Dispatch Protocol
  // body (no unsubstituted targets remain).
  //
  // Why `source-agent:` is the discriminating signal: it carries the source
  // agent's name (e.g. `source-agent: ndv-flow`) and is unambiguously
  // transform-emitted — a hand-authored agent has no reason to name itself as
  // the source of a derivation. The prior signal (`origin: agent-derived`)
  // used the generic word "origin", which a human could legitimately author
  // inside a `metadata:` block for documentation. Matching on `source-agent:`
  // prevents the guard from false-firing on a future agent that legitimately
  // uses a `metadata:` block for documentation.
  if (new RegExp(`^metadata:\\s*\\n${BLOCK_SCALAR_BODY}*  source-agent:\\s*\\S+`, 'm').test(fmRaw)) {
    return content
  }

  // Extract the top-level description block scalar verbatim (2-space
  // indentation preserved — same indent as the skill output's description
  // block scalar, so no dedent is needed). Matches:
  //   description: >
  //     <2-space-indented lines>
  // The capture is the raw indented body (the lines under the block-scalar
  // indicator). If the agent has NO top-level description block scalar, return
  // the content unchanged — consistent with the prior "no skill block →
  // return content" behavior (router detection is name-driven via the
  // ROUTER_SKILLS constant in getRouterSkills; the transform only needs the
  // description).
  //
  // YAML block scalars (`>` and `|`) permit blank lines and whitespace-only
  // lines as paragraph separators — the content after a blank line is still
  // part of the scalar. A block scalar continues until a line with LESS
  // indentation than the scalar's base indent (2 spaces here). The capture
  // therefore matches lines that are EITHER:
  //   - indented 2+ spaces (content lines; `[^\n]*` allows trailing-only-whitespace lines like `  \n`)
  //   - fully blank (a lone `\n`)
  // and STOPS at a column-0 non-blank line (the next top-level key `tools:`
  // or the closing `---` fence). See test/transform-skill.test.js H3.
  const descriptionMatch = fmRaw.match(new RegExp(`^description:\\s*[>|]\\s*\\n(${BLOCK_SCALAR_BODY}+)`, 'm'))
  if (!descriptionMatch) return content
  const descriptionBlock = descriptionMatch[1]

  // Delta A — assemble skill frontmatter.
  // The agent's top-level description block scalar is indented 2 spaces
  // (direct child of the top-level `description:` key). The skill output's
  // description block scalar is indented 2 spaces too — the body carries over
  // at the SAME indentation. No dedent needed.
  const skillFrontmatter =
    `---\n` +
    `name: ${agentName}\n` +
    `description: >\n` +
    `${descriptionBlock}` +
    `metadata:\n` +
    `  type: router\n` +
    `  origin: agent-derived\n` +
    `  source-agent: ${agentName}\n` +
    `---\n`

  let out = skillFrontmatter + body

  // Delta B — insert "Running as a skill (not a subagent)" section immediately
  // after the intro paragraph block (the four paragraphs ending with
  // "...Every word that does not move the work is a thread wasted."), and
  // before "## Out of Scope (never do these)".
  const insertSection =
    `\n## Running as a skill (not a subagent)\n` +
    `\n` +
    `This skill runs in the main loop, so:\n` +
    `\n` +
    `- **Dispatch with the \`Agent\` tool**, passing \`subagent_type: "<agent-name>"\`. Everywhere this document says "Task", use \`Agent\`.\n` +
    `- Set \`run_in_background: false\` on dispatches whose results you need before deciding the next group — which is most of them under Post-Group Protocol.\n` +
    `- You hold every tool, not just Read/Glob/Task. The restriction is now self-imposed: **do not use Edit, Write, or Bash to do the work**. Read and Glob to understand and to read target agent files before authoring briefs. Everything else routes. Any implementation impulse is a routing event.\n` +
    `- Stay in this role for the remainder of the session unless the user says otherwise.\n`

  // The intro block ends with the paragraph ending in "thread wasted.\n" and is
  // immediately followed by "\n## Out of Scope (never do these)". Insert the
  // section between them.
  // Delta B is anchor-sensitive: assert the substitution landed so a future
  // rewording of the intro/out-of-scope anchors fails here (at the cause)
  // instead of surfacing as a far-removed golden-fixture byte diff. The check
  // is conditional — synthetic minimal agents legitimately omit the intro
  // paragraph (see the "no anchor" tests); only when the anchor IS present must
  // the insertion succeed.
  const hasDeltaBAnchor = /Every word that does not move the work is a thread wasted\.\n\n## Out of Scope \(never do these\)/.test(out)
  const beforeDeltaB = out
  out = out.replace(
    /(Every word that does not move the work is a thread wasted\.\n)\n(## Out of Scope \(never do these\))/,
    `$1${insertSection}\n$2`
  )
  if (hasDeltaBAnchor && out === beforeDeltaB) {
    throw new Error(
      'transformAgentToSkill Delta B failed: anchor matched in pre-state but replacement was a no-op. ' +
      'Expected intro paragraph ending in "Every word that does not move the work is a thread wasted.\\n" ' +
      'immediately followed by "\\n## Out of Scope (never do these)".'
    )
  }

  // Delta C — Dispatch Protocol term substitutions (Dispatch Protocol section only).
  // Scope to the section between "## Dispatch Protocol" and the next "## " header.
  // The replacement function receives the full match (including the trailing
  // "\n## " boundary) — apply substitutions to the section body, leave the
  // trailing next-section header intact.
  // Anchor-sensitive: assert the section-scope regex matched when a Dispatch
  // Protocol section is present, and that the "multiple Task calls" literal
  // did not survive the substitution inside that section.
  const hasDispatchSection = /## Dispatch Protocol[\s\S]*?\n## (?=)/.test(out)
  const beforeDeltaC = out
  out = out.replace(/(## Dispatch Protocol[\s\S]*?)(\n## (?=))/, (full, section) => {
    let s = section
    s = s.replace(/multiple Task calls/g, 'multiple `Agent` calls')
    s = s.replace(/spawn one Task, wait for sentinel/g, 'spawn one `Agent`, wait for sentinel')
    s = s.replace(
      /Read the target agent's full file before authoring anything/,
      "Read the target agent's full file (`~/.claude/agents/<name>.md`) before authoring anything"
    )
    return s + full.slice(section.length)
  })
  if (hasDispatchSection && out === beforeDeltaC) {
    throw new Error(
      'transformAgentToSkill Delta C failed: "## Dispatch Protocol" section present but ' +
      'section-scope regex did not match. Expected the section followed by a subsequent "## " header.'
    )
  }
  // The Dispatch Protocol section body must no longer contain the unsubstituted
  // "multiple Task calls" literal — if it does, the section-scope regex matched
  // a different span than intended.
  const dispatchSectionMatch = out.match(/## Dispatch Protocol[\s\S]*?(\n## (?=))/)
  const dispatchSection = dispatchSectionMatch ? dispatchSectionMatch[1] : ''
  if (dispatchSection.includes('multiple Task calls')) {
    throw new Error(
      'transformAgentToSkill Delta C failed: "multiple Task calls" literal remains in ' +
      'the Dispatch Protocol section after substitution — section scope mismatch.'
    )
  }

  // Deliberation Protocol substitution (matches golden output).
  // Post-condition: if the input contained "ONE Task message", the output must
  // not. Synthetic minimal agents legitimately omit the anchor; only assert the
  // absence of the unsubstituted form (per the brief) — converts emergent
  // golden-test drift into a localized failure without breaking minimal inputs.
  out = out.replace(
    /dispatch BOTH agents in ONE Task message/g,
    'dispatch BOTH agents in ONE message'
  )
  if (out.includes('dispatch BOTH agents in ONE Task message')) {
    throw new Error(
      'transformAgentToSkill Deliberation Protocol substitution failed: ' +
      '"dispatch BOTH agents in ONE Task message" remains in output after substitution.'
    )
  }

  // Strip trailing newline — the skill golden output ends without a final newline.
  out = out.replace(/\n$/, '')

  return out
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
| PRD, epic, multi-task workload, fleet orchestration | \`ndv-flow\` |
| Code review, PR, code smells, quality | \`ndv-review\` |
| Bug, stack trace, root cause **unknown** — investigate | \`ndv-diagnose\` |
| Root cause **confirmed**, fix known — implement it | \`ndv-build\` |
| Rename, extract, restructure, modernize syntax | \`ndv-refactor\` |
| Generate tests, improve coverage | \`ndv-tester\` |
| Security vulnerabilities, OWASP, auth issues | \`ndv-secure\` |
| Slow code, N+1 queries, bundle size, latency | \`ndv-optimize\` |
| Add logging, metrics, traces, health checks | \`ndv-telemetry\` |
| System design, SOLID violations, architecture review | \`ndv-architect\` |
| Implement a spec with schemas, acceptance criteria, file targets, and architecture decided | \`ndv-build\` |
| Scope creep, "while we're at it", PRD boundary review, overloaded tickets | \`ndv-scope\` |
| Estimate review, sprint plan calibration, roadmap sanity check | \`ndv-forecast\` |
| KPI audit, metrics review, coverage targets, DORA metrics, OKRs | \`ndv-signal\` |
| Technical docs, API docs, session notes | \`ndv-explain\` |
| UI structure, layout decisions, visual hierarchy, design judgment | \`ndv-design\` → then \`ndv-build\` |
| WCAG auditing, ARIA violations, contrast ratios, keyboard nav, screen reader compatibility | \`ndv-accessibility\` |
| Codebase lookup, cross-file tracing, "where is X", "how does Y work", feature flow summaries | \`ndv-research\` |
| No specialist match / no clear owner / tradeoffs / direct answer / command execution | \`ndv-honest\` |


## Proactive Application

Apply without being asked when the signal is clear:

- Stack trace shared → apply \`ndv-diagnose\`
- PR or files to review → apply \`ndv-review\`
- "it's slow" or slow query → apply \`ndv-optimize\`
- "clean this up" or rename → apply \`ndv-refactor\`
- Code with no tests → suggest \`ndv-tester\`
- Story has schemas + criteria + file targets + architecture settled → apply \`ndv-build\`
- Add logging or observability → apply \`ndv-telemetry\`
- UI code, components, or design decisions → apply \`ndv-design\`
- UI code with interactive elements, form inputs, or color usage → apply \`ndv-accessibility\`
- Accessibility remediation work: classify as \`a11y-only\` vs \`a11y+visual-risk\`; route implementation to \`ndv-build\`, and for visual-risking changes hand off to \`ndv-design\` before implementation
- "where is", "how does", "trace this", "what files", "show me" about existing code → apply \`ndv-research\`

## Conflict Resolution (use highest-priority match)

1. Stack trace / exception / failing test / "debug" language → \`ndv-diagnose\` (even if the code is auth/payment)
2. Explicit vulnerability/audit/exploit language → \`ndv-secure\`
3. Explicit performance/latency/slow language → \`ndv-optimize\`
4. If still ambiguous: diagnose first with \`ndv-diagnose\`, then hand off
5. \`ndv-honest\` handles anything — it is a pure communication layer, not a router.
6. Layout/structure changes without a spec → \`ndv-design\` first. \`ndv-build\` executes specs, not decisions.

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
    try {
      config = JSON.parse(readFileSync(jsonPath, 'utf8'))
    } catch {
      console.warn(`  ⚠ Could not parse ${jsonPath} — treating as empty`)
    }
  }

  let mutated = false

  // Permission merge — always runs, idempotent
  if (!config.permission) config.permission = {}
  if (!config.permission.external_directory) config.permission.external_directory = {}
  if (!config.permission.external_directory['~/.config/opencode/agents/**']) {
    config.permission.external_directory['~/.config/opencode/agents/**'] = 'allow'
    mutated = true
    console.log(`  Permission block written to ${jsonPath}`)
  }

  // Instructions merge — only on first install
  // Exact-path match: skip only when the instructions array contains the
  // canonical rules file path this installer would write. A substring match
  // like `mentions-ndv-by-name.md` must NOT trigger a skip.
  const rulesDir = join(HOME, '.config', 'opencode', 'rules')
  const rulesFile = join(rulesDir, 'ndv.md')
  if (config.instructions && config.instructions.includes(rulesFile)) {
    console.log(`  ndv already in ${jsonPath} — skipping`)
    if (mutated) writeFileSync(jsonPath, JSON.stringify(config, null, 2) + '\n')
    return
  }
  mkdirSync(rulesDir, { recursive: true })
  writeFileSync(rulesFile, NDV_BLOCK + '\n')
  config.instructions = [...(config.instructions ?? []), `${rulesFile}`]
  mutated = true
  console.log(`  ndv routing written to ${rulesFile}`)
  console.log(`  Referenced in ${jsonPath}`)

  if (mutated) writeFileSync(jsonPath, JSON.stringify(config, null, 2) + '\n')
}

function installAgents(toolName, target, isGlobal, s = null) {
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
      if (commands.length === 0) {
        console.warn(`  ⚠ No .md command files found in ${commandsDir} — slash commands not installed`)
      }
      for (const cmd of commands) {
        writeFileSync(join(destCommandsDir, cmd), readFileSync(join(commandsDir, cmd), 'utf8'))
        commandFallbacks.add(cmd)
      }
    } else {
      console.warn(`  ⚠ No commands directory found at ${commandsDir} — slash commands not installed`)
    }
  }

  // Claude Code: install slash commands
  if (toolName === 'claude') {
    const commandsDir = join(AGENTS_DIR, '..', 'commands', 'claude')
    const destCommandsDir = isGlobal
      ? join(HOME, '.claude', 'commands')
      : '.claude/commands'
    if (existsSync(commandsDir)) {
      mkdirSync(destCommandsDir, { recursive: true })
      const commands = readdirSync(commandsDir).filter(f => f.endsWith('.md'))
      if (commands.length === 0) {
        console.warn(`  ⚠ No .md command files found in ${commandsDir} — slash commands not installed`)
      }
      for (const cmd of commands) {
        writeFileSync(join(destCommandsDir, cmd), readFileSync(join(commandsDir, cmd), 'utf8'))
      }
    } else {
      console.warn(`  ⚠ No commands directory found at ${commandsDir} — slash commands not installed`)
    }
  }

  // Auto-install router skills (fleet entry points — mandatory for skill-supporting tools)
  const skillTarget = SKILL_TARGETS[toolName] ?? null
  if (skillTarget?.autoInstallRouters) {
    const routers = getRouterSkills()
    if (routers.length > 0) {
      const skillDestDir = installSkillsFor(toolName, routers, isGlobal, s, '(router skill — auto-installed)')
      if (s) {
        s.message(`Router skills auto-installed to ${skillDestDir}/`)
      } else {
        console.log(`  Router skills auto-installed to ${skillDestDir}/`)
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

  // For global opencode installs: mirror agents into ~/.claude/agents/ via symlinks
  if (toolName === 'opencode' && isGlobal) {
    const claudeAgentsDir = join(HOME, '.claude', 'agents')
    mkdirSync(claudeAgentsDir, { recursive: true })
    const installedAgents = readdirSync(target.dest).filter(f => f.endsWith('.md'))
    for (const agent of installedAgents) {
      const linkPath = join(claudeAgentsDir, agent)
      const targetPath = join(target.dest, agent)
      // Use lstatSync (not existsSync) — correctly detects dangling symlinks
      let skip = false
      try {
        const stat = lstatSync(linkPath)
        if (stat.isSymbolicLink()) {
          // Symlink exists — check if it points to the right place
          const current = readlinkSync(linkPath)
          if (resolve(dirname(linkPath), current) === resolve(targetPath)) {
            skip = true // already correct — leave it
          } else {
            // Symlink points somewhere else. Only replace if it's a VALID (non-dangling) link.
            // A dangling symlink (target doesn't exist) may be the user's intentional pointer
            // to a not-yet-created file — preserve it, same policy as regular files below.
            if (existsSync(linkPath)) {
              unlinkSync(linkPath) // valid link, wrong target — remove and recreate below
            } else {
              skip = true // dangling — preserve, do not clobber
            }
          }
        } else {
          skip = true // regular file (non-ndv) — do not clobber
        }
      } catch {
        // lstatSync threw — path does not exist, proceed to create
      }
      if (skip) continue
      symlinkSync(targetPath, linkPath)
    }
    console.log(`  Symlinked agents to ${claudeAgentsDir}/`)
  }

  // Parity check: warn if installed count doesn't match source count
  if (isGlobal) {
    const sourceCount = agents.length
    const installedCount = readdirSync(target.dest).filter(f => f.endsWith(target.ext)).length
    if (installedCount !== sourceCount - skipped.length) {
      console.warn(`  ⚠ Parity mismatch: ${sourceCount - skipped.length} agents expected, ${installedCount} found in ${target.dest}`)
    }
  }

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
      installAgents(toolName, finalTarget, isGlobal, s)
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
      const allSkills = getCognitiveSkills()
      if (allSkills.length > 0) {
        const installSkillsNow = await promptConfirm('Also install cognitive modules (skills)?', true)
        if (installSkillsNow) {
          const groups = buildSkillGroups(allSkills)
          const selected = await promptMultiSelect('Which cognitive modules?', groups)

          if (selected.length === 0) {
            cancel('No modules selected.')
            return
          }

          let skillDestDir
          await withSpinner(`Installing ${selected.length} module(s)...`, async (s) => {
            skillDestDir = installSkillsFor(toolName, selected, isGlobal, s)
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
      const allSkills = getCognitiveSkills()
      if (allSkills.length > 0) {
        const skillDestDir = installSkillsFor(toolName, allSkills, isGlobal, null)
        console.log(`  ${allSkills.length} cognitive module(s) installed to ${skillDestDir}/`)
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

  const header = `<!-- ndv:start -->
# neurodiveragents — Copilot Instructions

This project uses the neurodiveragents fleet. When a task matches an agent domain, apply that agent's patterns directly.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| PRD, epic, multi-task workload, fleet orchestration | ndv-flow |
| Code review, PR, code smells, quality | ndv-review |
| Bug, stack trace, root cause **unknown** — investigate | ndv-diagnose |
| Root cause **confirmed**, fix known — implement it | ndv-build |
| Rename, extract, restructure, modernize syntax | ndv-refactor |
| Generate tests, improve coverage | ndv-tester |
| Security vulnerabilities, OWASP, auth issues | ndv-secure |
| Slow code, N+1 queries, bundle size, latency | ndv-optimize |
| Add logging, metrics, traces, health checks | ndv-telemetry |
| System design, SOLID violations, architecture review | ndv-architect |
| Implement a spec with schemas, acceptance criteria, file targets, and architecture decided | ndv-build |
| Scope creep, "while we're at it", PRD boundary review, overloaded tickets | ndv-scope |
| Estimate review, sprint plan calibration, roadmap sanity check | ndv-forecast |
| KPI audit, metrics review, coverage targets, DORA metrics, OKRs | ndv-signal |
| Technical docs, API docs, session notes | ndv-explain |
| UI structure, layout decisions, visual hierarchy, design judgment | ndv-design → then ndv-build |
| WCAG auditing, ARIA violations, contrast ratios, keyboard nav, screen reader compatibility | ndv-accessibility |
| Codebase lookup, cross-file tracing, "where is X", "how does Y work", feature flow summaries | ndv-research |
| No specialist match / direct answer / command execution | ndv-honest |

---

<!-- ndv:end -->

`

  const output = header + sections.join('\n\n---\n\n')
  mkdirSync('.github', { recursive: true })

  const outPath = '.github/copilot-instructions.md'
  if (existsSync(outPath)) {
    const existing = readFileSync(outPath, 'utf8')
    const blockRe = /<!-- ndv:start -->[\s\S]*?<!-- ndv:end -->/
    if (blockRe.test(existing)) {
      // Full block present — replace it, preserve content outside
      const updated = existing.replace(/<!-- ndv:start -->[\s\S]*?<!-- ndv:end -->\n?/, header)
      writeFileSync(outPath, updated + sections.join('\n\n---\n\n'))
      console.log(`Updated ndv routing block in ${outPath}`)
      return
    }
    // No full block — refuse to write, whether or not a partial marker exists
    if (existing.includes('ndv:start')) {
      console.warn(`  ⚠ ${outPath} contains a partial 'ndv:start' marker but no complete ndv block.`)
      console.warn(`    Refusing to overwrite — manually fix the marker or remove the file and re-run.`)
    } else {
      console.warn(`  ⚠ ${outPath} already exists without an ndv routing block.`)
      console.warn(`    Refusing to overwrite — manually merge or remove the file and re-run.`)
    }
    return
  }

  writeFileSync(outPath, output)
  console.log(`Copilot instructions written to .github/copilot-instructions.md`)
}

// Skill platform support: which tools support the Agent Skills spec and where
const SKILL_TARGETS = {
  claude: {
    project: '.claude/skills',
    global: join(HOME, '.claude', 'skills'),
    autoInstallRouters: true,
  },
  opencode: {
    project: '.opencode/skills',
    global: join(HOME, '.config', 'opencode', 'skills'),
    autoInstallRouters: false,
  },
}

function isSkillFrozen(skillDir) {
  const content = readFileSync(join(SKILLS_DIR, skillDir, 'SKILL.md'), 'utf8')
  return /^\s*status:\s*frozen/m.test(content)
}

// All installable skills = cognitive skills (static, from skills/) UNION
// router skills (ndv-flow is the only router skill, hardcoded by name).
// Order: cognitive first, then routers — matches the standalone install-skills
// command's historical install order.
function getAllSkills() {
  return [...getCognitiveSkills(), ...getRouterSkills()]
}

// Router skills. ndv-flow is the only router skill — hardcoded by name.
// The agent file is the single source of truth for the agent itself; the skill
// body is produced by transformAgentToSkill(). Name-driven, not marker-driven:
// if a future router agent is added, extend this list.
const ROUTER_SKILLS = ['ndv-flow']
function getRouterSkills() {
  return ROUTER_SKILLS
}

// Cognitive skills are the optional enhancement modules — everything that is NOT
// a router skill. These are the ones shown in the interactive picker and gated
// behind --all in non-interactive mode.
function getCognitiveSkills() {
  if (!existsSync(SKILLS_DIR)) return []
  return readdirSync(SKILLS_DIR).filter(f => {
    const skillFile = join(SKILLS_DIR, f, 'SKILL.md')
    if (!existsSync(skillFile)) return false
    const content = readFileSync(skillFile, 'utf8')
    if (/^\s*status:\s*frozen/m.test(content)) return false
    // Defense-in-depth: router skills are derived from agents/ (not skills/),
    // so metadata.type: router should never appear here. This filter prevents
    // a misplaced router SKILL.md from being treated as cognitive. The
    // invariant is enforced by test/validate-contracts.test.js.
    return parseSkillType(content) !== 'router'
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
  return resolve(dir)
}

// Build the grouped options array consumed by promptMultiSelect.
// Shared by the install wizard skills step and the standalone install-skills command.
//
// fs coupling note: despite the pure-looking signature buildSkillGroups(allSkills),
// this function reads the filesystem to derive display content — it calls
// getRouterSkills() (which returns the ROUTER_SKILLS constant) and readFileSync on either the agent
// file (routers, via transformAgentToSkill) or skills/<name>/SKILL.md
// (cognitive). The `allSkills` argument is the name list; the bodies are NOT
// passed in. This is intentional (single source of truth = the agent/skill
// files) but the signature does not advertise it. A rename to
// buildSkillGroupsWithFsRead or reader injection was considered and rejected
// as churn-heavy (>2 call sites incl. tests) for no behavioral gain. If you
// add a caller that needs purity, inject the readers then — do not assume
// this function is pure.
function buildSkillGroups(allSkills) {
  const groupMap = new Map()  // groupLabel → items[]
  const routers = new Set(getRouterSkills())
  for (const name of allSkills) {
    let content
    if (routers.has(name)) {
      // Derived router skill: read the agent file and apply the transform to
      // produce the skill content, then parse type/description from it. Mirrors
      // the branch in installSkillsFor() — routers have no static SKILL.md.
      const agentContent = readFileSync(join(AGENTS_DIR, `${name}.md`), 'utf8')
      content = transformAgentToSkill(agentContent)
    } else {
      // Static cognitive skill: read from skills/<name>/SKILL.md.
      // Parity guard: the router branch is guarded by routers.has(name)
      // membership; the cognitive branch had no guard — a caller passing an
      // arbitrary name would hit an unguarded ENOENT. Skip with a warning,
      // consistent with getCognitiveSkills' missing-file handling.
      const skillFile = join(SKILLS_DIR, name, 'SKILL.md')
      if (!existsSync(skillFile)) {
        console.warn(`buildSkillGroups: skipping "${name}" — ${skillFile} not found`)
        continue
      }
      content = readFileSync(skillFile, 'utf8')
    }
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

// Shared skill-install logic for all four call sites.
// Resolves the destination dir, creates it, and installs each skill.
// Router skills (derived from agent files named in the ROUTER_SKILLS constant) are
// produced via transformAgentToSkill() from the agent file; cognitive skills
// are copied verbatim from skills/<name>/SKILL.md.
// toolName: the tool key (claude, opencode)
// names: array of skill names (cognitive dir names or router agent base names)
// isGlobal: project vs global scope
// s: optional spinner — if provided, updates message per skill (interactive use)
// Returns the resolved destination dir path.
function installSkillsFor(toolName, names, isGlobal, s, label = '') {
  const target = SKILL_TARGETS[toolName]
  const destDir = resolveSkillDir(isGlobal ? target.global : target.project)
  mkdirSync(destDir, { recursive: true })
  const routers = new Set(getRouterSkills())
  for (const name of names) {
    const destSkillDir = join(destDir, name)
    mkdirSync(destSkillDir, { recursive: true })
    if (routers.has(name)) {
      // Derived router skill: read agent file, apply transform, write SKILL.md.
      const agentPath = join(AGENTS_DIR, `${name}.md`)
      const agentContent = readFileSync(agentPath, 'utf8')
      const skillContent = transformAgentToSkill(agentContent)
      writeFileSync(join(destSkillDir, 'SKILL.md'), skillContent)
    } else {
      // Static cognitive skill: copy verbatim from skills/<name>/SKILL.md.
      // Parity guard: mirrors the existsSync guard in buildSkillGroups' cognitive
      // branch — skip with a warning instead of crashing mid-install on ENOENT.
      const srcDir = join(SKILLS_DIR, name)
      const srcSkill = join(srcDir, 'SKILL.md')
      if (!existsSync(srcSkill)) {
        console.warn(`installSkillsFor: skipping "${name}" — ${srcSkill} not found`)
        continue
      }
      copyFileSync(srcSkill, join(destSkillDir, 'SKILL.md'))
    }
    if (s) {
      s.message(label ? `✓ ${name} ${label}` : `✓ ${name}`)
    } else {
      console.log(label ? `  ✓ ${name} ${label}` : `  ✓ ${name}`)
    }
  }
  return destDir
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
    }

    const groups = buildSkillGroups(allSkills)
    selected = await promptMultiSelect('Which cognitive modules?', groups)

    if (selected.length === 0) {
      cancel('No modules selected.')
      return
    }

    let destDir
    await withSpinner(`Installing ${selected.length} module(s)...`, async (s) => {
      destDir = installSkillsFor(toolName, selected, isGlobal, s)
    })

    const hint = selected.length === 1
      ? `Load the \`${selected[0]}\` skill in any step file.`
      : `Load the installed skills in any step file.`
    outro(`Done. ${selected.length} module(s) installed to ${destDir}/\nTo use: ${hint}`)
  } else {
    // Non-interactive — install all skills
    const scope = isGlobal ? 'global' : 'project'
    console.log(`\n  Installing NDV cognitive modules for ${toolName} (${scope})...\n`)

    const destDir = installSkillsFor(toolName, selected, isGlobal, null)

    console.log(`\n  ${selected.length} module(s) installed to ${destDir}/`)
    console.log(`\n  To use in a skill step file:`)
    const hint = selected.length === 1
      ? `Load the \`${selected[0]}\` skill before proceeding.`
      : `Load the installed skills before proceeding.`
    console.log(`    ${hint}\n`)
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

// Exported for direct unit testing (test/install-router-skills.test.js,
// test/transform-skill.test.js). The transform is a pure function; buildSkillGroups
// reads the filesystem (agents/ + skills/) but is deterministic for a given repo
// state and is exercised by the interactive-path coverage tests.
export { transformAgentToSkill, buildSkillGroups }

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

// CLI entry guard: only run the command dispatcher when this file is invoked
// directly as the entry point (not when imported for unit testing).
//
// Both sides must be realpath-resolved before comparison. When this package is
// installed globally (or via npx's cache), the bin shim on PATH is a symlink
// into node_modules/neurodiveragents/bin/ndv.js. Node's module loader follows
// symlinks when resolving import.meta.url (→ the real path), while
// process.argv[1] retains the invocation path (→ the symlink path).
// path.resolve() alone does NOT resolve symlinks, so the naive comparison
//   resolve(process.argv[1]) === fileURLToPath(import.meta.url)
// fails under a global/npx install → isMainEntry is false → the dispatcher is
// skipped → the CLI produces zero output (silent exit 0). realpathSync on both
// sides normalizes symlinks away and makes the comparison hold in every install
// topology. See: "global install says nothing, 0 feedback".
//
// realpathSync can throw on hostile/degraded filesystems (EACCES, stale mount,
// ENOENT if argv[1] is replaced between spawn and guard eval) — the prior
// resolve()-based guard never threw. So the realpath comparison is wrapped in
// try/catch; on throw it falls back to the resolve()-based comparison, which
// does not follow symlinks (so it fails to match under global/npx installs) but
// at least does not crash. The common case is already covered by the realpath
// branch; the fallback covers degraded-FS edge cases.
const isMainEntry = (() => {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    // Fallback: degraded filesystem where realpathSync throws (EACCES,
    // stale mount, ENOENT on argv[1] replaced between spawn and guard eval).
    // The pre-realpath behavior — resolve() does not follow symlinks, so
    // this fails to match under global/npx installs, but at least does not
    // crash. The common case is already covered by the realpath branch.
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  }
})()

if (isMainEntry) {
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
}
