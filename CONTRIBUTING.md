# Contributing to neurodiveragents

## What contributions are welcome

- New agents
- Improvements to existing agent behavior (primordial rules, protocols, checklists)
- Bug fixes (wrong handoff commands, stale references, broken install logic)
- New tool support (beyond Claude Code, OpenCode, Cursor, Copilot)
- Benchmark runs and results

Not welcome: purely cosmetic changes, personality rewrites without behavioral rationale, renaming agents without strong justification.

---

## Adding a new agent

### 1. Read the doctrine first

`docs/ndv-agents.md` defines the neurotype framework. Every agent must have:
- A neurotype that genuinely fits the domain
- A primordial rule that emerges from the neurotype (not just a domain rule)
- Personality that describes the experience of invoking it — mood, not just behavior
- An "Out of Scope" section with explicit handoffs using `ndv-[command] (domain)` format

If you can't answer "what neurotype is this and why does it fit?" the agent isn't ready.

### 2. Name it

Command names describe the action, not the character:
- `ndv-review` not `ndv-acute`
- `ndv-diagnose` not `ndv-pierce`

Character names (the `agent:` frontmatter field) are human virtue/trait words that work as both a person's name and a description of what it feels like to invoke the agent. See existing agents for the pattern.

### 3. Write the model file

Location: `agents/ndv-[command].md`

Required sections in order:
1. YAML frontmatter (`name`, `description`, `agent`, `tools`)
2. Identity paragraph ("You are **X**...") — personality, not rules
3. Out of Scope — explicit handoffs, `ndv-[command] (domain)` format only
4. Primordial Rule
5. Domain protocol (workflow, parallelism strategy)
6. Checklists
7. Output format
8. "What X Never Does"

Keep it lean. Every line must change model behavior. If cutting it wouldn't change output, cut it.

### 4. Write the human file

Location: `docs/ndv-[command].human.md`

Required sections: Who is [Name]?, Neurotype, Personality, Why it works, When to use, Invocation examples.

Write the model file first. Test it. Write the human file after the model file is stable.

### 5. Update routing

Add to `CLAUDE.md` routing table. Add to `README.md` agent table. The `description:` frontmatter field is the primary routing signal for automatic delegation — make it precise.

### 6. Log the decision

If the new agent involved a non-obvious design decision (why this neurotype, why this command name, why this scope boundary), add an entry to `docs/decisions.md`.

---

## Editing an existing agent

### Model file changes

The sync protocol is in `docs/sync-strategy.md`. Short version:

| Change | Update human file? |
|--------|-------------------|
| Handoff command | No |
| Output format | Maybe |
| Personality paragraph | Yes |
| Primordial rule | Yes |
| Neurotype framing | Yes |
| Scope boundary | Yes |

Model file is source of truth. Human file follows.

### Renaming an agent

1. Rename the file: `mv agents/ndv-old.md agents/ndv-new.md`
2. Update `name:` in frontmatter
3. Run the replacement script:
   ```bash
   find . -not -path '*/.git/*' \( -name "*.md" -o -name "*.js" -o -name "*.sh" \) | \
     xargs sed -i '' 's/ndv-old/ndv-new/g'
   ```
4. Rename the human file: `mv docs/ndv-old.human.md docs/ndv-new.human.md`
5. Run drift detection (see below)
6. Update `CLAUDE.md`, `README.md`, `docs/decisions.md`

### Drift detection

Run before every PR:

```bash
# Check every agent has a human file
for f in agents/ndv-*.md; do
  name=$(basename $f .md)
  if [ ! -f "docs/$name.human.md" ]; then
    echo "MISSING: docs/$name.human.md"
  fi
done

# Check for stale character names in agent files
grep -rn "→ Honest\|→ Patient\|→ Pierce\|→ Acute\|→ Just\|→ Ward\|→ Lean\|→ Pulse\|→ Arc\|→ Edge" agents/

# Check for stale command names anywhere
grep -rn "ndv-debug\|ndv-test[^e]\|ndv-docs\|ndv-patient\|ndv-pierce" . --include="*.md" --include="*.js" --include="*.sh"
```

---

## Handoff protocol

All inter-agent references use this format — no exceptions:

```
**Handoff → ndv-[command] ([domain]):** [what was found]
```

Examples:
```
**Handoff → ndv-diagnose (root cause):** null check missing before reduce
**Handoff → ndv-secure (SQL injection):** username concatenated into query
**Handoff → ndv-optimize (N+1):** db call inside users.map loop
**Handoff → ndv-tester (missing coverage):** no test for discount cap
```

Character names (`Pierce`, `Ward`, etc.) are never used as routing targets. Commands only.

---

## Running the benchmark

Before submitting a PR that changes agent behavior, run the affected agent's D2 (output quality) and D4 (scope containment) cases from `docs/personality-benchmark.md`.

For new agents, run all five dimensions.

Report results in the PR description.

---

## Commit style

```
type: short description

Types: add, fix, update, remove, docs, refactor
```

Examples:
```
add: ndv-planner agent — ADHD time-blindness as scheduling superpower
fix: ndv-tester scope gate — was fixing source bugs instead of flagging
update: Ward primordial rule — tighten language on trust boundary
docs: add ndv-arc human file
```

One logical change per commit. Don't bundle agent additions with refactors.

---

## Versioning

`package.json` version follows semver:
- Patch (1.0.x): bug fixes, wording improvements, human file updates
- Minor (1.x.0): new agent, new tool support, behavioral improvement to existing agent
- Major (x.0.0): breaking change to install format, agent command renamed, neurotype framework changed

Update version in `package.json` and tag the release before publishing to npm.
