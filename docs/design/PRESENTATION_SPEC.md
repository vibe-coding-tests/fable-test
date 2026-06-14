# PRESENTATION & FEEL SPEC — "ANCIENTS"

The next round of improvements: how the game **looks, sounds, and feels**. Companion to `SPEC.md` (design target), `OPTIMIZATION_SPEC.md` / `OPTIMIZATION.md` (performance), `PROGRESS.md` (status), and `DECISIONS.md` (calls made). Same crunch-mode rules as `SPEC.md §0`: this is direction and priority, not a gate.

The game is content-complete through Phase 5. It plays. What it lacks is **juice** — the layer of visual and audio feedback that makes a hit land, a kill pay off, and gold feel like a reward. `SPEC.md §9 Phase 5` set the aspiration (graphics overhaul, feel pass, real sound). This spec turns that aspiration into a concrete, ordered build, and adds the one thing the existing plan never named: a **dopamine loop around gold**.

The throughline: every system here is engine-side and UI-side. The headless deterministic core (`SPEC.md §1.1`) stays untouched. Models, sound, post-processing, screenshake, and HUD animation are all driven by the sim events the core already emits (`SimEvent`, `src/core/types.ts:700-736`). Nothing here changes a single combat result.

---

## 0. WHERE WE ARE (measured today)

An honest read of the current presentation layer, with file references so the work has a starting line.

**Rendering** (`src/engine/scene.ts`): a plain `WebGLRenderer` with `antialias: true`, `PCFShadowMap`, and a 2048 shadow map. Every unit material is `MeshLambertMaterial` (`src/engine/models.ts:44`). Terrain and props are Lambert with flat shading (`src/engine/terrain.ts:97`). There is **no post-processing stack** — no bloom, no tonemapping, no color grading, no ambient occlusion, no vignette. The day/night system blends three palettes and moves the sun (`scene.ts:425-464`), which is solid groundwork that currently feeds a flat image.

**VFX** (`src/engine/vfx.ts`): the ~12 archetypes are built from primitive geometry and `MeshBasicMaterial` with normal alpha blending. No additive glow, no soft particle textures, no projectile trails, no ground decals. Each effect allocates fresh geometry and material on spawn (`burst` builds a `RingGeometry`, a `BufferGeometry`, a `Points`, and two materials every call, `vfx.ts:197-235`) and drops them for GC on expiry. The `transientVfxCap` (220) bounds the count but not the churn.

**Audio** (`src/engine/audio.ts`): a small `ProceduralAudio` class plays oscillator and noise envelopes per event. There is no music, no spatialization, no reverb, and no master bus or limiter. The `musicVolume` setting exists in the save but drives nothing. **Gold is silent**: `handleEvent` has cases for cast, attack-impact, damage, heal, reaction, capture, levelup, death, and item-used, but none for gold or kill-credit (`audio.ts:25-58`). The `gold` SimEvent is *typed* (`types.ts:733`) but never emitted; gold rewards flow only through `kill-credit` in `Game.handleKillCredit` (`src/systems/game.ts:1273`).

**HUD** (`src/ui/hud.ts`, `src/ui/styles.css`): a clean, functional DOM overlay. Gold is rendered as plain text that snaps to the new value every frame (`hud.ts:126`). There is no count-up, no coin animation, no pulse on gain. Damage floaters rise and fade (`hud.ts:375-410`); a `goldf` class exists for a `+Ng` floater on kill-credit but it is the same rising-text treatment as damage. Crits add a `!` and a slightly larger red number (`hud.ts:325`, `styles.css:292`), which is the floor of crit feedback, not the ceiling. No screenshake, no hitstop, no screen flash, no multi-kill banners.

**Loot & drops** (`src/core/phase3.ts`): the loot *math* is built and tested. `rollLoot` (`phase3.ts:24`) returns guaranteed components, a rarity-gated `assembled` drop, and a `dryStreak`/`pity` system so a clear is never fully empty. But no `SimEvent` carries a drop, and nothing renders one. A dropped item has no beam, no sound, and no get-moment. The biggest payoff in an ARPG — the item explosion at a boss's feet — is invisible.

**Title & menu** (`src/ui/title.ts`, the menu modal in `hud.ts:801`): static dark cards. The starter pick shows a generated 2D portrait, not the actual hero model. Settings are three volume sliders plus toggles.

**Two highest-leverage moves.** First, a post-processing stack (bloom + ACES tonemapping + grade) makes the emissive VFX and lights glow, which reads as "modern" for low risk and touches the whole frame at once. Second, give every reward a sound and an animation. Gold, a dropped item, a clean last-hit, a crit — these are the moments the player is here for, and today they pass in silence.

---

## 1. REWARD DOPAMINE — GOLD, LOOT & THE LAST HIT (headline)

