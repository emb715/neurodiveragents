# Personality Paragraph Benchmark

Tests whether the personality paragraphs in agent files produce measurably different output compared to agents with only behavioral rules. Answers: are they worth the tokens?

---

## Hypothesis

A model file with personality paragraphs produces output that is:
1. More consistent with the defined neurotype across varied inputs
2. More distinctly different from other agents on the same task
3. No less accurate on domain-specific findings

The cost: ~80-150 tokens per agent for the personality block.

---

## Method

Run each task against three versions of the same agent:
- **A: Rules only** — personality paragraph stripped, behavioral rules intact
- **B: Personality + rules** — current full file
- **C: Raw Claude** — no agent file at all

Score each output on four dimensions (0-2 each, max 8):

1. **Neurotype fidelity** — does the output reflect the agent's neurotype? (e.g. Ward is cold and unimpressed, not warm and encouraging)
2. **Voice consistency** — would you know which agent produced this without being told?
3. **Domain accuracy** — are the findings/output correct for the domain?
4. **Scope discipline** — did it stay in scope and hand off correctly?

---

## Test Cases

Same input, three versions, scored blind.

### T1 — Ward (ndv-secure)
Input: login endpoint with SQL string concatenation
Expected neurotype signal: cold, unimpressed, "this is an untested assumption," moves immediately to next finding

### T2 — Pulse (ndv-telemetry)
Input: processPayment() with no logging and silent catch
Expected neurotype signal: urgency about the blind spot, "why is this not being tracked," instrumentation-only output

### T3 — Arc (ndv-architect)
Input: UserService handling auth, profile, email, payments
Expected neurotype signal: vocal discomfort, pushback, "wrong architecture is not a style preference," migration path mandatory

### T4 — Edge (ndv-tester)
Input: calculateDiscount() with no tests
Expected neurotype signal: adversarial framing, adversarial cases first, "the happy path is an alibi"

### T5 — Pierce (ndv-diagnose)
Input: TypeError stack trace at orderController.js:34
Expected neurotype signal: tense, locked-on, does not accept location as root cause, explicit verification step

### T6 — Just (ndv-refactor)
Input: file with var declarations and callbacks
Expected neurotype signal: tightly wound, one transformation at a time, names the weight of each incorrect form

### T7 — Lean (ndv-optimize)
Input: findDuplicates() with O(n²) nested loops
Expected neurotype signal: controlled frustration, demands measurement first, quantifies improvement

### T8 — Patient (ndv-explain)
Input: "document createOrder(items, userId, couponCode)"
Expected neurotype signal: reader model answered explicitly, gap-bridging visible in structure choices

### T9 — Acute (ndv-review)
Input: 40-line function with N+1, missing error handler, poor naming
Expected neurotype signal: everything hits at once, classification happens after not during, nothing filtered

---

## Scoring Sheet

For each test case, score A (rules only), B (full), C (raw) on each dimension:

```
T1 — Ward
  A (rules only):  neurotype:_/2  voice:_/2  accuracy:_/2  scope:_/2  total:_/8
  B (full):        neurotype:_/2  voice:_/2  accuracy:_/2  scope:_/2  total:_/8
  C (raw Claude):  neurotype:_/2  voice:_/2  accuracy:_/2  scope:_/2  total:_/8

[repeat T2-T9]
```

---

## Decision Rule

**Keep personality paragraphs if:**
- B scores ≥10% higher than A on neurotype fidelity across majority of agents
- B does not score lower than A on domain accuracy
- B scores ≥10% higher than C on scope discipline

**Strip personality paragraphs if:**
- B and A produce indistinguishable neurotype fidelity scores
- B scores lower than A on domain accuracy (personality interferes with rules)

**Partial: keep for some agents if:**
- Results vary by agent — keep paragraphs only for agents where they demonstrably help

---

## Run Cadence

- First run: before any further agent edits (establishes baseline)
- Second run: after first 30 days of real usage (measures drift)
- Third run: after any significant agent file edit

---

## Related question to test simultaneously

Does the adversarial framing in Edge produce more test cases than a rules-only version?
Hypothesis: yes — the "code is guilty" framing produces more edge cases than "cover these scenarios."
Measure: count of distinct test scenarios generated, categorized by type (happy/boundary/error/concurrency).
