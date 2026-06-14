# OPTIMIZATION SPEC — "ANCIENTS"

A working plan for the next optimization pass, covering **simulation performance**, **render/engine performance**, **gameplay responsiveness**, and **testing**. This is the companion to `SPEC.md` (design target), `PROGRESS.md` (status), and `DECISIONS.md` (calls made). It is direction, not a gate — same crunch-mode rules as `SPEC.md §0`.

The game is functionally at Phase 4. It runs, but it has never been profiled or stress-tested, and the three remaining Phase 4 checklist items are exactly the ones this addresses: balance pass, audio, and the **performance pass against budget** (`PROGRESS.md`). The §0 budget — **60fps with 30 active units and ~200 live projectiles/particles** — is asserted nowhere in the test suite.

---

## 0. PRINCIPLES (what must not change)

- **The headless core stays headless and deterministic.** Every sim optimization must preserve identical results for a given seed. The determinism hash (`Sim.hash()`) and the fixed-seed 5v5 winner test are the contract. If an optimization changes ordering, it must change the hash test deliberately and be logged in `DECISIONS.md`.
- **No behavior changes smuggled into perf work.** Spatial indexing, pooling, and allocation cuts are refactors: same outputs, fewer cycles/allocations. Gameplay-feel changes (§C) are separate, opt-in, and individually justified.
- **Measure first.** No optimization lands without a before/after number from the harness in §D.1. We are optimizing against a budget, not vibes.
- **Pay for what's on screen / in the fight.** The overworld can hold a town, several camps, a Necromancer-style summon army, and an entourage simultaneously; raids field 5 heroes + adds + a boss. The current code assumes small fights.

---

## A. SIMULATION PERFORMANCE

The 30 Hz tick (`src/core/sim.ts` `tick()`, lines 865–898) runs a fixed pipeline: statuses → refresh → AI think → actions → projectiles → zones → repeaters → auras → regen. Almost every stage is a linear or quadratic scan over `unitsArr`, and there is **no spatial structure anywhere** (confirmed: only `terrain.ts` uses instancing; the sim has no grid/quadtree). `dist2` exists in `math2d.ts` but the hot paths all call `dist` (which uses `Math.hypot`, i.e. a `sqrt`).

### A.1 Add a spatial index (the single biggest win)

Build a **uniform grid** (bucket hash by cell ~= largest common query radius, e.g. 256 sim units) rebuilt once per tick from `unitsArr`, exposing:

- `queryRadius(center, r, pred) → Unit[]` (replaces `Sim.unitsInRadius`, lines 148–155)
- `nearest(center, r, pred) → Unit | null`
- `forEachInRadius(center, r, fn)` (allocation-free variant for hot loops)

Then route these consumers through it instead of scanning all units:

- `Sim.unitsInRadius` (`sim.ts:148`) — used by repeaters (`r.retarget`) and gambit conditions.
- **Linear skillshot collision** (`updateProjectiles`, `sim.ts:457–470`): currently every live projectile scans every unit every tick — O(P·N). Query only cells along the swept segment.
- **Zone application** (`updateZones`, `sim.ts:620–661`): `onEnter`, periodic tick, and aura passes each scan all units per zone — O(Z·N) three times. Query the zone's footprint.
- **Aura pass** (`updateAuras`/`applyAura`, `sim.ts:748–799`): O(N²) over sources × all units (currently masked by a 0.5s cadence; still spikes with armies). Query the aura radius.
- **Movement avoidance + collision** (`movement.ts` `steerToward:24–30` and `resolveCollisions:67–93`): each unit scans all others, twice — the heaviest per-tick cost in the overworld. Query a small neighborhood.
- **AI target selection**: `controllers.ts` `nearestEnemyOf:95`, `pickFocus:214`, `pickThreatTarget` and the `most-clustered` gambit target (`controllers.ts:294–309`, itself O(N²) because it calls `unitsInRadius` per enemy).
- **`notifyEnemyCast`** (`sim.ts:288–305`) and **on-nearby-death** (`killUnit`, `sim.ts:848–860`).

Determinism note: grid queries must return units in a **stable order** (e.g. sort the result by `uid`, or iterate cells in fixed order then filter), since several call sites pick "first match" or feed RNG indices.

