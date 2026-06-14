import { beforeAll, describe, expect, it } from 'vitest';
import { lootTableToDropTable, rollItemDrops } from '../core/phase3';
import { Rng } from '../core/rng';
import { REG } from '../core/registry';
import type { DifficultyTier, ItemDropTable, ItemRarity, LootBand } from '../core/types';
import { registerAllContent } from '../data';
import { DEFAULT_CREEP_DROP_TABLES } from '../data/creep-drops';
import { TUNING } from '../data/tuning';

beforeAll(() => registerAllContent());

const RARITY_RANK: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythical: 3,
  legendary: 4,
  immortal: 5,
  arcana: 6
};

function egDropCount(items: { id: string }[]): number {
  return items.filter((item) => RARITY_RANK[REG.item(item.id).rarity ?? 'common'] >= RARITY_RANK.legendary).length;
}

function echoEgTable(): ItemDropTable {
  return {
    guaranteed: [],
    slots: [
      {
        id: 'pacing-echo-endgame',
        rarity: 'legendary',
        rolls: 1,
        chance: TUNING.overworldEgSlotPct.echo,
        pool: [
          { id: 'assault-cuirass', weight: 1, rarity: 'legendary' },
          { id: 'daedalus', weight: 1, rarity: 'legendary' }
        ],
        raritySplit: true
      }
    ]
  };
}

function simulateDrops(opts: {
  minutes: number;
  band: LootBand;
  tier: DifficultyTier;
  sources: { table: ItemDropTable; clearMin: number; seedSalt: number }[];
}): number {
  let drops = 0;
  for (const source of opts.sources) {
    const clears = Math.floor(opts.minutes / source.clearMin);
    let dryStreaks: Record<string, number> = {};
    for (let i = 0; i < clears; i++) {
      const roll = rollItemDrops(source.table, opts.tier, dryStreaks, new Rng(source.seedSalt + i * 17), opts.band);
      dryStreaks = roll.dryStreaks;
      drops += egDropCount(roll.items);
    }
  }
  return drops;
}

describe('Gameplay 2.0 loot pacing', () => {
  it('rolls chase rarity inside a split-aware EG event by loot band', () => {
    const table: ItemDropTable = {
      guaranteed: [],
      slots: [
        {
          id: 'split-eg',
          rarity: 'legendary',
          rolls: 1,
          chance: { normal: 1, nightmare: 1, hell: 1 },
          pool: [
            { id: 'assault-cuirass', weight: 1, rarity: 'legendary' },
            { id: 'butterfly', weight: 1, rarity: 'immortal' },
            { id: 'aegis-of-the-immortal', weight: 1, rarity: 'arcana' }
          ],
          raritySplit: true
        }
      ]
    };

    const counts: Record<ItemRarity, number> = { common: 0, uncommon: 0, rare: 0, mythical: 0, legendary: 0, immortal: 0, arcana: 0 };
    const rolls = 20_000;
    for (let i = 0; i < rolls; i++) {
      const item = rollItemDrops(table, 'hell', {}, new Rng(10_000 + i), 'late').items[0]!;
      counts[REG.item(item.id).rarity ?? 'common'] += 1;
    }

    const split = TUNING.loot.egRaritySplit.late;
    expect(counts.legendary / rolls).toBeGreaterThan(split.legendary - 0.025);
    expect(counts.legendary / rolls).toBeLessThan(split.legendary + 0.025);
    expect(counts.immortal / rolls).toBeGreaterThan(split.immortal - 0.018);
    expect(counts.immortal / rolls).toBeLessThan(split.immortal + 0.018);
    expect(counts.arcana / rolls).toBeGreaterThan(split.arcana - 0.006);
    expect(counts.arcana / rolls).toBeLessThan(split.arcana + 0.006);
  });

  it('keeps representative overworld farming near each band EG cadence', () => {
    const minutes = 60_000;
    const plans: { band: LootBand; tier: DifficultyTier; sources: { table: ItemDropTable; clearMin: number; seedSalt: number }[] }[] = [
      {
        band: 'early',
        tier: 'normal',
        sources: [
          { table: DEFAULT_CREEP_DROP_TABLES.large, clearMin: 0.75, seedSalt: 1_000_000 },
          { table: echoEgTable(), clearMin: 2.5, seedSalt: 2_000_000 }
        ]
      },
      {
        band: 'mid',
        tier: 'nightmare',
        sources: [
          { table: DEFAULT_CREEP_DROP_TABLES.large, clearMin: 0.75, seedSalt: 3_000_000 },
          { table: echoEgTable(), clearMin: 5, seedSalt: 4_000_000 }
        ]
      },
      {
        band: 'late',
        tier: 'hell',
        sources: [
          { table: DEFAULT_CREEP_DROP_TABLES.ancient, clearMin: 0.75, seedSalt: 5_000_000 }
        ]
      }
    ];

    for (const plan of plans) {
      const rate = simulateDrops({ minutes, ...plan }) / minutes;
      const floor = 1 / TUNING.loot.egCadenceMinByBand[plan.band];
      expect(rate).toBeGreaterThanOrEqual(floor);
      expect(rate).toBeLessThanOrEqual(floor * 1.6);
    }
  });

  it('keeps boss, raid, and dungeon EG faucets wired into the late-band matrix', () => {
    const minutes = 60_000;
    const floor = 1 / TUNING.loot.egCadenceMinByBand.late;
    const sources = [
      {
        name: 'regional boss',
        table: lootTableToDropTable(REG.boss('boss-phantom-assassin').loot),
        clearMin: 5,
        min: floor * 0.45,
        max: floor * 1.15,
        seedSalt: 6_000_000
      },
      {
        name: 'raid',
        table: lootTableToDropTable(REG.raid('lord-of-terror').loot),
        clearMin: 8,
        min: floor * 0.35,
        max: floor * 1.1,
        seedSalt: 7_000_000
      },
      {
        name: 'dungeon guardian',
        table: REG.dungeon('frost-hollow').loot.boss,
        clearMin: 16,
        min: floor * 0.2,
        max: floor * 0.85,
        seedSalt: 8_000_000
      }
    ];

    for (const source of sources) {
      const rate = simulateDrops({
        minutes,
        band: 'late',
        tier: 'hell',
        sources: [{ table: source.table, clearMin: source.clearMin, seedSalt: source.seedSalt }]
      }) / minutes;
      expect(rate, source.name).toBeGreaterThanOrEqual(source.min);
      expect(rate, source.name).toBeLessThanOrEqual(source.max);
    }
  });
});
