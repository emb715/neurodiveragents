# Laws of Software Engineering — Research & Fleet Mapping

> Source: https://lawsofsoftwareengineering.com/ (Dr. Milan Milanović, 2026)
> Researched: April 27, 2026
> Updated: April 30, 2026 — fixed CAP Theorem framing, Goodhart's attribution (Goodhart 1975 + Strathern 1997), Premature Optimization quote, Linus's Law attribution (ESR); split Hype Cycle / Amara's Law into separate entries; added Wirth's Law; merged Conway's Law duplicate
> Scope: All 58 laws catalogued, classified, tagged, and mapped to ndv agents + modules

---

## Classification Schema

**Tags used:**
- `complexity` `quality` `design` `architecture` `teams` `planning` `scale` `decisions` `security` `performance` `testing` `observability`
- Polarity: `prescriptive` (do this) | `descriptive` (this happens) | `cautionary` (watch out)
- Strength: `law` (empirical/formal) | `principle` (design guideline) | `heuristic` (rule of thumb) | `bias` (human cognitive pattern)

---

## Complete Law Catalogue

### ARCHITECTURE

| # | Law | Core Statement | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|------|------|----------|-----------|------------|
| 1 | **Conway's Law** _(Architecture + Teams)_ | Systems mirror org communication structure | `architecture` `teams` `design` | descriptive | law | ndv-architect (Arc) | ndv-structural |
| 2 | **Hyrum's Law** | All observable behaviors become dependencies | `architecture` `quality` `design` | cautionary | law | ndv-architect (Arc) | ndv-structural, ndv-vigilant |
| 3 | **Gall's Law** | Complex systems evolve from simple working ones | `architecture` `complexity` `design` | prescriptive | law | ndv-architect (Arc) | ndv-structural, ndv-incremental |
| 4 | **Law of Leaky Abstractions** | All non-trivial abstractions leak | `architecture` `quality` `design` | descriptive | law | ndv-architect (Arc) | ndv-structural |
| 5 | **Tesler's Law** | Complexity is conserved, only shifted | `architecture` `complexity` `design` | descriptive | law | ndv-architect (Arc) | ndv-structural |
| 6 | **CAP Theorem** | During a network partition, a system must choose between consistency and availability; CA is achievable in a non-partitioned system. Brewer retracted the simplified "always pick 2 of 3" framing in 2012. | `architecture` `scale` | descriptive | law | ndv-architect (Arc) | ndv-structural |
| 7 | **Second-System Effect** | Successors to simple systems are overengineered | `architecture` `planning` `complexity` | cautionary | heuristic | ndv-architect (Arc) | ndv-structural, ndv-bounded |
| 8 | **Fallacies of Distributed Computing** | 8 false assumptions about distributed systems | `architecture` `scale` `security` | cautionary | heuristic | ndv-architect (Arc) | ndv-structural, ndv-vigilant |
| 9 | **Law of Unintended Consequences** | Complex system changes produce surprises | `architecture` `complexity` | descriptive | law | ndv-architect (Arc) | ndv-structural |
| 10 | **Zawinski's Law** | Every program expands until it can read mail | `architecture` `design` `complexity` | descriptive | heuristic | ndv-architect (Arc), ndv-scope (Bound) | ndv-bounded |

### TEAMS

| # | Law | Core Statement | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|------|------|----------|-----------|------------|
| 11 | **Brooks's Law** | Adding people to late project makes it later | `teams` `planning` | cautionary | law | ndv-honest (Honest) | ndv-bounded, ndv-skeptical |
| 12 | **Dunbar's Number** | ~150 max stable relationships per person | `teams` | descriptive | heuristic | ndv-honest | ndv-bounded |
| 13 | **Ringelmann Effect** | Individual productivity decreases as group grows | `teams` `performance` | descriptive | law | ndv-honest | ndv-bounded |
| 14 | **Price's Law** | √N contributors do 50% of work | `teams` | descriptive | heuristic | ndv-honest | ndv-bounded |
| 15 | **Putt's Law** | Those who understand tech don't manage it | `teams` `decisions` | descriptive | heuristic | ndv-honest | ndv-skeptical |
| 16 | **Peter Principle** | People rise to their level of incompetence | `teams` `decisions` | descriptive | heuristic | ndv-honest | ndv-skeptical |
| 17 | **Bus Factor** | Min people whose loss dooms a project | `teams` `quality` `security` | cautionary | heuristic | ndv-review (Acute) | ndv-vigilant, ndv-total-perception |
| 18 | **Dilbert Principle** | Incompetent promoted to management | `teams` `decisions` | descriptive | heuristic | ndv-honest | ndv-skeptical |

### PLANNING

