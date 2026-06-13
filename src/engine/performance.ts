export const PERFORMANCE_BUDGET = {
  targetFps: 60,
  activeUnits: 30,
  liveProjectilesOrParticles: 200,
  maxPixelRatio: 2,
  shadowMapSize: 2048,
  transientVfxCap: 220
} as const;

export function clampedPixelRatio(devicePixelRatio: number): number {
  return Math.min(PERFORMANCE_BUDGET.maxPixelRatio, Math.max(1, devicePixelRatio || 1));
}
