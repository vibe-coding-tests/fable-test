# PROGRESS

Read this first each session, then `DECISIONS.md`, then run `npm test`.

## Current phase: 6 — IN PROGRESS (wiring the systems Phases 2–4 promised)

Phase 6 holds Phases 2–4 to the **standalone specs'** bar, not the looser in-repo `SPEC.md`. A lot of earlier work shipped as data + pure helpers with unit tests but was never wired into the live game loop; the Phase 6 section below tracks the real bar (acceptance + the §6 test matrix). Rows in the older phase checklists that were helper-only are annotated `→ P6 Mn` and only flip to PASS once Phase 6 wires them end-to-end and proves it with an integration test.

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
| 1 | Gyms 1–2 beatable end-to-end with player-authored gambits | PARTIAL — gym reachable; player-authored-gambit + 8-gym proof → P6 M3 |
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
| 4 | Boss / mini-boss difficulty tiers, loot tables, pity, and Nightmare/Hell gates | HELPER-ONLY — math + data done, not in the live loop → P6 M4 |
| 5 | Four raids registered with phase mechanics, add waves, zones, enrage, loot, and headless runs | HELPER-ONLY — timeline is metadata; sim runs a plain 5v1 → P6 M5 |
| 6 | Elite Five draft and Champion data registered; deterministic draft test passes | HELPER-ONLY — `draftTeams` only; no gauntlet/Champion/win path → P6 M5 |
| 7 | Day/night effects for Night Stalker, Luna, and night vision | PASS |
| 8 | Neutral items, Tinker Bench reroll/enchant, buyback/Tome/respec gold sinks | HELPER-ONLY — math done; no drop/slot/bench/sink UI → P6 M4 |
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
| 7 | Quest journal and codex panels | PASS — panels exist; creeps/raids/faction/rep + encounter-gated unlocks → P6 M8 |
| 8 | Balance pass from Dota baselines via `tuning.ts` | PASS |
| 9 | Tiny procedural WebAudio SFX | PASS — VFX-keyed; per-entity `sound`/stingers/voice-pool/mute → P6 M7 |
| 10 | Performance pass against budget | PASS — headless budget only; visual 30u/200proj harness → P6 M9 |

Phase 4 also leaves the **animation gesture player** (drives every ability/item active from `anim`/`animProfile`, replacing hardcoded `heroId` branches) and **barks from the sim core** as open work → P6 M6/M7.

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
| 2d | Gambit editor: ordered ≤8-rule dropdown builder; presets populate it; gambits drive macro fights | OPEN → M3 |
| 2e | Player Captain Calls in live gym fights (3 charges, shown); gyms grant enemy `enemyBonusCaptainCalls` | OPEN → M3 |
| 2f | Recruit level ceiling rises with badges; TV→Nightsilver requires the first recruit | PASS — M2 |

**Phase 3 finished for real**

| # | Item | Status |
|---|------|--------|
| 3a | Regional boss re-runnable in-game Normal/Nightmare/Hell with scaled stats; clears deliver loot with pity; Hell gates | OPEN → M4 |
| 3b | Live kill rewards scale by region depth, tier, creep tier/star; post-cap XP→gold | OPEN → M4 |
| 3c | Neutral items drop into the dedicated slot, can't be sold, reroll/enchant/reclaim at Tinker's Bench | OPEN → M4 |
| 3d | Buyback, Tome, respec, restock/heal work for gold; none vends gated top-tier power | OPEN → M4 |
| 3e | All four raids run phase transitions, add waves, taunt redirect, enrage, loot; Roshan Aegis + respawn; Rapier-on-death | OPEN → M5 |
| 3f | Elite Five winnable via draft, then Champion; a loss restarts from that member | OPEN → M5 |
| 3g | Faction exclusivity (Kunkka xor Tidehunter) enforces through the live recruitment path | OPEN → M5 |

**Phase 4 finished for real**

| # | Item | Status |
|---|------|--------|
| 4a | Every hero/ability/item active animates from the closed gesture vocabulary; hero weight reads; no per-cast hot-path allocation | OPEN → M6 |
| 4b | Every character/skill/item has a synthesized sound keyed off `sound`; capture/merge/level/badge/raid stingers; pooled + concurrency-capped voices; mixable channels + global mute | OPEN → M7 |
| 4c | Barks fire from the sim on cast/kill/recruit/low-HP/badge, rate-limited; in-character original dialogue for trials/gyms/Elite/raids | OPEN → M7/M8 |
| 4d | Gym leaders, teams, Elite Five, Champion, trainers, venues, events are original esports homages; denylist guard passes | OPEN → M8 |
| 4e | Codex covers heroes/regions/items/creeps/raids and unlocks on encounter; journal tracks recruitment/badges/raids/factions/reputation | OPEN → M8 |
| 4f | Visual perf harness measures 60fps with 30 units + ~200 projectiles, anim + capped voice pool active; numbers recorded here | OPEN → M9 |

**Gates**

| # | Item | Status |
|---|------|--------|
| G1 | Save **v4** round-trips; v3→v4 and v2→v4 migrate cleanly | PASS — M1 |
| G2 | All §6 tests pass; `npm test` + `npm run build` green | IN PROGRESS (M1–M2 green) |
| G3 | Full playthrough: new game → all 8 badges → four raids → Elite Five → Champion, no blockers | OPEN → M10 |
| G4 | `PROGRESS.md` reconciled to the standalone bar; demo (§8) + perf numbers recorded | IN PROGRESS |

