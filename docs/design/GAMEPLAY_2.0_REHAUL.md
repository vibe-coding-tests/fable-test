# GAMEPLAY 2.0 REHAUL — balance, loot pacing, and an AI that earns the win

How "ANCIENTS" goes from "all the heroes and items exist and the tests are green" to "the numbers feel right, the loot drips at a deliberate rhythm, and the AI plays the fight instead of walking into it." Companion to `SPEC.md` (the design target), `DECISIONS.md` (calls already made), and the existing overhaul series it builds on directly: `COMBAT_OVERHAUL.md`, `AI_OVERHAUL.md`, `LOOT_OVERHAUL.md`, `GAMEPLAY_OVERHAUL.md`, and `DUNGEON_OVERHAUL.md`. Status of record stays `PROGRESS.md`.

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays the system of record.** It never imports `three`, never touches the DOM, and stays deterministic for a seed. Everything here is **additive, data-driven, and reversible**: it lands as new `TUNING` values, new drop-table data, scorer weights, and a few wiring fixes for infrastructure that already exists but is dead. The existing roll functions (`rollItemDrops`, `rollLoot`, `scaledBounty`), the gated-shop guard, and the headless auto-resolve stay the tested reference. `src/test/boundary.test.ts` stays green. No proposal changes the boundary between sim and renderer.

This is one document covering four linked systems, because you cannot tune any one of them in isolation: **loot pacing** is meaningless without **combat numbers** that set how long a kill takes, the **AI** decides whether content is beatable at a given power level, and **gambling/crafting** is the pressure valve that keeps the loot cadence honest when RNG is cruel.

---

## 0. WHERE WE ARE — measured honestly

The content is done (`HEROES_AND_ITEMS_PLAN.md`): 122 heroes with real kits, the full item catalog with balanced recipes, exotics implemented, and 1266 tests green. What is *not* done is the play tuning on top of that content. Three honest findings, one per system.

### 0.1 Combat numbers don't track the player

Creep combat stats are fixed at authoring time. Only the *bounty* scales with depth (`scaledBounty` in `src/core/phase3.ts` multiplies region × tier × creep-tier × star). A level-30 hero in `mad-moon-crater` fights the exact same 240-HP Kobold it fought at level 1 in `tranquil-vale`. The combat scale knobs that *should* carry depth are partly dead:

- `bossTierScale.armor` (1.0 / 1.18 / 1.35) is defined in tuning and **never applied** anywhere — Nightmare/Hell bosses get HP and damage bumps but not their armor bump.
- Creep drop tables carry `nightmare`/`hell` columns but overworld kills **always roll `'normal'`**, so the columns are dead for open-world farming.
- Cleave secondary hits pass `ignoreArmor: true` (`src/core/combat.ts` `attackImpact`), so stacking cleave erases armor entirely and trivializes high-armor targets.

Net effect: difficulty comes almost entirely from raid/boss HP-scale (default 5×, up to ~12× HP at Hell) while the overworld stops being a threat the moment you out-level a region.

### 0.2 The loot loop is a gold faucet with one item tap

Per `LOOT_OVERHAUL.md` §0, the overworld drops gold and one neutral-by-tier and nothing else. Components and consumables do not drop from creeps or echoes despite `SPEC.md` §5 calling for it. The only place an *endgame* item can fall is a boss or a raid, and the drop engine has rich infrastructure that the data never uses:

- `rollItemDrops` supports multi-slot tables with per-slot rarity, rolls, chance, pity, and `qualityOdds` — but **no data table sets `qualityOdds`**, so every drop is Standard quality unless hand-forged.
- The dungeon guardian's `pity: 4` never fires because dungeon rolls pass an empty `dryStreaks: {}` each run (`src/systems/game.ts`), so bad-luck protection doesn't persist.
- `TUNING.resin` and `resin.dryLootGoldPct` exist but are wired to nothing. `tinkersBench.reclaimCost` is defined but reclaim is free.

There is no notion of "items per unit of playtime" anywhere. The cadence is whatever the boss timers happen to produce.

### 0.3 The AI is competent but blunt

`AI_OVERHAUL.md` shipped a real hybrid brain: a utility scorer, combat profiles, team-mind targeting, threat, and a boss phase-FSM. It works. But the polish layer is thin:

