/**
 * validate-contracts.test.js
 *
 * Architectural contract tests.
 * Concern: do agents and key files satisfy structural ADR requirements?
 *
 * Runs unconditionally on every test run.
 * Grows when a new ADR adds structural requirements.
 *
 * Current contracts:
 * - ADR-008: Domain Contracts (Brief Contract, Self-Validation, Mandatory Pipeline)
 * - O(n) behavioral spec regression: criterion 5 embedded in ndv-flow.md
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROOT, AGENTS_DIR,
  TIER1, TIER2, TIER3,
  readAgent,
} from './helpers.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = join(ROOT, 'skills')

// ─── O(n) behavioral spec regression ─────────────────────────────────────────
//
// Root cause (2026-05-30): ndv-flow dispatched behavioral specs to ndv-build using
// a static structural checklist with no criterion for scale correctness.
// Result: an orient protocol with O(n) scan behavior was implemented and shipped.
//
// Fix: criterion 5 (N=1/N=10/N=100 scale simulation) embedded in ndv-flow.md's
// Decomposition Protocol. The standalone docs/spec-readiness.md has been removed —
// the contract lives in Flow, enforced here.
//
// These tests will FAIL if someone reverts to the old implicit routing language
// or removes the behavioral spec gate from Flow.

describe('O(n) behavioral spec regression: criterion 5 in ndv-flow.md', () => {
  const flowPath = join(AGENTS_DIR, 'ndv-flow.md')
  const flowContent = existsSync(flowPath) ? readFileSync(flowPath, 'utf8') : ''

  test('ndv-flow.md exists', () => {
    assert.ok(existsSync(flowPath), 'agents/ndv-flow.md is missing')
  })

  test('ndv-flow.md Decomposition Protocol includes behavioral spec classification gate', () => {
    assert.match(
      flowContent,
      /[Bb]ehavioral spec/,
      'ndv-flow.md Decomposition Protocol must classify behavioral specs before dispatching to ndv-build'
    )
  })

  test('ndv-flow.md Decomposition Protocol requires N=1/N=10/N=100 scale simulation', () => {
    assert.match(
      flowContent,
      /N=1.*N=10.*N=100|N=100/,
      'ndv-flow.md must mandate N=1/N=10/N=100 simulation for behavioral specs before dispatching to ndv-build'
    )
  })

  test('ndv-flow.md routing entry for ndv-build does not use the old implicit checklist', () => {
    const oldLanguage = 'schemas, acceptance criteria, file targets, and architecture already decided'
    assert.ok(
      !flowContent.includes(oldLanguage),
      [
        'ndv-flow.md routing entry for ndv-build still uses the old implicit checklist.',
        'This was the root cause of the O(n) behavioral spec defect (2026-05-30).',
        'The behavioral spec gate (criterion 5) must be present in the Decomposition Protocol.',
      ].join('\n')
    )
  })

  test('ndv-flow.md criterion 5 routes to ndv-review (not ndv-tester)', () => {
    // Scale simulation of a procedure spec before implementation is a review concern,
    // not a test generation concern. This regression prevents re-introducing the wrong route.
    assert.match(
      flowContent,
      /criterion 5.*ndv-review|ndv-review.*scale|ndv-review.*N=1/s,
      'ndv-flow.md criterion 5 must route to ndv-review, not ndv-tester. Scale simulation of a behavioral spec before implementation is a correctness review question.'
    )
  })

  test('ndv-flow.md What Flow Never Does includes behavioral spec dispatch prohibition', () => {
    assert.match(
      flowContent,
      /behavioral spec.*ndv-build|dispatches a behavioral spec/i,
      'ndv-flow.md "What Flow Never Does" must prohibit dispatching behavioral specs to ndv-build without criterion 5 verified'
    )
  })

  test('docs/spec-readiness.md does not exist (contract absorbed into ndv-flow.md)', () => {
    const contractPath = join(ROOT, 'docs', 'spec-readiness.md')
    assert.ok(
      !existsSync(contractPath),
      'docs/spec-readiness.md should not exist — the Spec Readiness Contract has been absorbed into ndv-flow.md\'s Decomposition Protocol. Delete the file.'
    )
  })
})

// ─── ADR-008: Domain Contracts ───────────────────────────────────────────────
//
// Tier 1 agents (produce codebase artifacts): Brief Contract + Self-Validation + Mandatory Pipeline
// Tier 2 agents (produce findings/assessments): Brief Contract + Self-Validation
// Tier 3 agents (advisory/investigative): none
//
// These tests prevent silent regression where a section is removed or mis-classified.

describe('ADR-008: Brief Contract — required on all Tier 1 and Tier 2 agents', () => {
  for (const name of [...TIER1, ...TIER2]) {
    test(name + ' has ## Brief Contract section', () => {
      const content = readAgent(name)
      assert.match(
        content,
        /^## Brief Contract/m,
        name + ': missing ## Brief Contract section. Tier 1/2 agents require this section so Flow can author domain-sound briefs. See ADR-008.'
      )
    })
  }
})

describe('ADR-008: Brief Contract — must NOT be present on Tier 3 agents', () => {
  for (const name of TIER3) {
    test(name + ' does NOT have ## Brief Contract section', () => {
      const content = readAgent(name)
      assert.doesNotMatch(
        content,
        /^## Brief Contract/m,
        name + ': Tier 3 agents must not have a ## Brief Contract section. Brief quality cannot produce domain-incorrect output for this agent. See ADR-008.'
      )
    })
  }
})

describe('ADR-008: Self-Validation Protocol — required on all Tier 1 and Tier 2 agents', () => {
  for (const name of [...TIER1, ...TIER2]) {
    test(name + ' has ## Self-Validation Protocol section', () => {
      const content = readAgent(name)
      assert.match(
        content,
        /^## Self-Validation Protocol/m,
        name + ': missing ## Self-Validation Protocol section. Tier 1/2 agents require completeness and domain soundness checks before accepting a brief. See ADR-008.'
      )
    })
  }
})

describe('ADR-008: Self-Validation Protocol — must NOT be present on Tier 3 agents', () => {
  for (const name of TIER3) {
    test(name + ' does NOT have ## Self-Validation Protocol section', () => {
      const content = readAgent(name)
      assert.doesNotMatch(
        content,
        /^## Self-Validation Protocol/m,
        name + ': Tier 3 agents must not have a ## Self-Validation Protocol section. See ADR-008.'
      )
    })
  }
})

describe('ADR-008: Mandatory Pipeline — required on all Tier 1 agents only', () => {
  for (const name of TIER1) {
    test(name + ' has ## Mandatory Pipeline section', () => {
      const content = readAgent(name)
      assert.match(
        content,
        /^## Mandatory Pipeline/m,
        name + ': missing ## Mandatory Pipeline section. Tier 1 agents produce codebase artifacts — downstream review is structurally required regardless of findings. See ADR-008.'
      )
    })
  }
})

describe('ADR-008: Mandatory Pipeline — must NOT be present on Tier 2 or Tier 3 agents', () => {
  for (const name of [...TIER2, ...TIER3]) {
    test(name + ' does NOT have ## Mandatory Pipeline section', () => {
      const content = readAgent(name)
      assert.doesNotMatch(
        content,
        /^## Mandatory Pipeline/m,
        name + ': Tier 2/3 agents must not have a ## Mandatory Pipeline section. Only Tier 1 agents produce codebase artifacts requiring mandatory downstream gates. See ADR-008.'
      )
    })
  }
})

describe('ADR-008: Brief Contract — must contain BRIEF_REJECTED format', () => {
  for (const name of [...TIER1, ...TIER2]) {
    test(name + ' Brief Contract or Self-Validation references BRIEF_REJECTED', () => {
      const content = readAgent(name)
      assert.match(
        content,
        /BRIEF_REJECTED/,
        name + ': Brief Contract or Self-Validation Protocol must reference the BRIEF_REJECTED rejection format. See ADR-008.'
      )
    })
  }
})

// ─── Architectural invariant: router skills never live in skills/ ─────────────
//
// Router skills are DERIVED at install time from agent files (bin/ndv.js
// getRouterSkills hardcodes ['ndv-flow'] → transformAgentToSkill produces the
// skill body). They must NEVER exist as static files under skills/*/SKILL.md —
// that would create two sources of truth (the agent file AND the static skill),
// and the derived skill would silently diverge from the static copy on agent
// edits.
//
// This was previously an incidental invariant held by comments alone
// (getCognitiveSkills' defense-in-depth filter would silently exclude a
// misplaced router SKILL.md, masking the architectural violation). This test
// promotes the convention from comment to CI-enforced structural invariant:
// any SKILL.md under skills/ declaring `metadata.type: router` fails the build.
//
// Mirrors parseSkillType from bin/ndv.js: `/^\s{2}type:\s*(.+)$/m`.

