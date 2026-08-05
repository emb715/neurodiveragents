# claude-flow — run an agent as the primary system prompt

A shell alias that boots a Claude Code session with an NDV agent as the entire system prompt. The agent becomes the primary conversationalist; Claude Code remains the host and still resolves subagent dispatches from `.claude/agents/` and `~/.claude/agents/`.

This is distinct from the three standard ways the fleet runs:

| Mode | Mechanism | When |
|------|-----------|------|
| Subagent | `Task(subagent_type: "ndv-X")` — host primary dispatches | Default. One task, one domain, fresh context per dispatch. |
| Skill | `/ndv-flow` router skill — primary invokes in-context | Flow's routing logic running inside the primary, no subagent spawn. |
| **Primary (this doc)** | `claude-flow` — agent *is* the system prompt | You want one agent's cognition for the whole session. |

## Install

`claude-flow` is installed automatically as part of `ndv install claude --global`. After the agents and skills are installed, the wizard prompts:

```
Install claude-flow alias? (run any agent as the primary system prompt)
  › Yes — install to ~/.local/bin/
    No — skip
```

On yes, the installer:

1. Copies `bin/claude-flow` to `~/.local/bin/claude-flow` (re-running `ndv install claude --global` overwrites it — that's the version update mechanism).
2. Writes `ndvRepoRoot` into `~/.claude/settings.json` so the script can resolve the repo without a shell profile entry.
3. Warns if `~/.local/bin` is not on `$PATH`.

Session read access to the agent source files is handled at runtime by `--add-dir` in the `claude-flow` exec line (session-scoped), not by `permissions.allow` — Claude Code's `allow` rules are for tool-scope permissions (`Bash(git *)`, `mcp__server__*`), not filesystem globs.

Non-interactive equivalent:

```bash
ndv install claude --global --all
```

This installs everything including the alias (no confirm prompt). To skip the alias in non-interactive mode, omit `--all`:

```bash
ndv install claude --global    # installs agents + skills, prints alias tip
```

Prerequisite: the fleet must be installed as subagents globally — `ndv install claude --global`. The script warns if neither `.claude/agents/` nor `~/.claude/agents/` has the fleet; it doesn't block, because you may want to run an agent standalone without routing.

## Usage

```bash
claude-flow                      # default: ndv-flow
claude-flow ndv-diagnose         # any agent from agents/ndv-*.md
claude-flow ndv-honest -c        # flags pass through to claude
claude-flow ndv-honest -p "fix the bug"
```

All `claude` flags pass through. The first non-flag argument is the agent name; everything else forwards to `claude`.

## What it does

1. Resolves `agents/$AGENT.md` from the repo. Resolution order: `NDV_REPO_ROOT` env var → sibling `agents/` dir (script inside the repo) → `ndvRepoRoot` key in `~/.claude/settings.json` (written by the installer) → error with fix instructions.
2. Strips the first YAML frontmatter block (the whole `---\n...\n---\n` span) — `name`, `mode`, `description`, `tools` are host-routing metadata with no meaning once the agent runs as the primary. Only the first block is stripped; some agent bodies contain `---` horizontal rules later in the document (ndv-secure, ndv-signal) and those are preserved.
3. Writes the stripped body to a temp file, execs `claude --system-prompt-file <temp> --add-dir <agents-dir> [passthrough flags]`. The `--add-dir` grants the session read access to the source agents/ dir so the primary (e.g. Flow) can read target agent files to author briefs.

## Agent discovery — how Flow finds the fleet

The script does not need to know where agents live. Claude Code is still the host. It scans `.claude/agents/` (project) and `~/.claude/agents/` (global) to resolve `Task(subagent_type: "ndv-X")`. The script only verifies the fleet is installed *somewhere* so dispatch won't silently fail at runtime.

## Known limitation: Flow as conductor

`ndv-flow.md` is written for subagent use — its body says *"You do not implement anything. You do not review anything"* and *"Output is signal, not conversation."* As a chat conductor, Flow will refuse to answer directly and try to route every message to a subagent. Three workarounds:

1. **Edit `ndv-flow.md`** — add a `## Conversation Mode` section relaxing "never implement / never review" for direct user questions, and defining when a user turn is a routing event vs. a direct answer. ~30 lines.
2. **Use `ndv-honest` instead** — `claude-flow ndv-honest`. Honest's whole job is "no specialist match / direct answer / command execution." It's already the closest thing to a chat conductor that can also route. You lose Flow's decomposition protocols but gain a usable conversationalist.
3. **Hybrid prompt** — paste Flow's routing table + Decomposition Protocol into a new system-prompt file, drop the "never implement / never review" constraints, keep the rest. You own the file, not `ndv-flow.md` itself.

Option 2 is the fastest way to feel out the primary-mode experience. Option 1 is the right long-term fix if Flow-as-primary becomes a real workflow.

## Source of truth

The script lives at `bin/claude-flow` in the neurodiveragents repo. The version at `~/.local/bin/claude-flow` is installed by `ndv install claude --global` and overwritten on reinstall — that's the version update mechanism. No manual copy needed.