**Target:** the per-tick cost of a 30-unit overworld fight drops from ~O(N²) to ~O(N·k); raids/armies with 40–60 units stay within budget.

### A.2 Use squared distance for comparisons

Every `dist(a,b) <= r` / `< r` comparison in a hot loop should become `dist2(a,b) <= r*r`, removing the `sqrt`. This applies across `sim.ts`, `movement.ts`, and `controllers.ts`. Keep `dist` where the actual magnitude is used (steering steps, pulls). This is a mechanical, behavior-preserving change (floating-point ordering is identical for non-negative radii).

### A.3 Kill per-tick allocations

The tick allocates garbage every frame; with 30 Hz × armies this is steady GC pressure:

- `updateProjectiles` rebuilds `this.projectiles` via `.filter` every tick (`sim.ts:480`); zones filter twice (`sim.ts:663–665`); repeaters filter (`sim.ts:697`); regen filters corpses (`sim.ts:812`). Replace with **swap-remove in place** or a reused scratch array / compaction pass.
- `unitsInRadius` allocates a result array on every call (many calls/tick). Provide the `forEachInRadius` callback form for predicates that just count or pick.
- Event payloads clone `{ ...pos }` constantly. Acceptable for correctness, but the highest-frequency events (`projectile-spawn/hit/expire`, `status-expire`) are worth auditing; consider that the render layer copies anyway.
- `runTriggers` (`sim.ts:308–340`) builds template-string keys (`` `${u.uid}:${key}` ``) and churns a `Map` per trigger per event. Precompute stable keys or use a nested map keyed by uid.

### A.4 Make `removeUnit` and lookups O(1)

`removeUnit` (`sim.ts:142–146`) does `unitsArr.findIndex` + `splice` — O(N) per removal, and splice shifts the array. With wipes, corpse sweeps, and merges this adds up. Use **swap-and-pop** plus the existing `byUid` map. Audit any code that assumes `unitsArr` order is stable (determinism: spawning already reassigns `uid` per sim, so order is a function of spawn order — document that swap-remove changes iteration order and re-baseline the hash test if needed).

### A.5 Tighten AI cadence and think cost

`thinkUnit` already staggers by cadence + uid (`controllers.ts:21–25`), which is good. Two follow-ups:

- Ensure expensive selectors (`most-clustered`, `pickThreatTarget`) only run on think ticks, never per-frame.
- Cache each unit's "current nearest enemy" on its think tick and reuse it within the cadence window instead of recomputing in both `thinkCreep` and `maybeCastBasicAbility`.

---

## B. RENDER / ENGINE PERFORMANCE

The renderer (`src/engine/scene.ts`) creates **one rig per unit with its own geometries and materials** (`models.ts` `lam()` mints fresh `MeshLambertMaterial`s per unit, `buildUnitRig:37`), and VFX allocate fresh geometry + material per effect (`vfx.ts`). At 30 on-screen units plus an army plus 200 particles this is a lot of draw calls, materials, and GC.

### B.1 Share geometry and materials across like units

- Cache geometry by shape+params and **materials by palette** so all kobolds (same palette) share materials, all instances of a silhouette share geometry. Today every `buildUnitRig` call allocates new everything.
- Where many identical units coexist (camp creeps, summon armies, fielded entourage), evaluate **`InstancedMesh` per body part** keyed by silhouette+palette (terrain already does this for trees/rocks at `terrain.ts:137`). Animation makes full instancing harder; a pragmatic middle ground is shared geometry/material + per-unit transforms.
- Selection ring, stun stars (3 meshes/unit, `scene.ts:254–265`), and the magic-immunity shell (`scene.ts:268–274`) are allocated per unit and live in the graph permanently. Pool them or build on demand only when needed.

### B.2 Pool VFX objects

`VfxManager` (`vfx.ts`) creates new `THREE` geometry+material for every burst, beam, ring, lightning, and spark cloud, then drops them for GC when the transient expires (`update:146–160`). Under the 200-particle budget this thrashes. Introduce **per-archetype pools** (acquire/release) reusing geometry and materials, only updating transforms/opacity. The `burst` spark cloud (`vfx.ts:210–234`) allocates a `Float32Array` + `BufferGeometry` + `PointsMaterial` each call — a prime pooling target.