Farm, last-hit, drop, buy, repeat — the Diablo loop in `SPEC.md §4-6`. Every turn of that loop hands the player a reward, and a reward you cannot hear or see is not a reward. This section makes the rewards land: gold, dropped items, the killing blow, and the crit (`§4.3`) all speak one **escalating feedback language**. A single kill streak should make the coin sound climb, the gold counter pulse, the loot beam flare, and the screen punch, all in time with each other. These systems are small, isolated, and high-impact, so they ship first.

Three reward moments, one shared grammar: a streak window that escalates pitch and scale, magnitude-scaled flourishes (a 2g pickup is a blip, an Aegis drop is an event), and a distinct "you earned this" stinger for the rare payoff.

### 1.1 Emit one gold event

The `gold` SimEvent already exists (`types.ts:733`: `{ t: 'gold'; amount; reason; pos? }`) and is never fired. Route every gold gain through it so the presentation layer has one hook:

- Kill bounty and the +15% last-hit bonus (`game.ts:1285-1286`), tagged `reason: 'kill'` / `'lasthit'`.
- Echo surplus bounty (`game.ts:943-944`), tagged `'echo'`.
- Sell, quest, and boss/raid drops, tagged `'sell'` / `'quest'` / `'drop'`.
- Post-cap XP overflow to gold (`overflowXpToGold`, `game.ts:1289`), tagged `'overflow'`.

Each carries the world position of the source (the victim, the shrine, the shop). The HUD and audio read `reason`, `amount`, and `pos`. This is a Game-layer change feeding the renderer; the core never reads it back.

### 1.2 The coin sound — a pitch ladder, not a beep

Build a dedicated coin synth in `audio.ts`. The Dota and ARPG "ka-ching" is a bright metallic ring: two or three detuned partials (a fundamental near 1.8-2.4 kHz plus a fifth and an octave), a fast attack, a short shimmering decay, and a touch of feedback delay for sparkle. Layer a soft "purse" thump under big sums for weight.

The dopamine trick is a **pitch ladder tied to a streak**. Kills within a short window (about 1.5s) raise the coin pitch one semitone each step — the same escalating-reward cue as a coin run in Mario or a kill streak in an arena shooter. The streak resets after the window. Magnitude maps to layers: small last-hits get the single ring, a boss or echo payout gets a three-note rising arpeggio "jackpot" stinger. Last-hits (the `'lasthit'` reason) get a brighter, slightly louder ring than passive participation gold, mirroring Dota's last-hit gratification.

### 1.3 Coins fly to the counter

On a gold event, spawn coin particles at `pos`, project to screen space (the HUD already does world-to-screen for floaters, `hud.ts:392-404`), and arc them to the top-bar gold counter with eased motion and slight scatter. On arrival each coin pops the counter. Options, cheapest first: DOM coin sprites animated with `transform` (simplest, integrates with the existing `#floater-layer`), or an additive billboard burst in the 3D scene that converges on a screen anchor. Start with DOM.

The counter itself comes alive:

- **Count-up tween.** The number rolls from old to new over about 300ms instead of snapping (`renderTopBar`, `hud.ts:118`). Big gains roll faster and longer.
- **Scale pop + golden flash.** Each arrival bumps the counter scale and flashes the gold color brighter, settling back. Stack the pops so a kill streak makes the counter visibly pulse.
- **Streak badge.** A rapid-kill streak shows a multiplier readout next to the counter ("×3") that grows and brightens with the streak and decays out when the window lapses. This is the visible half of the pitch ladder.

### 1.4 The last-hit crunch

Last-hitting is the core skill expression of the genre. When the controlled hero lands the killing blow (the `lastHitByPlayer` path, `game.ts:1285`), stack the feedback: the brighter coin ring, a bigger coin burst, a short white impact flash on the victim, a denser death pop, and the "+15%" called out in the floater. A clean last-hit should feel like a small crunch you want to chase.

### 1.5 Loot drops — the ARPG money shot

When a boss dies and items burst from the corpse, that is the dopamine peak the whole loop is built around. The loot math is already done (`rollLoot`, `phase3.ts:24`); it needs a body. Add a typed drop event, the sibling of the gold event in `§1.1`, carrying the dropped `ItemSave[]`, each item's **rarity**, and the drop position. Then dramatize it by rarity:

