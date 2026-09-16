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
| Generate tests, improve coverage, ATDD, acceptance tests first, red tests before implementation | `ndv-tester` |
| Security vulnerabilities, OWASP, auth issues | `ndv-secure` |
| Slow code, N+1 queries, bundle size, latency | `ndv-optimize` |
| Add logging, metrics, traces, health checks | `ndv-telemetry` |
| System design, SOLID violations, architecture review | `ndv-architect` |
| Implement a spec with schemas, acceptance criteria, file targets, and architecture decided (behavioral specs additionally require scale simulation at N=1/N=10/N=100) | `ndv-build` |
| Scope creep, "while we're at it", PRD boundary review, overloaded tickets | `ndv-scope` |
| Estimate review, sprint plan calibration, roadmap sanity check | `ndv-forecast` |
| KPI audit, metrics review, coverage targets, DORA metrics, OKRs | `ndv-signal` |
| Technical docs, API docs, session notes | `ndv-explain` |
| UI structure, layout decisions, visual hierarchy, design judgment | `ndv-design` → then `ndv-build` |
| WCAG auditing, ARIA violations, contrast ratios, keyboard nav, screen reader compatibility, a11y, accessibility audit | `ndv-accessibility` |
| Codebase lookup, cross-file tracing, "where is X", "how does Y work", "does X exist", "find any reference to Z", feature flow summaries, pipeline investigation | `ndv-research` |
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
| `test/` | Test suite (14 files — see below) |
| `docs/` | Authoring guide, ADRs, manifesto |
| `skills/` | Cognitive module skills |
| `commands/` | Slash commands (OpenCode) |

### Running tests

```bash
# Full suite (all 14 test files — the npm test script)
npm test

# Agent validation only (fast, no install simulation)
npm run test:validate

# Install simulation only
npm run test:install

# Authoring-guide checks scoped to changed agents (local; CI runs unscoped)
CHANGED_AGENTS="ndv-foo,ndv-bar" node --test test/validate-authoring.test.js
```

### Routing eval (opt-in — costs tokens, not part of `npm test`)

`npm test` gates the routing fixture statically and for free. Scoring an actual
model against it is a separate, explicit step:

```bash
# Default runner is `claude -p`
npm run eval:routing

# Any command that reads a prompt on stdin and writes text to stdout works —
# this is how the fleet's cross-model claims get measured per model.
NDV_EVAL_CMD='claude -p --model claude-opus-5' npm run eval:routing
NDV_EVAL_CMD='ollama run llama3.3' npm run eval:routing -- --label llama3.3 --out /tmp/llama.json

# Narrow to the hard cases while iterating on the routing table
npm run eval:routing -- --tag conflict
```

Ground truth is `test/fixtures/routing-cases.json` (52 cases, all 18 agents
covered, >=50% conflict/residual). Each case has a `basis`:

- `canonical` (46) — forced by an `anchor`, a verbatim phrase on a routing line
  in `CLAUDE.md` that names the expected agent. The validator checks this
  against the same text the eval sends the model (`scripts/routing-context.mjs`).
  A canonical miss means fix the routing table or accept the model can't hold it.
- `judgment` (6, capped at 25%) — the fixture author's reading, with the
  `contest`ed alternative named. A judgment miss means review the case first.

The runner reports accuracy by basis, **blast-radius escalation** (share of
cases that belong to an agent which cannot reach a diff but were routed to one
that can — split into `direct` for Write/Edit and `dispatch` for `ndv-flow`,
which holds neither but can dispatch `ndv-build` unattended), a per-tag
breakdown, and a confusion matrix naming which boundaries a model fails to hold.
No thresholds are enforced yet; set them from a baseline run, not a guess.

### Test files

| File | What it tests |
|------|--------------|
| `test/validate-schema.test.js` | Structural schema for agent/human files — format contracts; runs unconditionally, no `CHANGED_AGENTS` dependency |
| `test/validate-authoring.test.js` | Authoring-guide compliance; scoped to `CHANGED_AGENTS` env var when set, else describe blocks register but produce no tests |
| `test/validate-contracts.test.js` | Architectural contract tests (ADR-008 Domain Contracts, O(n) behavioral spec regression); runs unconditionally |
| `test/validate-coherence.test.js` | Semantic coherence across agent sections — handoff targets, Mandatory Pipeline, Brief Contract all resolve to real slugs; no agent instructs reacting to elapsed wall-clock time, asking the user what to do next, or sizing work in calendar units; static, no LLM calls |
| `test/validate-routing.test.js` | Integrity of the behavioral routing fixture — every `expect` resolves, every agent is covered, the case mix stays hard enough to discriminate; static, no LLM calls |
| `test/validate-flow-protocol.test.js` | Structural gates on the orchestration protocol in `ndv-flow.md` — routing-table coverage, sentinel token consistency, handoff emit/parse grammar agreement, ledger status vocabulary, bounded BRIEF_REJECTED retry, router parity with every `CLAUDE.md` routing table (agent coverage + a declared signal list), and shipped-text parity (`CLAUDE.md`'s ndv block byte-identical to `NDV_BLOCK`; Copilot header has the same routing rows); static, no LLM calls |
| `test/install.test.js` | `bin/ndv.js` install commands — simulates claude/opencode/cursor installs in a temp dir |
| `test/install-router-skills.test.js` | Acceptance tests for router-skill auto-install behavior in `bin/ndv.js` (claude auto-install, opencode skip, cursor/copilot no skills dir) |
| `test/transform-skill.test.js` | Adversarial unit tests for `transformAgentToSkill()` purity, determinism, boundary, and degradation behavior |
| `test/transform-opencode.test.js` | Unit tests for `transformForOpenCode()` — the ndv-flow path-hint injection is gated on the exact bare filename, fails closed, and always injects the literal `<name>` placeholder |
| `test/entry-guard.test.js` | Regression test for the entry-point symlink guard — invoking `bin/ndv.js` via a symlink still runs the command dispatcher |

### Adding or changing an agent

1. Edit `agents/ndv-[name].md` (model file — source of truth)
2. Update routing in `CLAUDE.md`, `agents/ndv-flow.md`, `bin/ndv.js` (NDV_BLOCK + Copilot header), `commands/opencode/ndv-help.md`, `humans/ndv-agents.md`. The ndv block in `CLAUDE.md` and `NDV_BLOCK` must stay byte-identical.
3. Edit `humans/ndv-[name].human.md` (human file — written after model file is stable)
4. Run `npm run test:validate` locally before pushing
5. CI (`.github/workflows/ci.yml`) runs the full `npm test` suite unscoped on push/PR to main (Node 18, ubuntu-latest). The authoring tests scope to `CHANGED_AGENTS` when set, but CI does not set it — the suite runs in full.

### Pre-commit hook

Husky runs `npm test` then a CSS build staleness check on every commit. Fix failures before committing — do not skip the hook.
