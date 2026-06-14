import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { applyDamage } from '../core/combat';
import { generateDungeon, rollRoomSpawns } from '../core/dungeon';
import { rollItemDrops } from '../core/phase3';
import { Rng } from '../core/rng';
import { freshEchoProgress } from '../core/echo';
import { xpForLevel } from '../core/stats';
import { dungeonAffixes } from '../data/dungeon-affixes';
import { Game, newGameSave } from '../systems/game';
import { DungeonSession } from '../systems/dungeon-session';
import type { AffixDef, DungeonDef, GameSave, ItemDropTable, PlannedPack, RoomType, SpawnCard } from '../core/types';

beforeAll(() => registerAllContent());

const DROP: ItemDropTable = {
  guaranteed: [],
  slots: [
    {
      id: 'dungeon-common',
      rarity: 'common',
      rolls: 1,
      chance: { normal: 1, nightmare: 1, hell: 1 },
      pool: [{ id: 'tango', weight: 1 }],
      source: 'dungeon'
    }
  ]
};

const GUARDIAN_DROP: ItemDropTable = {
  guaranteed: ['demon-edge'],
  slots: [
    {
      id: 'guardian-anchor',
      rarity: 'legendary',
      rolls: 1,
      chance: { normal: 0.25, nightmare: 0.4, hell: 0.65 },
      pool: [{ id: 'butterfly', weight: 1 }],
      source: 'dungeon'
    }
  ]
};

function lootByRoom(): Record<RoomType, ItemDropTable> {
  return {
    entrance: DROP,
    combat: DROP,
    elite: DROP,
    treasure: DROP,
    shrine: DROP,
    rest: DROP,
    boss: GUARDIAN_DROP
  };
}

const BASE_DUNGEON: DungeonDef = {
  id: 'test-descent',
  name: 'Test Descent',
  regionId: 'icewrack',
  biome: 'snow',
  templates: ['ice-entry', 'ice-hall', 'ice-vault'],
  roomCount: { min: 8, max: 8 },
  spawnPool: [
    { creepId: 'kobold', weight: 5, cost: 8 },
    { creepId: 'wolf', weight: 3, cost: 16, minDepth: 2 },
    { creepId: 'granite-golem', weight: 1, cost: 32, minDepth: 5, rarity: 'rare' }
  ],
  affixPool: ['jailer', 'molten', 'vortex'],
  guardian: 'boss-phantom-assassin',
  loot: lootByRoom(),
  budget: { base: 36, perDepth: 12 },
  tiers: ['normal', 'nightmare', 'hell']
};

function populationScore(packs: PlannedPack[]): { bodies: number; rarity: number; affixes: number } {
  return packs.reduce((acc, pack) => {
    acc.bodies += pack.cards.length;
    acc.affixes += pack.affixes.length;
    acc.rarity += pack.rarity === 'rare' ? 3 : pack.rarity === 'champion' ? 2 : 1;
    return acc;
  }, { bodies: 0, rarity: 0, affixes: 0 });
}

