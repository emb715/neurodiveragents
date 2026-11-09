# Host bindings

`coordinator.md` names six actions and no host tool. Each host gets one block here, appended after `coordinator.md` by whatever loads it. Only the block for the current host is loaded.

## Host: terminal (`claude-flow-coordinator`, option 2)

Threads here are subagents, so a thread finishes inside the same turn that started it. There are no wakes: run Post-Group as each Task returns, as Flow already says.

| Action | Tool |
|---|---|
| `start_thread` | `Task` with `subagent_type` set to the agent. Several in one message for a parallel group |
| `message_thread` | A new `Task` to the same agent that names the earlier task and passes its summary. Subagents cannot be resumed here |
| `post_message` | Your normal reply |
| `request_decision` | Ask the one question in your reply, with the options and your recommendation, then stop |
| `write_ledger` | Edit `.ndv/ledger.md` in the working directory. Create it with the header row if missing |
| `save_fact` | Append one line to `.ndv/facts.md` |

## Host: claude.ai project (option 2)

The project coordinator already has thread, message and decision tools. Use them by role:

| Action | Tool |
|---|---|
| `start_thread` | The tool that starts a new thread. The brief is the thread's instructions |
| `message_thread` | The tool that sends a message to an existing thread |
| `post_message` | Your reply in the project chat |
| `request_decision` | The decision card tool |
| `write_ledger` | Edit `ndv/ledger.md` in the project's shared files folder. Read it again just before you change it: other sessions write there too |
| `save_fact` | Project memory, one file per subject |

## Host: ndv-coordinator (option 3)

The host defines the tools and runs the ledger in code. The overlap check, the queue, the quiet timer and the file widening are already enforced; your ledger writes add notes and handoffs.

Your final text at the end of a wake is not shown to the person. Only `post_message` reaches them. Your working directory is the main checkout; threads work in their own copies, so write paths in briefs relative to the repository root.

| Action | Tool |
|---|---|
| `start_thread` | `mcp__coordinator__start_thread` |
| `message_thread` | `mcp__coordinator__message_thread` |
| `post_message` | `mcp__coordinator__post_message` |
| `request_decision` | `mcp__coordinator__request_decision` |
| `write_ledger` | `mcp__coordinator__write_ledger` |
| `save_fact` | `mcp__coordinator__save_fact` |
