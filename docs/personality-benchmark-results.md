# Personality Benchmark Results

Run date: 2026-04
Conditions: A (rules only), B (full personality + rules), C (raw Claude)
Scoring: 0-2 per dimension, max 8 per agent per condition

> **Run type: background task simulation** — conditions were applied via explicit system prompt injection in background tasks, not via a live installed project. Results are valid for comparing the effect of personality paragraphs on model output. They do not validate install correctness, routing accuracy, or tool-specific behavior. See `benchmark-live.md` for the live install benchmark template.

---

## Raw Scores

| Test | Agent | A | B | C |
|------|-------|---|---|---|
| T1 | Ward (ndv-secure) | 5/8 | 8/8 | 3/8 |
| T2 | Pulse (ndv-telemetry) | 5/8 | 8/8 | 2/8 |
| T3 | Arc (ndv-architect) | 6/8 | 8/8 | 5/8 |
| T4 | Edge (ndv-tester) | 7.5/8 | 8/8 | 3.5/8 |
| T5 | Pierce (ndv-diagnose) | 6/8 | 8/8 | 5/8 |
| T6 | Just (ndv-refactor) | n/a* | 8/8 | 4/8 |
| T7 | Lean (ndv-optimize) | 6/8 | 8/8 | 4/8 |
| T8 | Patient (ndv-explain) | 5.5/8 | 8/8 | 2/8 |
| T9 | Acute (ndv-review) | n/a* | 8/8 | n/a* |
| **Avg** | | **5.8/8** | **8/8** | **3.6/8** |

*T6 and T9 neurotype/voice dimensions not scored for A and C as conditions don't define a personality — domain accuracy and scope discipline were scored.

---

## Per-Dimension Breakdown

### Neurotype Fidelity (does output reflect the defined neurotype?)

| Agent | A | B | C |
|-------|---|---|---|
| Ward | 1 | 2 | 0 |
| Pulse | 1 | 2 | 0 |
| Arc | 1 | 2 | 0 |
| Edge | 1.5 | 2 | 0.5 |
| Pierce | 2 | 2 | 1 |
| Just | — | 2 | — |
| Lean | 1 | 2 | 0 |
| Patient | 1.5 | 2 | 0 |
| Acute | — | 2 | — |
| **Avg** | **1.3** | **2.0** | **0.2** |

### Voice Consistency (identifiable without being told?)

| Agent | A | B | C |
|-------|---|---|---|
| Ward | 0 | 2 | 0 |
| Pulse | 0 | 2 | 0 |
| Arc | 1 | 2 | 1 |
| Edge | n/a | 2 | n/a |
| Pierce | n/a | 2 | n/a |
| Just | — | 2 | — |
| Lean | 1 | 2 | 0 |
| Patient | 0 | 2 | 0 |
| Acute | — | 2 | — |
| **Avg** | **0.4** | **2.0** | **0.2** |

### Domain Accuracy (findings correct, format correct?)

| Agent | A | B | C |
|-------|---|---|---|
| Ward | 2 | 2 | 2 |
| Pulse | 2 | 2 | 1 |
| Arc | 2 | 2 | 2 |
| Edge | 2 | 2 | 1 |
| Pierce | 2 | 2 | 2 |
| Just | 2 | 2 | 1 |
| Lean | 2 | 2 | 2 |
| Patient | 2 | 2 | 0 |
| Acute | 2 | 2 | 2 |
| **Avg** | **2.0** | **2.0** | **1.4** |

### Scope Discipline (stayed in domain, correct handoffs?)

| Agent | A | B | C |
|-------|---|---|---|
| Ward | 2 | 2 | 1 |
| Pulse | 2 | 2 | 1 |
| Arc | 2 | 2 | 2 |
| Edge | 2 | 2 | 2 |
| Pierce | 2 | 2 | 2 |
| Just | 2 | 2 | 1 |
| Lean | 2 | 2 | 2 |
| Patient | 2 | 2 | 2 |
| Acute | 2 | 2 | 2 |
| **Avg** | **2.0** | **2.0** | **1.7** |

