# Playwright QA Plan — ANCIENTS

A full test plan for the browser game, from bootup through every major feature. It maps what to test, how to test it, and which run mode to use for each case.

ANCIENTS is a Three.js + TypeScript action RPG built with Vite. Game logic runs in a deterministic headless sim at 30 Hz, and a DOM HUD overlays the WebGL canvas. That split shapes the whole plan: most behavior is testable without WebGL through the in-page harness, and only visuals need the real renderer.

## How tests run

Two modes, picked per case:

- **Headless logic** (`?test=1&render=headless`): no WebGL, sim runs at full speed, time is stepped synchronously. Use for anything you can assert as state. This is the default and the bulk of the plan.
- **WebGL visual** (`?test=1`, real renderer): boots the Three.js scene. Use only for rendering, screenshots, and "does it draw without crashing" checks.

Three entry points drive the game:

- `?test=1` auto-boots past the title screen straight into a fresh seeded game. Optional params: `hero`, `region`, `seed`, `render=headless`.
- `window.__test` — the QA control surface (`src/systems/test-harness.ts`): boot, step time, read state, apply cheats.
- `window.__game` — the live `Game` instance, the escape hatch for assertions the snapshot does not cover.

Existing helpers live in `e2e/helpers.ts`: `boot`, `state`, `fastForward`, `waitForPlayableUi`, `skipActiveCinematic`, `attachScreenshot`, `watchPageErrors`, `expectNoPageErrors`.

### Rules of the road

- Prefer `fastForward(seconds)` over `page.waitForTimeout`. Real-time waits are flaky; stepped time is deterministic.
- Pass a fixed `seed` to any test that depends on world layout or loot.
- Assert on `__test.state()` or `__game` first; fall back to DOM only when the DOM is the thing under test.
- Run `watchPageErrors` / `expectNoPageErrors` in every spec. A clean console is itself a test.
- There are no `data-testid` attributes. Selectors are stable element IDs and `[data-*]` content hooks, listed at the end.

### Priorities

- **P0** — boot, core loop, save/load, no-crash. If these fail the build is dead.
- **P1** — major features players touch every session: combat, shop, progression, dungeons.
- **P2** — deeper systems: raids, forge, recruitment, settings.
- **P3** — edge cases, visual polish, broad coverage sweeps.

---

## Suite 1 — Bootup and startup

The first thing any player sees, and the first thing to break.

### 1.1 Title screen (P0, WebGL)

The title screen only appears on a normal boot, not under `?test=1`. To reach it, navigate to `/` with no test param.

- Title screen renders: `#title-screen` visible, `#new-game` present.
- **New Game** opens the starter picker; the three starter cards show `[data-pick="juggernaut"]`, `[data-pick="crystal-maiden"]`, `[data-pick="sniper"]`.
- **Back** (`#back-title`) returns to the title.
- Continue slots `[data-load="0|1|2|auto"]` appear only when a matching save exists in `localStorage`.
- Picking a starter shows the loading screen, then drops into gameplay.

### 1.2 Loading screen (P1, WebGL)

- `#loading-screen` appears during asset preload with `.loading-label` and `.loading-progress`.
- It hides (`.hide` class, `display: none`) once the scene is built. `waitForPlayableUi` covers this.

### 1.3 Harness boot (P0, headless)

- `boot(page, { render: headless })` resolves and `__test.ready()` returns true.
- `__test.state()` returns a populated snapshot: `ready: true`, a region id, a non-empty `party`.
- Boot into each of the 10 regions by id and confirm `regionId` matches and the party spawns. Regions: `tranquil-vale`, `nightsilver-woods`, `icewrack`, `devarshi-desert`, `shadeshore`, `vile-reaches`, `quoidge`, `hidden-wood`, `mount-joerlak`, `mad-moon-crater`.
- Boot each of the 3 starters via `?hero=` and confirm the right hero is active.
- No console or page errors across every boot.

### 1.4 WebGL canvas (P0, WebGL)

- `#game-canvas` exists and has a non-zero backing size after boot.
- The canvas resizes with the viewport.
- A real-renderer boot produces no WebGL or shader errors in the console.

### 1.5 Prologue cinematic (P1, both)

A fresh save in Tranquil Vale plays the prologue (`prologue-moon-breaks`).

