# PROGRESSION OVERHAUL — fun first, per layer

**Goal:** make ANCIENTS *progressive by nature* and *more fun* by giving each layer a
distinct combo fantasy that the content actively demands and rewards — overworld
(swap-react flow), autobattler (asymmetric Captains draft), raids (the gear chase) —
and by giving the full hero collection a real job, all without breaking what already
works or inflating the macro hero ceiling. **Success looks like:** the overworld stops
being trivial, a deep roster beats a shallow one in macro, and the chase has somewhere
to go — each provable by the headless tests in §7.

How we get there. The spine of this doc is one rule: **every change must make a
layer's signature combo more *demanded* and more *rewarded*.** Difficulty is a means,
not the goal — a tankier creep is not fun, a creep that forces a swap-react combo is.

Companion to `SPEC.md` (§4 World & Progression, §5 Roster & Items, §6 Micro Combat,
§7 Macro), `DECISIONS.md`, `LOOT_OVERHAUL.md`, `AUTOBATTLER_OVERHAUL.md`,
`SWAP_COMBAT_OVERHAUL.md`, `SKILL_TREE_SPEC.md`, and `GAMEPLAY_OVERHAUL.md`.

**This is an implementation spec.** Every section below names the exact files,
functions, types, tuning keys, save migration, and tests. The headless deterministic
core (`src/core/`) stays untouched in its resolution layer (no `three`, no DOM,
deterministic for a seed); everything is additive and reversible; the macro hero
ceiling (level 30 / 15 ability pts / 14 mastery pts / 6 items) is left intact.

Status: **draft**. Numbers are starting points, tunable in `tuning.ts`.

Live baselines this spec builds on: `SAVE_VERSION === 7` (`systems/game.ts`); creep
scaling is `creepCombatScale()` in `core/unit.ts:613`; the migration chain is
`migratePhase{3,4,6,7}Save`.

---

## 0. The fun charter — three layers, three combos

| Layer | Fun fantasy | Combo type | Substrate already built |
|-------|-------------|------------|--------------------------|
| **Overworld (micro)** | Genshin: react + swap-rotate in real time | element reactions, swap-chains, dodge | reactions (`core/resonance.ts`), tag boons (`data/tag-boons.ts`), tag chains (`TUNING` `tagChain*`), `elementalShield` on creeps, `HeroComboRule` |
| **Auto-battler (macro)** | Dota captain — but *they* draft against you: survive the bans, land the wombo | cross-hero setup→payoff, draft under bans, gambits | `combo-planner.ts`, gambit grammar, Captain Calls, `validateDraft`/`counterDraft`/`runPickBan` (`core/draft.ts`) |
| **Raids** | the loot chase | — (reward sink for the other two) | `themedLoot` (`data/bosses.ts`), `AghanimDef` scepter+shard, `HeroAugments`, Rapier-tier anchors, pity |

**Division of labor (load-bearing):** micro = fluid swap-combo flow (free 1–5 swap);
macro = an **asymmetric Captains draft** where the leader bans *your* heroes and
out-adapts you, and roster depth is the answer (§3); raids = the gear chase (Aghs
Scepter/Shard + anchors); the account meta is the dial that gates/feeds the chase,
never the prize, and never grants a stat the macro sim reads.

---

## 1. The problem, measured

1. **Overworld is region-static.** `creepCombatScale()` (`core/unit.ts:613`) reads
   only `regionId`+`combatTier`; tops out ~4.2× HP across all regions vs. a hero's
   8–15× growth. You always out-scale the region.
2. **Collection ≠ power.** One shared wallet; only 5 field in macro, 1+3 in micro;
   masteries are variety not power. Nothing consumes roster breadth.
3. **The draft bridge has no teeth.** `validateDraft`/`counterDraft`/`runPickBan` are
   shipped and tested but gyms barely use them: light formats, fixed level-14–29
   enemies, no `level-cap`, no bans — the leader never drafts against you.
4. **Combo systems are built but nothing demands them.** Reactions, tag chains,
   elemental shields, the macro combo-planner all exist and are tested — no content
   *requires* a combo and no feedback *celebrates* one, so players never find them.

