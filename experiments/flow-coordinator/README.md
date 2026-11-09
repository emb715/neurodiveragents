# Experiment: Flow as a project coordinator

Can ndv-flow coordinate a project chat with long-running threads, tools and a person who comes and goes, instead of one blocking terminal session? This folder builds every option side by side so we can see what works before choosing. **Nothing here changes the shipped fleet**: `agents/ndv-flow.md`, `bin/`, `scripts/`, `test/` and the routing table are untouched, and `npm run validate` doesn't look in this folder.

Spec: [Flow as project coordinator: options 2 and 3](https://claude.ai/artifact/Fb3S5W5sgwbQqSgCGxK8Mk). Results so far: [FINDINGS.md](FINDINGS.md).

## What's here

| Path | What it is |
|---|---|
| `adapter/coordinator.md` | The coordinator-mode text loaded after Flow. Maps Flow's Task calls, sentinels, register and reports onto threads, wakes, a saved ledger and a chat. Host-neutral: six actions, no tool names |
| `adapter/bindings.md` | One block per host naming the real tool for each action: terminal, claude.ai project, the option-3 host |
| `adapter/assemble.mjs` | Builds the prompt: Flow's body (read live) + adapter + one host block. Every option and the eval load prompts through it |
| `option-2-adapter/claude-flow-coordinator` | Option 2 in a terminal: `claude-flow` with the adapter appended |
| `option-2-adapter/project-instructions.md` | Option 2 in a claude.ai project: the block to paste into project instructions |
| `option-3-sdk-host/` | Option 3: our own host on the Claude Agent SDK. Event loop, saved ledger, one worker session per thread in its own git worktree, terminal chat |
| `eval/` | 10 coordinator cases and a three-arm runner: plain model vs Flow alone vs Flow plus adapter |

## The three options

**Option 1: Flow as it ships.** `bin/claude-flow ndv-flow` runs Flow as the main prompt of a terminal Claude Code session. No changes, no threads, no chat. It is the `flow` arm of the eval, which is how we find out what the adapter adds.

**Option 2: the adapter, in a host that already has threads.** Flow plus `adapter/coordinator.md`.

```bash
# terminal (subagents stand in for threads, ledger in ./.ndv/)
experiments/flow-coordinator/option-2-adapter/claude-flow-coordinator

# see the exact prompt it loads
NDV_COORDINATOR_PRINT=1 experiments/flow-coordinator/option-2-adapter/claude-flow-coordinator | less
```

For a claude.ai project, paste the block in `option-2-adapter/project-instructions.md` into the project instructions. The project's own coordinator prompt can't be replaced, so this is a pointer that tells it to read Flow and the adapter from the repo.

**Option 3: our own host.** Same adapter text, but the host enforces in code what option 2 can only ask for in a prompt: file ownership and queueing, the quiet-thread timer, resume after a restart, and the coordinator never seeing a worker's transcript.

```bash
cd experiments/flow-coordinator/option-3-sdk-host
npm install
npm test                                            # 21 tests, fake model, no tokens
node src/cli.js --repo /path/to/project             # real run: chat in the terminal
node src/cli.js --print-prompt                      # the coordinator's system prompt
```

In the terminal chat: plain text goes to the coordinator, `/t 3 <text>` writes into thread T3, `/d 1 <answer>` answers decision D1, `/ledger` prints the ledger. State lives in `<repo>/.ndv/coordinator/`; each thread works on branch `ndv/T<ID>` in its own worktree. Merging those branches back is yours to do.

How a wake works: every input (a chat message, a thread finishing or going quiet, an answered decision) becomes one event. The coordinator gets the event and the ledger table, acts through six MCP tools, and its session is resumed on the next event. A worker is a separate Agent SDK session whose system prompt is its agent file and whose allowed tools are that agent's own `tools:` list; anything else is denied. When it stops, the host reads its final reply for the sentinel, handoff lines and `FILES:` line, and passes only those and a 200-word summary to the coordinator.

## Measuring it

```bash
node experiments/flow-coordinator/eval/run.mjs --dry           # what would run
node experiments/flow-coordinator/eval/run.mjs                 # Haiku 4.5 + Sonnet 5, 1 run each, 60 calls
node experiments/flow-coordinator/eval/run.mjs --runs 3 --out experiments/flow-coordinator/eval/results/<name>.json
node --test experiments/flow-coordinator/eval/cases.test.js    # fixture integrity, no tokens
```

Every arm gets the same action format and the same wake input; the arms differ only in Flow and the adapter. The control arm is built the way `scripts/eval-behavior.mjs` builds its control: routing table, handoff line, `BRIEF_REJECTED` and the ledger format, nothing else. Scoring reuses `scripts/behavior-checks.mjs`. The project's rule decides: ship only if Flow plus adapter beats the control (EARNS) and beats Flow alone (GAIN) on every model.

The cases test the text layer. The host's guarantees are tested in code by `option-3-sdk-host/test/host.test.js`.

## Where it stands

After 3 runs on Haiku 4.5 and Sonnet 5, Flow plus the adapter beats both the plain model and Flow alone, by 3 to 4 checks out of 75. Flow alone scores below the plain model. Two live runs of option 3 each found a real bug that the fake-model tests couldn't; both are fixed. Details in [FINDINGS.md](FINDINGS.md).

## How to pivot from here

- **Adapter earns on both models**: option 2 is worth promoting. Move `adapter/` to `skills/ndv-coordinator/`, add `--with` to `bin/claude-flow`, and move the cases next to the behavior fixture.
- **Flow alone already passes**: the adapter isn't earning its place. Keep option 1 and drop the rest.
- **The adapter helps on text but a prompt can't hold the rules** (overlap, quiet threads, restarts): that's the case for option 3, where those are code.
- **Nothing beats the control**: Flow's protocol doesn't transfer to async coordination; stop here.
