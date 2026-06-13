import { describe, expect, it } from 'vitest';
import { applyItemAppearances, buildUnitRig } from '../engine/models';
import { animateRig, newAnimState } from '../engine/animator';
import type { Unit } from '../core/unit';

function attackingUnit(attackRange: number): Unit {
  return {
    uid: 1,
    pos: { x: 0, y: 0 },
    alive: true,
    stats: { attackPoint: 0.4, attackRange },
    windupUntil: 0.2,
    statuses: [],
    summary: { cycloned: false, frozen: false, rooted: false },
    castingUntil: -1,
    castGesture: null,
    channel: null,
    captureCh: null
  } as Unit;
}

describe('procedural animator attack styles', () => {
  it('derives attack pose from visible rig weapon and item swaps', () => {
    const sword = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);
    animateRig(sword, attackingUnit(150), newAnimState(), 0.016, 1, 0);
    expect(Math.abs(sword.body.rotation.y)).toBeGreaterThan(0.1);

    const rifle = buildUnitRig({ build: 'biped', scale: 1, weapon: 'rifle' }, ['#888899', '#666677', '#aaaabb']);
    animateRig(rifle, attackingUnit(650), newAnimState(), 0.016, 1, 0);
    expect(rifle.body.position.x).toBeLessThan(-0.03);
    expect(Math.abs(rifle.body.rotation.y)).toBeLessThan(0.01);

    const hammer = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);
    applyItemAppearances(hammer, [{ weapon: { kind: 'storm-haft' } }]);
    animateRig(hammer, attackingUnit(150), newAnimState(), 0.016, 1, 0);
    expect(hammer.attackWeapon).toBe('storm-haft');
    expect(Math.abs(hammer.body.rotation.z)).toBeGreaterThan(0.1);
  });
});
