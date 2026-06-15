import type { HeroDef } from '../../core/types';
import { loopTurnLabel } from './loop-note';
import { authoredMasteryTrees } from './mastery-authoring';

export const CRYSTAL_MAIDEN: HeroDef = {
  id: 'crystal-maiden',
  name: 'Crystal Maiden',
  title: 'Rylai of the Blueheart Glacier',
  attribute: 'int',
  roles: ['support', 'disabler', 'nuker'],
  region: 'icewrack',
  lore: `Sent south from Icewrack so her frost would stop ruining the orchards, Rylai carries winter with her like a lantern. Her Echo last fought on turn ${loopTurnLabel('crystal-maiden')} of the Loop, when Icewrack learned her winter could shelter as well as kill.`,
  baseStats: {
    str: 18, agi: 16, int: 22,
    strGain: 2.2, agiGain: 1.6, intGain: 3.3,
    baseDamage: 28,
    baseArmor: 1,
    attackRange: 600,
    attackPoint: 0.45,
    baseAttackTime: 1.7,
    attackProjectileSpeed: 900,
    moveSpeed: 280,
    turnRate: 0.5,
    hpRegen: 2.0,
    manaRegen: 2.5
  },
  skillOrder: [0, 1, 2],
  abilities: [
    {
      id: 'cm-crystal-nova',
      name: 'Crystal Nova',
      lore: 'A burst of stolen winter.',
      targeting: 'ground-aoe',
      castRange: 700,
      castPoint: 0.4,
      manaCost: [115, 130, 145, 160],
      cooldown: [11, 10, 9, 8],
      values: {
        damage: [100, 160, 220, 280],
        radius: [425, 425, 425, 425],
        slowMs: [20, 30, 40, 50],
        slowAs: [30, 45, 60, 75],
        slowDur: [4.5, 4.5, 4.5, 4.5]
      },
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
        {
          kind: 'status', status: 'slow', duration: 'slowDur', target: 'enemies-in-radius', radius: 'radius',
          params: { moveSlowPct: 'slowMs', attackSlowPct: 'slowAs' }
        }
      ],
      vfx: { archetype: 'ground-aoe', color: '#9fd8ff', color2: '#ffffff', scale: 1 },
      anim: 'ground-slam',
      sound: 'frost'
    },
    {
      id: 'cm-frostbite',
      name: 'Frostbite',
      lore: 'The glacier holds what it loves.',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 550,
      castPoint: 0.3,
      manaCost: [130, 140, 150, 160],
      cooldown: [9, 8, 7, 6],
      values: {
        duration: [1.5, 2, 2.5, 3],
        dps: [66, 75, 80, 83]
      },
      effects: [
        { kind: 'status', status: 'root', duration: 'duration', target: 'target' },
        { kind: 'status', status: 'buff', duration: 'duration', target: 'target', params: { dotDps: 'dps', dotType: 'magical', tag: 'cm-frostbite-dot' } }
      ],
      vfx: { archetype: 'shield', color: '#bfeaff', color2: '#5ba8d8', scale: 0.8 },
      anim: 'staff-cast',
      sound: 'frost'
    },
    {
      id: 'cm-arcane-aura',
      name: 'Arcane Aura',
      lore: 'Cold air carries the current of mana farther.',
      targeting: 'aura',
      values: {
        regen: [1, 1.5, 2, 2.5]
      },
      aura: { radius: 'global', affects: 'allies', mods: { manaRegen: 'regen' } },
      vfx: { archetype: 'global-mark', color: '#86c8ff', scale: 0.6 },
      anim: 'staff-cast',
      sound: 'heal'
    },
    {
      id: 'cm-freezing-field',
      name: 'Freezing Field',
      lore: 'Stand in the storm with her and learn what Icewrack means.',
      targeting: 'no-target',
      ult: true,
      castPoint: 0.3,
      manaCost: [200, 400, 600],
      cooldown: [100, 95, 90],
      channel: {
        duration: 'channelDur',
        tick: {
          interval: 0.25,
          effects: [
            {
              kind: 'damage', dtype: 'magical', amount: 'explosion', target: 'enemies-in-radius', radius: 'explosionRadius',
              offsetRing: { min: 180, max: 760 }
            }
          ]
        }
      },
      values: {
        channelDur: [10, 10, 10],
        explosion: [105, 170, 250],
        explosionRadius: [320, 320, 320],
        fieldRadius: [835, 835, 835],
        slowMs: [30, 40, 50],
        slowAs: [60, 80, 100]
      },
      effects: [
        {
          kind: 'zone',
          at: 'self',
          follow: true,
          zone: {
            shape: 'circle',
            radius: 'fieldRadius',
            duration: 'channelDur',
            tick: {
              interval: 0.5,
              affects: 'enemies',
              effects: [
                { kind: 'status', status: 'slow', duration: 1, target: 'target', params: { moveSlowPct: 'slowMs', attackSlowPct: 'slowAs', tag: 'cm-field-slow' } }
              ]
            }
          }
        }
      ],
      vfx: { archetype: 'storm', color: '#bfeaff', color2: '#ffffff', scale: 1.6 },
      anim: 'channel-loop',
      sound: 'frost'
    }
  ],
  talents: [
    {
      level: 10,
      options: [
        { id: 'cm-t10a', name: '+100 Crystal Nova damage', abilityOverride: { abilityId: 'cm-crystal-nova', valueKey: 'damage', mode: 'add', amount: 100 } },
        { id: 'cm-t10b', name: '+200 Max Mana', mods: { maxMana: 200 } }
      ]
    },
    {
      level: 15,
      options: [
        { id: 'cm-t15a', name: '+1s Frostbite duration', abilityOverride: { abilityId: 'cm-frostbite', valueKey: 'duration', mode: 'add', amount: 1 } },
        { id: 'cm-t15b', name: '+1.5 Arcane Aura mana regen', abilityOverride: { abilityId: 'cm-arcane-aura', valueKey: 'regen', mode: 'add', amount: 1.5 } }
      ]
    },
    {
      level: 20,
      options: [
        { id: 'cm-t20a', name: '+250 Health', mods: { maxHp: 250 } },
        { id: 'cm-t20b', name: '+30 Freezing Field explosion damage', abilityOverride: { abilityId: 'cm-freezing-field', valueKey: 'explosion', mode: 'add', amount: 30 } }
      ]
    },
    {
      level: 25,
      options: [
        { id: 'cm-t25a', name: '+60 Freezing Field slow', abilityOverride: { abilityId: 'cm-freezing-field', valueKey: 'slowMs', mode: 'add', amount: 30 } },
        { id: 'cm-t25b', name: '+2s Freezing Field duration', abilityOverride: { abilityId: 'cm-freezing-field', valueKey: 'channelDur', mode: 'add', amount: 2 } }
      ]
    }
  ],
  facets: [
    {
      id: 'cm-facet-frozenexpanse',
      name: 'Frozen Expanse',
      description: 'Freezing Field reaches 120 units farther.',
      abilityValueOverride: { abilityId: 'cm-freezing-field', valueKey: 'fieldRadius', mode: 'add', amount: 120 }
    },
    {
      id: 'cm-facet-deepchill',
      name: 'Deep Chill',
      description: 'Frostbite deals 20% more damage per second.',
      abilityValueOverride: { abilityId: 'cm-frostbite', valueKey: 'dps', mode: 'mul', amount: 1.2 }
    }
  ],
  aghanim: {
    name: "Winter's Grasp",
    description: 'Frostbite and Freezing Field gain longer, harsher lockdown.',
    implemented: true,
    scepter: {
      abilityValueOverrides: [
        { abilityId: 'cm-freezing-field', valueKey: 'explosion', mode: 'add', amount: 55 },
        { abilityId: 'cm-freezing-field', valueKey: 'fieldRadius', mode: 'add', amount: 150 },
        { abilityId: 'cm-freezing-field', valueKey: 'slowMs', mode: 'add', amount: 20 },
        { abilityId: 'cm-freezing-field', valueKey: 'slowAs', mode: 'add', amount: 30 }
      ],
      cooldownAdds: [{ abilityId: 'cm-freezing-field', amount: -20 }]
    },
    shard: {
      mods: { castRange: 100 },
      abilityValueOverrides: [
        { abilityId: 'cm-frostbite', valueKey: 'duration', mode: 'add', amount: 0.8 },
        { abilityId: 'cm-frostbite', valueKey: 'dps', mode: 'add', amount: 22 }
      ]
    }
  },
  masteryTrees: authoredMasteryTrees([
    {
      abilityId: 'cm-crystal-nova',
      name: 'Winter Burst',
      t1: { name: 'Glacial Bloom', description: 'Crystal Nova gains a small intelligence-scaling damage bump.', mods: { int: 2 }, override: { valueKey: 'damage' } },
      t2: { name: 'Killing Chill', description: 'Crystal Nova marks chilled enemies, prioritizing them for Frostbite.', mechanic: 'mark', override: { valueKey: 'damage' } },
      t3: { name: 'Deepening Frost', description: "Crystal Nova's growth node widens its burst and improves slow reliability.", override: { valueKey: 'radius' } },
      t4: { name: 'Frozen Field', description: 'Crystal Nova leaves a frozen field that can feed Freezing Field explosions.', mechanic: 'persist' }
    },
    {
      abilityId: 'cm-frostbite',
      name: 'Glacier',
      t1: { name: 'Biting Cold', description: 'Frostbite gains an intelligence-scaling damage-over-time bump.', mods: { int: 2 }, override: { valueKey: 'dps' } },
      t2: { name: 'Stored Winter', description: 'Frostbite stores damage taken while rooted, then bursts when the root ends.', mechanic: 'store', override: { valueKey: 'dps' } },
      t3: { name: 'Locked Ice', description: "Frostbite's growth node holds the target longer with steadier scaling.", override: { valueKey: 'duration' } },
      t4: { name: 'Spreading Frost', description: 'Frostbite chains to a nearby chilled target.', mechanic: 'chain' }
    },
    {
      abilityId: 'cm-arcane-aura',
      name: 'Arcane Tide',
      t1: { name: 'Cold Current', description: "Arcane Aura's mana regen scales with Crystal Maiden's intelligence.", mods: { int: 2 }, override: { valueKey: 'regen' } },
      t2: { name: 'Spell Recovery', description: 'Arcane Aura turns excess mana regen into spell recovery after casts.', mechanic: 'convert', override: { valueKey: 'regen' } },
      t3: { name: 'Glacial Flow', description: "Arcane Aura's growth node deepens the mana current it carries.", override: { valueKey: 'regen' } },
      t4: { name: 'Primed Frost', description: 'Arcane Aura primes the next ice spell whenever Crystal Maiden spends enough mana.', mechanic: 'prime' }
    },
    {
      abilityId: 'cm-freezing-field',
      name: 'Blizzard',
      t1: { name: 'Killing Frost', description: 'Freezing Field gains an intelligence-scaling explosion bump.', mods: { int: 2 }, override: { valueKey: 'explosion' } },
      t2: { name: 'Cold Hunt', description: 'Freezing Field explosions seek chilled or rooted enemies first.', mechanic: 'retarget', override: { valueKey: 'explosion' } },
      t3: { name: 'Widening Storm', description: "Freezing Field's growth node broadens the storm's reach.", override: { valueKey: 'fieldRadius' } },
      t4: { name: 'Drifting Winter', description: 'Crystal Maiden can drift while channeling Freezing Field, leaving a trail of smaller frost bursts.', mechanic: 'follow' }
    }
  ]),
  silhouette: { build: 'biped', scale: 0.95, bodyShape: 'robed', head: 'hood', weapon: 'staff', extras: ['cape'] },
  palette: ['#7ec8f2', '#f4fbff', '#b8c4d8'],
  barks: [
    'I promised my sister I would practice. Far away.',
    'The cold is not cruel. It is just honest.',
    'Mana flows better chilled. Everyone knows that.',
    'Stay close. Winter keeps its own.',
    'I have frozen apples, rivers, and one very rude knight.',
    'When the field freezes, stand behind me. Not in front. Please.'
  ],
  bounty: { xp: 300, gold: 200 },
  recruitmentQuestId: 'recruit-crystal-maiden',
  starter: true,
  animProfile: { rig: 'caster', castStyle: 'spell', voiceTimbre: 'bright' }
};
