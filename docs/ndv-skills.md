# NDV Cognitive Modules — Skills Guide

NDV cognitive modules are loadable skills that change *how* a model thinks during a specific phase of a workflow — not what steps to follow, but the cognitive orientation it brings to the work.

A review step that says "check for issues" produces different results from one that loads `ndv-total-perception` — which registers everything simultaneously before sorting by severity, and treats self-censored findings as perception failures. Same step, different cognitive frame, different output.

---

## Install

Requires Claude Code or OpenCode (any Agent Skills-compatible tool).

```bash
# Project install — modules available in this project only
npx neurodiveragents install-skills claude
npx neurodiveragents install-skills opencode

# Global install — modules available in every project
npx neurodiveragents install-skills claude --global
npx neurodiveragents install-skills opencode --global
```

The installer opens an arrow-key multiselect TUI — all modules pre-selected, space to deselect individual ones. For non-interactive use (CI, scripts, quickstart):

```bash
npx neurodiveragents install-skills claude --all
npx neurodiveragents install-skills opencode --all
```

**Installed locations:**

| Tool | Project | Global |
|------|---------|--------|
| Claude Code | `.claude/skills/ndv-*/` | `~/.claude/skills/ndv-*/` |
| OpenCode | `.opencode/skills/ndv-*/` | `~/.config/opencode/skills/` |

Cursor and GitHub Copilot do not implement the Agent Skills spec — modules are not supported on those platforms.

---

## How to use in a skill

Add a `## COGNITIVE MODULES` section at the top of any skill step file and tell the model which modules to load:

```markdown
## COGNITIVE MODULES

Load the `ndv-skeptical` skill and the `ndv-bounded` skill. Apply both throughout this step.
```

When the step file is read, the model calls the skill tool and loads each module. The module body enters context and stays active for the rest of the session. Subsequent steps can reference the already-loaded module without reloading it.

For inline application points in the step instructions, reference the loaded module by name:

```markdown
**Apply the loaded `ndv-structural` module here.**
```

### Sub-agents

Sub-agents with `context: fork` start with a fresh context — they don't inherit loaded skills from the parent session. For those, extract the core directive from the module and inject it as text in the sub-agent prompt:

```markdown
Invoke via `bmad-review-adversarial-general`. Inject into the sub-agent prompt:
"You notice everything simultaneously. Nothing is filtered as background noise.
Classification into severity happens after noticing, not during."
```

---

## Module catalog

12 modules across two origin types.

### Agent-derived (11)

Extracted directly from an NDV agent's cognitive core — the thinking style without the operational machinery.

| Module | Source | Cognitive constraint | Use when... |
|--------|--------|---------------------|-------------|
| `ndv-skeptical` | Pierce (diagnose) | Stated intent is a symptom. Probe for the underlying goal. Do not proceed on unverified assumptions. | Gathering requirements, validating intent |
| `ndv-structural` | Arc (architect) | Every structural decision traces to a principle. Unclear blast radius = incomplete plan. | Planning, design, spec generation |
| `ndv-precise` | Just (refactor) | Follow existing patterns. Deviation requires justification. Minimal change, no scope creep. | Writing or transforming code |
| `ndv-total-perception` | Acute (review) | Everything registers simultaneously. Classify after noticing, never during. Self-censoring a finding is a failure. | Review, audit, quality assessment |
| `ndv-adversarial` | Edge (tester) | The happy path is an alibi. Code is guilty until proven innocent. Test every boundary condition. | Testing, validation, verification |
| `ndv-vigilant` | Ward (secure) | Every input is hostile until validated. Trust no client-side check. | Auth, user input, trust boundaries |
| `ndv-efficient` | Lean (optimize) | Waste is intolerable. Measure before optimizing. No N+1, no SELECT *, no sequential when parallel is safe. | Implementation, queries, asset handling |
| `ndv-direct` | Honest | Every word must earn its place. No preamble, no filler, no restating what's known. | Presenting results, writing summaries |
| `ndv-contextual` | Patient (explain) | The next reader does not share your context. Model the knowledge gap before writing. Lead with the entry point. | Presenting, specs, handoffs |
| `ndv-bounded` | Bound (scope) | Scope is a wall, not a suggestion. "While I'm here" is the most expensive phrase in software. Every deliverable needs a stated exclusion or the scope is not defined. | Scope decisions, mid-task discipline |
| `ndv-temporal` | Arc (architect) | Current state is a data point. Direction is the assessment. Append trajectory to every finding: Stable / Improving / Degrading / Aging. Applies Lindy durability and hype cycle position to dependency and technology decisions. | Architecture reviews, dependency audits, tech selection |

### Emergent (1)

Not derived from any single agent. A pattern that emerged from observing how multiple NDV agents work.

| Module | Synthesized from | Cognitive constraint | Use when... |
|--------|-----------------|---------------------|-------------|
| `ndv-incremental` | refactor + optimize + build + architect | Never build on unverified ground. One logical change, verified, then next. | Multi-step implementation |

---

## Composition

Keep it to 2–3 modules per phase. More dilutes the signal — the model balances competing frames instead of fully adopting one.

| Phase | Load |
|-------|------|
| Requirements / Clarify | `ndv-skeptical` + `ndv-bounded` |
| Plan / Design | `ndv-structural` + `ndv-bounded` |
| Implement | `ndv-precise` + `ndv-incremental` + `ndv-efficient` |
| Review / Audit | `ndv-total-perception` + `ndv-adversarial` |
| Present / Handoff | `ndv-contextual` + `ndv-direct` |
| Any phase touching auth/input | + `ndv-vigilant` |
| Architecture / dependency decisions | + `ndv-temporal` |

---

## Lifecycle

A module loaded in step 1 stays in context for the entire session — the body enters context once and persists. Claude Code re-attaches modules after auto-compaction.

Modules are small by design — each body is ~30–40 lines. The combined budget is not a concern for typical workflows.

---

## Relationship to agents

The NDV agents (`ndv-review`, `ndv-diagnose`, etc.) are the full vehicle — cognitive core plus output format, handoff protocol, domain-specific guidance, and tool permissions.

Modules are the engine extracted. Same cognitive content, packaged for injection into any workflow you already own. Use agents when you want a specialist. Use modules when you want to bring a cognitive style into a step of your own workflow.
