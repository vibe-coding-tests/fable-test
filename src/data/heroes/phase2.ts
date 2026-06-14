import type { AbilityDef, HeroBaseStats, HeroDef, StatModMap } from '../../core/types';
import { gestureForAbility, soundForAbility } from '../../core/gestures';

type HeroSeed = {
  id: string;
  name: string;
  title: string;
  attribute: HeroDef['attribute'];
  roles: string[];
  region: string;
  lore: string;
  baseStats: HeroBaseStats;
  abilities: AbilityDef[];
  palette: [string, string, string];
  weapon: NonNullable<HeroDef['silhouette']['weapon']>;
  head?: HeroDef['silhouette']['head'];
  bodyShape?: HeroDef['silhouette']['bodyShape'];
  extras?: NonNullable<HeroDef['silhouette']['extras']>;
  recruitmentQuestId?: string;
};

function talents(id: string, abilityA: string, valueA: string, abilityB: string, valueB: string): HeroDef['talents'] {
  return [
    {
      level: 10,
      options: [
        { id: `${id}-t10a`, name: '+6 Primary Stats', mods: { str: 2, agi: 2, int: 2 } as StatModMap },
        { id: `${id}-t10b`, name: '+80 Health', mods: { maxHp: 80 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: `${id}-t15a`, name: '+25 Attack Speed', mods: { attackSpeed: 25 } },
        { id: `${id}-t15b`, name: '+10% Spell Amplification', mods: { spellAmpPct: 10 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: `${id}-t20a`, name: '+Ability Damage', abilityOverride: { abilityId: abilityA, valueKey: valueA, mode: 'add', amount: 50 } },
        { id: `${id}-t20b`, name: '+25 Movement Speed', mods: { moveSpeed: 25 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: `${id}-t25a`, name: '+Ultimate Power', abilityOverride: { abilityId: abilityB, valueKey: valueB, mode: 'add', amount: 80 } },
        { id: `${id}-t25b`, name: '+12 All Stats', mods: { str: 12, agi: 12, int: 12 } }
      ]
    }
  ];
}

function hero(seed: HeroSeed, talentA: [string, string], talentB: [string, string]): HeroDef {
  const ranged = seed.baseStats.attackRange > 350;
  return {
    id: seed.id,
    name: seed.name,
    title: seed.title,
    attribute: seed.attribute,
    roles: seed.roles,
    region: seed.region,
    lore: seed.lore,
    baseStats: seed.baseStats,
    skillOrder: [0, 1, 2],
    // Default the closed-vocabulary anim/sound from each ability's own data (§3.11).
    abilities: seed.abilities.map((a) => ({ ...a, anim: a.anim ?? gestureForAbility(a), sound: a.sound ?? soundForAbility(a) })),
    talents: talents(seed.id, talentA[0], talentA[1], talentB[0], talentB[1]),
    facets: [
      {
        id: `${seed.id}-facet-force`,
        name: 'Moonlit Discipline',
        description: 'A compact stat package tuned for Phase 2 progression.',
        mods: seed.attribute === 'str' ? { str: 5 } : seed.attribute === 'agi' ? { agi: 5 } : { int: 5 }
      },
      {
        id: `${seed.id}-facet-reach`,
        name: 'Long Reach',
        description: 'Adds a small amount of cast range.',
        mods: { castRange: 75 }
      }
    ],
    aghanim: { name: `${seed.name}'s Scepter`, description: 'A later shard of the kit waits beyond Phase 2.', implemented: false },
    silhouette: { build: 'biped', scale: 1, bodyShape: seed.bodyShape ?? 'slim', head: seed.head ?? 'bare', weapon: seed.weapon, extras: seed.extras ?? [] },
    palette: seed.palette,
    barks: [
      `${seed.name} answers the shard-call.`,
      'Another fragment, another fight.',
      'Keep your formation tight.',
      'The moon broke. We did not.',
      'I know this road by the scars it leaves.',
      'Let the echo come closer.'
    ],
    bounty: { xp: 330, gold: 220 },
    recruitmentQuestId: seed.recruitmentQuestId,
    animProfile: {
      rig: ranged ? 'caster' : seed.attribute === 'str' ? 'brute' : 'fighter',
      castStyle: seed.attribute === 'int' ? 'spell' : 'weapon',
      voiceTimbre: seed.attribute === 'str' ? 'low' : seed.attribute === 'agi' ? 'sharp' : 'bright'
    }
  };
}

const rangedBase = (attr: HeroDef['attribute'], range = 600): HeroBaseStats => ({
  str: attr === 'str' ? 24 : 18,
  agi: attr === 'agi' ? 24 : 18,
  int: attr === 'int' ? 24 : 18,
  strGain: attr === 'str' ? 3.0 : 2.0,
  agiGain: attr === 'agi' ? 3.0 : 2.0,
  intGain: attr === 'int' ? 3.0 : 2.0,
  baseDamage: 28,
  baseArmor: attr === 'agi' ? 3 : 1,
  attackRange: range,
  attackPoint: 0.4,
  baseAttackTime: 1.7,
  attackProjectileSpeed: 1000,
  moveSpeed: 295,
  turnRate: 0.6,
  hpRegen: 1.2,
  manaRegen: 1.0
});

const meleeBase = (attr: HeroDef['attribute']): HeroBaseStats => ({
  ...rangedBase(attr, 150),
  baseDamage: 34,
  attackProjectileSpeed: undefined,
  baseArmor: attr === 'agi' ? 4 : 2,
  moveSpeed: 305
});

export const MIRANA = hero({
  id: 'mirana',
  name: 'Mirana',
  title: 'Princess of the Moon',
  attribute: 'agi',
  roles: ['carry', 'nuker', 'escape', 'disabler'],
  region: 'nightsilver-woods',
  lore: 'Mirana rides under the silver canopy, hunting fragments that dim Selemene’s road.',
  baseStats: rangedBase('agi', 630),
  palette: ['#9ec8ff', '#f3f7ff', '#4a5c94'],
  weapon: 'rifle',
  head: 'helm',
  extras: ['cape'],
  recruitmentQuestId: 'recruit-mirana',
  abilities: [
    { id: 'mir-starstorm', name: 'Starstorm', targeting: 'no-target', castPoint: 0.3, manaCost: [90, 105, 120, 135], cooldown: [14, 13, 12, 11], values: { damage: [85, 150, 215, 280], radius: [650, 650, 650, 650] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], vfx: { archetype: 'storm', color: '#b9d8ff' } },
    { id: 'mir-arrow', name: 'Sacred Arrow', targeting: 'skillshot', castRange: 1800, castPoint: 0.4, manaCost: [90, 90, 90, 90], cooldown: [19, 18, 17, 16], values: { speed: [900, 900, 900, 900], damage: [90, 180, 270, 360], stun: [1.5, 2.2, 2.9, 3.6] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 90, range: 1800, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }] } }], vfx: { archetype: 'projectile', color: '#e9f3ff', color2: '#9ec8ff', scale: 1.15 } },
    { id: 'mir-leap', name: 'Leap', targeting: 'point-target', castRange: 500, castPoint: 0, manaCost: [40, 35, 30, 25], cooldown: [22, 19, 16, 13], values: { speed: [35, 45, 55, 65] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point' }, { kind: 'statmod', mods: { attackSpeed: 'speed', moveSpeedPct: 12 }, duration: 3, target: 'self' }], vfx: { archetype: 'global-mark', color: '#9ec8ff' } },
    { id: 'mir-moonlight-shadow', name: 'Moonlight Shadow', targeting: 'no-target', ult: true, castPoint: 0, manaCost: [125, 150, 175], cooldown: [90, 80, 70], values: { duration: [7, 9, 11], radius: [9999, 9999, 9999] }, effects: [{ kind: 'status', status: 'invis', duration: 'duration', target: 'allies-in-radius', radius: 'radius', params: { fadeTime: 1.2 } }], vfx: { archetype: 'global-mark', color: '#d9e8ff' } }
  ]
}, ['mir-starstorm', 'damage'], ['mir-arrow', 'damage']);

export const LINA = hero({
  id: 'lina',
  name: 'Lina',
  title: 'Slayer of the Scintillant Waste',
  attribute: 'int',
  roles: ['nuker', 'disabler', 'support'],
  region: 'nightsilver-woods',
  lore: 'The silver woods do not enjoy Lina’s visits, but every shadow flees when she smiles.',
  baseStats: rangedBase('int', 670),
  palette: ['#ff6b30', '#ffd36b', '#7a1f12'],
  weapon: 'staff',
  extras: ['cape'],
  recruitmentQuestId: 'recruit-lina',
  abilities: [
    { id: 'lina-dragon-slave', name: 'Dragon Slave', targeting: 'skillshot', castRange: 900, castPoint: 0.45, manaCost: [100, 115, 130, 145], cooldown: [12, 11, 10, 9], values: { speed: [1200, 1200, 1200, 1200], damage: [110, 180, 250, 320] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 180, range: 950, hitsAllies: false, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }] } }], vfx: { archetype: 'projectile', color: '#ff8a30' } },
    { id: 'lina-lsa', name: 'Light Strike Array', targeting: 'ground-aoe', castRange: 650, castPoint: 0.45, manaCost: [100, 110, 120, 130], cooldown: [13, 12, 11, 10], values: { damage: [80, 130, 180, 230], radius: [260, 260, 260, 260], stun: [1.3, 1.6, 1.9, 2.2] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'enemies-in-radius', radius: 'radius' }], vfx: { archetype: 'ground-aoe', color: '#ffd36b' } },
    { id: 'lina-fiery-soul', name: 'Fiery Soul', targeting: 'passive', passiveMods: { attackSpeed: 30, moveSpeedPct: 8 }, vfx: { archetype: 'shield', color: '#ff6b30' } },
    { id: 'lina-laguna', name: 'Laguna Blade', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 700, castPoint: 0.35, manaCost: [250, 350, 450], cooldown: [70, 60, 50], values: { damage: [420, 620, 820] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }], vfx: { archetype: 'beam', color: '#fff19a', color2: '#ff3c1f', scale: 1.35 }, anim: 'global-cast', sound: 'fire' }
  ]
}, ['lina-dragon-slave', 'damage'], ['lina-laguna', 'damage']);

