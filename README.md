# Ancients

Ancients is a browser-based 3D open-world RPG prototype built with Vite, Three.js, and vanilla TypeScript. It blends Dota-style heroes, spells, items, and teamfight decisions with a creature-capture overworld structure and a repeatable action-RPG loot loop.

The project uses no external art assets. Units, terrain, icons, VFX, and UI are generated from code and data.

## Current State

Phase 1 is playable and passing. The current build includes:

- A deterministic, renderer-independent combat core that runs at a fixed 30 Hz.
- One playable region, Tranquil Vale, with a town, shrine, shops, creep camps, recruitable heroes, and map markers.
- Nine data-driven heroes: Juggernaut, Crystal Maiden, Pudge, Earthshaker, Sniper, Lich, Luna, Sven, and Axe.
- Dota-inspired abilities, statuses, items, cooldowns, projectiles, capture, creep merging, entourage fielding, XP, gold, and save/load.
- A procedural Three.js overworld with gameplay and map camera modes.
- Headless vitest coverage for data linting, combat determinism, capture/merge behavior, boundary checks, item identity, saves, and macro simulation.

See `SPEC.md` for the full design target, `PROGRESS.md` for the current acceptance status, and `DECISIONS.md` for implementation calls made along the way.

## Requirements

- Node.js 20 or newer
- npm
- A WebGL2-capable desktop browser, targeted at current Chrome

## Setup

```sh
npm install
```

## Run

```sh
npm run dev
```

Open the Vite URL in your browser, start a new game, and choose a starter hero.

## Useful Commands

```sh
npm test          # run the vitest suite
npm run build    # typecheck and build the Vite app
npm run typecheck # run TypeScript without emitting
```

## Controls

- Right-click ground: move
- Right-click unit: attack or interact
- `Q/W/E/R`: hero abilities
- `D/F`: extra active ability slots, when available
- `Z/X/C/V`: item actives
- `1-5`: swap active party hero
- `T`: channel Binding Totem on a weakened creep
- `B`: shop while in town
- `Tab`: party, inventory, and caught creep panel
- `M`: toggle map view
- `Esc`: pause, save, and load

Quick-cast is enabled by default.

## 60-Second Demo

1. Run `npm run dev`, open the local Vite URL, click **New Game**, and pick Juggernaut.
2. In Dawnshade, press `B`, open **Components**, buy **Blink Dagger**, close the shop, and press `Z` at the cursor to blink.
3. Right-click Pudge north of town to recruit him, then press `2` and `1` to test hero swapping.
4. Move northeast to the tutorial kobold camp. Fight a kobold, weaken it below 30% HP, hover or select it, then press `T` to capture it.
5. Press `Tab`, field the captured kobold, and watch it follow and fight as an AI companion.
6. Press `M` to view map markers, then use `Esc` to save and reload.

## Architecture

```text
src/core/     deterministic combat simulation, stats, statuses, items, capture, AI, progression
src/data/     heroes, items, creeps, regions, tuning, and content registration
src/engine/   Three.js scene, camera, procedural models, terrain, animation, VFX, icons
src/systems/  game orchestration, input, debug tools, save/load, overworld state
src/ui/       title screen, HUD, panels, and styles
src/test/     vitest suites for core behavior, data, saves, boundaries, and simulations
```

The core rule is that `src/core/` stays headless: it does not import Three.js or touch the DOM. Rendering and UI consume core state, while tests can run combat and progression logic without a browser.

Content is intended to be data-driven. Adding heroes, items, creeps, or regions should primarily mean adding definitions under `src/data/`, with generic systems interpreting those definitions.

## Project Constraints

- Browser only, single-player only.
- Vite + Three.js + TypeScript + Vitest, with no game engine.
- Procedural visuals and generated icons only.
- Dota-style mechanical identity matters: abilities and items should feel recognizable even when tuned for action-RPG pacing.
- `npm test` should stay green after content and systems changes.
