#!/usr/bin/env bash
# neurodiveragents install script
# Usage: ./install.sh [tool]
# Tools: claude (default), opencode, cursor, copilot

set -e

AGENTS_DIR="$(cd "$(dirname "$0")/agents" && pwd)"
TOOL="${1:-claude}"

NDV_BLOCK='<!-- ndv:start -->
# neurodiveragents

This project uses the neurodiveragents fleet. When a task matches an agent domain, read the agent file and apply its patterns directly. Do not use the Task tool unless explicitly asked.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| Code review, PR, code smells, quality | `ndv-review` |
| Bug, failing test, root cause, stack trace | `ndv-diagnose` |
| Rename, extract, restructure, modernize syntax | `ndv-refactor` |
| Generate tests, improve coverage | `ndv-tester` |
| Security vulnerabilities, OWASP, auth issues | `ndv-secure` |
| Slow code, N+1 queries, bundle size, latency | `ndv-optimize` |
| Add logging, metrics, traces, health checks | `ndv-telemetry` |
| System design, SOLID violations, architecture review | `ndv-architect` |
| Technical docs, API docs, session notes | `ndv-explain` |
| No specialist match / direct opinionated answer only | `ndv-honest` |

## Proactive Application

Apply without being asked when the signal is clear:

- Stack trace shared → apply `ndv-diagnose`
- PR or files to review → apply `ndv-review`
- "it'\''s slow" or slow query → apply `ndv-optimize`
- "clean this up" or rename → apply `ndv-refactor`
- Code with no tests → suggest `ndv-tester`
- Add logging or observability → apply `ndv-telemetry`

## Conflict Resolution (use highest-priority match)

1. Stack trace / exception / failing test / "debug" language → `ndv-diagnose` (even if the code is auth/payment)
2. Explicit vulnerability/audit/exploit language → `ndv-secure`
3. Explicit performance/latency/slow language → `ndv-optimize`
4. If still ambiguous: diagnose first with `ndv-diagnose`, then hand off
5. `ndv-honest` handles anything — it is a pure communication layer, not a router.

Example: "500 error + NullPointerException stack trace in login endpoint" → `ndv-diagnose`
Example: "Should we switch to pnpm?" → `ndv-honest`

## How to Apply

1. Read the agent file
2. Follow its workflow, checklist, and output format
3. Execute using available tools directly

## Parallelism Default

All agents default to parallel execution for 4-8 independent files/items.
<!-- ndv:end -->'

write_routing() {
  local file="$1"

  if [ -f "$file" ]; then
    if grep -q "ndv:start" "$file"; then
      echo "  ndv block already present in $file — skipping"
      return
    fi
    printf '\n\n%s\n' "$NDV_BLOCK" >> "$file"
    echo "  Appended ndv routing block to existing $file"
  else
    printf '%s\n' "$NDV_BLOCK" > "$file"
    echo "  Created $file with ndv routing block"
  fi
}

install_copilot() {
  mkdir -p .github
  OUTFILE=".github/copilot-instructions.md"

  cat > "$OUTFILE" <<'HEADER'
# neurodiveragents — Copilot Instructions

This project uses the neurodiveragents fleet. When a task matches an agent domain, apply that agent's patterns directly.

## Routing Table

| When the task involves... | Use agent |
|--------------------------|-----------|
| Code review, PR, code smells, quality | ndv-review |
| Bug, failing test, root cause, stack trace | ndv-diagnose |
| Rename, extract, restructure, modernize syntax | ndv-refactor |
| Generate tests, improve coverage | ndv-tester |
| Security vulnerabilities, OWASP, auth issues | ndv-secure |
| Slow code, N+1 queries, bundle size, latency | ndv-optimize |
| Add logging, metrics, traces, health checks | ndv-telemetry |
| System design, SOLID violations, architecture review | ndv-architect |
| Technical docs, API docs, session notes | ndv-explain |
| No specialist match / direct opinionated answer only | ndv-honest |

---

HEADER

  for f in "$AGENTS_DIR"/*.md; do
    name="$(basename "${f%.md}")"
    # strip YAML frontmatter (lines between first and second ---)
    content="$(awk '/^---/{n++; if(n==2){found=1; next}} found' "$f")"
    printf '# Agent: %s\n\n%s\n\n---\n\n' "$name" "$content" >> "$OUTFILE"
  done

  echo "Copilot instructions written to $OUTFILE"
}

case "$TOOL" in
  claude)
    DEST=".claude/agents"
    mkdir -p "$DEST"
    cp "$AGENTS_DIR"/*.md "$DEST/"
    echo "Agents installed to $DEST/"
    write_routing "CLAUDE.md"
    echo "Done. The full neurodiveragents fleet is ready."
    ;;
  opencode)
    DEST=".opencode/agents"
    mkdir -p "$DEST"
    cp "$AGENTS_DIR"/*.md "$DEST/"
    echo "Agents installed to $DEST/"
    write_routing ".opencode/AGENTS.md"
    echo "Done. The full neurodiveragents fleet is ready."
    ;;
  cursor)
    DEST=".cursor/rules"
    mkdir -p "$DEST"
    for f in "$AGENTS_DIR"/*.md; do
      cp "$f" "$DEST/$(basename "${f%.md}.mdc")"
    done
    echo "Agents installed to $DEST/ (converted to .mdc)"
    write_routing ".cursor/rules/ndv.mdc"
    echo "Done. The full neurodiveragents fleet is ready."
    ;;
  copilot)
    install_copilot
    ;;
  *)
    echo "Unknown tool: $TOOL"
    echo "Usage: ./install.sh [claude|opencode|cursor|copilot]"
    exit 1
    ;;
esac
