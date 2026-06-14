# COMBAT OVERHAUL — making team battles and raids something you play

How the macro 5v5 (gyms, Elite Five) and the raid 5v1 stop being things you watch and become things you play. Companion to `SPEC.md` (the design target, especially §1.1 controllers, §6 Micro Combat, §7 Macro Combat, and §4 Raids), `DECISIONS.md` (calls already made), `GAMEPLAY_OVERHAUL.md` (the Genshin/overworld side), and `PROGRESS.md` (what shipped).

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays untouched.** It never imports `three`, never touches the DOM, and stays deterministic for a seed. The work here is wiring the player's hands to sims that already exist: the `player` controller, `Sim.order`, hero swap, and the threat/taunt boss controller are all built and tested. We are connecting input, camera, and orders to the gym and raid sub-sims that today run with the player locked out. The boundary test (`src/test/boundary.test.ts`) stays green; the headless auto-resolve paths stay as the tested system of record; everything is additive and reversible, the way Resonance was.

---

## 0. WHERE WE ARE — measured honestly

The combat core is in good shape and well tested. A full 5v5 or 5v1 resolves headlessly in milliseconds, deterministically, with kits, items, statuses, threat, and taunt all working. The gap is the live layer on top. In team battles and raids, the player is mostly a spectator, because the interactive paths were either stubbed or never built.

Three findings.

**Finding 1 — Captain's Call is not control.** `SPEC.md` §1.1 says a call should "temporarily attach player input to one unit," and §7 says it lets you "take direct control of one hero for 5 seconds to land the Black Hole / Ravage / clutch save manually." The shipped behavior auto-steers the seized hero instead:

```181:190:src/systems/macro-session.ts
  private steer(cap: CaptainCallController, foes: Unit[]): void {
    if (cap.activeUid === null) return;
    const caller = this.sim.unit(cap.activeUid);
    if (!caller) return;
    const target = [...foes].sort((x, y) => x.hp / x.stats.maxHp - y.hp / y.stats.maxHp)[0];
    if (!target) return;
    caller.order = caller.abilityReady(3, this.sim.time).ok
      ? { kind: 'cast', slot: 3, uid: target.uid, point: { ...target.pos } }
      : { kind: 'attack-unit', uid: target.uid };
  }
```

During a live gym fight, the input layer is gated down to a single key:

```186:192:src/systems/input.ts
    if (this.game.liveGym) {
      if (key === ' ' || key === 'spacebar') {
        e.preventDefault();
        this.game.liveGymPlayerCall();
      }
      return;
    }
```

So a Captain's Call is a button that makes the AI cast its ultimate at the lowest-HP enemy. The player picks the moment and nothing else: no movement, no aim, no target choice, no item use, no ability order, no positioning. That is the missing feeling in gym fights. You press one button and watch.

**Finding 2 — the auto-battler AI is shallow.** The gambit grammar never grew past its first version:

```772:789:src/core/types.ts
export type GambitCondition =
  | { k: 'always' }
  | { k: 'self-hp-below'; pct: number }
  | { k: 'ally-hp-below'; pct: number }
  | { k: 'enemy-hp-below'; pct: number }
  | { k: 'self-mana-above'; pct: number }
  | { k: 'self-mana-below'; pct: number }
  | { k: 'has-status'; status: StatusId; target: 'self' | 'focus' }
  | { k: 'target-role'; role: string }
  | { k: 'target-attribute'; attribute: Attribute }
  | { k: 'enemies-within'; radius: number; count: number }
  | { k: 'allies-alive'; count: number }
  | { k: 'ability-ready'; slot: number }
  | { k: 'fight-time-gt'; sec: number }
  | { k: 'distance-to-focus-gt'; dist: number }
  | { k: 'distance-to-focus-lt'; dist: number };

export type GambitTargetMode = 'lowest-hp-enemy' | 'most-clustered' | 'self' | 'lowest-hp-ally' | 'focus';
```

