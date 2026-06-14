# VFX & Theme Completion Plan

This is the **graphics and theme completion plan**. Its sibling
`VFX_OVERHAUL.md` raised the procedural floor and is essentially done: every hero
has a hand-authored primitive likeness (122/122 profiles), every ability has
authored VFX (0/488 ride pure archetype defaults), attacks are weapon-driven,
icons and portraits are derived, and the scene runs the full post stack. This
plan covers the part that now matters most: making the whole game look like one
world.

Storage is no longer the design constraint. The target is a consistent stylized
fantasy RPG: readable Dota-like hero silhouettes, Pokemon-like region identity,
warm low-poly props, painterly VFX, and UI that feels carved into the same world.
The procedural boot floor still exists for reliability: the game plays with
`public/assets/` empty, every hero keeps its procedural rig, and `/src/core/`
never imports `three` or reads renderer-only fields.

---

## 0. Where we are today (measured from code, not the doc)

| Surface | State |
|---------|-------|
| Hero likeness profiles | **122 / 122** unique, no duplicates (`engine/models.ts`) |
| Hero models enabled | **122 / 122 visually enhanced** — 80 per-hero KayKit humanoid GLBs (`ENABLED_HERO_MODELS`), **all A4 tri-tone retextured** (texture-space palette gradient map, not a flat factor wash) **+ A5 per-hero proportions and innate identity overlays** so cohort siblings no longer share a body (`applyAuthoredSilhouette`), plus 31 creature-base heroes through shared Quaternius GLBs (`ENABLED_HERO_BASES` → `/assets/creeps/<base>.glb`), plus **11 A6 generated holdout signature GLBs** (`/assets/holdouts/<id>.glb`) mounted additively over the animated procedural rig (`attachHoldoutSignatureModel`). **No-budget policy** (DECISIONS 2026-06-13): one file per humanoid cohort hero, ~120MB total; creature heroes reuse the already-vendored creature GLBs |
| Hero weapons enabled | **80 / 80** authored humanoid heroes ship original generated held weapon GLBs (`/assets/weapons/heroes/<id>.glb`) attached through the resolved hand socket; item weapon visuals still override them |
| Ability VFX coverage | **488 / 488** authored; archetypes incl. `vortex`/`dome`/`mine`/`cyclone` |
| Attack animation | weapon-driven (`attackStyleFor`): 8 styles incl. `bird-dive`, `creature-lunge` |
| Cast/anim gestures | `AnimGesture` ×10, including `toggle-stance`; auto-resolved + hand-set on signatures |
| Item visuals | D1+D2 shipped, plus `cyclone` for Eul's/Wind Waker; `appearance` on **76+** items, `attackVisual` on **28+**; the remaining basics are intentionally invisible consumables/components (§6.1) |
| Creature GLBs | 20 Quaternius creatures vendored, mounted on creeps and the 31 creature-base heroes via the shared `mountHeroModel` + `animateAuthoredRig` path (not a static pose) |
| Env assets | terrain PBR (ambientCG), 2 HDRIs (Poly Haven) **both wired** — day + night beds swap by the cycle (`scene.applyEnvPhase`); original tiling water normal (`textures/water/water_normal.webp`) layered into the water shader; OFL display font (Cinzel) vendored + wired via `@font-face`; foliage + town (Quaternius) |
| VFX textures | original `/assets/vfx/vfx_atlas.webp` for sprites/telegraphs, preloaded on medium+ and backed by procedural `DataTexture` fallback |
| Audio | synth floor (`SoundArchetype` ×12, including `lightning`) **+ sampled enhancement layer**: `engine/sampled-audio.ts` decodes original per-biome music beds + one-shot SFX (`/assets/audio/*`), layered over the synth on medium+; synth stays the guaranteed fallback (boot floor / headless / missing file) |
| Pipeline | `build_assets.mjs` (resample/prune/dedup/meshopt/webp + **palette recolor: flat factor _and_ A4 `tritone` texture-space gradient map** + audio/font/vfx/holdout groups), generators (`generate_vfx_atlas`/`generate_water_normal`/`generate_audio`/`generate_holdout_signatures`), `assets.ts` + `sampled-audio.ts` loaders + fallback, `ASSETS.md` ledger, `manifest.json` |
| Visual target | coherent stylized fantasy theme across heroes, regions, VFX, items, UI, and audio |

---

## 1. Principles & constraints

