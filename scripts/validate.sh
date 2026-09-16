#!/bin/sh
# The single merge gate. The pre-commit hook and CI both run exactly this.
#
#   1. Full test suite (npm test). Authoring-guide checks are scoped to the
#      agents changed on this branch; CHANGED_AGENTS is derived here when unset.
#   2. CSS build staleness check.
set -eu

if [ -z "${CHANGED_AGENTS+x}" ]; then
  # Diff the working tree against where this branch left main. Covers
  # committed, staged, and unstaged changes locally; in CI (PR merge ref) it
  # covers the PR. On main itself the diff is empty and authoring checks skip.
  BASE_REF=origin/main
  git rev-parse --verify -q "$BASE_REF" >/dev/null || BASE_REF=main
  BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null || echo "")
  if [ -n "$BASE" ]; then
    CHANGED_AGENTS=$( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } \
      | grep '^agents/ndv-.*\.md$' \
      | sed 's|^agents/||; s|\.md$||' \
      | sort -u | paste -sd ',' - || true)
  else
    CHANGED_AGENTS=""
  fi
fi
export CHANGED_AGENTS

if [ -n "$CHANGED_AGENTS" ]; then
  echo "▶ Authoring-guide checks scoped to: $CHANGED_AGENTS"
else
  echo "▶ No changed agents — authoring-guide checks register but produce no tests"
fi

echo "▶ Running test suite..."
if ! npm test; then
  echo ""
  echo "✖  Tests failed. Fix failures before committing — do not skip the hook."
  echo ""
  exit 1
fi
echo "✔  Tests pass."

echo "▶ Checking CSS build is up to date..."
sh scripts/check-css.sh
