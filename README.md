# Ancients

> *The Mad Moon broke. Its shards remember every war.*

> **Status: unstable, close to unplayable.** The game does not currently hold together end to end. Fable was removed, and a round of bug fixes applied through the Opus and GPT agent harnesses broke a lot of things in the process. Expect crashes, broken flows, and features that no longer work as the rest of this README describes. Treat the descriptions below as the design target, not the current behavior, until the codebase is stabilized again.

> **Note:** This is a Workday project for the Agentic Software Development Lifecycle. It exists primarily to stress test and understand the capabilities of new model releases for Agent architectural development, using the Cursor agent and its long-running harness as the testbed — a large, evolving codebase for exploring how AI agents plan, build, test, and maintain software over time. The game is the vehicle, not the goal, and right now the vehicle is up on blocks.

Ancients drops the whole cast of **Dota 2** into an open world and lets you walk it. It is a browser-based 3D action RPG that fuses three games into one: the heroes, spells, items, and lore of Dota 2, the overworld of **Pokémon** (explore, capture, earn gym badges, climb an Elite ladder), and the loot loop of **Diablo 2** (boss runs, drops, builds). On top of that sit **WoW**-style raids and a **Genshin**-style elemental party layer. You cross one continent, bind a roster of over a hundred heroes, farm the gear that makes them sing, and fight on two layers at once: real-time action combat out in the world, and 5v5 auto-resolved battles at the gyms.

And it all runs in a browser tab from `npm run dev`, with no game engine. Vite, Three.js, and vanilla TypeScript do every bit of the work. Each hero, item, creep, and region is a plain data file read by generic systems, so most new content is data, not code. Visuals render from procedural models and generated icons by default, with a glTF pipeline ready to drop in higher-fidelity hero models when assets are present.

## The story

The title line is the real Dota 2 creation myth, played straight. One mind shattered at its birth into the Radiant, the Dire, and Zet. The first two could not stop warring, so Zet sealed them inside a crystal sphere, the Mad Moon. They cracked it open from the inside, and its shards rained across the world. Each shard remembers every champion who ever fought there: every Juggernaut who danced his blade, every Pudge who threw his hook.

You are a binder. Touch a shard and you draw that champion out to fight beside you instead of being possessed by one. That is what recruiting is. You gather the broken Moon back together one war at a time, earn eight badges, and descend region by region to the Mad Moon Crater, where the Tower of the Ancients rises and Roshan sleeps below. Avaryn the Twice-Crowned waits at the top, the binder who came before you and froze the war into a rule she alone keeps. Beat her and you answer Zet's question: end the war, keep the game turning, or break the Loop and let the world out.

Other things hear the Moon ring, and claimants cross from neighboring worlds for the prize at the planet's heart. A Blizzard veteran will know them by silhouette before name: the Renegade Marshal, the Void Prelate, the Forsaken Queen, the Lords of Hatred and Destruction. The big beats play out in directed cut-scenes, every one skippable, fast-forwardable, and replayable from the codex. The full plan lives in `STORY.md`.

## What's in the game

This describes the intended game. On paper, one fresh save carries you through eight gym badges, four raid clears, the Elite Five draft, and the Champion fight at the Tower. In its current state that path is broken in places: see the status note at the top. The content below is built out, but recent harness-driven fixes left several systems in a state where they crash or misbehave, so treat this as the target rather than a promise of what works today.

**Roster and content**

