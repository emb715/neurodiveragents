/**
 * surfaces/terminal.js: the first chat surface, a plain terminal.
 *
 *   anything            a message to the coordinator
 *   /t 3 <text>         write into thread T3 directly (steering it)
 *   /d 1 <answer>       answer decision D1 (an option number or your own words)
 *   /ledger             print the ledger
 *   /quit               stop (in-flight threads resume on the next start)
 *
 * Any surface only needs post(text) and askDecision(d); a Slack or web
 * surface is the same two functions plus whatever feeds host.chat().
 */

import readline from 'node:readline'

export function terminalSurface({ output = process.stdout, quiet = false } = {}) {
  const say = s => output.write(`\n${s}\n> `)
  const dim = s => (output.isTTY ? `\x1b[2m${s}\x1b[22m` : s)
  const time = () => new Date().toTimeString().slice(0, 8)
  return {
    // Progress lines: dim, timestamped, one per action. --quiet turns them off.
    status: quiet ? undefined : line => output.write(`\r${dim(`  ${time()}  ${line}`)}\n> `),
    post: text => say(`coordinator: ${text}`),
    askDecision: d => say([
      `decision D${d.id}: ${d.question}`,
      ...d.options.map((o, i) => `  ${i + 1}. ${o}${i === d.recommended ? '  (recommended)' : ''}`),
      `answer with /d ${d.id} <number or words>`,
    ].join('\n')),
  }
}

export function attachTerminal(host, { input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output, prompt: '> ' })
  rl.prompt()
  rl.on('line', line => {
    const text = line.trim()
    try {
      if (!text) { /* nothing */ } else if (text === '/quit') { host.stop(); rl.close(); return } else if (text === '/ledger') {
        output.write(host.ledger.table() + '\n')
      } else if (text.startsWith('/t ')) {
        const [, id, ...rest] = text.split(' ')
        host.personToThread(id, rest.join(' '))
      } else if (text.startsWith('/d ')) {
        const [, id, ...rest] = text.split(' ')
        const answer = rest.join(' ')
        const d = host.state.decisions.find(x => x.id === Number(id))
        const n = Number(answer)
        host.answerDecision(id, d && Number.isInteger(n) && d.options[n - 1] ? d.options[n - 1] : answer)
      } else {
        host.chat(text)
      }
    } catch (err) {
      output.write(`error: ${err.message}\n`)
    }
    rl.prompt()
  })
  return rl
}
