import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BIN = join(ROOT, 'bin', 'ndv.js')
const AGENTS_DIR = join(ROOT, 'agents')

// All agent filenames (without extension)
const AGENT_NAMES = readdirSync(AGENTS_DIR)
  .filter(f => f.endsWith('.md'))
  .map(f => f.replace('.md', ''))

assert.ok(AGENT_NAMES.length >= 10, 'Expected at least 10 agents in agents/')

// Agents skipped per platform due to unsupported tools
const PLATFORM_SKIP = {
  opencode: new Set(),
  cursor: new Set(['ndv-flow']),
  claude: new Set(),
}

function expectedAgents(platform) {
  const skip = PLATFORM_SKIP[platform] ?? new Set()
  return AGENT_NAMES.filter(n => !skip.has(n))
}

// Run ndv.js in an isolated tmp dir
function ndv(args, cwd) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
  })
  return result
}

// ─── claude ──────────────────────────────────────────────────────────────────

test('claude: agents copied to .claude/agents/ as .md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-claude-'))
  try {
    const r = ndv(['install', 'claude'], dir)
    assert.equal(r.status, 0, `exit code: ${r.stderr}`)

    const installed = readdirSync(join(dir, '.claude', 'agents'))
    for (const name of expectedAgents('claude')) {
      assert.ok(installed.includes(`${name}.md`), `missing ${name}.md`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude: routing block written to CLAUDE.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-claude-'))
  try {
    ndv(['install', 'claude'], dir)
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf8')
    assert.ok(content.includes('ndv:start'), 'missing ndv:start marker')
    assert.ok(content.includes('ndv:end'), 'missing ndv:end marker')
    assert.ok(content.includes('Routing Table'), 'missing Routing Table section')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude: idempotent — second install skips routing block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-claude-'))
  try {
    ndv(['install', 'claude'], dir)
    ndv(['install', 'claude'], dir)
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf8')
    const count = (content.match(/ndv:start/g) || []).length
    assert.equal(count, 1, `routing block written ${count} times, expected 1`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude: routing block contains all agent names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-claude-'))
  try {
    ndv(['install', 'claude'], dir)
    const content = readFileSync(join(dir, 'CLAUDE.md'), 'utf8')
    // Extract the ndv routing block
    const blockMatch = content.match(/<!-- ndv:start -->([\s\S]*?)<!-- ndv:end -->/)
    assert.ok(blockMatch, 'could not locate ndv routing block')
    const block = blockMatch[1]
    // Extract the routing table rows: between '## Routing Table' and the next '##'
    const tableMatch = block.match(/## Routing Table\n([\s\S]*?)(?=\n##)/)
    assert.ok(tableMatch, 'could not locate routing table section in ndv block')
    const tableSection = tableMatch[1]
    for (const name of expectedAgents('claude')) {
      assert.ok(tableSection.includes(name), `agent "${name}" missing from claude routing block table rows`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('claude: appends to existing CLAUDE.md without overwriting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-claude-'))
  try {
    const existing = join(dir, 'CLAUDE.md')
    writeFileSync(existing, '# My existing project config\n')
    ndv(['install', 'claude'], dir)
    const content = readFileSync(existing, 'utf8')
    assert.ok(content.includes('# My existing project config'), 'existing content was erased')
    assert.ok(content.includes('ndv:start'), 'routing block not appended')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── opencode ────────────────────────────────────────────────────────────────

test('opencode: agents copied to .opencode/agents/ as .md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-opencode-'))
  try {
    const r = ndv(['install', 'opencode'], dir)
    assert.equal(r.status, 0, `exit code: ${r.stderr}`)

    const installed = readdirSync(join(dir, '.opencode', 'agents'))
    for (const name of expectedAgents('opencode')) {
      assert.ok(installed.includes(`${name}.md`), `missing ${name}.md`)
    }
    // Verify skipped agents are absent
    for (const name of PLATFORM_SKIP.opencode) {
      assert.ok(!installed.includes(`${name}.md`), `${name}.md should be skipped for opencode`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('opencode: routing block written to .opencode/AGENTS.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-opencode-'))
  try {
    ndv(['install', 'opencode'], dir)
    const content = readFileSync(join(dir, '.opencode', 'AGENTS.md'), 'utf8')
    assert.ok(content.includes('ndv:start'), 'missing ndv:start marker')
    assert.ok(content.includes('Routing Table'), 'missing Routing Table section')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('opencode: idempotent — second install skips routing block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-opencode-'))
  try {
    ndv(['install', 'opencode'], dir)
    ndv(['install', 'opencode'], dir)
    const content = readFileSync(join(dir, '.opencode', 'AGENTS.md'), 'utf8')
    const count = (content.match(/ndv:start/g) || []).length
    assert.equal(count, 1, `routing block written ${count} times, expected 1`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('opencode: routing block contains all agent names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-opencode-'))
  try {
    ndv(['install', 'opencode'], dir)
    const content = readFileSync(join(dir, '.opencode', 'AGENTS.md'), 'utf8')
    // Extract the ndv routing block
    const blockMatch = content.match(/<!-- ndv:start -->([\s\S]*?)<!-- ndv:end -->/)
    assert.ok(blockMatch, 'could not locate ndv routing block')
    const block = blockMatch[1]
    // Extract the routing table rows: between '## Routing Table' and the next '##'
    const tableMatch = block.match(/## Routing Table\n([\s\S]*?)(?=\n##)/)
    assert.ok(tableMatch, 'could not locate routing table section in ndv block')
    const tableSection = tableMatch[1]
    for (const name of expectedAgents('opencode')) {
      assert.ok(tableSection.includes(name), `agent "${name}" missing from opencode routing block table rows`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── cursor ──────────────────────────────────────────────────────────────────

test('cursor: agents copied to .cursor/rules/ as .mdc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cursor-'))
  try {
    const r = ndv(['install', 'cursor'], dir)
    assert.equal(r.status, 0, `exit code: ${r.stderr}`)

    const installed = readdirSync(join(dir, '.cursor', 'rules'))
    for (const name of expectedAgents('cursor')) {
      assert.ok(installed.includes(`${name}.mdc`), `missing ${name}.mdc`)
    }
    // Verify skipped agents are absent
    for (const name of PLATFORM_SKIP.cursor) {
      assert.ok(!installed.includes(`${name}.mdc`), `${name}.mdc should be skipped for cursor`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cursor: routing block written to .cursor/rules/ndv.mdc', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cursor-'))
  try {
    ndv(['install', 'cursor'], dir)
    const content = readFileSync(join(dir, '.cursor', 'rules', 'ndv.mdc'), 'utf8')
    assert.ok(content.includes('ndv:start'), 'missing ndv:start marker')
    assert.ok(content.includes('Routing Table'), 'missing Routing Table section')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cursor: idempotent — second install skips routing block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-cursor-'))
  try {
    ndv(['install', 'cursor'], dir)
    ndv(['install', 'cursor'], dir)
    const content = readFileSync(join(dir, '.cursor', 'rules', 'ndv.mdc'), 'utf8')
    const count = (content.match(/ndv:start/g) || []).length
    assert.equal(count, 1, `routing block written ${count} times, expected 1`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── copilot ─────────────────────────────────────────────────────────────────

test('copilot: creates .github/copilot-instructions.md', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-copilot-'))
  try {
    const r = ndv(['install', 'copilot'], dir)
    assert.equal(r.status, 0, `exit code: ${r.stderr}`)
    assert.ok(existsSync(join(dir, '.github', 'copilot-instructions.md')), 'file not created')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('copilot: instructions file contains all agent names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-copilot-'))
  try {
    ndv(['install', 'copilot'], dir)
    const content = readFileSync(join(dir, '.github', 'copilot-instructions.md'), 'utf8')
    for (const name of AGENT_NAMES) {
      assert.ok(content.includes(name), `missing agent: ${name}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('copilot: instructions file contains routing table', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-copilot-'))
  try {
    ndv(['install', 'copilot'], dir)
    const content = readFileSync(join(dir, '.github', 'copilot-instructions.md'), 'utf8')
    assert.ok(content.includes('Routing Table'), 'missing Routing Table section')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('copilot: routing table contains all agent names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-copilot-'))
  try {
    ndv(['install', 'copilot'], dir)
    const content = readFileSync(join(dir, '.github', 'copilot-instructions.md'), 'utf8')
    // Extract the routing table section: between '## Routing Table' and the next '---' or '##'
    const tableMatch = content.match(/## Routing Table\n([\s\S]*?)(?=\n---|\n##)/)
    assert.ok(tableMatch, 'could not locate routing table section')
    const tableSection = tableMatch[1]
    for (const name of AGENT_NAMES) {
      assert.ok(tableSection.includes(name), `agent "${name}" missing from copilot routing table rows`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('copilot: agent frontmatter is stripped from output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-copilot-'))
  try {
    ndv(['install', 'copilot'], dir)
    const content = readFileSync(join(dir, '.github', 'copilot-instructions.md'), 'utf8')
    // YAML frontmatter block should not appear in copilot output
    assert.ok(!content.match(/^---\s*\nname:/m), 'raw YAML frontmatter found in output')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('copilot: refuses to clobber pre-existing file without ndv marker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-copilot-clobber-'))
  try {
    // Arrange: pre-existing copilot-instructions.md with user content, no ndv marker
    mkdirSync(join(dir, '.github'), { recursive: true })
    const outPath = join(dir, '.github', 'copilot-instructions.md')
    const userContent = '# My own copilot instructions\n\nDo not touch this.\n'
    writeFileSync(outPath, userContent)

    // Act
    const r = ndv(['install', 'copilot'], dir)

    // Assert: graceful exit (no throw — process completed)
    assert.equal(r.status, 0, `expected graceful refuse (exit 0), got ${r.status}\nstderr: ${r.stderr}`)

    // Assert: file content UNCHANGED — not clobbered
    const after = readFileSync(outPath, 'utf8')
    assert.equal(after, userContent, 'pre-existing copilot-instructions.md was clobbered')

    // Assert: warning was emitted to stderr
    assert.ok(
      r.stderr.includes('Refusing to overwrite') || r.stdout.includes('Refusing to overwrite'),
      'expected refuse-to-overwrite warning in output'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('copilot: refuses to append when partial ndv:start marker present but no full block', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-copilot-malformed-'))
  try {
    // Arrange: pre-existing file containing the literal 'ndv:start' in prose,
    // but NOT the full <!-- ndv:start -->...<!-- ndv:end --> block.
    mkdirSync(join(dir, '.github'), { recursive: true })
    const outPath = join(dir, '.github', 'copilot-instructions.md')
    const userContent = '# My notes\nWe discussed ndv:start markers once.\n'
    writeFileSync(outPath, userContent)

    // Act
    const r = ndv(['install', 'copilot'], dir)

    // Assert: graceful exit (no throw — process completed)
    assert.equal(r.status, 0, `expected graceful refuse (exit 0), got ${r.status}\nstderr: ${r.stderr}`)

    // Assert: file content UNCHANGED — not appended to, not clobbered
    const after = readFileSync(outPath, 'utf8')
    assert.equal(after, userContent, 'pre-existing copilot-instructions.md was modified (appended or clobbered)')

    // Assert: malformed-block warning was emitted
    assert.ok(
      r.stderr.includes('partial') || r.stdout.includes('partial'),
      'expected partial-marker warning in output'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── unknown tool ─────────────────────────────────────────────────────────────

test('unknown tool exits non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-unknown-'))
  try {
    const r = ndv(['install', 'vscode'], dir)
    assert.notEqual(r.status, 0, 'expected non-zero exit for unknown tool')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('install with no tool argument exits non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndv-notool-'))
  try {
    const r = ndv(['install'], dir)
    assert.notEqual(r.status, 0, 'expected non-zero exit when no tool specified')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ─── cursor --global ──────────────────────────────────────────────────────────
// Global cursor install: ~/.cursor/rules/ with .mdc extension, no routing file
// (routingFile: null in TOOLS.cursor.global). HOME is mocked so ~/.cursor is
// isolated to a tmp dir.

function ndvGlobal(args, fakeHome) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  })
}

test('cursor --global: agents installed to ~/.cursor/rules/ as .mdc, no routing file', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-cursor-global-'))
  try {
    // Arrange: clean fake HOME — no ~/.cursor
    assert.ok(!existsSync(join(fakeHome, '.cursor')), 'precondition: ~/.cursor absent')

    // Act
    const r = ndvGlobal(['install', 'cursor', '--global'], fakeHome)
    assert.equal(r.status, 0, `exit code ${r.status}\nstderr: ${r.stderr}`)

    // Assert: ~/.cursor/rules/ exists with .mdc agent files
    const rulesDir = join(fakeHome, '.cursor', 'rules')
    assert.ok(existsSync(rulesDir), '~/.cursor/rules/ was not created')
    const installed = readdirSync(rulesDir).filter(f => f.endsWith('.mdc'))
    assert.ok(installed.length > 0, 'expected .mdc files in ~/.cursor/rules/')

    // Assert: every expected (non-skipped) cursor agent is present as .mdc
    for (const name of expectedAgents('cursor')) {
      assert.ok(
        installed.includes(`${name}.mdc`),
        `missing ${name}.mdc in global cursor rules dir`
      )
    }
    // Assert: skipped agents (ndv-flow) absent
    for (const name of PLATFORM_SKIP.cursor) {
      assert.ok(
        !installed.includes(`${name}.mdc`),
        `${name}.mdc should be skipped for global cursor`
      )
    }

    // Assert: NO routing file written — TOOLS.cursor.global.routingFile is null.
    // The install path for cursor --global skips writeRouting entirely because
    // target.routingFile is null (the `else if (!isGlobal && target.routingFile)`
    // branch is the only routing writer; global+null falls through).
    const ndvMdc = join(rulesDir, 'ndv.mdc')
    assert.ok(
      !existsSync(ndvMdc),
      'ndv.mdc routing file should NOT be created on global cursor install (routingFile: null)'
    )

    // Assert: install log mentions global scope
    assert.ok(
      r.stdout.includes('global') || r.stdout.includes('Agents installed'),
      `expected install log, got:\n${r.stdout}`
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})

// ─── copilot --global rejection ───────────────────────────────────────────────
// `install copilot --global` must error and exit non-zero — copilot has no
// global config location. The guard lives in the isMainEntry dispatch
// (bin/ndv.js:1160-1164), separate from the generic TOOLS guard, so this test
// exercises the CLI path directly via spawnSync with a mocked HOME (HOME is
// irrelevant for the rejection but isolates any incidental fs access).

test('copilot --global: rejected with exit 1 and error message', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'ndv-copilot-global-reject-'))
  try {
    // Act: invoke the CLI with --global
    const r = ndvGlobal(['install', 'copilot', '--global'], fakeHome)

    // Assert: non-zero exit
    assert.notEqual(r.status, 0, `expected non-zero exit for copilot --global, got ${r.status}`)
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}`)

    // Assert: error message mentions the rejection reason
    const combined = r.stdout + r.stderr
    assert.ok(
      combined.includes('Global install not supported for copilot'),
      `expected "Global install not supported for copilot" in output, got:\n${combined}`
    )

    // Assert: no copilot-instructions.md written anywhere under fake HOME
    // (the rejection happens before installCopilot runs)
    const githubDir = join(fakeHome, '.github')
    assert.ok(
      !existsSync(join(githubDir, 'copilot-instructions.md')),
      'copilot-instructions.md should NOT be written on --global rejection'
    )
  } finally {
    rmSync(fakeHome, { recursive: true, force: true })
  }
})