- `#cinematic-layer` is visible and `__game.cinematic.active` is true on first boot there.
- Cinematic controls work: click / Space / Enter advance, Tab fast-forwards, Esc holds to skip. `[data-cinematic="next|ff|skip"]` are present.
- `skipActiveCinematic` clears it; `__game.cinematic.active` goes false and the HUD becomes playable.
- Region arrival cutscenes play on first entry to a region.

---

## Suite 2 — HUD and UI shell

The DOM overlay that frames everything. Build it from `src/ui/hud.ts`.

### 2.1 Top bar (P1, both)

- `#top-bar` shows region name (`.region`), day/night dial, gold, stamina, exploration %, and resin.
- Gold display tracks `__test.addGold(n)`.
- Journal and Codex buttons exist (`[data-open="journal"]`, `[data-open="codex"]`).

### 2.2 Party column and hero panel (P1, both)

- `#party-col` shows one frame per party member, with `[data-swap="0".."4"]`.
- The active hero's frame carries `.active`.
- `#hero-panel` shows the active hero portrait, HP/mana/XP bars, ability slots, item slots, and `#talent-open`.
- Fielded creeps appear as entourage frames.

### 2.3 Minimap (P2, WebGL)

- `#minimap` is a 160×160 canvas that renders without error.
- It draws camps, gates, gyms, the town, and the player marker (smoke check that the canvas is non-blank).

### 2.4 Toasts, floaters, hints (P2, both)

- `#toast-col` shows toasts; killing an enemy or picking up loot produces one.
- `#floater-layer` shows damage numbers during combat.
- `#hud-hint` shows context hints near recruitable heroes, capturable creeps, gyms, gates, and shops.

### 2.5 Modals open and close (P1, both)

For each modal, open it, confirm `#modal-root` loses `.hidden` and `.modal-card` renders, then close it with `#modal-close` and with Esc. Modals:

| Modal | Open with | Notes |
|---|---|---|
| Party | Tab | Roster, echoes, gambits, creep storage |
| Shop | B (in town) | Buy/sell tabs |
| Menu | Esc | Save/load, settings, quit |
| Talents | level-up or `#talent-open` | Talent picks |
| Journal | J or `[data-open="journal"]` | Quests, factions, badges |
| Codex | K or `[data-open="codex"]` | Lore/Heroes/Atlas/Cinematics |
| Services | Y (in town) | Boss reruns, forge, armory, black market |
| Dungeon entry | interact at a portal | Tier and modifier picks |

Opening one modal should not leave another open. Esc inside a modal closes it rather than reopening the menu.

---

## Suite 3 — Movement and input

The control layer in `src/systems/input.ts`.

### 3.1 Movement orders (P1, headless)

- `__game.orderMove(x, y)` moves the active unit toward the target; position changes over `fastForward`.
- `orderStop` halts it.
- `orderAttackMove` advances and engages hostiles along the way.
- Facing updates with movement direction.

### 3.2 Dash and sprint (P2, headless)

- `tryDash` consumes stamina and moves the unit; it is blocked while on cooldown or out of stamina.
- Sprint held (`setSprintHeld(true)`) raises move speed.

### 3.3 Camera and zoom (P3, WebGL)

- Mouse wheel zooms when no modal is open and does nothing while a modal is up.
- M toggles map-view vs follow camera.

### 3.4 Keybinds resolve (P2, both)

Confirm each bound key triggers its action: QWERDF abilities, ZXCV item actives, N neutral, 1–5 swap, A attack-move, S stop, T capture, G interact, B shop, Y services, Tab party, J/K journal/codex, Esc menu, F5 quick-save.

---

## Suite 4 — Heroes, abilities, progression

### 4.1 Starter spawn (P0, headless)

- Each starter boots with the expected level, full HP/mana, and a working ability set.
- `state().party[0].heroId` matches the requested hero.

### 4.2 XP and leveling (P1, headless)

- `__test.addXp(n)` raises the active hero's level when the threshold is crossed.
- Stats scale with level (maxHp, maxMana grow).
- Crossing a level that grants a talent auto-opens the talent modal.

### 4.3 Ability casts (P1, headless)

- `castAbility(slot)` on a hero with mana fires the ability, deducts mana, and starts its cooldown.
- A targeted ability without quick-cast arms targeting mode; LMB confirms, Esc cancels.
- Quick-cast (default on) fires at the cursor with no confirm.
- Cooldowns block recasts until elapsed (`fastForward` past the cooldown re-enables it).

### 4.4 Talents and facets (P2, headless)

