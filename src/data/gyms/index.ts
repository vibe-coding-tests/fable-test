import type { GymDef } from '../../core/types';

// Gym leaders are original homages to Dota 2 esports archetypes (§3.13): a
// flashy highlight carry, a draft-savant captain, a roaming 4, a teamfight
// initiator, an attrition grinder, a combo virtuoso, a micro maestro, a
// highland hard-engage. Names stay original; titles + lines wink at the scene.

export const LUNAR_GYM: GymDef = {
  id: 'lunar-gym',
  name: 'Lunar Gym',
  badgeId: 'lunar-badge',
  regionId: 'nightsilver-woods',
  leader: 'Moonwarden Seryn',
  leaderTitle: 'The Midnight Highlight',
  theme: 'Burst damage, night vision, and clustered nukes.',
  bestOf: 3,
  enemyBonusCaptainCalls: 1,
  dialogue: [
    "The crowd came to watch the moon fall. Try not to disappoint them.",
    'Burst them down before the night even blinks.'
  ],
  // §5.2 — "burst them down": no turtling, race the nukes.
  format: { rules: [{ kind: 'cap-role', role: 'durable', max: 1 }] },
  enemyTeam: [
    { heroId: 'luna', level: 14, items: ['yasha', 'dragon-lance'] },
    { heroId: 'mirana', level: 14, items: ['euls-scepter'] },
    { heroId: 'lina', level: 14, items: ['kaya'] },
    { heroId: 'zeus', level: 14, items: ['arcane-boots'] },
    { heroId: 'lich', level: 14, items: ['glimmer-cape'] }
  ]
};

export const FROST_GYM: GymDef = {
  id: 'frost-gym',
  name: 'Frost Gym',
  badgeId: 'frost-badge',
  regionId: 'icewrack',
  leader: 'Warden Blueheart',
  leaderTitle: 'The Drafting Mind',
  theme: 'Slows, roots, silences, and channel disruption.',
  bestOf: 3,
  enemyBonusCaptainCalls: 2,
  dialogue: [
    "I won this fight in the pick phase. You just haven't noticed yet.",
    'Patience freezes faster than any nova.'
  ],
  // §5.2 — "won it in the pick phase": she answers your four.
  format: { rules: [], counterDraft: 'last-pick' },
  enemyTeam: [
    { heroId: 'crystal-maiden', level: 17, items: ['glimmer-cape', 'euls-scepter'] },
    { heroId: 'jakiro', level: 17, items: ['arcane-boots'] },
    { heroId: 'ancient-apparition', level: 17, items: ['kaya'] },
    { heroId: 'tusk', level: 17, items: ['blink-dagger'] },
    { heroId: 'earthshaker', level: 17, items: ['force-staff'] }
  ]
};

export const BURROW_GYM: GymDef = {
  id: 'burrow-gym',
  name: 'Burrow Gym',
  badgeId: 'burrow-badge',
  regionId: 'devarshi-desert',
  leader: 'Captain Dunespark',
  leaderTitle: 'The Sand-Step Roamer',
  theme: 'Blink initiations, sand disables, and carry punish windows.',
  bestOf: 3,
  enemyBonusCaptainCalls: 2,
  dialogue: [
    'Position four wins the lanes you never even see.',
    'Blink in, bury you, gone before the replay loads.'
  ],
  // §5.2 — "position four wins": value the map game.
  format: { rules: [{ kind: 'require-role', role: 'support', min: 2 }] },
  enemyTeam: [
    { heroId: 'sand-king', level: 20, items: ['blink-dagger', 'arcane-boots'] },
    { heroId: 'nyx-assassin', level: 20, items: ['euls-scepter'] },
    { heroId: 'phantom-assassin', level: 20, items: ['crystalys', 'black-king-bar'] },
    { heroId: 'medusa', level: 20, items: ['dragon-lance', 'ultimate-orb'] },
    { heroId: 'viper', level: 20, items: ['yasha'] }
  ]
};

export const TIDE_GYM: GymDef = {
  id: 'tide-gym',
  name: 'Tide Gym',
  badgeId: 'tide-badge',
  regionId: 'shadeshore',
  leader: 'Admiral Breakwater',
  leaderTitle: 'The Teamfight Tide',
  theme: 'Boat timings, huge stuns, and river-fight durability.',
  bestOf: 3,
  enemyBonusCaptainCalls: 2,
  dialogue: [
    'One clean initiation and the whole series is mine.',
    'Hold the river; the gold always follows the map.'
  ],
  // §5.2 — "one clean initiation": no slippery cores, stand and fight.
  format: { rules: [{ kind: 'ban-role', roles: ['escape'] }] },
  enemyTeam: [
    { heroId: 'kunkka', level: 22, items: ['black-king-bar', 'battlefury'] },
    { heroId: 'tidehunter', level: 22, items: ['blink-dagger', 'vladmirs-offering'] },
    { heroId: 'slardar', level: 22, items: ['blink-dagger'] },
    { heroId: 'naga-siren', level: 22, items: ['diffusal-blade'] },
    { heroId: 'slark', level: 22, items: ['yasha', 'mask-of-madness'] }
  ]
};