- The item-active AI only understands **5 items** (BKB, Force Staff, Glimmer, Mek, Eul). Blink, Scythe, Lotus, Manta, and every new 2.0 item are invisible to the scorer unless a player hand-authors a gambit rule.
- The scorer **ignores mana budgeting** (it will try to blow a 300-mana ult with 80 mana in the pool and fall through) and has **no cooldown sequencing** (no "hold the ult for the cluster / for enrage").
- `dangerousScore` is duplicated in `controllers.ts` and `utility.ts` and can drift. `fight-time-gt` reads absolute `sim.time` not encounter-relative time. `enemies-within` counts NPCs. ~40 magic numbers live inline in the AI files instead of `TUNING`.
- Cluster detection is O(n²) per enemy (`OPTIMIZATION_SPEC.md`).

None of this is broken. All of it is the difference between "the autobattler trades evenly" and "the autobattler plays like it read the patch notes."

---

## 1. GOALS & PILLARS

1. **A deliberate loot heartbeat.** One *endgame-grade* item (a completed Legendary+ core) on a band-paced cadence — slower early, faster late — with the rhythm holding regardless of which activity the player grinds. (As shipped this landed faster than the original slower hypothesis; see the §2 status note for the live floors.)
2. **Rarity and quality do the fine-grain pacing.** A single "drop event" is not binary. It rolls a *rarity* (mostly Legendary, occasionally Immortal) and a *quality* (Standard → Unusual), and items keep eating loot through the quality ladder and Inscribed kills long after they first drop. The chase never collapses to "I have the item, done."
3. **Combat numbers set time-to-kill, and TTK sets pacing.** Every balance number is justified by a target TTK band, so loot math and combat math share one currency: seconds.
4. **The AI plays to the player's power, not a fixed wall.** Content scales with depth/tier; the AI scales its competence with `aiDepth`; the two together keep fights winnable-but-earned across 30 levels.
5. **Gold and essence are the variance shock absorber.** When RNG is dry, deterministic sinks (gambling, the essence forge, hard-pity tokens) convert grind into power so the *felt* cadence stays near target.
6. **Everything is `TUNING` + data.** A balance pass is editing constants and tables, not rewriting systems. The boundary stays green.

---

## 2. THE PACING MODEL — the loot heartbeat (the headline)

This is the core of the rehaul. Everything else exists to serve this curve.

> **Shipped values (2026-06-14).** The pacing model landed, but the cadence was retuned *faster* than the original slower hypothesis: the live floors are `TUNING.loot.egCadenceMinByBand = { early: 6, mid: 4, late: 2 }` — one Legendary+ roughly every **2–6 minutes** of single-activity farming, faster late. `overworldEgSlotPct` shipped correspondingly higher (large creep 0.15/0.25/0.35, ancient 0.20/0.32/0.46, echo 0.03/0.045/0.06 by tier). The rarity split, quality odds, and band-mark quota below match the code. **`src/test/loot-pacing.test.ts` is the authority** for the cadence; the sub-tables in §2.2–§2.3 are preserved as the original slower hypothesis and should be read through that test where they disagree. Per §9, loot pacing was always a simulation problem to be locked by the test, not by hand math — and it was.

### 2.1 The four loot tiers (mapped to existing `ItemRarity`)

We already have a 7-grade rarity enum (`common → arcana`) and a `defaultRarity` function in `src/data/items/index.ts`. We group them into four *felt* tiers:

| Felt tier | Rarities | What it is | Target cadence |
|-----------|----------|------------|----------------|
| **Chaff** | common, uncommon | consumables, basic components | constant background; not counted |
| **Progress** | rare, mythical | mid components, mid cores, recipe parts | ~1 every **2–4 min** |
| **Endgame (EG)** | legendary | completed build-defining cores | **1 every 2–6 min as shipped** |
| **Chase** | immortal, arcana | marquee items (Rapier, Butterfly, Heart, Radiance, Aegis…) | long-tail spikes inside the EG stream |

The user-facing target is the **EG cadence** recorded in `TUNING.loot.egCadenceMinByBand` and guarded by `src/test/loot-pacing.test.ts`. Chase items are a weighted *subset* of EG events, not a separate timer.

### 2.2 The cadence curve (slower early, faster late)

Region depth already has a clean 1.0 → 2.55 ramp in `TUNING.regionRewardMult`. We bind the loot cadence to the same three depth bands:

