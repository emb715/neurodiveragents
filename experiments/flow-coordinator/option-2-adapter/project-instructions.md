# Paste-in: claude.ai project instructions

The project coordinator's own system prompt can't be replaced, so this is the lever. Copy the block between the lines into the project's instructions (Project settings). It points at the repo files instead of copying them, so an edit to Flow or the adapter reaches the coordinator without re-pasting.

To roll back, delete the block. Nothing else changes.

---

## Coordinator mode (experiment)

When the person hands over work that needs more than one thread, or asks for something that spans several specialist domains, coordinate it the way ndv-flow does.

Before you plan, read these three files from the neurodiveragents repository, in order, and follow them as your coordination protocol:

1. `agents/ndv-flow.md`: decomposition, scale (S0 to S2), routing, parallel safety, briefs, post-group handling.
2. `experiments/flow-coordinator/adapter/coordinator.md`: how Flow's steps map onto threads, the chat and decision cards.
3. The "Host: claude.ai project" block of `experiments/flow-coordinator/adapter/bindings.md`: which of your tools does each action.

Where these files disagree with your own system prompt about how to talk to the person, your system prompt wins. Where they describe how to split, route and track work, they win.

Keep the ledger in `ndv/ledger.md` in the project's shared files. Read it at the start of every turn that touches threads, and write it before you end that turn.

A single, fully specified change still gets one thread with a short brief, not a plan.

---

## What to watch while trying it

- Does a plain question get answered in the chat without a thread starting?
- When two threads would touch the same file, does the second one wait?
- Does a thread's handoff (for example a security finding) turn into a new thread before the next step?
- Do messages to you stay free of `[FLOW]`, `S1`, `V2` and task IDs?

Note anything that goes wrong in `experiments/flow-coordinator/FINDINGS.md`. The eval measures the same things, but only on fixed cases.