- Talent picks apply through `#talent-open`.
- Hero echoes accrue from kills and unlock talents/facets per the party modal.

### 4.5 Hero swap (P1, headless)

- Keys 1–5 swap the active hero; `state().activeIdx` updates.
- Swap mechanics (cooldown, on-swap heal) behave per design.
- Party frame `[data-swap]` clicks swap too.

---

## Suite 5 — Combat

### 5.1 Basic attacks (P1, headless)

- `orderAttack(target)` damages a hostile until it dies.
- `clearHostiles()` returns a count and `inCombat()` goes false afterward.
- Kills grant gold and XP; `state().gold` rises.

### 5.2 Death and revive (P1, headless)

- A hero reaching 0 HP is `alive: false`.
- If the active hero dies, control and saving behave per the death rules (saving is blocked).
- `healParty()` restores HP and mana for living heroes.

### 5.3 Statuses (P2, headless)

- Stun, root, and slow apply and expire; assert via `__game` unit status state.
- Resonance (elemental reactions) toggles in settings and changes combat output when on.

### 5.4 Items in combat (P2, headless)

- `useItem(slot)` triggers an active item, applies its effect, and starts its cooldown.
- Neutral item active (N) fires.

---

## Suite 6 — Shop and economy

### 6.1 Shop access (P1, headless)

- B opens the shop only in town; `canShop()` / `inTown()` gate it.
- Shop is blocked outside town and during combat.

### 6.2 Buy and sell (P1, headless)

- Buying boots (`[data-buy]`) deducts gold, adds the item, and raises the hero's move speed.
- Selling (`[data-sell]`) removes the item and refunds gold.
- Gold can't go negative; buying with insufficient gold fails cleanly.

### 6.3 Gated stock (P2, headless)

- Items gated behind progression do not appear in the shop until unlocked. Boot fresh and confirm a known gated item is absent.

---

## Suite 7 — Capture and entourage

### 7.1 Capture eligibility (P1, headless)

- A capturable creep above the HP threshold can't be bound; `tryCapture` fails.
- Damaging it below the tier threshold makes it eligible.
- `#capture-bar` shows the binding channel ("Binding...") and hides when done.

### 7.2 Capture completion (P2, headless)

- A successful bind adds the creep; `state().caught` increments.
- Fielding a creep (`[data-field]` in the party modal) puts it in the entourage, capped at 3.
- Merging three of a kind produces a starred creep.

---

## Suite 8 — Dungeons

The live multi-room session in `src/systems/dungeon-session.ts`. The four dungeons: `frost-hollow`, `severed-dark`, `worldstone-vault`, `ember-caldera`.

### 8.1 Entry and gating (P1, headless)

- Starting a dungeon requires being in the right region; the entry is gated otherwise.
- `__game.startDungeon(id, tier)` enters; `state().dungeon` populates with id, tier, room index, room type, and depth.
- The dungeon-entry modal offers tier, modifiers, and Open/Endless/Daily (`[data-dungeon-*]`).

### 8.2 Full clear (P1, headless)

- Clear room by room: kill hostiles, confirm `exitsUnlocked` flips true, advance, repeat to the guardian.
- Beating the guardian sets `dungeon.done` and awards loot; `state().stash` grows.
- Exiting returns to the overworld with `state().dungeon` null.

### 8.3 Endless and daily (P2, headless)

- Endless mode keeps generating rooms past the normal depth.
- Daily mode uses a date-derived seed; the same day yields the same layout.

---

## Suite 9 — Gyms, bosses, raids

### 9.1 Gym challenge (P1, headless)

- `challengeGym` opens the prefight modal with Fight Live / Auto-Resolve (`[data-pf]`).
- Auto-resolve runs a best-of-3 and reports a result.
- A live gym (`startLiveGym`) runs gambit-driven 5v5; Captain Calls (`[data-livegym="call"]`, Space) grant timed direct control; `#live-gym-bar` shows the score.
- Winning a gym awards a badge; `state().badges` increments.

### 9.2 Boss fights (P2, headless)

- `runBossFight` resolves a boss across Normal / Nightmare / Hell tiers.
- Boss reruns appear in Services (`Y`), selectable via `[data-boss="id:tier"]`.

### 9.3 Raids (P2, headless)

- `runRaid` / `startLiveRaid` runs a raid; the driver is chosen with 1–5.
- Roshan-style raids grant the Aegis on a win.