The reactive condition `SPEC.md` §7 promised, `enemy-cast-seen` (blink / ult / channel), was never built, so a gambit cannot answer an enemy play. There is no positioning intelligence: a unit walks to its focus and trades. No kiting, no spacing out of an area effect, no peeling for a dived ally, no team focus-fire. Each hero picks its own target through a low-HP-and-near heuristic (`pickFocus` in `src/core/controllers.ts`), so five heroes diffuse onto five targets instead of converging. Teamfights read as two blobs colliding until one side is gone.

**Finding 3 — raids are not played.** `SPEC.md` §4 describes raids as live: "you drive one hero and the other four run their gambits. 1–5 switches which hero you drive," with telegraphed boss attacks you dodge and a taunt that redirects the boss. The shipped path runs the whole 5v1 headlessly and returns a result:

```892:898:src/systems/game.ts
    const result = runRaidEncounter({
      def,
      party: this.gymPlayerTeam(),
      tier,
      seed: stableContentSeed(`${raidId}:${tier}`, clears) + Math.round(this.playtime),
      aegis
    });
```

The scripted beats (phase-transition zones, add waves, the signature beat, the enrage timer) fire inside `runRaidEncounter`, but the gambit AI eats them and the player sees only win or loss plus loot. `DECISIONS.md` (2026-06-13, M5) states this plainly: raids "auto-resolve with mechanics firing rather than rendering a live raid — the live-stepped path (à la `LiveGymFight`) is a presentation follow-up." That follow-up never shipped.

**The root cause, in one line.** Input, camera, and orders are bound to one sim and one unit:

```409:411:src/systems/game.ts
  activeUnit(): Unit | null {
    return this.party[this.activeIdx]?.unit ?? null;
  }
```

Every order method routes through `activeUnit()` into `this.sim`, the overworld sim. A gym or raid runs in a separate sub-sim with its own units, so the only player action that can reach it is the one hard-coded call to `liveGymPlayerCall()`. Fix that binding and the rest of this plan follows.

---

## 1. THE CONTROL MODEL — settled

The two layers want different player roles, and `SPEC.md` already draws the line. We keep it.

**Gyms and the Elite Five: you are the coach who seizes.** You build the five, set their gambits and item policy, then watch the plan execute. A Captain's Call hands you one hero under full control for a few seconds so you land the fight-deciding ultimate or the clutch save yourself. This keeps the macro layer's auto-chess-meets-Dota identity (`SPEC.md` §7: "RTS × auto chess"). The fix is to make the seize real, not to make you pilot the whole fight. This is the chosen direction.

**Raids: you drive one of five.** A raid is the party fielded at once against a giant boss. You pilot one hero with the full micro control set, swap drivers with 1–5, and the other four run their gambits while the boss runs its threat table. This is the micro control model pointed at a boss fight, exactly as `SPEC.md` §4 specifies. The fix is to build the live session that was deferred.

Both roles read off the same plumbing (the keystone in §2) and both benefit from the deeper gambit AI (§3.2), since the four heroes you are not driving in a raid, and all ten in a gym, run gambits.

What we are explicitly not doing: turning gyms into a five-hero piloting game, and turning raids into a spectator screen. The split is deliberate and the doc holds it.

---

## 2. THE KEYSTONE — an active combat context

Today `Game` assumes one sim and one driven unit, and `InputController` plus every `orderX` / `castAbility` / `useItem` / `trySwap` method reads them directly. Introduce a small seam that names the thing the player is currently controlling:

```ts
// systems-side; the core never sees this
interface CombatContext {
  sim: Sim;
  driven(): Unit | null;     // the unit input drives right now
  canSwap: boolean;          // 1–5 swaps drivers (raids), or is locked (gym seize)
  swapTargets(): Unit[];     // the five, for 1–5 mapping
}
```

