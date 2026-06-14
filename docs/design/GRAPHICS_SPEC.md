# GRAPHICS SPEC — "ANCIENTS" looks and plays like the Dota 2 world

How the game reads as Dota 2 on sight: the UI, the HUD, the heroes, and the world. Companion to `SPEC.md` (design target, see §3 and §9 Phase 5), `PRESENTATION_SPEC.md` (juice, post-processing, audio, HUD animation), `OPTIMIZATION_SPEC.md` / `OPTIMIZATION.md` (performance), `PROGRESS.md` (status), and `DECISIONS.md` (calls made). Same crunch-mode footing as `SPEC.md §0`: this is direction and priority, not a gate.

The throughline matches the rest of the project. Everything here is engine-side and UI-side. The headless deterministic core (`SPEC.md §1.1`, `src/core/`) stays untouched: it never imports `three` and never reads visual data. Models, materials, textures, post-processing, terrain, and the HUD skin all read the sim state and `SimEvent`s the core already emits. No change here alters a single combat result, and the boundary test (`src/test/boundary.test.ts`) stays green.

## How this spec relates to `PRESENTATION_SPEC.md`

`PRESENTATION_SPEC.md` already specs the *machinery* of a modern look: a post-processing stack, PBR materials, richer VFX, an audio mixer, HUD animation, and game-feel juice. It frames that work as "modern and satisfying" in general terms.

This spec owns a different axis: **Dota 2 visual identity**. It answers "does a Dota player look at a screenshot and say 'that's Dota'?" Where the two overlap (post-processing, PBR, VFX pooling, HUD animation), this spec reuses that machinery and points at the relevant section instead of re-specifying it. What it adds on top is the *art direction*: the Dota command-card HUD layout, the brass-and-stone chrome, the Radiant/Dire color language, the painterly map terrain, hero resemblance, and the local-asset strategy that makes all of it possible.

Read order: this spec sets the target and the asset strategy; `PRESENTATION_SPEC.md §3` is the shared rendering toolbox it draws from.

---

## 0. WHERE WE ARE (measured today)

An honest read of the current visual layer, with file references so the work has a starting line.

> **Baseline moved (2026-06-13).** Most of "the look" (§3) has since shipped, so the snapshot below reads older than the code. `scene.ts` now runs an `EffectComposer` with ACES tonemapping, `UnrealBloom`, a grade/vignette pass, `OutputPass`, and SMAA, all tier-gated through `performance.ts`. Units and terrain use `MeshStandardMaterial`, lit by a generated `RoomEnvironment` IBL fill through a `PMREMGenerator`. Terrain carries a generated ground-detail `CanvasTexture` and an animated water shader. The glTF pipeline is now wired into `GameScene.createView` with the procedural fallback intact and tested (`heroAssetEntry` gate, `ENABLED_HERO_MODELS` empty). The one thing still missing is **asset files**: no `public/assets/`, no file-based PBR terrain, no HDRI sky, no real model GLBs, no music bed. That gap, and how to close it with curated CC0 packs, is §13.

**Renderer** (`src/engine/scene.ts`). A plain `WebGLRenderer` with `antialias: true`, a `PerspectiveCamera`, a `HemisphereLight` plus a `DirectionalLight` sun, and `THREE.Fog`. The frame draws straight to the screen with `renderer.render(this.scene, this.camera)` (`scene.ts:161`). There is no post-processing: no bloom, no tonemapping, no color grade, no ambient occlusion, no vignette. The day/night system blends three palettes and moves the sun (`updateDayNight`, `scene.ts:464`), which is good groundwork feeding a flat image.

**Heroes and creeps** (`src/engine/models.ts`). Every unit is assembled from Three.js primitives (boxes, cones, spheres, cylinders) into a silhouette plus a three-color palette, with `MeshLambertMaterial` throughout (`models.ts:44`). Nine heroes carry hand-built "likeness overlays" (`applyHeroLikeness`, `models.ts:337`): Juggernaut, Crystal Maiden, Pudge, Earthshaker, Sniper, Lich, Luna, Sven, Axe. The roster is 65 heroes, so 56 heroes currently render as a generic primitive body in their palette. Item appearance overlays (weapon swaps, pauldrons, frost shards, auras) attach on a separate `itemLayer` (`applyItemAppearances`, `models.ts:566`).

**Animation** (`src/engine/animator.ts`). Pure math on the rig's named parts: idle bob, a run cycle from limb rotation, a gesture-driven cast pose, an attack windup, a death collapse. No skeletal data, no keyframes. It reads honestly off `attackPoint`/BAT and the cast gesture, and it is allocation-free in the hot loop.

**The glTF pipeline is a stub that nothing uses.** `src/engine/assets.ts` defines a `HeroAssetLoader` (three's `GLTFLoader`) and a `PHASE5_STARTER_ASSETS` manifest pointing at `/assets/heroes/*.glb`. Those files do not exist, and more importantly `GameScene` never imports or calls the loader. `assets.ts` is referenced only by itself and by `src/test/data-lint.test.ts`. So today, **heroes always render procedurally**; the "real model" path was scaffolded and never connected.

**Terrain and world** (`src/engine/terrain.ts`). A vertex-jittered plane with per-vertex colors and flat-shaded `MeshLambertMaterial`, instanced cone-trees and dodecahedron rocks, and a hand-built town of box huts, a shrine crystal, and a shop stall. The sky is a flat `scene.background` color; "water" is a single flat Lambert plane ringing the playfield. Six biomes set color bands only (`BIOME_COLORS`, `terrain.ts:44`). There are no ground textures, no normal maps, no sky shader, no real water, no paths, no cliffs.

**VFX** (`src/engine/vfx.ts`). About twelve archetypes built from primitive geometry with `MeshBasicMaterial` under normal alpha blending. Projectiles are pooled (`hook`/`orb`). There is no additive glow, no soft particle sprite, no projectile trail, and zones render as flat discs rather than the textured targeting decals Dota uses to telegraph everything.

**Icons** (`src/engine/icons.ts`). Ability, item, and hero-portrait art are 2D canvas glyphs drawn at startup and cached as data URLs. Clean and readable, palette-driven, but abstract: a glyph, not the hero's face or the item's silhouette.

**HUD and UI** (`src/ui/hud.ts`, `src/ui/styles.css`). A clean DOM overlay in a generic dark-fantasy theme (slate panels, a blue accent, gold for currency). It is functional and readable. What it is not is *Dota*: there is no command-card frame, no brass-and-stone chrome, no ability row with sculpted gold borders and a radial cooldown sweep, no centered day/night clock, no faction color language. The minimap is canvas dots in a plain rounded box (`renderMinimap`, `hud.ts:196`).

**The summary.** The bones are right and the code is clean. The look is *stylized primitive*, not *Dota 2*. The single biggest gap between the two is not geometry. It is the light, the color grade, the UI chrome, the terrain materials, and the VFX language. Those are cheap, legal, and touch the whole frame at once. Hero models are the expensive, slow part, and the path for them was stubbed but never wired.

---

## 1. THE STRATEGIC DECISION — how do we get the Dota 2 look?

"Make it look like Dota 2" splits into two very different problems with very different costs.

1. **The look.** Lighting, color grade, terrain materials, sky, water, the UI chrome, the VFX language, the camera angle, the team-color readability. This is what makes a *screenshot* read as Dota. It is mostly shader and CSS work, it touches the whole frame, and it carries no asset-production or legal cost.
2. **The hero models.** Turning 65 primitive silhouettes into recognizable characters. This is what makes a *hero* read as itself. It is slow, per-hero, asset-heavy, and it runs straight into a legal wall (below).

The mistake would be to treat the overhaul as "model the heroes" and stall on the 95% of the frame that is cheap to fix. Almost all of the felt "that's Dota" gain lives in the look, and the look is the cheap half.

### 1.1 The legal line (this constrains every option)

Valve owns Dota 2's hero models, textures, icons, fonts (Reaver, Radiance), UI art, and sounds. We cannot ship those files, extract them from the game, or redistribute them. The established principle in `SPEC.md §9` is **resemblance, not replication**: "a Dota player names the hero on sight" is the bar, and an exact copy is "neither possible nor wanted."

So every asset we add must be one of:

- **Original** — generated by us in repo scripts.
- **Permissively licensed** — CC0, or CC-BY with attribution, or similar, and compatible with the repo.

Heroes resemble their archetype (a masked orange swordsman, a blue frost mage, a green butcher with a hook) through *our* assets, never Valve's. Same for fonts (use a free Cinzel/Marcellus-style display face, not Reaver) and UI art (generate the brass filigree, do not lift Dota's panels). This is load-bearing and is repeated in the principles.

