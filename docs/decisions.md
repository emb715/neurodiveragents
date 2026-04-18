# Architectural Decision Log

Key decisions made during fleet design. Each entry: what was decided, why, what was rejected, and what would trigger revisiting.

---

## ADR-001 — Two-file approach (model + human)

**Date:** 2026-04  
**Status:** Active

**Decision:** Agent files exist in two forms — `agents/ndv-[x].md` (model-facing) and `docs/ndv-[x].human.md` (human-facing). They are maintained separately.

**Why:** Model files and human files serve audiences with opposing needs. Models need dense, token-efficient behavioral rules. Humans need rationale, narrative, and context. Trying to serve both in one file produces a file that does neither well — too verbose for the model, too terse for the human.

**Rejected:** Single source with tagged sections (`<!-- model -->` / `<!-- human -->`). Rejected because it requires a build step to be useful, and the fleet is not stable enough to justify build tooling yet. The two-file approach is maintainable at 10 agents without automation.

**Rejected:** Human-readable model files. Rejected because human-readability in a system prompt is token waste. The model does not need narrative — it needs rules.

**Revisit when:** Fleet exceeds 15 agents, or manual sync errors become frequent, or a contributor joins who needs the build step to stay sane.

---

## ADR-002 — Model file is source of truth

**Date:** 2026-04  
**Status:** Active

**Decision:** When model file and human file diverge, the model file is correct. Human file is updated to match, never the other way.

**Why:** The model file is what actually runs. Behavior is defined there. If the human file describes behavior that doesn't match the model file, the documentation is wrong — not the agent. Inverting this would mean documentation drives implementation, which produces agents that work as documented but not as needed.

**Rejected:** Human file as source of truth (write docs first, implement second). Rejected because it produces documentation for agents that don't work yet, and the gap between the two files compounds over time.

**Revisit when:** Moving to the build step (ADR-001), at which point both derive from a single `.src.md` source.

---

## ADR-003 — Option C handoff protocol

**Date:** 2026-04  
**Status:** Active

**Decision:** All inter-agent references use `ndv-[command] (domain)` format. Example: `Handoff → ndv-diagnose (root cause): [finding]`.

**Why option C over A:** Option A (`ndv-diagnose`) is stable and actionable but provides no context for why the handoff is happening. The domain label (`root cause`) is metadata for the receiving agent — it helps the model load with the right framing without requiring it to infer the reason from the finding description alone. Zero additional cost in tokens, measurable framing benefit.

**Why not option B (domain label only):** Agent system prompts are not human-readable documents. A domain label like `[debugger]` requires the model to map label → agent, which is an unnecessary indirection when the command is directly invokable.

**Why not character names:** Character names are cosmetic and change. Two renames happened during initial development. Every rename required a fleet-wide find-and-replace. Commands are stable identifiers — they are the file names and the invocation keys.

**Revisit when:** A tool emerges that uses character names as routing keys rather than file names.

---

## ADR-004 — Personality paragraphs in model files (pending validation)

**Date:** 2026-04  
**Status:** Active — Keep (benchmark confirmed 2026-04)

**Decision (provisional):** Personality paragraphs ("You are Ward. The threat-detection system never turns off...") are included in model files alongside behavioral rules.

**Hypothesis:** A model given a character to inhabit produces more consistent, more distinctly-voiced output than a model given only rules. The neurotype framing helps the model fill gaps in situations the rules don't explicitly cover.

**Cost:** ~80-150 tokens per agent for the personality block.

**Risk:** Personality narrative may interfere with behavioral rules — the model follows the mood rather than the checklist.

**Validation:** See `personality-benchmark.md`. Run before treating this as settled.

**Result:** Benchmark run 2026-04. B scored 2.0/2.0 neurotype fidelity vs A's 1.3/2.0 (+54%). Domain accuracy identical (2.0/2.0). Scope discipline B=2.0 vs C=1.7. All three decision rule conditions met. Personality paragraphs kept. Status updated to Active.

**Status updated to:** Active — Keep. See `personality-benchmark-results.md` for full data.

---

## ADR-005 — Build step deferred

**Date:** 2026-04  
**Status:** Deferred

**Decision:** No build pipeline for generating model/human files from a single source. Manual two-file maintenance until fleet is stable.

**Why deferred:** The fleet is under active development — agent names, commands, neurotypes, and personality paragraphs are still changing. A build step at this stage would require constant changes to the build configuration itself, adding maintenance overhead without reducing it.

**Trigger to implement:** Fleet stable for ≥3 months with no agent renames or neurotype changes. Manual sync errors appearing in PRs. Team size > 1 contributor.

**Planned design:** Single `agents/src/ndv-[x].src.md` with tagged sections → build generates `agents/ndv-[x].md` and `docs/ndv-[x].human.md`. See `sync-strategy.md` for full design.

---

## ADR-006 — ndv- prefix for all agent commands

**Date:** 2026-04  
**Status:** Active

**Decision:** All agent file names, frontmatter `name:` fields, and invocation commands use the `ndv-` prefix.

**Why:** Generic names (`review`, `debug`, `test`) collide with existing project agents, tool built-ins, and common file names. The `ndv-` prefix is ownable, unique, and signals fleet membership. No other tool or framework uses this prefix.

**Why `ndv` over `neurodiveragents`:** `neurodiveragents` is the package/brand name. `ndv` is the CLI command and the prefix — short enough to type, long enough to be unique.

**Revisit when:** Another tool or package claims the `ndv-` prefix in a way that causes conflicts.

---

## ADR-007 — Agent commands describe actions, not characters

**Date:** 2026-04  
**Status:** Active

**Decision:** Agent commands are verbs/actions (`ndv-diagnose`, `ndv-explain`, `ndv-review`) not character names (`ndv-pierce`, `ndv-patient`, `ndv-acute`). Character names are metadata in the `agent:` frontmatter field only.

**Why:** A command should tell you what invoking it does, not who does it. `ndv-diagnose` tells you the action. `ndv-pierce` tells you the performer. The action is what matters at invocation time.

**Exceptions:** `ndv-honest` — the action and the character name are the same word. This is acceptable because "honest" is both a description of what you get and a name.

**Revisit when:** A character name is so well-known that it functions as an action verb (e.g., if "pierce" became synonymous with "diagnose root cause" among users).
