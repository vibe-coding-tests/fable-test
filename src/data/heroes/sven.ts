import type { HeroDef } from '../../core/types';
import { loopTurnLabel } from './loop-note';
import { authoredMasteryTrees } from './mastery-authoring';

export const SVEN: HeroDef = {
  id: 'sven',
  name: 'Sven',
  title: 'The Rogue Knight',
  attribute: 'str',
  roles: ['carry', 'durable', 'initiator'],
  region: 'tranquil-vale',
  lore: `A Vigil knight by blood and an oath-breaker by choice, Sven follows no law that cannot survive his sword. His Echo last fought on turn ${loopTurnLabel('sven')} of the Loop, breaking an oath so someone else could keep one.`,
  baseStats: {
    str: 22, agi: 21, int: 16,
    strGain: 3.2, agiGain: 2.2, intGain: 1.5,
    baseDamage: 41,
    baseArmor: 2,
    attackRange: 150,
    attackPoint: 0.4,
    baseAttackTime: 1.8,
    moveSpeed: 325,
    turnRate: 0.6,
    hpRegen: 3.5,
    manaRegen: 1.5
  },
  skillOrder: [0, 1, 2],
  abilities: [
    {
      id: 'sven-storm-hammer',
      name: 'Storm Hammer',
      lore: 'A thrown sentence: guilty.',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 600,
      castPoint: 0.3,
      manaCost: [110, 120, 130, 140],
      cooldown: [19, 17, 15, 13],
      values: {
        damage: [110, 180, 250, 320],
        stun: [1.0, 1.2, 1.4, 1.6],
        radius: [255, 255, 255, 255]
      },
      effects: [
        {
          kind: 'projectile',
          to: 'target',
          proj: {
            model: 'homing',
            speed: 1000,
            disjointable: true,
            onHit: [
              { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
              { kind: 'status', status: 'stun', duration: 'stun', target: 'enemies-in-radius', radius: 'radius' }
            ]
          }
        }
      ],
      vfx: { archetype: 'projectile', color: '#6db7ff', color2: '#ffffff', scale: 0.9 },
      anim: 'ranged-shot',
      sound: 'impact'
    },
    {
      id: 'sven-great-cleave',
      name: 'Great Cleave',
      lore: 'The sword refuses to stop at the first body.',
      targeting: 'passive',
      values: {
        cleave: [40, 55, 70, 85],
        radius: [650, 650, 650, 650]
      },
      attackMod: { cleave: { pct: 'cleave', radius: 'radius' } },
      vfx: { archetype: 'chain', color: '#9fd8ff', scale: 0.5 },
      anim: 'melee-swing',
      sound: 'blade'
    },
    {
      id: 'sven-warcry',
      name: 'Warcry',
      lore: 'Armor answers when courage calls.',
      targeting: 'no-target',
      castPoint: 0,
      manaCost: [30, 40, 50, 60],
      cooldown: [35, 32, 29, 26],
      values: {
        armor: [6, 9, 12, 15],
        move: [10, 14, 18, 22],
        duration: [8, 8, 8, 8],
        radius: [700, 700, 700, 700]
      },
      effects: [
        { kind: 'statmod', mods: { armor: 'armor', moveSpeedPct: 'move' }, duration: 'duration', target: 'allies-in-radius', radius: 'radius' }
      ],
      vfx: { archetype: 'shield', color: '#7fb7ff', color2: '#d8e8ff', scale: 0.9 },
      anim: 'melee-swing',
      sound: 'roar'
    },
    {
      id: 'sven-gods-strength',
      name: "God's Strength",
      lore: 'For a short while, Sven borrows the weight of every oath he broke.',
      targeting: 'no-target',
      ult: true,
      castPoint: 0.3,
      manaCost: [100, 150, 200],
      cooldown: [110, 105, 100],
      values: {
        damagePct: [110, 150, 190],
        duration: [35, 35, 35]
      },
      effects: [
        { kind: 'statmod', mods: { damagePct: 'damagePct' }, duration: 'duration', target: 'self' }
      ],
      vfx: { archetype: 'global-mark', color: '#ff6d4a', color2: '#ffd27f', scale: 1.2 },
      anim: 'global-cast',
      sound: 'roar'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'sven-t10a', name: '+20 Damage', mods: { damage: 20 } },
        { id: 'sven-t10b', name: '+1s Warcry duration', abilityOverride: { abilityId: 'sven-warcry', valueKey: 'duration', mode: 'add', amount: 1 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'sven-t15a', name: '+25 Storm Hammer damage', abilityOverride: { abilityId: 'sven-storm-hammer', valueKey: 'damage', mode: 'add', amount: 25 } },
        { id: 'sven-t15b', name: '+10 Warcry armor', abilityOverride: { abilityId: 'sven-warcry', valueKey: 'armor', mode: 'add', amount: 10 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'sven-t20a', name: '+20 Great Cleave', abilityOverride: { abilityId: 'sven-great-cleave', valueKey: 'cleave', mode: 'add', amount: 20 } },
        { id: 'sven-t20b', name: '-4s Storm Hammer cooldown', cooldownAdd: { abilityId: 'sven-storm-hammer', amount: -4 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'sven-t25a', name: '+40% Gods Strength damage', abilityOverride: { abilityId: 'sven-gods-strength', valueKey: 'damagePct', mode: 'add', amount: 40 } },
        { id: 'sven-t25b', name: '+0.5s Storm Hammer stun', abilityOverride: { abilityId: 'sven-storm-hammer', valueKey: 'stun', mode: 'add', amount: 0.5 } }
      ]
    }
  ],
  facets: [
    {
      id: 'sven-facet-heavy-plate',
      name: 'Heavy Plate',
      description: 'Warcry grants 4 extra armor.',
      abilityValueOverride: { abilityId: 'sven-warcry', valueKey: 'armor', mode: 'add', amount: 4 }
    },
    {
      id: 'sven-facet-sundered-oath',
      name: 'Sundered Oath',
      description: "God's Strength grants 20% more attack damage.",
      abilityValueOverride: { abilityId: 'sven-gods-strength', valueKey: 'damagePct', mode: 'add', amount: 20 }
    }
  ],
  aghanim: {
    name: 'Storm Ride',
    description: 'Storm Hammer hits harder and more often; Shard strengthens Warcry and cleave.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'sven-storm-hammer', valueKey: 'damage', mode: 'add', amount: 90 },
        { abilityId: 'sven-storm-hammer', valueKey: 'stun', mode: 'add', amount: 0.4 }
      ],
      cooldownAdds: [{ abilityId: 'sven-storm-hammer', amount: -5 }]
    },
    shard: {
      abilityValueOverrides: [
        { abilityId: 'sven-great-cleave', valueKey: 'cleave', mode: 'add', amount: 20 },
        { abilityId: 'sven-warcry', valueKey: 'armor', mode: 'add', amount: 6 }
      ],
      cooldownAdds: [{ abilityId: 'sven-warcry', amount: -3 }]
    }
  },
  masteryTrees: authoredMasteryTrees([
    {
      abilityId: 'sven-storm-hammer',
      name: 'Thunderclap',
      t1: { name: 'Heavy Throw', description: 'Storm Hammer gains a strength-scaling damage bump.', mods: { str: 2 }, override: { valueKey: 'damage' } },
      t2: { name: 'Stormbound', description: 'Hammered enemies become stormbound for Great Cleave.', mechanic: 'mark', override: { valueKey: 'damage' } },
      t3: { name: 'Wide Impact', description: "Storm Hammer's growth node widens its stun radius.", override: { valueKey: 'radius' } },
      t4: { name: 'Forked Hammer', description: 'Storm Hammer splits through stormbound targets.', mechanic: 'split' }
    },
    {
      abilityId: 'sven-great-cleave',
      name: 'Cleaver',
      t1: { name: 'Wide Swing', description: 'Great Cleave gains a strength-scaling cleave bump.', mods: { str: 2 }, override: { valueKey: 'cleave' } },
      t2: { name: 'Storm Spread', description: 'Great Cleave applies stormbound to secondary targets.', mechanic: 'mark', override: { valueKey: 'cleave' } },
      t3: { name: 'Long Reach', description: "Great Cleave's growth node widens its cleave arc.", override: { valueKey: 'radius' } },
      t4: { name: 'Shockwave', description: "Great Cleave consumes stormbound marks to become an armor-agnostic shockwave during God's Strength.", mechanic: 'consume' }
    },
    {
      abilityId: 'sven-warcry',
      name: 'Rally',
      t1: { name: 'Iron Will', description: 'Warcry gains a strength-scaling armor bump.', mods: { str: 2 }, override: { valueKey: 'armor' } },
      t2: { name: 'Bulwark', description: 'Warcry gives allies a block shield that scales with nearby stormbound enemies.', mechanic: 'store', override: { valueKey: 'armor' } },
      t3: { name: 'Long Rally', description: "Warcry's growth node extends its duration.", override: { valueKey: 'duration' } },
      t4: { name: 'War Command', description: "Warcry also commands allied summons to charge Sven's target.", mechanic: 'summon' }
    },
    {
      abilityId: 'sven-gods-strength',
      name: 'Godhood',
      t1: { name: 'Borrowed Weight', description: "God's Strength gains a strength-scaling damage bump.", mods: { str: 2 }, override: { valueKey: 'damagePct' } },
      t2: { name: 'Storm Reaper', description: "God's Strength consumes stormbound marks for extra cleave events.", mechanic: 'consume', override: { valueKey: 'damagePct' } },
      t3: { name: 'Lasting Oath', description: "God's Strength growth node extends its duration.", override: { valueKey: 'duration' } },
      t4: { name: 'Ring of Ruin', description: "Great Cleave becomes a full-ring shockwave while God's Strength is active.", mechanic: 'split' }
    }
  ]),
  silhouette: { build: 'biped', scale: 1.15, bodyShape: 'bulky', head: 'helm', weapon: 'sword', extras: ['cape', 'shoulderpads', 'belt'] },
  palette: ['#3c5f94', '#d9dde6', '#ff8a3d'],
  barks: [
    'The Vigil wrote laws. I wrote scars.',
    'My sword is large because my patience is small.',
    'Stand together. It saves me time.',
    'I broke my chains. Yours are next.',
    'Honor without mercy is just armor.',
    'Storm first. Sermon later.'
  ],
  bounty: { xp: 340, gold: 230 },
  recruitmentQuestId: 'recruit-sven',
  animProfile: { rig: 'fighter', castStyle: 'weapon', voiceTimbre: 'low' }
};