### 1.2 The three approaches, with trade-offs

**Approach A — Push procedural-only, ship no new assets (the status quo, harder).**
Keep building everything from primitives and code: improve the primitive models, add post-processing, light it better, enrich the procedural VFX, and skin the HUD with CSS and canvas-generated textures. No model or texture files enter the repo.

- Strengths: zero asset weight, so the game still boots instantly from `npm run dev`. Zero licensing risk. Deterministic and already the always-available fallback. Cheapest to build and maintain. Nothing new to load or stream. The boundary and "no asset imports" tests stay trivially green.
- Weaknesses: the ceiling for "this hero looks like Pudge" is low. Primitives can suggest a silhouette and palette, but they will not read as the character at the fidelity the request implies. The world stays stylized-abstract rather than painterly. The "named on sight" bar is only partly reachable.

**Approach B — Go all-in on local 3D assets and PBR textures (full asset pipeline now).**
Wire the glTF pipeline for real and ship rigged GLB models with texture sets for the heroes, plus real terrain materials, skyboxes, and authored UI art, all stored locally in the repo.

- Strengths: the highest fidelity ceiling. Real skeletal animation, PBR materials, and a world that can genuinely look painterly. The "named on sight" bar is fully reachable for any hero we finish.
- Weaknesses: asset *production* is the real cost, and it is enormous. Modeling, rigging, texturing, and animating 65 heroes to a recognizable bar is studio-scale work; realistically only a handful get bespoke models in any near term. Repo and download weight balloon (tens to hundreds of MB), which fights the "browser, instant, from npm run dev" promise. It needs streaming, LOD, and load-state handling. And the legal line means we cannot shortcut any of it by using Valve's files, so a "fast" version of this approach does not exist.

**Approach C — Hybrid: art-direction first, local assets progressively, procedural always underneath (recommended).**
Do the look first, because it is cheap, legal, and global. Then replace hero models with local assets gradually, starting with the three starters, always behind the procedural fallback that already exists. Prefer textures we generate at runtime (canvas, noise, `RoomEnvironment`) and small CC0 texture sets, so the asset weight grows slowly and stays optional.

- Strengths: captures most of the perceived "Dota 2 world" early and cheaply, because the look layer is the cheap half and it lands first. The build never breaks when assets are absent, because procedural is the fallback (this is exactly how `assets.ts` was already designed, it was just never connected). Asset weight is opt-in and tier-gated. It respects the legal line and the `SPEC.md §9` "resemblance" framing. Every piece is quality-tierable, so a weak machine still runs.
- Weaknesses: fully resembling every hero still needs real model work, so the roster gets there over time, not at once. Two render paths (procedural and GLB) must coexist and stay in sync. It demands discipline about what counts as "the Dota look" versus "a copy of Dota."

### 1.3 Recommendation

**Adopt Approach C.** Ship the look first (post-processing, lighting, terrain materials, sky, the HUD skin, the VFX language), because that is where the request is mostly satisfied for the least cost and zero legal risk. Then wire the dormant glTF pipeline and bring in local hero models progressively, starters first, behind the procedural fallback. Treat "resemblance via our own and CC0 assets" as the hard rule.

The rest of this spec is the concrete build for Approach C, surface by surface.

---

## 2. THE NORTH STAR — what actually makes a frame read as Dota 2

Before the per-surface work, name the cues a Dota player's eye locks onto. The whole spec serves these.

- **A locked, angled top-down camera.** Dota sits at a fixed pitch, moderate zoom, hero roughly centered. The eye never tilts to the horizon. Readability comes first.
- **High-contrast hero readability.** Heroes pop off the ground: a bright rim light separates them from terrain, a team-color ring sits under each unit (allied green or blue, enemy red), and a health bar floats above. You always know who is who and whose side they are on.
- **A painterly, legible map.** The ground is desaturated and slightly warm, with clear walkable paths, tree lines that read as walls, cliffs with lit edges, and a river. Radiant ground runs warm and green; Dire ground runs cold and red. Nothing is noisy enough to hide a unit.
- **Saturated, additive magic.** Spells glow. Every targeted ability paints a bright ground ring or telegraph on the floor before it lands. Projectiles trail light. Damage reads by color: physical white and orange, magical blue and purple, pure white.
- **The command-card HUD.** The single most recognizable Dota element. A sculpted bar across the bottom: the hero portrait in a carved frame on the left, the ability row and item grid framed in brass-and-stone filigree in the center and right, stats beneath. Gold in a corner. A day/night clock centered at the top. The minimap in a beveled frame at the bottom corner.
- **Warm brass over dark slate.** The UI palette is dark stone and worn metal with gold accents and faction blue/red highlights, not flat neutral gray.

If a screenshot hits those cues, it reads as Dota before a single hero is modeled. The phasing in §9 front-loads exactly these.

---