- **Procedural is the floor, assets are the finish pass.** Every hero keeps its
  procedural rig as the live fallback (`mountHeroModel` hides, never disposes).
  A missing or slow asset never blocks play (scene-token guard in `scene.ts`).
- **Theme wins.** Pick assets because they belong together. Storage cost is
  secondary to silhouette, palette, material style, animation fit, and scene mood.
- **CC0 / original only.** Never Valve or Blizzard files. Heroes read through
  CC0 base meshes we retexture, generated pieces, bespoke pieces, or procedural
  overlays. Every shipped file still gets an `ASSETS.md` row.
- **Performance gates, not storage gates.** Low tier can stay procedural or use
  reduced assets. Medium and high tiers should load the art that makes the game
  feel complete. Use streaming, preloading, LOD, and cache policy to make that
  practical.
- **Closed vocabularies stay disciplined.** Item/spell visuals are pure data
  picked from existing kinds. A new enum value costs enum + renderer branch +
  lint entry + coverage test, landed only when nothing existing fits.
- **Every batch ships green:** `npm run typecheck && npm test && npm run build`,
  plus `assets:check` for any asset batch.

---

## 2. Art direction pivot: one world, many readable heroes

The game should read as one stylized fantasy RPG, not a bag of unrelated asset
packs. Shared bases still help, but the reason is visual consistency. A Knight,
Mage, Barbarian, Rogue, demon, wolf, golem, and spider can cover most of the
roster if they share the same proportions, material response, palette rules, and
animation language.

Theme rules:

1. **Stylized proportions.** Big heads, clear weapons, chunky shoulders, readable
   hands, and simple shapes. Avoid realistic scans and high-detail assets that
   fight the low-poly world.
2. **Shared material language.** Matte cloth, soft metal, readable emissive
   accents, and simple outlines through shape and lighting. Keep roughness and
   saturation in the same family across heroes, creeps, props, and items.
3. **Palette discipline.** Each hero gets one dominant identity color, one shadow
   color, and one accent color. Regions get their own palette beds, and local
   props should borrow from those beds.
4. **Readable silhouettes first.** At gameplay zoom, a hero should read by body
   mass, weapon, head shape, and one signature feature. Fine texture detail is a
   bonus.
5. **VFX as paint, not noise.** Big spells get clear shapes: rings, beams,
   domes, vortices, chains, mines, walls, and shields. Particles should support
   the shape instead of covering it.
6. **UI belongs to the world.** Icons, portraits, font, borders, and HUD accents
   should use the same carved-metal, parchment, gem, and elemental language as
   the scene.

Implementation:

1. **Ship shared base meshes** (KayKit humanoids + Quaternius creatures) and
   allow bespoke upgrades whenever a hero needs one to read correctly.
2. **Recolor at runtime.** The loader clones a base per hero and
   sets `baseColorFactor` on the cloned material from the hero's three-color
   `palette` (the same luminance/keyword mapping the build `recolorToPalette`
   uses, moved to a tiny runtime helper).
3. **Differentiate by weapon + likeness sockets.** A Knight-base and a
   Mage-base diverge by the generated weapon GLB attached to the hand socket and
   the procedural likeness overlay (eyes/horns/crest) re-parented to
   head/shoulder sockets.
4. **Use bespoke assets freely when theme demands it.** Raid bosses, Elite Five
   anchors, gym leaders, and abstract heroes can get custom GLBs, textures,
   portraits, and audio beds.

Implications for `assets.ts`:
- Track the humanoid body URL and generated `weaponUrl` together in the hero
  asset entry, while the broader `HERO_BASE` map still covers shared creature
  bases and procedural holdouts.
- Generated weapon GLBs are cached separately and mounted only after the hand
  socket resolves, so they stay optional and fallback-safe.
- Keep build-time recolor for heroes that earn a **bespoke** texture, especially
  raid leaders, iconic heroes, and region anchors.

The 6 starter files can stay as-is initially and migrate to the shared path in
Batch A0, or be rebuilt as the first shared-base consumers.

---

## 3. WS-A — Hero models (all 122)

Bases (download targets, all CC0):
- **KayKit Adventurers** (GitHub, vendored bases): `Knight`, `Mage`,
  `Barbarian`, `Rogue` (+ `Rogue_Hooded`). 76-clip universal rig, single atlas.
