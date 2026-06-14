# OVERWORLD PLANNING — COHERENT, LIFELIKE SCALE

The size contract for everything that stands on the world. Companion to `VFX_ASSETS.md` (the master art plan and cohort/creature mapping), `GRAPHICS_SPEC.md` (the `UnitRig` contract and prop instancing), `ASSET_GAPS.md` (the closed coverage audit this extends), and `ASSETS.md` (the generate-or-download policy this respects). Same crunch-mode footing as `SPEC.md §0`: this names direction, priority, and a data shape — it is not a gate until `§9` says so.

The request behind this doc: heroes, creeps, monsters, bosses, NPCs, buildings, and environment all belong to the same world. Right now each is sized in its own corner — a hero by `SilhouetteSpec.scale`, a building by a hardcoded `3.6` in `terrain.ts`, a critter by a literal in `scene.ts`. When we generate GLBs against those scattered numbers, nothing guarantees a kobold reads as knee-high to a knight, a town hall reads taller than the hero who walks into it, or a treant reads as the giant it's meant to be. **This spec gives every world entity one canonical real-world size, in meters, from a single source — so generation is coherent and the world reads as lifelike.**

The throughline is unchanged and non-negotiable. **The headless deterministic core (`SPEC.md §1.1`, `src/core/`) stays untouched in its math.** Sim collision and pathing keep running in Dota units (`TUNING.unitRadius*`); this spec adds a *visual* size layer and the conversion that ties the two together. `boundary.test.ts` stays green and determinism hashes stay byte-identical.

---

## 0. WHERE WE ARE (measured today)

An honest read of how size works right now, with file references so the work has a starting line.

**Two coordinate systems, one constant.** The sim runs in raw Dota units; the renderer divides by `WORLD_SCALE = 100` to get three.js world units that read as meters (`src/engine/scale.ts:2`). So a hero collision radius of `24` sim units becomes `0.24` m for selection rings, and a `12000`-unit region becomes a `120` m square.

**Hero/creep visual height is implicit in one float.** `SilhouetteSpec.scale` (`src/core/types.ts:455`) is documented as "1.0 = standard hero," and the procedural rig turns it into a height: `height: 1.8 * s` (`src/engine/models.ts:325`), with per-build tweaks (ward `1.9×s`, blob `1.3×s`, bird `2.6×s`, …). So the *only* place a hero's real height exists is `1.8 × scale`, derived at runtime and never written down as meters.

**Creep tiers carry default scales, not sizes.** The Phase-3 factory assigns `small: 0.62, medium: 0.85, large: 1.15, ancient: 1.45` (`src/data/creeps/index.ts`), i.e. ~1.1 / 1.5 / 2.1 / 2.6 m. Hand-authored creeps override freely (kobold `0.55`). Sim radii are a *separate* table: `unitRadiusCreep { small: 18, medium: 24, large: 32, ancient: 44 }` (`src/data/tuning.ts:378`). Nothing keeps the two in lockstep.

**Bosses have no size of their own.** A `BossDef` points at a `heroId` (`src/core/types.ts`) and inherits that hero's silhouette; raid bosses just multiply the *collision* radius (`TUNING.raidBossRadiusScale 1.7`). A "boss" is not visually bigger than its source hero unless the hero's scale already says so.

**Buildings, props, and critters are hardcoded heights at the call site.** Town buildings are fit to `3.6` m in `swapTownBuildings`; dressing props carry inline heights — `well 1.9, cart 1.5, barrel 1.0, market 2.0` (`src/engine/terrain.ts:514`); foliage gets a random scale `0.6–2.2`; ambient critters are literals in `scene.ts` (alpaca `1.3`, fox `0.7`, frog `0.42`). These never enter the data layer.

**The fit pipeline already exists — it just has nothing authoritative to fit to.** Both `mountHeroModel` (`src/engine/models.ts:599`) and `normalizedClone` (`src/engine/terrain.ts:386`) do the same move: `Box3` the GLB, compute `k = targetHeight / size.y`, `scale.setScalar(k)`, seat the base at `y=0`. Any GLB, authored at any size, gets fit to a target height. **The machinery is in place; what's missing is a single, declared target height per entity.**

