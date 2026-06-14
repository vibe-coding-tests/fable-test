import { affixDef, rollAffixForKind, rollAffixesFor } from './affixes';
import { GRADE_DEFS, ITEM_GRADES, gradeBaseStatMods, percentileForGrade } from './grade';
import { gemMods } from './gems';
import type { Rng } from '../core/rng';
import type { DifficultyTier, ItemDef, ItemGrade, ItemSave, ItemTier, StatModMap } from '../core/types';

export const DISENCHANT_ESSENCE: Record<ItemGrade, number> = {
  broken: 1,
  worn: 3,
  standard: 6,
  sharp: 13,
  refined: 24,
  pristine: 40
};

export const GRADE_UP_COSTS: Record<Exclude<ItemGrade, 'broken'>, { gambleGold: number; gambleEssence: number; chance: number; deterministicEssence: number }> = {
  worn: { gambleGold: 120, gambleEssence: 1, chance: 0.85, deterministicEssence: 4 },
  standard: { gambleGold: 280, gambleEssence: 2, chance: 0.72, deterministicEssence: 10 },
  sharp: { gambleGold: 550, gambleEssence: 4, chance: 0.58, deterministicEssence: 22 },
  refined: { gambleGold: 1100, gambleEssence: 8, chance: 0.4, deterministicEssence: 42 },
  pristine: { gambleGold: 2200, gambleEssence: 16, chance: 0.22, deterministicEssence: 70 }
};

export const REFORGE_COSTS: Record<ItemGrade, { gold: number; essence: number }> = {
  broken: { gold: 0, essence: 0 },
  worn: { gold: 160, essence: 0 },
  standard: { gold: 260, essence: 1 },
  sharp: { gold: 450, essence: 3 },
  refined: { gold: 800, essence: 6 },
  pristine: { gold: 1400, essence: 10 }
};

export const MASTERWORK_COSTS: Record<ItemGrade, { gold: number; essence: number }> = {
  broken: { gold: 80, essence: 0 },
  worn: { gold: 160, essence: 1 },
  standard: { gold: 280, essence: 2 },
  sharp: { gold: 500, essence: 4 },
  refined: { gold: 900, essence: 7 },
  pristine: { gold: 1500, essence: 12 }
};

export const REROLL_AFFIX_COSTS: Record<ItemGrade, { gold: number; essence: number }> = {
  broken: { gold: 0, essence: 0 },
  worn: { gold: 100, essence: 0 },
  standard: { gold: 160, essence: 0 },
  sharp: { gold: 260, essence: 0 },
  refined: { gold: 450, essence: 0 },
  pristine: { gold: 800, essence: 0 }
};

export const IMPRINT_COSTS: Record<ItemGrade, { gold: number; essence: number }> = {
  broken: { gold: 0, essence: 0 },
  worn: { gold: 0, essence: 2 },
  standard: { gold: 0, essence: 3 },
  sharp: { gold: 0, essence: 6 },
  refined: { gold: 0, essence: 10 },
  pristine: { gold: 0, essence: 16 }
};

const SOCKET_ADD_COSTS: Record<ItemTier, { gold: number; essence: number }> = {
  consumable: { gold: 0, essence: 0 },
  component: { gold: 250, essence: 1 },
  basic: { gold: 300, essence: 1 },
  t1: { gold: 450, essence: 1 },
  t2: { gold: 750, essence: 2 },
  t3: { gold: 1200, essence: 4 },
  t4: { gold: 1800, essence: 7 },
  special: { gold: 0, essence: 0 },
  core: { gold: 750, essence: 2 }
};

export function socketAddCost(def: ItemDef): { gold: number; essence: number } {
  return SOCKET_ADD_COSTS[def.tier];
}

function mergeMods(...parts: (StatModMap | undefined)[]): StatModMap {
  const out: StatModMap = {};
  for (const mods of parts) {
    for (const [key, value] of Object.entries(mods ?? {}) as [keyof StatModMap, number][]) {
      out[key] = Math.round(((out[key] ?? 0) + value) * 10) / 10;
    }
  }
  return out;
}

export function resolvedItemMods(item: ItemSave, def: ItemDef): StatModMap {
  const grade = item.grade ?? 'standard';
  const percentile = percentileForGrade(grade, item.gradeRoll ?? 0.5);
  return mergeMods(
    gradeBaseStatMods(def, percentile),
    ...((item.affixes ?? []).map((affix) => affix.resolved)),
    ...((item.sockets ?? []).map(gemMods))
  );
}

