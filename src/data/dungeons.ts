import type { DungeonDef, ItemDropTable, RoomType } from '../core/types';
import { dungeonAffixes } from './dungeon-affixes';

const COMMON_ROOM_DROP: ItemDropTable = {
  guaranteed: ['clarity'],
  slots: [
    {
      id: 'frost-hollow-consumable',
      rarity: 'common',
      rolls: 1,
      chance: { normal: 0.45, nightmare: 0.55, hell: 0.65 },
      pool: [
        { id: 'healing-salve', weight: 2 },
        { id: 'clarity', weight: 2 },
        { id: 'tango', weight: 1 }
      ],
      source: 'dungeon'
    },
    {
      id: 'frost-hollow-component',
      rarity: 'rare',
      rolls: 1,
      chance: { normal: 0.18, nightmare: 0.28, hell: 0.38 },
      pool: [
        { id: 'broadsword', weight: 2 },
        { id: 'claymore', weight: 2 },
        { id: 'mithril-hammer', weight: 1 },
        { id: 'ultimate-orb', weight: 1 }
      ],
      source: 'dungeon'
    }
  ]
};

const ELITE_ROOM_DROP: ItemDropTable = {
  guaranteed: ['clarity'],
  slots: [
    {
      id: 'frost-hollow-elite-component',
      rarity: 'mythical',
      rolls: 1,
      chance: { normal: 0.3, nightmare: 0.45, hell: 0.6 },
      pool: [
        { id: 'demon-edge', weight: 2 },
        { id: 'eaglesong', weight: 1 },
        { id: 'ultimate-orb', weight: 2 },
        { id: 'point-booster', weight: 2 }
      ],
      qualityOdds: { inscribed: 0.06, frozen: 0.05, genuine: 0.04 },
      source: 'dungeon'
    }
  ]
};

const GUARDIAN_DROP: ItemDropTable = {
  guaranteed: ['ultimate-orb'],
  slots: [
    {
      id: 'frost-hollow-guardian-anchor',
      rarity: 'legendary',
      rolls: 1,
      chance: { normal: 0.16, nightmare: 0.28, hell: 0.42 },
      pool: [
        { id: 'eye-of-skadi', weight: 2 },
        { id: 'refresher-orb', weight: 1 }
      ],
      qualityOdds: { inscribed: 0.14, frozen: 0.09, genuine: 0.06 },
      pity: 4,
      source: 'dungeon'
    }
  ]
};

function roomLoot(): Record<RoomType, ItemDropTable> {
  return {
    entrance: COMMON_ROOM_DROP,
    combat: COMMON_ROOM_DROP,
    elite: ELITE_ROOM_DROP,
    treasure: ELITE_ROOM_DROP,
    shrine: COMMON_ROOM_DROP,
    rest: COMMON_ROOM_DROP,
    boss: GUARDIAN_DROP
  };
}

export const FROST_HOLLOW: DungeonDef = {
  id: 'frost-hollow',
  name: 'Frost Hollow',
  regionId: 'icewrack',
  biome: 'snow',
  templates: ['frost-entry', 'frost-crossing', 'frost-cache'],
  roomCount: { min: 6, max: 8 },
  spawnPool: [
    { creepId: 'ghost', weight: 4, cost: 10 },
    { creepId: 'ice-shaman', weight: 3, cost: 18, minDepth: 1 },
    { creepId: 'polar-furbolg', weight: 2, cost: 28, minDepth: 2 },
    { creepId: 'granite-golem', weight: 1, cost: 42, minDepth: 4, rarity: 'rare' }
  ],
  affixPool: ['jailer', 'frozen', 'vortex', 'fast', 'molten', 'waller', 'shielding', 'health-link'],
  affixes: dungeonAffixes(['jailer', 'frozen', 'vortex', 'fast', 'molten', 'waller', 'shielding', 'health-link']),
  modifiers: [
    {
      id: 'packed-halls',
      name: 'Packed Halls',
      description: '+25% spawn budget and +1 body in eligible packs.',
      budgetMult: 1.25,
      packSizeBonus: 1
    },
    {
      id: 'champion-sigil',
      name: 'Champion Sigil',
      description: 'More champion packs, +20% room loot odds.',
      championChanceBonus: 0.16,
      lootChanceMult: 1.2
    },
    {
      id: 'frozen-oath',
      name: 'Frozen Oath',
      description: 'Elite packs force Frozen when legal, +1 room reward roll.',
      forcedAffix: 'frozen',
      lootRollBonus: 1
    },
    {
      id: 'deep-map',
      name: 'Deep Map',
      description: '+2 rooms and richer rare-pack odds.',
      roomCountBonus: 2,
      rareChanceBonus: 0.08
    },
    {
      id: 'single-life',
      name: 'Single Life',
      description: 'High-stakes run marker: no mid-run persistence and wipe is recorded.',
      highStakes: true,
      budgetMult: 1.12,
      lootChanceMult: 1.15
    }
  ],
  guardian: 'boss-medusa',
  loot: roomLoot(),
  budget: { base: 42, perDepth: 14 },
  tiers: ['normal', 'nightmare', 'hell']
};

