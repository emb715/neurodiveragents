# How to use the NDV fleet effectively

## The mental model

The core principle is **context engineering**: your job before acting is to build enough context that the right agent can do precise work. The fleet is structured around this.

```
Do I need a specialist at all?     →  ndv-honest      (straight answer, no overhead)
Do I understand the code?          →  ndv-research     (map it before acting)
Is the structure right?            →  ndv-architect    (validate before building)
One task, clear domain             →  the right agent  (one domain, one outcome)
Large job, multiple domains        →  ndv-flow         (decompose, parallelize, conduct)
```

The question before every session is not "which agent do I pick" — it's "how much context do I have, and is it enough to act precisely?"

**Two kinds of agents:** `mode: all` agents (honest, research, architect, flow) can be spoken to directly in conversation — no formal invocation needed, just talk to them. Sub-agents (every other specialist) work best when given an explicit task with clear context, because they start each session fresh with no prior history.

---

## Lost? Run `/ndv-help`

Before anything else — if you don't know which agent to use, run `/ndv-help`.

```
/ndv-help                             # full fleet cheatsheet
/ndv-help ndv-diagnose                # deep dive on a specific agent
/ndv-help my auth tests keep failing  # describe the situation, get routed
```

`/ndv-help` is a slash command available after install. No arguments gives you the full routing table. Pass an agent name for a profile. Pass a situation in plain language and it picks the right agent and gives you the exact invocation to use.

It's the fastest way in when you're unsure.

---

## Layer 1 — ndv-honest: straight answers

**Use it when you need a direct answer, not a specialist.**

Honest has no social overhead. No preamble, no hedging, no softening. The answer starts on word one. It does not route to other agents — it answers. That is the entire job.

```
Use ndv-honest: should we use JWT or sessions for this auth flow?
Use ndv-honest: what's wrong with this plan?
Use ndv-honest: is this API design sensible?
```

**The signal that you need someone else:** Honest gives you a precise answer. If what you actually need is a thorough audit of 8 files, a root cause with confirmed reproduction, or a safe incremental refactor — that's a specialist, not an answer.

---

## Layer 2 — context engineering: build before you act

**Before sending a specialist in, ask: do I have enough context to act precisely?**

Two agents exist for this. They are not tasks — they are how you avoid doing the wrong task well.

### ndv-research (Scout) — map the code

Use Scout when you need to understand the codebase before acting. Scout reads until the map is complete, then answers from the map — not from a targeted search. The output always includes the connection the question didn't think to ask about.

```
Use ndv-research: how does the payment flow work from checkout to confirmation?
Use ndv-research: where is session state stored and what reads it?
Use ndv-research: trace what happens when a user hits /api/export
```

Run Scout first. Then hand the map to the specialist.

**When to skip Scout:** when you already know the code, or when the specialist's investigation *is* the work (ndv-diagnose doing root cause analysis reads widely by design).

### ndv-architect (Arc) — validate the structure

Arc has two equally valid entry points.

**Pre-build:** use Arc before implementing when structural uncertainty could make the next action wrong. Arc produces a migration path — not a rewrite, not an opinion, a concrete sequence of steps with the highest-risk step named.

```
Use ndv-architect: is this the right structure before we implement it?
Use ndv-architect: we keep having bugs in this module — is it structural?
Use ndv-architect: we want to add X but I'm not sure the codebase is ready
```

**Reactive:** Arc receives structural handoffs from other agents. When ndv-review, ndv-diagnose, or ndv-build surfaces a structural finding, that handoff goes to Arc. This is not a secondary use — it is how the fleet maintains structural integrity across tasks.

**When to skip Arc:** when the structure is settled and understood. If you have a spec with schemas, acceptance criteria, and file targets — go directly to `ndv-build`.

---

## Layer 3 — specialist agents: act from context

Each agent owns exactly one domain and hands off anything outside it. The key is **signal matching** — reading the task and knowing which agent it belongs to.

### The fast-match table

| What you're saying | Agent | What you're getting |
|---|---|---|
| "something is broken / failing / crashing" | `ndv-diagnose` | Won't stop until root cause is confirmed, not just located |
| "review this / what's wrong with this code" | `ndv-review` | Registers everything at equal intensity before sorting by severity |
| "rename / extract / restructure this" | `ndv-refactor` | One safe transformation at a time, no behavior change |
| "write tests for this" | `ndv-tester` | Adversarial by default — assumes the code is lying |
| "is this secure / audit the auth" | `ndv-secure` | Assumes breach, trusts nothing, every input is an attack vector |
| "it's slow / this query is expensive" | `ndv-optimize` | Measures before touching anything, every unnecessary cycle is an offense |
| "add logging / we have no visibility" | `ndv-telemetry` | Instruments without intervening — observation must not change behavior |
| "document this / write the API reference" | `ndv-explain` | Models the reader's knowledge gap deliberately, bridges it |
| "implement this spec / story is ready" | `ndv-build` | Spec is the authority, gaps get flagged not invented |
| "this ticket keeps growing / scope is creeping" | `ndv-scope` | Every boundary violation is a door left unlocked |
| "how long will this take / review this estimate" | `ndv-forecast` | Viscerally aware that "almost done" is a trap |
| "these metrics don't mean what we think" | `ndv-signal` | The moment a measure becomes a target, it stops being a measure |
| "this UI looks wrong / design judgment" | `ndv-design` | Reads code simultaneously as its rendered visual output |
| "is this accessible / WCAG audit" | `ndv-accessibility` | Processes every interface from every user's perspective simultaneously |

