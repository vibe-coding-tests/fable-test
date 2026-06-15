# BUILD SPEC: "ANCIENTS" — A Dota 2 × Pokémon Open-World RPG

You are an expert game-developer agent building this game solo, across many sessions. Build a complete, playable 3D open-world RPG in the browser using **Vite + Three.js + vanilla TypeScript** (no game engine). The game crosses Dota 2 (heroes, spells, items, lore) with Pokémon's structure (open world, collecting, gyms, badges, Elite Four) and Diablo 2's loop (repeatable boss runs, drops, builds). You know Dota 2's heroes, abilities, items, and lore deeply; use that knowledge to populate all game data. Lean on canon for identity, but invent freely wherever it makes the game better.

---

## 0. HOW TO EXECUTE THIS SPEC (read first)

**Crunch mode: there are no hard restrictions.** Everything in this spec is direction and aspiration, not a gate. Build whatever moves the game forward, in whatever order, with whatever dependencies, assets, and tools help. Ship it.

- Treat the phases (§9) as a rough map, not a gate. Build ahead freely; ship when it's good.
- Resolve ambiguity however you see fit and keep moving — Dota canon and "is it fun?" are good north stars. Jotting nontrivial calls in `DECISIONS.md` and keeping `PROGRESS.md` current still helps future sessions; do it when useful.
- Tests are a handy safety net, not a requirement. Keep the ones that earn their keep.
- Use any dependencies, art assets, audio, models, loaders, or post-processing you want.
- Single-player, latest desktop Chrome / WebGL2. Aim for a smooth frame rate; optimize when it actually matters, not preemptively.

## 1. ARCHITECTURE (suggested shape, not a rule)

A clean structure that's worked well so far. It's worth keeping where convenient — the headless core and data-driven content buy easy testing and fast content authoring — but deviate freely whenever something else is faster.

### 1.1 One renderer-independent combat core

`/src/core/` contains the combat simulation: units, stats, abilities, statuses, items, projectiles (as logic objects), capture, XP/gold, and AI controllers. Keeping it free of Three.js and the DOM is what makes it headless-testable and shareable across both layers — handy, not sacred. It advances on a fixed 30 Hz logic tick and is deterministic for a given seed; rendering interpolates between ticks.

Both combat layers are the same core with different drivers:

- **Micro (overworld)**: player input controls one unit; everything else runs an AI controller.
- **Macro (5v5 arena)**: all ten units run gambit controllers (§7); a Captain Call temporarily attaches player input to one unit.
- Controllers are swappable per unit. This is also how raids work (§4): the full party fielded at once in micro, AI allies driven by their own gambits, the boss running a threat-table controller.

A `Unit` is one shared model: stats + statuses + ability slots + item slots + team + controller. Heroes, creeps, echoes, summons, and bosses are all Units with different data.

Because the core is headless, a full 5v5 macro battle can run to completion inside a vitest test in milliseconds — a cheap way to verify combat without eyes on the screen.

### 1.2 Data-driven content

Heroes, abilities, items, creeps, regions, trainers, gyms, and quests live as plain data files under `/src/data/`, with generic interpreters reading them — so most new content is data, not engine code. Abilities mostly compose from the vocabulary in §2; when a mechanic needs bespoke scripting (Chronosphere, Stone Gaze, Reincarnation, Rearm, Invoke, raid-boss signatures), write it as an **exotic** registered by id and referenced from data. Add as many as the game needs.

Optional tests that have paid off:

- **Data lint**: entries validate against their schema and cross-references resolve (recipes point to real components, abilities map to a VFX archetype, ids exist, exotics have implementations).
- **Boundary check**: flags `three` imports in `/src/core/` (keeps the headless property if you want it).
- **Synthetic-hero test**: a JSON-only test hero runs through a headless sim, casting one ability of each targeting type.

### Layout

```
/src/core/     — simulation: units, stats, abilities, statuses, items, projectiles,
                 controllers (player / gambit / creep AI), capture, XP & gold
/src/engine/   — Three.js renderer, camera modes, input, procedural models &
                 animation, VFX, icon generator, save, audio (Phase 4)
/src/systems/  — overworld orchestration: spawning, region streaming, quests,
                 recruitment, shops, day/night, reputation
/src/data/     — heroes/, items/, creeps/, regions/, trainers/, quests/, tuning.ts
/src/ui/       — HUD, menus, shop, party, gambit editor, draft screen, journal, codex
/src/test/     — data lint, sim tests, boundary checks
```

- **All tunables live in data.** `tuning.ts` holds global multipliers (range scale, speed scale, XP curve, gold rates) so the game can be rebalanced centrally. Use Dota numbers as the baseline, then tune.
- **Save**: full RPG save support. Manual save anywhere outside combat, 3 save slots plus an autosave slot (written on town entry, badge, recruitment, and a 60s timer), load from the title screen, and export/import of the full state as a downloadable JSON file. Serialize from one versioned `GameState` object.

## 2. ABILITY & STATUS ENGINE (the vocabulary)

**Targeting types**: `no-target`, `unit-target` (enemy / ally / any), `point-target`, `skillshot` (projectile or instant line; can miss), `ground-aoe`, `channel` (combinable with the above), `toggle`, `passive`, `aura`, `attack-modifier`.

**Effect primitives** (every ability is a composition of these):

