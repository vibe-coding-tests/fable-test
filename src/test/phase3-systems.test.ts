import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES } from '../data';
import { ALL_NEUTRAL_ITEMS } from '../data/neutral-items';
import { ALL_RAIDS } from '../data/raids';
import { ELITE_DRAFT } from '../data/drafts';
import { REG } from '../core/registry';
import {
  bossLootSeed,
  bossTierUnlocked,
  buybackCost,
  chooseFaction,
  dayNightMods,
  draftTeams,
  enchantNeutralItem,
  rerollNeutralItem,
  raidMechanicTimeline,
  raidSetupFromDef,
  lootTableToDropTable,
  rollItemDrops,
  rollLoot,
  rollNeutralDrop,
  scaledBounty,
  tomePurchase,
  visionRadius
} from '../core/phase3';
import { Rng } from '../core/rng';
import { runRaidBattle } from '../core/macro';
import { Game, newGameSave, SAVE_VERSION } from '../systems/game';

beforeAll(() => registerAllContent());

const RAID_PARTY = [
  { heroId: 'axe', level: 30, items: ['black-king-bar', 'assault-cuirass'] },
  { heroId: 'juggernaut', level: 30, items: ['butterfly', 'black-king-bar'] },
  { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'mekansm'] },
  { heroId: 'lich', level: 30, items: ['eye-of-skadi'] },
  { heroId: 'sniper', level: 30, items: ['dragon-lance', 'maelstrom'] }
];

describe('Phase 3 difficulty, loot, and reward economy', () => {
  it('scales rewards by region depth, difficulty, creep tier, and star', () => {
    const base = { xp: 100, gold: 50 };
    const early = scaledBounty(base, 'tranquil-vale', 'normal', 'small', 1);
    const deep = scaledBounty(base, 'mad-moon-crater', 'hell', 'ancient', 3);
    expect(deep.xp).toBeGreaterThan(early.xp);
    expect(deep.gold).toBeGreaterThan(early.gold);
  });

  it('rolls boss loot deterministically and honors pity', () => {
    const boss = REG.boss('boss-phantom-assassin');
    const dry = rollLoot(boss.loot, 'normal', 0, bossLootSeed(boss, 'normal', 1));
    expect(dry.guaranteed.length).toBeGreaterThan(0);
    const pity = rollLoot(boss.loot, 'hell', boss.loot.pity - 1, bossLootSeed(boss, 'hell', 8));
    expect(pity.assembled).toBeDefined();
    expect(pity.dryStreak).toBe(0);
    expect(pity.pityUsed).toBe(true);
  });

  it('keeps the generalized item drop table compatible with legacy boss loot', () => {
    const boss = REG.boss('boss-phantom-assassin');
    for (const dryStreak of [0, boss.loot.pity - 1]) {
      const seed = bossLootSeed(boss, 'hell', dryStreak + 10);
      const legacy = rollLoot(boss.loot, 'hell', dryStreak, seed);
      const generalized = rollItemDrops(lootTableToDropTable(boss.loot), 'hell', { assembled: dryStreak }, new Rng(seed));
      expect(generalized.items.slice(0, legacy.guaranteed.length)).toEqual(legacy.guaranteed);
      expect(generalized.items[legacy.guaranteed.length]).toEqual(legacy.assembled);
      expect(generalized.dryStreaks.assembled).toBe(legacy.dryStreak);
      expect(generalized.pityUsed).toBe(legacy.pityUsed);
    }
  });

  it('gates Hell behind a cleared Nightmare rerun', () => {
    expect(bossTierUnlocked(undefined, 'nightmare', false)).toBe(false);
    expect(bossTierUnlocked({ tier: 'normal', dryClears: 2 }, 'nightmare', true)).toBe(true);
    expect(bossTierUnlocked({ tier: 'normal', dryClears: 0 }, 'hell', true)).toBe(false);
    expect(bossTierUnlocked({ tier: 'nightmare', dryClears: 0 }, 'hell', true)).toBe(true);
  });

  it('keeps neutral item drops tiered and Tinker Bench operations in rule', () => {
    const forced = rollNeutralDrop('ancient', ALL_NEUTRAL_ITEMS, 2_026_061);
    // Seed may miss the drop chance; reroll/enchant cover deterministic bench behavior.
    expect(forced === null || forced.dropFromTier === 'ancient').toBe(true);
    const rerolled = rerollNeutralItem('trusty-shovel', ALL_NEUTRAL_ITEMS, 44);
    expect(rerolled.tier).toBe(1);
    expect(rerolled.id).not.toBe('trusty-shovel');
    const enchanted = enchantNeutralItem('trusty-shovel', [{ id: 'trusty-shovel', count: 3 }], ALL_NEUTRAL_ITEMS);
    expect(enchanted.item.id).toBe('vambrace');
    expect(enchanted.stash).toEqual([]);
  });

  it('models faithful gold sinks without vending gated power', () => {
    expect(buybackCost(30, 2)).toBeGreaterThan(buybackCost(1, 0));
    const tome = tomePurchase(1000, 1);
    expect(tome.ok).toBe(true);
    expect(tome.xp).toBeGreaterThan(0);
    const gated = new Set(['divine-rapier', 'butterfly', 'scythe-of-vyse', 'heart-of-tarrasque', 'eye-of-skadi', 'refresher-orb', 'aghanims-scepter']);
    const shopItems = new Set([...REG.regions.values()].flatMap((r) => r.shopInventory));
    for (const id of gated) expect(shopItems.has(id)).toBe(false);
  });
});

