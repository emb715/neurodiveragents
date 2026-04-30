# NDV Cognitive Modules

Reusable cognitive processing styles distributed as skills. These are **not agents** — they are composable fragments that any skill can load to shape *how* the model thinks during a specific phase.

## Install

```bash
# Project install
npx neurodiveragents install-skills claude
npx neurodiveragents install-skills opencode

# Global install
npx neurodiveragents install-skills claude --global
npx neurodiveragents install-skills opencode --global
```

The installer prompts for module selection — pick specific modules or install all. See [docs/ndv-skills.md](../docs/ndv-skills.md) for the full user guide.

## Why Modules Exist

Skills encode *what to do*. Modules encode *how to think while doing it*. A planning step that says "investigate the codebase" produces different results when the model approaches it with structural sensitivity (ndv-structural) versus its default generalist processing.

## Architecture

Modules are Agent Skills-compatible (`skills/<name>/SKILL.md`). They use:
- **Frontmatter** for all metadata (source agent, type, origin) — never loaded into model context
- **`user-invocable: false`** — hidden from `/` menu, loaded only when another skill requests it
- **`metadata.type: cognitive-module`** — distinguishes from regular skills programmatically

### Loading from a skill step file

```markdown
## COGNITIVE MODULE

Load the `ndv-skeptical` and `ndv-bounded` skills before proceeding.
```

The model calls the skill tool. The body injects. No file paths, no relative path fragility.

## Available Modules

### Agent-derived (9)

Extracted directly from an NDV agent's cognitive core — the thinking style without the operational machinery.

| Module | Source Agent | Cognitive Style | Use When... |
|--------|-------------|-----------------|-------------|
| `ndv-skeptical` | Pierce (diagnose) | Assumption-hostile, probe-until-precise | Gathering requirements, validating intent |
| `ndv-structural` | Arc (architect) | Structural sensitivity, dependency-aware | Planning, designing, structural decisions |
| `ndv-precise` | Just (refactor) | Pattern-following, minimal-change | Writing or transforming code |
| `ndv-total-perception` | Acute (review) | Everything registers, severity-after-noticing | Reviewing, auditing, quality assessment |
| `ndv-direct` | Honest | Zero filler, accuracy over comfort | Presenting results, writing summaries |
| `ndv-adversarial` | Edge (tester) | Assumes code is lying, boundary-obsessed | Testing, validation, verification |
| `ndv-vigilant` | Ward (secure) | Threat-detection always on, trust nothing | User input, auth, trust boundaries |
| `ndv-efficient` | Lean (optimize) | Waste is intolerable, measure first | Implementation, queries, asset handling |
| `ndv-contextual` | Patient (explain) | Models the reader's knowledge gap | Presenting, specs for others, handoffs |

### Emergent (4)

Not derived from any single agent. Patterns that emerged from observing how all NDV agents work — cognitive capabilities no single specialist owns but every workflow needs.

| Module | Synthesized From | Cognitive Style | Use When... |
|--------|-----------------|-----------------|-------------|
| `ndv-bounded` | All agents' out-of-scope sections | Scope as a wall, not a suggestion | Scope decisions, mid-task discipline |
| `ndv-incremental` | refactor + optimize + tester | Build on verified ground only | Multi-step implementation |
| `ndv-parallel-safe` | ndv-build (merge surface protocol) | Adversarial toward assumed parallelism | Any phase with parallel file writes |
| `ndv-temporal` | Lehman's Laws, Lindy, Hype Cycle | Trajectory over snapshot | Architecture reviews, dependency audits, tech selection |

## Module Structure

Every module follows the same body format:

```
[Cognitive frame — 2-3 sentences establishing processing style]

**Primordial rule:** [One non-negotiable constraint]

**Constraints:**
- [Specific behaviors to adopt]

**Never:**
- [Explicit failure modes to avoid]
```

No headings, no metadata prose. Pure cognitive content. All routing information lives in frontmatter.

## Composition

Modules can be combined per phase. Keep it to 2-3 per phase — more dilutes the signal.

| Phase Type | Recommended Modules |
|-----------|-------------------|
| Requirements / Clarify | ndv-skeptical + ndv-bounded |
| Plan / Design | ndv-structural + ndv-bounded |
| Implement | ndv-precise + ndv-incremental + ndv-efficient |
| Parallel implementation | + ndv-parallel-safe (add when ≥2 streams write files simultaneously) |
| Review / Audit | ndv-total-perception + ndv-adversarial |
| Present / Handoff | ndv-contextual + ndv-direct |
| Security-sensitive | + ndv-vigilant (add to any phase touching auth/input) |
| Long-lived systems | + ndv-temporal (add to architecture/dependency decisions) |

## Relationship to Agents

Agents = full personas with tools, output formats, handoff protocols, and domain-specific guidance.
Modules = distilled cognitive cores. The *thinking style* without the operational machinery.

An agent uses its cognitive style for everything it does. A module injects that style into one phase of a larger workflow. Same engine, different vehicle.

## Files in this directory

The `.human.md` files here are the **source documents** — full format with headings and prose context, intended for human reading and editing. The loadable skills in `skills/ndv-*/SKILL.md` are derived from these: metadata moved to frontmatter, body stripped to pure cognitive content the model reads. Edit the `.human.md` source, then propagate changes to the corresponding skill.
