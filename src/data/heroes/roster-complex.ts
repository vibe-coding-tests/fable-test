import type { AbilityDef, HeroBaseStats, HeroDef, StatModMap, SummonSpec, VfxArchetype } from '../../core/types';
import { gestureForAbility, soundForAbility } from '../../core/gestures';
import { echoLoopNote } from './loop-note';

type HeroInput = {
  id: string;
  name: string;
  title: string;
  attribute: HeroDef['attribute'];
  roles: string[];
  region: string;
  palette: [string, string, string];
  ranged?: boolean;
  silhouette?: Partial<HeroDef['silhouette']>;
  abilities: AbilityDef[];
};

function baseStats(attribute: HeroDef['attribute'], ranged = false): HeroBaseStats {
  const primary = attribute === 'uni' ? 'str' : attribute;
  return {
    str: primary === 'str' ? 25 : 19,
    agi: primary === 'agi' ? 25 : 19,
    int: primary === 'int' ? 25 : 19,
    strGain: primary === 'str' ? 3.1 : 2.1,
    agiGain: primary === 'agi' ? 3.1 : 2.2,
    intGain: primary === 'int' ? 3.1 : 2.0,
    baseDamage: ranged ? 29 : 37,
    baseArmor: primary === 'agi' ? 4 : 2,
    attackRange: ranged ? 600 : 150,
    attackPoint: ranged ? 0.4 : 0.32,
    baseAttackTime: 1.7,
    attackProjectileSpeed: ranged ? 1000 : undefined,
    moveSpeed: ranged ? 300 : 310,
    turnRate: 0.6,
    hpRegen: primary === 'str' ? 3.5 : primary === 'agi' ? 2.5 : 2.0,
    manaRegen: primary === 'int' ? 2.5 : 1.5
  };
}

function vfx(archetype: VfxArchetype, color: string, color2?: string, scale = 0.85): AbilityDef['vfx'] {
  return { archetype, color, color2, scale };
}

function tagged(a: AbilityDef): AbilityDef {
  return { ...a, anim: a.anim ?? gestureForAbility(a), sound: a.sound ?? soundForAbility(a) };
}

function talents(id: string, abilities: AbilityDef[]): HeroDef['talents'] {
  const basic = abilities.find((a) => !a.ult && a.values?.damage) ?? abilities[0];
  const ult = abilities.find((a) => a.ult && a.values?.damage) ?? abilities.find((a) => a.ult) ?? abilities[3];
  const basicKey = basic.values?.damage ? 'damage' : Object.keys(basic.values ?? { damage: [0] })[0];
  const ultKey = ult.values?.damage ? 'damage' : Object.keys(ult.values ?? { damage: [0] })[0];
  return [
    { level: 10, options: [{ id: `${id}-t10a`, name: '+8 Primary Stats', mods: { str: 3, agi: 3, int: 3 } as StatModMap }, { id: `${id}-t10b`, name: '+100 Health', mods: { maxHp: 100 } }] },
    { level: 15, options: [{ id: `${id}-t15a`, name: '+25 Attack Speed', mods: { attackSpeed: 25 } }, { id: `${id}-t15b`, name: '+10% Spell Amp', mods: { spellAmpPct: 10 } }] },
    { level: 20, options: [{ id: `${id}-t20a`, name: '+Ability Damage', abilityOverride: { abilityId: basic.id, valueKey: basicKey, mode: 'add', amount: 45 } }, { id: `${id}-t20b`, name: '+25 Move Speed', mods: { moveSpeed: 25 } }] },
    { level: 25, options: [{ id: `${id}-t25a`, name: '+Ultimate Damage', abilityOverride: { abilityId: ult.id, valueKey: ultKey, mode: 'add', amount: 90 } }, { id: `${id}-t25b`, name: '+16 All Stats', mods: { str: 16, agi: 16, int: 16 } }] }
  ];
}

