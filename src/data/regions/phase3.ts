import type { RegionDef } from '../../core/types';

const SHOP = [
  'tango', 'healing-salve', 'clarity', 'observer-ward', 'sentry-ward', 'dust-of-appearance', 'smoke-of-deceit',
  'boots-of-speed', 'blink-dagger', 'black-king-bar', 'force-staff', 'glimmer-cape', 'euls-scepter',
  'bracer', 'wraith-band', 'null-talisman', 'magic-wand', 'arcane-boots', 'drum-of-endurance'
];

function camps(prefix: string, list: [string, string, number, number, number][]): RegionDef['camps'] {
  return list.map(([id, creepId, count, x, y], i) => ({
    id: `${prefix}-${id}`,
    creepId,
    count,
    pos: { x, y },
    radius: 280 + (i % 3) * 30,
    respawnSec: creepId.includes('ancient') || creepId.includes('dragon') || creepId.includes('golem') ? 320 : 120 + i * 12
  }));
}

export const DEVARSHI_DESERT: RegionDef = {
  id: 'devarshi-desert',
  name: 'Devarshi Desert',
  biome: 'desert',
  size: 12000,
  seed: 56031,
  lore: 'A buried kingdom of scarabs, mirages, and star-metal where the Burrow Badge is struck under the sand. Its dunes keep the outline of a prior cycle, a kingdom the Loop already buried once.',
  arrivalBeat: 'arrival-devarshi-desert',
  town: { name: 'Duneclaim', pos: { x: 6000, y: 6400 }, radius: 820 },
  shrine: { pos: { x: 6000, y: 6100 } },
  shopInventory: [...SHOP, 'yasha', 'sange', 'diffusal-blade', 'blade-of-alacrity', 'ogre-axe'],
  secretShop: { pos: { x: 10100, y: 2600 }, inventory: ['demon-edge', 'eaglesong', 'sacred-relic'] },
  camps: camps('dd', [
    ['gnoll', 'gnoll-assassin', 4, 3300, 5100],
    ['mud', 'mud-golem', 3, 7900, 4900],
    ['centaur', 'centaur-courser', 3, 3800, 8300],
    ['prowler', 'prowler-shaman', 1, 9800, 8600],
    ['rock', 'rock-golem', 1, 2300, 9300]
  ]),
  heroSpawns: [
    { heroId: 'sand-king', pos: { x: 6600, y: 7800 } },
    { heroId: 'nyx-assassin', pos: { x: 3400, y: 7700 } },
    { heroId: 'phantom-assassin', pos: { x: 9300, y: 5900 } },
    { heroId: 'medusa', pos: { x: 9800, y: 8300 } },
    { heroId: 'viper', pos: { x: 2600, y: 4500 } },
    { heroId: 'venomancer', pos: { x: 5200, y: 9300 } }
  ],
  echoSpawns: [
    { id: 'dd-echo-pa', heroId: 'phantom-assassin', pos: { x: 9000, y: 6300 }, level: 18, respawnSec: 260 },
    { id: 'dd-echo-medusa', heroId: 'medusa', pos: { x: 10100, y: 8800 }, level: 20, respawnSec: 300 },
    { id: 'dd-echo-venomancer', heroId: 'venomancer', pos: { x: 5600, y: 9800 }, level: 19, respawnSec: 280 }
  ],
  gates: [
    { id: 'dd-to-icewrack', name: 'Cold Caravan Road', pos: { x: 900, y: 1800 }, radius: 520, toRegionId: 'icewrack', toPos: { x: 11000, y: 2600 } },
    { id: 'dd-to-shadeshore', name: 'Salt Road to Shadeshore', pos: { x: 11100, y: 6200 }, radius: 520, toRegionId: 'shadeshore', toPos: { x: 1000, y: 6200 }, requiredBadge: 'burrow-badge' }
  ],
  gyms: [{ gymId: 'burrow-gym', pos: { x: 5900, y: 3000 }, radius: 650 }],
  bosses: ['boss-phantom-assassin', 'boss-medusa', 'mini-sand-king', 'mini-nyx-assassin', 'mini-viper'],
  raids: ['queen-of-blades'],
  props: { treeDensity: 0.08, rockDensity: 0.9 },
  gateHint: 'The Salt Road opens with the Burrow Badge.'
};