export const ZEUS = hero({
  id: 'zeus',
  name: 'Zeus',
  title: 'Lord of Heaven',
  attribute: 'int',
  roles: ['nuker'],
  region: 'nightsilver-woods',
  lore: 'Zeus claims every moon shard is simply thunder that forgot to fall upward.',
  baseStats: rangedBase('int', 380),
  palette: ['#f5e76b', '#ffffff', '#4a70d8'],
  weapon: 'staff',
  head: 'bare',
  extras: ['crown'],
  recruitmentQuestId: 'recruit-zeus',
  abilities: [
    { id: 'zeus-arc', name: 'Arc Lightning', targeting: 'unit-target', affects: 'enemy', castRange: 650, castPoint: 0.25, manaCost: [80, 80, 80, 80], cooldown: [6, 5, 4, 3], values: { damage: [80, 120, 160, 200], radius: [450, 450, 450, 450] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'random-enemy-in-radius', radius: 'radius' }], vfx: { archetype: 'chain', color: '#f5e76b' } },
    { id: 'zeus-bolt', name: 'Lightning Bolt', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.35, manaCost: [90, 105, 120, 135], cooldown: [9, 8, 7, 6], values: { damage: [125, 200, 275, 350], reveal: [3, 3, 3, 3] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'buff', duration: 'reveal', target: 'target', params: { mods: { revealed: 1 }, tag: 'zeus-reveal' } }], vfx: { archetype: 'beam', color: '#fff28a' } },
    { id: 'zeus-field', name: 'Static Field', targeting: 'passive', passiveMods: { spellAmpPct: 8 }, vfx: { archetype: 'shield', color: '#f5e76b' } },
    { id: 'zeus-wrath', name: "Thundergod's Wrath", targeting: 'no-target', ult: true, castPoint: 0.4, manaCost: [250, 350, 450], cooldown: [100, 90, 80], values: { damage: [300, 450, 600], radius: [9999, 9999, 9999] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], vfx: { archetype: 'global-mark', color: '#fff28a', color2: '#4a70d8', scale: 1.5 }, anim: 'global-cast', sound: 'storm' }
  ]
}, ['zeus-bolt', 'damage'], ['zeus-wrath', 'damage']);