| # | Law | Core Statement | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|------|------|----------|-----------|------------|
| 19 | **Premature Optimization** | Premature optimization is the root of all evil (Knuth) | `planning` `performance` `design` | cautionary | principle | ndv-optimize (Lean) | ndv-efficient |
| 20 | **Parkinson's Law** | Work expands to fill available time | `planning` | descriptive | law | ndv-scope (Bound), ndv-forecast (Datum) | ndv-bounded |
| 21 | **Ninety-Ninety Rule** | First 90% takes 90% of time; last 10% takes another 90% | `planning` | descriptive | heuristic | ndv-forecast (Datum) | ndv-skeptical |
| 22 | **Hofstadter's Law** | Always takes longer than expected, even accounting for this | `planning` | descriptive | law | ndv-forecast (Datum) | ndv-skeptical |
| 23 | **Goodhart's Law** | Any observed statistical regularity will tend to collapse once pressure is placed upon it for control purposes (Goodhart, 1975). Strathern (1997) paraphrase: when a measure becomes a target it ceases to be a good measure. | `planning` `decisions` `quality` | cautionary | law | ndv-signal (Signal) | ndv-skeptical |
| 24 | **Gilb's Law** | Anything you need to quantify can be measured better than not measuring | `planning` `quality` | prescriptive | heuristic | ndv-signal (Signal), ndv-telemetry (Pulse) | ndv-total-perception |

### QUALITY

| # | Law | Core Statement | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|------|------|----------|-----------|------------|
| 25 | **Boy Scout Rule** | Leave code better than you found it | `quality` `design` | prescriptive | principle | ndv-refactor (Just) | ndv-precise |
| 26 | **Murphy's Law** | Anything that can go wrong will | `quality` `testing` | cautionary | heuristic | ndv-tester (Edge) | ndv-adversarial |
| 27 | **Postel's Law** | Conservative in output, liberal in input | `quality` `design` `architecture` | prescriptive | principle | ndv-review (Acute) | ndv-vigilant |
| 28 | **Broken Windows Theory** | Visible neglect invites more neglect | `quality` `design` | cautionary | heuristic | ndv-review (Acute) | ndv-total-perception |
| 29 | **Technical Debt** | Shortcuts borrow against future velocity | `quality` `planning` | descriptive | heuristic | ndv-review (Acute) | ndv-total-perception |
| 30 | **Linus's Law** | Given enough eyeballs, all bugs are shallow. Coined by Eric S. Raymond in _The Cathedral and the Bazaar_ (1997), naming it after Linus Torvalds. ESR formulated it; Torvalds is the namesake. | `quality` `testing` `teams` | prescriptive | heuristic | ndv-review (Acute) | ndv-total-perception |
| 31 | **Kernighan's Law** | Debugging is twice as hard as writing | `quality` `complexity` | cautionary | principle | ndv-diagnose (Pierce) | ndv-skeptical |
| 32 | **Testing Pyramid** | Many unit → fewer integration → few E2E | `testing` `quality` | prescriptive | principle | ndv-tester (Edge) | ndv-adversarial |
| 33 | **Pesticide Paradox** | Repeated same tests lose effectiveness | `testing` `quality` | cautionary | heuristic | ndv-tester (Edge) | ndv-adversarial |
| 34 | **Lehman's Laws** | Software must evolve; evolution has predictable limits | `quality` `architecture` | descriptive | law | ndv-architect (Arc) | ndv-structural, ndv-temporal |
| 35 | **Sturgeon's Law** | 90% of everything is crap | `quality` `decisions` | descriptive | heuristic | ndv-review (Acute) | ndv-total-perception |

### SCALE

| # | Law | Core Statement | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|------|------|----------|-----------|------------|
| 36 | **Amdahl's Law** | Speedup limited by sequential fraction | `scale` `performance` `architecture` | descriptive | law | ndv-optimize (Lean) | ndv-efficient |
| 37 | **Gustafson's Law** | Speedup possible by increasing problem size (parallel) | `scale` `performance` | descriptive | law | ndv-optimize (Lean) | ndv-efficient |
| 38 | **Metcalfe's Law** | Network value ∝ users² | `scale` `architecture` | descriptive | law | ndv-architect (Arc) | ndv-structural |
| 39 | **Wirth's Law** | Software gets slower faster than hardware gets faster (Niklaus Wirth, 1995) | `performance` `scale` | cautionary | heuristic | ndv-optimize (Lean) | ndv-efficient |

### DESIGN

| # | Law | Core Statement | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|------|------|----------|-----------|------------|
| 40 | **DRY** | Every knowledge has one authoritative representation | `design` `quality` | prescriptive | principle | ndv-refactor (Just) | ndv-precise |
| 41 | **KISS** | Keep designs as simple as possible | `design` `complexity` | prescriptive | principle | ndv-architect (Arc) | ndv-structural |
| 42 | **SOLID** | Five OO design principles for maintainability | `design` `architecture` `quality` | prescriptive | principle | ndv-architect (Arc) | ndv-structural |
| 43 | **YAGNI** | Don't build until actually needed | `design` `planning` | prescriptive | principle | ndv-architect (Arc) | ndv-bounded, ndv-structural |
| 44 | **Law of Demeter** | Only talk to immediate neighbors | `design` `architecture` | prescriptive | principle | ndv-architect (Arc) | ndv-structural |
| 45 | **Principle of Least Astonishment** | Software should behave as users expect | `design` `quality` | prescriptive | principle | ndv-review (Acute) | ndv-total-perception |

