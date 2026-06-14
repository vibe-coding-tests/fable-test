# Ancients

> *The Mad Moon broke. Its shards remember every war.*

Ancients drops the whole cast of **Dota 2** into an open world and lets you walk it. It is a browser-based 3D action RPG that fuses three games into one: the heroes, spells, items, and lore of Dota 2, the overworld of **Pokémon** (explore, capture, earn gym badges, climb an Elite ladder), and the loot loop of **Diablo 2** (boss runs, drops, builds). On top of that sit **WoW**-style raids and a **Genshin**-style elemental party layer. You cross one continent, bind a roster of over a hundred heroes, farm the gear that makes them sing, and fight on two layers at once: real-time action combat out in the world, and 5v5 auto-resolved battles at the gyms.

And it all runs in a browser tab from `npm run dev`, with no game engine. Vite, Three.js, and vanilla TypeScript do every bit of the work. Each hero, item, creep, and region is a plain data file read by generic systems, so most new content is data, not code. Visuals render from procedural models and generated icons by default, with a glTF pipeline ready to drop in higher-fidelity hero models when assets are present.

## The story

That line on the title screen is not flavor we made up. It is the real Dota 2 creation myth, played straight, and the whole game grows out of it.

Before the world began there was one mind, and its birth shattered it. Three great fragments woke with names: the Radiant, the Dire, and Zet, who saw the other two as its own lost selves. The Radiant and the Dire could not stop warring, so Zet spent its own power to seal them together inside a crystal sphere, the Mad Moon. The two raged until they cracked it open from the inside. Its shards rained across the world, and where they fell, magic bloomed and the war soaked into the ground.

Here is the part that turns the myth into a game. In Dota's canon, every match is real, and each time an Ancient dies the timeline resets and the war starts over. This is the Loop, and the shards remember every turn of it. They hold the imprint of every champion who ever fought: every Juggernaut who danced his blade, every Pudge who threw his hook. Touch a shard and that champion projects out to fight you the way they always have.

You are a binder, one of the few who can hold a shard without it taking you over, so you can draw a champion out instead of being possessed by one. That is what recruiting really is. You do not collect heroes, you gather the broken Moon back together one war at a time, and every hero you bind is a memory you carry forward.

The eight badges are your descent. Crossing the map walks you deeper into the Loop, region by region, until you reach the Mad Moon Crater where the Tower of the Ancients rises and Roshan sleeps below. Waiting there is Avaryn the Twice-Crowned, the binder who came before you and stopped. She took a crown of the Radiant and a crown of the Dire, sworn opposites, and froze the war into a rule she alone keeps. Beat her and the game poses Zet's own question: reunite the Ancients and end the war, keep the eternal game turning, or break the Loop and let the world out for good.

Other things hear the Moon ring. The seal that held the Ancients thinned when it broke, and claimants cross over from neighboring worlds for the only prize worth the trip. A Dota player will know them. A Blizzard veteran will know them too, by silhouette before name: the Renegade Marshal, the Void Prelate, the Forsaken Queen, the Lords of Hatred and Destruction.

The big beats earn the screen instead of a toast sliding past the HUD. A bind, a boss breaking, a raid opening, the crown at the Tower all play out in directed cut-scenes that stage the world's own lines, and every one of them is skippable, fast-forwardable, and replayable from the codex. The full plan lives in `STORY.md`.

## What's in the game

This is a full game, playable start to finish right now. A fresh save runs all the way through eight gym badges, four raid clears, the Elite Five draft, and the Champion fight at the Tower, with nothing stubbed out and nothing blocking the path.

**Roster and content**

- **122 heroes**, each a faithful Dota kit: four abilities, a talent tree, a facet, original in-character barks, and a recruitment quest of its own. 19 already carry their Aghanim's upgrade.
- **145 items** built on real Dota recipes, with the passives and actives you remember, plus **15 neutral items** in a dedicated slot and a Tinker's Bench for rerolls and enchants.
- **36 catchable creeps**, from kobolds to ancients, each fighting with its real Dota abilities. Weaken one, bind it, and it joins your collection.
- **10 regions** across one continent, every one gated behind a badge and packed with a town, a shop, wild spawns, hero echoes, bosses, and a gym.
- **8 gyms**, an **Elite Five** draft gauntlet, and a final **Champion** fight at the Tower of the Ancients.
- **41 bosses and mini-bosses** across Normal, Nightmare, and Hell tiers, each with its own themed loot table to chase.
- **10 raid bosses**, from Roshan's Pit to the Outworld Claimants, guests who crossed worlds for the prize at the planet's heart.
- **4 dungeons** with multi-room descents and affixes, plus an endless escalating mode on daily and weekly seeds.

