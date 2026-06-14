# VFX & Asset Completion Plan

This is the **asset ceiling** plan. Its sibling `VFX_OVERHAUL.md` raised the
**procedural floor** and is essentially done: every hero has a hand-authored
primitive likeness (122/122 profiles), every ability has authored VFX
(0/488 ride pure archetype defaults), attacks are weapon-driven, icons and
portraits are derived, and the scene runs the full post stack. This plan covers
what procedural cannot finish on its own: real model/texture/audio assets and
the remaining data coverage, **across all 122 heroes and 145 items**, plus the
animation, VFX, and audio work each needs.

The boot floor never moves: the game plays with `public/assets/` empty, every
hero keeps its procedural rig, and `/src/core/` never imports `three` or reads
renderer-only fields. Assets are an enhancement layered on top, tier-gated and
budgeted.

---

## 0. Where we are today (measured from code, not the doc)

| Surface | State |
|---------|-------|
| Hero likeness profiles | **122 / 122** unique, no duplicates (`engine/models.ts`) |
| Hero GLBs enabled | **6 / 122** — `juggernaut, crystal-maiden, pudge, earthshaker, sniper, lich` (`ENABLED_HERO_MODELS`) |
| Ability VFX coverage | **488 / 488** authored; archetypes incl. `vortex`/`dome`/`mine` |
| Attack animation | weapon-driven (`attackStyleFor`): 8 styles incl. `bird-dive`, `creature-lunge` |
| Cast/anim gestures | `AnimGesture` ×9, auto-resolved + hand-set on signatures |
| Item visuals | **47 / 145** items have `appearance`/`attackVisual`; **98** do not |
| Creature GLBs | 20 Quaternius creatures vendored, mounted on creeps (static pose) |
| Env assets | terrain PBR (ambientCG), 2 HDRIs (Poly Haven), foliage + town (Quaternius) |
| VFX textures | procedural `DataTexture` sprites (soft/ember/snow/shard) + telegraphs (ring/spiked/hatched/dotted) — no PNG assets |
| Audio | synth-only (`SoundArchetype` ×11), no sampled SFX, no music beds |
| Pipeline | `build_assets.mjs` (resample/prune/dedup/meshopt/webp + **palette recolor**), `assets.ts` loader + fallback, `ASSETS.md` ledger, `manifest.json` |

Asset budget used: **18.4 MB / 90 MB** (hero group 8 MB / 45 MB).

---

## 1. Principles & constraints

- **Procedural is the floor, assets are the ceiling.** Every hero keeps its
  procedural rig as the live fallback (`mountHeroModel` hides, never disposes).
  A missing or slow asset never blocks play (scene-token guard in `scene.ts`).
- **CC0 / original only.** Never Valve or Blizzard files. Heroes resemble their
  archetype through CC0 base meshes we retexture, or generated/bespoke pieces,
  or procedural. Every shipped file gets an `ASSETS.md` row or it fails review.
- **Tier-gated + budgeted.** Low tier stays procedural; medium loads local;
  high/ultra may pull remote upgrades. Committed assets stay within the
  ~60–90 MB tier-gated ceiling (`build_assets.mjs` `--check-budgets`).
- **Closed vocabularies stay disciplined.** Item/spell visuals are pure data
  picked from existing kinds. A new enum value costs enum + renderer branch +
  lint entry + coverage test, landed only when nothing existing fits.
- **Every batch ships green:** `npm run typecheck && npm test && npm run build`,
  plus `assets:check` for any asset batch.

---

## 2. Architecture pivot — shared bases + runtime recolor + sockets

The 6 starters each ship a full ~1.3 MB GLB. Repeating that per hero is
**~160 MB for 122 heroes** — far over the 45 MB hero budget. So the roster does
**not** get one baked file each. Instead:

1. **Ship a small set of shared base meshes** (4 KayKit humanoids + ~10
   Quaternius creatures, ~20 MB total), each once.
2. **Recolor at runtime, not at build.** The loader clones a base per hero and
   sets `baseColorFactor` on the cloned material from the hero's three-color
   `palette` (the same luminance/keyword mapping the build `recolorToPalette`
   uses, moved to a tiny runtime helper). One base serves dozens of heroes, each
   tinted to its signature color, at near-zero extra bytes.
3. **Differentiate by weapon + likeness sockets.** A Knight-base and a
   Mage-base diverge by the weapon GLB attached to the hand socket and the
   procedural likeness overlay (eyes/horns/crest) re-parented to head/shoulder
   sockets. This is what makes 4 bases read as 80+ distinct humanoids.