export const ROT_GYM: GymDef = {
  id: 'rot-gym',
  name: 'Rot Gym',
  badgeId: 'rot-badge',
  regionId: 'vile-reaches',
  leader: 'Mirecaller Voss',
  leaderTitle: 'The Attrition Captain',
  theme: 'Attrition, silences, reincarnation checks, and night pressure.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  dialogue: [
    "I don't need to win fast. I only need to win last.",
    'Every respawn you buy is gold I get to farm.'
  ],
  // §5.2 — "I win last": no luxury sustain, grind it out (tier ≤ t2).
  format: { rules: [{ kind: 'item-tier-cap', max: 2 }] },
  enemyTeam: [
    { heroId: 'pudge', level: 24, items: ['blink-dagger', 'vladmirs-offering'] },
    { heroId: 'lifestealer', level: 24, items: ['sange'] },
    { heroId: 'undying', level: 24, items: ['mekansm'] },
    { heroId: 'doom', level: 24, items: ['black-king-bar'] },
    { heroId: 'wraith-king', level: 24, items: ['crystalys'] }
  ]
};

export const ARCANE_GYM: GymDef = {
  id: 'arcane-gym',
  name: 'Arcane Gym',
  badgeId: 'arcane-badge',
  regionId: 'quoidge',
  leader: 'Archivist Callstep',
  leaderTitle: 'The Combo Virtuoso',
  theme: 'Long-range spell chains and cooldown resets.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  dialogue: [
    'Ten spells, one window, zero mistakes.',
    "Reset, recast, repeat — that's the whole show."
  ],
  // §5.2 — "ten spells, one window": bring casters, trade spells.
  format: { rules: [{ kind: 'cap-attribute', attribute: 'str', max: 1 }] },
  enemyTeam: [
    { heroId: 'invoker', level: 26, items: ['kaya', 'euls-scepter'] },
    { heroId: 'silencer', level: 26, items: ['force-staff'] },
    { heroId: 'outworld-destroyer', level: 26, items: ['ultimate-orb'] },
    { heroId: 'skywrath-mage', level: 26, items: ['arcane-boots'] },
    { heroId: 'tinker', level: 26, items: ['blink-dagger'] }
  ]
};

export const WILD_GYM: GymDef = {
  id: 'wild-gym',
  name: 'Wild Gym',
  badgeId: 'wild-badge',
  regionId: 'hidden-wood',
  leader: 'Keeper Greenroom',
  leaderTitle: 'The Micro Maestro',
  theme: 'Summons, neutral conversion, and aura stacking.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  dialogue: [
    'Count my units. Now count yours.',
    "Auras stack; egos don't."
  ],
  // §5.2 — "count my units": summoners cheap, hard carries expensive.
  format: { rules: [{ kind: 'point-budget', total: 8, costByRole: { carry: 3 } }] },
  enemyTeam: [
    { heroId: 'enchantress', level: 27, items: ['dragon-lance'] },
    { heroId: 'chen', level: 27, items: ['mekansm'] },
    { heroId: 'natures-prophet', level: 27, items: ['maelstrom'] },
    { heroId: 'beastmaster', level: 27, items: ['vladmirs-offering'] },
    { heroId: 'broodmother', level: 27, items: ['diffusal-blade'] }
  ]
};

export const TITAN_GYM: GymDef = {
  id: 'titan-gym',
  name: 'Titan Gym',
  badgeId: 'titan-badge',
  regionId: 'mount-joerlak',
  leader: 'Summit Marshal',
  leaderTitle: 'The Highland Engage',
  theme: 'Huge initiations and highland carry checks.',
  bestOf: 3,
  enemyBonusCaptainCalls: 3,
  dialogue: [
    'From the high ground, every fight is downhill.',
    'I commit first and apologize never.'
  ],
  // §5.2 — "I commit first": bring an initiator, don't stack carries.
  format: {
    rules: [
      { kind: 'require-role', role: 'initiator', min: 1 },
      { kind: 'cap-role', role: 'carry', max: 2 }
    ]
  },
  enemyTeam: [
    { heroId: 'magnus', level: 29, items: ['blink-dagger', 'black-king-bar'] },
    { heroId: 'elder-titan', level: 29, items: ['force-staff'] },
    { heroId: 'tiny', level: 29, items: ['battlefury'] },
    { heroId: 'centaur-warrunner', level: 29, items: ['vladmirs-offering'] },
    { heroId: 'storm-spirit', level: 29, items: ['kaya'] }
  ]
};

export const ALL_GYMS: GymDef[] = [LUNAR_GYM, FROST_GYM, BURROW_GYM, TIDE_GYM, ROT_GYM, ARCANE_GYM, WILD_GYM, TITAN_GYM];