describe('dungeon generation D0', () => {
  it('generates a stable layout and population for a fixed seed', () => {
    const a = generateDungeon(BASE_DUNGEON, 'hell', 424242);
    const b = generateDungeon(BASE_DUNGEON, 'hell', 424242);
    const c = generateDungeon(BASE_DUNGEON, 'hell', 424243);

    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    expect(a.depth).toBe(8);
    expect(a.rooms.length).toBe(a.depth);
  });

  it('applies the first-cut room graph rules', () => {
    const layout = generateDungeon(BASE_DUNGEON, 'nightmare', 99);
    const rooms = layout.rooms;

    expect(rooms[0].type).toBe('entrance');
    expect(rooms.at(-1)?.type).toBe('boss');
    expect(rooms[layout.depth - 2].type).toBe('rest');
    expect(rooms[Math.floor(layout.depth / 2)].type).toBe('treasure');
    expect(rooms[0].packs).toEqual([]);
    expect(rooms[layout.depth - 2].packs).toEqual([]);
    expect(rooms.at(-1)?.packs).toEqual([]);

    for (const room of rooms) {
      expect(room.index).toBe(rooms.indexOf(room));
      expect(BASE_DUNGEON.templates).toContain(room.templateId);
      expect(new Set(room.exits).size).toBe(room.exits.length);
      for (const exit of room.exits) {
        expect(exit).toBeGreaterThan(room.index);
        expect(exit).toBeLessThan(layout.depth);
      }
      if (room.type !== 'boss') expect(room.exits.length).toBeGreaterThan(0);
    }
  });

  it('scales room populations by budget, depth, and tier over a seed sweep', () => {
    const pool: SpawnCard[] = [
      { creepId: 'kobold', weight: 6, cost: 8 },
      { creepId: 'wolf', weight: 3, cost: 18, minDepth: 2 },
      { creepId: 'granite-golem', weight: 1, cost: 30, minDepth: 5, rarity: 'rare' }
    ];
    const affixes: AffixDef[] = [
      { id: 'jailer', name: 'Jailer', apply: [] },
      { id: 'molten', name: 'Molten', apply: [] },
      { id: 'vortex', name: 'Vortex', apply: [] }
    ];

    const low = { bodies: 0, rarity: 0, affixes: 0 };
    const high = { bodies: 0, rarity: 0, affixes: 0 };
    for (let seed = 1; seed <= 80; seed++) {
      const lowScore = populationScore(rollRoomSpawns(pool, affixes, 40, 'normal', 1, new Rng(seed)));
      const highScore = populationScore(rollRoomSpawns(pool, affixes, 180, 'hell', 8, new Rng(seed)));
      low.bodies += lowScore.bodies;
      low.rarity += lowScore.rarity;
      low.affixes += lowScore.affixes;
      high.bodies += highScore.bodies;
      high.rarity += highScore.rarity;
      high.affixes += highScore.affixes;
    }

    expect(high.bodies).toBeGreaterThan(low.bodies);
    expect(high.rarity).toBeGreaterThan(low.rarity);
    expect(high.affixes).toBeGreaterThan(low.affixes);
  });

  it('respects affix tier gates and exclusions', () => {
    const pool: SpawnCard[] = [{ creepId: 'elite-kobold', weight: 1, cost: 5, rarity: 'rare' }];
    const affixes: AffixDef[] = [
      { id: 'jailer', name: 'Jailer', apply: [], excludes: ['vortex'] },
      { id: 'vortex', name: 'Vortex', apply: [] },
      { id: 'hellfire', name: 'Hellfire', apply: [], minTier: 'hell' }
    ];

    const normal = rollRoomSpawns(pool, affixes, 80, 'normal', 5, new Rng(7));
    for (const pack of normal) {
      expect(pack.affixes).not.toContain('hellfire');
      expect(pack.affixes.includes('jailer') && pack.affixes.includes('vortex')).toBe(false);
    }

    let sawHellOnlyAffix = false;
    for (let seed = 1; seed <= 20; seed++) {
      const hell = rollRoomSpawns(pool, affixes, 80, 'hell', 5, new Rng(seed));
      for (const pack of hell) {
        expect(pack.affixes.includes('jailer') && pack.affixes.includes('vortex')).toBe(false);
        sawHellOnlyAffix = sawHellOnlyAffix || pack.affixes.includes('hellfire');
      }
    }
    expect(sawHellOnlyAffix).toBe(true);
  });

  it('applies selected dungeon modifiers deterministically without changing no-modifier runs', () => {
    const def = REG.dungeon('frost-hollow');
    const plain = generateDungeon(def, 'nightmare', 2026);
    expect(generateDungeon(def, 'nightmare', 2026, { modifiers: [] })).toEqual(plain);

    const deepA = generateDungeon(def, 'nightmare', 2026, { modifiers: ['deep-map'] });
    const deepB = generateDungeon(def, 'nightmare', 2026, { modifiers: ['deep-map'] });
    expect(deepA).toEqual(deepB);
    expect(deepA.modifiers).toEqual(['deep-map']);
    expect(deepA.depth).toBe(plain.depth + 2);

    const packed = generateDungeon(def, 'nightmare', 2026, { modifiers: ['packed-halls', 'champion-sigil'] });
    const plainBodies = plain.rooms.reduce((sum, room) => sum + populationScore(room.packs).bodies, 0);
    const packedBodies = packed.rooms.reduce((sum, room) => sum + populationScore(room.packs).bodies, 0);
    expect(packedBodies).toBeGreaterThan(plainBodies);
  });

  it('drops an upgraded-quality guardian anchor on some seed (L5 source quality)', () => {
    const def = REG.dungeon('frost-hollow');
    const guardian = def.loot.boss;
    expect(guardian.slots.some((s) => s.qualityOdds)).toBe(true);

    let sawQuality = false;
    for (let seed = 1; seed <= 200 && !sawQuality; seed++) {
      const roll = rollItemDrops(guardian, 'hell', {}, new Rng(seed));
      if (roll.items.some((it) => it.quality)) sawQuality = true;
    }
    expect(sawQuality).toBe(true);
  });

  it('forces modifier affixes when legal', () => {
    const modded: DungeonDef = {
      ...BASE_DUNGEON,
      id: 'forced-affix-test',
      roomCount: { min: 4, max: 4 },
      spawnPool: [{ creepId: 'kobold', weight: 1, cost: 1, rarity: 'rare' }],
      affixPool: ['frozen', 'jailer'],
      affixes: dungeonAffixes(['frozen', 'jailer']),
      modifiers: [{ id: 'force-frozen', name: 'Force Frozen', description: 'test', forcedAffix: 'frozen' }],
      budget: { base: 20, perDepth: 0 }
    };
    const layout = generateDungeon(modded, 'normal', 11, { modifiers: ['force-frozen'] });
    const affixedPacks = layout.rooms.flatMap((room) => room.packs).filter((pack) => pack.rarity !== 'normal');
    expect(affixedPacks.length).toBeGreaterThan(0);
    expect(affixedPacks.every((pack) => pack.affixes.includes('frozen'))).toBe(true);
  });
});