- **Rarity tiers.** Derive a rarity from the existing data: components are common, assembled items are rare, gated top-tier and raid-anchor items (Rapier, Aegis, Butterfly, Scythe) are legendary. Each tier gets its own color, the same color used for the beam, the floater, and the item border in the inventory, so rarity reads instantly and consistently everywhere.
- **Loot beams.** A vertical light beam in the rarity color rising from the drop, the Diablo/PoE tell that says "something good landed here." Common drops get a short dim beam; a legendary throws a tall, bright, slowly rotating pillar with motes drifting up, visible across the screen. Bloom (`§3.1`) makes it sing.
- **The burst.** Items physically arc out of the corpse and settle on the ground with a bounce and a small dust puff, so a fat drop *explodes* outward instead of blinking into a list.
- **Drop sounds, by rarity.** A common drop clinks. A rare drop rings with a richer chord. A legendary fires a held, reverberant chime plus a low sub-bass "whoomp" that you feel — the audio version of the screen stopping. The rarer the item, the longer and brighter the sound, escalating exactly like the gold pitch ladder (`§1.2`).
- **Pity payoff.** When `rollLoot` hands over a `pityUsed` drop (bad-luck protection finally hit, `phase3.ts:33`), give it extra fanfare. The grind paying off is its own distinct, earned moment.

### 1.6 The item-get moment

Picking the item up closes the loop. On pickup, fly the item icon to the inventory slot (the coin-to-counter motion from `§1.3`, reused), flash that slot in the rarity color, and pop a get-toast styled by rarity with the item name and a one-line "why you care." A legendary pickup deserves a brief banner and a held stinger, the loot equivalent of a multi-kill callout (`§4.5`). Auto-pickup for gold and common components keeps the floor clean; let the player walk over rare-and-up to savor the grab, or toggle full auto-pickup in settings.

### 1.7 Acceptance

Done when: killing a creep fires a `gold` event and coins fly to the counter, which rolls up with a scale pop and gold flash; three fast kills audibly climb in pitch and show a streak badge; a player last-hit sounds and looks distinctly punchier than bench-participation gold; a boss death emits a drop event that bursts items out with rarity-colored beams and rarity-scaled drop sounds; a legendary drop reads instantly across beam, sound, and floater; a `pityUsed` drop gets extra fanfare; picking an item up flies it to inventory with a rarity flash and get-toast; and all of it scales with the master/SFX volume settings and the reduced-motion toggle (`§7`).

---

## 2. AUDIO SYSTEM

The gold loop (`§1`) proves the pattern. This section builds the rest of the soundscape around it. Stay procedural where it earns its keep (zero asset weight, infinite variation) and add small sample loops only where synthesis falls short, like music.

### 2.1 A real mixer

The current code connects every sound straight to `ctx.destination` (`audio.ts:78`). Build a bus graph instead:

```
sources → [sfx bus] ─┐
sources → [music bus]─┼→ [master gain] → [compressor/limiter] → destination
sources → [ambience]─┘
```

A `DynamicsCompressorNode` on the master prevents the harsh clipping that happens when a teamfight stacks twenty SFX at once. Wire the three existing settings — `masterVolume`, `sfxVolume`, `musicVolume` (`hud.ts:831-833`) — to their buses; `musicVolume` finally does something. Add an `ambienceVolume`. Suspend the context on window blur and resume on focus so the game goes quiet when tabbed away.

### 2.2 Spatialization

In the gameplay view, sounds should come from where the action is. Pan and attenuate each positional SFX by the source's screen position relative to the followed hero: a `StereoPannerNode` for left/right and a distance-based gain rolloff are enough, with the camera target as the listener origin. Skip spatialization in map view and for UI sounds. The sim already passes positions through events, so this is a read of `unitPos` like the VFX layer does (`scene.ts:195-198`).

### 2.3 Music — adaptive beds

Light, layered, region-aware music. One ambient bed per biome (`grass`, `snow`, `desert`, `wasteland`, `coast`, `forest` — the keys already in `terrain.ts:44`) plus a combat layer that swells when enemies are engaged and ducks back out a few seconds after combat ends. Tie the bed's brightness to the day/night value the scene already computes (`updateDayNight`, `scene.ts:425`): warmer and fuller by day, sparse and cold at night. Keep it tiny — short looping stems (synthesized pads, or a handful of small assets logged in `DECISIONS.md`) crossfaded by state, not a full score. Town gets a calmer theme; gyms, raids, and the Champion fight get their own stingers and a heightened combat layer.

### 2.4 SFX depth and variety

The archetype-driven approach (`castSound`, `audio.ts:140`) is right. Deepen it:

- **Variation.** Add small random pitch and timing jitter to every repeated sound so a fast attack chain does not become a machine-gun of identical clicks.
- **Hero flavor.** Bias ability sounds by the caster's attribute or element (`SPEC.md §9 Phase 5` elements): a Cryo nuke rings glassy and high, a Geo slam thuds low, a Pyro spell crackles. The element is already on the unit.
- **Effort vocals.** A short synthesized grunt or shout on attack, cast, and death, pitched by hero attribute (STR low, INT high, AGI mid). No voice acting, just a formant blip. It reads as "a person did that."
- **UI and state cues.** Button hovers and clicks, ability-ready blips, a low-HP heartbeat that fades in under ~25% HP, a tense sting when an enemy ult is cast nearby, capture-channel rising tone, badge and level fanfares.