---

## 2. Pillar A — the overworld asks you to play Genshin (micro combo)

Relative difficulty is the carrier; **combat texture** (shields/affixes/dodge) is the
payload. World Level scales *how much texture*; HP/damage is secondary.

### 2.1 Files & changes

| File | Change |
|------|--------|
| `core/progression.ts` | **Add** pure helpers `worldLevel(maxFieldedLevel, badges)` and `worldLevelScale(wl)` (below). |
| `core/unit.ts` | **Extend** `CreepCombatScaleOpts` (line 45) with `worldLevel?: number`; in `creepCombatScale()` (line 613) multiply both `hp` and `damage` by the WL term. `creepToBase`/`makeCreepUnit` already thread `opts` through — no signature change there. |
| `core/sim.ts` | **Add** `worldLevel?: number` to the `spawnCreep` opts object (line 262) and forward it into `makeCreepUnit`. |
| `core/dungeon.ts` | **Export** the existing module-local `upgradeRarity` and `pickAffixes` (lines 106/114) as `rollPackRarity`/`pickPackAffixes` so the overworld can reuse them (or move both into a new `core/overworld-packs.ts` that the dungeon imports). No behavior change. |
| `systems/game.ts` | In the camp spawn loop (~lines 5982–6000): compute `const wl = worldLevel(this.maxFieldedLevel(), this.badges.size)`, pass `worldLevel: wl` to `spawnCreep`; replace the flat `eliteSpawnChance` gate with a WL-scaled champion/rare roll (`rollPackRarity`), and on a champion/rare elite set `u.elementalShield` from a region shield table + apply 1–`affixCountByWorldLevel` affixes. Add a private `maxFieldedLevel()` (max level over `this.party`). |
| `combat.ts` | **No change** — elemental-shield damage routing already exists (line 50). |

### 2.2 New code (`core/progression.ts`)

```ts
export function worldLevel(maxFieldedLevel: number, badges: number): number {
  return Math.min(TUNING.worldLevel.cap, Math.floor(maxFieldedLevel / 6) + badges);
}
export function worldLevelScale(wl: number): { hp: number; damage: number; texture: number } {
  const t = TUNING.worldLevel;
  return { hp: 1 + wl * t.hpPerLevel, damage: 1 + wl * t.damagePerLevel, texture: wl * t.texturePerLevel };
}
```

`creepCombatScale()` edit (multiply into the existing return):

```ts
// in core/unit.ts creepCombatScale(), after the region/tier reads:
const wl = worldLevelScale(opts.worldLevel ?? 0);
return { hp: hpRegion * tierMult * wl.hp, damage: damageRegion * tierMult * wl.damage };
```

### 2.3 Reward must rise with World Level

A higher WL is opt-in *because it pays better*. Two existing seams:

- **Bounty:** in the kill-reward path (`systems/game.ts` ~7699, where `scaledBounty`
  is applied) multiply gold+xp by `1 + wl * TUNING.worldLevel.rewardPerLevel`.
- **Loot grade floor:** add `wl * rewardPerLevel` into `regionalGradeFloorBump()`
  (the helper already feeding `instantiateDroppedItem`).

### 2.4 Reward the expression

Tag chains already escalate (`TUNING.tagChainAmpPerStepPct`). Surface it: on a pack
killed while a ≥2-step tag chain or a reaction is live, bump that drop's grade floor
by one and emit a brighter `loot-drop` beam. Pure presentation + a grade-floor nudge;
no core change (the chain/reaction state is already on the unit).

### 2.5 Echo floor

In the echo spawn path, spawn at `Math.max(def.level, leadLevel - 4)` and pass the
same `worldLevel` into the echo build, after the existing `×0.6 echoHpTaxPct`.

### 2.6 Tuning (`data/tuning.ts`, new keys)

