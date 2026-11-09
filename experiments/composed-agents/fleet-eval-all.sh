#!/bin/sh
# The fleet's own behavior eval on all 19 flat builds vs today's agent files, 3 runs each.
sh "$(dirname "$0")/build.sh" && cd "$(dirname "$0")/../.." || exit 1
for i in 1 2 3; do
  node scripts/eval-behavior.mjs --concurrency 8 --out experiments/composed-agents/results/all-original-$i.json
  NDV_AGENTS_DIR=experiments/composed-agents/build/inline node scripts/eval-behavior.mjs --concurrency 8 --out experiments/composed-agents/results/all-flat-$i.json
done