| Band | Regions (by `regionRewardMult`) | EG cadence target | EG/min | Chase share of EG |
|------|----------------------------------|-------------------|--------|-------------------|
| **Early** (1–3) | tranquil-vale, nightsilver-woods, icewrack | **1 / 28 min** | 0.036 | ~5% |
| **Mid** (4–6) | devarshi-desert, shadeshore, vile-reaches | **1 / 18 min** | 0.056 | ~10% |
| **Late** (7–10) | quoidge, hidden-wood, mount-joerlak, mad-moon-crater | **1 / 11 min** | 0.091 | ~15% |

Read the curve as a **floor for a single activity done exclusively**. A player who only farms ancients in a late region should see ~1 Legendary every 11 minutes. A player who mixes ancients + boss reruns + a dungeon compounds these faucets and lands faster — which is the intended "a bit faster towards the end" behavior, amplified by the player choosing to diversify.

### 2.3 The budget: tune each faucet to its band's EG/min

Each farming activity gets an **expected EG-per-clear** (`p_EG`) and a **typical clear time in playtime-minutes** (`t`). The faucet realizes `p_EG / t` EG/min, tuned to the band floor. Concrete late-band (band 7–10, Hell-equivalent) allocation:

| Activity | `t` (min) | `p_EG` per clear | EG/min | Notes |
|----------|-----------|------------------|--------|-------|
| Ancient creep camp | 0.75 | 0.07 | 0.093 | new Legendary slot on ancient tables |
| Regional boss rerun (Hell) | 5.0 | 0.34 (incl. pity) | 0.068 | existing assembled slot, retuned |
| Raid clear (Hell) | 8.0 | 0.55 (incl. pity) | 0.069 | existing assembled slot |
| Dungeon full clear (Hell) | 16.0 | ~1.4 | 0.088 | guardian + elite rooms, pity fixed |
| Relic gamble (gold-gated) | — | deterministic | ≈ band floor | escalating cost throttles to band |

Each row lands near the 0.091 floor. Early band uses the same shape with smaller numbers (no ancients; large-creep Legendary slot ~2%, mini-boss/echo/dungeon contributions) summing to ~0.036/min. Mid interpolates.

> **Why this works:** the player never has to grind one "correct" activity. Whatever they do, the EG/min is roughly band-constant, so the heartbeat is a property of *where you are*, not *what you farm*.

### 2.4 Rarity split inside an EG event (leveraging rarities)

When an EG slot hits, roll the rarity from a band-weighted table instead of dropping a flat Legendary. This is where rarities "break things out" per the brief:

| Band | Legendary | Immortal | Arcana |
|------|-----------|----------|--------|
| Early | 95% | 5% | 0% |
| Mid | 90% | 9.5% | 0.5% |
| Late | 84% | 15% | 1% |

So the EG cadence is mostly completed Legendary cores, with an Immortal spiking on the schedule in §2.1 (Chase column), and Arcana (Aegis-tier) as a rare late-game jackpot. The chase distribution rides *inside* the EG timer, so a dry EG streak and a dry Immortal streak can't desync into "nothing good for an hour."

### 2.5 Quality odds inside a drop (leveraging item scaling)

`rollItemDrops` already reads `qualityOdds` per slot — it has just never been set. We populate it so a fraction of drops arrive **pre-qualified**, scaling with band and difficulty tier:

| Band / tier | Chance a drop carries a non-Standard quality | Skews toward |
|-------------|----------------------------------------------|--------------|
| Early / normal | 8% | genuine, frozen |
| Mid / nightmare | 18% | genuine, frozen, inscribed |
| Late / hell | 30% | inscribed, corrupted, unusual |

Quality is a *second power axis* on the same item (see `src/data/quality.ts`: genuine `+6 dmg/+100 hp`, corrupted `+16% dmg`, unusual a balanced spread). A pre-qualified Legendary is a "lucky drop" without needing a whole new item, which widens the felt reward distribution without touching the EG timer.

### 2.6 The grind never ends: items as ongoing loot sinks

The reason a generous EG cadence stays satisfying for hundreds of items' worth of playtime is that **each item keeps consuming loot**:

- **Quality ladder** (`standard → genuine → frozen → inscribed → corrupted → unusual`) costs essence + gold per grade (`TUNING.blackMarket.qualityUpgrade`). Six grades per item is a long horizontal tail.
- **Inscribed kills** grow an item per-kill up to `killCap: 60` (`src/data/quality.ts`), so even a "finished" build accrues power passively as you play.
- **Essence** is minted from every salvage and every duplicate. Dry EG streaks still convert into quality upgrades, so the *power* curve stays smooth even when the *item-drop* curve is spiky.

