import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { ALL_RAIDS } from '../data/raids';
import { ALL_DUNGEONS } from '../data/dungeons';
import { REG } from '../core/registry';
import { generateDungeon } from '../core/dungeon';
import { rollLoot, rollItemDrops } from '../core/phase3';
import { runRaidEncounter, type RaidEncounterSetup } from '../core/macro';
import { Rng } from '../core/rng';
import type { ItemQuality, MacroHeroSetup } from '../core/types';

// ============================================================
// Marquee wave one (MARQUEE_AND_ARMORY_ADDENDUM §2 / C1 + C2). Pure content on
// the shipped raid runner + dungeon generator: themed anchors per chassis lane,
// reserved Unusual stays raid-only, and each marquee descent generates
// deterministically and ends in its guardian room.
// ============================================================

beforeAll(() => registerAllContent());

const MARQUEE_RAID_IDS = ['renegade-marshal', 'void-prelate', 'forsaken-queen', 'prime-evil', 'lord-of-hatred', 'last-eldwurm'];

const AGI_LANE = new Set(['eaglesong', 'butterfly', 'eye-of-skadi', 'diffusal-blade', 'maelstrom']);
const STR_LANE = new Set(['reaver', 'heart-of-tarrasque', 'assault-cuirass', 'black-king-bar']);
const INT_LANE = new Set(['mystic-staff', 'scythe-of-vyse', 'refresher-orb', 'aghanims-scepter']);

const STR_INT_LANE = new Set([...STR_LANE, ...INT_LANE]);

// The lane each marquee raid's loot is themed to (its chassis attribute, except
// the lightning Lord of Hatred which intentionally anchors the int lane, and the
// Last Eldwurm which is a deliberate strength/int hybrid — Reaver + Aghs).
const RAID_LANE: Record<string, Set<string>> = {
  'renegade-marshal': AGI_LANE,
  'void-prelate': AGI_LANE,
  'forsaken-queen': AGI_LANE,
  'prime-evil': STR_LANE,
  'lord-of-hatred': INT_LANE,
  'last-eldwurm': STR_INT_LANE
};

const STRONG_PARTY: MacroHeroSetup[] = [
  { heroId: 'juggernaut', level: 30, items: ['battlefury', 'butterfly', 'black-king-bar'] },
  { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'] },
  { heroId: 'lich', level: 30, items: ['mekansm', 'glimmer-cape'] },
  { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'arcane-boots'] },
  { heroId: 'sniper', level: 30, items: ['maelstrom', 'dragon-lance'] }
];

