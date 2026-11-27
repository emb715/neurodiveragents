/**
 * guard.js: keep a worker inside its own worktree, and paths relative.
 *
 * Found in the first live run: the coordinator works from the repo root and
 * wrote absolute paths into a brief, and the worker followed them out of its
 * worktree into the main checkout. A prompt line asks workers not to; this
 * makes it a rule for the file tools.
 */

import { resolve, relative, isAbsolute, sep } from 'node:path'

const FILE_TOOLS = { Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' }

export function inside(dir, p) {
  const rel = relative(resolve(dir), resolve(dir, p))
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

// canUseTool for a worker. Tools outside the agent's own list are denied;
// file writes are allowed only inside the worker's cwd.
export function workerPermission(toolName, input, { cwd, tools }) {
  if (!tools.includes(toolName)) {
    return { behavior: 'deny', message: `${toolName} is not in this agent's tools.` }
  }
  const key = FILE_TOOLS[toolName]
  if (key && input?.[key] && !inside(cwd, input[key])) {
    return { behavior: 'deny', message: `Write outside this thread's checkout refused: ${input[key]}. Use a path relative to ${cwd}.` }
  }
  return { behavior: 'allow', updatedInput: input }
}

// Absolute paths under the repo become repo-relative, so a brief means the
// same file in whichever worktree reads it.
export function relativize(text, repoRoot) {
  const root = resolve(repoRoot)
  return text.split(root + sep).join('').split(root).join('.')
}

export function relativeFiles(files, ...roots) {
  return files.map(f => {
    if (!isAbsolute(f)) return f.replace(/^\.\//, '')
    for (const r of roots) if (r && inside(r, f)) return relative(resolve(r), f)
    return f
  })
}