### 2.5 Acceptance

Done when: a master limiter keeps a 20-unit teamfight from clipping; the three volume sliders plus ambience each control their bus live; positional sounds pan and attenuate by screen position in gameplay view; a biome music bed plays and a combat layer swells and ducks with fights; repeated attacks vary in pitch; low-HP heartbeat and ability-ready blips fire correctly; and muting on blur works.

---

## 3. GRAPHICS & RENDERING OVERHAUL

The models, terrain, and VFX are decent shapes lit flatly. The fastest path to "modern" is the light and the lens, not the geometry. Do the post-processing first; it lifts everything already on screen.

### 3.1 Post-processing stack (the big lift)

`three` ships the whole stack in `three/examples/jsm/postprocessing` — no new dependency. Replace the direct `renderer.render` (`scene.ts:151`) with an `EffectComposer`:

- **Bloom** (`UnrealBloomPass`). The single highest-impact change. Every emissive VFX, projectile core, shrine crystal, and spell flash starts to glow. Tuned right, the existing primitive art suddenly looks intentional.
- **Tonemapping.** Set `renderer.toneMapping = ACESFilmicToneMapping` with an exposure control. Cheap, and it fixes the washed/clipped highlights that bloom would otherwise blow out.
- **Color grading + vignette.** A small `ShaderPass` for contrast, saturation, and a subtle vignette, with per-biome and day/night grade targets (lean cold and desaturated at night, warm at noon). This ties directly into the palette work already in `updateDayNight`.
- **Ambient occlusion** (optional, quality-gated). `SAOPass` or `GTAOPass` for contact shadowing where units meet the ground. Highest cost; put it behind the high/ultra tier only.
- **FXAA/SMAA.** Move antialiasing into the composer since `EffectComposer` output is not MSAA-resolved by default.

Every pass is quality-tiered (`§7`) and can be turned off whole.

### 3.2 Materials and lighting

- **PBR for units.** Move `buildUnitRig` from `MeshLambertMaterial` to `MeshStandardMaterial` (`models.ts:44`) with roughness/metalness per palette role: armor reads metallic, cloth reads rough, crystal reads glossy. Light it with a cheap generated environment map (`RoomEnvironment` + `PMREMGenerator`) so units catch rim and spec highlights instead of reading as matte clay.
- **Emissive accents.** Drive emissive on weapons, eyes, and item overlays (`applyItemAppearances`, `models.ts:549`) so a Radiance burns, a Rapier glows, and frost shards read as cold light — and bloom picks them up for free.
- **Rim light.** A dim back/fill light keyed opposite the sun separates units from the ground, the classic readability trick for top-down action.
- **Better shadows.** Keep the directional sun shadow; add cheap blob/contact shadows under every unit so even shadow-off tiers keep units grounded.

### 3.3 VFX richness

Upgrade the archetypes in `vfx.ts` while keeping their data-parameterized contract (`SPEC.md §2`):

- **Additive glow.** Switch transient materials to `AdditiveBlending` so bursts, beams, and bolts read as light, not paint.
- **Soft particles.** Replace hard `PointsMaterial` dots (`vfx.ts:215`) with a generated radial-gradient sprite so sparks are soft, not square.
- **Projectile trails.** A fading ribbon or stretched billboard behind projectiles (`makeProjectile`, `vfx.ts:174`) so a Mirana arrow or a Hook reads as motion.
- **Ground decals.** Zones (`spawnZone`, `vfx.ts:390`) project a textured decal with an animated rim instead of flat discs; impacts scorch a quick fading decal.
- **Pooling.** Pool by archetype so the additive upgrade does not increase GC churn. This is exactly `OPTIMIZATION_SPEC.md §B.2` — do it here as part of the VFX pass and the two specs meet.

### 3.4 Environment

- **Sky.** A gradient sky dome or `Sky` shader per biome, relit by day/night, replacing the flat `scene.background` color (`scene.ts:450`).
- **Water.** The vibe-ring water plane (`terrain.ts:104`) becomes an animated shader: scrolling normals, fresnel, a horizon glow. Coast and Shadeshore earn it.
- **Vegetation and weather.** Wind sway on instanced trees (vertex shader on the existing `InstancedMesh`, `terrain.ts:137`); ambient particles per biome — snow in Icewrack, dust in Devarshi, embers in the Vile Reaches, pollen in the Hidden Wood.
- **Fog.** Tune fog color and range per biome (`scene.ts:94`) so distance reads atmospherically instead of as a uniform haze.

### 3.5 Hero model fidelity (lower priority)

Push the procedural likeness overlays (`applyHeroLikeness`, `models.ts:320`) a little further with the new PBR materials, and progress the glTF pipeline stub (`src/engine/assets.ts`) for the three starters so `SPEC.md §9 Phase 5`'s "named on sight" bar gets a real test. This is the most effort for the least per-hour payoff, so it trails the lighting and VFX work.