- **KayKit Skeletons / Halloween** (optional, CC0) for undead bases.
- **Quaternius** creatures (already vendored): `spider`, `dragonevolved`,
  `demon`, `wolf`, `giant`, `golelingevolved`, `goblin`, `velociraptor`, `bull`,
  `yeti`, `ghost`, `stag`, `frog`, `crabenemy`, …

### 3.1 KayKit Knight base — armored melee (17)
juggernaut ✓, sven, abaddon, dragon-knight, chaos-knight, legion-commander,
omniknight, dawnbreaker, kunkka, mars, wraith-king, chen, clockwerk, timbersaw,
slardar, faceless-void, pangolier

### 3.2 KayKit Mage base — robed caster (30)
crystal-maiden ✓, lich ✓, lina, zeus, witch-doctor, invoker, lion, rubick,
pugna, necrophos, death-prophet, disruptor, grimstroke, keeper-of-the-light,
shadow-shaman, silencer, skywrath-mage, outworld-destroyer, warlock, dark-seer,
dark-willow, enchantress, natures-prophet, queen-of-pain, storm-spirit,
vengeful-spirit, dazzle, arc-warden, razor, winter-wyvern

### 3.3 KayKit Barbarian base — brute (15)
pudge ✓, earthshaker ✓, lifestealer, undying, ogre-magi, bristleback,
troll-warlord, axe, magnus, brewmaster, alchemist, huskar, beastmaster, slark,
underlord

### 3.4 KayKit Rogue base — agile / ranged (18)
sniper ✓, mirana, drow-ranger, windranger, phantom-assassin, riki,
bounty-hunter, anti-mage, templar-assassin, clinkz, meepo, void-spirit,
ember-spirit, marci, phantom-lancer, monkey-king, luna (rider), bloodseeker

### 3.5 Quaternius creature bases (31)
| Creature | Heroes |
|----------|--------|
| `spider` | broodmother, weaver, nyx-assassin, sand-king |
| `dragonevolved` | jakiro, viper, puck |
| `demon` | doom, shadow-demon, shadow-fiend, night-stalker, terrorblade, visage |
| `wolf` | lycan |
| `giant` | tidehunter, primal-beast, ursa, treant-protector |
| `golelingevolved` (golem) | tiny, elder-titan, earth-spirit |
| `goblin` | techies, gyrocopter, tinker |
| `velociraptor` | venomancer, snapfire (mount) |
| `bull` | spirit-breaker, centaur-warrunner |
| `fox` | hoodwink |
| `yeti` | tusk |
| `ghost` | spectre |

### 3.6 Procedural-only holdouts (abstract / no-legs / elemental) (11)
io, enigma, morphling, bane, ancient-apparition, leshrac, phoenix, naga-siren,
medusa, batrider (imp-on-bat mount), lone-druid (hero stays procedural; bear
summon uses a creature base).
These keep their hand-tuned primitive rigs — a base mesh would read worse. A
bespoke generated GLB is a later, optional upgrade per hero.

> Base assignments are a starting recommendation; any hero can be re-pointed.
> Marquee heroes (gym leaders, Elite Five, raid chassis) are the first
> candidates for a **bespoke** retextured GLB over a shared base.

