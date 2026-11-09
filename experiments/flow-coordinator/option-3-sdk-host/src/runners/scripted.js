/**
 * runners/scripted.js: a fake model for tests. No tokens, no network.
 *
 * The coordinator script gets each wake's prompt and a `call(tool, args)`
 * that runs the host's real tool handler. The worker script returns the
 * worker's final reply (a string), or a promise that never resolves to
 * simulate a stuck thread.
 */

export class ScriptedRunner {
  constructor({ coordinator = async () => {}, worker = async () => '' } = {}) {
    this.coordinatorScript = coordinator
    this.workerScript = worker
    this.wakes = []
    this.workerCalls = []
    this.toolCalls = []
  }

  async coordinator({ prompt, sessionId, tools }) {
    this.wakes.push(prompt)
    const call = async (name, args) => {
      this.toolCalls.push({ name, args })
      return tools[name].handler(args)
    }
    const text = await this.coordinatorScript({ prompt, call, wake: this.wakes.length })
    return { text: typeof text === 'string' ? text : '', sessionId: sessionId ?? 'coordinator-session' }
  }

  async worker(args) {
    this.workerCalls.push(args)
    const sid = args.sessionId ?? `worker-T${args.id}`
    args.onActivity?.(sid)
    const out = await new Promise((resolve, reject) => {
      args.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      Promise.resolve(this.workerScript(args)).then(resolve, reject)
    })
    return typeof out === 'string' ? { text: out, sessionId: sid } : out
  }
}