### DECISIONS

| # | Law | Core Statement | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|------|------|----------|-----------|------------|
| 46 | **Dunning-Kruger Effect** | Less you know → more confident you feel | `decisions` `teams` | descriptive | bias | ndv-honest | ndv-skeptical |
| 47 | **Hanlon's Razor** | Never attribute to malice what stupidity explains | `decisions` `teams` | prescriptive | heuristic | ndv-honest | ndv-skeptical |
| 48 | **Occam's Razor** | Simplest explanation usually correct | `decisions` `design` | prescriptive | heuristic | ndv-honest | ndv-skeptical |
| 49 | **Sunk Cost Fallacy** | Past investment shouldn't drive future decisions | `decisions` `planning` | cautionary | bias | ndv-honest, ndv-scope (Bound) | ndv-bounded |
| 50 | **Map Is Not Territory** | Representations ≠ reality | `decisions` `architecture` | cautionary | heuristic | ndv-honest | ndv-skeptical |
| 51 | **Confirmation Bias** | We favor evidence that confirms existing beliefs | `decisions` | cautionary | bias | ndv-honest | ndv-skeptical |
| 52 | **Amara's Law** | "We tend to overestimate the effect of a technology in the short run and underestimate the effect in the long run." — Roy Amara (SRI International) | `decisions` `planning` | descriptive | heuristic | ndv-honest, ndv-architect (Arc+temporal) | ndv-skeptical, ndv-temporal |
| 53 | **Gartner Hype Cycle** | Five-stage predictive adoption model: Innovation Trigger → Peak of Inflated Expectations → Trough of Disillusionment → Slope of Enlightenment → Plateau of Productivity. Not a pithy statement — a model. (Jackie Fenn, Gartner, 1995) | `decisions` `planning` `architecture` | descriptive | heuristic | ndv-architect (Arc+temporal) | ndv-temporal, ndv-skeptical |
| 54 | **Lindy Effect** | Longer used → more likely to keep being used | `decisions` `architecture` | descriptive | heuristic | ndv-architect (Arc+temporal) | ndv-temporal |
| 55 | **First Principles Thinking** | Break problems to basics, rebuild up | `decisions` `design` | prescriptive | heuristic | ndv-architect (Arc) | ndv-structural |
| 56 | **Inversion** | Solve by working backward from failure | `decisions` `testing` | prescriptive | heuristic | ndv-tester (Edge) | ndv-adversarial |
| 57 | **Pareto Principle** | 80% effects from 20% causes | `decisions` `performance` `planning` | descriptive | heuristic | ndv-optimize (Lean) | ndv-efficient |
| 58 | **Cunningham's Law** | Post wrong answer to get correct one | `decisions` `quality` | prescriptive | heuristic | ndv-honest | ndv-direct |

---

## Agent ↔ Laws Mapping

### ndv-architect (Arc) — *Autistic systems thinking*

**Laws Arc embodies in its constitution:**
- **Gall's Law** — *"Complex systems evolve from simple ones"* → Arc's YAGNI enforcement, migrate incrementally
- **Conway's Law** — *"Systems mirror org structure"* → Arc's structural analysis includes team topology
- **Hyrum's Law** — *"All behaviors become dependencies"* → Leaky abstraction architecture smell
- **Law of Leaky Abstractions** — Core architectural smell detection
- **Tesler's Law** — Complexity shift, not elimination → drives Arc's "who absorbs complexity?" question
- **CAP Theorem** — Formal constraint Arc uses for distributed system assessments; partition forces C vs A, CA achievable without partition
- **SOLID** — Arc's primary checklist
- **KISS / YAGNI** — Anti-overengineering enforcement
- **Second-System Effect** — Arc explicitly rejects "rebuild from scratch" migration paths
- **Law of Unintended Consequences** — Arc's second/third-order effect analysis
- **Metcalfe's Law** — Network value considerations in scale reviews
- **Fallacies of Distributed Computing** — Trust-nothing assumption in distributed arch reviews
- **First Principles Thinking** — *"Every decision traceable to a principle"*
- **Zawinski's Law** — Feature creep = scope violation Arc flags immediately

**Arc gap:** Law of Demeter is implicit in Arc's "inappropriate intimacy" smell but not named. Principle of Least Astonishment could be more explicit.

**Arc update (April 27):** Added Longevity as 7th quality dimension via `ndv-temporal` module. Arc now assesses trajectory (Stable / Improving / Degrading / Aging) per component, Lindy durability per dependency, Gartner Hype Cycle position, and technical debt accrual rate — when system age >12 months or trajectory data is available.

