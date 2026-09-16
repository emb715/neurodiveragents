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

### Validation

```bash
npm run validate
```

That is the whole merge gate, and the pre-commit hook and CI (`.github/workflows/validate.yml`) run exactly that command. It runs the full test suite (`npm test`, 14 files) and then the CSS staleness check. Authoring-guide checks are scoped to the agents changed on the branch: `scripts/validate.sh` compares against `origin/main`, or you can set `CHANGED_AGENTS="ndv-foo,ndv-bar"` yourself.

Narrower commands for iterating:

```bash
npm run validate:agents   # the 6 static agent/fixture checks — fast, no installs
npm run test:install      # install simulation only
npm run css:check         # CSS staleness only
```

### Routing eval gate (local, before every release)

Run this before merging a release PR. It calls models, costs tokens, and is **not** part of `validate`:

```bash
npm run eval:gate
```

It re-scores each model recorded in `test/fixtures/routing-baseline.json` against `test/fixtures/routing-cases.json`:

| Verdict | Meaning | Exit code |
|---|---|---|
| PASS | Canonical accuracy is at or above the baseline floor, and escalation is at or below the baseline ceiling | 0 |
| DEGRADED | Either limit is broken; the output names the new misses and escalations | 1 |
| INCONCLUSIVE | The model provider returned errors (quota, rate limit), or the fixture changed after the baseline was recorded | 2 |

Treat INCONCLUSIVE as "not checked", never as a pass.

Recording a baseline:

```bash
npm run eval:baseline                                             # 3 runs each: Opus 5, Sonnet 5, Haiku 4.5
npm run eval:baseline -- --models glm-5.3-flash                   # add a model (Ollama, needs OLLAMA_API_KEY)
```

- **The floor is the worst result across the baseline runs.** Misses are asked again (`--retries 2`, majority vote), so one unlucky answer doesn't fail a release.
- **Editing the fixture makes the baseline stale.** `validate` then fails until you re-run `eval:baseline` and commit the new baseline file.
- **Models are reached through `scripts/eval-providers/`:**
  - `claude.sh` runs the Claude CLI from an empty temp directory with no tools, no MCP servers, and a minimal system prompt. With `ANTHROPIC_API_KEY` set it also adds `--bare`, which skips hooks, plugins and your personal `CLAUDE.md`.
  - `ollama.mjs` calls Ollama's cloud API when `OLLAMA_API_KEY` is set, or a local Ollama server otherwise.

**The eval measures the routing text that ships.** The `ndv:start`/`ndv:end` block at the top of this file must be byte-identical to `NDV_BLOCK` in `bin/ndv.js`, and `validate` enforces that. Change the routing table in both places together, or the eval scores a table users never receive.

Ground truth: 52 cases covering all 18 agents, at least half of them conflict or residual cases. Each case has a `basis`:

- `canonical` (46): forced by an `anchor`, a verbatim phrase on a routing line that names the expected agent. `scripts/routing-context.mjs` supplies the same text to the validator and to the model. A canonical miss means the routing table needs fixing, or the model can't follow it.
- `judgment` (6, capped at 25%): the fixture author's own reading, with the `contest`ed alternative named. A judgment miss means review the case first.

To score a single model ad hoc, without the gate: `NDV_EVAL_CMD='<command that reads stdin>' npm run eval:routing` (supports `--tag`, `--limit`, `--retries`, `--out`).

### Test files

| File | What it tests |
|------|--------------|
| `test/validate-schema.test.js` | Structural schema for agent/human files — format contracts; runs unconditionally, no `CHANGED_AGENTS` dependency |
| `test/validate-authoring.test.js` | Authoring-guide compliance; scoped to `CHANGED_AGENTS` env var when set, else describe blocks register but produce no tests |
| `test/validate-contracts.test.js` | Architectural contract tests (ADR-008 Domain Contracts, O(n) behavioral spec regression); runs unconditionally |
| `test/validate-coherence.test.js` | Semantic coherence across agent sections — handoff targets, Mandatory Pipeline, Brief Contract all resolve to real slugs; no agent instructs reacting to elapsed wall-clock time, asking the user what to do next, or sizing work in calendar units; static, no LLM calls |
| `test/validate-routing.test.js` | Integrity of the behavioral routing fixture — every `expect` resolves, every agent is covered, the case mix stays hard enough to discriminate, canonical anchors exist in the routing text, and the committed eval baseline was recorded against this exact fixture; static, no LLM calls |
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
4. Run `npm run validate`. The pre-commit hook and CI (Node 20, ubuntu-latest) run the same command.
5. If routing changed, run `npm run eval:gate` before the next release.

### Pre-commit hook

Husky runs `npm run validate` on every commit. Fix failures before committing — do not skip the hook.

**Running from a git worktree:** husky's generated `.husky/_` directory is untracked, so the hook doesn't fire there. Run `npm run validate` by hand before pushing.
