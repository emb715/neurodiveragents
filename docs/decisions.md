# Architectural Decision Log

Key decisions made during fleet design. Each entry: what was decided, why, what was rejected, and what would trigger revisiting.

---

## ADR-001 — Two-file approach (model + human)

**Date:** 2026-04  
**Status:** Active

**Decision:** Agent files exist in two forms — `agents/ndv-[x].md` (model-facing) and `humans/ndv-[x].human.md` (human-facing). They are maintained separately.

**Why:** Model files and human files serve audiences with opposing needs. Models need dense, token-efficient behavioral rules. Humans need rationale, narrative, and context. Trying to serve both in one file produces a file that does neither well — too verbose for the model, too terse for the human.

**Rejected:** Single source with tagged sections (`<!-- model -->` / `<!-- human -->`). Rejected because it requires a build step to be useful, and the fleet is not stable enough to justify build tooling yet. The two-file approach is maintainable at 10 agents without automation.

**Rejected:** Human-readable model files. Rejected because human-readability in a system prompt is token waste. The model does not need narrative — it needs rules.

**Constraints on model files (derived from this decision):**
- No file references of any kind — no markdown links, no relative paths, no filenames. Model files are loaded as system prompts; the referenced paths do not exist in the model's context.
- No skill references of any kind — agents do not consume skills. Skills are extracted from agent behavior; the relationship is strictly one-directional. An agent already embodies its cognitive style natively. If behavior is required, it is expressed directly in the model file, not delegated to a skill the user may not have installed.

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

**Planned design:** Single `agents/src/ndv-[x].src.md` with tagged sections → build generates `agents/ndv-[x].md` and `humans/ndv-[x].human.md`. See `sync-strategy.md` for full design.

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

---

## ADR-008 — Domain Contracts: Brief Contract and Mandatory Pipeline sections

**Date:** 2026-05-30  
**Status:** Active

---

### Context

A behavioral spec describing a multi-step scan procedure was dispatched to ndv-build. The
procedure was implemented correctly — it matched the spec exactly. No agent in the dispatch
chain had the domain knowledge or the mandate to recognize the spec itself as wrong before
implementation began. The O(n) defect was in the procedure description, not the implementation.

Root cause analysis surfaced two structural gaps:

1. **Flow writes prompts for specialists it has no domain knowledge about.** The dispatch
   prompt template (task + scope + one context sentence) is structurally correct but
   domain-blind. A brief that describes an O(n) procedure reaches ndv-build looking complete.
   ndv-build implements it. The defect was in the brief, not the implementation.

2. **Flow does not enforce a post-build pipeline.** ndv-build emits `Handoff → ndv-review`
   and `Handoff → ndv-tester` already — but Flow classifies these as non-blocking by default.
   Non-trivial implementations complete in Flow's ledger while review and tests have not run.

The attempted fix — adding a Procedure Defect Vocabulary to ndv-flow.md — was recognized as
wrong architecture: domain knowledge about what ndv-review should check does not belong in
Flow. It belongs in ndv-review. Flow was accumulating specialist knowledge it should not own,
violating Dependency Inversion.

---

### Decision

Each agent file gains up to two new optional sections, written by the agent's author,
consumed by Flow at dispatch time:

**`## Brief Contract`** — what a well-formed brief from Flow must include for this agent
to produce correct, domain-sound output. Written as 3–5 bullet points. Flow reads this
section before authoring the dispatch prompt and uses it to fill the template correctly.

**`## Mandatory Pipeline`** — what agents must run after this agent's output on non-trivial
tasks. Written as a named list with the definition of "non-trivial" for this agent's domain.
Flow reads this section after a group completes and classifies listed agents as **blocking**,
not non-blocking, before the next group dispatches.

Flow does not accumulate domain knowledge. It reads contracts that specialists declare about
themselves. When a new specialist is added, it writes its own contracts. Flow's file does
not change.

---

### Agent Classification

Not every agent needs both sections. The classification below is the authoritative record.

#### Tier 1 — Brief Contract + Mandatory Pipeline (both required)

These agents produce artifacts that change the codebase and whose output quality depends
heavily on brief quality. Non-trivial output from these agents must always trigger downstream review.

