# VFX & Visuals Overhaul Plan

Goal: now that the roster (122 heroes) and the item catalog are mechanically
complete, make the whole thing **look** finished. Push every hero, spell, and
item from "lint-valid placeholder" to "reads like its Dota counterpart at
gameplay zoom."

Two levers do this work together:

1. **Author the procedural detail** the auto-resolver leaves generic: per-hero
   likeness, per-spell VFX, weapon-driven attacks, plus a few scoped engine
   extensions.
2. **Bring in real assets** (downloaded, imported, or generated) wherever a
   model, texture, HDRI, sprite, or sound reaches a fidelity that primitives
   cannot. Procedural is the floor that always boots. Real assets are the
   ceiling, and this plan raises it on purpose.

The constraints that still hold:

- **Procedural stays as the fallback floor.** The game boots and plays with zero
  asset files, and every hero keeps a procedural rig. That guarantee stays. On
  top of it, adding assets is encouraged: flip `ENABLED_HERO_MODELS` on as GLBs
  ship, load texture/HDRI/sprite sets, and lazy-load the heavy pieces. Whether an
  asset is local or remote is a performance call (§4a), and storage size is a
  budget line, not a reason to avoid an asset.
- **Boundary stays clean.** Nothing under `/src/core/` imports `three` or reads
  the renderer-only `appearance`/`attackVisual` fields (`boundary.test.ts`).
- **Closed vocabularies stay disciplined.** Most new visual content is pure data
  picked from the existing vocabularies. New vocabulary entries stay rare,
  costed, and lint-gated (§3, §11). Real assets are a separate lever: a GLB or a
  texture raises fidelity without adding a vocabulary entry.
- **Tier-gated + perf-bounded.** Every addition respects the performance budget
  (30 active units / 200 live projectiles, `maxPixelRatio ≤ 2`) and degrades on
  the low tier. Assets load per-tier, so the low tier can stay fully procedural.

---

## 1. Where the visuals are today

Six procedural subsystems, all file-free, all driven by sim events + data:

| Subsystem | File | What it does | Coverage today |
|-----------|------|--------------|----------------|
| Unit models | `engine/models.ts` | `buildUnitRig` builds a primitive body from `SilhouetteSpec`; `applyHeroLikeness` bolts on recognizable detail meshes; `applyItemAppearances` swaps weapons / adds parts/tints/auras | **31 / 122** heroes have a hand-built likeness switch case; the other ~91 get only the generic silhouette |
| Animation | `engine/animator.ts` | Procedural pose layers keyed off sim state. Cast = one of 9 `AnimGesture` poses (shaped by `animProfile.castStyle` + silhouette weight); attack = windup driven by `attackPoint`/BAT; also a GLB mixer/clip path | Cast auto-resolves for all; attack has **4** bespoke heroId branches (earthshaker/pudge/sniper/juggernaut), everything else is one weighted generic strike |
| Spell VFX | `engine/vfx.ts` | 12 `VfxArchetype` builders (projectile, ground-aoe, chain, beam, summon-pop, shield, stun-stars, channel, global-mark, hook, wall, storm), pooled projectiles, zone telegraphs, 5 `AttackVisualKind` builders, reaction palettes | Every ability is valid; most signature spells **share** a generic archetype treatment with only color/scale to tell them apart |
| Icons | `engine/icons.ts` | Canvas-drawn glyph per `VfxArchetype` (abilities) + a glyph vocabulary for items; 2D hero portraits (palette + letter) | One glyph per archetype → every "projectile" ability has the **same** icon; portraits are crude |
| Audio | `engine/audio.ts` | Synth cast voice per `SoundArchetype` × owner timbre, per-hit impacts, stingers, biome music bed | Complete; signature casts could pick a better-fitting archetype |
| Scene/post | `engine/scene.ts` + `performance.ts` | EffectComposer: ACES tonemap → UnrealBloom → grade/vignette → OutputPass → SMAA; `RoomEnvironment` IBL fill; PBR materials; in-scene detail/bump map | Strong baseline; per-element grading, rim light, and texture variety are thin |

### The closed vocabularies (what is free vs. what costs engine work)

Picking from these is **pure data (free)**. Adding an entry costs one enum +
one renderer/synth branch + one lint-array entry + one coverage test (§11).

- `VfxArchetype` — 12 (`types.ts` → `engine/vfx.ts`)
- `AnimGesture` — 9 (`types.ts` → `engine/animator.ts`)
- `SoundArchetype` — 11 (`types.ts` → `engine/audio.ts`)
- `AttackVisualKind` — 5 (`types.ts` → `engine/vfx.ts`/`animator.ts`)
- `SilhouetteSpec` — build ×7, bodyShape ×3, head ×6, weapon ×7, extras ×8
- `ItemWeaponVisualKind` (+4 over weapons), `ItemAppearancePart` ×8, item glyphs

---

## 2. The gap, stated plainly

Everything is lint-valid, so the failure mode is **sameness**, not breakage:

1. **~91 heroes have generic bodies.** A Dota player can't pick Bristleback out
   of a lineup of brutes, or Puck out of the casters. Likeness profiles are the
   single highest-payoff visual fix.
2. **Signature spells under-read.** Black Hole, Chronosphere, Ravage, Reverse
   Polarity, Requiem, Epicenter, Sun Strike, Ball Lightning, etc. all map onto
   `storm`/`global-mark`/`ground-aoe` with no shape that says "this is *that*
   spell."
3. **Attacks all swing the same.** A rifle, a cleaver, a staff, and a hook all
   play the same generic windup outside the 4 hand-coded heroes.
4. **Icons don't distinguish abilities.** Every chain spell shares the chain
   glyph; the HUD is a wall of repeated symbols.
5. **Items are mostly invisible.** Only the ≥6 lint-floor items show on the
   model or change the attack; the other ~190 are stat sticks.
6. **The frame is flat-ish.** Good post stack, but no per-element color grading,
   weak rim/fresnel, one telegraph texture, one spark sprite.

---

## 3. Strategy & principles

- **Data first, engine second.** Most of the fix is authoring `silhouette`,
  `vfx` color/scale, `anim`, `sound`, `appearance`, and `attackVisual` data, plus
  new `HERO_LIKENESS_PROFILES` entries (data + a geometry switch case). Reach for
  a new vocabulary entry only when §11's bar is met.