Implications for `assets.ts`:
- Replace the per-hero `modelUrl` manifest with a `HERO_BASE: Record<heroId,
  { base, weapon?, palette, clips }>` map (palette can be read from hero data at
  registration, or duplicated like the starter spec).
- `heroAssetEntry` resolves base + weapon URLs; `loadHero` caches **per base**,
  not per hero, so 122 heroes trigger ~14 loads total.
- Keep the build-time recolor for the rare hero that earns a **bespoke** texture
  (marquee/raid leaders); those ship as their own file.

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
- **A0 — migrate to shared base + runtime recolor.** Convert the 6 starters from
  baked files to the shared-base path; ship the 4 KayKit base files; add the
  `HERO_BASE` map + runtime tint helper. Gate: model-cache + data-lint, no-asset
  boot, budget.
- **A1 — Knight + Mage cohorts** (the two biggest, 47 heroes) on shared bases.
- **A2 — Barbarian + Rogue cohorts** (33 heroes).
- **A3 — creature cohort** (31 heroes) reusing the vendored creature GLBs +
  creature clip wiring (WS-C).
- **A4 — bespoke marquee retextures** (raid bosses + iconic heroes) as their own
  files, flipped on one at a time.

---

## 4. WS-B — Sockets & attachments

`HeroAssetManifestEntry.sockets` exists (`weapon`/`back`/`shoulder`) but
`mountHeroModel` ignores it and `applyItemAppearances` attaches to the
procedural `itemLayer`, which is hidden once a GLB mounts. Work:

1. **Resolve named sockets** on the mounted GLB (KayKit rigs expose hand/back
   bones) and expose them on `UnitRig` (`rig.sockets`).
2. **Attach the per-hero weapon GLB** (KayKit `sword_1handed`, `staff`, `wand`,
   `crossbow`, `axe_2handed`, `dagger`, etc., all CC0 in the same repo) to the
   hand socket, picked from the hero's `silhouette.weapon`.
3. **Re-parent the likeness overlay** (eyes, horns, crest, wings) and the item
   `appearance` geo from `itemLayer` to head/shoulder/back sockets so they ride
   the authored model instead of floating.
