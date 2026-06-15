// ============================================================
// PRESSURE TESTING — shared fuzz + invariant harness.
//
// These tests are written from an *independent* mindset: instead of
// asserting the values the current implementation happens to produce,
// they assert properties that must hold for ANY correct implementation
// of a deterministic 5v5 combat sim — conservation laws, determinism,
// symmetry, and metamorphic ordering. The inputs are generated, not
// hand-picked, so the suite explores the interaction space the
// example-based tests never reach.
//
// Nothing here imports tuning constants to gate an assertion. A test
// that needs a magic number to pass is an implementation snapshot, not
// a specification — those live in the existing example-based files.
// ============================================================

import { expect } from 'vitest';
import { Rng } from '../../core/rng';
import { ALL_HEROES } from '../../data';
import type { Sim } from '../../core/sim';
import type { MacroHeroSetup } from '../../core/types';

/** Every registered hero id, sorted for a stable, seed-reproducible pool. */
export const HERO_POOL: string[] = [...ALL_HEROES.map((h) => h.id)].sort();

/**
 * A small curated set of straightforward, equippable combat items. Used by the
 * metamorphic "advantage" tests where we need a strictly-better loadout whose
 * only effect is to make a team stronger (no toggle/aura corner cases).
 */
export const SAFE_ITEMS: string[] = [
  'black-king-bar',
  'crystalys',
  'hyperstone',
  'platemail',
  'kaya'
];

export function rng(seed: number): Rng {
  return new Rng(seed >>> 0);
}

/** Pick `size` distinct hero ids from the pool, deterministically for `seed`. */
export function randomTeam(
  seed: number,
  size: number,
  opts: { level?: number; minLevel?: number; maxLevel?: number } = {}
): MacroHeroSetup[] {
  const r = rng(seed);
  const pool = [...HERO_POOL];
  // Fisher-Yates with the seeded rng so the draw is reproducible.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, size);
  return picked.map((heroId) => {
    const level = opts.level ?? r.int(opts.minLevel ?? 12, opts.maxLevel ?? 30);
    return { heroId, level };
  });
}

export interface InvariantViolation {
  uid: number;
  heroId: string;
  field: string;
  value: number;
  detail: string;
}

/**
 * Universal per-unit invariants that must hold at any tick boundary, for any
 * matchup. Returns the list of violations (empty when healthy) so a caller can
 * attach the generating seed to the failure message.
 */
export function checkSimInvariants(sim: Sim): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const { w, h } = sim.bounds;
  // A runaway position bug shows up as NaN/Infinity or a unit a whole arena
  // outside the field. Knockbacks can graze the edge, so the band is generous;
  // the point is to catch corruption, not to assert exact clamping.
  const margin = Math.max(w, h);

  for (const u of sim.unitsArr) {
    const id = u.heroId ?? u.creepId ?? u.name;
    const push = (field: string, value: number, detail: string) =>
      out.push({ uid: u.uid, heroId: id, field, value, detail });

    if (!Number.isFinite(u.pos.x) || !Number.isFinite(u.pos.y)) {
      push('pos', NaN, `non-finite position (${u.pos.x}, ${u.pos.y})`);
    } else if (
      u.pos.x < -margin || u.pos.x > w + margin ||
      u.pos.y < -margin || u.pos.y > h + margin
    ) {
      push('pos', u.pos.x, `position outside arena band (${Math.round(u.pos.x)}, ${Math.round(u.pos.y)})`);
    }

    const maxHp = u.stats.maxHp;
    if (!Number.isFinite(u.hp)) push('hp', u.hp, 'non-finite hp');
    else if (u.hp < 0) push('hp', u.hp, 'negative hp');
    else if (u.hp > maxHp + 1) push('hp', u.hp, `hp ${u.hp.toFixed(1)} exceeds maxHp ${maxHp.toFixed(1)}`);

    const maxMana = u.stats.maxMana;
    if (!Number.isFinite(u.mana)) push('mana', u.mana, 'non-finite mana');
    else if (u.mana < -1) push('mana', u.mana, 'negative mana');
    else if (u.mana > maxMana + 1) push('mana', u.mana, `mana ${u.mana.toFixed(1)} exceeds maxMana ${maxMana.toFixed(1)}`);

    // Death is total: a fallen unit holds no hp. (killUnit zeroes hp.)
    if (!u.alive && u.hp > 0) push('alive', u.hp, 'dead unit retains hp');
    // ...and a living unit is never at zero hp once a tick has fully resolved.
    if (u.alive && u.hp <= 0) push('alive', u.hp, 'living unit at non-positive hp');

    if (!Number.isFinite(maxHp) || maxHp <= 0) push('maxHp', maxHp, 'invalid maxHp');
  }
  return out;
}

/** Assert the sim is healthy, attaching `label` (e.g. the seed) to any failure. */
export function assertSimInvariants(sim: Sim, label: string): void {
  const violations = checkSimInvariants(sim);
  if (violations.length > 0) {
    const lines = violations
      .slice(0, 8)
      .map((v) => `  uid ${v.uid} (${v.heroId}) ${v.field}: ${v.detail}`)
      .join('\n');
    expect.fail(`invariant violations [${label}] (${violations.length} total):\n${lines}`);
  }
}
