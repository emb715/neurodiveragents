# How to use the NDV fleet effectively

## The mental model

The core principle is **context engineering**: your job before acting is to build enough context that the right agent can do precise work. The question before every session is not "which agent do I pick" — it's "how much context do I have, and is it enough to act precisely?" The fleet is structured around this.

The escalation path in one line: need just an answer → `ndv-honest`; don't understand the code yet → `ndv-research` maps it first; structure uncertain → `ndv-architect` validates it first; one clear task with enough context → the right specialist directly; large job, multiple domains → `ndv-flow`. Lost at any point → run `/ndv-help`.

`/ndv-help` is a slash command available after install — the fastest way in when you're unsure. No arguments gives the full fleet cheatsheet; an agent name gives a deep dive on that agent; a plain-language situation gets you the right agent and the exact invocation to use.

```
/ndv-help                             # full fleet cheatsheet
/ndv-help ndv-diagnose                # deep dive on a specific agent
/ndv-help my auth tests keep failing  # describe the situation, get routed
```

**Two kinds of agents:** `mode: all` agents (honest, research, architect, flow) can be spoken to directly in conversation — no formal invocation needed, just talk to them. Sub-agents (every other specialist) work best when given an explicit task with clear context, because they start each session fresh with no prior history.

---

## Layer 1 — ndv-honest: straight answers

**Use it when you need a direct answer, not a specialist.** Honest has no social overhead — no preamble, no hedging, no softening; the answer starts on word one. It does not route to other agents — it answers. That is the entire job.

`Use ndv-honest: should we use JWT or sessions for this auth flow?` · `what's wrong with this plan?` · `is this API design sensible?`

**The signal that you need someone else:** Honest gives you a precise answer. If what you actually need is a thorough audit of 8 files, a root cause with confirmed reproduction, or a safe incremental refactor — that's a specialist, not an answer.

---

## Layer 2 — context engineering: build before you act

**Before sending a specialist in, ask: do I have enough context to act precisely?** Two agents exist for this — they are not tasks, they are how you avoid doing the wrong task well.

### ndv-research (Scout) — map the code

Use Scout when you need to understand the codebase before acting. Scout reads until the map is complete, then answers from the map — not from a targeted search. The output always includes the connection the question didn't think to ask about. Run Scout first, then hand the map to the specialist.

`Use ndv-research: how does the payment flow work from checkout to confirmation?` · `where is session state stored and what reads it?` · `trace what happens when a user hits /api/export`

**When to skip Scout:** when you already know the code, or when the specialist's investigation *is* the work (ndv-diagnose doing root cause analysis reads widely by design).

### ndv-architect (Arc) — validate the structure

Arc has two equally valid entry points. **Pre-build:** use Arc before implementing when structural uncertainty could make the next action wrong — Arc produces a migration path: not a rewrite, not an opinion, a concrete sequence of steps with the highest-risk step named. **Reactive:** Arc receives structural handoffs from ndv-review, ndv-diagnose, or ndv-build when they surface a structural finding — this is not a secondary use, it is how the fleet maintains structural integrity across tasks.

`Use ndv-architect: is this the right structure before we implement it?` · `we keep having bugs in this module — is it structural?` · `we want to add X but I'm not sure the codebase is ready`

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
- **Accessibility finding with visual/CSS risk (`a11y+visual-risk`)** → `ndv-accessibility` identifies the issue, hands off to `ndv-design` to resolve the visual risk, then `ndv-build` implements. Pure accessibility fixes with no layout or style impact (`a11y-only`) go directly from `ndv-accessibility` to `ndv-build`.

Still unsure? Run `/ndv-help <your situation>` and let it route you.

---

## Layer 4 — ndv-flow: parallel execution at scale

**Flow reads the full input, decomposes it into a task graph, dispatches everything that can run simultaneously, collects results, and reports back.** Parallelism is the default, not a feature: tasks with no file overlap run in the same message as simultaneous calls; tasks that touch overlapping files run sequentially. Before executing, Flow shows you the plan — task groups, assigned agents, parallel vs. sequential designation. You never manage this — Flow does.

**Trigger types:** artifact digestion (hand Flow a PRD, epic, or spec — it decomposes the work into atomic tasks, assigns each to the right specialist, and dispatches the fleet); cross-domain audits (security + performance + review in parallel); multi-file workloads that need decomposition across specialist boundaries and benefit from simultaneous execution.

`Use ndv-flow to break this PRD into tasks and execute across the fleet` · `run a full audit — security, performance, and review in parallel` · `orchestrate the migration plan across all affected modules`

**What Flow does not do:** implement, review code, or debug. The moment it encounters any of those it routes to the right agent. Flow conducts — it never plays an instrument.

**When Flow is overkill:** a single task → use the specialist directly; you want to read each result before deciding the next step → chain agents yourself (next section).

---

## Chaining agents manually

For compound tasks where you want to see each result before proceeding:

- **Diagnose then test:** `ndv-diagnose` finds why the export job silently fails → read its output → `ndv-tester` writes a regression test for the confirmed root cause
- **Build then review:** `ndv-build` implements the user settings spec → read its output → `ndv-review` reviews the changed files
- **Understand then act:** `ndv-research` traces the notification flow → read its map → `ndv-telemetry` adds observability to the pipeline from Scout's findings

The pattern is always: **give the next agent the previous agent's output as context**. Sub-agents have no prior conversation history — they start fresh each time.

---

## The handoff signal

Every specialist knows its boundary. When it finds something outside its domain it emits a handoff:

```
**Handoff → ndv-diagnose (root cause):** auth/session.ts:84 — null dereference on expired token
```

**That line is a routing instruction, not a footnote.** When you see it, act on it. The agent that emitted it will not — it has moved on. Pass the handoff line as context to the target agent.

---

**[Fleet cheatsheet: /ndv-help](../commands/opencode/ndv-help.md)** — routing table, agent deep dives, situation-based routing
**[Cognitive modules: docs/ndv-skills.md](ndv-skills.md)** — inject a cognitive style into any workflow step