---

### ndv-build (Craft) — *Autistic literal processing*

**Laws Craft embodies in its constitution:**
- **Gall's Law** — *"Complex systems evolve from simple ones"* → Craft's incremental verification (tsc after each file, tests before done) applies Gall at execution time: correct complex output emerges from verified simple steps
- **Ninety-Ninety Rule** — *"First 90% takes 90% of time; last 10% takes another 90%"* → "It compiles" is the first 90%. Acceptance criteria green is the second 90%. Craft refuses to stop at the first.
- **DRY** — *"Every knowledge has one authoritative representation"* → The spec is the single authoritative source. Craft never invents a second interpretation. What the spec says exists; what it doesn't say doesn't.
- **Map Is Not Territory** — *"Representations ≠ reality"* → The spec is the map. Craft makes the territory match it exactly — does not improve the map while building the territory.
- **Hyrum's Law** — *"All observable behaviors become dependencies"* → Every behavior Craft adds becomes a downstream dependency. Craft adds only what the spec specifies, preventing undocumented behaviors from becoming accidental contracts.
- **Law of Unintended Consequences** — Parallel streams touching shared files produce surprises that have nothing to do with either stream's logic. Craft's merge surface declaration prevents this class of surprise.

**Craft tension with Premature Optimization:** Craft serializes shared file writes even when parallelizing might be possible. This is correct — correctness is not optional, and the Premature Optimization law applies only to performance, not to correctness constraints.

---

### ndv-diagnose (Pierce) — *Hyperfocus, root cause only*

**Laws Pierce embodies:**
- **Kernighan's Law** — *"Debugging is 2x harder than writing"* → Pierce's protocol demands root cause, never symptom
- **Murphy's Law** — Every scenario that can fail will → drives adversarial hypothesis testing
- **Law of Unintended Consequences** — Pierce always checks downstream of a bug fix
- **Occam's Razor** — *"Simplest explanation"* — Pierce forms ONE hypothesis, most likely first
- **Hanlon's Razor** — Pierce doesn't assume intentional misdesign; looks for human error/misunderstanding

**Pierce insight:** His "confirm before move on" protocol is a direct implementation of combating the **Ninety-Ninety Rule** — the last 10% of debugging (verification) is where most time is lost.

---

### ndv-optimize (Lean) — *OCD efficiency, measure-first*

**Laws Lean embodies:**
- **Premature Optimization** — Lean's primordial rule IS Knuth's rule: measure before touching
- **Wirth's Law** — Software gets slower faster than hardware gets faster; Lean monitors this gap explicitly
- **Amdahl's Law** — Sequential bottlenecks cap all parallelism gains; Lean identifies these explicitly
- **Gustafson's Law** — Lean's parallel execution strategy for independent operations
- **Pareto Principle** — *"20% of code = 80% of slowness"* → Lean's 80/20 optimization rule
- **Goodhart's Law** — Lean measures actuals (ms, MB, queries), never proxies that can be gamed

**Lean tension with Postel's Law:** Being "liberal in acceptance" of imprecise input can mask perf bottlenecks. Lean would flag this.

---

### ndv-refactor (Just) — *OCD form correction*

**Laws Just embodies:**
- **DRY** — Duplicated logic is the primary transformation target
- **Boy Scout Rule** — Incremental improvement without behavior change
- **Broken Windows Theory** — Just's "half-transformed state is worse than untouched" mirrors broken window psychology exactly
- **SOLID / Single Responsibility** — Just's "one transformation type per batch" = SRP applied to the act of refactoring
- **Kernighan's Law** (inverse) — Just's output must be MORE debuggable than its input

**Just tension:** YAGNI tension — Just must not add behavior while refactoring, but might see missing abstractions. Bounded scope (ndv-bounded) is the resolution: note and defer.

---

### ndv-review (Acute) — *Total perception, nothing filtered*

**Laws Acute embodies:**
- **Broken Windows Theory** — Acute notices every broken window; severity classification is post-noticing
- **Linus's Law** — Acute IS the many eyeballs; code review surfacing everything (per ESR's formulation)
- **Postel's Law** — Acute checks: is this conservative in output, liberal in acceptance?
- **Sturgeon's Law** — Acute assumes most code has issues; validates rather than assumes quality
- **Bus Factor** — Acute flags single-author modules with no documentation
- **Technical Debt** — Every shortcut registered as finding at appropriate severity
- **Principle of Least Astonishment** — Acute flags surprising behaviors as Warning/Suggestion
- **Murphy's Law** — Acute checks every path that can fail

---

### ndv-secure (Ward) — *Hypervigilance, assume breach*

**Laws Ward embodies:**
- **Murphy's Law** — Anything that CAN be exploited WILL be → assume breach
- **Fallacies of Distributed Computing** — *"Network is secure"* is explicitly a fallacy Ward disproves
- **Postel's Law** (adversarially) — "Liberal acceptance" is a security risk; Ward validates every input
- **Hyrum's Law** — Undocumented behaviors become exploit surfaces
- **Law of Unintended Consequences** — Security patches cause unexpected behavior downstream
- **Hanlon's Razor** — Ward INVERTS this: never assume incompetence when an attack vector exists