### 3.6 Acceptance

Done when: an `EffectComposer` with bloom and ACES tonemapping renders the scene; emissive VFX and the shrine crystal visibly glow; units use PBR materials with an env map and read with rim and spec; at least bursts and beams use additive blending and pooled geometry; zones render as textured decals; one biome shows ambient weather particles; and the default quality tier holds the `SPEC.md §0` 60fps budget with 30 units on screen (verified against `OPTIMIZATION_SPEC.md §D`).

---

## 4. GAME FEEL & JUICE

The connective tissue that makes combat feel physical. Each item is small; together they are the difference between "things are happening" and "I hit that."

**Determinism guardrail.** The sim is fixed-step and authoritative (`game.ts:1411-1415`). All feel here is render-side: it reads sim events and warps presentation, never sim time. No technique below adds, drops, or rescales a logic tick. Classic hitstop pauses the simulation; here it is a visual hold (a freeze-frame pose, a flash, a scale pop) layered over a sim that keeps ticking. The `Sim.hash()` determinism tests (`OPTIMIZATION_SPEC.md §D.2`) must stay byte-identical after this work.

### 4.1 Screenshake

A trauma-based camera shake (one `trauma` float per source, shake scales with `trauma²`, decays over time) added to the follow camera (`updateCamera`, `scene.ts:473`). Magnitude comes from event size: a small tick of trauma on a normal hit, a punch on a crit or big nuke, a heavy jolt on a death, ult, or knockback. A global intensity slider and a hard zero for the reduced-motion setting (`§7`).

### 4.2 Impact feedback

- **Hit flash.** Enemies flash white/hot on damage — the animator already has `hitFlash` (`animator.ts:161`); push it harder and scale it with magnitude.
- **Freeze-frame on big hits.** On a crit or kill, hold the victim's pose for a few frames and pop a bright flash. Render-only, so the sim rolls on underneath.
- **Squash and lean.** A quick scale-pop on the attacker's lunge (the `lungeFlash` hook exists, `animator.ts:101`) and a recoil lean on the victim away from the blow.
- **Death.** Beyond the current collapse-and-fade (`animator.ts:37-49`): a dissolve or shatter keyed to damage type (frost shatter, fire ash, physical ragdoll-lite), a spark/blood burst, and a brief soul/skull pop on hero and boss deaths.

### 4.3 Crits, big numbers & floating combat text

A crit is a mini-jackpot, and the player should never miss one. The crit already resolves and tags its `damage` event (`combat.ts:216`, `crit: true`); presentation has barely touched it (today: a `!` and a slightly bigger red number, `hud.ts:325`). Make it an event:

- **Big numbers.** A crit number is dramatically larger than a normal hit — punch in with an overshoot-and-settle scale, a bold gold-into-red gradient, a hard outline, and a quick shake on the text itself. The bigger the crit, the bigger the number, so a monster crit fills a chunk of the screen for a beat.
- **A crit sound.** A distinct sharp metallic "shink"/impact crack layered over the normal hit, brighter and louder, so you *hear* the crit before you read it.
- **The hit reacts.** A crit feeds extra screenshake trauma (`§4.1`), a brighter and longer hit-flash on the victim (`§4.2`), a starburst VFX at the impact point, and a brief freeze-frame on a big one. The whole frame acknowledges the roll.

The rest of the floating combat text gets the supporting polish around that headline: scale every number by magnitude (a chip hit is small and faint, a nuke is large); offset overlapping numbers so a flurry stays readable instead of stacking into mush; add deny, miss, and "IMMUNE" cues with their own styling; and make the gold pop from `§1` and a legendary loot callout (`§1.6`) the loudest things on screen. Numbers are the running scoreboard of a fight — they should read like a slot machine paying out.

### 4.4 Camera and cursor

- **Smoother follow** with a slight look-ahead in the move direction, and an optional recenter key.
- **Cursor and target feedback.** A distinct attack-move cursor (the `A`-click mode already exists, `SPEC.md §9`), a target-ping ring when you issue a move or attack order, and a hover highlight on enemies.
- **Big-cast framing.** The camera push-in, slow-zoom, and screen-edge flash that sell a marquee ult are their own moment, owned by the Moment Director in `§4.6`.

### 4.5 Killfeed and milestones

Multi-kill and streak banners in the Dota register (Double Kill, Rampage) on rapid player kills, sharing the streak window with the gold loop (`§1.2`) so the audio, the gold pitch ladder, and the banner all escalate together. A compact killfeed line for notable kills (heroes, echoes, bosses).

### 4.6 Signature ultimate moments

