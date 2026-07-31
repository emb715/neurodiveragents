# Token Efficiency Patterns

Why the fleet's architecture and agent wiring are built the way they are. This document covers two layers:

- **System-level** — how the orchestrator + specialist delegation model saves tokens by architectural design, not just context hygiene.
- **Agent-level** — operational rules inside each agent that prevent wasted reads, redundant investigation, and verbatim re-emission.

The agent model files deliberately omit the "why"; this is the human-readable record behind both layers.

---

## System-level — delegation as a token architecture

### Thesis

An orchestrator (`ndv-flow`) that decomposes, routes, and conducts — but never implements — is a token-saving architecture, not merely a context-quality one. The fleet's inter-agent protocol is engineered so that the orchestrator's context grows by summaries, not by file contents, reasoning traces, or debug tangents. Each subagent's context is scoped to its task and resets between tasks. Total-system tokens can exceed a single monolithic agent on trivial work, but for any non-trivial session the monolithic alternative accumulates every read, every tangent, and every dead end *permanently across every subsequent turn*. The fleet pays bounded subagent cost; the monolith pays unbounded growing-tail cost.

### The five mechanisms

Each mechanism is a structural constraint on the bridge between orchestrator and subagents. None is incidental.

1. **Sentinel discipline** — subagents return 3-5 bullets, max 200 words, plus structured handoff lines. The orchestrator never ingests full subagent output into its own context. The return payload is capped by spec, not by goodwill.
   - *Enforced in:* `ndv-flow` Dispatch Protocol, Brief template, Post-Execution.

2. **Context slicing** — forward passthrough to a downstream subagent is sliced to what that task actually consumes, not the full prior output. A 15-finding review passed to an agent fixing 2 files is context inflation; the protocol forbids it. The bridge forward is minimized by rule, not by judgment.
   - *Enforced in:* `ndv-flow` Dispatch Protocol, "Context slicing — mandatory for all context passthrough."

3. **Brief Contract** — each subagent receives a structured minimal brief built from the target agent's contract section, not conversation history. No full-context replay per dispatch. The subagent starts scoped, not reconstructed.
   - *Enforced in:* `ndv-flow` Dispatch Protocol, "Brief authoring — mandatory before every prompt."

4. **Iterative task rule** — a decision rule derived in iteration 1 is carried forward verbatim. The brief for iteration N states the rule; it does not re-derive it. No fresh investigation for resolved patterns.
   - *Enforced in:* `ndv-flow` Dispatch Protocol, "Iterative task rule."

5. **Batching** — multiple non-blocking handoffs to the same agent merge into one dispatch per group. No one-per-line inflation. The orchestrator's routing surface stays proportional to *agents*, not to *findings*.
   - *Enforced in:* `ndv-flow` Post-Group Protocol, step 5.

A sixth structural fact compounds these: **Flow's toolset is Read/Glob/Task only.** It cannot accumulate implementation context because it cannot implement. Its context grows by summaries and routing reasoning, not by file contents or debug logs. The toolset boundary is a token boundary.

### Why prompt caching narrows but does not close the gap

Prompt caching makes repeated prefixes cheap on subsequent calls. In a monolithic single-agent session, the cached prefix is nearly free on repeat — but caching does nothing for the *growing uncached tail*. Every new turn, tool call, and intermediate result accumulates and is billed fresh on each subsequent call. A 40-turn monolithic session has a large tail growing every turn. The fleet's main thread grows only by 200-word summaries plus routing reasoning; subagent tails are small and reset between tasks. Caching narrows the gap on the *static* portion but cannot close it on the *growing* portion. The architecture wins on exactly the dimension caching doesn't cover.

### When it wins, when it doesn't

**Wins:** tasks with high exploration-to-output ratio — research, diagnosis, review. The bulk of reads and tangents is discarded; only the synthesis returns to the orchestrator. Multi-domain workloads (security + performance + review in parallel). Artifact digestion (PRD → task graph → fleet execution).

