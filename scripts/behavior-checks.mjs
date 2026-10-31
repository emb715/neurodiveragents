/**
 * behavior-checks.mjs — how a behavior-eval check becomes a pattern.
 *
 * Shared by scripts/eval-behavior.mjs (scores model output) and
 * test/validate-behavior.test.js (proves every check compiles and that each
 * handoff target is one the agent actually declares). One definition, two
 * consumers, so the static gate and the scorer cannot disagree.
 *
 * A check is one of:
 *   { pattern, name?, within? }  case-insensitive regex; `within` = first N chars only
 *   { handoff: slug }            a handoff line to slug: "→ ndv-x", "-> ndv-x", "**Handoff → ndv-x"
 *   { rejected: true }           the output carries BRIEF_REJECTED
 */

export function checkRegex(check) {
  if (check.rejected) return /BRIEF_REJECTED/
  if (check.handoff) return new RegExp(`(→|->)\\s*\\**\\s*\`?${check.handoff}\\b`, 'i')
  return new RegExp(check.pattern, 'i')
}

export function checkName(check) {
  if (check.rejected) return 'BRIEF_REJECTED'
  if (check.handoff) return `handoff → ${check.handoff}`
  return check.name ?? check.pattern
}

export function scoreOutput(checks, text) {
  const missed = checks
    .filter(ch => !checkRegex(ch).test(ch.within ? text.slice(0, ch.within) : text))
    .map(checkName)
  return { pass: missed.length === 0, missed }
}