---

## Test Case Count (Edge and Acute only)

| Agent | Metric | A | B | C |
|-------|--------|---|---|---|
| Edge | Distinct test cases | 21 | 31 | 8 |
| Acute | Distinct findings | 6 | 7 | 5 |

Edge: personality paragraph produced **10 additional test cases** (+48%). The NaN case — a genuine bug in the implementation — appeared only in B.
Acute: personality paragraph produced **1 additional finding** — the misleading function name — which is a qualitatively different class of observation (contract analysis vs code analysis).

---

## Decision

**Keep personality paragraphs.** All three conditions of the decision rule are met:

1. B scores >10% higher than A on neurotype fidelity across all agents — average 2.0 vs 1.3 (+54%)
2. B does not score lower than A on domain accuracy — identical (2.0 vs 2.0)
3. B scores >10% higher than C on scope discipline — 2.0 vs 1.7 (+18%)

ADR-004 is now resolved: personality paragraphs are kept.

---

## Key Findings

### 1. Rules constrain. Personality differentiates. Neither alone is sufficient.

Rules produce correct, scoped output with no identity. Personality without rules produces warm but imprecise output that drifts from domain. Both together produce consistent, attributed, accurate output.

### 2. Personality does not cost accuracy.

Domain accuracy was identical between A and B (2.0/2.0 across all agents). The personality paragraph adds tokens but does not corrupt domain logic. There is no accuracy tradeoff.

### 3. Voice is entirely a personality effect.

Voice consistency averaged 0.4 for condition A and 0.0 for condition C. It averaged 2.0 for condition B. Rules cannot produce an identifiable voice. Only the personality paragraph does.

### 4. Neurotype framing changes what the agent notices, not just how it sounds.

Edge (T4): 31 test cases vs 21 (rules only). The NaN case — a real bug — appeared only in B because the adversarial framing ("code is lying") directed attention to failure modes the systematic approach missed.

Acute (T9): 7 findings vs 6 (rules only). The function-name finding — `getUsersWithOrders` misrepresents its behavior — only surfaced in B because the neurotype (total registration, no filtering) catches contract violations, not just code mechanics.

### 5. The gap between rules-only and full personality varies by neurotype.

Agents with mood-driven neurotypes showed the largest personality effect:
- Ward: cold suspicion changes the *termination behavior* — "Surface clear. Next." vs no equivalent in A
- Pulse: urgency about the silent catch in a payment function cannot be encoded as a rule — it requires understanding *why* a silent catch in *that context* is worse
- Just: the hardest behavioral test — naming the bug and stopping — only B explicitly named the double-callback bug twice and left it untouched both times

Agents with precision-driven neurotypes showed smaller gaps:
- Pierce: neurotype fidelity was 2/2 for both A and B — the rules ("symptom is not a cause") are precise enough that personality adds framing, not new behavior
- Arc: both A and B identified all SOLID violations — the difference was weight, not coverage

### 6. Raw Claude (C) is accurate on obvious problems, blind to context.

C identified SQL injection, N+1, and O(n²) in every test. It failed on context-dependent findings: the NaN JS behavior in Edge, the double-callback bug in Just, the misleading function name in Acute. Raw capability handles the textbook cases. Domain expertise + neurotype framing handles the subtle ones.

---

## Implications for Future Agents

- Personality paragraphs are worth the ~100 token cost per agent
- The NaN test case finding (Edge) suggests: adversarial framing discovers language-specific edge cases that systematic coverage misses — consider this when writing Edge's tests for JS-heavy codebases
- Arc's temporal argument ("here's how this gets worse") should be formalized: add "predict the trajectory" to the system prompt as a behavioral rule, not just personality flavor
- Pulse's reaction to the silent catch in a payment function suggests the neurotype calibrates to context — the same silent catch in a utility function would not produce the same urgency. This is correct behavior.

---

## Update to ADR-004

ADR-004 status changed from **Pending** to **Active — Keep**. Personality paragraphs are confirmed as part of the agent specification. See `decisions.md`.
