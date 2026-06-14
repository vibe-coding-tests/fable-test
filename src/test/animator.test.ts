import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyItemAppearances, buildUnitRig, mountHeroModel } from '../engine/models';
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
  } as unknown as Unit;
}

function deadUnit(): Unit {
  return {
    uid: 1,
    pos: { x: 0, y: 0 },
    alive: false,
    stats: { attackPoint: 0.4, attackRange: 150 },
    windupUntil: 0,
    statuses: [],
    summary: { cycloned: false, frozen: false, rooted: false },
    castingUntil: -1,
    castGesture: null,
    channel: null,
    captureCh: null
  } as unknown as Unit;
}

function bodyMinY(rig: ReturnType<typeof buildUnitRig>): number {
  rig.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(rig.body).min.y;
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

describe('death grounding', () => {
  it('keeps procedural death poses above the unit origin', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);
    animateRig(rig, deadUnit(), newAnimState(), 1, 1, 0);

    expect(bodyMinY(rig)).toBeGreaterThanOrEqual(0.015);
  });

  it('keeps authored death clips with root motion above the unit origin', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);
    const model = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    const death = new THREE.AnimationClip('death', 1, [
      new THREE.NumberKeyframeTrack('.position[y]', [0, 1], [0, -3])
    ]);
    mountHeroModel(rig, model, [death]);

    animateRig(rig, deadUnit(), newAnimState(), 1, 1, 0);

    expect(bodyMinY(rig)).toBeGreaterThanOrEqual(0.015);
  });
});