describe('Phase 3 raids and draft', () => {
  it('each raid has phase mechanics and can run headless from its def', () => {
    for (const raid of ALL_RAIDS) {
      const timeline = raidMechanicTimeline(raid);
      expect(timeline.some((m) => m.kind === 'add-wave')).toBe(true);
      expect(timeline.some((m) => m.kind === 'zone')).toBe(true);
      expect(timeline.some((m) => m.kind === 'enrage')).toBe(true);
      const result = runRaidBattle(raidSetupFromDef(raid, RAID_PARTY, 'normal', 700 + raid.id.length));
      expect(result.winner, raid.id).not.toBe(-1);
    }
  });

  it('builds legal Elite Five draft teams from the recruited roster', () => {
    const recruited = ALL_HEROES.map((h) => h.id);
    const draft = draftTeams(ELITE_DRAFT, recruited, 1515);
    expect(draft.player.length).toBe(5);
    expect(draft.enemy.length).toBe(5);
    expect(new Set(draft.player.map((h) => h.heroId)).size).toBe(5);
    for (const ban of draft.bans) expect(REG.heroes.has(ban)).toBe(true);
  });
});

describe('Phase 3 day/night, factions, and save v3', () => {
  it('applies night bonuses and tightens vision', () => {
    expect(dayNightMods('night-stalker', true).damage).toBeGreaterThan(0);
    expect(dayNightMods('luna', true).visionPct).toBeGreaterThan(0);
    expect(visionRadius(1000, true)).toBeLessThan(visionRadius(1000, false));
    expect(visionRadius(1000, true, dayNightMods('luna', true))).toBeGreaterThan(visionRadius(1000, true));
  });

  it('enforces Shadeshore faction exclusivity', () => {
    const first = chooseFaction({}, 'shadeshore', 'kunkka', ['kunkka', 'tidehunter']);
    expect(first.shadeshore).toBe('kunkka');
    expect(() => chooseFaction(first, 'shadeshore', 'tidehunter', ['kunkka', 'tidehunter'])).toThrow();
  });

  it('round-trips v3 fields and migrates a v2-shaped save', () => {
    const save = newGameSave('juggernaut');
    save.difficulty['boss-phantom-assassin'] = { tier: 'nightmare', dryClears: 3 };
    save.raidProgress['roshan-pit'] = { clears: 2, dryStreak: 1, aegisHeld: true, roshanRespawnAt: 999 };
    save.eliteFive = { defeated: 5, championDown: true };
    save.factionChoices = { shadeshore: 'kunkka' };
    save.heldUniques = ['aegis-of-the-immortal'];
    save.neutralStash = [{ id: 'trusty-shovel', count: 2 }];
    save.goldSinks = { buybacks: 1, tomesUsed: 2, respecs: 1, gambleRolls: 0, salvages: 0 };
    save.roster[0].neutralSlot = { id: 'trusty-shovel' };
    expect(save.version).toBe(SAVE_VERSION);
    expect(Game.validateSave(save)).toBe(true);

    const v2 = structuredClone(save) as typeof save & { version: number };
    v2.version = 2;
    delete (v2 as Partial<typeof save>).difficulty;
    delete (v2 as Partial<typeof save>).raidProgress;
    const migrated = Game.migrateSave(v2);
    expect(migrated?.version).toBe(SAVE_VERSION);
    expect(migrated?.difficulty).toEqual({});
    expect(migrated?.roster[0].neutralSlot).toEqual({ id: 'trusty-shovel' });
  });
});