### Phase 6 §6 test matrix

| # | Test | Status |
|---|------|--------|
| 1 | echo-fidelity — gambit ctrl, HP tax, no slots, dies to reward path | PASS — M2 |
| 2 | echo-advances-find — echo kills bank shards; marker reveals at `findShardsNeeded` | PASS — M2 |
| 3 | trial-completion — each runner reaches complete on success and fail→relocation (shards to floor, not locked) | PASS — M2 |
| 4 | bind-duel-runs — the Bind 1v1 resolves for every recruit chain in the roster | PASS — M2 |
| 5 | reputation-gate — good-karma gate opens above / shut below; Souls Pact lowers karma | PASS — M2 |
| 6 | gym-winnable — fixed-seed Bo3 with player-authored gambits beats all 8 gyms; enemy gets bonus calls | OPEN → M3 |
| 7 | captain-call-live — player Captain Call attaches/reverts in a live gym fight, decrements counter | OPEN → M3 |
| 8 | recruit-ceiling — cap is `[15,22,30]` by badges; XP banks past the cap | PASS — M2 |
| 9 | boss-rerun-live — Nightmare boss in the loop, scaled stats + scaled loot to inventory; Hell gates; pity | OPEN → M4 |
| 10 | reward-scaling-live — deeper region / higher tier / higher creep star yields more; post-cap XP→gold | OPEN → M4 |
| 11 | neutral-items-live — tiered drop into dedicated slot; unsellable; reroll in-tier; enchant raises tier | OPEN → M4 |
| 12 | gold-sinks-faithful — buyback/Tome/respec work; no sink vends a gated top-tier item | OPEN → M4 |
| 13 | raid-mechanics — phase transitions, add waves, taunt redirect, enrage fire in the sim | OPEN → M5 |
| 14 | raid-loot — each of four raids clears 5v1 and rolls its loot table (pity honored) | OPEN → M5 |
| 15 | roshan-aegis — Aegis one-use auto-revive consumed on death; respawn timer; repeat-kill cheese/Refresher | OPEN → M5 |
| 16 | rapier-on-death — Rapier drops on macro death, claimable by the enemy | OPEN → M5 |
| 17 | elite-gauntlet-winnable — draft clears all five + Champion; a mid-gauntlet loss restarts from that member | OPEN → M5 |
| 18 | faction-exclusivity-live — choosing Kunkka locks Tidehunter through the live recruit path | OPEN → M5 |
| 19 | anim-coverage — every ability/item active has a valid `anim`; every hero/creep an `animProfile`; gesture resolves | OPEN → M6 |
| 20 | audio-coverage + safety — every ability/item maps to a valid `sound`; mute bypasses synthesis; voice pool capped | OPEN → M7 |
| 21 | no-asset guard — no audio/image/model imports anywhere; glTF path keeps procedural fallback | OPEN → M7 |
| 22 | bark-trigger — at least one bark fires from the sim core on a wired trigger | OPEN → M7 |
| 23 | lore + esports denylist — codex refs resolve; every leader/Elite/Champion/boss/trainer has name+title+dialogue; denylist rejects real names | OPEN → M8 |
| 24 | codex/journal state — entries unlock on encounter; journal reflects raids/factions/reputation | OPEN → M8 |
| 25 | save-v4-roundtrip — v4 reloads identically; v3→v4 and v2→v4 default cleanly | PASS — M1 |
| 26 | perf-harness — 30-unit/200-projectile scene steps with no steady-state hot-path allocation; frame time recorded here | OPEN → M9 |

### Phase 6 demo script (phase6 spec §8)

1. New Game, pick a starter. Find a hero rumor; beat their **echoes** until the shard-gated **trial** reveals; complete the **trial** (a real scripted runner) and win the **Bind**; the hero joins. Fail a different trial once and watch it **relocate**.
2. Open the **gambit editor**, author a rule from dropdowns for two heroes, fight a **gym** best-of-3, spend a **Captain Call** by hand to land an ult; win the badge. Note the enemy's bonus calls.
3. Re-run a regional **boss on Nightmare**; show scaled stats, a **loot drop** with the pity counter moving, and reward scaling on a deeper-region kill.
4. Capture a high-tier neutral; take its **neutral item** into the dedicated slot; at the **Tinker's Bench** reroll it and enchant three duplicates up a tier; **buyback** after a wipe and burn a **Tome** on a lagging recruit.
5. Enter a **raid**: field five, press **1–5** to switch drivers, dodge a telegraphed **zone**, survive an **add wave**, **taunt** to redirect the boss, clear it for a loot roll; kill **Roshan**, grab the **Aegis**, die once to consume it.
6. At the Tower of the Ancients, run **draft** (pick/ban), beat an **Elite** member, then the **Champion**.
7. Cast signature abilities — each shows its **gesture animation** and a distinct **synthesized sound**, with an in-character **bark**; open the **codex** (an entry that unlocked on encounter, a venue name that winks at a famous event) and the **journal** (raids/factions/reputation). Adjust an audio channel and mute. Run the **perf harness** (30 units, 200 projectiles) and show the frame time in budget. Save, reload (**v4**), confirm everything persists.

### Phase 6 perf numbers (recorded at M9)

_Pending M9 — the visual 30-unit/200-projectile harness records steady-state frame time here._

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