function hero(input: HeroInput): HeroDef {
  const ranged = input.ranged ?? input.attribute === 'int';
  const abilities = input.abilities.map(tagged);
  return {
    id: input.id,
    name: input.name,
    title: input.title,
    attribute: input.attribute,
    roles: input.roles,
    region: input.region,
    lore: `${input.name} keeps the signature Dota decision while scaling the execution down to one controlled hero and AI-driven extras.${echoLoopNote(input.id)}`,
    baseStats: baseStats(input.attribute, ranged),
    abilities,
    skillOrder: [0, 1, 2],
    talents: talents(input.id, abilities),
    facets: [
      { id: `${input.id}-facet-pressure`, name: 'Pressure', description: 'Sharper fights around the hero signature.', mods: input.attribute === 'agi' ? { agi: 6 } : input.attribute === 'int' ? { int: 6 } : { str: 6 } },
      { id: `${input.id}-facet-command`, name: 'Command', description: 'Improves AI-driven doubles, illusions, and summons through basic stats.', mods: { damage: 8, maxHp: 80 } }
    ],
    aghanim: { name: `${input.name}'s Scepter`, description: 'A future Scepter variant can deepen the signature mechanic after the base complex pass.', implemented: false },
    silhouette: {
      build: input.silhouette?.build ?? (input.roles.includes('durable') ? 'brute' : 'biped'),
      scale: input.silhouette?.scale ?? (input.roles.includes('durable') ? 1.08 : 1),
      bodyShape: input.silhouette?.bodyShape ?? (input.attribute === 'str' ? 'bulky' : input.attribute === 'int' ? 'robed' : 'slim'),
      head: input.silhouette?.head ?? (input.attribute === 'str' ? 'helm' : 'bare'),
      weapon: input.silhouette?.weapon ?? (ranged ? 'staff' : 'sword'),
      extras: input.silhouette?.extras ?? (input.roles.includes('carry') ? ['shoulderpads'] : [])
    },
    palette: input.palette,
    barks: [
      `${input.name} keeps the hard part simple.`,
      'One body gives the order. The rest follow.',
      'Count the copies before they count you.',
      'A signature is still a signature at combat speed.',
      'I brought the trick. You brought the target.',
      'Micro belongs to the old war. This one has teeth.'
    ],
    bounty: { xp: 600, gold: 390 },
    recruitmentQuestId: `recruit-${input.id}`,
    animProfile: { rig: ranged ? 'caster' : input.attribute === 'str' ? 'brute' : 'fighter', castStyle: input.attribute === 'int' ? 'spell' : 'weapon', voiceTimbre: input.attribute === 'str' ? 'low' : input.attribute === 'agi' ? 'sharp' : 'bright' }
  };
}

function summon(
  id: string,
  name: string,
  palette: [string, string, string],
  stats: Partial<SummonSpec['stats']> = {},
  silhouette: Partial<SummonSpec['silhouette']> = {}
): SummonSpec {
  return {
    id,
    name,
    lifetime: 'duration',
    stats: {
      maxHp: stats.maxHp ?? 420,
      damage: stats.damage ?? 38,
      armor: stats.armor ?? 2,
      moveSpeed: stats.moveSpeed ?? 330,
      attackRange: stats.attackRange ?? 150,
      baseAttackTime: stats.baseAttackTime ?? 1.45,
      magicResistPct: stats.magicResistPct ?? 10
    },
    silhouette: {
      build: silhouette.build ?? 'biped',
      scale: silhouette.scale ?? 0.85,
      bodyShape: silhouette.bodyShape,
      head: silhouette.head ?? 'bare',
      weapon: silhouette.weapon ?? 'sword',
      extras: silhouette.extras ?? []
    },
    palette
  };
}

