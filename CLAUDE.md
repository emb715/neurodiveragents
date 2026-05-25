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
| Direct answer, no filler, cross-domain judgment | `ndv-honest` (Honest) |
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
- "where is", "how does", "trace this", "what files", "show me" about existing code → apply `ndv-research`

## How to Apply

1. Read `.claude/agents/ndv-[name].md`
2. Follow its workflow, checklist, and output format
3. Execute using available tools directly

## Parallelism Default

All agents default to parallel execution for 4-8 independent files/items. Always batch independent operations in a single response.