## 3. THE LOOK — post-processing and lighting (do this first)

This is the cheap, global, legal half of the overhaul, and it lifts every other surface at once. The post-processing and PBR machinery is specified in `PRESENTATION_SPEC.md §3.1` and `§3.2`; build it from there. This section adds the **Dota color and light direction** that machinery should aim at.

### 3.1 The post-processing stack

Replace the direct `renderer.render` (`scene.ts:161`) with an `EffectComposer`. Every pass ships inside `three/examples/jsm`, so no new dependency. Pass list, tier-gated (§9.6):

- **ACES Filmic tonemapping** with an exposure control. Set first; it fixes the washed highlights bloom would otherwise blow out.
- **Bloom** (`UnrealBloomPass`), tuned tight. This is the highest-leverage single change: emissive spell cores, the shrine crystal, rim-lit edges, and item glows start to read as light. Dota magic glows; this is how.
- **Color grade and vignette** (a small `ShaderPass`): contrast, saturation, and a soft vignette, with **per-region and day/night grade targets** wired into the existing `updateDayNight` palette blend (`scene.ts:464`). Lean warm and green for Radiant-coded regions (Tranquil Vale), cold and blue for Icewrack, dim and red for the Vile Reaches. The grade is the cheapest way to make each region *feel* like a different corner of the Dota map.
- **Ambient occlusion** (`GTAOPass` or `SAOPass`), high tier only: contact shadow where units and props meet the ground. Highest cost, biggest "grounded" payoff.
- **SMAA or FXAA** at the end of the composer, since composer output is not MSAA-resolved.

### 3.2 Lighting for readability

Dota's lighting exists to make units legible from above, not to be physically real.

- **Three-light rig.** Keep the warm key sun and the hemisphere fill already in `scene.ts`. Add a dim, cool **rim/back light** keyed opposite the sun so every unit gets a bright edge against the ground. This one light does most of the "heroes pop" work.
- **PBR materials.** Move `buildUnitRig` and terrain off `MeshLambertMaterial` (`models.ts:44`, `terrain.ts:97`) to `MeshStandardMaterial`, with roughness and metalness per palette role: armor metallic, cloth rough, crystal glossy. Light it with a generated `RoomEnvironment` env map through a `PMREMGenerator` (no file) so surfaces catch spec and rim instead of reading as matte clay. Detailed in `PRESENTATION_SPEC.md §3.2`.
- **Emissive accents.** Drive emissive on weapons, eyes, frost shards, runes, and the shrine, so bloom picks them up for free (`applyItemAppearances`, `models.ts:566`).
- **Contact shadows.** Add a cheap blob/contact shadow under every unit so even shadow-off tiers keep units grounded.

### 3.3 Acceptance for the look

Done when: the composer renders bloom and ACES; emissive VFX and the shrine crystal visibly glow; units carry a rim light and read as distinct from the ground; each region pulls a different day/night-aware grade; and the default tier holds the `SPEC.md §0` 60fps budget with 30 units (verified against `OPTIMIZATION_SPEC.md §D`).

---

## 4. THE UI AND HUD — the Dota command-card skin

The HUD is the most recognizable thing on screen, and it is the cheapest surface to make read as Dota, because it is all DOM and CSS plus canvas-generated textures. No 3D, no models, no licensed art. This is the second phase after the look, and it delivers an outsized share of the "that's Dota" reaction.

All of this lives in `src/ui/hud.ts` and `src/ui/styles.css`. No game logic moves. `PRESENTATION_SPEC.md §5` specs the *animation* of these elements (count-up gold, cooldown sweeps, bar tweens); this section specs the *Dota layout and chrome* they animate within.

### 4.1 The command card (bottom bar)

Reshape the bottom HUD (`renderHeroPanel`, `hud.ts:284`) into Dota's command layout, framed as one sculpted bar across the bottom of the screen:

- **Hero portrait frame, left.** The active hero's portrait in a carved stone-and-brass frame, with the level badge, an attribute-colored ring (red strength, green agility, blue intelligence), and the HP and mana bars beside it with numeric readouts. The portrait can be the generated 2D portrait now and the live hero model render later (§6.4).
- **Ability row, center.** QWER plus D/F in gold-bordered sockets, each with the icon, a **radial (conic-gradient) cooldown sweep** rather than the current bottom-up bar (`hud.ts:310`), the hotkey, the level pips, and the mana cost. Ult slot reads larger and brighter.
- **Item grid, right.** The six item slots as a beveled "bag," plus the neutral-item slot set apart, in the Dota two-row arrangement. Rarity-colored borders matching the loot tiers in `PRESENTATION_SPEC.md §1.5`.
- **Stat block.** Damage, armor, move speed, and the secondary stats under the portrait, in the Dota stat-panel style.

### 4.2 The chrome (how it looks like carved stone and brass)

The Dota frame look is dark slate panels edged in worn gold filigree. Build it without any Valve art:

- **Generated filigree and bevels.** A small set of canvas-drawn border textures (corner brackets, a filigree strip, a brushed-metal fill) generated at startup the way `icons.ts` already generates glyphs, used as CSS `border-image` and backgrounds. Procedural, cached, zero files.
- **Palette tokens.** Extend `:root` in `styles.css:5` with the Dota language: dark stone `#1a1d24`-ish bases, brass and gold accents, Radiant green and Dire red faction highlights, and the existing damage colors aligned to Dota conventions. Keep the dark-fantasy base already there; push it toward stone-and-brass.
- **Typography.** Add a free display face with Dota's engraved-serif feel (Cinzel, Marcellus, or similar) via `@font-face` from a locally bundled `woff2`, used for hero names, the logo, and headers; keep a clean sans for body text. Log the font and its license. Never bundle Reaver or Radiance.
- **Backdrop and depth.** Backdrop blur on panels, layered soft shadows, and an inner glow on active elements, so the HUD reads as sculpted rather than flat (shared with `PRESENTATION_SPEC.md §5.2`).

### 4.3 Top bar and minimap

