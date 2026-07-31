# neurodiveragents

This project uses the neurodiveragents fleet. Each agent embodies a distinct cognitive style that makes it exceptionally effective in its domain. When a task matches an agent's domain, read the agent file and apply its patterns directly. Do not use the Task tool unless explicitly asked.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| PRD, epic, multi-task workload, fleet orchestration | `ndv-flow` (Flow) |
| Code review, PR, code smells, quality | `ndv-review` (Acute) |
| Bug, stack trace, root cause **unknown** — investigate | `ndv-diagnose` (Pierce) |
| Root cause **confirmed**, fix known — implement it | `ndv-build` (Craft) |
| Rename, extract, restructure, modernize syntax | `ndv-refactor` (Just) |
| Generate tests, improve coverage | `ndv-tester` (Edge) |
| Security vulnerabilities, OWASP, auth issues | `ndv-secure` (Ward) |
| Slow code, N+1 queries, bundle size, latency | `ndv-optimize` (Lean) |
| Add logging, metrics, traces, health checks | `ndv-telemetry` (Pulse) |
| System design, SOLID violations, architecture review | `ndv-architect` (Arc) |
| Technical docs, API docs, session notes | `ndv-explain` (Patient) |
| Spec with schemas, acceptance criteria, file targets, and architecture already decided — implement it | `ndv-build` (Craft) |
| Scope creep, "while we're at it", PRD boundary review, overloaded tickets | `ndv-scope` (Bound) |
| Estimate review, sprint plan calibration, roadmap sanity check | `ndv-forecast` (Datum) |
| KPI audit, metrics review, coverage targets, DORA metrics, OKRs | `ndv-signal` (Signal) |
| No specialist match / no clear owner / tradeoffs / direct answer / command execution | `ndv-honest` (Honest) |
| UI structure, layout decisions, visual hierarchy, design judgment | `ndv-design` (Pixel) → then `ndv-build` (Craft) |
| WCAG auditing, ARIA violations, contrast ratios, keyboard nav, screen reader compatibility | `ndv-accessibility` (Lux) |
| Codebase lookup, cross-file tracing, "where is X", "how does Y work", feature flow summaries | `ndv-research` (Scout) |

## Proactive Application

Apply without being asked when the signal is clear:

- Stack trace shared → apply `ndv-diagnose`
- PR or files to review → apply `ndv-review`
- "it's slow" or slow query → apply `ndv-optimize`
- "clean this up" or rename → apply `ndv-refactor`
- Code with no tests → suggest `ndv-tester`
- Add logging or observability → apply `ndv-telemetry`
- Story has schemas + acceptance criteria + file targets + architecture settled → apply `ndv-build`
- "while we're at it" or expanding ticket → apply `ndv-scope`
- Estimate given without named unknowns → apply `ndv-forecast`
- Coverage % or velocity used as a target → apply `ndv-signal`
- UI code, components, visual hierarchy, or design decisions → apply `ndv-design`
- UI code with interactive elements, form inputs, or color usage → apply `ndv-accessibility`
- Accessibility remediation work: classify as `a11y-only` vs `a11y+visual-risk`; route implementation to `ndv-build`, and for visual-risking changes hand off to `ndv-design` before implementation
- "where is", "how does", "trace this", "what files", "show me" about existing code → apply `ndv-research`

## How to Apply

1. Read `.claude/agents/ndv-[name].md`
2. Follow its workflow, checklist, and output format
3. Execute using available tools directly

## Parallelism Default

All agents default to parallel execution for 4-8 independent files/items. Always batch independent operations in a single response.

---

### Stack

- **Runtime:** Node.js ≥ 18, ESM (`"type": "module"`)
- **Test runner:** `node --test` (built-in, no Jest/Vitest)
- **Dependencies:** `@clack/prompts`, `picocolors` — no build step for the fleet itself
- **CSS build:** Tailwind CLI (`npm run css:build`) — only needed for the website, not the fleet

### Key directories

| Path | What lives here |
|------|----------------|
| `agents/` | Agent model files (source of truth) |
| `humans/` | Human-readable character profiles |
| `bin/ndv.js` | CLI installer — `ndv install`, `ndv list`, `ndv install-skills` |
| `test/` | Two test files (see below) |
| `docs/` | Authoring guide, ADRs, manifesto |
| `skills/` | Cognitive module skills |
| `commands/` | Slash commands (OpenCode) |

### Running tests

```bash
# Full suite
npm test

# Agent validation only (fast, no install simulation)
npm run test:validate

# Install simulation only
npm run test:install

# Authoring-guide checks scoped to changed agents (CI mode)
CHANGED_AGENTS="ndv-foo,ndv-bar" node --test test/validate-agents.test.js
```

### Test files

