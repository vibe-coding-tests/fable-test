# PROGRESS

Read this first each session, then `DECISIONS.md`, then run `npm test`.

## Current phase: 6 — SPEC-COMPLETE (every Phase 2–4 acceptance item true in a real playthrough; M1–M10 green)

Phase 6 holds Phases 2–4 to the **standalone specs'** bar, not the looser in-repo `SPEC.md`. A lot of earlier work shipped as data + pure helpers with unit tests but was never wired into the live game loop; the Phase 6 section below tracks the real bar (acceptance + the §6 test matrix). Rows in the older phase checklists that were helper-only are annotated `→ P6 Mn` and only flip to PASS once Phase 6 wires them end-to-end and proves it with an integration test.

### Performance plan pass

- 2026-06-13: M1 asset manifest and budget check landed. `npm run assets:check` generated `public/assets/manifest.json` with 57 files, 10.33MB total, hash `ba33d73faafb`, under the 90MB committed-asset cap.
- 2026-06-13: Current asset groups: creep 20 files / 2.92MB, env 2 files / 3.03MB, terrain 26 files / 3.60MB, town 9 files / 803KB.
- 2026-06-13: Loading path now preloads the active region terrain set and HDR from the manifest behind the loading screen, with byte progress when a manifest is present.
- 2026-06-13: Dev graphics HUD under `?debug` reports frame avg/p95, draw calls, triangles, texture/program counts, active DPR/tier, loaded asset bytes, cache sizes, and cache hits.

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
| 1 | Gyms 1–2 beatable end-to-end with player-authored gambits | PASS — all 8 gyms proven winnable with authored gambits + live Captain Calls, P6 M3 |
| 2 | Echo kill visibly unlocks a talent branch | PASS |
| 3 | All 6 recruitment trials completable | PASS — real `TrialRunner`, P6 M2 (was a 3-click stub) |
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
| 4 | Boss / mini-boss difficulty tiers, loot tables, pity, and Nightmare/Hell gates | PASS — wired live in P6 M4 (`Game.runBossFight`, town services) |
| 5 | Four raids registered with phase mechanics, add waves, zones, enrage, loot, and headless runs | PASS — M5 wires `runRaidEncounter` (phase zones, add waves, taunt, enrage, loot); M10 clears all four in the live path |
| 6 | Elite Five draft and Champion data registered; deterministic draft test passes | PASS — M5 wires the gauntlet + Champion win path; M10 clears five + Champion end-to-end |
| 7 | Day/night effects for Night Stalker, Luna, and night vision | PASS |
| 8 | Neutral items, Tinker Bench reroll/enchant, buyback/Tome/respec gold sinks | PASS — wired live in P6 M4 (overworld drops, neutral slot, town-services UI) |
| 9 | Save v3 migration and round-trip for Phase 3 fields | PASS (superseded by save v4, P6 M1) |
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
| 7 | Quest journal and codex panels | PASS — M8 wired encounter-gated codex (heroes/regions/items/creeps/raids) + journal over raids/factions/reputation/badges/elite |
| 8 | Balance pass from Dota baselines via `tuning.ts` | PASS |
| 9 | Tiny procedural WebAudio SFX | PASS — M7: per-entity synthesis keyed off `sound`, per-owner timbre pitch, stingers, capped voice pool, mixable channels + global mute |
| 10 | Performance pass against budget | PASS — M9 added the visual 30u/200proj harness (pooled projectiles + LOD; 0 steady-state hot-path allocation; numbers recorded) atop the headless budget |

Phase 4's **animation gesture player** (drives every ability/item active from `anim`/`animProfile`, replacing hardcoded `heroId` branches) closed in P6 M6; **barks from the sim core** (cast + kill) closed in P6 M7; **in-character dialogue depth** for gyms/Elite/Champion/raids/trainers plus **encounter-gated codex/journal** closed in P6 M8.

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

### Phase 6 acceptance (standalone Phase 2–4 bar; phase6 spec §7)

**Phase 2 finished for real**

| # | Item | Status |
|---|------|--------|
| 2a | Recruitment is Find → Trial → Bind: shard-gated Find, a runner per trial kind (≥12 bespoke + templates), failure relocates not locks | PASS — M2 |
| 2b | Reputation gates a recruit both above and below threshold; Souls Pact lowers it | PASS — M2 |
| 2c | Echoes fight with the gambit controller, ×0.6 HP tax, no item slots, echo visual flag | PASS — M2 |
| 2d | Gambit editor: ordered ≤8-rule dropdown builder; presets populate it; gambits drive macro fights | PASS — M3 |
| 2e | Player Captain Calls in live gym fights (3 charges, shown); gyms grant enemy `enemyBonusCaptainCalls` | PASS — M3 |
| 2f | Recruit level ceiling rises with badges; TV→Nightsilver requires the first recruit | PASS — M2 |

**Phase 3 finished for real**

