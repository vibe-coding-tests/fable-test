# AUTOBATTLER OVERHAUL — classify the spell, draft the team, place the board, and play it

How the macro 5v5 stops being "send your walking party at a fixed enemy lineup and watch" and becomes the **classify → draft → deploy → coach** loop the gyms always wanted: every spell is tagged with what *kind* of spell it is so the brain fires it on the right beat (hold Ravage for the cluster, protect the channeler, rake a skillshot down a row); you build a fresh team for each leader; you *place* it on a board where formation and spacing matter; and both sides run a brain that holds the line, flanks the backline, and saves the ally being dived. Companion to `SPEC.md` (§4 the layer split, §7 gambits + draft, §10 principles), `AI_OVERHAUL.md` (the layered brain, team-mind, threat, boss FSM), `GAMBIT_AI_OVERHAUL.md` (item archetypes, role playbooks, the combo planner), `COMBAT_OVERHAUL.md` (Captain's Call, the live fight), and `SWAP_COMBAT_OVERHAUL.md` (the overworld tag-in — explicitly *out of scope* for the macro layer).

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays the system of record** — it never imports `three`, never touches the DOM, replays identically for a seed. Everything proposed here is **additive, data-driven, and reversible**, built on primitives that already exist: the macro sim that auto-resolves a 5v5 (`core/macro.ts`), the shared utility/threat/profile brain (`AI_OVERHAUL.md`, shipped), the combo planner (`GAMBIT_AI_OVERHAUL.md`, shipping), and the ability/item intent derivation those already use. It **respects the layer split** — classification, the board, the draft, and the composition rules live in the **macro layer (gyms, the Elite Five, auto-resolve)** and lift raids for free through the shared brain; the overworld Diablo loop and Resonance are untouched. It **spends zero exotic slots**: archetypes are *derived* from effects, and positioning matters through real combat geometry (reach, AoE footprints, focus order, peel), not invented chess-auto-battler stat synergies. `boundary.test.ts` stays green; gyms/Elite Five stay pure-Dota macro.

---

## 0. WHERE WE ARE — the macro 5v5, measured honestly

The auto-battler resolves a real fight on the real sim. Read the shipped code.

**The match.** A gym is a best-of-3. `LiveGymFight` spins a fresh macro sim per round, hands each side a `CaptainCallController`, and steps to a result; the same class drives the headless auto-resolve and the rendered live fight (`systems/macro-session.ts`). The player's team is, simply, their walking party:

```2380:2385:src/systems/game.ts
  gymPlayerTeam(): GymMatchHero[] {
    return this.party.slice(0, 5).map((r) => ({
      heroId: r.heroId,
      level: r.unit ? r.unit.level : r.level,
      items: r.items.map((i) => i?.id).filter((id): id is string => !!id),
```

**The enemy.** A `GymDef` is a fixed lineup plus flavor and a Captain's-Call handicap — no composition rule, no counter-draft, no awareness of what the player brought:

```1498:1510:src/core/types.ts
export interface GymDef {
  id: string;
  name: string;
  badgeId: string;
  regionId: string;
  leader: string;
  leaderTitle: string;         // homage persona title (§3.13), original
  theme: string;
  bestOf: 3;
  enemyTeam: MacroHeroSetup[];
  enemyBonusCaptainCalls?: number;
  dialogue: string[];          // in-character leader lines (§3.13), original
}
```

**The "formation."** Placement is an implicit role heuristic, not a player decision. Both teams spawn at a fixed X-inset, spread evenly along Y, and each unit is nudged forward or back by its role:

```224:229:src/core/macro.ts
function formationDepth(roles: string[], attackRange: number): number {
  const depth = TUNING.macroFormationDepth;
  if (roles.includes('initiator') || roles.includes('durable')) return depth;
  if (roles.includes('support') || attackRange >= 550) return -depth;
  return 0;
}
```

**The brain.** This part is *good* and recently rebuilt. `AI_OVERHAUL.md` shipped the layered brain (player orders → gambits → team-mind focus/engage → utility scorer → boss FSM), `threat.ts`, and combat profiles; `GAMBIT_AI_OVERHAUL.md` is landing item archetypes, role playbooks, and a combo planner. It already *derives intent* from a spell's effects — `core/combo-planner.ts` computes an `AbilityComboIntent` (`offensive / hardControl / softControl / amplify / initiation / aoe`), and the boss already holds an area beat until the party clusters (`partyClusterCount`, `clusterTarget` in `core/boss-brain.ts`).

Five honest findings.

**Finding 1 — there is no team-building decision.** Every gym is fought by the same five heroes you happen to be walking around with. The "draft savant" gym leader (`Warden Blueheart`, "I won this fight in the pick phase") fights an opponent who never drafted. `SPEC.md §4`'s pitch — "trainers and gyms are the macro layer (drafting, gambits, 5v5 wombo combos)" — is half-delivered: the gambits and wombo are real, the *drafting* is not. The Elite Five is specced for draft mode with bans (`SPEC.md §7`); the eight gyms are not.

**Finding 2 — positioning is decided for you, and never varies.** `formationDepth` is a fine default, but it's the *only* formation. The player can't put the squishy nuker behind the tank on purpose, bait a Tidehunter ult by spreading, stack for a Mekansm, or pick a flank. It's deterministic-by-role, so the board reads identical every fight.

**Finding 3 — the enemy never adapts.** A fixed lineup means a solved gym is solved forever. No counter-pick, no ban, no composition pressure. "Keep you on your toes" is exactly what the fixed list cannot do.

**Finding 4 — the brain is smart per-unit but positionally naive.** The scorer kites, focuses, peels, and (soon) sequences combos, but has no concept of a *formation to hold* or a *line to break*. Nobody "holds the backline," "flanks the support," or "collapses the front before diving." Once the board is a thing the player authored, the AI has to *read* it.

**Finding 5 — spells are derived as blunt flags, not as the *kind* of spell they are.** The intent derivation knows a spell is "aoe" or "hardControl," but it doesn't distinguish **Ravage (a teamfight-defining hard-CC ult you hold for the cluster)** from **a single-target hex you spend on the focus**, or know that **a channel roots the caster and must be protected/interrupted**, or that **a line nuke wants to be angled down a row**. The boss got bespoke cluster-holding logic; gym units didn't. The user's instinct is right: the spell needs a *classification* the whole brain can plan with, the same way items got `ItemArchetype` in `GAMBIT_AI_OVERHAUL.md`.

**The root cause, in one line.** The macro fight was built as "auto-resolve the party you have against the list we wrote, firing spells by blunt flags," so the four decisions that make a teamfight game deep — *what each spell is for, who you bring, where you put them, how they hold* — were never surfaced. This doc surfaces all four.

---

## 1. THE DESIGN GOALS — settled

1. **Every spell knows what kind of spell it is.** A derived **`AbilityArchetype`** (parallel to `ItemArchetype`) tags each spell — teamfight-ult, cluster-nuke, channel, skillshot-line, single-lockdown, zone-field, team-buff/save, self-steroid — so the brain fires it on the right beat and units position with awareness of it.
2. **Each battle is a fresh team-building decision.** Before a gym (and each Elite Five round), you **draft** a five from your recruited roster, set their items and gambits, and commit. The walking party is the *default* draft, not the only one.
3. **Positioning is a player decision that pays off through real combat.** You **place** your five on a board. Where they stand changes who the enemy reaches first, who eats the AoE, who can peel for whom, and which flank opens. No invented adjacency stat synergies — the board matters because the *fight* is geometric, and because spell archetypes have placement consequences.
4. **Every gym pressures your composition differently.** Each leader carries a **draft format** — bans, requirements, caps, or a counter-draft — so the team that beat the last gym is not automatically the team that beats this one.
5. **The board and the archetypes are honored on both sides, by one brain.** The layered brain gains a **formation layer** (hold an anchor, protect the backline, break the line, flank the soft target) and **archetype-aware casting** (hold the teamfight ult for the cluster, protect/interrupt channels, angle skillshots). Both teams field it, fixed and symmetric.
6. **Everything degrades gracefully and stays Dota-honest.** No draft → the walking party; no formation → `formationDepth`; no format → an open draft; archetypes are derived so old data keeps working. The macro layer never touches Resonance or the overworld tag-in. `boundary.test.ts` stays green.

---

## 2. ABILITY ARCHETYPES — classify the spell so the brain fires it right

This is the foundation the user asked for, and it is the same move `GAMBIT_AI_OVERHAUL.md §2` made for items: add a **derived `AbilityArchetype`** computed once from a spell's effects, targeting, and channel shape — the noun the scorer, the planner, the board, and the formation AI all speak. It **subsumes and sharpens** today's `AbilityComboIntent` flags rather than replacing them, and it is pure and cached by ability id, exactly like `itemArchetypes` and `combatProfile`.

```ts
// core/ability-archetype.ts (new) — pure, deterministic, cached by AbilityDef.id
export type AbilityArchetype =
  | 'teamfight-ult'    // big-radius hard CC / arena ult: Ravage, Black Hole, RP, Chrono, Echo Slam
  | 'cluster-nuke'     // AoE damage whose value scales with enemies caught: Macropyre, Pulse Nova
  | 'channel'          // roots the caster; interruptible; pays over time: Black Hole, Death Ward, Freezing Field
  | 'skillshot-line'   // directional line/cone: Sonic Wave, Light Strike Array, Torrent line
  | 'single-lockdown'  // hard CC on one target: Hex, Doom, Duel, Astral
  | 'zone-field'       // a standing zone/aura that shapes spacing: Macropyre field, Ice Path, auras
  | 'team-buff'        // ally heal/shield/statmod/purge: Mekansm-like, Warcry, Cold Embrace
  | 'self-steroid';    // self statmod: carry tempo buttons
export function abilityArchetypes(def: AbilityDef): Set<AbilityArchetype>;
```

A spell can carry more than one tag (Tidehunter's Ravage is `teamfight-ult` + `cluster-nuke`; Sand King's Epicenter is `cluster-nuke` + `channel`). The brain reads the *set*, not a single label.

### 2.1 How each archetype is derived (no new hero data)

All of these read fields that already exist on `AbilityDef` (`targeting`, `affects`, `ult`, `channel`, `effects`, `aura`) and the existing `HARD_DISABLES`/`SOFT_DISABLES` sets in `core/combo-planner.ts`:

| Archetype | Derived when | Brain consequence |
|-----------|--------------|-------------------|
| **teamfight-ult** | `ult` + AoE (`ground-aoe` or `*-in-radius`) + a hard disable or big radius | hold for the cluster on commit; the wombo opener; the single highest-value beat to time |
| **cluster-nuke** | AoE `damage` whose target is `enemies-in-radius` | hold until ≥N enemies caught; the caster wants the *center* (§3.2); value scales with the count it already computes |
| **channel** | `def.channel` present (esp. `selfRootDuringCast`) | the caster picks a safe spot and is *protected*; the enemy *interrupts* it (the `enemy-cast-seen: channel` read already exists, `core/types.ts`) |
| **skillshot-line** | point/line targeting with a `beam`/`wall`/line vfx archetype | angle to one side to rake a row (the Auto Chess directional rule); lead a moving target |
| **single-lockdown** | hard disable, single unit target | spend on the focus whose death collapses the enemy formation, not the nearest body |
| **zone-field** | a `zone` effect node or an `aura` | dropped/placed to shape spacing; allies prefer to stand inside friendly fields (planner field-awareness, `GAMBIT_AI_OVERHAUL.md §5`) |
| **team-buff** | `affects: ally` heal/statmod/shield/`purge` over `allies-in-radius` | timed to the engage or the dived ally |
| **self-steroid** | self-target `statmod` | pressed on contact; carry tempo |

### 2.2 What Auto Chess teaches, mapped to our archetypes

Drodo's Auto Chess (and its descendants) is the proof that **archetype + placement is the whole skill expression** of an auto-resolved fight. Units fight on an 8×8 grid, deploy only on their own half, and move to attack the closest enemy. The community-settled positioning rules map cleanly onto our archetypes (and into §3/§6):

- **High-HP units in the front row to absorb the engage** → our `self-steroid`/durable bodies front; squishy `cluster-nuke`/`channel` casters back.
- **AoE casters near the middle to catch the most units** → our `cluster-nuke`/`teamfight-ult` casters want the *central* board column.
- **Directional casters to one side to maximize the line** → our `skillshot-line` archetype wants an edge column and a clean angle.
- **Assassins leap the frontline to the backline** → our `flank` intent (§6.1): a diver routes *around* the front to the exposed `cluster-nuke`/`team-buff` caster, the play the brain currently never makes.
- **Pack bodyguards with damage dealers; hide fragile units in corners** → our protect-assignment (§6.1) and the board's back/corner cells.

We borrow the *grammar*, not the synergies: no race/class stat bonuses (those would break `SPEC.md §10` feel-fidelity and pure-Dota macro). Positioning is leverage on geometry; the archetype tells the brain how each unit *wants* to use that geometry.

### 2.3 Where the classification is consumed

- **The scorer (`core/utility.ts`).** `teamfight-ult` and `cluster-nuke` gain the hold-for-cluster discipline the boss already has, generalized to every unit. `channel` gains the protect/interrupt reads. `skillshot-line` gains an angle-seeking step (§6.2). This lifts *every* fight — gyms, raids, auto-resolve — the moment it ships, with no board or draft needed.
- **The board editor (§3).** Placement hints read the archetype: an AoE caster suggests the center column, a skillshot to a side, a channeler to a protected back cell.
- **The formation AI (§6).** The team-mind protects channelers, holds teamfight ults for the authored cluster, and flanks the enemy's exposed casters.

---

## 3. THE BOARD — deployment as a decision

A board is a **discrete deployment grid mapped deterministically onto a team's half of the existing arena.** It authors two things the sim already consumes: each unit's **spawn position/facing** and its **home anchor** (`homePos`, already passed to every macro spawn in `core/macro.ts`). The sim stays continuous; the board just decides where the five start and where they want to be.

### 3.1 The grid

The arena is `4200 × 3000` (`TUNING.arenaWidth/arenaHeight`), each team inset `macroTeamXInset: 950`. Carve each team a **deployment zone** (its back edge to the arena third-line, the "deploy on your own half" rule from Auto Chess) and lay a grid over it. Proposed: **3 columns (back / mid / front) × 5 rows**, place up to five. A cell maps to a world point by a pure function, so the board is fully deterministic and headless-testable.

```ts
// core/board.ts (new) — pure, deterministic, no DOM/three
export interface BoardSlot { col: 0 | 1 | 2; row: number; } // col 0=back, 2=front; row 0..4
export interface Formation { placements: Record<string, BoardSlot>; } // heroId → slot
export function slotToWorld(team: 0 | 1, slot: BoardSlot): { pos: Vec2; facing: number };
```

`setupMacroSim` gains a branch: **if a `Formation` is supplied, use `slotToWorld` for spawn + `homePos`; otherwise fall back to the current `formationDepth` heuristic** (Goal 6). The fallback is literally today's code, so an undrafted/unplaced team is unchanged.

### 3.2 Why position matters — geometry + archetype, never synergy

The board pays off because the combat is geometric and the archetypes (§2) have placement consequences. No new stat math:

- **Front-to-back reach.** Melee paths to the nearest body. A front `self-steroid` tank soaks the engage; a back `cluster-nuke` caster buys seconds. Put the squishy carry front and it dies to the blink-in — your choice.
- **AoE footprint + caster centering.** A `cluster-nuke`/`teamfight-ult` caster placed center catches more; a clustered column all eats one Echo Slam, while a spread trades that for slower focus and weaker auras.
- **Skillshot angle.** A `skillshot-line` caster on an edge column rakes a full row; buried in the middle it clips one body.
- **Peel range.** A `team-buff`/save support beside the carry can Glimmer/Force it out in time; placed across the board, it can't.
- **Channel safety.** A `channel` caster wants a protected back/corner cell — exposed, it gets interrupted before it pays out.
- **Aura/field overlap.** A Mekansm/Pipe/Shiva's radius covers whoever you placed inside it.

### 3.3 Formation doctrines — optional, emergent, never a stat stick

Offer named **doctrines** as presets the player stamps and tweaks: **Phalanx** (deep front, casters stacked behind), **Spread** (anti-AoE), **Flank** (a diver wide, the core central), **Turtle** (everyone hugging the back edge around a save). A doctrine is a `Formation` preset plus a one-line description; it grants **no stats**. It exists so a new player has sane buttons and a veteran has a fast start. This is the deliberate Dota-honest line: positioning is leverage on geometry, not a synergy bonus.

### 3.4 The board in the sim

Spawn + facing come from `slotToWorld`; `homePos` is the cell's world point so the controller's hold/return respects the formation; **nothing else** — no per-cell buffs, no adjacency. Determinism is trivially preserved (a pure cell→point map) and `boundary.test.ts` is untouched: this is all systems/data feeding existing core spawn args.

---

## 4. THE DRAFT — a fresh team per battle

Replace the *source* of a gym/Elite team with a **draft step**: a pre-battle screen where you assemble a five from your **recruited** roster (not just the walking party), choose items and gambits, place them on the board (§3), and commit. The result is the same `GymMatchHero[]` / `MacroHeroSetup[]` the macro sim already consumes — the draft is an *authoring layer in front of an unchanged sim*.

### 4.1 The data shape

```ts
// core/types.ts — additive
export interface DraftTeam {
  heroes: MacroHeroSetup[];   // up to 5 (heroId, level, items, gambits)
  formation: Formation;       // §3 placement
}
// GameSave gains:  gymDrafts?: Record<string, DraftTeam>;  // saved per gym, defaulting migration
```

The draft draws from `save.recruited`, gated by the gym's **format** (§5) and existing badge/level ceilings (`SPEC.md §6`). Committing writes the `DraftTeam` and feeds it to `startLiveGym` / `runGymMatch` in place of `gymPlayerTeam()`.

### 4.2 Two draft modes

- **Gym draft (build).** Assemble freely within the gym's format; the lineup is fixed (or counter-drafts, §5.4). The eight gyms.
- **Elite Five draft (pick/ban).** The mode `SPEC.md §7` names: alternating picks and bans from your recruited roster vs. the leader's themed pool. A small deterministic state machine over two pools.

### 4.3 Why a draft and not just "bring your party"

The draft is the macro layer's core verb, the analog of the overworld's tag-in. It turns the roster you grew in the Diablo loop into a toolbox you *select from* per matchup — the entire reason to recruit 60 heroes instead of maining five. It makes the leaders' personas true (the "drafting mind" out-drafts you if you bring the wrong shape), and it sets up §5: composition rules are only interesting if you can compose.

---

## 5. COMPOSITION FORMATS — keep you on your toes

Each gym carries a **draft format**: constraints on the team you may bring, optionally plus a counter-draft. This is "different gyms have different composition preferences," expressed as data the draft screen validates and the AI reads.

### 5.1 The constraint vocabulary (closed, data-driven)

```ts
// core/types.ts — additive; GymDef gains `format?: DraftFormat`
export type DraftRule =
  | { kind: 'ban-hero'; heroIds: string[] }
  | { kind: 'ban-role'; roles: string[] }
  | { kind: 'require-role'; role: string; min: number }
  | { kind: 'cap-role'; role: string; max: number }
  | { kind: 'cap-attribute'; attribute: Attribute; max: number }
  | { kind: 'unique-attribute' }
  | { kind: 'level-cap'; max: number }
  | { kind: 'item-tier-cap'; max: number }
  | { kind: 'point-budget'; total: number; costByRole?: Record<string, number> };
export interface DraftFormat { rules: DraftRule[]; counterDraft?: 'none' | 'last-pick' | 'mirror-shape'; }
```

Rules are **validated client-side** (you can't commit an illegal five) and **legible to the AI** so the enemy drafts into the same format. They reuse role/attribute tags already on every `HeroDef` — no new hero data.

### 5.2 Formats themed to the eight leaders

| Gym | Persona | Format pressure (example) |
|-----|---------|---------------------------|
| **Lunar** (burst highlight) | "burst them down" | `cap-role` durable ≤1 — no turtling; race the nukes |
| **Frost** (the drafting mind) | "won it in the pick phase" | `last-pick` counter-draft — she answers your four |
| **Burrow** (sand-step roamer) | "position four wins" | `require-role` support ≥2 — value the map game |
| **Tide** (teamfight tide) | "one clean initiation" | `ban-role` escape — no slippery cores; stand and fight |
| **Rot** (attrition) | "I win last" | `item-tier-cap` — no luxury sustain; grind it out |
| **Arcane** (combo virtuoso) | "ten spells, one window" | `cap-attribute` strength ≤1 — bring casters, trade spells |
| **Wild** (micro maestro) | "count my units" | `point-budget` — summoners cheap, hard carry expensive |
| **Titan** (highland engage) | "I commit first" | `require-role` initiator ≥1, `cap-role` carry ≤2 |

First-draft shapes to tune at content time; the point is no single "best five" beats every gym.

### 5.3 Difficulty as format, not stats

This is a *different* lever than the raid/elite `aiDepth` (`AI_OVERHAUL.md §4`). Formats pressure *composition*; depth sharpens *play*. Gyms stay on the fixed symmetric brain, getting their teeth from the format and counter-draft. A Nightmare/Hell gym rerun can *tighten the format* (more bans, a stricter budget) rather than inflate HP.

### 5.4 Counter-draft — the enemy answers

- **`none`** — fixed lineup (today's behavior; most gyms).
- **`last-pick`** — after you commit, the leader swaps one or two slots to a deterministic counter to your shape (anti-carry vs your double-carry, a silence vs your combo team), picked by a pure function over your draft + `sim.rng.fork()`.
- **`mirror-shape`** — the leader drafts to a fixed archetype, filling from a pool, so the five vary by seed.

Counter-draft makes a gym un-solvable by rote and reuses the draft engine (the AI runs the same legal-team validator and a role-priority heuristic), no special-case code.

---

## 6. THE AI — a brain that reads the board and the archetypes

The brain is mostly built (`AI_OVERHAUL.md` shipped; `GAMBIT_AI_OVERHAUL.md` shipping). This adds the **formation layer** (Finding 4) and the **archetype-aware casting** (Finding 5) the user flagged — movement, smart casting, disables, AoE, channel awareness. All weights, considerations, and pure reads over sim state, in the closed-vocabulary discipline from `COMBAT_OVERHAUL.md §3.2`: no per-hero scripts.

### 6.1 Formation awareness — a new team-mind read

`computeTeamMind` (`core/utility.ts`) already picks a shared focus and engage state. Add a **formation posture** from the board:

- **Anchors and lines.** Each unit knows its `homePos` (its cell). The team-mind derives a **front line**, a **backline** (casters/carries to protect), and the enemy's same, from positions it already has.
- **Hold vs commit.** Pre-engage, units hold their anchors (the formation you authored fights). On commit, the front collapses and the backline follows at range — the wombo, framed by the board.
- **Protect the backline.** A `protect-assignment` (reuse the save-holder assignment, `GAMBIT_AI_OVERHAUL.md §5`) ties a peeler to the most-exposed friendly backliner, prioritizing a **channeling** ally (§6.3).
- **Flank the soft target (the assassin read).** Initiators/divers get a **flank intent**: a route to the enemy backline (a `cluster-nuke`/`team-buff` caster, §2) that minimizes time in the enemy front's reach — a cheap geometric read, not a pathfinder search. The "go around the tank and kill the support" play the brain never makes today.

```ts
// TeamMind gains (core/sim.ts):
//   frontLineUids / backlineUids: number[];
//   protectAssignments: Record<number, number>;  // peelerUid → protectedUid
//   flankTargetUid: number | null;
```

### 6.2 Movement with purpose

Three position-value considerations so movement reads as intent:

- **Anchor gravity.** Out of combat or between commits, value returning toward `homePos` so the formation re-forms instead of smearing.
- **Cast-angle seeking.** Before a `cluster-nuke`/`skillshot-line`, value a step that lines up the most targets in the footprint (it already counts the catch; let it *move* to improve the count and the line angle).
- **Spacing discipline.** Against a stackable enemy AoE threat (a Tide with Blink), value the authored spread; a Spread doctrine is honored instead of clumping back up.

### 6.3 Archetype-aware casting — the heart of "fire spells better"

This is the §2 payoff, generalizing the boss's cluster-holding to every unit:

- **Teamfight ults wait for the cluster.** A `teamfight-ult` (Ravage, Black Hole, RP) is held until enough enemies are in radius *or* the engage commits — never blown on one body. Reuses the `partyClusterCount` logic already in `boss-brain.ts`, lifted into the shared scorer.
- **Cluster-nukes hold for the count, from the center.** A `cluster-nuke` won't fire through one target when two more are a step away; the caster prefers the central board column (§3.2) so the footprint pays.
- **Channels are protected and interrupted.** A friendly `channel` caster is a priority protect-target (it's rooted and fragile); an enemy `channel` is a priority interrupt — the `enemy-cast-seen: channel` reactive read already exists (`core/types.ts`), now pointed at `single-lockdown`/displace to break it.
- **Skillshots are angled.** A `skillshot-line` seeks an edge angle (§6.2) to rake a row instead of clipping one body.
- **Single-lockdown hits the collapse target.** A `single-lockdown` spends on the enemy whose death most collapses their formation (their exposed backline cary/support, from §6.1), not the nearest body.

### 6.4 Both sides, fixed and symmetric

Per `SPEC.md §4` / `AI_OVERHAUL.md §2`, gyms and the Elite Five field this on **both** sides, fixed and symmetric — the depth lever stays out of the gym layer. The enemy reads *your* board the same way: it collapses on your exposed carry, spreads against your stacked AoE setup, protects its own channeler, and flanks your support. That symmetry makes a clever placement feel earned and a sloppy one punished.

### 6.5 Editor surface

Expose the new reads as authorable gambit conditions, grouped like the rest (`src/ui/hud.ts`): `in-formation`, `backline-threatened`, `enemy-clustered`, `flank-open`, `ally-channeling`, `enemy-channeling`. The suppression boundary from `AI_OVERHAUL.md §7` (authored intent wins) holds.

---

## 7. READABILITY — the draft and the board, made legible

Pure presentation, keyed off state the systems already hold. Sits beside the gym/match UI in `src/ui/`.

- **The draft screen.** Roster grid, the gym's format as live constraints ("Carries 2/2 — full", "Need 1 more disabler"), per-hero item/gambit pickers, and the **board** beside it. Illegal teams can't commit.
- **The board editor.** Drag five portraits onto the deployment grid; doctrine presets as one-tap stamps (§3.3); **archetype placement hints** (§2.3) — an AoE caster glows toward center, a skillshot toward an edge, a channeler toward a protected back cell; a faint overlay of the enemy's likely front; real ranges/footprints on hover so "why position matters" is *visible*.
- **Counter-draft reveal.** When a `last-pick` gym answers your team, show the swap with a beat ("She answers your double-carry with a Doom").
- **In-fight formation cues.** The existing `combatReadout` gains the formation posture (holding / committed), the protect-assignment line, and a flank indicator, so a player coaching via Captain's Call can read intent.

---

## 8. ARCHITECTURE IMPACT — what touches what

| Layer | What it gains | Touches the headless core? |
|-------|---------------|----------------------------|
| `src/core/` | **`ability-archetype.ts`** (new): `abilityArchetypes(def)`, pure + cached, parallel to `itemArchetypes`. **`board.ts`** (new): `slotToWorld` + `Formation`. **Types**: `AbilityArchetype`, `DraftTeam`, `DraftFormat`/`DraftRule`, `GymDef.format`. **`utility.ts` + `sim.ts`**: archetype-aware casting (§6.3) + formation reads on `TeamMind` (§6.1) + movement considerations (§6.2). All pure over sim state. | Minimal (derivations + a pure cell→point map + new `TeamMind` fields/considerations; no new effect kind, no new mechanic) |
| `src/data/` | Per-gym `format` (§5.2), doctrine presets (§3.3), Elite Five pick/ban pools, optional `ai.archetypeWeight` tuning. **Most of the work is here, as data.** | No |
| `src/systems/` | The draft engine (assemble + validate, pick/ban state machine, counter-draft heuristic); `setupMacroSim` takes an optional `Formation`, falls back to `formationDepth`; `gymPlayerTeam()` → the committed `DraftTeam`. | No (feeds existing core spawn args) |
| `src/engine/` + `src/ui/` | Draft screen, board editor + archetype hints, doctrine stamps, counter-draft reveal, in-fight formation cues. | No (`boundary.test.ts` stays green) |
| `GameSave` | `gymDrafts?: Record<string, DraftTeam>` + Elite Five draft state. Bump `SAVE_VERSION` with a defaulting migration; a save with no drafts plays exactly as today. | N/A |

**The core touch is derivations + a pure geometry map + a handful of team-mind reads — no new mechanic, no new effect kind, no exotic.** Archetypes are computed from existing fields; the board changes spawn args; the draft is an authoring layer in front of an unchanged sim. Same risk profile as the AI overhaul that already shipped.

---

## 9. PHASING — five phases, each shippable on its own

Five phases, in dependency order. **P1 lifts every existing fight on its own** (no board, no draft) — it is pure AI. P2/P3 build the loop; P4 makes the fight read the board; P5 is the competitive capstone. Each holds the same gate: `npm test` + `npm run build` green, `boundary.test.ts` green, determinism preserved, headless paths as the balance reference, gyms/Elite Five untouched by Resonance.

### Phase 1 — Ability archetypes + smarter casting
The classification and the casting discipline it unlocks. **No board, no draft** — this lifts gyms, raids, and auto-resolve immediately.
- `core/ability-archetype.ts` (new): `abilityArchetypes(def)`, derived per §2.1, cached by id.
- `core/utility.ts`: teamfight-ult/cluster-nuke hold-for-cluster (lift the boss's `partyClusterCount` into the shared scorer), channel protect/interrupt reads, skillshot angle-seeking, single-lockdown on the collapse target.
- `data/tuning.ts`: `ai.archetypeWeight` knobs beside the existing item-score weights.
- Tests (`src/test/ability-archetype.test.ts`, extend `utility-ai.test.ts`): every ability classifies into ≥1 archetype; a teamfight-ult is held until ≥N enemies are caught and never spent on one body; an enemy channel draws an interrupt; identical seeds replay identically.

### Phase 2 — The board seam
The deployment grid, headless, no UI.
- `core/board.ts` (new): `slotToWorld`, `Formation`. The optional-`Formation` branch in `setupMacroSim`, feeding spawn + `homePos`, falling back to `formationDepth`.
- Tests: a supplied `Formation` spawns the five on their cells with cell-derived anchors and they hold; an unplaced team is byte-identical to today.

### Phase 3 — The draft engine + board editor
The loop and its UI.
- `DraftTeam` shape; the draft-from-roster screen; the board editor with doctrine presets and the P1-driven archetype placement hints; `gymPlayerTeam()` → the committed draft, saved per gym (`GameSave.gymDrafts`, defaulting migration).
- Tests: a gym is fought by a drafted, placed five; with no draft, behavior is unchanged; the gym e2e covers draft → place → fight.

### Phase 4 — Formation-aware AI
The fight reads the board, on both sides.
- `core/utility.ts` + `core/sim.ts`: the §6.1 `TeamMind` reads (front/backline, protect-assignments prioritizing channelers, flank target) and §6.2 movement considerations; archetype casting (P1) now keys off the *authored* cluster/backline.
- `src/ui/hud.ts`: the new gambit conditions (`in-formation`, `backline-threatened`, `enemy-clustered`, `flank-open`, `ally-channeling`, `enemy-channeling`).
- Tests (extend `utility-ai.test.ts`/`raid-ai.test.ts`): a pre-engage unit holds its anchor; a peeler is assigned to the most-exposed (channeling) backliner; the brain holds an AoE for a stacked enemy column; a flank routes to the exposed support; determinism holds.

### Phase 5 — Composition formats, counter-draft, and the Elite Five
The competitive/replayability capstone.
- `DraftRule`/`DraftFormat` vocabulary + the client validator + the §5.2 per-gym formats; the `counterDraft` heuristic (`last-pick`/`mirror-shape`); the Elite Five pick/ban state machine and screen; the counter-draft reveal UI.
- Tests: each format rule rejects an illegal team and accepts a legal one; each gym's format is satisfiable; a `last-pick` gym deterministically counters a double-carry; the pick/ban engine yields two legal teams; the Elite Five is winnable via draft.

---

## 10. ACCEPTANCE — each phase is done when

| Phase | Done when |
|-------|-----------|
| P1 | `abilityArchetypes` is pure and cached and classifies every catalog ability into ≥1 archetype; a teamfight-ult/cluster-nuke is held until the cluster threshold and never spent on a lone target; a friendly channel is protected and an enemy channel draws an interrupt; a skillshot seeks its angle; the full suite incl. `boundary.test.ts` and fixed-seed determinism stays green; gyms/raids measurably fire ults on better beats in a seed sweep. |
| P2 | `slotToWorld` is a pure deterministic map; `setupMacroSim` spawns a supplied `Formation` on its cells with cell-derived `homePos` and falls back to `formationDepth` with none; a headless test asserts placement + anchor-hold; an undrafted team plays byte-identically to today; suite + `boundary.test.ts` green. |
| P3 | A gym is fought by a drafted five (from `recruited`, placed on the board) with per-hero items/gambits; the draft saves per gym and reloads; `runGymMatch`/`startLiveGym` consume the committed `DraftTeam`; archetype placement hints render; with no draft, behavior is unchanged; the gym e2e covers draft → place → fight. |
| P4 | Both sides read the board: a pre-engage unit holds its anchor; a peeler is deterministically assigned to the most-exposed/channeling backliner; the brain holds an AoE for a stacked column and fires on the cluster; a flank routes to the enemy backline; the new gambit reads are authorable; identical seeds replay identically; `boundary.test.ts` green. |
| P5 | Every gym carries a `format`; the validator rejects illegal teams and accepts legal ones (a unit test per rule kind), and each format is satisfiable; a `last-pick` gym deterministically counters a committed draft; `mirror-shape` fills a fixed archetype by seed; the Elite Five pick/ban engine yields two legal teams and is winnable via draft; the existing gym-winnable test passes with a format-legal team; no UI changes a combat result. |

Cross-cutting gates (every phase): `npm test` + `npm run build` green; `boundary.test.ts` green (no `three`/DOM in core); save migration defaults cleanly; no exotic slots spent; the macro layer never touches Resonance or the overworld tag-in; gyms/Elite Five stay on the fixed symmetric brain.

---

## 11. PRINCIPLES (consistent with `SPEC.md §10`, `AI_OVERHAUL.md §8`, `GAMBIT_AI_OVERHAUL.md §9`)

- **Classify the spell, then plan with it.** A spell's archetype is *derived* from its effects, the way items got `ItemArchetype`. The brain fires Ravage, a hex, a channel, and a line nuke differently because it knows what each *is* — no per-hero AI.
- **The macro verb is the draft.** The overworld's verb is the tag-in; the macro layer's is *what each spell is for, who you bring, and where you put them*. Make these decisions you *make*, not defaults you inherit.
- **Positioning is geometry, not synergy.** The board matters because the fight is spatial — reach, AoE, peel, flank, channel safety — never because a cell grants a stat. The Dota-honest line that keeps the macro layer pure.
- **Composition pressure keeps the roster alive.** Formats exist so no single five solves every gym. The reason to recruit 60 heroes is to draft the right shape for the leader in front of you.
- **One brain, now with archetypes and a board.** Creeps, gambit heroes, and bosses share the scorer; it gains a classification layer and a formation layer both sides field, fixed and symmetric. Character stays in data — role, attribute, range, kit, archetype, and the anchor you gave it.
- **Never waste the opener; hold the teamfight ult.** The discipline that reads as competence is refusing to blow Ravage on one body, and protecting the channel that's about to pay off.
- **Additive and reversible.** No draft → the walking party; no formation → `formationDepth`; no format → an open draft; archetypes are derived so old data just works. The base game is never worse for any of this existing.
- **Keep the core headless and deterministic.** Derivations, a pure board map, and pure formation reads. `boundary.test.ts` stays green.
- **Ship phases.** P1 lifts every fight on its own. Each later phase stands alone and stays green.