This is the lever the brief asked us to pull: rarities fan out the headline cadence, and quality/inscribed scaling turns every drop into a multi-session investment rather than a one-shot.

### 2.7 A hard floor: the band pity token

To guarantee the §2.2 floor even on catastrophic RNG, mint a deterministic **Loot Mark** on every Progress-or-better drop and every boss/raid clear. Accumulating `bandMarkQuota` marks (scaled per band) auto-redeems into one band-appropriate EG pick from a curated pool. This is cross-activity bad-luck protection layered *above* the existing per-table `pity`, so the worst-case cadence is bounded, not just the average.

---

## 3. DROP TABLES 2.0 — who drops what, and when

The principle from `LOOT_OVERHAUL.md` §0 holds: **specific sources are the efficient route to specific items.** We make the overworld a real (if slow) item faucet, theme boss/raid tables by hero identity, and wire the dead infrastructure.

### 3.1 Unify on the multi-slot table (already supported)

`rollItemDrops(table, tier, dryStreaks, rng)` already does everything we need: ordered slots, each with `rarity`, `rolls`, `chance[tier]`, optional `pity`, optional `qualityOdds`, and a weighted `pool`. The 2.0 work is **authoring data into this shape** and **passing the real difficulty tier + a persisted `dryStreaks`** at every call site. No engine rewrite.

### 3.2 Who drops what — the source matrix

| Source | Chaff | Progress | Endgame (Legendary+) | Chase (Immortal+) |
|--------|-------|----------|----------------------|-------------------|
| Small/medium creep | consumables 12–18% | early components 4–8% | — | — |
| Large creep | consumables 16% | components 18–24% | Legendary slot 2% (band-scaled) | — |
| Ancient creep | — | rare/mythical components 25%/8% | Legendary slot 4–7% | — |
| Hero echo (recruited) | — | attribute components 55% | small Legendary slot 3–6% | — |
| Mini-boss | guaranteed component | +1 component slot | assembled 4–17% (tier) | — |
| Regional boss | guaranteed themed component | — | themed assembled 8–30% (tier), pity 8 | inside assembled pool |
| Raid | guaranteed marquee component | — | assembled 10–35% (tier), pity 8 | Aegis/Rapier-tier guaranteed or pooled |
| Dungeon (per room + guardian) | clarity guaranteed | room components 18–60% | guardian assembled, **pity 4 (now persisted)** | guardian Immortal pool |
| Exploration chest | fixed consumables/gold | fixed component | curated, region-gated | — |
| Black Market relic wheel | — | — | gold-bought Legendary (≤ ceiling) | excluded |

Three concrete fixes this requires:

1. **Creep tables roll the real tier.** Overworld kills currently hardcode `'normal'`. Pass a `creepCombatTier(regionId)` derived from depth band so the `nightmare`/`hell` columns wake up. This is also what makes late-region ancients contribute EG (§2.3).
2. **Echoes and large/ancient creeps gain a Legendary slot.** Small chance, band-scaled, drawn from a curated pool gated by `itemAllowedFromSource(id, 'echo' | 'creep')`. This is the overworld EG faucet.
3. **Dungeon pity persists.** Thread `dungeonProgress[dungeonId].dryStreaks` into the `rollItemDrops` call instead of `{}`, so guardian `pity: 4` actually protects across runs.

### 3.3 Theme boss/raid tables by hero identity

Keep the existing themed approach in `src/data/bosses.ts` (agi bosses → Butterfly/Skadi/Diffusal, str titans → Heart/Cuirass/BKB, int bosses → Scythe/Refresher/Aghs) and extend it to the full 2.0 catalog so every Immortal has an *efficient* home boss, per `SPEC.md` §5. Radiance, Satanic, Bloodthorn, Octarine, and the Aghanim's line (already gated in `GATED_TOP_TIER` and `SOURCE_OVERRIDES`) each get a thematic boss/raid/dungeon home. A Daedalus farms from a crit carry; a Radiance from a burn/AoE boss; and so on.

### 3.4 Difficulty tier is the EG multiplier