An ultimate is the loudest thing a hero can say. When you land a Black Hole, an Echo Slam, a Ravage, or a Chronosphere, the whole machine should stop and acknowledge it across all three senses. This is the climax everything else builds toward, so it gets the fullest treatment — and it gets restraint, so it stays special.

- **Anticipation (the windup).** A big ult earns its payoff in the half-second before it fires. During the cast point, gather the effect inward: charge particles spiraling to the caster, a rising audio whoosh, a slight world dim and desaturation, the camera easing in. A telegraphed ult feels like a cannon; a flat one with no windup feels like a firecracker.
- **LOOK.** A screen-scale VFX crescendo keyed to the ult's identity (`SPEC.md §2` exotics and signature kits): Black Hole's vortex drags debris and units inward, Echo Slam erupts in a stone shockwave ring, Ravage tears tentacles up out of the ground in an expanding arc, Chronosphere drops a shimmering time-bubble that drains color inside it. Layer a bloom flare, a radial shockwave distortion pass, and a one-frame light bloom-out at impact. Per-ult signatures where they are worth it, a shared "big-cast" archetype for the rest.
- **SOUND.** A layered impact, not a single sample: a sub-bass drop you feel in the chest, a sharp transient at the hit, and a reverberant tail. Duck the music for a beat (sidechain) so the ult cuts through and the silence after it lands as hard as the boom. Each marquee ult gets its own voice — Black Hole sucks air inward, Echo Slam cracks, Chronosphere rings like struck glass.
- **FEEL.** Heavy screenshake trauma (`§4.1`) scaled to the ult, a render-only freeze-frame beat at the instant of impact (the sim keeps ticking underneath, per the `§4` determinism guardrail), a camera push-in and settle, and a brief impact hold on the very biggest casts. Time should feel like it dilates without the simulation ever slowing. The frame should feel like it got hit too.

**The Moment Director.** Route ultimates, legendary drops (`§1.5`), multi-kills (`§4.5`), boss deaths, and level-ups through one orchestrator that takes an intensity level and composes camera, sound, VFX, and time-feel from it. It owns an **impact budget**: the first ult in a chaotic teamfight gets the full crescendo, overlapping ones are dampened so five ults do not white out the screen, and everything is hard-capped by the reduced-motion and photosensitivity settings (`§7`). One director means every big beat in the game speaks the same escalating language as the reward loop in `§1`.

**Restraint.** Only true ultimates and game-swinging casts trigger the full treatment. Spammable abilities keep the normal cast feedback (`§2.4`, `§3.3`), or the screen becomes noise and nothing feels big. Scarcity is what makes a moment a moment.

### 4.7 Acceptance

Done when: a crit lands a big overshoot-scale number, a distinct crit sound, a starburst, and extra shake, all reading instantly as "that was a crit"; deaths shake the camera with magnitude-scaled trauma; enemies flash on hit and pop on death with a type-keyed effect; normal floating numbers scale with damage and stay readable in a flurry; a big ultimate telegraphs in its windup, erupts with a signature screen-scale VFX, ducks the music under a layered sub-bass impact, shakes and freeze-frames the screen, and pushes the camera, all through the Moment Director's impact budget; overlapping ults do not white out the screen; attack-move shows its own cursor and orders ping the ground; rapid kills raise a multi-kill banner in sync with the gold streak; reduced-motion and photosensitivity caps hard-limit shake, flash, and zoom; and the determinism hash tests are unchanged.

---

## 5. HUD REDESIGN

The HUD is clean and readable, which is the hard part. Now make it feel alive and look current. All of this is `hud.ts` + `styles.css`; no game logic moves.

### 5.1 Gold counter

The centerpiece of `§1`, restated for the HUD build: a coin icon, a count-up tween, a scale pop and gold flash on gain, and a streak multiplier badge. This is the first thing a player's eye goes to after a kill, so it gets the most polish.

### 5.2 Visual language

A modern dark-glass treatment: backdrop blur on panels, layered depth with soft shadows, a tighter type scale, and an accent system keyed to the active hero's attribute color. Keep the dark-fantasy palette already in `:root` (`styles.css:5-19`); add depth and motion to it rather than a new theme.

### 5.3 Bars and slots that animate

- **Health and mana** tween between values and leave a brief "ghost" trail on damage so you see the size of a hit. Threshold colors and a low-HP pulse with a screen-edge vignette.
- **Ability and item slots** get a real cooldown sweep (a conic-gradient wipe rather than a bottom-up bar, `hud.ts:247`), a ready-flash and ability-ready blip when a cooldown finishes, a clear mana-starved state (the `nomana` class exists, `styles.css:200`), and rich hover tooltips with values, cooldown, and lore. Item slots carry a **rarity-colored border** matching the drop tiers in `§1.5`, so a legendary reads at a glance in the bag, the shop, and the loot beam alike.
- **Party frames** (`hud.ts:172`): portrait with attribute ring, tweened bars, respawn sweep, status-icon row (stun, silence, key buffs), and a clear active-hero emphasis that reads at a glance.

