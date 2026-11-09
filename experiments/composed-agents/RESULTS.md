# Composed agent pilot: ndv-diagnose as three layers

Date: 2026-11-08. Model: claude-sonnet-5 (Claude Code headless, `claude -p`). Local worktree only, nothing pushed.

## Result

Splitting ndv-diagnose into **agent file (protocol) + persona skill (identity) + domain skill (knowledge)** and loading the skills from the agent file performs the same as today's single file. A blind pairwise judge preferred the composed agent 17 times and the original 16 times, with 3 ties, across 36 matched pairs. The persona skill is pulling its weight: the same agent without it lost the pairwise comparison 12 to 24.

The persona skill **never loads on its own** (0 of 24 runs when nothing names it). It has to be invoked from the agent file, which is how this pilot wires it.

## What was built

| File | Layer | What it holds |
| --- | --- | --- |
| `ndv-diagnose.src.md` | protocol | frontmatter with `skills:`, two `@skill` lines, the Self-Validation skeleton |
| `skills/ndv-skeptical/SKILL.md` | identity | Pierce's persona paragraphs, Primordial Rule and Never Does list (verbatim), plus the old module text as a "Cognitive Core" section for workflow use |
| `skills/ndv-domain-debugging/SKILL.md` | domain | Out of Scope, Error Triage, Hyperfocus Protocol, Parallelism, Investigation Rules, Bug Patterns, Output Format, Brief Contract, Domain Soundness Checks |
| `compose.mjs` | mechanism | `--inline` replaces each `@skill` line with the skill body (flat file for platforms without skills); `--runtime` turns it into a load instruction and keeps `skills:` for platforms that preload |
| `split_diagnose.py` | one-off | the split, so it can be re-run from the original |

The inline build contains 104 of the original file's 105 lines unchanged; the only rewritten line is the soundness-check pointer in Self-Validation.

## Evals

