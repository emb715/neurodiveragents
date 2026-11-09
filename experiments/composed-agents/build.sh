#!/bin/sh
# Build every agent from its source into build/ (generated, not committed):
#   inline/   flat agent files, the shape agents/ has today
#   runtime/  agent files that load their skills at run time
#   noid/     flat builds without the identity layer (the round 4 "no identity" arm)
cd "$(dirname "$0")" || exit 1
mkdir -p build/inline build/runtime build/noid
for src in *.src.md; do
  [ "$src" = ndv-inspect.src.md ] && continue   # round 2 core agent: loads its layers from the brief, nothing to build
  slug=${src%.src.md}
  node compose.mjs "$src" --inline  > "build/inline/$slug.md"
  node compose.mjs "$src" --runtime > "build/runtime/$slug.md"
  sed '/^@skill ndv-neurotype-/d' "$src" > "build/noid/.$slug.src.md"
  node compose.mjs "build/noid/.$slug.src.md" --inline > "build/noid/$slug.md"
  rm "build/noid/.$slug.src.md"
done