export const DROW_RANGER = hero({
  id: 'drow-ranger',
  name: 'Drow Ranger',
  title: 'Traxex of the Frosted Paths',
  attribute: 'agi',
  roles: ['carry', 'disabler'],
  region: 'nightsilver-woods',
  lore: 'Traxex keeps to the cold edges of the wood, where moonlight hardens into arrows.',
  baseStats: rangedBase('agi', 625),
  palette: ['#8ec8ff', '#1e406b', '#d8f0ff'],
  weapon: 'rifle',
  head: 'hood',
  recruitmentQuestId: 'recruit-drow-ranger',
  abilities: [
    { id: 'drow-frost-arrows', name: 'Frost Arrows', targeting: 'attack-modifier', values: { slow: [16, 32, 48, 64] }, attackMod: { procChance: 100, procStatus: { status: 'slow', duration: 1.5, params: { moveSlowPct: 'slow', tag: 'drow-frost' } } }, vfx: { archetype: 'projectile', color: '#9fd8ff', color2: '#1e406b', scale: 0.9 }, sound: 'frost' },
    { id: 'drow-gust', name: 'Gust', targeting: 'skillshot', castRange: 900, castPoint: 0.25, manaCost: [70, 80, 90, 100], cooldown: [19, 17, 15, 13], values: { speed: [1200, 1200, 1200, 1200], duration: [3, 4, 5, 6] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 220, range: 900, onHit: [{ kind: 'status', status: 'silence', duration: 'duration', target: 'target' }, { kind: 'displace', mode: 'knockback', target: 'target', distance: 180, speed: 900, toward: 'away-from-caster' }] } }], vfx: { archetype: 'projectile', color: '#d8f0ff' } },
    { id: 'drow-multishot', name: 'Multishot', targeting: 'no-target', castRange: 850, castPoint: 0.2, manaCost: [50, 60, 70, 80], cooldown: [24, 22, 20, 18], channel: { duration: 1.5, tick: { interval: 0.5, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }] } }, values: { damage: [60, 90, 120, 150], radius: [760, 760, 760, 760] }, vfx: { archetype: 'storm', color: '#9fd8ff' } },
    { id: 'drow-marksmanship', name: 'Marksmanship', targeting: 'passive', ult: true, values: { damage: [0, 0, 0] }, passiveMods: { damage: 55, attackSpeed: 35 }, vfx: { archetype: 'shield', color: '#d8f0ff' } }
  ]
}, ['drow-multishot', 'damage'], ['drow-marksmanship', 'damage']);