**There is no manifest dimension and no coverage matrix.** `public/assets/manifest.json` records `bytes`/`group`/`source` but no width/height/radius. The closest thing to a roster is `data-lint.test.ts` (validates every hero/creep/region/boss) and the `ASSET_GAPS.md` "Final State" table — neither has a size column. The word "roster" in code means the player's hero collection, not a world-entity catalog.

**The gap, in one line.** Size is real and consistent *within* a class and ad-hoc *across* classes. Coherence between a hero, the kobold at his feet, and the hall behind him is currently a coincidence of independently chosen numbers. This spec makes it a contract.

---

## 1. PRINCIPLES

1. **One source of truth, in meters.** Every world entity declares a canonical `WorldSize` (`§2`) in real-world meters. Renderer height, GLB-fit target, and (where relevant) sim radius all derive from it. No second hardcoded height at a call site.

2. **Meters are the lingua franca; Dota units are an implementation detail.** A human hero is ~1.8 m and that number lives in data. The sim still runs in Dota units, but the bridge is explicit: `worldM = dotaUnits / 100` and `dotaUnits = worldM × 100` (`scale.ts`). Footprint radius converts the same way.

3. **Lifelike = anchored to a human.** The standard biped hero at `1.8 m` is the yardstick (`§3`). Everything else is sized *relative to a person*: a child-sized kobold reads knee-to-waist, a treant reads as a three-story tree, a town hall dwarfs the party at its door. If a generated model breaks that read, the size is wrong, not the eye.

4. **Stylized, not literal — but proportionally honest.** We keep the game's chunky, readable proportions (`VFX_ASSETS.md`). Sizes are *gameplay-true relative heights*, not a survey of reality. A "giant" can be compressed for camera framing, but it is never shorter than a "brute," which is never shorter than a "biped."

5. **Footprint is gameplay; height is read.** Collision/pathing radius (Dota units) and visual height (meters) are related but distinct: a wide-but-short ogre and a tall-but-thin wraith can share a radius. Declare both; let the existing fit pipeline ignore footprint and the sim ignore height.

6. **Derive, don't duplicate.** Where a value can be computed (`rig.height = 1.8 × scale`, `radius = footprintM × 100`), the spec defines the formula and the lint enforces it, rather than storing the same fact twice.

7. **The checklist is the deliverable.** Coverage is a matrix with one row per entity ID and a column per size fact (`§7`), enforceable in `data-lint`. "Done" means every box is checked: every entity has a height, a footprint, a GLB (or procedural fallback), and a class anchor it doesn't violate.

---

## 2. THE SIZE MODEL

A single optional structure, attachable to any entity def, that the renderer and lint read. Authoring stays light: most entities inherit a class default (`§3`) and only override when they're special.

```ts
// src/core/types.ts (proposed)
export interface WorldSize {
  /** Standing/at-rest height, base to crown, in world meters. The fit target. */
  heightM: number;
  /** Ground footprint radius in world meters (visual). Sim radius derives: dota = footprintM * 100. */
  footprintM: number;
  /** Optional non-radial footprint for buildings/props that aren't round. */
  widthM?: number;
  depthM?: number;
  /** Pose the height is measured in — guards quad/winged/serpentine reads. */
  pose?: 'standing' | 'quadruped' | 'hunched' | 'winged' | 'coiled' | 'static';
  /** Class anchor this entity belongs to (drives the lint band in §3). */
  sizeClass?: SizeClass;
}

export type SizeClass =
  | 'tiny' | 'small' | 'human' | 'large' | 'huge' | 'colossal'  // creatures
  | 'prop' | 'structure' | 'landmark';                          // built/env
```

**Conversions (the only ones that matter):**

| From | To | Formula |
|---|---|---|
| `SilhouetteSpec.scale` | `heightM` (biped) | `heightM = 1.8 × scale` |
| `heightM` (biped) | `scale` | `scale = heightM / 1.8` |
| `footprintM` | sim radius (Dota) | `radius = round(footprintM × 100)` |
| sim radius (Dota) | `footprintM` | `footprintM = radius / 100` |

**Authoring rule:** an entity declares **either** a `SilhouetteSpec.scale` **or** a `WorldSize.heightM`; if both, `heightM` wins and lint checks they agree within ±5%. New content should prefer `heightM` — it's the lifelike number. Existing `scale`-only content keeps working via the derivation (zero migration required to stay green).

---

