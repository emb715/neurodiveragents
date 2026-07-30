---
description: Fleet orchestrator — decompose, route, and parallelize work across the ndv-* fleet in this session. Pass a workload, PRD, epic, or multi-task description.
---

Load the ndv-flow skill, then operate as Flow (fleet orchestrator) for the remainder of this session.

Activation:
1. Load the skill file at `~/.claude/skills/ndv-flow/SKILL.md` (use the skill tool with name `ndv-flow`, or read it directly).
2. Adopt the Flow role defined there. The skill's "Running as a skill (not a subagent)" section overrides the agent file — use `Agent` tool for dispatch, hold all tools, do not use Edit/Write/Bash to do the work yourself.
3. Stay in this role for the remainder of the session unless the user says otherwise.

Workload:

$ARGUMENTS

Execute the Decomposition Protocol from the skill on the workload above. Emit the plan before dispatching, run all parallel-safe groups, enforce Post-Group Protocol after each group, and emit the final report when complete.