| Agent | Brief Contract needed because | Mandatory Pipeline declares |
|-------|------------------------------|----------------------------|
| `ndv-build` | Brief quality determines whether the implementation is domain-correct. An O(n) procedure in the brief produces an O(n) implementation — build cannot catch what it was told to build. | `ndv-review` (blocking, all non-trivial output) → `ndv-tester` (blocking, any new behavior) |
| `ndv-refactor` | Refactoring scope must be explicit — what to transform, what invariants to preserve, what must not change. An underspecified brief produces over-reach. | `ndv-review` (blocking, all non-trivial output) |
| `ndv-optimize` | Optimization requires a baseline measurement and a target. A brief without both produces unmeasured changes that may introduce regressions. | `ndv-review` (blocking, all non-trivial output) → `ndv-tester` (blocking, when behavior could change) |
| `ndv-telemetry` | Instrumentation must name what to observe and what not to touch. An underspecified brief risks behavioral changes disguised as observability additions. | `ndv-review` (blocking, all non-trivial output) |

#### Tier 2 — Brief Contract only (no Mandatory Pipeline)

These agents produce findings, reports, or read-only output. Their output quality depends
on brief quality, but their output does not itself require a downstream review gate — it
is the gate.

| Agent | Brief Contract needed because |
|-------|------------------------------|
| `ndv-review` | Review quality is entirely brief-dependent. Without knowing what class of defects to look for, review produces generic findings and misses domain-specific issues (algorithmic correctness, scale behavior, behavioral spec violations). The brief must name the defect classes relevant to what was produced. |
| `ndv-architect` | Structural assessment requires knowing what constraints already exist and what decisions are open vs. settled. A brief that omits existing constraints produces recommendations that conflict with prior decisions. |
| `ndv-secure` | Security audit scope must be explicit — which trust boundaries, which input surfaces, which threat model. An underspecified brief produces a generic OWASP pass that misses context-specific threats. |
| `ndv-tester` | Test generation requires knowing what constitutes correctness for this domain. A brief without acceptance criteria or behavioral spec produces tests that cover the wrong surface. |
| `ndv-diagnose` | Root cause investigation requires the symptom, the reproduction steps, and the observable wrong behavior. A brief with only "it's broken" forces the agent to search the entire codebase instead of tracing a known signal. |
| `ndv-accessibility` | Accessibility audit scope must name the user populations, the interaction surfaces, and the WCAG level. An underspecified brief produces a mechanical checklist pass that misses UX-level exclusion. |
| `ndv-design` | Design review requires knowing the user context, the design system constraints, and what has already been decided. A brief that omits constraints produces recommendations that conflict with existing patterns. |

#### Tier 3 — Neither section needed

These agents are advisory, investigative, or communicative. The classification criterion
is precise: brief quality does not materially affect whether these agents produce
**domain-correct** output. A thin brief produces thinner output (less context = less
depth) but not *wrong* output — their domain laws cannot be violated by an underspecified
brief the way a behavioral spec can be implemented O(n) because the brief said to.
They also produce no codebase artifacts, so no downstream review gate is needed.

| Agent | Rationale |
|-------|-----------|
| `ndv-research` | Investigative only. Output is a findings map, not an artifact. No downstream gate needed. |
| `ndv-explain` | Documentation output. Quality is self-contained. No downstream gate. |
| `ndv-scope` | Boundary enforcement. Output is a scope assessment. No artifact, no gate needed. |
| `ndv-forecast` | Estimation review. Output is a calibration report. No artifact, no gate needed. |
| `ndv-signal` | Metrics audit. Output is an analysis. No artifact, no gate needed. |
| `ndv-flow` | Orchestrator. Does not produce domain artifacts. |
| `ndv-honest` | Residual communication layer. No domain, no contracts, no gate. |

---

### What Flow Does With These Sections

**At dispatch time — brief authoring:**
1. Flow reads the target agent's **full file** — protocols, domain laws, cognitive style
2. Flow uses the `## Brief Contract` section as a **completion checklist** — every bullet must be satisfied before the brief is sent
3. If no `## Brief Contract` section exists (Tier 3 agents): use the generic template as-is
4. A brief authored without reading the agent file is not a brief — it is a guess dressed as an instruction

**On BRIEF_REJECTED:**
- First rejection: Flow extracts the missing field, self-resolves from codebase/spec, re-briefs
- Second rejection: Flow **stops and surfaces to the human immediately** with the rejection reason, what is needed, a specific clarifying question, and the list of dependent tasks blocked. Waits for human input before re-briefing a third and final time
- Third rejection: task marked incomplete, non-dependent tasks continue

