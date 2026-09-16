#!/bin/sh
# Fails if assets/styles.css is stale relative to src/input.css.
#
# Compares a fresh build against the *index* copy (`git show :path`). In the
# pre-commit hook that is the staged file; in CI the index equals the commit.
# One comparison, correct in both places.
set -eu

BUILT=$(mktemp "${TMPDIR:-/tmp}/styles_build.XXXXXX")
INDEXED=$(mktemp "${TMPDIR:-/tmp}/styles_index.XXXXXX")
trap 'rm -f "$BUILT" "$INDEXED"' EXIT

npx @tailwindcss/cli -i ./src/input.css -o "$BUILT" --minify 2>/dev/null
git show :assets/styles.css > "$INDEXED"

if ! cmp -s "$BUILT" "$INDEXED"; then
  echo ""
  echo "✖  assets/styles.css is out of date."
  echo "   Run: npm run css:build"
  echo "   Then stage the result: git add assets/styles.css"
  echo ""
  exit 1
fi
echo "✔  CSS is up to date."