**Ward's unique stance on Postel's Law:** Ward and Postel are in tension. Postel says accept liberally. Ward says every input is hostile. Resolution: liberal acceptance AFTER strict validation.

---

### ndv-tester (Edge) — *Adversarial by default*

**Laws Edge embodies:**
- **Murphy's Law** — Literally: what can go wrong, will → every test case is a Murphy scenario
- **Pesticide Paradox** — Edge's adversarial rotation explicitly avoids testing the same scenarios repeatedly
- **Testing Pyramid** — Edge's coverage strategy: adversarial unit first, integration next, E2E few
- **Inversion** — Edge tests by asking "how does this fail?" working backward from failure
- **Pareto Principle** — Critical paths (20%) get 100% coverage; utilities (80%) get 80%
- **Kernighan's Law** — Complex code → harder to test → Edge increases adversarial surface

**Edge tension with Goodhart's Law:** Coverage % as a target is exactly what Edge warns against — the "80% coverage of the wrong cases" observation IS Goodhart applied to testing.

---

### ndv-telemetry (Pulse) — *Additive only, detached observation*

**Laws Pulse embodies:**
- **Gilb's Law** — Anything quantifiable should be measured → Pulse's golden signals
- **Murphy's Law** — What can fail will; Pulse instruments every failure path
- **Goodhart's Law** — Pulse tracks multiple metrics across 4 golden signals to avoid single-metric gaming
- **Linus's Law** — Pulse IS observability: making every bug visible to many eyeballs via logs/traces
- **Law of Unintended Consequences** — Pulse's additive-only constraint prevents instrumentation from changing behavior
- **Broken Windows Theory** — Silent catches are Pulse's "broken windows"; every `catch {}` must be instrumented

**Pulse's Amdahl insight:** Distributed tracing exists precisely because sequential bottlenecks (Amdahl's sequential fraction) are invisible without it.

---

### ndv-explain (Patient) — *Bridge knowledge gaps*

**Laws Patient embodies:**
- **Postel's Law** — Patient's docs are conservative (precise, correct); readers are met liberally (any level)
- **Map Is Not Territory** — Patient documents reality, not ideal state; flags divergence
- **Principle of Least Astonishment** — Patient's docs eliminate surprises by defining all terms
- **Dunning-Kruger Effect** — Patient explicitly models reader knowledge level; never assumes expertise

---

### ndv-honest (Honest) — *Pure communication layer*

**Laws Honest embodies:**
- **Occam's Razor** — Simplest accurate answer, always
- **Hanlon's Razor** — Charitable interpretation default
- **Parkinson's Law** — Honest's token minimization is time-boxing applied to responses
- **Dunning-Kruger Effect** — Honest challenges overconfident assumptions immediately
- **Sunk Cost Fallacy** — Honest rejects "we're already X% done" as a decision driver
- **Confirmation Bias** — Skeptical by default; actively challenges the stated belief

---

### ndv-scope (Bound) — *Executive function as a service*

**Laws Bound enforces:**
- **Zawinski's Law** — every feature wants to expand; Bound stops it at the boundary
- **Second-System Effect** — rewrites grow to include everything v1 left out; Bound splits them
- **YAGNI** — work not required by a current stated need does not enter scope
- **Parkinson's Law** — unbounded scope fills unbounded time; define the wall or lose the timeline
- **Sunk Cost Fallacy** — "we already started" is not a reason to continue out-of-scope work
- **Single Responsibility** (SOLID) — one deliverable, one clear outcome; multiple outcomes require a split

**Bound's primary output:** Core / Coupled / Adjacent / Scope Creep / Hidden Work classification per work item, plus a Deferred List. Hands off to Datum for sizing, Arc for structural concerns.

---

### ndv-forecast (Datum) — *Temporal dysphoria, calibration as identity*

**Laws Datum enforces:**
- **Hofstadter's Law** — always takes longer than expected, recursively; Datum's multipliers account for this mechanically
- **Ninety-Ninety Rule** — "almost done" means halfway; Datum applies ×2 to every integration/polish phase
- **Brooks's Law** — adding people to a late project makes it later; Datum never recommends headcount as a time solution
- **Parkinson's Law** — estimates that are too loose create their own lateness; Datum produces tight ranges, not padding
- **Goodhart's Law** — velocity as a target stops measuring velocity; Datum rejects story points as commitment proxies
- **Dunning-Kruger Effect** — junior confidence in estimates is inversely correlated with accuracy; Datum challenges it

**Datum's primary output:** Optimistic / Realistic / Pessimistic range with named unknowns, multipliers cited by law, and a primary risk factor. Hands off to Bound for scope decisions, Arc for architectural unknowns.

