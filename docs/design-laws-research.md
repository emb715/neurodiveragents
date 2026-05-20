# Laws of Design — Research & Fleet Mapping

> Source: 9 canonical design books catalogued via https://sobrief.com/lists/top-10-essential-design-principles-books-for-beginners
> Scope: All design laws extracted, classified, tagged, and mapped to ndv-design (Pixel)
> Companion to: `docs/laws-research.md` (software engineering laws)

---

## Source Books

| # | Title | Author | Year | Domain |
|---|---|---|---|---|
| B1 | *The Design of Everyday Things* | Donald A. Norman | 1988 | Human-centered design, affordances, mental models |
| B2 | *Don't Make Me Think* | Steve Krug | 2000 | Web usability, scanning behavior, navigation |
| B3 | *The Laws of Simplicity* | John Maeda | 2006 | Reduction, organization, emotional design |
| B4 | *Lean UX* | Jeff Gothelf | 2012 | Outcome-driven design, hypothesis-driven iteration |
| B5 | *100 Things Every Designer Needs to Know About People* | Susan M. Weinschenk | 2011 | Cognitive psychology, perception, memory, motivation |
| B6 | *Universal Principles of Design* | William Lidwell | 2003 | Cross-domain design laws, Gestalt, hierarchy |
| B7 | *The Non-Designer's Design Book* | Robin P. Williams | 2011 | PARC (Proximity, Alignment, Repetition, Contrast) |
| B8 | *Articulating Design Decisions* | Tom Greever | 2015 | Design rationale, stakeholder communication, principled decisions |
| B9 | *Designing with the Mind in Mind* | Jeff Johnson | 2010 | Cognitive psychology applied to UI, Fitts' Law, responsiveness |

---

## Classification Schema

**Tags used:**
- `perception` `cognition` `composition` `interaction` `decision` `visual` `ux` `accessibility` `emotion` `consistency`
- Polarity: `prescriptive` (do this) | `descriptive` (this happens) | `cautionary` (watch out)
- Strength: `law` (empirical/formal) | `principle` (design guideline) | `heuristic` (rule of thumb)

---

## Complete Law Catalogue

### CLUSTER A: PERCEPTION
*How users actually see — not how designers intend them to see*

| # | Law | Core Statement | Source | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|--------|------|------|----------|-----------|------------|
| D-1 | **Norman's Affordance Law** | Every interactive element must signal what it does through its visual form. Absent or wrong signifiers are broken design — not user error. | B1 Norman | `perception` `ux` `visual` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-2 | **Gulf of Execution / Evaluation** | Two gaps always exist between user and system: the gulf of execution (intent → action) and the gulf of evaluation (action → understanding). Design must bridge both explicitly. | B1 Norman | `perception` `ux` `interaction` | descriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-3 | **Perception Bias Law** | What a user perceives is not an accurate reflection of reality — it is filtered by past experience, current context, and active goals. Design for the perceived interface, not the intended one. | B9 Johnson | `perception` `cognition` | descriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-4 | **Contrast Primacy Law** | Vision is optimized for structure and contrast, not absolute brightness. The eye finds edges, not values. Information conveyed only through subtle color differences will fail for a significant portion of users. | B9 Johnson | `perception` `visual` `accessibility` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-5 | **Gestalt Grouping** | Proximity, similarity, closure, and continuity are not aesthetic choices — they are how the brain constructs meaning from visual fields. Violating them produces interfaces users cannot parse without conscious effort. | B6 Lidwell, B7 Williams | `perception` `composition` `visual` | descriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-6 | **Peripheral Vision Law** | Peripheral vision is roughly equivalent to a frosted shower door. Users enjoy the illusion of seeing the periphery clearly. Critical information placed outside the foveal zone will not be noticed. | B9 Johnson | `perception` `visual` | cautionary | law | ndv-design (Pixel) | ndv-perceptual |
| D-7 | **Inattentional Blindness** | When a user is focused on a task, they will not notice elements — even obvious ones — that fall outside their attentional path. Design cannot assume visibility equals noticing. | B9 Johnson, B5 Weinschenk | `perception` `cognition` | cautionary | law | ndv-design (Pixel) | ndv-perceptual |

---

### CLUSTER B: COGNITION
*What users must hold in their minds — and what breaks when that limit is exceeded*

| # | Law | Core Statement | Source | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|--------|------|------|----------|-----------|------------|
| D-8 | **Miller's Constraint** | Working memory holds approximately 4 items simultaneously (Weinschenk's empirical update of Miller's original 7±2). Every item the user must track is a tax on the interaction. Exceeding 4 produces errors and abandonment. | B5 Weinschenk, B9 Johnson | `cognition` `ux` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-9 | **Recognition Over Recall** | Recognition is easy; recall is hard. Interfaces that provide cues fail less than interfaces that demand memory. Every piece of information a user must remember is a failure mode. | B9 Johnson, B2 Krug | `cognition` `ux` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-10 | **Hick's Law (Cognitive Load)** | The time to make a decision increases logarithmically with the number of alternatives. More choices create more friction, not more freedom. Reducing options is a design improvement. | B6 Lidwell, B5 Weinschenk | `cognition` `ux` `decision` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-11 | **Scanning Law** | Users do not read interfaces — they scan them. Content must be structured for the scanner: meaningful headings, short paragraphs, frontloaded information, visual anchors. Walls of prose are not read; they are abandoned. | B2 Krug | `cognition` `visual` `ux` | descriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-12 | **Reading Disruption** | Reading is an unnatural skill that breaks easily. Poor contrast, unfamiliar terminology, competing visual elements, or inconsistent layout fragment comprehension and increase error rates. | B9 Johnson | `cognition` `visual` `accessibility` | cautionary | law | ndv-design (Pixel) | ndv-perceptual |