### 9.4 Elite and Champion (P3, headless)

- The Elite Five draft gauntlet (`runEliteMatch`) chains matches.
- `runChampion` runs the Tower fight.

---

## Suite 10 — Progression gates and travel

### 10.1 Badge gates (P1, headless)

- A region gate blocks travel without the required badge.
- `tryTravel` / `tryInteract` at a gate succeeds once the badge is owned.

### 10.2 Recruitment chain (P2, headless)

- Approaching a recruitable hero shows the recruit hint.
- The flow runs Find → Trial → Bind: trial choices appear in `#trial-choice` (`[data-choice]`), and a bind duel follows.
- A successful recruit raises `state().recruited`.

### 10.3 Exploration and town (P2, headless)

- Exploration % rises as the player covers ground.
- Entering town flips `inTown()` true and enables shop/services.

---

## Suite 11 — Save and load

### 11.1 Manual slots (P0, headless)

- Saving to a slot writes `ancients.save.1|2|3` in `localStorage`.
- Reloading the page and loading that slot restores region, gold, party, badges, and caught creeps.
- F5 quick-saves to slot 0.

### 11.2 Autosave (P1, headless)

- Autosave writes `ancients.save.auto` on its triggers (town entry, badge win, and the like).

### 11.3 Save gating (P1, headless)

- Saving is blocked in combat and when the active hero is dead; `canSave()` reflects this.

### 11.4 Export and import (P2, headless)

- Export produces JSON from the menu; import (`#title-import` / menu import) loads it back.
- Importing a save from version 6 round-trips; an older version migrates cleanly.
- Malformed JSON is rejected without crashing.

---

## Suite 12 — Settings

Open via Esc → Menu.

### 12.1 Toggles take effect (P2, headless)

- Quick-cast (`#opt-quickcast`) on/off changes whether targeted abilities need a confirm click.
- Resonance (`#opt-resonance`) on/off changes combat reactions.
- Reduced motion and photosensitive options apply.

### 12.2 Graphics quality (P3, WebGL)

- Quality (`#opt-quality`: auto/low/medium/high/ultra) switches without crashing the renderer.
- Exposure and color grade adjust the scene.

### 12.3 Audio (P3, both)

- Master/SFX/voice/stinger sliders and mute apply.
- Audio unlocks on the first `pointerdown`.

---

## Suite 13 — Journal, Codex, meta UI

### 13.1 Journal (P2, both)

- J opens the Quest Journal: recruitment, conquest, factions, badges, titles sections render.
- Completed milestones show as done.

### 13.2 Codex (P2, both)

- K opens the Compendium with Lore / Heroes / Atlas / Cinematics tabs (`[data-ctab]`).
- Tab switching works; locked entries stay gated until unlocked.
- The cinematic gallery lists played cutscenes.

### 13.3 Services menu (P2, headless)

- Y in town opens Services: boss reruns, Tinker's Bench, Armory, Black Market, loadouts.

---

## Suite 14 — Forge, armory, black market

### 14.1 Loot and stash (P2, headless)

- Loot drops carry quality grades and land in the armory stash; `state().stash` tracks count.
- The loot filter (`src/systems/loot-filter.ts`) auto-disenchants below the configured grade/rarity.

### 14.2 Forge (P2, headless)

- Forge operations run via Services: grade up, reforge, sockets, gems, masterwork. Each changes the item and spends the right currency.

### 14.3 Black market (P3, headless)

- Recipe/relic wheels and the gamble vendor spend loot marks and return an item.

---

## Suite 15 — Time, world state

### 15.1 Day/night (P1, headless)

- `fastForward` advances `dayTime`; `isNight()` flips on the right cycle.
- Biome music and lighting follow the cycle (WebGL for visuals).

### 15.2 Stamina and resin (P2, headless)

- Stamina drains on dash/sprint and regenerates over time.
- Resin (moonflow pacing) gates the actions it's meant to.

---

## Suite 16 — Visual regression

Real renderer, screenshot per scene, compared against a baseline. Tag `@visual`. Use a fixed seed and `skipActiveCinematic` for stable frames.

- Prologue cinematic frame.
- HUD in the overworld (Tranquil Vale, day).
- Shop modal open.
- Journal and Codex modals.
- A dungeon room.
- One screenshot per region for biome coverage (P3).
- Day vs night in the same region.