- **122 heroes**, each a faithful Dota kit: four abilities, a talent tree, a facet, original in-character barks, and a recruitment quest of its own. Every one carries an Aghanim's Scepter and Shard upgrade, so a hero you recruited in the first hour can headline a raid in the last.
- **176 Dota items** on real recipes, with the passives and actives you remember, plus **12 original ANCIENTS-native relics** that serve the loops Dota never had: party-XP banners, capture tools, swap-combo batteries, traversal gear, and dual-Aghs chase relics. Round it out with **15 neutral items** in a dedicated slot, socketable gems, item sets, rolled affixes, and a Tinker's Bench for rerolls and enchants.
- **36 catchable creeps**, from kobolds to ancients, each fighting with its real Dota abilities. Weaken one, bind it, merge three into a star, and field it in your overworld entourage.
- **10 regions** across one continent, every one gated behind a badge and packed with a town, a shop, wild spawns, hero echoes, bosses, and a gym.
- **8 gyms**, an **Elite Five** draft gauntlet, and a final **Champion** fight at the Tower of the Ancients.
- **41 bosses and mini-bosses** across Normal, Nightmare, and Hell tiers, each with its own themed loot table to chase.
- **11 raid bosses**, from Roshan's Pit to the Outworld Claimants who crossed worlds for the prize at the planet's heart.
- **4 dungeons** with multi-room descents and affixes, plus an endless escalating mode on daily and weekly seeds.

**Systems**

- A deterministic combat core running at a fixed 30 Hz, fully walled off from the renderer. The same core drives both combat layers, so a complete 5v5 battle resolves inside a unit test in milliseconds.
- **Micro combat**: real-time action out in the world. One hero in your hands, a party of five behind you, swaps on `1-5`, and the Diablo rhythm of farm, boss run, drop, repeat. Units route around buildings and each other with grid pathfinding and a real collision footprint, so they squeeze through gaps and stop at walls instead of sliding through them.
- **The swap is a verb**: tapping `1-5` tags a hero in with an arrival beat keyed to that hero and their gear, a heal, a burst, a team buff, a cleanse, or a shield. With Resonance on it plays as a Genshin-style tag-in: the outgoing hero's summons keep fighting from the bench and their channeled spells keep ticking, and chaining swaps inside a short window stacks an amp meter. An optional charge meter lets you double-swap fast and then wait for the refill.
- **Macro combat**: 5v5 gym and Elite battles that resolve on the core. You **draft** a five from your recruited roster against each leader's composition rules, **place** them on a 4x4 deployment board where reach, AoE footprints, and spacing decide the fight (with archetype-driven placement hints and one-tap doctrines), write each hero a **gambit** rule list, then spend **Captain Calls** to seize direct control for a few seconds and land the wombo yourself. One shared brain drives every fight: it reads each spell into an archetype and each item into a role playbook, and plans a step ahead, so a disabler's lockdown sets up the nuker's burst and the team holds a Blink or a Black King Bar until the moment it pays off.
- **The leader drafts against you**: each gym leader and Elite member is a captain who bans *your* heroes from your recruited roster, counter-drafts their own five, and bans harder every round, going for the five that just beat them. You get a small, difficulty-scaled repick budget and no bans of your own. Depth is the only answer, so the whole 122-hero collection finally has a job: a one-trick roster runs out of legal fives, and a deep bench wins the series.
- **Capture and merge**: weaken a creep, channel a Binding Totem, and add it to your collection. Three copies merge into a star upgrade, and you can field up to three caught creeps as an AI entourage. Summoner heroes like Chen and Nature's Prophet turn the overworld into a walk-the-map-with-an-army playstyle.
- **Recruitment**: every hero follows a three-beat chain of Find, Trial, and Bind, with 15 trial kinds (honor duels, stealth hunts, combo exams, faction choices, reputation gates, and more). Losing a Bind relocates the hero rather than failing the quest.
- **Quests and bounties**: a quest board that runs alongside recruitment, with recurring per-region bounties, multi-step story chapters, timed contracts, and branching choice-quests that pay distinct titles. The board floats your current region to the top as you travel.
- **Hero echoes**: farmable boss-fragments of every hero. Beating echoes advances recruitment, unlocks talent branches and facet swaps, and pays gold and XP bounties, so duplicates always matter.
- **Loot quality**: items roll a quality grade (Standard, Inscribed, Genuine, Frozen, Corrupted, Unusual) and a rarity tint, and a cross-activity pity track guarantees the chase lands eventually. An Armory holds bound loot per hero with saveable loadouts so a benched draft pick is fight-ready in one click, a Black Market sells gated recipes and relics, and salvaged gear becomes essence you spend to upgrade quality.
- **Resonance**: a Genshin-style elemental layer that runs in the overworld and raids, on by default. Seven elements apply to enemies and react when they overlap (Vaporize, Melt, Freeze, Superconduct, and others), and a party that shares an element gains a team-wide resonance buff. Elemental **weather** sweeps some regions on the day/night clock, and **domains** and **ley-line** outcrops offer element-gated challenge runs. The hero kits and items stay Dota-faithful underneath it, and gyms and the Elite Five are always pure Dota. Purists can flip one setting to drop the layer entirely.
- **Exploration**: verticality you can climb, glide, and swim through on a stamina budget, plus a Field Kitchen where cooked dishes heal a party, grant a timed buff, or revive a fallen hero out of combat.
- **World Level**: a danger-and-reward dial you opt into. Featured encounters (rares, ancients, ley-line packs, echoes, bosses, raids) scale up the combat texture, shields, and affixes that demand a clean reaction or swap-combo, and pay better loot grades for it, while ordinary trash you have outgrown still melts. Turn the heat up for richer drops and a real fight, or leave it at zero to keep outscaling the map on the same numbers you already know.
- **Trainer track**: an account-wide progression spine that gives your whole collection a payoff. Overflow XP past a hero's cap, exploration, captures, recruitment, and echo-perfects all feed a Trainer level and a meta board of access, economy, and convenience unlocks (a wider entourage, faster captures, fast travel, extra merchant restocks). The board is a set of dials, never a stat stick, so the macro battles stay a test of drafting and play.