export const SHADESHORE: RegionDef = {
  id: 'shadeshore',
  name: 'Shadeshore',
  biome: 'coast',
  size: 12000,
  seed: 61002,
  lore: 'A black-sand coast of captains, reef guards, and drowned echo bells. The feud between ship and reef returns in living bodies here, one old war wearing new names each cycle.',
  arrivalBeat: 'arrival-shadeshore',
  town: { name: 'Harborwake', pos: { x: 5600, y: 6500 }, radius: 820 },
  shrine: { pos: { x: 5600, y: 6200 } },
  shopInventory: [...SHOP, 'dragon-lance', 'mask-of-madness', 'vladmirs-offering', 'morbid-mask'],
  secretShop: { pos: { x: 9200, y: 2400 }, inventory: ['mystic-staff', 'reaver', 'ultimate-orb'] },
  camps: camps('ss', [
    ['wildwing', 'wildwing', 3, 3300, 4200],
    ['ripper', 'wildwing-ripper', 2, 7800, 4100],
    ['dark-troll', 'dark-troll', 3, 3900, 8600],
    ['summoner', 'dark-troll-summoner', 2, 8600, 8400],
    ['dragon', 'black-dragon', 1, 10100, 3000]
  ]),
  heroSpawns: [
    { heroId: 'kunkka', pos: { x: 6800, y: 7600 } },
    { heroId: 'tidehunter', pos: { x: 3300, y: 7900 } },
    { heroId: 'slardar', pos: { x: 9300, y: 6300 } },
    { heroId: 'naga-siren', pos: { x: 8500, y: 8800 } },
    { heroId: 'slark', pos: { x: 2400, y: 4800 } },
    { heroId: 'abaddon', pos: { x: 4500, y: 9200 } },
    { heroId: 'dragon-knight', pos: { x: 10200, y: 3600 } },
    { heroId: 'mars', pos: { x: 5600, y: 4200 } },
    { heroId: 'gyrocopter', pos: { x: 7400, y: 4700 } },
    { heroId: 'troll-warlord', pos: { x: 2100, y: 8800 } },
    { heroId: 'snapfire', pos: { x: 10300, y: 7200 } },
    { heroId: 'morphling', pos: { x: 3900, y: 5200 } }
  ],
  echoSpawns: [
    { id: 'ss-echo-kunkka', heroId: 'kunkka', pos: { x: 7200, y: 7900 }, level: 20, respawnSec: 300 },
    { id: 'ss-echo-tide', heroId: 'tidehunter', pos: { x: 3100, y: 8500 }, level: 20, respawnSec: 300 },
    { id: 'ss-echo-abaddon', heroId: 'abaddon', pos: { x: 4900, y: 9700 }, level: 21, respawnSec: 320 },
    { id: 'ss-echo-dk', heroId: 'dragon-knight', pos: { x: 10600, y: 4100 }, level: 21, respawnSec: 320 },
    { id: 'ss-echo-mars', heroId: 'mars', pos: { x: 6000, y: 4700 }, level: 21, respawnSec: 320 },
    { id: 'ss-echo-gyro', heroId: 'gyrocopter', pos: { x: 7800, y: 5200 }, level: 21, respawnSec: 320 },
    { id: 'ss-echo-troll', heroId: 'troll-warlord', pos: { x: 2500, y: 9300 }, level: 21, respawnSec: 320 },
    { id: 'ss-echo-snapfire', heroId: 'snapfire', pos: { x: 10700, y: 7700 }, level: 22, respawnSec: 340 },
    { id: 'ss-echo-morphling', heroId: 'morphling', pos: { x: 4300, y: 5700 }, level: 22, respawnSec: 340 }
  ],
  gates: [
    { id: 'ss-to-desert', name: 'Salt Road to Devarshi', pos: { x: 850, y: 6200 }, radius: 520, toRegionId: 'devarshi-desert', toPos: { x: 10800, y: 6200 } },
    { id: 'ss-to-vile', name: 'Rot Ferry to the Vile Reaches', pos: { x: 10800, y: 8800 }, radius: 520, toRegionId: 'vile-reaches', toPos: { x: 1300, y: 3000 }, requiredBadge: 'tide-badge' }
  ],
  gyms: [{ gymId: 'tide-gym', pos: { x: 6000, y: 3000 }, radius: 650 }],
  bosses: ['boss-kunkka', 'boss-tidehunter', 'boss-naga-siren', 'mini-slardar', 'mini-slark'],
  raids: ['renegade-marshal'],
  props: { treeDensity: 0.25, rockDensity: 0.45 },
  gateHint: 'The Rot Ferry opens with the Tide Badge.'
};