- **Make the renderer derive more, so data does less.** Where a per-hero hand
  branch exists today (attack animation), replace it with a rule keyed off the
  data the hero already has (weapon kind, silhouette weight). One engine change
  upgrades all 122 heroes at once (§6).
- **Signature, not uniform.** Spend the hand-authoring budget on the ~40 spells
  and ~30 items a Dota player would immediately recognize; let the rest ride the
  (now richer) archetype defaults.
- **Match the tool to the fidelity target.** Primitives and procedural detail
  get every hero to "recognizable" cheaply and offline, so they do the bulk of
  the roster. When a hero, prop, or texture needs to cross from recognizable to
  genuinely good, bring in a real asset (a CC0 download, an import, or a
  generated one) instead of stacking more primitives. Keep the procedural
  version as the fallback so a missing or slow asset never blocks play (§4a, §18).
- **Every batch ships green.** `npm run typecheck && npm test && npm run build`
  after each batch. Presentation is lint-gated (tests 19–21, appearance/attack
  coverage, boundary, exotic budget, no-asset guards) — treat those as the bar.
- **Tier-gated and bounded.** New particles/passes obey `performance.ts` tiers
  and the perf budget; the low tier loses the extras, never the readability.

---

## 4. Workstreams (overview)

| WS | Title | Primary files | Type | Payoff |
|----|-------|---------------|------|--------|
| A | Hero likeness profiles (the ~91 missing) | `models.ts` (+ lint) | data + geometry | ★★★★★ |
| B | Signature spell VFX treatments | `vfx.ts`, hero data | data + few branches | ★★★★★ |
| C | Cast-animation polish | hero data `anim`, `animator.ts` | data + small engine | ★★★ |
| D | Attack-animation rework (weapon-driven) | `animator.ts` | engine | ★★★★ |
| E | Item appearance + attackVisual expansion | item data, `models.ts` | data | ★★★★ |
| F | Icons + portraits | `icons.ts`, types | data + engine | ★★★ |
| G | New vocabulary entries (vortex/dome/mine, gun/mount, shred-flash) | `types.ts` + renderers + lint | engine | ★★ |
| H | Scene / material / texture polish | `scene.ts`, `terrain.ts`, `performance.ts` | engine | ★★★ |
| I | Audio tie-ins (optional) | `audio.ts` | data + small engine | ★ |
| J | Asset acquisition, generation & import pipeline | `assets.ts`, build scripts, `public/assets/` | tooling + assets | ★★★★ |

WS-J is the new lever this revision adds. It is detailed in §18, and it feeds A,
E, H, and I: real GLBs upgrade likeness, texture/sprite sets upgrade items and
the frame, HDRIs and music beds upgrade the scene and audio.

---

## 4a. Local vs. remote is a performance decision

Where an asset lives is a question about load time and the perf budget, not about
saving disk. Decide per asset with three questions:

1. **Is it on the boot path?** Anything needed to render the town, the starter
   heroes, and the active region ships **local** (committed under
   `public/assets/`, bundled at build). Local means zero network latency and full
   offline play.
2. **Is it big and optional?** Marquee GLBs, raid-boss models, high-res HDRIs, and
   alternate texture tiers can load **remote** (a CDN or release bucket), fetched
   lazily on first use and cached. Remote keeps the initial download small and
   the repo lean while still raising fidelity for players who reach that content.
3. **What tier is the player on?** The low tier loads neither the heavy local nor
   the remote extras and stays procedural. Medium loads local. High/ultra may
   pull remote upgrades.

Rules that make this safe:

- **Procedural fallback is always wired** behind both paths. A failed or slow
  fetch falls back to the local asset; a missing local asset falls back to
  procedural. Play never blocks on a load (the existing scene-token guard in
  `scene.ts` already invalidates stale async loads).
- **Budget is explicit, not zero.** Per `DECISIONS` §13.5 the committed budget is
  ~60–90 MB, tier-gated. Remote assets sit outside that and carry their own
  size/latency budget. Track both in `ASSETS.md`.
- **Provenance is tracked.** Every shipped asset (local or remote) gets an
  `ASSETS.md` row: source, license (CC0 or original/generated), and which
  manifest entry references it. An asset with no row fails review.

---

## 5. WS-A — Hero likeness profiles

**The big one.** `applyHeroLikeness(rig, heroId)` runs for every hero but only
has switch cases for 31; the rest fall through to the base silhouette. Goal:
bring all 122 to a recognizable read.

Per hero the work is:

1. Add a `HERO_LIKENESS_PROFILES` entry: `{ heroId, readsAs, features[≥4] }`
   (this is the spec/contract and is lint-checked for the starters).
2. Add a matching `case` in `applyHeroLikeness` that bolts the features on with
   the existing primitive helpers (`box`/`sphere`/`cone`/`cyl`/`torus`/`eyes`),
   palette-driven, scaled by `rig.scale`. Glowing `eyes(...)` is the strongest
   single "this is a hero" read at zoom — use it on almost everyone.
3. Re-check the hero's `silhouette` (`build`/`bodyShape`/`head`/`weapon`/
   `extras`) so the base body already leans the right way before detail meshes.

The full per-hero target list is in §11 (grouped by cohort). Heroes that need a
silhouette part we don't have yet (Spirit Breaker / Centaur mount, Clinkz gun)
are flagged there and feed WS-G.

Acceptance: every hero has a profile; spot-check the marquee ones (gym/Elite/
raid leaders) render with their features; `data-lint` likeness test extended to
assert profiles exist for the full shipped roster, not just the 6 starters.

---

## 6. WS-D — Attack animation, weapon-driven (do this early; it lifts everyone)

Today `animator.ts` hard-codes attack windups for `earthshaker`/`pudge`/`sniper`/
`juggernaut` and falls back to one generic weighted strike. Replace the heroId
branches with an **attack-style derived from the rig's weapon + build**, so all
122 heroes (and creeps) get a distinct swing with zero per-hero data:

| Weapon / build | Attack read |
|----------------|-------------|
| `cleaver` / `totem` / brute | overhead two-handed chop, big body lean, heavy recoil |
| `sword` | diagonal slash, moderate lean |
| `hook` | wind-back + forward fling |
| `rifle` / ranged | shoulder recoil + small backstep (current sniper path, generalized) |
| `staff` | forward jab / point, minimal lean |
| `none` + quad/blob | lunge-bite (creature melee) |
| `bird` build | dive-peck |