- damage (physical / magical / pure; instant, over time, or per-attack), heal, mana burn / restore / drain-per-second
- statuses — **one shared list both combat layers consume**: stun, root, silence, hex, slow (move / attack), disarm, blind, fear, taunt, invisibility (with fade time), magic immunity, break, cyclone (untargetable), sleep, frozen
- displacement: knockback, pull-toward-caster (the Hook drag), forced move, blink (self or target)
- zones: persistent ground AoE (damage / aura / slow), impassable terrain with a duration (Fissure, Ice Wall block movement for everyone)
- summons: Units with creep AI and a lifetime
- stat modifiers: flat or % on any stat (damage, armor, attack speed, move speed, lifesteal, crit, cleave, bash, evasion…), timed or aura-applied
- projectiles: linear (speed, width, range) or homing (disjointable by cyclone/invis/blink)
- mechanic flags: charges, cooldown refund, day/night variant, on-damage-taken triggers (Blink Dagger's lockout), spell block / reflection

**Exotic registry** (as many as the game wants, some reserved for raid-boss signatures, §4): Invoke (Quas/Wex/Exort with a reduced 6-spell set), Chronosphere, Stone Gaze, Reincarnation, Rearm, Remote Mines pre-planting, plus whatever else the roster needs. Each is data-referenced by id.

**VFX**: a library of reusable archetypes — projectile, ground-AoE ring, chain, beam, summon-pop, shield, stun-stars, channel, global-mark, hook/tether, wall, storm, and any others you add — color- and shape-parameterized per ability from data. Abilities pick an archetype that fits.

**Icons**: through Phase 4, generate ability and item icons procedurally at startup (2D canvas: layered glyph shapes tinted with the owner's palette), cached as textures for HUD and shop. Phase 5 may replace them with authored icon art.

## 3. VISUAL STYLE (procedural placeholders through P4; Dota-resemblant assets in P5)

- **Stylized low-poly through Phase 4, Dota-resemblant from Phase 5.** P1–P4 assemble every hero from Three.js primitives (capsules, cones, boxes, spheres) into a recognizable silhouette plus a 3-color palette from the hero's Dota identity (Crystal Maiden = ice blue/white/silver; Pudge = rot green/flesh pink/rust); silhouette + palette live in hero data and a single `HeroModelBuilder` assembles them, with creeps reusing the builder. **These primitive models are placeholders.** Phase 5 (§9) replaces them with detailed, rigged 3D models that clearly **resemble** each hero's Dota 2 look — recognizable silhouette, gear, weapon, and colors — loaded through a real asset pipeline. The bar is "a Dota player names the hero on sight," not a pixel-perfect copy; evoking the character is enough. Either way the builder accepts **equipped-item visual layers** (Phase 4, §5) — weapon swaps, added parts, tints, attached VFX — so a kitted-out hero looks kitted out; in P5 those attach as real geometry to model sockets (weapon/back/shoulder attach-points).
- **Procedural animation through Phase 4**, one shared controller parameterized per hero (attack speed, cast point): idle bob, walk via limb rotation, cast = raise arm + flash, attack = lunge, death = collapse. **Phase 5 adds authored skeletal animation** per hero (idle / run / attack / cast / channel / death plus signature ability clips) timed to each hero's cast point and base attack time.
- **Two camera modes over one world**: **Map view** (high tilted camera over a simplified far-LOD world: biome-splatted ground, fog, town/route icons) for traversal, and **Gameplay view** (an angled follow camera locked to the active hero, ~50° pitch with wheel zoom, like Dota's camera) for combat and towns. `M` toggles; transition is a camera fly with a fade fallback.
- Biome ground texturing via procedural splatting (snow, desert, forest, wasteland, coast); props (trees, rocks, ruins) are instanced primitives scattered from region data.
- **Day/night cycle** (~8 minutes) with a lighting shift. Expose a `night` flag to the condition system. Implement at minimum: Night Stalker empowered at night (his echo/boss fight changes), Luna's night bonuses, tighter player vision fog at night.
- Movement and collision are kinematic: terrain height sampling plus circle colliders on units and props. Every unit, the player's hero included, moves by steering with local avoidance toward its order point (which also handles temporary walls like Fissure), with a grid A* fallback inside walled dungeons. Reach for a physics library or navmesh if it genuinely helps.

## 4. WORLD & PROGRESSION

One continent, ~10 regions connected by gated routes. Each region has a town with a shop, wild creep spawns, hero echoes, recruitable heroes, 1–2 bosses, 3–5 mini-bosses, and one **Gym**. Regions follow Dota lore:

1. **Tranquil Vale** (starter region, Radiant-coded) — tutorial, starter choice.
2. **Nightsilver Woods** — Luna, Mirana; lunar theme. GYM 1: "Lunar Gym" (nuke/burst theme).
3. **Icewrack** — Crystal Maiden, Tusk, Ancient Apparition. GYM 2: "Frost Gym" (slows/disables).
4. **Devarshi Desert** — Sand King, Nyx Assassin. GYM 3: "Burrow Gym" (initiation/pickoff).
5. **The Shadeshore / Coast** — Kunkka, Tidehunter, Slardar, Naga Siren. GYM 4: "Tide Gym" (teamfight wombo).
6. **The Vile Reaches** (Dire-coded wasteland) — Pudge, Lifestealer, Undying. GYM 5: "Rot Gym" (attrition/sustain).
7. **Quoidge / Scholar's City** — Invoker, Silencer, Outworld Destroyer. GYM 6: "Arcane Gym" (spell interactions, silences).
8. **The Hidden Wood / Jungle** — Enchantress, Chen, Nature's Prophet. GYM 7: "Wild Gym" (summons/push).
9. **Mount Joerlak / Highlands** — Magnus, Elder Titan. GYM 8: "Titan Gym" (big ult setups).
10. **The Mad Moon Crater** (endgame) — Victory Road equivalent → **Elite Five + Champion** at the "Tower of the Ancients" (a Radiant/Dire throne room). Roshan's Pit is here: the legendary raid boss with a real respawn timer.

- **Badges gate progression**: route barriers, recruit level ceilings, and shop tiers.
- **Boss structure (Diablo 2 model).** Hero echoes are the farmable bosses. The real hero is a singleton recruit, but their echo persists in their region as a repeatable boss after recruitment (lore: Mad Moon fragments keep reforming). Tiering is role- and lore-driven: **hard carries and lore titans are BOSSES** (Spectre, Medusa, Faceless Void, Phantom Assassin, Terrorblade, Doom, Invoker, Wraith King — multi-phase fights built from their kits: Stone Gaze as a don't-look mechanic, Chrono as an arena-freeze phase, Reincarnation as a literal second phase). **Supports and utility heroes are MINI-BOSSES** guarding routes, dungeons, and shrines (faster fights, smaller loot tables). Scaling versions unlock post-badge: Normal/Nightmare/Hell-style difficulty tiers on repeat runs, with randomized loot.
- **The layer split**: the overworld micro layer is the Diablo loop (farm, boss runs, drops, builds); trainers and gyms are the macro layer (drafting, gambits, 5v5 wombo combos). Two games, one roster.
- Each gym leader runs a themed 5v5 macro battle (best of 3) and awards a **Badge**. The Elite Five is five consecutive drafted 5v5s with bans, then a Champion fight.

### Raids (WoW model)

Raids are **5v1 teamfights against a giant boss** (plus adds). The full party is fielded simultaneously in micro; you drive one hero and the other four run their gambits (§7). **1–5 switches which hero you drive.** Everyone simulates continuously, so the swap-in cooldown floor from §6 does not apply, and all five heroes earn participant-rate XP.

- **Threat**: raid bosses run a threat-table controller — damage and healing generate threat, the taunt status overrides it. Tank/healer/DPS roles emerge straight from Dota kits: Axe taunts, Omniknight and Dazzle heal, the carry rides the threat ceiling. Party composition becomes a real raid decision.
- **Mechanics compose from existing primitives**: HP-threshold phase transitions, telegraphed ground zones as dodge checks, add waves (summons), impassable-terrain walls, and a soft enrage timer. Each raid boss may claim one exotic slot for its signature mechanic (§2). A wipe resets the boss; runs stay short and repeatable, on the same Normal/Nightmare/Hell tiers as bosses.
- **Loot drops on probability, Diablo rules.** Every clear rolls the raid's table: guaranteed top-tier components, plus a chance at an **assembled** item from that raid's anchor pool — defaults 10% Normal / 20% Nightmare / 35% Hell, tunable in `tuning.ts` — with bad-luck protection: an assembled drop is guaranteed by the 8th clear without one.
- **Roshan's Pit** (Mad Moon Crater): the flagship raid, on a real respawn timer. Drops the Aegis of the Immortal (a held one-use auto-revive, consumed on death) and anchors Rapier-tier loot; repeat kills add a Refresher Shard and cheese (a mega-consumable), as is canon and law.
- **Cameo raids (3)**: the Mad Moon's fracturing leaks echoes from neighboring universes — the worlds this genre descends from. Each unlocks via a hidden questline after its region's badge, tuned for endgame:
  - **The Lord of Terror** (Diablo), in a hell-rift beneath the Vile Reaches: fear status, spreading fire zones, bone-prison walls, Fallen-style add packs. Anchors Heart of Tarrasque.
  - **The Lich King** (Warcraft), on Icewrack's glacier summit: a remorseless-winter aura zone, Defile (a ground AoE that grows if fed), slain adds raised as undead, heavy frost cleaves. Anchors Eye of Skadi. A loving nod — this game's genre was born as a Warcraft 3 mod.
  - **The Queen of Blades** (StarCraft), in a fallen-star crater in the Devarshi Desert: continuous swarm add waves, creeping infestation ground that spreads if left unattended, burrow ambushes, psionic-storm telegraphs. Anchors Refresher Orb.
  Cameos are mechanical homages with original written content — same approach as the Valve material, extended to Blizzard.

## 5. ROSTER & ITEMS (data authoring)

**Hero entry schema**: id, name, attribute (STR/AGI/INT/Universal), role tags, base stats + growth, movement/attack-range/turn-rate parameters, 4 abilities (each: targeting type, primitive composition or exotic ref, cooldown/manacost/values by level, cast point, VFX archetype), talent tree (4 tiers × 2 choices at 10/15/20/25; talents are data: stat modifiers or ability-field overrides), one facet (a variant flag on one ability or stat package), optional Aghanim's upgrade, silhouette + palette spec, region, recruitment quest id, and ~6 original in-character barks (write new lines in Dota's voice).

- **Heroes are singletons** by default — one of each in the world, recruited via quest (§8). Level cap 30: talents are picked at 10/15/20/25 (the opposite branches stay echo-locked, see Hero Echoes below), levels 26–30 are pure stat growth, and post-cap XP converts to gold. Aim for a big roster (60+ is a good target) with Aghs effects wherever they're worth it. Include any hero you can make fun — even the tricky ones (Rubick's Spell Steal, Meepo's multi-unit micro, Arc Warden's self-double, Morphling); build them however works.
- **Creeps are the wild "Pokémon"**: ~25 catchable neutral types from Dota (kobolds, satyrs, hellbears, trolls, wildwings, golems, thunderhides…) in small/medium/large/ancient tiers, with their real Dota abilities. **Capture**: weaken below 30% HP, then channel a Binding Totem for 2.5s; taking damage interrupts. Deterministic, no catch RNG; higher tiers need lower HP and a longer channel. Creeps respawn, duplicate freely, and merge auto-chess-style (3 copies → star upgrade) to stay endgame-viable. Ancient creeps can hold items. **Caught creeps are fieldable**: bring up to 3 into the overworld as an AI entourage (at most one ancient); they fight on full creep AI, benefit from your aura items, and merge stars keep them endgame-relevant. The macro 5v5 stays heroes-only on your side; early route trainers field creep squads as enemies.
- **Summoners are the world-map class fantasy.** Prioritize them in the roster: Chen, Enchantress, Nature's Prophet, Undying, Warlock, Beastmaster, Visage, Lycan, Broodmother. Their summons run full creep AI and stack with the entourage, turning the overworld into a Diablo 2 Necromancer playstyle: walk the map with an army. Chen's Holy Persuasion converts a wild creep on the spot; a Chen facet can let persuaded creeps stay caught after the fight.
- **Hero Echoes**: wild, region-bound illusion-fragments of heroes. Beating an echo of an unrecruited hero drops attunement shards (advances their quest). Beating an echo of an owned hero unlocks the other branch of one talent tier (4 echoes = both talents at every tier = "perfected"); the first echo also unlocks facet swapping; surplus echoes pay big gold/XP bounties. Dupes are never dead content.
- **Items: at least 50 Dota 2 items** with real recipes (components + recipe cost), passives, and actives: Blink, BKB, Force Staff, Glimmer, Euls, Lotus, Battlefury, Diffusal, Mekansm, Pipe, Aghanim's Scepter, etc.
  - **Slots**: 6 per hero. All six slots' passives and auras apply. Slots 1–4 are key-bound (Z/X/C/V), so up to 4 *actives* are pressable per hero; slots 5–6 are passive slots (an active item parked there keeps its passives but cannot be pressed). The UI auto-sorts actives into keyed slots. The active cap is a constant in `tuning.ts`.
  - **Acquisition is tiered.** Town shops carry low/mid-tier items and components (boots, Magic Wand, Mekansm, Force Staff, Glimmer, Euls, Drums, BKB components…) with regional overlap; one **Secret Shop** per late region sells exclusive components in dangerous spots. **Top-tier game-warping items lean on gated sources**: Divine Rapier, Butterfly, Scythe of Vyse, Heart of Tarrasque, Eye of Skadi, Refresher Orb, and Aghanim's Scepters come mainly from boss fights, dungeon quests, or gym/Elite rewards (Scythe from the Arcane Gym questline; Butterfly from a hidden trial; Rapier from Roshan-tier content) — sell them in shops too if it plays better. **First copy is usually quest/boss-gated; additional copies are farmable**: boss and mini-boss loot tables drop top-tier COMPONENTS (rare chance at assembled items), and specific bosses are the efficient source for specific items (Butterfly farms from an agility-carry boss, Heart from a strength titan). Raids are the most generous source; their probability rules are in §4.
  - **Rapier keeps its Dota identity**: it drops on hero death in macro battles and the enemy team can claim it for the round. Equipping it is a deliberate gamble.
  - Consumables (tangos, salves, clarities, dust, smoke) drop from creeps; components drop from echoes and trainers; assembled items are crafted or bought. **Gold is trainer-level**: one wallet, allocated across the roster (farm-priority tension).
  - Aura items (Mekansm, Pipe, Drums, Vlads, Assault Cuirass) affect nearby allied units on the field in both layers — the active hero and summons in micro, the whole team in macro and raids — making them roster-building choices.
  - **Items wear on the hero (visual layer; schema from day one, rendered in Phase 4).** An item may carry an optional `appearance` block, and the `HeroModelBuilder` (§3) overlays it on the base silhouette: a **weapon swap** (Battlefury → broad cleaver, Divine Rapier → glowing blade, Dragon Lance → a longer reach pole, Maelstrom → a crackling haft), an **added part** (Platemail/Assault Cuirass → pauldrons, Heart → a pulsing core, Eye of Skadi → frost shards, boots → a ground trail), a **palette tint**, or an **attached VFX archetype** (a BKB shimmer, a Radiance burn aura, a Shiva's frost mist). Layering is deterministic and slot-ordered: a weapon-class `appearance` replaces the hero's default weapon (ties broken by ascending slot index), parts and auras stack. The block is pure render data — `/src/core/` never reads it (§1.1), so equipping an item changes how a hero looks, never how the sim resolves. Fielded creeps, summons, and ancient creeps holding items get the same overlays.
  - **Some items reshape the attack itself.** An item may also carry an `attackVisual` override that the procedural animator (§3) plays on attack windup/impact, keyed off the sim events the core already emits (`on-attack-land` and the windup timer — no core change): a **wide sweep arc** for cleave (Battlefury, Tidehunter-style swings), a **converted ranged shot** for a melee→ranged item, an **on-hit lightning bounce** (Maelstrom/Mjollnir), a **tinted heavy impact** (Desolator red, Skadi frost-blue, Nullifier purge flash), or a **bigger lunge on crit**. This is cosmetic-over-mechanics: the override must read the item's Dota identity on sight, but all damage, cleave geometry, bounce targeting, and timing still live in the headless core. Multiple equipped overrides compose (a Desolator + Maelstrom attack shows red impact *and* a lightning arc).
- **ITEM FEEL FIDELITY (core design rule, parallel to hero feel).** Numbers, costs, and cooldowns may be retuned, but every item's **mechanical identity and decision pattern must match Dota 2**: Blink Dagger is instant repositioning that locks out when you take damage (no blinking out while getting hit); BKB grants temporary magic immunity with visible spell rejection and the classic "when do I pop it" decision; Euls cyclones (self-cast to dodge, enemy-cast to set up); Force Staff pushes any unit in its facing direction, saves and engages alike; Glimmer fades an ally into invisibility; Lotus Orb reflects targeted spells; Diffusal burns mana and purges; Battlefury cleaves; Refresher resets all cooldowns for the double-ult fantasy; Scythe of Vyse is the hard "stop that hero NOW" button. **Heuristic: a Dota player should know what an item does, when to buy it, and when to press it, on sight.**

## 6. MICRO COMBAT (overworld, Diablo 2-style)

- Real-time third-person action combat. **One active hero at a time**, party of 5.
- **Controls (decided)**: click-to-move, Dota-style. **Right-click** moves (click ground) and attacks (click a unit); hold to keep moving. **QWER + DF = abilities** (D/F only for heroes with >4 active slots), quick-cast at the cursor by default, with a click-to-confirm toggle in settings. **Z/X/C/V = item actives**, **1–5 = hero swap**, M = map, Tab = party/inventory. The left hand stays on the keys and the right hand owns movement and aim, mirroring Dota muscle memory. The player's hero moves by the same steering the AI uses (§3); turn rates apply to pathing, which is where hero "weight" shows up.
- **Hero swap on 1–5, mapped to party slots** (active slot highlighted in the HUD), 4s swap cooldown; the swapped-in hero's cooldowns are floored at 50% of remaining (prevents ult-cycling). Mid-fight slot-swapping is a feature: RP → press 3 → cleave.
- XP: active hero 100%, swapped-in participants 75%, bench 50%. +15% gold/XP last-hit bonus when the controlled hero lands the killing blow.
- This layer hosts wild creep fights and capture, echo duels, recruitment trials, dungeons, and raids (§4).
- **HERO FEEL FIDELITY (core design rule).** Numbers (damage, cooldowns, ranges, durations) may be freely retuned for action-RPG pacing, but each hero's **kinesthetic identity must match Dota 2**. The mechanic type, delivery, and decision-making of every ability must survive translation: Pudge's Hook is a slow skillshot that physically drags the target to him; Mirana's Arrow stuns longer the farther it flies; Anti-Mage's Blink is a short-cooldown reposition and Mana Break shreds mana; Invoker actually combines Quas/Wex/Exort to invoke spells; Earthshaker's Fissure creates impassable terrain; Sniper outranges everything but is fragile up close; Sven's cleave rewards stacking enemies; Tinker rearms; Techies pre-plants; Faceless Void's Chrono freezes a zone he must enter; Storm Spirit's mobility burns mana per distance. Channeled spells channel, point-target spells turn the hero, skillshots can miss, melee heroes must close distance. Movement speed, attack range, cast animations, and turn rates stay relatively faithful (then globally scaled via `tuning.ts`) so hero "weight" differences persist: CM feels slow and fragile, Slark feels slippery, Spirit Breaker feels like a truck. **Playtest heuristic: a Dota player picking up any hero should immediately recognize how they play.**

## 7. MACRO COMBAT (trainer/gym battles, RTS × auto chess)

- 5v5 on a small arena, auto-resolving on the shared core. Pre-fight: pick 5, set gambits, item-actives policy, focus priority.
- **Gambit grammar v1** (FF12-style: an ordered rule list per hero, first match wins, as many rules as you want):
  - Conditions: self/ally/enemy HP% threshold, mana% threshold, has-status (stunned / silenced / channeling / magic-immune), enemies-within-radius ≥ N, allies-alive N, target-role/attribute, my-ability-ready, fight-time > T, enemy-cast-seen (category: blink / ult / channel), distance band.
  - Actions: cast ability at an auto-target (lowest-HP enemy | most-clustered point | self | lowest-HP ally | current focus), use item active, attack focus target, retreat to backline, hold.
  - Rules are data. The gambit editor is a HUD list builder, and the same gambit controller drives AI allies in micro raids.
- **3 Captain Calls per fight** (gyms grant enemies more): take direct control of one hero for 5 seconds to land the Black Hole / Ravage / clutch save manually. Landing the manual wombo is meant to be the peak moment of a series.
- **Asymmetric Captains Series — the macro puzzle (the deliberate opposite of the §6 micro layer).** The gym leader / Elite member **is the captain, and the asymmetry is in their favor by design** — this is where macro challenge comes from. **Bans are one-directional:** before the series the leader bans some of *your* recruited heroes (more on higher difficulty), targeting your best answers; you cannot ban theirs. You then draft a legal five from what's left, under the leader's static format (type/role bans, attribute caps, level cap). **The enemy out-adapts you between rounds:** each round they ban one *more* of your heroes — preferring the five that just beat them — and counter-draft their own five, while you get only a small, difficulty-scaled **repick budget** (best-of-3 at gyms, best-of-5 per Elite Five member; on the hardest tier your draft is effectively locked while they keep banning). So a series win means your *roster* survives having its best pieces stripped away round after round — which is what makes a deep, leveled collection (§5) the answer and gives the full roster a job. This is mechanically the **opposite** of §6 micro combat, where you swap heroes freely (1–5) mid-fight: macro is a draft-under-pressure chess match, micro is fluid swap-combo action. (A series loss is never a hard wall — bans always leave a legal five and you re-challenge.)
- Cross-hero spell interactions must actually work: pulls group enemies for cleaves, silences stop channels, BKB blocks magic, Euls disjoints. These fall out of the shared status engine (§2); verify them with headless sim tests, not by eye.
- The Elite Five is the asymmetric Captains Series at its hardest: more pre-bans and zero repick budget, so each best-of-5 member strips your roster faster than a gym while counter-drafting their own themed five between games.

## 8. RECRUITMENT (the quest backbone)

Every hero has a 3-beat chain: **Find** (rumors, lore fragments, echo shards point to a region) → **Trial** (per-hero, in-character) → **Bind** (a 1v1 micro duel against their real kit, doubling as that hero's tutorial; losing relocates them — never a permanent failure).

Implement at least 12 bespoke trial types and template the rest: honor duel (Juggernaut/Sven/Legion Commander), stealth-hunt (Riki), combo exam (Invoker), relic fetch (Sven's shattered sword), a mutually-exclusive faction choice (siding with Kunkka or Tidehunter locks the other out), reputation gates (Omniknight needs good reputation, Shadow Fiend needs souls from kills), timed arena cull (Axe), minefield crossing (Techies), persuasion gauntlet: convert wild creeps to your cause instead of killing them (Chen), assassination contract (Phantom Assassin), survive-the-night (Night Stalker), lore riddle (Elder Titan).

Reputation is a simple karma counter moved by quest choices; it gates the reputation trials. Two specials: a Roshan-pit raid recruit, and one "recruit 50 heroes first" legendary.

## 9. PHASES & ACCEPTANCE (each phase ships playable)

Content staging: P1 = 6 heroes / 15 items / 1 region / 6 creep types → P2 = 20 / 30 / 3 regions / 12 creeps, gyms 1–2 → P3 = 60 / 50 / 10 regions / 25 creeps / 8 gyms + Elite Five + all four raids → P4 = polish → P5 (bonus, post-ship) = Resonance, a Genshin-style elemental party layer (ships enabled by default, reversible to vanilla Dota via a settings toggle).

### Phase 1 — Core loop

Engine + combat core + Tranquil Vale. 6 heroes chosen to cover every targeting type and most primitives (suggested: Juggernaut, Crystal Maiden, Pudge, Earthshaker, Sniper, Lich). Creep spawns, fighting, capture, merge, and the entourage (field a caught creep as an AI companion). Shop + inventory with 15 identity-rich items (Blink, BKB, Euls, Force Staff, Glimmer among them). Save/load. Both camera modes.

Done when:

- `npm run dev` → pick a starter → kill and catch a kobold → field it as a companion → buy and use Blink → swap heroes mid-fight → manual-save to a slot, reload, state intact.
- `npm test` green: data lint; core boundary check; synthetic-hero sim; a fixed-seed 5v5 headless sim that produces the same winner every run; capture and merge unit tests.
- `PROGRESS.md` contains the 60-second demo script proving the above.

### Phase 2 — Systems

Echoes + talent/facet economy; recruitment framework + 6 bespoke trials; +2 regions (Nightsilver Woods, Icewrack); gyms 1–2 with the gambit editor and Captain Calls; roster to 20, items to 30; hero-swap and combat polish.

Done when: gyms 1–2 are beatable end-to-end with player-authored gambits; an echo kill visibly unlocks a talent branch; all 6 trials are completable; sim tests cover silence-interrupts-channel, BKB-blocks-stun, and Euls-disjoints-projectile; data lint covers the grown roster.

### Phase 3 — Content

Full 60-hero roster, 50 items, all 10 regions, 8 gyms, Elite Five draft, all four raids (Roshan + the three cameo wings), day/night effects, reputation, boss/mini-boss difficulty tiers with loot tables.

Done when: data lint proves the counts (≥60 complete hero entries, ≥50 items with resolving recipes, every region populated, every hero has a recruitment chain); a **kit smoke test** passes (every ability of every hero and every item active executes in a headless sim at levels 1/15/30 without errors); the Elite Five is winnable via draft; all four raids are completable and drop from their loot tables; a headless raid sim verifies phase transitions at HP thresholds, add waves, taunt redirecting the boss, and the enrage timer; a Nightmare-tier boss rerun works.

### Phase 4 — Polish

VFX pass; barks and dialogue; balance pass from Dota baselines via `tuning.ts`; **item appearance & attack-animation overrides** (equipped items visibly change the hero model and, for marked items, the attack animation — see §5); minimap (top-down render-to-texture or canvas dots); quest journal; codex with lore entries written in Dota's voice; optional procedural WebAudio SFX (cast/hit/capture/badge jingle — keep it tiny); performance pass against the §0 budget.

Item visuals are done when: equipping a weapon-class item swaps the hero's held weapon on the model; at least one armor/aura item adds a visible part or attached aura; at least **6 items carry an attack-animation override** that plays on attack (cleave sweep, melee→ranged conversion, on-hit lightning, tinted impact, crit lunge), and overrides from two items compose on one attack; the boundary check stays green (no `appearance`/`attackVisual` reads in `/src/core/`); and data lint validates that every `appearance`/`attackVisual` references a known silhouette build part, weapon kind, or VFX archetype.

### Phase 5 — Resonance, Feel & Fidelity (bonus, post-ship)

Three post-ship thrusts: a Genshin-style elemental party layer (**Resonance**), a combat **feel** pass (animation, sound, attack-move), and a **graphics overhaul** that takes heroes from stylized placeholders to faithful Dota 2 likenesses. Resonance ships enabled by default but is reversible to vanilla Dota via a settings toggle; the feel and graphics work apply to the whole game. None of it touches the headless core (§1.1) — it is all engine-side, driven by the same sim events.

#### Resonance — Genshin-style elemental party combat

A stretch layer bolted onto the shipped game — **additive and reversible**: it ships enabled by default, and a settings toggle returns vanilla Dota. It never rewrites a hero's kit (the §6 Hero Feel Fidelity rule still holds: a hero's abilities, delivery, and decisions are untouched) and it spends **zero exotic slots** — every mechanic below is a generic extension of the status / trigger / aura engine (§2), driven by data, exactly like `repeat`, target-selectors, and the unified trigger system were added without exotics. Because it builds ahead of ship, it lives outside the §0 "a phase is done only when its checklist passes" gating until P1–P4 are complete; treat it as a labeled stretch goal, not a blocker.

**Scope (respect the §4 layer split).** Elements, reactions, and resonance apply in the **micro overworld and raids** — the exploration / Diablo / party-swap loop, which is where Genshin's fantasy actually lives. **Gyms and the Elite Five stay pure-Dota macro** so competitive drafting and feel fidelity aren't muddied by a reaction meta. Resonance *may* be enabled in macro as a separate ruleset later, logged in `DECISIONS.md` if so.

**1. Elements (closed vocabulary of 7, mapped from canon — never invented).** Each hero carries one primary `element` tag in data; individual abilities may override it (an off-element nuke is allowed). Mapping examples, by Dota identity:
- **Pyro** (fire): Lina, Shadow Fiend, Ember Spirit, Phoenix, Batrider.
- **Hydro** (water): Morphling, Kunkka, Naga Siren, Slardar, Tidehunter.
- **Electro** (lightning): Zeus, Razor, Storm Spirit, Disruptor.
- **Cryo** (frost): Crystal Maiden, Ancient Apparition, Tusk, Winter Wyvern, Lich.
- **Geo** (earth/stone): Earthshaker, Tiny, Magnus, Sand King, Elder Titan.
- **Dendro** (nature): Nature's Prophet, Enchantress, Treant Protector, Dark Willow.
- **Anemo** (wind/cyclone): the rarest; cyclone/knockback identities, often *supplied by items* (Eul's, Tornado-style effects) rather than a hero's whole kit.
Non-elemental heroes (pure physical carries) stay neutral and lean on item-applied elements (below).

**2. Application & aura.** A damaging ability or attack tagged with an element applies that element to the target as a short-lived **aura status with a decaying gauge** — the status engine already models exactly this (frost-slow, frozen). Only elemental damage applies an element; plain physical attacks are neutral **unless an item says otherwise**, which links straight into the Phase 4 `attackVisual` items: **Maelstrom/Mjollnir apply Electro, Radiance applies Pyro, Eye of Skadi applies Cryo** — the on-hit visual and the element are the same data hook. This turns item builds into element-enablers for neutral carries.

**3. Reactions (one generic resolver + a data table, zero exotics).** When an element lands on a unit already carrying a *different* element aura, the engine reads a **reaction table** (element-pair → effect composition), fires it, then consumes or retains auras per the table. Each reaction is a composition of existing primitives:
- **Vaporize** (Pyro↔Hydro) / **Melt** (Pyro↔Cryo): a damage multiplier on the triggering hit.
- **Overload** (Pyro+Electro): AoE magical burst + knockback (damage + displacement).
- **Superconduct** (Cryo+Electro): AoE + armor shred (damage + statmod debuff).
- **Electro-Charged** (Hydro+Electro): a bouncing damage-over-time (chain/zone DoT).
- **Freeze** (Hydro+Cryo): the existing `frozen` status — already in the §2 vocabulary, free.
- **Swirl** (Anemo + any): re-applies the swirled element in an AoE (zone re-application) — pairs naturally with cyclone visuals.
- **Crystallize** (Geo + any): spawns a shard that grants a small absorb shield on pickup (summon + shield statmod).
- **Burning** (Pyro+Dendro) and the Bloom family (Dendro+Hydro): DoT / seed summon — ship **Burning** at minimum, the rest optional.
Reaction magnitude scales off the triggering unit's level and spell amplification (both already in the stat vocabulary), standing in for Genshin's Elemental Mastery. The resolver is generic table-driven code, not per-hero logic.

**4. Elemental Resonance (the headline: heroes that party well together).** Fielding a party where **2+ heroes share an element** grants a **team-wide resonance buff**, evaluated whenever the party changes and applied as a statmod aura:
- **Pyro** — +attack damage; cryo auras on you decay faster.
- **Hydro** — +max HP; +heal received.
- **Electro** — reactions refund mana and shave cooldowns (the "energy recharge" fantasy, without bolting on a second resource bar — Dota mana stays the economy).
- **Cryo** — bonus crit vs chilled/frozen targets.
- **Geo** — +shield strength; nearby enemies lose armor.
- **Anemo** — +move speed, −cooldowns, +stamina (see §6 below).
- **Dendro** — +reaction damage.
A party with no shared pair gets a small generic **Harmony** bonus, so a rainbow team trades raw power for flexibility and reaction coverage. This is the literal "some heroes legitimately party well with others" system, and it makes party-building a real overworld decision on top of the existing roster tensions.

**5. Swap-driven rotations.** Lean the existing 1–5 hero swap (§6) into Genshin's quick-swap. In Resonance mode the swap cooldown is shortened and **off-field persistence** is honored — a swapped-out hero's zones, summons, and wards keep ticking (already supported; just don't tear them down on swap) — so you apply Hydro with hero A, swap to Cryo hero B, and **Freeze**. An optional swap-cancel grace keeps a swap from eating an in-progress cast. The §6 50%-cooldown floor and 4s swap timer are relaxed *only* in this mode and stay intact for the base game.

**6. Light traversal (optional within the bonus).** Genshin is also exploration. Add **stamina** (sprint/dash, stamina-gated climb) and a few **elemental world interactions** reusing the §3 condition/terrain system: pyro burns brush and rope bridges to open paths, hydro+cryo freezes water into walkable platforms, electro powers shrine puzzles. Keep it region-flagged and minimal — flavor, not a second game.

Resonance is done when: a headless sim applies an element, a second element fires the correct table reaction, and reaction damage / Freeze / Superconduct-shred resolve deterministically for a fixed seed; resonance buffs apply and clear as party composition changes (unit test); a swapped-out hero's zone keeps ticking; data lint validates every hero/ability `element` tag and proves every reaction-table entry composes from known primitives; the boundary check stays green; and gyms/Elite Five play identically with the layer toggled on. Demo (60s): build a Pyro+Hydro party, Vaporize a creep pack, swap-Freeze a tanky elite, and feel the Pyro resonance attack buff in the damage numbers.

#### Feel pass — gameplay, animation, sound

A combat-feel sweep over the micro layer (§6), applied game-wide:

- **Attack-move and order polish.** Add Dota/RTS **attack-move** (`A` then click: move toward the point but auto-acquire and attack the best target in range along the way) and **stop/hold** (`S`), with **shift-queued orders**. This sits alongside the existing right-click move/attack (§6); the keyboard-left / mouse-right muscle memory is preserved.
- **Per-hero attack animations** timed to each hero's `attackPoint` and `baseAttackTime`: melee wind-up → strike → backswing, ranged draw → release with the projectile spawned exactly on the attack point, so attack timing reads honestly. Cast animations sync to cast point; channels hold a pose; turn rate drives facing before the swing.
- **Hit, crit, and death feedback.** Impact flashes, hit reactions, crit emphasis, screen shake on big hits, per-hero death animations, and **floating combat text** (damage numbers, last-hit/deny cues, gold/XP pops).
- **Sound.** A real SFX layer that supersedes the tiny procedural P4 WebAudio: positional per-hero attack / cast / ability / death sounds, footsteps, hit impacts, item actives, UI clicks, capture/badge stingers, plus region ambience beds and light music. Spatialized in the gameplay view, mixed with a master/SFX/music volume settings group.

Feel pass is done when: attack-move (`A`-click) and stop (`S`) work with shift-queued orders; every shipped hero has attack/cast/run/death animation timed to its `attackPoint`/`BAT`; the SFX layer plays positional attack/cast/hit/death/ability/item sounds with working volume controls; floating damage numbers and hit feedback render in the gameplay view.

#### Graphics overhaul — Dota-faithful heroes

Heroes stop being primitive silhouettes and become recognizable Dota 2 characters. The target is **resemblance, not replication** — an exact match is impossible and explicitly not wanted; a hero just needs to read clearly as itself.

- **Resemblant hero models.** Replace the primitive `HeroModelBuilder` output with detailed, rigged 3D models that **evoke** each hero's Dota 2 look — recognizable silhouette, gear, weapon, and colors at action-RPG scale, named on sight by a Dota player. Creeps and bosses get the same treatment at lower priority. Keep written content original; this is visual resemblance only.
- **Real asset pipeline.** glTF/GLB models plus textures and skeletal animation clips per hero (idle / run / attack / cast / channel / death and signature ability clips), loaded async with LOD and instancing. Add a loader (three's `GLTFLoader`) and any supporting deps, each logged in `DECISIONS.md`. Item `appearance` geo (§5) attaches to named model sockets.
- **Rendering quality.** PBR-style materials with normal/emissive maps, improved lighting and shadows, rim light, and a post-processing stack (bloom, ambient occlusion, color grading, tonemapping). Upgrade the 12 VFX archetypes (§2) to richer particle/shader work while keeping their data-parameterized contract.
- **Environment.** Real biome terrain materials, vegetation, water, and per-biome skyboxes, all relit by the day/night cycle (§3).
- **Performance.** Hold the §0 budget — 60fps with 30 active units and ~200 live projectiles/particles — via LOD, instancing, frustum culling, texture atlases, and an asset-streaming budget. The headless core (§1.1) is untouched: models and animation are engine-side and driven by sim events.

Graphics overhaul is done when: at least the Phase 1 starter heroes ship as recognizable, rigged Dota-likeness models with skeletal animation loaded through the async pipeline; the post-processing stack is in; item geo attaches to model sockets; and the §0 60fps budget holds with 30 units on screen.

## 10. PRINCIPLES (aspirations, not rules)

Crunch mode — nothing here blocks shipping. These are the things that have made the game good; lean on them when they help, drop them when they don't:

- Faithful Dota kits, items, and lore; writing new in-character lines (rather than pasting Valve/Blizzard text) keeps it original and is the safer default.
- Data-driven where it's convenient: heroes/items/quests as data files read by generic interpreters, abilities composing from the §2 vocabulary, exotics for the rest.
- A headless, deterministic combat core shared by both layers makes testing cheap.
- Heroes singleton; creeps duplicable and mergeable; echoes unlock talents; dupes stay useful.
- Runs in the browser from `npm run dev`. Use procedural visuals or real assets — whatever looks best; heroes should resemble their Dota 2 counterparts (recognizable, not identical).
- Ship playable builds often.

