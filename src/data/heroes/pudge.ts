import type { HeroDef } from '../../core/types';

export const PUDGE: HeroDef = {
  id: 'pudge',
  name: 'Pudge',
  title: 'The Butcher of the Vile Reaches',
  attribute: 'str',
  roles: ['disabler', 'durable', 'initiator'],
  region: 'tranquil-vale',
  lore: 'He wandered down from the Reaches following a smell only he could name. The vale tolerates him because his hook points the right way.',
  baseStats: {
    str: 25, agi: 14, int: 16,
    strGain: 3.6, agiGain: 1.4, intGain: 1.5,
    baseDamage: 34,
    baseArmor: 0,
    attackRange: 150,
    attackPoint: 0.5,
    baseAttackTime: 1.7,
    moveSpeed: 280,
    turnRate: 0.7,
    hpRegen: 3.5,
    manaRegen: 1.5
  },
  skillOrder: [0, 1, 2],
  abilities: [
    {
      id: 'pudge-meat-hook',
      name: 'Meat Hook',
      lore: 'The chain sings going out. It gurgles coming back.',
      targeting: 'skillshot',
      castRange: 1300,
      castPoint: 0.3,
      manaCost: [110, 120, 130, 140],
      cooldown: [16, 14, 12, 10],
      values: {
        damage: [90, 180, 270, 360],
        range: [1300, 1300, 1300, 1300],
        speed: [1450, 1450, 1450, 1450],
        width: [100, 100, 100, 100]
      },
      effects: [
        {
          kind: 'projectile',
          to: 'point',
          proj: {
            model: 'linear',
            speed: 'speed',
            width: 'width',
            range: 'range',
            disjointable: false,
            onHit: [
              { kind: 'damage', dtype: 'pure', amount: 'damage', target: 'target' },
              { kind: 'displace', mode: 'pull', target: 'target', speed: 1600 }
            ]
          }
        }
      ],
      vfx: { archetype: 'hook', color: '#b8442c', color2: '#6e6e6e', scale: 1 },
      anim: 'ranged-shot',
      sound: 'impact'
    },
    {
      id: 'pudge-rot',
      name: 'Rot',
      lore: 'He does not mind the smell. The smell is the weapon.',
      targeting: 'toggle',
      values: {
        dps: [30, 50, 70, 90],
        slowMs: [11, 14, 17, 20],
        radius: [250, 250, 250, 250],
        selfDps: [30, 50, 70, 90]
      },
      toggle: {
        interval: 0.25,
        selfDamagePerSec: 'selfDps',
        effects: [
          { kind: 'damage', dtype: 'magical', amount: 12.5, target: 'enemies-in-radius', radius: 'radius' },
          { kind: 'status', status: 'slow', duration: 0.6, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slowMs', tag: 'pudge-rot-slow' } }
        ]
      },
      vfx: { archetype: 'ground-aoe', color: '#79a32e', color2: '#3f5b14', scale: 0.6 },
      anim: 'ground-slam',
      sound: 'impact'
    },
    {
      id: 'pudge-flesh-heap',
      name: 'Flesh Heap',
      lore: 'Everything that dies near Pudge becomes, regrettably, more Pudge.',
      targeting: 'passive',
      values: {
        resist: [6, 8, 10, 12],
        stackStr: [0.9, 1.2, 1.5, 1.8],
        radius: [450, 450, 450, 450]
      },
      passiveMods: { magicResistPct: 'resist' },
      triggers: [
        { on: 'on-nearby-death', radius: 'radius', statStack: { mods: { str: 'stackStr' } } }
      ],
      vfx: { archetype: 'shield', color: '#c98b8b', scale: 0.5 },
      anim: 'melee-swing',
      sound: 'impact'
    },
    {
      id: 'pudge-dismember',
      name: 'Dismember',
      lore: 'A conversation Pudge always wins.',
      targeting: 'unit-target',
      affects: 'enemy',
      ult: true,
      castRange: 180,
      castPoint: 0.2,
      manaCost: [100, 130, 170],
      cooldown: [30, 25, 20],
      channel: {
        duration: 'duration',
        tick: {
          interval: 0.25,
          effects: [
            { kind: 'damage', dtype: 'magical', amount: 'dpsTick', target: 'target' },
            { kind: 'heal', amount: 'dpsTick', target: 'self' },
            { kind: 'status', status: 'stun', duration: 0.4, target: 'target', params: { tag: 'pudge-dismember-hold' } }
          ]
        }
      },
      values: {
        duration: [3, 3, 3],
        dpsTick: [20, 30, 40]
      },
      effects: [
        { kind: 'status', status: 'stun', duration: 0.55, target: 'target', params: { tag: 'pudge-dismember-hold' } }
      ],
      vfx: { archetype: 'channel', color: '#d14f4f', color2: '#79a32e', scale: 1 },
      anim: 'channel-loop',
      sound: 'impact'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'pudge-t10a', name: '+30 Rot DPS', abilityOverride: { abilityId: 'pudge-rot', valueKey: 'dps', mode: 'add', amount: 30 } },
        { id: 'pudge-t10b', name: '+4 Armor', mods: { armor: 4 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'pudge-t15a', name: '+90 Meat Hook damage', abilityOverride: { abilityId: 'pudge-meat-hook', valueKey: 'damage', mode: 'add', amount: 90 } },
        { id: 'pudge-t15b', name: '+0.5 Flesh Heap stack strength', abilityOverride: { abilityId: 'pudge-flesh-heap', valueKey: 'stackStr', mode: 'add', amount: 0.5 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'pudge-t20a', name: '+250 Meat Hook range', abilityOverride: { abilityId: 'pudge-meat-hook', valueKey: 'range', mode: 'add', amount: 250 } },
        { id: 'pudge-t20b', name: '+1s Dismember duration', abilityOverride: { abilityId: 'pudge-dismember', valueKey: 'duration', mode: 'add', amount: 1 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'pudge-t25a', name: '+80 Dismember damage per second', abilityOverride: { abilityId: 'pudge-dismember', valueKey: 'dpsTick', mode: 'add', amount: 20 } },
        { id: 'pudge-t25b', name: '-4s Meat Hook cooldown', cooldownAdd: { abilityId: 'pudge-meat-hook', amount: -4 } }
      ]
    }
  ],
  facets: [
    {
      id: 'pudge-facet-freshmeat',
      name: 'Fresh Meat',
      description: 'Flesh Heap gathers strength from farther away (+150 radius).',
      abilityValueOverride: { abilityId: 'pudge-flesh-heap', valueKey: 'radius', mode: 'add', amount: 150 }
    },
    {
      id: 'pudge-facet-longchain',
      name: 'Long Chain',
      description: 'Meat Hook flies 200 units farther.',
      abilityValueOverride: { abilityId: 'pudge-meat-hook', valueKey: 'range', mode: 'add', amount: 200 }
    }
  ],
  aghanim: {
    name: 'Meat Shield',
    description: 'Dismember and Rot become stronger front-line tools.',
    implemented: true,
    scepter: {
      mods: { damageTakenReductionPct: 8 },
      abilityValueOverrides: [
        { abilityId: 'pudge-dismember', valueKey: 'duration', mode: 'add', amount: 1 },
        { abilityId: 'pudge-dismember', valueKey: 'dpsTick', mode: 'add', amount: 30 }
      ],
      cooldownAdds: [{ abilityId: 'pudge-dismember', amount: -15 }]
    },
    shard: {
      abilityValueOverrides: [
        { abilityId: 'pudge-meat-hook', valueKey: 'range', mode: 'add', amount: 250 },
        { abilityId: 'pudge-rot', valueKey: 'slow', mode: 'add', amount: 8 }
      ]
    }
  },
  silhouette: { build: 'brute', scale: 1.25, bodyShape: 'bulky', head: 'bare', weapon: 'hook', extras: ['belt'] },
  palette: ['#7a9b3a', '#d8a39b', '#8a4b2f'],
  barks: [
    'Fresh meat! Well. Meat, anyway.',
    'Come closer. The hook hates long goodbyes.',
    'They call it a diet. I call it a waiting list.',
    'The vale smells too clean. I am fixing it.',
    'Hooked, cooked, and... no, that is the whole list.',
    'Stand still. This is the gentle part.'
  ],
  bounty: { xp: 320, gold: 210 },
  recruitmentQuestId: 'recruit-pudge',
  animProfile: { rig: 'brute', castStyle: 'weapon', voiceTimbre: 'low' }
};