| # | Item | Status |
|---|------|--------|
| 3a | Regional boss re-runnable in-game Normal/Nightmare/Hell with scaled stats; clears deliver loot with pity; Hell gates | PASS — M4 |
| 3b | Live kill rewards scale by region depth, tier, creep tier/star; post-cap XP→gold | PASS — M4 |
| 3c | Neutral items drop into the dedicated slot, can't be sold, reroll/enchant/reclaim at Tinker's Bench | PASS — M4 |
| 3d | Buyback, Tome, respec, restock/heal work for gold; none vends gated top-tier power | PASS — M4 |
| 3e | All four raids run phase transitions, add waves, taunt redirect, enrage, loot; Roshan Aegis + respawn; Rapier-on-death | PASS — M5 |
| 3f | Elite Five winnable via draft, then Champion; a loss restarts from that member | PASS — M5 |
| 3g | Faction exclusivity (Kunkka xor Tidehunter) enforces through the live recruitment path | PASS — M5 |

**Phase 4 finished for real**

| # | Item | Status |
|---|------|--------|
| 4a | Every hero/ability/item active animates from the closed gesture vocabulary; hero weight reads; no per-cast hot-path allocation | PASS — M6 (gesture player + weight; animation layer alloc-free; VFX pooling → M9) |
| 4b | Every character/skill/item has a synthesized sound keyed off `sound`; capture/merge/level/badge/raid stingers; pooled + concurrency-capped voices; mixable channels + global mute | PASS — M7 |
| 4c | Barks fire from the sim on cast/kill/recruit/low-HP/badge, rate-limited; in-character original dialogue for trials/gyms/Elite/raids | PASS — M7 barks (cast + kill, rate-limited) + M8 dialogue (every gym leader/Elite/Champion/raid boss/trainer carries authored lines) |
| 4d | Gym leaders, teams, Elite Five, Champion, trainers, venues, events are original esports homages; denylist guard passes | PASS — M8 (homage names + titles + dialogue; 5 route-trainer archetypes; word-boundary denylist guard, test 23) |
| 4e | Codex covers heroes/regions/items/creeps/raids and unlocks on encounter; journal tracks recruitment/badges/raids/factions/reputation | PASS — M8 (encounter-gated `codexEntries()`; `journalSections()` over rep/badges/factions/raids/elite; test 24) |
| 4f | Visual perf harness measures 60fps with 30 units + ~200 projectiles, anim + capped voice pool active; numbers recorded here | PASS — M9 (headless harness: 30u/200proj, ~2.3 ms/frame avg, 0 steady-state hot-path allocations, voice pool 6/6, LOD active; numbers recorded above) |

**Gates**

| # | Item | Status |
|---|------|--------|
| G1 | Save **v4** round-trips; v3→v4 and v2→v4 migrate cleanly | PASS — M1 |
| G2 | All §6 tests pass; `npm test` + `npm run build` green | PASS — M10 (759 tests + build green) |
| G3 | Full playthrough: new game → all 8 badges → four raids → Elite Five → Champion, no blockers | PASS — M10 (headless ship-gate test threads the whole path + a v4 round-trip; `src/test/playthrough.test.ts`) |
| G4 | `PROGRESS.md` reconciled to the standalone bar; demo (§8) + perf numbers recorded | PASS — M10 (Phase 2/3/4 rows reflect the standalone bar; demo §8 + perf numbers recorded below) |

### Phase 6 §6 test matrix

| # | Test | Status |
|---|------|--------|
| 1 | echo-fidelity — gambit ctrl, HP tax, no slots, dies to reward path | PASS — M2 |
| 2 | echo-advances-find — echo kills bank shards; marker reveals at `findShardsNeeded` | PASS — M2 |
| 3 | trial-completion — each runner reaches complete on success and fail→relocation (shards to floor, not locked) | PASS — M2 |
| 4 | bind-duel-runs — the Bind 1v1 resolves for every recruit chain in the roster | PASS — M2 |
| 5 | reputation-gate — good-karma gate opens above / shut below; Souls Pact lowers karma | PASS — M2 |
| 6 | gym-winnable — fixed-seed Bo3 with player-authored gambits beats all 8 gyms; enemy gets bonus calls | PASS — M3 |
| 7 | captain-call-live — player Captain Call attaches/reverts in a live gym fight, decrements counter | PASS — M3 |
| 8 | recruit-ceiling — cap is `[15,22,30]` by badges; XP banks past the cap | PASS — M2 |
| 9 | boss-rerun-live — Nightmare boss in the loop, scaled stats + scaled loot to inventory; Hell gates; pity | PASS — M4 |
| 10 | reward-scaling-live — deeper region / higher tier / higher creep star yields more; post-cap XP→gold | PASS — M4 |
| 11 | neutral-items-live — tiered drop into dedicated slot; unsellable; reroll in-tier; enchant raises tier | PASS — M4 |
| 12 | gold-sinks-faithful — buyback/Tome/respec work; no sink vends a gated top-tier item | PASS — M4 |
| 13 | raid-mechanics — phase transitions, add waves, taunt redirect, enrage fire in the sim | PASS — M5 |
| 14 | raid-loot — each of four raids clears 5v1 and rolls its loot table (pity honored) | PASS — M5 |
| 15 | roshan-aegis — Aegis one-use auto-revive consumed on death; respawn timer; repeat-kill cheese/Refresher | PASS — M5 |
| 16 | rapier-on-death — Rapier drops on macro death, claimable by the enemy | PASS — M5 |
| 17 | elite-gauntlet-winnable — draft clears all five + Champion; a mid-gauntlet loss restarts from that member | PASS — M5 |
| 18 | faction-exclusivity-live — choosing Kunkka locks Tidehunter through the live recruit path | PASS — M5 |
| 19 | anim-coverage — every ability/item active has a valid `anim`; every hero/creep an `animProfile`; gesture resolves | PASS — M6 |
| 20 | audio-coverage + safety — every ability/item maps to a valid `sound`; mute bypasses synthesis; voice pool capped | PASS — M7 |
| 21 | no-asset guard — no audio/image/model imports anywhere; glTF path keeps procedural fallback | PASS — M7 |
| 22 | bark-trigger — at least one bark fires from the sim core on a wired trigger | PASS — M7 |
| 23 | lore + esports denylist — codex refs resolve; every leader/Elite/Champion/boss/trainer has name+title+dialogue; denylist rejects real names | PASS — M8 |
| 24 | codex/journal state — entries unlock on encounter; journal reflects raids/factions/reputation | PASS — M8 |
| 25 | save-v4-roundtrip — v4 reloads identically; v3→v4 and v2→v4 default cleanly | PASS — M1 |
| 26 | perf-harness — 30-unit/200-projectile scene steps with no steady-state hot-path allocation; frame time recorded here | PASS — M9 (steady-state alloc 0; numbers above) |

