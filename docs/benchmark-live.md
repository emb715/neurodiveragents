# Live Install Benchmark

Validates the fleet in a real installed project — routing, install correctness, tool-specific behavior. Complements the personality benchmark (which tests output quality via system prompt injection) with end-to-end testing from `npx ndv install` through agent invocation.

Run this before any major release.

---

## Setup

```bash
# Create a clean test project
mkdir /tmp/ndv-live-test && cd /tmp/ndv-live-test
git init && echo "# Test Project" > README.md

# Install into Claude Code
npx neurodiveragents install claude

# Verify
ls .claude/agents/      # should show 10 ndv-*.md files
cat CLAUDE.md           # should contain <!-- ndv:start --> block
```

---

## Phase 1 — Install Correctness

| Check | Expected | Pass? |
|-------|----------|-------|
| 10 agent files in `.claude/agents/` | `ndv-architect.md` through `ndv-tester.md` | — |
| CLAUDE.md routing block present | `<!-- ndv:start -->` and `<!-- ndv:end -->` | — |
| Existing CLAUDE.md content preserved | Any pre-existing content untouched | — |
| Second install is idempotent | "already present — skipping" | — |
| `npx ndv list` shows 10 agents with character names | Honest, Patient, Pierce... | — |

---

## Phase 2 — Routing (5 prompts, fresh session each)

Open a Claude Code or OpenCode session in the test project. Paste each prompt cold — no agent named. Record which agent fires.

| Prompt | Expected | Selected | Pass? |
|--------|----------|----------|-------|
| "500 error in production, stack trace attached" | ndv-diagnose | — | — |
| "Review this PR before merge" | ndv-review | — | — |
| "We have no visibility into the payment service" | ndv-telemetry | — | — |
| "This endpoint takes 8 seconds" | ndv-optimize | — | — |
| "Should we use a monorepo?" | ndv-honest | — | — |

---

## Phase 3 — Agent Invocation (3 agents, fixed input)

Invoke each agent directly. Score output against the rubric.

**ndv-diagnose (Pierce)**
Input: `TypeError: Cannot read properties of undefined (reading 'id') at orderController.js:34`
Pass criteria: root cause identified (not just location), verification step included, no security patch written.

**ndv-secure (Ward)**
Input: login endpoint with SQL string concatenation
Pass criteria: SQL injection classified Critical, exploit shown, OWASP A03 named, no perf suggestions.

**ndv-tester (Edge)**
Input: `calculateDiscount(price, userTier, couponCode)` with no tests
Pass criteria: adversarial cases first, NaN case present, happy path last, no source edits.

---

## Phase 4 — Scope Containment (2 bait inputs)

**ndv-telemetry bait:** `processPayment()` with silent catch AND obvious N+1 query
Expected: instruments function, flags N+1 to ndv-optimize, does NOT touch the query.

**ndv-refactor bait:** file to refactor with a failing test already in it
Expected: refactors code, flags failing test to ndv-diagnose, does NOT fix the test.

---

## Phase 5 — Cleanup

```bash
rm -rf /tmp/ndv-live-test
```

---

## Scorecard

| Phase | Checks | Passed | Notes |
|-------|--------|--------|-------|
| 1. Install | 5 | — | — |
| 2. Routing | 5 | — | — |
| 3. Invocation | 3 | — | — |
| 4. Containment | 2 | — | — |
| **Total** | **15** | — | — |

Pass threshold: 13/15 (87%).

---

## Last live run

Date: not yet run
Tool: —
Result: —
