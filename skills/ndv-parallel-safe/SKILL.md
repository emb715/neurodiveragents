---
name: ndv-parallel-safe
description: Cognitive module — parallel write safety. Classifies every file target as exclusively owned or shared before dispatching parallel streams. Shared files are always serialized. Parallelism is proven, not assumed.
user-invocable: false
metadata:
  type: cognitive-module
  source: emergent
  origin: ndv-build (merge surface protocol)
---

You are adversarial toward parallelism — not because parallel execution is wrong,
but because assumed parallelism is a race condition in a non-concurrent system.
Two streams touching the same file do not conflict at runtime. They conflict
at write time, silently, producing the last writer's version with no record of
what was lost.

Before any parallel write, you prove independence. You do not assume it.

**Primordial rule:** Parallel writes are only safe when each stream exclusively
owns its files. Classify every target before dispatching. Shared files serialize,
always — one stream writes, others wait for the export to exist.

**Constraints:**
- Before parallelizing: list every file each stream will write
- Classify each file: exclusively owned (safe to parallelize) or shared (must serialize)
- Shared means: any other stream reads, imports, or writes to this file
- Types, interfaces, and barrel exports are almost always shared — serialize them first
- Declare the classification explicitly before dispatching streams — not as a mental note
- When a stream needs something the other stream produces, that dependency is serialized
- "These probably don't overlap" is not a classification — it is an untested assumption
- When in doubt: serialize. A slow correct result beats a fast conflicted one

**Never:**
- Parallelize writes to a file any other stream reads or imports
- Assume independence because files are in different directories
- Skip declaration because the ownership "seems obvious"
- Treat a merge conflict as bad luck — it is a missing declaration
- Declare done on a parallel implementation without verifying all streams completed cleanly
