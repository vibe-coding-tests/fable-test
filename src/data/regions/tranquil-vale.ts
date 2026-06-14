import type { RegionDef } from '../../core/types';

// Tranquil Vale — starter region, Radiant-coded (SPEC §4).
// World coordinates are Dota units; region is 12000 x 12000.
export const TRANQUIL_VALE: RegionDef = {
  id: 'tranquil-vale',
  name: 'Tranquil Vale',
  biome: 'grass',
  size: 12000,
  seed: 8123,
  lore: 'A green shelf of the old Radiant lands, where shepherds trade rumors about the shards that fell when the Mad Moon broke. The first shard you touch hums with Radiant Ore, patient enough to become a champion instead of a command.',
  arrivalBeat: 'arrival-tranquil-vale',
  town: { name: 'Dawnshade', pos: { x: 6000, y: 6400 }, radius: 850 },
  shrine: { pos: { x: 6000, y: 6150 } },
  shopInventory: [
    'tango', 'healing-salve', 'clarity', 'dust-of-appearance',
    'iron-branch', 'circlet', 'crown', 'gauntlets-of-strength', 'slippers-of-agility', 'mantle-of-intelligence',
    'belt-of-strength', 'band-of-elvenskin', 'robe-of-the-magi',
    'blades-of-attack', 'quarterstaff', 'ogre-axe', 'staff-of-wizardry', 'blade-of-alacrity',
    'boots-of-speed', 'gloves-of-haste', 'sages-mask', 'ring-of-regen', 'chainmail', 'cloak',
    'magic-stick', 'ring-of-protection', 'headdress', 'buckler', 'ring-of-basilius',
    'bracer', 'wraith-band', 'null-talisman', 'magic-wand',
    'power-treads', 'phase-boots', 'tranquil-boots', 'soul-ring'
  ],
  camps: [
    { id: 'tv-kobold-tutorial', creepId: 'kobold', count: 2, pos: { x: 7050, y: 7300 }, radius: 220, respawnSec: 45 },
    { id: 'tv-kobold-1', creepId: 'kobold', count: 4, pos: { x: 4400, y: 5200 }, radius: 260, respawnSec: 60 },
    { id: 'tv-kobold-2', creepId: 'kobold', count: 3, pos: { x: 7600, y: 5000 }, radius: 240, respawnSec: 60 },
    { id: 'tv-kobold-3', creepId: 'kobold', count: 4, pos: { x: 5200, y: 7900 }, radius: 260, respawnSec: 60 },
    { id: 'tv-foreman-1', creepId: 'kobold-foreman', count: 2, pos: { x: 3600, y: 4300 }, radius: 240, respawnSec: 90 },
    { id: 'tv-foreman-2', creepId: 'kobold-foreman', count: 2, pos: { x: 8200, y: 7400 }, radius: 240, respawnSec: 90 },
    { id: 'tv-troll-1', creepId: 'hill-troll', count: 3, pos: { x: 2900, y: 6400 }, radius: 280, respawnSec: 90 },
    { id: 'tv-troll-2', creepId: 'hill-troll', count: 3, pos: { x: 9000, y: 5800 }, radius: 280, respawnSec: 90 },
    { id: 'tv-vhoul-1', creepId: 'vhoul-assassin', count: 3, pos: { x: 4000, y: 8600 }, radius: 280, respawnSec: 100 },
    { id: 'tv-vhoul-2', creepId: 'vhoul-assassin', count: 2, pos: { x: 7400, y: 9000 }, radius: 260, respawnSec: 100 },
    { id: 'tv-hellbear-1', creepId: 'hellbear', count: 2, pos: { x: 2200, y: 8800 }, radius: 300, respawnSec: 150 },
    { id: 'tv-hellbear-2', creepId: 'hellbear', count: 1, pos: { x: 9600, y: 8200 }, radius: 260, respawnSec: 150 },
    { id: 'tv-golem-1', creepId: 'granite-golem', count: 1, pos: { x: 9800, y: 2600 }, radius: 300, respawnSec: 300 }
  ],
  heroSpawns: [
    { heroId: 'pudge', pos: { x: 6350, y: 7050 } },
    { heroId: 'earthshaker', pos: { x: 2400, y: 3000 } },
    { heroId: 'lich', pos: { x: 9200, y: 3400 } },
    { heroId: 'sven', pos: { x: 3200, y: 7050 } },
    { heroId: 'axe', pos: { x: 7300, y: 3200 } },
    { heroId: 'dawnbreaker', pos: { x: 10100, y: 5600 } },
    { heroId: 'witch-doctor', pos: { x: 5200, y: 9300 } },
    { heroId: 'omniknight', pos: { x: 4550, y: 3350 } },
    { heroId: 'windranger', pos: { x: 8250, y: 6900 } },
    { heroId: 'phantom-assassin', pos: { x: 2650, y: 8800 } },
    { heroId: 'marci', pos: { x: 9800, y: 8400 } }
  ],
  echoSpawns: [
    { id: 'tv-echo-juggernaut', heroId: 'juggernaut', pos: { x: 8750, y: 9100 }, level: 7, respawnSec: 300, minPlayerLevel: 6 },
    { id: 'tv-echo-pudge', heroId: 'pudge', pos: { x: 7650, y: 8450 }, level: 5, respawnSec: 240 },
    { id: 'tv-echo-sven', heroId: 'sven', pos: { x: 2500, y: 7400 }, level: 6, respawnSec: 240 },
    { id: 'tv-echo-axe', heroId: 'axe', pos: { x: 7900, y: 2700 }, level: 8, respawnSec: 260 },
    { id: 'tv-echo-dawnbreaker', heroId: 'dawnbreaker', pos: { x: 10300, y: 6100 }, level: 9, respawnSec: 300 },
    { id: 'tv-echo-marci', heroId: 'marci', pos: { x: 10100, y: 8900 }, level: 9, respawnSec: 300 }
  ],
  gates: [
    { id: 'tv-to-nw', name: 'North Pass to Nightsilver Woods', pos: { x: 6000, y: 850 }, radius: 520, toRegionId: 'nightsilver-woods', toPos: { x: 5600, y: 11050 }, requiresRecruits: 1 }
  ],
  gyms: [],
  elevation: { tiers: [0, 160] },
  climbPoints: [
    { id: 'tv-dawn-ridge-rope', pos: { x: 3300, y: 3400 }, fromTier: 0, toTier: 1 }
  ],
  glidePoints: [
    { id: 'tv-dawn-ridge-glide', pos: { x: 3600, y: 3050 }, fromTier: 1 }
  ],
  waterZones: [
    { id: 'tv-south-brook', poly: [{ x: 6900, y: 8500 }, { x: 8000, y: 8450 }, { x: 8100, y: 9100 }, { x: 7000, y: 9200 }] }
  ],
  waypoints: [
    { id: 'tv-waypoint-dawnshade', name: 'Dawnshade Waystone', pos: { x: 6200, y: 6500 } },
    { id: 'tv-waypoint-north-pass', name: 'North Pass Waystone', pos: { x: 5950, y: 1400 } },
    { id: 'tv-waypoint-dawn-ridge', name: 'Dawn Ridge Waystone', pos: { x: 3450, y: 3150 } }
  ],
  chests: [
    { id: 'tv-chest-open-meadow', pos: { x: 6650, y: 7050 }, tier: 'common', loot: { gold: 90, items: ['tango'] } },
    { id: 'tv-chest-kobold-cache', pos: { x: 4520, y: 5480 }, tier: 'rich', gate: { kind: 'camp', campId: 'tv-kobold-1' }, loot: { gold: 160, items: ['boots-of-speed'] } },
    { id: 'tv-chest-dawn-ridge', pos: { x: 3550, y: 3020 }, tier: 'precious', gate: { kind: 'puzzle', puzzleId: 'tv-brazier-chain' }, loot: { gold: 240, items: ['magic-wand'], shardCount: 1 } }
  ],
  shards: [
    { id: 'tv-shard-shepherd-stone', pos: { x: 6900, y: 6800 } },
    { id: 'tv-shard-old-well', pos: { x: 5720, y: 5900 } },
    { id: 'tv-shard-ridge-root', pos: { x: 3180, y: 3520 } },
    { id: 'tv-shard-north-spark', pos: { x: 6120, y: 1880 } }
  ],
  discoveries: [
    { id: 'tv-discovery-north-glint', pos: { x: 5900, y: 2100 }, radius: 360, hint: 'Something glints past the north ridge.', reveals: 'tv-waypoint-north-pass' },
    { id: 'tv-discovery-ridge-cache', pos: { x: 3300, y: 3500 }, radius: 320, hint: 'A rope climbs toward a sealed ridge cache.', reveals: 'tv-chest-dawn-ridge' }
  ],
  elementSources: [
    { id: 'tv-pyro-brazier-west', pos: { x: 3300, y: 3260 }, radius: 180, element: 'pyro', carriable: true },
    { id: 'tv-pyro-brazier-east', pos: { x: 3800, y: 3140 }, radius: 180, element: 'pyro', carriable: true },
    { id: 'tv-hydro-spring', pos: { x: 7480, y: 8820 }, radius: 260, element: 'hydro' }
  ],
  elementPuzzles: [
    {
      id: 'tv-brazier-chain',
      kind: 'brazier-chain',
      nodes: [{ x: 3300, y: 3260 }, { x: 3560, y: 3160 }, { x: 3800, y: 3140 }],
      requires: 'pyro',
      radius: 220,
      timeLimitSec: 12,
      reveals: 'tv-chest-dawn-ridge'
    }
  ],
  props: { treeDensity: 0.7, rockDensity: 0.3 },
  gateHint: 'The northern pass leads to Nightsilver Woods.'
};
