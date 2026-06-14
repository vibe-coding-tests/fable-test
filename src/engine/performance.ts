export const PERFORMANCE_BUDGET = {
  targetFps: 60,
  activeUnits: 30,
  liveProjectilesOrParticles: 200,
  maxPixelRatio: 2,
  shadowMapSize: 2048,
  transientVfxCap: 220
} as const;

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'] as const;

export interface QualityPreset {
  tier: QualityTier;
  maxPixelRatio: number;
  shadowMapSize: number;
  shadows: boolean;
  staticPropShadows: boolean;
  shadowType: 'basic' | 'pcf';
  transientVfxCap: number;
  fullRigAnimationBudget: number;
  // ---- Dota-look render features (GRAPHICS_SPEC §3, §9.6) ----
  /** PBR environment map for unit/terrain materials. */
  envMap: boolean;
  /** Master switch for the EffectComposer post-processing stack. */
  postFx: boolean;
  /** Bloom pass + its strength/radius. */
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  /** Color-grade + vignette pass. */
  grade: boolean;
  /** Ground-contact ambient occlusion (GTAO) pass; ultra-only by default, fill-rate heavy. */
  ao: boolean;
  /** Post-AA pass (SMAA) inside the composer. */
  smaa: boolean;
  /** 0..1 density multiplier for ambient weather particles. */
  weatherDensity: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualityPreset> = {
  low: {
    tier: 'low',
    maxPixelRatio: 1,
    shadowMapSize: 512,
    shadows: false,
    staticPropShadows: false,
    shadowType: 'basic',
    transientVfxCap: 100,
    fullRigAnimationBudget: 12,
    envMap: false,
    postFx: false,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    grade: false,
    ao: false,
    smaa: false,
    weatherDensity: 0
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.5,
    shadowMapSize: 1024,
    shadows: true,
    staticPropShadows: false,
    shadowType: 'basic',
    transientVfxCap: 160,
    fullRigAnimationBudget: 20,
    envMap: true,
    postFx: true,
    bloom: true,
    bloomStrength: 0.4,
    bloomRadius: 0.45,
    grade: false,
    ao: false,
    smaa: true,
    weatherDensity: 0.4
  },
  high: {
    tier: 'high',
    maxPixelRatio: PERFORMANCE_BUDGET.maxPixelRatio,
    shadowMapSize: PERFORMANCE_BUDGET.shadowMapSize,
    shadows: true,
    staticPropShadows: false,
    shadowType: 'pcf',
    transientVfxCap: PERFORMANCE_BUDGET.transientVfxCap,
    fullRigAnimationBudget: 32,
    envMap: true,
    postFx: true,
    bloom: true,
    bloomStrength: 0.34,
    bloomRadius: 0.45,
    grade: true,
    ao: false,
    smaa: true,
    weatherDensity: 1
  },
  ultra: {
    tier: 'ultra',
    maxPixelRatio: PERFORMANCE_BUDGET.maxPixelRatio,
    shadowMapSize: 4096,
    shadows: true,
    staticPropShadows: true,
    shadowType: 'pcf',
    transientVfxCap: 260,
    fullRigAnimationBudget: 48,
    envMap: true,
    postFx: true,
    bloom: true,
    bloomStrength: 0.55,
    bloomRadius: 0.55,
    grade: true,
    ao: true,
    smaa: true,
    weatherDensity: 1
  }
};

export function qualityPreset(tier: QualityTier = 'high'): QualityPreset {
  return QUALITY_PRESETS[tier];
}

export function clampedPixelRatio(devicePixelRatio: number, tier: QualityTier = 'high'): number {
  const preset = qualityPreset(tier);
  return Math.min(preset.maxPixelRatio, Math.max(1, devicePixelRatio || 1));
}

export function lowerQualityTier(tier: QualityTier): QualityTier | null {
  const idx = QUALITY_TIERS.indexOf(tier);
  return idx > 0 ? QUALITY_TIERS[idx - 1] : null;
}

export function higherQualityTier(tier: QualityTier, ceiling: QualityTier): QualityTier | null {
  const idx = QUALITY_TIERS.indexOf(tier);
  const ceilingIdx = QUALITY_TIERS.indexOf(ceiling);
  return idx >= 0 && idx < ceilingIdx ? QUALITY_TIERS[idx + 1] : null;
}