### 5.4 Top bar, minimap, feeds

- **Top bar.** The day/night clock becomes a small sun/moon arc, the region gets a crest, earned badges show as a row, and the dense key-hint string (`hud.ts:129`) collapses into a toggleable help panel.
- **Minimap** (`renderMinimap`, `hud.ts:133`): rounded frame, glowing POI dots, a camera-viewport rectangle, a day/night tint, click-to-move and click-to-look, and ping support shared with `§4.4`.
- **Toasts and notifications** (`hud.ts:297`): iconography per type, celebratory styling for level-ups, badges, and loot drops, and a compact combat/killfeed lane that does not crowd the toasts.

### 5.5 Acceptance

Done when: the gold counter animates per `§1`; HP/mana bars tween with a damage ghost and low-HP vignette; ability/item slots show a cooldown sweep, ready-flash, and hover tooltips; party frames show status icons and respawn sweeps; the minimap supports click-to-move and a viewport rect; and the whole HUD respects the UI-scale and reduced-motion settings (`§7`).

---

## 6. MENU & TITLE REDESIGN

The first and last thing a player sees. Right now both are static cards (`title.ts`, `renderMenuModal` in `hud.ts:801`).

### 6.1 Title screen

A live 3D backdrop: a slow camera orbit of a hero on a moody, post-processed set piece behind the menu, using the same renderer the game uses, so the title sells the graphics work directly. Logo treatment with subtle motion, hover and click SFX from `§2`, and a starter pick that shows the **actual hero model** turning in 3D (`title.ts:59`) with an ability summary and a played voice/effort bark on hover instead of a flat 2D portrait.

### 6.2 Pause and settings

A modern settings surface (`§7`): a graphics quality tier selector, the audio mixer with live preview as you drag, accessibility controls, and save slots that carry a small thumbnail or a one-line state summary. Destructive actions (quit to title, overwrite save) get a confirm step.

### 6.3 Shop

Richer item cards (`renderShopModal`, `hud.ts:599`): larger icon, the stat lines and active description, a component/recipe tree that highlights what you already own and what the purchase completes, a search/filter box, and hover-to-compare against the active hero's current build. Every buy plays the gold loop in reverse — a satisfying "spend" cue distinct from the "earn" ring.

### 6.4 Acceptance

Done when: the title renders a live post-processed 3D backdrop with a rotating starter model and hover SFX; the settings surface exposes quality tier, the live audio mixer, and accessibility options; save slots show a state summary; the shop shows recipe trees with owned-component highlighting and a working filter; and buying plays a distinct spend cue.

---

## 7. SETTINGS, ACCESSIBILITY & PERFORMANCE

Everything above is opt-out-able and scalable. This is the control surface that keeps it that way.

### 7.1 Quality tiers

A `low / medium / high / ultra` tier (extending `PERFORMANCE_BUDGET`, `src/engine/performance.ts`) that controls post-processing passes, bloom resolution, shadow map size and type, ambient occlusion on/off, particle and transient-VFX caps, pixel-ratio clamp (`clampedPixelRatio` already exists), and weather density. Auto-downshift when frame time blows the budget, as `OPTIMIZATION_SPEC.md §B.5` specifies — this spec produces the knobs that section asked for.

### 7.2 Audio settings

Master, music, SFX, and ambience sliders (extending the three that exist, `hud.ts:831`), each driving its bus (`§2.1`), with live preview while dragging and a mute-on-blur toggle.

### 7.3 Accessibility

- **Reduced motion.** One toggle that disables screenshake, hitstop freeze-frames, camera punch, and big screen flashes, and shortens UI tweens. Wire it through `§1`, `§4`, and `§5`.
- **Photosensitivity.** A cap on bloom intensity and flash frequency/strength, on by default at a safe level.
- **Colorblind-safe damage.** Alternate floater and bar palettes so physical/magical/pure and ally/enemy stay distinct without relying on red/green (the damage colors live in `styles.css:289-295`).
- **UI scale** slider for the whole HUD, and a screenshake-intensity slider separate from the on/off toggle.

### 7.4 The core stays headless

Restate the contract from `SPEC.md §1.1`: none of this touches `/src/core/`. Settings live in `GameSave['settings']`, are read by the engine and UI, and never by the sim. The boundary test (`OPTIMIZATION_SPEC.md §4.5` / `src/test/boundary.test.ts`) must stay green, and the new settings fields round-trip through save/load.

### 7.5 Acceptance

Done when: switching quality tiers visibly changes the render and holds frame rate on each tier; auto-downshift triggers under a forced load; reduced-motion disables shake/hitstop/flash and the game stays fully playable; colorblind and UI-scale options apply live; settings persist through save/load; and the core boundary test is unchanged.

