import { describe, expect, it } from 'vitest';
import { clampedPixelRatio, qualityPreset } from '../engine/performance';

describe('performance quality presets', () => {
  it('clamps device pixel ratio by quality tier', () => {
    expect(clampedPixelRatio(3, 'low')).toBe(1);
    expect(clampedPixelRatio(3, 'medium')).toBe(1.5);
    expect(clampedPixelRatio(3, 'high')).toBe(2);
    expect(clampedPixelRatio(0, 'high')).toBe(1);
  });

  it('reduces expensive render features on lower tiers', () => {
    expect(qualityPreset('low').shadows).toBe(false);
    expect(qualityPreset('low').shadowMapSize).toBeLessThan(qualityPreset('high').shadowMapSize);
    expect(qualityPreset('medium').transientVfxCap).toBeLessThan(qualityPreset('high').transientVfxCap);
  });
});
