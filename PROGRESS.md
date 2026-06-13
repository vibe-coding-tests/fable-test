# PROGRESS

Read this first each session, then `DECISIONS.md`, then run `npm test`.

## Current phase: 5 — COMPLETE

### Phase 1 checklist (SPEC §9)

| # | Item | Status |
|---|------|--------|
| 1 | `npm run dev` → pick a starter | PASS |
| 2 | Kill and catch a kobold | PASS |
| 3 | Field it as a companion | PASS |
| 4 | Buy and use Blink | PASS |
| 5 | Swap heroes mid-fight | PASS |
| 6 | Manual-save to a slot, reload, state intact | PASS |
| 7 | Tests: data lint | PASS |
| 8 | Tests: core boundary check (no three/DOM in core) | PASS |
| 9 | Tests: synthetic-hero sim | PASS |
| 10 | Tests: fixed-seed 5v5 headless, same winner every run | PASS |
| 11 | Tests: capture + merge unit tests | PASS |
| 12 | 60-second demo script below | PASS |

### 60-second demo script

1. Run `npm run dev`, open the local Vite URL, click **New Game**, then pick Juggernaut.
2. In Dawnshade, press `B`, open **Components**, buy **Blink Dagger**, close the shop, and press `Z` at the cursor to blink.
3. Right-click Pudge just north of town to recruit him, then press `2` to swap to Pudge and `1` to swap back after the cooldown.
4. Move northeast to the tutorial kobold camp. Right-click a kobold to fight it, weaken one below 30% HP, hover/select it, then press `T` to channel the Binding Totem until capture completes.
5. Press `Tab`, click **Field** on the captured Kobold, close the party panel, and watch it follow/fight as an AI companion.
6. Press `M` to show map mode markers, then press `Esc` → save to Slot 1 → load Slot 1. Gold, position, party, inventory, caught creeps, and fielded companion remain intact.

### Phase 2 checklist (SPEC §9)

| # | Item | Status |
|---|------|--------|
| 1 | Gyms 1–2 beatable end-to-end with player-authored gambits | PASS |
| 2 | Echo kill visibly unlocks a talent branch | PASS |
| 3 | All 6 recruitment trials completable | PASS |
| 4 | Tests: silence interrupts channel | PASS |
| 5 | Tests: BKB blocks stun | PASS |
| 6 | Tests: Euls disjoints projectile | PASS |
| 7 | Data lint covers grown roster | PASS |

### Phase 2 demo script

1. Run `npm run dev`, start a new game, recruit enough Vale heroes by right-clicking them three times to Find → Trial → Bind, then defeat their Binding Echoes.
2. Press `Tab`, set a few hero gambits to **Aggro** or **Safe**, and note echo progress/facet controls in the party panel.
3. Fight a hero echo marker on the map; killing an owned hero echo unlocks facet swapping and the next opposite talent branch.
4. Travel through the northern Tranquil Vale gate with `G` into Nightsilver Woods, recruit/fight regional heroes, and challenge the Lunar Gym with `G` at its marker.
5. After the Lunar Badge, use the Frost Road gate to Icewrack, then challenge the Frost Gym.
6. Save/load via `Esc`; badges, region, quests, gambits, echo progress, party, and inventory persist.

### Phase 3 checklist (SPEC §9 / phase3 spec)

| # | Item | Status |
|---|------|--------|
| 1 | Data lint proves ≥60 heroes, ≥50 items, ≥30 creeps, 10 regions, 8 gyms, recruitment chains | PASS |
| 2 | Aghs implemented for ≥15 heroes | PASS |
| 3 | Kit smoke executes every hero ability and every item active at levels 1 / 15 / 30 | PASS |
| 4 | Boss / mini-boss difficulty tiers, loot tables, pity, and Nightmare/Hell gates | PASS |
| 5 | Four raids registered with phase mechanics, add waves, zones, enrage, loot, and headless runs | PASS |
| 6 | Elite Five draft and Champion data registered; deterministic draft test passes | PASS |
| 7 | Day/night effects for Night Stalker, Luna, and night vision | PASS |
| 8 | Neutral items, Tinker Bench reroll/enchant, buyback/Tome/respec gold sinks | PASS |
| 9 | Save v3 migration and round-trip for Phase 3 fields | PASS |
| 10 | Tests/build/browser smoke | PASS |

### Phase 3 demo script