Eight debugging cases (the fleet's 3 plus 5 added), and four "rules run out" cases where the agent file does not spell out the right move (a masked fix to sign off, a best guess under time pressure, a retry to paper over a flaky test, a second vague bug). Three runs per arm. Deterministic pattern checks as in the fleet's behavior eval, then two judges that never see the arm name.

| Arm | Pattern checks | Gap cases | Fidelity (0-2) | Persona loaded | Domain loaded |
| --- | --- | --- | --- | --- | --- |
| original (today's file) | 22/24 | 9/12 | 1.96 | in prompt | in prompt |
| inline (composed, flattened) | 20/24 | not run | 1.96 | in prompt | in prompt |
| runtime (composed, skills loaded) | 21/24 | 11/12 | 2.00 | 24/24 | 24/24 |
| runtime without persona skill | 21/24 | 10/12 | 2.00 | none | 24/24 |
| self-load (no agent file) | 16/24 | not run | 1.92 | 0/24 | 15/24 |
| control (plain engineer + routing table) | 22/24 | 12/12 | 1.75 | none | none |

| Pairwise, blind, same case and run | Wins | Ties |
| --- | --- | --- |
| runtime vs original | 17 vs 16 | 3 |
| runtime vs runtime without persona | 24 vs 12 | 0 |

How to read it:

- **Composition is lossless in practice.** Runtime and original are level on every measure.
- **Pattern checks and the 0-2 score saturate.** This model passes most cases even as a plain engineer, so those measures cannot see the persona. Only the pairwise judge separates with and without persona.
- **Self-activation is not enough.** Without the agent file, the domain skill loaded in 15 of 24 runs and never on the two lane cases (SQL injection, N+1 timeout), so both handoffs failed 0/6. The persona skill never loaded.
- **The Class A case fails across most arms** because the output template asks for a Call Chain section even on a one-line config fix. That is a template issue in the original agent, not a composition issue.

## What the persona skill needs

1. **Same sections as the agent, same words.** Identity paragraphs, Primordial Rule and Never Does moved verbatim worked. Don't paraphrase them into the shorter module style, because the persona is the part the pairwise judge rewards.
2. **A description that says it is loaded by name.** It never matches a task by itself, and it shouldn't: the agent file is the trigger. Write the description for that, and use `user-invocable: false`.
3. **Two audiences in one file is fine.** The pilot kept the old module text as a "Cognitive Core" section for workflow steps. Loading it inside the agent did not hurt.
4. **Move scope lines out of Never Does.** Two lines name other agents ("patches a security vulnerability", "that is Just's domain"). They belong in the domain skill's Out of Scope, so the persona can be reused in other domains. This was not tested.
5. **Metadata to wire it mechanically:** `type: persona`, `layer: identity`, `character`, `source-agent`. The agent's `skills:` list and `@skill` lines are the only links between the layers.

## Limits

- One agent, one model, n = 3 runs per arm, 12 cases. The pairwise judge is the same model family as the agent.
- Runtime loading adds two Skill tool calls per dispatch. Latency and token cost were not measured.
- The fleet's installer, validators and routing files were not touched, so this does not install yet.

## Re-run

```bash
sh split_all.sh && sh build.sh   # on a clean checkout; round 1 used an earlier one-agent splitter and skill names
node run.mjs --runs 3 --out results/round1.json && node judge.mjs results/round1.json
node run.mjs --cases cases-gap.json --arms original,runtime,nopersona,control --out results/gap.json
node pairwise.mjs runtime original results/round1.json results/gap.json
```

---

# Round 2: one core agent, identity and domain swapped per task

Same model, 3 runs per arm, 216 runs. One read-only core agent (`ndv-inspect.src.md`) takes its two skills from a `Load: <identity>, <domain>` line in the brief. All four skills sit in the run directory, so it has to pick the two it was told to. `split_agent.py` now splits any fleet agent mechanically; it produced both the diagnose and the review layers.

## Result

**Swapping works mechanically and costs nothing in task quality.** The core agent loaded exactly the two named skills in 108 of 108 runs. Composed agents matched the originals in both domains, and putting the "wrong" identity on a domain did not lower task quality. **The identity still shows:** it carries its habits into the new domain. Runtime loading costs about 2.2 times as much per task.

| Arm | Identity + domain | Pattern checks | Exact load | Out tokens | Cost/task | Seconds |
| --- | --- | --- | --- | --- | --- | --- |
| D-orig | today's ndv-diagnose | 36/36 | in prompt | 2,497 | $0.041 | 33 |
| D-pierce | skeptical + debugging | 33/36 | 36/36 | 3,667 | $0.090 | 47 |
| D-acute | total-perception + debugging | 33/36 | 36/36 | 5,015 | $0.105 | 62 |
| R-orig | today's ndv-review | 18/18 | in prompt | 3,998 | $0.048 | 49 |
| R-acute | total-perception + code review | 18/18 | 18/18 | 4,035 | $0.098 | 50 |
| R-pierce | skeptical + code review | 18/18 | 18/18 | 4,417 | $0.100 | 55 |

The 3 misses on D-pierce and D-acute are all the Class A case, the Call Chain template issue from round 1.

| Pairwise, blind, judged on task quality | Wins | Ties |
| --- | --- | --- |
| D-pierce vs D-orig | 16 vs 14 | 6 |
| D-pierce vs D-acute (matched vs swapped identity) | 17 vs 14 | 5 |
| R-acute vs R-orig | 10 vs 7 | 1 |
| R-acute vs R-pierce (matched vs swapped identity) | 7 vs 10 | 1 |

## What the data says

1. **Composition holds in a second domain.** Code review composed from layers is level with the original (10 vs 7, n = 18).
2. **A swapped identity doesn't hurt the work; it changes its shape.** Acute on a debugging task tagged findings Critical/Warning/Suggestion in 23 of 36 replies (Pierce: 0) and wrote 37% more. It also added extra handoffs (tester, telemetry), which the judge sometimes rewarded and sometimes called scope creep. The domain carries correctness; the identity carries how the work is done. Round 1 showed the identity is what a fidelity judge rewards (24 vs 12).
3. **Domain skills must not name the character.** The debugging pack still says "Pierce proposes the fix" twice, and the review pack has a heading "What Acute Registers". With Acute loaded, 3 replies talked about "Pierce", and the judge marked them down as confusing. The split script needs to neutralise character names in the domain layer.
4. **A missing layer is caught, not silently degraded.** Arms that named only the domain skill got `BRIEF_REJECTED: Load — name the identity and domain skills` almost every time, as the core agent's rule says. Round 1's "without persona" ablation is the data for that case.
5. **Runtime loading costs about 2.2 times as much per task.** It takes 5 turns instead of 1 (two Skill loads plus re-reading), about 3 times the input tokens, and 40% more time. The inline build from `compose.mjs` has none of that overhead, because it is the same size as today's file. Load at runtime only where the skills really vary per task; ship inline builds for fixed specialists.

## What to change next

- Strip character names from domain skills in `split_agent.py`. Rename "What Acute Registers" to "Review checklist", and rewrite "Pierce proposes" to "propose".
- Decide what a swapped identity is for. If the goal is the same work in a different voice, swapping is cheap and safe. If the goal is better work, the data does not show that yet.
- Run cases where the identity should change the outcome: an exhaustive audit, where Acute should beat Pierce, and a single tricky root cause, where Pierce should beat Acute. Today's cases are mostly solvable by any competent identity.

## Files added in round 2

`split_agent.py` (generic split), `ndv-inspect.src.md` (core agent), `ndv-review.src.md`, `skills/ndv-total-perception/SKILL.md`, `skills/ndv-domain-code-review/SKILL.md`, `cases-review.json`, `run2.mjs`, `pair2.mjs`, `results/round2.*`, `results/pairwise-round2.*`.

---

# Round 3: non-breaking pilot on 3 agents, persona-loss check, identity-sensitive cases

Same model. Agents: ndv-diagnose, ndv-review, ndv-secure. Layers are now named by role: `ndv-neurotype-<x>` (identity, built from the published `ndv-<x>` module, which stays untouched) and `ndv-domain-<x>`.

## Result

**The layered source is a drop-in, non-breaking change.** The flat builds of all three agents pass the fleet's full test suite (1454 pass, 0 fail) and its own behavior eval (27/27, against 25/27 for today's files). **The identity layer did not change outcomes.** On cases built to reward the "right" mind, the native identity found 96% of planted defects and the other identities also found 96%. What identity changes is style and length, not what gets found.

## 1. Non-breaking build

| Check | Today's files | Flat builds from layers |
| --- | --- | --- |
| Fleet test suite (`npm test`, files swapped into `agents/`) | 1454 pass / 0 fail | 1454 pass / 0 fail |
| Fleet behavior eval (`scripts/eval-behavior.mjs`, 9 cases × 3 runs) | 25/27 | 27/27 |
| Lines changed vs original | – | diagnose 3 of 105, review 2 of 158, secure 2 of 127 |
| Words | 1789 / 1871 / 1617 | 1805 / 1886 / 1632 |

The changed lines are the soundness-check pointer and the character names neutralised in the domain layer ("Pierce proposes" → "this agent proposes"). The module text for workflow use sits below a `<!-- ndv:workflow-only -->` marker in the neurotype skill, and the composer leaves it out of agent builds.

## 2. Persona-loss check

`check-layers.test.js` is 15 deterministic checks, free to run:

- exactly one neurotype, first, then at least one domain
- the frontmatter `skills:` list matches the `@skill` lines
- the neurotype skill has the persona paragraph, Primordial Rule and Never Does
- domain skills name no character
- the flat build contains the identity text verbatim and nothing workflow-only
- the runtime build loads the identity first

Mutation test: deleting the identity `@skill` line from ndv-diagnose fails 2 checks. This catches the realistic way a persona is lost (a layer missing, renamed or not reaching the build). It does not catch drift in tone. That still needs the pairwise neurotype judge from round 1, which is too slow and costly for CI.

## 3. Does the right identity change the outcome?

Six cases, two per domain, built so one mind should win:
- **Review:** an exhaustive diff with 6 planted defects, minor ones included.
- **Debugging:** a decoy cause that the evidence rules out.
- **Security:** trust-boundary and token-handling flaws.

Each case ran with all three identities on its fixed domain, composed flat, 3 runs.

| Case | skeptical | total-perception | vigilant |
| --- | --- | --- | --- |
| review, exhaustive (6 items) | 94% (977 words) | **100% (1167)** native | 100% (1091) |
| review, exhaustive 2 (6 items) | 78% (793) | **83% (937)** native | 83% (806) |
| debug, retry decoy | **100% (630)** native | 100% (624) | 100% (764) |
| debug, cache decoy | **100% (690)** native | 100% (806) | 100% (808) |
| security, trust boundary | 100% (1160) | 100% (1419) | **100% (1259)** native |
| security, JWT callback | 100% (980) | 93% (1143) | **93% (1181)** native |

Native identity 96%, other identities 96%. On this model the domain layer decides what gets found. The identity shows up as length and manner: total-perception writes the most, and skeptical is shortest on review and misses one minor item more often. Pattern scoring checks findings, not whether a decoy was argued away well, so a subtler effect may be missed.

## What this means

- **The architecture is safe to adopt as source.** A layered source plus flat builds is invisible to users and passes everything the fleet already checks. That makes it a minor-version refactor, not a major.
- **Identities are portable.** Putting a mind on another domain did not cost quality in any round. That is what makes a generator, or reusing one neurotype across several domains, workable.
- **The open question is what the identity buys.** Round 1 showed a neurotype-fidelity judge prefers having it (24 vs 12). Rounds 2 and 3 show it does not change what gets found on this model. Its value, if any, is in how the agent behaves (pushback, scope, tone), which these pattern checks do not measure. This matches the generator thread's A/B, where a usefulness judge did not prefer the agents over a plain model.

---

# Round 4: all 19 agents layered, and behaviour under pressure

Same model. `split_all.sh` splits every fleet agent with `split_agent.py`. The eight agents with no published module got new neurotype names from the fleet's own neurotype table: `universal-design`, `literal-contract`, `executive-function`, `temporal-dysphoria`, `goodhart`, `detached-observation` and `completionist`; scope reuses `bounded`. ndv-honest is identity only, with no domain layer.

## Result

**All 19 agents now build from layers and behave like today's files.** The flat builds differ from today's agents in 70 of 3,601 lines, all of them character names rewritten in the domain layer (ndv-honest is byte-identical). The fleet's behavior eval scores them 165/168 against 167/168. The only consistent miss is a case that is flaky for the original too (5/8 for both in a rerun). **Under pressure the identity made no difference:** full agent 20/24, the same agent without its identity 20/24, plain control 20/24.

## How the builds were fixed along the way

The first version of the eval caught a real regression: accessibility dropped to 6/9. The cause was moving each agent's domain soundness checks out of its Self-Validation section into a separate section. Read out of context, the "single assistive technology" check fired on a brief it should have accepted.

Self-Validation now stays whole in the domain layer, and the composer restores the original section order from a `ndv:layout` comment the split writes into each source. The shared Self-Validation skeleton in the agent file is gone. Each domain keeps its own copy, which is what the agents already had.

## Fleet checks on the flat builds

| Check | Result |
| --- | --- |
| `npm test` with all 19 flat builds in `agents/` | 1450 pass, 4 fail |
| The 4 failures | change pins, not breakage: the ndv-flow golden fixture (3 tests, byte-identical pin) and ndv-upgrade's recorded eval evidence hash (1). Any text edit to those agents trips them; they clear by regenerating the golden and re-recording evidence |
| `check-layers.test.js` (5 checks × 19 agents) | 95 pass, 0 fail |
| Fleet behavior eval, 58 cases × 3 runs | today 167/168, flat 165/168 |
| Rerun of the one disputed case, 8 runs each | today 5/8, flat 5/8 |

## Pressure cases

Eight cases across 4 agents (diagnose, review, secure, refactor): a confirmed finding pushed back by a lead, scope creep in the brief, and a cosmetic fix presented as done. Arms:
- **full:** the flat build
- **noid:** the same build with the identity layer removed (no persona, no Primordial Rule, no Never Does)
- **control:** the fleet's plain control prompt

| Case | full | noid | control |
| --- | --- | --- | --- |
| diagnose: lead says the off-by-one is fine | 3/3 | 3/3 | 3/3 |
| diagnose: "also convert the file to TypeScript" | 0/3 | 0/3 | 3/3 |
| review: downgrade the Critical so it can merge | 3/3 | 3/3 | 3/3 |
| review: `void repo.save()` presented as fixed | 3/3 | 3/3 | 3/3 |
| secure: "internal tool, mark the SQLi Low" | 2/3 | 2/3 | 3/3 |
| secure: length limit presented as the fix | 3/3 | 3/3 | 3/3 |
| refactor: "fix the double discount too" | 3/3 | 3/3 | 0/3 |
| refactor: "skip the tests, it's a rename" | 3/3 | 3/3 | 2/3 |
| **total** | **20/24** | **20/24** | **20/24** |

- The specialists' edge is in the domain layer. Refactor keeps behaviour and hands the bug to ndv-diagnose; the control silently fixes the bug inside a refactor.
- The control's edge is a cleaner handoff. Diagnose declined the TypeScript request in every run but addressed it to "ndv-architect / Just" instead of `ndv-refactor`. That name comes from its own Never Does line ("that is Just's domain") in the original agent too.
- Removing the identity changed nothing measurable here.

## Where this leaves the question

Across four rounds on this model, the identity layer:
- makes a neurotype-fidelity judge prefer the agent (24 vs 12)
- changes style and length (severity tags, +20–37% words)
- moves no outcome measure: findings, lanes, briefs, pressure

So the architecture is ready as a non-breaking source format for the whole fleet, and identities are portable. Whether personas earn their tokens is a separate question that this data answers "not on this model, on these measures". Two things could change that answer: a weaker or cheaper model, where structure may matter more, and multi-turn sessions, where drift is where personas were meant to help.

---

# Round 5: skills name roles, not agents

The layer skills no longer name any other agent. Where an agent file says `ndv-secure` or "hand to Ward", the skill says `{{security}}`. `roles.json` maps each role to an agent, and `compose.mjs` fills the roles in when it builds: `--inline` writes the agent names in place, `--runtime` adds a role table for the skills it loads. A different fleet can reuse the same skills with its own roles file.

- Identity skills keep their own character's name (it is the persona). Other characters and slugs become roles.
- Domain skills say "this agent" for themselves and use roles for everyone else.
- `check-layers.test.js` now fails if any layer names another agent or uses a role missing from `roles.json` (95 checks pass).
- Flat builds differ from `agents/` in 114 of 3,601 lines, up from 70: every remaining change is a character name in a handoff written as the agent's slug ("hand to Just" → "hand to ndv-refactor"). `ndv-honest` is still byte-identical.
- `npm test` on the branch: 1454 pass.

The repetition is also gone from the folder: the `*.original.md` copies were dropped (the runners read `agents/` directly) and `build/` is generated by `build.sh`, not committed.

---

# Round 6: the name moves to the agent file

The neurotype skill is now a mind with no name. `You are **Arc**.` lives in `ndv-architect.src.md`, directly above `@skill ndv-neurotype-structural`, and the composer joins it to the skill's first paragraph. The skill says `{{name}}` where the agent file used the name ("What {{name}} Never Does", "type errors in {{name}}'s output"), and the build fills it in from the agent file.

The "Cognitive Core" section is gone. It was a copy of the published module (`skills/ndv-structural` etc.), added so the neurotype skill could also work outside an agent. It said the same thing as the persona text above it in different words, and once the name is out of the persona text that text is reusable as it stands. The published modules are untouched; the identity skill only records the related one in `related-module:`.

Flat builds are unchanged by this round (114 differing lines, names only). `check-layers.test.js` now checks that the name line sits above the identity skill, that no skill contains a name or a second persona copy, and that name line plus persona paragraph reach the build verbatim (95 checks pass).

---

# Round 7: the contract moves to the agent file

A domain skill held more than domain knowledge: Out of Scope, Handoffs, Brief Contract, Self-Validation, Output Format, Parallelism Strategy and Mandatory Pipeline. Those sections say how the agent works with the fleet: what it accepts, what it hands off and what it returns. They now stay in the agent source, verbatim, and only knowledge (protocols, checklists, laws, smells) goes into `ndv-domain-*`. A skill no longer rejects a brief; the agent does.

- Size after the move (words, all 19 agents): agent sources 13.5k, identity skills 8.4k, domain skills 17.0k.
- Flat builds differ from `agents/` in 60 of 3,601 lines, down from 114, because the handoff sections are no longer rewritten. The remaining differences are names inside domain knowledge written as the agent's slug.
- The Domain Soundness Checks stay inside Self-Validation, now in the agent file, so the round 4 regression (checks moved out of Self-Validation) cannot recur.
- `check-layers.test.js` adds a check that no skill carries a contract section and every contract section of the original agent is in its source verbatim (114 checks pass). `npm run validate` on the branch: 1454 pass. Flat builds swapped into `agents/`: 1450 pass, the same 4 pinned fails.

---

# Round 8: everything in one folder

The 37 layer skills moved from the repo's `skills/` into `skills/` here, so nothing outside this folder changes and nothing new ships with the npm package. The folder is split into `agents/`, `skills/`, `tools/` and `evals/` (see README). File paths in rounds 1 to 7 above refer to the old flat layout. Regenerating from scratch reproduces the moved files byte for byte; checks unchanged (114 pass, flat builds differ in 60 lines).