**Presentation**

- A Three.js overworld with two camera modes: a tilted map view for travel and an angled follow camera for combat and towns. Press `M` to toggle.
- A PBR rendering path with bloom, ambient occlusion, color grading, and tonemapping, plus a day/night cycle, animated water, and per-biome skies. Quality scales across tiers and can be tuned live in settings. Distant crowds drop to impostors and far units shed animation work to keep a busy field smooth, and a battle-scale dial trades overworld army size for frames.
- Hero-specific likeness overlays, item appearance geometry that wears on the model, and attack-animation overrides that read an item's identity on sight.
- Every unit, building, prop, and ambient critter is sized from one real-world meter scale, so a courier reads small, a hero reads human, and Roshan reads like a mountain.
- A procedural audio layer that synthesizes per-hero attack, cast, and ability sounds keyed off each ability's sound archetype, with stingers for capture, level-up, merges, and badges. Each biome carries its own music bed under exploration, on a separate music volume slider.
- A minimap, quest journal, an encounter-gated codex that fills in as you meet heroes, regions, items, creeps, and raids, and a Cinematics gallery that replays seen cut-scenes.
- A combat-readability overlay (cast bars, boss threat and taunt, shared-focus and ult-ready cues) and a colorblind-safe rarity palette, both optional in settings.

The combat core stays headless: it never imports Three.js or touches the DOM. Over 5,700 headless tests across more than 100 files cover data linting, combat determinism, pathfinding and collision, capture and merge, saves and migrations, gym and raid simulation, the combo-planning AI, the asymmetric Captains draft, the deployment board and draft formats, tag-in swaps, resonance, World Level scaling, the Trainer meta board, native items, quests, dungeon generation, loot quality, traversal, and a full critical-path playthrough, backed by a Playwright browser smoke suite.

Design targets live in `SPEC.md`, current acceptance status in `PROGRESS.md`, and implementation calls in `DECISIONS.md`. The overhaul and design docs (`docs/design/GAMBIT_AI_OVERHAUL.md`, `docs/design/SWAP_COMBAT_OVERHAUL.md`, `docs/design/LOOT_OVERHAUL.md`, `docs/design/DUNGEON_OVERHAUL.md`, `docs/design/GRAPHICS_SPEC.md`, and others) track the work past the original phase plan.

## Requirements

- Node.js 20 or newer
- npm
- A WebGL2-capable desktop browser, targeted at current Chrome

