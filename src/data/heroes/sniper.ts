import type { HeroDef } from '../../core/types';

export const SNIPER: HeroDef = {
  id: 'sniper',
  name: 'Sniper',
  title: 'Kardel Sharpeye',
  attribute: 'agi',
  roles: ['carry', 'nuker'],
  region: 'tranquil-vale',
  lore: 'Exiled from his mountain keen for shooting the ceremonial target a mile past the rules, Kardel treats distance as a personal friend.',
  baseStats: {
    str: 16, agi: 24, int: 18,
    strGain: 2.0, agiGain: 3.2, intGain: 1.7,
    baseDamage: 30,
    baseArmor: 0,
    attackRange: 550,
    attackPoint: 0.17,
    baseAttackTime: 1.6,
    attackProjectileSpeed: 3000,
    moveSpeed: 285,
    turnRate: 0.6,
    hpRegen: 2.5,
    manaRegen: 1.5
  },
  skillOrder: [1, 2, 0],
  abilities: [
    {
      id: 'sniper-shrapnel',
      name: 'Shrapnel',
      lore: 'The sky rains disagreement.',
      targeting: 'ground-aoe',
      castRange: 1800,
      castPoint: 0.3,
      manaCost: [50, 50, 50, 50],
      cooldown: [0, 0, 0, 0],
      values: {
        dps: [30, 45, 60, 75],
        slowMs: [15, 20, 25, 30],
        radius: [450, 450, 450, 450],
        duration: [10, 10, 10, 10],
        charges: [3, 3, 3, 3],
        chargeRestoreTime: [35, 35, 35, 35]
      },
      effects: [
        {
          kind: 'zone',
          at: 'point',
          zone: {
            shape: 'circle',
            radius: 'radius',
            duration: 'duration',
            tick: {
              interval: 1,
              affects: 'enemies',
              effects: [
                { kind: 'damage', dtype: 'magical', amount: 'dps', target: 'target' },
                { kind: 'status', status: 'slow', duration: 1.1, target: 'target', params: { moveSlowPct: 'slowMs', tag: 'sniper-shrapnel-slow' } }
              ]
            }
          }
        }
      ],
      vfx: { archetype: 'storm', color: '#ffb35c', color2: '#8a8a8a', scale: 1 },
      anim: 'ranged-shot',
      sound: 'bow'
    },
    {
      id: 'sniper-headshot',
      name: 'Headshot',
      lore: 'Aim small, hit everything.',
      targeting: 'passive',
      values: {
        chance: [40, 40, 40, 40],
        damage: [20, 50, 80, 110]
      },
      attackMod: {
        procChance: 'chance',
        procDamage: 'damage',
        procStatus: { status: 'slow', duration: 0.5, params: { moveSlowPct: 100, tag: 'sniper-headshot-stop' } }
      },
      vfx: { archetype: 'projectile', color: '#ffd27f', scale: 0.4 },
      anim: 'ranged-shot',
      sound: 'bow'
    },
    {
      id: 'sniper-take-aim',
      name: 'Take Aim',
      lore: 'One more step back. Perfect.',
      targeting: 'passive',
      values: {
        range: [100, 200, 300, 400]
      },
      passiveMods: { attackRange: 'range' },
      vfx: { archetype: 'beam', color: '#c8e85c', scale: 0.4 },
      anim: 'ranged-shot',
      sound: 'bow'
    },
    {
      id: 'sniper-assassinate',
      name: 'Assassinate',
      lore: 'Somewhere far away, a problem stops existing.',
      targeting: 'unit-target',
      affects: 'enemy',
      ult: true,
      castRange: 'castRangeVal',
      castPoint: 0.3,
      manaCost: [175, 275, 375],
      cooldown: [18, 14, 10],
      channel: {
        duration: 1.4,
        onEnd: [
          {
            kind: 'projectile',
            to: 'target',
            proj: {
              model: 'homing',
              speed: 2500,
              disjointable: true,
              onHit: [
                { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' },
                { kind: 'status', status: 'stun', duration: 0.3, target: 'target' }
              ]
            }
          }
        ]
      },
      values: {
        damage: [300, 400, 500],
        castRangeVal: [2200, 2800, 3400]
      },
      vfx: { archetype: 'beam', color: '#ff5b5b', color2: '#ffd27f', scale: 1.2 },
      anim: 'ranged-shot',
      sound: 'bow'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'sniper-t10a', name: '+20 Shrapnel DPS', abilityOverride: { abilityId: 'sniper-shrapnel', valueKey: 'dps', mode: 'add', amount: 20 } },
        { id: 'sniper-t10b', name: '+15 Attack Speed', mods: { attackSpeed: 15 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'sniper-t15a', name: '+30 Headshot damage', abilityOverride: { abilityId: 'sniper-headshot', valueKey: 'damage', mode: 'add', amount: 30 } },
        { id: 'sniper-t15b', name: '+10% Evasion while standing ground', mods: { evasionPct: 10 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'sniper-t20a', name: '+100 Attack Range', mods: { attackRange: 100 } },
        { id: 'sniper-t20b', name: '+125 Assassinate damage', abilityOverride: { abilityId: 'sniper-assassinate', valueKey: 'damage', mode: 'add', amount: 125 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'sniper-t25a', name: '+1 Shrapnel charge', abilityOverride: { abilityId: 'sniper-shrapnel', valueKey: 'charges', mode: 'add', amount: 1 } },
        { id: 'sniper-t25b', name: '+25% Headshot chance', abilityOverride: { abilityId: 'sniper-headshot', valueKey: 'chance', mode: 'add', amount: 25 } }
      ]
    }
  ],
  facets: [
    {
      id: 'sniper-facet-ghillie',
      name: 'Dug In',
      description: 'Shrapnel zones slow 10% harder.',
      abilityValueOverride: { abilityId: 'sniper-shrapnel', valueKey: 'slowMs', mode: 'add', amount: 10 }
    },
    {
      id: 'sniper-facet-spotter',
      name: 'Spotter',
      description: 'Assassinate reaches 400 units farther.',
      abilityValueOverride: { abilityId: 'sniper-assassinate', valueKey: 'castRangeVal', mode: 'add', amount: 400 }
    }
  ],
  aghanim: {
    name: 'Concussive Grenade',
    description: 'Assassinate becomes a faster, louder finisher; Shard improves Shrapnel control.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'sniper-assassinate', valueKey: 'damage', mode: 'add', amount: 220 },
        { abilityId: 'sniper-assassinate', valueKey: 'ministun', mode: 'add', amount: 0.5 }
      ],
      cooldownAdds: [{ abilityId: 'sniper-assassinate', amount: -18 }]
    },
    shard: {
      mods: { moveSpeed: 20 },
      abilityValueOverrides: [
        { abilityId: 'sniper-shrapnel', valueKey: 'dps', mode: 'add', amount: 18 },
        { abilityId: 'sniper-shrapnel', valueKey: 'slow', mode: 'add', amount: 12 }
      ]
    }
  },
  silhouette: { build: 'biped', scale: 0.85, bodyShape: 'slim', head: 'helm', weapon: 'rifle', extras: ['belt'] },
  palette: ['#c8a05c', '#5c4a32', '#ffd27f'],
  barks: [
    'Distance is just respect, measured.',
    'I never miss. I occasionally reschedule.',
    'The mountain said leave. The rifle said nothing. We left together.',
    'Closer is your plan? Bold. Wrong, but bold.',
    'Wind from the east, target due north, dinner at six.',
    'Shrapnel first. Apologies never.'
  ],
  bounty: { xp: 300, gold: 200 },
  recruitmentQuestId: 'recruit-sniper',
  starter: true,
  animProfile: { rig: 'ranged', castStyle: 'weapon', voiceTimbre: 'sharp' }
};
