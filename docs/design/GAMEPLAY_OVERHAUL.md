# GAMEPLAY OVERHAUL — "ANCIENTS" grows its Genshin half

How the overworld becomes a place you *explore*, not just a board you fight across. Companion to `SPEC.md` (the design target, especially §4 World & Progression, §6 Micro Combat, and §9 Phase 5 Resonance), `DECISIONS.md` (calls already made), and `PROGRESS.md` (what actually shipped). Same crunch-mode footing as `SPEC.md §0`: this is direction and priority, not a gate.

The throughline matches the rest of the project. **The headless deterministic core (`src/core/`, `SPEC.md §1.1`) stays untouched** — it never imports `three`, never touches the DOM, and stays deterministic for a seed. Everything proposed here is built the way Resonance was (`DECISIONS.md`, 2026-06-12): as a **generic, data-driven extension of the existing status / trigger / aura / zone / movement vocabulary (`SPEC.md §2`), spending zero exotic slots**, and respecting **the layer split (`SPEC.md §4`)** — the Genshin material lives in the **micro overworld and raids**, while gyms and the Elite Five stay pure-Dota macro. No proposal here changes a combat result the core resolves; the boundary test (`src/test/boundary.test.ts`) stays green.

---

## 0. WHERE WE ARE — the three-way blend, measured honestly

We pitched Ancients as Dota 2 × Diablo 2 × Genshin. Two of those three are deeply realized. The third is half-built, and the half that exists is the wrong half to make the *overworld* feel like Genshin.

**The Dota half is done.** 65 heroes with faithful kits, 78 items with real recipes and on-sight identity, talents/facets/Aghs, the gambit grammar, 8 gyms, the Elite Five draft, and four raids — all on one headless core driving both the micro overworld and the macro arena (`PROGRESS.md` Phase 2–6). The "a Dota player recognizes this on sight" bar is held.

**The Diablo half is done.** Respawning creep camps (`RegionDef.camps`), kill bounties scaled by region depth / tier / creep star (`tuning.ts` `regionRewardMult`, `creepTierRewardMult`, `creepStarBountyMult`), hero echoes as farmable bosses, regional boss reruns on Normal/Nightmare/Hell with loot tables and bad-luck pity (`Game.runBossFight`, `core/phase3.ts`), neutral items with a dedicated slot and a Tinker's Bench, and gold sinks. Walk the map, kill, drop, build, re-run harder. That loop is real.

**The Genshin half is half-built — and it is the *combat-chemistry* half, not the *overworld* half.** What shipped (Phase 5 "Resonance", opt-in, off by default) is the elemental **combat** system:

- A closed vocabulary of 7 elements mapped from Dota identity (`core/resonance.ts`).
- A generic reaction-table resolver — Vaporize, Melt, Overload, Superconduct, Electro-Charged, Freeze, Swirl, Crystallize, Burning — composed entirely from existing primitives:

```18:36:src/core/resonance.ts
export const REACTION_TABLE: ReactionDef[] = [
  { id: 'vaporize', elements: ['hydro', 'pyro'], damageMultiplier: 1.5, consume: 'both' },
  { id: 'melt', elements: ['cryo', 'pyro'], damageMultiplier: 1.35, consume: 'both' },
  { id: 'overload', elements: ['pyro', 'electro'], extraDamagePct: 0.45, consume: 'both' },
  { id: 'superconduct', elements: ['cryo', 'electro'], extraDamagePct: 0.2, statMods: { armor: -6 }, statDuration: 5, consume: 'both' },
  { id: 'electro-charged', elements: ['hydro', 'electro'], extraDamagePct: 0.3, consume: 'existing' },
  { id: 'freeze', elements: ['hydro', 'cryo'], status: 'frozen', statDuration: 1.5, consume: 'both' },
  { id: 'burning', elements: ['pyro', 'dendro'], extraDamagePct: 0.35, consume: 'existing' },
  // ... swirl (anemo + any) and crystallize (geo + any) entries ...
];
```

- Party elemental resonance buffs (2+ shared element → a team statmod aura), with a Harmony fallback (`resonanceMods`).
- Swap-driven rotations: a shortened swap cooldown and relaxed cooldown-floor in Resonance mode so apply-then-swap reaction combos feel good (`tuning.ts` `resonanceSwapCooldownSec: 1.2`, `resonanceElementGaugeSec: 4`).
- Item-applied elements for neutral carries (Maelstrom → Electro, Radiance → Pyro, Skadi → Cryo).

This is genuinely good, and it is the part of Genshin people *write theorycraft about*. But it is not the part that makes Genshin's **overworld** feel like Genshin. Switch Resonance on today and the overworld is still: a flat 12000×12000 plane (`RegionDef.size`), textured by biome, dotted with respawning camps and a town, connected to the next flat plane by a gated route. You right-click to walk across it and right-click to fight. The reactions are spicier; the *world* is the same Diablo board.

**The gap in one sentence:** we built Genshin's chemistry set, but not the world you take it into. Genshin's overworld identity is **exploration** — a vertical, traversable sandbox where the environment itself is elemental, curiosity is rewarded constantly, and a structured daily/endgame loop pulls you back. None of that exists yet.

---

## 1. WHAT "THE GENSHIN PIECES" ACTUALLY ARE

It is tempting to think "Genshin = elemental reactions," ship Resonance, and call it done. That is the common misread. Genshin's own designers and the analysis around it are consistent that the open world is built on **interconnected systems where elemental interaction is simultaneously a combat tool and an exploration/environment tool**, wrapped in a **curiosity loop that rewards exploration with small, frequent payoffs** and a **traversal model (climb, glide, swim, sprint) that makes movement itself part of the experience** (HoYoverse dev interviews; ExploreGenshin "Genshin as a system"; the Luhua Pool environment-art notes). The reaction engine is one pillar of seven, and it is the only one we have.

The seven pillars of the Genshin overworld, and our status on each:

| # | Genshin overworld pillar | What it means | Ancients today |
|---|--------------------------|---------------|----------------|
| P1 | **Traversal & stamina** | Sprint, climb any surface, glide from height, swim — all gated by a stamina bar. Verticality is the world. | **Missing.** Flat plane; click-to-move only; no stamina, no verticality, no climb/glide/swim. |
| P2 | **Curiosity loops & discovery** | Chests (tiered), collectibles, hidden areas, puzzles, treasure hunts, a per-region exploration %, fast-travel waypoints. Small frequent rewards. | **Missing.** The only overworld "finds" are camps, hero/echo spawns, and gates — all combat or progression gates, no discovery. |
| P3 | **The elemental sandbox** | The *world* carries elements: pyro braziers, hydro pools, electro relays, wind currents. You apply/transport elements to solve puzzles and to seed combat reactions. | **Missing.** Elements live only on hero abilities and a few items, only in combat, only with Resonance on. The world is inert. |
| P4 | **Enemy elemental design** | Shielded enemies (break the shield with the matching/reactive element), element-infused elites, auras. Encounters teach the reaction system. | **Missing.** Creeps are Dota creeps; no shield-break-with-element layer, no element-gated encounters. |
| P5 | **The domain / ley-line / stamina-gated loop** | Instanced elemental challenges (domains) with a ley-line "disorder" modifier and curated rewards; overworld farm nodes (ley line outcrops); a regenerating resource (resin) that gates and paces it. | **Partial.** We have raids/bosses with loot + pity, but they are Dota/WoW-flavored set pieces, not element-themed instanced challenges with world-rule modifiers, and there is no node/pacing economy. |
| P6 | **Reaction-driven swap combat** | Apply an element with one character, swap to another to detonate; off-field abilities keep ticking. | **Done (opt-in).** This is Resonance. The one pillar we have. |
| P7 | **Exploration support layer** | Cooking food for heals/revives/buffs, gadgets, and ambient world systems (weather that applies elements) that make exploration its own activity. | **Missing.** We have Dota consumables (tango/salve) but no cooking/buff/gadget layer; day/night exists but is not elemental. |

So: **we have P6. We are missing or only scratching P1–P5 and P7.** The overhaul is about those.

### 1.1 The honest scope question first

Building all of P1–P7 to Genshin's depth is a second game. That is not the goal and not the budget. The goal is to make the overworld **read and feel like the Genshin loop** while staying true to the Dota spine and the headless architecture. Concretely, the felt Genshin loop we are buying is this rhythm:

> spot something across the world → **traverse** to it (climb a ledge, glide a gap, sprint a flat) → **discover** a reward or a locked thing → **solve** it with an elemental interaction → a **fight** breaks out and the reactions matter → bank the find → spot the next thing.

Today the overworld rhythm is just `fight camp → walk → fight camp`. Every section below is in service of that richer rhythm, ordered by how much Genshin-feel it buys per unit of build cost.

---

## 2. THE STRATEGIC DECISION — camera and control model

This is the crux, and it has to be settled before anything in §3, because it decides how much of Genshin's *traversal* we can honestly deliver.

**The tension.** Genshin is a third-person, WASD, character-locked camera built around verticality — you climb a cliff face, glide off the top, and aim a bow in the air. Ancients is, by deliberate decision (`SPEC.md §6`, locked in `DECISIONS.md`), a **Dota top-down click-to-move** game: right-click moves and attacks, QWER/DF abilities, ZXCV items, 1–5 swap, on a roughly 50° follow camera with a separate map view. The movement is kinematic steering on a flat plane with circle colliders and temporary walls (`core/movement.ts`, `SPEC.md §3`). Those two control models do not trivially coexist.

We do not get to have both spines. So choose one:

**Approach A — Keep the Dota spine; deliver Genshin *by systems*, not by camera (recommended).**
Keep top-down click-to-move and the two existing cameras (gameplay + map, `scene.toggleCameraMode`). Deliver verticality as **layered terrain the click-to-move pather already understands** — elevation tiers, climbable ledges/ropes, drop-downs, swim zones, and *glide-from-height* — navigated with right-click plus a **stamina-gated sprint/dash on a key**. You do not free-climb a wall with a stick; you click a climb point and your hero ascends, spending stamina, the same way the pather already routes around walls.

- Strengths: preserves the entire control identity, the headless movement core, the two-camera system, and every existing system (orders, gambits, attack-move). It is purely additive — exactly how Resonance was added. Lowest risk, ships incrementally, the boundary test never moves. Verticality and traversal become *navigation and puzzle* surface, which is most of their felt value.
- Weaknesses: it is "Genshin-flavored," not Genshin-faithful, on movement. No free-aim mid-glide, no stick-controlled climb. Verticality reads as layered tiers, not a continuous cliff.
- Verdict: **this is the path.** It buys ~80% of the felt Genshin loop (the rhythm in §1.1) for ~20% of the cost, and it does not fork the game's identity. Everything in §3 is written assuming Approach A.

**Approach B — Add an optional third "Explorer" camera (WASD, out of combat only) — labeled stretch.**
Alongside gameplay/map, add an opt-in third camera that, *while not in combat*, gives WASD + a closer chase cam for traversal, and snaps back to Dota click-to-move the instant a fight starts. The sim still runs the same orders under the hood (WASD just issues continuous move orders toward the camera-forward vector).

- Strengths: much closer to the Genshin *feel* of moving through the world. Reversible and opt-in, like Resonance.
- Weaknesses: forks the control model; two ways to move means double the input edge cases, camera-transition jank at the combat boundary, and real work in `engine/scene.ts` + `systems/input.ts`. The headless core is fine (it only ever sees orders), but the engine/UI cost is large.
- Verdict: a real stretch goal *after* Approach A proves the systems are fun. Log it in `DECISIONS.md` if pursued.

**Approach C — Full third-person rewrite.** Rip out click-to-move for a Genshin-style controller. **Not recommended, full stop.** It breaks the Dota spine the whole project is built on, invalidates the macro layer's shared controls, and throws away the steering/pathing core. The cost is a different game.

**Decision:** Approach A is the spine for this overhaul. Approach B is an explicit, later, opt-in stretch. Approach C is out.

One consequence worth stating up front: because we keep the flat-pather core, **"verticality" in Ancients is layered elevation, not free geometry.** A region gains a small set of discrete height levels and explicit connectors (ledges, ropes, glide launch points, drop points) between them. That is enough to make exploration feel three-dimensional without a navmesh or physics rewrite, and it keeps movement deterministic and headless-testable.

---

## 3. THE PILLARS, AS SYSTEMS

Each subsection names the pillar, the design, and **the seam** — what existing vocabulary it extends and where it lives, so nothing here is a from-scratch system or a core rewrite. The recurring pattern: **new content is data on `RegionDef`; new behavior is a generic interpreter in `systems/` or `engine/`; the core only gains small, render-agnostic primitives where a mechanic genuinely needs the sim.**

### 3.0 Foundational: the locomotion & animation/timing contract

Two systems underneath everything below are not "polish" — the overhaul *depends* on them, and one of them **is** the combat system. Settle both before building pillars on top.

