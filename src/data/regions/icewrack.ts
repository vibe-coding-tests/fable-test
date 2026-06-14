import type { RegionDef } from '../../core/types';

export const ICEWRACK: RegionDef = {
  id: 'icewrack',
  name: 'Icewrack',
  biome: 'snow',
  size: 12000,
  seed: 44190,
  lore: 'Blue-white cliffs and frozen rivers where every shard impact still rings like a cracked bell.',
  town: { name: 'Frostford', pos: { x: 6200, y: 6200 }, radius: 820 },
  shrine: { pos: { x: 6200, y: 5900 } },
  shopInventory: [
    'tango', 'healing-salve', 'clarity', 'dust-of-appearance',
    'iron-branch', 'circlet', 'crown', 'gauntlets-of-strength', 'mantle-of-intelligence',
    'belt-of-strength', 'robe-of-the-magi', 'ogre-axe', 'staff-of-wizardry',
    'boots-of-speed', 'sages-mask', 'ring-of-regen', 'void-stone', 'energy-booster',
    'vitality-booster', 'chainmail', 'cloak', 'platemail', 'magic-stick',
    'bracer', 'null-talisman', 'magic-wand', 'arcane-boots', 'sange', 'kaya',
    'blink-dagger', 'black-king-bar', 'euls-scepter', 'force-staff', 'glimmer-cape',
    'mekansm', 'drum-of-endurance', 'vladmirs-offering'
  ],
  camps: [
    { id: 'iw-ghost-1', creepId: 'ghost', count: 4, pos: { x: 3800, y: 6000 }, radius: 260, respawnSec: 80 },
    { id: 'iw-shaman-1', creepId: 'ice-shaman', count: 3, pos: { x: 7400, y: 7600 }, radius: 280, respawnSec: 120 },
    { id: 'iw-shaman-2', creepId: 'ice-shaman', count: 2, pos: { x: 9200, y: 4900 }, radius: 280, respawnSec: 120 },
    { id: 'iw-furbolg-1', creepId: 'polar-furbolg', count: 2, pos: { x: 3300, y: 8600 }, radius: 320, respawnSec: 160 },
    { id: 'iw-furbolg-2', creepId: 'polar-furbolg', count: 1, pos: { x: 9400, y: 8800 }, radius: 300, respawnSec: 160 },
    { id: 'iw-golem-1', creepId: 'granite-golem', count: 1, pos: { x: 10200, y: 2300 }, radius: 320, respawnSec: 320 }
  ],
  heroSpawns: [
    { heroId: 'crystal-maiden', pos: { x: 5900, y: 7100 } },
    { heroId: 'jakiro', pos: { x: 8200, y: 8200 } },
    { heroId: 'tusk', pos: { x: 3900, y: 8800 } },
    { heroId: 'ancient-apparition', pos: { x: 9900, y: 2700 } },
    { heroId: 'ogre-magi', pos: { x: 2200, y: 5000 } },
    { heroId: 'shadow-shaman', pos: { x: 7600, y: 3600 } }
  ],
  echoSpawns: [
    { id: 'iw-echo-cm', heroId: 'crystal-maiden', pos: { x: 6900, y: 7900 }, level: 15, respawnSec: 220 },
    { id: 'iw-echo-tusk', heroId: 'tusk', pos: { x: 3300, y: 9600 }, level: 15, respawnSec: 220 },
    { id: 'iw-echo-aa', heroId: 'ancient-apparition', pos: { x: 10100, y: 3400 }, level: 16, respawnSec: 240 },
    { id: 'iw-echo-ogre', heroId: 'ogre-magi', pos: { x: 2600, y: 5600 }, level: 16, respawnSec: 240 },
    { id: 'iw-echo-shadow-shaman', heroId: 'shadow-shaman', pos: { x: 8000, y: 4200 }, level: 17, respawnSec: 260 }
  ],
  gates: [
    { id: 'iw-to-nw', name: 'Thawing Road to Nightsilver', pos: { x: 900, y: 9800 }, radius: 520, toRegionId: 'nightsilver-woods', toPos: { x: 10150, y: 1800 } },
    { id: 'iw-to-desert', name: 'Cold Caravan Road to Devarshi', pos: { x: 11100, y: 2600 }, radius: 520, toRegionId: 'devarshi-desert', toPos: { x: 1100, y: 1800 }, requiredBadge: 'frost-badge' }
  ],
  gyms: [{ gymId: 'frost-gym', pos: { x: 6500, y: 3200 }, radius: 650 }],
  dungeons: [{ id: 'iw-frost-hollow-portal', dungeonId: 'frost-hollow', name: 'Frost Hollow Portal', pos: { x: 5000, y: 9100 }, radius: 520 }],
  raids: ['forsaken-queen'],
  props: { treeDensity: 0.25, rockDensity: 0.75 },
  gateHint: 'The Frost Gym stands north of Frostford.'
};
