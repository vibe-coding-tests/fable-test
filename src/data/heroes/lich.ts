import type { HeroDef } from '../../core/types';
import { loopTurnLabel } from './loop-note';
import { authoredMasteryTrees } from './mastery-authoring';

export const LICH: HeroDef = {
  id: 'lich',
  name: 'Lich',
  title: 'Ethreain, the Frozen Lord',
  attribute: 'int',
  roles: ['support', 'nuker', 'disabler'],
  region: 'tranquil-vale',
  lore: `Once a tyrant of frost magic, drowned in a frozen lake by his own subjects. A Mad Moon fragment cracked the ice, and what climbed out remembers everything. His Echo last fought on turn ${loopTurnLabel('lich')} of the Loop, thawed only long enough to teach the dead king another winter.`,
  baseStats: {
    str: 18, agi: 15, int: 24,
    strGain: 2.4, agiGain: 1.6, intGain: 3.4,
    baseDamage: 31,
    baseArmor: 1,
    attackRange: 550,
    attackPoint: 0.45,
    baseAttackTime: 1.7,
    attackProjectileSpeed: 900,
    moveSpeed: 290,
    turnRate: 0.5,
    hpRegen: 2.0,
    manaRegen: 2.5
  },
  skillOrder: [0, 1, 2],
  abilities: [
    {
      id: 'lich-frost-blast',
      name: 'Frost Blast',
      lore: 'The lake remembers how to bite.',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 600,
      castPoint: 0.4,
      manaCost: [105, 130, 155, 180],
      cooldown: [8, 7.5, 7, 6.5],
      values: {
        damage: [80, 130, 180, 230],
        splash: [60, 95, 130, 165],
        radius: [200, 200, 200, 200],
        slowMs: [30, 30, 30, 30],
        slowDur: [4, 4, 4, 4]
      },
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' },
        { kind: 'damage', dtype: 'magical', amount: 'splash', target: 'enemies-in-radius', radius: 'radius' },
        {
          kind: 'status', status: 'slow', duration: 'slowDur', target: 'enemies-in-radius', radius: 'radius',
          params: { moveSlowPct: 'slowMs', attackSlowPct: 20 }
        }
      ],
      vfx: { archetype: 'projectile', color: '#9fd8ff', color2: '#4a78b8', scale: 0.9 },
      anim: 'staff-cast',
      sound: 'frost'
    },
    {
      id: 'lich-frost-shield',
      name: 'Frost Shield',
      lore: 'His mercy is a thin sheet of ice. It holds.',
      targeting: 'unit-target',
      affects: 'ally',
      castRange: 900,
      castPoint: 0.3,
      manaCost: [100, 110, 120, 130],
      cooldown: [25, 21, 17, 13],
      values: {
        reduction: [30, 40, 50, 60],
        pulse: [20, 30, 40, 50],
        pulseRadius: [600, 600, 600, 600],
        duration: [6, 6, 6, 6],
        slowMs: [25, 25, 25, 25]
      },
      effects: [
        {
          kind: 'status', status: 'buff', duration: 'duration', target: 'target',
          params: {
            tag: 'lich-frost-shield',
            mods: { attackDamageTakenReductionPct: 'reduction' },
            periodic: {
              interval: 1,
              effects: [
                { kind: 'damage', dtype: 'magical', amount: 'pulse', target: 'enemies-in-radius', radius: 'pulseRadius' },
                { kind: 'status', status: 'slow', duration: 1.2, target: 'enemies-in-radius', radius: 'pulseRadius', params: { moveSlowPct: 'slowMs', tag: 'lich-shield-chill' } }
              ]
            }
          }
        }
      ],
      vfx: { archetype: 'shield', color: '#bfeaff', color2: '#7ec8f2', scale: 1 },
      anim: 'staff-cast',
      sound: 'frost'
    },
    {
      id: 'lich-sinister-gaze',
      name: 'Sinister Gaze',
      lore: 'Look into the dead king\u2019s eyes and forget which legs are yours.',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 600,
      castPoint: 0.3,
      manaCost: [150, 160, 170, 180],
      cooldown: [30, 26, 22, 18],
      channel: {
        duration: 'duration',
        offField: true,
        tick: {
          interval: 0.25,
          effects: [
            { kind: 'status', status: 'frozen', duration: 0.4, target: 'target', params: { tag: 'lich-gaze-hold' } },
            { kind: 'displace', mode: 'forced', target: 'target', toward: 'caster', distance: 40, speed: 160 },
            { kind: 'mana', op: 'burn', amount: 'manaTick', target: 'target' }
          ]
        }
      },
      values: {
        duration: [2.0, 2.2, 2.4, 2.6],
        manaTick: [12, 16, 20, 24]
      },
      effects: [],
      vfx: { archetype: 'beam', color: '#b89fff', color2: '#4a3a78', scale: 0.8 },
      anim: 'channel-loop',
      sound: 'void'
    },
    {
      id: 'lich-chain-frost',
      name: 'Chain Frost',
      lore: 'Ten lessons in winter, delivered to whoever stands closest.',
      targeting: 'unit-target',
      affects: 'enemy',
      ult: true,
      castRange: 800,
      castPoint: 0.4,
      manaCost: [180, 250, 320],
      cooldown: [100, 90, 80],
      values: {
        damage: [250, 370, 490],
        bounces: [10, 10, 10],
        bounceRadius: [600, 600, 600],
        slowMs: [30, 45, 60],
        slowDur: [2.5, 2.5, 2.5]
      },
      effects: [
        {
          kind: 'projectile',
          to: 'target',
          proj: {
            model: 'homing',
            speed: 750,
            disjointable: true,
            bounces: { count: 'bounces', radius: 'bounceRadius' },
            onHit: [
              { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' },
              { kind: 'status', status: 'slow', duration: 'slowDur', target: 'target', params: { moveSlowPct: 'slowMs', attackSlowPct: 'slowMs' } }
            ]
          }
        }
      ],
      vfx: { archetype: 'projectile', color: '#bfeaff', color2: '#4a78b8', scale: 1.4 },
      anim: 'ranged-shot',
      sound: 'frost'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'lich-t10a', name: '+40 Frost Blast damage', abilityOverride: { abilityId: 'lich-frost-blast', valueKey: 'damage', mode: 'add', amount: 40 } },
        { id: 'lich-t10b', name: '+150 Health', mods: { maxHp: 150 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'lich-t15a', name: '+15 Frost Shield pulse damage', abilityOverride: { abilityId: 'lich-frost-shield', valueKey: 'pulse', mode: 'add', amount: 15 } },
        { id: 'lich-t15b', name: '+2 Mana Regen', mods: { manaRegen: 2 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'lich-t20a', name: '+0.6s Sinister Gaze duration', abilityOverride: { abilityId: 'lich-sinister-gaze', valueKey: 'duration', mode: 'add', amount: 0.6 } },
        { id: 'lich-t20b', name: '+10% Frost Shield reduction', abilityOverride: { abilityId: 'lich-frost-shield', valueKey: 'reduction', mode: 'add', amount: 10 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'lich-t25a', name: '+4 Chain Frost bounces', abilityOverride: { abilityId: 'lich-chain-frost', valueKey: 'bounces', mode: 'add', amount: 4 } },
        { id: 'lich-t25b', name: '+120 Chain Frost damage', abilityOverride: { abilityId: 'lich-chain-frost', valueKey: 'damage', mode: 'add', amount: 120 } }
      ]
    }
  ],
  facets: [
    {
      id: 'lich-facet-deepfreeze',
      name: 'Deep Freeze',
      description: 'Chain Frost slows 15% harder.',
      abilityValueOverride: { abilityId: 'lich-chain-frost', valueKey: 'slowMs', mode: 'add', amount: 15 }
    },
    {
      id: 'lich-facet-frozenheart',
      name: 'Frozen Heart',
      description: 'Frost Shield lasts 2 seconds longer.',
      abilityValueOverride: { abilityId: 'lich-frost-shield', valueKey: 'duration', mode: 'add', amount: 2 }
    }
  ],
  aghanim: {
    name: 'Ice Spire',
    description: 'Chain Frost bounces harder while Shard makes Frost Shield bite.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'lich-chain-frost', valueKey: 'damage', mode: 'add', amount: 120 },
        { abilityId: 'lich-chain-frost', valueKey: 'bounces', mode: 'add', amount: 5 },
        { abilityId: 'lich-chain-frost', valueKey: 'radius', mode: 'add', amount: 120 }
      ],
      cooldownAdds: [{ abilityId: 'lich-chain-frost', amount: -18 }]
    },
    shard: {
      abilityValueOverrides: [
        { abilityId: 'lich-frost-shield', valueKey: 'pulse', mode: 'add', amount: 24 },
        { abilityId: 'lich-frost-shield', valueKey: 'reduction', mode: 'add', amount: 8 }
      ]
    }
  },
  masteryTrees: authoredMasteryTrees([
    {
      abilityId: 'lich-frost-blast',
      name: 'Rime',
      t1: { name: 'Bitter Cold', description: 'Frost Blast gains an intelligence-scaling damage bump.', mods: { int: 2 }, override: { valueKey: 'damage' } },
      t2: { name: 'Frost Shard', description: 'Frost Blast creates a frost shard on hit.', mechanic: 'summon', override: { valueKey: 'damage' } },
      t3: { name: 'Hard Splash', description: "Frost Blast's growth node sharpens its splash damage.", override: { valueKey: 'splash' } },
      t4: { name: 'Shardbound', description: 'Frost shards make future Frost Blasts bounce through them.', mechanic: 'chain' }
    },
    {
      abilityId: 'lich-frost-shield',
      name: 'Aegis',
      t1: { name: 'Cold Ward', description: 'Frost Shield gains an intelligence-scaling pulse-damage bump.', mods: { int: 2 }, override: { valueKey: 'pulse' } },
      t2: { name: 'Brittle Touch', description: 'Attackers of the shielded ally are marked brittle.', mechanic: 'mark', override: { valueKey: 'pulse' } },
      t3: { name: 'Thick Frost', description: "Frost Shield's growth node deepens its damage reduction.", override: { valueKey: 'reduction' } },
      t4: { name: 'Shatterpulse', description: 'Frost Shield pulses consume brittle marks for crowd control.', mechanic: 'consume' }
    },
    {
      abilityId: 'lich-sinister-gaze',
      name: 'Mesmer',
      t1: { name: 'Draining Stare', description: 'Sinister Gaze gains an intelligence-scaling mana-burn bump.', mods: { int: 2 }, override: { valueKey: 'manaTick' } },
      t2: { name: 'Stored Shard', description: 'Sinister Gaze drains mana into a stored frost shard.', mechanic: 'store', override: { valueKey: 'manaTick' } },
      t3: { name: 'Long Gaze', description: "Sinister Gaze's growth node holds the target longer.", override: { valueKey: 'duration' } },
      t4: { name: 'Frozen Snare', description: 'Breaking Sinister Gaze early leaves the shard behind as a trap.', mechanic: 'persist' }
    },
    {
      abilityId: 'lich-chain-frost',
      name: 'Cascade',
      t1: { name: 'Heavy Bounce', description: 'Chain Frost gains an intelligence-scaling damage bump.', mods: { int: 2 }, override: { valueKey: 'damage' } },
      t2: { name: 'Cold Hunt', description: 'Chain Frost prefers brittle or shard-marked enemies.', mechanic: 'retarget', override: { valueKey: 'damage' } },
      t3: { name: 'Wide Arc', description: "Chain Frost's growth node widens its bounce radius.", override: { valueKey: 'bounceRadius' } },
      t4: { name: 'Endless Winter', description: 'Chain Frost gains new bounces by revisiting the same hero through shards.', mechanic: 'chain' }
    }
  ]),
  silhouette: { build: 'biped', scale: 1.05, bodyShape: 'robed', head: 'skull', weapon: 'staff', extras: ['cape', 'crown'] },
  palette: ['#7ec8f2', '#2c4a78', '#d8f4ff'],
  barks: [
    'They drowned a king. The lake returned a landlord.',
    'Winter does not negotiate. I merely translate.',
    'Your mana smells warm. May I?',
    'The chain only hurts while it is teaching.',
    'I froze my own rebellion once. Twice, counting today.',
    'Stand by the shield-bearer. The cold prefers the brave.'
  ],
  bounty: { xp: 300, gold: 200 },
  recruitmentQuestId: 'recruit-lich',
  animProfile: { rig: 'caster', castStyle: 'spell', voiceTimbre: 'low' }
};