**Attack and cast animations are load-bearing, and the contract already exists.** In a Dota-style game the *timing* an animation represents is mechanical, not cosmetic: an attack has a windup (damage lands at the attack point), a cast has a cast point (the commit-and-interrupt window), channels and captures break on damage, and the backswing is cancelable. That timing lives in the headless core today —

```236:236:src/core/actions.ts
  u.windupUntil = now + u.stats.attackPoint;
```

— attacks resolve at `windupUntil`, casts read `castPoint` into `castingUntil` (`core/actions.ts`), damage interrupts channels/captures, and forced moves (the Hook drag) zero the windup (`core/movement.ts`). The animator is a *readout* of that timing: it plays the windup/strike pose off `windupUntil`/`attackPoint`, the cast pose off `castingUntil` + the gesture, and the channel pose off `channel`/`captureCh`:

```162:164:src/engine/animator.ts
  if (unit.castingUntil > simTime) {
    if (unit.castGesture) {
      const pose = castPose(unit.castGesture, unit.animProfile?.castStyle, time, rig.scale);
```

So the rule the project already lives by is: **the sim owns the timing; the renderer animates that timing honestly.** That is *why* last-hitting, interrupts, kiting, and "is this hero about to hit me" are legible — the animation is the tell. This stays inviolate: never deal damage without a windup the player can see, never resolve a spell without a cast animation, and keep timing in the core so it stays deterministic and headless-testable. Your instinct is correct, and it is already the contract; the work is to keep honoring it as content and movement states grow.

**The overhaul raises the stakes on this contract.** Every new Genshin system leans on readable timing:

- **Telegraph dodging** — domain/elite attacks as dodge checks (§3.4, §3.5) only work if the enemy wind-up *and* the ground telegraph are readable *before* the hit. The ground-decal telegraphs already exist (`GRAPHICS_SPEC` P4); the new requirement is that every dodge-check attack carries an honest, visible windup at least as long as a fair reaction window.
- **Swap-cancel reaction timing** — the apply → swap → detonate combo (§3.6) is only satisfying if the apply animation and the swapped-in hero's cast read frame-to-frame.
- **Shield-break feedback** (§3.4) needs a distinct visual/audio beat the instant the reactive element lands.

None of this needs a new core mechanic. It needs the existing timing contract honored by the new content — and by the new locomotion states below, which is where it gets interesting.

### 3.1 Locomotion, traversal & stamina (Pillar P1)

**Design — a real locomotion ladder.** Today a unit has exactly one `moveSpeed` and the animator only distinguishes *moving* from *idle* (the `speed > 30` threshold in `animateRig`). There is no walk/run/sprint/dash. Genshin's overworld feel comes from a movement *ladder* with stamina as the throttle. Add these states (each is a speed band + an animation state, layered on the existing run-cycle):

- **Idle / Walk** — stationary, or a slow deliberate walk (optional, low priority; useful for edges and precision). Cheap to add: a second speed band and a slower leg-swing.
- **Run** — the default jog. This is exactly today's behavior; it stays the baseline so nothing regresses.
- **Sprint** — hold a key (proposed `Shift`+move, or a toggle); faster move speed while **stamina** drains, regenerating after a short delay once you stop. The single biggest change to overworld pacing.
- **Dash / dodge** — a *tap* (double-tap a direction, or a dedicated key): a short, fast burst-reposition that spends a chunk of stamina with a brief cooldown. This is the contentious one (see "Locomotion meets combat" and §7) — it is the verb that most makes movement feel Genshin/action-y, and the one with the most combat-design weight.