Keep the existing `attackPoint`/BAT timing exactly (don't touch feel). The 4
current heroId branches become data-free special cases only if the weapon rule
doesn't capture them. This is a single `animator.ts` change behind the existing
tests (`movement`, `kit-smoke`, anim coverage).

---

## 7. WS-C — Cast animation polish

`anim` is already a per-ability data field auto-resolved by `gestureForAbility`.
The work is **hand-authoring `anim` on signature casts** (free, pure data) so the
gesture matches the fantasy, e.g.:

- Channels (Black Hole, Sand Storm-style, Life Drain, Sonic-style ults) →
  `channel-loop`.
- Global ults (Sun Strike, Thundergod, Mystic Flare, Requiem) → `global-cast`.
- Leaps/dashes (Leap, Waveform, Pounce, Rolling Boulder, Tree Dance) → `dash`.
- Summons (wards, treants, spiders, brewlings) → `summon-gesture`.
- Slams (Echo Stomp, Ravage, Hoof Stomp, Avalanche) → `ground-slam`.

Optional small engine add (WS-G candidate): a `toggle-stance` gesture for
toggle ults (Berserker's Rage, Metamorphosis, Pulse Nova) so a stance flip reads
differently from a normal cast.

---

## 8. WS-B — Signature spell VFX treatments

The 12 archetypes are color/scale/secondary-color parameterized and already
cover most spells. Two moves:

1. **Tune the data we already render.** Give signature spells deliberate
   `color`/`color2`/`scale` so a `storm` Ravage reads teal-and-foam while a
   `storm` Black Hole reads violet-void. Pure data; do this for the whole §11
   "signature" column.
2. **Add a small number of new archetypes** for shapes nothing covers (§11):
   - `vortex` — inward-spiraling pull: Black Hole, Reverse Polarity, Vacuum,
     Rolling Thunder, Maelstrom-style, Macropyre rings.
   - `dome` — a hemispherical zone: Chronosphere, Arena of Blood, Static Storm,
     Ice Vault, Pit of Malevolence.
   - `mine` — a small armed ground charge w/ proximity telegraph: Techies
     Proximity Mines, Remote Mines, Land Mines.

Everything else maps on:

| Signature | Existing archetype + treatment |
|-----------|-------------------------------|
| Ravage / Echo Stomp / Hoof Stomp | `ground-aoe` expanding ring, `ground-slam` cast |
| Requiem of Souls | radial `wall`/`beam` lines scaling with stacks |
| Epicenter / Pulse Nova | `storm` zone with repeating pulse rings |
| Sun Strike / Mystic Flare | `global-mark` pillar + delayed `beam` |
| Ball Lightning | `projectile` w/ long additive trail + `storm` impact |
| Sonic Wave / Shockwave / Wave of Terror | `beam`/`projectile` wide line |
| Chain spells (Arc, Mjollnir, Lightning Storm) | `chain` (already good) |
| Track / Doom / debuff marks | `shield`/`global-mark` attached glow on victim |

---

## 9. WS-E — Item appearance & attackVisual expansion

Today only the ≥6 lint-floor items (Battlefury, Divine Rapier, Assault Cuirass,
Crystalys, Scythe of Vyse, Aghanim's Scepter) carry visible geo. Extend
`appearance`/`attackVisual` to the recognizable item set so a built hero
visibly changes. All pure data using existing kinds; per-item targets in §12.

High-value visible items: Desolator (`tinted-impact` red + armor-shred read),
Radiance (attached burn `aura` + `tinted-impact`, `elementOnHit: pyro`),
Mjollnir (`storm-haft` weapon + `lightning-bounce`, `elementOnHit: electro`),
Manta (illusion `summon-pop` on cast), Daedalus/Bloodthorn (`crit-lunge`),
Silver Edge (`glowing-blade` + break read), Shiva's (`frost-shards` + slow aura),
Heart (`heart-core`), Eul's/Wind Waker (`cyclone`), Force Staff (`boot-trail`).

If the visible-weapon set outgrows the 4 `ItemWeaponVisualKind` extras, that's a
WS-G candidate (e.g. a `scythe` or `orb-staff` kind), not a blocker.

---

## 10. WS-F — Icons & portraits

- **Per-ability icon distinction.** Add an optional `glyph` hint on `AbilityDef`
  (mirrors the item `glyph` field) OR derive a secondary glyph from the ability's
  dominant effect kind (stun→stars, summon→pips, heal→cross, displace→arrow), so
  two `projectile` spells don't share an icon. Keep the archetype glyph as the
  fallback. Pure-data field + one `icons.ts` branch.
- **Hero portraits.** Replace the letter-in-a-blob portrait with a generated
  bust from the hero's `silhouette` + `palette` (head shape + weapon hint +
  3-color grade), so the pick/codex/HUD portrait resembles the unit. When a
  hero's GLB is eventually enabled, swap to a live rotating model render
  (already anticipated in `GRAPHICS_SPEC` §6.1) — out of scope here, but the
  portrait function should be the single seam.

---

## 11. WS-G — New vocabulary entries (costed, do last)

Each entry = one enum value + one renderer/synth branch + one lint-array entry +
one coverage assertion. Keep the list short.

| Entry | Vocabulary | For | Justification |
|-------|------------|-----|---------------|
| `vortex` | `VfxArchetype` | Black Hole, Reverse Polarity, Vacuum, Rolling Thunder | inward spiral has no current shape |
| `dome` | `VfxArchetype` | Chronosphere, Arena, Static Storm | hemispherical containment read |
| `mine` | `VfxArchetype` | Techies/Remote/Land mines | armed ground charge + proximity telegraph |
| `gun` | `SilhouetteSpec.weapon` | Clinkz, Gyrocopter-likes distinct from `rifle` | bow-vs-gun silhouette |
| `mount` | `SilhouetteSpec.extras` | Spirit Breaker, Centaur, Magnus quad-likes | four-legged charger read |
| `tail` | `SilhouetteSpec.extras` | Naga, Medusa, Viper, Venomancer | serpentine lower body |
| `armor-shred-flash` | `AttackVisualKind` | Desolator, Nullifier, Solar Crest | only if `tinted-impact` reads poorly |
| `toggle-stance` | `AnimGesture` | toggle ults (Metamorphosis, Berserker's Rage) | stance flip ≠ normal cast |

Default to mapping onto the nearest existing archetype first; only land an entry
when the signature genuinely has no acceptable fit and the payoff is worth the
engine + test cost. Resist creep — the whole point of the closed vocabularies is
that content stays pure data.

---

## 12. WS-H — Scene, material & texture polish

All in `scene.ts` / `terrain.ts` / `performance.ts`, tier-gated:

- **Per-element color grade.** Nudge the grade pass by the dominant on-screen
  element (fire warm, frost cool, void desaturated-violet) during big casts.
- **Rim light + fresnel emissive** on hero materials so silhouettes pop against
  terrain; stronger on casters (`animProfile.rig === 'caster'`).
- **Telegraph variety.** Today one `telegraphTexture`; add a couple (spiked ring
  for stuns, hatched line for walls, dotted for mines) selected by archetype.
- **Spark/sprite variety.** One `softSprite` today; add shard/ember/snow sprites
  for `fire`/`frost`/`storm` bursts.
- **Detail/normal maps per material family** (the in-scene bump map exists; widen
  it: cloth vs. metal vs. stone vs. flesh) for closer-zoom fidelity.
- **Hit-stop + screen-shake** micro-feedback on crits/big stuns (bounded, off on
  `reducedMotion`).

Done when the medium tier looks meaningfully richer and the low tier still hits
the perf budget with the extras off.

---

## 13. WS-I — Audio tie-ins (optional)

Mostly already covered. Optional: hand-set `sound` on signature casts to a
better-fitting archetype (`roar` for big STR ults, `void` for void/portal kits,
`frost` for cryo), and consider one new `SoundArchetype` only if a signature
family (e.g. `lightning` distinct from `storm`) is worth §11's cost. The
no-audio-import guard (test 21) and voice-pool cap must stay green.

---

## 14. Hero tables

Legend: **Likeness** = `✓` already has a profile (polish only) / `NEW` to author.
**Signature** = the one ability per hero that most deserves a hand treatment;
the other three ride the (tuned) archetype defaults. Silhouette/likeness parts
flagged `[G]` need a WS-G vocabulary entry.

### 14.1 Feel heroes (9) — all profiled; polish + signature only

| Hero | Likeness | Reads as | Signature → treatment |
|------|----------|----------|------------------------|
| Juggernaut | ✓ | masked orange swordsman | Omnislash → rapid `dash` blinks + `cleave-sweep` per hit |
| Crystal Maiden | ✓ | blue-white frost mage | Freezing Field → `storm` dome of `frost` bursts |
| Pudge | ✓ | green butcher w/ hook | Hook → `hook` projectile (already iconic), thicken trail |
| Earthshaker | ✓ | horned totem bruiser | Echo Slam → `ground-aoe` ring + per-target re-pulse |
| Sniper | ✓ | bearded rifleman | Assassinate → long `beam` + `global-mark` lock |
| Lich | ✓ | skeletal frost king | Chain Frost → bouncing `projectile` w/ frost trail |
| Luna | ✓ | silver glaive rider | Eclipse → repeated `beam` flicks from above |
| Sven | ✓ | masked heavy knight | God's Strength → red `shield` aura + bigger `cleave-sweep` |
| Axe | ✓ | red axe berserker | Culling Blade → `crit-lunge` execute flash |

### 14.2 Phase 2 (11) — none profiled

| Hero | Likeness | Reads as | Key features | Signature → treatment |
|------|----------|----------|--------------|------------------------|
| Mirana | NEW | moon-priestess on guard | tiara, crescent bow, star cloak, glowing eyes | Sacred Arrow → long `projectile` w/ bright trail; Starstorm `storm` |
| Lina | NEW | red fire sorceress | flame ponytail, slim robe, ember hands, hot eyes | Laguna Blade → white-hot `beam` (color2 red) |
| Zeus | NEW | bearded storm lord | cloud beard, toga, lightning rods, crackle | Thundergod's Wrath → `global-mark` + per-target `beam` |
| Drow Ranger | NEW | icy elf archer | hood, frost bow, quiver, pale-blue eyes | Frost Arrows → frost `projectile`; Marksmanship `shield` |
| Jakiro | NEW | twin-headed dragon | two heads (fire/ice), wings, split palette | Macropyre → twin `wall`/`ground-aoe` fire+ice lines |
| Witch Doctor | NEW | voodoo shaman | bone mask, staff, fetish charms, green eyes | Death Ward → channel `summon-pop` turret + `beam` ticks |
| Omniknight | NEW | golden paladin | winged helm, mace, heavy plate, halo glow | Guardian Angel → gold `shield` dome over allies |
| Windranger | NEW | green archer | hood, longbow, scarf, quiver | Focus Fire → rapid `ranged-shot`; Powershot `beam` line |
| Phantom Assassin | NEW | hooded daggerfall | veil mask, daggers, ragged cloak, red eyes | Coup de Grace → `crit-lunge` w/ heavy flash |
| Tusk | NEW | walrus brawler | tusks, fur coat, ice gauntlets | Snowball → rolling `projectile` ball; Walrus Punch `crit-lunge` |
| Ancient Apparition | NEW | floating ice wraith | frost crown, trailing wisp body, no legs (`blob`) | Ice Blast → `global-mark` + `dome` shatter |

### 14.3 Phase 3 (45)

Profiled today (polish + signature only): Legion Commander, Shadow Fiend, Lion,
Doom, Wraith King, Invoker, Medusa, Tidehunter, Tiny, Storm Spirit, Kunkka,
Nature's Prophet (12).

| Hero | Likeness | Reads as | Key features | Signature → treatment |
|------|----------|----------|--------------|------------------------|
| Legion Commander | ✓ | red-gold duelist | crested helm, banner, sword | Duel → paired `global-mark` tether + lock |
| Vengeful Spirit | NEW | blue winged spirit | bat wings, spear, horned crown | Nether Swap → twin `blink` streak |
| Shadow Fiend | ✓ | demon of red souls | horns, soul core, wings | Requiem → radial `wall` soul-lines (×stacks) |
| Riki | NEW | small invis assassin | hood, twin daggers, smoke wisps | Tricks of the Trade → `channel` + spinning `cleave-sweep` |
| Bounty Hunter | NEW | masked ninja | shuriken, scarf, gold trim | Track → gold `shield` mark on victim |
| Lion | ✓ | purple demon witch | horn, monster hand, staff | Finger of Death → thick red `beam` |
| Winter Wyvern | NEW | icy dragon | wings (`bird`/[G]`tail`), frost crest | Winter's Curse → `dome` + forced-attack `chain` |
| Sand King | NEW | scorpion warrior | carapace, `[G]tail` stinger, mandibles | Epicenter → `storm` zone pulse rings |
| Nyx Assassin | NEW | beetle assassin | carapace shell, mandibles, spikes | Vendetta → invis fade + `crit-lunge` burst |
| Medusa | ✓ | green gorgon | snake crown, bow, `[G]tail` | Stone Gaze → `dome` petrify cone |
| Viper | NEW | nether drake | wings, scaled body, fanged maw | Viper Strike → green `projectile` heavy slow glow |
| Kunkka | ✓ | blue admiral | captain hat, naval coat, tide sword | Ghostship → delayed `global-mark` crash zone |
| Tidehunter | ✓ | sea leviathan | wide jaw, anchor, shell | Ravage → `ground-aoe` expanding spike ring |
| Slardar | NEW | fish-knight | fin crest, scaled plate, mace | Slithereen Crush → `ground-slam` stun ring |
| Naga Siren | NEW | serpentine siren | scaled `[G]tail`, fins, net | Song of the Siren → `dome` sleep lull |
| Slark | NEW | fish rogue | fin head, dagger, slim build | Shadow Dance → `shield` shroud + ms streak |
| Lifestealer | NEW | feral ghoul | claws, gaunt body, red eyes | Infest → `summon-pop` burst-out |
| Undying | NEW | rotting zombie lord | tombstone arm, tattered robe | Flesh Golem → self `shield` transform + plague aura |
| Doom | ✓ | red infernal demon | huge horns, burning chest, wings | Doom → attached `global-mark` burn debuff |
| Wraith King | ✓ | green skeleton king | crown, glowing skull, cape | Reincarnation → `summon-pop` death burst + revive pillar |
| Night Stalker | NEW | bat demon | leather wings, fanged maw, claws | Dark Ascension → night tint + `roar` cast |
| Invoker | ✓ | gold arcane magus | high collar, orb triad, cape | Invoke / Sun Strike → `global-mark` pillar + `beam` |
| Silencer | NEW | arcane duelist | curse glaive, robe, sigils | Global Silence → map-wide `global-mark` ring |
| Outworld Destroyer | NEW | astral construct | floating orb head, robe, glyphs | Astral Imprisonment → `dome` banish bubble |
| Skywrath Mage | NEW | winged bird-mage | feathered wings, staff, beak helm | Mystic Flare → focused `storm` damage column |
| Tinker | ✓?NEW | goblin inventor | goggles, backpack, laser arm | Rearm → `shield` recharge flash on all icons |
| Enchantress | NEW | deer dryad | antlers, hooves, leaf dress | Nature's Attendants → `summon-pop` heal wisps |
| Chen | NEW | holy knight | winged helm, scepter, plate | Hand of God → gold `global-mark` heal pulse |
| Nature's Prophet | ✓ | antlered prophet | antlers, leaf cape, seed orbs | Wrath of Nature → global `chain` bounce |
| Beastmaster | NEW | tribal beast lord | boar helm, axes, fur | Primal Roar → `ground-aoe` cone + push |
| Broodmother | NEW | giant spider | 8 legs (`[G]` extras), fangs | Spawn Spiderlings → `summon-pop` brood |
| Warlock | NEW | demon summoner | horned hood, tome, staff | Chaotic Offering → big `summon-pop` golem + stun ring |
| Visage | NEW | gargoyle | stone wings, crown, claws | Summon Familiars → `summon-pop` stone gargoyles |
| Magnus | NEW | armored mammoth-man | tusks, `[G]mount` quad, hammer | Reverse Polarity → `vortex` pull-to-center + stun |
| Elder Titan | NEW | stone titan | rocky body, spirit core, staff | Earth Splitter → `wall` crack line |
| Tiny | ✓ | stone giant | rock crown, boulder shoulders | Toss → `projectile` hurled unit; Grow scales rig |
| Treant Protector | NEW | walking tree | bark body, branch arms, leaves | Overgrowth → `ground-aoe` root vines |
| Centaur Warrunner | NEW | centaur | `[G]mount` quad, axe, armor | Stampede → team ms streak + trample |
| Storm Spirit | ✓ | blue storm monk | wide hat, lightning belt, orbs | Ball Lightning → `projectile` long trail blink |
| Ember Spirit | NEW | fire swordsman | topknot, twin blades, ember trail | Fire Remnant → placed `summon-pop` + `dash` to |
| Spectre | NEW | shadow wraith | smoke body, blade-arms, no feet | Haunt → global `summon-pop` shadow images |
| Faceless Void | NEW | time alien | faceless head, gauntlet, carapace | Chronosphere → `dome` time-freeze |
| Terrorblade | NEW | demon marauder | horns, twin swords, wings | Sunder → red `beam` HP-swap link |
| Phoenix | NEW | fire bird | flame wings, beak, ember body | Supernova → `summon-pop` sun egg HP-object |
| Io | NEW | floating wisp | glowing orb, tether tendrils, no body | Relocate → `global-mark` teleport bloom |

### 14.4 Standard missing — Strength (11)

| Hero | Likeness | Reads as | Key features | Signature → treatment |
|------|----------|----------|--------------|------------------------|
| Abaddon | NEW | teal death-knight | horned helm, shield, mist cloak | Borrowed Time → teal `shield` damage-to-heal aura |
| Alchemist | NEW | ogre + goblin rider | barrel, cleaver, vials | Chemical Rage → green `shield` statmod glow |
| Bristleback | NEW | quilled brute | back quills, snout, plate | Warpath → stacking `shield` ms glow |
| Dawnbreaker | NEW | celestial smith | helm, hammer, halo | Solar Guardian → `global-mark` descent zone |
| Dragon Knight | NEW | armored dragon knight | helm, sword, scale cape | Elder Dragon Form → wing growth + `projectile` breath |
| Huskar | NEW | spear tribesman | topknot, spears, low-HP glow | Life Break → `dash` leap slam |
| Mars | ✓ | red-gold spear god | plumed helm, shield, spear | Arena of Blood → `dome`/`wall` ring |
| Ogre Magi | NEW | two-headed ogre | two heads, club, fur | Multicast → repeated cast flashes |
| Primal Beast | NEW | giant ape-beast | tusks, fists, mane | Pulverize → `channel` ground pound lock |
| Spirit Breaker | NEW | charging bull-demon | `[G]mount` quad, horns, star trail | Charge of Darkness → long `global-mark` homing streak |
| Underlord | NEW | hulking pit demon | tusks, maul, dark armor | Dark Rift → `global-mark` team teleport bloom |

### 14.5 Standard missing — Agility (11)

| Hero | Likeness | Reads as | Key features | Signature → treatment |
|------|----------|----------|--------------|------------------------|
| Anti-Mage | ✓ | purple twin-blade hunter | bald mark, crescent glaives, sash | Mana Void → `ground-aoe` burst on victim |
| Bloodseeker | NEW | blood hound | crest fin, claws, red trail | Rupture → red `beam` bleed on move |
| Clinkz | NEW | flaming skeleton archer | bone body, `[G]gun` bow, fire eyes | Death Pact → `summon-pop` consume glow |
| Gyrocopter | NEW | goblin gyro pilot | rotor, cockpit, gun arms | Call Down → `global-mark` twin missile zone |
| Hoodwink | NEW | squirrel ranger | bushy tail, hood, crossbow | Sharpshooter → `channel` charge + long `beam` |
| Razor | NEW | lightning revenant | smoke body, whip, storm crackle | Eye of the Storm → `storm` zone auto-`chain` |
| Templar Assassin | NEW | psionic templar | headdress, psi blades, refraction shards | Psionic Trap → placed `mine`/`ground-aoe` traps |
| Troll Warlord | NEW | troll berserker | tusks, dual axes, war paint | Battle Trance → red `shield` attack-speed glow |
| Ursa | NEW | bear warrior | bear head, claws, fur | Enrage → red `shield`; Fury Swipes stacking flash |
| Venomancer | NEW | plague lizard | `[G]tail`, spines, poison sacs | Poison Nova → `ground-aoe` expanding venom ring |
| Weaver | NEW | beetle weaver | carapace, wings, mandibles | Time Lapse → rewind `global-mark` snap |

### 14.6 Standard missing — Intelligence (11)

| Hero | Likeness | Reads as | Key features | Signature → treatment |
|------|----------|----------|--------------|------------------------|
| Death Prophet | NEW | banshee witch | veil, robe, skull staff | Exorcism → `summon-pop` spirit swarm |
| Disruptor | NEW | storm shaman | hide cloak, totems, lightning | Static Storm → `dome` silence zone |
| Grimstroke | NEW | ink sorcerer | brush-quill, robe, mask | Soulbind → `chain` link between victims |
| Keeper of the Light | NEW | lantern wizard | beard, lantern staff, robe | Illuminate → `channel` charge + wide `beam` |
| Leshrac | NEW | tormented demon | horns, `[G]tail`, bone crown | Pulse Nova → `storm` toggle aura DoT |
| Necrophos | NEW | plague reaper | hood, scythe, skull, robe | Reaper's Scythe → green `global-mark` execute |
| Puck | NEW | faerie dragon | wings, horns, slim body | Dream Coil → `chain` tether stun |
| Pugna | NEW | nether skull-mage | skull head, robe, ward orbs | Life Drain → `beam` channel link |
| Queen of Pain | ✓ | blue pain demon | bat wings, horns, claws | Sonic Wave → wide `beam` cone |
| Shadow Demon | NEW | eredar demon | horns, robe, claws | Disruption → `summon-pop` banish + copies |
| Shadow Shaman | NEW | troll shaman | mask, feathers, ward staff | Mass Serpent Ward → `summon-pop` ward line |

### 14.7 Standard missing — Universal (15)

| Hero | Likeness | Reads as | Key features | Signature → treatment |
|------|----------|----------|--------------|------------------------|
| Bane | NEW | nightmare horror | tentacle body (`blob`), eyes, no legs | Fiend's Grip → `channel` lock + drain `beam` |
| Batrider | NEW | imp on bat | bat mount (`bird`), torch, lasso | Flaming Lasso → `chain` drag tether |
| Clockwerk | NEW | clockwork knight | gear armor, hook, cogs | Hookshot → `hook` grapple blink |
| Dark Seer | NEW | hooded seer | dome head, robe, third eye | Wall of Replica → `wall` illusion line |
| Dark Willow | NEW | fae trickster | wisp wings, fae mask, staff | Bedlam/Terrorize → `fear` + `summon-pop` |
| Dazzle | NEW | troll priest | bone mask, robe, wand | Shallow Grave → pink `shield` HP-floor glow |
| Earth Spirit | NEW | stone monk | rock body (`golem`), totem | Magnetize → `ground-aoe` DoT zone |
| Enigma | NEW | void blob | dark mass (`blob`), eyes, stars | Black Hole → `vortex` pull channel |
| Lone Druid | NEW | bear druid | druid + bear summon | True Form → bear transform; bear summon detail |
| Lycan | NEW | werewolf lord | wolf head, claws, fur | Shapeshift → wolf form + `shield` crit glow |
| Marci | NEW | martial companion | braid, gauntlets, satchel | Unleash → `shield` flurry windows |
| Pangolier | NEW | pangolin swashbuckler | scale ball, rapier, hat | Rolling Thunder → `vortex`/roll forced-move |
| Snapfire | NEW | granny + lizard mount | `[G]mount`, shotgun, goggles | Mortimer Kisses → `channel` cookie barrage zone |
| Timbersaw | NEW | mech lumberjack | saw-mech frame, chain claws | Timber Chain → `hook` blink to point |
| Void Spirit | NEW | astral monk | crystal hood, blade, rifts | Astral Step → multi-`dash` + `beam` |

### 14.8 Complex (9)

Profiled today: Monkey King, Rubick, Techies, Arc Warden, Meepo, Morphling,
Brewmaster (7). Chaos Knight + Phantom Lancer are NEW.

| Hero | Likeness | Reads as | Signature → treatment |
|------|----------|----------|------------------------|
| Chaos Knight | NEW: armored chaos rider (`[G]mount` optional, jagged sword, red eyes, banner) | Phantasm → `summon-pop` illusion burst |
| Arc Warden | ✓ blue split-self warden | Tempest Double → `summon-pop` + afterimage on the double |
| Meepo | ✓ shovel geomancer | Divided We Stand → clone `summon-pop`; Poof `global-mark` blinks |
| Monkey King | ✓ staff trickster | Wukong's Command → `summon-pop` soldier ring + `dome` |
| Morphling | ✓ water warrior | Waveform → `dash` water streak; Morph `shield` shift |
| Phantom Lancer | NEW: blue spear duelist (lance, sash, illusion shimmer, helm) | Juxtapose → `summon-pop` illusion swarm |
| Rubick | ✓ green grand magus | Spell Steal → `global-mark` grab + stolen-spell echo |
| Brewmaster | ✓ drunken brawler | Primal Split → 3 typed `summon-pop` brewlings |
| Techies | ✓ goblin demo trio | Proximity Mines → `mine` armed charges |

---

## 15. Item tables

Legend: **Vis** = `appearance` (worn/weapon geo), **Atk** = `attackVisual`
override. `[has]` = present today. Pure data unless a kind is flagged `[G]`.

### 15.1 Present today (polish only)

| Item | Vis | Atk |
|------|-----|-----|
| Battlefury | `broad-cleaver` [has] | cleave-sweep |
| Divine Rapier | `glowing-blade` [has] | crit-lunge |
| Assault Cuirass | `pauldrons` [has] | — |
| Crystalys | `crystal-edge` [has] | crit-lunge |
| Scythe of Vyse | `hex-sigil` [has] | — |
| Aghanim's Scepter | `mana-orb` [has] | — |

### 15.2 Carry / damage (author appearance + attackVisual)

| Item | Vis target | Atk target | Element on-hit |
|------|-----------|-----------|----------------|
| Desolator | tint red weapon | `tinted-impact` (red) | — |
| Daedalus | `crystal-edge` | `crit-lunge` | — |
| Mjollnir | `storm-haft` weapon | `lightning-bounce` | electro |
| Maelstrom | `storm-haft` | `lightning-bounce` | electro |
| Radiance | burn `aura` part | `tinted-impact` | pyro |
| Monkey King Bar | `glowing-blade` | `tinted-impact` | — |
| Abyssal Blade | `broad-cleaver` | `tinted-impact` (stun flash) | — |
| Silver Edge | `glowing-blade` | `crit-lunge` (break read) | — |
| Bloodthorn | `crystal-edge` | `crit-lunge` | — |
| Satanic | tint dark-red | `tinted-impact` | — |
| Echo Sabre | `glowing-blade` | double `tinted-impact` | — |
| Manta Style | illusion `summon-pop` on cast | — | — |
| Butterfly | `wing-blades` [has?] | — | — |

### 15.3 Defensive / utility

| Item | Vis target | Notes |
|------|-----------|-------|
| Heart of Tarrasque | `heart-core` part | red core glow |
| Shiva's Guard | `frost-shards` + frost `aura` | slow nova on cast |
| Pipe of Insight | shield `aura` (team) | barrier flash |
| Crimson Guard | `pauldrons` + block flash | — |
| Lotus Orb | `mana-orb` + reflect shimmer | reflect cast vfx |
| Linken's Sphere | orbiting `mana-orb` | block spark |
| Aeon Disk | low-HP `shield` burst | — |
| Black King Bar | gold `shield` aura | already present |
| Eul's / Wind Waker | `cyclone` lift vfx | self/target cyclone |
| Force Staff | `boot-trail` dash | — |
| Blink Dagger | `blink` mark (already) | — |
| Octarine / Bloodstone | `mana-orb` aura | spell-lifesteal glow |

---

## 16. Delivery batches

Each batch ships green (`typecheck` + `test` + `build`), adds a couple of feel
tests for bespoke pieces, and respects the perf budget. The procedural batches
(1–10) and the asset batches (0, 11–13) run in parallel: procedural raises the
whole roster's floor while assets raise the ceiling on the marquee pieces.

0. **WS-J P0 — asset pipeline + ledger.** Stand up
   `scripts/assets/build_assets.mjs`, the `public/assets/` tree, and the
   `ASSETS.md` provenance ledger; confirm the local/remote loader policy (§4a) and
   the no-asset boot floor. No visible change yet; this unblocks every asset
   batch. Gate: build + no-asset boot.
1. **WS-D attack rework + WS-C signature cast `anim` pass.** One engine change in
   `animator.ts` (weapon-driven attack) lifts all 122 heroes; hand-set `anim` on
   signature casts (pure data). Gate: `movement`, `kit-smoke`, anim coverage.
2. **WS-A likeness, cohort 1 — marquee.** Phase 2 (11) + the un-profiled Phase 3
   marquee (Faceless Void, Spectre, Magnus, Phoenix, Io, Ember, Silencer, OD,
   Skywrath). Extend the likeness lint to assert full-roster profiles. Gate:
   data-lint likeness + render smoke.
3. **WS-A likeness, cohort 2 — standard STR + AGI** (22). Flag `[G]` parts.
4. **WS-A likeness, cohort 3 — standard INT + UNI + complex** (26 + Chaos
   Knight/Phantom Lancer). Gate: every hero profiled.
5. **WS-B signature spell VFX (data tuning).** Color/scale/color2 on the §14
   signature column; hand `vfx` on the ~40 marquee spells. Gate: vfx coverage,
   kit-smoke.
6. **WS-G vocabulary entries** (`vortex`, `dome`, `mine`, `gun`, `mount`, `tail`,
   optional `armor-shred-flash`/`toggle-stance`). Each: enum + renderer branch +
   lint array + coverage test. Then wire the spells/heroes that need them.
7. **WS-E item appearance + attackVisual** for the §15 set; widen the coverage
   lint floors. Gate: appearance/attack coverage, boundary, kit-smoke on actives.
8. **WS-F icons + portraits.** Per-ability glyph distinction + silhouette-based
   portrait. Gate: icon generation smoke.
9. **WS-H scene/material/texture polish** (per-element grade, rim light,
   telegraph/sprite variety, hit-stop). Tier-gated. Gate: perf budget + perf-
   harness.
10. **WS-I audio tie-ins (optional, last).** Signature `sound` reassignments;
    keep no-audio-import + voice-cap green.
11. **WS-J terrain PBR + HDRI sky** (highest-ROI assets, §18.3). Local,
    region-preloaded; the low tier skips the HDR. Gate: perf budget +
    scene-token guard.
12. **WS-J props / foliage / town + particle sprites**, feeding WS-H and WS-B.
    All `InstancedMesh`. Gate: perf budget + perf-harness.
13. **WS-J marquee GLBs** — raid bosses first, then the starter + iconic heroes
    — flipped on one at a time in `ENABLED_HERO_MODELS` with the procedural
    fallback intact; this upgrades WS-A likeness for those heroes and unlocks the
    live rotating portrait (WS-F). Gate: manifest tests + boundary + no-asset boot.

---

## 17. Risks & notes

- **Likeness is geometry code.** Each `applyHeroLikeness` case is real Three.js
  primitive work. Keep parts cheap (a handful of shared-geometry meshes), reuse
  the helper closures, and lean on glowing `eyes(...)` for the cheapest big read.
  Watch the model geometry cache and the per-unit triangle count vs. the budget.
- **Don't break feel timing.** WS-D must preserve `attackPoint`/BAT exactly; it
  only changes pose shape, never windup duration. The movement/feel tests are the
  guard.
- **Vocabulary creep is the trap.** Every WS-G entry is engine + lint + test and
  dilutes "content is pure data." Map onto existing archetypes first; the §14
  `[G]` flags are the *only* approved candidates — anything beyond them needs the
  same §11 bar.
- **Boundary + boot floor stay non-negotiable; asset imports are welcome.** Core
  never reads `appearance`/`attackVisual`, and the low tier plus the asset-absent
  path keep booting and playing. Importing model/texture/HDRI assets is allowed
  and encouraged. The synth audio path keeps its no-raw-import guard until we add
  a separate, budgeted sampled-audio loader (§18.3), so the guard stays meaningful.
- **Asset weight, latency, and licensing are real costs.** Every committed asset
  counts against the ~60–90 MB tier-gated budget; every remote asset adds first-
  use latency. Compress hard (meshopt GLB, webp/ktx2 textures), lazy-load by
  region and tier, and keep `ASSETS.md` honest: CC0 or original/generated only,
  never Valve files (`DECISIONS` §1.1).
- **Perf under load.** New particles, rim light, per-element grade, and any GLBs
  must hold the 30-unit / 200-projectile budget on a teamfight; verify with
  `perf-harness` and `perf-budget` after WS-H and after each GLB flip. Everything
  extra is off on the low tier and under `reducedMotion`.
- **Balance/feel unaffected.** This plan touches only renderer-side data, engine,
  and assets; no sim numbers change, so the macro/determinism tests should not
  move.

---

## 18. WS-J — Asset acquisition, generation & import pipeline

Procedural detail gets the roster to "recognizable." This workstream is how we
cross to "good" where it pays off, by sourcing real assets and running them
through the pipeline that already exists in the codebase (`assets.ts` manifest +
`HeroAssetLoader` + the meshopt/sharp build scripts described in `DECISIONS`
§13.5).

### 18.1 Where assets come from

Three sources, each ending in an `ASSETS.md` row:

- **Download (CC0 packs).** The art direction is locked to one stylized-but-
  grounded CC0 family (`DECISIONS` §13.3): Quaternius / KayKit / Kenney for models
  and props, Poly Haven for HDRIs, ambientCG for terrain PBR. CC0 needs no
  attribution; we credit in `ASSETS.md` for provenance. Off-family assets get
  retextured into the family or stay procedural.
- **Generate.** When no CC0 asset fits, generate one. Tools (gltf-transform,
  procedural mesh/texture scripts) or asset-generation models produce textures,
  sprites, normal/detail maps, icons, and HDRIs. Generated assets are "original"
  in `ASSETS.md` and pass the same family-cohesion review and the esports/IP
  denylist that `data-lint` test 23 already enforces on names and lore.
- **Author by hand.** Small bespoke pieces (a signature weapon, a boss prop)
  where neither a download nor a generation lands well.

The IP rule from `DECISIONS` §1.1 holds: never ship Valve hero files. A hero is a
CC0 archetype base plus our retexture and gear for resemblance, or generated, or
procedural.

### 18.2 The pipeline (mostly already wired)

- **Build step.** `scripts/assets/build_assets.mjs` (gltf-transform + meshopt +
  sharp) resamples, prunes, dedups, and meshopt-compresses GLBs, and resizes
  textures to webp/ktx2. Raw source packs stay gitignored under `tmp/asset_src/`;
  only the optimized output lands in `public/assets/`.
- **Manifest + loader.** `assets.ts` already exposes the hero manifest,
  `ENABLED_HERO_MODELS` (empty today), `HeroAssetLoader`, and `creepCreatureUrl`,
  with the meshopt decoder wired. Shipping an asset means: drop the optimized file
  under `public/assets/`, add a manifest entry, add an `ASSETS.md` row, and (for
  heroes) flip the id into `ENABLED_HERO_MODELS`.
- **Mount + fallback.** `models.mountHeroModel` swaps the procedural body for the
  loaded scene (height-fit, feet-seat, shadows on), and the animator drives its
  clips through the mixer path. The procedural rig stays hidden rather than
  disposed, so a later failure falls back cleanly.
- **Remote variant.** For lazy/remote assets the loader takes an absolute CDN URL
  instead of a `public/assets/` path. The scene-token guard already invalidates
  stale async loads, so the same mount-and-fallback path covers remote too.

### 18.3 What to acquire, in payoff order

1. **Terrain PBR + HDRI sky** (ambientCG + Poly Haven). Highest ROI, zero hero
   IP, lifts every scene at once. Local, region-preloaded; the low tier skips the
   HDR.
2. **Props / foliage / town** (Quaternius / KayKit), all `InstancedMesh`. Makes
   the overworld and town read like a base instead of a primitive field.
3. **Particle sprites + telegraph textures** (Kenney or generated) feeding WS-H
   and WS-B: shard/ember/snow sprites, spiked/hatched/dotted telegraphs.
4. **Creep / boss GLBs** for the marquee raid bosses (the Roshan-like and Lord-of-
   Terror-like fights) where the payoff is highest; mapped via the creep manifest.
5. **Hero GLBs**, starting with the 3 starters plus a few iconic heroes (the
   `PHASE5_STARTER_ASSETS` set), flipped on one at a time in `ENABLED_HERO_MODELS`
   with the procedural fallback intact. Each flip upgrades WS-A likeness for that
   hero and unlocks the live rotating portrait in WS-F.
6. **Sampled audio (optional).** If the synth ever caps out, add a separate,
   budgeted sampled-audio loader rather than touching the synth path, so the
   test-21 no-raw-import guard on the synth stays meaningful.

### 18.4 Gates

- Every shipped asset (local or remote) has an `ASSETS.md` row; review rejects
  orphans.
- The no-asset boot and low-tier-procedural paths stay green (the boot floor).
- Committed assets stay within the ~60–90 MB tier-gated ceiling; remote assets are
  tracked separately with their own latency budget.
- The `data-lint` manifest tests (`PHASE5_STARTER_ASSETS` shape, fallback =
  `procedural`) and the boundary guard stay green.