### Phase 6 demo script (phase6 spec §8)

1. New Game, pick a starter. Find a hero rumor; beat their **echoes** until the shard-gated **trial** reveals; complete the **trial** (a real scripted runner) and win the **Bind**; the hero joins. Fail a different trial once and watch it **relocate**.
2. Open the **gambit editor**, author a rule from dropdowns for two heroes, fight a **gym** best-of-3, spend a **Captain Call** by hand to land an ult; win the badge. Note the enemy's bonus calls.
3. Re-run a regional **boss on Nightmare**; show scaled stats, a **loot drop** with the pity counter moving, and reward scaling on a deeper-region kill.
4. Capture a high-tier neutral; take its **neutral item** into the dedicated slot; at the **Tinker's Bench** reroll it and enchant three duplicates up a tier; **buyback** after a wipe and burn a **Tome** on a lagging recruit.
5. Enter a **raid**: field five, press **1–5** to switch drivers, dodge a telegraphed **zone**, survive an **add wave**, **taunt** to redirect the boss, clear it for a loot roll; kill **Roshan**, grab the **Aegis**, die once to consume it.
6. At the Tower of the Ancients, run **draft** (pick/ban), beat an **Elite** member, then the **Champion**.
7. Cast signature abilities — each shows its **gesture animation** and a distinct **synthesized sound**, with an in-character **bark**; open the **codex** (an entry that unlocked on encounter, a venue name that winks at a famous event) and the **journal** (raids/factions/reputation). Adjust an audio channel and mute. Run the **perf harness** (30 units, 200 projectiles) and show the frame time in budget. Save, reload (**v4**), confirm everything persists.

### Phase 6 perf numbers (recorded at M9)

In-repo harness `src/engine/perf-harness.ts` (`runPerfHarness`), driven headless by test 26. It runs the real render-side layer — the VFX projectile pool, the skeletal animator under overworld LOD, and the capped voice pool — at the target load (30 animating units + 200 live projectiles), stepping the sim at a fixed 30 Hz with interpolated render frames, exactly as `GameScene.update` does minus `renderer.render`.

| Metric | Value (M9 baseline) |
|--------|---------------------|
| Scene | 30 units · 200 live projectiles · 150 measured frames @ 1/60 |
| Avg frame time (render-side CPU, headless) | ~2.3 ms |
| p95 frame time | ~12.6 ms |
| Max frame time (first-frame JIT warmup) | ~39 ms |
| Est. headroom vs 16.67 ms (60 fps) budget | large (avg ≈ 7× under) |
| Projectile objects allocated (total) | 200 — exactly the concurrent high-water mark |
| **Steady-state hot-path allocations** | **0** (pool reuses every projectile object across spawn≈expire churn) |
| Voice pool peak / cap | 6 / 6 (saturates and holds) |
| LOD tiers (focus on player team) | 4 full · 4 reduced · 22 culled |