---

### CLUSTER C: COMPOSITION
*The visual structure that organizes meaning across the surface*

| # | Law | Core Statement | Source | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|--------|------|------|----------|-----------|------------|
| D-13 | **PARC Principle** | Four forces govern all visual composition: **Proximity** groups related elements. **Alignment** creates invisible structure. **Repetition** teaches patterns. **Contrast** creates emphasis and hierarchy. Nothing on the surface is arbitrary — every element has a visual relationship with something else, or it is noise. | B7 Williams | `composition` `visual` | prescriptive | principle | ndv-design (Pixel) | ndv-perceptual |
| D-14 | **Visual Hierarchy Law** | Important elements must be more prominent through size, weight, color, or position. A clear reading order must exist. When everything is equally prominent, the eye has nowhere to go and the user must construct hierarchy themselves — a cognitive cost they did not agree to pay. | B2 Krug, B6 Lidwell, B7 Williams | `composition` `visual` `cognition` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-15 | **Aesthetic-Usability Effect** | Aesthetically pleasing designs are perceived as easier to use — even when objectively they are not. Visual quality is a trust signal. Poor aesthetics prime users for difficulty before they interact. This is not vanity; it is perception management. | B6 Lidwell | `composition` `visual` `emotion` | descriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-16 | **Clickability Law** | What is interactive must look interactive. False affordances (non-interactive elements that look clickable) and hidden affordances (interactive elements that don't look it) both break user trust and produce errors. The rule for links and buttons: make it obvious. | B2 Krug | `composition` `ux` `perception` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-17 | **Reduction Law** | Simplicity is subtracting the obvious and adding the meaningful (Maeda). Every element on a surface must earn its presence. If you cannot state what this element contributes to the user's goal, it should not be there. Removal is a design act, not a concession. | B3 Maeda, B2 Krug | `composition` `ux` `decision` | prescriptive | principle | ndv-design (Pixel) | ndv-perceptual |

---

### CLUSTER D: INTERACTION
*The user moving through time — action, feedback, error, recovery*

| # | Law | Core Statement | Source | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|--------|------|------|----------|-----------|------------|
| D-18 | **Fitts' Law** | The time to reach a target is a logarithmic function of its distance and size: T = a + b × log₂(D/W). Large targets nearby are fast and accurate. Small targets far from common starting points are slow and error-prone. This is physics applied to interaction — not a preference. | B9 Johnson | `interaction` `ux` `accessibility` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-19 | **Feedback Law** | Every action must produce immediate, clear, relevant feedback. The absence of feedback is interpreted as failure. The user who clicked a button and heard nothing will click it again, then again, then conclude the system is broken — even if it is working. | B1 Norman, B9 Johnson | `interaction` `ux` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-20 | **Responsiveness Threshold** | Three human time constants govern interface perception: 0.1s = instantaneous (no indicator needed). 1s = interrupted (show a spinner). 10s = attention lost (show progress and allow cancellation). Exceeding these thresholds without feedback breaks the user's perception of control. | B9 Johnson | `interaction` `ux` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-21 | **Error Inevitability** | If an error is possible, someone will make it. Errors are not user failures — they are design failures. Anticipate every error, minimize its probability, and ensure recovery is always available. A design that blames the user for a predictable mistake is a broken design. | B1 Norman, B5 Weinschenk | `interaction` `ux` `accessibility` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-22 | **Familiarity Law** | Well-practiced paths become automatic and effortless. Novel interactions require conscious attention and produce higher error rates. Follow established conventions unless the departure delivers measurable value that outweighs the relearning cost. Novelty is not a feature. | B9 Johnson, B2 Krug | `interaction` `ux` `consistency` | prescriptive | principle | ndv-design (Pixel) | ndv-perceptual |

---

### CLUSTER E: DECISION
*The judgment layer — why this choice, defended by what principle*

| # | Law | Core Statement | Source | Tags | Type | Strength | NDV Agent | NDV Module |
|---|-----|----------------|--------|------|------|----------|-----------|------------|
| D-23 | **Principled Decision Law** | Every design decision must be traceable to a user need or a design principle. "I like it this way" is not a reason. A decision that cannot be defended with a law is arbitrary, and arbitrary decisions are defects that will surface in user testing, stakeholder reviews, and maintenance disagreements. | B8 Greever | `decision` `ux` | prescriptive | principle | ndv-design (Pixel) | ndv-perceptual |
| D-24 | **Outcome Over Aesthetic** | Design solves user and business problems. A beautiful design that does not move the user toward their goal is expensive decoration. Measure success by outcomes (task completion, error rate, user confidence) — not by how the design looks in isolation. | B4 Gothelf, B8 Greever | `decision` `ux` | prescriptive | principle | ndv-design (Pixel) | ndv-perceptual |
| D-25 | **Emotional Resonance Law** | Users are not rational actors. Most decisions are made unconsciously and are strongly influenced by emotional register. A design that is functionally correct but emotionally incongruent with the user's context will be resisted, avoided, or abandoned. Design must account for how it feels, not just what it does. | B5 Weinschenk, B3 Maeda | `decision` `emotion` `ux` | descriptive | law | ndv-design (Pixel) | ndv-perceptual |
| D-26 | **Trust-Through-Consistency** | Repetition of patterns teaches users the system's rules. Each time a pattern is violated — same action, different result; same element, different behavior — trust is fractured and the user must relearn. A system inconsistent with itself cannot be learned, only endured. | B3 Maeda, B7 Williams | `decision` `consistency` `ux` | prescriptive | law | ndv-design (Pixel) | ndv-perceptual |

---

## Summary Statistics

| Cluster | Count | Primary focus |
|---------|-------|---------------|
| Perception | 7 (D-1 to D-7) | What users actually see vs. what designers intend |
| Cognition | 5 (D-8 to D-12) | Working memory limits, scanning, reading fragility |
| Composition | 5 (D-13 to D-17) | PARC, hierarchy, aesthetics, reduction |
| Interaction | 5 (D-18 to D-22) | Fitts' law, feedback, time thresholds, error, convention |
| Decision | 4 (D-23 to D-26) | Principled choices, outcomes, emotion, consistency |
| **Total** | **26** | |

**All 26 laws are owned by:** ndv-design (Pixel)
**All 26 laws derive from:** ndv-perceptual (future cognitive skill module)

---

## Key Findings

### 1. The perception-cognition bridge is the most violated gap in UI code

Laws D-1 through D-12 form a continuous chain: what the eye sees (D-1 to D-7) loads directly into what the mind must process (D-8 to D-12). Every visual violation in cluster A amplifies the cognitive cost in cluster B. A broken hierarchy (D-14) does not just look wrong — it forces the user to construct their own reading order (cognitive load, D-8) without recognition cues (D-9), making every interaction slower and more error-prone.

### 2. PARC is the practical operating system of composition

Williams' PARC principle (D-13) is not one law among many — it is the mechanism that implements D-5 (Gestalt), D-14 (hierarchy), D-16 (clickability), and D-17 (reduction) simultaneously. A designer who applies PARC correctly rarely violates the composition cluster laws. It is the minimum viable structure for principled visual composition.

### 3. The decision cluster is what separates principled from arbitrary design

Laws D-23 through D-26 are the meta-layer. They are not about what to do — they are about whether a decision can be defended. Without D-23 (principled decision law), the other 25 laws become optional guidelines. With it, they become requirements. Every finding in ndv-design must cite a law — D-23 is the enforcement mechanism.

### 4. The 26 design laws and the software engineering laws are complementary, not redundant

The software engineering laws (`docs/laws-research.md`) govern code structure, team behavior, and system architecture. The design laws govern what users perceive, process, and feel. A system can satisfy every SOLID principle and Conway's Law while violating D-14 (visual hierarchy) and D-8 (Miller's constraint) — making it architecturally correct and experientially broken. Both catalogues are required.

