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
});
