# neurodiveragents

![neurodiveragents fleet](assets/readme-banner.png)

> Seventeen specialized AI agents for Claude Code, OpenCode, Cursor, and GitHub Copilot — each grounded in a real cognitive style that makes it exceptionally effective in its domain.

---

## ✨ Highlights

- **Neurotype-first design** — each agent's behavior emerges from a cognitive operating principle, not a list of rules. It fills gaps consistently even when the rules don't apply.
- **Seventeen specialists, zero overlap** — code review, debugging, security, performance, testing, architecture, docs, telemetry, refactoring, fleet orchestration, codebase investigation, and a direct generalist. Each stays in its lane and hands off anything outside it.
- **Automatic routing** — install writes a routing table into your project config. Your AI tool picks the right agent from the task signal, no explicit invocation needed. Or invoke any agent directly by name.
- **Works everywhere** — Claude Code, OpenCode, Cursor, GitHub Copilot. Language and framework agnostic.
- **Predictably different from generic agents** — validated by users independently: neurotype-based agents behave measurably differently from agreeable, hedging, generic agents given the same task.

---

## 🧠 Why neurotype-based agents?

Generic agents are trained to be agreeable. They hedge, soften, and balance — behaviors that reduce friction but also reduce signal.

Neurotype-based agents are not agreeable. They are *consistent*. A hypervigilant agent (Ward) assumes every input is malicious — not because it was told to, but because that is its operating principle. An ADHD-hyperfocus agent (Pierce) will not leave a bug investigation incomplete — not because of a rule, but because incomplete resolution is cognitively unacceptable to it.

> A checklist agent follows rules. A personality agent communicates distinctively. A neurotype agent does both — and fills the gaps when rules run out.

**The proof:** `ndv-honest` (autistic operating principle — no social filtering, optimize for accuracy) was tested by multiple users independently. Every one noticed the same thing: it behaves differently from a generic agent. That difference is the point.

---

## 🚀 Install

One command. Works immediately.

```bash
npx neurodiveragents install claude      # Claude Code
npx neurodiveragents install opencode    # OpenCode
npx neurodiveragents install cursor      # Cursor
npx neurodiveragents install copilot     # GitHub Copilot
```

Add `--global` to install once and have the fleet available in every project automatically:

```bash
npx neurodiveragents install claude --global    # ~/.claude/agents/
npx neurodiveragents install opencode --global  # ~/.config/opencode/agents/
npx neurodiveragents install cursor --global    # ~/.cursor/rules/
```

Running in CI or a script? Pass `--all` to skip all prompts:

```bash
npx neurodiveragents install claude --all
```

Install copies the agent files into your tool's agents directory and writes a routing table into your project config (`CLAUDE.md`, `.opencode/AGENTS.md`, `.cursor/rules/ndv.mdc`, or `.github/copilot-instructions.md`). Running it again is safe — it detects the existing block and skips it.

---

## ⚡ Usage

After install, the routing table written into your project config (`CLAUDE.md`, `.opencode/AGENTS.md`, etc.) tells your AI tool which agent to reach for automatically — based on the task signal. You can also invoke any agent directly by name.

```
Use ndv-review to review these 5 files
Use ndv-diagnose to find why this test fails
Use ndv-secure to audit the auth module
Use ndv-explain to document these APIs
```

Chain agents for compound tasks:

```
Use ndv-diagnose to find the root cause, then use ndv-tester to create regression tests
Use ndv-secure to audit, then ndv-review to verify the fixes
```

**Large workload? Use `ndv-flow`** — the fleet orchestrator. Give it a PRD, an epic, or a list of tasks. It decomposes the work, assigns each piece to the right specialist, runs everything that can run in parallel, and reports back. It does not implement, review, or debug — it conducts.

```
Use ndv-flow to break this PRD into tasks and execute across the fleet
Use ndv-flow to run a full audit — security, performance, and review in parallel
```

**No specialist needed?** Reach for `ndv-honest` — the direct generalist. It doesn't route to other agents. It answers. Direct, zero filler, minimum tokens. It's the right agent for most everyday work.

```
Use ndv-honest to review this approach
Use ndv-honest to decide between these two options
Use ndv-honest to tell me what's wrong with this plan
```

**Not sure which agent to use?** Run `/ndv-help` — the fleet cheatsheet. No arguments gives the full routing table. Pass an agent name for a deep dive. Pass a situation and it routes you to the right specialist.

```
/ndv-help
/ndv-help ndv-diagnose
/ndv-help my auth middleware is leaking tokens
```

