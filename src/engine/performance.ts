export const PERFORMANCE_BUDGET = {
  targetFps: 60,
  activeUnits: 30,
  liveProjectilesOrParticles: 200,
  maxPixelRatio: 2,
  shadowMapSize: 2048,
  transientVfxCap: 220
} as const;

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityPreset {
  tier: QualityTier;
  maxPixelRatio: number;
  shadowMapSize: number;
  shadows: boolean;
  shadowType: 'basic' | 'pcf';
  transientVfxCap: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  low: {
    tier: 'low',
    maxPixelRatio: 1,
    shadowMapSize: 512,
    shadows: false,
    shadowType: 'basic',
    transientVfxCap: 100
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.5,
    shadowMapSize: 1024,
    shadows: true,
    shadowType: 'basic',
    transientVfxCap: 160
  },
  high: {
    tier: 'high',
    maxPixelRatio: PERFORMANCE_BUDGET.maxPixelRatio,
    shadowMapSize: PERFORMANCE_BUDGET.shadowMapSize,
    shadows: true,
    shadowType: 'pcf',
    transientVfxCap: PERFORMANCE_BUDGET.transientVfxCap
  }
};

export function qualityPreset(tier: QualityTier = 'high'): QualityPreset {
  return QUALITY_PRESETS[tier];
}

export function clampedPixelRatio(devicePixelRatio: number, tier: QualityTier = 'high'): number {
  const preset = qualityPreset(tier);
  return Math.min(preset.maxPixelRatio, Math.max(1, devicePixelRatio || 1));
}
