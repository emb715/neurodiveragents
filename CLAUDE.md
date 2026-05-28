# neurodiveragents

This project uses the neurodiveragents fleet. Each agent embodies a distinct cognitive style that makes it exceptionally effective in its domain. When a task matches an agent's domain, read the agent file and apply its patterns directly. Do not use the Task tool unless explicitly asked.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| PRD, epic, multi-task workload, fleet orchestration | `ndv-flow` (Flow) |
| Code review, PR, code smells, quality | `ndv-review` (Acute) |
| Bug, failing test, root cause, stack trace | `ndv-diagnose` (Pierce) |
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
| UI, UX, visual hierarchy, design judgment, component review | `ndv-design` (Pixel) |
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
2. Update routing in `CLAUDE.md`, `agents/ndv-flow.md`, `humans/ndv-agents.md`
3. Edit `humans/ndv-[name].human.md` (human file — written after model file is stable)
4. Run `npm run test:validate` locally before pushing
5. CI runs authoring-guide checks automatically via `CHANGED_AGENTS`

### Pre-commit hook

Husky runs `npm test` on every commit. Fix failures before committing — do not skip the hook.
