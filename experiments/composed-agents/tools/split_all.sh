#!/bin/sh
# Split every fleet agent into layers. Columns: agent, neurotype, published module (- = none), domain (- = none).
cd "$(dirname "$0")" || exit 1
while read -r agent neuro module domain; do
  desc=$(sed -n 's/^description: //p' "../../../agents/$agent.md" | head -1)
  [ "$desc" = ">" ] && desc=$(awk '/^description: >/{f=1;next} f&&/^[a-z]+:/{exit} f{printf "%s ", $0}' "../../../agents/$agent.md" | sed 's/  */ /g')
  python3 -I split_agent.py "$agent" "$neuro" "$module" "$domain" "$desc"
done <<'MAP'
ndv-accessibility universal-design - accessibility
ndv-architect structural ndv-structural architecture
ndv-build literal-contract - implementation
ndv-design perceptual ndv-perceptual ui-design
ndv-diagnose skeptical ndv-skeptical debugging
ndv-explain contextual ndv-contextual documentation
ndv-flow executive-function - orchestration
ndv-forecast temporal-dysphoria - estimation
ndv-honest direct ndv-direct -
ndv-optimize efficient ndv-efficient performance
ndv-refactor precise ndv-precise refactoring
ndv-research map-first ndv-map-first codebase-research
ndv-review total-perception ndv-total-perception code-review
ndv-scope bounded ndv-bounded scope
ndv-secure vigilant ndv-vigilant security
ndv-signal goodhart - metrics
ndv-telemetry detached-observation - observability
ndv-tester adversarial ndv-adversarial testing
ndv-upgrade completionist - upgrades
MAP