export const VILE_REACHES: RegionDef = {
  id: 'vile-reaches',
  name: 'The Vile Reaches',
  biome: 'wasteland',
  size: 12000,
  seed: 77111,
  lore: 'A badland of rot engines and bone fires where the fifth badge is earned in the stink. The seal thins here, and claimants from beyond the local war have started listening for the Ancient at the world\'s heart.',
  arrivalBeat: 'arrival-vile-reaches',
  town: { name: 'Miregate', pos: { x: 6000, y: 6200 }, radius: 820 },
  shrine: { pos: { x: 6000, y: 5900 } },
  shopInventory: [...SHOP, 'sange', 'battlefury', 'mekansm', 'vitality-booster'],
  secretShop: { pos: { x: 10300, y: 9300 }, inventory: ['reaver', 'sacred-relic', 'point-booster'] },
  camps: camps('vr', [
    ['ogre', 'ogre-bruiser', 3, 3100, 5200],
    ['frostmage', 'ogre-frostmage', 3, 8300, 4500],
    ['thunderhide', 'thunderhide', 2, 3800, 8700],
    ['prowler', 'prowler-acolyte', 1, 9100, 8800],
    ['ancient', 'ancient-thunderhide', 1, 10300, 2600]
  ]),
  heroSpawns: [
    { heroId: 'pudge', pos: { x: 6200, y: 7700 } },
    { heroId: 'lifestealer', pos: { x: 3400, y: 7800 } },
    { heroId: 'undying', pos: { x: 9000, y: 6000 } },
    { heroId: 'doom', pos: { x: 9700, y: 8600 } },
    { heroId: 'wraith-king', pos: { x: 2700, y: 4400 } },
    { heroId: 'night-stalker', pos: { x: 8200, y: 2700 } },
    { heroId: 'alchemist', pos: { x: 5200, y: 8800 } },
    { heroId: 'bristleback', pos: { x: 7600, y: 9300 } },
    { heroId: 'huskar', pos: { x: 4300, y: 3400 } },
    { heroId: 'primal-beast', pos: { x: 10400, y: 5400 } },
    { heroId: 'underlord', pos: { x: 5600, y: 3600 } },
    { heroId: 'bloodseeker', pos: { x: 1900, y: 7600 } },
    { heroId: 'death-prophet', pos: { x: 8800, y: 3600 } },
    { heroId: 'necrophos', pos: { x: 3100, y: 6100 } },
    { heroId: 'shadow-demon', pos: { x: 7600, y: 7100 } },
    { heroId: 'dazzle', pos: { x: 6600, y: 10400 } },
    { heroId: 'techies', pos: { x: 9300, y: 10300 } }
  ],
  echoSpawns: [
    { id: 'vr-echo-pudge', heroId: 'pudge', pos: { x: 6600, y: 8000 }, level: 22, respawnSec: 320 },
    { id: 'vr-echo-doom', heroId: 'doom', pos: { x: 10100, y: 9100 }, level: 23, respawnSec: 340 },
    { id: 'vr-echo-wk', heroId: 'wraith-king', pos: { x: 2500, y: 5000 }, level: 23, respawnSec: 340 },
    { id: 'vr-echo-alchemist', heroId: 'alchemist', pos: { x: 5600, y: 9300 }, level: 23, respawnSec: 340 },
    { id: 'vr-echo-bristleback', heroId: 'bristleback', pos: { x: 8000, y: 9800 }, level: 23, respawnSec: 340 },
    { id: 'vr-echo-huskar', heroId: 'huskar', pos: { x: 4700, y: 3900 }, level: 23, respawnSec: 340 },
    { id: 'vr-echo-primal', heroId: 'primal-beast', pos: { x: 10800, y: 5900 }, level: 24, respawnSec: 360 },
    { id: 'vr-echo-underlord', heroId: 'underlord', pos: { x: 6000, y: 4100 }, level: 24, respawnSec: 360 },
    { id: 'vr-echo-bloodseeker', heroId: 'bloodseeker', pos: { x: 2300, y: 8100 }, level: 23, respawnSec: 340 },
    { id: 'vr-echo-dp', heroId: 'death-prophet', pos: { x: 9200, y: 4100 }, level: 24, respawnSec: 360 },
    { id: 'vr-echo-necrophos', heroId: 'necrophos', pos: { x: 3500, y: 6600 }, level: 24, respawnSec: 360 },
    { id: 'vr-echo-shadow-demon', heroId: 'shadow-demon', pos: { x: 8000, y: 7600 }, level: 24, respawnSec: 360 },
    { id: 'vr-echo-dazzle', heroId: 'dazzle', pos: { x: 7000, y: 10800 }, level: 24, respawnSec: 360 },
    { id: 'vr-echo-techies', heroId: 'techies', pos: { x: 9700, y: 10800 }, level: 24, respawnSec: 360 }
  ],
  gates: [
    { id: 'vr-to-shadeshore', name: 'Rot Ferry to Shadeshore', pos: { x: 900, y: 3000 }, radius: 520, toRegionId: 'shadeshore', toPos: { x: 10500, y: 8600 } },
    { id: 'vr-to-quoidge', name: 'Scholar Road to Quoidge', pos: { x: 10800, y: 3000 }, radius: 520, toRegionId: 'quoidge', toPos: { x: 1200, y: 8800 }, requiredBadge: 'rot-badge' }
  ],
  gyms: [{ gymId: 'rot-gym', pos: { x: 6100, y: 3000 }, radius: 650 }],
  dungeons: [{ id: 'vr-worldstone-portal', dungeonId: 'worldstone-vault', name: 'Worldstone Vault', pos: { x: 5000, y: 10300 }, radius: 520 }],
  bosses: ['boss-pudge', 'boss-lifestealer', 'boss-doom', 'boss-wraith-king', 'mini-undying', 'mini-night-stalker'],
  raids: ['lord-of-terror', 'prime-evil'],
  props: { treeDensity: 0.12, rockDensity: 0.85 },
  gateHint: 'The Scholar Road opens with the Rot Badge.'
};