`Game` holds the active context. Overworld is the default and behaves exactly as today (`sim` = the region sim, `driven()` = `party[activeIdx].unit`). A live gym installs a context whose `sim` is the fight sim; `driven()` returns the seized hero while a player call is active and `null` otherwise. A live raid installs a context whose `sim` is the raid sim and whose `driven()` follows the 1–5 selection.

The order and cast methods change from "act on `this.sim` / `activeUnit()`" to "act on `ctx.sim` / `ctx.driven()`." The input layer stops special-casing `liveGym` and instead asks the context what is drivable. This is the one real refactor in the plan. It changes no combat behavior on its own: with only the overworld context installed, the game plays identically, which is the regression check for the slice.

Why this first: it is the single dependency under both the real Captain's Call and live raids. Build it once, build it carefully, and the two features become wiring rather than rework. It also keeps the headless paths clean, because `runGymMatch` and `runRaidEncounter` never install a context; they step their sims directly, as they do now.

---

## 3. THE SYSTEMS, AS SEAMS

Each subsection names the change, the design, and the seam: what existing vocabulary it extends and where it lives, so nothing here is a from-scratch system or a core rewrite.

### 3.1 Real Captain's Call (the gym fix)

**Design.** Spending a call hands you full control of one hero in the fight sim for `captainCallSec` (5s today). For that window your whole input set drives that hero: right-click to move and attack, QWER+DF abilities, ZXCV item actives, attack-move, stop, and the camera locks to them. You land Tidehunter's Ravage on the cluster, blink Earthshaker in for the Echo Slam, pop BKB the instant their Black Hole starts, or pull your carry out with Force Staff. When the window ends, control reverts to the gambit and the charge is spent, as it does now. You still hold three calls; the leader's side still gets its bonus calls. The auto-chess shell is unchanged. The seize inside it becomes real.

**The seam.** This is the keystone plus a deletion. `CaptainCallController.activate` already swaps the unit to `player` control:

```45:56:src/systems/macro-session.ts
  activate(sim: Sim, uid: number): boolean {
    const u = sim.unit(uid);
    if (!u || !u.alive || u.team !== this.team || this.remaining <= 0 || this.activeUid !== null) return false;
    this.remaining -= 1;
    this.used += 1;
    this.activeUid = uid;
    this.expiresAt = sim.time + TUNING.captainCallSec;
    this.previous = structuredClone(u.ctrl);
    u.ctrl = { kind: 'player' };
    if (this.team === 0) sim.playerActiveUid = uid;
    return true;
  }
```

The unit is already a `player` unit during the call; the core already honors player orders. The two changes are: (1) while a live player call is active, the live fight installs the gym `CombatContext` with `driven()` = the seized hero, so input reaches it; (2) `LiveGymFight.stepOnce` stops calling `steer()` for the player's active call when the fight is live (the player is driving). The enemy keeps its auto-call `steer()`, and the headless `runGymMatch` keeps steering both sides so the auto-resolve and the gym-winnable test are unchanged. The player should also choose which hero to seize (click a portrait or the unit), rather than always taking the first ult-ready hero the way `liveGymPlayerCall()` does today.

`captainCallSec` and `captainCallsPerFight` stay in `tuning.ts`. Selecting and aiming during the window is the existing targeting UI from `input.ts`, pointed at the fight sim by the context.

### 3.2 Deeper gambit AI (helps the spectator and the four you do not drive)

A real seize fixes the moment you act. The rest of the fight, and the four heroes beside the one you seize, still run gambits. Deepening that AI is what makes a fight worth watching and a team worth building. Everything here is additive and headless-testable; it changes data and `src/core/controllers.ts`, not the combat resolution.

**New conditions** (extend `GambitCondition`):

- `enemy-cast-seen` with a category (blink / ult / channel): the reactive trigger `SPEC.md` §7 named. Enables "BKB when their initiator ults," "silence the channel," "Eul the blink-in."
- `self-disabled` / `incoming-disable`: react to being stunned, or to a disable landing on the team.
- `standing-in-zone`: the unit is inside a telegraphed area effect, which lets a rule say "walk out."
- `focus-is-role` and `enemy-count-by-role`: target and group reads richer than the current single `target-role`.

