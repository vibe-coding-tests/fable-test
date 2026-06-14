# DUNGEON OVERHAUL — generation, spawns, packs, and the dungeon-crawl loop

How a finite, hand-authored overworld grows a repeatable dungeon-crawler underneath it, using the genre's proven generation and spawn patterns without leaving Ancients' element. Companion to `SPEC.md` (the design target, especially §3 movement/dungeons, §4 World & Progression / bosses / raids, §5 creeps & items, §6 micro combat), `LOOT_OVERHAUL.md` (the loot loop this layer delivers), `COMBAT_OVERHAUL.md` and `AI_OVERHAUL.md` (the live-fight and decision sides), `DECISIONS.md` (calls already made), and `PROGRESS.md` (what shipped).

> **Addendum:** `MARQUEE_AND_ARMORY_ADDENDUM.md` extends this doc with marquee homage bosses as dungeon **guardians** (the **C2/D8** slices) — the same `BossDef`/`DungeonDef.guardian` pattern as Frost Hollow, pointed at a new wave of cross-franchise bosses.

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays the system of record.** It never imports `three`, never touches the DOM, and stays deterministic for a seed. The dungeon generator and the spawn director are pure seeded functions that sit beside `rollLoot` / `rollItemDrops`, the same way the loot roller does: they produce a layout and a spawn plan from a seed, and the renderer and systems layer consume them. Everything here is additive and reversible, the way Resonance, the combat context, and the loot tables were: the existing overworld (regions, camps, echoes, gates) stays the tested system of record, and dungeons are a new content layer reached from it, not a rewrite of it. `boundary.test.ts` stays green.

This doc is research-led. The model borrows specific, named mechanics from the games that solved this problem: **Diablo II**'s prefab-room mazes and density/pack knobs, **Risk of Rain 2**'s credit-budget spawn director, **Diablo III**'s rift density / progress / guardian and its elite-affix vocabulary, **Slay the Spire**'s branching room-type map, **Hades**'s telegraphed door rewards, **Path of Exile**'s opt-in map modifiers, and **Left 4 Dead**'s adaptive-pacing AI Director. Each borrow is named where it lands so the design's provenance is legible.

---

## 0. WHERE WE ARE — measured honestly

Ancients has a Diablo *appetite* for dungeon crawling stated in the SPEC, and a world that is entirely hand-authored open overworld plus abstract arena fights. The two were never reconciled. The SPEC names dungeons four times as intended content — pathing "inside walled dungeons" (§3), mini-bosses "guarding routes, dungeons, and shrines" (§4), "dungeon quests" as a top-tier item source (§5), and the micro layer hosting "wild creep fights and capture, echo duels, recruitment trials, dungeons, and raids" (§6) — and none of it is built. There is no dungeon.

Four findings.

**Finding 1 — the overworld is static, hand-placed camps with no variety or escalation.** A region's encounters are a fixed list of camps, each one creep type at one count at one spot on a respawn timer:

```29:42:src/data/regions/tranquil-vale.ts
  camps: [
    { id: 'tv-kobold-tutorial', creepId: 'kobold', count: 2, pos: { x: 7050, y: 7300 }, radius: 220, respawnSec: 45 },
    { id: 'tv-kobold-1', creepId: 'kobold', count: 4, pos: { x: 4400, y: 5200 }, radius: 260, respawnSec: 60 },
    ...
    { id: 'tv-golem-1', creepId: 'granite-golem', count: 1, pos: { x: 9800, y: 2600 }, radius: 300, respawnSec: 300 }
  ],
```

A camp is the simplest possible spawner. It spawns `count` copies of one creep in a ring and refills on a timer:

```1546:1558:src/systems/game.ts
  private spawnCampCreeps(campId: string): number[] {
    const camp = this.region.camps.find((c) => c.id === campId)!;
    const def = REG.creep(camp.creepId);
    const uids: number[] = [];
    for (let i = 0; i < camp.count; i++) {
      const a = (i / camp.count) * Math.PI * 2;
      const r = camp.radius * 0.55;
      const pos = { x: camp.pos.x + Math.cos(a) * r, y: camp.pos.y + Math.sin(a) * r };
      const u = this.sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...camp.pos } });
      uids.push(u.uid);
    }
    return uids;
  }
```

```2703:2730:src/systems/game.ts
  private updateCamps(): void {
    for (const [id, st] of this.camps) {
      if (st.respawnAt > 0) {
        if (this.sim.time >= st.respawnAt) {
          ...
          st.uids = this.spawnCampCreeps(id);
          st.respawnAt = 0;
        }
        continue;
      }
      ...
      if (!anyAlive && st.uids.length > 0) {
        const camp = this.region.camps.find((c) => c.id === id)!;
        st.uids = [];
        st.respawnAt = this.sim.time + camp.respawnSec;
      }
    }
  }
```

There is no density knob, no pack composition, no escalation, no elites, no variety. You memorize the thirteen camps in Tranquil Vale and they are the same camps forever. That is the opposite of a crawler, where the draw is that the next floor is *new and worse*.

**Finding 2 — there is no instanced, interior, or procedural space anywhere.** A broad search for `dungeon`, `floor`, `instance`, `interior`, `cave`, `procedural` finds none of them as gameplay spaces. What exists is two kinds of place: the **overworld region** (one hand-authored ~12000² square, fully loaded, reached by full-reload gate travel) and the **macro arena** (a flat 4200×3000 plane that gyms, raids, and boss reruns run on as a separate `Sim`). The arena is the only "instance" the engine has, and it is a single empty rectangle for a 5v1, not a space you traverse. The first true procedural, multi-room, walk-through-it layer does not exist yet — building it is the whole job.