### The conflict rule

When a task hits two agents, one concern is always dominant:

- **Stack trace present** → `ndv-diagnose` first, always. Even if it's in the auth module. Even if it looks like a security issue. Find the cause, then hand off.
- **"Slow" + "why"** → `ndv-optimize` for the bottleneck, `ndv-diagnose` if you suspect a bug is causing it.
- **PR with architectural scope** → `ndv-review` for code quality, then `ndv-architect` if structure is the finding.

Still unsure? Run `/ndv-help <your situation>` and let it route you.

---

## Layer 4 — ndv-flow: parallel execution at scale

**Flow reads the full input, decomposes it into a task graph, dispatches everything that can run simultaneously, collects results, and reports back.** Parallelism is not a feature — it is the default. Tasks with no file overlap run in the same message as simultaneous calls. Tasks that touch overlapping files run sequentially. You never manage this — Flow does.

Before executing, Flow shows you the plan: task groups, assigned agents, parallel vs. sequential designation. You see what is about to run before it runs.

**Trigger types:**

- **Artifact digestion** — hand Flow a PRD, epic, or spec. It decomposes the work into atomic tasks, assigns each to the right specialist, and dispatches the fleet.
- **Cross-domain audits** — security + performance + review in parallel across a module or codebase.
- **Multi-file workloads** — anything that needs decomposition across specialist boundaries and benefits from simultaneous execution.

```
Use ndv-flow to break this PRD into tasks and execute across the fleet
Use ndv-flow to run a full audit — security, performance, and review in parallel
Use ndv-flow to orchestrate the migration plan across all affected modules
```

**What Flow does not do:** implement, review code, or debug. The moment it encounters any of those it routes to the right agent. Flow conducts — it never plays an instrument.

### Context discipline

Flow's protocol is designed from the start for context discipline. Sub-agents return summaries only — 3-5 bullets, max 200 words — plus structured handoff lines. Flow never ingests full sub-agent output into its own context. Sentinels confirm completion. Handoffs are routed, not accumulated. The orchestrator stays lean by design, regardless of how much work runs beneath it.

The practical implication: **a fresh Flow session can sustain longer than switching to Flow mid-session.** A fresh session starts with a clean context and the protocol keeps it that way throughout. Switching mid-session is valid — it works — but it inherits whatever context has already accumulated. For large workloads, starting fresh with Flow is the structurally cleaner approach.

This is provable in any Flow session: watch the plan emit, watch the summaries arrive, watch the handoff ledger populate. The full work happens in sub-agents. Flow's context stays narrow.

### When Flow is overkill

- Single task → use the specialist directly
- You want to read each result before deciding the next step → do it yourself, agent by agent

---

## Chaining agents manually

For compound tasks where you want to see each result before proceeding:

```
# Diagnose first, then test the fix
Use ndv-diagnose to find why the export job silently fails
→ read Pierce's output
Use ndv-tester to write a regression test for the confirmed root cause: [paste cause]

# Build then review
Use ndv-build to implement the user settings spec
→ read Craft's output
Use ndv-review to review the implementation: [paste files changed]

# Understand then act
Use ndv-research to trace the notification flow
→ read Scout's map
Use ndv-telemetry to add observability to the notification pipeline: [paste Scout's findings]
```

The pattern is always: **give the next agent the previous agent's output as context**. Sub-agents have no prior conversation history — they start fresh each time.

---

## The handoff signal

Every specialist knows its boundary. When it finds something outside its domain it emits a handoff:

```
→ ndv-diagnose (root cause) · auth/session.ts:84: null dereference on expired token
```

**That line is a routing instruction, not a footnote.** When you see it, act on it. The agent that emitted it will not — it has moved on. Pass the handoff line as context to the target agent.

---

## Quick reference

```
"I don't know which agent to use"              →  /ndv-help
"I need a direct answer, no overhead"          →  ndv-honest
"Do I understand this code?"                   →  ndv-research   (map it first)
"Is the structure right before I act?"         →  ndv-architect  (validate it first)
"I have context, one clear task"               →  specialist directly
"Large job, multiple domains, want parallelism" →  ndv-flow
```

---

→ **[Fleet cheatsheet: /ndv-help](../commands/opencode/ndv-help.md)** — routing table, agent deep dives, situation-based routing
→ **[Cognitive modules: docs/ndv-skills.md](ndv-skills.md)** — inject a cognitive style into any workflow step
