import type { AbilityDef, HeroDef, ValueRef } from './types';

/** Resolve a ValueRef against an ability's per-level values table. */
export function resolveVal(
  ref: ValueRef | undefined,
  values: Record<string, number[]> | undefined,
  level: number,
  fallback = 0
): number {
  if (ref === undefined) return fallback;
  if (typeof ref === 'number') return ref;
  const arr = values?.[ref];
  if (!arr || arr.length === 0) return fallback;
  const idx = Math.max(0, Math.min(arr.length - 1, level - 1));
  return arr[idx];
}

export function abilityVal(def: AbilityDef, ref: ValueRef | undefined, level: number, fallback = 0): number {
  return resolveVal(ref, def.values, level, fallback);
}

export function levelArr(arr: number[] | undefined, level: number, fallback = 0): number {
  if (!arr || arr.length === 0) return fallback;
  return arr[Math.max(0, Math.min(arr.length - 1, level - 1))];
}

export function abilityMaxLevel(def: AbilityDef): number {
  return def.maxLevel ?? (def.ult ? 3 : 4);
}

export function abilityRankRequiredHeroLevel(def: AbilityDef, rank: number): number {
  if (rank <= 1) return def.ult ? 6 : 1;
  if (def.ult) {
    const gates = [6, 12, 18];
    return gates[rank - 1] ?? gates[gates.length - 1] + (rank - gates.length) * 6;
  }
  return 1 + (rank - 1) * 2;
}

export function canLearnAbilityRank(def: AbilityDef, currentRank: number, heroLevel: number): boolean {
  const nextRank = currentRank + 1;
  return nextRank <= abilityMaxLevel(def) && heroLevel >= abilityRankRequiredHeroLevel(def, nextRank);
}

export function normalizeAbilityLevels(def: HeroDef, levels: number[] | undefined, heroLevel: number): number[] {
  return def.abilities.map((ability, i) => {
    const raw = Math.max(0, Math.floor(levels?.[i] ?? 0));
    let level = Math.min(raw, abilityMaxLevel(ability));
    while (level > 0 && heroLevel < abilityRankRequiredHeroLevel(ability, level)) level--;
    return level;
  });
}

export function autoAbilityLevels(def: HeroDef, heroLevel: number, skillOrder?: number[]): number[] {
  const levels = def.abilities.map(() => 0);
  const ultIdx = def.abilities.findIndex((a) => a.ult);
  const basics = def.abilities.map((_, i) => i).filter((i) => i !== ultIdx);
  const order = (skillOrder ?? def.skillOrder ?? basics).filter((i) => basics.includes(i));
  let oi = 0;

  for (let lvl = 1; lvl <= heroLevel; lvl++) {
    if (ultIdx >= 0 && [6, 12, 18].includes(lvl) && canLearnAbilityRank(def.abilities[ultIdx], levels[ultIdx], lvl)) {
      levels[ultIdx]++;
      continue;
    }

    let assigned = false;
    for (let tries = 0; tries < order.length; tries++) {
      const slot = order[oi % order.length];
      oi++;
      if (canLearnAbilityRank(def.abilities[slot], levels[slot], lvl)) {
        levels[slot]++;
        assigned = true;
        break;
      }
    }
    if (!assigned && ultIdx >= 0 && canLearnAbilityRank(def.abilities[ultIdx], levels[ultIdx], lvl)) levels[ultIdx]++;
  }

  return levels;
}