export const JAKIRO = hero({
  id: 'jakiro',
  name: 'Jakiro',
  title: 'Twin Head Dragon',
  attribute: 'int',
  roles: ['support', 'nuker', 'disabler', 'pusher'],
  region: 'icewrack',
  lore: 'Icewrack’s storms split around Jakiro: one head remembers winter, the other wants the thaw.',
  baseStats: rangedBase('int', 400),
  palette: ['#7ec8ff', '#ff7a3c', '#2f3f6b'],
  weapon: 'none',
  head: 'horned',
  bodyShape: 'bulky',
  extras: ['wings'],
  recruitmentQuestId: 'recruit-jakiro',
  abilities: [
    { id: 'jak-dual-breath', name: 'Dual Breath', targeting: 'skillshot', castRange: 800, castPoint: 0.45, manaCost: [110, 120, 130, 140], cooldown: [10, 10, 10, 10], values: { speed: [800, 800, 800, 800], damage: [90, 150, 210, 270], slow: [20, 28, 36, 44] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 240, range: 850, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 4, target: 'target', params: { moveSlowPct: 'slow', attackSlowPct: 'slow' } }] } }], vfx: { archetype: 'projectile', color: '#ffb16b', color2: '#9fd8ff' } },
    { id: 'jak-ice-path', name: 'Ice Path', targeting: 'point-target', castRange: 900, castPoint: 0.3, manaCost: [90, 100, 110, 120], cooldown: [18, 16, 14, 12], values: { duration: [1.6, 1.9, 2.2, 2.5], length: [900, 900, 900, 900], width: [180, 180, 180, 180] }, effects: [{ kind: 'zone', at: 'line-to-point', zone: { shape: 'line', length: 'length', width: 'width', duration: 1.2, onEnter: { affects: 'enemies', effects: [{ kind: 'status', status: 'stun', duration: 'duration', target: 'target' }], windowSec: 0.5 } } }], vfx: { archetype: 'wall', color: '#bfeaff' } },
    { id: 'jak-liquid-fire', name: 'Liquid Fire', targeting: 'attack-modifier', values: { dps: [15, 25, 35, 45], slow: [20, 30, 40, 50] }, attackMod: { procChance: 100, procStatus: { status: 'buff', duration: 4, params: { dotDps: 'dps', dotType: 'magical', attackSlowPct: 'slow', tag: 'jak-liquid-fire' } } }, vfx: { archetype: 'projectile', color: '#ff7a3c' } },
    { id: 'jak-macropyre', name: 'Macropyre', targeting: 'point-target', ult: true, castRange: 900, castPoint: 0.5, manaCost: [220, 330, 440], cooldown: [90, 80, 70], values: { dps: [110, 160, 210], length: [900, 900, 900], width: [260, 260, 260], duration: [6, 7, 8] }, effects: [{ kind: 'zone', at: 'line-to-point', zone: { shape: 'line', length: 'length', width: 'width', duration: 'duration', tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 'dps', target: 'target' }] } } }], vfx: { archetype: 'wall', color: '#ff7a3c', color2: '#7ec8ff', scale: 1.3 }, sound: 'fire' }
  ]
}, ['jak-dual-breath', 'damage'], ['jak-macropyre', 'dps']);