Attach each with `attachScreenshot`. Existing baselines live under `test-results/e2e-screenshots/`.

---

## Suite 17 — Stability sweeps

### 17.1 No errors per region (P0, WebGL)

- Boot each of the 10 regions with the real renderer, fast-forward a few seconds, and assert `expectNoPageErrors`.

### 17.2 Headless coverage matrix (P1, headless)

- Cross every starter with every region: boot, fast-forward, snapshot, assert no errors. 30 fast cases.

### 17.3 Long-run soak (P3, headless)

- Boot, fast-forward several in-game minutes, and confirm no errors, no NaN stats, and a stable party.

### 17.4 Rapid modal toggling (P2, both)

- Open and close every modal in sequence, repeatedly, and confirm `#modal-root` ends hidden with no stuck input grab.

---

## Selector and API reference

No `data-testid` exists. Use these.

### Stable element IDs

```
#app  #game-canvas  #ui-root
#title-screen  #new-game  #back-title  #title-import
#loading-screen
#top-bar  #party-col  #hero-panel  #minimap  #toast-col
#floater-layer  #capture-bar  #hud-hint  #trial-choice  #live-gym-bar
#cinematic-layer  #modal-root  #modal-close
#talent-open  #debug-panel
#opt-quickcast  #opt-resonance  #opt-quality
```

### Data-attribute hooks

```
[data-pick]                  starter cards
[data-load]                  continue / load slots
[data-save]                  menu save slots
[data-swap]                  party hero swap
[data-field]                 field/unfield creep
[data-buy] [data-sell] [data-tab]   shop
[data-choice]                trial choices
[data-cinematic="next|ff|skip"]     cinematic controls
[data-livegym="call"]        gym Captain Call
[data-pf="live|auto|cancel"] gym prefight
[data-dungeon-*]             dungeon entry
[data-boss="id:tier"]        boss reruns
[data-open="journal|codex"]  top-bar buttons
[data-ctab]                  codex tabs
```

### State classes

```
#modal-root.hidden           modal closed
#cinematic-layer.hidden      cinematic done
#capture-bar.hidden          not capturing
.party-frame.active          active hero
#top-bar .region             region name (playable signal)
```

### In-page APIs

```js
// Control surface (test-harness.ts)
__test.ready()
__test.startNewGame({ hero, region, seed, gold, headless })
__test.start(save, { headless })
__test.load(save)
__test.fastForward(seconds)   // step the sim, no real-time wait
__test.step(stepMs)
__test.addGold(n)
__test.addXp(n, partyIdx)
__test.healParty()
__test.clearHostiles()        // returns count
__test.teleportActive(x, y)
__test.state()                // JSON snapshot for assertions

// state() snapshot fields
{ ready, mode, regionId, regionName, gold, playtime, dayTime, isNight,
  inTown, inCombat, activeIdx, party[], recruited, badges, caught, stash,
  dungeon }

// Live Game escape hatch
__game.orderMove / orderAttack / orderAttackMove / orderStop
__game.castAbility / useItem / tryDash / tryCapture / trySwap / tryInteract / tryTravel
__game.challengeGym / startLiveGym / runBossFight / runRaid / startLiveRaid
__game.startDungeon(id, tier) / runEliteMatch / runChampion
__game.canShop() / inTown() / inCombat() / canSave() / isNight()
__game.cinematic.active / cinematicSkip()
__game.liveGym / liveRaid / liveDungeon
__game.gold / party / badges / caught / recruited / inventoryStash
```

### Helpers (`e2e/helpers.ts`)

```
boot(page, { hero, region, seed, webgl })
state(page)
fastForward(page, seconds)
waitForPlayableUi(page)
skipActiveCinematic(page)
attachScreenshot(page, testInfo, name)
watchPageErrors(page) / expectNoPageErrors(errors)
```

---

## Coverage gaps worth adding first

The current specs cover boot, heroes, items, mechanics, dungeons, story, and visual smoke. The highest-value additions, roughly in order:

1. Save/load round-trip across a page reload (Suite 11).
2. Per-region no-error sweep with the real renderer (Suite 17.1).
3. Shop buy/sell economy beyond the existing boots case (Suite 6).
4. Settings toggles actually changing behavior (Suite 12).
5. Gym prefight and live/auto fight (Suite 9.1).
6. Modal open/close keyboard coverage for all modals (Suite 2.5).
7. Recruitment and capture full chains (Suites 7, 10.2).
