import type { RegionDef } from '../../core/types';

// Tranquil Vale — starter region, Radiant-coded (SPEC §4).
// World coordinates are Dota units; region is 12000 x 12000.
export const TRANQUIL_VALE: RegionDef = {
  id: 'tranquil-vale',
  name: 'Tranquil Vale',
  biome: 'grass',
  size: 12000,
  seed: 8123,
  lore: 'A green shelf of the old Radiant lands, where shepherds trade rumors about the shards that fell when the Mad Moon broke.',
  town: { name: 'Dawnshade', pos: { x: 6000, y: 6400 }, radius: 850 },
  shrine: { pos: { x: 6000, y: 6150 } },
  shopInventory: [
    'tango', 'healing-salve', 'clarity', 'dust-of-appearance',
    'iron-branch', 'circlet', 'crown', 'gauntlets-of-strength', 'slippers-of-agility', 'mantle-of-intelligence',
    'belt-of-strength', 'band-of-elvenskin', 'robe-of-the-magi',
    'blades-of-attack', 'broadsword', 'claymore', 'mithril-hammer', 'quarterstaff',
    'ogre-axe', 'staff-of-wizardry', 'blade-of-alacrity',
    'boots-of-speed', 'gloves-of-haste', 'sages-mask', 'ring-of-regen', 'void-stone',
    'energy-booster', 'vitality-booster', 'chainmail', 'cloak', 'shadow-amulet', 'morbid-mask',
    'hyperstone', 'platemail', 'ultimate-orb', 'magic-stick',
    'bracer', 'wraith-band', 'null-talisman', 'magic-wand', 'arcane-boots',
    'yasha', 'sange', 'kaya', 'dragon-lance', 'mask-of-madness',
    'blink-dagger', 'black-king-bar', 'euls-scepter', 'force-staff', 'glimmer-cape',
    'mekansm', 'battlefury', 'crystalys', 'diffusal-blade', 'maelstrom',
    'drum-of-endurance', 'vladmirs-offering'
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
    { heroId: 'witch-doctor', pos: { x: 5200, y: 9300 } },
    { heroId: 'omniknight', pos: { x: 4550, y: 3350 } },
    { heroId: 'windranger', pos: { x: 8250, y: 6900 } },
    { heroId: 'phantom-assassin', pos: { x: 2650, y: 8800 } }
  ],
  echoSpawns: [
    { id: 'tv-echo-juggernaut', heroId: 'juggernaut', pos: { x: 8750, y: 9100 }, level: 10, respawnSec: 160 },
    { id: 'tv-echo-pudge', heroId: 'pudge', pos: { x: 7000, y: 7850 }, level: 10, respawnSec: 160 },
    { id: 'tv-echo-sven', heroId: 'sven', pos: { x: 2500, y: 7400 }, level: 10, respawnSec: 160 },
    { id: 'tv-echo-axe', heroId: 'axe', pos: { x: 7900, y: 2700 }, level: 11, respawnSec: 160 }
  ],
  gates: [
    { id: 'tv-to-nw', name: 'North Pass to Nightsilver Woods', pos: { x: 6000, y: 850 }, radius: 520, toRegionId: 'nightsilver-woods', toPos: { x: 5600, y: 11050 }, requiresRecruits: 1 }
  ],
  gyms: [],
  props: { treeDensity: 0.7, rockDensity: 0.3 },
  gateHint: 'The northern pass leads to Nightsilver Woods.'
};