export const WITCH_DOCTOR = hero({
  id: 'witch-doctor',
  name: 'Witch Doctor',
  title: 'Zharvakko',
  attribute: 'int',
  roles: ['support', 'disabler', 'nuker'],
  region: 'tranquil-vale',
  lore: 'Zharvakko walks the Vale collecting debts from spirits that thought death ended accounting.',
  baseStats: rangedBase('int', 600),
  palette: ['#7c4bd8', '#39c46a', '#f4e37a'],
  weapon: 'staff',
  head: 'mask',
  recruitmentQuestId: 'recruit-witch-doctor',
  abilities: [
    { id: 'wd-cask', name: 'Paralyzing Cask', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.35, manaCost: [80, 90, 100, 110], cooldown: [18, 16, 14, 12], values: { speed: [900, 900, 900, 900], damage: [55, 80, 105, 130], stun: [0.8, 1, 1.2, 1.4], bounces: [3, 4, 5, 6] }, effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 'speed', bounces: { count: 'bounces', radius: 600 }, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }] } }], vfx: { archetype: 'chain', color: '#f4e37a' } },
    { id: 'wd-restoration', name: 'Voodoo Restoration', targeting: 'toggle', manaCost: [35, 40, 45, 50], cooldown: [0, 0, 0, 0], toggle: { interval: 0.5, manaPerSec: 18, effects: [{ kind: 'heal', amount: 'heal', target: 'allies-in-radius', radius: 'radius' }] }, values: { heal: [8, 14, 20, 26], radius: [500, 500, 500, 500] }, vfx: { archetype: 'shield', color: '#39c46a' } },
    { id: 'wd-maledict', name: 'Maledict', targeting: 'ground-aoe', castRange: 575, castPoint: 0.35, manaCost: [105, 110, 115, 120], cooldown: [30, 28, 26, 24], values: { dps: [16, 28, 40, 52], radius: [260, 260, 260, 260] }, effects: [{ kind: 'status', status: 'buff', duration: 8, target: 'enemies-in-radius', radius: 'radius', params: { dotDps: 'dps', dotType: 'magical', tag: 'wd-maledict' } }], vfx: { archetype: 'ground-aoe', color: '#7c4bd8' } },
    { id: 'wd-death-ward', name: 'Death Ward', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 600, castPoint: 0.3, manaCost: [200, 250, 300], cooldown: [90, 80, 70], channel: { duration: 'duration', tick: { interval: 0.35, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }] } }, values: { damage: [80, 130, 180], duration: [4, 5, 6] }, effects: [], vfx: { archetype: 'channel', color: '#f4e37a', color2: '#39c46a', scale: 1.1 } }
  ]
}, ['wd-cask', 'damage'], ['wd-death-ward', 'damage']);