## 3. CANONICAL SIZE BANDS (the lifelike anchors)

The yardstick is the standard biped hero at **1.8 m**. Every entity belongs to a `sizeClass` with a height band and a typical footprint. Lint flags anything outside its band so a generated GLB can't quietly come out doll- or titan-sized.

### Creatures (heroes, creeps, monsters, bosses, summons, NPCs)

| sizeClass | Height band | Typical footprint | Reads as | Current examples |
|---|---|---|---|---|
| `tiny` | 0.3–0.8 m | 0.10–0.18 m | ankle-high vermin, wisps | frog `0.42`, summon swarm |
| `small` | 0.8–1.4 m | 0.18–0.24 m | child-sized, scuttlers | kobold `~1.0`, fox `0.7` |
| `human` | 1.4–2.2 m | 0.20–0.28 m | the hero yardstick | most heroes `1.8`, medium creep `~1.5` |
| `large` | 2.2–3.5 m | 0.30–0.45 m | ogres, bears, brutes | large creep `~2.1`, hellbear |
| `huge` | 3.5–6.0 m | 0.45–0.80 m | ancients, raid bosses | ancient creep `~2.6` → boss tier |
| `colossal` | 6.0–14 m | 0.80–2.0 m | treants, world bosses | treant family, macro bosses |

**Boss rule (closes the §0 gap):** a boss is not just its source hero at 1.0×. `rank: 'boss'` carries a minimum `heightM` of one band above its base read (mini-boss ≥ `large`, boss ≥ `huge`, raid/world boss ≥ `colossal`), and the visual scale-up matches the existing `raidBossRadiusScale` so footprint and silhouette grow together.

**Pose guards:** quad/winged/coiled entities declare `pose` so the lint reads height against the right axis (a dragon's `winged` height is wingspan-aware; a serpent's `coiled` height is at-rest, not stretched).

### Built & environment

| sizeClass | Height band | Footprint | Reads as | Current examples |
|---|---|---|---|---|
| `prop` | 0.3–2.5 m | 0.3–2.0 m | barrels, carts, market stalls, foliage | barrel `1.0`, cart `1.5`, market `2.0`, well `1.9` |
| `structure` | 2.5–8 m | 2–10 m | houses, shops, gates, towers | town buildings `3.6` |
| `landmark` | 8–40 m | 6–30 m | town hall, ancient, monument, great tree | (new — currently none declared) |

**Door-frame rule (lifelike anchor for the built world):** any `structure` or `landmark` a unit can stand beside must read taller than a `human` entity by its band, and entrances frame at ≥ 2.2 m clear height so the 1.8 m hero never looks oversized at a doorway.

---

## 4. ENTITY TAXONOMY → WHERE SIZE LIVES

Mapping the request's "check boxes" onto the types that already exist, with the home for each `WorldSize`.

| Request term | Core type | Where size is declared | Default class | GLB path convention |
|---|---|---|---|---|
| **Heroes** | `HeroDef` (`types.ts`) | `silhouette.scale` → derive `heightM`, optional explicit `worldSize` | `human` | `/assets/heroes/<id>.glb` |
| **Creeps** | `CreepDef` (`types.ts`) | tier default → `worldSize`, override per id | tier-mapped | `/assets/creeps/<creature>.glb` |
| **Monsters** | `CreepDef` / `HeroDef` | same as creep or hero by use | `small`–`huge` | as above |
| **Bosses** | `BossDef` → `heroId` | `BossDef.worldSize` override + rank floor (`§3`) | `large`+ | from source hero, scaled |
| **Summons / wards** | `SummonSpec` (inline) | `silhouette.scale` → derive | `tiny`–`human` | procedural / creature base |
| **NPCs (recruit)** | `Unit kind:'npc'` via hero data | source hero's size | `human` | hero GLB |
| **NPCs (quest givers)** | `QuestGiverDef` (`types.ts`) | `worldSize` (new) | `human` | villager rig / hero GLB |
| **Buildings** | terrain config (new data file) | `worldSize` per building id | `structure`/`landmark` | `/assets/props/town/<name>.glb` |
| **Environment props** | terrain config (`DRESSING_PROPS`, foliage) | `worldSize` per prop id | `prop` | `/assets/props/{town,foliage}/<name>.glb` |
| **Ambient critters** | `scene.ts` literals (new data) | `worldSize` per species | `tiny`/`small` | `/assets/creeps/*` or procedural |

