import { afterEach, describe, expect, it } from 'vitest';
import { clampedPixelRatio, higherQualityTier, lowerQualityTier, qualityPreset } from '../engine/performance';
import { shouldUseCrowdImpostor } from '../engine/lod';
import { RARITY_COLORS, RARITY_COLORS_COLORBLIND, rarityColor, setColorblindPalette } from '../data/quality';

describe('performance quality presets', () => {
  it('clamps device pixel ratio by quality tier', () => {
    expect(clampedPixelRatio(3, 'low')).toBe(1);
    expect(clampedPixelRatio(3, 'medium')).toBe(1.5);
    expect(clampedPixelRatio(3, 'high')).toBe(2);
    expect(clampedPixelRatio(0, 'high')).toBe(1);
  });

  it('reduces expensive render features on lower tiers', () => {
    expect(qualityPreset('low').shadows).toBe(false);
    expect(qualityPreset('high').staticPropShadows).toBe(false);
    expect(qualityPreset('ultra').staticPropShadows).toBe(true);
    expect(qualityPreset('low').shadowMapSize).toBeLessThan(qualityPreset('high').shadowMapSize);
    expect(qualityPreset('medium').transientVfxCap).toBeLessThan(qualityPreset('high').transientVfxCap);
    expect(qualityPreset('medium').fullRigAnimationBudget).toBeLessThan(qualityPreset('high').fullRigAnimationBudget);
  });

  it('enables ground-contact AO only on the ultra fidelity tier', () => {
    expect(qualityPreset('ultra').ao).toBe(true);
    expect(qualityPreset('high').ao).toBe(false);
    expect(qualityPreset('medium').ao).toBe(false);
    expect(qualityPreset('low').ao).toBe(false);
  });

  it('walks quality tiers within the requested ceiling', () => {
    expect(lowerQualityTier('ultra')).toBe('high');
    expect(lowerQualityTier('low')).toBeNull();
    expect(higherQualityTier('medium', 'ultra')).toBe('high');
    expect(higherQualityTier('high', 'high')).toBeNull();
  });

  afterEach(() => setColorblindPalette(false));

  it('swaps the rarity palette for a colorblind-safe set and restores it (§F.3)', () => {
    expect(rarityColor('immortal')).toBe(RARITY_COLORS.immortal);
    setColorblindPalette(true);
    expect(rarityColor('immortal')).toBe(RARITY_COLORS_COLORBLIND.immortal);
    expect(rarityColor('arcana')).toBe(RARITY_COLORS_COLORBLIND.arcana);
    setColorblindPalette(false);
    expect(rarityColor('immortal')).toBe(RARITY_COLORS.immortal);
  });

  it('uses crowd impostors only for cheap non-hero overflow/far units', () => {
    const base = { selected: false, alive: true, isHero: false, isNpc: false };
    expect(shouldUseCrowdImpostor({ ...base, tier: 'reduced', crowdDetail: 'auto', fullAnimationBudget: 20 })).toBe(true);
    expect(shouldUseCrowdImpostor({ ...base, tier: 'full', crowdDetail: 'auto', fullAnimationBudget: 0 })).toBe(true);
    expect(shouldUseCrowdImpostor({ ...base, tier: 'full', crowdDetail: 'balanced', fullAnimationBudget: 12 })).toBe(true);
    expect(shouldUseCrowdImpostor({ ...base, tier: 'full', crowdDetail: 'full', fullAnimationBudget: 0 })).toBe(false);
    expect(shouldUseCrowdImpostor({ ...base, tier: 'culled', crowdDetail: 'auto', fullAnimationBudget: 20, isHero: true })).toBe(false);
    expect(shouldUseCrowdImpostor({ ...base, tier: 'culled', crowdDetail: 'auto', fullAnimationBudget: 20, selected: true })).toBe(false);
  });
});