---

## 8. DEPENDENCIES & DECISIONS TO LOG

**Dependencies.** The post-processing stack, `RoomEnvironment`, `PMREMGenerator`, and the `Sky` shader all ship inside `three/examples/jsm` — no new package. Web Audio is native. A tiny tween/easing helper may be worth a small dependency or a hand-rolled util; decide and log it. Music may add a few small audio assets; if so, log them and keep the procedural path as the always-available fallback, matching `SPEC.md §9 Phase 5`'s asset philosophy.

**Log in `DECISIONS.md` as they land:**
- The post-processing pass list and the per-tier on/off matrix.
- That hitstop and all `§4` feel are render-only, with the sim left authoritative, and the determinism hashes that prove it.
- The `gold` event wiring (which reward paths emit it, the streak window length, the pitch-ladder step).
- The audio bus graph and the master limiter settings.
- Any music/SFX assets added and why synthesis was not enough there.
- Default quality tier per detected hardware, and the auto-downshift trigger.

---

## 9. PHASING & ACCEPTANCE

Ordered by perceived value against risk. Each step ships playable on its own.

1. **Reward dopamine — gold, last-hit, crit number (`§1.1-1.4`, `§4.3` numbers/sound).** Highest felt value, smallest blast radius, touches only the Game event layer, `audio.ts`, and the HUD. The coin loop, the last-hit crunch, and the crit big-number-plus-sound all live on the event/FCT/audio surface, so they ship together as the first felt win. Done when the gold and last-hit half of `§1.7` passes and crits land a big number and a distinct sound.
2. **Loot drops (`§1.5`, `§1.6`).** The drop event, rarity tiers, loot beams, rarity-scaled drop sounds, and the item-get moment. Lands right after the reward loop; the beams look best once bloom is in (phase 3) but work without it. Done when the loot half of `§1.7` passes.
3. **Audio system (`§2`).** The mixer, spatialization, music beds, and SFX depth that the reward sounds slot into. Done when `§2.5` passes.
4. **Post-processing + VFX glow (`§3.1`, `§3.3`).** The cheap, whole-frame visual lift. Bloom and tonemapping before materials and environment; this is also what makes the loot beams and crit starbursts sing. Done when the lighting half of `§3.6` passes; fold VFX pooling in from `OPTIMIZATION_SPEC.md §B.2`.
5. **Game feel — crit, impact & ultimate moments (`§4`).** Screenshake, freeze-frames, crit starbursts, the Moment Director, and signature ultimate crescendos with camera push-ins — all render-only, completing the crit treatment from phase 1. Done when `§4.7` passes with the determinism hashes intact.
6. **HUD redesign (`§5`).** The animated, modern overlay. Done when `§5.5` passes.
7. **Materials, environment, model fidelity (`§3.2`, `§3.4`, `§3.5`).** PBR, sky, water, weather, and the glTF starter pass — the higher-effort visual work, once the lens and feel are in.
8. **Menu, title, shop (`§6`) and settings/accessibility/tiers (`§7`).** The frame around it all, plus the controls that keep every prior step scalable and safe.

**The whole spec is done when:** earning gold, exploding a legendary out of a boss, landing a crit, and unleashing an ultimate are the most satisfying moments in the game; the frame glows and grades like a current release; hits land with shake, flash, big numbers, and layered sound; ults stop the room and engage every sense at once; the HUD and menus read as modern and animate on every meaningful change; every effect scales across quality tiers and respects accessibility; `npm test`, `npm run build`, and the browser smoke stay green; and the headless-core boundary and determinism tests are untouched.

---

## 10. PRINCIPLES

- **The core is sacred.** Presentation reads sim events and never writes sim state. Determinism and the boundary test are the contract (`SPEC.md §1.1`).
- **Engage every sense.** A big moment should LOOK, SOUND, and FEEL impressive at the same instant: VFX, layered audio, screenshake, and camera moving as one. A flash with no boom, or a boom with no shake, is a moment half-made.
- **Feel serves clarity.** Juice that obscures what happened is noise. Every flash, shake, and number should make the game more readable, not less.
- **Reward the player honestly.** The dopamine in `§1` and `§4.6` fires on real progress — gold earned, a clean last-hit, a legendary dropped, an ult that turns a fight. It amplifies the moment; it does not fake one.
- **Spend the big moments wisely.** Crescendos work because they are rare. Gate the full treatment to ultimates, legendaries, and game-swinging beats; let everything smaller stay quietly satisfying.
- **Scale gracefully.** Every visual and audio system has an off switch and a tier. The game must look great on a strong machine and stay smooth and playable on a weak one.
- **Accessibility from the start.** Reduced motion, photosensitivity caps, and colorblind-safe cues are built in, not bolted on.
- **Ship playable slices.** Each phase is felt the moment it lands. Start with gold.

