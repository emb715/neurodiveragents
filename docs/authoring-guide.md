# Agent Authoring Guide

How to create a new agent for the neurodiveragents fleet. Read this before writing a single line.

---

## Required reading (read in parallel before starting)

| File | Why |
|------|-----|
| `docs/implicit-neurotype-finding.md` | The four-question move test. The authoring standard. Read before writing any personality paragraph. |
| `docs/decisions.md` | ADR-001–ADR-009. Every structural decision in every model file is governed here. ADR-008 governs Brief Contract, Self-Validation Protocol, and Mandatory Pipeline sections. ADR-009 governs agent extension via input/output variation, not modes — read both before adding conditional behavior to an agent. |
| `humans/ndv-agents.md` | The full fleet. The gap must exist before the agent can. |
| `docs/MANIFESTO.md` | Neurotype is not persona. This distinction determines whether the agent holds when rules run out. |
| `docs/blog-neurodivergent-llm.md` | The two-layer framework: neurotype + domain. Both required. |
| `docs/sync-strategy.md` | Model file first, test it, human file after. Never reversed. |
| `docs/tool-guardrails.md` | Correct tool list per agent type. Incorrect lists break the agent in Claude Code and OpenCode. |

---

## The sequence

### 1. Validate the gap

State the task that is currently misrouted or underserved — concretely, with a real example of a question or task that no existing agent handles well.

Confirm that no existing agent in `humans/ndv-agents.md` can own it without violating its own primordial rule. If an existing agent can own it: stop. Route there. Do not create a new agent.

A gap is real when: (a) a task is systematically misrouted to the wrong specialist, producing answers filtered through the wrong cognitive lens, or (b) no specialist's neurotype is structurally suited to the domain.

### 2. Name the cognitive move (do not skip)

Answer these four questions in order. Do not proceed to the next until the current is answered.

**Q1: What does this agent do that no other agent in the fleet does?**
Name it in one sentence. "Careful about X" is not a move. "Does Y that no other agent does" is a move. If you cannot name it, the design is not complete.

**Q2: Is the move something the agent does, or something it avoids?**
List every behavioral claim in the personality paragraph. Label each ACTIVE or AVOIDANCE. If more than half are avoidances, the personality is built on constraints, not a cognitive identity. Avoidances prevent wrong output but do not mark the output as this agent's.

**Q3: Could a careful, well-instructed LLM produce the same output without this agent's specific mind?**
If yes, the neurotype is decoration. Identify which single element of the personality paragraph, if removed, would make the output indistinguishable from a generic LLM's. That element is the load-bearing piece. If you cannot name it, the personality has no load-bearing piece.

**Q4: Is the move legible in the output without prior knowledge of the rule?**
A reader who does not know the agent's rules must be able to recognize the move in the output. Describe the observable mark. If you cannot describe it, the move is not producing a mark.

Only after all four are answered does writing begin.

### 3. Select the neurotype

The neurotype must produce the move naturally — not as a rule applied on top, but as the cognitive style that makes the move inevitable.

Criteria:
- Maps to a real cognitive trait that in everyday contexts looks like a liability, and in this domain is a superpower
- Is distinct from every existing neurotype in `humans/ndv-agents.md`
- Expressed implicitly in the model file — never labeled ("your neurotype is X"); only visible through what the agent cannot stop doing
- Fills behavioral gaps that rules don't cover — when the rules run out, the neurotype must generate consistent behavior

If two neurotypes produce the same move, the one that makes the move *inevitable* (rather than *permitted*) is correct.

### 4. Write the model file (`agents/ndv-[action].md`)

Sections in order:

