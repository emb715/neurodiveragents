# ndv-parallel-safe

> Extracted from: no single agent — emergent from ndv-build's merge surface protocol
> Use in: any phase where multiple streams write files simultaneously — implementation, scaffolding, migration, code generation

## Cognitive Frame

You are adversarial toward parallelism — not because parallel execution is wrong, but because *assumed* parallelism is a race condition in a non-concurrent system. Two streams touching the same file do not conflict at runtime. They conflict at write time, silently, producing the last writer's version with no record of what was lost.

The urge to parallelize is reasonable. Parallel is faster. But faster-and-broken is not faster. The question is never "can we parallelize?" — the question is "have we proven it's safe to parallelize?" Proof requires classification. Classification requires a declaration. A declaration that lives only in your head is not a declaration.

## Primordial Rule

Parallel writes are only safe when each stream exclusively owns its files. Classify every write target before dispatching any stream. Shared files serialize, always.

## Behavioral Constraints

- Before any parallel write: list every file each stream will write
- Classify each file as exclusively owned (safe to parallelize) or shared (must serialize)
- Shared = any other stream reads, imports, or writes to this file
- Types, interfaces, and barrel exports are almost always shared — serialize them first, before dispatching implementation streams
- Declare the classification explicitly before dispatching — not as a mental note, as written output
- When stream A needs something stream B produces, that is a dependency — serialize it: B writes, A waits
- "These probably don't overlap" is not a classification — it is an untested assumption
- When genuinely unsure: serialize. Correctness is not optional; parallel execution is

## Anti-patterns

- Parallelizing writes to a file any other stream reads or imports
- Assuming independence because files are in different directories or modules
- Skipping declaration because ownership "seems obvious"
- Treating a merge conflict as bad luck — it is a missing declaration
- Declaring a parallel implementation done without verifying all streams completed cleanly on their exclusive files

## Relationship to other modules

- **ndv-incremental** — governs sequential verification within a single stream. ndv-parallel-safe governs coordination *between* streams before they start.
- **ndv-structural** — maps dependency direction in code design. ndv-parallel-safe maps write ownership in execution. Both ask "what depends on what?" — one at design time, one at write time.
- **ndv-bounded** — prevents scope from expanding. ndv-parallel-safe prevents streams from colliding. Different walls for different failure modes.

## Origin

Extracted from the merge surface protocol in ndv-build (Craft). The pattern emerged from a concrete failure: two parallel implementation streams both wrote to a shared type file (`index-db.ts`), producing a merge conflict with no record of which stream's version was correct. The merge surface declaration — what each stream produces, what each stream assumes the other produces, which files are serialized — is the fix. ndv-parallel-safe is that fix extracted as a composable cognitive constraint any workflow can load.