```ts
worldLevel: {
  cap: 8,
  hpPerLevel: 0.14, damagePerLevel: 0.08,   // secondary
  texturePerLevel: 0.06,                      // primary
  rewardPerLevel: 0.06
},
overworldElite: {
  // champion/rare chance on large/ancient camps, by world level (0..cap)
  championChanceByWorldLevel: [0.04, 0.08, 0.12, 0.16, 0.20, 0.24, 0.28, 0.32, 0.36],
  rareChanceByWorldLevel:     [0.00, 0.01, 0.02, 0.03, 0.05, 0.07, 0.09, 0.11, 0.13],
  affixCountByWorldLevel:     [0, 1, 1, 1, 2, 2, 2, 3, 3]
},
```

### 2.7 Acceptance

A level-30 + geared hero in `tranquil-vale` at WL 8 fights a non-trivial,
shield/affix-textured pack; with `settings.worldLevel === false` the numbers equal
today's exactly.

---

## 3. Pillar B — the leader drafts against you (asymmetric Captains Series)

The Dota-native version of "your roster needs depth": the gym leader / Elite member
**is the captain**, and the asymmetry is deliberately in their favor (this is where the
macro challenge comes from):

- **Bans are one-directional.** The leader bans *your* heroes; you cannot ban theirs.
- **The enemy out-adapts you.** Each round they ban one more of your heroes *and*
  counter-draft their own five; you only get a small, difficulty-scaled repick budget.
- **Depth is the only answer.** They keep taking your heroes off the table, so a one-
  trick roster runs out of legal fives — the full collection (§5) gets its job.

Most of this is already shipped in `core/draft.ts` (the `DraftRule` ban/cap vocabulary,
`validateDraft`, `buildLegalTeam`, `counterDraft`, `runPickBan`, `formatSatisfiable`).
The new code is the **one-directional ban picker** and wiring the **series ban loop**.

### 3.1 The series, step by step

1. **Pre-series enemy ban phase (one-directional).** The leader bans
   `enemyPreBansByDifficulty[tier]` heroes from your **recruited roster**, targeting
   your strongest / most counter-relevant heroes (reuses `counterDraft`'s
   `ANTI_CARRY`/`ANTI_COMBO` + value heuristic). You cannot ban back.
