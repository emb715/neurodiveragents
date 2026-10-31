#!/bin/sh
# Routing-eval provider: Claude Code CLI. Prompt on stdin, slug on stdout.
#
# Isolation: runs from an empty temp dir (no project CLAUDE.md), with no tools,
# no MCP servers, no session persistence, and a minimal system prompt. With
# ANTHROPIC_API_KEY set, --bare also skips hooks, plugins, and user CLAUDE.md;
# without it (OAuth login) the user-level CLAUDE.md still loads.
#
# Model: NDV_EVAL_MODEL (default claude-sonnet-5).
# System prompt: the routing instruction below, or the contents of
# NDV_EVAL_SYSTEM_FILE when set (the behavior eval passes an agent's model file).
set -eu
WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/ndv-eval.XXXXXX")
trap 'rm -rf "$WORKDIR"' EXIT
cd "$WORKDIR"

SYSTEM="You are a task router. Follow the routing instructions in the user message exactly and reply with only the requested agent slug."
[ -n "${NDV_EVAL_SYSTEM_FILE:-}" ] && SYSTEM=$(cat "$NDV_EVAL_SYSTEM_FILE")

BARE=""
[ -n "${ANTHROPIC_API_KEY:-}" ] && BARE="--bare"

claude -p $BARE \
  --model "${NDV_EVAL_MODEL:-claude-sonnet-5}" \
  --tools "" \
  --strict-mcp-config \
  --no-session-persistence \
  --system-prompt "$SYSTEM"