const chaosIllusion = summon('chaos-knight-illusion', 'Chaos Knight Illusion', ['#d84a32', '#1a0a0a', '#f0c060'], { maxHp: 520, damage: 42, armor: 3 }, { head: 'helm', weapon: 'sword', scale: 0.92 });
const arcDouble = summon('arc-warden-double', 'Tempest Double', ['#65d8ff', '#1c2440', '#f6f0a8'], { maxHp: 560, damage: 46, armor: 3, attackRange: 600 }, { head: 'hood', weapon: 'staff', scale: 0.95 });
const meepoClone = summon('meepo-clone', 'Meepo Clone', ['#78b85a', '#4a2a18', '#d8f0a0'], { maxHp: 460, damage: 36, armor: 4 }, { head: 'bare', weapon: 'cleaver', scale: 0.82 });
const monkeySoldier = summon('monkey-soldier', "Wukong's Soldier", ['#d8a048', '#4a2410', '#fff0a0'], { maxHp: 300, damage: 34, armor: 2 }, { head: 'mask', weapon: 'staff', scale: 0.78 });
const morphReplicate = summon('morphling-replicate', 'Replicate', ['#5ad8ff', '#1b4a60', '#d8fbff'], { maxHp: 480, damage: 38, armor: 3, attackRange: 450 }, { build: 'blob', head: 'bare', weapon: 'none', scale: 0.85 });
const lancerIllusion = summon('phantom-lancer-illusion', 'Lancer Illusion', ['#4a8cff', '#18224a', '#d8e8ff'], { maxHp: 360, damage: 32, armor: 3 }, { head: 'helm', weapon: 'staff', scale: 0.84 });
const earthBrewling = summon('brewling-earth', 'Earth Brewling', ['#8a6a3a', '#352514', '#d8c080'], { maxHp: 620, damage: 42, armor: 6 }, { build: 'golem', head: 'helm', weapon: 'totem', scale: 0.9 });
const stormBrewling = summon('brewling-storm', 'Storm Brewling', ['#70c8ff', '#1c3858', '#ffffff'], { maxHp: 420, damage: 36, armor: 2, moveSpeed: 360, attackRange: 450 }, { head: 'hood', weapon: 'staff', scale: 0.82 });
const fireBrewling = summon('brewling-fire', 'Fire Brewling', ['#ff7a2f', '#401408', '#ffd06a'], { maxHp: 460, damage: 48, armor: 3, moveSpeed: 350 }, { head: 'horned', weapon: 'cleaver', scale: 0.84 });