The per-tier `chance` columns are where "faster late" lives without touching base rates. Boss assembled is already `0.08 / 0.16 / 0.30` (normal/nightmare/hell) and raids `0.10 / 0.20 / 0.35`. We keep those, add tier columns to creep/echo/dungeon EG slots on the same shape, and let region depth + difficulty tier compound into the band targets in §2.2. Tier gating (`bossTierUnlocked` in `src/core/phase3.ts`) stays the access control.

---

## 4. COMBAT & NUMBER BALANCE — TTK as the shared currency

Every number below is justified by a **time-to-kill target**, because TTK is what the loot cadence is denominated in.

### 4.1 Target TTK bands

| Matchup | Target TTK | Why |
|---------|-----------|-----|
| Hero vs same-tier trash creep | 1–3 hits | farming should flow |
| Hero vs ancient creep (in-band) | 6–12 s | a real but quick fight |
| Hero vs equal-level hero/echo | 8–14 s | duels read as Dota |
| 5-stack vs regional boss | 60–120 s | a fight, not a checkpoint |
| 5-stack vs raid boss | 3–6 min | an event, with mechanics |

### 4.2 Make the overworld scale with depth (the central combat fix)

Add a **creep combat scale** that mirrors the reward ramp but gentler, so late-region creeps threaten without becoming HP sponges. Proposed new `TUNING` block:

```
creepCombatScale: {
  // applied multiplicatively to creep maxHp / damage by region depth band,
  // parallel to regionRewardMult but softened so TTK stays in §4.1 bands.
  hpByRegion:     { 'tranquil-vale': 1.0, ... 'mad-moon-crater': 4.2 },   // ~ regionRewardMult^1.3
  damageByRegion: { 'tranquil-vale': 1.0, ... 'mad-moon-crater': 2.4 },   // ~ regionRewardMult^0.9
  tier: { normal: 1.0, nightmare: 1.5, hell: 2.1 }                        // overworld difficulty toggle
}
```

Apply it in `creepToBase` / the `externalMods` HP-injection path in `src/core/unit.ts`, the same place star scaling already lives. HP scales harder than damage so creeps stay killable but stop being free XP piñatas. This is what turns "the overworld is a Diablo board you out-level" into "depth is a difficulty axis."

### 4.3 Apply the boss armor tier (dead knob)

`bossTierScale.armor` (1.0 / 1.18 / 1.35) is defined and unused. Apply it next to the HP/damage scale in `raidSetupFromDef` (`src/core/phase3.ts`) and `runBossFight` (`src/systems/game.ts`):

```
boss.externalMods.armor = (boss.externalMods.armor ?? 0) + base.baseArmor * (tier.armor - 1);
```

Armor scaling lengthens physical TTK on harder tiers (intended) and makes magic/armor-shred builds matter on Hell, which the cleave fix below reinforces.

### 4.4 Cleave should respect armor

`attackImpact` cleaves with `ignoreArmor: true`, so cleave is effectively true damage and erases the entire armor axis on Hell bosses and ancients. Change cleave secondary hits to normal physical (armor applies). This restores the armor↔cleave tension without nerfing cleave against squishies (who have little armor anyway), and makes Assault Cuirass / Shiva's / Solar Crest meaningful counters.

### 4.5 Creep abilities scale with star and band

Creep ability values are flat tables indexed by `min(star, maxLevel)`. Late game, neutral nukes become noise while heroes one-shot camps. Scale creep ability *values* (not just level) by the §4.2 `tier`/region factor so an ancient's stun/nuke stays relevant in a late region. This is a data pass on creep `values` arrays plus a scale hook in the effect resolution for creep-sourced abilities.

### 4.6 Smooth the progression walls

- **Recruit level cap** (`recruitLevelCap: [15, 22, 30]`) hard-walls XP at 0/1 badges. Keep the gate but widen the early steps (e.g. `[18, 25, 30]`) so a fresh recruit isn't stuck 15 levels below content for a whole region, and bank-then-release stays the mechanic.
- **XP curve quirk:** `xpCurve[1] === 0` makes level 2 free and `levelFromXp(0)` return 2. Set `xpForLevel(2)` to a real value so level 1 is stable.
- **Dead post-30 curve:** the `+4000/level` extension past the array never runs at `levelCap: 30`. Leave it (harmless) or remove for clarity.

### 4.7 What stays as-is (verified healthy)