---

### ndv-signal (Signal) — *Goodhart's Law as lived experience*

**Laws Signal enforces:**
- **Goodhart's Law** — the moment a measure becomes a target it degrades; Signal's operating condition
- **Gilb's Law** — approximate measurement beats none; Signal never removes a metric without a replacement
- **Pareto Principle** — 20% of metrics carry 80% of signal; Signal identifies the vital few
- **Dunning-Kruger Effect** — teams with low metric literacy are most confident their metrics are correct
- **Confirmation Bias** — metrics are often designed to confirm existing beliefs; Signal looks for what they cannot show
- **Map Is Not Territory** — the metric is a model of reality, not reality itself

**Signal's primary output:** Healthy / Degraded / Corrupted / Misleading classification per metric, distortion path named, composite recommendation of 3 metrics that triangulate the same reality from different angles.

---

### ndv-parallel-safe — *Emergent: adversarial toward assumed parallelism*

**Laws this module embodies:**
- **Amdahl's Law** — *"Speedup limited by sequential fraction"* → Parallel writes are only safe on the truly-parallel fraction. ndv-parallel-safe's classification step (exclusively owned vs shared) is Amdahl applied to write-stream decomposition: identify what must serialize (the shared fraction), then safely parallelize the rest. Skipping this produces incorrect output, not just suboptimal throughput.
- **Law of Unintended Consequences** — Two streams writing to a shared file produce a conflict that has nothing to do with either stream's logic. The surprise is a consequence of missing coordination, not of bad code. ndv-parallel-safe's declaration requirement prevents the class of surprise where the system is internally correct but the outputs overwrite each other.
- **DRY** — *"Every knowledge has one authoritative representation"* → Without a merge surface declaration, ownership information is distributed implicitly across both streams' assumptions — two representations of the same fact, guaranteed to diverge. The declaration is the single authoritative statement of what each stream owns.

**ndv-parallel-safe origin:** Extracted from ndv-build (Craft)'s merge surface protocol. The pattern emerged from a concrete failure: two parallel implementation streams both writing to a shared type file, producing a conflict with no record of which version was correct. The module generalizes the fix — classify before dispatching, serialize shared writes, prove independence before parallelizing — into a composable constraint any workflow can load.

**Relationship to ndv-efficient:** Lean (ndv-efficient) applies Gustafson's Law: increase parallelism to increase throughput. ndv-parallel-safe does not contradict this — it constrains *which writes* are safe to parallelize. These modules compose: ndv-efficient drives toward maximum parallelism; ndv-parallel-safe enforces that the parallelism claimed is actually safe. Together: parallelize aggressively, but prove it first.

---

## Module ↔ Laws Mapping

| Module | Primary Law Anchors |
|--------|---------------------|
| **ndv-structural** | Conway's, Gall's, Leaky Abstractions, Tesler's, CAP, SOLID, KISS, YAGNI, Zawinski's |
| **ndv-efficient** | Amdahl's, Gustafson's, Wirth's, Pareto, Premature Optimization |
| **ndv-vigilant** | Murphy's, Fallacies of Distributed Computing, Hyrum's |
| **ndv-adversarial** | Murphy's, Pesticide Paradox, Testing Pyramid, Inversion |
| **ndv-incremental** | Gall's, Boy Scout Rule, Ninety-Ninety Rule, Hofstadter's |
| **ndv-contextual** | Map Is Not Territory, Principle of Least Astonishment, Postel's |
| **ndv-bounded** | YAGNI, Zawinski's, Second-System Effect, Parkinson's, Sunk Cost |
| **ndv-direct** | Occam's Razor, Parkinson's, Goodhart's |
| **ndv-total-perception** | Linus's, Broken Windows, Sturgeon's, Bus Factor, Technical Debt |
| **ndv-precise** | DRY, Boy Scout, Broken Windows, SOLID-SRP |
| **ndv-skeptical** | Kernighan's, Hofstadter's, Dunning-Kruger, Ninety-Ninety, Confirmation Bias |
| **ndv-temporal** | Lehman's Laws, Lindy Effect, Amara's Law, Gartner Hype Cycle, Technical Debt (trajectory), Broken Windows (entropy) |
| **ndv-parallel-safe** | Amdahl's, Law of Unintended Consequences, DRY |

---

## Key Findings

### 1. Laws most deeply embedded in the fleet

These laws appear in 3+ agents because they describe universal software realities:

- **Murphy's Law** → Ward, Edge, Acute, Pulse, Pierce (5 agents)
- **Pareto Principle** → Lean, Arc, Edge, Honest (4 agents)
- **Broken Windows Theory** → Just, Acute, Pulse (3 agents)
- **YAGNI** → Arc, Just, Bounded module (3 agents)
- **Law of Unintended Consequences** → Arc, Pierce, Pulse (3 agents)
- **Kernighan's Law** → Pierce, Edge, Just (3 agents — complexity fights all three)