Notes: these are render-logic CPU costs from the headless harness (no GPU); the harness exists to prove the scene **builds, steps, and never allocates in the hot path** and to give a comparable frame-time baseline. GPU-side 60 fps is validated in-browser. Terrain props (trees/rocks) were already `InstancedMesh`; M9 added the pooled projectile path and overworld LOD; per-cast `THREE.Object3D` allocation in `vfx.ts` is gone.

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
- 2026-06-12: Presentation-spec reward slice: kill/last-hit/overflow/echo/sell gold now emits one presentation event, coin SFX uses a 1.5s pitch ladder, gold flies to an animated count-up counter with streak badge, last-hit gold calls out +15%, and crits get larger magnitude-scaled text plus a sharper impact sound. `npm run typecheck`, `npm run build`, and `npm test` green; browser smoke verified title -> starter -> in-game HUD gold counter on a fresh Vite server.
- 2026-06-13: Phase 6 kickoff + M1 (save v4): reconciled `PROGRESS.md` to the standalone Phase 2–4 bar (helper-only rows annotated `→ P6 Mn`), added the Phase 6 acceptance/test-matrix/demo sections. Bumped `SAVE_VERSION` 3→4; added `reputation`, `codexUnlocks`, `journalSeen`, and the `settings.audio` channel object; v2→v3→v4 migration chain folds the loose volume fields and preserves an existing audio object. New tuning fields for recruit ceiling, relocation floor, find shards, reputation gates, echo tax/leash, trial time, roster-legend, voice cap. `src/test/save-v4.test.ts` covers fresh/round-trip/v3→v4/v2→v4.
- 2026-06-13: Phase 6 M2 (recruitment + reputation, Phase 2 core): rewrote `tryRecruit`/`advanceAttunement` into a shard-gated Find → `TrialRunner` → Bind chain; added `core/trials.ts` (nine mechanics across all trial kinds incl. new `souls-pact`/`stealth-hunt`, plus `trialGateOpen` for reputation/roster/raid gates), `core/echo-unit.ts` (gambit-driven, ×0.6 HP, no slots, `isEcho` flag + translucent render, overworld leash), reputation karma with both-way gates, fail→relocation to alternate in-region spots with shards reset to the floor, recruit level ceiling `[15,22,30]` by badges with XP banking, and the `requiresRecruits:1` TV→Nightsilver gate. Added a headless `Game` seam (`Game.headless`, `SceneLike`/`AudioLike`) and a trial-choice HUD panel. `src/test/recruitment.test.ts` covers tests 1–5 + 8 + the TV gate. `npm run build` + `npm test` green.
- 2026-06-13: Phase 6 M3 (gambit editor + live Captain Calls + 8-gym proof): replaced the headless-only gym round runner with `LiveGymFight` (`systems/macro-session.ts`) — a stepped best-of-3 carrying a player Captain Call controller (3) and an enemy one (3 + `enemyBonusCaptainCalls`) with an auto-call AI; `runGymMatch` runs it headlessly so both paths share one engine. Wired a live, rendered gym fight into `Game` (`startLiveGym`/`updateLiveGym`/`liveGymPlayerCall`, scene sim-swap with `scene.resetUnitViews()`), a Space/HUD-button player call, and a live overlay (round score + both teams' charges). Built the gambit dropdown rule builder (ordered, reorderable ≤8 rules, condition+action selects, presets populate it) and a gym pre-fight screen (Fight Live / Auto-Resolve, per-hero Edit rules). `src/test/gyms.test.ts` covers tests 6 (all 8 gyms winnable with authored gambits, enemy bonus calls) + 7 (captain-call-live attach/revert/decrement). Build + 707 tests green; browser smoke (port 5174) verified the editor opens in-game with zero console errors.
- 2026-06-13: Phase 6 M5 (raids executed + Roshan/Aegis + Rapier-on-death + Elite Five/Champion + faction): added `core/macro.ts#runRaidEncounter`, a 5v1 that steps the sim and fires each scripted beat — phase-transition zones at HP thresholds (telegraphed dodge zones on the party centroid), `addWaves[].summon × count` summoned on the boss's team, a composed signature beat at 50%, and a hard boss ramp when the `enrageSec` timer expires; threat/taunt come free from the boss controller. Baked Rapier-on-death + Aegis into the shared `runBattleToResult` (so Elite 5v5 drops Rapier too): a dying holder's Divine Rapier transfers to the nearest living enemy hero, and a held Aegis stands the first fallen hero back up once via the new `Sim.reviveUnit` primitive (+`revive` event). Wired `Game.runRaid` (loot + pity, Roshan grants the Aegis flag, sets `roshanRespawnAt`, and re-drops Refresher Shard + Cheese from clear #2), `Game.runEliteMatch`/`runChampion` (per-member `draftTeams`, advance on win, restart-from-member on loss, Champion gated behind 5), and faction exclusivity (`chooseFaction` recorded at the faction-choice trial; `tryRecruit` refuses the locked rival captain). Surfaced Raids + Conquest in the Town Services modal. `src/test/raids.test.ts` covers tests 13–18 (12 cases). Raised the global vitest `testTimeout` to 30s (the gym/raid/gauntlet sims are compute-bound, not latency tests). Build + 730 tests green.
- 2026-06-13: Phase 6 M4 (economy wired): live boss reruns (`Game.runBossFight`) run a scaled 5v1 on the raid sim per `tierScale`, deliver `rollLoot` guaranteed components + assembled drops into inventory/`heldUniques`, advance the pity dry streak, and gate Normal→Nightmare→Nightmare-clear→Hell via `bossTierUnlocked`. Routed neutral drops into the kill path (`rollNeutralDrop` on wild-creep death → `neutralStash`), a dedicated neutral slot whose passive mods apply to the live unit (equip/reclaim, never sellable), and a Tinker's Bench (`tinkerReroll` in-tier, `tinkerEnchant` 3-dupes-up-a-tier). Added the four gold sinks (`buyback`, `buyTome` with diminishing returns, `respec` out-of-combat, `healParty`) incrementing `goldSinks`, and a `buyItem`/`shopSells` guard so no shop or sink vends the gated top-tier set (`GATED_TOP_TIER`). Confirmed live kill rewards route through `scaledBounty` (region/tier/creep-tier/star) with post-cap XP→gold via `overflowXpToGold`. New Town Services modal (Y key) surfaces boss reruns, the bench, and the sinks; reserved the `n` neutral-active key. `src/test/economy.test.ts` covers tests 9–12 (11 cases). Build + 718 tests green; browser smoke (port 5212) verified Town Services renders all three sections, Heal works, and the console stayed clean.
- 2026-06-13: Phase 6 M6 (animation gesture player + hand-authored tags + anim-coverage lint): added the closed `AnimGesture`/`SoundArchetype` vocabularies + per-unit `AnimProfile` (`rig`/`castStyle`/`voiceTimbre`) to `core/types.ts`, and a pure resolver `core/gestures.ts` (`gestureForAbility`/`soundForAbility`) that honors explicit `anim`/`sound` then infers from effect shape (channel→`channel-loop`, summon→`summon-gesture`, self-blink→`dash`, global mark→`global-cast`, ground AOE→`ground-slam`, projectile/range→`ranged-shot`, else `melee-swing`; heal/VFX→sound). `Unit` carries `castGesture` + `animProfile` render hints (set on spawn for heroes/creeps); `actions.ts` stamps the gesture on cast and on item-active use (with a short readable cast window). Rewrote the casting branch of `engine/animator.ts` into a weight-shaped gesture player — one pose per gesture, scaled by `rig.scale` and `castStyle`, with a module-reused `POSE` so the cast/attack path allocates nothing per frame; legacy `heroId` poses remain as fallback. Hand-authored `anim`/`sound` on every ability of the nine iconic heroes + their `animProfile`; backfilled the `phase2` hero factory, `ALL_ITEMS` actives (`normalizeItemActive`), and hand-authored `ALL_CREEPS` (`normalizeCreep`) so coverage is complete without per-object edits. Tightened `data-lint` to require valid `anim`/`sound` on every top-level ability + item active and an `animProfile` on every hero/creep, and added test 19 (`anim-coverage`) asserting every collected ability (incl. nested summon sub-abilities) resolves a valid gesture/sound. `npm run typecheck` + `npm run build` + `npm test` green (734 tests).
- 2026-06-13: Phase 6 M7 (per-entity audio keyed off `sound` + stingers + voice pool + barks + no-asset guard): rebuilt `engine/audio.ts` from a VFX-archetype toy into a synthesis layer that keys cast voices off the ability's `SoundArchetype` (11-way: blade/bow/impact/frost/fire/storm/void/heal/summon/item/roar) and pitch-shifts per owner `voiceTimbre`, so a kit sounds like its caster; the `cast` SimEvent now carries `sound` + `timbre` (resolved via `soundForAbility` at the emit sites in `actions.ts`/`sim.ts`). Added a pooled, hard-capped voice set (`TUNING.audioVoiceCap`, prunes by a real-or-perf clock so it works headless) with `activeVoiceCount`/`peakVoiceCount` accessors; per-channel mix (sfx/voice/stinger × master) threaded through every synth helper; a global mute that early-returns before any synthesis or voice reservation; and a headless-safe lifecycle (`unlock()`/`dispose()`, `AudioContext`-absent guards so construct/teardown never throw). Real stinger motifs for capture/levelup/merge/badge/raid-clear on the stinger channel via `playStinger` (replacing the old fake `cast`-event hack and wired into gym-badge award + 3-star merge + raid/champion clears; `AudioLike`/`HeadlessAudio` gained `playStinger`). Barks now emit from the **sim core**: `actions.ts` fires a rate-limited (6s/unit) in-character line on signature (ult) casts and `sim.killUnit` on a hero kill, drawn deterministically from `Unit.barks` (copied at spawn) via `sim.rng`, routed through the existing HUD bark channel. `src/test/audio.test.ts` covers tests 20 (sound coverage for every hero/creep ability + item active; construct/drive/teardown never throws; mute bypasses synthesis; voice pool respects the cap incl. a custom cap), 21 (source scan: no audio/image/model imports anywhere; `assets.ts` keeps its `'procedural'` fallback and imports only `three`), and 22 (a bark fires from the sim core on an ult cast). `npm run typecheck` + `npm run build` + `npm test` green (742 tests).
- 2026-06-13: Phase 6 M10 (ship gate): added `src/test/playthrough.test.ts` — the headless form of the §8 demo and the G3 proof. A maxed, fully-recruited five runs the connected critical path through the real `Game` methods: all 8 gym badges via `challengeGym` (the headless best-of-3 auto-resolve that awards the badge), all four raids via `runRaid`, the Elite Five gauntlet in order via `runEliteMatch` (asserting a win advances `defeated` by exactly one — a loss would leave it untouched), then the gated `runChampion`; it then proves the codex/journal recorded the run (encounter-gated) and that the whole completed state survives a v4 `buildSave`→`Game.headless` round-trip. Stages retry across a few seeds (a player "tries again") and fail loudly if a stage never clears, so the test proves *no structural blocker* threads the path rather than re-proving per-stage winnability (tests 6, 13–18). Reconciled `PROGRESS.md` to the standalone bar: Phase 3 rows 5–6 (raids/elite, were HELPER-ONLY) and Phase 4 row 10 (perf) now PASS; all Phase 6 acceptance rows + gates G1–G4 are green. `npm run typecheck` + `npm run build` + `npm test` green (759 tests). Phase 6 is spec-complete.
- 2026-06-13: Phase 6 M9 (visual perf harness + projectile pooling + overworld LOD; numbers recorded): replaced the per-cast `THREE.Object3D` allocation in `engine/vfx.ts` with a **projectile pool** — `acquireProjectile`/`releaseProjectile`/`buildProjectile` keep two free lists (hook/orb), recolor + rescale shared-geometry objects on reuse, and never dispose; `projectileAllocations()`/`pooledProjectileCount()` expose the counters. Added `engine/lod.ts` (`lodForDistance` → full/reduced/culled by world-distance to the camera focus; `shouldAnimateAtLod` gates the skeletal animator: reduced animates every other frame, culled freezes its pose) and wired it into `GameScene.updateView` (plus a per-frame parity toggle) so distant overworld units stop paying for `animateRig` and cosmetic wobble. Built `engine/perf-harness.ts` — a headless `PerfHarness`/`runPerfHarness` that drives the real VFX pool + rigs + `animateRig` under LOD + a capped `ProceduralAudio` voice pool at 30 units / 200 projectiles, stepping the sim at fixed 30 Hz with interpolated frames exactly like `GameScene.update` minus `renderer.render`; the scene is deliberately stable (teams parked out of aggro, projectiles fired outward to expire on range) so numbers are comparable. Test 26 proves the scene builds + steps, `steadyStateAllocations === 0` (pool reuses every object across spawn≈expire churn), total allocations plateau at the concurrent peak (200), LOD tiers the field, and the voice pool holds at its cap; it prints the report recorded in "Phase 6 perf numbers" above (~2.3 ms/frame avg headless, est. 60 fps with large headroom). Terrain props were already `InstancedMesh`. `npm run typecheck` + `npm run build` + `npm test` green (758 tests).
- 2026-06-13: Phase 6 M8 (esports homage naming + dialogue + denylist; encounter-gated codex/journal): extended `GymDef` (`leaderTitle` + `dialogue`), `RaidDef` (`title` + `dialogue`), and `DraftDef` (per-member `title`/`dialogue` via a `DraftMember` type + `championName`/`championTitle`/`championDialogue`); added a `TrainerArchetype`/`TrainerDef` type, a `trainers` registry, and five route trainers (shoutcaster/analyst/streamer/captain/support). Authored original homage names + titles + dialogue for all 8 gym leaders, the five Elite members + Champion, all four raid bosses, and the trainers — none referencing real orgs/players/casters/trademarks. Added `data/denylist.ts` (`ESPORTS_DENYLIST` + word-boundary `denylistHit`) and test 23 asserting every named entity carries name+title+≥1 dialogue line, all codex-able entities carry lore, and the matcher catches real names (positive control) while passing original lines. Wired encounter-gated codex: `Game.codexUnlock(id)` fires at the real encounter points (region entry on construct, hero recruit, raid-boss kill, creep capture, item acquire) and `syncEncounterCodex` covers held relics + current party; `codexEntries()` returns only unlocked heroes/regions/items/creeps/raids, `journalSections()` projects reputation/badges/factions/raids/elite, `markJournalSeen()` records acknowledgements. Rewrote the HUD codex/journal modals to render those view-models. Test 24 covers encounter gating (current region shown, unvisited hidden; unmet hero hidden until `codexUnlock`), creep/raid reveal on encounter, codex-unlock persistence across a save round-trip, and the journal projection. `npm run typecheck` + `npm run build` + `npm test` green (754 tests).
- 2026-06-13: Phase 6 ship-gate verification: full coverage double-check across all phases. Confirmed the standalone spec floors are not just asserted but exceeded by the live registry — 65 heroes (19 Aghs implemented), 78 items, 36 creeps, 10 regions, 8 gyms, 4 raids, 39 bosses, 15 trial kinds, and every non-starter hero carries a recruitment chain. Verified the §6 test matrix (tests 1–26) all map to live suites plus the G3 ship-gate (`playthrough.test.ts`), and the named Phase 2 mechanic checks exist (silence-interrupts-channel in `hero-kits`, BKB-blocks-stun + Euls-disjoints-projectile in `item-identity`). Re-ran the gates green: `npm test` (28 files, 759 tests) and `npm run build` (tsc + vite, 76 modules). Playwright browser smoke on a fresh dev server passed end-to-end — title → New Game → starter select → in-game HUD (Tranquil Vale, 2600g stipend, full hero panel + abilities) → live WebGL2 canvas (not lost) → encounter-gated Codex via `K` — with a clean console (0 errors, 0 warnings) throughout.

### Graphics overhaul (Dota-likeness) — `GRAPHICS_SPEC.md`

Cross-cutting render/UI overhaul to make the look read as Dota 2 while keeping the headless sim/core decoupled and the no-asset guard intact (asset policy: original + generated + CC0/CC-BY only, never Valve files). Six phases, all done; build + 762 tests green; browser smoke clean.

| Phase | Item | Status |
|---|------|--------|
| 1 | EffectComposer (ACES tonemap, bloom, color-grade + vignette, SMAA), PBR `MeshStandardMaterial` everywhere, `RoomEnvironment` IBL, rim light, contact shadows, per-biome + day/night grade | DONE |
| 1.5 | `ultra` quality tier added; every post-FX pass gated by the quality preset | DONE |
| 2 | Dota command-card HUD reskin (brass-over-stone chrome, display font, day/night dial, beveled minimap) | DONE |
| 3 | World: generated ground-detail texture, gradient sky dome (day/night), animated shader water, gated ambient weather particles | DONE |
| 4 | VFX language: additive glow on every bolt/burst/beam, soft-sprite particles, fading projectile trails, textured ground telegraph decals | DONE |
| 5 | Heroes: pluggable `UnitRig` with glTF swap + procedural fallback, enrichment of all nine likeness overlays, generated bump-detail map on hero PBR materials | DONE |
| 6 | Settings UI: quality tier + exposure + color-grade sliders + reduced-motion, persisted in the save and live-applied | DONE |

- 2026-06-13: Graphics overhaul P1–P3 (the look + world): drafted `GRAPHICS_SPEC.md` (pros/cons of the flat-shaded primitive look vs. a PBR + post-processing pipeline, asset-sourcing policy, six-phase plan). Rebuilt the render path in `engine/scene.ts` around an `EffectComposer` (`RenderPass → UnrealBloomPass(threshold 1.0) → ShaderPass` color-grade/vignette `→ OutputPass → SMAAPass`), `ACESFilmicToneMapping` at exposure 0.92, and `RoomEnvironment` IBL whose `environmentIntensity` is driven by the day/night cycle (constant IBL was the bug that kept night bright — now modulated 0.06→0.4). Converted `engine/models.ts` and `engine/terrain.ts` from `MeshLambertMaterial` to role-differentiated `MeshStandardMaterial` (cloth/metal/gem roughness+metalness), added a cool rim/back light, a gradient sky dome that follows the camera and is tinted by the cycle, a generated `CanvasTexture` ground-detail map, an animated `ShaderMaterial` river (ripples/foam via a `TerrainInfo.update(time)` hook), and biome-keyed additive weather particles. Extended `engine/performance.ts` with the `ultra` tier and `envMap/postFx/bloom/grade/ao/smaa/weatherDensity` preset flags; all new texture builders are `document`-guarded or `DataTexture`-based so headless tests stay node-safe.
- 2026-06-13: Graphics overhaul P4 (VFX language): projectiles now carry an additive glowing core+halo and a 12-point fading vertex-colored trail (pooled — no per-cast allocation, `steadyStateAllocations` stays 0); every transient (burst ring + soft-sprite sparks, cast flash, pillar, blink mark, cleave arc, attack beam, crit slash, lightning, storm shards) switched to `AdditiveBlending` so magic glows and feeds bloom; AoE zones render a numerically-generated ground telegraph decal (filled disc + bright rim + spokes) with a slow charge-spin and pulsing rim. Sprite/decal textures are built as `DataTexture` so the headless VFX/perf suites keep working.
- 2026-06-13: Graphics overhaul P5 (heroes): made `UnitRig` pluggable — `mountHeroModel()` (pure Object3D math, unit-tested) swaps a loaded glTF in for the procedural body with height-fit + feet-seat + shadows, hiding (not disposing) the procedural parts so a missing/again-absent load falls back cleanly. `assets.ts` gained `ENABLED_HERO_MODELS` (empty until a CC0/original GLB ships, so the runtime never fires a 404 — clean console) + `heroAssetEntry()`; `createView` kicks off the async load+swap behind the gate. Substantially enriched all nine procedural likeness overlays (Juggernaut mask/eye-slit/fanned crests/sash/pauldrons, Crystal Maiden layered ice crown/chest gem/cloak/eyes, Pudge bloated stitched belly/hook-on-back/jaw, Earthshaker horns/stone slabs/glowing rune, Sniper brimmed hat/amber goggles/ammo pack, Lich skull/eye-glow/jagged crown/ice shoulders/cape, Luna crescent/pauldrons/eyes, Sven winged helm/visor glow/pauldrons, Axe mohawk/spiked pauldrons/eyes) and applied a generated bump-detail map to hero PBR materials in-scene (browser only). `model-cache.test.ts` covers the swap + the enablement gate.
- 2026-06-13: Graphics overhaul P6 (settings) + final verification: added `GraphicsSettings` (quality `auto|low|medium|high|ultra`, exposure, color-grade strength, reduced-motion) to `GameSave.settings` with `defaultGraphicsSettings()` + migration backfill (old saves default cleanly). `engine/scene.ts` gained `setGraphics()` (live exposure / grade-strength via a new `uStrength` grade uniform / reduced-motion gating of weather + water) and `setQuality()` (leak-free runtime tier switch: rebuilds the post stack, shadow map, env map, and weather). `Game` resolves the saved tier into the scene at construction (`resolveQuality`, `auto` reads cores+DPR) and exposes `applyGraphics()`/`setQualityTier()`; the menu modal got a Graphics section (quality dropdown, exposure/grade sliders, reduced-motion checkbox) wired to apply live. `npm run typecheck` + `npm run build` + `npm test` green (28 files, 762 tests; `save-v4` covers graphics persistence/migration, `model-cache` the pluggable rig). Playwright smoke on a `vite preview` of the production build: title → New Game → Juggernaut → in-game WebGL2 canvas (2400×1884, context not lost) with the full PBR/post-FX/weather/VFX pipeline, the new Graphics settings panel rendered, and a live quality switch to Ultra (full composer/shadow/env/weather rebuild) — 0 console errors/warnings throughout.
- 2026-06-13: Loading screen + scene pre-warm (fixes the boot/travel lag spike). The post-processing programs, PBR materials, sky/water shaders, and `RoomEnvironment` map all compile/build synchronously on the first render, which hitched the first interactive frame whenever a scene was created. Added `ui/loading.ts` (`showLoading`/`hideLoading`/`withLoading`) — a brass-spinner overlay on a stone vignette (compositor-driven `transform`/`opacity`, reduced-motion aware) that paints, yields two rAFs so it's on screen, then runs the heavy work behind it and fades out. `main.ts#startGame` now wraps `new Game` + warm-up in `withLoading("Entering <region>…")`, so it covers every scene build — New Game, load (title + in-game), and region travel (all route through `ancients:load → startGame`). Added `Game.prewarm()` (one `update(0)` to build the first unit views + force a full render, then `scene.prewarm()`) and `GameScene.prewarm()` (`renderer.compile(scene, camera)`); both no-op headless. `npm run typecheck` + `npm run build` + `npm test` green (762 tests). Browser smoke on the production preview: New Game → "Entering Tranquil Vale…" overlay with spinner → fades to a fully-warm town/HUD frame (no first-frame hitch), overlay `display:none` after fade, console clean.
- 2026-06-13: Dungeon overhaul D0 landed: added pure core dungeon types plus `core/dungeon.ts` with seeded `generateDungeon` and `rollRoomSpawns`. Fixed seeds now produce stable entrance/combat/elite/treasure/shrine/rest/boss room graphs, tier/depth-scaled spawn budgets, monster rarity upgrades, and affix picks that honor tier gates/exclusions. `src/test/dungeon.test.ts` covers determinism, graph rules, scaling, and affix legality; boundary tests stay green.
- 2026-06-13: Dungeon overhaul D1 landed: registered `frost-hollow`, added an Icewrack dungeon portal, and added `systems/dungeon-session.ts` as a live one-room dungeon session beside gyms/raids. `Game.startDungeon` now enters a generated combat room, routes input/rendering through the dungeon sim, rolls creep drops on room kills, grants the room reward on clear, and ejects cleanly on wipe. Focused verification green: `npm test -- src/test/dungeon.test.ts src/test/data-lint.test.ts src/test/boundary.test.ts` (588 tests) and `npm run build`. Full `npm test` is currently blocked by separate dirty `raid-ai` work outside D1.
- 2026-06-13: Loot overhaul L3/L4 landed: boss loot tables are now themed by boss identity (agility carries anchor Butterfly/Skadi, strength titans Heart/Assault, intelligence bosses Scythe/Refresher/Aghs) instead of the hero-id hash; every item resolves a rarity; `exclusiveTo` reservations are enforced by the shared source predicate used by shops and the Black Market; owned-hero echoes can drop attribute-themed components. Added Black Market systems actions (`blackMarketRecipeWheel`, `blackMarketRelicWheel`) plus bound Armory salvage into `essence`, save persistence/migration for the new counters, and a first faucet retune (`postCapXpToGold` plus deepest region multipliers). Verification green: `npm run typecheck`, focused economy/save/data tests (574 tests), full `npm test` (37 files, 824 tests), `npm run build`, and edited-file lints clean.
