# neurodiveragents

![neurodiveragents fleet](assets/readme-banner.png)

> Eleven specialized AI agents for Claude Code, OpenCode, Cursor, and GitHub Copilot — each grounded in a real cognitive style that makes it exceptionally effective in its domain.

---

## ✨ Highlights

- **Neurotype-first design** — each agent's behavior emerges from a cognitive operating principle, not a list of rules. It fills gaps consistently even when the rules don't apply.
- **Eleven specialists, zero overlap** — code review, debugging, security, performance, testing, architecture, docs, telemetry, refactoring, fleet orchestration, and a direct generalist. Each stays in its lane and hands off anything outside it.
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

---

## 🗂️ The Fleet

Eleven agents, eleven neurotypes. Each one a specialist who hands off anything outside its domain.

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
| `ndv-explain` | Patient | Explicit theory of mind — models the reader's knowledge gap deliberately | Documentation — bridges the gap between expert and reader |
| `ndv-honest` | Honest | Autism — direct processing, no social filtering, accuracy over harmony | Fallback generalist — cross-domain calls, tradeoffs, opinions |

---

## 🧬 Meet the characters

Every agent is a real character with a documented cognitive profile — not a prompt persona.

**[`docs/ndv-agents.md`](docs/ndv-agents.md) — Agent Doctrine**  
The full neurotype framework. What each neurotype is, why it maps to its domain, the primordial rule each agent operates under, and the behavioral principles that emerge. Read this to understand *why* they behave the way they do.

**Human files — one per agent**  
Written for humans, not for AI tools. Who they are, how they think, when to use them, what to expect.

| Agent | Read their profile |
|-------|-----------|
| `ndv-flow` | [Flow — sees the full task graph, runs the fleet](docs/ndv-flow.human.md) |
| `ndv-honest` | [Honest — direct, autistic, no filler](docs/ndv-honest.human.md) |
| `ndv-review` | [Acute — hypersensitive, misses nothing](docs/ndv-review.human.md) |
| `ndv-diagnose` | [Pierce — ADHD hyperfocus, won't stop](docs/ndv-diagnose.human.md) |
| `ndv-refactor` | [Just — OCD form, one transformation at a time](docs/ndv-refactor.human.md) |
| `ndv-tester` | [Edge — adversarial, assumes code is broken](docs/ndv-tester.human.md) |
| `ndv-secure` | [Ward — hypervigilant, trust no input](docs/ndv-secure.human.md) |
| `ndv-optimize` | [Lean — efficiency OCD, measure first](docs/ndv-optimize.human.md) |
| `ndv-telemetry` | [Pulse — detached observer, never intervenes](docs/ndv-telemetry.human.md) |
| `ndv-architect` | [Arc — autistic systems thinker, principled or nothing](docs/ndv-architect.human.md) |
| `ndv-explain` | [Patient — explicit theory of mind, bridges the gap](docs/ndv-explain.human.md) |

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