export const OMNIKNIGHT = hero({
  id: 'omniknight',
  name: 'Omniknight',
  title: 'Purist Thunderwrath',
  attribute: 'str',
  roles: ['support', 'durable'],
  region: 'tranquil-vale',
  lore: 'Purist sees no contradiction in mercy carried by a very heavy hammer.',
  baseStats: meleeBase('str'),
  palette: ['#f8e59a', '#ffffff', '#5a7cc8'],
  weapon: 'totem',
  head: 'helm',
  extras: ['shoulderpads'],
  recruitmentQuestId: 'recruit-omniknight',
  abilities: [
    { id: 'omni-purification', name: 'Purification', targeting: 'unit-target', affects: 'ally', castRange: 550, castPoint: 0.25, manaCost: [80, 95, 110, 125], cooldown: [16, 14, 12, 10], values: { heal: [90, 160, 230, 300], radius: [300, 300, 300, 300] }, effects: [{ kind: 'heal', amount: 'heal', target: 'target' }, { kind: 'damage', dtype: 'pure', amount: 'heal', target: 'enemies-in-radius', radius: 'radius' }], vfx: { archetype: 'shield', color: '#fff4b0' } },
    { id: 'omni-repel', name: 'Repel', targeting: 'unit-target', affects: 'ally', castRange: 500, castPoint: 0.25, manaCost: [90, 100, 110, 120], cooldown: [30, 28, 26, 24], values: { duration: [3, 4, 5, 6] }, effects: [{ kind: 'status', status: 'magic-immune', duration: 'duration', target: 'target' }], vfx: { archetype: 'shield', color: '#ffffff' } },
    { id: 'omni-hammer', name: 'Hammer of Purity', targeting: 'attack-modifier', values: { bonus: [25, 45, 65, 85] }, attackMod: { procChance: 100, bonusDamage: 'bonus', procDamage: 20 }, vfx: { archetype: 'stun-stars', color: '#f8e59a' } },
    { id: 'omni-guardian-angel', name: 'Guardian Angel', targeting: 'no-target', ult: true, castPoint: 0.4, manaCost: [150, 200, 250], cooldown: [120, 110, 100], values: { duration: [5, 6, 7], radius: [900, 900, 900] }, effects: [{ kind: 'statmod', mods: { attackDamageTakenReductionPct: 90, hpRegen: 18 }, duration: 'duration', target: 'allies-in-radius', radius: 'radius' }], vfx: { archetype: 'global-mark', color: '#fff4b0', color2: '#ffffff', scale: 1.4 }, sound: 'heal' }
  ]
}, ['omni-purification', 'heal'], ['omni-purification', 'heal']);

export const WINDRANGER = hero({
  id: 'windranger',
  name: 'Windranger',
  title: 'Lyralei',
  attribute: 'uni',
  roles: ['disabler', 'nuker', 'escape'],
  region: 'tranquil-vale',
  lore: 'Lyralei treats every fallen shard as a new excuse to test the weather.',
  baseStats: rangedBase('agi', 600),
  palette: ['#6fd46f', '#f5d06a', '#b84028'],
  weapon: 'rifle',
  head: 'hood',
  recruitmentQuestId: 'recruit-windranger',
  abilities: [
    { id: 'wr-shackleshot', name: 'Shackleshot', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.3, manaCost: [70, 80, 90, 100], cooldown: [18, 16, 14, 12], values: { damage: [60, 90, 120, 150], root: [1.5, 2, 2.5, 3] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'root', duration: 'root', target: 'target' }], vfx: { archetype: 'hook', color: '#f5d06a' } },
    { id: 'wr-powershot', name: 'Powershot', targeting: 'skillshot', castRange: 1200, castPoint: 0.4, manaCost: [90, 100, 110, 120], cooldown: [12, 11, 10, 9], values: { speed: [1400, 1400, 1400, 1400], damage: [120, 200, 280, 360] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 120, range: 1200, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }] } }], vfx: { archetype: 'projectile', color: '#6fd46f' } },
    { id: 'wr-windrun', name: 'Windrun', targeting: 'no-target', castPoint: 0, manaCost: [50, 50, 50, 50], cooldown: [15, 14, 13, 12], values: { duration: [3, 4, 5, 6] }, effects: [{ kind: 'statmod', mods: { evasionPct: 70, moveSpeedPct: 35 }, duration: 'duration', target: 'self' }], vfx: { archetype: 'shield', color: '#6fd46f' } },
    { id: 'wr-focus-fire', name: 'Focus Fire', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 700, castPoint: 0, manaCost: [75, 100, 125], cooldown: [70, 60, 50], values: { duration: [6, 7, 8], attackSpeed: [250, 325, 400] }, effects: [{ kind: 'statmod', mods: { attackSpeed: 'attackSpeed', damagePct: -25 }, duration: 'duration', target: 'self' }], vfx: { archetype: 'global-mark', color: '#f5d06a', color2: '#6fd46f', scale: 0.85 }, anim: 'ranged-shot' }
  ]
}, ['wr-powershot', 'damage'], ['wr-focus-fire', 'attackSpeed']);

