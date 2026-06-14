import type { HeroDef } from '../../core/types';

export const JUGGERNAUT: HeroDef = {
  id: 'juggernaut',
  name: 'Juggernaut',
  title: 'Yurnero the Bladeform',
  attribute: 'agi',
  roles: ['carry', 'pusher', 'escape'],
  region: 'tranquil-vale',
  lore: 'A masked swordsman of the drowned Isle of Masks, sworn to a blade-dance no fragment of the Mad Moon can interrupt.',
  baseStats: {
    str: 20, agi: 28, int: 16,
    strGain: 2.4, agiGain: 2.8, intGain: 1.6,
    baseDamage: 32,
    baseArmor: 2,
    attackRange: 150,
    attackPoint: 0.33,
    baseAttackTime: 1.4,
    moveSpeed: 305,
    turnRate: 0.6,
    hpRegen: 2.5,
    manaRegen: 1.5
  },
  skillOrder: [0, 2, 1],
  abilities: [
    {
      id: 'jug-blade-fury',
      name: 'Blade Fury',
      lore: 'The blade spins faster than spells can follow.',
      targeting: 'no-target',
      castPoint: 0,
      manaCost: [120, 110, 100, 90],
      cooldown: [26, 22, 18, 14],
      values: {
        dpsTick: [21.25, 27.5, 33.75, 40],
        duration: [5, 5, 5, 5],
        radius: [260, 260, 260, 260]
      },
      effects: [
        { kind: 'status', status: 'magic-immune', duration: 'duration', target: 'self' },
        {
          kind: 'zone',
          at: 'self',
          follow: true,
          zone: {
            shape: 'circle',
            radius: 'radius',
            duration: 'duration',
            tick: {
              interval: 0.25,
              affects: 'enemies',
              effects: [{ kind: 'damage', dtype: 'magical', amount: 'dpsTick', target: 'target' }]
            }
          }
        },
        { kind: 'statmod', mods: { moveSpeedPct: 10 }, duration: 'duration', target: 'self' }
      ],
      vfx: { archetype: 'storm', color: '#9fe8ff', color2: '#e8fbff', scale: 0.6 },
      anim: 'melee-swing',
      sound: 'blade'
    },
    {
      id: 'jug-healing-ward',
      name: 'Healing Ward',
      lore: 'A relic of the Isle: it sings, and wounds close.',
      targeting: 'no-target',
      castPoint: 0.3,
      manaCost: [120, 125, 130, 135],
      cooldown: [60, 60, 60, 60],
      values: {
        healPct: [2, 3, 4, 5],
        lifetime: [25, 25, 25, 25]
      },
      effects: [
        {
          kind: 'summon',
          at: 'self',
          summon: {
            id: 'jug-ward',
            name: 'Healing Ward',
            lifetime: 'lifetime',
            cannotAttack: true,
            stats: { maxHp: 75, damage: 0, armor: 0, moveSpeed: 420, attackRange: 0, baseAttackTime: 2 },
            abilities: [
              {
                id: 'jug-ward-aura',
                name: 'Restorative Pulse',
                targeting: 'aura',
                aura: { radius: 500, affects: 'allies', mods: { hpRegenPctMax: 3.5 } },
                vfx: { archetype: 'shield', color: '#b7ffd9' }
              }
            ],
            silhouette: { build: 'ward', scale: 0.5 },
            palette: ['#2da05c', '#b7ffd9', '#e7d9a8']
          }
        }
      ],
      vfx: { archetype: 'summon-pop', color: '#7dffb5', scale: 0.7 },
      anim: 'summon-gesture',
      sound: 'heal'
    },
    {
      id: 'jug-blade-dance',
      name: 'Blade Dance',
      lore: 'Every cut is a verse of the old island hymn.',
      targeting: 'passive',
      values: {
        critChance: [20, 25, 30, 35],
        critMult: [180, 180, 180, 180]
      },
      attackMod: { critChance: 'critChance', critMult: 'critMult' },
      vfx: { archetype: 'shield', color: '#ff5b5b', scale: 0.4 },
      anim: 'melee-swing',
      sound: 'blade'
    },
    {
      id: 'jug-omnislash',
      name: 'Omnislash',
      lore: 'For three breaths, Yurnero is everywhere a sword can be.',
      targeting: 'unit-target',
      affects: 'enemy',
      ult: true,
      castRange: 350,
      castPoint: 0.3,
      manaCost: [200, 275, 350],
      cooldown: [120, 110, 100],
      values: {
        slashes: [4, 7, 10],
        bonus: [30, 45, 60],
        jumpRadius: [425, 425, 425]
      },
      effects: [
        { kind: 'statmod', mods: { untargetable: 1, invulnerable: 1, moveSpeedPct: 40 }, duration: 3.6, target: 'self' },
        { kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' },
        {
          kind: 'repeat',
          count: 'slashes',
          interval: 0.34,
          retarget: 'random-enemy-in-radius',
          radius: 'jumpRadius',
          effects: [
            { kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' },
            { kind: 'damage', dtype: 'physical', amount: 'bonus', attackDamagePct: 100, target: 'target' }
          ]
        }
      ],
      vfx: { archetype: 'chain', color: '#ffe27d', color2: '#ff5b5b', scale: 1 },
      anim: 'dash',
      sound: 'blade'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'jug-t10a', name: '+5 All Stats', mods: { str: 5, agi: 5, int: 5 } },
        { id: 'jug-t10b', name: '+20 Blade Fury DPS', abilityOverride: { abilityId: 'jug-blade-fury', valueKey: 'dpsTick', mode: 'add', amount: 5 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'jug-t15a', name: '+25 Attack Speed', mods: { attackSpeed: 25 } },
        { id: 'jug-t15b', name: '+1% Healing Ward heal', abilityOverride: { abilityId: 'jug-healing-ward', valueKey: 'healPct', mode: 'add', amount: 1 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'jug-t20a', name: '+10% Blade Dance crit chance', abilityOverride: { abilityId: 'jug-blade-dance', valueKey: 'critChance', mode: 'add', amount: 10 } },
        { id: 'jug-t20b', name: '+100 Blade Fury radius', abilityOverride: { abilityId: 'jug-blade-fury', valueKey: 'radius', mode: 'add', amount: 100 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'jug-t25a', name: '+3 Omnislash slashes', abilityOverride: { abilityId: 'jug-omnislash', valueKey: 'slashes', mode: 'add', amount: 3 } },
        { id: 'jug-t25b', name: '+30 Movement Speed', mods: { moveSpeed: 30 } }
      ]
    }
  ],
  facets: [
    {
      id: 'jug-facet-bladestorm',
      name: 'Bladestorm',
      description: 'Blade Fury spins wider (+50 radius).',
      abilityValueOverride: { abilityId: 'jug-blade-fury', valueKey: 'radius', mode: 'add', amount: 50 }
    },
    {
      id: 'jug-facet-swiftslash',
      name: 'Swift Slash',
      description: 'Omnislash strikes 25% faster but lasts one fewer slash.',
      abilityValueOverride: { abilityId: 'jug-omnislash', valueKey: 'slashes', mode: 'add', amount: -1 }
    }
  ],
  aghanim: {
    name: 'Swiftslash',
    description: 'Omnislash gains more jumps; Shard turns Blade Fury into a larger chase tool.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'jug-omnislash', valueKey: 'slashes', mode: 'add', amount: 4 },
        { abilityId: 'jug-omnislash', valueKey: 'bonus', mode: 'add', amount: 25 },
        { abilityId: 'jug-omnislash', valueKey: 'jumpRadius', mode: 'add', amount: 100 }
      ],
      cooldownAdds: [{ abilityId: 'jug-omnislash', amount: -25 }]
    },
    shard: {
      mods: { moveSpeed: 18 },
      abilityValueOverrides: [
        { abilityId: 'jug-blade-fury', valueKey: 'dpsTick', mode: 'add', amount: 12 },
        { abilityId: 'jug-blade-fury', valueKey: 'radius', mode: 'add', amount: 80 }
      ],
      cooldownAdds: [{ abilityId: 'jug-blade-fury', amount: -4 }]
    }
  },
  silhouette: { build: 'biped', scale: 1, bodyShape: 'slim', head: 'mask', weapon: 'sword', extras: ['shoulderpads', 'belt'] },
  palette: ['#c8742c', '#f3e3c2', '#7adfc4'],
  barks: [
    'The blade remembers what the isle forgot.',
    'Spin first. Questions when they stop twitching.',
    'My mask is not hiding fear. It is sparing you mine.',
    'Every fragment of that moon owes me a duel.',
    'A ward, a blade, a wind. That is a whole army.',
    'Honor is a straight line. Walk it or step aside.'
  ],
  bounty: { xp: 300, gold: 200 },
  starter: true,
  animProfile: { rig: 'fighter', castStyle: 'weapon', voiceTimbre: 'sharp' }
};