**Finding 3 — bosses and raids are decoupled from geography and from exploration.** `BossDef.region` and `RaidDef.location` are labels, not coordinates. You do not walk to a boss; you open Town Services and click Normal / Nightmare / Hell, and a headless 5v1 resolves. The boss loot is a hash of the hero's id (see `LOOT_OVERHAUL.md` §0), and the fight is the same every time. The mechanics that *should* make a boss a destination — phases, add waves, telegraphed zones, enrage — already exist and compose cleanly:

```368:402:src/core/macro.ts
  const tick = (s: Sim) => {
    if (!boss.alive) return;
    const hpPct = 100 * boss.hp / Math.max(1, boss.stats.maxHp);
    for (const m of mechs) {
      if (done.has(m.key)) continue;
      if (m.kind === 'enrage') { ... }
      if (hpPct > m.atHpPct) continue;
      if (m.kind === 'add-wave' && m.wave) {
        for (let i = 0; i < m.wave.count; i++) {
          const ang = (i / m.wave.count) * Math.PI * 2;
          const pos = { x: boss.pos.x + Math.cos(ang) * 150, y: boss.pos.y + Math.sin(ang) * 150 };
          s.spawnSummon(m.wave.summon, boss, pos, ctx);
        }
        record(m);
      } else if (m.kind === 'zone' && m.zone) { spawnZone(m.zone); record(m); }
      ...
    }
  };
```

This is a working boss-mechanic engine that no map ever leads you to. A dungeon is the geography that turns a menu fight into a destination with a journey in front of it.

**Finding 4 — the loot loop has a delivery problem the overworld can't solve.** `LOOT_OVERHAUL.md` designed a real looter: one `ItemDropTable` vocabulary, rarity and quality, bind-to-hero gear, a curated chase per source, the 65-hero roster as the sink. But its richest source of drops, the place that loop is *meant* to live, is "every kill, scaled to what it is" — and the overworld supplies only thirteen static camps per region on slow timers. A looter needs dense, repeatable, escalating combat with a reward gradient. The overworld is too sparse and too static to be that. **The dungeon is the missing delivery vehicle for the loot loop the other doc already designed.**

**The root cause, in one line.** Ancients built a beautiful overworld and an abstract arena, and never built the middle thing every game in this genre is actually *about*: a generated space you descend into, that gets denser and nastier as you go, and pays you in proportion. The loot doc gave us the rewards; this doc gives us the place to earn them.

---

## 1. THE DUNGEON MODEL — settled

Seven pillars. They hold Ancients' rules (closed roster, headless core, compose-from-primitives, data-driven content) while borrowing the genre's proven *structure*.

