import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyHeroLikeness, applyItemAppearances, buildUnitRig, modelGeometryCacheSize, mountHeroModel } from '../engine/models';
import { ENABLED_HERO_MODELS, heroAssetEntry, PHASE5_STARTER_ASSETS } from '../engine/assets';
import { ALL_HEROES } from '../data/index';

describe('procedural model cache', () => {
  it('shares canonical geometry across repeated rigs', () => {
    const before = modelGeometryCacheSize();
    const a = buildUnitRig({ build: 'blob', scale: 1 }, ['#88aaff', '#446688', '#ffffff']);
    const b = buildUnitRig({ build: 'blob', scale: 1 }, ['#88aaff', '#446688', '#ffffff']);

    const firstMeshA = a.body.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const firstMeshB = b.body.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);

    expect(firstMeshA?.geometry).toBe(firstMeshB?.geometry);
    expect(modelGeometryCacheSize()).toBeGreaterThan(before);
  });

  it('builds a procedural likeness for every shipped hero without throwing (WS-A render smoke)', () => {
    for (const hero of ALL_HEROES) {
      const rig = buildUnitRig(hero.silhouette, hero.palette);
      const basePartCount = rig.body.children.length;
      expect(() => applyHeroLikeness(rig, hero.id)).not.toThrow();
      // The likeness overlay should add at least one detail mesh to the body.
      expect(rig.body.children.length, `${hero.id} likeness parts`).toBeGreaterThan(basePartCount);
    }
  });

  it('builds D2 item parts without external assets', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1 }, ['#88aaff', '#446688', '#ffffff']);
    applyItemAppearances(rig, [{ parts: ['cloak', 'halo'], tint: '#b89fff' }]);

    expect(rig.itemLayer.children.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pluggable hero rig (Phase 5)', () => {
  it('resolves an asset entry only for heroes whose GLB is enabled', () => {
    // The six starters ship a retextured CC0 GLB (WS-J batch 13) and resolve an entry.
    for (const a of PHASE5_STARTER_ASSETS) {
      expect(ENABLED_HERO_MODELS.has(a.heroId), `${a.heroId} enabled`).toBe(true);
      expect(heroAssetEntry(a.heroId), `${a.heroId} entry`).not.toBeNull();
    }
    // Heroes without a shipped GLB (and unknowns) never fire a load — clean console.
    expect(heroAssetEntry('axe')).toBeNull();
    expect(heroAssetEntry('unknown-hero')).toBeNull();
    expect(heroAssetEntry(undefined)).toBeNull();
    // The gate matches exactly the shipped manifest entries.
    expect(ENABLED_HERO_MODELS.size).toBe(PHASE5_STARTER_ASSETS.length);
  });

  it('mounts an authored model over the procedural body, fitting height + seating feet', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1 }, ['#888899', '#666677', '#aaaabb']);
    applyHeroLikeness(rig, 'juggernaut');
    const proceduralCount = rig.body.children.length;

    // A stand-in authored mesh, deliberately the wrong size and off the ground.
    const model = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshStandardMaterial());
    model.position.set(1, 5, 2);
    mountHeroModel(rig, model);

    // Procedural parts hidden (fallback-ready), authored model added + flagged.
    for (let i = 0; i < proceduralCount; i++) expect(rig.body.children[i].visible).toBe(false);
    expect(rig.body.children).toContain(model);
    expect(model.userData.heroModel).toBe(true);

    const box = new THREE.Box3().setFromObject(model);
    expect(box.max.y - box.min.y).toBeCloseTo(rig.height, 2); // fit to silhouette height
    expect(box.min.y).toBeCloseTo(0, 2); // feet seated on the ground
    expect(model.castShadow).toBe(true);
  });
});