**After group completion — Mandatory Pipeline:**
1. For each completed Tier 1 agent, Flow reads its `## Mandatory Pipeline` section
2. Agents listed there are classified as **blocking** — they dispatch before the next group, overriding the default non-blocking classification
3. "Non-trivial" is defined per agent in that section — Flow reads and applies it
4. If no `## Mandatory Pipeline` section exists (Tier 2 and Tier 3 agents): existing handoff classification logic applies unchanged

---

### What Was Rejected

**Option A: Teach Flow the software laws directly.**
Rejected. This makes Flow a god module that accumulates domain knowledge from every
specialist. As the fleet grows, Flow's file grows. Every new defect class discovered
requires editing Flow. The dependency points the wrong direction.

**Option B: Mandatory Arc → Build pipeline for all specs.**
Rejected as YAGNI. Adds latency to every implementation task, including trivial ones.
Arc is not a universal pre-build gate — it is a structural advisor consulted when
architectural decisions are open. The Spec Readiness Contract (ADR-008a, below) handles
the pre-build gate correctly without mandating Arc for all cases.

**Option C: ndv-flow reads only the Brief Contract section — accepted with modification.**
Initially bounded: read Brief Contract section only, not the full agent file. Subsequently
revised: Flow reads the full agent file to author the brief (understanding protocols, domain
laws, cognitive style), then uses the Brief Contract section as a completion checklist.
Rationale: Brief Contract as sole knowledge source is a hand-maintained abstraction that
drifts from agent behavior as agents evolve. The full file is the authoritative spec. At
18 agents and ~200 tokens per file, the cost is acceptable. Revisit if fleet exceeds 30
agents and per-dispatch read cost becomes meaningful.

---


---

### Self-Validation Protocol (implemented after initial ADR)

Every Tier 1 and Tier 2 agent has a `## Self-Validation Protocol` section added after
its `## Brief Contract`. This is the agent-side complement to Flow's brief authoring —
defense in depth.

Two-layer check, run before any work begins:

**Layer 1 — Completeness:** every Brief Contract field present and actionable. If any
field is missing or too vague: `BRIEF_REJECTED: [field] — [what is needed]`.

**Layer 2 — Domain soundness:** the agent applies its own cognitive laws to what it
received. This catches defects that completeness alone cannot:
- ndv-build: O(n) behavioral spec without scale validation evidence
- ndv-refactor: behavioral change smuggled inside a refactoring brief
- ndv-optimize: unmeasured baseline, optimization of a non-identified bottleneck
- ndv-telemetry: observation that requires behavioral change (out of scope for telemetry)
- ndv-review: contradictory review constraints
- ndv-architect: decision already settled being reopened without stated reason
- ndv-secure: assumed-secure surface excluded from audit scope
- ndv-tester: correctness definition not verifiable
- ndv-diagnose: non-reproducible symptom
- ndv-accessibility: single-AT scoping that excludes other user populations
- ndv-design: request to contradict established design system without stated intent

Tier 3 agents have no Self-Validation Protocol — consistent with their classification:
brief quality does not produce domain-incorrect output for these agents.

### Relationship between Handoffs and Mandatory Pipeline

These are two complementary mechanisms covering different failure modes:

**Handoffs** — agent-initiated, domain-specific. The working agent found something a
specialist should handle (bug, security issue, coverage gap, structural concern). The
agent knows what to surface and to whom. Flow classifies as blocking or non-blocking.

**Mandatory Pipeline** — Flow-initiated, structural guarantee. Regardless of what the
agent found, certain downstream agents *must* run after non-trivial Tier 1 output.
The agent does not decide this. Flow enforces it by reading the Mandatory Pipeline section.

They cover different failure modes:
- Clean output with no findings → only Mandatory Pipeline fires
- Output with specific findings → Handoffs fire, Mandatory Pipeline fires for the same agent
- Without Mandatory Pipeline: agent finds nothing → review never runs → unreviewed code ships
- Without Handoffs: agent finds a bug → no mechanism to route it → silently ignored

**Deduplication is required.** When both mechanisms target the same downstream agent in
the same group, Flow merges them into one dispatch — handoff content (specific findings)
plus pipeline scope (unconditional review of all output). One dispatch per downstream
agent per group. Never two dispatches to the same agent from the same group.

---

### Spec readiness gate (absorbed into ADR-008)