**New targeting modes** (extend `GambitTargetMode`):

- `most-dangerous`: highest live threat (damage output), so carries get focused over fodder.
- `enemy-casting`: the unit currently channeling or mid-cast, for interrupts.
- `by-role`: their carry, or their support, by tag.
- `nearest` and `lowest-hp-in-range`: cheap, common, missing today.

**New positioning actions** (extend `GambitAction`):

- `kite`: a ranged hero maintains attack range while attacking, instead of walking into melee.
- `peel`: move to and defend an ally being dived.
- `dodge-zones`: step out of the nearest telegraphed area effect.
- `focus-fire`: attack the team's shared focus rather than a private pick.
- `spread`: open spacing when an enemy area-of-effect threat is up.

**Team coordination.** A team picks one shared focus per decision tick (a light addition near `pickFocus`), so `focus-fire` makes five heroes converge. A designated initiator role lets the team hold until the engage hero commits, which is how a wombo combo actually lands. This is a small amount of shared state on the sim's team bookkeeping, read by the controller; it does not change how any ability resolves.

**Better defaults.** `buildDefaultGambit` should produce role-true behavior out of the box: a carry kites and focuses the shared target, an initiator blinks into the cluster and ults, a support peels and saves, a nuker bursts the most-dangerous enemy. The result is that a freshly recruited five fights like a Dota team before the player authors a single rule, and the gambit editor becomes tuning rather than the only thing standing between the player and a blob.

**Scope guard.** Keep the grammar a closed, data-driven vocabulary. Positioning actions are steering hints the existing movement system already executes (move orders, attack-range holds), not a new pathfinding system. If a behavior seems to need bespoke per-hero scripting, redesign it as a condition plus a targeting mode plus an action, the way the grammar already composes.

### 3.3 Live raids (build the deferred path)

**Design.** A `LiveRaid` session, sibling to `LiveGymFight`, that renders and steps the existing raid encounter. You field five, drive one with the full micro control set, and press 1–5 to switch drivers. The other four run their gambits; the boss runs its threat controller. The scripted beats become live and dodgeable: a phase-transition zone telegraphs on the party and you step out of it, an add wave spawns and you peel it off your backline, the signature beat at 50% is a wide hit you scatter for, and the enrage timer is a real clock pushing you to burn the boss. Taunt (Axe and friends) redirects the boss off your carry because threat and taunt already work in the core. The Aegis moment becomes yours to time. Swapping drivers carries no cooldown floor, because in a raid everyone simulates continuously (`SPEC.md` §4); the §6 swap-in cooldown floor is a micro-overworld rule and does not apply here.

**The seam.** Two pieces, both reuse.

First, the mechanic scheduler. `runRaidEncounter` already owns the beat logic in its `onTick`: it watches boss HP percentage, fires add waves and zones on the living-party centroid, composes the signature zone, and ramps on enrage. Extract that scheduler so it is driven by a tick callback rather than embedded in the headless loop:

```357:392:src/core/macro.ts
  const onTick = (s: Sim) => {
    if (!boss.alive) return;
    const hpPct = 100 * boss.hp / Math.max(1, boss.stats.maxHp);
    for (const m of mechs) {
      if (done.has(m.key)) continue;
      if (m.kind === 'enrage') {
        if (s.time >= def.enrageSec) {
          // hard ramp: the boss stops playing fair once the timer expires.
          boss.externalMods.damagePct = (boss.externalMods.damagePct ?? 0) + 120;
          boss.externalMods.attackSpeed = (boss.externalMods.attackSpeed ?? 0) + 120;
          boss.externalMods.moveSpeedPct = (boss.externalMods.moveSpeedPct ?? 0) + 30;
          boss.markStatsDirty();
          boss.refresh(s.time);
          record(m);
        }
        continue;
      }
      if (hpPct > m.atHpPct) continue;
      // ... add-wave / zone / signature ...
    }
  };
```

