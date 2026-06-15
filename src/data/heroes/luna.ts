import type { HeroDef } from '../../core/types';
import { loopTurnLabel } from './loop-note';
import { authoredMasteryTrees } from './mastery-authoring';

export const LUNA: HeroDef = {
  id: 'luna',
  name: 'Luna',
  title: 'Moon Rider of Nightsilver',
  attribute: 'agi',
  roles: ['carry', 'nuker', 'pusher'],
  region: 'nightsilver-woods',
  lore: `A mounted knight of Selemene, riding ahead of the Nightsilver host to hunt the Mad Moon shards that answer the wrong goddess. Her Echo last fought on turn ${loopTurnLabel('luna')} of the Loop, under a moon torn between Selemene and the Mad one.`,
  baseStats: {
    str: 21, agi: 24, int: 23,
    strGain: 2.4, agiGain: 3.4, intGain: 1.9,
    baseDamage: 26,
    baseArmor: 2,
    attackRange: 330,
    attackPoint: 0.46,
    baseAttackTime: 1.7,
    attackProjectileSpeed: 900,
    moveSpeed: 325,
    turnRate: 0.6,
    hpRegen: 2.5,
    manaRegen: 1.5
  },
  skillOrder: [0, 2, 1],
  abilities: [
    {
      id: 'luna-lucent-beam',
      name: 'Lucent Beam',
      lore: 'A clean shaft of moonlight, bright enough to interrupt a heartbeat.',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 800,
      castPoint: 0.4,
      manaCost: [90, 100, 110, 120],
      cooldown: [9, 8, 7, 6],
      values: {
        damage: [80, 160, 240, 320],
        ministun: [0.6, 0.6, 0.6, 0.6]
      },
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' },
        { kind: 'status', status: 'stun', duration: 'ministun', target: 'target' }
      ],
      vfx: { archetype: 'beam', color: '#cde9ff', color2: '#7c8cff', scale: 0.8 },
      anim: 'ranged-shot',
      sound: 'storm'
    },
    {
      id: 'luna-moon-glaives',
      name: 'Moon Glaives',
      lore: 'The glaive is never satisfied with one enemy.',
      targeting: 'passive',
      values: {
        bouncePct: [35, 50, 65, 80],
        radius: [500, 500, 500, 500]
      },
      attackMod: { cleave: { pct: 'bouncePct', radius: 'radius' } },
      vfx: { archetype: 'chain', color: '#d7e7ff', scale: 0.5 },
      anim: 'ranged-shot',
      sound: 'blade'
    },
    {
      id: 'luna-lunar-blessing',
      name: 'Lunar Blessing',
      lore: 'Her oath sharpens every allied blade under the moon.',
      targeting: 'aura',
      values: {
        damage: [8, 16, 24, 32],
        nightSight: [5, 10, 15, 20]
      },
      aura: { radius: 1200, affects: 'allies', mods: { damage: 'damage', visionPct: 'nightSight' } },
      vfx: { archetype: 'global-mark', color: '#b9c7ff', scale: 0.6 },
      anim: 'staff-cast',
      sound: 'heal'
    },
    {
      id: 'luna-eclipse',
      name: 'Eclipse',
      lore: 'The sky closes its eye, and Selemene opens hers.',
      targeting: 'no-target',
      ult: true,
      castPoint: 0.5,
      manaCost: [150, 200, 250],
      cooldown: [110, 105, 100],
      values: {
        beams: [6, 9, 12],
        damage: [150, 200, 250],
        radius: [675, 675, 675],
        ministun: [0.25, 0.25, 0.25]
      },
      effects: [
        {
          kind: 'repeat',
          count: 'beams',
          interval: 0.35,
          retarget: 'random-enemy-in-radius',
          radius: 'radius',
          effects: [
            { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' },
            { kind: 'status', status: 'stun', duration: 'ministun', target: 'target' }
          ]
        }
      ],
      vfx: { archetype: 'storm', color: '#dce7ff', color2: '#6f77ff', scale: 1.3 },
      anim: 'global-cast',
      sound: 'storm'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'luna-t10a', name: '+15 Attack Speed', mods: { attackSpeed: 15 } },
        { id: 'luna-t10b', name: '+50 Lucent Beam damage', abilityOverride: { abilityId: 'luna-lucent-beam', valueKey: 'damage', mode: 'add', amount: 50 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'luna-t15a', name: '+10 Lunar Blessing damage', abilityOverride: { abilityId: 'luna-lunar-blessing', valueKey: 'damage', mode: 'add', amount: 10 } },
        { id: 'luna-t15b', name: '+100 Attack Range', mods: { attackRange: 100 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'luna-t20a', name: '+20 Moon Glaives damage', abilityOverride: { abilityId: 'luna-moon-glaives', valueKey: 'bouncePct', mode: 'add', amount: 20 } },
        { id: 'luna-t20b', name: '-2s Lucent Beam cooldown', cooldownAdd: { abilityId: 'luna-lucent-beam', amount: -2 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'luna-t25a', name: '+4 Eclipse beams', abilityOverride: { abilityId: 'luna-eclipse', valueKey: 'beams', mode: 'add', amount: 4 } },
        { id: 'luna-t25b', name: '+0.25s Lucent Beam stun', abilityOverride: { abilityId: 'luna-lucent-beam', valueKey: 'ministun', mode: 'add', amount: 0.25 } }
      ]
    }
  ],
  facets: [
    {
      id: 'luna-facet-moonstorm',
      name: 'Moonstorm',
      description: 'Eclipse fires two extra beams.',
      abilityValueOverride: { abilityId: 'luna-eclipse', valueKey: 'beams', mode: 'add', amount: 2 }
    },
    {
      id: 'luna-facet-gleaming',
      name: 'Gleaming Glaives',
      description: 'Moon Glaives rebounds harder in packed fights.',
      abilityValueOverride: { abilityId: 'luna-moon-glaives', valueKey: 'bouncePct', mode: 'add', amount: 10 }
    }
  ],
  aghanim: {
    name: 'Moonfall',
    description: 'Eclipse rains more beams and Shard sharpens Lucent Beam.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'luna-eclipse', valueKey: 'beams', mode: 'add', amount: 5 },
        { abilityId: 'luna-eclipse', valueKey: 'radius', mode: 'add', amount: 140 }
      ],
      cooldownAdds: [{ abilityId: 'luna-eclipse', amount: -20 }]
    },
    shard: {
      abilityValueOverrides: [
        { abilityId: 'luna-lucent-beam', valueKey: 'damage', mode: 'add', amount: 70 },
        { abilityId: 'luna-lucent-beam', valueKey: 'ministun', mode: 'add', amount: 0.2 }
      ]
    }
  },
  masteryTrees: authoredMasteryTrees([
    {
      abilityId: 'luna-lucent-beam',
      name: 'Moonbeam',
      t1: { name: 'Bright Shaft', description: 'Lucent Beam gains an agility-scaling damage bump.', mods: { agi: 2 }, override: { valueKey: 'damage' } },
      t2: { name: 'Glaive Spark', description: 'Lucent Beam also pops a small Moon Glaive bounce on hit.', mechanic: 'chain', override: { valueKey: 'damage' } },
      t3: { name: 'Steady Aim', description: "Lucent Beam's growth node lengthens its mini-stun.", override: { valueKey: 'ministun' } },
      t4: { name: 'Double Strike', description: 'Lucent Beam strikes twice when it kills, refunding half its cooldown.', mechanic: 'refund' }
    },
    {
      abilityId: 'luna-moon-glaives',
      name: 'Glaivework',
      t1: { name: 'Keen Edge', description: 'Moon Glaives gains an agility-scaling bounce-damage bump.', mods: { agi: 2 }, override: { valueKey: 'bouncePct' } },
      t2: { name: 'Moonlit', description: 'Moon Glaive bounces mark enemies as moonlit.', mechanic: 'mark', override: { valueKey: 'bouncePct' } },
      t3: { name: 'Wide Arc', description: "Moon Glaives' growth node widens its bounce radius.", override: { valueKey: 'radius' } },
      t4: { name: 'Hunting Glaive', description: 'Glaive bounces seek moonlit and low-HP targets first.', mechanic: 'retarget' }
    },
    {
      abilityId: 'luna-lunar-blessing',
      name: 'Blessing',
      t1: { name: 'Silver Oath', description: 'Lunar Blessing gains an agility-scaling aura-damage bump.', mods: { agi: 2 }, override: { valueKey: 'damage' } },
      t2: { name: 'Moonlight Charge', description: 'Lunar Blessing turns nearby allied attacks into moonlight charge.', mechanic: 'store', override: { valueKey: 'damage' } },
      t3: { name: 'Night Vision', description: "Lunar Blessing's growth node sharpens its night sight.", override: { valueKey: 'nightSight' } },
      t4: { name: 'Lunar Primer', description: "Stored moonlight changes Eclipse's beam budget and target preference.", mechanic: 'prime' }
    },
    {
      abilityId: 'luna-eclipse',
      name: 'Eclipse',
      t1: { name: 'Cold Light', description: 'Eclipse gains an agility-scaling beam-damage bump.', mods: { agi: 2 }, override: { valueKey: 'damage' } },
      t2: { name: 'Moon Hunt', description: 'Eclipse beams prefer moonlit heroes.', mechanic: 'retarget', override: { valueKey: 'damage' } },
      t3: { name: 'Falling Light', description: "Eclipse's growth node adds beams to the barrage.", override: { valueKey: 'beams' } },
      t4: { name: 'Wandering Moon', description: 'Eclipse follows Luna instead of striking a fixed area.', mechanic: 'follow' }
    }
  ]),
  silhouette: { build: 'quad', scale: 1.08, bodyShape: 'slim', head: 'helm', weapon: 'sword', extras: ['cape', 'crown'] },
  palette: ['#2e3f78', '#d8e5ff', '#b9b0ff'],
  barks: [
    'Selemene sees what the broken moon hides.',
    'Night is not darkness. It is judgment.',
    'My glaive returns because its work is never done.',
    'Ride low. Strike high.',
    'The woods remember my oath.',
    'Moonlight is mercy only from far away.'
  ],
  bounty: { xp: 330, gold: 220 },
  recruitmentQuestId: 'recruit-luna',
  animProfile: { rig: 'rider', castStyle: 'weapon', voiceTimbre: 'sharp' }
};