**1.1 A dungeon is an instanced, seeded, multi-room descent.** You enter from a portal in the overworld, you clear rooms one at a time getting deeper, and you exit (or wipe out) back to the portal with what you earned. The layout is generated from a **seed**, so it is deterministic and testable (the project's first principle) yet different every run. This is the **Diablo II / Diablo III** model: randomized layouts, tilesets, and monster populations from a seed, so the content is repeatable but never memorized. It is the answer to Finding 1: variety and escalation by construction, not by hand-authoring a thousand camps.

**1.2 The run is a graph of typed rooms; the interior is stitched from prefab templates.** Two levels, each borrowed from where it works best.

- **The run graph (Slay the Spire / Hades).** A run is a short branching path of rooms — a dozen or two, not a hundred — each with a **type** (combat, elite, treasure, shrine/event, rest, boss/guardian) and a **telegraphed reward** the player sees before entering. Where a room has multiple exits, the player chooses, so routing toward what your build needs is a real decision, not a dice roll.
- **The room interior (Diablo II).** Each room is realized from hand-authored **room templates** with marked connectors, assembled on a grid so any template's exit can attach to any template's entrance. Diablo II's Act I caves are ninety-five such rooms recombined into endless mazes; a handful of good templates per biome buys the same illusion. The templates are authored playable space; the seed picks and stitches them. This reuses the existing terrain/prop scatter and the kinematic movement the SPEC already anticipated for "walled dungeons" (§3).

**1.3 Spawning is a credit budget, not a fixed count.** Replace the camp's hard-coded `count` with **Risk of Rain 2**'s director: each room has a **credit budget** sized by depth and difficulty, and spends it on weighted **spawn cards** (a creep, its cost, its minimum depth) until the budget is gone or a population cap is hit. Cheap creeps fill early rooms; as depth and budget climb, the director can afford bigger creeps and elite packs, and it retires trivial creeps that are now "too cheap" to be worth a spawn. This is the same generalization the loot doc made for drops: one weighted, budgeted vocabulary that every room speaks, instead of a fixed list. The camp's ring-placement (`spawnCampCreeps`) is the primitive the director calls; the director decides *what* and *how many*.

**1.4 Monsters wear a rarity ladder, and elites wear affixes built from existing primitives.** Layer four rarities on the existing creep + star system, straight from **Diablo III**:

- **normal** — a wild creep at ★1, today's baseline.
- **champion pack** — three or four of the same creep, sharing one or more **affixes**, with scaled health and damage (the existing `starStatMult` / `starDamageMult` already does the scaling).
- **rare / unique** — a single named leader with minions, more affixes, and a guaranteed item slot.
- **boss / guardian** — the room boss, reusing `BossDef` phases and `createRaidMechanicRunner`, carrying the curated anchor loot.

The lever is **affixes**. An affix is a named modifier *composed from primitives the combat engine already has* — Diablo III's whole elite vocabulary maps onto Ancients' status / aura / zone / wall / summon effects with no new systems: Jailer is a root status, Frozen and Molten are ground zones, Vortex is forced movement, Waller is a Fissure-style wall (Earthshaker already makes impassable terrain), Shielding is a temporary invuln buff, Fire Chains is a tether, Fast is a move/attack-speed buff, Health Link shares damage across a pack. Every one already exists as an `EffectNode`. So affixes are *data*, exactly like the SPEC's "exotic" abilities are data, and the number an elite wears scales with the Normal / Nightmare / Hell tier the codebase already has (Diablo III: one affix on Normal up to four on the hardest tier).

**1.5 Rewards are telegraphed, curated, and the dungeon is a first-class loot source.** The drop loop is `LOOT_OVERHAUL.md`'s, delivered here.

- **Telegraphed doors (Hades).** Each room previews its reward at the entrance: a combat room's drop band, an elite room's guaranteed component, a treasure room's chest, the boss room's anchor. A harder variant (Hades's skull) raises both the threat and the reward. The player reads the map and routes.
- **The dungeon is a new `DropSource`.** Add a `'dungeon'` member to the `DropSource` enum `LOOT_OVERHAUL.md` §2 already defines (`'shop' | 'creep' | 'echo' | 'boss' | 'raid' | 'special-battle' | 'gamble'`), and every kill rolls `rollItemDrops` against the dungeon's tables: champions and rares roll the Uncommon→Mythical bands, the guardian rolls the Legendary/Immortal anchor curated to the dungeon's theme, and bound gear flows to the roster. This is where the loot loop finally has the *density* to feel like a looter.
- **The guardian carries the chase (Diablo III rift guardian).** The best loot is on the final boss, so clearing to the end is the point, not a chore you abandon halfway. An optional **progress meter** (Diablo III greater rifts) turns an endless dungeon into a kill-density race that summons the guardian at 100%.

**1.6 Difficulty scales by tier, by depth, and by opt-in modifiers.** Three dials, each from a proven source.

- **Tier** — Normal / Nightmare / Hell, already in the codebase, gates affix count and drop quality exactly as it does for bosses and raids.
- **Depth** — each room deeper raises the spawn budget and the rarity odds (Risk of Rain 2's difficulty coefficient climbing per stage; Diablo II's area level raising drop item-level). Deeper is scarier and pays better.
- **Modifiers (Path of Exile maps).** A dungeon can be entered with opt-in modifiers — more pack size, more champions, +item rarity/quantity, an affix theme — that raise risk and reward together. This is the endgame knob and a gold sink: you craft or buy the modifier, then live with it.

**1.7 The dungeon is where Ancients' own systems converge.** This is the part that keeps it Ancients and not a Diablo reskin. Dungeons are where the **capture / entourage / summoner** fantasy the SPEC calls the "world-map class" (§5) actually pays off: you bring your three-creep entourage and your summons, the champion and rare creeps are the prize captures, and the bind-to-hero loot gears the bench you field. The descent is the place the existing roster, capture, merge, and loot loops all exercise at once. The pacing of the descent borrows **Left 4 Dead**'s AI Director — build-up, peak, relax, with rest rooms as the safe-room beats — so a run breathes instead of being a flat wall of trash.

**What we are explicitly not doing.** We are not replacing the overworld; regions stay the tested home of towns, recruits, gyms, exploration, and travel, and dungeons hang off them. We are not making the core non-deterministic; the layout, the spawn budget, the card draws, and the loot are all seeded, and only the *pacing* reads live combat state (and it changes *when* spawns arrive, never the run's total content, so tests assert on a seed). We are not building a new renderer; rooms reuse terrain, props, the existing micro-combat sim, and movement. And we are not authoring infinite content; a few good templates and a seed, the Diablo II way.

---

## 2. THE KEYSTONE — a seeded generator and a spawn director, both pure core

Today the only "spawner" is the camp, and the only "layout" is the hand-authored region. The keystone is two pure, seeded functions in `src/core/` that produce a dungeon's *shape* and its *population* from a seed, so every room, reward, and pack is reproducible and testable, and the systems/render layers only *play* what the core planned. This is the dungeon equivalent of `LOOT_OVERHAUL.md`'s `rollItemDrops` keystone: build it once, build it carefully, and rooms, packs, elites, rewards, and difficulty all become data plus a call site.

The data the author writes (one dungeon = one `DungeonDef`, plus a pool of room templates and affixes):

```ts
// data-side; the core reads it to generate, the renderer/systems read the result
type RoomType = 'combat' | 'elite' | 'treasure' | 'shrine' | 'rest' | 'boss' | 'entrance';

interface RoomTemplate {
  id: string;
  biome: RegionDef['biome'];
  size: Vec2;                       // bounded play area, in dota units
  connectors: { side: 'n' | 's' | 'e' | 'w'; at: Vec2 }[];  // where doors attach
  spawnAnchors: Vec2[];            // candidate pack positions inside the room
  props?: { treeDensity: number; rockDensity: number };
  allowTypes: RoomType[];          // which room roles this template can host
}

interface SpawnCard {
  creepId: string;
  weight: number;                  // relative draw chance
  cost: number;                    // credits the director spends to place one
  minDepth?: number;               // room depth before this card is eligible
  rarity?: MonsterRarity;          // normal | champion | rare (boss handled separately)
}

interface AffixDef {
  id: string;                      // 'jailer' | 'molten' | 'vortex' | 'frozen' | 'waller' | ...
  name: string;
  apply: EffectNode[];             // composed from existing status/aura/zone/wall/summon primitives
  minTier?: DifficultyTier;        // gated like Diablo's higher-level affixes
  excludes?: string[];             // affixes that cannot co-roll on one pack
}

interface DungeonDef {
  id: string;
  name: string;
  regionId: string;                // which overworld region holds its portal
  biome: RegionDef['biome'];
  templates: string[];             // RoomTemplate ids this dungeon draws from
  roomCount: { min: number; max: number };
  spawnPool: SpawnCard[];          // the monster vocabulary (Diablo's mon1-25)
  affixPool: string[];             // AffixDef ids elites can wear
  guardian: string;                // BossDef id for the final room
  loot: Record<RoomType, ItemDropTable>;  // LOOT_OVERHAUL tables, per room type
  budget: { base: number; perDepth: number };  // RoR2 credit curve
  tiers: DifficultyTier[];
  unlockQuest?: string;
}
```

The seeded result the generator returns (pure data, no sim, no renderer):

```ts
interface DungeonRoom {
  index: number;                   // depth from the entrance
  type: RoomType;
  templateId: string;
  exits: number[];                 // indices of rooms this one connects to
  reward: RoomReward;              // telegraphed at the door (Hades)
  packs: PlannedPack[];            // what the director decided to spawn
}

interface PlannedPack {
  cards: { creepId: string; star: number }[];  // the creeps in this pack
  rarity: MonsterRarity;           // normal | champion | rare
  affixes: string[];               // AffixDef ids, [] for normal
  anchorIndex: number;             // which spawnAnchor in the room template
}

interface DungeonLayout {
  seed: number;
  def: string;                     // DungeonDef id
  tier: DifficultyTier;
  depth: number;                   // total rooms
  rooms: DungeonRoom[];
}
```

And the two pure functions, seeded the same way `rollLoot` is:

```ts
// src/core/dungeon.ts — pure, deterministic, headless, no three / no DOM
function generateDungeon(def: DungeonDef, tier: DifficultyTier, seed: number): DungeonLayout;

// the spawn director: given a room's budget and the pool, decide the packs (RoR2 credits)
function rollRoomSpawns(
  pool: SpawnCard[],
  affixPool: AffixDef[],
  budget: number,
  tier: DifficultyTier,
  depth: number,
  rng: Rng
): PlannedPack[];
```

`generateDungeon` lays out the room graph (Slay the Spire's path-drawing with adjacency rules), picks a template per room from `def.templates`, assigns room types and telegraphed rewards, and calls `rollRoomSpawns` per combat/elite/boss room to plan its packs. `rollRoomSpawns` is the credit director: it earns a budget from `def.budget.base + depth * def.budget.perDepth` scaled by tier, then spends it on weighted cards (drawing affixes for champion/rare packs from the pool, count by tier), refusing cards that are "too cheap" for the current budget once depth is high enough. Both reuse the existing seeded `Rng` (`rng.chance`, `rng.pick`, a small weighted pick), so the whole dungeon is reproducible on a seed and testable headless, the same discipline `rollLoot`, `rollItemDrops`, and `draftTeams` already follow.

Why this first: it is the single dependency under every other slice. With a deterministic layout-plus-population in hand, the live session (§3.8) becomes "walk the planned rooms and spawn the planned packs," the loot becomes a call to `rollItemDrops` with the per-room table, and the difficulty becomes the budget and tier inputs. The generator is invisible on its own — it produces data — and it unlocks the entire feature.

---

## 3. THE SYSTEMS, AS SEAMS

Each subsection names the change, the design (with its research source), and the seam: what existing vocabulary it extends and where it lives, so nothing here is a from-scratch system or a core rewrite.

### 3.1 Layout generation (the shape of a run)

**Design (Diablo II + Slay the Spire + Hades).** A run is a short graph of rooms drawn from the entrance to the guardian. Generate the graph the way Slay the Spire does: lay a small grid of candidate rooms, draw a handful of paths from the entrance upward toward the boss choosing among the nearest next-row rooms, prune unreached nodes, then assign room types under adjacency rules (no two rests in a row; the room before the guardian is a rest; treasure sits at the midpoint; elites do not stack at the entrance). Realize each node's interior from a `RoomTemplate` whose connectors match the doors the graph needs, the Diablo II way: authored rooms with marked entry/exit points, stitched so any exit fits any entrance. A dozen templates per biome recombine into runs that never feel authored.

**The seam.** This is new data and a new pure function, but it reuses the region vocabulary wholesale. `RoomTemplate` is a small `RegionDef` (a bounded area with `props` and anchor points); the prop scatter and biome texturing already exist in `engine/terrain.ts`. The generator is `generateDungeon` in the new `src/core/dungeon.ts`, seeded like every other core roller. The renderer builds a room from a template the same way `GameScene` builds a region today — one room is on screen at a time, so there is no streaming problem to solve (a room is far smaller than a 12000² region).

### 3.2 The spawn director (budget replaces count)

**Design (Risk of Rain 2 + Diablo II).** A room earns a credit budget and spends it on weighted spawn cards. Risk of Rain 2's director is the template: credits scale with the difficulty coefficient (here, depth and tier), each monster has a cost and a weight, the director buys packs until the budget is spent or a population cap is hit, elites cost a multiple of a normal (six to thirty-six times), and once the budget is large the director stops spawning creeps that are "too cheap" to matter. Diablo II contributes the two knobs authors actually tune: monster density (how full the room is) and the min/max count of champion-and-unique packs. The result is the escalation Finding 1 lacks — early rooms are a few cheap creeps, deep rooms are dense packs with elites, all from one budget curve instead of hand-placed counts.

**The seam.** `rollRoomSpawns` (core, pure) plans the packs; the live session (§3.8) places them by calling the existing ring-spawn primitive. `spawnCampCreeps` already spawns N creeps in a ring with `team`, `wild`, and `homePos` — the director generalizes it: instead of one `creepId × count`, it places the planned packs at the template's `spawnAnchors`. The "too cheap" retirement and the budget curve are constants in `tuning.ts`, the one place balance is meant to change, alongside the existing `creepStarBountyMult` and reward multipliers. No new spawn path in the core; the sim's `spawnCreep` is unchanged.

### 3.3 Monster rarity and elite affixes (the threat ladder)

**Design (Diablo III).** Spawned monsters wear a rarity: normal, champion pack, rare/unique, and the room boss. Champions are three or four of one creep sharing affixes; rares are a named leader plus minions with more affixes and a guaranteed drop. The affix is the design's heart, and it is pure composition: Diablo III's elite vocabulary maps one-to-one onto effects the engine already resolves. Jailer roots (status). Frozen and Molten drop ground zones (the same `addZone` raids use). Vortex force-moves (Force Staff / Vortex already pull). Waller raises impassable terrain (Earthshaker's Fissure). Shielding is a timed invuln buff. Fire Chains is a tether between pack members. Fast is a speed buff. Health Link shares damage across the pack. The number of affixes an elite wears scales with tier — one on Normal, up to four on Hell — exactly the Diablo curve, reusing the codebase's existing difficulty tiers.

**The seam.** Affixes are `AffixDef` data whose `apply` is an `EffectNode[]` built from the existing primitives, attached to a unit at spawn through the same `externalMods` / status path the raid enrage already uses to buff the boss:

```373:381:src/core/macro.ts
        if (s.time >= def.enrageSec) {
          // hard ramp: the boss stops playing fair once the timer expires.
          boss.externalMods.damagePct = (boss.externalMods.damagePct ?? 0) + 120;
          boss.externalMods.attackSpeed = (boss.externalMods.attackSpeed ?? 0) + 120;
          boss.externalMods.moveSpeedPct = (boss.externalMods.moveSpeedPct ?? 0) + 30;
          boss.markStatsDirty();
          boss.refresh(s.time);
          record(m);
        }
```

Champion health and damage reuse the creep **star** scaling (`starStatMult` / `starDamageMult` in `tuning.ts`), so a champion is mechanically a starred creep wearing affixes — no new stat system. The renderer reads rarity for the name plate and beam color (the rarity palette `LOOT_OVERHAUL.md` §3.6 already specifies), and the affix set for its telegraph VFX, the same render-only overlay path items use. The core never reads "rarity" as a concept; it reads the stat mods and statuses the affix resolved into, the way it reads any other buff.

### 3.4 Room types and telegraphed rewards (the map as a decision)

**Design (Slay the Spire + Hades).** A run mixes room types so it has texture: **combat** (the default), **elite** (a guaranteed champion/rare, always a component or better), **treasure** (a chest, no fight), **shrine/event** (a choice — a buff, a gamble, a capture-rich pack, a risk-for-reward like Hades's Trial), **rest** (heal the party, restock, swap the fielded roster — the safe-room beat), and **boss/guardian** (the finale). Slay the Spire's rules give the mix its shape: elites and rests do not appear at the very start, a rest always precedes the boss, treasure is guaranteed midway. Hades makes the rewards *visible*: every door shows what is behind it, a skull marks the harder-and-richer variant, and where there are multiple exits the player picks. Routing toward the component your build needs, or toward a rest when you are low, is the core moment-to-moment decision a crawler runs on.

**The seam.** Room types and rewards are assigned by `generateDungeon` (data on each `DungeonRoom`). The reward preview is render-only — the HUD already draws map markers and reward toasts (`DECISIONS.md`, presentation reward slice; `LOOT_OVERHAUL.md` §3.6 rarity colors), so the door symbol is the same marker keyed off `room.reward`. Rest rooms reuse the town/shrine services already built (heal, restock, the fielded-creep swap). Treasure rooms reuse the existing `ChestDef` open flow. Events reuse the trial/discovery vocabulary. No new interaction systems — the room type chooses which existing one fires.

### 3.5 The guardian and boss rooms (the destination)

**Design (Diablo III rift guardian).** The final room is the dungeon's boss, and it carries the run's real reward, so clearing to the end is the goal. Reuse the boss that already exists: a `BossDef` with phases and the raid mechanic runner (add waves, telegraphed zones, signature beat, enrage), now standing at the bottom of a map you traveled to instead of behind a menu button. Mini-bosses become elite-room leaders (the SPEC's "mini-bosses guarding dungeons," §4). The guardian's loot is a curated `ItemDropTable` themed to the dungeon (the agility-carry dungeon anchors Butterfly, the strength dungeon anchors Heart — `LOOT_OVERHAUL.md` §3.3's exact mapping), replacing the id-hash that picks boss loot today:

```7:15:src/data/bosses.ts
function loot(heroId: string): LootTable {
  const idx = Math.abs(heroId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0));
  return {
    guaranteed: [COMPONENTS[idx % COMPONENTS.length]],
    assembledPool: [ANCHORS[idx % ANCHORS.length]],
    dropPct: TUNING.bossAssembledDropPct,
    pity: TUNING.raidBadLuckPity
  };
}
```

**The seam.** Pure reuse. The guardian fight is the existing boss/raid mechanic engine (`createRaidMechanicRunner`, `BossDef.phases`), run inside the dungeon session instead of the standalone arena. The loot is `rollItemDrops` (LOOT_OVERHAUL §2) against the dungeon's guardian table, delivered through the same `deliverLoot` / Armory path bosses use. The only new thing is *where* the fight happens — at the end of a generated descent — which is the whole point.

### 3.6 Difficulty, depth, and modifiers (the dials)

**Design (Diablo II + Risk of Rain 2 + Path of Exile + Diablo III).** Three independent dials. **Tier** (Normal/Nightmare/Hell, already built) sets affix count and drop quality. **Depth** raises the spawn budget and rarity odds room by room — Risk of Rain 2's coefficient climbing per stage, Diablo II's area level raising the item-level of drops — so going deeper is the natural risk/reward gradient. **Modifiers** are the Path of Exile map system: an opt-in entry stipulation (more pack size, more champions, +rarity, +quantity, an affix theme, a single-life run) that raises difficulty and reward together. For the post-cap endgame, an **endless** mode (Diablo III greater rifts) replaces a fixed room count with an infinitely scaling descent and a progress meter that summons the guardian, so the 65-hero bench and the bound gear have somewhere to matter forever.

**The seam.** Tier already threads through `rollLoot`, `bossUnlockedTiers`, and the macro setups; the dungeon passes it to `generateDungeon` and `rollRoomSpawns` the same way. Depth is an input to the budget curve and the rarity odds (constants in `tuning.ts`). Modifiers are a small list applied to the `DungeonDef` at entry (multiply pack size, force an affix, scale the loot table's `qualityOdds`) — data, read by the generator, never by the core. Endless mode is the same generator with `roomCount` unbounded and a progress meter on the session. All of it is constants and inputs, not new code paths.

### 3.7 Adaptive pacing (the run breathes)

**Design (Left 4 Dead).** A room's budget is fixed by depth and tier — that is the *amplitude*, the difficulty, and it is seeded. What the live session controls is *frequency*: when the planned packs arrive. Borrow Left 4 Dead's director loop. Estimate the party's intensity from what the sim already tracks (damage taken, number of nearby enemies). **Build up** spawns the room's packs until intensity crosses a threshold; **sustain peak** holds for a few seconds so the fight reads as a real crest; **peak fade** stops new spawns and lets the current fight resolve; **relax** is the brief lull before the next room or the rest beat. Valve's lesson is the design rule: *adjust pacing, not difficulty* — the run's total content stays exactly what the seed planned, so a run still drains a fixed, testable budget; the director only shapes the rhythm. Rest rooms (§3.4) are the explicit safe-room valleys between peaks.

**The seam.** This is the one place that reads live state, and it lives entirely in the session layer (`src/systems/`), never the core. Intensity is a function over the live sim (`sim.unitsArr`, recent damage events the combat layer already emits); the director gates when the session calls the spawn primitive with the *already-planned* packs. Because the packs and their order are seeded and the director only chooses timing, the headless tests assert on the planned content (`rollRoomSpawns` output) and stay deterministic, while the felt pacing is live. This mirrors how `LiveRaid` runs seeded mechanics on a live clock.

### 3.8 The instance lifecycle (enter, descend, return)

**Design.** This is the genuinely new engineering, and it slots between the two place-kinds the engine already has. A dungeon uses the **overworld micro-combat ruleset** (one active hero, party swap on 1–5, the three-creep entourage, capture) on a **generated bounded map** (a dungeon room), reached and left without a full region reload. The closest existing pattern is the macro session: `LiveRaid` and `LiveGymFight` each run a separate `Sim` and `Game.update()` delegates into them. A `DungeonSession` is the third sibling — but where the raid arena is one empty rectangle for a 5v1, the dungeon session walks the active hero through a sequence of generated rooms, spawning each room's planned packs on entry, unlocking the exits when the room is cleared (Hades's locked doors), and granting the telegraphed reward.

The lifecycle:

1. The player reaches a **dungeon portal** in the overworld (a new region feature, a gate that opens an instance instead of another region) and chooses a tier (and any modifiers).
2. `generateDungeon(def, tier, seed)` plans the run (core, pure).
3. A `DungeonSession` (systems) builds the first room's scene, spawns its planned packs through the director, and `Game.update()` delegates to it, the way it already delegates to gyms and raids.
4. Clearing a room unlocks its exits; the player picks one; the session tears down the room view and builds the next (one room on screen at a time — cheap, no streaming).
5. The guardian room is the finale; clearing it rolls the anchor loot.
6. Exit (or a party wipe) returns to the overworld at the portal, gear in tow. Runs are short and repeatable; a wipe ejects you the way a raid wipe does.

**The seam.** Reuse the established sub-sim delegation. `Game.update()` already early-returns into `updateLiveGym` and the live-raid step when a session is active; the dungeon adds one more branch. The room scene reuses `GameScene`'s region-building path (a room is a tiny region). The micro-combat ruleset is the overworld's, unchanged — same `Sim`, same movement, same party swap, same capture. **Save handling, first cut:** a dungeon run is ephemeral like a raid — not saved mid-run — and only the seed, the clears, and any daily/weekly completion persist (additive `GameSave` fields, an `unlockedDungeons` set and a `dungeonProgress` record beside `raidProgress`). This avoids the full region-save machinery and matches how raids already persist only their progress.

### 3.9 Capture, entourage, and the roster loop (why it stays Ancients)

**Design.** Dungeons are where Ancients' own systems converge, so the layer is the SPEC's vision realized, not a genre import bolted on. The SPEC calls summoners "the world-map class fantasy" and wants the overworld to play like a Diablo II Necromancer — "walk the map with an army" (§5). The dungeon is that map. You descend with your three-creep entourage and your summons fighting beside you; the champion and rare creeps are the prize captures (a starred, affixed creep is a trophy worth the Binding Totem channel); and the bind-to-hero loot from the guardian gears the bench you field next run. The loot loop (`LOOT_OVERHAUL.md`), the capture/merge loop (`SPEC.md` §5), and the roster-as-sink all exercise in one descent. That convergence is the argument for dungeons being core to the game rather than side content.

**The seam.** Pure reuse, because all of it already works in the overworld micro layer, and the dungeon *is* the overworld micro layer on a generated map. Entourage fielding, summon AI, capture, and merge need no change to run inside a `DungeonSession` — they run on the same `Sim`. The only authoring is making sure dungeon spawn pools include catchable creeps so the capture loop has targets, which is data on `DungeonDef.spawnPool`.

---

## 4. ARCHITECTURE IMPACT — what touches what

| Layer | What it gains | Touches the headless resolution core? |
|-------|---------------|----------------------------------------|
| `src/core/` | A new pure module `dungeon.ts`: `generateDungeon` (seeded layout) and `rollRoomSpawns` (the credit director), plus additive types (`DungeonDef`, `RoomTemplate`, `SpawnCard`, `AffixDef`, `DungeonRoom`, `PlannedPack`, `DungeonLayout`, `MonsterRarity`, `RoomType`). All pure, seeded, deterministic, beside `rollLoot` / `rollItemDrops` / `draftTeams`. No effect, damage, status, or resolution change. | No — the generator and director are pure planners; affixes resolve through the existing `EffectNode` / `externalMods` / status paths the sim already runs (§3.3). `boundary.test.ts` stays green. |
| `src/systems/` | `DungeonSession` beside `LiveRaid` / `LiveGymFight`: room build/teardown, the director placing planned packs through the existing ring-spawn primitive, locked-exit progression, the L4D pacing loop (the only live-state read), reward grants via `rollItemDrops` / `deliverLoot`, portal entry/exit, ephemeral run state. `Game.update()` gains one delegation branch. | No (calls existing core helpers and award plumbing). |
| `src/data/` | `DungeonDef`s, `RoomTemplate` pools per biome, `AffixDef` library (effects composed from existing primitives), spawn pools and budget curves, per-room-type loot tables (LOOT_OVERHAUL `ItemDropTable`s), portal placement on regions. | No. |
| `src/engine/` + `src/ui/` | Room rendering through the existing region/terrain/prop path (one room at a time), rarity name-plates + beam colors (the LOOT palette), affix telegraph VFX (render-only overlay), the run-map screen with telegraphed door symbols, the portal/entry UI with tier + modifier selection, the progress meter for endless mode. | No (`boundary.test.ts` stays green). |
| `GameSave` | `unlockedDungeons` set, `dungeonProgress` (clears, best depth, daily/weekly completion) beside `raidProgress`; additive, so old saves load. `SAVE_VERSION` bump with a migration defaulting the new fields empty. | N/A |

**The core touch is two pure planners, not the resolution layer.** `generateDungeon` and `rollRoomSpawns` sit exactly where `rollLoot` and `draftTeams` sit; affixes flow through the same buff/status path the raid enrage already uses. No ability, item active, status, or damage path changes.

**Determinism and the system of record.** The shipped tests (`raids.test.ts`, `economy.test.ts`, `boundary.test.ts`) stay green because nothing they cover changes. The new generator and director are seeded the same way, so a dungeon is reproducible on a seed: the layout, the packs, the affixes, and the loot are all asserted from a fixed seed, and only the pacing reads the live clock (changing timing, never the planned content).

---

## 5. PHASING — shippable slices, each playable and green

Ordered so the seeded keystone lands first, then a playable one-room loop, then the descent, then the threat ladder, then rewards, then difficulty depth, then pacing and polish, then endgame. Build ahead freely; each slice stands on its own.

**D0 — the generator keystone.** Add `src/core/dungeon.ts` with the types, `generateDungeon`, and `rollRoomSpawns`. No session, no render — just the pure planners and their tests. A seed produces a stable layout and a stable population. Invisible, and it unlocks the rest. (Diablo II/RoR2/Spire, as data.)

**D1 — one room, playable.** A `DungeonSession` that enters from a portal, builds a single generated room, spawns the planned packs through the director, lets the active hero clear it on the overworld ruleset, and exits with the kills' loot. The smallest end-to-end loop: portal → fight → reward → out. Proves the instance lifecycle and the budget director against real combat.

**D2 — the descent.** Multi-room runs: the room graph, room-to-room transitions, locked exits that open on clear, the run-map with branching paths, and the guardian room at the bottom reusing the existing boss engine. Now it is a dungeon, not a room. (Spire graph + Hades chambers + Diablo III guardian.)

**D3 — the threat ladder.** Monster rarity (normal/champion/rare) and the affix library composed from existing primitives, with affix count scaling by tier. Elites that wear Jailer, Molten, Vortex, Waller. The fights stop being flat. (Diablo III elites.)

**D4 — rewards, curated and telegraphed.** Per-room-type `ItemDropTable`s wired to `rollItemDrops`, telegraphed door symbols, the curated guardian anchor replacing the id-hash, room types (treasure, elite, shrine/event, rest). The loot loop now lives here. (Hades doors + LOOT_OVERHAUL tables + Spire room mix.)

**D5 — difficulty and depth.** Tier gating of affixes and quality, the depth budget/rarity curve, and Path-of-Exile-style opt-in modifiers at entry. The risk/reward dials. (Diablo II area level + PoE maps.)

**D6 — adaptive pacing and polish.** The Left 4 Dead intensity director shaping spawn timing, rest-room valleys, rarity beams and affix telegraphs, the run-map UI pass. The run learns to breathe. (Left 4 Dead.)

**D7 — endgame.** Endless mode with the progress meter and infinite scaling, daily/weekly seeded dungeons, and the capture/entourage convergence tuned (prize champion captures, summoner army runs). The post-cap home for the roster and the bound gear. (Diablo III greater rifts + RoR2.)

D0 and D1 carry no balance risk and land fast. D2 is the feature's spine. D3 and D4 are where it starts to feel like the genre. D5–D7 are the meaty, balance-sensitive slices and want a playtest pass before their numbers lock.

---

## 6. ACCEPTANCE — each slice is done when (testable, `PROGRESS.md` style)

| Slice | Done when |
|-------|-----------|
| D0 | `generateDungeon` and `rollRoomSpawns` are deterministic on a fixed seed: same seed → same room graph, room types, packs, and affixes. The budget curve honors depth and tier (a deeper/higher-tier room plans a larger, rarer population over a sweep). Adjacency rules hold (no rest-before-entrance, rest precedes guardian, treasure at midpoint). Headless; `boundary.test.ts` green. |
| D1 | A portal enters a single generated room; the director spawns the seed-planned packs through the ring-spawn primitive; clearing the room grants the kills' drops and returns the player to the overworld at the portal. A wipe ejects cleanly. Save round-trips the new dungeon fields. |
| D2 | A multi-room run generates a branching graph, transitions room-to-room with exits that lock until cleared, and ends in a guardian room running the existing boss-mechanic engine. The run-map shows the path. Clearing the guardian rolls its loot. All reproducible on a seed. |
| D3 | A champion pack is N identical creeps sharing an affix at scaled stats; a rare is a named leader with minions and more affixes; affix count scales by tier (1 Normal → up to 4 Hell). Each affix resolves through the existing status/zone/wall/buff path (Jailer roots, Waller blocks, Molten zones), asserted headless. The core never reads "rarity"; `boundary.test.ts` green. |
| D4 | Each room type rolls its `ItemDropTable` through `rollItemDrops`; the guardian's anchor is curated to the dungeon theme (the agility dungeon drops Butterfly, not a hash); door symbols preview rewards before entry; treasure/elite/rest/event rooms each fire their reused interaction. On fixed seeds. |
| D5 | Nightmare/Hell raise affix count and drop quality; a deeper room plans a larger budget and better rarity odds; an opt-in modifier (e.g. +pack size, forced affix, +rarity) raises both difficulty and the loot table's odds. Tiers gate as bosses' do; on fixed seeds. |
| D6 | The pacing director shapes *when* the seed-planned packs spawn (build-up/peak/relax) without changing the run's total planned content (a determinism test asserts the planned packs are unchanged); rest rooms restore the party; rarity beams and affix telegraphs render. None of it changes a roll. |
| D7 | Endless mode generates unbounded depth with a progress meter that summons the guardian; a daily/weekly seed is shared and reproducible; a champion/rare creep is capturable inside a dungeon and a fielded entourage + summons fight through a run. Post-cap roster and bound gear have a repeatable home. |

Cross-cutting gates (every slice): `npm test` and `npm run build` green; `boundary.test.ts` green; the core stays headless and deterministic (generation, spawns, and loot are seeded; only pacing reads live state, and it changes timing not content); `rollLoot` / `rollItemDrops` stay the system of record for drops; no exotic slots spent on affixes (they compose from existing primitives); the LOOT `exclusiveTo` reservations still hold (the new `'dungeon'` `DropSource` rolls its own tables, and reserved raid/special-battle items stay reserved).

---

## 7. OPEN DECISIONS — settle these while building

1. **Generation grain.** Full room-template stitching (Diablo II, richest, most authoring) versus simpler bounded arenas connected by doorways (faster to ship, less varied interiors). Recommended: start with bounded arenas in D1–D2, add template stitching in a later pass once the loop is proven. Decide in D2.
2. **Run length and structure.** Slay-the-Spire branching graph (route choice, more agency) versus Hades linear chambers with a choice of next door (simpler, still telegraphed). Recommended: linear-with-door-choice first, branching graph if route planning proves fun. Decide in D2.
3. **Death penalty.** Hades-style clean eject (friendly, repeatable) versus a stake (lose unbanked drops, a Diablo II corpse run). Recommended: clean eject for the base game, an opt-in high-stakes modifier (§3.6) for players who want it. Decide in D5.
4. **How affixes attach to packs.** All pack members share affixes (Diablo III champions) versus a leader-only model (Diablo III rares). Recommended: champions share, rares are leader-plus-minions, both supported by `PlannedPack`. Confirm in D3.
5. **Affix starting set.** Recommended first library, all composing from existing primitives: Jailer (root), Molten (trailing zone), Frozen (telegraphed zone), Vortex (force-move), Waller (Fissure wall), Shielding (timed invuln), Fast (speed buff), Health Link (shared damage). More can join as pure data later. Decide the cut in D3.
6. **Where portals live and how dungeons unlock.** A fixed portal per region (predictable) versus discoverable/roaming portals (exploration tie-in) versus quest-gated (SPEC's "dungeon quests"). Recommended: one fixed portal per region from Icewrack onward, plus quest-gated special dungeons for top-tier item firsts. Decide in D4 against the LOOT chase.
7. **Save granularity.** Ephemeral runs (recommended, matches raids, simplest) versus resumable mid-run saves (friendlier, much heavier). Hold resumable until endless mode (D7) proves it is wanted.
8. **Pacing determinism boundary.** Confirm the rule that the director changes spawn *timing* only and never the seeded content, so tests assert on planned packs. If a future mode wants live-reactive *content* (L4D's true adaptivity), gate it behind a flag and log it in `DECISIONS.md`, the way Resonance-in-macro is gated.
9. **Endless scaling ceiling.** Whether endless depth scales forever (Diablo III greater rifts) or caps at a tier, and how the progress meter weights elites versus trash (Diablo III progress orbs reward killing elites). Tune in D7 against the post-cap economy.

---

## 8. PRINCIPLES (consistent with `SPEC.md` §10 and the companion overhaul docs)

- **Generate the place, author the pieces.** A dungeon's layout, population, and rewards come from a seed; its room templates, creeps, affixes, and loot tables are hand-authored data. Diablo II's ninety-five rooms, recombined, not a thousand placed ones.
- **One budget, one vocabulary.** Rooms spend credits on spawn cards the way the loot doc spends rolls on drop slots and the gambit grammar speaks one closed grammar. Density and packs are knobs, not hand-counts.
- **Compose threats from primitives.** Elite affixes are statuses, zones, walls, and buffs the engine already resolves — no new combat systems, the same rule that builds abilities and raid mechanics from `EffectNode`s.
- **Telegraph the reward; let the player route.** Every door shows what is behind it (Hades), and the map is a decision (Slay the Spire). The chase is legible, not a slot machine.
- **The guardian carries the chase.** The best loot is at the bottom, so the descent has a point. The dungeon is the loot loop's delivery vehicle, not a parallel reward track.
- **Adjust pacing, not amplitude.** The seed fixes a run's difficulty and content; the director only shapes the rhythm (Left 4 Dead), so runs breathe and tests stay deterministic.
- **The dungeon is where Ancients converges.** Loot, capture, entourage, summoners, and the roster-as-sink all exercise in one descent. It is the SPEC's stated vision built, not a Diablo skin.
- **Additive and reversible.** The overworld, regions, camps, gyms, raids, and the loot tables stay the tested systems of record. Dungeons hang off them; the base game is never worse for any of this existing.
- **Keep the core headless and deterministic.** The only core additions are two pure seeded planners beside the ones already there. `boundary.test.ts` stays green.
- **Ship slices.** D0 is invisible but unblocks everything; D1 is a single playable room worth shipping on its own. Build ahead, keep it green, demo often.