| File | What it tests |
|------|--------------|
| `test/validate-agents.test.js` | Agent/human file schema, symmetry, routing completeness, authoring-guide constraints (scoped to `CHANGED_AGENTS` in CI) |
| `test/install.test.js` | `bin/ndv.js` install commands — simulates claude/opencode/cursor installs in a temp dir |

### Adding or changing an agent

1. Edit `agents/ndv-[name].md` (model file — source of truth)
2. Update routing in `CLAUDE.md`, `agents/ndv-flow.md`, `bin/ndv.js` (NDV_BLOCK + Copilot header), `commands/opencode/ndv-help.md`, `humans/ndv-agents.md`
3. Edit `humans/ndv-[name].human.md` (human file — written after model file is stable)
4. Run `npm run test:validate` locally before pushing
5. CI runs authoring-guide checks automatically via `CHANGED_AGENTS`

### Pre-commit hook

Husky runs `npm test` on every commit. Fix failures before committing — do not skip the hook.

<!-- ndv:start -->
# neurodiveragents

This project uses the neurodiveragents fleet. When a task matches an agent domain, use the Task tool with the matching subagent_type. Pass full context in the prompt — subagents have no prior conversation history.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| PRD, epic, multi-task workload, fleet orchestration | `ndv-flow` |
| Code review, PR, code smells, quality | `ndv-review` |
| Bug, stack trace, root cause **unknown** — investigate | `ndv-diagnose` |
| Root cause **confirmed**, fix known — implement it | `ndv-build` |
| Rename, extract, restructure, modernize syntax | `ndv-refactor` |
| Generate tests, improve coverage | `ndv-tester` |
| Security vulnerabilities, OWASP, auth issues | `ndv-secure` |
| Slow code, N+1 queries, bundle size, latency | `ndv-optimize` |
| Add logging, metrics, traces, health checks | `ndv-telemetry` |
| System design, SOLID violations, architecture review | `ndv-architect` |
| Implement a spec with schemas, acceptance criteria, file targets, and architecture decided | `ndv-build` |
| Scope creep, "while we're at it", PRD boundary review, overloaded tickets | `ndv-scope` |
| Estimate review, sprint plan calibration, roadmap sanity check | `ndv-forecast` |
| KPI audit, metrics review, coverage targets, DORA metrics, OKRs | `ndv-signal` |
| Technical docs, API docs, session notes | `ndv-explain` |
| UI structure, layout decisions, visual hierarchy, design judgment | `ndv-design` → then `ndv-build` |
| WCAG auditing, ARIA violations, contrast ratios, keyboard nav, screen reader compatibility | `ndv-accessibility` |
| Codebase lookup, cross-file tracing, "where is X", "how does Y work", feature flow summaries | `ndv-research` |
| No specialist match / no clear owner / tradeoffs / direct answer / command execution | `ndv-honest` |


## Proactive Application

Apply without being asked when the signal is clear:

- Stack trace shared → apply `ndv-diagnose`
- PR or files to review → apply `ndv-review`
- "it's slow" or slow query → apply `ndv-optimize`
- "clean this up" or rename → apply `ndv-refactor`
- Code with no tests → suggest `ndv-tester`
- Story has schemas + criteria + file targets + architecture settled → apply `ndv-build`
- Add logging or observability → apply `ndv-telemetry`
- UI code, components, or design decisions → apply `ndv-design`
- UI code with interactive elements, form inputs, or color usage → apply `ndv-accessibility`
- Accessibility remediation work: classify as `a11y-only` vs `a11y+visual-risk`; route implementation to `ndv-build`, and for visual-risking changes hand off to `ndv-design` before implementation
- "where is", "how does", "trace this", "what files", "show me" about existing code → apply `ndv-research`

## Conflict Resolution (use highest-priority match)

1. Stack trace / exception / failing test / "debug" language → `ndv-diagnose` (even if the code is auth/payment)
2. Explicit vulnerability/audit/exploit language → `ndv-secure`
3. Explicit performance/latency/slow language → `ndv-optimize`
4. If still ambiguous: diagnose first with `ndv-diagnose`, then hand off
5. `ndv-honest` handles anything — it is a pure communication layer, not a router.
6. Layout/structure changes without a spec → `ndv-design` first. `ndv-build` executes specs, not decisions.

Example: "500 error + NullPointerException stack trace in login endpoint" → `ndv-diagnose`
Example: "Should we switch to pnpm?" → `ndv-honest`

## How to Apply

1. Use the Task tool with `subagent_type: ndv-<specialist>`
2. Pass full context in the prompt (task description, relevant files, error messages, goals) — subagents have no prior conversation history
3. For parallel work: spawn multiple Task calls in a single message

## Parallelism Default

All agents default to parallel execution for 4-8 independent files/items.
<!-- ndv:end -->
