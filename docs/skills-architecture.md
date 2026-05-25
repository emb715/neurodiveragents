# NDV Patterns Applied to Skills: Architectural Guide

## Research Context

**Date:** 2026-04-27
**Goal:** Document how neurodivergent agent patterns can be applied to skills (not just agents), and propose a test using bmad-quick-dev as the baseline.

---

## What Skills Are

Skills are the Agent Skills open standard (agentskills.io, backed by Anthropic). A skill is a directory with a `SKILL.md` entrypoint containing YAML frontmatter + markdown instructions. Skills are loaded on-demand — the description is always in context, the full body loads only when invoked.

**Key platforms supporting skills:**
- Claude Code (native, richest feature set: `context: fork`, `allowed-tools`, `agent` field, hooks, shell injection)
- OpenCode (compatible, reads `.claude/skills/`, `.opencode/skills/`, `.agents/skills/`)
- Any tool implementing the Agent Skills spec

**Spec constraints:**
- `name`: 1-64 chars, lowercase kebab-case, must match directory name
- `description`: 1-1024 chars, used for auto-invocation matching
- Body: unlimited but recommended < 500 lines; use supporting files for reference material
- Progressive disclosure: metadata (~100 tokens) → instructions (<5000 tokens) → resources (on demand)

---

## Agents vs Skills: Structural Differences

| Dimension | NDV Agent | Skill |
|-----------|-----------|-------|
| Identity | Named persona with cognitive style | Procedural instructions |
| Loading | Read file, apply patterns inline | Tool invocation, body injected as message |
| Persistence | Survives compaction (in CLAUDE.md routing) | Re-attached after compaction (first 5000 tokens, 25k combined budget) |
| Scope | Domain expertise (review, debug, optimize) | Task workflow (deploy, commit, dev cycle) |
| Composability | Handoff protocol between agents | Can reference other skills, can fork to subagents |
| State | Stateless (reads fresh each time) | Can track state via file frontmatter |
| Invocation | Implicit via routing table | Explicit `/skill-name` or auto via description match |

**The key insight:** NDV agents succeed because they encode *how to think about a domain*, not just *what steps to follow*. Skills today are almost entirely procedural — they encode workflows. The hypothesis is that injecting cognitive-style framing into skills produces better outcomes than pure procedure.

---

## The NDV Pattern Decomposition

Every NDV agent has these components:

### 1. Cognitive Identity (the "You are X" block)
A named persona with a specific processing style. Not role-play — a constraint on *how* the model approaches problems.

- **Acute** (review): "notices everything simultaneously and at full intensity"
- **Pierce** (diagnose): "tense, locked onto the problem, will not let go"
- **Honest**: "direct processing, no social filtering"
- **Just** (refactor): form sensitivity, structural incorrectness is intolerable

### 2. Primordial Rule
One non-negotiable constraint that overrides everything else. Forces a behavioral floor.

- Review: "Nothing is too minor to report"
- Diagnose: "A symptom is not a cause"
- Honest: "Minimize token usage above all else"

### 3. Perception Protocol / Workflow
How to approach the work — but framed as *how the persona naturally processes*, not as arbitrary steps.

### 4. Out of Scope + Handoff
Explicit boundaries with routing to the correct specialist. Prevents scope creep.

### 5. Output Format
Structured output that matches the cognitive style (severity-first for review, root-cause-first for diagnose).

### 6. Anti-patterns ("What X Never Does")
Explicit failure modes to avoid. Guards against common LLM drift.

---

## How NDV Patterns Map to Skills

| NDV Component | Skill Equivalent | Where It Goes |
|---------------|-----------------|---------------|
| Cognitive Identity | Skill preamble — processing style for the task | Top of SKILL.md body |
| Primordial Rule | Critical rules section | Early in body, before workflow |
| Perception Protocol | Step files / workflow sections | Supporting files |
| Out of Scope + Handoff | Scope boundaries + skill references | Body or step files |
| Output Format | Template files | `assets/` or inline |
| Anti-patterns | "Never" rules | End of body or per-step |

### Loading Mechanism (Final Architecture)

Cognitive modules are packaged as **loadable skills** in `skills/<name>/SKILL.md` with `user-invocable: false` (Claude auto-loads, not user-invocable). Step files reference them by name:

```markdown
## COGNITIVE MODULES

Load the `ndv-skeptical` skill and the `ndv-bounded` skill. Apply both throughout this step.
```

When a step file is read, the model calls the `skill` tool to load each module. The module body — pure cognitive content with no headings or metadata — enters the conversation context for the rest of the session. Subsequent steps that reference the same already-loaded module get it from context without a redundant load.

**Why skills over inline prose or file references:**
- Cross-platform compatible (any Agent Skills compliant tool)
- Progressive disclosure: description is ~100 tokens always-on; body loads only when invoked
- No path fragility: step files don't need to know where skills are installed
- Survives compaction: Claude Code re-attaches the most recent invocation of each skill (up to 5,000 tokens each, 25,000 combined budget)

**Key lifecycle fact:** A skill loaded in step-01 stays in context for the entire session. Step-03 can say "apply the loaded `ndv-precise` module" without reloading — it's already there. Only subagents with `context: fork` get a fresh context and need explicit cognitive injection via prompt text.

---

## Analysis: bmad-quick-dev

bmad-quick-dev is a 5-step development workflow skill:

1. **Clarify & Route** — intent capture, scope check, routing (one-shot vs full)
2. **Plan** — codebase investigation, spec generation from template, checkpoint
3. **Implement** — hand spec to subagent, self-check
4. **Review** — 3 adversarial subagent reviewers, finding classification, loopback
5. **Present** — review order generation, commit, editor integration

**Strengths:**
- Rigorous step-file architecture (just-in-time loading, sequential enforcement)
- State tracking via spec frontmatter
- Adversarial review with 3 independent reviewers (blind, edge-case, acceptance)
- Scope management (single-goal check, token count check, deferred work file)
- Loopback mechanism for spec-level vs code-level fixes

