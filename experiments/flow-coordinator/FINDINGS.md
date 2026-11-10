# Findings

Running log of what the experiment has shown. Newest first.

## 2026-11-09: first build, eval and live runs

### Eval: coordinator cases, three arms

Fixture v2 (10 cases, 25 checks), scored by `scripts/behavior-checks.mjs`. One run per arm and model from `results/2026-11-09-run1.json`, two from `results/2026-11-09-run2-3.json`, merged with `--rescore` into `results/2026-11-09-combined.json`. Provider: the Claude CLI (`scripts/eval-providers/claude.sh`), no API key in the session, so a user-level `CLAUDE.md` could load into scoring calls (the same caveat the main eval documents).

Checks passed out of 75 (10 cases × 3 runs), and cases fully passed out of 30:

| Model | Plain model (control) | Flow alone (option 1) | Flow + adapter (options 2, 3) | Adapter vs control | Adapter vs Flow |
| --- | --- | --- | --- | --- | --- |
| Haiku 4.5 | 66 · 24 | 62 · 19 | **70 · 27** | EARNS | GAIN |
| Sonnet 5 | 68 · 24 | 64 · 20 | **71 · 28** | EARNS | GAIN |

The project's ship rule (EARNS and GAIN on every model) is met, but by thin margins: 4 and 3 checks out of 75 over the plain model. Three runs per arm is enough to rank the arms, not enough to call a 3-check gap settled. Opus wasn't run.

The clearest result is not the adapter's gain but Flow's loss: **Flow alone scores below the plain model on both models.** Flow's text is written for a terminal subagent loop, and in a chat it leaks `[FLOW]`, `S1` and sentinels into messages to the person, routes plain questions, and re-briefs a rejected thread a third time. The adapter mostly earns its place by undoing that.

Run 1 used the sdk-host binding before two lines were added to it (final text isn't shown to the person; write repo-relative paths). Runs 2 and 3 used the current text.

What the per-case numbers say:

| Case | What happened |
| --- | --- |
| `plain-report` | Flow alone put `[FLOW]` blocks or scale tokens in the chat in 3 of 6 and 4 of 6 runs. Control and adapter: 0 |
| `direct-question` | Flow alone routed or answered outside the chat in 3 of 6 runs on Haiku. Adapter: one miss on Haiku, a bare answer with no `post_message` (option 3's host now forwards that case) |
| `rejected-twice` | Flow alone re-briefed a third time, or put the question in a `[FLOW] BLOCKED` chat message instead of a decision, in 3 of 12 runs. Adapter: 0 |
| `person-widened-thread` | The control on Sonnet missed widening the steered thread's files in 2 of 3 runs. Flow and adapter: 0 misses. Flow's register discipline carries over |
| `facts-to-memory` | Weak for every arm on Haiku (3 to 5 of 9): it summarises the facts in a chat message instead of saving them. The adapter's `save_fact` line isn't strong enough on a small model |
| `conflicting-advice` | Adapter on Sonnet missed 2 of 6: it merged the two positions itself (build the cache, invalidate on revoke) instead of asking. The security thread's own summary offers that merge, so the case is closer to a judgment call than the others; treat it as one before tightening the adapter |
| `handoff-on-return`, `overlap-queues`, `silent-thread` | Every arm passed every run. These no longer separate the arms; harder variants are needed |

### Scoring fixes made after run 1

Run 1 under-counted all three arms. Two checks were wrong, not the models:

- Several replies spread one action over several lines (a `request_decision` with its options on separate lines). The checks read only one line, so a correct decision card scored as a miss. Fixture v2 reads one whole action, up to the `)` that ends a line, and never the prose or the action after it. `eval/cases.test.js` now covers both directions.
- `overlap-queues` only accepted queueing the new task. Two models instead handed it to the thread that already owns the file. That keeps one owner per file, which is what the case is about, so v2 accepts either.

Re-scoring run 1 with v2 (no new calls) moved Haiku from WORSE to NO GAIN against the control. That is why every number above is from v2.

### Live runs of option 3 (Haiku 4.5 as coordinator and worker)

Two real end-to-end runs through the Agent SDK on a throwaway repo. Both found a bug the fake-model tests could not:

1. **A plain question got no answer.** Asked how to run the tests, the coordinator answered correctly, but in its final text, not with `post_message`, so the person saw nothing. Fixed twice over: the sdk-host binding now says final text isn't shown, and the host forwards a wake's final text when the person is the one waiting (a chat message or an answered decision) and nothing was posted. Final text from thread events is not forwarded, since it can be a private `[FLOW]` note.
2. **A worker wrote outside its worktree.** The coordinator works from the repo root and put absolute paths in the brief; the worker followed them and wrote `hello.txt` into the main checkout. Fixed in code: `src/guard.js` denies file writes outside the thread's worktree and any tool not in the agent's own `tools:` list, briefs and file lists are rewritten to repo-relative paths, and the brief footer says so.

After the fixes, the same two runs behaved: the question was answered in the chat with no thread, and the file request became one `ndv-build` thread (scale S0) that wrote `hello.txt` in its own worktree on branch `ndv/T1`, with the main checkout untouched.

### Live run of option 2 in a terminal

`claude-flow-coordinator -p "How do I run the unit tests here?"` answered from the README directly, without dispatching anything. That is the behavior `docs/claude-flow.md` lists as Flow's known limitation in primary mode.

### Option 1 in a terminal: `bin/claude-flow` doesn't start on Linux

`bin/claude-flow` calls `mktemp -t claude-flow`, which is BSD syntax. GNU `mktemp` refuses a template without `XXX` (`mktemp: too few X's in template 'claude-flow'`), so the script exits before starting Claude. It works on macOS. This is in the shipped script, not the experiment; the experiment's own launcher uses `mktemp -t ndv-coordinator.XXXXXX`, which works on both. Not fixed here, since this branch doesn't touch shipped files.

### 2026-11-10: the terminal looked frozen

EMB's first real run: after typing a message, nothing showed until the coordinator posted, which can take a minute or more while threads run. Both runners now report each tool call, and the host turns them into progress lines on any surface that implements `status()` (the terminal does; `--quiet` turns it off). A heartbeat line every 15 seconds covers a model that is thinking without calling tools. The lines show what is being done, not the model's reasoning: the SDK doesn't stream the coordinator's thinking, and printing its draft text would show the person words the coordinator didn't choose to send.

### Not measured yet

- Option 2 inside a claude.ai project. It needs the project-instructions block pasted by hand, and the coordinator there can't be scored by this harness.
- Option 3 with more than one thread at a time against a real model. The queueing, quiet timer and restart are covered by the fake-model tests only.
- Opus. The eval ran Haiku 4.5 and Sonnet 5, the two cheapest models in the routing baseline.
