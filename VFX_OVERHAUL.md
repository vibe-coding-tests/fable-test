# VFX & Visuals Overhaul

Status: finish-line tracker.

The original overhaul plan started when the game had a complete roster and a
mostly generic presentation layer. The codebase has since shipped the procedural
overhaul, the first asset batch, and the HUD icon pass. This document now tracks
the current state and the small amount of work that remains.

## Goals

- Every shipped hero should read as a recognizable unit at gameplay zoom.
- Every signature spell should have a distinct color, shape, icon, cast pose, and
  sound cue.
- Important items should change the visible model or attack feedback.
- The scene should look richer on medium and high tiers while the low tier keeps
  the procedural fallback and performance budget.
- Real assets should raise fidelity where they pay off, with procedural rigs and
  no-asset boot kept intact.

## Shipped State

| Area | Current state |
| --- | --- |
| Hero likeness | 122 / 122 heroes have `HERO_LIKENESS_PROFILES`; 122 / 122 now add procedural likeness geometry in `applyHeroLikeness`. |
| Attack animation | Weapon-driven attack styles are in `animator.ts`; there are no heroId branches in the attack path. |
| Cast animation | Signature casts use `anim` plus `gestureForAbility` fallback for generated kits and item actives. |
| Spell VFX | Base archetypes plus `vortex`, `dome`, and `mine` are implemented in types, renderer, icons, and lint coverage. |
| Icons | Ability icons use an explicit or inferred `glyph` plus an effect mark; every hero ability now receives a glyph hint during data normalization. |
| Portraits | `heroPortrait` draws a silhouette bust from palette and `SilhouetteSpec`; the letter portrait is only a fallback. |
| Items | High-value items have broad visible coverage: 43 `appearance` entries and 23 `attackVisual` entries after the finish-line pass. |
| Scene polish | Rim light, grade pass, bounded shake, per-element grade accent, telegraph variants, and shaped particle sprites are wired and tier-gated. |
| Assets | Asset pipeline, `ASSETS.md`, `public/assets/`, six starter hero GLBs, creep GLBs, terrain, HDRIs, town props, and loader fallback are shipped. |
| Tests | Coverage exists for full-roster likeness profiles, WS-G signature archetypes, ability glyph coverage, asset manifests, boundary rules, item visuals, and no-asset fallback. |

## Procedural Systems

### Unit Models

`src/engine/models.ts` builds every unit from procedural primitives. Each hero
keeps a base silhouette from data and receives extra parts through
`applyHeroLikeness`.

Current roster coverage:

- `HERO_LIKENESS_PROFILES`: 122 / 122.
- `applyHeroLikeness` geometry cases: 122 / 122.
- The model smoke test checks that every hero adds detail beyond the base rig.

The code already includes helper closures for common high-cost reads:
`tailSerpent`, `mountQuad`, `gunArm`, `wings`, `horns`, `crownSpikes`, `cape`,
and shared weapon builders. That means the planned `gun`, `mount`, and `tail`
silhouette vocabulary entries are no longer needed for the current shipped
roster.

### Animation

`src/engine/animator.ts` derives attack style from the rig:

- `heavy-chop` for cleavers, totems, broad cleavers, storm hafts, and brute
  melee.
- `sword-slash` for swords and glowing blades.
- `hook-fling` for hooks.
- `rifle-shot` for rifles and long-range fallback.
- `staff-jab` for staffs and long poles.
- `creature-lunge` for quad/blob no-weapon melee.
- `bird-dive` for bird rigs.
- `generic-strike` as the last fallback.

This preserves attack timing. The change affects pose shape only.

Cast animation is data-first. Explicit `anim` wins; `gestureForAbility` fills the
rest from targeting, effects, and VFX archetype.

### Spell VFX

`VfxArchetype` now has 15 entries:

- Base: `projectile`, `ground-aoe`, `chain`, `beam`, `summon-pop`, `shield`,
  `stun-stars`, `channel`, `global-mark`, `hook`, `wall`, `storm`.
- Added: `vortex`, `dome`, `mine`.

The added archetypes are fully wired:

- `vortex` for Black Hole, Reverse Polarity, Vacuum, Rolling Thunder, and similar
  pull reads.
- `dome` for Chronosphere, Arena of Blood, Static Storm, and containment zones.
- `mine` for armed ground charges and Techies-style traps.

`src/engine/vfx.ts` also has telegraph variants:

- `ring` default.
- `spiked` for stun stars.
- `hatched` for walls and lines.
- `dotted` for mines.

