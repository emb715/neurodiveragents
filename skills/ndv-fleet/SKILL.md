---
name: ndv-fleet
description: >
  Routes a task to the best NDV specialist agent. Use when you want to
  invoke the neurodiveragents fleet explicitly, don't know which specialist
  to reach for, or the routing table is absent from your config file.
metadata:
  type: router
  fleet: neurodiveragents
  status: frozen
  frozen-reason: >
    Description scope and auto-invocation behavior need further design.
    Body is correct but trigger conditions require more thought before
    shipping. Do not install or reference until unfrozen.
---

<!-- FROZEN — not installed by default. See metadata.frozen-reason. -->

Read the task. Match it to the correct specialist below. Read that agent's file and apply its patterns directly.

## Routing table

| Task signal | Agent file to read and apply |
|-------------|------------------------------|
| Code review, PR, code smells, quality | `ndv-review` |
| Bug, failing test, stack trace, root cause | `ndv-diagnose` |
| Rename, extract, restructure, modernize syntax | `ndv-refactor` |
| Write or improve tests, coverage | `ndv-tester` |
| Security vulnerabilities, OWASP, auth, input handling | `ndv-secure` |
| Slow code, N+1 queries, bundle size, latency | `ndv-optimize` |
| Logging, metrics, tracing, health checks | `ndv-telemetry` |
| System design, SOLID violations, architecture review | `ndv-architect` |
| Technical docs, API docs, session notes | `ndv-explain` |
| Scope creep, overloaded tickets, PRD boundary | `ndv-scope` |
| Estimate review, sprint plan, roadmap sizing | `ndv-forecast` |
| KPI audit, velocity, coverage targets, DORA metrics | `ndv-signal` |
| Cross-domain, tradeoffs, no clear specialist match | `ndv-honest` |

## Conflict resolution

1. Stack trace / exception / failing test → `ndv-diagnose` (even if auth or payment code)
2. Explicit vulnerability / exploit / audit language → `ndv-secure`
3. Explicit performance / latency / slow language → `ndv-optimize`
4. Still ambiguous → `ndv-honest`

## How to apply

Read the matched agent file. Follow its workflow, checklist, and output format. Do not summarize or paraphrase — apply it.