export const PHANTOM_ASSASSIN = hero({
  id: 'phantom-assassin',
  name: 'Phantom Assassin',
  title: 'Mortred',
  attribute: 'agi',
  roles: ['carry', 'escape'],
  region: 'tranquil-vale',
  lore: 'Mortred accepts contracts only from veiled mouths, but the Mad Moon has many faces.',
  baseStats: meleeBase('agi'),
  palette: ['#5560a8', '#cfd6ff', '#1c2038'],
  weapon: 'sword',
  head: 'hood',
  extras: ['cape'],
  recruitmentQuestId: 'recruit-phantom-assassin',
  abilities: [
    { id: 'pa-dagger', name: 'Stifling Dagger', targeting: 'unit-target', affects: 'enemy', castRange: 900, castPoint: 0.2, manaCost: [30, 30, 30, 30], cooldown: [6, 6, 6, 6], values: { speed: [1100, 1100, 1100, 1100], damage: [65, 90, 115, 140], slow: [50, 50, 50, 50] }, effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 'speed', onHit: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 2, target: 'target', params: { moveSlowPct: 'slow' } }] } }], vfx: { archetype: 'projectile', color: '#cfd6ff' } },
    { id: 'pa-strike', name: 'Phantom Strike', targeting: 'unit-target', affects: 'enemy', castRange: 900, castPoint: 0, manaCost: [35, 40, 45, 50], cooldown: [11, 9, 7, 5], values: { attackSpeed: [75, 100, 125, 150] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }, { kind: 'statmod', mods: { attackSpeed: 'attackSpeed' }, duration: 2.5, target: 'self' }], vfx: { archetype: 'global-mark', color: '#5560a8' } },
    { id: 'pa-blur', name: 'Blur', targeting: 'no-target', castPoint: 0, manaCost: [50, 50, 50, 50], cooldown: [35, 30, 25, 20], values: { duration: [4, 5, 6, 7], evasion: [25, 35, 45, 55] }, effects: [{ kind: 'status', status: 'invis', duration: 'duration', target: 'self', params: { fadeTime: 0.5 } }, { kind: 'statmod', mods: { evasionPct: 'evasion' }, duration: 'duration', target: 'self' }], vfx: { archetype: 'shield', color: '#5560a8' } },
    { id: 'pa-coup', name: 'Coup de Grace', targeting: 'passive', ult: true, values: { critChance: [15, 20, 25], critMult: [300, 375, 450], damage: [0, 0, 0] }, attackMod: { critChance: 'critChance', critMult: 'critMult' }, vfx: { archetype: 'stun-stars', color: '#cfd6ff', color2: '#5560a8', scale: 0.8 } }
  ]
}, ['pa-dagger', 'damage'], ['pa-coup', 'damage']);

export const TUSK = hero({
  id: 'tusk',
  name: 'Tusk',
  title: 'Ymir of Icewrack',
  attribute: 'str',
  roles: ['initiator', 'disabler', 'durable'],
  region: 'icewrack',
  lore: 'Ymir calls every frozen road a tavern floor and every echo a brawl waiting politely.',
  baseStats: meleeBase('str'),
  palette: ['#d8f4ff', '#6c8ca8', '#2c3a4a'],
  weapon: 'none',
  head: 'bare',
  bodyShape: 'bulky',
  extras: ['tusks'],
  recruitmentQuestId: 'recruit-tusk',
  abilities: [
    { id: 'tusk-shards', name: 'Ice Shards', targeting: 'skillshot', castRange: 1000, castPoint: 0.2, manaCost: [100, 105, 110, 115], cooldown: [20, 18, 16, 14], values: { speed: [1000, 1000, 1000, 1000], damage: [75, 140, 205, 270] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 140, range: 1000, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 2, target: 'target', params: { moveSlowPct: 35 } }] } }], vfx: { archetype: 'projectile', color: '#d8f4ff' } },
    { id: 'tusk-snowball', name: 'Snowball', targeting: 'unit-target', affects: 'enemy', castRange: 650, castPoint: 0.2, manaCost: [75, 75, 75, 75], cooldown: [24, 21, 18, 15], values: { damage: [80, 140, 200, 260], stun: [0.8, 1, 1.2, 1.4] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: { archetype: 'global-mark', color: '#d8f4ff', color2: '#6c8ca8', scale: 1.1 }, sound: 'frost' },
    { id: 'tusk-tag-team', name: 'Tag Team', targeting: 'no-target', castPoint: 0, manaCost: [70, 70, 70, 70], cooldown: [24, 22, 20, 18], values: { radius: [350, 350, 350, 350], slow: [25, 35, 45, 55] }, effects: [{ kind: 'zone', at: 'self', follow: true, zone: { shape: 'circle', radius: 'radius', duration: 5, tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'status', status: 'slow', duration: 1, target: 'target', params: { moveSlowPct: 'slow' } }] } } }], vfx: { archetype: 'ground-aoe', color: '#bfeaff' } },
    { id: 'tusk-walrus-punch', name: 'Walrus Punch', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 180, castPoint: 0.2, manaCost: [75, 75, 75], cooldown: [36, 24, 12], values: { damage: [260, 420, 580], stun: [1, 1.2, 1.4] }, effects: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }, { kind: 'displace', mode: 'knockback', target: 'target', distance: 240, speed: 1000, toward: 'away-from-caster' }], vfx: { archetype: 'stun-stars', color: '#ffffff' }, anim: 'melee-swing' }
  ]
}, ['tusk-shards', 'damage'], ['tusk-walrus-punch', 'damage']);