### 2. Remaining gaps (laws without a primary agent owner)

Previously all 10 gap laws were uncovered. After adding Bound, Datum, Signal, and ndv-temporal:

| Law | Status | Coverage |
|-----|--------|----------|
| **Hofstadter's Law** | ✅ Closed | ndv-forecast (Datum) — primary |
| **Ninety-Ninety Rule** | ✅ Closed | ndv-forecast (Datum) — primary |
| **Parkinson's Law** | ✅ Closed | ndv-scope (Bound) + ndv-forecast (Datum) |
| **Goodhart's Law** | ✅ Closed | ndv-signal (Signal) — primary |
| **Gilb's Law** | ✅ Closed | ndv-signal (Signal) — primary |
| **Sunk Cost Fallacy** | ✅ Closed | ndv-scope (Bound) co-owner |
| **Zawinski's Law** | ✅ Closed | ndv-scope (Bound) co-owner |
| **Lehman's Laws** | ✅ Closed | Arc + ndv-temporal module |
| **Lindy Effect** | ✅ Closed | Arc + ndv-temporal module |
| **Amara's Law** | ✅ Closed | ndv-honest + Arc + ndv-temporal module |
| **Gartner Hype Cycle** | ✅ Closed | Arc + ndv-temporal module |
| **Wirth's Law** | ✅ Closed | ndv-optimize (Lean) — primary |
| **Dunbar's Number** | ⚠️ Partial | ndv-honest handles conversationally; no structural owner |
| **Ringelmann Effect** | ⚠️ Intentional | Fleet design justification (single-agent-per-domain IS the fix) |
| **Price's Law** | ⚠️ Partial | ndv-review can flag Bus Factor + Price together; no dedicated owner |
| **Putt's Law / Peter / Dilbert** | ⚠️ Intentional | Org dysfunction outside fleet's action scope |
| **Metcalfe's Law** | ⚠️ Partial | Arc references in scale reviews; not a primary domain |
| **Cunningham's Law** | ⚠️ Partial | ndv-honest's directness covers the intent |

### 3. Tensions within the fleet

| Tension | Laws in conflict | Resolution in fleet |
|---------|-----------------|---------------------|
| **Security vs. Usability** | Postel's (accept liberally) vs. Ward's (trust nothing) | Validate strictly, then process — Ward wins at trust boundary |
| **Optimization vs. Readability** | Amdahl/Pareto vs. Kernighan | Lean: measure first; don't optimize readable code that isn't a hotspot |
| **Speed vs. Quality** | Parkinson's vs. Hofstadter's | Honest: acknowledge both — tight deadlines without impossible compression |
| **Coverage vs. Quality** | Goodhart's vs. Pesticide Paradox | Edge: adversarial quality over percentage targets |
| **Abstraction vs. Leakage** | DRY/SOLID vs. Leaky Abstractions | Arc: build abstractions knowing they will leak; design for the leak |

### 4. Laws that best explain the fleet's design choices

| Fleet design decision | Law it implements |
|-----------------------|------------------|
| One agent, one domain (no cross-domain fixes) | **Single Responsibility** (SOLID) |
| Handoff model between agents | **Conway's Law** inverse — team structure mirrors desired architecture |
| Parallel execution by default | **Amdahl's Law** — minimize sequential fractions |
| Merge surface declaration before parallel writes | **Amdahl's Law** + **Law of Unintended Consequences** + **DRY** — ndv-parallel-safe |
| Incremental steps, verify before next | **Gall's Law** + **Ninety-Ninety Rule** |
| Module extraction from agents | **DRY** — shared behaviors shouldn't repeat |
| ndv-bounded scope discipline | **Zawinski's Law** prevention + **YAGNI** |
| Agents don't fix other domains' issues | **Tesler's Law** — each agent absorbs complexity of its domain |
| Measure before optimizing (Lean) | **Premature Optimization** / **Goodhart's Law** |
| Additive-only telemetry (Pulse) | **Law of Unintended Consequences** |
| Adversarial testing default (Edge) | **Murphy's Law** + **Pesticide Paradox** |

### 5. Remaining improvement opportunities

| Improvement | Law | Where | Status |
|-------------|-----|-------|--------|
| Arc flag Dunbar's when reviewing large-team architectures | Dunbar's Number | ndv-architect | Open |
| Review explicitly pair Bus Factor + Price's Law as compound risk | Price's Law | ndv-review | Open |
| Lean name Gustafson's Law explicitly | Gustafson's Law | ndv-optimize | Open |
| ~~Arc flag Lehman's Laws in long-running system reviews~~ | Lehman's Laws | ndv-temporal module | ✅ Done |
| ~~Honest name Hype Cycle when challenging tech adoption~~ | Gartner Hype Cycle | ndv-temporal + Arc | ✅ Done |
| ~~Add dedicated estimation agent~~ | Hofstadter + 90/90 + Brooks | ndv-forecast (Datum) | ✅ Done |
| ~~Add scope enforcement agent~~ | Zawinski + YAGNI + Parkinson | ndv-scope (Bound) | ✅ Done |
| ~~Add metrics skeptic agent~~ | Goodhart + Gilb | ndv-signal (Signal) | ✅ Done |

