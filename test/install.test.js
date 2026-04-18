import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
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
  opencode: new Set(['ndv-flow']),
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
