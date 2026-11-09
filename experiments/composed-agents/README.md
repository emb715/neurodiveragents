# Composed agents (experiment)

Every agent in `agents/` is rebuilt here from three layers. Nothing in `agents/`, routing or the published modules changes.

| Layer | Where | What it holds |
|---|---|---|
| Agent source | `<slug>.src.md` | Frontmatter, the section order, one `@skill` line per layer |
| Identity | `skills/ndv-neurotype-<x>/` | Persona, Primordial Rule, Never Does |
| Domain | `skills/ndv-domain-<x>/` | Everything else: Out of Scope, protocols, Brief Contract, Self-Validation |

The skills never name another agent. They say `{{security}}`, `{{debugging}}` and so on, and `roles.json` says which agent plays each role.

```bash
sh split_all.sh   # agents/ -> sources + layer skills (reads agents from git HEAD)
sh build.sh       # sources -> build/inline (flat, like agents/ today), build/runtime, build/noid
node --test check-layers.test.js
```

- `split_agent.py`, `split_all.sh`: the splitter and the agent → neurotype/domain map
- `compose.mjs`: builds one source (`--inline` or `--runtime`, `--roles` for another mapping)
- `ndv-inspect.src.md`: the round 2 core agent that takes its layers from a brief's `Load:` line
- `run*.mjs`, `cases-*.json`, `results/`: eval rounds 1 to 4
- `RESULTS.md`: what each round found
