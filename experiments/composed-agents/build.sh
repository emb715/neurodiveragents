#!/bin/sh
# Rebuild every agent from its source: flat (inline) and runtime-loading variants.
cd "$(dirname "$0")" || exit 1
mkdir -p build/inline build/runtime
for src in *.src.md; do
  slug=${src%.src.md}
  node compose.mjs "$src" --inline  > "build/inline/$slug.md"
  node compose.mjs "$src" --runtime > "build/runtime/$slug.md"
done