- **Top bar** (`renderTopBar`, `hud.ts:174`). Center a day/night clock as a small sun/moon arc that tracks `dayTime`. Keep the gold counter as a brass coin pill (the pop and streak animation from `PRESENTATION_SPEC.md §1` already live here). Add a region crest and a row of earned badges. Collapse the dense key-hint string into a toggleable help panel.
- **Minimap** (`renderMinimap`, `hud.ts:196`). Move it to the bottom-left corner in a beveled brass frame (Dota's position), keep the glowing canvas POI dots, add a camera-viewport rectangle and a day/night tint, and support click-to-move and click-to-look (shared with `PRESENTATION_SPEC.md §5.4`).

### 4.4 Party frames, modals, shop

- **Party frames** (`renderParty`, `hud.ts:235`). Portrait with an attribute ring, faction-tinted border, tweened bars, a respawn sweep, and a status-icon row (stun, silence, key buffs).
- **Modals** (`modalShell`, `hud.ts:697`). Reskin the party, codex, journal, talents, services, and menu modals as Dota-style stone scrolls with brass headers and the new type scale. Layout stays; chrome changes.
- **Shop** (`renderShopModal`, `hud.ts:1288`). Lean into Dota's shop: a recipe tree that highlights owned components and what a purchase completes, larger item cards with stat lines, a search and filter, and the rarity-colored borders. Detailed in `PRESENTATION_SPEC.md §6.3`.

### 4.5 Cursor

A Dota-style cursor set (default, move, attack, attack-move, target-select, invalid) as small generated or CC0 images, swapped via CSS on input state. The attack-move mode already exists in input; give it its own cursor.

### 4.6 Acceptance for the UI

Done when: the bottom HUD reads as a Dota command card (framed portrait, gold-bordered ability row with radial cooldown sweeps, beveled item bag); panels wear generated brass-and-stone chrome with the faction palette and a display font; the day/night clock sits centered at top and the minimap in a beveled bottom corner; modals and the shop carry the same skin; and the whole HUD still respects the UI-scale and reduced-motion settings (`PRESENTATION_SPEC.md §7`).

---

## 5. THE WORLD AND ENVIRONMENT — a Dota-style map

The terrain is the second-largest share of the frame after the HUD, and right now it is flat-shaded vertex color (`terrain.ts:97`). Making it read as a Dota map is mostly material and shader work on the heightfield that already exists, plus locally generated or CC0 textures. The 10 regions, 6 biomes, and `RegionDef` data model (`types.ts:609`) stay as they are.

### 5.1 Ground materials

- **Textured PBR ground.** Replace the flat-shaded Lambert with `MeshStandardMaterial` blended across a small set of tiling materials (grass, rock, dirt, snow, sand) chosen by height and slope, the way Dota's map paints lanes, jungle, and cliffs. Drive the blend from a splat weight computed in the existing heightfield loop (`buildTerrain`, `terrain.ts:53`). Add normal maps for relief and let AO (§3.1) settle into the crevices.
- **Local or generated textures.** Prefer textures generated at runtime (noise-based `CanvasTexture` for grass and dirt, deterministic from the region seed) so the world has detail with zero files. Add small CC0 tiling sets only where generation falls short (a good rock or snow normal map). Keep the flat-color path as the low-tier fallback.

### 5.2 The Dota map shapes

- **Paths and lanes.** Carve readable walkable paths between town, camps, gates, and gyms using a distinct ground material, so the world has Dota's "lanes through jungle" legibility instead of an open field. The clearings logic already exists (`terrain.ts:121`); extend it to paint connectors.
- **Tree walls.** Cluster the instanced trees (`terrain.ts:137`) into lines and groves that read as the impassable tree walls of the Dota map, framing the paths, rather than scattering them evenly.
- **Cliffs and a river.** Where the heightfield steps, treat the edge as a lit cliff face (a darker rock material with a rim-lit lip). Coast and grass regions get a river or shoreline as a real water shader (below). This is the single strongest "Dota terrain" cue after the color grade.
- **Faction color.** Push the per-region grade (§3.1) so Radiant-coded regions run warm and verdant and Dire-coded regions run cold and ashen, matching the warm/cold split of the Dota map halves.

### 5.3 Sky, water, props, weather

- **Sky.** Replace the flat `scene.background` color with a gradient sky dome or the `Sky` shader (in `three/examples/jsm`), relit by the day/night cycle, per biome. Specified in `PRESENTATION_SPEC.md §3.4`.
- **Water.** Turn the flat vibe-ring plane (`terrain.ts:104`) into an animated shader: scrolling normals, fresnel, a horizon glow. Coast regions earn it.
- **Props and set dressing.** Upgrade trees and rocks (better instanced GLBs or improved primitive geometry) and add Dota-flavored dressing: ancient statues, glyph stones, rune spots, broken walls, and a fountain-like structure at town so the home base reads like a Dota base. Keep everything instanced (`InstancedMesh`) to hold the budget.
- **Weather.** Per-biome ambient particles relit by day/night: snow in Icewrack, dust in the desert, embers in the Vile Reaches, pollen and fireflies in the forest. Specified in `PRESENTATION_SPEC.md §3.4`; density is tier-gated.

### 5.4 Acceptance for the world

Done when: terrain renders as textured PBR ground blended by height and slope with normal-mapped relief; paths and tree walls give the map Dota-style lane legibility; a sky shader and animated water replace the flat background and plane; at least one biome shows ambient weather; the town reads as a base; and the 60fps/30-unit budget holds at the default tier.

---

## 6. THE HEROES — resemblance, two paths, fallback always on

This is the slow, expensive surface, and it is gated behind the legal line in §1.1. The plan keeps the procedural rig as the permanent fallback and adds a real model path on top, so the build is always playable whether or not a hero has a finished model.

### 6.1 Make the procedural rig the strong baseline

Most heroes will render procedurally for a long time, so the procedural path itself must look good under the new lighting.

- **PBR and emissive.** With §3.2 done, the primitive rigs get `MeshStandardMaterial`, an env map, rim light, and emissive accents. A primitive hero under good light and bloom already reads far better than today's matte clay.
- **Expand likeness overlays.** Grow `applyHeroLikeness` (`models.ts:337`) from 9 heroes toward the full 65, in priority order: the 3 starters, then the rest of the Phase 1 six, then gym leaders and Elite Five, then the remaining roster. Each overlay evokes the Dota silhouette, gear, weapon, and colors (the data is already there: `silhouette` and `palette` on every hero, `types.ts:450`). The bar is "named on sight," not a copy.
- **Per-hero color discipline.** Audit each hero's three-color palette against its Dota identity so the silhouette plus palette plus overlay reads correctly even before any GLB exists.

### 6.2 Wire the dormant glTF pipeline

`src/engine/assets.ts` already has the loader and manifest; nothing calls it. Connect it:

- **Hook into view creation.** In `GameScene.createView` (`scene.ts:245`), when a GLB exists for the hero, load it async through `HeroAssetLoader`, and swap the procedural rig for the loaded model once it resolves. Until it resolves, and forever if it never does, the procedural rig stands in. No load state ever blocks gameplay.
- **One rig contract.** Make `UnitRig` (`models.ts:10`) an interface that both the procedural rig and a GLB-backed rig satisfy (root group, named sockets, a height, a way to drive pose). The animator and item-overlay code then treat both the same.
- **Skeletal animation.** For GLB heroes, drive an `AnimationMixer` and map clips (idle, run, attack, cast, channel, death, and signature ability clips) to sim state, timed to `attackPoint` and BAT exactly as the procedural animator reads them today (`PRESENTATION_SPEC.md §3.5` and `SPEC.md §9 Feel pass`). Item appearance geo (`applyItemAppearances`) attaches to named model sockets (weapon, back, shoulder) instead of the procedural `itemLayer`.

### 6.3 Sourcing hero models (the legal, practical part)

- **Start tiny.** Ship local GLBs for the 3 starters first (Juggernaut, Crystal Maiden, Sniper), then a few iconic heroes (Pudge, Earthshaker, Lich, Axe, Sven, Luna). Prove the pipeline and the look before scaling.
- **Where they come from.** Generated/downloaded rigged models, or CC0 "archetype" base meshes (a masked swordsman, a robed mage, a heavy bruiser) retextured to the hero's palette and fitted with our gear. Resemblance through our assets, never Valve's files (§1.1).
- **Budget.** Each hero GLB stays small (low-poly-plus-normal-map at action-RPG scale, a few MB), lazy-loaded on first appearance, and counts against the per-tier asset budget (§7). The repo and the no-asset fallback both stay healthy.

### 6.4 Creeps, bosses, and the title

- **Creeps and bosses** get the same treatment at lower priority: PBR and overlays first, GLBs later for the marquee raid bosses (Roshan, the Lord of Terror) where the payoff is highest.
- **Title and starter pick.** Once a few hero GLBs exist, the title screen and starter pick render the **live rotating hero model** instead of the 2D portrait (`PRESENTATION_SPEC.md §6.1`), which sells the model work directly.

### 6.5 Acceptance for heroes

Done when: procedural heroes render with PBR, rim light, and emissive under the new stack; likeness overlays cover at least the starters plus all gym and Elite leaders; the glTF pipeline is wired so a present GLB loads, rigs, and animates while an absent one falls back to procedural with no gameplay hitch; item geo attaches to model sockets on GLB heroes; the three starters ship as recognizable local rigged models; and the build runs cleanly with zero GLBs present.

---

## 7. THE VFX LANGUAGE — Dota's bright, telegraphed magic

Dota spells glow, trail light, and paint the floor before they hit. The current archetypes are primitive geometry under normal alpha blending with no glow and flat-disc zones (`vfx.ts`). The richness upgrade (additive blending, soft particles, trails, pooled) is specified in `PRESENTATION_SPEC.md §3.3`; build it there. This section adds the **Dota-specific reads** on top.

- **Everything glows.** Switch transient materials to `AdditiveBlending` so bursts, beams, and bolts read as light. With bloom (§3.1) on, a Dota-bright spell flash falls out for free.
- **Ground telegraphs.** This is the signature Dota cue. Every ground-targeted ability paints a bright ring or shaped decal on the floor during its cast, and AoE zones (`spawnZone`, `vfx.ts:455`) render as textured decals with an animated rim instead of flat discs. A Ravage arc, an Echo Slam ring, a Fissure line, and a targeting circle all read instantly as "something lands here."
- **Projectile trails.** A fading ribbon or stretched billboard behind pooled projectiles (`vfx.ts` projectile pool) so a Hook, a Mirana arrow, or a Sacred Arrow reads as motion and direction.
- **Dota damage colors.** Align VFX and floater colors to the conventions a Dota player expects: physical white and orange, magical blue and purple, pure white, with element tints (Cryo glassy blue, Pyro orange, Electro violet) where Resonance is on (`SPEC.md §9`).
- **Cast-target indicators.** The cursor-attached range ring and ground-target shapes that Dota shows while you aim a spell, drawn on the ground under the cursor during targeting (the targeting state already exists in input).

Keep the data-parameterized contract from `SPEC.md §2`: archetypes stay driven by `VfxSpec` color, scale, and archetype. Pool by archetype so the additive upgrade does not add GC churn (this is also `OPTIMIZATION_SPEC.md §B.2`).

Acceptance: bursts, beams, and projectiles use additive blending and pooled geometry; projectiles trail; ground-targeted abilities and AoE zones render as textured telegraph decals with animated rims; damage colors follow Dota conventions; and the transient-VFX cap and 60fps budget hold.

---

## 8. CAMERA AND READABILITY

The camera frames the whole look. The follow/map modes already exist (`updateCamera`, `scene.ts:512`); the work is tuning the follow mode to Dota's feel and locking in readability.

- **Dota-angled follow.** Tune the follow camera to Dota's fixed angled top-down: a steeper pitch than a third-person view, hero roughly centered, clamped zoom range, no free pitch. The map mode stays the near-top-down strategic view.
- **Readability rules, enforced.** Team-color selection rings under every unit (already present, `buildSelectionRing`, `models.ts:703`), the rim light from §3.2, an outline or highlight on hover and selection, and HP bars that stay legible at the locked zoom. A Dota frame is never ambiguous about who is where.
- **Smoothing and feel.** The follow smoothing, look-ahead, screenshake, and big-cast push-ins are owned by `PRESENTATION_SPEC.md §4.1` and `§4.4`; this spec just sets the resting angle and zoom they operate from.

Acceptance: the default camera sits at a Dota-style locked angle and zoom with the hero centered; units read clearly against terrain via rings, rim light, and hover highlight at that zoom.

---

## 9. LOCAL ASSETS, TEXTURES, AND PERFORMANCE

The asset strategy that makes Approach C safe. The rule above all others: **the build must run, and look intentional, with zero asset files present.** Assets are an enhancement layer over a procedural base that always works.

### 9.1 Directory layout

Vite serves `public/` at the site root, which matches the URLs already in the manifest (`PHASE5_STARTER_ASSETS` points at `/assets/heroes/*.glb`, `assets.ts:21`). Use:

```
public/assets/
  heroes/      hero GLB models + their texture sets
  creeps/      creep + boss GLBs (later)
  env/         tiling terrain textures, normal maps, sky gradients
  ui/          fonts (woff2), any non-generated UI textures
  textures/    shared PBR maps
ASSETS.md      manifest: every file, its source, and its license
```

### 9.2 Generated-first, files-second

Prefer assets we make in code over files on disk, because they weigh nothing and carry no license:

- **Textures from canvas and noise.** Grass, dirt, and rock albedo and the UI filigree are generated at startup (deterministic from a seed), the way `icons.ts` already generates glyphs. `CanvasTexture` and a small noise helper cover most of it.
- **Environment map from `RoomEnvironment`.** PBR lighting needs an env map, and three generates one with no file via `RoomEnvironment` + `PMREMGenerator`.
- **Files only where generation falls short.** A genuinely good rock or snow normal map, a hero GLB, a display font. Each one is justified and logged.

### 9.3 Sourcing and licensing (the hard rule, restated)

Every file in `public/assets/` is generated in-repo or permissively licensed (CC0, or CC-BY with attribution). Never Valve's or Blizzard's shipped files: not models, not textures, not icons, not the Reaver or Radiance fonts, not sounds. Heroes resemble their archetype through our assets (§1.1, `SPEC.md §9`). `ASSETS.md` records the source and license of every file, and a test can scan it so an unlicensed asset cannot slip in. The existing "no asset imports in source" guard (`src/test/data-lint.test.ts`) stays; assets load at runtime from `public/`, not through `import`.

### 9.4 Asset budget and loading

- **Per-tier weight cap.** Set a ceiling on total asset weight per quality tier, logged in `DECISIONS.md`. The low tier may load no GLBs at all (procedural only); higher tiers load progressively more.
- **Lazy load.** Hero GLBs load on first appearance, not at boot, through the existing `HeroAssetLoader` cache (`assets.ts:27`). Terrain textures load per region on entry.
- **Always interruptible.** A pending or failed load never blocks gameplay; the procedural form renders until (and unless) the asset arrives.

### 9.5 The no-asset guarantee

A test and a manual check both confirm: with `public/assets/` empty, the game boots, every hero renders procedurally, terrain uses generated or flat-color materials, and no request errors appear in the console. This is the property `assets.ts` was designed for and the reason Approach C is safe to pursue incrementally.

### 9.6 Quality tiers and auto-downshift

Extend `PERFORMANCE_BUDGET` and the existing `low / medium / high` presets (`src/engine/performance.ts`) with an `ultra` tier, and gate every cost in this spec through them. This is the same tier system `PRESENTATION_SPEC.md §7.1` calls for; build it once, both specs use it.

| Knob | low | medium | high | ultra |
|---|---|---|---|---|
| Post-processing | tonemap only | + bloom | + grade/vignette | + AO |
| Bloom resolution | — | half | half | full |
| Shadows | off | basic | PCF | PCF, larger map |
| Hero models | procedural only | procedural + key GLBs | GLBs where present | all GLBs |
| Terrain textures | flat color | generated | generated + normals | + CC0 detail |
| Weather particles | off | sparse | full | full |
| Pixel ratio clamp | 1 | 1.5 | 2 | 2 |

Auto-downshift when frame time blows the `SPEC.md §0` budget, per `OPTIMIZATION_SPEC.md §B.5`. The headless core is untouched; all of this lives in the engine and reads from `GameSave['settings']`.

---

## 10. PHASING AND ACCEPTANCE

Ordered by felt Dota-ness per unit of effort and risk. Each phase ships playable on its own and front-loads the cheap, global, legal wins.

1. **The look (§3).** Post-processing (ACES, bloom, grade, vignette), PBR materials, env map, rim light, contact shadows. Whole-frame lift, no assets, no legal risk. The fastest path to "that's Dota."
2. **The UI and HUD skin (§4).** The command-card layout, brass-and-stone chrome from generated textures, the faction palette and display font, the centered day/night clock, the beveled minimap. Pure DOM, CSS, and canvas; the most recognizable surface for the least technical risk.
3. **The world (§5).** PBR terrain materials blended by height and slope, paths and tree walls, sky shader, animated water, a base-like town, one biome's weather. Mostly generated textures.
4. **The VFX language (§7).** Additive glow, projectile trails, and the signature ground telegraph decals. Folds in `PRESENTATION_SPEC.md §3.3` and the VFX pooling from `OPTIMIZATION_SPEC.md §B.2`.
5. **Hero fidelity (§6).** PBR procedural heroes, likeness overlays expanded to the leaders, the glTF pipeline wired with fallback, and the three starters shipped as local rigged models with skeletal animation.
6. **Settings, tiers, and budget (§9.6).** The quality tiers, the asset budget, auto-downshift, and accessibility caps that keep every prior phase scalable and safe. Shared with `PRESENTATION_SPEC.md §7`.

Camera tuning (§8) is small and lands alongside phase 1.

**The overhaul is done when:** a Dota player looks at a screenshot and names the game and the region on sight; the bottom HUD reads as a Dota command card with framed portrait, gold-bordered abilities, and a beveled item bag; the frame glows and grades with bloom, ACES, and per-region color; the terrain reads as a painterly Dota-style map with lanes, tree walls, sky, and water; spells paint bright ground telegraphs and trail light; the three starter heroes load as recognizable local rigged models with procedural fallback intact; the `SPEC.md §0` 60fps-with-30-units budget holds at the default tier; the game still boots and looks intentional with zero asset files present; and `npm test`, `npm run build`, the browser smoke, and the headless-core boundary and determinism tests all stay green.

## 11. DEPENDENCIES AND DECISIONS TO LOG

**Dependencies.** The post-processing stack, `RoomEnvironment`, `PMREMGenerator`, the `Sky` shader, and `GLTFLoader` all ship inside `three/examples/jsm`, so no new package is required for the rendering work. A display font is a small bundled `woff2`. Hero GLBs and any CC0 textures are data files under `public/assets/`, not npm dependencies. If a small tween or texture helper is worth a dependency, decide and log it.

**Log in `DECISIONS.md` as they land:**

- The Approach-C strategy and the resemblance-not-replication legal line, with `ASSETS.md` as the licensing record.
- The post-processing pass list and the per-tier on/off matrix (§9.6).
- The Dota color tokens and the chosen display font and its license.
- The glTF wiring point in `GameScene.createView` and the procedural-fallback contract.
- The asset directory layout, the per-tier weight cap, and the lazy-load policy.
- Each hero GLB and CC0 texture added, its source, and its license.
- Confirmation that the headless core and the boundary and determinism tests are untouched by all of it.

## 12. PRINCIPLES

- **The core is sacred.** Everything here is engine-side and UI-side. The headless deterministic core (`SPEC.md §1.1`) never imports `three`, never reads visual data, and never changes a combat result. The boundary and determinism tests are the contract.
- **Resemblance, not replication, and never Valve's files.** Heroes and the world evoke Dota through generated or CC0 assets. The bar is "named on sight," not a copy, and a copy is neither legal nor wanted.
- **The look before the models.** Most of the Dota feeling lives in light, color, chrome, terrain, and VFX, which are cheap and global. Hero models are the slow, expensive long tail. Front-load the cheap wins.
- **Procedural is the floor, assets are the ceiling.** The game always runs and looks intentional with no asset files. Assets enhance; they are never required.
- **Readability first.** Dota's art serves clarity from above. Every choice keeps units legible: rings, rim light, high contrast, clean telegraphs. Juice that hides what happened is noise.
- **Scale gracefully.** Every system has a tier and an off switch. Great on a strong machine, smooth and playable on a weak one.
- **Ship playable slices.** Each phase is felt the moment it lands. Start with the light.

---

## 13. ASSET SOURCING — competitive read and the stylized-grounded plan (2026-06-13)

We studied a shipped peer, `worldofclaudecraft.com` (open source as `levy-street/world-of-claudecraft`, MIT), to settle one question: when we want a richer look, do we generate better assets or source them? The answer the peer demonstrates is **source curated CC0 packs through an optimization pipeline, on top of the post stack we already have.** Generation stays our floor (the no-asset fallback, audio, and UI chrome); files are the ceiling for 3D models, terrain, and sky. This section records what the peer proves, where we actually stand, the art direction we picked, and the concrete plan.

### 13.1 What the peer proves

That game is a WoW-Classic micro-MMO, so its classes (warrior, mage, rogue) map straight onto generic fantasy archetypes. Its visual quality comes from three things, none of which is "better procedural generation":

1. **Curated CC0 asset packs (the dominant lever).** Every bundled asset is CC0 except the three.js water normals (MIT). It ships ~170 GLB models, 7 PBR terrain sets, and 8 HDRIs, about 90 MB after optimization. Character GLBs land near 1.6–2 MB, creatures near 340 KB, terrain JPGs near 2 MB.
2. **An asset build pipeline.** A spec-driven Node script runs `@gltf-transform` (resample, prune, dedup, meshopt) plus `sharp` (resize to webp) over raw downloaded packs, emitting only optimized files into `public/`. Raw packs stay gitignored; a generated manifest plus a cached loader serve them at runtime.
3. **A post stack plus procedural audio.** EffectComposer with N8AO, UnrealBloom, an ACES OutputPass, and a grade pass. Audio ships zero files: procedural WebAudio SFX and a procedural orchestral score with per-zone themes and a combat layer.

The pack sources, recorded so we can reuse the exact families (they share one chunky stylized look, which is why the peer reads as cohesive):

| Surface | Source (CC0 unless noted) | Pack |
|---|---|---|
| Characters + animations | KayKit (Kay Lousberg) | Character Pack Adventurers, Character Pack Skeletons, Rig_Medium animation library |
| Modular dungeon, props | KayKit | Dungeon Remastered, Halloween Bits |
| Creatures (animated) | Quaternius | wolf, bull, fox, stag, spider, goblin, orc, dragon, etc. |
| Trees, rocks, bushes, grass | Quaternius | Stylized Nature MegaKit |
| Town buildings, market, cart | Quaternius | Medieval Village Pack |
| Barrels, crates, furniture | Quaternius | Fantasy Props MegaKit |
| Cliffs, town/castle/pirate kits, VFX sprites | Kenney | Nature Kit, Fantasy Town Kit, Castle Kit, Pirate Kit, Particle Pack |
| Terrain PBR (color/normal/roughness/AO) | ambientCG | Grass001, Ground048/071/080, Rock051, PavingStones046, Snow010A |
| Sky / IBL | Poly Haven | HDRIs per zone (day, dusk, overcast, night) |
| Water normals | three.js authors (MIT) | `waternormals.jpg` and friends |

### 13.2 Our baseline (what is already done)

We are closer than the peer's head start suggests, because we already built the expensive half. The post stack, ACES, bloom, grade, SMAA, the `RoomEnvironment` IBL fill, PBR materials, the water shader, the generated ground-detail texture, and the glTF loader wired into `createView` with a tested procedural fallback are all live (see the §0 note). We ship no asset files yet. So our work is to feed the pipeline, not to build it.

### 13.3 The direction: stylized-but-grounded

We commit to one coherent CC0 family in the chunky stylized lineage (Quaternius, KayKit, Kenney are mutually compatible), kept grounded by our existing PBR terrain, HDRI lighting, bloom, and AO. This reads "stylized but grounded," which is the closest practical match to Dota's stylized-yet-readable feel and avoids the trap of mixing clashing packs. Pure photoreal is off the table (no cohesive CC0 source, and it fights the instant-boot promise); pure mobile-stylized is grounded back toward Dota by the post stack we already run.

Cohesion is a hard rule: every model we add comes from that family or is retextured to sit in it. One off-family asset that clashes is worse than a primitive.

### 13.4 Generate vs. find online, by surface

| Surface | Verdict | Why |
|---|---|---|
| Terrain materials | Find (ambientCG CC0) | Real grass/rock/dirt/snow with normal + roughness + AO beats our grayscale grain; drop-in over the existing height/slope loop. |
| Foliage, rocks, props, town | Find (Quaternius/Kenney CC0) | Replaces cone-trees, dodeca-rocks, box huts; biggest silhouette win. |
| Generic creeps / neutral creatures | Find (Quaternius CC0) | Wolves, boars, spiders, golems map cleanly; no IP debt. |
| Sky / ambient light | Find (Poly Haven HDRI) | Real IBL sky reads richer than `RoomEnvironment`; per-region day/dusk/night. |
| VFX telegraph sprites | Hybrid | Generate cheap sprites numerically (`DataTexture` flipbooks) for common bursts/decals; pull the Kenney Particle Pack (CC0) atlas for heavy impacts/smoke/explosions. Soft additive sprites + shaped ground decals for the §7 Dota telegraph language. |
| Named Dota heroes | Hybrid | A few CC0 archetype base meshes (KayKit Adventurers — knight/mage/rogue/bruiser) retextured to each hero's palette + our gear, reused across many heroes that share a silhouette; resemblance via our assets, never Valve files (§1.1); procedural fallback stays. |
| Audio (SFX + music) | Hybrid (procedural floor + CC0 ceiling) | Procedural stays the floor (no-asset boot; the existing synth SFX): add a synthesized per-zone music bed, a reverb send, and ambient beds with zero files. Layer a small curated CC0 sample set (heavy impacts, music stems) on top where synthesis falls short, each logged in `ASSETS.md`. |
| UI chrome, icons, cursors | Generate | Canvas filigree and glyphs as today; DOM/CSS, zero weight. |

### 13.5 The sourcing plan (ordered by payoff per unit of effort and risk)

This refines §10's phasing with pack-level specifics. Each phase ships playable and holds the §0 60fps/30-unit budget at the default tier.

**Status (2026-06-13): Phases 0–3 shipped and verified in-browser at ~12MB total committed assets.** Render-side async loaders live in `asset-loaders.ts` (`loadTex`/`loadHdr`/`loadModel` + meshopt decoder + `SkeletonUtils`-safe `cloneModel`); every loader is browser-guarded and resolves null so the procedural floor is always the fallback. The remaining work is broken down below with its scope decisions locked (2026-06-13): the skeletal-animation **keystone** (Phase 3.5) that animates the already-shipped creep GLBs and unblocks heroes; the VFX + audio surface (Phase 4); and heroes (Phase 5). Locked calls: hero GLBs as a few **CC0 archetype bases retextured across many heroes**; audio as a **procedural floor plus a small CC0 sample layer**; VFX sprites **hybrid** (generated cheap + Kenney CC0 for heavy impacts).

- **Phase 0 — Pipeline and budget. [DONE]** Dev deps (`@gltf-transform/*`, `meshoptimizer`, `sharp`), `scripts/assets/build_assets.mjs`, `public/assets/{heroes,creeps,props,env,textures,ui}`, `ASSETS.md` ledger, and `tmp/asset_src/` gitignored. Loaders + meshopt decoder wired.
- **Phase 1 — Terrain textures + HDRI sky. [DONE]** ambientCG PBR (color/normal/roughness) per biome over the heightfield (`terrain.ts`, `applyTerrainPBR`), vertex bands eased toward neutral so the albedo reads; flatShading drops once maps load. Poly Haven `vale_day_1k.hdr` → PMREM → `scene.environment` (`installHdrEnvironment`), with the day/night cycle still driving `environmentIntensity`. (Single set per biome rather than full height/slope splat; `night_1k.hdr` vendored for later per-cycle env swap.)
- **Phase 2 — Foliage, rocks, props, town. [DONE]** Quaternius trees/rocks instanced over the same deterministic placements (`swapToInstancedModels` + `instancedFromModel`); the box-town swaps to Medieval Village buildings (`swapTownBuildings`). Instanced primitives / box huts stay live until GLBs load. (Billboard grass tufts still TODO.)
- **Phase 3 — Creeps and neutral creatures. [DONE]** 36 creeps map onto Quaternius creatures via `creepCreatureUrl` (id override → silhouette-build fallback), mounted on the rig with `mountHeroModel` + `cloneModel`. Static rest pose for now; clips driven off sim state is the next refinement (shared with Phase 5).
- **Phase 3.5 — Skeletal animation bridge (the keystone). [TODO]** Today nothing drives skeletons: `animateRig` is pure math on the procedural rig's named parts, and `mountHeroModel` parents a loaded GLB to `rig.body` while hiding the procedural limbs — so the 20 Quaternius creature GLBs already shipped in Phase 3 render as **static, bobbing statues**, and any hero GLB would too. No `AnimationMixer` exists anywhere in `src/`. This phase makes authored clips play, driven off the sim timing the animator already reads. It ships almost no new assets, instantly animates the creeps already in the repo, and is a hard prerequisite for Phase 5.
  - Extend `UnitRig` with an optional `mixer: THREE.AnimationMixer` + an `actions` clip map (idle/run/attack/cast/channel/death); tick the mixer when present.
  - In `mountHeroModel`, when the GLB carries clips, build the mixer and map clips by name (the build pipeline already supports `keepClips`/`renameClips`).
  - Add a clip-driven path in `animator.ts`: crossfade idle↔run by measured speed; trigger the attack clip so its contact frame lands at `attackPoint`/BAT; fire cast/channel/death on the same `castingUntil`/`channel`/`alive` state the math animator branches on — honoring the §3.0 timing contract so the animation stays an honest tell.
  - Procedural math stays the fallback for primitive rigs (the no-asset floor and every GLB-less hero), selected by whether `rig.mixer` exists.
- **Phase 4 — VFX + audio surface. [TODO]** Two independent tracks, neither with asset-sourcing legal friction. Decisions locked 2026-06-13: VFX sprites **hybrid**; audio **procedural floor + small CC0 sample layer**.
  - *Spell/item VFX (§7).* Add an animated-billboard sprite layer (flipbook UV scroll) for impacts, explosions, smoke, sparks, and magic circles — generated numerically as `DataTexture` atlases where cheap, with the Kenney Particle Pack (CC0) atlas for the heavy impacts/smoke. Replace the single generic disc+rim+spokes telegraph with **shaped** per-archetype ground decals (line for Fissure, cone for a nuke, arc for Ravage). Grow projectiles beyond `hook`/`orb` (arrows as stretched billboards, bolts, comets) with element-tinted ribbon trails on the existing pool. Tint projectiles/telegraphs/impacts by element and give reactions (Vaporize/Melt/Overload) their own burst sprites — those events already fire. Pool everything; hold the transient cap.
  - *Audio (§3.12).* Add a `ProceduralMusic` layer: a synthesized per-region/biome bed keyed off `RegionDef`, with a combat-intensity layer that fades in during fights (the peer's model), on a real `music` channel (or the repurposed `stinger`). Add a reverb send (`ConvolverNode` with a generated impulse, or feedback-delay) with a per-zone wet level so SFX stop reading dry. Add filtered-noise ambient beds per biome tied into day/night + the existing weather particles. Layer the thin single-sweep cast voices (body + transient + tail) and give signature ults a bigger moment. Procedural is the floor; a small curated **CC0 sample set** (heavy impacts, music stems) layers on top where synthesis falls short, each logged in `ASSETS.md`.
- **Phase 5 — Heroes (the long tail). [TODO; depends on Phase 3.5]** Approach locked 2026-06-13: a few **CC0 archetype base meshes retextured across many heroes**, not one bespoke model per hero. Author specs for the KayKit Adventurers bases (knight/mage/rogue/bruiser — the same family as the Phase-3 creeps), run `build_assets.mjs`, retexture each to a hero's three-color `palette` and fit our gear, and reuse one base across every hero sharing its silhouette. Flip the finished heroes on in `ENABLED_HERO_MODELS` (still empty today); the wired loader (`heroAssetEntry` → `HeroAssetLoader` → `mountHeroModel`) swaps them with the procedural fallback intact, and the Phase 3.5 mixer animates them. Attach likeness-overlay bits and item-appearance geo to named GLB sockets (weapon/back/shoulder) rather than the procedural `itemLayer`. In parallel and regardless of GLBs, **expand `applyHeroLikeness`** from 9 heroes toward the gym leaders + Elite Five (pure geometry, zero assets) so the GLB-less majority reads better under the new lighting. Keep the procedural rig the strong baseline for everyone not yet modeled.

**Budget:** target 60–90 MB committed, tier-gated (now including a handful of archetype hero GLBs + textures, the Kenney sprite atlas, and the small CC0 audio sample set). The low tier loads no GLBs, no samples, and runs fully procedural, preserving the §9.5 no-asset boot guarantee.

### 13.6 Guardrails (unchanged from the rest of this spec)

- The build boots and looks intentional with `public/assets/` empty; a test and a manual check confirm it (§9.5).
- Every file is generated in-repo or CC0/CC-BY, logged in `ASSETS.md`; never Valve's or Blizzard's files (§1.1, §9.3).
- The headless core stays untouched; the boundary and determinism tests are the contract (§12).
- One coherent stylized family; retexture anything off-family or leave it procedural (§13.3).

