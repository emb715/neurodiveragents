# NDV Cognitive Modules — Internal Architecture

This internal doc covers architecture decisions only: how modules are structured, loaded, and derived from their sources. For the user-facing catalog, install commands, and composition patterns, see the canonical catalog: [docs/ndv-skills.md](../../docs/ndv-skills.md).

## Why Modules Exist

Skills encode *what to do*. Modules encode *how to think while doing it*. A planning step that says "investigate the codebase" produces different results when the model approaches it with structural sensitivity (ndv-structural) versus its default generalist processing.

## Architecture

Modules are Agent Skills-compatible (`skills/<name>/SKILL.md`). They use:
- **Frontmatter** for all metadata (source agent, type, origin) — never loaded into model context
- **`user-invocable: false`** — hidden from `/` menu, loaded only when another skill requests it
- **`metadata.type: cognitive-module`** — distinguishes from regular skills programmatically

A skill step file says `Load the \`ndv-skeptical\` skill before proceeding.`; the model calls the skill tool and the body injects. No file paths, no relative path fragility.

## Module Structure

Every module body: cognitive frame (2–3 sentences establishing processing style) → **Primordial rule** (one non-negotiable constraint) → **Constraints** (specific behaviors to adopt) → **Never** (explicit failure modes to avoid). No headings, no metadata prose — pure cognitive content. All routing information lives in frontmatter.

## Files in this directory

The `.human.md` files here are the **source documents** — full format for human reading and editing. The loadable skills in `skills/ndv-*/SKILL.md` are derived from these: metadata moved to frontmatter, body stripped to pure cognitive content. Edit the `.human.md` source, then propagate to the corresponding skill.
