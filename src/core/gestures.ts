import type { AbilityDef, AnimGesture, EffectNode, SoundArchetype } from './types';

// ------------------------------------------------------------------
// Cast resolvers (Phase 6 §3.11/§3.12). Map an ability or item active
// onto the closed AnimGesture / SoundArchetype vocabularies in types.ts.
// `anim`/`sound` on the def win; otherwise we infer from targeting,
// effects, and vfx so a new hero stays zero-engine-code. Pure + total:
// every branch terminates in a valid gesture/sound and never throws.
// ------------------------------------------------------------------

function effectsOf(def: AbilityDef): EffectNode[] {
  const out: EffectNode[] = [];
  if (def.effects) out.push(...def.effects);
  if (def.channel?.tick) out.push(...def.channel.tick.effects);
  if (def.channel?.onEnd) out.push(...def.channel.onEnd);
  if (def.toggle) out.push(...def.toggle.effects);
  return out;
}

function hasKind(effects: EffectNode[], kind: EffectNode['kind']): boolean {
  return effects.some((e) => e.kind === kind);
}

function isSelfBlink(e: EffectNode): boolean {
  return e.kind === 'displace' && 'mode' in e && (e as { mode?: string }).mode === 'blink'
    && (e as { target?: string }).target === 'self';
}

function inferGesture(def: AbilityDef): AnimGesture {
  const arch = def.vfx.archetype;
  const effects = effectsOf(def);

  // A held channel (Freezing Field, capture) reads as a sustained loop.
  if (def.channel || hasKind(effects, 'capture-channel')) return 'channel-loop';
  // Spawning anything is a beckon.
  if (hasKind(effects, 'summon') || arch === 'summon-pop') return 'summon-gesture';
  // Blinking yourself (Blink Dagger, Omnislash) is a dash.
  if (effects.some(isSelfBlink)) return 'dash';
  // Map-wide marks are an overhead global cast.
  if (arch === 'global-mark') return 'global-cast';
  // Placing an armed charge (mine) reads as a beckon/set-down.
  if (arch === 'mine') return 'summon-gesture';
  // Placed ground effects / walls / zones / containment shells slam the ground.
  if (def.targeting === 'ground-aoe' || arch === 'ground-aoe' || arch === 'wall' || arch === 'vortex' || arch === 'dome' || hasKind(effects, 'zone')) {
    return 'ground-slam';
  }
  // Travelling shots read as ranged. 'storm' is deliberately excluded:
  // it tags melee whirls (Blade Fury) as often as ranged nukes.
  if (arch === 'projectile' || arch === 'beam' || arch === 'chain' || arch === 'hook') return 'ranged-shot';
  if (def.targeting === 'skillshot' || hasKind(effects, 'projectile')) return 'ranged-shot';
  // Pointed/targeted casts with no weapon contact are staff casts.
  if (def.targeting === 'unit-target' || def.targeting === 'point-target' || def.targeting === 'no-target') {
    return 'staff-cast';
  }
  return 'melee-swing';
}

function inferSound(def: AbilityDef): SoundArchetype {
  const effects = effectsOf(def);
  const heals = hasKind(effects, 'heal');
  const damages = hasKind(effects, 'damage') || effects.some((e) => e.kind === 'projectile');
  if (heals && !damages) return 'heal';
  switch (def.vfx.archetype) {
    case 'projectile': return 'bow';
    case 'beam': return 'storm';
    case 'chain': return 'storm';
    case 'storm': return 'storm';
    case 'hook': return 'impact';
    case 'wall': return 'frost';
    case 'summon-pop': return 'summon';
    case 'shield': return heals ? 'heal' : 'item';
    case 'stun-stars': return 'impact';
    case 'channel': return 'void';
    case 'global-mark': return 'void';
    case 'ground-aoe': return 'impact';
    case 'vortex': return 'void';
    case 'dome': return 'void';
    case 'mine': return 'item';
    default: return 'impact';
  }
}

/** Resolve the closed-vocabulary gesture for an ability or item active. Total. */
export function gestureForAbility(def: AbilityDef): AnimGesture {
  return def.anim ?? inferGesture(def);
}

/** Resolve the closed-vocabulary sound archetype for an ability or item active. Total. */
export function soundForAbility(def: AbilityDef): SoundArchetype {
  return def.sound ?? inferSound(def);
}