### 3.7 Batches
- **A0 — shared base + runtime recolor scaffolding. Shipped.** `HERO_BASE` maps
  all 122 heroes to a base (16 cohorts + 11 procedural
  holdouts), `recolorToPalette` tints a cloned base to a hero's three colors at
  runtime (materials cloned so cohort members don't share tint), and
  `HeroAssetLoader.loadBase` caches **per base** (≈16 loads for 122 heroes). The
  path is gated by `ENABLED_HERO_BASES` for creature bases, so it is 404-free
  today; humanoid cohorts ship per-hero retextured GLBs.
  Scene wiring is **done**: `scene.ts` prefers a per-hero GLB, then the shared
  base via `loadBase` → `recolorToPalette` → `mountHeroModel`, then procedural
  (creature-base heroes already mount through this path). The humanoid shared-base
  GLBs under `/assets/bases` stay optional since cohorts ship per-hero files.
  Gate: model-cache base-coverage + recolor tests — green.
- **A1+A2 — Knight + Mage + Barbarian + Rogue cohorts (80 heroes). SHIPPED.**
  No-budget policy: instead of one shared base recolored at runtime, every cohort
  hero ships its own retextured CC0 GLB (`heroes/<id>.glb`, ~118MB total). The spec
  (`scripts/assets/specs/heroes.json`) is generated from hero data — palette →
  build recolor, `baseStats.attackRange` → melee/ranged/spell attack clip — and
  `ENABLED_HERO_MODELS`/`PHASE5_STARTER_ASSETS` derive from `HERO_COHORTS ∩
  ENABLED_HERO_COHORTS`. Reuses the proven `heroAssetEntry → mountHeroModel` path;
  procedural fallback intact.
- **A3 — creature cohort (31 heroes). SHIPPED.** The shared-base loader now maps
  creature hero bases directly to existing Quaternius files in `/assets/creeps`
  (`spider`, `demon`, `dragonevolved`, `bull`, etc.). These heroes stay off the
  per-hero `heroAssetEntry` path and mount through `ENABLED_HERO_BASES`, with
  procedural fallback intact.
- **A4 — multi-tone retextures. SHIPPED for the full cohort (all 80).** A build
  mode `recolorMode: "tritone"` (`build_assets.mjs`) gradient-maps each base atlas
  in **texture space** — the source atlas's own per-pixel luminance drives a
  three-stop ramp (shadow→secondary, midtone→primary, highlight→accent) and the
  material factor is neutralized to white. This replaces the flat single-tone wash
  (the old §12 risk) with genuine multi-tone heroes **without hand-painting**,
  fully deterministic. Every Knight/Mage/Barbarian/Rogue cohort hero in
  `heroes.json` now carries `recolorMode: "tritone"`, so each ships its three-color
  identity as shadow/body/trim tones (verified across icy casters, red brutes,
  gold/green/orange leads). The legacy uniform-factor path stays in the script as a
  fallback. A truly hand-painted atlas per marquee hero remains an optional further
  upgrade on top of this generated path.
- **A5 — within-cohort silhouette variation + marquee identity. SHIPPED.** Tri-tone
  retexture differentiates cohort siblings by color, but a Knight-base Juggernaut and
  Sven still shared one mesh, one animation set, and one body. `applyAuthoredSilhouette`
  (`engine/models.ts`, called from `scene.ts` after `mountHeroModel`, gated to the
  humanoid GLB cohort) closes that gap with two fully procedural, headless-safe passes:
  (1) **per-hero proportions** — a cohort baseline (knights broad, barbarians broadest,
  mages slim, rogues short/lean) plus a hand-authored override table for every marquee
  hero (raid chassis, Elite Five / Champion, gym aces) non-uniformly scales the mounted
  model and re-seats the feet, so Pudge reads massive, Sniper dwarfen, Wraith-King towering;
  (2) **innate identity overlays** — crown / horns / antlers / wings / cape / halo / tusks
  re-derived from each hero's likeness `features` and parented **visible** over the authored
  body (the head/back re-parent upgrade WS-B §4 reserved for GLB heroes). Marquee heroes
  carry the richest feature lists, so they get the richest overlays for free. No new art,
  no new files, palette-driven primitives only. Gate: `model-cache` proportions + overlay +
  idempotency + no-model-safe + full-cohort render smoke — green.
- **A6 — procedural holdout signature GLBs. SHIPPED.** io, enigma, morphling,
  phoenix, etc. already ship hand-tuned **animated** procedural rigs; replacing them
  with primitive static GLBs would regress motion. Instead,
  `generate_holdout_signatures.mjs` writes 11 original low-poly signature kits under
  `/assets/holdouts/<id>.glb` (148KB total), `main.ts` preloads that tiny `holdout`
  group on enhanced tiers, and `scene.ts` loads them through the existing
  fallback-safe `loadModelAsset` path, mounting them with
  `attachHoldoutSignatureModel` **additively** over the animated rig. The result is
  bespoke silhouette/identity art for all holdouts without losing animation or
  blocking no-asset boot. A future commissioned/DCC-authored **rigged + animated**
  replacement model can still supersede any individual holdout later.

---

## 4. WS-B — Sockets & attachments — **shipped**

`mountHeroModel` now resolves named sockets and re-homes worn gear so item geo
rides the authored model instead of the hidden procedural rig.

1. **Named sockets resolved (done).** `resolveSockets` walks the mounted GLB and
   matches `weapon`/`head`/`back`/`shoulder` by normalized bone-name fragments
   (KayKit/Quaternius/Mixamo naming, right-hand wins for the weapon); resolved
   points are exposed on `UnitRig.sockets`.
2. **Worn weapon rides the hand (done).** The resolved weapon bone becomes the
   `rightHand` target, and `replaceWeapon` counter-scales the weapon by the model
   height-fit factor so it sits at rig size on the GLB hand. The scene re-applies
   `applyItemAppearances` after a mount so the weapon re-homes off the hidden
   procedural arm.
3. **Per-hero weapon GLBs (done).** `scripts/assets/generate_hero_weapons.mjs`
   writes 80 original low-poly held weapons under
   `/assets/weapons/heroes/<id>.glb`; `HeroAssetLoader.loadHeroWeapon` mounts
   them as default socket weapons, and item weapons still take precedence.
4. **Likeness policy (done):** for the enabled GLB heroes the authored model is
   the likeness, so the procedural overlay stays hidden. If future shared bases
   need extra horns, crowns, or shoulder pieces, those parts can be re-parented to
   the existing head/shoulder sockets without changing the sim path.
5. **Fallback intact:** with no GLB, or a base that exposes no matching bone, the
   weapon falls back to the right hand / item layer (always visible) and nothing
   throws.

Gate: model-cache socket test (resolve + counter-scale + no-bone fallback + generated weapon override/restore) — green.

---

## 5. WS-C — Animations

Attack windups are weapon-driven and feel-locked. Authored model clips are wired:

- **Humanoid clip map (done):** the KayKit 76-clip set is renamed down to
  `idle/run/attack/cast/channel/death`, choosing melee vs ranged vs spell
  `attack` by `silhouette.weapon`. The `heroes.json` pattern covers all 80
  humanoid cohort heroes.
- **Creature clips (already wired):** creeps mount their Quaternius GLB through
  `mountHeroModel` with `asset.animations`, so they get a mixer, and
  `animateAuthoredRig` drives `idle/run/attack/cast/channel/death` off sim state
  for **any** rig with a mixer — the `findClip` synonyms already cover
  `Idle`/`Walk`/`Attack`/`Death`/`bite`/`claw`. Creeps and creature-base heroes
  animate off sim state today (not a static pose). Per-base clip-name overrides
  can be added if a future GLB ships unusual clip names.
- **Cast/channel coupling (done):** when a GLB has a spell clip,
  `animateAuthoredRig` fires it during cast windows and loops `channel` while
  channeling. Toggle-style casts use `toggle-stance`.
- **Toggle stance (done):** `AnimGesture` includes `toggle-stance` for
  Berserker's Rage, Pulse Nova, Metamorphosis-style self buffs, and future held
  stance ultimates.

Gate: `movement`, `kit-smoke`, anim coverage, mixer smoke.

---

## 6. WS-D — Item visuals (all 145)

Today 81/145 carry visuals. The remaining **64** split by intent:

### 6.1 Intentionally invisible (no work) — ~52
- **Consumables (9):** tango, salve, clarity, dust, wards, smoke, refresher
  shard, cheese. (Wards already place a `ward`-build unit; no held geo.)
- **Components (43):** raw stat parts (branches, circlets, gauntlets, recipes).
  Policy: components never show; only **built** items change the hero. This is
  deliberate to avoid clutter and is the existing convention.

### 6.2 Core / build-defining items — D1 shipped
Pure data using existing `appearance` parts / `attackVisual` kinds / `aura`;
coverage is now enforced at **65+** appearances and **25+** attack visuals:

| Item | Target appearance / attackVisual |
|------|----------------------------------|
| black-king-bar | gold `shield` aura (BKB glow) |
| blink-dagger | `blink` mark (event exists; add worn dagger geo) |
| manta-style | illusion `summon-pop` on cast |
| euls-scepter / wind-waker | `cyclone` lift VFX (new `cyclone` kind candidate) |
| glimmer-cape | shimmer `aura` + cloak part (new `cloak` part candidate) |
| mekansm / guardian-greaves | heal `ground-aoe` burst on active |
| diffusal-blade | frost `tinted-impact`, `elementOnHit: cryo` |
| refresher-orb | `shield` recharge flash on cast |
| aeon-disk / eternal-shroud | low-HP `shield` burst |
| hood-of-defiance | magic-resist `aura` (already has parts; add aura) |
| orchid-malevolence / bloodthorn | silence `global-mark` on target |
| solar-crest | `armor-shred-flash` (or `tinted-impact`) |
| spirit-vessel / urn-of-shadows | DoT `aura` orb |
| holy-locket | gold heal `aura` (new `halo` part candidate) |
| helm-of-dominator / overlord | dominate `summon-pop` on cast |
| veil-of-discord | `dome`/`ground-aoe` amp zone |
| rod-of-atos | root `chain` tether |
| dagon | red `beam` nuke (`global-mark` charge) |
| hand-of-midas | gold `summon-pop` flash |
| aether-lens | `mana-orb` part + range glow |
| mask-of-madness | red `shield` berserk aura |
| kaya-and-sange / yasha-and-kaya | `glowing-blade` weapon tint |
| vladmirs-offering | team lifesteal `aura` |

### 6.3 Small basics that should show (~6)
bracer / wraith-band / null-talisman (small wrist geo), magic-wand (charge
glow), arcane-boots (`boot-trail`, partly present), medallion-of-courage
(`pauldrons`). **Shipped in D1/D2.**

### 6.4 New `ItemAppearancePart` / kind candidates (shipped)
`cloak` (Glimmer/Force), `halo` (Holy Locket/Guardian), `cyclone`
(Eul's/Wind Waker), and `armor-shred-flash` (`AttackVisualKind`, Desolator/
Solar/Nullifier) are all landed. `cyclone` is now its own `VfxArchetype`, so
Eul's and Wind Waker read as a vertical lift instead of a generic storm burst.

Gate: appearance/attack coverage lint widened, boundary, kit-smoke on actives.

---

## 7. WS-E — VFX texture assets

Today particles and telegraphs are procedural `DataTexture`s (boot-safe). Real
sprite atlases raise fidelity on medium+ tiers:

- **Particle sprites** (Kenney Particle Pack, CC0, or generated): ember, snow,
  shard, smoke, soft — replace/augment `particleSprite(...)`. Loaded as a single
  atlas; procedural stays the fallback when absent.
- **Telegraph decals** (generated): spiked ring (stun), hatched line (wall),
  dotted (mine), plain ring — swap into `telegraphTexture(...)` by archetype.
- **Trail/beam gradients** for projectiles and beams (1-D ramps).

Shipped: medium+ preloads `/assets/vfx/vfx_atlas.webp` during the loading screen
and slices it into four sprite cells plus four telegraph cells. The atlas is
original/generated in-repo and logged in `ASSETS.md`; missing files or headless
tests keep using procedural `DataTexture`s. The final `cyclone` archetype is
landed, `channel` has a distinct vertical cast read, projectile objects and burst
rings/sparks are pooled, and coverage is complete. All additive, tier-gated, off
on low. Gate: perf harness, no-asset boot, theme fit.

**Attack-VFX polish pass (latest).** `lightning-bounce` now renders as a soft
additive **ribbon** (`lightningRibbon`, alpha-ramped) instead of the old flat
`THREE.Line`, plus a short **forked branch** off the midpoint for an electric-arc
read. Ground **impact decals** were added to `cleave-sweep`, `ranged-conversion`
(attack beam), and `lightning-bounce` so every attack visual now leaves a tinted
additive ground mark. Headless-safe (DataTexture geometry only); the transient
cap auto-trims. Gate: `vfx-cache` (lightning-is-ribbon-not-line + two-ribbon fork
+ cleave/beam decals) — green.

---

## 8. WS-F — Audio — **shipped**

Synth path is complete and stays the floor (test-21 no-raw-import guard protects
it). The sampled-audio enhancement layer now ships:

- **Sampled-audio loader (done).** `engine/sampled-audio.ts` (`SampledAudioBank`)
  fetches + `decodeAudioData`s small original WAVs under `/assets/audio` into
  `AudioBuffer`s. Boot-safe: no `fetch`/`AudioContext` (headless), a missing
  file, or a decode failure returns `null` and the synth owns the cue. No asset
  is imported — URLs are runtime strings, so the no-asset-import guard stays green.
- **Music beds (done).** One seamlessly-looping ambient bed per biome
  (`generate_audio.mjs`, original). `ProceduralAudio.update` crossfades the bed
  in and ducks the synth drone; on biome change it swaps beds; with no file the
  synth drone is unchanged. Gated to medium+ via `Game` → `enableSampledAudio`.
- **Sampled SFX (done).** `crit`, `impact-heavy`, `fanfare`, `whoosh` layered
  over the synth on crits, big physical hits, celebratory stingers, and
  big-shape spell casts; pooled/throttled by the existing voice logic.
- **Signature `sound` reassignment (already in data).** Hero kits already carry
  explicit signatures — `roar` (STR ults, e.g. ursa-enrage/sven), `void` (portal
  kits, e.g. enigma-black-hole), `frost` (cryo, e.g. lich) — with `soundForAbility`
  inference covering the rest. Verified across the roster by audio test 20.
- **New `SoundArchetype` `lightning` (done).** Electric chain signatures and
  lightning items now resolve to `lightning`, while `storm` remains the broader
  wind/cloud voice.

Gate: voice-pool cap, no-raw-import on synth, sampled-layer headless safety
(audio test 20b), audio-channel mix test, theme fit — green.

---

## 9. WS-G — Scene / environment assets — **shipped**

Terrain PBR, foliage, and town were already done; the remaining art is now wired:

- **Water normal map (done).** Original seamless tiling normal
  (`textures/water/water_normal.webp`, `generate_water_normal.mjs`) sampled by
  the terrain water shader as two scrolling layers for a moving specular
  sparkle. `uHasNormal` stays 0 until it loads, so the procedural summed-sine
  ripple is the floor.
- **Day/night HDRIs (done).** Both vendored beds are now used: `scene` loads the
  day + night HDRIs into PMREM env maps and `applyEnvPhase` swaps the assigned
  IBL when the cycle crosses day↔night (a reference swap, never a reload). The
  neutral RoomEnvironment fill stays until a real HDRI loads.
- **Display font (done).** Cinzel (OFL) vendored under `ui/fonts/` and wired via
  `@font-face` (`font-display: swap`); `--font-display` already referenced it, so
  headings now render engraved with a serif fallback covering the load.
- **Props / set dressing (done).** A deterministic `InstancedMesh` standing-stone
  ring now dresses the shrine; foliage/rocks/town buildings already instance
  authored GLBs over their procedural placements.

Gate: perf harness, scene-token guard, biome theme smoke — green.

---

## 10. Theme gate & provenance

The acceptance gate is visual consistency. A batch is ready when it makes the
game feel more like one place.

| Surface | Theme target |
|---------|--------------|
| Heroes | Same stylized proportions, strong silhouette, one dominant identity color, one signature prop or body feature |
| Creeps | Same creature family language as heroes: chunky forms, readable heads, simple attacks, region-appropriate tint |
| Items | Visible built items should look enchanted, worn, or weaponized; components can stay invisible |
| VFX | Shape first, particles second. Every large spell should leave a clear ring, beam, dome, wall, chain, vortex, mine, or shield read |
| Regions | Each biome gets a palette bed, sky mood, terrain texture, prop kit, and music bed |
| UI | Icons, portraits, font, border treatment, and HUD accents should match the carved fantasy world |
| Audio | Synth remains the fallback. Sampled beds and hits should reinforce biome, boss, and element identity |

Every shipped file still needs a source, license, and manifest entry in
`ASSETS.md`. That ledger protects provenance, not storage limits. Remote assets
are fine when they improve the theme and load safely.

---

## 11. Delivery batches (each ships green)

0. **A0** — shared base + runtime recolor + `HERO_BASE` map. **Shipped.**
   The map, `recolorToPalette`, per-base cache, scene fallback, and creature
   base wiring are live.
1. **A1** — Knight + Mage cohorts (47). **Shipped** as per-hero tri-tone GLBs.
2. **B**  — sockets + weapon attachment + re-parenting policy. **Shipped**
   (socket resolve, weapon re-home + counter-scale, scene re-apply, generated
   per-hero weapon GLBs).
3. **A2** — Barbarian + Rogue cohorts (33). **Shipped** as per-hero tri-tone GLBs.
4. **C-creatures** — creature clip wiring. **Shipped** (shared
   `mountHeroModel` + `animateAuthoredRig` already drives creeps/creatures off sim
   state). Per-base clip-name overrides are available for future unusual GLBs.
5. **A3** — creature-base heroes (31). **Shipped** by reusing the vendored
   Quaternius creature GLBs through `ENABLED_HERO_BASES`.
6. **D1** — core item visuals (the ~29), widen coverage lint. **Shipped.**
7. **D2** — small basics + any costed new part/kind. **Shipped.**
8. **E**  — VFX sprite + telegraph texture atlas. **Shipped** (atlas vendored,
   preloaded on medium+, and wired with procedural fallback).
9. **F1** — sampled-audio loader + music beds. **Shipped** (`sampled-audio.ts`
   loader + tier gating + original generated beds/SFX; synth stays the floor).
10. **F2** — signature `sound` reassignments (pure data). **Shipped** (present in
    hero kits + inference; verified by audio test 20).
11. **G**  — water normals, day/night HDRIs, font, prop dressing. **Shipped**
    (all generated/vendored + wired; procedural floor intact).
12. **A4** — multi-tone hero retextures. **SHIPPED (all 80 cohort heroes).** The
    `recolorMode: "tritone"` build mode gradient-maps each base atlas in texture
    space for a real multi-tone read (no hand-painting); every Knight/Mage/
    Barbarian/Rogue hero in `heroes.json` is on it and rebuilt. A hand-painted
    per-hero atlas remains an optional upgrade on top.
13. **Final vocabulary pass** — `cyclone` VFX, `lightning` sound, and
    `toggle-stance` gesture. **Shipped.** Eul's/Wind Waker, electric chain
    signatures, and held stance casts now use distinct closed-vocabulary entries.
14. **A5** — within-cohort silhouette variation + marquee identity. **Shipped.**
    `applyAuthoredSilhouette` gives every authored humanoid per-hero proportions
    (cohort baseline + marquee override table) and re-derives innate identity gear
    (crown/horns/wings/cape/halo) from each hero's likeness `features`, parented
    visible over the GLB body. Pure procedural, no new files.
15. **A6** — generated holdout signature GLBs. **Shipped.** The 11 animated
    procedural holdouts keep their rig motion, but now mount original additive
    signature GLBs from `/assets/holdouts/<id>.glb` (wisp tethers, void ring,
    water crest, firebird wings, gorgon snakes, etc.) via `attachHoldoutSignatureModel`.
    The manifest tracks a `holdout` group, medium+ preloads those 11 tiny files, and
    no-asset boot remains intact.

> **Status: every required workstream in this plan is shipped and green,
> including the final vocabulary pass and the follow-up VFX polish pass.**
> All 80 cohort heroes now ship a tri-tone texture-space retexture (their
> three-color identity as shadow/body/trim) **plus A5 per-hero proportions and
> innate identity overlays so cohort siblings read distinct**, 31 creature-base
> heroes reuse the Quaternius GLBs, and 11 abstract heroes keep their animated
> procedural rigs **plus A6 generated additive signature GLBs** — 122/122 visually
> enhanced.
> The VFX atlas is preloaded on medium+, burst transients are pooled, and
> `channel`/`cyclone` have distinct reads. The only further upgrades are
> commissioned / DCC-authored custom art: hand-painted bespoke atlases for marquee
> heroes, animated boot motion trails, trail/beam ramp textures if profiling asks
> for them, or **rigged + animated** bespoke replacement models for the 11 holdouts.
> Rebuild any
> hero from the raw CC0 pack (`tmp/asset_src/kaykit`, gitignored); the procedural
> floor stays the live fallback throughout.

Procedural batches and asset batches run in parallel: the floor never depends on
an asset landing.

---

## 12. Risks

- **Style drift from mixed asset packs.** Mitigated by the theme gate (§10).
  Every imported asset should match the stylized proportions, palette, material
  response, and region mood before it lands.
- **Socket mismatch.** KayKit hand/back bone names must be resolved defensively;
  missing socket → attach to rig root (today's behavior), never throw.
- **Single-atlas recolor reads flat.** Resolved: all 80 cohort heroes ship the A4
  `tritone` build mode (texture-space gradient map, shadow/midtone/highlight →
  palette) instead of a uniform factor tint — multi-tone, generated, no
  hand-painting. The flat-factor path is kept only as a script fallback.
- **Cohort siblings share one body.** Resolved (A5): tri-tone fixed color, and
  `applyAuthoredSilhouette` now fixes shape — per-hero proportions + innate identity
  overlays so same-base heroes read distinct at gameplay zoom without new art. A
  hand-painted/rigged bespoke per marquee hero is still an optional upgrade on top.
- **Static holdout GLBs could regress animation.** Resolved (A6): generated holdout
  GLBs are additive signature kits mounted over the procedural rig, never replacement
  rigs. The animated primitive body stays live and missing files simply keep the old
  procedural-only read.
- **Creature clip pollution / determinism.** Clip wiring is renderer-side only;
  the sim/feel and macro/determinism tests must not move.
- **Test isolation.** A pre-existing cross-file `REG`-state race can flake the
  loot suite under parallel workers; harden fixtures before adding asset tests
  that reshuffle ordering.
- **Boundary + boot floor stay non-negotiable.** Core never reads
  `appearance`/`attackVisual`; low tier + asset-absent path keep booting.