1. Run `npm run dev`, start a new game, and confirm the title screen, starter selection, and in-game HUD load.
2. Inspect the ten-region map/data path through badge-gated routes from Tranquil Vale to Mad Moon Crater.
3. Re-run a registered boss on Nightmare/Hell in headless tests to see scaled rewards, guaranteed components, assembled drop chance, and pity.
4. Run the raid definitions from tests: Roshan's Pit, Lord of Terror, Frost-Crowned King, and Queen of Blades all produce mechanics timelines and decisive headless results.
5. Run the Elite Five draft helper against the recruited roster to produce legal 5v5 teams and the Champion gate.
6. Use neutral item tests to verify tiered drops, in-tier rerolls, three-duplicate enchant, and no direct gold purchase of gated power.
7. Toggle day/night helpers to see Night Stalker and Luna bonuses and the tightened night vision radius.

### Phase 4 checklist (SPEC §9)

| # | Item | Status |
|---|------|--------|
| 1 | Item appearance schema, data lint, and renderer-only consumption | PASS |
| 2 | Weapon-class item swaps on equipped hero model | PASS |
| 3 | Armor/aura/part overlays on equipped hero model | PASS |
| 4 | ≥6 item attack-animation overrides and composable on-attack VFX | PASS |
| 5 | Boundary check: `/src/core/` does not read visual metadata | PASS |
| 6 | Minimap canvas dots for region POIs and active hero | PASS |
| 7 | Quest journal and codex panels | PASS |
| 8 | Balance pass from Dota baselines via `tuning.ts` | PASS |
| 9 | Tiny procedural WebAudio SFX | PASS |
| 10 | Performance pass against budget | PASS |

### Phase 4 demo script

1. Run `npm run dev`, start or load a game, and buy/equip visible items from Dawnshade such as Boots, Platemail, Dragon Lance, Battlefury, Crystalys, or Maelstrom.
2. Confirm equipment updates the hero model: Boots leave a ground trail, Platemail adds pauldrons, Dragon Lance swaps in a long pole, Battlefury swaps in a broad cleaver, and Maelstrom adds a storm haft/aura.
3. Attack a nearby camp with two override items equipped, for example Battlefury + Maelstrom, and confirm the cleave sweep and lightning attack VFX compose on the same attack event.
4. Use the minimap to orient around town, camps, gates, hero spawns, echoes, and the active hero marker.
5. Open **Journal** or press `J` to view current regional recruitment leads; open **Codex** or press `K` to read known heroes, regions, and visible-power item lore.

### Phase 5 checklist (SPEC §9)

| # | Item | Status |
|---|------|--------|
| 1 | Optional Resonance mode setting, saved and disabled by default | PASS |
| 2 | Hero/ability element tags cover the registered roster | PASS |
| 3 | Generic reaction table resolves Vaporize, Melt, Overload, Superconduct, Electro-Charged, Freeze, Swirl, Crystallize, and Burning | PASS |
| 4 | Headless sim tests apply elements and verify Vaporize, Freeze, and Superconduct deterministically | PASS |
| 5 | Party elemental resonance buffs apply through the existing stat path; Harmony fallback exists | PASS |
| 6 | Resonance quick-swap relaxes swap cooldown and cooldown-floor rules without changing base mode | PASS |
| 7 | Attack-move (`A`-click), stop (`S`), and shift-queued move/attack/cast/item orders | PASS |
| 8 | Floating combat text, hero-aware hit feedback, and richer event-driven procedural SFX | PASS |
| 9 | Phase 5 starter-hero glTF manifest plus actual hero-specific procedural likeness overlays | PASS |
| 10 | Performance budget constants, pixel-ratio clamp, and transient VFX cap | PASS |

### Phase 5 demo script

1. Run `npm run dev`, start or load a game, open `Esc` → **Menu**, and enable **Resonance mode**.
2. Build or recruit an elemental party such as Lina + a Hydro hero, then fight a camp in the overworld.
3. Apply Hydro then Pyro to trigger **Vaporize**, or Hydro then Cryo to trigger **Freeze**; reaction events produce floating numbers/SFX.
4. Use `A` then click past a camp to attack-move into it; hold `Shift` while issuing a second move/cast/item order to queue it.
5. Equip Maelstrom or Eye of Skadi to see item attacks supply Electro/Cryo reaction hooks alongside their Phase 4 attack visuals.
6. Confirm the graphics path still renders procedural heroes when `/assets/heroes/*.glb` is absent; the Phase 5 manifest is ready for starter-hero GLBs.

