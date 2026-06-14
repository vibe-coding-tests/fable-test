import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyHeroLikeness, applyItemAppearances, buildUnitRig, modelGeometryCacheSize, mountHeroModel, recolorToPalette } from '../engine/models';
import { ENABLED_HERO_MODELS, ENABLED_HERO_BASES, HERO_BASE, heroAssetEntry, heroBaseId, heroBaseUrl, PHASE5_STARTER_ASSETS } from '../engine/assets';
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
    // Every hero in an enabled KayKit cohort ships a retextured CC0 GLB + resolves an entry.
    for (const a of PHASE5_STARTER_ASSETS) {
      expect(ENABLED_HERO_MODELS.has(a.heroId), `${a.heroId} enabled`).toBe(true);
      expect(heroAssetEntry(a.heroId), `${a.heroId} entry`).not.toBeNull();
    }
    // Creature-cohort + procedural-holdout heroes (and unknowns) never fire a load.
    expect(heroAssetEntry('broodmother')).toBeNull(); // spider cohort, art not built yet
    expect(heroAssetEntry('io')).toBeNull(); // procedural holdout
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

  it('resolves base-mesh sockets and hangs the weapon off the authored hand (WS-B)', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);

    // Stand-in base mesh exposing KayKit-style bone names for hand/head/back.
    const model = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshStandardMaterial());
    const hand = new THREE.Object3D(); hand.name = 'Hand_R';
    const headBone = new THREE.Object3D(); headBone.name = 'Head';
    const backBone = new THREE.Object3D(); backBone.name = 'Spine';
    model.add(torso, hand, headBone, backBone);
    mountHeroModel(rig, model);

    expect(rig.sockets?.weapon).toBe(hand);
    expect(rig.sockets?.head).toBe(headBone);
    expect(rig.sockets?.back).toBe(backBone);
    expect(rig.rightHand).toBe(hand);

    // The worn weapon should parent to the resolved hand bone (visible), not the
    // hidden procedural arm, and be counter-scaled for the model's height fit.
    applyItemAppearances(rig, [{ weapon: { kind: 'sword', color: '#d8dce8' } }]);
    expect(rig.weapon?.parent).toBe(hand);
    const k = model.scale.x;
    expect(rig.weapon?.scale.x).toBeCloseTo(1 / k, 4);
  });

  it('keeps the weapon visible when a base mesh exposes no hand bone (WS-B fallback)', () => {
    const rig = buildUnitRig({ build: 'biped', scale: 1, weapon: 'sword' }, ['#888899', '#666677', '#aaaabb']);
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshStandardMaterial());
    mountHeroModel(rig, model);

    expect(rig.sockets?.weapon).toBeUndefined();
    expect(rig.rightHand).toBeUndefined();
    applyItemAppearances(rig, [{ weapon: { kind: 'sword', color: '#d8dce8' } }]);
    // Falls back to the item layer (on root, always visible) rather than vanishing.
    expect(rig.weapon?.parent).toBe(rig.itemLayer);
  });
});

describe('shared hero bases (WS-A0)', () => {
  it('assigns every shipped hero a base or an explicit procedural holdout', () => {
    for (const hero of ALL_HEROES) {
      const base = heroBaseId(hero.id);
      expect(base, `${hero.id} base`).toBeTruthy();
      // Holdouts read worse on a base mesh; they intentionally map to procedural.
      if (base !== 'procedural') expect(HERO_BASE[hero.id], `${hero.id} cohort`).toBe(base);
    }
  });

  it('keeps base loads gated until base files ship (no 404s)', () => {
    // No base GLB has shipped yet, so every base resolves to the procedural floor.
    for (const hero of ALL_HEROES) expect(heroBaseUrl(heroBaseId(hero.id))).toBeNull();
    expect(ENABLED_HERO_BASES.size).toBe(0);
  });

  it('recolors a cloned base to a palette without sharing tint across clones', () => {
    const make = (): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#202020' }) // dark → secondary role
      );
      return mesh;
    };
    const a = make();
    const b = make();
    recolorToPalette(a, ['#ff0000', '#00ff00', '#0000ff']);
    recolorToPalette(b, ['#ffaa00', '#00aaff', '#aa00ff']);

    const colorA = (a.material as THREE.MeshStandardMaterial).color.getHexString();
    const colorB = (b.material as THREE.MeshStandardMaterial).color.getHexString();
    // Dark source bucketed to the secondary slot of each distinct palette.
    expect(colorA).toBe('00ff00');
    expect(colorB).toBe('00aaff');
    expect(colorA).not.toBe(colorB); // materials cloned, not shared
  });
});