### B.3 HP bars: stop per-unit canvases

Each unit owns a `<canvas>` + `CanvasTexture` (96×20) redrawn on HP change (`scene.ts:244–251`, `redrawHpBar:380–412`). 30+ units = 30+ textures and 2D draws. Replace with either (a) a single shared atlas / nine-slice quad scaled by HP, or (b) a tiny shader on a shared geometry driven by an HP uniform. Keeps memory flat as the army grows.

### B.4 Trim per-frame work in `scene.update`

- `update` calls `sim.projectiles.map(...)` to build a new array + a `Set` every frame (`scene.ts:142`, `vfx.syncProjectiles:127`). Iterate `sim.projectiles` directly.
- `itemVisualKey` (`scene.ts:355`) does a `map().join('|')` per unit per frame to detect equipment changes. Bump a `visualEpoch` counter on the unit when items change and compare integers instead.
- `syncUnits` builds a `Set<number>` of seen uids every frame (`scene.ts:194`). Acceptable, but fold into a single pass if it shows up in profiles.

### B.5 Make the budget knobs real

`performance.ts` defines the budget constants but only `clampedPixelRatio` is wired in. Add a small **quality tier** (low/med/high) controlling pixel ratio, `shadowMapSize`, shadow type (PCFSoft → basic), and VFX caps, selectable in settings and auto-downshifted if frame time blows the budget (see §D). Today `shadowMapSize: 2048` + `PCFSoftShadowMap` are hard-coded (`scene.ts:90–101`).

---

## C. GAMEPLAY RESPONSIVENESS & QUALITY

Performance work unlocks gameplay headroom; a few targeted changes use it:

- **Bigger fights become viable.** Once §A lands, raids and summon armies (the Necromancer fantasy in `SPEC.md §5`) can field more units without frame drops. Set and document a supported unit ceiling.
- **Smarter, cheaper target selection.** `pickFocus` (`controllers.ts:214`) scores every enemy each think; with the spatial index it can consider only nearby threats and add light role/threat weighting without extra cost. Improves AI fights and gym/Elite quality.
- **Input-to-action latency.** Sim runs fixed 30 Hz with a render-side accumulator (`game.ts:1411–1415`). Verify orders issued mid-frame apply on the very next tick (not delayed a frame), and that the render interpolation (`scene.ts:295–298`) doesn't make the active hero feel laggy on sharp turns. Cheap, high-perceived-value.
- **Spike smoothing.** The fixed-step `while` loop (`game.ts:1412`) can spiral if a tick ever exceeds budget (each slow tick makes the next frame run more ticks). Add a max-ticks-per-frame clamp so a hitch degrades to slow-mo instead of a death spiral.

---

## D. TESTING

The suite is healthy on **correctness** (~150 tests across data lint, kits, items, saves, macro sim, determinism) but has **zero performance coverage** and no guard for the §0 budget. The render layer is untested because it needs a browser. Priorities:

### D.1 A performance harness (headless)

Add `src/test/perf.bench.ts` (vitest `bench`) and/or a `src/test/perf-budget.test.ts`:

- **Stress scenario builder**: spawn N heroes/creeps/summons + M live projectiles + K zones in a sim, run T seconds, record wall-clock ms/tick and ticks/sec.
- **Budget assertion**: a 30-unit + 200-projectile sim must simulate one second of game time in well under one second of wall-clock (headroom for rendering), with a generous CI margin. This is the testable proxy for the §0 budget.
- **Scaling probe**: record ms/tick at N = 10/30/60 units; assert it grows sub-quadratically (the spatial-index regression guard — if someone reintroduces an O(N²) scan, the 60-unit number spikes).
- Run benches manually / nightly, not on every PR, to avoid flakiness; keep the budget assertion (with margin) in the normal suite.

### D.2 Determinism at scale

The current determinism test is a small fixed-seed 5v5. Add a **large, mixed determinism test**: 40+ units with zones, auras, repeaters, bounces, statuses, and (separately) resonance on, run for several seconds, assert identical `Sim.hash()` across two runs. This protects the §A refactors — especially spatial-query ordering and swap-remove — from silently changing results.

