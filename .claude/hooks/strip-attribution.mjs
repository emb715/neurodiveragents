#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Strips Claude attribution from the bodies of
// `gh pr|issue create|edit|comment` and `gh pr review`: the
// `<!-- claude-projects-attribution: ... -->` line, the "_Requested by ... [project thread](...)_"
// line, "Generated with/by Claude Code" lines and claude.ai/code/session_ links.
// Inline --body/-b text is rewritten in the command; --body-file/-F gets a cleaned temp copy.
// Returns hookSpecificOutput.updatedInput without permissionDecision, so normal permissions apply.
// Fails open: any error leaves the command untouched.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const GH = /\bgh\s+(?:pr\s+(?:create|edit|comment|review)|issue\s+(?:create|edit|comment))\b/;

const PATTERNS = [
  /<!--\s*claude-projects-attribution:[^\n]*?-->/g,
  /_?Requested by [^\n]*?\[project thread\]\([^)\n]*\)_?/g,
  /_?(?:🤖\s*)?Generated (?:with|by) \[?Claude Code\]?(?:\([^)\n]*\))?_?/gi,
  /<?https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+>?/g,
];

export function clean(text) {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, '');
  if (out === text) return text;
  // Lines emptied by removal collapse; a dangling `---` footer separator goes too.
  out = out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+---\n(?=\s*(?:EOF\b|["')]|$))/g, '\n')
    .replace(/(--body(?:=|\s+)|-b\s+)(["'])\n+/g, '$1$2')
    .replace(/(<<-?\s*['"]?\w+['"]?\n)\n+/g, '$1')
    .replace(/\n+(?=\s*(?:EOF\b|["']\)?\s*$))/gm, '\n');
  return out;
}

const BODY_FILE = /(--body-file(?:=|\s+)|-F\s+)(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;

export function rewrite(command, cwd = process.cwd()) {
  if (!GH.test(command)) return command;
  let out = clean(command);
  out = out.replace(BODY_FILE, (m, flag, dq, sq, bare) => {
    const path = dq ?? sq ?? bare;
    if (path === '-') return m;
    try {
      const body = readFileSync(resolve(cwd, path), 'utf8');
      if (clean(body) === body) return m;
      const cleaned = `${clean(body).trim()}\n`;
      const tmp = join(mkdtempSync(join(tmpdir(), 'gh-body-')), 'body.md');
      writeFileSync(tmp, cleaned);
      return `${flag}'${tmp}'`;
    } catch {
      return m;
    }
  });
  return out;
}

async function main() {
  try {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    const input = JSON.parse(raw);
    const cmd = input?.tool_input?.command;
    if (input?.tool_name !== 'Bash' || typeof cmd !== 'string') return;
    const next = rewrite(cmd, input.cwd);
    if (next === cmd) return;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { ...input.tool_input, command: next },
      },
    }));
  } catch {
    // fail open
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