**Traversal verbs (verticality, from §2's layered-elevation model):**

- **Climb** — click a **climb point** (rope/vine/ledge); the hero ascends to the linked elevation tier, draining stamina over the climb; out of stamina mid-climb slides back down.
- **Glide** — from a height tier, click out over a gap to deploy a glider: a slow descending arc to a lower tier, free but committing. The payoff for climbing.
- **Swim** — entering a **water zone** switches to a slower swim state that drains stamina; deep water at zero stamina is a soft fail (wash back to shore), never instant death.

Every one of these is a **locomotion state with its own animation state**, which is the through-line back to §3.0: walk/run/sprint each get a leg-swing speed, dash gets a lean-and-burst pose (the `dash` gesture already exists in the animator), climb/glide/swim get their own poses. None of them deal damage, so none touch the windup/cast contract — *except dash*, below.

**Locomotion meets combat (the part that matters).** Dash is the only locomotion verb that collides with the combat-timing contract, so spell it out:

- A dash may **cancel the attack backswing** (the recovery after damage already landed) — this is the legitimate Dota animation-cancel and it should feel snappy.
- A dash may **not** start during the **windup** in a way that grants the hit for free — either it interrupts the attack (no damage, like any other move order today, which already zeroes `windupUntil`) or it is queued after the strike. No "swing, dash away, keep the damage."
- A dash **does not disjoint homing/targeted projectiles** — that is the premium property of Blink, Eul's, and Manta, and the dash must not step on it. A dash is fast *travel*, so it helps you **sidestep skillshots** (which movement already dodges in Dota), but a locked-on projectile keeps tracking. (This corrects an earlier draft that let the dash disjoint — it should not.)
- **Roots stop the dash; they do not stop a hero's blink.** The dash is movement, so a root shuts it off — while blink-escapes-root stays a mobility-hero tech. Another clean line that keeps real mobility ahead.
- **Turn rate still applies** — heavy heroes dash with the same weight they move with, preserving the §6 feel-fidelity rule.

**The iframe decision (flag, don't assume — see §7).** Genshin dashes give some characters brief invulnerability frames. Dota has *no* iframe dodge; you avoid damage by repositioning, blinking, or disjointing. A blanket iframe dodge would change the combat model. *Recommendation:* ship dash as a **fast stamina reposition with no damage immunity and no disjoint** — it feels Genshin-snappy while staying Dota-honest, and it costs no new core mechanic. Promote it to iframes/disjoint only if playtesting demands it, logged in `DECISIONS.md`.

**Don't step on mobility heroes or items (the budgeted-mobility law).** This is the real risk you flagged, and the design answer is to keep the dash deliberately *weaker on every axis* than real mobility, so it never substitutes for it:

| | Universal dash (everyone) | Real mobility (hero blinks / Blink Dagger / Force Staff) |
|---|---|---|
| Delivery | **Travels** — catchable, brief windup | **Instant** teleport / forced move |
| Range | Short (~250–350) | Long (Blink Dagger 1200; hero blinks 1000+) |
| Disjoint | **No** | Yes (Blink / Eul's / Manta) |
| Terrain | Can't cross walls / cliffs / Fissure | Crosses (blink over a cliff; Force pushes through) |
| Economy | Drains the shared **stamina** pool — can't be spammed in a long fight | Own mana / cooldown economy, independent of stamina |
| Roots | Stopped by root | Blink ignores root |

So the dash **raises everyone's floor** for moving through the overworld, while mobility heroes and items keep a far higher **ceiling** — and they actually *gain the most* from the new overworld, because they carry a real blink **and** the baseline dash. Anti-Mage with a dash is still Anti-Mage; he just also sprints between camps like everyone else. Move-speed items are safe for the same reason: sprint is a stamina-limited **burst**, not sustained speed, so Boots / Drums / Yasha / Phase still own the sustained chase-and-escape job. If even a weak combat dash proves to homogenize fights in playtest, the conservative fallback is **overworld-only** — sprint and dash taper to a normal run the moment combat starts (§7).

**The seam.** Stamina is an **overworld/systems resource, not a core combat stat** — keep it out of `src/core/` so determinism and the headless sim are untouched (the same discipline that keeps day/night and reputation out of the core). Locomotion *state* is likewise a systems/engine concern: the orchestrator picks the speed band and feeds the animator a state; the core still only ever sees move orders and the one `moveSpeed` stat it already has (sprint multiplies it for the order, the way a slow status already does). Stamina and the current state live on the `Game` orchestrator and the save:

```ts
// GameSave additions (systems-side; core never reads these)
stamina: number;            // current, 0..staminaMax
// derived: staminaMax, regen rate live in tuning.ts
```

Traversal verbs are **navigation, not new movement physics.** Climb/glide/drop are connectors on the region's elevation graph; the existing steering pather already routes to a point and around walls, so a climb is "path to the climb point, then run a scripted ascent to the linked tier." Elevation is a per-region set of height bands; `engine/terrain.ts` and `engine/scene.ts` render the bands and the connectors, and the camera follow already tracks the active hero's position (now including its height). Sprint is a move-speed multiplier gated by a stamina check in the orchestrator's `update`. New `tuning.ts` block:

```ts
locomotion: {
  walkSpeedMult: 0.55,                 // optional deliberate walk
  sprintSpeedMult: 1.5,                // run is the 1.0 baseline (today's behavior)
  dashSpeed: 1150, dashDurationSec: 0.22, dashCost: 55, dashCooldownSec: 0.9,
}
traversal: {
  staminaMax: 240,
  sprintDrainPerSec: 18,
  climbDrainPerSec: 24, swimDrainPerSec: 14,
  staminaRegenPerSec: 25, regenDelaySec: 0.6,
}
```

**Region data.** `RegionDef` gains optional traversal content (all additive; regions without it behave exactly as today):

```ts
elevation?: { tiers: number[]; /* world-height per band */ };
climbPoints?: { id: string; pos: Vec2; fromTier: number; toTier: number }[];
glidePoints?: { id: string; pos: Vec2; fromTier: number }[];
waterZones?: { id: string; poly: Vec2[]; deep?: boolean }[];
```

**Why first.** The locomotion ladder — run baseline, sprint, dash — is the single cheapest change with the biggest felt payoff: it makes the world feel like a place you *move through* rather than a board you slide across, and it is the foundation every other pillar leans on (sprint between camps, dash through a telegraph, climb to reach a chest, glide to a domain, swim to a shrine). Walk and the traversal verbs can follow inside the same slice; sprint + dash are the headline.

### 3.2 Curiosity loops & discovery (Pillar P2)

**Design.** Fill the world with small, frequent, *non-combat* rewards and the means to find and reach them. The Genshin principle is steady dopamine, not jackpots. Concretely:

- **Chests, tiered.** Common → Rich → Precious → Luxurious, mapped to our economy: gold, components, consumables, neutral items, and — for the best tiers — attunement shards (advancing a `Find`, `SPEC.md §8`) or a guaranteed mid-tier component. Some chests sit in the open (reward pure exploration); most are **locked behind a gate**: clear the nearby camp, solve an elemental puzzle (§3.3), or win a time trial.
- **Collectibles → offerings.** A Genshin-style oculus analogue: scattered **shards** (reuse the existing "Mad Moon fragment" lore — they are everywhere in the fiction already). Turn a quota of them in at the region **shrine** (which already exists, `RegionDef.shrine`) for a scaling reward and a bump to the region's exploration meter. This gives the shrine a second job beyond healing and gives collectibles a sink.
- **A per-region exploration %**, surfaced on the map and in the codex/journal. Discovering a POI, opening a chest, lighting a monument, or unlocking a waypoint each ticks it up; hitting thresholds pays out. This is the retention spine — "this region is 80% explored" is a real pull.
- **Fast-travel waypoints.** Genshin's teleport network. A handful of **waypoint** POIs per region that must be *discovered* (walked into) to activate, after which the map view (`M`) offers instant travel between any two discovered waypoints in the current region, and the town. This makes a large explorable region tolerable to re-cross and pairs with the existing gate-based inter-region travel.
- **Treasure-hunt / "?" markers.** Vague map hints ("something glints past the north ridge") that resolve into a chest or a puzzle when reached, reusing the journal lead system already built for recruitment Finds.

**The seam.** This is almost entirely **data + a discovery interpreter + save state**, with no core involvement. Pattern-match it onto how camps/echoes/POIs already work in `RegionDef` and `Game`:

```ts
// RegionDef additions
chests?: { id: string; pos: Vec2; tier: ChestTier; gate?: ChestGate; loot: LootRef }[];
shards?: { id: string; pos: Vec2 }[];          // collectibles
waypoints?: { id: string; name: string; pos: Vec2 }[];
discoveries?: { id: string; pos: Vec2; radius: number; hint: string; reveals: string }[];
```

```ts
// GameSave additions (mirrors codexUnlocks/journalSeen exactly)
discovered: string[];                  // POI/waypoint/discovery ids
openedChests: string[];
shardsTurnedIn: Record<string, number>; // per region
explorationPct: Record<string, number>;
```

Chest opening is a `G`-interact (the interaction key already exists) or a walk-into pickup, emitting a presentation event and routing rewards through the existing `deliverLoot` / gold paths. Exploration % is derived from `discovered` ∩ region content. Waypoint fast-travel reuses the region-travel plumbing (`Game.tryTravel`) restricted to intra-region discovered points. **Zero core changes**; this is the same class of work as the encounter-gated codex (`Game.codexUnlock`).

### 3.3 The elemental sandbox (Pillar P3)

**Design.** Make the **world** carry the seven elements, so elements are something you find and use in the environment, not just a tag on a hero's spell. This is what turns "we have reactions" into "we have Genshin."

- **Elemental sources** placed in regions: pyro braziers/torches, hydro pools/springs, electro crystals/relays, cryo ice, anemo wind currents, dendro growth, geo stone. Standing in or interacting with one **applies that element** to your hero (the exact element-aura the reaction engine already consumes), or lets you **carry/transport** it briefly.
- **Environmental reactions & puzzles.** Use a carried/applied element on a world target: light a chain of braziers in time (pyro), **freeze a water surface into a walkable platform** (hydro+cryo → a temporary passable tier, reusing the Freeze status), **electro-charge a relay** to open a door, burn away brush to reveal a path or a chest, blow a wind seed with anemo. Solving a puzzle opens a chest, a shortcut, or a waypoint (ties straight into §3.2).
- **Combat seeding.** An elemental source next to a camp means you can pre-apply an element to enemies (or yourself) before the fight — the world becomes a reaction enabler, exactly as Genshin uses braziers and pools mid-combat.

**The seam.** This is where the existing element system earns a second use. Two pieces:

1. **A render/systems-side "elemental field" prop.** An emitter at a position with a radius and an element that, each overworld tick, applies that element's aura to units inside it. Element application and the aura status **already exist** in the sim — the field just calls the same application path that an elemental attack does, so reactions fire through the unchanged `REACTION_TABLE`. The field is data on the region and an interpreter in `systems/`; the *application* is the one place it touches the core, and only through the element primitive the core already exposes (it already emits `element-apply` and `reaction` events):

```784:785:src/core/types.ts
  | { t: 'element-apply'; uid: number; from: number; element: Exclude<ElementId, 'neutral'>; gauge: number }
  | { t: 'reaction'; uid: number; from: number; reaction: string; elements: [Exclude<ElementId, 'neutral'>, Exclude<ElementId, 'neutral'>] }
```

2. **World-state reactions as terrain toggles.** "Freeze the water → walkable" and "burn the brush → passable / chest revealed" are **passability and prop-state flips**, which the movement system already does for temporary walls (Fissure/Ice Wall, `SPEC.md §2` zones with `wall: true`). A frozen-water platform is the inverse: a временный *passable* patch over a `waterZone`. Brush is a prop whose removal opens a path. None of this needs new core math — it is the existing zone/terrain vocabulary, toggled by an element application instead of a cast.

**Region data:**

```ts
elementSources?: { id: string; pos: Vec2; radius: number; element: ActiveElement; carriable?: boolean }[];
elementPuzzles?: {
  id: string; kind: 'brazier-chain' | 'freeze-platform' | 'relay' | 'burn-brush' | 'wind-seed';
  nodes: Vec2[]; requires: ActiveElement; timeLimitSec?: number; reveals: string; // chest/waypoint/shortcut id
}[];
```

**Scope guard.** Element-puzzles are flavor and gating, not a second combat system — keep the kinds to the handful above, all expressible as "apply element X to N nodes (optionally in time) → flip a terrain/prop/reveal flag." Anything more bespoke would be tempted toward an exotic; resist it, exactly as Resonance refused exotics.

**Gating note (respect the layer split).** Because the elemental sandbox lives in the overworld, it should follow Resonance's rule: the world's elemental puzzles and sources are **always on** (they are flavor/navigation, harmless without Resonance), but element *application from the world into combat* only matters when Resonance is enabled — with it off, a brazier still lights a chain and opens a door, it just does not seed combat reactions. Gyms/Elite stay pure macro and never see any of this.

### 3.4 Enemy elemental design (Pillar P4)

**Design.** Give some overworld enemies an elemental layer that *teaches and demands* the reaction system, so reactions are not just bonus damage but the intended solution:

- **Shielded enemies.** An elemental shield (a second health layer) that resists normal damage but melts to the right answer — applying the **reactive** element (e.g. a Pyro shield drops fast to Hydro/Cryo via Vaporize/Melt) shatters it, after which the enemy is briefly vulnerable. This is the Genshin "Abyss Mage" lesson: the world tells you "bring the counter element."
- **Element-infused elites.** Roaming elites that carry an element aura, auto-applying it on hit (so you are constantly reacting), and occasionally an "anti-reaction" aura that must be stripped first.
- **Encounter framing.** A camp next to a hydro pool full of pyro-shielded enemies is a designed puzzle: pre-soak them, then ignite. The pieces (sources §3.3, reactions §3.6) already compose.

**The seam.** A shield is a **stat layer + a damage-path check keyed on element**, both already in the vocabulary. The shield is a `statmod`-style pool with an `element` and a "drops fast to its reactive element" rule evaluated in the same damage resolution that already applies reactions. Express it as a creep flag / ability in data so it is content, not engine:

```ts
// CreepDef addition (optional)
elementalShield?: { element: ActiveElement; hp: number; weakTo: ActiveElement[]; weakMult: number };
```

The core change is minimal and generic: when resolving a hit on a shielded unit, route damage to the shield first, multiplied if the incoming element (or the reaction it triggers) is in `weakTo`. This is the one place a small, **element-generic** core addition is justified — it is the same shape as how reactions already special-case the damage path (`DECISIONS.md`, 2026-06-12: "Reactions resolve in the central damage path from one generic table"). It spends no exotic; it stays a table-driven rule.

**Gating.** Shields only engage when Resonance is on (they are an element-reaction mechanic). With Resonance off, a "shielded" creep is just a slightly tankier creep (the shield reads as bonus effective HP with no element rule), so base-mode balance is unaffected. The macro layer never spawns shielded units.

### 3.5 Domains, Ley Lines & a stamina-paced endgame loop (Pillar P5)

**Design.** Genshin's "what do I do today" loop is: spend a regenerating resource (**resin**) on **domains** (instanced challenges with a world-rule modifier and a curated reward table) and **ley line outcrops** (overworld farm nodes), with **weekly bosses** as the capstone. We already have the *content engine* for the hard part — `runRaidEncounter` runs an instanced, scripted, multi-phase fight headlessly (`core/macro.ts`), and `LootTable` + pity already model curated drops. We are missing the **elemental framing, the world-rule modifier, and the pacing economy**.

- **Domains** = element-themed instanced challenges built on the raid encounter runner, with three twists that make them Genshin and not just "another raid":
  1. **A ley-line disorder modifier** — a global rule for the run, expressed as an **aura statmod** (the existing aura vocabulary): e.g. "+40% Pyro reaction damage, −25% healing," or "periodic electro application to all units." Pure data, zero new mechanics.
  2. **Entry / clear conditions tied to elements** — "field a Cryo hero," "clear under N seconds," "trigger 8 reactions" — evaluated by the same observer pattern the recruitment `TrialRunner` uses (`core/trials.ts`).
  3. **A curated, element-flavored reward table** — reuse `LootTable` with pity; this is the artifact-farming sink analogue (without necessarily importing Genshin's artifact-set system — see §7 open decisions).
- **Ley Line Outcrops** = special overworld camps that, when cleared, pay a **resource reward** (gold/XP bump, the existing `scaledBounty` economy) gated by spending resin. Reuse `CampDef` with a resin cost and a richer payout.
- **Resin** = a single regenerating, capped resource that gates domain clears and ley-line payouts and **paces** the endgame so it is a loop, not a grind-to-zero. Regenerates on the playtime clock the game already tracks.

**The seam.** Domains are `runRaidEncounter` + an aura modifier + a `TrialRunner`-style clear condition + a `LootTable`. Every one of those exists. The new parts are a `DomainDef` data type and a thin `Game.runDomain` that assembles them — directly analogous to `Game.runRaid` / `Game.runBossFight`, which already do exactly this composition:

```ts
export interface DomainDef {
  id: string; name: string; regionId: string; element: ActiveElement;
  disorder: { mods: StatModMap; tick?: { element: ActiveElement; interval: number } }; // aura rule
  entry?: { requiresElementHero?: ActiveElement };
  clear: { kind: 'defeat' | 'time-limit' | 'reaction-count'; param?: number };
  encounter: RaidBossSetup;       // reuses the raid runner
  resinCost: number;
  loot: LootTable;
}
```

```ts
// GameSave additions
resin: number;                  // current, capped at resinMax (tuning)
resinUpdatedAt: number;         // playtime stamp for regen
```

**Resin is the one piece to ship carefully — or soften.** Genshin's resin is a free-to-play retention lever; Ancients is single-player with no monetization, so a punishing time-gate is hostile here. Treat resin as a **soft pacing tool, not a wall**: generous cap and regen, clears without resin still *work* but pay reduced/no curated loot (you can always play, you just bank less), and an offline-regen-on-load grace. The point is to give the endgame a daily-rhythm shape and make a "domain run" a deliberate choice, not to lock players out. This is an explicit open decision (§7) — it may be better as a pure cosmetic/streak system than a true resource. Either way it lives entirely in `Game` + save, never the core.

### 3.6 Reaction-driven swap combat — promote what we already shipped (Pillar P6)

**Design.** Resonance is done and good, but it is **off by default and framed as a stretch bonus** (`PROGRESS.md` Phase 5; `settings.resonance` defaults false). If the elemental overworld (§3.1–3.5) becomes a headline identity, Resonance stops being a bonus and becomes **the intended way to experience the overworld**. Recommended changes, all small:

- **Make Resonance the default for new games** (or prompt for it at New Game as the "full experience"), while keeping the off-switch for players who want pure Dota. The world systems (sources, puzzles, shielded enemies) all degrade gracefully with it off, so this is safe.
- **Surface the swap-rotation feel** that already exists (`resonanceSwapCooldownSec: 1.2`, off-field zone persistence per `SPEC.md §5.5`) in the HUD: show element auras on enemies and the reaction that *would* fire, so the apply-then-swap combo is legible. This is presentation, not mechanics.
- **Extend the reaction table only if a hero demands it** — e.g. the Bloom family (Dendro+Hydro) is noted optional in `SPEC.md §5`; add it when a Dendro-heavy region ships. Table-driven, zero exotics.

**The seam.** Almost all presentation. The mechanics exist; this is defaults, HUD readability, and a possible table row. No core change beyond data.

### 3.7 Exploration support — cooking, buffs, ambience (Pillar P7)

**Design (kept deliberately light).** Two small additions that make exploration its own activity:

- **Cooking / field consumables.** Gather ingredients from the world (a new cheap collectible class, or drops) and craft consumables at the **shrine** or town that grant **out-of-combat heals, a one-shot party revive, or a short exploration buff** (move speed, stamina regen, +reaction damage for a domain run). This reuses the **consumable item + statmod** vocabulary entirely; a "dish" is just an item with a timed `statmod` active. It gives the world's pickups a purpose and adds a Genshin texture without a new system.
- **Weather as elemental ambience.** The day/night cycle already exists and exposes a `night` flag to the condition system (`SPEC.md §3`, `Game.isNight`). Add a couple of **weather states** (thunderstorm → periodic Electro application outdoors; cold snap → Cryo) that apply elements through the §3.3 field path. This is "the world reacts on you," cheaply, and ties day/night into the elemental identity instead of leaving it cosmetic.

**The seam.** Cooking = item data + a crafting UI + the existing consumable/statmod engine. Weather = a region/clock flag + the §3.3 element-field interpreter. Neither touches the core.

### 3.8 What explicitly stays out

To keep scope honest and protect the spine, these Genshin pieces are **out of scope** (and why):

- **Gacha / pull mechanics** — we collect heroes by *recruitment quests* (`SPEC.md §8`) and creeps by *capture*; that is our collection identity and it is better for a single-player game. No banners.
- **A second leveling currency (artifact XP, talent books, mora, primogems)** — we have one gold wallet and an XP curve. Domains drop into *that* economy. Importing Genshin's parallel currencies would fight the Dota economy. (Artifact *sets* are a separate open question, §7.)
- **Co-op / multiplayer** — single-player by constraint (`SPEC.md`, README).
- **Free-form WASD third-person traversal** — Approach C in §2; out.

---

## 4. ARCHITECTURE IMPACT — what touches what

The whole overhaul is designed to keep the existing seams. Mapped to the layout (`SPEC.md §1`):

| Layer | What it gains | Touches the headless core? |
|-------|---------------|----------------------------|
| `src/data/` | New optional fields on `RegionDef` (elevation, climb/glide/water, chests, shards, waypoints, discoveries, element sources/puzzles); `DomainDef`; optional `CreepDef.elementalShield`; "dish" consumable items. **Most of the work is here, as data.** | No |
| `src/systems/` | The interpreters: stamina + traversal in `Game.update`; discovery/chest/waypoint/exploration-% tracking; element-field application; domain/ley-line/resin orchestration (`Game.runDomain`, mirrors `runRaid`); cooking/crafting. | No (calls existing core primitives) |
| `src/engine/` | Rendering: elevation tiers and connectors in `terrain.ts`/`scene.ts`; chest/source/puzzle props (instanced); glider arc; swim state; element-field VFX; HUD readouts (stamina, exploration %, resin, enemy element auras). | No (`boundary.test.ts` stays green) |
| `src/core/` | **Only two small, generic, element-keyed additions, both already precedented by the reaction resolver:** (1) the elemental-shield damage-routing rule (§3.4), and (2) confirming the world can drive the *existing* element-application primitive from a non-ability source (§3.3). No exotics, no DOM, no `three`, deterministic. | Minimal, generic |
| `GameSave` | New fields: `stamina`, `discovered`, `openedChests`, `shardsTurnedIn`, `explorationPct`, `resin`, `resinUpdatedAt`. Bump `SAVE_VERSION` 4 → 5 with a migration that defaults all of them (old saves load clean) — exactly the pattern used for v4 (`DECISIONS.md`, 2026-06-13). | N/A |

**The two core touches are the line in the sand.** Everything else is data + systems + engine, i.e. the safe two-thirds of the codebase. The elemental-shield rule is the only genuinely new sim behavior, and it is a table-driven, element-generic damage-path branch — the same category as reactions, which were added without exotics and without breaking determinism. If even that feels like too much core surface, the shield can degrade to a pure systems-side effective-HP model with the element check done in the orchestrator on `damage` events; note that fallback in `DECISIONS.md` if taken.

**Determinism and tests.** Stamina, discovery, resin, and traversal are systems-side and do not perturb the seeded combat sim, so existing determinism tests (the fixed-seed 5v5, the perf harness) are unaffected. New data gets the same lint treatment as everything else: a data-lint rule that every `reveals`/`chestGate`/`puzzle` reference resolves, every `elementSource.element` and `DomainDef.disorder` is a known element/primitive, and every `DomainDef.encounter` is a valid raid setup — mirroring the existing cross-reference lint (`src/test/data-lint.test.ts`).

---

## 5. PHASING — shippable slices, biggest felt-Genshin-per-cost first

Same culture as the rest of the project: each slice ships playable, green, and demoable; build ahead freely. Ordered so the cheapest, highest-impact feel lands first and each slice stands on its own even if the next never ships.

**G0 — Honor the animation/timing contract (prerequisite, mostly already true).** Not a build slice so much as a standing gate (§3.0): attack/cast timing stays in the core and the renderer animates it honestly. It is already true today; the job is to keep it true as G1's locomotion states and G4–G6's telegraphed attacks land. Concretely: every new dodge-check attack ships with a visible windup ≥ a fair reaction window, and dash respects the windup/backswing rules. No code unless a later slice would violate it.

**G1 — Locomotion ladder & stamina (the foundation).** Add the stamina resource and the locomotion ladder — run (baseline, unchanged), **sprint** (hold, stamina drain), and **dash** (tap, stamina burst, disjoints projectiles, no iframes per §7) — each with its animation state, plus the HUD stamina bar, save field, and tuning block. Optional walk band and the climb/glide/swim traversal verbs can ride along or follow in G3. No new region content required — sprint and dash work everywhere immediately. *This slice changes how the whole overworld feels* and de-risks both the resource model and the dash↔combat-timing interaction. Smallest high-impact first step.

**G2 — Discovery & curiosity loop.** Chests (tiered, some open / some camp-gated), the shard collectible → shrine-offering sink, per-region exploration %, and fast-travel waypoints. All data + a discovery interpreter + save state, no core. Author a first pass of this content into Tranquil Vale + Nightsilver Woods as the proving ground. After G2 the overworld already *rewards looking around*.

**G3 — Verticality & traversal.** Elevation tiers, climb points, glide, swim, in two or three regions authored to use height (a chest on a ledge you must climb to, a glide line across a ravine to a waypoint). Engine work in `terrain.ts`/`scene.ts` + the connector navigation. Builds on G1's stamina. This is the most engine-heavy overworld slice; doing it after G2 means there is already a reason to climb (a chest up there).

**G4 — The elemental sandbox.** Element sources, the handful of element-puzzle kinds, world-state reactions (freeze-platform, burn-brush), and combat seeding. Wires the world into the existing reaction engine. Pairs with promoting Resonance toward default (§3.6). This is the slice that makes the overworld read as *Genshin* and not just *open*.

**G5 — Enemy elemental design.** Shielded enemies and infused elites, authored into camps that sit beside the element sources from G4 so encounters become designed reaction puzzles. The one slice with a (small, generic) core touch.

**G6 — Domains, ley lines & resin.** The endgame loop: `DomainDef` + `Game.runDomain` on the raid runner, ley-line outcrop camps, the resin pacing resource (shipped soft, per §3.5/§7). Element-themed instanced challenges with disorder modifiers. The "what do I do today" capstone.

**G7 — Support & ambience.** Cooking/field consumables and elemental weather. The texture pass that makes exploration its own activity. Smallest and last; pure additive flavor on systems that all exist by G6.

**Stretch — Approach B explorer camera (§2).** Only after G1–G7 prove the systems are fun. Opt-in WASD out-of-combat traversal camera. Logged in `DECISIONS.md` if pursued.

Slices G1, G2, and G7 have **no core touch and no new region geometry**, so they can land independently and quickly. G3–G6 are where the depth (and the cost) is.

---

## 6. ACCEPTANCE — each slice is done when (testable, `PROGRESS.md` style)

| Slice | Done when |
|-------|-----------|
| G0 | The boundary test stays green (timing in core, animation in engine); every dodge-check attack added in later slices has a visible windup ≥ its fair-reaction window; dash cancels backswing but never the windup-into-free-damage. A test asserts a dash issued mid-windup does not deal the attack's damage. |
| G1 | A stamina bar shows in the HUD and persists across save/load; **run** is the unchanged baseline, **sprint** drains stamina for more speed and regenerates after a delay, **dash** spends a stamina burst for a fast reposition that grants **no** damage immunity, does **not** disjoint a homing projectile (it travels, so it only sidesteps skillshots), and is stopped by a root; each state drives its own animation. A unit test asserts a homing projectile still hits after a dash (disjoint stays premium to Blink/Eul's) and that a rooted unit cannot dash; `boundary.test.ts` stays green (stamina + locomotion state are systems-side). |
| G2 | A region has discoverable waypoints (walk-in to activate), tiered chests (open + camp-gated), and a shard→shrine offering; opening/discovering ticks a per-region exploration % shown on the map; map view fast-travels between discovered waypoints; all of it round-trips through save v5. Data-lint resolves every chest/waypoint/discovery reference. |
| G3 | A region has ≥2 elevation tiers with climb points (ascend, stamina-drained), a glide launch (arc to a lower tier), and a swim zone (slower, stamina-drained); a chest is reachable only by climbing and a waypoint only by gliding; the pather routes through connectors deterministically. |
| G4 | Element sources apply the matching aura to a unit in radius (verified headless via the existing `element-apply` event); a brazier-chain and a freeze-platform puzzle each open a reward when solved; with Resonance on, a world-applied element seeds a reaction on a nearby enemy through the unchanged `REACTION_TABLE`; with Resonance off, puzzles still solve and nothing seeds combat. |
| G5 | A shielded creep takes reduced damage until its `weakTo` element/reaction is applied, then is briefly vulnerable (headless damage-path test, fixed seed, deterministic); with Resonance off the same creep reads as plain bonus EHP; the macro layer never spawns shielded units (layer-split test). |
| G6 | `Game.runDomain` clears an element-themed instanced challenge on the raid runner with a disorder aura active and an element entry/clear condition enforced, rolling its `LootTable` with pity (headless, mirrors the existing raid tests); a ley-line outcrop pays a resin-gated reward; resin caps, regenerates on the playtime clock, and round-trips through save; a clear with zero resin still completes but pays reduced/no curated loot. |
| G7 | A cooked "dish" consumable grants an out-of-combat heal/revive/buff via the existing statmod path; a weather state applies an element outdoors through the §3.4 field path and is gated by the day/night clock. |

Cross-cutting gates (every slice): `npm test` + `npm run build` green; `boundary.test.ts` green (no `three`/DOM in core); save migration v4 → v5 defaults cleanly; no exotic slots spent; gyms/Elite Five play identically with all of this toggled on or off.

---

## 7. OPEN DECISIONS — settle these before/while building

1. **Camera/control model (§2).** Confirm Approach A (Dota spine + Genshin-by-systems) as the commitment, with Approach B as a labeled later stretch. *Recommended: yes to A now, B much later.* Everything in §3 assumes A.
2. **Is Resonance the default? (§3.6)** Should new games ship with the elemental layer on (making the overworld systems land as intended), prompt at New Game, or stay opt-in? *Recommended: prompt at New Game, default to on, keep the off-switch.*
3. **Resin: real resource, soft pacing, or cosmetic streak? (§3.5)** A single-player game has no monetization reason for a hard time-gate. *Recommended: soft pacing — clears always work, resin only modulates curated-loot yield — or drop the resource entirely in favor of a daily-streak bonus. Decide before G6.*
4. **Artifact-style gear with set bonuses?** Genshin's artifact loop (2pc/4pc set bonuses, substat rolls) is a major pillar we did *not* list, because it collides with the Dota item identity (recipes, on-sight identity, the 6-slot decision). Options: (a) **don't** — domains drop into the Dota item/component economy, keeping one gear language; (b) introduce set bonuses *only* on the neutral-item slot (we already have a separate neutral slot with its own rules); (c) a full parallel artifact system. *Recommended: (a) or (b). (c) is a second gear game and fights the spine.* This is the biggest identity fork in the whole overhaul — decide deliberately.
5. **How vertical? (§3.3, G3)** How many elevation tiers per region, and how many regions get verticality at all? *Recommended: 2–3 tiers, and only the regions whose lore wants it (Mount Joerlak/Highlands, the Chasm-like Vile Reaches) — flat regions stay flat and that is fine.*
6. **World/enemy scaling.** Genshin scales enemies to a "world level." We already scale rewards by region depth and have Normal/Nightmare/Hell tiers. Do we need a separate exploration-driven scaling, or do the existing region/tier multipliers cover it? *Recommended: reuse what exists; do not add a parallel scaling axis.*
7. **Naming & lore.** Keep original, Dota-voiced names (the project's rule). "Resin," "domain," "oculus," "ley line" are Genshin/MMO terms — pick in-world equivalents (the fiction already has "Mad Moon fragments / shards," "shrines," "echoes," "attunement"). *Recommended: shards = collectibles, shrine-offerings = the oculus sink, "Fragments/Rifts" for domains, an original word for resin if it ships.*
8. **Dash power budget — keep it below real mobility (§3.1, decide at G1).** The dash must not overpower mobility heroes (Anti-Mage, Storm, Slark, QoP, Mirana) or mobility items (Blink Dagger, Force Staff). Three sub-calls: **(a) iframes?** *Recommended no* — repositioning, not immunity. **(b) disjoint homing projectiles?** *Recommended no* — disjoint stays premium to Blink/Eul's/Manta; the dash only sidesteps skillshots (movement already does). **(c) how combat-relevant at all?** Either fully usable in combat as a deliberately weak reposition (short, travels, stamina-gated, root-stopped) *or* **overworld-only** (sprint/dash taper to run on combat entry) so a real blink is always the better in-fight tool. *Recommended: usable in combat but weak; fall back to overworld-only if it still homogenizes fights.* Settle these in G1, not later. Also: skip the walk state initially (run + sprint + dash carry the feel).

---

## 8. PRINCIPLES (aspirations, consistent with `SPEC.md §10`)

- **Genshin is the overworld, not the combat alone.** Resonance gave us the chemistry; this overhaul gives us the world to use it in. The win condition is the §1.1 rhythm — traverse, discover, solve, fight, bank — replacing `fight camp → walk → fight camp`.
- **The sim owns timing; the renderer animates it honestly.** Attack windups and cast points are mechanics, not decoration — damage and spells never resolve without an animation the player can read. Every new attack (especially dodge-check telegraphs) and every new locomotion state honors this contract (§3.0).
- **Additive and reversible, like Resonance.** Every system degrades gracefully when toggled off; the base Dota+Diablo game is never worse for this existing.
- **Reuse the vocabulary; spend zero exotics.** Sources apply existing element auras; reactions use the existing table; puzzles flip existing terrain/passability; domains are the existing raid runner + an aura + a loot table; dishes are consumables + statmods. If something seems to need an exotic, redesign it until it does not.
- **The headless core stays headless and deterministic.** Two small, generic, element-keyed touches at most (the shield rule, the world-driven element application). Everything else is data + systems + engine. `boundary.test.ts` stays green.
- **Respect the layer split.** All of this lives in the micro overworld (and domains/raids). Gyms and the Elite Five remain pure-Dota macro, untouched.
- **Original lore, Dota voice.** Genshin/MMO jargon gets in-world names from the fiction we already wrote.
- **Ship slices.** G1 (sprint) alone is worth shipping. Build ahead, keep it green, demo often.