**Doesn't win:** tightly-coupled sequential work where each step needs the prior step's full detail. If the bridge context to the next subagent must contain the prior subagent's complete output to be useful, slicing cannot reduce it, and the forward bridge cost approaches what a single agent would have held anyway. For linear implementation with shared state across steps, a single agent is often cheaper end-to-end.

The honest boundary: the architecture is a token-saving architecture *for work that decomposes with clean handoff surfaces*. It is not a universal optimization. For work that doesn't decompose, the fleet still works — it just stops being the cheaper option.

### Mechanism locations (traceable, not asserted)

| Mechanism | Enforced in |
|---|---|
| Sentinel discipline | `ndv-flow.md` — Dispatch Protocol, Brief template, Post-Execution |
| Context slicing | `ndv-flow.md` — Dispatch Protocol, "Context slicing" subsection |
| Brief Contract | `ndv-flow.md` — Dispatch Protocol, "Brief authoring" |
| Iterative task rule | `ndv-flow.md` — Dispatch Protocol, "Iterative task rule" |
| Batching | `ndv-flow.md` — Post-Group Protocol, step 5 |
| Toolset boundary | `ndv-flow.md` — frontmatter `tools: [Read, Glob, Task]` |

---

## Agent-level — execution discipline

### Where these came from

A high-cost orchestration session was analyzed after the fact. The session spanned multiple goals across the full agent pipeline — research, implementation, verification, refactoring, conflict resolution, and debugging.

Six cost patterns emerged. Each one had a structural cause — not bad prompting, not wrong agent selection, but missing rules that the fleet had no way to enforce.

---

## Pattern 1 — The 3× read cycle

**What happened:** A scout task read a set of files and returned findings. A build task was dispatched to act on those findings. The build agent re-read the same files to understand context before acting. A verify agent was dispatched after. It re-read the same files again to confirm correctness. Five files touched by one goal were each read three times.

**Why it happened:** The dispatch prompt template gave no mechanism for passing file content forward. Each agent started fresh, with only a task description and a file list. Re-reading was the only way to get context.

**What changed:**
- `ndv-flow`: the dispatch prompt template now includes a `CONTEXT PASSTHROUGH` block. When a prior research task in the same group returned file content, Flow embeds it verbatim in the downstream brief.
- `ndv-build` and `ndv-review`: if file content is present in the brief, treat it as authoritative. Re-read only if a write has occurred since that content was captured.

**The rule:** one read per file per write boundary. Not one read per agent.

---

## Pattern 2 — Low signal-density scans

**What happened:** A comment cleanup task needed to find stale or misleading comments across a large set of changed files. Both research and refactor agents read every file completely. The finding rate was low — most reads produced nothing. Token spend was proportional to file count, not finding count.

**Why it happened:** "Grep before reading" was already in ndv-research's protocol, but there was no explicit skip rule. The instruction narrowed the surface — it didn't eliminate zero-hit files from the read queue.

**What changed:**
- `ndv-research`: zero grep hits for the target pattern = file confirmed clean. Do not read it. Report it as "CLEAN — confirmed by search."
- `ndv-review`: same rule, scoped to pattern-detection tasks (comment audits, stale reference sweeps, naming violations). Structural reviews still justify full reads regardless of grep results — understanding architecture requires holding the whole file.

**The rule:** grep result is sufficient evidence of cleanliness. A full read adds no information a zero-hit grep didn't already provide.

---

## Pattern 3 — Self-describing errors dispatching unnecessary investigations

**What happened:** During local dev environment debugging, multiple runtime errors appeared sequentially. Each triggered a fresh scout investigation reading several source files. Several of those errors were configuration gaps — missing environment variables, missing database rows, wrong connection string — that the error message described completely. The file reads arrived at the same answer the error message already contained.

**Why it happened:** ndv-diagnose had no triage step. The Hyperfocus Protocol fired unconditionally. Every error was treated as requiring investigation regardless of whether the message was self-explanatory.

**What changed:**
- `ndv-diagnose`: a new `## Error Triage` section runs before Hyperfocus Protocol. Three classes: (A) self-describing config gap — fix it directly, no file read; (B) ambiguous — read only the one defining file; (C) unknown — full protocol.