export const COMPLEX_MISSING_HEROES: HeroDef[] = [
  hero({
    id: 'chaos-knight', name: 'Chaos Knight', title: 'Nessaj', attribute: 'str', roles: ['carry', 'durable', 'disabler'], region: 'mad-moon-crater', palette: ['#d84a32', '#1a0a0a', '#f0c060'], silhouette: { build: 'brute', head: 'helm', weapon: 'sword', extras: ['cape'] },
    abilities: [
      { id: 'ck-chaos-bolt', name: 'Chaos Bolt', targeting: 'unit-target', affects: 'enemy', castRange: 600, castPoint: 0.35, manaCost: [110, 120, 130, 140], cooldown: [13, 12, 11, 10], values: { damage: [90, 140, 190, 240], stun: [1.1, 1.5, 1.9, 2.3] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: vfx('stun-stars', '#f0c060') },
      { id: 'ck-reality-rift', name: 'Reality Rift', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.15, manaCost: [60, 70, 80, 90], cooldown: [18, 16, 14, 12], values: { armor: [-3, -4, -5, -6], damage: [60, 95, 130, 165] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }, { kind: 'displace', mode: 'pull', target: 'target', toward: 'caster', distance: 220, speed: 1000 }, { kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'statmod', mods: { armor: 'armor' }, duration: 4, target: 'target' }], vfx: vfx('hook', '#d84a32') },
      { id: 'ck-chaos-strike', name: 'Chaos Strike', targeting: 'attack-modifier', values: { crit: [160, 190, 220, 250], lifesteal: [15, 25, 35, 45] }, attackMod: { critChance: 30, critMult: 'crit', lifestealPct: 'lifesteal' }, vfx: vfx('shield', '#f0c060') },
      { id: 'ck-phantasm', name: 'Phantasm', targeting: 'no-target', ult: true, castPoint: 0.35, manaCost: [125, 200, 275], cooldown: [95, 85, 75], values: { count: [2, 3, 4], duration: [22, 24, 26], damage: [40, 60, 80] }, effects: [{ kind: 'summon', summon: chaosIllusion, count: 'count', at: 'self' }, { kind: 'statmod', mods: { damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('summon-pop', '#d84a32', '#f0c060', 1.3), sound: 'summon' },
    ]
  }),
  hero({
    id: 'arc-warden', name: 'Arc Warden', title: 'Zet', attribute: 'agi', roles: ['carry', 'nuker'], region: 'mount-joerlak', palette: ['#65d8ff', '#1c2440', '#f6f0a8'], ranged: true, silhouette: { head: 'hood', weapon: 'staff', extras: ['cape'] },
    abilities: [
      { id: 'arc-flux', name: 'Flux', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.3, manaCost: [75, 80, 85, 90], cooldown: [16, 15, 14, 13], values: { dps: [25, 40, 55, 70], slow: [20, 28, 36, 44], duration: [5, 5, 5, 5] }, effects: [{ kind: 'status', status: 'slow', duration: 'duration', target: 'target', params: { moveSlowPct: 'slow', dotDps: 'dps', dotType: 'magical', tag: 'flux' } }], vfx: vfx('beam', '#65d8ff') },
      { id: 'arc-magnetic-field', name: 'Magnetic Field', targeting: 'ground-aoe', castRange: 900, castPoint: 0.3, manaCost: [50, 70, 90, 110], cooldown: [20, 18, 16, 14], values: { radius: [300, 325, 350, 375], duration: [5, 5, 5, 5], evasion: [20, 30, 40, 50], speed: [35, 50, 65, 80] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', tick: { interval: 1, affects: 'allies', effects: [{ kind: 'statmod', mods: { evasionPct: 'evasion', attackSpeed: 'speed' }, duration: 1.2, target: 'target' }] } } }], vfx: vfx('shield', '#f6f0a8') },
      { id: 'arc-spark-wraith', name: 'Spark Wraith', targeting: 'ground-aoe', castRange: 1200, castPoint: 0.25, manaCost: [80, 80, 80, 80], cooldown: [8, 7, 6, 5], values: { damage: [100, 160, 220, 280], radius: [220, 240, 260, 280], slow: [25, 30, 35, 40], duration: [4, 4, 4, 4] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', onEnter: { affects: 'enemies', windowSec: 1, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 2, target: 'target', params: { moveSlowPct: 'slow' } }] } } }], vfx: vfx('ground-aoe', '#65d8ff') },
      { id: 'arc-tempest-double', name: 'Tempest Double', targeting: 'no-target', ult: true, castPoint: 0.35, manaCost: [0, 0, 0], cooldown: [70, 60, 50], values: { duration: [16, 20, 24], damage: [25, 45, 65] }, effects: [{ kind: 'exotic', id: 'tempest-double', params: { heroId: 'arc-warden' } }, { kind: 'summon', summon: arcDouble, count: 1, at: 'self' }, { kind: 'statmod', mods: { damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('summon-pop', '#65d8ff', '#f6f0a8', 1.2), sound: 'summon' },
    ]
  }),
  hero({
    id: 'meepo', name: 'Meepo', title: 'Geomancer', attribute: 'agi', roles: ['carry', 'pusher'], region: 'mount-joerlak', palette: ['#78b85a', '#4a2a18', '#d8f0a0'], silhouette: { bodyShape: 'slim', head: 'bare', weapon: 'cleaver' },
    abilities: [
      { id: 'meepo-earthbind', name: 'Earthbind', targeting: 'skillshot', castRange: 900, castPoint: 0.25, manaCost: [70, 75, 80, 85], cooldown: [14, 12, 10, 8], values: { speed: [1200, 1200, 1200, 1200], root: [1.6, 1.9, 2.2, 2.5] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 220, range: 900, onHit: [{ kind: 'status', status: 'root', duration: 'root', target: 'target' }] } }], vfx: vfx('projectile', '#78b85a') },
      { id: 'meepo-poof', name: 'Poof', targeting: 'point-target', castRange: 700, castPoint: 0.6, manaCost: [80, 80, 80, 80], cooldown: [12, 10, 8, 6], values: { damage: [70, 110, 150, 190], radius: [300, 325, 350, 375], distance: [450, 525, 600, 675] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 'distance' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('global-mark', '#d8f0a0', '#78b85a', 1.1) },
      { id: 'meepo-ransack', name: 'Ransack', targeting: 'attack-modifier', values: { damage: [12, 22, 32, 42], lifesteal: [12, 18, 24, 30] }, attackMod: { procChance: 100, bonusDamage: 'damage', lifestealPct: 'lifesteal' }, vfx: vfx('shield', '#4a2a18') },
      { id: 'meepo-divided-we-stand', name: 'Divided We Stand', targeting: 'no-target', ult: true, castPoint: 0.4, manaCost: [100, 125, 150], cooldown: [90, 75, 60], values: { count: [1, 2, 3], duration: [24, 28, 32], damage: [20, 35, 50] }, effects: [{ kind: 'exotic', id: 'divided-we-stand', params: { heroId: 'meepo' } }, { kind: 'summon', summon: meepoClone, count: 'count', at: 'self' }, { kind: 'statmod', mods: { damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('summon-pop', '#78b85a', '#d8f0a0', 1.15), sound: 'summon' },
    ]
  }),
  hero({
    id: 'monkey-king', name: 'Monkey King', title: 'Sun Wukong', attribute: 'agi', roles: ['carry', 'escape', 'disabler'], region: 'hidden-wood', palette: ['#d8a048', '#4a2410', '#fff0a0'], silhouette: { head: 'mask', weapon: 'staff', extras: ['cape'] },
    abilities: [
      { id: 'mk-boundless-strike', name: 'Boundless Strike', targeting: 'skillshot', castRange: 900, castPoint: 0.35, manaCost: [90, 100, 110, 120], cooldown: [28, 24, 20, 16], values: { speed: [1600, 1600, 1600, 1600], damage: [120, 180, 240, 300], stun: [0.8, 1, 1.2, 1.4] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 180, range: 900, onHit: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }] } }], vfx: vfx('projectile', '#fff0a0') },
      { id: 'mk-tree-dance', name: 'Tree Dance + Primal Spring', targeting: 'point-target', castRange: 800, castPoint: 0.2, manaCost: [90, 95, 100, 105], cooldown: [18, 16, 14, 12], values: { distance: [500, 600, 700, 800], damage: [90, 150, 210, 270], radius: [300, 325, 350, 375], slow: [25, 30, 35, 40] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 'distance' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 2, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow' } }], vfx: vfx('global-mark', '#d8a048') },
      { id: 'mk-jingu-mastery', name: 'Jingu Mastery', targeting: 'attack-modifier', values: { bonus: [35, 55, 75, 95], lifesteal: [18, 24, 30, 36] }, attackMod: { procChance: 35, bonusDamage: 'bonus', lifestealPct: 'lifesteal' }, vfx: vfx('shield', '#fff0a0') },
      { id: 'mk-wukongs-command', name: "Wukong's Command", targeting: 'ground-aoe', ult: true, castRange: 700, castPoint: 0.5, manaCost: [100, 150, 200], cooldown: [110, 95, 80], values: { count: [4, 5, 6], duration: [12, 14, 16], radius: [500, 550, 600], damage: [40, 60, 80] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', auraMods: { affects: 'allies', mods: { damage: 'damage' } } } }, { kind: 'summon', summon: monkeySoldier, count: 'count', at: 'point' }], vfx: vfx('summon-pop', '#d8a048', '#fff0a0', 1.4), sound: 'summon' },
    ]
  }),
  hero({
    id: 'morphling', name: 'Morphling', title: 'Waveform Shifter', attribute: 'agi', roles: ['carry', 'escape'], region: 'shadeshore', palette: ['#5ad8ff', '#1b4a60', '#d8fbff'], ranged: true, silhouette: { build: 'blob', head: 'bare', weapon: 'none' },
    abilities: [
      { id: 'morph-waveform', name: 'Waveform', targeting: 'point-target', castRange: 900, castPoint: 0, manaCost: [115, 125, 135, 145], cooldown: [21, 18, 15, 12], values: { distance: [500, 625, 750, 875], damage: [90, 150, 210, 270], radius: [250, 275, 300, 325] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 'distance' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('global-mark', '#5ad8ff', '#d8fbff', 1.15) },
      { id: 'morph-adaptive-strike', name: 'Adaptive Strike', targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.25, manaCost: [100, 100, 100, 100], cooldown: [16, 14, 12, 10], values: { damage: [80, 140, 200, 260], knock: [180, 240, 300, 360], stun: [0.5, 0.8, 1.1, 1.4] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'displace', mode: 'knockback', target: 'target', toward: 'away-from-caster', distance: 'knock', speed: 900 }, { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }], vfx: vfx('projectile', '#d8fbff') },
      { id: 'morph-attribute-shift', name: 'Morph', targeting: 'no-target', castPoint: 0, manaCost: [30, 30, 30, 30], cooldown: [8, 7, 6, 5], values: { duration: [10, 10, 10, 10], agi: [8, 12, 16, 20], str: [-4, -6, -8, -10] }, effects: [{ kind: 'exotic', id: 'morph-shift', params: { heroId: 'morphling' } }, { kind: 'statmod', mods: { agi: 'agi', str: 'str', attackSpeed: 20 }, duration: 'duration', target: 'self' }], vfx: vfx('shield', '#5ad8ff') },
      { id: 'morph-replicate', name: 'Replicate', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 700, castPoint: 0.3, manaCost: [150, 150, 150], cooldown: [100, 85, 70], values: { duration: [18, 22, 26], damage: [60, 90, 120] }, effects: [{ kind: 'summon', summon: morphReplicate, count: 1, at: 'self' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }], vfx: vfx('summon-pop', '#5ad8ff', '#d8fbff') }
    ]
  }),
  hero({
    id: 'phantom-lancer', name: 'Phantom Lancer', title: 'Azwraith', attribute: 'agi', roles: ['carry', 'escape', 'pusher'], region: 'hidden-wood', palette: ['#4a8cff', '#18224a', '#d8e8ff'], silhouette: { head: 'helm', weapon: 'staff', extras: ['cape'] },
    abilities: [
      { id: 'pl-spirit-lance', name: 'Spirit Lance', targeting: 'unit-target', affects: 'enemy', castRange: 750, castPoint: 0.25, manaCost: [100, 110, 120, 130], cooldown: [10, 9, 8, 7], values: { damage: [100, 150, 200, 250], slow: [20, 25, 30, 35], duration: [4, 4, 4, 4] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 'duration', target: 'target', params: { moveSlowPct: 'slow' } }, { kind: 'summon', summon: lancerIllusion, count: 1, at: 'self' }], vfx: vfx('projectile', '#4a8cff') },
      { id: 'pl-doppelganger', name: 'Doppelganger', targeting: 'point-target', castRange: 600, castPoint: 0.1, manaCost: [50, 50, 50, 50], cooldown: [22, 19, 16, 13], values: { distance: [350, 425, 500, 575], duration: [8, 8, 8, 8], count: [1, 1, 2, 2] }, effects: [{ kind: 'purge', target: 'self' }, { kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 'distance' }, { kind: 'summon', summon: lancerIllusion, count: 'count', at: 'self' }], vfx: vfx('summon-pop', '#d8e8ff') },
      { id: 'pl-phantom-rush', name: 'Phantom Rush', targeting: 'attack-modifier', values: { bonus: [20, 35, 50, 65], slow: [12, 16, 20, 24] }, attackMod: { procChance: 40, bonusDamage: 'bonus', procStatus: { status: 'slow', duration: 1.4, params: { moveSlowPct: 'slow' } } }, vfx: vfx('shield', '#18224a') },
      { id: 'pl-juxtapose', name: 'Juxtapose', targeting: 'no-target', ult: true, castPoint: 0.2, manaCost: [75, 100, 125], cooldown: [85, 70, 55], values: { count: [3, 4, 5], duration: [18, 22, 26], damage: [20, 35, 50] }, effects: [{ kind: 'summon', summon: lancerIllusion, count: 'count', at: 'self' }, { kind: 'statmod', mods: { damage: 'damage' }, duration: 'duration', target: 'self' }], vfx: vfx('summon-pop', '#4a8cff', '#d8e8ff', 1.25), sound: 'summon' },
    ]
  }),
  hero({
    id: 'rubick', name: 'Rubick', title: 'Grand Magus', attribute: 'int', roles: ['support', 'disabler', 'nuker'], region: 'quoidge', palette: ['#7ad85a', '#204020', '#d8ffd0'], ranged: true, silhouette: { bodyShape: 'robed', head: 'hood', weapon: 'staff', extras: ['cape'] },
    abilities: [
      { id: 'rubick-telekinesis', name: 'Telekinesis', targeting: 'unit-target', affects: 'enemy', castRange: 650, castPoint: 0.25, manaCost: [110, 115, 120, 125], cooldown: [22, 20, 18, 16], values: { damage: [60, 100, 140, 180], lift: [1, 1.2, 1.4, 1.6], radius: [250, 275, 300, 325] }, effects: [{ kind: 'status', status: 'cyclone', duration: 'lift', target: 'target' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 0.5, target: 'enemies-in-radius', radius: 'radius' }], vfx: vfx('stun-stars', '#7ad85a') },
      { id: 'rubick-fade-bolt', name: 'Fade Bolt', targeting: 'unit-target', affects: 'enemy', castRange: 800, castPoint: 0.25, manaCost: [110, 120, 130, 140], cooldown: [16, 14, 12, 10], values: { damage: [90, 140, 190, 240], reduction: [-10, -15, -20, -25] }, effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 1100, bounces: { count: 4, radius: 450 }, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'statmod', mods: { damagePct: 'reduction' }, duration: 6, target: 'target' }] } }], vfx: vfx('chain', '#7ad85a') },
      { id: 'rubick-arcane-supremacy', name: 'Arcane Supremacy', targeting: 'passive', values: { damage: [0, 0, 0, 0] }, passiveMods: { spellAmpPct: 14, castRange: 110 }, vfx: vfx('shield', '#d8ffd0') },
      { id: 'rubick-spell-steal', name: 'Spell Steal', targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 900, castPoint: 0.15, manaCost: [25, 25, 25], cooldown: [70, 55, 40], values: { duration: [14, 18, 22], damage: [160, 240, 320] }, effects: [{ kind: 'exotic', id: 'spell-steal', params: { heroId: 'rubick' } }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'statmod', mods: { spellAmpPct: 18, castRange: 120 }, duration: 'duration', target: 'self' }], vfx: vfx('global-mark', '#7ad85a', '#d8ffd0', 1.2), sound: 'void' },
    ]
  }),
  hero({
    id: 'brewmaster', name: 'Brewmaster', title: 'Mangix', attribute: 'uni', roles: ['initiator', 'durable', 'carry'], region: 'mount-joerlak', palette: ['#d8a048', '#3a2410', '#70c8ff'], silhouette: { build: 'brute', bodyShape: 'bulky', head: 'bare', weapon: 'totem' },
    abilities: [
      { id: 'brew-thunder-clap', name: 'Thunder Clap', targeting: 'no-target', castPoint: 0.25, manaCost: [90, 100, 110, 120], cooldown: [16, 14, 12, 10], values: { damage: [90, 150, 210, 270], radius: [400, 425, 450, 475], slow: [25, 35, 45, 55] }, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 4, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow', attackSlowPct: 'slow' } }], vfx: vfx('storm', '#70c8ff') },
      { id: 'brew-cinder-brew', name: 'Cinder Brew', targeting: 'ground-aoe', castRange: 850, castPoint: 0.25, manaCost: [50, 60, 70, 80], cooldown: [17, 15, 13, 11], values: { damage: [20, 35, 50, 65], radius: [300, 325, 350, 375], duration: [5, 5, 5, 5], slow: [18, 22, 26, 30] }, effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 1.2, target: 'target', params: { moveSlowPct: 'slow' } }] } } }], vfx: vfx('ground-aoe', '#d8a048') },
      { id: 'brew-drunken-brawler', name: 'Drunken Brawler', targeting: 'attack-modifier', values: { crit: [150, 180, 210, 240], evasion: [10, 15, 20, 25] }, passiveMods: { evasionPct: 'evasion' }, attackMod: { critChance: 20, critMult: 'crit' }, vfx: vfx('shield', '#3a2410') },
      { id: 'brew-primal-split', name: 'Primal Split', targeting: 'no-target', ult: true, castPoint: 0.5, manaCost: [125, 150, 175], cooldown: [120, 105, 90], values: { duration: [16, 18, 20], damage: [20, 35, 50] }, effects: [{ kind: 'exotic', id: 'primal-split', params: { heroId: 'brewmaster' } }, { kind: 'status', status: 'cyclone', duration: 'duration', target: 'self' }, { kind: 'summon', summon: earthBrewling, count: 1, at: 'self' }, { kind: 'summon', summon: stormBrewling, count: 1, at: 'self' }, { kind: 'summon', summon: fireBrewling, count: 1, at: 'self' }], vfx: vfx('summon-pop', '#d8a048', '#70c8ff', 1.35), sound: 'roar' },
    ]
  }),
  hero({
    id: 'techies', name: 'Techies', title: 'Squee, Spleen, and Spoon', attribute: 'uni', roles: ['nuker', 'disabler'], region: 'vile-reaches', palette: ['#ff8a2f', '#304030', '#f0f060'], ranged: true, silhouette: { build: 'brute', bodyShape: 'bulky', head: 'helm', weapon: 'rifle' },
    abilities: [
      { id: 'techies-sticky-bomb', name: 'Sticky Bomb', targeting: 'skillshot', castRange: 900, castPoint: 0.25, manaCost: [100, 105, 110, 115], cooldown: [13, 11, 9, 7], values: { speed: [850, 850, 850, 850], damage: [90, 150, 210, 270], slow: [25, 30, 35, 40] }, effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 180, range: 900, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }, { kind: 'status', status: 'slow', duration: 2, target: 'target', params: { moveSlowPct: 'slow' } }] } }], vfx: vfx('projectile', '#ff8a2f') },
      { id: 'techies-reactive-tazer', name: 'Reactive Tazer', targeting: 'no-target', castPoint: 0, manaCost: [60, 70, 80, 90], cooldown: [28, 24, 20, 16], values: { duration: [6, 6, 6, 6], speed: [18, 22, 26, 30] }, effects: [{ kind: 'statmod', mods: { moveSpeedPct: 'speed', evasionPct: 35 }, duration: 'duration', target: 'self' }, { kind: 'status', status: 'disarm', duration: 1.5, target: 'enemies-in-radius', radius: 300 }], vfx: vfx('shield', '#f0f060') },
      { id: 'techies-blast-off', name: 'Blast Off', targeting: 'point-target', castRange: 900, castPoint: 0.35, manaCost: [100, 125, 150, 175], cooldown: [35, 30, 25, 20], values: { distance: [500, 625, 750, 875], damage: [160, 220, 280, 340], radius: [300, 325, 350, 375], silence: [2.5, 3, 3.5, 4] }, effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 'distance' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'silence', duration: 'silence', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'damage', dtype: 'pure', amount: 110, target: 'self' }], vfx: vfx('global-mark', '#ff8a2f') },
      { id: 'techies-proximity-mines', name: 'Proximity Mines', targeting: 'ground-aoe', ult: true, castRange: 900, castPoint: 0.45, manaCost: [110, 140, 170], cooldown: [28, 22, 16], values: { damage: [280, 420, 560], radius: [360, 390, 420], duration: [20, 24, 28] }, effects: [{ kind: 'exotic', id: 'remote-mines', params: { heroId: 'techies' } }], vfx: vfx('mine', '#ff8a2f', '#f0f060', 1.05) }
    ]
  })
];