function dungeonSave(): GameSave {
  const save = newGameSave('juggernaut');
  const team = [
    { heroId: 'juggernaut', items: ['black-king-bar', 'battlefury', 'crystalys'] },
    { heroId: 'sven', items: ['black-king-bar', 'crystalys', 'hyperstone'] },
    { heroId: 'sniper', items: ['dragon-lance', 'maelstrom', 'crystalys'] },
    { heroId: 'lich', items: ['kaya', 'glimmer-cape', 'force-staff'] },
    { heroId: 'earthshaker', items: ['blink-dagger', 'black-king-bar', 'platemail'] }
  ];
  const portal = REG.region('icewrack').dungeons![0];
  save.regionId = 'icewrack';
  save.worldSeed = REG.region('icewrack').seed;
  save.playerPos = { ...portal.pos };
  save.party = team.map((h) => h.heroId);
  save.recruited = team.map((h) => h.heroId);
  save.roster = team.map((h) => ({
    heroId: h.heroId,
    level: 30,
    xp: xpForLevel(30),
    items: [0, 1, 2, 3, 4, 5].map((i) => (h.items[i] ? { id: h.items[i] } : null)),
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: [{ if: [{ k: 'always' }], then: { k: 'attack-focus' } }],
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0]
  }));
  return save;
}