**The one new home:** buildings, props, and ambient critters currently size at the call site. This spec pulls them into a small data file (e.g. `src/data/world/props.ts`) shaped like `DRESSING_PROPS` but with a full `WorldSize` per id, so `terrain.ts`/`scene.ts` read a declared size instead of a literal. Everything else extends a type that already exists.

---

## 5. GLB AUTHORING & FIT CONTRACT

What "generate coherently" means for the pipeline. The fit machinery already exists (`§0`); this is the contract it enforces.

1. **Author at any size; the pipeline fits to `heightM`.** GLBs need not be modeled to scale. `normalizedClone`/`mountHeroModel` already `Box3` → `scale to target` → seat at `y=0`. The target is now `worldSize.heightM` (or `1.8 × scale` when only scale exists), not a literal.

2. **Model with a flat, centered footprint.** Base at the origin, facing `+Z`, footprint centered on `(x,z)=0`, so seating and footprint-radius reads are correct after fit. Document this in the generation specs (`scripts/assets/specs/*.json`).

3. **Respect the pose axis.** A `quadruped` is fit by withers height, a `winged` flier by standing/perched height (wingspan informs footprint, not height), a `static` landmark by full height. The `pose` field tells the fitter which axis is canonical.

4. **Stamp dimensions into the manifest at build time.** `build_assets.mjs` already `Box3`es every mesh to optimize it; it should also write `dimsM: { h, w, d }` (post-fit, at the declared target) into `manifest.json`. This gives lint a measured number to compare against the declared `WorldSize` — catching a GLB that fits to height but has a wildly wrong footprint.

5. **Procedural is always the floor.** Any entity with no GLB still renders at its declared size via the procedural rig (`buildUnitRig`), which already keys off `scale`. A missing model degrades to a correctly-sized blockout, never to a default-1.0 guess.

6. **Generation prompts inherit the band.** When we generate a GLB for an entity, the prompt/spec carries the entity's `sizeClass` and `heightM` so the asset is authored to read at the right scale relative to its neighbors (a `colossal` treant prompt says "tower over a person," a `small` kobold prompt says "knee-high to a knight").

---

## 6. COHERENCE RULES (cross-entity)

The checks that make the world read as one place rather than a pile of independently-sized props.

- **Neighbor read.** Within a region, the tallest routine creep < the shortest building; the town hall (`landmark`) > every `structure`; a `boss` > every `human` in its arena. Lint can assert these ordinals from declared `heightM`.
- **Footprint ↔ radius parity.** `worldSize.footprintM × 100` must match the entity's sim radius within ±15% (or the entity declares it intentionally decoupled). Closes the "scale and radius drift" gap from `§0`.
- **Camp & room fit.** A creep's footprint must fit its camp radius (`CampDef.radius`) and dungeon `RoomTemplate.size` with clearance for a pack — a `colossal` creature can't spawn in a `small` camp.
- **Door & path clearance.** `structure`/`landmark` entrances and region gates clear the tallest unit that routes through them (`§3` door-frame rule).
- **Selection-ring sanity.** The pick capsule (`unitPickRadius`, `scene.ts`) derived from `footprintM` must enclose the fit GLB's footprint — no clicking through a giant, no fat ring on a wisp.

---

## 7. THE CHECKLIST (the "check boxes")

The deliverable: one coverage matrix, one row per world-entity id, machine-checkable. Mirrors the `data-lint` + `ASSET_GAPS` "Final State" format, with size columns added. Generated from the registry so it can't go stale.

| Column | Source | "Checked" when |
|---|---|---|
| **id / name** | `REG` | exists |
| **kind** | type | one of hero/creep/boss/summon/npc/building/prop/critter |
| **sizeClass** | `worldSize.sizeClass` | declared and valid |
| **heightM** | `worldSize.heightM` or `1.8×scale` | within its class band (`§3`) |
| **footprintM** | `worldSize.footprintM` | present; matches sim radius ±15% (`§6`) |
| **pose** | `worldSize.pose` | set for non-standing builds |
| **GLB path** | `assets.ts` mapping | resolves in manifest, or procedural fallback declared |
| **manifest dimsM** | `manifest.json` (`§5.4`) | present and within ±10% of declared height |
| **neighbor-coherent** | `§6` ordinals | passes region/arena ordering |
| **shipped** | manifest | Y/N |

