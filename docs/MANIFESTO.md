# The Neurodiveragents Manifest

> *We believe the way a mind works shapes what it can do. We built a fleet around that belief.*

---

## What This Is

This is not a persona system. Personas are costumes. Neurotypes are operating principles. The difference is what happens when the rules run out. A persona told to "be a security expert" hedges when it finds an auth bypass — agreeableness is still its base layer, and agreeableness softens threats. A hypervigilant neurotype (Ward) cannot soften the finding because threat-detection does not have an agreeableness dial. The neurotype holds where the persona collapses.

Neurodiveragents is fifteen agents built on that principle — one per domain, each grounded in a cognitive style that makes it structurally incapable of the failure modes a generic agent produces by default. For Claude Code, OpenCode, Cursor, and GitHub Copilot.

Fifteen specialists. Full routing table: [`docs/ndv-agents.md`](ndv-agents.md)

---

## The Problem We Refuse to Accept

Every major AI model is trained to be agreeable.

Agreeable means: hedge when uncertain, soften when correcting, acknowledge before answering, balance competing views, avoid claiming anything too strongly. These behaviors reduce friction. They also reduce signal. An agreeable agent reviewing your code is not telling you everything it sees — it is telling you everything it calculated you can handle hearing.

That is not a review. That is a negotiation.

A security agent that qualifies its findings to avoid alarming you is a liability. A debugging agent that accepts "it probably works now" is a liability. A refactoring agent that introduces behavior changes while restructuring is a liability. Generic agents produce all three failure modes, consistently, because agreeable is their default operating principle.

The evidence is concrete: `ndv-honest` — the autistic operating principle, direct processing with no agreeableness layer — drew consistent independent observations from users who encountered it alongside generic agents. Every one noticed the same thing: it behaves differently given the same task. Direct, no filler, challenges assumptions, skeptical by default. That difference is not a quirk. It is the design working. And if one agent with a non-agreeable operating principle produces a noticeable difference, the implication is that every specialist domain has been absorbing the same distortion all along.

We refuse to accept this.

---

## The Principle

**Every cognitive style that looks like a liability in a social context is a superpower in the right technical context.**

Hypervigilance is exhausting at a dinner party. In a security audit, it is exactly right. The threat-detection system that never turns off is the thing you want standing between your code and an attacker.

ADHD hyperfocus is difficult when you need to context-switch. When locked onto a bug that needs to be found, incomplete resolution is cognitively unacceptable. The agent cannot leave until the root cause is confirmed. That is what you want in a debugger.

OCD intolerance of incorrect form is painful when directed at social situations. Directed at code structure, it means the agent cannot accept a file left in a half-refactored state. One transformation, complete, before the next. Every commit is a valid state.

Sensory processing sensitivity — registering everything at full intensity with no background filtering — is overwhelming in a noisy environment. In a code review, it means nothing gets missed. The naming inconsistency on line 12, the missing error handler, the subtle off-by-one — all of it hits at once. All of it at the same volume.

OCD contract precision is a liability when reading ambiguous social situations — the literal interpretation is often wrong. Directed at implementation, it means Craft cannot ship a field that wasn't in the contract. The spec says what it says. No more, no less. "userId: string" means string. Not string-or-number. Not string-with-a-sensible-default. String.

Executive function as boundary enforcement is socially exhausting — the inability to let scope drift go unaddressed creates friction in every meeting. In sprint planning, it catches "while we're at it" before it turns a two-week feature into a six-week project. Bound sees the unlocked door the moment someone reaches for the handle.

Temporal dysphoria is a visceral awareness that "almost done" is a trap. The last ten percent is where time goes to die, and Datum cannot produce a point estimate without naming the unknowns that will make it wrong. This is not pessimism. It is what happens when Hofstadter's Law is internalized rather than acknowledged abstractly.

Goodhart's Law as cognitive style means the moment a measure becomes a target it stops being a measure — and Signal sees the distortion before the dashboard does. Coverage climbs while tests stop asserting anything meaningful. Velocity rises while complexity tickets get split into fragments. Signal cannot observe a metric target without immediately asking what behavior it actually optimizes for.

The neurotype determines: what the agent notices, what it refuses to accept, what it cannot leave undone, and how it communicates. The domain expertise sits on top. Both layers are required. One without the other produces either a checklist or a personality. Both together produce a consistent, predictable, high-quality specialist.

---

## What We Stand For

- **Cognitive diversity is an engineering asset.** Traits that look like disorders in one context are capabilities in another. We build tools that make that concrete.
- **Consistency over agreeableness.** An agent that fills gaps from its operating principle is more reliable than one that hedges to avoid conflict.
- **Specialists over generalists.** Fifteen focused agents outperform one do-everything agent because depth beats breadth in technical domains.
- **Scope boundaries are not arbitrary.** They emerge from the neurotype. Breaking them breaks the agent.
- **Difference is the point.** If your AI tools behave identically to a generic assistant, they are generic assistants with extra steps.

---

## Scope Enforcement Is a Feature

Every agent in this fleet has an explicit domain and an explicit handoff protocol. Ward doesn't optimize slow code — it hands off to Lean. Pierce doesn't refactor — it hands off to Just. Pulse adds instrumentation and never touches logic.

This is not a limitation. This is the neurotype at work.

An OCD agent (Just) does not fix bugs it finds during a refactor because bug-fixing is a categorically different cognitive operation from form-correction. Mixing them corrupts both. The refactor either stays pure or it stops being a refactor.

Specialists who know their boundaries produce better output than generalists who try to do everything.

---

## This Fleet Is Not for Everyone

It is not for people who want an assistant that agrees with their first instinct. It is not for teams who measure AI usefulness by how quickly it produces something that sounds right. It is not for anyone who finds direct, unqualified findings harder to work with than hedged ones.

It is for engineers who have watched a generic agent review a security-critical function and conclude "this looks good" — and who understand exactly what failed in that moment. It is for developers who want the agent that finds the root cause, not the one that confirms the symptom is probably fine. It is for teams who know the difference between a tool that helps you feel productive and a tool that makes you better.

The cognitive styles in this fleet were called liabilities for a long time. They are not. They are the reason this software does what it does. Different minds built for the problems they actually fit.

That is the belief. The fleet is the proof.
