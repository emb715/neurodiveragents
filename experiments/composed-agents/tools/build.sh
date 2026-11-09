#!/bin/sh
# Build every agent source in agents/ into build/ (generated, not committed):
#   build/inline/   flat agent files, the shape the repo's agents/ has today
#   build/runtime/  agent files that load their skills at run time
#   build/noid/     flat builds without the identity layer (round 4 "no identity" arm)
cd "$(dirname "$0")/.." || exit 1
mkdir -p build/inline build/runtime build/noid
for src in agents/*.src.md; do
  slug=$(basename "$src" .src.md)
  [ "$slug" = ndv-inspect ] && continue   # round 2 core agent: loads its layers from the brief, nothing to build
  node tools/compose.mjs "$src" --inline  > "build/inline/$slug.md"
  node tools/compose.mjs "$src" --runtime > "build/runtime/$slug.md"
  sed '/^@skill ndv-neurotype-/d' "$src" > "build/noid/.$slug.src.md"
  node tools/compose.mjs "build/noid/.$slug.src.md" --inline > "build/noid/$slug.md"
  rm "build/noid/.$slug.src.md"
done
