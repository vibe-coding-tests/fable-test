import type { ItemQuality, ItemRarity, StatModMap } from '../core/types';

// ------------------------------------------------------------------
// LOOT L5 — item QUALITY as a closed, hand-authored axis (LOOT_OVERHAUL §3.5).
// A quality is a bounded, named twist that keeps the item's identity: a small
// stat overlay applied through the same item-mod summation neutrals use, never
// a random affix. The core reads only the resolved StatModMap this hands back;
// colors are renderer data (L6). Imported by the core stat path the same way
// TUNING is, so it stays deterministic and headless.
// ------------------------------------------------------------------

export interface QualityGrade {
  id: ItemQuality;
  name: string;
  /** Inventory border + loot-toast tint (L6). Renderer data only. */
  color: string;
  /** Always-on bounded delta over Standard. */
  mods?: StatModMap;
  /** Inscribed-style growth: this delta per holder kill, capped at killCap. */
  perKill?: StatModMap;
  killCap?: number;
  blurb: string;
}

export const QUALITY_GRADES: Record<ItemQuality, QualityGrade> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    color: '#b0c3d9',
    blurb: 'The bought or built version. The baseline.'
  },
  inscribed: {
    id: 'inscribed',
    name: 'Inscribed',
    color: '#cf6a32',
    mods: { damage: 2 },
    perKill: { damage: 0.4, str: 0.08, agi: 0.08, int: 0.08 },
    killCap: 60,
    blurb: 'Tracks its holder\u2019s kills and grows a small, capped permanent stack.'
  },
  genuine: {
    id: 'genuine',
    name: 'Genuine',
    color: '#4d7455',
    mods: { damage: 6, maxHp: 100 },
    blurb: 'An authenticated drop \u2014 a modest flat bonus over Standard.'
  },
  frozen: {
    id: 'frozen',
    name: 'Frozen',
    color: '#4fc1e9',
    mods: { armor: 2, maxHp: 80, magicResistPct: 4 },
    blurb: 'A frost-touched copy: a small defensive lean. The accessible collectible grade.'
  },
  corrupted: {
    id: 'corrupted',
    name: 'Corrupted',
    color: '#9b3b3b',
    mods: { damagePct: 16, attackSpeed: 14, armor: -3, maxHp: -100 },
    blurb: 'A darker, stronger sidegrade: more offense, less survivability.'
  },
  unusual: {
    id: 'unusual',
    name: 'Unusual',
    color: '#866cd6',
    mods: { damagePct: 8, damage: 6, maxHp: 160, armor: 1, attackSpeed: 6 },
    blurb: 'The prestige copy: a signature particle and the best bounded bonus.'
  }
};

/** Ascending ladder the essence upgrade walks (Standard \u2192 \u2026 \u2192 Unusual). */
export const QUALITY_UPGRADE_PATH: ItemQuality[] = [
  'standard',
  'genuine',
  'frozen',
  'inscribed',
  'corrupted',
  'unusual'
];

/** The next grade up the ladder, or undefined at the top. */
export function nextQuality(quality: ItemQuality | undefined): ItemQuality | undefined {
  const idx = QUALITY_UPGRADE_PATH.indexOf(quality ?? 'standard');
  if (idx < 0 || idx >= QUALITY_UPGRADE_PATH.length - 1) return undefined;
  return QUALITY_UPGRADE_PATH[idx + 1];
}

/**
 * The bounded stat overlay a quality contributes, including the Inscribed
 * growth from the holder's banked kills. Pure and deterministic; returns
 * undefined for Standard (no overlay). This is what the core stat pass sums.
 */
export function qualityStatMods(quality: ItemQuality | undefined, inscribedKills = 0): StatModMap | undefined {
  if (!quality || quality === 'standard') return undefined;
  const grade = QUALITY_GRADES[quality];
  if (!grade) return undefined;
  const out: StatModMap = { ...(grade.mods ?? {}) };
  if (grade.perKill && grade.killCap) {
    const stacks = Math.max(0, Math.min(inscribedKills, grade.killCap));
    for (const k in grade.perKill) {
      const key = k as keyof StatModMap;
      out[key] = (out[key] ?? 0) + (grade.perKill[key] ?? 0) * stacks;
    }
  }
  return out;
}

export function qualityColor(quality: ItemQuality | undefined): string {
  return QUALITY_GRADES[quality ?? 'standard']?.color ?? QUALITY_GRADES.standard.color;
}

// ------------------------------------------------------------------
// LOOT L6 — the Valve rarity palette (LOOT_OVERHAUL §3.6). Renderer data,
// read by the HUD toasts/borders and the loot beam.
// ------------------------------------------------------------------

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#b0c3d9',
  uncommon: '#5e98d9',
  rare: '#4b69ff',
  mythical: '#8847ff',
  legendary: '#d32ce6',
  immortal: '#e4ae39',
  arcana: '#ade55c'
};

/**
 * Colorblind-safe rarity palette (OPTIMIZATION 2.0 §F.3). Derived from the
 * Okabe–Ito qualitative set, which stays distinguishable across deuteranopia,
 * protanopia, and tritanopia by leaning on luminance steps and blue/orange
 * opponency rather than the red/green/purple ramp the default palette uses.
 */
export const RARITY_COLORS_COLORBLIND: Record<ItemRarity, string> = {
  common: '#cfd6dd',
  uncommon: '#56b4e9',
  rare: '#0072b2',
  mythical: '#9a6dd7',
  legendary: '#cc79a7',
  immortal: '#e69f00',
  arcana: '#f0e442'
};

let activeRarityColors: Record<ItemRarity, string> = RARITY_COLORS;

/** Swap the rarity/loot palette for the colorblind-safe set (renderer-only, no sim effect). */
export function setColorblindPalette(on: boolean): void {
  activeRarityColors = on ? RARITY_COLORS_COLORBLIND : RARITY_COLORS;
}

export function rarityColor(rarity: ItemRarity | undefined): string {
  return activeRarityColors[rarity ?? 'common'] ?? activeRarityColors.common;
}