// ----------------------------------------------------------------
// Marquee descents (MARQUEE_AND_ARMORY_ADDENDUM §2.3 / C2). Each reuses the
// shipped generator + session: a themed spawn pool, a marquee boss guardian,
// and per-room loot anchored to the guardian's attribute lane. Unusual stays
// reserved to raids, so dungeon quality odds top out at genuine/frozen.
// ----------------------------------------------------------------

const MARQUEE_COMMON_DROP: ItemDropTable = {
  guaranteed: ['clarity'],
  slots: [
    {
      id: 'marquee-consumable',
      rarity: 'common',
      rolls: 1,
      chance: { normal: 0.45, nightmare: 0.55, hell: 0.65 },
      pool: [
        { id: 'healing-salve', weight: 2 },
        { id: 'clarity', weight: 2 },
        { id: 'tango', weight: 1 }
      ],
      source: 'dungeon'
    }
  ]
};

function marqueeEliteDrop(id: string, pool: string[]): ItemDropTable {
  return {
    guaranteed: ['clarity'],
    slots: [
      {
        id: `${id}-elite-component`,
        rarity: 'mythical',
        rolls: 1,
        chance: { normal: 0.3, nightmare: 0.45, hell: 0.6 },
        pool: pool.map((itemId) => ({ id: itemId, weight: 1 })),
        qualityOdds: { inscribed: 0.06, frozen: 0.05, genuine: 0.04 },
        source: 'dungeon'
      }
    ]
  };
}

function marqueeGuardianDrop(id: string, guaranteed: string, anchors: string[]): ItemDropTable {
  return {
    guaranteed: [guaranteed],
    slots: [
      {
        id: `${id}-guardian-anchor`,
        rarity: 'legendary',
        rolls: 1,
        chance: { normal: 0.16, nightmare: 0.28, hell: 0.42 },
        pool: anchors.map((itemId) => ({ id: itemId, weight: 1 })),
        qualityOdds: { inscribed: 0.14, frozen: 0.09, genuine: 0.06 },
        pity: 4,
        source: 'dungeon'
      }
    ]
  };
}

function marqueeRoomLoot(opts: { id: string; elitePool: string[]; guardianGuaranteed: string; guardianAnchors: string[] }): Record<RoomType, ItemDropTable> {
  const elite = marqueeEliteDrop(opts.id, opts.elitePool);
  const guardian = marqueeGuardianDrop(opts.id, opts.guardianGuaranteed, opts.guardianAnchors);
  return {
    entrance: MARQUEE_COMMON_DROP,
    combat: MARQUEE_COMMON_DROP,
    elite,
    treasure: elite,
    shrine: MARQUEE_COMMON_DROP,
    rest: MARQUEE_COMMON_DROP,
    boss: guardian
  };
}

const MARQUEE_MODIFIERS: DungeonDef['modifiers'] = [
  { id: 'packed-halls', name: 'Packed Halls', description: '+25% spawn budget and +1 body in eligible packs.', budgetMult: 1.25, packSizeBonus: 1 },
  { id: 'champion-sigil', name: 'Champion Sigil', description: 'More champion packs, +20% room loot odds.', championChanceBonus: 0.16, lootChanceMult: 1.2 },
  { id: 'deep-map', name: 'Deep Map', description: '+2 rooms and richer rare-pack odds.', roomCountBonus: 2, rareChanceBonus: 0.08 },
  { id: 'single-life', name: 'Single Life', description: 'High-stakes run marker: no mid-run persistence and wipe is recorded.', highStakes: true, budgetMult: 1.12, lootChanceMult: 1.15 }
];

