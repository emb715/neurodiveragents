#!/usr/bin/env node
/**
 * ndv-coordinator: Flow as a project coordinator, on the Claude Agent SDK.
 *
 *   node src/cli.js --repo /path/to/project
 *   node src/cli.js --repo . --store .ndv/coordinator --no-worktrees
 *   node src/cli.js --print-prompt          # the coordinator system prompt, then exit
 *
 * Flags:
 *   --repo <dir>           the project the threads work on (default: cwd)
 *   --store <dir>          ledger, transcripts, facts (default: <repo>/.ndv/coordinator)
 *   --agents <dir>         ndv agent files (default: this repo's agents/)
 *   --coordinator-model    model for the coordinator session
 *   --worker-model         model for thread workers
 *   --max-threads <n>      threads running at once (default 4)
 *   --quiet-minutes <n>    minutes before a check-in (default 120)
 *   --no-worktrees         run every thread in --repo itself
 */

import { resolve, join } from 'node:path'
import { Host } from './host.js'
import { SdkRunner } from './runners/sdk.js'
import { terminalSurface, attachTerminal } from './surfaces/terminal.js'
import { coordinatorSystemPrompt, DEFAULT_AGENTS_DIR } from './prompts.js'

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const agentsDir = resolve(arg('agents', DEFAULT_AGENTS_DIR))
if (process.argv.includes('--print-prompt')) {
  process.stdout.write(coordinatorSystemPrompt(agentsDir) + '\n')
  process.exit(0)
}

const repo = resolve(arg('repo', process.cwd()))
const host = new Host({
  storeDir: resolve(arg('store', join(repo, '.ndv', 'coordinator'))),
  repoRoot: repo,
  agentsDir,
  runner: new SdkRunner({ coordinatorModel: arg('coordinator-model'), workerModel: arg('worker-model'), cwd: repo }),
  surface: terminalSurface(),
  maxThreads: Number(arg('max-threads', '4')),
  quietMs: Number(arg('quiet-minutes', '120')) * 60_000,
  worktrees: !process.argv.includes('--no-worktrees'),
  log: s => process.stderr.write(s + '\n'),
})

const resumed = host.start()
if (resumed.length) process.stdout.write(`Resumed ${resumed.map(i => 'T' + i).join(', ')} from the ledger.\n`)
host.startTimer()
attachTerminal(host)