---

## Summary Statistics

| Category | Count | Primary Agents |
|----------|-------|---------------|
| Architecture | 10 | Arc (9), Bound (1) |
| Teams | 8 | Honest (5), Acute (1), Arc (1), Review (1) |
| Planning | 6 | Datum (3), Bound (1), Signal (1), Pulse (1) |
| Quality | 11 | Acute (5), Edge (3), Pierce (2), Just (1) |
| Scale | 4 | Lean (3), Arc (1) |
| Design | 6 | Arc (4), Just (1), Acute (1) |
| Decisions | 13 | Honest (7), Signal (2), Arc+temporal (3), Edge (1) |
| **Total** | **58** | |

**Fleet size:** 15 agents (11 original + ndv-scope/Bound, ndv-forecast/Datum, ndv-signal/Signal, ndv-build/Craft) + 13 modules (11 original + ndv-temporal + ndv-parallel-safe)

**Most law-dense agent:** ndv-architect (Arc) — 22 laws across Architecture + Design + Longevity dimension via ndv-temporal
**Most behaviorally embedded:** ndv-optimize (Lean) — every operational step implements Premature Optimization + Pareto + Amdahl
**Tightest law-to-behavior ratio:** ndv-forecast (Datum) — 6 laws, each directly mapped to a multiplier or protocol step
**Least explicitly modeled:** ndv-explain (Patient) — could benefit from naming more laws (Map Is Not Territory, Dunning-Kruger) in its constitution

---

## Notable Cross-Law Clusters

### Cluster A: "The Complexity Is Never Gone" Cluster
Tesler → Leaky Abstractions → Law of Unintended Consequences → Zawinski's Law
> Complexity cannot be eliminated, only relocated. Abstractions leak. Changes surprise. Features accumulate.
> **Fleet implication:** Arc's migration paths must account for where complexity goes, not just what it removes.

### Cluster B: "Estimation Is Broken" Cluster
Hofstadter → Ninety-Ninety Rule → Brooks's Law → Parkinson's Law
> We underestimate always. Adding people makes it worse. Given time, we use it.
> **Fleet implication (updated):** ndv-forecast (Datum) now owns this cluster directly. Datum applies the laws as mechanical multipliers, produces ranges instead of points, and names every unknown. Bound enforces the scope wall before Datum sizes it.

### Cluster C: "Measurement Paradox" Cluster
Goodhart → Gilb → Pareto → Premature Optimization
> Measure, but don't make measures targets. Measure the right 20%. Measure before acting.
> **Fleet implication (updated):** ndv-signal (Signal) now owns the Goodhart/Gilb half — auditing whether metrics measure what they claim. Lean + Pulse still own the Pareto/Premature Optimization half. Signal is the missing piece that asks "should we be tracking this at all?"

### Cluster D: "Social Loafing in Large Groups" Cluster
Dunbar → Ringelmann → Price's Law → Brooks's Law → Conway's Law
> Groups have cognitive limits. Productivity per person drops. A few do most of the work. Adding people to a late project makes it later. Structure mirrors communication.
> **Fleet implication:** The fleet's single-agent-per-domain design is a direct implementation of Ringelmann avoidance + Conway optimization.

### Cluster E: "Quality Degrades Without Attention" Cluster
Broken Windows → Technical Debt → Boy Scout Rule → Pesticide Paradox
> Neglect compounds. Shortcuts accrue interest. Clean incrementally. Vary your tests.
> **Fleet implication:** Just + Acute + Edge together implement this cluster — a continuous quality loop.

### Cluster F: "Time as a Dimension" Cluster
Lehman's Laws → Lindy Effect → Amara's Law → Gartner Hype Cycle → Technical Debt (trajectory) → Broken Windows (entropy)
> Software must evolve. What survives long, survives longer. We overestimate short-run tech impact. Hype Cycle peaks are the worst time to adopt. Debt compounds. Neglect accelerates.
> **Fleet implication:** ndv-temporal module + Arc's Longevity dimension implement this cluster. Arc now answers not just "is this built right?" but "is this aging well?"

### Cluster G: "Pre-Implementation Triad" Cluster
Zawinski's → YAGNI → Parkinson's → Hofstadter's → Ninety-Ninety Rule → Brooks's Law
> Define the boundary. Build only what's needed. Time will expand to fill the space. It will still take longer. The last 10% is 90% of the work. Adding people makes it worse.
> **Fleet implication:** Bound (ndv-scope) + Datum (ndv-forecast) now form a pre-implementation gate. Bound defines what ships. Datum prices what Bound defined. Neither existed before — the fleet had no upstream guardrails before code was written.