2. **Your draft.** You commit a legal five from `roster \ banned` under the leader's
   static `format` (type/role bans, attribute caps, level cap — the gym's flavor).
3. **Between rounds — escalating enemy bans.** Each round the enemy bans
   `betweenRoundBanByDifficulty[tier]` more of your heroes, **preferring heroes from
   your last five** (especially the five that just *beat* them — they ban your MVP).
4. **Your repick budget.** Between rounds you may swap up to
   `repicksByDifficulty[tier]` heroes of your five from your still-legal pool. On
   `hell` that is **0** (your draft is locked while they keep banning); on `normal`
   you can patch 1–2. A ban that hits a hero currently in your five forces a repick of
   that slot **for free** (doesn't spend budget) from the legal pool.
5. **The enemy also re-slots its own five** (existing `counterDraft`, `last-pick`) when
   `enemyReslotsOwnFive` is on — maximum asymmetry, "give them the advantage."
6. **Failsafe.** The ban picker clamps so at least `minLegalRosterAfterBans` (= 5)
   legal heroes always remain and `formatSatisfiable` (`draft.ts:242`) holds — a series
   is never an unwinnable wall; a loss just lets you re-challenge.

Difficulty is the challenge knob: rising tier = **more** pre-bans, **faster**
escalation, **fewer** repicks.

### 3.2 Files & changes

| File | Change |
|------|--------|
| `core/draft.ts` | **Add** `pickEnemyBans(format, playerRoster, alreadyBanned, count, lastPlayerFive, seed): string[]` — deterministic; reuses the `ANTI_CARRY`/`ANTI_COMBO` + value heuristic from `counterDraft` (line 281) to choose which *player* heroes to ban; weights `lastPlayerFive` heroes up; clamps `count` so `≥ minLegalRosterAfterBans` heroes remain `formatSatisfiable`. Pure. **No change** to `counterDraft`/`runPickBan`. |
| `core/draft.ts` | **Add** `repicksAllowed(tier): number` reading `TUNING.captainsSeries.repicksByDifficulty` (thin, keeps the systems layer dumb). |
| `core/types.ts` | **Add** `GymDef.counterPool?: string[]` (pool the leader counter-drafts *its own* five from; defaults to region theme). `GymDef.bestOf` stays `3`. The player's ban-source pool is the recruited roster (from save), not a gym field. |
| `systems/macro-session.ts` | `LiveGymFight` constructor gains `playerRoster: string[]` and `tier: DifficultyTier`; runs the §3.1.1 pre-ban phase into a mutable `this.bannedHeroes: Set<string>` and a mutable `this.enemyTeam`. In `endRound()` (line 220) before the next `startRound()`: (a) `pickEnemyBans(..., count = betweenRoundBanByDifficulty[tier], lastPlayerFive)` → add to `bannedHeroes`; (b) force-repick any now-banned slot in `teamA` from the legal pool; (c) if `enemyReslotsOwnFive`, `counterDraft(format, teamA, enemyTeam, counterPool, seed+round)` → `enemyTeam`, recompute `formationB`. `startRound()` reads `this.enemyTeam`. Track `repicksUsedThisRound` and reject voluntary swaps beyond `repicksAllowed(tier)`. |
| `systems/game.ts` | Pass the recruited roster + `save.difficulty[gymId]?.tier ?? 'normal'` into `LiveGymFight`. Elite: each member is a **best-of-5** with the same asymmetric phase, tighter numbers (more pre-bans, 0 repicks) — a `LiveEliteSeries` modeled on `LiveGymFight`, or `LiveGymFight` parameterized with `bestOf`. `runEliteMatch` advances `eliteFive.defeated` only on a series win. |
| `data/gyms/index.ts` | **Data**: each gym gains a `{ kind: 'level-cap', max: <enemyLevel> }`, a flavor `ban-role`/`cap-attribute` (the leader's *static* type ban), and `counterDraft: 'last-pick'` (re-fights → `'mirror-shape'`). |

### 3.3 The leader's static type bans (`data/gyms/index.ts`, pure data)

The dynamic hero bans (§3.1) come from the engine; the *flavor* bans are authored per
leader as static `DraftRule`s — this is the "ban a type" you asked for:

- Fire leader: `{ kind: 'ban-role', roles: ['support'] }` — win without your peeler.
- Lockdown leader: `{ kind: 'cap-attribute', attribute: 'agi', max: 1 }`.
- Each gym also bans its own signature counter via `ban-hero` if one exists.

### 3.4 Make the wombo the highlight

No engine work: tune `TUNING.captainCallSec`/cadence and lean the shipped
`Game.combatReadout()` (cast bars, shared focus, ult-ready seize) harder in the live
gym overlay so landing the manual RP → Echo Slam is the series peak.

### 3.5 Tuning / no save

```ts
captainsSeries: {
  enemyPreBansByDifficulty:   { normal: 1, nightmare: 2, hell: 3 },
  betweenRoundBanByDifficulty:{ normal: 1, nightmare: 1, hell: 2 },
  repicksByDifficulty:        { normal: 2, nightmare: 1, hell: 0 },
  minLegalRosterAfterBans: 5,
  enemyReslotsOwnFive: true,
  series: { gymBestOf: 3, eliteBestOf: 5 },
  // Elite is strictly harder: +1 pre-ban over the gym tier, repicks forced to 0.
  eliteHarderPreBan: 1
},
```

The series is a **live session** (`LiveGymFight`/`LiveEliteSeries`) — **no new save
field**; bans and the adapted enemy five live only for the session. The player's ban
source is the existing recruited roster in `GameSave`.

### 3.6 Acceptance

- `pickEnemyBans` is deterministic, prefers high-value + last-five heroes, and never
  bans below a `formatSatisfiable` five.
- A **deep** roster wins a Bo3 under escalating bans; a roster with only ~5 legal
  heroes on `hell` (0 repicks) is forced into its worst options and loses.
- Rising difficulty measurably tightens the player's legal pool by the series end
  (more bans, fewer repicks); a series loss leaves the format satisfiable to re-fight.

---

## 4. Pillar C — raids are the chase; the meta is the dial

### 4.1 Raids = the gear chase (mostly content)

- **Aghs Scepter/Shard** stay the headline raid/boss chase on the shipped
  `AghanimDef` scepter/shard payloads + `HeroAugments`; make raid `themedLoot`
  (`data/bosses.ts`) advertise its anchor lane and ensure shards are obtainable from
  the int-lane bosses/raids.
- Top-tier anchors stay drop-gated with pity (`LOOT_OVERHAUL` L3). No code change
  beyond table authoring + legibility (the raid screen names its anchors).

### 4.2 The Trainer track + World Level dial

| File | Change |
|------|--------|
| `core/progression.ts` | **Add** `overflowSplit(level, xp, addXp): { gold: number; trainerXp: number }` — same overflow math as `overflowXpToGold` (line 34) but split by `TUNING.trainer.overflowToTrainerPct`. Keep `overflowXpToGold` (the gold share) as a thin wrapper for callers that only want gold. **Add** `trainerLevelForXp(xp)` over `TUNING.trainer.xpCurve`. |
| `systems/game.ts` | At the overflow site (~7703) call `overflowSplit`, award the gold share via the existing `awardGold('overflow', …)` and bank `trainerXp` into `save.trainerXp`, recomputing `save.trainerLevel`. |
| `data/meta-board.ts` (new) | A `MetaNodeDef[]` registry: `{ id, name, cost, effect }` where `effect` is a **closed access/economy/collection/convenience vocabulary only** — e.g. `worldLevelCap+`, `stashSize+`, `merchantRefresh+`, `catchSpeed+`, `entourageSlot+`, `findShardRate+`, `refightCaptainCall+`, `fastTravel`. **No `StatMods` key is permitted in `effect`** (enforced by §6 test). |
| `core/progression.ts` | **Add** `metaValue(nodes, key)` pure reader so systems compute, e.g., the live `entourageMax` or world-level cap from purchased nodes. |
| `systems/game.ts` | **Update** `worldLevel(...)` call to add `save.worldLevelTier` (the player-chosen §4.3 ascension dial, gated by `trainerLevel`+badges) and respect the `metaValue(nodes,'worldLevelCap')` cap. |

### 4.3 World Level dial

`save.worldLevelTier` (0..N, gated by Trainer Level + badges) adds into the
`worldLevel()` input and scales the boss/raid tier columns + loot grade floor
together — one player-facing "turn up the heat, get better raid loot" knob.

### 4.4 Collection feeds the meta

In the existing progression beats (recruit, echo-perfect, capture/merge, region
explore — all already fire events) award `trainerXp` and/or unlock milestone nodes,
generalizing `rosterLegendNeeded`. Surplus echoes (beyond the 4 to perfect) pay
`trainerXp` instead of dead gold.

### 4.5 Tuning

```ts
trainer: {
  xpCurve: [0, 4000, 9000, 15000, 22000, 30000, 40000, 52000, 66000, 82000, 100000],
  overflowToTrainerPct: 0.6   // 60% of post-cap XP → trainer, 40% stays gold
},
```

---

## 5. Original items — ANCIENTS-native gear

Dota items stay Dota-faithful (`SPEC §5`). Original items fill the loops Dota lacked
and ride the non-Dota `StatMods` hooks the engine already ships (`swapInDamagePct`:79,
`tagBoonAmpPct`:81, `reactionAmpPct`:84, `staminaBonus`:86 — interface at
`core/types.ts:52`).

### 5.1 Files & changes

| File | Change |
|------|--------|
| `core/types.ts` | **Add one field** to `StatMods`: `partyXpAmpPct: number` (the only new stat hook). Auto-aggregated — `Unit.aggregateMods()` (`unit.ts:322`) sums every numeric mod key, so no aggregation code changes. |
| `core/progression.ts` | **Extend** `computeKillReward(bounty, party, lastHitByPlayer, partyXpAmpPct = 0)`: the bench/participant multipliers (line 28) are lerped toward `xpActivePct` by `partyXpAmpPct/100`. |
| `systems/game.ts` | At the `computeKillReward` call site, pass the **active** unit's aggregated `partyXpAmpPct` (read off `activeUnit().stats`). |
| `data/items/native.ts` (new) | The original `ItemDef`s (below), registered into `REG.items` alongside the Dota set. Default `tier: 'special'`/utility and `exclusiveTo` overworld sources so the gym `item-tier-cap` keeps them out of macro. |
| `test/data-lint.test.ts` | Native items validate like any `ItemDef` (recipes/refs resolve, tier set, `appearance`/`attackVisual` refs known). |

### 5.2 Authoring rules

Original names/identity; compose from `passiveMods`/`aura`/`triggers`/`tagBoon`/
`active` + the one new `StatMods` field; zero exotics target (one allowed for a true
chase relic); default overworld/utility tier (out of macro by construction); every
item serves a loop's fun.

### 5.3 The catalogue, by loop (numbers placeholder)

- **Collection/leveling:** `Mentor's Standard` *(aura, `partyXpAmpPct`)* — bench/
  participants earn at active rate; `Soul Ledger` *(on-kill trigger)* — funnel a
  bench hero's XP share to one chosen recruit; `Scholar's Sigil` *(passive)* — convert
  a slice of gold income into XP (inverse of `postCapXpToGold`).
- **Capture/entourage:** `Taming Collar` *(passive)* — raise capture HP threshold +
  shorten bind (reads `TUNING.capture`); `Beastbond Totem` *(aura)* — entourage
  inherits your aura items at full value + an effective star.
- **Swap-combos:** `Echo Battery` *(tagBoon)* — bank the element on swap-out, detonate
  on the next swap-in; `Catalyst Prism` *(passive, `reactionAmpPct`)* — reactions
  spread +1 target + leave a short field; `Tagweaver's Gauntlet` *(passive)* — +1
  tag-chain step + wider window (`tagChain*`).
- **Exploration:** `Skyfeather Anklet` *(passive, `staminaBonus`)* — stamina cap +
  glide speed + cheaper climbs; `Dowser's Compass` *(passive)* — ping nearby chests/
  shards/element sources.
- **Raid chase (Unusual/arcana, raid-gated, macro-banned):** `Concord Relic` — grant
  party resonance without two shared elements; `Twin-Soul Vessel` — hold both Aghs
  Scepter + Shard effect (may spend the one allowed exotic).

---

## 6. Data, save & migration

`SAVE_VERSION` **7 → 8**, additive `migratePhase8Save` (new `core/phase8.ts`, chained
in `migrateSave` after `migratePhase7Save`; `validateSave` accepts 8; `newGameSave`
sets defaults). All new fields optional so v7 saves load clean.

```ts
// GameSave additions (core/types.ts):
trainerLevel?: number;          // default 1
trainerXp?: number;             // default 0
metaNodes?: string[];           // default []
worldLevelTier?: number;        // default 0
collectionMilestones?: string[];// default []
settings: { /* ... */ worldLevel?: boolean }; // default true (Pillar A opt-out)

// StatMods (core/types.ts): + partyXpAmpPct: number
```

```ts
// migratePhase8Save(save): defaults the above; preserves existing settings.
// No macro-series save state — the lock/adapt loop is a live session (§3.5).
```

`data-lint`: every `MetaNodeDef.effect` key is in the access/economy/collection/
convenience vocabulary (never a `StatMods` key); every native `ItemDef` resolves.

---

## 7. Tests / gates

Keep `boundary.test.ts` green (core reads only numeric scale terms it already reads;
the meta/lock/settings flags are systems-layer).

- **`combat-scaling.test.ts`** (extend): `worldLevel`/`worldLevelScale` pure +
  monotonic; a level-30+gear hero vs. a WL-N pack has a non-trivial TTK; with
  `worldLevel` off, `creepCombatScale()` output equals the pre-change baseline
  (reversibility).
- **`draft-format.test.ts`** (extend): `pickEnemyBans` is deterministic, prefers
  high-value + `lastPlayerFive` heroes, and never bans below a `formatSatisfiable`
  five; a deep roster wins a Bo3 under escalating enemy bans while a ~5-legal roster on
  `hell` (0 repicks) loses; `repicksAllowed(tier)` matches tuning; every retuned gym
  is `formatSatisfiable` from the recruited roster.
- **`swap-mechanics.test.ts` / interactions** (extend): a shielded pack is solvable
  by the intended reaction; a ≥2-step tag chain triggers the grade-floor bonus.
- **`economy.test.ts`** (extend): `overflowSplit` conserves total value (gold +
  trainerXp == old gold-equivalent); `trainerLevelForXp` monotonic; v7→v8 round-trips
  with defaulted fields.
- **`progression.test.ts`** (new): the meta board grants **no** key present on the
  `StatMods` surface (the "dial not power" gate); `metaValue` reads purchased nodes;
  `computeKillReward` with `partyXpAmpPct` lifts bench/participant XP toward active.
- **`save-migration.test.ts`** (extend): `migratePhase8Save` defaults all v8 fields;
  `validateSave` accepts 8.

---

## 8. Delivery plan

Each slice ships playable and green, in fun-per-dollar order.

1. **P0 — World Level + texture (§2).** `worldLevel`/`worldLevelScale`, the
   `creepCombatScale`/`spawnCreep` thread-through, the WL-scaled elite/affix/shield
   roll in the camp loop, reward+grade-floor bump, `settings.worldLevel` opt-out.
   Gate: `combat-scaling.test.ts` + reversibility.
2. **P1 — Asymmetric Captains Series (§3).** `pickEnemyBans` + `repicksAllowed` in
   `core/draft.ts`; `LiveGymFight` pre-ban phase, between-round escalating bans, forced
   + budgeted repicks, optional enemy self-reslot; gym format data (level-cap, static
   type bans, counterDraft); `GymDef.counterPool`. Gate: `draft-format.test.ts`
   bans-and-depth + satisfiability.
3. **P2 — Elite Bo5 (§3.1) + macro readability/Captain Call (§3.4) + echo floor (§2.5).**
4. **P3 — Raid chase legibility + Aghs scepter/shard pipeline (§4.1).**
5. **P4 — Trainer track + overflow split + meta board + World Level dial + collection
   milestones (§4.2–4.4).** Includes the `SAVE_VERSION 7→8` migration.
6. **Original items (§5)** ship with the slice whose loop they serve (XP/collection
   with P4, swap/exploration with P0, raid relics with P3); each is a data `ItemDef`
   plus, only for `Mentor's Standard`, the one `StatMods` field. None blocks its slice.
7. **P5 — Balance pass** in `tuning.ts`. Deferrable.

After P0 the overworld is fun; after P1 the autobattler is a puzzle; P3–P4 make raids
the chase and collection the spine.

---

## 9. Open questions / risks

- **Asymmetric bans feel unfair / brick a thin roster.** Intended to be hard, not
  unfair: `pickEnemyBans` clamps to keep a `formatSatisfiable` five, every tier grants
  some repick budget except `hell`, and a loss is never a wall (re-challenge). The
  difficulty knob (pre-bans / escalation / repicks) is the safety valve if it overtunes.
- **World Level → sponge regression.** `texturePerLevel` must dominate the HP term or
  this slides back into damage sponges; the §7 combo-demand test guards the intent.
- **Meta power creep into macro.** Hard rule + §7 test: `MetaNodeDef.effect` is
  access/economy/collection/convenience only, never a `StatMods` key.
- **Ban-target pool sources.** The leader bans from the *player's* recruited roster
  (save); the enemy counter-drafts its *own* five from `GymDef.counterPool` (default
  region theme). Both must always leave a legal five.
- **DECISIONS rows** to add once each slice ships: the World-Level texture-over-HP
  split, the asymmetric Captains Series (enemy-only bans + escalation + difficulty
  repick budget), the overflow split ratio + `7→8` migration, and the "meta grants no
  macro stat" invariant.
