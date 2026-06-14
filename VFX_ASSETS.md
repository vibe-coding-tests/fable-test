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
| Hero GLBs enabled | **80 / 122** — every hero in the four KayKit humanoid cohorts (Knight 17 + Mage 30 + Barbarian 15 + Rogue 18), each a per-hero retextured CC0 GLB (`ENABLED_HERO_MODELS`, derived from `HERO_COHORTS ∩ ENABLED_HERO_COHORTS`). Remaining 42 = creature cohorts (31) + procedural holdouts (11). **No-budget policy** (DECISIONS 2026-06-13): one file per cohort hero, ~118MB total. Shared-base recolor scaffolding (`ENABLED_HERO_BASES`, `loadBase`, runtime `recolorToPalette`) stays wired as an inert fallback |
| Ability VFX coverage | **488 / 488** authored; archetypes incl. `vortex`/`dome`/`mine` |
| Attack animation | weapon-driven (`attackStyleFor`): 8 styles incl. `bird-dive`, `creature-lunge` |
| Cast/anim gestures | `AnimGesture` ×9, auto-resolved + hand-set on signatures |
| Item visuals | D1+D2 shipped: `appearance` on **76** items, `attackVisual` on **28**; the remaining ~52 are intentionally invisible consumables/components (§6.1) |
| Creature GLBs | 20 Quaternius creatures vendored, mounted on creeps and **animated off sim state** via the shared `mountHeroModel` + `animateAuthoredRig` path (not a static pose) |
| Env assets | terrain PBR (ambientCG), 2 HDRIs (Poly Haven), foliage + town (Quaternius) |
| VFX textures | original `/assets/vfx/vfx_atlas.webp` for sprites/telegraphs, with procedural `DataTexture` fallback |
| Audio | synth-only (`SoundArchetype` ×11), no sampled SFX, no music beds |
| Pipeline | `build_assets.mjs` (resample/prune/dedup/meshopt/webp + **palette recolor**), `assets.ts` loader + fallback, `ASSETS.md` ledger, `manifest.json` |
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
   Mage-base diverge by the weapon GLB attached to the hand socket and the
   procedural likeness overlay (eyes/horns/crest) re-parented to head/shoulder
   sockets.
4. **Use bespoke assets freely when theme demands it.** Raid bosses, Elite Five
   anchors, gym leaders, and abstract heroes can get custom GLBs, textures,
   portraits, and audio beds.

Implications for `assets.ts`:
- Replace the per-hero `modelUrl` manifest with a `HERO_BASE: Record<heroId,
  { base, weapon?, palette, clips }>` map (palette can be read from hero data at
  registration, or duplicated like the starter spec).