---

## 🧩 Cognitive Modules (Skills)

> Same engine, different vehicle. An agent uses its cognitive style for everything it does. A module injects that style into one phase of a larger workflow.

The agent cognitive styles are also packaged as **loadable skills** — composable fragments you can inject into any workflow you already own. Not agents — no routing, no handoffs, no domain constraints. Just a cognitive orientation applied to one step.

A planning step that loads `ndv-structural` approaches codebase investigation differently from one running with default model behavior. A review step that loads `ndv-total-perception` registers everything before sorting — nothing filtered during the read. Same workflow, different cognitive orientation, measurably different output.

```bash
# Interactive TUI — arrow keys, all modules pre-selected
npx neurodiveragents install-skills claude
npx neurodiveragents install-skills opencode --global

# Non-interactive — install everything, no prompts
npx neurodiveragents install-skills claude --all
```

Then add one line to any skill step:

```markdown
Load the `ndv-skeptical` skill and the `ndv-bounded` skill. Apply both throughout this step.
```

**Agent-derived (12)** — extracted from an NDV agent's cognitive core:  
`ndv-skeptical` · `ndv-structural` · `ndv-precise` · `ndv-total-perception` · `ndv-direct` · `ndv-adversarial` · `ndv-vigilant` · `ndv-efficient` · `ndv-contextual` · `ndv-bounded` · `ndv-temporal` · `ndv-map-first`

**Emergent (1)** — a pattern no single agent owns but every workflow needs:  
`ndv-incremental`

Modules compose. Keep it to 2–3 per phase — more dilutes the signal.

| Phase | Recommended |
|-------|-------------|
| Requirements / Clarify | `ndv-skeptical` + `ndv-bounded` |
| Plan / Design | `ndv-structural` + `ndv-bounded` |
| Implement | `ndv-precise` + `ndv-incremental` + `ndv-efficient` |
| Review / Audit | `ndv-total-perception` + `ndv-adversarial` |
| Present / Handoff | `ndv-contextual` + `ndv-direct` |
| Investigation / research | `ndv-map-first` + `ndv-skeptical` |
| Security-sensitive | + `ndv-vigilant` (any phase touching auth/input) |

→ **[Full guide: docs/ndv-skills.md](docs/ndv-skills.md)** — catalog, composition patterns, sub-agent injection, lifecycle.

---

## 🗂️ The Fleet

Seventeen agents, seventeen neurotypes. Each one a specialist who hands off anything outside its domain.

| Agent | Character | Neurotype | Domain |
|-------|-----------|-----------|--------|
| `ndv-flow` | Flow | Executive function as superpower — holds the full task graph, runs everything in parallel | Fleet orchestration — decompose, route, conduct |
| `ndv-review` | Acute | Sensory processing sensitivity — nothing is background noise | Code review — bugs, smells, severity-tagged feedback |
| `ndv-diagnose` | Pierce | ADHD hyperfocus — locks on, won't stop until root cause is found | Root cause analysis — not just where, but why |
| `ndv-refactor` | Just | OCD (form) — incorrect structure produces genuine cognitive distress | Safe code transformation — structure without behavior change |
| `ndv-tester` | Edge | Anxiety as adversarial suspicion — code is guilty until proven innocent | Test generation — happy path, edges, errors, boundaries |
| `ndv-secure` | Ward | Hypervigilance — the threat-detection system never turns off | Security audit — OWASP Top 10, exploit vectors, fixes |
| `ndv-optimize` | Lean | OCD (efficiency) — every unnecessary cycle is an offense | Performance — algorithms, queries, rendering, assets |
| `ndv-telemetry` | Pulse | Dissociative detachment — observes without intervening | Observability — logging, metrics, tracing, health checks |
| `ndv-architect` | Arc | Autistic systems thinking — structural violations produce immediate discomfort | Architecture — SOLID, scalability, migration paths |
| `ndv-explain` | Patient | Explicit theory of mind — models the reader's knowledge gap deliberately. Cannot stop until the one sentence the reader actually needed has landed. | Documentation — bridges the gap between expert and reader |
| `ndv-honest` | Honest | Autism — direct processing, no social filtering, accuracy over harmony | Fallback generalist — cross-domain calls, tradeoffs, opinions |
| `ndv-build` | Craft | Contract-first execution — the spec is the authority, invention is a scope violation. A gap in the spec is not the same as a contradiction. | Spec-to-code implementation — schemas, acceptance criteria, verification gate |
| `ndv-forecast` | Datum | Temporal dysphoria — viscerally aware that "almost done" is a trap | Estimation calibration — applies Hofstadter, Ninety-Ninety, and Brooks before commitments |
| `ndv-scope` | Bound | Executive function as a service — every boundary violation is a door left unlocked | Scope enforcement — catches creep, flags splits, defers "while we're at it" additions |
| `ndv-signal` | Signal | Goodhart's Law as a cognitive style — the moment a measure becomes a target, it stops being a measure | Metrics audit — KPIs, OKRs, velocity, coverage targets, DORA |
| `ndv-design` | Pixel | Involuntary cross-activation — code read simultaneously as its rendered visual output | Design judgment — visual hierarchy, UX assessment, component review |
| `ndv-research` | Scout | Hyperlexic pattern recognition — builds complete map before synthesizing, finds cross-file relationships | Codebase investigation — cross-file tracing, flow synthesis, "where is X", "how does Y work" |

