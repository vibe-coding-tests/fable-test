import type { HeroDef } from '../../core/types';

export const AXE: HeroDef = {
  id: 'axe',
  name: 'Axe',
  title: 'Mogul Khan',
  attribute: 'str',
  roles: ['initiator', 'durable', 'disabler'],
  region: 'tranquil-vale',
  lore: 'A one-man army who considers strategy a polite word for being first into the fight.',
  baseStats: {
    str: 25, agi: 20, int: 18,
    strGain: 2.8, agiGain: 2.0, intGain: 1.6,
    baseDamage: 31,
    baseArmor: 1,
    attackRange: 150,
    attackPoint: 0.5,
    baseAttackTime: 1.7,
    moveSpeed: 315,
    turnRate: 0.6,
    hpRegen: 3.5,
    manaRegen: 1.5
  },
  skillOrder: [0, 2, 1],
  abilities: [
    {
      id: 'axe-berserkers-call',
      name: "Berserker's Call",
      lore: 'Axe asks a question everyone nearby must answer with their face.',
      targeting: 'no-target',
      castPoint: 0.3,
      manaCost: [80, 90, 100, 110],
      cooldown: [17, 15, 13, 11],
      values: {
        radius: [315, 315, 315, 315],
        duration: [1.8, 2.2, 2.6, 3.0],
        armor: [12, 13, 14, 15]
      },
      effects: [
        { kind: 'status', status: 'taunt', duration: 'duration', target: 'enemies-in-radius', radius: 'radius' },
        { kind: 'statmod', mods: { armor: 'armor' }, duration: 'duration', target: 'self' }
      ],
      vfx: { archetype: 'ground-aoe', color: '#d94a32', color2: '#ffb35c', scale: 0.9 },
      anim: 'ground-slam',
      sound: 'roar'
    },
    {
      id: 'axe-battle-hunger',
      name: 'Battle Hunger',
      lore: 'Axe names a coward, and the wound keeps arguing.',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 700,
      castPoint: 0.3,
      manaCost: [50, 60, 70, 80],
      cooldown: [20, 15, 10, 5],
      values: {
        duration: [12, 12, 12, 12],
        dps: [16, 24, 32, 40],
        slow: [11, 19, 27, 35]
      },
      effects: [
        { kind: 'status', status: 'buff', duration: 'duration', target: 'target', params: { dotDps: 'dps', dotType: 'magical', tag: 'axe-battle-hunger-dot' } },
        { kind: 'status', status: 'slow', duration: 'duration', target: 'target', params: { moveSlowPct: 'slow', tag: 'axe-battle-hunger-slow' } }
      ],
      vfx: { archetype: 'global-mark', color: '#d94a32', scale: 0.7 },
      anim: 'melee-swing',
      sound: 'roar'
    },
    {
      id: 'axe-counter-helix',
      name: 'Counter Helix',
      lore: 'Hit Axe and learn that circles have consequences.',
      targeting: 'passive',
      values: {
        damage: [95, 120, 145, 170],
        radius: [300, 300, 300, 300]
      },
      triggers: [
        {
          on: 'on-damage-taken',
          cooldown: 0.35,
          effects: [{ kind: 'damage', dtype: 'pure', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }]
        }
      ],
      vfx: { archetype: 'storm', color: '#c63c2c', color2: '#ffb35c', scale: 0.6 },
      anim: 'melee-swing',
      sound: 'blade'
    },
    {
      id: 'axe-culling-blade',
      name: 'Culling Blade',
      lore: 'Axe does not finish fights. Axe decides they were already over.',
      targeting: 'unit-target',
      affects: 'enemy',
      ult: true,
      castRange: 175,
      castPoint: 0.3,
      manaCost: [60, 120, 180],
      cooldown: [75, 65, 55],
      values: {
        damage: [250, 350, 450],
        move: [20, 25, 30],
        radius: [900, 900, 900],
        duration: [6, 6, 6]
      },
      effects: [
        { kind: 'damage', dtype: 'pure', amount: 'damage', target: 'target' },
        { kind: 'statmod', mods: { moveSpeedPct: 'move' }, duration: 'duration', target: 'allies-in-radius', radius: 'radius' }
      ],
      vfx: { archetype: 'beam', color: '#ff382d', color2: '#ffd27f', scale: 1.1 },
      anim: 'melee-swing',
      sound: 'blade'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'axe-t10a', name: '+8 Strength', mods: { str: 8 } },
        { id: 'axe-t10b', name: '+10 Battle Hunger DPS', abilityOverride: { abilityId: 'axe-battle-hunger', valueKey: 'dps', mode: 'add', amount: 10 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'axe-t15a', name: '+25 Counter Helix damage', abilityOverride: { abilityId: 'axe-counter-helix', valueKey: 'damage', mode: 'add', amount: 25 } },
        { id: 'axe-t15b', name: '+150 Culling Blade range', mods: { castRange: 150 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'axe-t20a', name: '+0.4s Berserker Call', abilityOverride: { abilityId: 'axe-berserkers-call', valueKey: 'duration', mode: 'add', amount: 0.4 } },
        { id: 'axe-t20b', name: '+120 Battle Hunger cast range', mods: { castRange: 120 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'axe-t25a', name: '+100 Culling Blade damage', abilityOverride: { abilityId: 'axe-culling-blade', valueKey: 'damage', mode: 'add', amount: 100 } },
        { id: 'axe-t25b', name: '+120 Berserker Call radius', abilityOverride: { abilityId: 'axe-berserkers-call', valueKey: 'radius', mode: 'add', amount: 120 } }
      ]
    }
  ],
  facets: [
    {
      id: 'axe-facet-red-mist',
      name: 'Red Mist',
      description: 'Counter Helix hits harder.',
      abilityValueOverride: { abilityId: 'axe-counter-helix', valueKey: 'damage', mode: 'add', amount: 15 }
    },
    {
      id: 'axe-facet-war-call',
      name: 'War Call',
      description: "Berserker's Call reaches farther.",
      abilityValueOverride: { abilityId: 'axe-berserkers-call', valueKey: 'radius', mode: 'add', amount: 45 }
    }
  ],
  aghanim: {
    name: 'One Man Army',
    description: 'Battle Hunger and Counter Helix become stronger in crowds.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'axe-battle-hunger', valueKey: 'dps', mode: 'add', amount: 18 },
        { abilityId: 'axe-counter-helix', valueKey: 'damage', mode: 'add', amount: 45 },
        { abilityId: 'axe-counter-helix', valueKey: 'radius', mode: 'add', amount: 80 }
      ],
      cooldownAdds: [{ abilityId: 'axe-berserkers-call', amount: -3 }]
    },
    shard: {
      mods: { damageTakenReductionPct: 6 },
      abilityValueOverrides: [
        { abilityId: 'axe-berserkers-call', valueKey: 'armor', mode: 'add', amount: 6 },
        { abilityId: 'axe-battle-hunger', valueKey: 'slow', mode: 'add', amount: 10 }
      ]
    }
  },
  silhouette: { build: 'brute', scale: 1.12, bodyShape: 'bulky', head: 'horned', weapon: 'cleaver', extras: ['shoulderpads', 'belt', 'horns'] },
  palette: ['#b32621', '#5b2a22', '#ffb34d'],
  barks: [
    'Axe is not missing. Enemies are poorly arranged.',
    'Planning is what happens before Axe arrives.',
    'You brought friends? Good. Axe was worried.',
    'Armor is just skin with ambition.',
    'Axe accepts your surrender after the shouting.',
    'The blade voted yes.'
  ],
  bounty: { xp: 340, gold: 230 },
  recruitmentQuestId: 'recruit-axe',
  animProfile: { rig: 'brute', castStyle: 'weapon', voiceTimbre: 'low' }
};