Particle sprites are generated numerically as `soft`, `ember`, `snow`, and
`shard`, so fire, frost, storm, and reaction bursts no longer share one spark.

### Icons And Portraits

Ability icons now have two layers:

- Primary glyph from `AbilityDef.glyph` or `glyphForAbility`.
- Secondary mark from dominant effect: stun, summon, heal, displace, slow, or
  none.

`withElementTags` in `src/data/index.ts` now fills `glyph` for every hero
ability. Explicit hand-authored glyphs can still override the inferred value.

Portraits are silhouette busts. They use head shape, weapon hint, extras, eyes,
and palette. When a live GLB portrait path exists, it should replace the
implementation behind `heroPortrait` rather than adding a second portrait API.

## Items

The item visual pass is broad enough for the shipped game.

Current coverage:

- `appearance`: 43 items.
- `attackVisual`: 23 items.
- Lint floor: at least 30 appearance entries and at least 20 attack overrides.

High-value visible items include:

- Battlefury, Divine Rapier, Crystalys, Daedalus, Desolator, Maelstrom, Mjollnir,
  Radiance, Butterfly, Heart of Tarrasque, Shiva's Guard, Force Staff, Eul's
  Scepter, Manta Style, Abyssal Blade, Silver Edge, Echo Sabre, Bloodthorn, and
  more.

The remaining item work is polish, not coverage:

- Add bespoke active-only visuals if a future item active feels under-read.
- Consider a new item part only when several items share the same missing shape.
- Keep core logic free of `appearance` and `attackVisual` reads.

## Scene And Performance

The scene stack includes:

- ACES tone mapping.
- Bloom.
- Color grade and vignette on tiers that enable it.
- SMAA.
- HDRI/IBL upgrade path.
- Cool rim light for unit separation.
- Bounded camera shake for crits and major impacts.
- Per-element grade accent during big casts.

Everything extra is tier-gated through `src/engine/performance.ts` and respects
the low-tier procedural floor.

## Assets

The asset pipeline is live:

- `scripts/assets/build_assets.mjs` optimizes GLBs and textures.
- `public/assets/manifest.json` records built assets.
- `ASSETS.md` tracks source, license, processing, and provenance.
- `HeroAssetLoader` uses meshopt and returns `null` on failure.
- `mountHeroModel` hides the procedural rig and mounts the authored model while
  preserving fallback.
- `heroAssetEntry` only resolves enabled hero models.

Currently enabled hero GLBs:

- `juggernaut`
- `crystal-maiden`
- `pudge`
- `earthshaker`
- `sniper`
- `lich`

Current asset footprint is about 20 MB and covers starter heroes, creeps, HDRIs,
terrain, foliage, and town props.

## Finish-Line Definition

The VFX overhaul is complete for the procedural game when these stay true:

- `npm run typecheck` passes.
- `npm test` passes.
- Every hero has a profile and geometry overlay.
- Every hero ability has a glyph hint.
- Item visual coverage stays above the lint floor.
- Boundary tests confirm `/src/core/` stays renderer-free.
- No-asset boot and GLB fallback stay green.
- Low tier keeps the frame budget with rich effects disabled or reduced.

The finish-line pass completed the last concrete gaps:

- Added Mars likeness geometry.
- Tightened model smoke coverage so missing overlays fail.
- Added visual appearances for Eul's Scepter, Manta Style, Abyssal Blade, Silver
  Edge, Echo Sabre, and Bloodthorn.
- Added inferred per-ability glyph hints for the full shipped hero roster.

## Future Work

These are optional fidelity upgrades, not blockers for the overhaul:

1. Add more hero GLBs, one at a time, starting with iconic raid and boss-facing
   heroes. Keep `ENABLED_HERO_MODELS` small and gated.
2. Add marquee raid boss GLBs before broad hero GLB expansion.
3. Add live GLB portraits behind `heroPortrait` once the model render path is
   available.
4. Add remote/CDN asset loading if the local asset budget approaches the
   60-90 MB target.
5. Add sampled audio through a separate budgeted loader if synth audio stops
   carrying the signature read.

## Maintenance Notes

- Keep new visual content data-first when the existing vocabulary can express it.
- Add a vocabulary entry only when multiple shipped abilities or items need the
  same missing shape.
- Track every committed or remote asset in `ASSETS.md`.
- Keep procedural fallback as the boot floor.
- Run typecheck, tests, and build after each asset or renderer batch.
