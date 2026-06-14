# Sound Map

All hero, creep, and item-active casts resolve through `soundForAbility()` into
one `SoundArchetype`. `CAST_SFX_BY_SOUND` then maps that archetype to a sampled
cast cue. `ProceduralAudio.castVoice()` layers that sample with the existing
synth voice, so low tier, headless runs, missing files, and decode failures
still have sound.

## Cast Archetypes

- `blade`: weapon slashes, attack modifiers, melee spell strikes.
  Generated fallback: `audio/sfx/cast-blade.wav`. Curated variants: Kenney
  blade draw and slice sounds.
- `bow`: arrows, bullets, thrown projectiles, and ranged releases.
  Generated fallback: `audio/sfx/cast-bow.wav`. Curated variants: Kenney blade
  whooshes and projectile ticks.
- `impact`: stone, body, punch, slam, and generic physical hits.
  Generated fallback: `audio/sfx/cast-impact.wav`. Curated variants: Kenney
  heavy punch impacts.
- `frost`: cryo casts, ice walls, cold shields, slows, and winter ultimates.
  Generated fallback: `audio/sfx/cast-frost.wav` plus a second generated
  rotation variant `cast-frost-2.wav` (no curated CC0 cryo source exists).
- `fire`: pyro casts, flame dashes, explosions, and burning ultimates.
  Generated fallback: `audio/sfx/cast-fire.wav` plus a second generated
  rotation variant `cast-fire-2.wav` (no curated CC0 flame source exists).
- `storm`: wind, water, anemo, hydro, beam, cyclone, and storm-body spells.
  Generated fallback: `audio/sfx/cast-storm.wav`. Curated variants: Kenney
  phaser and rising zap sounds.
- `void`: portals, global marks, domes, channels, swaps, and dark ultimates.
  Generated fallback: `audio/sfx/cast-void.wav`. Curated variants: Kenney phase
  jumps.
- `heal`: direct heals, restoration spells, and protective recovery.
  Generated fallback: `audio/sfx/cast-heal.wav`. Curated variants: Kenney
  power-up tones.
- `summon`: wards, familiars, illusions, golems, spiderlings, and spawn effects.
  Generated fallback: `audio/sfx/cast-summon.wav`. Curated variants: Kenney
  power-up tones.
- `item`: shields, tools, mines, utility actives, and neutral item-style casts.
  Generated fallback: `audio/sfx/cast-item.wav`. Curated variants: Kenney
  three-tone item cues.
- `roar`: transformations, primal shouts, stampedes, berserks, and huge strength
  ultimates.
  Generated fallback: `audio/sfx/cast-roar.wav` plus a second generated
  rotation variant `cast-roar-2.wav` (no curated CC0 beast source exists).
- `lightning`: chain lightning, electro casts, zaps, and bolt ultimates.
  Generated fallback: `audio/sfx/cast-lightning.wav`. Curated variants: Kenney
  zap sounds.

## Event cues (beyond casts)

`ProceduralAudio.handleEvent()` also gives a synth cue to the gameplay events
that aren't casts, so the moment-to-moment feel is fully scored:

- `damage` / `attack-impact` / `attack-launch` / `projectile-hit`: per-hit
  impacts, tinted by damage type and throttled so an AoE reads as one crunch.
- `crit`: sampled ring + synth body, now with a short reverb tail.
- `death`: a low sawtooth fall into noise, sent to reverb for space.
- `revive` (Aegis / Reincarnation): a rising shimmer that blooms into a
  reverberant tail on the stinger channel.
- `immune-block` (BKB / magic-immunity): a bright metallic deflect clang.
- `blink`: a vacuum-out then a snap back in.
- `summon`: a soft materialize pop, throttled so a wave reads as one swell.
- `aoe-burst`: a low whoomp scaled by blast radius, throttled and reverbed.
- `status-apply`: a per-status crowd-control landing for hard CC only
  (`stun`, `frozen`, `hex`, `sleep`, `fear`, `root`, `taunt`, `cyclone` —
  `AUDIBLE_STATUSES`). Soft/frequent carriers (buff, slow, invis, break,
  disarm, blind, silence, magic-immune) stay silent so the mix doesn't clatter.
- `capture-start` / `capture-complete` / `capture-interrupt`: a rising lock-on,
  the capture fanfare, and a downward fizzle on a break.
- `heal`, `reaction`, `gold`, `levelup`, `skill-spend`, `item-used`: existing
  dedicated cues.

Impactful one-shots route a small send to the shared convolver reverb (via the
optional `reverbSend` arg on `tone`/`sweep`/`thump`/`noise`) so cues read with
space instead of bone-dry. Headless skips the whole reverb bus.

## Music beds

Each biome ships one seamlessly-looping, composed ambient bed
(`generate_audio.mjs` → `audio/music/<biome>.wav`). On medium+ tiers
`ProceduralAudio.update()` crossfades the bed for the current biome, ducking it
in combat and at night, and swaps beds on a biome change. The bed has its own
`music` volume channel/slider, separate from `stinger`. The procedural synth
*drone* stays off by default (it read as a constant hum); only the composed
sampled bed plays. With no decoded file or on low tier, the game is SFX-only.

## Coverage

The map is enforced in `src/test/audio.test.ts`:

- Every hero ability, creep ability, and item active must resolve to a valid
  `SoundArchetype`.
- Every valid `SoundArchetype` must have a `CAST_SFX_BY_SOUND` entry.
- Every resolved ability sound must point at a key listed in `SFX_KEYS`.

The generated source of truth is `scripts/assets/generate_audio.mjs`; curated
CC0 variants live under `public/assets/audio/sfx/kenney/`.