// The Void Prelate's descent (agility lane), guarded by the marquee Templar.
export const SEVERED_DARK: DungeonDef = {
  id: 'severed-dark',
  name: 'The Severed Dark',
  regionId: 'quoidge',
  biome: 'grass',
  templates: ['void-gate', 'void-crossing', 'void-vault'],
  roomCount: { min: 6, max: 8 },
  spawnPool: [
    { creepId: 'satyr-mindstealer', weight: 4, cost: 12 },
    { creepId: 'harpy-stormcrafter', weight: 3, cost: 18, minDepth: 1 },
    { creepId: 'enraged-wildkin', weight: 2, cost: 30, minDepth: 2 },
    { creepId: 'rock-golem', weight: 1, cost: 46, minDepth: 4, rarity: 'rare' }
  ],
  affixPool: ['jailer', 'vortex', 'fast', 'waller', 'shielding', 'health-link', 'molten'],
  affixes: dungeonAffixes(['jailer', 'vortex', 'fast', 'waller', 'shielding', 'health-link', 'molten']),
  modifiers: MARQUEE_MODIFIERS,
  guardian: 'marquee-void-prelate',
  loot: marqueeRoomLoot({ id: 'severed-dark', elitePool: ['demon-edge', 'eaglesong', 'ultimate-orb', 'point-booster'], guardianGuaranteed: 'eaglesong', guardianAnchors: ['butterfly', 'eye-of-skadi', 'diffusal-blade'] }),
  budget: { base: 44, perDepth: 14 },
  tiers: ['normal', 'nightmare', 'hell']
};

// The Lord of Destruction's descent (strength lane), guarded by the Wraith King.
export const WORLDSTONE_VAULT: DungeonDef = {
  id: 'worldstone-vault',
  name: 'Worldstone Vault',
  regionId: 'vile-reaches',
  biome: 'wasteland',
  templates: ['vault-gate', 'vault-crossing', 'vault-sanctum'],
  roomCount: { min: 6, max: 8 },
  spawnPool: [
    { creepId: 'ogre-bruiser', weight: 4, cost: 12 },
    { creepId: 'ogre-frostmage', weight: 3, cost: 18, minDepth: 1 },
    { creepId: 'thunderhide', weight: 2, cost: 30, minDepth: 2 },
    { creepId: 'ancient-thunderhide', weight: 1, cost: 48, minDepth: 4, rarity: 'rare' }
  ],
  affixPool: ['jailer', 'molten', 'vortex', 'fast', 'waller', 'shielding', 'health-link'],
  affixes: dungeonAffixes(['jailer', 'molten', 'vortex', 'fast', 'waller', 'shielding', 'health-link']),
  modifiers: MARQUEE_MODIFIERS,
  guardian: 'boss-wraith-king',
  loot: marqueeRoomLoot({ id: 'worldstone-vault', elitePool: ['reaver', 'demon-edge', 'point-booster', 'ultimate-orb'], guardianGuaranteed: 'reaver', guardianAnchors: ['heart-of-tarrasque', 'assault-cuirass'] }),
  budget: { base: 46, perDepth: 15 },
  tiers: ['normal', 'nightmare', 'hell']
};

// The Last Eldwurm's descent (strength/int lane), guarded by the marquee dragon.
export const EMBER_CALDERA: DungeonDef = {
  id: 'ember-caldera',
  name: 'Ember Caldera',
  regionId: 'mad-moon-crater',
  biome: 'wasteland',
  templates: ['ember-gate', 'ember-crossing', 'ember-roost'],
  roomCount: { min: 7, max: 9 },
  spawnPool: [
    { creepId: 'prowler-shaman', weight: 3, cost: 16 },
    { creepId: 'black-dragon', weight: 3, cost: 24, minDepth: 1 },
    { creepId: 'elder-jungle-stalker', weight: 2, cost: 34, minDepth: 2 },
    { creepId: 'granite-golem', weight: 1, cost: 50, minDepth: 4, rarity: 'rare' }
  ],
  affixPool: ['molten', 'jailer', 'vortex', 'fast', 'waller', 'shielding', 'health-link'],
  affixes: dungeonAffixes(['molten', 'jailer', 'vortex', 'fast', 'waller', 'shielding', 'health-link']),
  modifiers: MARQUEE_MODIFIERS,
  guardian: 'marquee-last-eldwurm',
  loot: marqueeRoomLoot({ id: 'ember-caldera', elitePool: ['mystic-staff', 'reaver', 'sacred-relic', 'demon-edge'], guardianGuaranteed: 'reaver', guardianAnchors: ['heart-of-tarrasque', 'aghanims-scepter'] }),
  budget: { base: 48, perDepth: 16 },
  tiers: ['normal', 'nightmare', 'hell']
};

export const ALL_DUNGEONS: DungeonDef[] = [FROST_HOLLOW, SEVERED_DARK, WORLDSTONE_VAULT, EMBER_CALDERA];