**Weaknesses from an NDV perspective:**
- **No cognitive framing.** Every step is pure procedure. The model has no orientation on *how to think* — only *what to do*. This means the model applies its default processing style, which is generalist and accommodating.
- **No primordial rules per phase.** The "Critical Rules" are about workflow discipline (don't skip steps, read fully), not about the cognitive task at hand.
- **No anti-patterns.** No explicit failure modes to avoid during planning, implementation, or review.
- **Clarify step lacks adversarial questioning.** The model is told "do not fantasize" but has no cognitive frame for skepticism. NDV-diagnose's "a guess is not an answer" is a much stronger constraint.
- **Implementation step is a pass-through.** "Hand to subagent and let it implement" — no cognitive guidance on *how* to implement (e.g., boundary-first, test-first, minimal-change-first).
- **Review step delegates well but classifies generically.** The classification taxonomy (intent_gap, bad_spec, patch, defer, reject) is good, but the reviewing itself relies on external skills without cognitive framing.

---

## Proposed Test: NDV-Enhanced bmad-quick-dev

### Hypothesis

Adding NDV cognitive framing to bmad-quick-dev's step files will produce:
1. Fewer loopback iterations (spec quality improves on first pass)
2. More findings in review (adversarial framing catches more issues)
3. Better scope decisions in clarify (skeptical framing prevents scope creep)
4. Cleaner implementation (intentional processing style vs default)

### Test Design

**Control:** bmad-quick-dev as-is (current version from scruffy)
**Treatment:** bmad-quick-dev with NDV cognitive injections

**Same task, same codebase, same model.** Run each 3-5 times to control for variance.

**Metrics:**
- Loopback count (step-04 iterations before passing)
- Review findings count by severity
- Spec token count (tighter = better)
- Human interventions required (HALTs triggered)
- Final code quality (external review)

### Proposed Cognitive Injections

#### Step 1 (Clarify) — Inject ndv-diagnose's skepticism
```
You approach intent capture the way a debugger approaches a stack trace.
The user's stated intent is a symptom — it may or may not be the actual need.
Do not accept the first framing. Probe for the underlying goal.
A vague intent is not an intent. Restate it precisely or keep asking.
```

#### Step 2 (Plan) — Inject ndv-architect's structural sensitivity
```
You feel structural violations physically. A spec with unclear boundaries,
mixed concerns, or implicit dependencies is not "fine for now" — it is wrong.
Every task must have a clear blast radius. If you cannot state what this
change does NOT touch, you do not understand it yet.
```

#### Step 3 (Implement) — Inject ndv-refactor's form sensitivity
```
Incorrect structure is not a style preference — it is an intolerable state.
Before writing code, verify the change follows existing patterns.
If the codebase has a pattern and you deviate from it, you must justify why.
Minimal change. No improvements outside scope. No "while I'm here" additions.
```

#### Step 4 (Review) — Inject ndv-review's sensory processing
```
Nothing is filtered as background noise. Every inconsistency is fully
registered. Classification into severity happens AFTER noticing, not during.
First everything hits. Then you sort it. A finding self-censored as
"too minor" is a perception failure.
```

#### Step 5 (Present) — Inject ndv-explain's reader modeling
```
Never assume shared context. The reviewer has not been in your head for
the last 20 minutes. The review order must model the reader's knowledge gap
and bridge it deliberately — entry point first, then expanding context.
```

### Implementation Approach

**Chosen: Fork bmad-quick-dev, use skill-load references in step files.**

Each step file says "Load the `ndv-X` skill" at the top. The model calls the skill tool, the module body enters context, and the instructions reference "the loaded `ndv-X` module" at their application points. The fork is at `research/skills-test/bmad-quick-dev-ndv/`.

---

## Broader Implications: NDV as a Skill Pattern

If the test validates the hypothesis, this suggests a general pattern:

**Any procedural skill can be enhanced by adding cognitive framing from the NDV pattern.**

This would mean:
1. NDV agents are a *library of cognitive styles*, not just agent definitions
2. Skills can import cognitive framing the way they import templates or scripts
3. The NDV project ships both agents (for agent-based tools) and cognitive modules (for skill-based tools)

### Potential NDV Skill Components

| Cognitive Module | Source Agent | Use In Skills That... |
|-----------------|-------------|----------------------|
| `ndv-skeptical` | ndv-diagnose | Gather requirements, validate assumptions |
| `ndv-structural` | ndv-architect | Plan, design, make architectural decisions |
| `ndv-precise` | ndv-refactor | Transform code, rename, restructure |
| `ndv-total-perception` | ndv-review | Review, audit, assess quality |
| `ndv-direct` | ndv-honest | Communicate results, write docs |
| `ndv-adversarial` | ndv-tester | Test, verify, validate |
| `ndv-vigilant` | ndv-secure | Handle auth, secrets, user input |
| `ndv-efficient` | ndv-optimize | Optimize, reduce waste |

These are implemented as loadable skills in `skills/<name>/SKILL.md` with `user-invocable: false`. See `humans/modules/README.md` for the full catalog and composition guide.

**Implemented modules (as skills):**
- `skills/ndv-skeptical/` — assumption-hostile requirement validation
- `skills/ndv-structural/` — structural sensitivity for planning/design
- `skills/ndv-precise/` — pattern-following implementation
- `skills/ndv-total-perception/` — unfiltered perception for review
- `skills/ndv-direct/` — zero-filler communication
- `skills/ndv-adversarial/` — adversarial testing/validation
- `skills/ndv-vigilant/` — security-aware input handling
- `skills/ndv-efficient/` — waste-intolerant implementation
- `skills/ndv-bounded/` — scope discipline
- `skills/ndv-contextual/` — reader-model-aware communication
- `skills/ndv-incremental/` — verified-step building
- `skills/ndv-temporal/` — trajectory awareness

**Source documents (human-readable originals):** `humans/modules/ndv-*.human.md` — these are the source of truth for editing; the skills are derived from them.

---

## Status

- [x] Fork bmad-quick-dev into `research/skills-test/bmad-quick-dev-ndv/`
- [x] Implement 12 cognitive modules as loadable skills in `skills/<name>/SKILL.md`
- [x] Inject cognitive modules into step files via skill-load references
- [x] Document test protocol in `research/skills-test/bmad-quick-dev-ndv/TEST-PROTOCOL.md`
- [ ] Run the actual A/B test: pick a real task in scruffy, run control vs treatment, document results in `research/skills-test/results.md`
