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

<!-- SnapBerry: auto-generated by `snapberry init`. Do not edit this block manually. -->
<!-- To update: run `snapberry update` -->

SnapBerry is installed as a skill at `.claude/skills/snapberry/SKILL.md` (project) or `~/.claude/skills/snapberry/SKILL.md` (personal); auto-activates on code-related queries. If not loaded, invoke `/snapberry` or load the skill file directly.

# Tool routing (prefer the tool that returns the fewest tokens)

## Start
- session start / repo orientation → run_harness { planId: "SESSION_START" }
- repo not indexed → index_repo { path: "." }

## Find code
- symbol by name → search_symbols (add kind=, file_pattern= to narrow)
- string, comment, TODO, config value → search_text (regex supported; bare *.{ts,tsx} auto-promotes to any depth)
- artifact / doc / PRD / AGENTS.md section → run_harness { query: "browse artifacts", scope: "artifacts" }

## Read code
- before opening any file → read_outline first (symbol inventory, cheap)
- one symbol's source → read_symbol (symbol_id)
- multiple symbols → read_symbol (symbol_ids[]) or read_context (strategy: "bundle")
- symbol + its imports → read_context (strategy: "bundle")
- full file → read_file (last resort; use read_outline first)
- multiple files at once → read_file { targets: string[] } (max 20, dedupes shared imports)
- directory listing → read_file { target: "src/" } or list_tree

## Relationships & impact
- who calls / what calls → analyze_calls { mode: "calls" }
- file import graph → analyze_calls { mode: "imports" }
- what breaks if I change X → analyze_impact
- where is this identifier used → analyze_references
- what files import a file → analyze_references { direction: "imported_by" }
- circular dependencies → analyze_cycles
- dead code / unused symbols → analyze_dead_code

## Task assembly
- assemble full task context from a description → prepare_task { task: "..." }
- understand a symbol in context (source + imports + callers + impact) → traverse_graph { root: { kind: "symbol", symbol_id } }
- understand a file in context (outline + symbols + import graph) → traverse_graph { root: { kind: "file", file_path } }
- understand a feature/query (search → top files → connected graph) → traverse_graph { root: { kind: "query", query, max_entry_files: 5 } }
- what breaks if I change X (connected impact graph) → traverse_graph { root: { kind: "impact", symbol_id_or_file, impact_depth: 2 } }
- single symbol + its imports only (one-hop, simpler) → read_context { strategy: "bundle", symbol_id }

## Quality & health
- repo health → analyze_health
- symbol complexity / RFCs / runbooks → analyze_symbol
- hotspots (complexity × churn) → analyze_health { scope: "hotspots" }
- test coverage for a symbol → run_harness { planId: "SYMBOL_COVERAGE" }

## Docs & errors
- package documentation → query_docs
- error origin in stack trace → resolve_error { mode: "error" }
- audit agent config for stale refs → resolve_error { mode: "audit" }

## Multi-step analysis → run_harness
- 2+ tools in sequence → run_harness { query: "..." } (auto-routes) or run_harness { planId: "..." }
- planIds: SESSION_START, SYMBOL_UNDERSTAND, DELETION_SAFETY, REFACTOR_SAFETY, HEALTH_CHECK, DEPENDENCY_MAP, REPO_ORIENTATION, SYMBOL_QUALITY, USAGE_MAP, SEARCH_AND_READ, DOC_SYNC, FILE_BROWSE, EXPORT_HEALTH, CROSS_REPO_SCOPE, CODE_REVIEW, CHURN_AND_QUALITY, REPO_INVENTORY, SYMBOL_INTERACTION, SYMBOL_ACTIVITY, SYMBOL_COVERAGE, CHURN_DETAIL, SESSION_HOT, NEARBY_SYMBOLS, SESSION_STATS, FEATURE_REVIEW

## Edge
- Corrupted index / force full re-index → invalidate_index (destructive — deletes index, then re-index)
- Index remote documentation URL → fetch_url (not for local code — use query_docs for indexed docs)

## Hard rules
- Never load full files when read_symbol or read_outline answers the question.
- Every error response includes a hint — surface it as the next step.
- No re-index needed after edits — the file watcher handles it automatically.

<!-- /SnapBerry -->

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
