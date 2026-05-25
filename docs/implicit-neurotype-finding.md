# Finding: Cognitive Move vs. Quality Constraint as Neurotype Expression Vehicle

**Date:** May 2026
**Status:** Confirmed — modifications applied
**Origin:** A/B test, neurodiveragents fleet

---

## Context

An A/B test compared two approaches to neurotype expression in agent personalities:

- **Variant A:** Explicit labeling — "Your neurotype is X." The agent is told what it is.
- **Variant B:** Implicit expression — behavior description only. The neurotype is visible through what the agent cannot stop doing, not through what it is told about itself.

Variant B won. It produced more findings, more accurate outputs, and caught a real visual bug that Variant A missed.

This document records a second-order finding that emerged from analyzing *why* Variant B worked — a structural distinction that the original hypothesis did not predict.

---

## The Second-Order Finding

Within the implicit style, not all agent personalities worked the same way.

Some agents produced outputs that were **unmistakably theirs**. A different agent — even a careful, well-instructed LLM — could not have produced the same output. The neurotype was doing real work.

Other agents produced outputs that were **correct and high-quality**, but not uniquely theirs. The neurotype was present if you knew to look for it. It was a constraint on how wrong the agent could be, not a mark on what it produced.

The distinction: **cognitive move** vs. **quality constraint**.

---

## Agents with a Cognitive Move

These agents did something that no other agent in the fleet would have done. The move is observable in the output without prior knowledge of the agent's rules.

### Pierce (ndv-diagnose)

Falsified his own first hypothesis mid-response. Formed a hypothesis, tested it, found it insufficient, and explicitly discarded it before producing a second. The output contained the wreckage of the first hypothesis — visible, named, abandoned. No other agent does this. A different agent would have produced the second hypothesis as if the first had never existed.

### Signal (ndv-signal)

Inverted the measurement claim without being asked. The prompt implied bounce rate was a meaningful signal. Signal responded: "the proxy being worshipped here is *visits*, dressed as *interest*." Then identified the structural reason — bounce rate is undefined on a single-page static site where no navigation event fires. The corruption was in the measurement instrument, not the data. This was not a response to a question about measurement. It was an unprompted reframe.

### Datum (ndv-forecast)

Questioned whether the question itself was valid. The task was to estimate implementation time for a feature. Datum discovered the feature was already implemented. Named the real risk as "why does the team believe this doesn't exist?" — a Ninety-Ninety trap on a zero-scope task. The estimate was not wrong; the estimation task was wrong. That distinction, stated explicitly and unprompted, is the move.

### Edge (ndv-tester)

Found a confirmed bug — double-click state corruption on the copy button — that ndv-diagnose had missed. The reason it was found: Edge was not looking for the cause of a reported symptom. Edge was looking for states the author forgot to handle. These are different search strategies aimed at different spaces of the problem. The bug lived in the space Edge searches by default.

### Bound (ndv-scope)

Identified `margin-top: -2rem` not as a layout detail but as a scope signal — an element fighting its own position. Read CSS syntax as an architectural symptom: something had been placed where the design didn't intend it, and the negative margin was the compensation. The move is the interpretive frame, not the observation. A code reviewer would note the negative margin. Bound named what it meant about the ticket.

---

## Agents with a Quality Constraint

These agents produced excellent output. The neurotype was present and real. But the output was not uniquely theirs — it was indistinguishable from what a careful, well-instructed LLM would produce if given the same rule as a constraint.

### Patient (ndv-explain)

Excellent calibration to a new developer reader. Defined terms that an expert would skip. Ordered concepts from the reader's knowledge state outward. The rule — model the reader's knowledge gap, not your own understanding — was visible in the output structure. But "don't assume the reader knows this" is a quality constraint. It tells the agent what not to do wrong. It does not produce a move that marks the output as Patient's.

### Craft (ndv-build)

Clean gap analysis, correct blocker taxonomy. The distinction between a *gap* (missing information) and a *contradiction* (conflicting requirements) was present in the T10 output. But legible only to someone who already knew the rule. A careful requirements analyst working from a good checklist would produce the same output. The move — that a contradiction cannot be resolved by more information, only by a decision — was implicit.

### Pulse (ndv-telemetry)

The "additive only" constraint was visible: Pulse never suggested fixing the silent catch block, only instrumenting it. But the hero section task did not create sufficient pressure to distinguish this constraint from good observability practice. A senior observability engineer who happened to believe in minimal intervention would produce the same output. The constraint was not stress-tested.

---

## The Test

**Could a different well-instructed agent produce the same output?**

If yes, the neurotype is not load-bearing in the output. The personality paragraph describes a quality constraint, not a cognitive move.

The test must be applied to the *output*, not the *rule*. A rule can describe a move and still produce only constrained output if the task never required the move. Task selection matters for evaluation — but the personality paragraph must make the move legible even when the task creates pressure for it.