A row is "fully checked" only when every box is green. The matrix is the single screen that answers "is the world coherently sized?" — and the `§9` gates turn the red boxes into failing tests.

---

## 8. DATA & FILE HOOKS

Concrete touch points, smallest-diff-first. No core math changes.

- **`src/core/types.ts`** — add `WorldSize`, `SizeClass`; add optional `worldSize?: WorldSize` to `HeroDef`, `CreepDef`, `BossDef`, `SummonSpec`, `QuestGiverDef`.
- **`src/engine/scale.ts`** — add `worldToDota`/`footprintToRadius` helpers next to `toWorld` (the formulas in `§2`).
- **`src/engine/models.ts`** — `buildUnitRig` reads `worldSize.heightM` when present (else `1.8×scale`); `mountHeroModel` fits to it. Add a `worldSizeOf(def)` resolver.
- **`src/data/creeps/index.ts`** — replace the tier `scale` literals with tier `WorldSize` defaults; keep per-id overrides.
- **`src/data/bosses.ts`** — add `worldSize`/rank floor per boss (`§3` boss rule).
- **`src/data/world/props.ts`** *(new)* — declared `WorldSize` for town buildings, dressing props, foliage classes, ambient critters; `terrain.ts`/`scene.ts` read it instead of literals (`DRESSING_PROPS`, the `3.6` building height, critter literals).
- **`scripts/assets/build_assets.mjs`** — stamp `dimsM` into `manifest.json` (`§5.4`).
- **`scripts/assets/specs/*.json`** + generation scripts — carry `sizeClass`/`heightM` into prompts (`§5.6`).
- **`src/test/data-lint.test.ts`** — extend with the `§9` assertions; emit the `§7` matrix.

---

## 9. ACCEPTANCE & GATES

The boxes, as tests. Layered so existing content stays green and new content must declare size.

1. **Every entity resolves a size.** `worldSizeOf(def)` returns a `heightM` and `footprintM` for every hero, creep, boss, summon, NPC, building, prop, and critter in the registry. (Existing `scale`-only content passes via derivation.)
2. **Bands hold.** Every `heightM` sits in its `sizeClass` band (`§3`). Out-of-band fails.
3. **Scale/height agree.** Where both `scale` and `heightM` exist, they're within ±5%.
4. **Footprint/radius parity.** `footprintM × 100` matches sim radius within ±15% unless flagged decoupled (`§6`).
5. **Manifest agreement.** For shipped GLBs, `manifest.dimsM.h` is within ±10% of declared `heightM` (`§5.4`).
6. **Neighbor coherence.** Region/arena ordinals from `§6` pass (creep < building < landmark; boss > human).
7. **No literal heights at call sites.** A lint/grep gate asserts `terrain.ts`/`scene.ts` size from data, not numeric literals (the `3.6`, the critter numbers move into `props.ts`).
8. **Determinism untouched.** `boundary.test.ts` green; sim hashes byte-identical (visual size never enters core math).
9. **The matrix renders.** `data-lint` emits the `§7` checklist; CI can diff it. "Done" = zero red boxes.

Gates 1–3 land first (cheap, high-coverage, no asset work). 4–6 follow as `props.ts` and the boss rule land. 5 and 9 close the loop once `build_assets.mjs` stamps dims.

---

## 10. ROLLOUT

1. **Declare the model** (`§2`, `§8` types + `scale.ts` helpers) and turn on gates 1–3 against derived sizes. Nothing visual changes; the world is now *describable* in meters.
2. **Pull literals into data** — `src/data/world/props.ts`, boss size floors, creep tier `WorldSize`. `terrain.ts`/`scene.ts` read declared sizes. Turn on gates 4, 6, 7.
3. **Stamp the manifest** (`build_assets.mjs` `dimsM`), turn on gate 5, and render the `§7` matrix (gate 9).
4. **Generate against the bands** — every new GLB is prompted with its `sizeClass`/`heightM` (`§5.6`), so coherence is built in at authoring time, not patched after.

End state: one matrix, every box green — every hero, monster, creep, boss, NPC, building, and prop carries a real-world size from one source, the fit pipeline honors it, the manifest proves it, and a generated world reads as a single, lifelike place.