- `heroAssetEntry` resolves base + weapon URLs; `loadHero` caches **per base**,
  not per hero, so 122 heroes trigger ~14 loads total.
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
- **A0 — shared base + runtime recolor scaffolding. Engineering shipped; base art
  pending.** `HERO_BASE` maps all 122 heroes to a base (16 cohorts + 11 procedural
  holdouts), `recolorToPalette` tints a cloned base to a hero's three colors at
  runtime (materials cloned so cohort members don't share tint), and
  `HeroAssetLoader.loadBase` caches **per base** (≈16 loads for 122 heroes). The
  path is gated by `ENABLED_HERO_BASES` (empty until the CC0 base GLBs ship), so it
  is inert and 404-free today; the 6 starters keep their dedicated retextured GLBs.
  Remaining: vendor the 4 KayKit base files, enable them, and wire the scene mount
  to prefer base+recolor. Gate: model-cache base-coverage + recolor tests — green.
- **A1+A2 — Knight + Mage + Barbarian + Rogue cohorts (80 heroes). SHIPPED.**
  No-budget policy: instead of one shared base recolored at runtime, every cohort
  hero ships its own retextured CC0 GLB (`heroes/<id>.glb`, ~118MB total). The spec
  (`scripts/assets/specs/heroes.json`) is generated from hero data — palette →
  build recolor, `baseStats.attackRange` → melee/ranged/spell attack clip — and
  `ENABLED_HERO_MODELS`/`PHASE5_STARTER_ASSETS` derive from `HERO_COHORTS ∩
  ENABLED_HERO_COHORTS`. Reuses the proven `heroAssetEntry → mountHeroModel` path;
  procedural fallback intact.
- **A3 — creature cohort** (31 heroes) reusing the vendored creature GLBs +
  creature clip wiring (WS-C). *Next up.*
- **A4 — bespoke marquee retextures** (raid bosses + iconic heroes) as their own
  files, flipped on one at a time.

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
   procedural arm. **Attaching a per-hero weapon GLB** to the same socket is the
   remaining art-pass step (needs the CC0 weapon GLBs vendored).
3. **Likeness re-parent (deferred):** for the enabled GLB heroes the authored
   model *is* the likeness, so the procedural overlay stays hidden (current
   behavior). Re-parenting individual overlay parts to head/shoulder sockets is a
   later refinement once shared bases need procedural accents on top.
4. **Fallback intact:** with no GLB, or a base that exposes no matching bone, the
   weapon falls back to the right hand / item layer (always visible) and nothing
   throws.

Gate: model-cache socket test (resolve + counter-scale + no-bone fallback) — green.

---

## 5. WS-C — Animations

Attack windups are already weapon-driven and feel-locked. Remaining is **clip
wiring for authored models**:

- **Humanoid clip map (done for starters):** per hero, rename the KayKit 76-clip
  set down to `idle/run/attack/cast/channel/death`, choosing melee vs ranged vs
  spell `attack` by `silhouette.weapon`. Extend the `heroes.json` pattern to a
  shared per-base default with per-hero `attack`/`cast` overrides.
- **Creature clips (already wired):** creeps mount their Quaternius GLB through
  `mountHeroModel` with `asset.animations`, so they get a mixer, and
  `animateAuthoredRig` drives `idle/run/attack/cast/channel/death` off sim state
  for **any** rig with a mixer — the `findClip` synonyms already cover
  `Idle`/`Walk`/`Attack`/`Death`/`bite`/`claw`. So creeps and creature-base heroes
  animate off sim state today (not a static pose). Remaining is per-base clip-name
  overrides where a base ships oddly-named clips.
- **Cast/channel coupling:** when a GLB has a spell clip, fire it on `cast`
  events and loop it during `channel` (mixer path already exists; just route the
  event). Toggle ults flip a held stance.
- **Optional new gesture:** `toggle-stance` (`AnimGesture`) for Metamorphosis /
  Berserker's Rage / Pulse Nova if the held-stance read matters — costed per §1.

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

### 6.4 New `ItemAppearancePart` / kind candidates (costed)
`cloak` (Glimmer/Force), `halo` (Holy Locket/Guardian), `cyclone`
(Eul's/Wind Waker), `armor-shred-flash` (`AttackVisualKind`, Desolator/Solar/
Nullifier). **D2 shipped `cloak`, `halo`, and `armor-shred-flash`; `cyclone`
stays unlanded because the existing `storm` archetype still carries Eul's/Wind
Waker.**

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

Shipped: medium+ attempts `/assets/vfx/vfx_atlas.webp` and slices it into four
sprite cells plus four telegraph cells. The atlas is original/generated in-repo
and logged in `ASSETS.md`; missing files or headless tests keep using procedural
`DataTexture`s. No new VFX archetypes needed (coverage is complete). All
additive, tier-gated, off on low. Gate: perf harness, no-asset boot, theme fit.

---

## 8. WS-F — Audio

Synth path is complete and stays (test-21 no-raw-import guard protects it). Add
a **separate sampled-audio loader** so synth stays as the fallback:

- **Music beds** per biome/region + town + boss/raid (CC0 / original loops),
  streamed and lazy, one bed at a time.
- **Sampled SFX** for the highest-impact hits (crits, big stuns, ult casts)
  layered over or replacing synth on medium+.
- **Signature `sound` reassignment (pure data):** `roar` for big STR ults,
  `void` for portal kits, `frost` for cryo, on the §14 signature column.
- **New `SoundArchetype` `lightning`** (distinct from `storm`) only if a
  signature family earns it — costed per §1.

Gate: voice-pool cap, no-raw-import on synth, audio-channel mix test, theme fit.

---

## 9. WS-G — Scene / environment assets

Mostly done (terrain PBR, 2 HDRIs, foliage, town). Remaining:

- **Water normal maps** (`textures/water/*`, MIT three.js examples) — wired in
  `ASSETS.md` as planned.
- **More HDRIs** per biome time-of-day (night bed already vendored, unused).
- **Display font** (`ui/*.woff2`, OFL) for the engraved title/HUD feel.
- **Props / set dressing** expansion (rocks, banners, raid arena dressing),
  all `InstancedMesh`.

Gate: perf harness, scene-token guard, biome theme smoke.

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

0. **A0** — shared base + runtime recolor + `HERO_BASE` map. **Engineering shipped**
   (map + `recolorToPalette` + per-base cache, gated by `ENABLED_HERO_BASES`); base
   GLB art + scene wiring remain.
1. **A1** — Knight + Mage cohorts (47) on shared bases. *Art pass:* vendor `knight`/
   `mage` base GLBs, enable in `ENABLED_HERO_BASES`, wire mount→base+recolor.
2. **B**  — sockets + weapon attachment + re-parenting. **Shipped** (socket resolve,
   weapon re-home + counter-scale, scene re-apply); per-hero weapon GLBs are art.
3. **A2** — Barbarian + Rogue cohorts (33). *Art pass.*
4. **C-creatures** — creature clip wiring. **Effectively shipped** (shared
   `mountHeroModel` + `animateAuthoredRig` already drives creeps/creatures off sim
   state); only odd per-base clip-name overrides remain.
5. **A3** — creature-base heroes (31). *Art pass* (reuses vendored creature GLBs).
6. **D1** — core item visuals (the ~29), widen coverage lint. **Shipped.**
7. **D2** — small basics + any costed new part/kind. **Shipped.**
8. **E**  — VFX sprite + telegraph texture atlas. **Shipped** (atlas vendored + wired).
9. **F1** — sampled-audio loader + music beds (data + small engine). *Art pass:*
   needs sourced CC0 loops; synth stays the floor.
10. **F2** — signature `sound` reassignments (pure data).
11. **G**  — water normals, HDRIs, font, prop dressing. *Mostly art pass.*
12. **A4** — bespoke marquee hero retextures, one at a time. *Art pass.*

> **Status:** the renderer/engine for every workstream is now in place. What
> remains is the **art-acquisition pass** — vendoring CC0 base meshes (A1–A4),
> weapon GLBs (B step 2), music beds (F1), and HDRIs/font/water normals (G). Each
> drops into a gated, tested hook with no further engine work.

Procedural batches and asset batches run in parallel: the floor never depends on
an asset landing.

---

## 12. Risks

- **Style drift from mixed asset packs.** Mitigated by the theme gate (§10).
  Every imported asset should match the stylized proportions, palette, material
  response, and region mood before it lands.
- **Socket mismatch.** KayKit hand/back bone names must be resolved defensively;
  missing socket → attach to rig root (today's behavior), never throw.
- **Single-atlas recolor reads flat.** Uniform tint suits casters and
  differentiates shared bases by color. Richer multi-tone heroes should get
  bespoke texture work in A4.
- **Creature clip pollution / determinism.** Clip wiring is renderer-side only;
  the sim/feel and macro/determinism tests must not move.
- **Test isolation.** A pre-existing cross-file `REG`-state race can flake the
  loot suite under parallel workers; harden fixtures before adding asset tests
  that reshuffle ordering.
- **Boundary + boot floor stay non-negotiable.** Core never reads
  `appearance`/`attackVisual`; low tier + asset-absent path keep booting.
