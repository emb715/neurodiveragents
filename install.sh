#!/usr/bin/env bash
# neurodiveragents install script
# Usage: curl ... | bash -s [claude|opencode|cursor|copilot]
# Or:    ./install.sh [claude|opencode|cursor|copilot]

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$REPO_DIR/agents"
COMMANDS_DIR="$REPO_DIR/commands"
TOOL="${1:-}"
SUBTASK2="@spoons-and-mirrors/subtask2@latest"

# ── Agents that require Task tool (Claude Code only) ─────────────────────────
TASK_AGENTS="ndv-flow"

requires_task() {
  local name="$1"
  for a in $TASK_AGENTS; do
    [ "$a" = "$name" ] && return 0
  done
  return 1
}

# ── Transform Claude Code frontmatter → OpenCode frontmatter ─────────────────
# Strips the YAML list tools: block, injects mode: subagent
transform_for_opencode() {
  local src="$1" dest="$2"
  # Remove tools: list block (lines starting with "  - ") after "tools:"
  # Then inject mode: subagent before closing ---
  awk '
    /^tools:/ { in_tools=1; next }
    in_tools && /^  - / { next }
    in_tools { in_tools=0 }
    /^---/ && found_first { print "mode: subagent"; found_first=0 }
    /^---/ { found_first=1; print; next }
    { print }
  ' "$src" > "$dest"
}

# ── Routing block ─────────────────────────────────────────────────────────────
NDV_BLOCK='<!-- ndv:start -->
# neurodiveragents

This project uses the neurodiveragents fleet. When a task matches an agent domain, use the Task tool with the matching subagent_type. Pass full context in the prompt — subagents have no prior conversation history.

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

1. Use the Task tool with `subagent_type: ndv-<specialist>`
2. Pass full context in the prompt (task description, relevant files, error messages, goals) — subagents have no prior conversation history
3. For parallel work: spawn multiple Task calls in a single message

## Parallelism Default

All agents default to parallel execution for 4-8 independent files/items.
<!-- ndv:end -->'

write_routing() {
  local file="$1"
  local dir
  dir="$(dirname "$file")"
  [ "$dir" != "." ] && mkdir -p "$dir"

  if [ -f "$file" ]; then
    if grep -q "ndv:start" "$file"; then
      echo "  ndv block already present in $file — skipping"
      return
    fi
    printf '\n\n%s\n' "$NDV_BLOCK" >> "$file"
    echo "  Appended ndv routing block to existing $file"
  else
    printf '%s\n' "$NDV_BLOCK" > "$file"
    echo "  Created $file"
  fi
}

# ── inject subtask2 into opencode.json ───────────────────────────────────────
inject_subtask2() {
  local file="opencode.json"
  if [ -f "$file" ]; then
    if grep -q "subtask2" "$file"; then
      echo "  subtask2 already in $file — skipping"
      return
    fi
    # Use node if available to safely merge JSON
    if command -v node >/dev/null 2>&1; then
      node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$file', 'utf8'));
        cfg.plugin = [...(cfg.plugin || []), '$SUBTASK2'];
        fs.writeFileSync('$file', JSON.stringify(cfg, null, 2) + '\n');
      "
    else
      # Fallback: naive append before last }
      sed -i.bak 's/}$/,\n  "plugin": ["'"$SUBTASK2"'"]\n}/' "$file" && rm -f "$file.bak"
    fi
    echo "  subtask2 added to $file"
  else
    printf '{\n  "plugin": ["%s"]\n}\n' "$SUBTASK2" > "$file"
    echo "  Created $file with subtask2 plugin"
  fi
}

# ── install claude ────────────────────────────────────────────────────────────
install_claude() {
  local dest=".claude/agents"
  mkdir -p "$dest"
  for f in "$AGENTS_DIR"/*.md; do
    cp "$f" "$dest/"
  done
  echo "Agents installed to $dest/"
  write_routing "CLAUDE.md"
  echo "Done. The full neurodiveragents fleet is ready."
}

# ── install opencode ──────────────────────────────────────────────────────────
install_opencode() {
  local dest=".opencode/agents"
  mkdir -p "$dest"

  for f in "$AGENTS_DIR"/*.md; do
    local name
    name="$(basename "${f%.md}")"
    if requires_task "$name"; then
      # install as subtask2 command instead
      local cmd_src="$COMMANDS_DIR/opencode/${name}.md"
      if [ -f "$cmd_src" ]; then
        mkdir -p ".opencode/commands"
        cp "$cmd_src" ".opencode/commands/${name}.md"
        echo "  $name → installed as /${name} slash command (subtask2)"
      fi
    else
      transform_for_opencode "$f" "$dest/${name}.md"
    fi
  done

  echo "Agents installed to $dest/"

  # subtask2 for fleet orchestration
  inject_subtask2
  echo "  Requires subtask2 for fleet orchestration:"
  echo "    https://github.com/spoons-and-mirrors/subtask2"
  echo "    Add to opencode.json: \"plugin\": [\"$SUBTASK2\"]"

  write_routing ".opencode/AGENTS.md"
  echo "Done. The full neurodiveragents fleet is ready."
}

# ── install cursor ────────────────────────────────────────────────────────────
install_cursor() {
  local dest=".cursor/rules"
  mkdir -p "$dest"
  for f in "$AGENTS_DIR"/*.md; do
    local name
    name="$(basename "${f%.md}")"
    if requires_task "$name"; then
      echo "  Skipped $name — not supported by cursor"
    else
      cp "$f" "$dest/${name}.mdc"
    fi
  done
  echo "Agents installed to $dest/"
  write_routing ".cursor/rules/ndv.mdc"
  echo "Done. The full neurodiveragents fleet is ready."
}

# ── install copilot ───────────────────────────────────────────────────────────
install_copilot() {
  mkdir -p .github
  local outfile=".github/copilot-instructions.md"

  cat > "$outfile" <<'HEADER'
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
    local name
    name="$(basename "${f%.md}")"
    # strip YAML frontmatter
    local content
    content="$(awk '/^---/{n++; if(n==2){found=1; next}} found' "$f")"
    printf '# Agent: %s\n\n%s\n\n---\n\n' "$name" "$content" >> "$outfile"
  done

  echo "Copilot instructions written to $outfile"
  echo "Done. The full neurodiveragents fleet is ready."
}

# ── dispatch ──────────────────────────────────────────────────────────────────
case "$TOOL" in
  claude)   install_claude   ;;
  opencode) install_opencode ;;
  cursor)   install_cursor   ;;
  copilot)  install_copilot  ;;
  "")
    echo "Usage: ./install.sh [claude|opencode|cursor|copilot]"
    echo ""
    echo "  claude      Claude Code  →  .claude/agents/ + CLAUDE.md"
    echo "  opencode    OpenCode     →  .opencode/agents/ + .opencode/AGENTS.md"
    echo "  cursor      Cursor       →  .cursor/rules/ + .cursor/rules/ndv.mdc"
    echo "  copilot     GitHub Copilot → .github/copilot-instructions.md"
    exit 1
    ;;
  *)
    echo "Unknown tool: $TOOL"
    echo "Usage: ./install.sh [claude|opencode|cursor|copilot]"
    exit 1
    ;;
esac