The armor curve (`armorFactor: 0.06`, standard Dota EHP), magic-resist model (`baseMagicResist: 25`, capped 85%), crit (max-stacking, default 150%), spell amp (multiplicative on non-attack non-physical), and lifesteal-on-post-mitigation are all sound. The global `cooldownScale: 0.8` / `manaCostScale: 0.9` action-RPG pacing stays. We are not re-deriving the engine; we are scaling content to it.

---

## 5. AI POLISH — from competent to sharp

Build directly on the shipped `AI_OVERHAUL.md` brain. These are surgical upgrades to the scorer and the gambit grammar, all reversible.

### 5.1 Generalize the item-active AI (highest impact)

Today only 5 items have `consider` functions (`scoreItemActive` in `src/core/utility.ts`); every 2.0 item is invisible. **Drive item-active scoring off the same intent classifier used for abilities** (`classify`/`intentOf`). An item whose `active` is offensive-single-target scores like a nuke; a self-escape displacer scores like an escape; a team heal scores like Mek. Keep the 5 hand-tuned overrides as a high-confidence fast path, but fall back to intent-derived scoring so Blink, Scythe, Lotus, Manta, Atos, Sheepstick, and friends are used automatically. This is the single biggest "the AI got smarter" win and it scales with the catalog for free.

### 5.2 Mana budgeting

The scorer currently scores casts it can't afford and falls through. Add a mana-affordability gate and a soft *mana-conservation* weight: when mana is scarce, discount expensive casts so the AI doesn't dump its pool on a low-value target and then stand disarmed. New `TUNING.ai` knobs: `manaFloorPct`, `manaConservationWeight`.

### 5.3 Cooldown sequencing and ult discipline

No "save it" logic exists today. Add two cheap heuristics:

- **Hold-for-value:** an AoE ult is discounted while `clusterCount < holdClusterMin` and recently off cooldown, mirroring the boss `pickBossMechanic` hold logic so heroes don't waste Ravage/Black Hole/Requiem on one target.
- **Combo windows:** optional per-hero `combo` weight letting a kit prefer A-then-B ordering (e.g. setup stun before the nuke) without bespoke scripting — a data field on the hero, read by the scorer.

### 5.4 Centralize the magic numbers

~40 inline constants across `controllers.ts` / `utility.ts` / `boss-brain.ts` (leash heal radii, zone-escape margin, cluster radii, kite step, `casterBias`/`heroBias`/`lowHpPenalty`, boss score multipliers, item score multipliers) move into a `TUNING.ai` sub-block. This makes the AI tunable in a balance pass instead of a code edit, and lets difficulty tiers dial behavior, not just stats.

### 5.5 Fix the small naive heuristics

- **Dedup `dangerousScore`** — single source of truth shared by `controllers.ts` and `utility.ts` (drift risk today).
- **`fight-time-gt`** reads encounter-relative time, not absolute `sim.time` (long sims skew gambit timing).
- **`enemies-within`** filters NPCs to match the other enemy filters.
- **`incoming-disable`** checks whether the disable's geometry actually lands on the unit (target/trajectory), not merely that an enemy is mid-cast somewhere.
- **Boss healer targeting** weights wounded/low-threat healers, not just the nearest support.

### 5.6 Cluster-detection performance

`most-clustered`, `bestCluster`, and the boss cluster target are O(n²) via per-enemy `unitsInRadius` (`OPTIMIZATION.md`). Route them through the existing spatial grid (`src/core/spatial.ts`) so the 2.0 roster's bigger fights (summons, illusions, brewlings, clones) stay inside the perf budget (30 active units / 200 projectiles).

### 5.7 Difficulty as AI depth, not just stats

`bossTierAiDepth` (`normal 0.45 / nightmare 0.7 / hell 1.0`) already dials boss opportunism and raid reaction. Extend depth to gate the *new* behaviors above (ult discipline, mana conservation, combo windows) so Hell-tier enemies don't just have more HP — they play better. Keep gyms / Elite Five symmetric and depth-free per `AI_OVERHAUL.md` §2, so competitive feel stays clean.

---

## 6. GAMBLING & CRAFTING 2.0 — the variance shock absorber