export const ANCIENT_APPARITION = hero({
  id: 'ancient-apparition',
  name: 'Ancient Apparition',
  title: 'Kaldr',
  attribute: 'int',
  roles: ['support', 'disabler', 'nuker'],
  region: 'icewrack',
  lore: 'Kaldr does not haunt Icewrack. Icewrack is merely where the future feels coldest.',
  baseStats: rangedBase('int', 675),
  palette: ['#9fe8ff', '#ffffff', '#385c86'],
  weapon: 'staff',
  head: 'skull',
  recruitmentQuestId: 'recruit-ancient-apparition',
  abilities: [
    { id: 'aa-cold-feet', name: 'Cold Feet', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.3, manaCost: [90, 100, 110, 120], cooldown: [15, 13, 11, 9], values: { dps: [30, 50, 70, 90], root: [1.5, 2, 2.5, 3] }, effects: [{ kind: 'status', status: 'buff', duration: 4, target: 'target', params: { dotDps: 'dps', dotType: 'magical', tag: 'aa-cold-feet' } }, { kind: 'status', status: 'root', duration: 'root', target: 'target' }], vfx: { archetype: 'shield', color: '#9fe8ff' } },
    { id: 'aa-vortex', name: 'Ice Vortex', targeting: 'ground-aoe', castRange: 800, castPoint: 0.25, manaCost: [60, 70, 80, 90], cooldown: [12, 10, 8, 6], values: { radius: [300, 320, 340, 360], slow: [18, 22, 26, 30] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 5, tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'status', status: 'slow', duration: 1, target: 'target', params: { moveSlowPct: 'slow', tag: 'aa-vortex-slow' } }] }, auraMods: { affects: 'enemies', mods: { magicResistPct: -12 } } } }], vfx: { archetype: 'ground-aoe', color: '#9fe8ff' } },
    { id: 'aa-chilling-touch', name: 'Chilling Touch', targeting: 'attack-modifier', values: { bonus: [30, 55, 80, 105], slow: [20, 30, 40, 50] }, attackMod: { procChance: 100, bonusDamage: 'bonus', procStatus: { status: 'slow', duration: 0.8, params: { moveSlowPct: 'slow' } } }, vfx: { archetype: 'projectile', color: '#e4fbff' } },
    { id: 'aa-ice-blast', name: 'Ice Blast', targeting: 'ground-aoe', ult: true, castRange: 1400, castPoint: 0.45, manaCost: [175, 250, 325], cooldown: [70, 60, 50], values: { damage: [250, 375, 500], radius: [450, 500, 550] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'frozen', duration: 1, target: 'enemies-in-radius', radius: 'radius' }], vfx: { archetype: 'global-mark', color: '#e4fbff', color2: '#9fe8ff', scale: 1.45 }, sound: 'frost' }
  ]
}, ['aa-cold-feet', 'dps'], ['aa-ice-blast', 'damage']);

export const PHASE2_HEROES: HeroDef[] = [
  MIRANA,
  LINA,
  ZEUS,
  DROW_RANGER,
  JAKIRO,
  WITCH_DOCTOR,
  OMNIKNIGHT,
  WINDRANGER,
  PHANTOM_ASSASSIN,
  TUSK,
  ANCIENT_APPARITION
];