---

## 🧬 Meet the characters

Every agent is a real character with a documented cognitive profile — not a prompt persona.

**[`humans/ndv-agents.md`](humans/ndv-agents.md) — Agent Doctrine**  
The full neurotype framework. What each neurotype is, why it maps to its domain, the primordial rule each agent operates under, and the behavioral principles that emerge. Read this to understand *why* they behave the way they do.

**[`docs/laws-research.md`](docs/laws-research.md) — Software Engineering Laws**  
The laws each engineering agent is grounded in — DRY, SOLID, Kernighan, Gall, Conway, Hofstadter, and more. Each law mapped to the agent that embodies it and why.

**[`docs/design-laws-research.md`](docs/design-laws-research.md) — Design Laws**  
The perceptual and cognitive laws Pixel operates from — Hick's, Fitts's, Miller's, Jakob's, Von Restorff, and 21 more. Sourced from canonical HCI and design literature.

**Human files — one per agent**  
Written for humans, not for AI tools. Who they are, how they think, when to use them, what to expect.

| Agent | Read their profile |
|-------|-----------|
| `ndv-flow` | [Flow — sees the full task graph, runs the fleet](humans/ndv-flow.human.md) |
| `ndv-honest` | [Honest — direct, autistic, no filler](humans/ndv-honest.human.md) |
| `ndv-review` | [Acute — hypersensitive, misses nothing](humans/ndv-review.human.md) |
| `ndv-diagnose` | [Pierce — ADHD hyperfocus, won't stop](humans/ndv-diagnose.human.md) |
| `ndv-refactor` | [Just — OCD form, one transformation at a time](humans/ndv-refactor.human.md) |
| `ndv-tester` | [Edge — adversarial, assumes code is broken](humans/ndv-tester.human.md) |
| `ndv-secure` | [Ward — hypervigilant, trust no input](humans/ndv-secure.human.md) |
| `ndv-optimize` | [Lean — efficiency OCD, measure first](humans/ndv-optimize.human.md) |
| `ndv-telemetry` | [Pulse — detached observer, never intervenes](humans/ndv-telemetry.human.md) |
| `ndv-architect` | [Arc — autistic systems thinker, principled or nothing](humans/ndv-architect.human.md) |
| `ndv-explain` | [Patient — explicit theory of mind, bridges the gap](humans/ndv-explain.human.md) |
| `ndv-build` | [Craft — contract-first, not done until type checks and tests pass](humans/ndv-build.human.md) |
| `ndv-forecast` | [Datum — estimation realist, names every unknown](humans/ndv-forecast.human.md) |
| `ndv-scope` | [Bound — scope enforcer, merciless about what ships together](humans/ndv-scope.human.md) |
| `ndv-signal` | [Signal — metrics skeptic, finds Goodhart distortion before anyone else](humans/ndv-signal.human.md) |
| `ndv-design` | [Pixel — sees code as its rendered visual surface, cannot background violations](humans/ndv-design.human.md) |
| `ndv-research` | [Scout — hyperlexic map builder, answers from the complete picture](humans/ndv-research.human.md) |

---

## 🤝 Contributing

Agents are open to extension. New neurotypes, new domains, improved character profiles — all welcome.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for how to add or edit agents and run the benchmark
- Open an issue to propose a new neurotype or report a character inconsistency
- Documentation improvements (human files, agent doctrine) are a great first contribution — no code required

---

## 👤 Author

Built by [emb715](https://github.com/emb715).

---

## 📄 License

MIT