4. **Fallback intact:** with no GLB, sockets resolve to the procedural rig's
   existing mount points (today's behavior), so nothing regresses.

Gate: model-cache socket test, render smoke, no-asset boot.

---

## 5. WS-C — Animations

Attack windups are already weapon-driven and feel-locked. Remaining is **clip
wiring for authored models**:

- **Humanoid clip map (done for starters):** per hero, rename the KayKit 76-clip
  set down to `idle/run/attack/cast/channel/death`, choosing melee vs ranged vs
  spell `attack` by `silhouette.weapon`. Extend the `heroes.json` pattern to a
  shared per-base default with per-hero `attack`/`cast` overrides.
- **Creature clips (new):** the 22 creature heroes (and the existing creeps,
  which currently mount a **static** pose) need their Quaternius clips
  (`Idle`/`Walk`/`Attack`/`Death`) mapped through the same `findClip` synonyms.
  One change in the creep/hero mount path drives all of them off sim state.
- **Cast/channel coupling:** when a GLB has a spell clip, fire it on `cast`
  events and loop it during `channel` (mixer path already exists; just route the
  event). Toggle ults flip a held stance.
- **Optional new gesture:** `toggle-stance` (`AnimGesture`) for Metamorphosis /
  Berserker's Rage / Pulse Nova if the held-stance read matters — costed per §1.

Gate: `movement`, `kit-smoke`, anim coverage, mixer smoke.

---

## 6. WS-D — Item visuals (all 145)

Today 47/145 carry visuals. The remaining **98** split by intent:

### 6.1 Intentionally invisible (no work) — ~52
- **Consumables (9):** tango, salve, clarity, dust, wards, smoke, refresher
  shard, cheese. (Wards already place a `ward`-build unit; no held geo.)
- **Components (43):** raw stat parts (branches, circlets, gauntlets, recipes).
  Policy: components never show; only **built** items change the hero. This is
  deliberate to avoid clutter and is the existing convention.

### 6.2 Core / build-defining items missing visuals — author these (~29)
Pure data using existing `appearance` parts / `attackVisual` kinds / `aura`:

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
(`pauldrons`). Low priority.

### 6.4 New `ItemAppearancePart` / kind candidates (costed)
`cloak` (Glimmer/Force), `halo` (Holy Locket/Guardian), `cyclone`
(Eul's/Wind Waker), `armor-shred-flash` (`AttackVisualKind`, Desolator/Solar/
Nullifier). Land only when `tinted-impact`/existing parts read poorly.

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

No new VFX archetypes needed (coverage is complete). All additive, tier-gated,
off on low. Gate: perf budget + perf-harness, no-asset boot.

---

## 8. WS-F — Audio

Synth path is complete and stays (test-21 no-raw-import guard protects it). Add
a **separate sampled-audio loader** so synth stays untouched:

- **Music beds** per biome/region + town + boss/raid (CC0 / original loops),
  streamed and lazy, one bed at a time.
- **Sampled SFX** for the highest-impact hits (crits, big stuns, ult casts)
  layered over or replacing synth on medium+; synth remains the floor.
- **Signature `sound` reassignment (pure data):** `roar` for big STR ults,
  `void` for portal kits, `frost` for cryo, on the §14 signature column.
- **New `SoundArchetype` `lightning`** (distinct from `storm`) only if a
  signature family earns it — costed per §1.

Gate: voice-pool cap, no-raw-import on synth, audio-channel mix test, budget.

---

## 9. WS-G — Scene / environment assets

Mostly done (terrain PBR, 2 HDRIs, foliage, town). Remaining:

- **Water normal maps** (`textures/water/*`, MIT three.js examples) — wired in
  `ASSETS.md` as planned.
- **More HDRIs** per biome time-of-day (night bed already vendored, unused).
- **Display font** (`ui/*.woff2`, OFL) for the engraved title/HUD feel.
- **Props / set dressing** expansion (rocks, banners, raid arena dressing),
  all `InstancedMesh`.

Gate: perf budget, scene-token guard, budget.

---

## 10. Asset budget & provenance

| Group | Ceiling | Now | After plan (est.) |
|-------|---------|-----|-------------------|
| hero | 45 MB | 8 MB | ~22 MB (4 KayKit + creatures shared + a few bespoke) |
| creep | 35 MB | 2.9 MB | ~6 MB (clip-enabled creatures) |
| terrain | 28 MB | 3.6 MB | ~6 MB (+ water normals) |
| env | 32 MB | 3 MB | ~8 MB (+ HDRIs) |
| vfx (textures) | — | 0 | ~2 MB (sprite + telegraph atlas) |
| audio | (separate budget) | 0 | streamed, tracked separately |
| ui | 5 MB | 0 | ~1 MB (font) |
| **total committed** | **90 MB** | **18.4 MB** | **~45 MB** |

Every file: source + license (CC0 / original) + manifest entry in `ASSETS.md`.
Remote (CDN) assets carry their own latency budget and a separate ledger note.

---

## 11. Delivery batches (each ships green)

0. **A0** — shared base + runtime recolor + `HERO_BASE` map; migrate 6 starters.
1. **A1** — Knight + Mage cohorts (47) on shared bases.
2. **B**  — sockets + weapon attachments + likeness re-parenting.
3. **A2** — Barbarian + Rogue cohorts (33).
4. **C-creatures** — creature clip wiring (heroes + existing creeps off static).
5. **A3** — creature-base heroes (31).
6. **D1** — core item visuals (the ~29), widen coverage lint.
7. **D2** — small basics + any costed new part/kind.
8. **E**  — VFX sprite + telegraph texture atlas.
9. **F1** — sampled-audio loader + music beds (data + small engine).
10. **F2** — signature `sound` reassignments (pure data).
11. **G**  — water normals, HDRIs, font, prop dressing.
12. **A4** — bespoke marquee hero retextures, one at a time.

Procedural batches and asset batches run in parallel: the floor never depends on
an asset landing.

---

## 12. Risks

- **Budget blowout from per-hero files.** Mitigated by the shared-base + runtime
  recolor pivot (§2). Per-hero baked GLBs are reserved for marquee bespoke only.
- **Socket mismatch.** KayKit hand/back bone names must be resolved defensively;
  missing socket → attach to rig root (today's behavior), never throw.
- **Single-atlas recolor reads flat.** Uniform tint suits casters and
  differentiates shared bases by color; richer multi-tone needs per-region
  texture work (bespoke batch A4), not the default path.
- **Creature clip pollution / determinism.** Clip wiring is renderer-side only;
  the sim/feel and macro/determinism tests must not move.
- **Test isolation.** A pre-existing cross-file `REG`-state race can flake the
  loot suite under parallel workers; harden fixtures before adding asset tests
  that reshuffle ordering.
- **Boundary + boot floor stay non-negotiable.** Core never reads
  `appearance`/`attackVisual`; low tier + asset-absent path keep booting.