export const QUOIDGE: RegionDef = {
  id: 'quoidge',
  name: 'Quoidge, Scholar City',
  biome: 'grass',
  size: 12000,
  seed: 82004,
  lore: 'A city of disputing towers where spell theory is tested in alleys and arenas. Its scholars name what the shards imply: Ancient falls, time resets, and Avaryn already chose to rule the cycle.',
  arrivalBeat: 'arrival-quoidge',
  town: { name: 'Quoidge Forum', pos: { x: 6000, y: 6400 }, radius: 860 },
  shrine: { pos: { x: 6000, y: 6100 } },
  shopInventory: [...SHOP, 'kaya', 'arcane-boots', 'mystic-staff'],
  secretShop: { pos: { x: 10000, y: 2600 }, inventory: ['mystic-staff', 'ultimate-orb', 'point-booster'] },
  camps: camps('qc', [
    ['satyr', 'satyr-mindstealer', 3, 3300, 4800],
    ['harpy', 'harpy-stormcrafter', 3, 7800, 4600],
    ['wildkin', 'enraged-wildkin', 2, 3800, 8600],
    ['golem', 'rock-golem', 1, 9300, 8200],
    ['dragon', 'black-dragon', 1, 10200, 3000]
  ]),
  heroSpawns: [
    { heroId: 'invoker', pos: { x: 6300, y: 7800 } },
    { heroId: 'silencer', pos: { x: 3300, y: 7600 } },
    { heroId: 'outworld-destroyer', pos: { x: 9000, y: 6100 } },
    { heroId: 'skywrath-mage', pos: { x: 9800, y: 8600 } },
    { heroId: 'zeus', pos: { x: 2600, y: 4500 } },
    { heroId: 'tinker', pos: { x: 8200, y: 3000 } },
    { heroId: 'anti-mage', pos: { x: 4700, y: 9600 } },
    { heroId: 'templar-assassin', pos: { x: 10800, y: 5200 } },
    { heroId: 'grimstroke', pos: { x: 4100, y: 9000 } },
    { heroId: 'keeper-of-the-light', pos: { x: 7400, y: 9800 } },
    { heroId: 'leshrac', pos: { x: 10400, y: 7200 } },
    { heroId: 'pugna', pos: { x: 5200, y: 3200 } },
    { heroId: 'queen-of-pain', pos: { x: 2500, y: 6200 } },
    { heroId: 'clockwerk', pos: { x: 9300, y: 4200 } },
    { heroId: 'rubick', pos: { x: 6400, y: 4300 } }
  ],
  echoSpawns: [
    { id: 'qc-echo-invoker', heroId: 'invoker', pos: { x: 6900, y: 8200 }, level: 24, respawnSec: 360 },
    { id: 'qc-echo-zeus', heroId: 'zeus', pos: { x: 2800, y: 5100 }, level: 24, respawnSec: 360 },
    { id: 'qc-echo-antimage', heroId: 'anti-mage', pos: { x: 5100, y: 10100 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-ta', heroId: 'templar-assassin', pos: { x: 11000, y: 5700 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-grimstroke', heroId: 'grimstroke', pos: { x: 4500, y: 9500 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-kotl', heroId: 'keeper-of-the-light', pos: { x: 7800, y: 10300 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-leshrac', heroId: 'leshrac', pos: { x: 10800, y: 7700 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-pugna', heroId: 'pugna', pos: { x: 5600, y: 3700 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-qop', heroId: 'queen-of-pain', pos: { x: 2900, y: 6700 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-clockwerk', heroId: 'clockwerk', pos: { x: 9700, y: 4700 }, level: 25, respawnSec: 380 },
    { id: 'qc-echo-rubick', heroId: 'rubick', pos: { x: 6800, y: 4800 }, level: 25, respawnSec: 380 }
  ],
  gates: [
    { id: 'qc-to-vile', name: 'Scholar Road to Vile Reaches', pos: { x: 850, y: 8800 }, radius: 520, toRegionId: 'vile-reaches', toPos: { x: 10500, y: 3000 } },
    { id: 'qc-to-hidden', name: 'Green Library Gate', pos: { x: 10900, y: 6200 }, radius: 520, toRegionId: 'hidden-wood', toPos: { x: 1000, y: 6200 }, requiredBadge: 'arcane-badge' }
  ],
  gyms: [{ gymId: 'arcane-gym', pos: { x: 6000, y: 3000 }, radius: 650 }],
  dungeons: [{ id: 'qc-severed-dark-portal', dungeonId: 'severed-dark', name: 'The Severed Dark', pos: { x: 5200, y: 9600 }, radius: 520 }],
  bosses: ['boss-invoker', 'boss-zeus', 'mini-silencer', 'mini-outworld-destroyer', 'mini-skywrath-mage', 'mini-tinker'],
  raids: ['void-prelate'],
  props: { treeDensity: 0.35, rockDensity: 0.35 },
  gateHint: 'The Green Library Gate opens with the Arcane Badge.'
};

export const HIDDEN_WOOD: RegionDef = {
  id: 'hidden-wood',
  name: 'The Hidden Wood',
  biome: 'forest',
  size: 12000,
  seed: 91337,
  lore: 'A deep jungle where every neutral camp has an opinion and every summoner tries to recruit it. The wild remembers a world before heroes had banners, when the Ancients\' war had not yet named every living thing.',
  arrivalBeat: 'arrival-hidden-wood',
  town: { name: 'Canopy Court', pos: { x: 5600, y: 6500 }, radius: 840 },
  shrine: { pos: { x: 5600, y: 6200 } },
  shopInventory: [...SHOP, 'vladmirs-offering', 'mekansm', 'helm-of-the-dominator'],
  secretShop: { pos: { x: 9800, y: 9000 }, inventory: ['eaglesong', 'reaver', 'demon-edge'] },
  camps: camps('hw', [
    ['wolf', 'giant-wolf', 3, 3300, 4500],
    ['satyr', 'satyr-banisher', 3, 8000, 4300],
    ['summoner', 'dark-troll-summoner', 2, 3900, 8800],
    ['stalker', 'elder-jungle-stalker', 1, 8900, 8500],
    ['thunderhide', 'ancient-thunderhide', 1, 10300, 3100]
  ]),
  heroSpawns: [
    { heroId: 'enchantress', pos: { x: 6400, y: 7900 } },
    { heroId: 'chen', pos: { x: 3400, y: 7900 } },
    { heroId: 'natures-prophet', pos: { x: 9100, y: 6300 } },
    { heroId: 'beastmaster', pos: { x: 9700, y: 8800 } },
    { heroId: 'broodmother', pos: { x: 2500, y: 4700 } },
    { heroId: 'warlock', pos: { x: 7800, y: 2800 } },
    { heroId: 'visage', pos: { x: 4500, y: 3000 } },
    { heroId: 'hoodwink', pos: { x: 10400, y: 5200 } },
    { heroId: 'puck', pos: { x: 6500, y: 10400 } },
    { heroId: 'batrider', pos: { x: 3000, y: 10300 } },
    { heroId: 'dark-willow', pos: { x: 10800, y: 7600 } },
    { heroId: 'lone-druid', pos: { x: 6100, y: 4300 } },
    { heroId: 'lycan', pos: { x: 9000, y: 10400 } },
    { heroId: 'timbersaw', pos: { x: 1700, y: 7200 } },
    { heroId: 'monkey-king', pos: { x: 7200, y: 5400 } },
    { heroId: 'phantom-lancer', pos: { x: 3600, y: 6100 } }
  ],
  echoSpawns: [
    { id: 'hw-echo-prophet', heroId: 'natures-prophet', pos: { x: 9500, y: 6700 }, level: 25, respawnSec: 380 },
    { id: 'hw-echo-brood', heroId: 'broodmother', pos: { x: 2300, y: 5200 }, level: 25, respawnSec: 380 },
    { id: 'hw-echo-hoodwink', heroId: 'hoodwink', pos: { x: 10800, y: 5700 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-puck', heroId: 'puck', pos: { x: 6900, y: 10900 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-batrider', heroId: 'batrider', pos: { x: 3400, y: 10800 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-dark-willow', heroId: 'dark-willow', pos: { x: 11000, y: 8100 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-lone-druid', heroId: 'lone-druid', pos: { x: 6500, y: 4800 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-lycan', heroId: 'lycan', pos: { x: 9400, y: 10800 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-timbersaw', heroId: 'timbersaw', pos: { x: 2100, y: 7700 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-monkey-king', heroId: 'monkey-king', pos: { x: 7600, y: 5900 }, level: 26, respawnSec: 400 },
    { id: 'hw-echo-phantom-lancer', heroId: 'phantom-lancer', pos: { x: 4000, y: 6600 }, level: 26, respawnSec: 400 }
  ],
  gates: [
    { id: 'hw-to-quoidge', name: 'Green Library Gate', pos: { x: 850, y: 6200 }, radius: 520, toRegionId: 'quoidge', toPos: { x: 10600, y: 6200 } },
    { id: 'hw-to-joerlak', name: 'Root Road to Mount Joerlak', pos: { x: 10800, y: 2800 }, radius: 520, toRegionId: 'mount-joerlak', toPos: { x: 1200, y: 9200 }, requiredBadge: 'wild-badge' }
  ],
  gyms: [{ gymId: 'wild-gym', pos: { x: 6000, y: 3000 }, radius: 650 }],
  bosses: ['boss-natures-prophet', 'boss-broodmother', 'mini-enchantress', 'mini-chen', 'mini-beastmaster', 'mini-warlock', 'mini-visage'],
  props: { treeDensity: 1.2, rockDensity: 0.25 },
  gateHint: 'The Root Road opens with the Wild Badge.'
};

export const MOUNT_JOERLAK: RegionDef = {
  id: 'mount-joerlak',
  name: 'Mount Joerlak',
  biome: 'snow',
  size: 12000,
  seed: 100404,
  lore: 'A highland of horns, cliff echoes, and Titan Badge trials. The Fundamentals still sound through the cliffs, asking whether every broken thing should be made whole again.',
  arrivalBeat: 'arrival-mount-joerlak',
  town: { name: 'Peakhold', pos: { x: 6000, y: 6400 }, radius: 830 },
  shrine: { pos: { x: 6000, y: 6100 } },
  shopInventory: [...SHOP, 'battlefury', 'platemail', 'reaver', 'eaglesong'],
  secretShop: { pos: { x: 10100, y: 2500 }, inventory: ['sacred-relic', 'eaglesong', 'reaver', 'mystic-staff'] },
  camps: camps('mj', [
    ['centaur', 'centaur-conqueror', 2, 3200, 4500],
    ['golem', 'granite-golem', 1, 7900, 4300],
    ['frostbitten', 'frostbitten-golem', 1, 3800, 8600],
    ['dragon', 'black-dragon', 1, 9100, 8400],
    ['thunderhide', 'ancient-thunderhide', 1, 10200, 3100]
  ]),
  heroSpawns: [
    { heroId: 'magnus', pos: { x: 6500, y: 7900 } },
    { heroId: 'elder-titan', pos: { x: 3500, y: 7900 } },
    { heroId: 'tiny', pos: { x: 9300, y: 6200 } },
    { heroId: 'treant-protector', pos: { x: 9700, y: 8800 } },
    { heroId: 'centaur-warrunner', pos: { x: 2500, y: 4700 } },
    { heroId: 'storm-spirit', pos: { x: 8000, y: 2800 } },
    { heroId: 'ember-spirit', pos: { x: 4500, y: 3000 } },
    { heroId: 'spirit-breaker', pos: { x: 10800, y: 7600 } },
    { heroId: 'razor', pos: { x: 6200, y: 10400 } },
    { heroId: 'disruptor', pos: { x: 2900, y: 10100 } },
    { heroId: 'dark-seer', pos: { x: 10400, y: 4200 } },
    { heroId: 'earth-spirit', pos: { x: 5200, y: 9000 } },
    { heroId: 'pangolier', pos: { x: 8200, y: 10400 } },
    { heroId: 'ursa', pos: { x: 1700, y: 7600 } },
    { heroId: 'arc-warden', pos: { x: 7200, y: 5400 } },
    { heroId: 'meepo', pos: { x: 3600, y: 6100 } },
    { heroId: 'brewmaster', pos: { x: 9400, y: 10100 } }
  ],
  echoSpawns: [
    { id: 'mj-echo-magnus', heroId: 'magnus', pos: { x: 7000, y: 8300 }, level: 27, respawnSec: 400 },
    { id: 'mj-echo-tiny', heroId: 'tiny', pos: { x: 9600, y: 6600 }, level: 27, respawnSec: 400 },
    { id: 'mj-echo-spirit-breaker', heroId: 'spirit-breaker', pos: { x: 11000, y: 8100 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-razor', heroId: 'razor', pos: { x: 6600, y: 10800 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-disruptor', heroId: 'disruptor', pos: { x: 3300, y: 10600 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-dark-seer', heroId: 'dark-seer', pos: { x: 10800, y: 4700 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-earth-spirit', heroId: 'earth-spirit', pos: { x: 5600, y: 9500 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-pangolier', heroId: 'pangolier', pos: { x: 8600, y: 10800 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-ursa', heroId: 'ursa', pos: { x: 2100, y: 8100 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-arc-warden', heroId: 'arc-warden', pos: { x: 7600, y: 5900 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-meepo', heroId: 'meepo', pos: { x: 4000, y: 6600 }, level: 28, respawnSec: 420 },
    { id: 'mj-echo-brewmaster', heroId: 'brewmaster', pos: { x: 9800, y: 10600 }, level: 28, respawnSec: 420 }
  ],
  gates: [
    { id: 'mj-to-hidden', name: 'Root Road to Hidden Wood', pos: { x: 850, y: 9200 }, radius: 520, toRegionId: 'hidden-wood', toPos: { x: 10500, y: 2800 } },
    { id: 'mj-to-crater', name: 'Mad Moon Stair', pos: { x: 10900, y: 6000 }, radius: 520, toRegionId: 'mad-moon-crater', toPos: { x: 1000, y: 6000 }, requiredBadge: 'titan-badge' }
  ],
  gyms: [{ gymId: 'titan-gym', pos: { x: 6000, y: 3000 }, radius: 650 }],
  bosses: ['boss-magnus', 'boss-elder-titan', 'boss-tiny', 'boss-storm-spirit', 'boss-ember-spirit', 'mini-treant-protector', 'mini-centaur-warrunner'],
  raids: ['lord-of-hatred'],
  props: { treeDensity: 0.2, rockDensity: 1.0 },
  gateHint: 'The Mad Moon Stair opens with the Titan Badge.'
};

export const MAD_MOON_CRATER: RegionDef = {
  id: 'mad-moon-crater',
  name: 'Mad Moon Crater',
  biome: 'wasteland',
  size: 14000,
  seed: 120026,
  lore: 'The endgame crater. Roshan waits below; the Tower of the Ancients waits above. Every shard road ends here, where the Loop can be ruled, remade, or broken open.',
  arrivalBeat: 'arrival-mad-moon-crater',
  town: { name: 'Tower Approach', pos: { x: 7000, y: 7300 }, radius: 900 },
  shrine: { pos: { x: 7000, y: 7000 } },
  shopInventory: [...SHOP, 'black-king-bar', 'bloodstone', 'point-booster'],
  secretShop: { pos: { x: 12200, y: 2700 }, inventory: ['demon-edge', 'sacred-relic', 'mystic-staff', 'ultimate-orb'] },
  camps: camps('mm', [
    ['ancient-golem', 'granite-golem', 1, 3600, 5200],
    ['dragon', 'black-dragon', 1, 9600, 5100],
    ['thunderhide', 'ancient-thunderhide', 1, 4300, 10100],
    ['prowler', 'prowler-shaman', 1, 10200, 9900],
    ['stalker', 'elder-jungle-stalker', 1, 12100, 3500]
  ]),
  heroSpawns: [
    { heroId: 'spectre', pos: { x: 7600, y: 9200 } },
    { heroId: 'faceless-void', pos: { x: 4200, y: 9700 } },
    { heroId: 'terrorblade', pos: { x: 10400, y: 7800 } },
    { heroId: 'phoenix', pos: { x: 11200, y: 4300 } },
    { heroId: 'io', pos: { x: 3400, y: 4200 } },
    { heroId: 'clinkz', pos: { x: 11800, y: 9900 } },
    { heroId: 'weaver', pos: { x: 5200, y: 11800 } },
    { heroId: 'enigma', pos: { x: 11200, y: 11600 } },
    { heroId: 'void-spirit', pos: { x: 4200, y: 10600 } },
    { heroId: 'chaos-knight', pos: { x: 8800, y: 11200 } }
  ],
  echoSpawns: [
    { id: 'mm-echo-spectre', heroId: 'spectre', pos: { x: 7900, y: 9700 }, level: 30, respawnSec: 480 },
    { id: 'mm-echo-void', heroId: 'faceless-void', pos: { x: 3900, y: 10200 }, level: 30, respawnSec: 480 },
    { id: 'mm-echo-terrorblade', heroId: 'terrorblade', pos: { x: 10800, y: 8300 }, level: 30, respawnSec: 480 },
    { id: 'mm-echo-clinkz', heroId: 'clinkz', pos: { x: 12200, y: 10400 }, level: 30, respawnSec: 480 },
    { id: 'mm-echo-weaver', heroId: 'weaver', pos: { x: 5600, y: 12200 }, level: 30, respawnSec: 480 },
    { id: 'mm-echo-enigma', heroId: 'enigma', pos: { x: 11600, y: 12100 }, level: 30, respawnSec: 480 },
    { id: 'mm-echo-void-spirit', heroId: 'void-spirit', pos: { x: 4600, y: 11000 }, level: 30, respawnSec: 480 },
    { id: 'mm-echo-chaos-knight', heroId: 'chaos-knight', pos: { x: 9200, y: 11700 }, level: 30, respawnSec: 480 }
  ],
  gates: [
    { id: 'mm-to-joerlak', name: 'Mad Moon Stair to Joerlak', pos: { x: 850, y: 6000 }, radius: 520, toRegionId: 'mount-joerlak', toPos: { x: 10600, y: 6000 } }
  ],
  gyms: [],
  dungeons: [{ id: 'mm-ember-caldera-portal', dungeonId: 'ember-caldera', name: 'Ember Caldera', pos: { x: 6400, y: 11600 }, radius: 520 }],
  bosses: ['boss-spectre', 'boss-faceless-void', 'boss-terrorblade'],
  raids: ['roshan-pit', 'last-eldwurm'],
  props: { treeDensity: 0.05, rockDensity: 1.1 },
  gateHint: 'The Tower hosts the Elite Five and Champion.'
};

export const PHASE3_REGIONS: RegionDef[] = [
  DEVARSHI_DESERT,
  SHADESHORE,
  VILE_REACHES,
  QUOIDGE,
  HIDDEN_WOOD,
  MOUNT_JOERLAK,
  MAD_MOON_CRATER
];
