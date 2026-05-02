# Tool Guardrails

Constraints and rules for each supported AI tool. What each tool expects, what it ignores, what can break, and how the install script handles it.

---

## Claude Code

**Agent directory:** `.claude/agents/`  
**Routing file:** `CLAUDE.md` (auto-loaded at session start)  
**Format:** Markdown with YAML frontmatter  
**Recognized frontmatter fields:** `name`, `description`, `tools`, `model`, `permissionMode`, `maxTurns`

**What it uses:**
- `name` — unique identifier, used for `@agent-name` mentions and routing
- `description` — primary routing signal, used for automatic delegation
- `tools` — restricts which tools the agent can call
- The markdown body becomes the system prompt

**What it ignores:**
- `agent:` field (character name) — cosmetic, not a Claude Code concept
- Human files in `docs/` — never loaded, must not be in `.claude/agents/`

**Guardrails:**
- Do NOT copy `docs/*.human.md` into `.claude/agents/` — they will be loaded as agent system prompts
- Do NOT copy `docs/ndv-agents.md` or `decisions.md` into `.claude/agents/` — same reason
- The `agent:` frontmatter field is safe — Claude Code ignores unknown fields
- Keep `tools:` lists accurate — Claude Code enforces them; listing a tool the agent doesn't need wastes nothing, but omitting one breaks the agent
- `CLAUDE.md` routing block is fenced with `<!-- ndv:start -->` / `<!-- ndv:end -->` — do not edit inside these markers manually; use the install script

**Install output:**
```
.claude/agents/ndv-architect.md
.claude/agents/ndv-diagnose.md
... (15 files)
CLAUDE.md  ← routing block appended or created
```

---

## OpenCode

**Agent directory:** `.opencode/agents/`  
**Routing file:** `.opencode/AGENTS.md`  
**Format:** Markdown with YAML frontmatter  
**Recognized frontmatter fields:** `name`, `description`, `tools`, `model`

**What it uses:**
- Same as Claude Code for the fields above
- `@agent-name` mention syntax for explicit invocation
- Automatic delegation via `description` field

**What it ignores:**
- `agent:` field — same as Claude Code
- `permissionMode`, `maxTurns` — Claude Code-specific fields, silently ignored

**Guardrails:**
- Same human file exclusion rule as Claude Code
- OpenCode's routing file is `.opencode/AGENTS.md` — do not confuse with `CLAUDE.md`
- The `ndv:start` / `ndv:end` fence is the same — install script handles both files identically

**Install output:**
```
.opencode/agents/ndv-architect.md
.opencode/agents/ndv-diagnose.md
... (15 files)
.opencode/AGENTS.md  ← routing block appended or created
```

---

## Cursor

**Agent directory:** `.cursor/rules/`  
**Routing file:** `.cursor/rules/ndv.mdc`  
**Format:** `.mdc` (Markdown Component) — functionally identical to `.md`  
**Recognized frontmatter fields:** varies by Cursor version; `description` is primary

**What it uses:**
- `description` for routing suggestions
- The markdown body as instructions
- `.mdc` extension is required — `.md` files in `.cursor/rules/` may not be picked up

**What it ignores:**
- `agent:` field
- `tools:` field — Cursor does not restrict tools per agent file
- `permissionMode`, `maxTurns`

**Guardrails:**
- Install script converts `.md` → `.mdc` extension automatically — do not copy `.md` files manually
- Cursor does not support per-agent tool restriction — the `tools:` field in the model files is ignored; all tools are available to all agents
- Scope enforcement (what the agent "never does") relies entirely on the system prompt, not tool restrictions — this makes scope containment weaker in Cursor than in Claude Code/OpenCode
- Routing is less automatic — users may need to @mention agents explicitly more often

**Install output:**
```
.cursor/rules/ndv-architect.mdc
.cursor/rules/ndv-diagnose.mdc
... (15 files)
.cursor/rules/ndv.mdc  ← routing block
```

---

## GitHub Copilot

