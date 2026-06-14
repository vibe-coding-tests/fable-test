# STORY & CINEMATICS SPEC — "ANCIENTS"

The story layer of **plot that lands, lore that deepens, and cinematic cut-scenes for the moments that matter** — recruiting a hero, breaking a boss, opening a raid, holding a legendary, crowning a champion. Companion to `SPEC.md` (design target), `docs/design/PRESENTATION_SPEC.md` (look/feel/juice), `DECISIONS.md` (calls made), and `PROGRESS.md` (status). Same crunch-mode rules as `SPEC.md §0`: this is direction and priority, not a gate.

The game is content-complete through Phase 5 and now has a juice layer planned in `PRESENTATION_SPEC.md`. The story layer now has its spine and machinery: the Loop codex assembles the lore, key milestones route through cut-scenes, and raids, festivals, legends, the Aegis, and the Tower all have directed narrative beats. This document remains the spec for keeping that layer coherent as content grows: every future hero, raid, region, and event should deepen the Mad Moon / Echo / Loop story instead of falling back to isolated flavor.

This spec does three things. First (`§1-2`) it **deepens the lore** into a coherent through-line built on **real Dota 2 canon** — the Primordial Mind, the Mad Moon, the Nemesis Stones, and the Loop — without contradicting a single established game string or point of Dota cosmology. Second (`§3-6`) it specifies a **cut-scene system** and a **catalogue of directed cinematics** for every key event. Third (`§7`) it ties the world to **real Dota 2 seasonal events and famous esports moments**, so the game feels like home to anyone who has watched a TI or grinded a Diretide. All of it is built on hooks that already exist or that `PRESENTATION_SPEC.md` is already adding.

---

## 0. WHERE WE ARE (measured 2026-06-13)

An honest read of the narrative layer, with file references so future work starts from the code that now exists, not from the original gap.

**Lore is sequenced.** The title premise — *"The Mad Moon broke. Its shards remember every war."* (`src/ui/title.ts`) — now has a visible spine. Region `lore` keeps its shipped first sentence and adds an act sentence (`src/data/regions/*`), every region carries an `arrivalBeat`, and `src/data/lore.ts` registers a ten-entry **Loop** codex thread from the Sundering through the Tower. `Game.syncStoryCodex()` unlocks that thread from start, badges, and Champion progress (`src/systems/game.ts`).

**Cut-scene machinery exists and is live.** `CutsceneDef` / `CutsceneBeat` / `ShotSpec` / `StageAction` live as plain data in `src/core/types.ts`; `src/data/cutscenes.ts` registers the catalogue; `src/engine/cinematic.ts` interprets beats with advance, fast-forward, hold-to-confirm skip, repeat auto-fast-forward, reduced-motion, and length/off degradation. `src/engine/scene.ts` owns the `cinematic` camera mode and in-world staging hooks, while `src/ui/hud.ts` renders letterbox, dialogue cards, controls, settings, and the Cinematics gallery.

**The big beats are routed.** Game milestones trigger prologue, first/subsequent binds, region arrivals, badges, raid intros/clears, boss phase/clear stingers, Aegis/Rapier first-holds, Elite Five, Champion, Outworld first-contact/all-clear, festivals, and esports legends (`src/systems/game.ts`, `src/engine/story-detectors.ts`). Raid, gym, boss, trial, Elite, and Champion dialogue arrays remain the script seeds, but they now stage through the director instead of only as toasts.

**Event tie-ins are implemented as session drivers.** `src/data/events.ts` registers nine seasonal events and five legends. Festivals launch existing raid/dungeon sessions with event-specific targets, timers, modifiers, and mechanics text (Diretide candy tribute, Wraith-Night altar defense, Continuum endless room choices, damage races, hazard survival), with rewards paid on clear. The legend detector reads the `SimEvent` stream and never mutates sim state.

**The remaining caveats are deliberate scope, not missing foundations.** Production cut-scenes are authored as TypeScript data, with a lightweight `compileCutsceneDsl()` available and data-lint validating shipped text, tokens, shots, sounds, VFX, gestures, and cross-refs. The proposed core `cinematic-cue` event was dropped in favor of Game-side HP/event inference, documented in `DECISIONS.md`, so `/src/core/` stays presentation-agnostic. Seasonal modes are bespoke plans over the shipped session systems rather than separate one-off minigame engines.

---

## 1. DESIGN PILLARS

What this spec will and will not do.