describe('C1: marquee raid wave', () => {
  it('registers all six marquee raids on top of the four shipped raids', () => {
    expect(ALL_RAIDS.length).toBe(10);
    for (const id of MARQUEE_RAID_IDS) {
      const def = REG.raids.get(id);
      expect(def, `marquee raid ${id}`).toBeDefined();
      expect(def!.title.trim().length, `${id} title`).toBeGreaterThan(0);
      expect(def!.dialogue.length, `${id} dialogue`).toBeGreaterThanOrEqual(1);
      expect(REG.heroes.has(def!.boss.heroId), `${id} chassis`).toBe(true);
      expect(REG.quests.has(def!.unlockQuest), `${id} unlockQuest`).toBe(true);
    }
  });

  it('anchors loot to each chassis attribute lane (agility marquees never anchor strength)', () => {
    for (const id of MARQUEE_RAID_IDS) {
      const def = REG.raid(id);
      const lane = RAID_LANE[id];
      const anchors = [...def.loot.guaranteed, ...def.loot.assembledPool];
      for (const itemId of anchors) {
        expect(REG.items.has(itemId), `${id}: anchor ${itemId} resolves`).toBe(true);
        expect(lane.has(itemId), `${id}: anchor ${itemId} is in its lane`).toBe(true);
      }
      // the explicit acceptance example: an agility marquee anchors no strength core
      if (lane === AGI_LANE) {
        for (const itemId of anchors) expect(STR_LANE.has(itemId), `${id}: ${itemId} should not be a strength anchor`).toBe(false);
      }
    }
  });

  it('rolls themed loot with pity on a fixed seed and reserves Unusual to raids', () => {
    for (const id of MARQUEE_RAID_IDS) {
      const def = REG.raid(id);
      // deterministic on a seed
      const a = rollLoot(def.loot, 'hell', 0, 9090);
      const b = rollLoot(def.loot, 'hell', 0, 9090);
      expect(a).toEqual(b);
      // pity guarantees the assembled anchor once the dry streak crosses it
      const pityRoll = rollLoot(def.loot, 'normal', def.loot.pity, 1);
      expect(pityRoll.assembled, `${id}: pity should force the anchor`).toBeDefined();

      // the reserved Unusual grade is reachable from raid odds across a sweep
      let sawUnusual = false;
      const seen = new Set<ItemQuality>();
      for (let seed = 1; seed <= 600 && !sawUnusual; seed++) {
        const q = rollLoot(def.loot, 'hell', def.loot.pity, seed).assembled?.quality;
        if (q) seen.add(q);
        if (q === 'unusual') sawUnusual = true;
      }
      expect(sawUnusual, `${id}: raid loot can roll Unusual`).toBe(true);
    }
  });

  it('runs each marquee timeline deterministically with its scripted beats firing', () => {
    for (const id of MARQUEE_RAID_IDS) {
      const def = REG.raid(id);
      const setup: RaidEncounterSetup = { def, party: STRONG_PARTY, tier: 'normal', seed: 31337, maxSec: 160, captureEvents: true };
      const a = runRaidEncounter(setup);
      const b = runRaidEncounter({ ...setup, captureEvents: false });
      expect(a.hash, `${id}: deterministic`).toBe(b.hash);
      const kinds = new Set(a.fired.map((f) => f.kind));
      expect(kinds.has('add-wave'), `${id}: add wave fired`).toBe(true);
      expect(kinds.has('zone'), `${id}: zone fired`).toBe(true);
    }
  });
});

describe('C2: marquee dungeons', () => {
  const MARQUEE_DUNGEON_IDS = ['severed-dark', 'worldstone-vault', 'ember-caldera'];

  it('registers each marquee descent with a resolvable marquee guardian', () => {
    for (const id of MARQUEE_DUNGEON_IDS) {
      const def = REG.dungeon(id);
      expect(def, `dungeon ${id}`).toBeDefined();
      const guardian = REG.boss(def.guardian);
      expect(REG.heroes.has(guardian.heroId), `${id}: guardian chassis`).toBe(true);
      for (const card of def.spawnPool) expect(REG.creeps.has(card.creepId), `${id}: spawn ${card.creepId}`).toBe(true);
    }
    // all four dungeons (Frost Hollow + three marquee) are registered
    expect(ALL_DUNGEONS.length).toBe(4);
  });

  it('generates deterministically on a seed and ends in the guardian room', () => {
    for (const id of MARQUEE_DUNGEON_IDS) {
      const def = REG.dungeon(id);
      const a = generateDungeon(def, 'hell', 778899);
      const b = generateDungeon(def, 'hell', 778899);
      const c = generateDungeon(def, 'hell', 778900);
      expect(a, `${id}: reproducible`).toEqual(b);
      expect(c, `${id}: seed-sensitive`).not.toEqual(a);
      expect(a.rooms[0].type, `${id}: entrance first`).toBe('entrance');
      expect(a.rooms.at(-1)?.type, `${id}: guardian last`).toBe('boss');
      expect(a.rooms.length).toBe(a.depth);
    }
  });

  it('drops a themed guardian anchor and never the raid-only Unusual grade', () => {
    for (const id of MARQUEE_DUNGEON_IDS) {
      const def = REG.dungeon(id);
      const guardian = def.loot.boss;
      expect(guardian.slots.some((s) => s.qualityOdds), `${id}: guardian has source quality`).toBe(true);
      const anchorPool = new Set(guardian.slots.flatMap((s) => s.pool.map((p) => p.id)));

      let sawAnchor = false;
      for (let seed = 1; seed <= 200; seed++) {
        const roll = rollItemDrops(guardian, 'hell', {}, new Rng(seed));
        for (const item of roll.items) {
          if (anchorPool.has(item.id)) sawAnchor = true;
          expect(item.quality, `${id}: dungeon source never rolls Unusual`).not.toBe('unusual');
        }
      }
      expect(sawAnchor, `${id}: guardian anchor drops within the sweep`).toBe(true);
    }
  });
});