export function refreshResolvedMods(item: ItemSave, def: ItemDef): ItemSave {
  return { ...item, resolvedMods: resolvedItemMods(item, def) };
}

function nextGrade(grade: ItemGrade): ItemGrade | null {
  const next = ITEM_GRADES[ITEM_GRADES.indexOf(grade) + 1];
  return next ?? null;
}

export function disenchant(item: ItemSave): number {
  const base = DISENCHANT_ESSENCE[item.grade ?? 'standard'];
  const signatureBonus = item.affixes?.some((affix) => affix.affixId.includes('storm') || affix.affixId.includes('glass') || affix.affixId.includes('surge')) ? 8 : 0;
  return base + signatureBonus;
}

export function gradeUp(item: ItemSave, def: ItemDef, rng: Rng, opts: { deterministic?: boolean; difficulty?: DifficultyTier } = {}): { item: ItemSave; changed: boolean } {
  const from = item.grade ?? 'standard';
  const to = nextGrade(from);
  if (!to) return { item, changed: false };
  const cost = GRADE_UP_COSTS[to as Exclude<ItemGrade, 'broken'>];
  if (!opts.deterministic && !rng.chance(cost.chance)) return { item, changed: false };
  const gradeRoll = rng.next();
  const affixes = [...(item.affixes ?? [])];
  const slotsNeeded = GRADE_DEFS[to].affixSlots - affixes.filter((affix) => !affix.affixId.includes('signature')).length;
  if (slotsNeeded > 0) {
    affixes.push(...rollAffixesFor(def, to, opts.difficulty ?? 'normal', rng).slice(0, slotsNeeded));
  }
  const nextItem = { ...item, grade: to, gradeRoll, affixes };
  return { item: refreshResolvedMods(nextItem, def), changed: true };
}

export function reforge(item: ItemSave, def: ItemDef, rng: Rng, difficulty: DifficultyTier, imprintedAffixId?: string): ItemSave {
  const grade = item.grade ?? 'standard';
  const imprint = imprintedAffixId ?? item.imprintedAffixId;
  const imprinted = item.affixes?.find((affix) => affix.affixId === imprint);
  const rerolled = rollAffixesFor(def, grade, difficulty, rng);
  const affixes = imprinted ? [imprinted, ...rerolled.filter((affix) => affix.affixId !== imprinted.affixId)] : rerolled;
  return refreshResolvedMods({ ...item, affixes: affixes.slice(0, GRADE_DEFS[grade].affixSlots + 1), imprintedAffixId: imprinted?.affixId }, def);
}

export function masterwork(item: ItemSave, def: ItemDef, amount = 0.12): ItemSave {
  const gradeRoll = Math.min(1, (item.gradeRoll ?? 0.5) + amount * (1 - (item.gradeRoll ?? 0.5)));
  return refreshResolvedMods({ ...item, gradeRoll }, def);
}

export function rerollAffix(item: ItemSave, def: ItemDef, affixIdx: number, rng: Rng, difficulty: DifficultyTier): ItemSave {
  const affixes = [...(item.affixes ?? [])];
  const current = affixes[affixIdx];
  if (!current || current.affixId === item.imprintedAffixId) return refreshResolvedMods(item, def);
  const kind = affixDef(current.affixId).kind;
  const replacement = rollAffixForKind(
    def,
    kind,
    item.grade ?? 'standard',
    difficulty,
    rng,
    affixes.map((affix, i) => (i === affixIdx ? '' : affix.affixId)).filter(Boolean)
  );
  if (!replacement) return refreshResolvedMods(item, def);
  affixes[affixIdx] = replacement;
  return refreshResolvedMods({ ...item, affixes }, def);
}

export function imprintAffix(item: ItemSave, affixIdx: number): ItemSave {
  const affix = item.affixes?.[affixIdx];
  return affix ? { ...item, imprintedAffixId: affix.affixId } : item;
}

export function addSocket(item: ItemSave, def: ItemDef): ItemSave {
  const cap = def.socketCap ?? 0;
  const sockets = [...(item.sockets ?? [])];
  if (sockets.length >= cap) return refreshResolvedMods(item, def);
  sockets.push(null);
  return refreshResolvedMods({ ...item, sockets }, def);
}
