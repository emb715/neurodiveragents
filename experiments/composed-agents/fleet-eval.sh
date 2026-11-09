#!/bin/sh
# The fleet's own behavior eval on the flat builds vs today's agent files, 3 runs each.
sh "$(dirname "$0")/build.sh" && cd "$(dirname "$0")/../.." || exit 1
for i in 1 2 3; do
  node scripts/eval-behavior.mjs --agent ndv-diagnose,ndv-review,ndv-secure --concurrency 8 --out experiments/composed-agents/results/fleet-original-$i.json
  NDV_AGENTS_DIR=experiments/composed-agents/build/inline node scripts/eval-behavior.mjs --agent ndv-diagnose,ndv-review,ndv-secure --concurrency 8 --out experiments/composed-agents/results/fleet-flat-$i.json
done
