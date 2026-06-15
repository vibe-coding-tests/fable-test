import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data';
import { arena, ctx, dummyHero, exec } from '../interactions/_arena';
import { checkSimInvariants, rng } from './_fuzz';
import { applyStatus } from '../../core/effects';
import type { Rng } from '../../core/rng';
import type { Sim } from '../../core/sim';
import type { Unit } from '../../core/unit';
import type { DamageType, EffectNode, StatusId, TargetSel } from '../../core/types';

// ============================================================
// PRESSURE §6 — effect-interpreter fuzz.
//
// execEffects is the choke point every ability and item funnels through.
// The example tests exercise it with a handful of authored nodes; here we
// throw *generated* nodes — random kinds, amounts, targets, radii — at
// real units and assert two things no matter what comes out:
//   1. it never throws (a closed vocabulary must interpret any well-typed node)
//   2. unit state stays well-formed afterward (the §1 conservation invariants)
// plus a few local laws (damage can't overheal, heal can't hurt, BKB blocks
// magic). This is where a malformed effect or an unhandled combination shows up.
// ============================================================

beforeAll(() => registerAllContent());

const SPAWNABLE = ['lich', 'axe', 'sven', 'sniper', 'crystal-maiden', 'pudge', 'juggernaut', 'earthshaker', 'luna'];
const STATUSES: StatusId[] = ['stun', 'root', 'silence', 'hex', 'slow', 'disarm', 'blind', 'fear', 'taunt', 'sleep', 'frozen', 'buff'];
const DTYPES: DamageType[] = ['physical', 'magical', 'pure'];
const RADIUS_TARGETS: TargetSel[] = ['enemies-in-radius', 'allies-in-radius', 'units-in-radius', 'random-enemy-in-radius', 'lowest-hp-ally-in-radius'];

function num(r: Rng, lo: number, hi: number): number {
  return Math.round(r.range(lo, hi));
}

function randomTarget(r: Rng): TargetSel {
  const all: TargetSel[] = ['target', 'self', 'point', ...RADIUS_TARGETS];
  return all[r.int(0, all.length - 1)];
}

/** Build a well-typed random effect node + whether it needs a unit/point primary. */
function randomEffect(r: Rng): EffectNode {
  const kind = r.int(0, 6);
  const target = randomTarget(r);
  const radius = RADIUS_TARGETS.includes(target) ? num(r, 150, 700) : undefined;
  switch (kind) {
    case 0:
      return { kind: 'damage', dtype: DTYPES[r.int(0, 2)], amount: num(r, 10, 600), target, radius };
    case 1:
      return { kind: 'heal', amount: num(r, 10, 500), target, radius };
    case 2:
      return { kind: 'mana', op: r.chance(0.5) ? 'burn' : 'restore', amount: num(r, 10, 400), target, radius };
    case 3:
      return { kind: 'status', status: STATUSES[r.int(0, STATUSES.length - 1)], duration: num(r, 1, 4), target, radius, params: { moveSlowPct: 30 } };
    case 4:
      return { kind: 'statmod', mods: { damage: num(r, -40, 80), armor: num(r, -8, 8) }, duration: num(r, 1, 5), target, radius };
    case 5: {
      const toward = (['caster', 'point', 'facing', 'away-from-caster', 'target-unit'] as const)[r.int(0, 4)];
      return { kind: 'displace', mode: (['knockback', 'pull', 'forced', 'blink'] as const)[r.int(0, 3)], target, toward, distance: num(r, 100, 700), speed: num(r, 300, 900), radius };
    }
    default:
      return { kind: 'purge', target };
  }
}

function freshScene(seed: number): { sim: Sim; caster: Unit; target: Unit } {
  const sim = arena(seed);
  const caster = dummyHero(sim, SPAWNABLE[seed % SPAWNABLE.length], { x: 3000, y: 4000 }, { team: 0, level: 20 });
  // a spread of friendly + enemy bodies so radius selectors actually hit someone
  const r = rng(seed * 31 + 7);
  let target: Unit | null = null;
  for (let i = 0; i < 6; i++) {
    const team = i % 2 === 0 ? 1 : 0;
    const u = dummyHero(sim, SPAWNABLE[(seed + i) % SPAWNABLE.length], { x: num(r, 2600, 3400), y: num(r, 3600, 4400) }, { team: team as 0 | 1, level: 20 });
    if (team === 1 && !target) target = u;
  }
  sim.rebuildSpatial();
  return { sim, caster, target: target! };
}

describe('PRESSURE: execEffects survives arbitrary well-typed nodes', () => {
  it('runs 800 random effects without throwing and leaves state well-formed', () => {
    for (let i = 0; i < 800; i++) {
      const seed = 200000 + i * 13;
      const r = rng(seed);
      const { sim, caster, target } = freshScene(seed);
      const node = randomEffect(r);
      const primary = { target, point: { x: target.pos.x, y: target.pos.y } };

      expect(() => exec(sim, caster, [node], primary), `effect threw: ${JSON.stringify(node)} [seed ${seed}]`).not.toThrow();
      // settle one tick so periodic/forced-move bookkeeping resolves, then audit.
      sim.run(0.2);
      const violations = checkSimInvariants(sim);
      expect(violations, `invariant broken by ${JSON.stringify(node)} [seed ${seed}]: ${violations.map((v) => v.detail).join(', ')}`).toEqual([]);
    }
  }, 60000);
});

describe('PRESSURE: local effect laws hold under fuzzing', () => {
  it('single-target damage never raises hp; heal never lowers it', () => {
    for (let i = 0; i < 200; i++) {
      const seed = 300000 + i * 7;
      const r = rng(seed);
      const { sim, caster, target } = freshScene(seed);
      target.hp = target.stats.maxHp * 0.6; // mid hp so heal has room and damage has room

      const before = target.hp;
      const amount = num(r, 20, 400);
      if (r.chance(0.5)) {
        exec(sim, caster, [{ kind: 'damage', dtype: DTYPES[r.int(0, 2)], amount, target: 'target' }], { target });
        expect(target.hp, `damage raised hp [seed ${seed}]`).toBeLessThanOrEqual(before + 1e-6);
      } else {
        exec(sim, caster, [{ kind: 'heal', amount, target: 'target' }], { target });
        expect(target.hp, `heal lowered hp [seed ${seed}]`).toBeGreaterThanOrEqual(before - 1e-6);
        expect(target.hp).toBeLessThanOrEqual(target.stats.maxHp + 1e-6);
      }
    }
  });

  it('magic immunity blocks every magical effect amount we fuzz at it', () => {
    for (let i = 0; i < 120; i++) {
      const seed = 400000 + i * 11;
      const r = rng(seed);
      const { sim, caster, target } = freshScene(seed);
      applyStatus(sim, target, target, 'magic-immune', 5, { tag: 'fuzz-bkb' }, ctx());
      target.refresh(sim.time);

      const before = target.hp;
      exec(sim, caster, [{ kind: 'damage', dtype: 'magical', amount: num(r, 50, 600), target: 'target' }], { target });
      expect(target.hp, `magical damage leaked through BKB [seed ${seed}]`).toBe(before);
    }
  });
});
