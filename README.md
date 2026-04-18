# neurodiveragents

![neurodiveragents fleet](assets/neurodiveragents-names-banner.png)

A fleet of specialized AI agents for Claude Code, OpenCode, and Cursor. Each agent embodies a distinct cognitive style — hyperfocus, pattern recognition, lateral thinking, systematic rigor — channeled into a specific engineering domain.

Each agent stays within its scope, hands off out-of-scope findings to the right agent, defaults to parallel execution, and is language and framework agnostic.

---

## Install

### npx (recommended)

```bash
npx neurodiveragents install claude      # Claude Code
npx neurodiveragents install opencode    # OpenCode
npx neurodiveragents install cursor      # Cursor
npx neurodiveragents install copilot     # GitHub Copilot
```

### curl

```bash
# Claude Code
curl -fsSL https://raw.githubusercontent.com/emb715/neurodiveragents/main/install.sh | bash -s claude

# OpenCode
curl -fsSL https://raw.githubusercontent.com/emb715/neurodiveragents/main/install.sh | bash -s opencode

# Cursor
curl -fsSL https://raw.githubusercontent.com/emb715/neurodiveragents/main/install.sh | bash -s cursor

# GitHub Copilot
curl -fsSL https://raw.githubusercontent.com/emb715/neurodiveragents/main/install.sh | bash -s copilot
```

Both methods install the agents **and** write the routing table into your project so your AI tool understands the full fleet from the first message.

---

## Start here: ndv-honest

`ndv-honest` is the default agent for everyday work. Direct, ruthless, zero filler. Minimum tokens, maximum accuracy. Use it when you don't need a specialist — which is most of the time.

```
Use ndv-honest to review this approach
Use ndv-honest to explain what this code does
Use ndv-honest to decide between these two options
```

It will tell you when you're wrong, skip the preamble, and ask what's next.

---

## The Fleet

Ten agents, ten cognitive styles. Each one a specialist who stays in their lane and hands off anything outside it.

| Agent | Character | Cognitive style | Does |
|-------|-----------|-----------------|------|
| `ndv-review` | Acute | Hyperfocus on detail | Code review — bugs, smells, severity-tagged feedback |
| `ndv-diagnose` | Pierce | ADHD hyperfocus — locks on, won't stop | Root cause analysis — not just where, but why |
| `ndv-refactor` | Just | Fluid, incremental transformation | Safe code transformation — structure without behavior change |
| `ndv-tester` | Edge | Multi-angle coverage thinking | Test generation — happy path, edges, errors, boundaries |
| `ndv-secure` | Ward | Threat-modeled attacker mindset | Security audit — OWASP Top 10, exploit vectors, fixes |
| `ndv-optimize` | Lean | Measure-first, high-intensity focus | Performance — algorithms, queries, rendering, assets |
| `ndv-telemetry` | Pulse | Systemic awareness, signal reading | Observability — logging, metrics, tracing, health checks |
| `ndv-architect` | Arc | Long-horizon strategic thinking | Architecture — SOLID, scalability, migration paths |
| `ndv-explain` | Patient | Explicit theory of mind | Documentation — models the reader's knowledge gap, bridges it deliberately |
| `ndv-honest` | Honest | Direct, unfiltered judgment | Fallback generalist — cross-domain calls, tradeoffs, opinions |

---

## Usage

Once installed, your AI tool picks the right agent automatically. Or invoke directly:

```
Use ndv-review to review these 5 files
Use ndv-diagnose to find why this test fails
Use ndv-secure to audit the auth module
Use ndv-explain to document these APIs
```

Chain agents:

```
Use ndv-diagnose to find the root cause, then use ndv-tester to create regression tests
Use ndv-secure to audit, then ndv-review to verify the fixes
```

---

## How it works

Install copies agent markdown files into your tool's agents directory and writes a routing block into your project's config file (`CLAUDE.md`, `.opencode/AGENTS.md`, `.cursor/rules/ndv.mdc`, or `.github/copilot-instructions.md`).

The routing block tells your AI tool:
- Which agent to reach for given any task signal
- To apply agents proactively without being asked
- To read the agent file and execute directly
- To batch parallel operations for 4-8 items

Running install a second time is safe — it detects the existing routing block and skips it.

---

## CLI

```
npx neurodiveragents install [tool]    Install agents into your project
npx neurodiveragents list              List available agents and characters
npx neurodiveragents help              Show help
```

---

## Agent format

Each agent is a markdown file with YAML frontmatter compatible with Claude Code and OpenCode:

```markdown
---
name: ndv-review
description: [used by the tool for automatic delegation]
agent: Acute
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

Agent instructions...
```

The `agent` field is the character name — cosmetic, ignored by tools.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add agents, edit existing ones, and run the benchmark.

---

## License

MIT
