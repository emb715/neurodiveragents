/**
 * protocol.js: read a worker's final reply.
 *
 * A worker's transcript never reaches the coordinator. The host reads the
 * final reply here and passes on only what Flow's sentinel discipline allows:
 * a short summary, the handoff lines and the file list.
 */

// Same shapes the fleet already emits and the behavior scorer accepts:
//   → ndv-secure (vulnerability) · src/auth/reset.ts: tokens never expire
//   -> ndv-secure (vulnerability) · src/auth/reset.ts: ...
//   **Handoff → ndv-diagnose (root cause):** crash in parser
const HANDOFF = /^\s*(?:[-*]\s*)?(?:\*\*Handoff\s*)?(?:→|->)\s*\**\s*`?(ndv-[a-z]+)`?\s*(?:\(([^)]*)\))?\s*:?\**\s*(?:·\s*([^:]+?)\s*:)?\s*(.*)$/

export function parseHandoffs(text) {
  const out = []
  for (const line of text.split('\n')) {
    const m = line.match(HANDOFF)
    if (!m) continue
    out.push({
      agent: m[1],
      domain: (m[2] ?? '').trim(),
      location: (m[3] ?? '').trim(),
      description: m[4].replace(/^\*+\s*/, '').trim(),
    })
  }
  return out
}

export function parseSentinel(text, id) {
  const re = id ? new RegExp(`TASK_${id}_COMPLETE`) : /TASK_[A-Za-z0-9]+_COMPLETE/
  return re.test(text)
}

export function parseRejection(text) {
  const m = text.match(/BRIEF_REJECTED:\s*(.+)/)
  return m ? m[1].trim() : null
}

// "FILES: a.ts, b.ts" (the brief asks for exactly this line). Backticks and
// trailing punctuation are tolerated.
export function parseFiles(text) {
  const m = text.match(/^\s*FILES:\s*(.+)$/im)
  if (!m) return []
  return m[1].split(',').map(s => s.trim().replace(/^`|`$/g, '').replace(/[.;]$/, '')).filter(Boolean)
}

// The summary is the reply minus the machine lines, capped like Flow's
// "Max 200 words".
export function summarize(text, maxWords = 200) {
  const kept = text.split('\n').filter(l =>
    !HANDOFF.test(l) && !/TASK_[A-Za-z0-9]+_COMPLETE/.test(l) && !/^\s*FILES:/i.test(l))
  const words = kept.join('\n').trim().split(/\s+/)
  return words.length > maxWords ? words.slice(0, maxWords).join(' ') + ' …' : words.join(' ')
}

export function readReply(text, id) {
  return {
    complete: parseSentinel(text, id),
    rejected: parseRejection(text),
    handoffs: parseHandoffs(text),
    files: parseFiles(text),
    summary: summarize(text),
  }
}

// The three lines coordinator.md adds to every brief, plus the sentinel.
// The host appends them itself so a brief the model wrote without them still
// produces a reply the host can read.
export function threadFooter(id) {
  return [
    'You are working in a thread, not answering the person. Your final reply is read by the coordinator only.',
    'List every file you changed or read for the decision on one line: FILES: path, path',
    'Emit handoff lines, then the sentinel, as the last lines of your final reply.',
    'Handoff format (emit BEFORE sentinel): → [agent] ([domain]) · [file or symbol]: [what needs to happen]',
    `End with exactly: TASK_${id}_COMPLETE`,
  ].join('\n')
}