describe('dungeon session D1/D2', () => {
  function clearCurrentRoom(g: Game): void {
    for (let guard = 0; guard < 500; guard++) {
      const session = g.liveDungeon;
      if (!session || session.exitsUnlocked()) return;
      const hero = session.drivenUnit()!;
      for (const uid of [...session.enemyUids]) {
        const enemy = session.sim.unit(uid);
        if (enemy?.alive) applyDamage(session.sim, hero, enemy, 1e9, 'physical');
      }
      g.update(0.1);
    }
    throw new Error('room did not clear');
  }

  function chooseFirstExit(g: Game): void {
    const session = g.liveDungeon!;
    const next = session.availableExits()[0];
    expect(next).toBeDefined();
    expect(g.chooseDungeonExit(next.index)).toBe(true);
  }

  it('locks exits until a room is clear, then waits for an explicit route choice', () => {
    const g = Game.headless(dungeonSave());
    expect(g.startDungeon('frost-hollow', 'normal', { seed: 1001 })).toBe(true);
    const session = g.liveDungeon!;
    const firstRoom = session.room.index;
    expect(session.enemyUids.length).toBeGreaterThan(0);

    g.update(0.05);
    expect(g.liveDungeon?.room.index).toBe(firstRoom);

    clearCurrentRoom(g);
    expect(g.liveDungeon).toBeTruthy();
    expect(g.liveDungeon!.room.index).toBe(firstRoom);
    expect(g.liveDungeon!.exitsUnlocked()).toBe(true);

    chooseFirstExit(g);
    expect(g.liveDungeon!.room.index).toBeGreaterThan(firstRoom);
  });

  it('enters from a portal, grants room rewards on clear, clears a multi-room run, and exits', () => {
    const g = Game.headless(dungeonSave());
    const before = g.inventoryStash.length;

    expect(g.tryInteract()).toBe(true);
    expect(g.liveDungeon).toBeTruthy();
    expect(g.liveDungeon!.def.id).toBe('frost-hollow');
    const depth = g.liveDungeon!.layout.depth;
    const visited = new Set<number>();
    let sawMidRunReward = false;

    while (g.liveDungeon) {
      visited.add(g.liveDungeon.room.index);
      if (g.liveDungeon.exitsUnlocked()) {
        chooseFirstExit(g);
        continue;
      }
      clearCurrentRoom(g);
      if (g.liveDungeon && g.inventoryStash.length > before) sawMidRunReward = true;
    }

    expect(g.liveDungeon).toBeNull();
    expect(visited.size).toBeGreaterThan(1);
    expect(sawMidRunReward).toBe(true);
    expect(g.inventoryStash.length).toBeGreaterThan(before);
    expect(g.toasts.some((t) => t.text.includes('Frost Hollow cleared'))).toBe(true);
    expect(g.toasts.some((t) => t.text.includes(`${depth}/${depth} rooms`))).toBe(true);
  });

  it('opens the dungeon entry hook from a portal before starting in UI mode', () => {
    const g = Game.headless(dungeonSave());
    let opened: string | null = null;
    g.onOpenDungeonEntry = (id) => {
      opened = id;
    };

    expect(g.tryInteract()).toBe(true);
    expect(opened).toBe('frost-hollow');
    expect(g.liveDungeon).toBeNull();
  });

  it('starts a modified tiered dungeon and records progress on clear', () => {
    const g = Game.headless(dungeonSave());
    const before = g.inventoryStash.length;
    expect(g.startDungeon('frost-hollow', 'nightmare', { seed: 2027, modifiers: ['deep-map', 'frozen-oath'] })).toBe(true);
    expect(g.liveDungeon!.tier).toBe('nightmare');
    expect(g.liveDungeon!.selectedModifiers()).toEqual(['deep-map', 'frozen-oath']);
    const depth = g.liveDungeon!.layout.depth;

    while (g.liveDungeon) {
      if (g.liveDungeon.exitsUnlocked()) chooseFirstExit(g);
      else clearCurrentRoom(g);
    }

    const progress = g.buildSave().dungeonProgress['frost-hollow'];
    expect(progress.clears).toBe(1);
    expect(progress.bestDepth).toBe(depth);
    expect(progress.bestTier).toBe('nightmare');
    expect(progress.lastModifiers).toEqual(['deep-map', 'frozen-oath']);
    expect(g.inventoryStash.length).toBeGreaterThan(before);
  });

  it('ejects cleanly on a one-room wipe without saving mid-run state', () => {
    const g = Game.headless(dungeonSave());
    expect(g.startDungeon('frost-hollow', 'normal', { seed: 1001 })).toBe(true);
    const session = g.liveDungeon!;
    const enemy = session.sim.unit(session.enemyUids[0])!;

    for (const uid of [...session.partyUids]) {
      const hero = session.sim.unit(uid);
      if (hero?.alive) applyDamage(session.sim, enemy, hero, 1e9, 'physical');
      g.update(0.05);
    }

    expect(g.liveDungeon).toBeNull();
    const save = g.buildSave();
    expect(save.regionId).toBe('icewrack');
    expect(save.playerPos).toEqual(REG.region('icewrack').dungeons![0].pos);
    expect(g.toasts.some((t) => t.text.includes('ejects the party at the portal'))).toBe(true);
  });

  it('ships the full affix library, each composed from existing primitives', () => {
    const ids = ['jailer', 'frozen', 'vortex', 'fast', 'molten', 'waller', 'shielding', 'health-link'];
    const defs = dungeonAffixes(ids);
    expect(defs).toHaveLength(ids.length);
    for (const def of defs) expect(def.apply.length).toBeGreaterThan(0);
    // Frost Hollow draws from the whole library (D3).
    for (const id of ids) expect(REG.dungeon('frost-hollow').affixPool).toContain(id);
  });

  it('applies the Shielding affix as a stat buff on the pack', () => {
    const shieldDungeon: DungeonDef = {
      ...BASE_DUNGEON,
      id: 'shield-affix-test',
      roomCount: { min: 3, max: 3 },
      spawnPool: [{ creepId: 'kobold', weight: 1, cost: 1, rarity: 'rare' }],
      affixPool: ['shielding'],
      affixes: dungeonAffixes(['shielding']),
      budget: { base: 20, perDepth: 0 }
    };
    const session = new DungeonSession(shieldDungeon, [{ heroId: 'juggernaut', level: 30, items: ['battlefury'] }], 'normal', 51);
    const enemy = session.enemyUids.map((uid) => session.sim.unit(uid)).find((u) => !!u);
    expect(enemy).toBeDefined();
    expect(enemy!.hasStatus('buff')).toBe(true);
  });

  it('applies authored affixes to spawned dungeon packs', () => {
    const fastDungeon: DungeonDef = {
      ...BASE_DUNGEON,
      id: 'fast-affix-test',
      roomCount: { min: 3, max: 3 },
      spawnPool: [{ creepId: 'kobold', weight: 1, cost: 1, rarity: 'rare' }],
      affixPool: ['fast'],
      affixes: dungeonAffixes(['fast']),
      budget: { base: 20, perDepth: 0 }
    };
    const session = new DungeonSession(fastDungeon, [{ heroId: 'juggernaut', level: 30, items: ['battlefury'] }], 'normal', 77);
    const enemy = session.enemyUids.map((uid) => session.sim.unit(uid)).find((u) => !!u);

    expect(enemy).toBeDefined();
    expect(enemy!.hasStatus('buff')).toBe(true);
  });

  it('paces planned packs without changing their content', () => {
    const pacedDungeon: DungeonDef = {
      ...BASE_DUNGEON,
      id: 'paced-pack-test',
      roomCount: { min: 3, max: 3 },
      spawnPool: [{ creepId: 'kobold', weight: 1, cost: 1 }],
      affixPool: [],
      affixes: [],
      budget: { base: 25, perDepth: 0 }
    };
    const session = new DungeonSession(pacedDungeon, [{ heroId: 'juggernaut', level: 30, items: ['battlefury'] }], 'normal', 99);
    const planned = session.room.packs.length;
    expect(planned).toBeGreaterThan(1);
    expect(session.pacingInfo().spawnedPacks).toBe(1);

    const hero = session.drivenUnit()!;
    for (let guard = 0; guard < 500 && !session.exitsUnlocked(); guard++) {
      for (const uid of [...session.enemyUids]) {
        const enemy = session.sim.unit(uid);
        if (enemy?.alive) applyDamage(session.sim, hero, enemy, 1e9, 'physical');
      }
      session.step(0.1);
    }

    expect(session.exitsUnlocked()).toBe(true);
    expect(session.pacingInfo().spawnedPacks).toBe(planned);
    expect(session.pacingInfo().remainingPacks).toBe(0);
  });

  it('fires guardian boss phases inside the dungeon session', () => {
    const phaseDungeon: DungeonDef = {
      ...BASE_DUNGEON,
      id: 'guardian-phase-test',
      roomCount: { min: 3, max: 3 },
      spawnPool: [{ creepId: 'kobold', weight: 1, cost: 1 }],
      affixPool: [],
      affixes: [],
      guardian: 'boss-phantom-assassin',
      budget: { base: 10, perDepth: 0 }
    };
    const session = new DungeonSession(phaseDungeon, [{ heroId: 'juggernaut', level: 30, items: ['battlefury'] }], 'normal', 88);
    const hero = session.drivenUnit()!;
    for (let guard = 0; guard < 500 && !session.exitsUnlocked(); guard++) {
      for (const uid of [...session.enemyUids]) {
        const enemy = session.sim.unit(uid);
        if (enemy?.alive) applyDamage(session.sim, hero, enemy, 1e9, 'physical');
      }
      session.step(0.05);
    }
    expect(session.exitsUnlocked()).toBe(true);
    expect(session.chooseExit(session.availableExits()[0].index)).toBe(true);
    expect(session.room.type).toBe('boss');

    const boss = session.sim.unit(session.enemyUids[0])!;
    boss.hp = boss.stats.maxHp * 0.6;
    session.step(0.05);

    expect(session.guardianMechanicsFired).toContain('phase-0');
    expect(boss.hasStatus('buff')).toBe(true);
  });
});
