import { disenchant } from '../data/forge';
import { ITEM_GRADES } from '../data/grade';
import type { ItemGrade, ItemRarity, ItemSave, LootFilterSave } from '../core/types';

export interface LootFilterRule extends LootFilterSave {}

export interface LootFilterResult {
  kept: ItemSave[];
  disenchanted: { item: ItemSave; essence: number }[];
}

export const RARITY_ORDER: ItemRarity[] = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal', 'arcana'];

export const DEFAULT_LOOT_FILTER: LootFilterRule = {
  minGrade: 'broken',
  minRarity: 'common',
  autoDisenchantBelowGrade: undefined,
  autoDisenchantBelowRarity: undefined
};

function gradeRank(grade: ItemGrade | undefined): number {
  return ITEM_GRADES.indexOf(grade ?? 'standard');
}

function rarityRank(rarity: ItemRarity | undefined): number {
  return RARITY_ORDER.indexOf(rarity ?? 'common');
}

export function passesLootFilter(item: ItemSave, rarity: ItemRarity | undefined, rule: LootFilterRule = DEFAULT_LOOT_FILTER): boolean {
  return gradeRank(item.grade) >= gradeRank(rule.minGrade) && rarityRank(rarity) >= rarityRank(rule.minRarity);
}

export function applyLootFilter(items: ItemSave[], rarityFor: (item: ItemSave) => ItemRarity | undefined, rule: LootFilterRule = DEFAULT_LOOT_FILTER): LootFilterResult {
  const kept: ItemSave[] = [];
  const disenchanted: { item: ItemSave; essence: number }[] = [];
  for (const item of items) {
    if (item.locked) {
      kept.push(item);
      continue;
    }
    const rarity = rarityFor(item);
    const belowDisenchantGrade = rule.autoDisenchantBelowGrade && gradeRank(item.grade) < gradeRank(rule.autoDisenchantBelowGrade);
    const belowDisenchantRarity = rule.autoDisenchantBelowRarity && rarityRank(rarity) < rarityRank(rule.autoDisenchantBelowRarity);
    if (belowDisenchantGrade || belowDisenchantRarity) {
      disenchanted.push({ item, essence: disenchant(item) });
    } else if (passesLootFilter(item, rarity, rule)) {
      kept.push(item);
    }
  }
  return { kept, disenchanted };
}