**The rule:** classify the error from its message before opening any file. Most config errors are class A. The message already described the problem.

---

## Pattern 4 — Verbatim copy as read-then-write

**What happened:** A type extraction task moved symbols from one package to another to break a circular dependency. The build agent read several source files completely, then wrote their full content to new destination files. At least one file was several hundred lines. It was read once, then written in full to a new location with zero logic changes.

**Why it happened:** No rule distinguished "move without changes" from "implement with changes." The default behavior — read the file, write the new file — is correct for implementation tasks. It is wasteful for pure moves.

**What changed:**
- `ndv-build`: when moving code to a new location without logic changes, prefer filesystem-level move operations over read-then-write. Read only the specific symbols being moved if a new file must be constructed. Never read and re-emit a large file verbatim unless every line is being modified.
- `ndv-refactor`: same rule in Transformation Type 5 (Structural reorganization). When splitting large files, read only the symbols being extracted.

**The rule:** a move is not an implementation. Filesystem operations are cheaper than read-then-write for content that isn't changing.

---

## Pattern 5 — Iterative tasks without shared context

**What happened:** A large rebase produced recurring conflict patterns. Generated files conflicted repeatedly across many commits — each requiring the same resolution: take ours. Each conflict triggered a fresh context load. The decision rule was re-derived per instance instead of once.

**Why it happened:** The dispatch protocol had no concept of an iterative task — one where the same decision rule applies across many instances. Each instance was treated as an independent task.

**What changed:**
- `ndv-flow`: the iterative task rule. For operations that repeat the same decision across multiple instances, the rule is established in the first iteration and carried forward explicitly. The brief for iteration N states the rule; it does not re-derive it.

**The rule:** derive once, apply many. A decision rule confirmed on instance 1 does not need re-confirmation on instance 8.

---

## Pattern 6 — Verification as full re-read

**What happened:** After each fix cycle in the CI repair task, a verify pass read all modified files again to confirm correctness. For additive-only changes — adding fields to stubs, fixing imports — the re-read confirmed what the type checker had already confirmed. The file content added no information the tool output didn't already provide.

**Why it happened:** No distinction existed between verification of structural changes (where re-reading is justified — logic changed, tool checks may not catch all failure modes) and verification of additive changes (where tool output is sufficient).

**What changed:**
- `ndv-build`: verification proportionality rule. For additive-only changes, type check pass + test suite green is sufficient. Full file re-reads post-write are only justified when the change was structural and the tool check cannot catch the specific failure mode.

**The rule:** verification scope should match change scope, not file count.

---

## What was not changed

**ndv-review's Mandatory Pipeline role.** The review gate after Tier 1 agent output was not weakened. Proportionality applies to file re-reads within verification, not to whether review runs at all. A review that consumes context from the brief rather than re-reading files is still a full review — it just doesn't pay the re-read cost.

**Scout's map-first principle.** The grep-skip rule applies to pattern-detection tasks with a known target pattern. It does not apply when the task is structural exploration — understanding architecture, tracing dependency chains, mapping a codebase. Those require full reads regardless of what grep returns, because the purpose is map-building, not pattern-finding.

**ndv-diagnose's Hyperfocus Protocol.** The triage classifier is a pre-filter, not a replacement. Class B and C errors still run the full protocol. The change only prevents the protocol from firing on errors that were already self-explanatory.

---

## The underlying principle

Every token spent re-reading content that hasn't changed, re-deriving a rule that was already established, or investigating an error that described its own fix — is a token that produced no new information. The fleet's agents are built around cognitive styles that make them excellent at their domains. These efficiency rules are the structural complement: they prevent the fleet from paying full investigation cost for problems that don't require investigation.

The rules are embedded in the agent files, not in a shared config, because each rule is domain-specific. The grep-skip rule in ndv-research has a different exception profile than the same rule in ndv-review. The re-read rule in ndv-build has a different trigger condition than in ndv-review. Centralizing them would require each agent to import knowledge from a shared doc — which is exactly the architecture ADR-008 rejected.