### D.3 Allocation / GC regression guard

A node test that runs a fixed sim for K ticks and asserts allocations stay bounded — e.g. snapshot `process.memoryUsage().heapUsed` before/after a long run (with `global.gc()` via `--expose-gc`), or count array/Map allocations in the tick via instrumentation. Coarse, but it catches "someone added a `.filter` to the hot path" regressions that §A.3 is cleaning up.

### D.4 Cover the untested layers

- **Movement/steering/collision** (`movement.ts`) has no tests: add cases for arrival, wall blocking (Fissure), separation of stacked units (the uid-nudge at `movement.ts:79–82`), and leash behavior. These are deterministic and headless.
- **Extract and test pure engine math.** Day/night palette blending (`scene.ts:updateDayNight`), `clampedPixelRatio`, `itemVisualKey`/visual-epoch logic, and VFX transform helpers are pure functions trapped in render files. Pull them into testable modules so the engine isn't a total test blind spot.

### D.5 Suite hygiene

- Enable **coverage** (`vitest run --coverage`) and track core/ coverage as the number that matters (engine/ will lag by nature).
- Add a `test:bench` script; keep `test` fast and deterministic.
- Consider a CI workflow (none present) running `typecheck`, `test`, `build` on push so the green-suite invariant in `README.md`/`PROGRESS.md` is enforced, not manual.

---

## E. PHASING & ACCEPTANCE

Ordered so each step is independently shippable and measured.

1. **Harness first (D.1, D.2).** Land the perf harness, the budget assertion, and the at-scale determinism test. Capture **baseline numbers** for 10/30/60 units and commit them. Nothing else proceeds without this baseline.
2. **Sim hot-path cleanup (A.2, A.3, A.4).** Squared-distance comparisons, kill per-tick `.filter` allocations, O(1) `removeUnit`. Behavior-identical; hash test unchanged. Re-measure.
3. **Spatial index (A.1, A.5).** The big one. Route all radius/nearest queries through the grid. Re-baseline the determinism hash deliberately if ordering changes; log it. Measure the 60-unit number — it should drop sharply.
4. **Render perf (B.1–B.4).** Geometry/material sharing, VFX pooling, HP-bar rework, per-frame allocation cuts. Verify with an in-browser frame-time overlay against 30 units + heavy VFX.
5. **Quality tiers + spike clamp (B.5, C).** Settings-driven quality, auto-downshift, fixed-step clamp, target-selection and latency polish.
6. **Testing backfill (D.3–D.5).** Allocation guard, movement tests, extracted engine-math tests, coverage, CI.

**Done when:**

- The perf-budget test passes: a 30-unit / 200-projectile sim runs 1s of game time in a fraction of a second of wall-clock, with margin.
- The scaling probe shows sub-quadratic growth from 30 → 60 units.
- The at-scale, mixed-systems determinism test is green and stable across runs (and with resonance on).
- In-browser, 30 units + a busy fight hold ~60fps on the target machine at the default quality tier, with auto-downshift catching the worst case.
- `npm test`, `npm run build`, and a browser smoke stay green; the headless-core boundary check is untouched.

---

## F. RISKS & NOTES

- **Determinism is the sharp edge.** Spatial-query result ordering and swap-remove iteration order are the two places a "pure perf" change can silently alter sim outcomes. Always pair these with the at-scale hash test and bake stable ordering into the grid API.
- **Instancing vs. animation.** Full `InstancedMesh` for animated units is awkward; the realistic win is shared geometry/materials + pooled accessories, not necessarily one instanced draw call per body. Don't over-invest here before profiling shows units (not VFX) are the draw-call bottleneck.
- **Don't pre-optimize cold paths.** Save/load, shop, recruitment, and gym setup are not per-frame; leave them alone unless a profile says otherwise (`SPEC.md §0`: "optimize when it actually matters").
- **Phase 5 lookahead.** The graphics overhaul (`SPEC.md §9 Phase 5`) replaces procedural rigs with glTF + skeletal animation and a post-processing stack. The geometry/material-sharing and quality-tier work here (§B) is the foundation that pass will build on; design the pooling and quality knobs with that future in mind.
