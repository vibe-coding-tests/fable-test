import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { installVfxTextureAtlas, VfxManager, vfxGeometryCacheSize, vfxTextureAssetState } from '../engine/vfx';

describe('vfx cache', () => {
  it('reuses canonical geometry for repeated VFX archetypes', () => {
    const before = vfxGeometryCacheSize();
    const vfx = new VfxManager(() => 0);
    vfx.handleEvent(
      {
        t: 'projectile-spawn',
        pid: 1,
        from: { x: 0, y: 0 },
        vfx: { archetype: 'projectile', color: '#88ccff', scale: 1 }
      },
      () => null
    );
    const afterFirst = vfxGeometryCacheSize();
    vfx.handleEvent(
      {
        t: 'projectile-spawn',
        pid: 2,
        from: { x: 100, y: 0 },
        vfx: { archetype: 'projectile', color: '#ffaa88', scale: 1 }
      },
      () => null
    );

    expect(afterFirst).toBeGreaterThan(before);
    expect(vfxGeometryCacheSize()).toBe(afterFirst);
  });

  it('renders projectile trails as soft pooled ribbons', () => {
    const vfx = new VfxManager(() => 0);
    vfx.handleEvent(
      {
        t: 'projectile-spawn',
        pid: 1,
        from: { x: 0, y: 0 },
        vfx: { archetype: 'projectile', color: '#88ccff', scale: 1 }
      },
      () => null
    );

    const trail = vfx.group.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(trail.isMesh).toBe(true);
    expect(trail.geometry.index?.count).toBeGreaterThan(0);
    expect(trail.material.alphaMap).toBeDefined();
    expect(trail.material.blending).toBe(THREE.AdditiveBlending);
  });

  it('can install an optional atlas while keeping procedural fallback state', () => {
    const data = new Uint8Array(4 * 4 * 4).fill(255);
    const atlas = new THREE.DataTexture(data, 4, 4);

    installVfxTextureAtlas(atlas);
    const state = vfxTextureAssetState();

    expect(state.sprites).toBe(4);
    expect(state.telegraphs).toBe(4);
    expect(state.proceduralSprites).toBeGreaterThanOrEqual(0);
    expect(state.proceduralTelegraphs).toBeGreaterThanOrEqual(0);
  });

  it('returns burst rings and sparks to the transient pool', () => {
    const vfx = new VfxManager(() => 0);

    vfx.handleEvent(
      {
        t: 'aoe-burst',
        pos: { x: 0, y: 0 },
        radius: 120,
        vfx: { archetype: 'ground-aoe', color: '#88ccff', color2: '#ffffff', scale: 1 }
      },
      () => null
    );

    expect(vfx.pooledBurstCount()).toBe(0);
    vfx.update(1);
    expect(vfx.pooledBurstCount()).toBe(2);

    vfx.handleEvent(
      {
        t: 'aoe-burst',
        pos: { x: 100, y: 0 },
        radius: 120,
        vfx: { archetype: 'ground-aoe', color: '#ffcc88', color2: '#ffffff', scale: 1 }
      },
      () => null
    );

    expect(vfx.pooledBurstCount()).toBe(0);
  });

  it('renders the cyclone archetype as a transient without assets', () => {
    const vfx = new VfxManager(() => 0);

    vfx.handleEvent(
      {
        t: 'cast',
        uid: 1,
        abilityId: 'euls-active',
        vfx: { archetype: 'cyclone', color: '#9fe8e8', color2: '#ffffff', scale: 0.9 }
      },
      () => ({ x: 0, y: 0, h: 0 })
    );

    expect(vfx.group.children.length).toBeGreaterThan(0);
  });

  it('renders the channel archetype as a distinct transient without assets', () => {
    const vfx = new VfxManager(() => 0);

    vfx.handleEvent(
      {
        t: 'cast',
        uid: 1,
        abilityId: 'channel-test',
        vfx: { archetype: 'channel', color: '#b88cff', color2: '#ffffff', scale: 1 }
      },
      () => ({ x: 0, y: 0, h: 0 })
    );

    expect(vfx.group.children.length).toBeGreaterThan(0);
  });

  it('uses a soft alpha ramp for attack beams', () => {
    const vfx = new VfxManager(() => 0);

    vfx.attackVisual(
      { kind: 'ranged-conversion', color: '#88ccff', scale: 1 },
      { x: 0, y: 0 },
      { x: 500, y: 0 }
    );

    const beam = vfx.group.children[0] as THREE.Mesh;
    const material = beam.material as THREE.MeshBasicMaterial;
    expect(material.alphaMap).toBeDefined();
    expect(material.blending).toBe(THREE.AdditiveBlending);
  });

  it('renders lightning attacks as soft ribbons with an impact decal', () => {
    const vfx = new VfxManager(() => 0);

    vfx.attackVisual(
      { kind: 'lightning-bounce', color: '#88ccff', color2: '#ffffff', scale: 1 },
      { x: 0, y: 0 },
      { x: 500, y: 0 }
    );

    const ribbons = vfx.group.children.filter((child) => {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      return mesh.isMesh && !!mesh.geometry.index && mesh.material instanceof THREE.MeshBasicMaterial && !!mesh.material.alphaMap;
    }) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
    const line = vfx.group.children.find((child) => (child as THREE.Line).isLine);
    const decal = vfx.group.children.find((child) => {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      return mesh.isMesh && mesh.material instanceof THREE.MeshBasicMaterial && !!mesh.material.map;
    }) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;

    // Main bolt plus a forked branch, both soft additive ribbons (no flat line).
    expect(ribbons.length).toBeGreaterThanOrEqual(2);
    expect(line).toBeUndefined();
    expect(decal).toBeDefined();
    expect(decal!.material.blending).toBe(THREE.AdditiveBlending);
  });

  it('adds a ground impact decal for tinted item hits', () => {
    const vfx = new VfxManager(() => 0);

    vfx.attackVisual(
      { kind: 'tinted-impact', color: '#ffcc88', scale: 1 },
      { x: 0, y: 0 },
      { x: 500, y: 0 }
    );

    const decal = vfx.group.children.find((child) => {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      return mesh.isMesh && mesh.material instanceof THREE.MeshBasicMaterial && !!mesh.material.map;
    }) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;

    expect(decal).toBeDefined();
    expect(decal!.material.blending).toBe(THREE.AdditiveBlending);
  });

  it('adds a ground impact decal for cleave attacks', () => {
    const vfx = new VfxManager(() => 0);

    vfx.attackVisual(
      { kind: 'cleave-sweep', color: '#ff8844', color2: '#ffd08a', scale: 1 },
      { x: 0, y: 0 },
      { x: 500, y: 0 }
    );

    const decal = vfx.group.children.find((child) => {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      return mesh.isMesh && mesh.material instanceof THREE.MeshBasicMaterial && !!mesh.material.map;
    }) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;

    expect(decal).toBeDefined();
    expect(decal!.material.blending).toBe(THREE.AdditiveBlending);
  });
});
