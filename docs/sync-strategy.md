# Agent File Sync Strategy

How to keep model files and human files in sync as the fleet evolves.

---

## The Two-File Reality

Every agent has two representations:

| File | Location | Audience | Purpose |
|------|----------|----------|---------|
| `agents/ndv-[x].md` | loaded into model context | the model | behavioral rules, routing, output format |
| `docs/ndv-[x].human.md` | read by contributors | humans | neurotype, personality, rationale, when to use |

They serve different audiences with different needs. They will drift if not actively maintained.

---

## What lives where

### Model file (`agents/ndv-[x].md`) contains:
- YAML frontmatter (name, description, agent, tools)
- Personality paragraph (the "You are X" opening)
- Out of Scope section with ndv-command (domain) handoffs
- Primordial Rule
- Domain-specific protocols and checklists
- Output format
- "What X Never Does" section

### Human file (`docs/ndv-[x].human.md`) contains:
- Who is [Name]? (character summary)
- Neurotype (explained for a human reader)
- Personality (narrative, not rules)
- Why it works (design rationale)
- When to use / not use
- Invocation examples

### Never in model files:
- Design rationale ("we chose this neurotype because...")
- Historical context ("this replaced the old monitoring agent...")
- Contributor notes
- Extended narrative beyond the identity paragraph

### Never in human files:
- Behavioral rules the model must follow
- Output format specifications
- Checklist items
- Handoff routing instructions

---

## Sync Protocol

### When you edit a model file

Ask: did I change something that affects human understanding of the agent?

| Change type | Update human file? |
|-------------|-------------------|
| Fixed a handoff command | No |
| Changed output format | Maybe — if it changes what users see |
| Updated checklist | No |
| Changed personality paragraph | Yes — human file should reflect the mood |
| Changed primordial rule | Yes — it defines the agent's core |
| Changed neurotype framing | Yes — always |
| Added a new protocol section | Maybe — if it changes when to use the agent |

### When you edit a human file

Human files are informational only. Changes here never require model file updates.

Exception: if you discover the human file describes behavior that doesn't match the model file, the model file is the source of truth — update the human file to match.

### When you add a new agent

1. Write the model file first (`agents/ndv-[x].md`)
2. Test it — run at minimum D2 (output quality) from the benchmark
3. Write the human file after the model file is stable (`docs/ndv-[x].human.md`)
4. Update CLAUDE.md routing table
5. Update docs/ndv-agents.md doctrine

Never write the human file first — it produces documentation for an agent that doesn't work yet.

---

## Review Triggers

Human files go stale silently. These events should trigger a human file review:

- Agent name changed
- Neurotype reframed
- Personality paragraph rewritten
- Primordial rule changed
- Agent scope changed (new out-of-scope items added)
- Benchmark reveals the agent behaves differently than documented

---

## Build Step (future)

When the fleet is stable, replace the two-file approach with a single source + build:

```
agents/src/ndv-[x].src.md     # single source of truth
  → agents/ndv-[x].md          # model-optimized (strips narrative sections)
  → docs/ndv-[x].human.md      # human-readable (strips behavioral rules)
```

The build step:
1. Reads each `.src.md`
2. Extracts sections tagged `<!-- model -->` into the model file
3. Extracts sections tagged `<!-- human -->` into the human file
4. Shared content (identity paragraph, primordial rule) goes into both

---

## Drift Detection

Run this check before any release:

```bash
# Check that every agent has a human file
for f in agents/ndv-*.md; do
  name=$(basename $f .md)
  if [ ! -f "docs/$name.human.md" ]; then
    echo "MISSING human file: docs/$name.human.md"
  fi
done

# Check that human files don't reference old character names or commands
grep -rn "ndv-patient\|ndv-pierce\|ndv-debug\|ndv-test[^e]" docs/
```

---

## Naming Convention

Model file: `agents/ndv-[command].md`
Human file: `docs/ndv-[command].human.md`

The command is the stable identifier. Character names (Honest, Patient, Pierce...) appear in both but are cosmetic — the command is the key.

If a command is renamed, both files must be renamed and all internal references updated (use the Python replacement script in the repo root).