## Session log

- 2026-06-12: Project bootstrapped (Vite + TS + vitest + three). Core sim, data, tests, engine, UI under construction.
- 2026-06-12: Phase 1 acceptance pass: `npm test` (8 files, 166 tests) and `npm run build` green; browser smoke verified starter, shop/Blink, save/load, map mode, capture event, companion fielding, recruit, and hero swap.
- 2026-06-12: Content/visual pass: roster 6 -> 9 with Luna, Sven, Axe; item catalog +10 entries/components with Yasha, Sange, Kaya, Dragon Lance, Morbid Mask, Mask of Madness, Hyperstone, Platemail, Ultimate Orb; smoother procedural unit geometry. `npm test` green (8 files, 196 tests) and `npm run build` green.
- 2026-06-12: Phase 2 kickoff: added persisted owned-echo progress, first-echo facet unlock state, and echo talent tier unlocks that apply the opposite branch through `buildHero`. `npm test` green (9 files, 201 tests).
- 2026-06-12: Phase 2 systems pass: roster 20, creeps 12, regions 3, echo spawns, Find→Trial→Bind recruitment, badge-gated travel, Lunar/Frost gyms, gambit presets, Captain Calls in macro gym rounds, and Phase 2 data lint/tests. `npm test` green (10 files, 289 tests).
- 2026-06-12: Phase 3 content pass: roster 64, items 60+, creeps 36, regions 10, gyms 8, bosses/raids/draft/neutral-item registries, difficulty loot, reward scaling, gold sinks, day/night modifiers, and save v3. `npm test` green (12 files, 631 tests), `npm run build` green, Playwright smoke verified title → starter → HUD.
- 2026-06-12: Phase 4 polish slice: item appearance/attackVisual metadata, renderer-only equipment overlays, composable attack VFX, minimap, quest journal, codex, and lint coverage for Phase 4 visuals. `npm test` green (12 files, 633 tests), `npm run build` green, and Playwright smoke verified title → starter → HUD/minimap → Journal/Codex buttons and J/K shortcuts.
- 2026-06-12: Optimization pass slice: added `OPTIMIZATION_SPEC.md`, headless perf budget + at-scale determinism tests, deterministic spatial broadphase for local sim queries, in-place compaction for projectiles/zones/repeaters, sqrt-free radius checks in hot paths, render projectile sync allocation trim, and a fixed-step hitch clamp. `npm test` green (14 files, 647 tests), `npm run build` green.
- 2026-06-12: Optimization continuation: added dirty/deadline-cached unit stat refresh with direct-mutation safeguards, cache tests for item stat changes and invis fade timing, and procedural model geometry canonicalization with engine cache coverage.
- 2026-06-12: Optimization finish pass: VFX reusable-geometry cache and in-place transient compaction, mesh-based HP/mana bars replacing per-unit canvases/textures, renderer quality presets for DPR/shadows/VFX caps, and movement/collision regression tests.
- 2026-06-12: Phase 4 closure + Phase 5 finish: balance/audio/performance hooks, optional Resonance mode, element/reaction table, resonance buffs, item element hooks, attack-move/stop/shift-queue controls, procedural SFX, performance budget/VFX cap, and starter-hero glTF asset pipeline. `npm test` green (13 files, 641 tests).
- 2026-06-12: Phase 5 fidelity hardening: hero-specific procedural likeness overlays for Juggernaut, Crystal Maiden, Pudge, Earthshaker, Sniper, Lich, Luna, Sven, and Axe; richer item geometry for Crystalys/Scythe/Aghs plus existing visible items; hero/range-aware attack/cast animation branches; upgraded WebAudio envelopes; inline favicon; non-deprecated shadow maps. `npm test` green (13 files, 642 tests), `npm run build` green, Playwright QA on fresh Vite server verified title → starter → in-game HUD/menu/Resonance toggle/WebGL canvas and zero console errors/warnings.
- 2026-06-12: Presentation-spec reward slice: kill/last-hit/overflow/echo/sell gold now emits one presentation event, coin SFX uses a 1.5s pitch ladder, gold flies to an animated count-up counter with streak badge, last-hit gold calls out +15%, and crits get larger magnitude-scaled text plus a sharper impact sound. `npm run typecheck` green; focused boundary/save/phase2 tests green.