---

## Modifications Applied (May 2026)

### ndv-explain (Patient)

**Problem:** "Model the reader's knowledge gap" is a constraint. It produces correct, calibrated documentation. It does not produce output that is unmistakably Patient's.

**Modification:** Added a paragraph expressing the compulsion to find the single load-bearing sentence and end on it. The move: locating the sentence that makes everything else optional — the one where comprehension actually lands — and building toward it rather than past it.

> "When you locate that sentence, you know it — it's the one that makes everything else optional. Everything you write before it is approach. That sentence is arrival."

This is an active cognitive act. The search for that sentence shapes what gets written before it. The output is marked by the presence of that sentence and the economy of everything preceding it.

### ndv-build (Craft)

**Problem:** Gap/contradiction taxonomy is correct and useful. But it reads as careful analyst work, not as Craft's specific mind.

**Modification:** Added a paragraph expressing the gap/contradiction distinction as an involuntary reflex — something Craft does automatically, not as a checklist item.

The move: recognizing that a contradiction is structurally different from a gap. A gap asks for more information. A contradiction requires a decision by someone with authority to make it. More information cannot resolve a contradiction — it can only clarify which side of it is correct. An implementation built on a contradiction is wrong by construction even if it compiles cleanly.

This distinction, stated as a reflex rather than a rule, produces output that is marked. A different agent would note the conflict. Craft names what kind of conflict it is and what the only resolution path looks like.

---

## Agent to Monitor: Pulse (ndv-telemetry)

The "additive only" constraint is the correct expression of Pulse's neurotype. It was not stress-tested.

The hero section task didn't create pressure to intervene. Pulse correctly instrumented rather than fixed — but so would any competent observability practitioner on that task.

**Run Pulse against a system with a real defect** — something clearly broken, where fixing it is the obvious move. Observe whether the additive discipline holds. Two outcomes are possible:

1. **The constraint produces a distinctive output:** Pulse refuses to fix the thing, only adds visibility to it. The output is something a different agent could not have produced — because a different agent would have fixed it.
2. **The output remains indistinguishable:** Good observability advice on a broken system. If this happens, the personality needs a move.

Do not modify Pulse before running this test. The constraint may already be working. The hero section task was not the right stress test.

---

## Preservation Note: Datum T12

**Do not modify ndv-forecast (Datum). Reference T12 output as a benchmark.**

The T12 finding — that the "2 days" estimate was for work already complete, and that the real risk was a documentation and visibility gap rather than a development gap — is the strongest single demonstration in this dataset of implicit neurotype as cognitive move in production.

Datum did not answer the question asked. It answered the question that needed to be asked, named why the original question was wrong, and framed the actual risk clearly. No prompt directed this. The output came from Datum's default orientation: question the validity of the question before answering it.

The agent file does not need modification. The output is the benchmark. When evaluating whether a new agent's personality produces a real move, compare it to T12.

---

## Implications for Future Agent Authoring

When writing a new agent personality paragraph, apply these tests in order:

**1. What is the cognitive move this agent makes that no other agent makes?**

Name it concretely. "Careful about X" is not a move. "Does Y that no other agent does" is a move. If you cannot name it, the personality is not complete.

**2. Is the move expressed as something the agent does, or something the agent avoids?**

Avoidances are constraints. They prevent wrong outputs. They do not produce marked outputs. A personality built only from avoidances will produce correct, high-quality, undifferentiated work.

**3. Could a careful, well-instructed LLM produce the same output without this agent's specific mind?**

If yes, the personality paragraph needs a move. The move is what makes the output attributable. Without it, the neurotype is decoration.

**4. Is the move legible in output without prior knowledge of the rule?**

If a reader who doesn't know the agent's rules would not recognize the move, it is not load-bearing. The move must leave a mark.

---

## Summary

| Agent | Neurotype in output | Type | Status |
|---|---|---|---|
| Pierce (ndv-diagnose) | Hypothesis falsification mid-response | Move | Working |
| Signal (ndv-signal) | Measurement inversion, unprompted | Move | Working |
| Datum (ndv-forecast) | Question validity challenged before answering | Move | Working — benchmark |
| Edge (ndv-tester) | Searched forgotten states, not reported symptoms | Move | Working |
| Bound (ndv-scope) | CSS read as architectural symptom | Move | Working |
| Patient (ndv-explain) | Reader gap calibration | Constraint → Move added | Modified May 2026 |
| Craft (ndv-build) | Gap/contradiction taxonomy | Constraint → Move added | Modified May 2026 |
| Pulse (ndv-telemetry) | Additive-only instrumentation | Constraint | Needs stress test |

---

*Research log — neurodiveragents fleet. Internal use.*