On Windows, follow `WINDOWS.md` for install steps and a few platform-specific fixes.

## Setup

```sh
npm install
```

## Run

```sh
npm run dev
```

Open the Vite URL in your browser, start a new game, and choose a starter hero.

## Useful commands

```sh
npm test          # run the vitest suite
npm run build     # typecheck and build the Vite app
npm run typecheck # run TypeScript without emitting
npm run test:e2e  # run the Playwright browser smoke suite
npm run assets:check  # build the asset manifest and check size budgets
```

## Controls

- Right-click ground: move
- Right-click unit: attack or interact
- `Q/W/E/R`: hero abilities
- `D/F`: extra active ability slots, when available
- `Z/X/C/V`: item actives
- `N`: neutral item active
- `1-5`: swap active party hero
- `A` then click: attack-move
- `Shift` while ordering: queue the order
- `S`: stop/hold
- `Space`: dash; `Alt` (hold): sprint
- `T`: channel Binding Totem on a weakened creep
- `G`: interact with nearby gates, gyms, portals, and climb/glide points
- `B`: shop while in town
- `Y`: Town Services (boss reruns, Tinker's Bench, Armory, Field Kitchen, gold sinks)
- `Tab`: party, inventory, and caught creep panel
- `H`: character sheet
- `J`: quest journal
- `K`: codex
- `M`: toggle map view
- `F5`: quicksave
- `Esc`: pause, save, and load

Quick-cast is enabled by default, and every key is rebindable in settings.

## 60-second demo

1. Run `npm run dev`, open the local Vite URL, click **New Game**, and pick Juggernaut.
2. In the starter town, press `B`, open **Components**, buy **Blink Dagger**, close the shop, and press `Z` at the cursor to blink.
3. Right-click a recruitable hero to Find, complete their Trial, then win the Bind duel to recruit them.
4. Press `Tab` to set gambit presets, inspect echo progress, and swap facets after an echo unlock.
5. Weaken a kobold below 30% HP, channel the Binding Totem with `T` to capture it, then field it from the party panel.
6. Travel through a gate with `G`, challenge a gym, and confirm that badges, party, inventory, and region all persist through save and load.

## Architecture

```text
src/core/     deterministic combat simulation, stats, statuses, items, capture, AI, progression
src/data/     heroes, items, creeps, regions, raids, dungeons, tuning, and content registration
src/engine/   Three.js scene, camera, procedural models, terrain, animation, VFX, audio, icons
src/systems/  game orchestration, input, debug tools, save/load, overworld and session state
src/ui/       title screen, HUD, panels, and styles
src/test/     vitest suites for core behavior, data, saves, boundaries, and simulations
```

The core rule is that `src/core/` stays headless: it does not import Three.js or touch the DOM. Rendering and UI consume core state, while tests run combat and progression logic without a browser.

Content is data-driven. Adding heroes, items, creeps, or regions mostly means adding definitions under `src/data/`, with generic systems interpreting those definitions.

## Project constraints

- Browser only, single-player only.
- Vite, Three.js, TypeScript, and Vitest, with no game engine.
- Procedural visuals and generated icons stay as the always-available fallback; glTF models replace hero rigs when assets are present.
- Dota mechanical identity is the bar: a Dota player should recognize a hero's kit and an item's purpose on sight, even when numbers are retuned for action-RPG pacing.
- All written content is original and in-character. The game evokes Dota and its cousins without copying their text or assets.
- `npm test` should stay green after content and systems changes.

## Credits

Assets are either made in-repo or licensed under Creative Commons. This is a non-commercial project, so that includes NonCommercial and ShareAlike licenses as well as CC0 and CC BY. We credit every downloaded asset and never use Valve or Blizzard files. Item icons come from [game-icons.net](https://game-icons.net) (Lorc, Delapouite, and contributors) under CC BY 3.0. See [`CREDITS.md`](./CREDITS.md) for attributions and [`ASSETS.md`](./ASSETS.md) for the per-file license record.