**Systems**

- A deterministic combat core running at a fixed 30 Hz, fully walled off from the renderer. The same core drives both combat layers, so a complete 5v5 battle resolves inside a unit test in milliseconds.
- **Micro combat**: real-time action out in the world. One hero in your hands, a party of five behind you, instant swaps on `1-5`, and the Diablo rhythm of farm, boss run, drop, repeat.
- **Macro combat**: 5v5 gym and Elite battles that resolve on the core. You write each hero a **gambit** rule list before the fight, then spend **Captain Calls** to seize direct control for a few seconds when it counts.
- **Capture and merge**: weaken a creep, channel a Binding Totem, and add it to your collection. Three copies merge into a star upgrade, and you can field up to three caught creeps as an AI entourage. Summoner heroes like Chen and Nature's Prophet turn the overworld into a walk-the-map-with-an-army playstyle.
- **Recruitment**: every hero follows a three-beat chain of Find, Trial, and Bind, with 15 trial kinds (honor duels, stealth hunts, combo exams, faction choices, reputation gates, and more). Losing a Bind relocates the hero rather than failing the quest.
- **Hero echoes**: farmable boss-fragments of every hero. Beating echoes advances recruitment, unlocks talent branches and facet swaps, and pays gold and XP bounties, so duplicates always matter.
- **Loot quality**: items roll a quality grade (Standard, Inscribed, Genuine, Frozen, Corrupted, Unusual) and a rarity tint. An Armory holds bound loot per hero with saveable loadouts, a Black Market sells gated recipes and relics, and salvaged gear becomes essence you spend to upgrade quality.
- **Resonance**: a Genshin-style elemental layer, on by default and reversible to vanilla Dota with one setting. Seven elements apply to enemies, react when they overlap (Vaporize, Melt, Freeze, Superconduct, and others), and a party that shares an element gains a team-wide resonance buff. It runs in the overworld and raids while gyms and the Elite Five stay pure Dota.

**Presentation**

- A Three.js overworld with two camera modes: a tilted map view for travel and an angled follow camera for combat and towns. Press `M` to toggle.
- A PBR rendering path with bloom, ambient occlusion, color grading, and tonemapping, plus a day/night cycle, animated water, and per-biome skies. Quality scales across tiers and can be tuned live in settings.
- Hero-specific likeness overlays, item appearance geometry that wears on the model, and attack-animation overrides that read an item's identity on sight.
- A procedural audio layer that synthesizes per-hero attack, cast, and ability sounds keyed off each ability's sound archetype, with stingers for capture, level-up, merges, and badges.
- A minimap, quest journal, and an encounter-gated codex that fills in as you meet heroes, regions, items, creeps, and raids.

The combat core stays headless: it never imports Three.js or touches the DOM. Over 1,300 headless tests cover data linting, combat determinism, capture and merge, saves and migrations, gym and raid simulation, resonance, dungeon generation, loot quality, and a full critical-path playthrough.

Design targets live in `SPEC.md`, current acceptance status in `PROGRESS.md`, and implementation calls in `DECISIONS.md`. The overhaul and design docs (`docs/design/LOOT_OVERHAUL.md`, `docs/design/DUNGEON_OVERHAUL.md`, `docs/design/GRAPHICS_SPEC.md`, and others) track the work past the original phase plan.

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
- `T`: channel Binding Totem on a weakened creep
- `G`: interact with nearby gates, gyms, and portals
- `B`: shop while in town
- `Y`: Town Services (boss reruns, Tinker's Bench, Armory, gold sinks)
- `Tab`: party, inventory, and caught creep panel
- `J`: quest journal
- `K`: codex
- `M`: toggle map view
- `Esc`: pause, save, and load

Quick-cast is enabled by default.

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