The economy already has the right *organs* (recipe wheel, relic wheel, essence salvage, quality forge, Tinker's Bench). 2.0 makes them the deliberate pressure valve that keeps §2's cadence honest.

### 6.1 The relic wheel is the gold→EG faucet, throttled by escalation

Relic wheel cost is `relicWheelBaseCost (2400) + gambleRolls × relicWheelStepCost (450)` and outputs a **bound** core (rare → `relicRarityCeiling: legendary`, never `GATED_TOP_TIER`). Keep this as the catch-up faucet, but tune the escalation so that *gold-farming converts to EG at roughly the band floor* (§2.2) and no faster — the escalating cost is what stops a gold-rich player from buying past the heartbeat. The relic wheel is the floor for players who fight inefficiently but farm gold well; it can never vend Immortals/Arcana (those stay combat-gated).

### 6.2 Essence is the universal dry-streak converter

Every salvage and every duplicate mints essence by rarity (`salvageEssence: common 1 … arcana 30`). Essence + gold buys quality grades (`qualityUpgrade`). This is the mechanism that makes a *dry EG streak still feel like progress*: the Legendaries you already own climb the quality ladder while you wait for the next drop. Tune `salvageEssence` and `qualityUpgrade` costs so that a band's worth of "Progress" drops salvages into roughly one quality-grade upgrade — i.e., the horizontal grind and the vertical grind run at comparable rates.

### 6.3 Add a deterministic assembly path (new, small)

Drops and gambling are both RNG. Add one **deterministic** route: a crafting bench that assembles a *specific* Legendary core if you hold its rare/mythical components plus an essence fee. The components already drop (§3.2) and the recipe graph already exists (`computeBuyPlan` consumes components). This is the "I know exactly what I'm working toward" complement to RNG drops, and it's the natural sink for the flood of Progress-tier components the overworld now produces. Immortals stay non-craftable (combat-gated chase).

### 6.4 Wire or retire the dead knobs

- **`resin`** (`max 180`, ~8h refill) becomes the optional *rate limiter* on the richest faucets (dungeon/boss reruns): spend resin for full loot, or get `dryLootGoldPct (0.25)` gold-only when dry. This caps no-life farming without blocking it and gives the existing constants a job. Off by default to preserve current pacing in tests.
- **`tinkersBench.reclaimCost`** — either charge it (reclaim is currently free) or delete the constant. Pick one; don't ship a lie.

### 6.5 The Loot Mark hard pity (from §2.7) lives here

Loot Marks accrue from Progress+ drops and clears and redeem at the Black Market for a band-appropriate EG pick. This is the cross-activity floor that guarantees the §2.2 cadence; it sits beside the per-table `pity` and the essence ladder as the third and final variance backstop.

---

## 7. PROPOSED TUNING DELTA (the concrete knobs)

A 2.0 balance pass is mostly this block. Illustrative values, to be locked by the simulations in §8.

```
// --- combat scaling (NEW) ---
creepCombatScale: {
  hpByRegion:     { /* regionRewardMult ^ ~1.3, 1.0 → ~4.2 */ },
  damageByRegion: { /* regionRewardMult ^ ~0.9, 1.0 → ~2.4 */ },
  tier: { normal: 1.0, nightmare: 1.5, hell: 2.1 }
},
applyBossArmorTier: true,           // wire bossTierScale.armor (currently dead)
cleaveIgnoresArmor: false,          // cleave now respects armor

// --- loot pacing (NEW) --- shipped values; see TUNING.loot
loot: {
  egCadenceMinByBand: { early: 6, mid: 4, late: 2 },       // SHIPPED minutes per Legendary+ (retuned from the 28/18/11 hypothesis)
  egRaritySplit: {
    early: { legendary: 0.95, immortal: 0.05, arcana: 0.0 },
    mid:   { legendary: 0.90, immortal: 0.095, arcana: 0.005 },
    late:  { legendary: 0.84, immortal: 0.15, arcana: 0.01 }
  },
  qualityDropChance: { normal: 0.08, nightmare: 0.18, hell: 0.30 },
  bandMarkQuota: { early: 24, mid: 18, late: 12 }          // hard-pity Loot Marks per EG
},
overworldEgSlotPct: {               // SHIPPED Legendary slots on overworld sources (higher than the early draft)
  largeCreep:  { normal: 0.15, nightmare: 0.25, hell: 0.35 },
  ancientCreep:{ normal: 0.20, nightmare: 0.32, hell: 0.46 },
  echo:        { normal: 0.03, nightmare: 0.045, hell: 0.06 }
},

// --- progression smoothing ---
recruitLevelCap: [18, 25, 30],      // was [15, 22, 30]

// --- AI (NEW sub-knobs; existing ai/threat blocks unchanged) ---
ai: {
  // ...existing rangedThreshold/castScoreFloor/etc...
  manaFloorPct: 0.18,
  manaConservationWeight: 0.5,
  holdClusterMin: 2,                // discount AoE ult below this cluster size
  itemIntentFallback: true          // generalize item-active scoring beyond the 5 hand-tuned items
}
```

Plus the wiring fixes that are not numbers: pass real difficulty tier + persisted `dryStreaks` to creep and dungeon roll sites; populate `qualityOdds` on EG tables; resolve `reclaimCost`/`resin`/`dryLootGoldPct`.

---

## 8. ROLLOUT & ACCEPTANCE

Delivered in batches, each shipping green (`npm run typecheck`, `npm test`, `npm run build`) and keeping `boundary.test.ts` and the headless auto-resolve reference intact. Each batch is reversible (a `TUNING` flag or a data file), per project footing.

1. **Combat scaling** (§4). Add `creepCombatScale`, apply boss armor tier, fix cleave-armor, smooth recruit cap and the XP-curve quirk. Gate: new `combat-scaling` tests assert TTK bands (§4.1) at representative region/level/tier points; existing combat/economy tests stay green.
2. **Drop tables 2.0** (§3). Author multi-slot tables with rarity/quality/pity; wake the creep tier columns; persist dungeon pity; add overworld EG slots; theme boss/raid tables to the full catalog. Gate: extend `economy.test.ts` / `dungeon.test.ts` to assert EG cadence per band over a seeded sample, and assert `GATED_TOP_TIER` still never vends from shop/gamble.
3. **Pacing model** (§2). Implement the band cadence, rarity split, quality odds, and Loot Marks; add a headless **loot-pacing simulation test** that farms each band for N simulated minutes and asserts EG/min lands in the shipped floor-to-ceiling contract. This test is the living contract for the EG cadence.
4. **AI polish** (§5). Generalize item-active scoring, add mana budgeting + ult discipline, centralize magic numbers, dedup `dangerousScore`, fix the small heuristics, route clustering through the spatial grid. Gate: extend `utility-ai`/`reactive-ai`/`raid-ai` tests; add cases for "AI uses a non-whitelisted item active," "AI holds AoE ult for a cluster," "AI doesn't cast unaffordable spells." Perf budget test (`perf-budget.test.ts`) stays green.
5. **Gambling/crafting 2.0** (§6). Tune relic-wheel escalation to the band floor, balance essence↔quality rates, add the deterministic assembly bench, resolve the dead knobs. Gate: `quality.test.ts` extensions for the essence/quality rate parity; a gamble-pacing test that asserts gold→EG conversion ≈ band floor and that the wheel never yields Immortal/Arcana.

**Acceptance, in one line:** across all four pillars, a seeded headless playthrough of each depth band yields the §2.2 EG cadence ± tolerance, TTK stays in the §4.1 bands, the AI uses the full item catalog and its cooldowns sensibly, and every existing test stays green.

---

## 9. RISKS & NOTES

- **Loot pacing is a simulation problem, not a spreadsheet one.** The §2 numbers are a starting hypothesis; the §8.3 pacing test is the real authority. Expect to iterate the constants against simulated farm sessions, not hand math.
- **Compounding faucets can overshoot.** Tuning each activity to the band floor means mixing them runs faster (intended), but stacking *all* of them could blow past "faster late" into "raining loot." The Loot Mark floor is a floor; watch the ceiling in the pacing sim and, if needed, apply mild diminishing returns per-session rather than nerfing base rates.
- **Cleave-armor and creep scaling change felt difficulty immediately.** These are the two changes most likely to make existing content feel harder. Land them behind the §4 batch with TTK tests so the change is measured, not vibes.
- **AI item generalization can misfire on weird kits.** Intent classification is pattern-matching; a few items will score wrong. Keep the 5 hand-tuned overrides as the trusted path and treat the fallback as best-effort, the way the catalog already treats auto-resolved anim/sound.
- **Balance is explicitly iterative** (`SPEC.md` §0/§6). Ship the systems and the tests first; the exact constants are expected to move. The win condition is that moving them is a one-file edit, not a refactor.
- **Resin and rate-limiters are opt-in.** They default off so current tests and pacing don't shift under them; they exist for a later "should we cap no-life farming" decision, not as a day-one gate.