The headless `runRaidEncounter` keeps calling it through `runBattleToResult`'s `onTick` hook and stays the system of record for the raid tests and the M10 playthrough. The live `LiveRaid` calls the same scheduler from its own stepped loop, the way `LiveGymFight` steps the macro sim. One scheduler, two drivers, exactly the discipline that lets `runGymMatch` and the live gym share `LiveGymFight`.

Second, the session and wiring. `LiveRaid` owns the raid `Sim` (built by `setupRaidSim`, as today), tracks the driven index for 1–5, and exposes `cameraFollow()`. `Game` gains `startLiveRaid` / `updateLiveRaid` / `endLiveRaid` mirroring the live gym methods, installs the raid `CombatContext` from §2, and on completion runs the existing clear logic in `runRaid` (loot table, pity, Roshan's Aegis and respawn timer, codex unlock). Town Services offers "Fight live" or "Auto-resolve" for each raid, the same choice the gym pre-fight screen already gives.

This is why §2 comes first: with the context seam in place, the player's existing controls drive the raid hero with no new input code, and 1–5 swapping is the context changing its driven index.

### 3.4 Readability and feedback (make the depth legible)

Deeper AI and live control only land if the player can read the fight. This slice is presentation, no core change, keyed off events the sim already emits.

- **Telegraphs that read.** Every dodge-check beat (raid zones, the signature, future elite attacks) draws a ground decal during a windup at least as long as a fair reaction window. The decals exist (`GRAPHICS_SPEC` P4); the requirement is an honest windup before the hit, which is the §3.0 timing contract in `GAMEPLAY_OVERHAUL.md`.
- **Threat and aggro.** Show who the boss is hitting and when a taunt flips it, so the tank's job is visible and the carry knows when it is safe to commit.
- **Cast bars and intent.** A cast bar on enemy channels and big ults, so "interrupt now" and "BKB now" are decisions the player can see coming, mirroring what the new `enemy-cast-seen` gambit condition reacts to.
- **Focus and call prompts.** Surface the team's shared focus, and prompt "ult ready" on a hero worth seizing, so a Captain's Call is an informed choice rather than a guess.

None of this changes a result. It makes the systems underneath visible enough to play around.

---

## 4. ARCHITECTURE IMPACT — what touches what

| Layer | What it gains | Touches the headless core? |
|-------|---------------|----------------------------|
| `src/core/` | The gambit grammar grows: new `GambitCondition`, `GambitTargetMode`, and `GambitAction` members in `types.ts`, interpreted in `controllers.ts` (new evaluators, targeting, positioning, and a shared team focus). All additive and deterministic. No new exotic, no `three`, no DOM. The `runRaidEncounter` scheduler is extracted but its behavior is unchanged. | Yes, but only the controller and the gambit grammar, which is the AI layer the core already owns |
| `src/systems/` | The `CombatContext` seam in `Game`; order/cast methods read the context; `startLiveRaid` / `updateLiveRaid` / `endLiveRaid`; `LiveRaid` (sibling of `LiveGymFight`); the real-seize branch in `LiveGymFight` and hero selection for the call. | No (calls existing core primitives) |
| `src/engine/` | Camera lock to the driven unit per context; raid scene swap like the gym scene swap; telegraph decals, cast bars, threat and focus indicators, call prompts. | No (`boundary.test.ts` stays green) |
| `src/ui/` | Captain's Call hero selection; raid pre-fight "Fight live / Auto-resolve" in Town Services; the live raid overlay; the new gambit conditions, target modes, and actions exposed in the gambit editor's dropdowns. | No |
| `GameSave` | None required. The new grammar members are additive union variants, so any persisted gambits keep loading; live sessions and Captain's Calls are runtime, not saved. No `SAVE_VERSION` bump. | N/A |

**The core touch is the AI layer, not the resolution layer.** The gambit controller already lives in `src/core/`; growing its grammar is the kind of change the core is built for, and it stays deterministic and headless-testable. No ability, item, status, or damage path changes. The boundary test and the fixed-seed determinism tests stay green.

**Determinism and the system of record.** The headless `runGymMatch` and `runRaidEncounter` stay exactly as they are and remain the tested path: the gym-winnable test (`src/test/gyms.test.ts` test 6), the raid mechanic tests, and the M10 full playthrough (`src/test/playthrough.test.ts`) all run through them. Live sessions are added beside the headless paths and share their engines (`LiveGymFight` already proves this pattern), so a live fight and its auto-resolve agree.

---

## 5. PHASING — shippable slices, each playable and green

Ordered so the keystone lands first, then the highest-impact felt fix, then depth, then the raid build-out, then the readability that ties it together. Build ahead freely; each slice stands on its own.

**C0 — The active combat context (keystone).** Introduce `CombatContext`, route input, camera, and the order/cast methods through it, install the overworld context by default. No behavior change: the overworld plays identically and every existing test stays green. This is invisible and it unlocks the rest.

**C1 — Real Captain's Call.** During a live player call, install the gym context with the seized hero as driven, and stop auto-steering the player's call in the live fight. Add hero selection for the call and camera lock for the window. The enemy auto-call and the headless auto-resolve are untouched. This is the headline fix for the gym complaint and the smallest change once C0 exists.

**C2 — Deeper gambit AI.** Add the new conditions, targeting modes, positioning actions, the shared team focus, and role-true defaults. Expose them in the gambit editor. Improves every fight, seized or watched, and every raid ally. Pure additive grammar growth with headless tests per behavior.

**C3 — Live raids.** Extract the raid mechanic scheduler, build `LiveRaid`, wire `startLiveRaid` / `updateLiveRaid` / `endLiveRaid` and the raid context, offer "Fight live / Auto-resolve" in Town Services. The deferred raid experience, finally interactive, with the headless encounter still the system of record.

**C4 — Readability and feedback.** Telegraph decals with honest windups, threat and aggro indicators, cast bars, shared-focus and call prompts. The presentation pass that makes C1–C3 legible.

C0, C1, and C4 carry no grammar change and no new region content, so they land quickly. C2 is the meaty AI slice; C3 is the meaty engine slice.

---

## 6. ACCEPTANCE — each slice is done when (testable, `PROGRESS.md` style)

| Slice | Done when |
|-------|-----------|
| C0 | Input, camera, and every order/cast method read the active `CombatContext`. With only the overworld context installed, the game plays identically and the full existing suite stays green, including `boundary.test.ts` (no `three`/DOM in core) and the fixed-seed determinism tests. A unit test asserts that orders issued through `Game` land on `ctx.sim` / `ctx.driven()`, and that the overworld context resolves to the current active party hero. |
| C1 | In a live gym fight, spending a Captain's Call gives the player full control of the chosen hero in the fight sim for `captainCallSec`: a move order, an ability cast, and an item active all resolve on the seized hero, and the camera locks to it; when the window expires, control reverts to `gambit` and the charge is spent. The player's active call is no longer auto-steered in the live path. The enemy still auto-calls, the headless `runGymMatch` still steers both sides, and the gym-winnable test (test 6) and captain-call-live test (test 7 in `src/test/gyms.test.ts`) stay green. |
| C2 | The gambit grammar carries the new conditions, target modes, and actions, each with a headless test on a fixed seed: `enemy-cast-seen` fires a rule when the flagged cast is observed; `most-dangerous` targets the highest-threat enemy; `focus-fire` makes a team converge on one target; `kite` keeps a ranged hero at range while attacking; `dodge-zones` moves a unit out of a telegraphed area effect. A default five built by `buildDefaultGambit` beats a baseline opponent more often than the old defaults on a seed sweep. The gambit editor lists the new options. `boundary.test.ts` stays green. |
| C3 | `LiveRaid` steps a rendered raid where the player drives one hero, 1–5 swaps drivers, the four allies run gambits, and the boss runs its threat table; the scheduled beats (phase zones, add wave, signature, enrage) fire live and are dodgeable; a taunt redirects the boss; a held Aegis revives once. The headless `runRaidEncounter` is unchanged and still drives the raid tests and the M10 playthrough. A test asserts the live session and the headless encounter agree on a clear for a fixed seed and scripted (or absent) player input. |
| C4 | Every dodge-check beat shows a ground telegraph during a windup at least as long as its fair-reaction window; enemy channels and big ults show a cast bar; the boss's current aggro and the team's shared focus are shown; a Captain's Call prompt appears when a seize-worthy ult is ready. None of it changes a combat result (the determinism tests stay green). |

Cross-cutting gates (every slice): `npm test` and `npm run build` green; `boundary.test.ts` green; the headless auto-resolve paths remain the system of record and agree with their live siblings; no exotic slots spent; the overworld and the gym/Elite/raid layers all behave identically with the changes toggled through their normal entry points.

---

## 7. OPEN DECISIONS — settle these while building

1. **Pausing during a Captain's Call.** Should the seize window run in real time (highest skill, most Dota), or briefly slow or pause time so the player can aim a hard ability under pressure? Real time is the faithful default; a slight slow-down is a friendlier option worth a playtest. Decide in C1.
2. **Seizing a dead-or-busy hero.** What happens if the seized hero dies, is stunned, or is mid-channel when the call lands? Default: the charge is spent and the window runs (you can still move once free), matching Dota's "you committed." Confirm in C1.
3. **Re-seizing and stacking calls.** Can the player spend a second call to extend or switch heroes mid-window, or is one call one window? Default: one window at a time (the controller already blocks a second activate while `activeUid` is set). Confirm in C1.
4. **Gambit grammar size in the editor.** The deeper grammar risks an overwhelming editor. Keep the ≤8-rule list, but consider grouping conditions and actions by category in the dropdowns, and keep the presets (Default / Aggro / Safe) as the on-ramp. Decide in C2.
5. **Live raid difficulty re-tune.** Auto-resolved raids were tuned against gambit play. Once a skilled player dodges telegraphs and times taunts, the same numbers may be easy. Hold tuning until C3 is playable, then re-balance against live play, keeping the headless encounter as the balance reference for the auto-resolve option.
6. **Auto-resolve stays an option.** Keep "Auto-resolve" beside "Fight live" for gyms and raids, for players who want the auto-chess-only experience or a fast farm. Recommended: yes; it is already the headless path and costs nothing to keep.

---

## 8. PRINCIPLES (consistent with `SPEC.md` §10 and `GAMEPLAY_OVERHAUL.md` §8)

- **Connect the player's hands to the sim.** The systems exist; the work is letting input reach them. A Captain's Call should be control, and a raid should be played.
- **The sim owns timing; the renderer animates it honestly.** Dodge-check beats carry visible windups, casts show their commit window, and the player reacts to tells, not surprises (the §3.0 contract from `GAMEPLAY_OVERHAUL.md`).
- **Additive and reversible.** Auto-resolve stays for both gyms and raids. The headless paths stay the tested system of record. The base game is never worse for any of this existing.
- **Reuse the vocabulary.** The seize uses the `player` controller; positioning uses existing move orders; the raid scheduler is the one already written; the gambit additions are grammar growth, not bespoke scripts. No exotics.
- **Keep the core headless and deterministic.** The only core change is the gambit AI grammar it already owns. `boundary.test.ts` stays green.
- **Hold the deliberate split.** Gyms and the Elite Five are the coach-who-seizes layer; raids are the drive-one-of-five layer. Two roles, one set of plumbing.
- **Ship slices.** C0 is invisible but unblocks everything; C1 alone fixes the loudest complaint and is worth shipping on its own. Build ahead, keep it green, demo often.
