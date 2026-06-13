import { describe, expect, it } from 'vitest';
import { VfxManager, vfxGeometryCacheSize } from '../engine/vfx';

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
});
