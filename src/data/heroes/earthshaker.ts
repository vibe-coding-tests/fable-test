import type { HeroDef } from '../../core/types';

export const EARTHSHAKER: HeroDef = {
  id: 'earthshaker',
  name: 'Earthshaker',
  title: 'Raigor Stonehoof',
  attribute: 'str',
  roles: ['initiator', 'disabler', 'nuker'],
  region: 'tranquil-vale',
  lore: 'Born of the earth and loyal to it, Raigor walks the vale listening for the Mad Moon fragments grinding under the soil.',
  baseStats: {
    str: 22, agi: 12, int: 18,
    strGain: 3.2, agiGain: 1.4, intGain: 1.8,
    baseDamage: 36,
    baseArmor: 1,
    attackRange: 150,
    attackPoint: 0.47,
    baseAttackTime: 1.7,
    moveSpeed: 300,
    turnRate: 0.6,
    hpRegen: 3.5,
    manaRegen: 1.5
  },
  skillOrder: [0, 2, 1],
  combo: [{ before: 'es-fissure', after: 'es-echo-slam', windowSec: 4, weight: 1.55 }],
  abilities: [
    {
      id: 'es-fissure',
      name: 'Fissure',
      lore: 'The earth opens where he points, and holds its grudge for a while.',
      targeting: 'point-target',
      castRange: 1200,
      castPoint: 0.45,
      manaCost: [130, 140, 150, 160],
      cooldown: [16, 15, 14, 13],
      values: {
        damage: [110, 160, 210, 260],
        stun: [1.0, 1.2, 1.4, 1.6],
        length: [1200, 1200, 1200, 1200],
        width: [110, 110, 110, 110],
        wallDur: [6.5, 6.5, 6.5, 6.5]
      },
      effects: [
        {
          kind: 'zone',
          at: 'line-to-point',
          zone: {
            shape: 'line',
            length: 'length',
            width: 'width',
            duration: 'wallDur',
            wall: true,
            onEnter: {
              affects: 'enemies',
              windowSec: 0.25,
              effects: [
                { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' },
                { kind: 'status', status: 'stun', duration: 'stun', target: 'target' }
              ]
            }
          }
        }
      ],
      vfx: { archetype: 'wall', color: '#a9743c', color2: '#5e4022', scale: 1 },
      anim: 'ground-slam',
      sound: 'impact'
    },
    {
      id: 'es-enchant-totem',
      name: 'Enchant Totem',
      lore: 'The totem remembers being a mountain.',
      targeting: 'no-target',
      castPoint: 0.1,
      manaCost: [35, 40, 45, 50],
      cooldown: [5, 5, 5, 5],
      values: {
        bonusPct: [100, 200, 300, 400],
        duration: [14, 14, 14, 14]
      },
      effects: [
        {
          kind: 'status', status: 'buff', duration: 'duration', target: 'self',
          params: {
            attackMod: { bonusDamagePct: 'bonusPct' },
            consumeOnAttack: true,
            tag: 'es-totem-charge'
          }
        }
      ],
      vfx: { archetype: 'shield', color: '#e8b15c', color2: '#a9743c', scale: 0.8 },
      anim: 'ground-slam',
      sound: 'impact'
    },
    {
      id: 'es-aftershock',
      name: 'Aftershock',
      lore: 'When Raigor casts, the ground flinches.',
      targeting: 'passive',
      values: {
        damage: [70, 100, 130, 160],
        stun: [0.6, 0.8, 1.0, 1.2],
        radius: [350, 350, 350, 350]
      },
      triggers: [
        {
          on: 'on-cast',
          effects: [
            { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
            { kind: 'status', status: 'stun', duration: 'stun', target: 'enemies-in-radius', radius: 'radius' }
          ]
        }
      ],
      vfx: { archetype: 'ground-aoe', color: '#a9743c', scale: 0.7 },
      anim: 'ground-slam',
      sound: 'impact'
    },
    {
      id: 'es-echo-slam',
      name: 'Echo Slam',
      lore: 'One blow, and the earth answers once for every heartbeat in range.',
      targeting: 'no-target',
      ult: true,
      castPoint: 0.5,
      manaCost: [145, 205, 265],
      cooldown: [120, 110, 100],
      values: {
        base: [120, 180, 240],
        echo: [70, 95, 120],
        radius: [650, 650, 650]
      },
      effects: [
        {
          kind: 'damage', dtype: 'magical', amount: 'base', perUnitBonus: 'echo',
          target: 'enemies-in-radius', radius: 'radius'
        },
        {
          kind: 'status', status: 'slow', duration: 2, target: 'enemies-in-radius', radius: 'radius',
          params: { moveSlowPct: 30, tag: 'es-echo-slow' }
        }
      ],
      vfx: { archetype: 'ground-aoe', color: '#e8b15c', color2: '#5e4022', scale: 1.6 },
      anim: 'ground-slam',
      sound: 'impact'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'es-t10a', name: '+50 Fissure damage', abilityOverride: { abilityId: 'es-fissure', valueKey: 'damage', mode: 'add', amount: 50 } },
        { id: 'es-t10b', name: '+250 Mana', mods: { maxMana: 250 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'es-t15a', name: '+30 Aftershock damage', abilityOverride: { abilityId: 'es-aftershock', valueKey: 'damage', mode: 'add', amount: 30 } },
        { id: 'es-t15b', name: '+7 Armor during Enchant Totem', mods: { armor: 3 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'es-t20a', name: '+0.5s Fissure stun', abilityOverride: { abilityId: 'es-fissure', valueKey: 'stun', mode: 'add', amount: 0.5 } },
        { id: 'es-t20b', name: '+400 Fissure length', abilityOverride: { abilityId: 'es-fissure', valueKey: 'length', mode: 'add', amount: 400 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'es-t25a', name: '+50 Echo Slam echo damage', abilityOverride: { abilityId: 'es-echo-slam', valueKey: 'echo', mode: 'add', amount: 50 } },
        { id: 'es-t25b', name: '-30s Echo Slam cooldown', cooldownAdd: { abilityId: 'es-echo-slam', amount: -30 } }
      ]
    }
  ],
  facets: [
    {
      id: 'es-facet-tremor',
      name: 'Tremor',
      description: 'Aftershock reaches further (+75 radius).',
      abilityValueOverride: { abilityId: 'es-aftershock', valueKey: 'radius', mode: 'add', amount: 75 }
    },
    {
      id: 'es-facet-canyon',
      name: 'Canyon Maker',
      description: 'Fissure walls last 2 seconds longer.',
      abilityValueOverride: { abilityId: 'es-fissure', valueKey: 'wallDur', mode: 'add', amount: 2 }
    }
  ],
  aghanim: {
    name: 'Echo of Echoes',
    description: 'Echo Slam echoes harder; Shard makes Fissure and Aftershock more punishing.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'es-echo-slam', valueKey: 'base', mode: 'add', amount: 90 },
        { abilityId: 'es-echo-slam', valueKey: 'echo', mode: 'add', amount: 45 },
        { abilityId: 'es-echo-slam', valueKey: 'radius', mode: 'add', amount: 120 }
      ],
      cooldownAdds: [{ abilityId: 'es-echo-slam', amount: -22 }]
    },
    shard: {
      abilityValueOverrides: [
        { abilityId: 'es-fissure', valueKey: 'wallDur', mode: 'add', amount: 2 },
        { abilityId: 'es-aftershock', valueKey: 'radius', mode: 'add', amount: 80 },
        { abilityId: 'es-aftershock', valueKey: 'damage', mode: 'add', amount: 35 }
      ]
    }
  },
  silhouette: { build: 'brute', scale: 1.15, bodyShape: 'bulky', head: 'horned', weapon: 'totem', extras: ['shoulderpads'] },
  palette: ['#5b8cc8', '#a9743c', '#e8b15c'],
  barks: [
    'Listen. The ground is telling me where you stand.',
    'Stone keeps every promise it makes.',
    'The moon broke the sky. The earth holds anyway.',
    'Walk softly. The vale is sleeping under us.',
    'Crowd together. The echo loves company.',
    'My totem and I have an understanding: I swing, it sings.'
  ],
  bounty: { xp: 320, gold: 210 },
  recruitmentQuestId: 'recruit-earthshaker',
  animProfile: { rig: 'brute', castStyle: 'weapon', voiceTimbre: 'low' }
};