### 5. Cross-law clusters that produce the most systemic failures

**"The invisible primary action" cluster:** D-1 (absent affordance) + D-14 (hierarchy collapse) + D-16 (clickability failure) → the most important action on the surface is not findable.

**"The working memory bomb" cluster:** D-8 (Miller's constraint exceeded) + D-9 (recall demanded) + D-10 (too many choices) → the user abandons because the cost of deciding is higher than the value of completing.

**"The feedbackless void" cluster:** D-19 (no feedback) + D-20 (threshold exceeded) + D-2 (gulf of evaluation not bridged) → the user cannot determine if their action had any effect.

---

## Relationship to Software Engineering Laws

| Design principle | Engineering analogue | Shared concern |
|---|---|---|
| D-23 Principled Decision Law | "It works without a principled reason is a liability" (Arc's primordial rule) | Every decision must be traceable |
| D-26 Trust-Through-Consistency | Conway's Law — systems mirror their structure | Inconsistency compounds |
| D-17 Reduction Law | YAGNI — complexity must be justified | Remove what doesn't earn its place |
| D-21 Error Inevitability | Murphy's Law — if it can fail, it will | Design for failure, not around it |
| D-8 Miller's Constraint | Cognitive load in system design (Gall's Law, Tesler's Law) | Complexity is conserved — hide it or users pay |

---

*Last updated: 2026-05*
*Source research: All 9 books read in full via sobrief.com (May 2026 session)*