- **Deepen canon, never contradict it.** Every established name, title, region `lore`, hero `bark`, and raid line stays true. The plot is the **connective tissue between** existing facts, not a retcon. If a new beat conflicts with a shipped string, the string wins and the beat bends.
- **The core stays sacred.** Identical contract to `PRESENTATION_SPEC.md §10` and `SPEC.md §1.1`: nothing here touches `/src/core/` combat logic or its determinism. Cut-scenes are a Game/engine/UI system that *reads* sim events and Game milestones and *composes* presentation. The boundary test (`src/test/boundary.test.ts`) and the `Sim.hash()` determinism tests stay green and byte-identical.
- **Skippable and fast-forwardable, always.** Every cut-scene supports three exits, on first view and forever: **skip** (jump straight to the end and return control), **fast-forward** (hold to run playback at 2-8× while still seeing it), and **advance** (tap to end the current beat's hold and jump to the next — the visual-novel "click to continue"). Skip is hold-to-confirm so it never triggers on a mis-click; advance and fast-forward are a single tap/hold. Seen cut-scenes auto-fast-forward on repeat, and an "always skip cut-scenes" toggle exists for players who never want them. A speedrunner clears a set-piece in under a second; a lore-hunter savors it. This is a **hard requirement with its own controls spec (`§3.4`)**, not a buried setting.
- **Show, don't toast.** A key event earns staging — a held shot, a line delivered in-world, the music dropping — instead of a line of text sliding past the HUD. But staging is **tiered** (`§4.3`): only true peaks get a bespoke set-piece; most beats get a short directed stinger; the smallest stay barks.
- **Earn the moment honestly.** Like the reward dopamine in `PRESENTATION_SPEC.md §1`, a cut-scene fires on **real progress** — a bind completed, a boss phase broken, a raid cleared, a crown won. It amplifies a moment the player created; it never fakes one or stops the game to lecture.
- **Lean on what's already written.** Raid `dialogue[]`, gym/trial lines, champion lines, region `lore`, and hero `barks` are the **script seeds**. The cut-scene system stages text that already exists before it asks anyone to write new lines.

---

## 2. THE DEEPENED LORE — "THE WAR THE MOON REMEMBERS"

Frame the **real Dota 2 canon** rigorously, then sequence it into a plot. The game's shipped tagline is not invented flavor — it is drawing on Valve's actual creation myth, and that is the whole opportunity here: **stop inventing, and lean all the way into the lore Dota players already know.** Everything below is either established Dota 2 canon (cited), a shipped game string (file ref), or a thin bridge between the two (marked **(bridge)**). Where the game's own content and canon diverge, the shipped string wins and the bridge bends.

### 2.1 The real Dota 2 canon (the spine the game already sits on)

Sourced from the Dota 2 cosmology (`Primordial Consciousness`, `Arc Warden/Lore`, `Archronicus`, the Nemesis Stones):

- **The Primordial Mind.** Before creation there was one infinite consciousness. The birth of the universe shattered it. Three of its greater fragments gained individuality: **Radinthul** (the Radiant — intelligent, creative), **Diruulth** (the Dire — strong, destructive), and **Zet** (the Arc Warden — the third, who recognizes the other two as *its other selves*).
- **The imprisonment.** Radinthul and Diruulth, opposites in every aspect, were locked in war that twisted creation itself. **Zet sacrificed its own power to seal the two warring Ancients together** inside an inert crystalline sphere — the **Mad Moon**. The sacrificed power crystallized separately as the stone called **Nemestice**.
- **The Sundering.** The two Ancients, raging inside their prison, **destroyed the Mad Moon from within.** Its pieces — the **Nemesis Stones**, splitting into **Radiant Ore** and **Direstone** — rained across the burgeoning planet where most of Dota's story happens.
- **The blooming.** Where the shards fell, the Ancients' presence warped the world. Civilizations rose and fell, kingdoms warred, and **magic bloomed**. Cults, religions, and military orders formed around the stones — the priestess **Prellex** foresaw the Radiant's coming and built temples to welcome it.
- **The Loop (the keystone).** *Every game of Dota 2 is canon.* Each time an Ancient is destroyed the timeline **resets and begins again** — the eternal war re-fought, forever. Zet hunts across the cycles, trying to reunite the fragments (or destroy them all) and end the loop. **This is the single most useful fact for `ANCIENTS`:** it is the in-canon reason the world is a repeatable, run-based RPG full of champions who keep coming back.

### 2.2 The shipped game strings (do not break these)

- **"The Mad Moon broke. Its shards remember every war."** (`src/ui/title.ts`) — now reads as *exact canon*: the Mad Moon (Zet's prison) was sundered, and its shards (the Nemesis Stones) carry the Ancients' endless war — and, through the Loop, the memory of every prior cycle's wars.
- **"The old Radiant lands"** (`tranquil-vale.ts`): a shelf steeped in Radiant Ore, where shards fell — canon-true ground zero.
- Shards **fell across the world** and ring on impact — Icewrack's *"shard impacts ring like bells"*, Shadeshore's *"drowned echo bells"*, Devarshi *"star-metal"*. These are Nemesis Stones.
- The endgame **Mad Moon Crater**: *"Roshan waits below; the Tower of the Ancients waits above"* (`regions/phase3.ts`). The Tower is the **Ancient** itself; Roshan is below it as he is in every match.
- **Binding**: Find → Trial → Bind an **Echo** of a hero (`quests/index.ts`; `src/core/echo.ts`). Defeating the Echo unlocks the hero — *you learn a hero by re-fighting their war.*
- The Champion is **Avaryn the Twice-Crowned** (`drafts.ts`): *"Two crowns, no equals."* (a game-original character).
- Endgame guardians **Spectre, Faceless Void, Terrorblade** (`bosses.ts`) — all three are canon dimensional/temporal outsiders, which `§2.5` uses.

### 2.3 The connective reading (bridge) — Echoes, the binder, and the Loop

The game's systems map onto canon almost one-to-one; the bridges below close the last gap.

- **Echoes are champions caught in the Loop.** Because every Ancient-death resets the world, the Nemesis Stones hold the imprints of heroes from countless prior cycles — every Juggernaut who ever danced his blade, every Pudge who ever hooked. A struck or stirred shard **projects** that champion to fight the way they always have. **(bridge)** Defeating an Echo doesn't kill a person — it *resolves* a looped memory, and the freed champion rides on. This is the canon under the recruitment loop and the roster of 100+.
- **The player is a binder, not a chosen one.** **(bridge)** Like Prellex hearing the Radiant before it landed, the player is one of the rare few who can *touch a Nemesis Stone without being enthralled by it* — and so can draw the Echo out instead of being possessed. No invented cosmic title; just an unusual tolerance for the stones, which is why shards gate progress (`§2.5`) and why the journey is *gathering* the broken Moon, fragment by fragment.
- **Roshan and the Aegis** stay exactly canon: Roshan sleeps near the Ancient, and his **Aegis of the Immortal** grants one return from death — *"A held promise: die once, stand once"* (`items/index.ts`). (The real-world parallel — the **Aegis of Champions**, the TI trophy — is the engine of every event tie-in in `§7`.)
- **The marquee raid bosses are claimants from the wider canon** — demons of **Foulfell**, drifters from **outside time**, and **outsiders from neighboring worlds** the thinned seal lets through. They came for the Ancients' power, the only prize big enough. Their shipped `dialogue[]` (*"Your world keeps a stone at its heart. I came down for it."*) reads as a claim on the Nemesis Stones / the Ancient itself. The cross-franchise homages among them (StarCraft / Diablo / Warcraft) form a dedicated rising sub-plot — **the Outworld Claimants** (`§6.13`).

### 2.4 The protagonist and the question (bridge)

The player is a **binder** from the Radiant shelf (`§2.3`). **Avaryn the Twice-Crowned** (game-original) is the binder who came before and stopped: she took **a crown of the Radiant and a crown of the Dire** — a heresy, since the two are sworn opposites — and froze the war into a rule she alone administers, the meta locked. **(bridge)** The player is the question her closed fist exists to answer, and the question is **Zet's own**, the Arc Warden's eternal choice:

> The Loop turns because the two Ancients can neither win nor stop. Now that you can hold their champions in your hand — do you **reunite** them (Zet's dream: gather enough of the broken Moon to end the war), keep the **eternal game** turning (Avaryn's road, rule the war forever), or **break the Loop** and let the world out of the cycle for good?

This is a **theme the cut-scenes frame, not a branching-ending engine** — the existing endgame (Elite Five → Champion → crater) stays exactly as built. The player's `factionChoices`/reputation lean (`GameSave`) only colors the climax flavor (`§6.12`); it never swaps the final boss.

### 2.5 The plot spine (bridge) — eight badges, one descent into the Loop

The eight badges already gate the eight region transitions (`SPEC.md`; `data/gyms/index.ts`). Overlay a canon escalation on that chain so crossing the map *is* the rising action. **Canon anchor** names the real Dota place/figure each region leans on; the game's region names are shipped and unchanged.

| Act | Badge / region | Canon anchor | Narrative beat (bridge) |
|-----|----------------|--------------|--------------------------|
| **Prologue** | Tranquil Vale | Radiant Ore lands; Prellex's faith | The Sundering retold (cold open). You touch a shard, hear it, and bind your first Echo. |
| **I — Lunar** | Nightsilver Woods | Selemene / Mene, goddess of the Dark Moon | The moon-cult reads you as an omen of the *real* Moon — the Mad one. Are you here to mourn it or gather it? |
| **II — Frost** | Icewrack | Auroth's glacier, the Blueheart | The shards ring louder the deeper you go. First proof the Loop is *tightening*, not winding down. |
| **III — Burrow** | Devarshi Desert | the Deserts of Druud, Nyctasha's brood | A kingdom a prior cycle already buried in sand — a preview of where the Loop sends everything. |
| **IV — Tide** | Shadeshore | the Dark Reef, the Cannot-Be-Tamed sea | Kunkka and Tidehunter's feud is one old war re-fought every cycle through living men. You pick a side and feel the pull. |
| **V — Rot** | The Vile Reaches | Foulfell, the demon prison; the rift | The world is thin here; demon-claimants are coming *through*. First marquee raid range. |
| **VI — Arcane** | Quoidge | the scholars of the stones; Aghanim's craft | Scholars who study the Nemesis Stones tell you the truth: the crater, the Loop, and that Avaryn already chose. |
| **VII — Wild** | Hidden Wood | the world before the Ancients landed | The wild remembers cycles older than any crown — the war as it was before there were heroes to fight it. |
| **VIII — Titan** | Mount Joerlak | Elder Titan and the Fundamentals | The trial of the Fundamentals — the primordial forces Elder Titan split off. Pass, and you're fit to approach the Ancient. |
| **Climax** | Mad Moon Crater | the Ancient; Roshan; Faceless Void's timelessness | Elite Five → Avaryn → the choice at the Tower (`§2.4`), staged where the Loop itself resets. |

### 2.6 Where the deepened lore is authored (data changes)

Delivered through **content the player already encounters** — enrich existing fields, don't bolt on a story mode:

- **Region `lore`** (`src/data/regions/*`): each gets a second sentence tying it to its act beat and canon anchor in `§2.5`. Additive; the shipped first sentence stays verbatim.
- **A new `RegionDef.arrivalBeat?`** (optional field): the establishing cut-scene on first entry (`§6.5`), referenced by id into the cut-scene registry.
- **Hero `lore`**: hand-authored heroes keep theirs; roster-template heroes (`roster-standard.ts`) get an optional one-line *cycle note* — which turn of the Loop their Echo last fought in — so a bound hero reads as a recovered memory, not a generated filler.
- **Codex "The Loop" thread** (new codex category): a dedicated track unlocking one entry per act break, assembling `§2.1`'s real canon at the player's pace. Reuses `Game.codexEntries()` gating (`src/systems/game.ts`).
- **Raid/boss/champion `dialogue[]`**: unchanged as text; the cut-scene system (`§4`) stages the existing lines. New lines only where a beat in `§6` has none to stage.

---

## 3. THE CUT-SCENE SYSTEM — ARCHITECTURE

One system, every key event routes through it. It is the narrative sibling of the **Moment Director** (`PRESENTATION_SPEC.md §4.6`) and shares its impact budget and accessibility caps. It lives **engine/systems-side and reads down, never up**: it consumes `SimEvent`s and Game milestones and composes presentation. The core never knows it exists.

### 3.1 Data model — `CutsceneDef` (data-driven, like raids)

A cut-scene is **data**, registered in the registry alongside heroes/raids/bosses (`src/core/registry.ts`), authored as a list of **beats**. Adding a cut-scene is one data file, zero engine code — the same content philosophy as the rest of the game (`registry.ts`: *"Adding hero #61 = one data file, zero code"*). Define `CutsceneDef` in `src/core/types.ts` (pure data — no `three`, so the boundary test stays green):

```ts
interface CutsceneDef {
  id: string;
  tier: 'setpiece' | 'stinger' | 'bark';   // §4.3 — how much machinery this beat earns
  trigger: CutsceneTrigger;                  // §4.2 — what fires it
  skippable: true;                           // always; typed as a constant by contract
  letterbox?: boolean;                       // DOM bars; default true for setpiece/stinger
  music?: SoundArchetype | 'duck' | 'silence';
  beats: CutsceneBeat[];
  replayable?: boolean;                      // shows in the §8 gallery after first view
}

interface CutsceneBeat {
  shot: ShotSpec;          // §5 shot tuple → camera + grade
  stage?: StageAction[];   // §5 stage actions → in-world blocking (gestures/VFX)
  line?: DialogueCard;     // who speaks, the text (often a ref into existing dialogue[])
  hold?: number;           // seconds; the beat's dwell time before auto-advance
  sound?: SoundArchetype;  // a sting layered on the beat
}
```

`CutsceneDef`, `CutsceneBeat`, `ShotSpec`, `StageAction`, and `DialogueCard` are **plain data types** in `core/types.ts`. The *interpreter* that turns them into camera moves and meshes lives in `src/engine/` — so core stays headless and a cut-scene can be validated by the data-lint test without a renderer.

### 3.2 The player — `Cinematic` interpreter (engine-side)

A new `src/engine/cinematic.ts` (the "Cut-scene Director") owns playback:

- **A third camera mode.** Today the scene has `gameplay` and `map` (`scene.ts`). Add `cinematic`: the director takes the camera, runs each beat's `ShotSpec` as a framed pose or eased move (push-in, orbit, crane, rack-focus), and hands control back on finish or skip. Gameplay camera state is saved and restored exactly.
- **In-world blocking via the existing animator + VFX.** Beats stage action by driving `AnimGesture`s on real units (`animator.ts`) and spawning VFX archetypes (`vfx.ts`) — no new art. A "boss turns to face you" beat is a `face` + `idle-menace` gesture and a camera push-in, not a bespoke animation.
- **A DOM overlay layer.** Letterbox bars (top/bottom, animated in/out), a **dialogue card** (speaker portrait from `icons.ts`, name, typed-on text, with a subtitle fallback), and a title-card treatment for act breaks. Lives beside the existing `#floater-layer` in `hud.ts`; styled in `styles.css` to match the dark-glass HUD (`§5` of `PRESENTATION_SPEC.md`).
- **Audio routing.** Music duck/silence and act stingers through the bus graph from `PRESENTATION_SPEC.md §2.1`. Lines get the synthesized effort-voice treatment (`§2.4` there), pitched by speaker attribute — no voice acting, but the card *sounds* like someone is delivering it.
- **Skip, fast-forward, advance + accessibility.** The full control set in `§3.4`. Honors reduced-motion (no camera punch/shake, instant letterbox, shortened holds), photosensitivity (capped flashes), and a dedicated **"cut-scene length: full / short / off"** setting that degrades set-pieces → stingers → silent toast.

### 3.3 Two trigger surfaces (and the headless guardrail)

Cut-scenes fire from two places, and **neither is the core**:

1. **Game milestones** (out of combat): bind complete, badge earned, region first-entry, raid unlock, Elite Five start, Champion defeated, Tower reached. These already flow through `Game` methods that update the save (`recruited`, `badges`, `codexUnlocks`…); the director hangs off those exact call-sites.
2. **Tagged `SimEvent`s** (in combat): boss phase transitions, a legendary `drop` (`PRESENTATION_SPEC.md §1.5`), a marquee ult, a raid boss's death. These already emit events the renderer consumes. The director subscribes to the same bus the VFX/audio layers do.

The one **optional, additive** core change: a `{ t: 'cinematic-cue'; id: string }` member on the `SimEvent` union (`core/types.ts`), emitted by boss phase logic when a phase's `onEnter` wants to *mark* a story beat (e.g. the marquee guardian's first phase break). It carries **no presentation data and changes no combat math** — it is a labelled timestamp the director can catch. The determinism hash is unaffected because the event is deterministic given the seed (it fires on the same tick every run). If even this feels like too much core surface, the director can instead infer phase transitions from existing `death`/HP-threshold events Game-side, and the core change is dropped entirely — log the call in `DECISIONS.md`.

### 3.4 Skip, fast-forward & advance — the player is always in control

A cut-scene is never a thing that happens *to* the player. The director exposes three exits at all times, discoverable by both keyboard and mouse, and the controls are visible the instant a cut-scene starts (a small, fading control hint in a corner — like a video player's chrome).

- **Advance (tap).** A single press of **Space / Enter / left-click**, or a tap on the **⏭ "next"** affordance, ends the current beat's `hold` immediately and jumps to the next beat. Mid-typewriter, the first tap completes the dialogue card instantly (reveals the full line); the next tap advances. This is the workhorse — it's how a reader who's done with a line moves on, identical to a visual-novel "click to continue."
- **Fast-forward (hold or toggle).** Holding **Tab** (or pressing the **⏩ button**) runs the whole cut-scene at an accelerated rate — default **4×**, with **2× / 4× / 8×** cycling on repeated presses — camera moves, holds, typewriter, and audio all time-compressed together, letterbox kept, so the player *still sees the scene*, just faster. Release (or press again) returns to 1×. This is the "I want the gist but not to wait" path, distinct from skipping it entirely.
- **Skip (hold-to-confirm).** Holding **Esc** (or holding the **⏭⏭ "skip" button**) for ~0.4s fills a small radial/bar confirm, then jumps to the cut-scene's end state, drops the letterbox, restores the exact pre-scene gameplay camera, and hands back control. The hold-to-confirm is deliberate: a single Esc tap opens the pause menu or shows the skip hint, never an accidental skip of a first-time set-piece. On an already-seen cut-scene, skip is **instant on a single tap** (no hold), because the player has earned it.
- **In-combat beats skip cleanly.** For the in-combat stingers (boss phase breaks, the loot money-shot), "skip" only ends the **camera takeover and overlay** and returns to gameplay instantly — there is no time to fast-forward because the sim never stopped (the `§4` determinism guardrail: the fight kept ticking underneath). The player is dropped straight back into the live fight, no penalty, no desync.

**Defaults, persistence & settings.**

- **Seen → auto-fast-forward.** A cut-scene the player has already watched once (tracked in `GameSave.journalSeen`) defaults to accelerated playback on its next trigger, with instant skip available. Replaying at full 1× length is opt-in from the gallery (`§8`).
- **Global controls in settings** (beside the `PRES §7` controls): **"cut-scenes: full / short / off"** (the tier degrade), **"default cut-scene speed: 1× / 2× / 4×"** (start fast-forwarded by default for impatient players), and **"always skip cut-scenes"** (one switch; new beats still log to the codex so nothing is lost). All persist through save/load.
- **No dead air on either path.** Skipping or fast-forwarding never strands the player in a half-faded letterbox or a stuck camera: the director always snaps cleanly to the end state and the gameplay camera, and any audio duck is released. A skipped scene still fires its codex/journal unlock so progress is identical whether watched or skipped.
- **Discoverable, not hidden.** The control hint ("Space: advance · Tab: fast-forward · hold Esc: skip", or the touch buttons) shows on every first-view cut-scene and can be turned off once the player knows it. Mouse-only players get the on-screen ⏭/⏩/skip chrome; there is never a keyboard-only escape.

---

## 4. DIRECTION — TIERS, TRIGGERS & THE GRAMMAR

### 4.1 The shared grammar (every cut-scene speaks it)

A beat is the atom. Each beat is **one shot + optional blocking + optional line + a hold**. A cut-scene is a short ordered list of beats. The grammar borrows the four-sense discipline from `PRESENTATION_SPEC.md §4.6` — LOOK, SOUND, FEEL — and adds the one cut-scenes own: **FRAME** (what the camera chooses to show, and what it withholds).

- **FRAME.** A `ShotSpec` (`§5`) picks the angle, the lens move, and the grade. Withholding is a tool: open on a detail, hold on a silhouette, reveal late. A boss intro that opens on the *weapon* and cranes up to the face beats one that shows everything at once.
- **LOOK.** Blocking via animator gestures + VFX archetypes already in the engine. Grade and palette via the post-processing stack (`PRESENTATION_SPEC.md §3.1`) — a flashback desaturates, the crater goes cold and high-contrast.
- **SOUND.** Music ducks or cuts; an act stinger lands on the title card; the line plays as pitched effort-voice over a subtitle.
- **FEEL.** Render-only camera push-ins and the occasional held freeze-frame, all under the Moment Director's impact budget so a cut-scene that flows straight into a boss fight doesn't double-punch the player.

### 4.2 Trigger catalogue (what fires what)

| Trigger | Source | Default tier | Example |
|---------|--------|--------------|---------|
| New game / starter pick | title → Game init | **set-piece** | The prologue (`§6.1`) |
| First bind ever | `Game` bind complete | **set-piece** | The binding awakening (`§6.2`) |
| Subsequent binds | `Game` bind complete | **stinger** | Echo stills and joins (`§6.3`) |
| Region first-entry | `Game` region load | **stinger** | Establishing arrival (`§6.5`) |
| Gym badge earned | `Game` badge grant | **stinger** (act breaks I/VI/VIII → set-piece) | Badge + act-break card (`§6.4`) |
| Boss phase transition | `cinematic-cue` / HP threshold | **stinger** | Boss breaks and escalates (`§6.6`) |
| Marquee raid intro | `Game` raid start | **set-piece** | The claimant descends (`§6.7`) |
| Raid / boss cleared | `death` of anchor | **stinger** | The fall + loot money-shot (`§6.8`) |
| Legendary drop / first hold | `drop` event (`PRES §1.5`) | **stinger** (Aegis/Rapier → set-piece) | The item gets a moment (`§6.9`) |
| Echo / resonance milestone | `Game` echo unlock | **bark→stinger** | A war you now carry (`§6.10`) |
| Elite Five gauntlet | `Game` elite start / each persona | **set-piece** intro, **stinger** each | The gauntlet opens (`§6.11`) |
| Champion defeated | `Game` champion clear | **set-piece** | Avaryn, and the Tower (`§6.12`) |

### 4.3 The three tiers (spend machinery like the impact budget spends juice)

Scarcity makes a moment a moment (`PRESENTATION_SPEC.md §4.6` "Restraint"). Three tiers, and most events sit in the cheap two:

- **Set-piece** (≈12 in the whole game). Full machinery: letterbox, multi-beat staging, camera moves, music change, several lines, a held climax. Reserved for the dozen beats that carry the plot — prologue, first bind, the three act-break badges, marquee raid intros, Aegis/Rapier first-hold, Elite Five open, Champion/Tower. Budget: a player should hit a set-piece roughly once an hour, never two back-to-back.
- **Stinger** (the workhorse). 1-3 beats, ≤6 seconds, one camera move and one line or title card, often no letterbox. Region arrivals, ordinary badges, boss phase breaks, raid clears, ordinary legendary drops. Skippable but rarely worth skipping because it's short.
- **Bark** (already shipped). No camera takeover at all — the existing in-world `bark` line + floater (`hud.ts`, 6s linger). Subsequent binds, echo unlocks, minor flavor. The cut-scene system's job here is just to *route* the right line, not to stage it.

A cut-scene can **degrade** a tier under the "cut-scene length" setting or the impact budget: a set-piece in a chaotic moment, or with set-pieces turned to "short," plays as its stinger; a stinger with cut-scenes "off" plays as a bark/toast. Nothing is ever fully suppressed — the *information* always reaches the player, only the staging scales.

### 4.4 Pacing rules

- **Never block the fun for long.** Out-of-combat set-pieces cap ~20s to skip-point; in-combat stingers cap ~4s and run *over* a paused-feel windup, never a hard stop (the sim keeps ticking, per the `§4` determinism guardrail).
- **One peak at a time.** The director and the Moment Director share a lock: a narrative set-piece suppresses concurrent ult/loot crescendos and vice-versa, so the player never gets two "biggest thing in the game" moments fighting for the same half-second.
- **Earn repetition's exit.** A beat seen once is auto-short on the next view and auto-silent after that, tracked in `GameSave.journalSeen` (the field already exists). Grinding the same boss never replays its intro unless invoked from the gallery (`§8`).

---

## 5. THE AUTHORING DSL — STAGES AND SHOTS

The cut-scene format is a thin, human-readable DSL that maps **one-to-one** onto the `CutsceneDef` data (`§3.1`). It uses stage actions to describe *what happens* in a beat (the blocking) and a shot tuple to describe *how it's shot* (the frame). An author writes beats; a small transformer compiles them to the `CutsceneBeat[]` the engine plays. This keeps writing in a compact storytelling vocabulary instead of raw TypeScript.

### 5.1 The beat template

```
BEAT {
  SHOT:  <angle>/<move>/<palette>/<mood>
  STAGE: <stage action>(key="value", ...)                                      // 0+ actions
  LINE:  <speaker> : "<text or ref:dialogueSource[i]>"                            // optional
  HOLD:  <seconds>
  SOUND: <stinger | duck | silence>                                              // optional
}
```

- **SHOT** is a tuple constrained to the values that map to engine capability: `angle` ∈ the existing shot list (`Low Angle`, `High Angle`, `Bird's Eye`, `Close-Up`, `Over-the-Shoulder`, `Dramatic`, `Through Objects`, `Reflection`…), while `palette`/`mood` drive the post-processing grade (`PRES §3.1`) and gallery caption. The transformer rejects tuples that ask for capability the engine doesn't have (e.g. a media type) — data lint catches it.
- **STAGE** uses closed blocking verbs, each mapping to animator gestures + VFX + camera intent: `DescribeEnvironment` → set dressing + grade, `DevelopCharacter` → a unit's pose/gesture, `AdvancePlot` → a scripted action (a strike, a shatter, a kneel), `RevealMystery` → a withheld-then-shown framing, `SetTone` → music + grade, `IntroduceConflict` → two units squaring off.
- **LINE** stages text. `ref:roshan-pit.dialogue[0]` pulls an existing shipped line so the DSL never duplicates strings; a literal string is only for genuinely new lines.

### 5.2 The primitive → engine mapping (closed vocabulary)

| Stage action | Engine realization | Data it touches |
|---------------------|--------------------|-----------------|
| `{DescribeRealm}` / `{DescribeEnvironment}` | Camera frames the set; grade + fog + weather per biome | `scene.ts` day/night, `terrain.ts` biome keys |
| `{DevelopCharacter}` | A unit plays an `AnimGesture`; portrait to the dialogue card | `animator.ts`, `icons.ts` |
| `{AdvancePlot}` | Scripted gesture + VFX archetype (strike, shatter, bind, kneel) | `vfx.ts`, `animator.ts` |
| `{IntroduceConflict}` | Two units face off; tension grade; combat music swell | `animator.ts`, audio bus |
| `{RevealMystery}` | Withheld framing (open on detail) → reveal move | `cinematic.ts` camera |
| `{SetTone}` | Music duck/swap + color grade + vignette | audio bus, post-processing |
| `{ExploreTheme}` | Codex caption text + title-card subtitle | codex entry, DOM overlay |
| `{EstablishHistory}` | Flashback grade (desaturate/sepia) + title card | post-processing, overlay |

This is a **closed set** by design — the same discipline as the engine's closed VFX/gesture vocabularies (`core/types.ts`). New blocking verbs are added deliberately, with an engine realization, not invented per cut-scene.

### 5.3 Worked example — the marquee raid intro (a set-piece)

Staging the **already-shipped** Last Eldwurm lines (`raids.ts`: *"The last of my brothers fell. I did not."* / *"Your world keeps a stone at its heart. I came down for it."*):

```
CUTSCENE last-eldwurm-intro  (tier: setpiece, music: duck, letterbox: true) {

  BEAT {  // withhold — open on the wound, not the dragon
    SHOT:  wide/hold/Bluescale/Ominous
    STAGE: {DescribeEnvironment(location="Mad Moon Crater rim", mood=["cold","vast"], visual_details=["embers rising through shard-dust"])}
    HOLD:  2.0
    SOUND: silence
  }

  BEAT {  // reveal — crane up the silhouette to the eye
    SHOT:  low/crane/Redscale/Dramatic
    STAGE: {RevealMystery(mystery="the survivor", clues=["one wing","old burns"], resolution="the last of the eldwurms turns its head")}
    LINE:  last-eldwurm : "ref:last-eldwurm.dialogue[0]"
    HOLD:  3.0
  }

  BEAT {  // the claim — it names the prize, then the fight begins
    SHOT:  wide/push-in/Complementary/Tense
    STAGE: {IntroduceConflict(conflict="the heart-stone", stakes="the world's memory", sources=["a claimant from outside"])}
    LINE:  last-eldwurm : "ref:last-eldwurm.dialogue[1]"
    HOLD:  2.5
    SOUND: raid-intro-sting
  }
}
```

On compile this becomes a three-beat `CutsceneDef`; on play the director takes the camera, grades cold-then-hot, frames the Through-Objects opener, cranes the reveal, stages the two shipped lines on dialogue cards over a ducked mix, lands the sting, drops letterbox, and hands control to the raid fight already loaded behind it. **Zero new combat code, zero new art, two reused lines, one new data file.**

### 5.4 Authoring rules

- **Prefer `ref:` over literals.** If a shipped `dialogue[]`, `bark`, `lore`, or `championDialogue` line fits, stage it. New text only fills genuine gaps (`§6` flags which beats need new lines).
- **Three beats is plenty.** A set-piece is 3-5 beats, a stinger 1-3. Resist more; the impact budget and the skip-cap punish length.
- **Every SHOT must be playable.** The transformer + data-lint validate that each tuple maps to real engine capability and each `ref:` resolves. A cut-scene that references a missing line or an impossible shot fails the build, exactly like a recipe pointing at a missing component (`SPEC.md §1.2` data lint).

---

## 6. THE CINEMATIC CATALOGUE — KEY EVENTS, DIRECTED

The set-pieces and stinger families, with the director's intent for each. Lines marked **(new)** need writing; everything else stages shipped text. Each entry names its **trigger**, **tier**, **beats**, and the **feeling it must leave**.

### 6.1 Prologue — "The Moon Breaks" (set-piece, new game)

The only cut-scene that runs before the player has agency, so it must be short and earn its place. The cold open the whole game pays off.

- **Trigger:** new game, after starter pick, before first control. **Beats:** 3.
- **Director's intent:** establish the premise the title promises in one image. Open black on the **whole Moon, hanging mad** — not broken yet — over the Radiant shelf at night. `{SetTone}` cold and held. A sound like a held breath. **Crack** — a single hairline runs across it; the breath releases; it comes apart silently and the shards fall like slow rain, each one *ringing a different note* (the bells that recur in Icewrack and Shadeshore lore, seeded here). Cut to dawn on the Vale, a shard half-buried and humming at the player's feet, and hand over control.
- **Shots:** Bird's-Eye on the whole Moon → Close-Up on the crack → High-Angle on the shard-rain → ground-level Low-Angle on the player's first step.
- **Line (new), one only:** narration card — *"They sealed the war inside the Moon. The war broke the Moon. Every shard still remembers it."* (a canon-true restating of the Sundering, `§2.1`).
- **Leaves:** *the world I'm about to cross is the inside of a broken memory, and I'm standing in it.*

### 6.2 The First Bind — "What You Are" (set-piece, first recruit)

The mechanical tutorial of binding becomes the moment the player learns their role (`§2.4`). Fires once, ever.

- **Trigger:** first `Game` bind complete (after the first Binding Echo is defeated). **Beats:** 4.
- **Director's intent:** the defeated Echo doesn't die — it *stills*, flickering between the hero's form and raw shard-light. Push in as it reaches toward the player. `{AdvancePlot}` the bind: the shard-light draws **into** the player's chest (reuse the capture/`revive` VFX, recolored), and the Echo's stance settles behind them as the first party member. The world tells the player, through the hero's first bound `bark`, what they are: one of the rare few who can hold a Nemesis Stone's champion instead of being enthralled by it (`§2.3`).
- **Shots:** Over-the-Shoulder on the stilled Echo → Close-Up on the reaching hand → Dramatic push-in on the bind → a settling two-shot of player + new ally.
- **Lines:** stage the bound hero's existing `bark[0]`; one **(new)** narration card — *"It does not die. It remembers you now. The first war you'll carry."*
- **Leaves:** *I don't recruit heroes — I gather the broken Moon back together, one war at a time.*

### 6.3 Subsequent Binds — "It Joins" (stinger, every later recruit)

The workhorse version. No tutorial, no narration — just the satisfying *still-and-join*.

- **Trigger:** every bind after the first. **Beats:** 1-2. **Tier:** stinger (degrades to bark after the hero's first view).
- **Director's intent:** a 3-second beat — the Echo stills, the shard-light pulls in, the new ally's portrait flares onto the party frame with its attribute color (`PRES §5.3`). Stage that hero's `bark`. Distinct binding flavor per attribute (STR binds heavy and low, INT binds bright and high) reusing the audio attribute-bias from `PRES §2.4`.
- **Leaves:** a clean, repeatable hit of *got one* that never overstays.

### 6.4 Badges & Act Breaks — "A Deeper Cut" (stinger; I/VI/VIII set-piece)

The eight badges are the plot spine (`§2.5`), so earning one is both a mechanical gate-open and a narrative act break.

- **Trigger:** `Game` badge grant. **Beats:** stinger 2, set-piece 4 (badges I-Lunar, VI-Arcane, VIII-Titan).
- **Director's intent (ordinary badge):** the badge crests onto the journal row with its fanfare (`PRES §5.4`), a title card names the act, and one line of the gym leader's existing `dialogue[]` plays as a send-off. Then a held establishing frame of the **road opening** to the next region — the gate that was closed is now a path.
- **Director's intent (act-break set-piece):** add a **Loop codex beat** (`§2.6`) — a flashback-graded card (`{EstablishHistory}`, desaturated) that advances the canon one rung: I reveals what an Echo is and that the world is looping, VI reveals the crater, the Loop, and that Avaryn already chose, VIII reveals the Fundamentals and Elder Titan's role in the first division of forces. These three are where the player's understanding escalates with their power.
- **Leaves:** *I'm not just stronger — I'm one step deeper into something the whole map is built around.*

### 6.5 Region Arrivals — "Establishing" (stinger, first entry per region)

Ten regions (`§2.5` table), each a one-screen establishing shot the first time the player crosses in. Rides the new `RegionDef.arrivalBeat` field (`§2.6`).

- **Trigger:** `Game` region first-load. **Beats:** 1-2. **Tier:** stinger.
- **Director's intent:** a single signature crane or reveal that sells the biome's identity and its act beat — Nightsilver's moonlit silver canopy, Icewrack's shard-bells ringing across the glacier, Devarshi's buried-kingdom dunes under star-metal glint, the Vile Reaches' rot-engines venting toward a thinning sky, the crater's first dread silhouette of the Tower. Grade and weather per biome (`PRES §3.4`). Stage the region's existing `lore` line (now two sentences, `§2.6`) as the caption.
- **Leaves:** *this place is its own world, and it remembers something specific.*

### 6.6 Boss Phase Transitions — "It Breaks" (stinger; marquee guardians set-piece)

44 bosses (`bosses.ts`), each with HP-threshold phases. The phase break is the in-combat story beat: the boss *changes* when you hurt it enough.

- **Trigger:** phase `onEnter` (`cinematic-cue` or HP threshold, `§3.3`). **Beats:** 1, in-combat. **Tier:** stinger (templated); the two **marquee guardians** (Void Prelate / TA, Last Eldwurm / DK) get a bespoke 2-beat set-piece on their *first* break.
- **Director's intent (templated):** a ~2-second windup the director shares with the Moment Director's ult treatment (`PRES §4.6`) — brief camera push-in, music swells, the boss plays an `enrage`/`escalate` gesture, a phase-color VFX bloom, and the existing `gambitBias: 'finish'` reads visually as the boss *committing*. No letterbox; the fight never fully stops (determinism guardrail). One barked line where the boss has one.
- **Director's intent (marquee guardian):** the Void Prelate *severs* — the world rack-focuses and desaturates as she blinks the dark; the Last Eldwurm *reignites* — a held low-angle as the last dragon stops dying and starts hunting. These two are the only bosses whose phase break earns a true cut.
- **Leaves:** *I pushed it past something, and now it's serious.*

### 6.7 Marquee Raid Intros — "The Claimant Descends" (set-piece, each marquee raid)

The richest scripted voice in the game already lives in raid `dialogue[]` (`raids.ts`). The ten raids — four original (Roshan's Pit, Lord of Terror, Frost-Crowned King, Queen of Blades) and six marquee claimants — each open on a bespoke set-piece staging their shipped lines.

- **Trigger:** `Game` raid start. **Beats:** 3-4. **Tier:** set-piece.
- **Director's intent:** the `§5.3` Last Eldwurm template generalized. Open withheld (a detail, a silhouette, the *location* — each raid has a `location` string), reveal the boss, let it deliver its two shipped lines naming the stakes, land a raid-intro sting, drop into the fight. Each claimant's grade is keyed to its identity: the Forsaken Queen cold and blue, the Lord of Hatred lightless with one red accent, the Renegade Marshal dusty gunmetal, the Prime Evil hell-lit. These are the claimants from the wider canon of `§2.3` — the intro should feel like *something from outside just arrived for the Ancients' power.*
- **Leaves:** *this is not a regional boss — this is a force that crossed worlds to be here, and it told me why.*

### 6.8 Raid & Boss Clears — "The Fall" (stinger, anchor death)

The payoff cut, fused with the loot money-shot from `PRES §1.5`.

- **Trigger:** raid/boss anchor `death`. **Beats:** 2. **Tier:** stinger.
- **Director's intent:** a brief held shot on the fall — type-keyed death (`PRES §4.2`), the boss going down in slow-feel for one beat — then the camera pulls to the corpse as the loot **bursts** with rarity beams (`PRES §1.5`). The cut-scene system's only job is the held beat and the framing; the loot drama is already specified. A cleared marquee claimant gets one **(new)** falling line where the boss has none, and a codex "claimant defeated" unlock.
- **Leaves:** *I earned that, and the floor just exploded with proof.*

### 6.9 Big Items — "The Get" (stinger; Aegis & Rapier set-piece)

Items already carry money-shot drops (`PRES §1.5-1.6`). A handful of **chase items** deserve a *narrative* beat on first acquisition, not just a rarity flash.

- **Trigger:** `drop`/first-pickup of a gated item. **Beats:** stinger 1-2; **set-piece** for the **Aegis of the Immortal** and **Divine Rapier**. **Tier** scales by rarity.
- **Director's intent (Aegis):** the held promise (`items/index.ts`: *"die once, stand once"*). On first hold, a 3-beat set-piece — the Aegis lifts from Roshan's corpse on a beam, the camera pushes in, and a **(new)** card stages its meaning: *"Roshan woke. You walked away. The Moon keeps that promise once."* The `roshan-respawn` signature exotic gives it teeth.
- **Director's intent (Divine Rapier):** *"A victory condition with a handle. It drops when pride dies."* — frame the pickup as a dare. A single charged held shot, blade-light blooming, no narration; the item's own shipped lore is the line on the card. The drama is the *risk* it represents.
- **Director's intent (other exotics/immortals):** stinger — fly-to-inventory + get-toast with the item's shipped `lore` as the one-line "why you care" (`PRES §1.6`), staged a half-beat longer than a common drop.
- **Leaves:** *this isn't loot, it's a turning point I can hold.*

### 6.10 Echo & Resonance Milestones — "A War You Carry" (bark→stinger)

The echo-kill and resonance systems (`core/echo.ts`, `core/resonance.ts`) are deep mechanics that currently unlock silently.

- **Trigger:** `Game` echo facet/talent unlock; first resonance reaction. **Beats:** 1. **Tier:** bark, escalating to a one-beat stinger for the *first* facet unlock and the *first* resonance reaction (which are tutorials in disguise).
- **Director's intent:** a quick in-world flourish + the unlocking hero's `bark`, framed as the carried memory *teaching* the player something new about itself. The first resonance reaction gets a held beat naming the element interaction so the system reads as intended, not as a random sparkle.
- **Leaves:** *the wars I carry are deepening, not just stacking.*

### 6.11 The Elite Five — "The Gauntlet Opens" (set-piece intro, stinger per persona)

The endgame draft gauntlet (`drafts.ts`) is the run-up to the climax.

- **Trigger:** `Game` elite gauntlet start (set-piece), each persona match (stinger). **Beats:** intro 4, each persona 1-2.
- **Director's intent:** the intro frames the gauntlet as the last gate before the Tower — a slow reveal of the five draft personas in shadow, a title card, the stakes named. Each persona match opens with a short stinger staging that persona's existing `dialogue[]` and a portrait, esports-register and proud (the established tone). Losing and re-entering auto-shortens to bark — the player who's grinding the gauntlet isn't re-watched at.
- **Leaves:** *five doors, and behind the last one is the only person who's done what I've done.*

### 6.12 The Champion & The Tower — "Two Crowns, No Equals" (set-piece, climax)

The climax. Avaryn the Twice-Crowned (`drafts.ts`), then the choice at the Tower of the Ancients (`§2.4`).

- **Trigger:** `Game` champion defeated. **Beats:** 5 (the longest cut in the game). **Tier:** set-piece, no degrade (the one cut-scene "off" only shortens, never silences).
- **Director's intent:** **Pre-fight** — Avaryn stages her three shipped lines (*"Two crowns, no equals. A third would just be greedy."*) on a throne the camera cranes up to, a Radiant crown and a Dire crown on her brow; she is the closed fist `§2.4` describes. **Post-victory** — she does not rage; she *concedes the meta*, and the camera turns from her to the **Tower of the Ancients** rising over the crater (the shipped endgame geography). The final beats pose the dramatic question (`§2.4`) — reunite / rule the eternal game / break the Loop, Zet's own choice — and read the player's `factionChoices`/reputation lean for the **flavor** of the closing card, without changing what happens mechanically. The Moon, in shards across the whole journey, is shown for one beat *almost whole* in the reflection of the player's gathered party — the Loop, for once, held open.
- **Lines:** Avaryn's three shipped `championDialogue` lines; 1-2 **(new)** closing narration cards keyed to the player's lean.
- **Leaves:** *I gathered a broken world back together. Now I decide what it remembers next.* — the thematic close `SPEC.md`'s endgame always implied but never said.

### 6.13 The Outworld Claimants — the cross-franchise homages (StarCraft / Diablo / Warcraft)

A whole class of the game's marquee bosses are **homages to other Blizzard universes** mounted on Dota chassis (`MARQUEE_AND_ARMORY_ADDENDUM.md §2.1`; shipped in `raids.ts`). They are too good — and too beloved by the audience — to leave as anonymous raid intros. They get their own **meta-thread** and their own per-franchise directing, because a Dota player who has also played Diablo or Brood War should *recognize the silhouette before they read the name.*

**Canon framing (bridge).** These claimants fit the lore with zero strain (`§2.3`): the Sundering thinned the seal between worlds, and the Loop's turning rings out across them. What steps through are **outsiders from neighboring worlds**, each come for the Ancients' power — the only prize big enough to cross between worlds for. Collect them under one rising sub-plot, **"the Outworld Claimants"**: the deeper the player descends the spine (range opens at the Vile Reaches, `§2.5`), the more often something arrives that *is not from this world.*

**Homage discipline (hard rule, inherited from `MARQUEE_AND_ARMORY_ADDENDUM §1.1`).** The *beat and silhouette* are recognizable; the *name and every spoken line* are original. Cut-scenes stage only the shipped `dialogue[]` and never a verbatim trademark line. Each touchstone → original mapping is recorded in `DECISIONS.md`. The cut-scene work does not relax this convention; it leans into the *feel*, not the IP.

**The set** (touchstone → shipped original → Dota chassis), grouped by world, with its per-world grade and signature staging. Each stages its shipped lines (`raids.ts`):

| World (grade register) | Shipped boss | Touchstone | Chassis | Signature cinematic beat |
|------------------------|--------------|------------|---------|---------------------------|
| **StarCraft** — *Techno-Fusion / Gothic Futurism; voidlight blue + gunmetal; lens-flare, volumetric beams; "a tear in space"* | The Renegade Marshal | Jim Raynor | `sniper` | Dusty swagger at a dead fleet's wreck; *"I don't miss. Ask the wreck behind me."* over a rack to the rifle |
| | The Void Prelate | Zeratul | `templar-assassin` | The blade seen *after* it has chosen you — a withheld reveal, the dark between stars; *"You see the blade only after it has already chosen you."* |
| | The Queen of Blades | Kerrigan | `broodmother` | The crater as a web closing; swarm rising; *"My children outnumber your cooldowns."* (an original-four raid, already shipped) |
| **Diablo** — *Dystopian Concept Art / Gothic Futurism; redscale + lightless black, one ember/blood accent; low-key chiaroscuro; "ascending from the rift below"* | The Lord of Terror | Diablo | `doom` | Rises from the Hell-rift; *"Your draft dies the moment I deign to look at it."* (original-four) |
| | The Lord of Destruction | Baal | `wraith-king` | Claims the **Worldstone** itself (ties to `§2`); *"Your world keeps a stone at its heart. I came down for it."* |
| | The Lord of Hatred | Mephisto | `razor` | A literal screen-darken on his name — *"Speak my name aloud and the hall goes dark."* — the hall going lightless as a staged beat |
| **Warcraft** — *Surreal Abstract-Realism / Gothic; cryo white-blue or fel-green; backlit silhouettes; "the raised throne / frozen summit"* | The Frost-Crowned King | the Lich King | `lich` | A frozen-summit throne, the climb past everyone who tried; *"Climb my glacier and freeze beside everyone who tried."* (original-four) |
| | The Forsaken Queen | Sylvanas | `drow-ranger` | Banshee-cold, the arrow that does not thaw, mercy lost to death; *"Death freed me of mercy. You will find that inconvenient."* |
| | The Sundered Betrayer | Illidan | `terrorblade` | Fel-green metamorphosis, the betrayer's brand, and the mirror-side question staged at the fel eclipse |

*(The Last Eldwurm is intentionally **Dota-native**, not a cross-world claimant — it is the home world's own answer, and its intro, `§5.3`, plays as the counterpoint: the thing that belongs here, refusing to flee the falling Moon.)*

**Director's intent — the thread, not just the rooms:**
- **First contact (set-piece, once).** The first Outworld Claimant the player faces gets a one-time framing the others don't: the seal *tears* on screen, and something steps through against a grade that doesn't match the biome it's invading — establishing, wordlessly, that the cross-world stakes are real. After that, each claimant reuses the `§6.7` marquee-intro template with its per-world grade above.
- **Per claimant (set-piece intro).** As `§6.7`: open withheld on the world-register detail (a void-tear, a rift-glow, a frozen throne), reveal the silhouette, stage the two shipped lines, land the raid-intro sting, drop into the fight.
- **Capstone (set-piece, on clearing them all).** Defeating the full set unlocks an **"Outworld held"** beat and codex capstone: the invasions from every neighboring world were turned back at the seal. This feeds directly into `§6.12` — the player reaches the Tower having *already proven the world's heart can be defended from outside*, which is exactly what makes Avaryn's "rule it / I already won" stance land as a real third option.

**Codex thread.** Each claimant defeated unlocks an **"Outworld Claimants"** codex entry (a sibling of the `§7` Festivals/Legends tracks), naming the world it came from in-fiction and noting the homage in the director's-commentary caption (`§8`).

**Event cross-tie (`§7`).** The worlds pair naturally with the seasonal modes: the **Diablo** claimants with the dungeon-crawl events (Aghanim's Continuum descent, the Collapsing Hollow); the **StarCraft** claimants with a co-op campaign framing (the Dark Reef crawl); the **Warcraft** claimants with the frost/undeath events (Wraith-Night, Dark Moon). A claimant's raid and its themed seasonal mode share grade and stingers, so the homage reads consistently whether you meet it in the plot or at a festival.

---

## 7. REAL DOTA 2 EVENT TIE-INS — SEASONS & LEGENDS

Now that the world sits squarely in canon (`§2`), it can wear Dota's real history on its sleeve. Two veins of tie-in, both routed through the **same cut-scene system** (`§3`) and the **Moment Director** (`PRES §4.6`), both optional and skippable, both presentation-only and determinism-safe: **(A) seasonal events** as recurring limited-time content, and **(B) esports legends** as Easter-egg cinematics that fire when the player re-creates a famous play. The whole point is the wink — a Dota player should turn a corner and grin.

**Naming convention.** Follow the game's existing homage rule (`MARQUEE_AND_ARMORY_ADDENDUM.md`): the *beat* is recognizable, the *title* is an original variant. The festival is unmistakably Diretide; it is named with the game's own twist. Nobody's trademark is borrowed; the affection is.

### 7.1 The Loop is the in-canon excuse (why limited-time content fits the plot)

Seasonal events usually fight a story — why does Halloween recur in a serious plot? Here it doesn't, because **the world loops** (`§2.1`). A festival is *a turn of the Loop where the world pauses to remember a rite*. Aghanim's Labyrinth was literally "The Continuum Conundrum" — a time-loop dungeon — so the canon and the format already agree. Events are framed as recurring eddies in the cycle, not breaks from it; the binder has seen this festival a hundred cycles and will see it a hundred more.

### 7.2 Seasonal events (recurring limited-time modes + cut-scenes)

Each maps a real Dota event onto game machinery the project already has (raid/dungeon sessions, boss chassis, wave logic), with a directed intro cut-scene. Invoked from a **"Festivals" menu** (no real-world clock dependency required; an optional date trigger can auto-surface the seasonal one).

| Real event | What it was | `ANCIENTS` tie-in | Built on |
|------------|-------------|--------------------|----------|
| **Diretide** | Roshan roams demanding Greevil candy; Roshlings; candy buckets | A turn of the Loop where **Roshan wakes hungry**: feed-or-flee candy mode around **Roshan's Pit** (`raids.ts`); Roshlings as adds; Greevil-egg cosmetic reward | Roshan's Pit raid + add-wave logic (`macro.ts`) |
| **Frostivus / Wraith-Night** | Defend Wraith King's altar through 13 waves; reborn Wraith King ×3 | **Icewrack siege**: defend an altar through escalating waves, climaxing on a thrice-reborn **Wraith King** (already a boss, `bosses.ts`) beside the **Frost-Crowned King** raid (Lich) | Wave defense + Wraith King chassis + Reincarnation exotic |
| **New Bloom / Year Beast** | Co-op damage race vs the Year Beast (Nian); Terrorblade tie | **The Cycle Beast**: a timed damage-race boss whose HP scales to your bound roster; **Terrorblade** (crater guardian) cameo | Boss session + enrage timer (`macro.ts`) |
| **Aghanim's Labyrinth: Continuum Conundrum** | Roguelike dungeon, room choices, Aghanim, time-loop theme | **The Continuum Descent**: the game's **endless dungeon** mode (`dungeons.ts`, `bestEndlessLevel`) reskinned with room-reward choices and a Loop framing — the most on-theme tie-in of all | Existing dungeon + endless-descent system |
| **Siltbreaker** | Co-op campaign through the Dark Reef; Mireska, Roshan | **The Dark Reef** crawl under **Shadeshore**: a linear dungeon staging the Kunkka/Tidehunter feud (`§2.5`) | Dungeon session + Shadeshore region |
| **The Underhollow** | Battle-royale in collapsing tunnels; fight Roshlings; cheese | **The Collapsing Hollow**: a timed descent with a shrinking safe zone and **Cheese** (`items/index.ts`) as the prize | Dungeon timer + Cheese item |
| **Nemestice** | Falling meteors / the Nemestice stone (Zet's sealing power) | **Nemestice Fall**: a crater event where shards of Zet's sealing-stone rain — a survival/collection mode at the **Mad Moon Crater**, the single most canon-pure tie-in | Crater region + zone/hazard logic |
| **Crownfall** | Multi-act Cavern Crawl; Vengeful Spirit vs Imperia; visual-novel beats | **A Crown's Fall**: an act-structured recruitment arc reusing the **trial/quest** system (`quests/index.ts`) with dialogue-card visual-novel beats from `§3` | Recruitment trials + dialogue cards |
| **Dark Moon** | Nightsilver / Luna mini-event | **Dark Moon Hunt**: a Nightsilver wave-survival night under Selemene's gaze | Wave logic + Nightsilver region |

Each seasonal event gets a **stinger or set-piece intro** (`§4.3`) authored in the `§5` DSL, a reward that slots into the existing loot/cosmetic systems, and a **codex "Festivals" unlock**. None touch combat math; the modes are new *drivers* over the same headless core (`SPEC.md §1.1`).

### 7.3 Esports legends — Easter-egg cinematics (the grin moments)

The game already contains the exact heroes and the exact arena (Roshan's Pit) of Dota's most famous plays. When the player **re-creates a legendary moment**, a detector fires a short homage cut-scene + a "Legends" codex unlock. The beat is recognizable; the title winks.

| Real moment | The play | Trigger (SimEvent pattern, read Game-side) | Homage callout |
|-------------|----------|---------------------------------------------|----------------|
| **TI5 — the Echo Slam in the Roshan pit** (UNiVeRsE, EG) | Earthshaker blinks in and Echo Slams the whole enemy team in the Rosh pit | `Earthshaker` ult hits **4+** enemies **inside the Roshan's Pit raid** | *"The Pit Remembers"* |
| **TI3 — the Fountain Hook** (Dendi, Na'Vi) | Pudge + Chen drag enemies into the fountain | A `Pudge` hook ends with the victim dying **in the player's base/fountain zone** | *"Hooked Home"* |
| **TI8 — the 11-million Berserker's Call** (Ceb, OG) | Axe Calls, dies, but the save wins the fight | `Axe` Call where Axe **dies** but the fight is won within a few seconds | *"The Call That Paid Out"* |
| **TI3 — the Million-Dollar Dream Coil** (s4, Alliance) | Puck's Dream Coil cancels the enemy defensive TPs | A coil/zone ult **interrupts 2+ enemy teleports** (if Puck is in roster) | *"The Coil That Closed the Game"* |
| **Rampage** | Five kills, one hero, no deaths between | Player hero scores **5 kills** in a short window (shares the `PRES §4.5` streak window) | *"Rampage"* (the one callout kept verbatim — it's Dota's, and it's earned) |

Detection lives **Game-side**, reading the `SimEvent` stream the renderer already consumes — it never alters an event, a tick, or an outcome, so the determinism hash is untouched (same contract as `PRES §4`). Each is a single short stinger under the Moment Director's impact budget, gated to fire **once** per save unless replayed from the gallery, so it stays a treat and never a nuisance.

### 7.4 The Aegis of Champions thread

The real-world **Aegis of Champions** — the TI trophy — *is* the in-game Aegis of the Immortal. Lean on it: the game's Aegis (Roshan's Pit only, `items/index.ts`) carries an inscription nodding to the line of champions, and clearing Roshan's Pit on the hardest tier unlocks a **"True Champion"** cosmetic title in the journal. The one place the game's mechanical chase item and Dota's actual trophy are the same object — a free, resonant tie-in that costs a string and a flag.

### 7.5 How they're built (technical, headless-safe)

- **Seasonal events** are a new `SeasonalEventDef` registered in the registry like raids/dungeons, each pointing at a **mode driver** that reuses existing session machinery: damage-race (Year Beast), wave-defense (Wraith-Night, Dark Moon), endless-descent (Continuum, Underhollow), Roshan-candy (Diretide), hazard-survival (Nemestice), linear-crawl (Dark Reef), act-trials (Crownfall). New drivers over the same core; **zero new combat rules**.
- **Esports callouts** are a `LegendDetector` Game-side: a small set of predicate functions over the `SimEvent` stream, each firing a cut-scene id when matched. Pure read; determinism-safe.
- **Surfacing**: a Festivals menu (manual invoke + optional date trigger) and a codex "Festivals"/"Legends" track. All rewards flow through existing loot/cosmetic/journal systems.
- **Respect the player**: every tie-in is opt-in or once-per-save, skippable, and off under a "tie-ins: off" setting for purists. Affectionate, never intrusive.

### 7.6 Acceptance

Done when: at least the three highest-value seasonal modes (Diretide/Roshan-candy, Wraith-Night defense, the Continuum endless reskin) are invocable from a Festivals menu with a directed intro and an existing-system reward; at least the **Pit Remembers** Echo-Slam and **Hooked Home** fountain-hook callouts fire correctly on their patterns and never on false positives; the Aegis carries its Champions inscription and the True Champion title unlocks; every tie-in is skippable, once-per-save (callouts) or replayable (festivals), and fully suppressible; and the determinism and boundary tests are unchanged.

---

## 8. THE CODEX GALLERY — REPLAY & THE LOOP THREAD

Cut-scenes are content; let the player revisit them. The codex already gates and stores narrative unlocks (`Game.codexEntries()`, `GameSave.codexUnlocks`/`journalSeen`) — extend it, don't build a parallel system.

- **Cinematics tab** in the codex (`src/ui/` codex modal): every `replayable` cut-scene the player has seen, grouped by category (Prologue, Binds, Regions, Bosses, Raids, Items, Endgame), each replayable at full length on demand. This is where grinding-skipped intros go to be savored.
- **The Loop thread:** the dedicated codex track from `§2.6` assembling `§2.1`'s real canon, one entry per act break, with the flashback-graded cards (`§6.4`) viewable in sequence — the player's reconstructed understanding of the Primordial Mind, the Sundering, and why the world keeps starting over.
- **Caption from the DSL:** each gallery entry shows its shot intent and staged lines as caption text, so the codex reads like a director's commentary track.
- **Spoiler-safe:** locked entries show as silhouettes with their act, never their content. The climax (`§6.12`) is gallery-locked until first cleared.

---

## 9. ACCEPTANCE

Done when:

- **Lore:** a new player meets a sequenced plot grounded in real Dota 2 canon — a prologue that retells the Sundering, an escalation that rides the eight badges, and a climax that poses Zet's choice — and not one shipped name, region `lore`, hero `bark`, or raid line is contradicted, nor any point of established Dota cosmology. The Loop codex thread assembles `§2.1` across the act breaks.
- **System:** one `Cinematic` director plays data-driven `CutsceneDef`s in a `cinematic` camera mode, composing camera, animator gestures, VFX, audio, and a DOM letterbox/dialogue-card overlay — reading sim events and Game milestones, writing no sim state.
- **Catalogue:** every `§6` beat fires on its trigger at its tier — the prologue, the first bind, the act-break badges, region arrivals, boss phase breaks, the ten raid intros, the Aegis/Rapier holds, echo/resonance milestones, the Elite Five, and the Champion/Tower climax — staging shipped text via `ref:` wherever it exists.
- **Outworld Claimants:** the StarCraft/Diablo/Warcraft homages (`§6.13`) read with their per-world grade and signature beat, the first-contact and all-cleared capstone set-pieces fire, every spoken line is a shipped original (no verbatim trademark), and the touchstone→original mappings are in `DECISIONS.md`.
- **Tiers & pacing:** set-pieces are rare (~once an hour, never back-to-back), stingers are short and skippable, barks just route lines; the director and the Moment Director share one impact lock so two peaks never collide.
- **Skippable, fast-forwardable & accessible (`§3.4`):** every cut-scene supports **advance** (tap to next beat / complete the typewriter), **fast-forward** (hold to run at 2-8× while still watching), and **skip** (hold-to-confirm on first view, instant tap on repeat) by both keyboard and on-screen controls; skipping or fast-forwarding always snaps cleanly to the end state, restores the pre-scene gameplay camera, releases any audio duck, and still fires the codex/journal unlock; seen cut-scenes auto-fast-forward, the "always skip cut-scenes" toggle works, and "default cut-scene speed" persists; in-combat beats skip the camera takeover only (the sim never paused); and reduced-motion, photosensitivity, and "cut-scene length: full/short/off" all degrade staging without withholding information.
- **Authoring:** the cut-scene DSL (`§5`) compiles to `CutsceneDef` data; data-lint validates every `ShotSpec` maps to real engine capability and every `ref:` resolves, failing the build on a dangling reference exactly like a bad recipe.
- **Gallery:** seen cut-scenes are replayable from the codex Cinematics tab; locked ones show spoiler-safe.
- **Contract:** `src/test/boundary.test.ts` and the `Sim.hash()` determinism tests are unchanged and byte-identical; `npm test`, `npm run build`, and the browser smoke stay green.

---

## 10. PHASING

Ordered by story value against risk; each ships playable on its own.

1. **Lore deepening, data only (`§2.6`).** Region `lore` second sentences, hero cycle-notes, the Loop codex thread, and the plot-spine overlay (`§2.5`). Pure data + codex gating, zero engine work — the world reads deeper the moment it lands, before any cut-scene exists. Done when the codex assembles `§2.1` across the badges and no shipped string or canon point is broken.
2. **The cut-scene system + DSL (`§3`, `§5`).** The `Cinematic` director, the `cinematic` camera mode, the DOM letterbox/dialogue overlay, the `CutsceneDef` data model, and the DSL transformer + data-lint. Ship with **one** stinger (subsequent binds, `§6.3`) as the proving beat. Done when a data-authored stinger plays and skips correctly and the boundary/determinism tests are green.
3. **Stinger families (`§6.3-6.6`, `§6.8`, `§6.10`, `§6.11` per-persona).** The workhorse beats — binds, region arrivals, badges, boss phase breaks, clears, echo milestones — reusing the proven system. Done when every stinger trigger fires at its tier and degrades correctly under settings.
4. **The set-pieces (`§6.1-6.2`, `§6.4` act breaks, `§6.7` raid intros, `§6.9` Aegis/Rapier, `§6.11` intro, `§6.12`, `§6.13` Outworld Claimants).** The bespoke peaks, authored once the machinery and the stingers are proven. Raid intros first (they stage shipped lines and prove the template), then the per-world claimant grades and the first-contact/all-cleared capstone, then prologue/first-bind, then the climax. Done when each set-piece leaves its intended feeling and obeys the impact lock.
5. **Event tie-ins (`§7`).** Seasonal modes (start with Diretide/Roshan-candy, Wraith-Night, the Continuum endless reskin), the esports Easter-egg detectors (Pit Remembers, Hooked Home), and the Aegis of Champions thread — all riding the proven cut-scene system and existing session machinery. Done when `§7.6` passes. Highest *delight* per hour for a Dota audience, lowest risk because it reuses everything.
6. **The codex gallery (`§8`).** Replay, the Loop thread view, the Festivals/Legends tracks, spoiler-safe locks. Done when `§8` passes.

**The whole spec is done when:** a first-time player crosses a world that *tells them why* — the Mad Moon is sundered, the binds teach them they're recovering champions from the Loop, the badges escalate the eternal war, the raids announce claimants for the Ancients' power, the chase items feel like turning points, and the Tower asks Zet's own question — a returning Dota player grins at a Diretide-hungry Roshan, an Echo Slam that "the pit remembers," and an Aegis that is the Aegis; and a Blizzard veteran recognizes the Outworld Claimants — the Marshal, the Prelate, the Forsaken Queen, the Lords of Hatred and Destruction — by their silhouette before they read the name. Every key event staged in-world instead of toasted past, every cut skippable and replayable, every frame respecting the same headless-core, impact-budget, and accessibility contracts as the rest of the game, and not one point of Dota canon broken.

---

## 11. PRINCIPLES & DECISIONS TO LOG

**Principles** (inheriting `PRESENTATION_SPEC.md §10`):

- **The core is sacred.** Cut-scenes read sim events and Game milestones; they never write sim state. The boundary and determinism tests are the contract.
- **Deepen, never retcon.** Shipped strings win every conflict. The plot is connective tissue between facts, not a rewrite of them.
- **Show the peaks, route the rest.** Only true story peaks earn a bespoke cut; the workhorse beats are short stingers; the smallest are just the right bark. Scarcity makes a set-piece a set-piece.
- **Always skippable, always replayable.** The lore-hunter and the speedrunner both get their game. Information always reaches the player; only staging scales.
- **Earn the moment honestly.** A cut-scene fires on real progress and amplifies a moment the player made. It never stops the game to lecture.
- **One language for big moments.** The Cut-scene Director and the Moment Director (`PRES §4.6`) share an impact budget, an accessibility cap, and a four-plus-one-sense grammar (LOOK/SOUND/FEEL/FRAME), so every peak in the game — mechanical or narrative — speaks the same escalating language.

**Log in `DECISIONS.md` as they land:**

- The connective reading (`§2.3`) and the protagonist framing (`§2.4`) as the canonical reading, with the rule that shipped strings and established Dota canon both override any bridge.
- Whether the additive `cinematic-cue` `SimEvent` (`§3.3`) shipped or the director infers phase beats Game-side instead.
- The `CutsceneDef` schema and the closed stage-action vocabulary (`§5.2`); each new verb's engine realization.
- The three-tier impact budget and the shared lock with the Moment Director.
- The skip/fast-forward/advance control mapping (`§3.4`) — the keys, the hold-to-confirm skip threshold, the fast-forward speed steps, the seen→auto-fast-forward default, and the "always skip" + "default cut-scene speed" settings.
- The "cut-scene length" setting's degrade matrix and the reduced-motion/photosensitivity caps.
- Any new narration lines written (the `(new)`/`(bridge)` beats in `§6`) and why no shipped line fit.
- The seasonal-event roster and their mode drivers (`§7.2`), the `LegendDetector` predicates and their false-positive guards (`§7.3`), and the homage-naming calls — confirming each beat is recognizable while each title is an original variant.
- The Outworld Claimants thread (`§6.13`): the per-world grade registers, the first-contact/all-cleared capstone framing, and a restatement that the homage convention (original names/lines, recognizable beats, mappings in `DECISIONS.md`) governs the cut-scenes too — plus the open denylist-scope question from `MARQUEE_AND_ARMORY_ADDENDUM §7.2`.

---

## APPENDIX A — BIOME GRADE TUPLES

Default lighting, palette, and mood per region, so a cut-scene set in a biome inherits a consistent look unless a beat overrides it. Drives the post-processing grade targets (`PRESENTATION_SPEC.md §3.1`).

| Region | Lighting | Palette | Mood |
|--------|----------|---------|------|
| Tranquil Vale | Golden hour | Analogous warm | Hopeful |
| Nightsilver Woods | Bioluminescence | Bluescale | Mysterious |
| Icewrack | High-key cold | Cryo white-blue | Serene → Tense |
| Devarshi Desert | Hard / Godray | Sepia + star-metal gold | Ominous |
| Shadeshore | Backlit / Silhouette | Desaturated teal | Melancholic |
| The Vile Reaches | Low-key | Redscale + rot-green | Gritty |
| Quoidge | Ambient / Volumetric | Triadic arcane | Philosophical |
| Hidden Wood | Godray / Dappled | Greenscale | Whimsical → Tense |
| Mount Joerlak | Rim / Chiaroscuro | Greyscale + titan-bronze | Epic |
| Mad Moon Crater | Dark Void / Volumetric | Complementary cold/ember | Dramatic |

---