**Agent directory:** None — single file only  
**Routing file:** `.github/copilot-instructions.md`  
**Format:** Flat Markdown — no frontmatter parsing, no per-agent files

**What it uses:**
- The entire `.github/copilot-instructions.md` as a system-level instruction
- No agent switching — all instructions are always active

**What it ignores:**
- Everything that requires per-agent file loading
- `tools:` field — not a Copilot concept
- `name:` field — no routing by agent name
- `@agent-name` mention syntax

**Guardrails:**
- The install script strips YAML frontmatter from all agent files and concatenates them into a single document — this is the only supported install method for Copilot
- Agent scope enforcement is weaker — all agents' rules are loaded simultaneously; the model must infer which applies from context rather than being explicitly routed
- Copilot does not support tool restriction per agent — same limitation as Cursor
- Character names (Honest, Patient, Pierce...) in the system prompt may help Copilot identify which agent's rules apply in context, but this is not guaranteed
- The routing table at the top of the Copilot instructions file is critical — without it, Copilot has no mechanism to select the right agent

**Install output:**
```
.github/copilot-instructions.md  ← all agents concatenated, routing table at top
```

---

## Capability Matrix

| Capability | Claude Code | OpenCode | Cursor | Copilot |
|-----------|------------|---------|--------|---------|
| Per-agent tool restriction | Yes | Yes | No | No |
| Automatic routing via description | Yes | Yes | Partial | No |
| @mention invocation | Yes | Yes | Yes | No |
| Scope enforcement via tools | Yes | Yes | No (prompt only) | No (prompt only) |
| Per-agent file loading | Yes | Yes | Yes (.mdc) | No (flattened) |
| Routing file auto-loaded | Yes (CLAUDE.md) | Yes (AGENTS.md) | Yes (.mdc) | Yes (copilot-instructions.md) |
| Frontmatter parsing | Full | Full | Partial | None |

---

## What this means for agent design

**Tool restriction (`tools:` field)** is only enforced in Claude Code and OpenCode. For Cursor and Copilot, scope containment relies entirely on the "Out of Scope" and "What X Never Does" sections in the system prompt. This is why those sections must be unambiguous — they are the only guardrail in two of four supported tools.

**Routing** is fully automatic only in Claude Code and OpenCode. Cursor requires more explicit invocation. Copilot has no automatic routing at all — the routing table in the instructions file is guidance, not enforcement.

**Tool restriction list per agent** (for Claude Code / OpenCode correctness):

| Agent | Tools |
|-------|-------|
| ndv-honest | Read, Write, Edit, Grep, Glob, Bash |
| ndv-explain | Write, Read, Edit, Glob, Grep, Bash |
| ndv-diagnose | Read, Grep, Glob, Bash |
| ndv-review | Read, Grep, Glob, Bash |
| ndv-refactor | Read, Edit, Grep, Glob, Bash |
| ndv-secure | Read, Grep, Glob, Bash |
| ndv-optimize | Read, Edit, Grep, Glob, Bash |
| ndv-telemetry | Read, Write, Edit, Grep, Glob, Bash |
| ndv-architect | Read, Grep, Glob, Bash |
| ndv-tester | Read, Write, Grep, Glob, Bash |
| ndv-flow | Read, Glob, Task — Task is allowed in both Claude Code and OpenCode (OpenCode restriction was removed) |
| ndv-build | Read, Write, Edit, Grep, Glob, Bash |
| ndv-forecast | Read, Glob, Bash |
| ndv-scope | Read, Glob, Bash |
| ndv-signal | Read, Grep, Glob, Bash |

Note: ndv-explain and ndv-telemetry have Write/Edit for their output files (docs and instrumentation). ndv-diagnose, ndv-review, ndv-secure, ndv-architect have no Write/Edit — they are read-and-report only. ndv-flow is the only agent with Task — it is the fleet orchestrator and Task is required for parallel sub-agent dispatch. ndv-forecast and ndv-scope are read-only analysts (no Write/Edit); ndv-signal is read-only (no Write/Edit).