describe('architectural invariant: no cognitive skill declares metadata.type: router', () => {
  test('no skills/*/SKILL.md has metadata.type: router (router skills are agent-derived, never static)', () => {
    // Arrange: collect every skills/<name>/SKILL.md in the repo.
    const skillDirs = existsSync(SKILLS_DIR)
      ? readdirSync(SKILLS_DIR, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
      : []

    // Act + Assert: each SKILL.md must NOT declare type: router.
    const offenders = []
    for (const name of skillDirs) {
      const skillFile = join(SKILLS_DIR, name, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      const content = readFileSync(skillFile, 'utf8')
      const typeMatch = content.match(/^\s{2}type:\s*(.+)$/m)
      const type = typeMatch ? typeMatch[1].trim() : ''
      if (type === 'router') {
        offenders.push(`${name} (skills/${name}/SKILL.md declares metadata.type: router)`)
      }
    }

    assert.deepEqual(
      offenders, [],
      'Router skills must NEVER live under skills/*/SKILL.md — they are derived from agent files at install time. ' +
      'A static router skill creates a second source of truth that silently diverges on agent edits. ' +
      'Offenders: ' + (offenders.length ? offenders.join(', ') : '(none)')
    )
  })

  test('skills/ directory is scanned (guard against the invariant test being a no-op on an empty dir)', () => {
    // If skills/ were empty or missing, the test above would pass vacuously.
    // This guard asserts the directory exists and contains at least one skill,
    // so the invariant test has real content to check.
    assert.ok(existsSync(SKILLS_DIR), 'skills/ directory must exist')
    const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    assert.ok(skillDirs.length > 0, 'skills/ must contain at least one skill directory or the router-invariant test is vacuous')
  })
})