The five-criterion spec readiness gate (structural criteria 1–4 for all specs; criterion 5 — N=1/N=10/N=100 scale simulation — for behavioral specs) is embedded in the Decomposition Protocol of `ndv-flow.md`. It is enforced by regression tests in `test/validate-contracts.test.js`. No standalone artifact exists.

---

### Revisit when

- Fleet grows past 30 agents and Brief Contract section lookup becomes a meaningful
  context cost — at that point, consider a compiled contract registry
- A Tier 3 agent repeatedly produces output that requires downstream review — that is
  a signal the classification is wrong and the agent should move to Tier 2
- A new agent is added — its author classifies it into a tier and writes its contracts
  before the model file is considered complete (add to authoring-guide verification checklist)

---

## ADR-009 — Agents extend via input/output variation, not modes

**Date:** 2026-07  
**Status:** Active

---

### Context

ATDD (Acceptance Test-Driven Development) was added to `ndv-tester` as a "mode" — a conditional operating state triggered by a Mode field in the Brief Contract. The implementation introduced a "mode" concept to the fleet that did not previously exist.

Two structural problems surfaced:

1. **The mode did not emerge from the neurotype.** Edge's neurotype is adversarial interrogation of code. ATDD mode was constructive spec translation — a categorically different cognitive operation. This is the same structural violation the MANIFESTO rejects: "An OCD agent (Just) does not fix bugs it finds during a refactor because bug-fixing is a categorically different cognitive operation from form-correction. Mixing them corrupts both."

2. **Flow had no routing signal for the mode.** The Mode field in the Brief Contract was filled by Flow, but Flow's routing table had no entry that distinguished ATDD from normal test generation. The mode was invisible at the routing layer.

### Decision

Agents extend their behavior through **input/output variation**, not through modes. One neurotype, one cognitive operation. The input varies (code, spec, config) and the output varies (test suite, failing tests, report), but the neurotype is constant — it is applied to whatever input arrives, producing whatever output the input demands.

ATDD is not a mode. It is a conditional path triggered by input detection: when no source code exists, Edge interrogates the acceptance criteria as the source. The adversarial neurotype is constant — it finds what breaks, whether what it reads is code or spec. The output format changes (failing tests instead of adversarial suite), but the cognitive operation is the same.

This generalizes: any agent that appears to need a "mode" should instead be examined for whether the mode is a different input that triggers the same neurotype differently. If the neurotype is constant across inputs, the mode is an input/output variation. If the neurotype is not constant, the mode is a scope violation and belongs in a different agent.

### What was rejected

**Option A: Modes as a fleet concept.** Rejected. Modes introduce a second axis of agent state that complicates routing, brief authoring, and validation. Every mode would need its own routing signal, its own Brief Contract interpretation, its own Self-Validation path. The fleet has no mode concept and adding one for a single conditional path is overengineering.

**Option B: A separate ATDD agent.** Rejected as YAGNI. The neurotype is the same — adversarial finding of what breaks. A separate agent would fragment a single neurotype across two files, duplicate the Interrogation Protocol, and require Flow to route between them based on input presence. The input/output variation handles this without a new agent.

**Option C: Remove ATDD entirely.** Rejected. The fleet must handle pre-implementation test generation. Edge's Interrogation Protocol step 1 says "read the source" — without ATDD as a conditional path, Edge receives a brief to interrogate code that doesn't exist and fails. The gap is real.

### How it works

- **Routing:** Flow's routing table includes ATDD signals ("ATDD", "acceptance tests first", "red tests before implementation") alongside normal test signals, all routing to `ndv-tester`. No mode field.
- **Brief authoring:** Flow fills Brief Contract fields. "What to test" accepts either existing code targets OR acceptance criteria (when no source exists). No mode field.
- **Execution:** Edge detects from the brief whether source exists. If yes → Interrogation Protocol on code → adversarial test suite. If no → Interrogation Protocol on acceptance criteria → failing tests + spec gap exposure.
- **Pipeline:** Craft's Mandatory Pipeline (ndv-review + ndv-tester) fires after ATDD-driven implementation. The pipeline dispatch adds adversarial coverage (boundary, error, external failure, concurrency) beyond the ATDD tests that verified the AC.

### Revisit when

- A second agent appears to need a mode — re-examine whether the mode is input/output variation or a neurotype change. If the latter, a new agent is the answer, not a mode.
- An agent's conditional path grows complex enough that the single neurotype no longer explains the behavior — that is a signal the agent is doing two things and should be split.