1. **YAML frontmatter** — `name: ndv-[action-verb]`, `description` (routing signal; domain-specific; includes neurotype hint), `tools` (from `docs/tool-guardrails.md`), `mode` (optional: `all` for primary-eligible, `agent` for subagent-only; absent defaults to subagent). `model` and `effort` are host-injected, not source-authored — do not include them.
2. **Personality paragraph** — "You are [Name]." The neurotype as what the agent cannot stop doing. The cognitive move visible. No labels, no rationale, no rules. Must pass Q1–Q4.
3. **Out of Scope** — every domain boundary with handoff target. Exact format: `**Handoff → ndv-[command] ([domain]):** [finding]`
4. **Primordial Rule** — the operating principle that generates all behavior. Not a sequencing rule — a cognitive statement about what the agent cannot do otherwise. Must express *why* the constraint exists, not just *what* the constraint is.
5. **Domain protocols** — specific technical knowledge layered on top of the neurotype
6. **Parallelism Strategy** *(include when the agent's cognitive move has meaningful implications for how tasks are batched or sequenced — omit when parallelism is straightforward or domain-irrelevant)*
7. **Output Format** — fenced block, named sections, Handoffs section at end. If the cognitive move produces a specific output section, that section's instructions must reflect the move's inevitability — not "include if applicable" but "this is rarely absent."
8. **What [Name] Never Does** — behavioral boundaries; scope violations; the move's inverse
9. **`## Brief Contract`** *(Tier 1 and Tier 2 agents only)* — 3–5 bullets stating what a well-formed brief from Flow must include for this agent to produce domain-correct output. Each bullet is a required field Flow must fill before dispatching. Written from this agent's domain knowledge — not from Flow's perspective. If any bullet is absent from a received brief, the agent rejects it.
10. **`## Self-Validation Protocol`** *(Tier 1 and Tier 2 agents only)* — two-layer check run before any work begins: (a) completeness check against the Brief Contract, (b) domain soundness check applying this agent's own cognitive laws to what was received. The soundness check catches defects completeness alone cannot — wrong algorithmic approach, violated domain invariants, contradictory constraints. Reject format: `BRIEF_REJECTED: [field or violation] — [what is needed]`.
11. **`## Mandatory Pipeline`** *(Tier 1 agents only)* — names which downstream agents must run after this agent's non-trivial output, with a precise definition of "non-trivial" for this domain. These agents are blocking — Flow enforces them regardless of whether this agent emitted handoffs.

**Exception — residual agents:** `ndv-honest` is a fleet-level residual, not a domain specialist. It handles everything no specialist owns. The section requirements (Out of Scope, Parallelism Strategy, Output Format, What Never Does) exist to force domain boundary decisions that residual agents do not have. Residual agents are exempt from these structural section requirements. The Primordial Rule still applies.

**Tier classification (ADR-008) — determine before writing sections 9–11:**

Every agent belongs to exactly one tier. The tier determines which sections are required.

| Tier | Criterion | Sections required |
|------|-----------|-------------------|
| **Tier 1** | Produces codebase artifacts (code, config, instrumentation). Brief quality determines domain correctness. Downstream review is structurally required. | Brief Contract + Self-Validation + Mandatory Pipeline |
| **Tier 2** | Produces findings, assessments, or reports. Brief quality determines domain correctness. Output is itself the gate — no downstream review needed. | Brief Contract + Self-Validation |
| **Tier 3** | Advisory, investigative, or communicative. Brief quality affects output depth but cannot produce domain-incorrect output. No codebase artifacts. | None |

**The classification test:** can an underspecified brief cause this agent to produce output that is *wrong* — not just shallow, but actively incorrect in a way that corrupts downstream work? If yes: Tier 1 or Tier 2. Does this agent's output change the codebase? If yes: Tier 1.

Current Tier 1: `ndv-build`, `ndv-refactor`, `ndv-optimize`, `ndv-telemetry`
Current Tier 2: `ndv-review`, `ndv-architect`, `ndv-secure`, `ndv-tester`, `ndv-diagnose`, `ndv-accessibility`, `ndv-design`
Current Tier 3: `ndv-research`, `ndv-explain`, `ndv-scope`, `ndv-forecast`, `ndv-signal`, `ndv-flow`, `ndv-honest`

**Model file rules (ADR-001, ADR-004):**
- No design rationale
- No historical context
- No examples (bash, code, codebase-specific patterns)
- No narrative beyond the identity paragraph
- Token-efficient throughout
- The personality paragraph is load-bearing — validated empirically to improve neurotype fidelity 54% over rules-only prompts (see `docs/decisions.md` ADR-004)
- **No file references of any kind** — no markdown links, no relative paths, no filenames with extensions. Agent files are loaded as system prompts; any file reference points to a path that does not exist in the model's context.
- **No skill references of any kind** — agents do not consume skills. Skills are extracted from agent behavior; the relationship is one-directional. An agent already embodies its cognitive style natively — it never loads or delegates to a skill. If behavior is required, express it directly in the agent file.

**On the Primordial Rule:**
A rule stated as sequencing ("do X before Y") can be followed by any agent given the instruction. A rule stated as cognition ("doing Y without X first is not forbidden — it is impossible given how this agent works") produces behavior that holds when rules run out. Prefer the cognitive statement. Multi-sentence rules are acceptable when a single sentence collapses the principle to sequencing.

### 5. Update routing

All four must be updated:
- `CLAUDE.md` — add row to routing table; add proactive trigger signal
- `agents/ndv-flow.md` — add row to the Routing Table section
- `humans/ndv-agents.md` — add agent to fleet table and write the doctrine section (neurotype, domain, primordial rule, behavioral principles, domain rules)
- `bin/ndv.js` — add row to the NDV_BLOCK routing table and to the `installCopilot()` header string

Verify all four reference the same `ndv-[command]` identifier and the same character name. Drift between these files is invisible at authoring time and breaks routing.

### 6. Write the human file (`humans/ndv-[action].human.md`)

Required sections:
- **Who is [Name]?** — character summary
- **Neurotype** — explained for a human reader, not the model
- **The cognitive move** — named explicitly; what marks the output as this agent's; which output section is the observable mark
- **Why this exists in the fleet** — the gap, the misrouting it replaces, the concrete example that exposed it
- **Personality** — narrative, not rules
- **The failure mode it prevents**
- **When to use / not use**
- **Docs that govern this agent's design** — specific files and why each matters for this agent
- **Invocation** — three concrete examples

Never in human files: behavioral rules, output format specs, checklist items, handoff routing instructions.

---

## Common failure modes

**Writing the personality as a workflow.**
The personality paragraph describes what the agent does step by step. It passes casual reading. It fails Q3: a careful LLM given the same rules produces the same output. The neurotype is not load-bearing.

*Fix: start with Q1. Name the move. Write the paragraph to express what cannot be stopped, not what is done.*

**Personality built only from avoidances.**
"Agent X never edits files. Agent X never assesses quality. Agent X never stops before the map is complete." All constraints. No move. The output is correct and indistinguishable from a well-instructed generic LLM.

*Fix: Q2. Every avoidance should have a corresponding active behavior that only this agent produces.*

**The Primordial Rule stated as sequencing.**
"Complete the map first. Then speak." Any agent can follow a sequencing rule. The rule must express *why* the agent cannot do otherwise — the cognitive reason, not the procedural constraint.

*Fix: Rewrite the rule as a cognitive statement. "Reporting from a partial [X] is not possible for [Name], not forbidden" is structurally different from "complete [X] before reporting."*

**The output format not reflecting the cognitive move.**
The section that contains the observable mark (Q4) is marked "omit if none" or "include if applicable." This undercuts the inevitability the personality claims. If the move is real, the section is rarely absent.

*Fix: The format instruction for the move's output section should state its expected frequency, not just its existence.*

**Codebase-specific content in the model file.**
Bash examples, domain-specific patterns, version markers, project names. These belong in the human file or nowhere. The model file must be agnostic (ADR-001).

*Fix: if a sentence references a specific tool, pattern, or codebase, move it to the human file or delete it.*

**File references in the model file.**
Markdown links, relative paths, or filenames pointing to fleet docs (`humans/`, `docs/`, `skills/`, `modules/`). Agent files are loaded as system prompts into an LLM context where those paths do not exist. The model will treat broken references as real and fail to locate the content.

*Fix: remove the reference entirely. If the behavior it pointed to is needed, express it directly in the agent file as protocol or constraint.*

**Skill references in the model file.**
Mentioning a skill by name as something to load or apply (`apply ndv-temporal`, `load ndv-skeptical`). Agents do not consume skills. Skills are extracted from agents — the relationship is strictly one-directional. An agent that references a skill it produced is a circular dependency. The user's system may not have that skill installed, and even if it does, the agent already embodies the behavior natively.

*Fix: remove the skill reference. Inline the behavior it described directly as a protocol step or assessment criterion.*

**Creating an agent for a gap that isn't real.**
The domain feels underserved but an existing agent can own it without scope violation. A new agent fragments the fleet and dilutes routing precision.

*Fix: read `humans/ndv-agents.md` fully. State in one sentence why each adjacent agent cannot own the domain. If you cannot state it, the gap is not real.*

**Writing the human file first.**
Human files describe an agent that doesn't exist yet. The description drifts from what the model file actually produces. Model file is source of truth (ADR-002).

*Fix: model file, routing updates, then human file. Always in that order.*

**Incomplete routing updates.**
Model file is written and tested. Only `CLAUDE.md` is updated. `ndv-flow.md`, `humans/ndv-agents.md`, and `bin/ndv.js` are missed. The agent exists but is invisible to the orchestrator, undocumented in the fleet, and missing from the installer.

*Fix: treat step 5 as a checklist. All four routing targets must be updated before the human file is written.*

**Missing Brief Contract on a Tier 1 or Tier 2 agent.**
Flow cannot author a domain-sound brief without reading the agent's Brief Contract. Without it, Flow falls back to the generic template — which is domain-blind. The first dispatch will likely produce a BRIEF_REJECTED or, worse, incorrect output that passes without rejection.

*Fix: classify the agent's tier first. If Tier 1 or Tier 2, Brief Contract and Self-Validation Protocol are required. Write them from the agent's domain knowledge — what does this agent need to receive to produce correct output?*

**Brief Contract present on a Tier 3 agent.**
A Tier 3 agent with a Brief Contract signals that the author believes brief quality determines domain correctness for this agent. If that is true, the agent is misclassified — it should be Tier 2. If it is not true, the Brief Contract is false signal that will cause Flow to reject valid briefs unnecessarily.

*Fix: apply the classification test. If the answer is "thin brief = shallow output but not wrong output," the agent is Tier 3 and the Brief Contract should be removed.*

**Adding a "mode" to an agent for conditional behavior.**
An agent appears to need different behavior in different situations — test generation for existing code vs. pre-implementation, refactoring with vs. without test coverage, etc. The temptation is to add a mode flag the caller sets. This introduces a second axis of agent state that the fleet has no routing or brief-authoring support for.

*Fix: ADR-009. The mode is usually a different input that triggers the same neurotype differently. Detect the input condition from the brief content — no mode field, no flag. If the neurotype is constant across inputs, it's input/output variation. If the neurotype changes, it's a new agent.*

**Self-Validation domain soundness check is generic.**
The soundness check reads "validate against your domain laws" but lists no specific laws. This produces a check that passes everything, because the agent has no named violations to look for. A generic soundness check is not a soundness check — it is reassurance theater.

*Fix: for each bullet in the Brief Contract, ask: what would a brief that satisfies this field on the surface but violates the domain look like? That is a soundness violation. Name it explicitly in the Self-Validation Protocol.*

---

## Verification checklist

Before marking an agent complete:

**Identity and neurotype**
- [ ] Q1–Q4 answered in writing — move named, active, non-substitutable, legible
- [ ] Neurotype distinct from every existing agent in `humans/ndv-agents.md`
- [ ] Primordial Rule expressed as cognition, not sequencing
- [ ] Output format section for the cognitive move reflects its inevitability

**Model file hygiene**
- [ ] Model file contains no rationale, no examples, no codebase-specific content
- [ ] Model file contains no file references — no markdown links, no relative paths, no fleet filenames
- [ ] Model file contains no skill references — agents produce skills, never consume them

**Tier classification and Domain Contracts (ADR-008)**
- [ ] Agent classified into Tier 1, 2, or 3 — classification test applied and documented
- [ ] Tier 1 or 2: `## Brief Contract` present — 3–5 bullets, written from agent's domain knowledge, each bullet names a rejectable condition
- [ ] Tier 1 or 2: `## Self-Validation Protocol` present — completeness check + domain soundness check with named violations (not generic)
- [ ] Tier 1 only: `## Mandatory Pipeline` present — names blocking downstream agents with precise non-trivial definition
- [ ] Tier 3: none of the above sections present — their absence is correct, not an oversight

**Routing (all four targets)**
- [ ] `CLAUDE.md` routing table updated
- [ ] `agents/ndv-flow.md` routing table updated
- [ ] `humans/ndv-agents.md` fleet table and doctrine section added
- [ ] `bin/ndv.js` NDV_BLOCK and `installCopilot()` header updated
- [ ] All four routing targets use the same `ndv-[command]` and character name

**Human file**
- [ ] Human file written after model file is stable
- [ ] Human file does not contain behavioral rules, output format specs, or handoff routing instructions
