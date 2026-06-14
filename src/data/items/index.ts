import type { DropSource, ItemDef, ItemRarity } from '../../core/types';

// ============================================================
// Phase 1 item catalog: consumables, components, and 15+
// identity-rich assembled items (SPEC §5, Item Feel Fidelity).
// ============================================================

export const CONSUMABLES: ItemDef[] = [
  {
    id: 'tango',
    name: 'Tango',
    tier: 'consumable',
    cost: 90,
    charges: 3,
    lore: 'Bitter leaves the vale shepherds chew on long watches.',
    glyph: 'leaf',
    active: {
      id: 'tango-active',
      name: 'Eat Tango',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [1],
      effects: [
        { kind: 'status', status: 'buff', duration: 16, target: 'self', params: { mods: { hpRegen: 7 }, tag: 'tango-regen' } }
      ],
      vfx: { archetype: 'shield', color: '#9fdc5c', scale: 0.4 }
    }
  },
  {
    id: 'healing-salve',
    name: 'Healing Salve',
    tier: 'consumable',
    cost: 110,
    charges: 1,
    lore: 'A thick ointment that works fast but hates being interrupted.',
    glyph: 'flask',
    active: {
      id: 'salve-active',
      name: 'Apply Salve',
      targeting: 'unit-target',
      affects: 'ally',
      castRange: 250,
      castPoint: 0,
      cooldown: [1],
      effects: [
        { kind: 'status', status: 'buff', duration: 8, target: 'target', params: { mods: { hpRegen: 50 }, breakOnDamage: true, tag: 'salve-regen' } }
      ],
      vfx: { archetype: 'shield', color: '#ff9fb8', scale: 0.5 }
    }
  },
  {
    id: 'clarity',
    name: 'Clarity',
    tier: 'consumable',
    cost: 50,
    charges: 1,
    lore: 'Bottled focus. Spills easily.',
    glyph: 'flask',
    active: {
      id: 'clarity-active',
      name: 'Drink Clarity',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [1],
      effects: [
        { kind: 'status', status: 'buff', duration: 20, target: 'self', params: { mods: { manaRegen: 11 }, breakOnDamage: true, tag: 'clarity-regen' } }
      ],
      vfx: { archetype: 'shield', color: '#86c8ff', scale: 0.4 }
    }
  },
  {
    id: 'dust-of-appearance',
    name: 'Dust of Appearance',
    tier: 'consumable',
    cost: 80,
    charges: 1,
    lore: 'Ground moonstone. It settles on what pretends not to be there.',
    glyph: 'burst',
    active: {
      id: 'dust-active',
      name: 'Scatter Dust',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [1],
      effects: [
        {
          kind: 'status', status: 'buff', duration: 12, target: 'enemies-in-radius', radius: 1050,
          params: { mods: { revealed: 1, moveSpeedPct: -15 }, tag: 'dust-reveal' }
        }
      ],
      vfx: { archetype: 'ground-aoe', color: '#c8a0ff', scale: 1 }
    }
  },
  {
    id: 'observer-ward',
    name: 'Observer Ward',
    tier: 'consumable',
    cost: 50,
    charges: 1,
    lore: 'A little eye on a stick. It buys certainty, not damage.',
    glyph: 'eye',
    active: {
      id: 'observer-ward-active',
      name: 'Place Observer Ward',
      targeting: 'point-target',
      castRange: 500,
      castPoint: 0,
      cooldown: [1],
      effects: [{ kind: 'summon', at: 'point', summon: { id: 'observer-ward-summon', name: 'Observer Ward', lifetime: 360, cannotAttack: true, stats: { maxHp: 2, damage: 0, armor: 0, moveSpeed: 0, attackRange: 0, baseAttackTime: 1 }, silhouette: { build: 'ward', scale: 0.45, weapon: 'none' }, palette: ['#6bd8ff', '#1e3558', '#ffffff'] } }],
      vfx: { archetype: 'summon-pop', color: '#6bd8ff', scale: 0.4 },
      anim: 'item-use',
      sound: 'item'
    }
  },
  {
    id: 'sentry-ward',
    name: 'Sentry Ward',
    tier: 'consumable',
    cost: 50,
    charges: 1,
    lore: 'Powdered moon-glass that tattles on hidden things.',
    glyph: 'eye',
    active: {
      id: 'sentry-ward-active',
      name: 'Place Sentry Ward',
      targeting: 'point-target',
      castRange: 500,
      castPoint: 0,
      cooldown: [1],
      effects: [{ kind: 'summon', at: 'point', summon: { id: 'sentry-ward-summon', name: 'Sentry Ward', lifetime: 360, cannotAttack: true, stats: { maxHp: 2, damage: 0, armor: 0, moveSpeed: 0, attackRange: 0, baseAttackTime: 1 }, silhouette: { build: 'ward', scale: 0.45, weapon: 'none' }, palette: ['#c8a0ff', '#2a1740', '#ffffff'] } }],
      vfx: { archetype: 'summon-pop', color: '#c8a0ff', scale: 0.4 },
      anim: 'item-use',
      sound: 'item'
    }
  },
  {
    id: 'smoke-of-deceit',
    name: 'Smoke of Deceit',
    tier: 'consumable',
    cost: 80,
    charges: 1,
    lore: 'A team secret held together by gray vapor.',
    glyph: 'cloud',
    active: {
      id: 'smoke-active',
      name: 'Smoke',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [1],
      effects: [{ kind: 'status', status: 'invis', duration: 12, target: 'allies-in-radius', radius: 1200, params: { fadeTime: 0.2, threatDropPct: 70, tag: 'smoke' } }],
      vfx: { archetype: 'ground-aoe', color: '#9a9a9a', scale: 0.8 },
      anim: 'item-use',
      sound: 'item'
    }
  }
];

export const COMPONENTS: ItemDef[] = [
  { id: 'iron-branch', name: 'Iron Branch', tier: 'component', cost: 50, passiveMods: { str: 1, agi: 1, int: 1 }, lore: 'A twig of the World Tree. Surprisingly load-bearing.', glyph: 'branch' },
  { id: 'circlet', name: 'Circlet', tier: 'component', cost: 155, passiveMods: { str: 2, agi: 2, int: 2 }, lore: 'A thin band of moon-silver.', glyph: 'ring' },
  { id: 'crown', name: 'Crown', tier: 'component', cost: 450, passiveMods: { str: 4, agi: 4, int: 4 }, lore: 'Worn by a minor king of a minor hill.', glyph: 'crown' },
  { id: 'gauntlets-of-strength', name: 'Gauntlets of Strength', tier: 'component', cost: 140, passiveMods: { str: 3 }, lore: 'Knuckles first, questions later.', glyph: 'fist' },
  { id: 'slippers-of-agility', name: 'Slippers of Agility', tier: 'component', cost: 140, passiveMods: { agi: 3 }, lore: 'Soft-soled and silent.', glyph: 'boot' },
  { id: 'mantle-of-intelligence', name: 'Mantle of Intelligence', tier: 'component', cost: 140, passiveMods: { int: 3 }, lore: 'Smells faintly of old libraries.', glyph: 'mantle' },
  { id: 'belt-of-strength', name: 'Belt of Strength', tier: 'component', cost: 450, passiveMods: { str: 6 }, lore: 'Cinch it tight; lift the world.', glyph: 'belt' },
  { id: 'band-of-elvenskin', name: 'Band of Elvenskin', tier: 'component', cost: 450, passiveMods: { agi: 6 }, lore: 'Woven by hands that never fumble.', glyph: 'band' },
  { id: 'robe-of-the-magi', name: 'Robe of the Magi', tier: 'component', cost: 450, passiveMods: { int: 6 }, lore: 'The hem is stitched with quiet theorems.', glyph: 'mantle' },
  { id: 'blades-of-attack', name: 'Blades of Attack', tier: 'component', cost: 450, passiveMods: { damage: 9 }, lore: 'Twin edges, zero patience.', glyph: 'blade' },
  { id: 'broadsword', name: 'Broadsword', tier: 'component', cost: 1000, passiveMods: { damage: 15 }, lore: 'A soldier\u2019s honest answer.', glyph: 'blade' },
  { id: 'claymore', name: 'Claymore', tier: 'component', cost: 1350, passiveMods: { damage: 20 }, lore: 'Heavy enough to argue with gates.', glyph: 'blade' },
  { id: 'mithril-hammer', name: 'Mithril Hammer', tier: 'component', cost: 1600, passiveMods: { damage: 24 }, lore: 'Forged from a falling star\u2019s leftovers.', glyph: 'hammer' },
  { id: 'quarterstaff', name: 'Quarterstaff', tier: 'component', cost: 875, passiveMods: { damage: 10, attackSpeed: 10 }, lore: 'Plain wood, perfect balance.', glyph: 'staff' },
  { id: 'ogre-axe', name: 'Ogre Axe', tier: 'component', cost: 1000, passiveMods: { str: 10 }, lore: 'An ogre\u2019s idea of subtlety.', glyph: 'axe' },
  { id: 'staff-of-wizardry', name: 'Staff of Wizardry', tier: 'component', cost: 1000, passiveMods: { int: 10 }, lore: 'Hums at the frequency of unfinished spells.', glyph: 'staff' },
  { id: 'blade-of-alacrity', name: 'Blade of Alacrity', tier: 'component', cost: 1000, passiveMods: { agi: 10 }, lore: 'Light as a rumor.', glyph: 'blade' },
  {
    id: 'boots-of-speed', name: 'Boots of Speed', tier: 'basic', cost: 500,
    passiveMods: { moveSpeed: 45 },
    lore: 'The vale\u2019s most popular purchase.',
    glyph: 'boot',
    appearance: { parts: ['boot-trail'], aura: { archetype: 'storm', color: '#f1d58a', color2: '#ffffff' } }
  },
  { id: 'gloves-of-haste', name: 'Gloves of Haste', tier: 'component', cost: 450, passiveMods: { attackSpeed: 20 }, lore: 'They twitch when you hesitate.', glyph: 'fist' },
  { id: 'sages-mask', name: 'Sage\u2019s Mask', tier: 'component', cost: 175, passiveMods: { manaRegen: 1 }, lore: 'Breathe in. The mana follows.', glyph: 'mask' },
  { id: 'ring-of-regen', name: 'Ring of Regeneration', tier: 'component', cost: 175, passiveMods: { hpRegen: 1.75 }, lore: 'A modest loop of troll-bone.', glyph: 'ring' },
  { id: 'void-stone', name: 'Void Stone', tier: 'component', cost: 800, passiveMods: { manaRegen: 2.25 }, lore: 'A pebble from nowhere, full of everything.', glyph: 'gem' },
  { id: 'energy-booster', name: 'Energy Booster', tier: 'component', cost: 800, passiveMods: { maxMana: 250 }, lore: 'A crystal that forgot how to be empty.', glyph: 'gem' },
  { id: 'vitality-booster', name: 'Vitality Booster', tier: 'component', cost: 1000, passiveMods: { maxHp: 250 }, lore: 'Warm to the touch, like a second heartbeat.', glyph: 'gem' },
  { id: 'chainmail', name: 'Chainmail', tier: 'component', cost: 550, passiveMods: { armor: 5 }, lore: 'A thousand small refusals.', glyph: 'armor' },
  { id: 'cloak', name: 'Cloak', tier: 'component', cost: 550, passiveMods: { magicResistPct: 20 }, lore: 'Woven against weather and worse.', glyph: 'cloak' },
  { id: 'shadow-amulet', name: 'Shadow Amulet', tier: 'component', cost: 1000, passiveMods: {}, lore: 'It dims the light\u2019s opinion of you.', glyph: 'gem' },
  { id: 'morbid-mask', name: 'Morbid Mask', tier: 'component', cost: 900, passiveMods: { lifestealPct: 18 }, lore: 'A hungry little face, worn in the hand.', glyph: 'mask' },
  { id: 'hyperstone', name: 'Hyperstone', tier: 'component', cost: 2000, passiveMods: { attackSpeed: 60 }, lore: 'It vibrates faster than fear.', glyph: 'gem' },
  {
    id: 'platemail', name: 'Platemail', tier: 'component', cost: 1400,
    passiveMods: { armor: 10 },
    lore: 'A fortress hammered thin enough to wear.',
    glyph: 'armor',
    appearance: { parts: ['pauldrons'], tint: '#9aa4b8' }
  },
  { id: 'ultimate-orb', name: 'Ultimate Orb', tier: 'component', cost: 2800, passiveMods: { str: 15, agi: 15, int: 15 }, lore: 'A perfect sphere of indecision: every virtue at once.', glyph: 'orb' },
  { id: 'demon-edge', name: 'Demon Edge', tier: 'component', cost: 2200, passiveMods: { damage: 40 }, lore: 'Too sharp to sheath politely.', glyph: 'blade' },
  { id: 'sacred-relic', name: 'Sacred Relic', tier: 'component', cost: 3400, passiveMods: { damage: 55 }, lore: 'A holy answer to an unholy question.', glyph: 'relic' },
  { id: 'reaver', name: 'Reaver', tier: 'component', cost: 2800, passiveMods: { str: 25 }, lore: 'A red stone that insists the body can be larger.', glyph: 'gem' },
  { id: 'eaglesong', name: 'Eaglesong', tier: 'component', cost: 2800, passiveMods: { agi: 25 }, lore: 'Feather-light, impossibly quick.', glyph: 'wing' },
  { id: 'mystic-staff', name: 'Mystic Staff', tier: 'component', cost: 2800, passiveMods: { int: 25 }, lore: 'A staff that remembers every spell cast near it.', glyph: 'staff' },
  { id: 'point-booster', name: 'Point Booster', tier: 'component', cost: 1200, passiveMods: { maxHp: 175, maxMana: 175 }, lore: 'A practical little reservoir.', glyph: 'gem' },
  { id: 'magic-stick', name: 'Magic Stick', tier: 'basic', cost: 200, charges: 0, maxCharges: 10,
    triggers: [{ on: 'on-nearby-enemy-cast', radius: 1200, chargeGain: 1 }],
    consumesAllCharges: true,
    lore: 'It drinks stray magic and shares when squeezed.',
    glyph: 'wand',
    active: {
      id: 'magic-stick-active',
      name: 'Spend Charges',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [13],
      effects: [
        { kind: 'heal', amount: 15, target: 'self', perCharge: true },
        { kind: 'mana', op: 'restore', amount: 15, target: 'self', perCharge: true }
      ],
      vfx: { archetype: 'shield', color: '#c8a0ff', scale: 0.5 }
    }
  }
];

export const ASSEMBLED: ItemDef[] = [
  {
    id: 'bracer', name: 'Bracer', tier: 'basic', cost: 505,
    components: ['gauntlets-of-strength', 'circlet'], recipeCost: 210,
    passiveMods: { str: 5, agi: 2, int: 2, maxHp: 75 },
    lore: 'Strength, buckled on.', glyph: 'band'
  },
  {
    id: 'wraith-band', name: 'Wraith Band', tier: 'basic', cost: 505,
    components: ['slippers-of-agility', 'circlet'], recipeCost: 210,
    passiveMods: { agi: 5, str: 2, int: 2, attackSpeed: 5 },
    lore: 'A ghost\u2019s grip steadies your wrist.', glyph: 'band'
  },
  {
    id: 'null-talisman', name: 'Null Talisman', tier: 'basic', cost: 505,
    components: ['mantle-of-intelligence', 'circlet'], recipeCost: 210,
    passiveMods: { int: 5, str: 2, agi: 2, maxMana: 60 },
    lore: 'A small argument against existence.', glyph: 'gem'
  },
  {
    id: 'magic-wand', name: 'Magic Wand', tier: 'basic', cost: 450,
    components: ['magic-stick', 'iron-branch', 'iron-branch'], recipeCost: 150,
    passiveMods: { str: 2, agi: 2, int: 2 },
    charges: 0, maxCharges: 20,
    triggers: [{ on: 'on-nearby-enemy-cast', radius: 1200, chargeGain: 1 }],
    consumesAllCharges: true,
    lore: 'The stick, promoted.',
    glyph: 'wand',
    active: {
      id: 'magic-wand-active',
      name: 'Spend Charges',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [13],
      effects: [
        { kind: 'heal', amount: 15, target: 'self', perCharge: true },
        { kind: 'mana', op: 'restore', amount: 15, target: 'self', perCharge: true }
      ],
      vfx: { archetype: 'shield', color: '#c8a0ff', scale: 0.5 }
    }
  },
  {
    id: 'arcane-boots', name: 'Arcane Boots', tier: 'basic', cost: 1300,
    components: ['boots-of-speed', 'energy-booster'], recipeCost: 0,
    passiveMods: { moveSpeed: 45, maxMana: 250 },
    lore: 'March on mana.', glyph: 'boot',
    active: {
      id: 'arcane-boots-active',
      name: 'Replenish Mana',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [55],
      effects: [{ kind: 'mana', op: 'restore', amount: 175, target: 'allies-in-radius', radius: 1200 }],
      vfx: { archetype: 'ground-aoe', color: '#86c8ff', scale: 0.8 }
    }
  },
  {
    id: 'yasha', name: 'Yasha', tier: 'basic', cost: 2100,
    components: ['blade-of-alacrity', 'band-of-elvenskin'], recipeCost: 650,
    passiveMods: { agi: 16, attackSpeed: 12, moveSpeedPct: 8 },
    lore: 'A blade that thinks feet should be quicker than thoughts.',
    glyph: 'blade'
  },
  {
    id: 'sange', name: 'Sange', tier: 'basic', cost: 2100,
    components: ['ogre-axe', 'belt-of-strength'], recipeCost: 650,
    passiveMods: { str: 16, statusResistPct: 12, lifestealPct: 12 },
    lore: 'A red edge for people who plan to stay in the fight.',
    glyph: 'blade'
  },
  {
    id: 'kaya', name: 'Kaya', tier: 'basic', cost: 2100,
    components: ['staff-of-wizardry', 'robe-of-the-magi'], recipeCost: 650,
    passiveMods: { int: 16, spellAmpPct: 12, manaRegen: 1.5 },
    lore: "A scholar's blade: sharpest where the hand is not.",
    glyph: 'blade'
  },
  {
    id: 'dragon-lance', name: 'Dragon Lance', tier: 'core', cost: 1900,
    components: ['blade-of-alacrity', 'belt-of-strength'], recipeCost: 450,
    passiveMods: { agi: 10, str: 6, attackRange: 140 },
    lore: 'A long answer to a short-ranged problem.',
    glyph: 'spear',
    appearance: { weapon: { kind: 'long-pole', color: '#c87842' } },
    attackVisual: [{ kind: 'ranged-conversion', color: '#ffb35c', scale: 1.05 }]
  },
  {
    id: 'mask-of-madness', name: 'Mask of Madness', tier: 'core', cost: 1900,
    components: ['morbid-mask', 'quarterstaff'], recipeCost: 125,
    passiveMods: { damage: 10, lifestealPct: 20 },
    lore: 'It screams advice. The advice is always attack.',
    glyph: 'mask',
    active: {
      id: 'mask-of-madness-active',
      name: 'Berserk',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [16],
      values: {
        duration: [6],
        attackSpeed: [110],
        move: [30],
        armorLoss: [-8]
      },
      effects: [
        { kind: 'status', status: 'silence', duration: 'duration', target: 'self' },
        { kind: 'statmod', mods: { attackSpeed: 'attackSpeed', moveSpeedPct: 'move', armor: 'armorLoss' }, duration: 'duration', target: 'self' }
      ],
      vfx: { archetype: 'shield', color: '#ff3c38', color2: '#ffd27f', scale: 0.8 }
    }
  },
  {
    id: 'blink-dagger', name: 'Blink Dagger', tier: 'core', cost: 2250,
    lore: 'A dagger that cuts distance instead of flesh. It sulks when you bleed.',
    glyph: 'dagger',
    damageLockoutSec: 3,
    active: {
      id: 'blink-active',
      name: 'Blink',
      targeting: 'point-target',
      // castable at any point; the blink effect clamps overshoot to 4/5 of 1200 (Dota rule)
      castRange: 99999,
      castPoint: 0,
      cooldown: [15],
      effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 1200 }],
      vfx: { archetype: 'global-mark', color: '#7adfff', scale: 0.7 }
    }
  },
  {
    id: 'black-king-bar', name: 'Black King Bar', tier: 'core', cost: 3975,
    components: ['ogre-axe', 'mithril-hammer'], recipeCost: 1375,
    passiveMods: { str: 10, damage: 24 },
    lore: 'A bar of dead king\u2019s gold. Spells slide off royalty.',
    glyph: 'bar',
    active: {
      id: 'bkb-active',
      name: 'Avatar',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [75],
      values: { duration: [6] },
      effects: [
        { kind: 'status', status: 'magic-immune', duration: 'duration', target: 'self', params: { basicDispelOnApply: true, tag: 'bkb-avatar' } }
      ],
      vfx: { archetype: 'shield', color: '#ffd27f', color2: '#b8860b', scale: 1 }
    }
  },
  {
    id: 'euls-scepter', name: 'Eul\u2019s Scepter of Divinity', tier: 'core', cost: 2725,
    components: ['staff-of-wizardry', 'void-stone', 'sages-mask'], recipeCost: 750,
    passiveMods: { int: 10, manaRegen: 2.5, moveSpeed: 20 },
    lore: 'The wind obeys whoever holds the scepter, and mocks everyone else.',
    glyph: 'cyclone',
    active: {
      id: 'euls-active',
      name: 'Cyclone',
      targeting: 'unit-target',
      affects: 'any',
      castRange: 575,
      castPoint: 0,
      cooldown: [23],
      manaCost: [175],
      effects: [{ kind: 'status', status: 'cyclone', duration: 2.5, target: 'target' }],
      vfx: { archetype: 'storm', color: '#9fe8e8', color2: '#e8fbff', scale: 0.8 }
    }
  },
  {
    id: 'force-staff', name: 'Force Staff', tier: 'core', cost: 2200,
    components: ['staff-of-wizardry', 'ring-of-regen'], recipeCost: 1025,
    passiveMods: { int: 10, hpRegen: 2.5 },
    lore: 'It pushes. Friend, foe, self \u2014 physics does not take sides.',
    glyph: 'staff',
    appearance: { parts: ['boot-trail'], tint: '#9fd0ec' },
    active: {
      id: 'force-staff-active',
      name: 'Force',
      targeting: 'unit-target',
      affects: 'any',
      castRange: 750,
      castPoint: 0,
      cooldown: [19],
      manaCost: [100],
      effects: [{ kind: 'displace', mode: 'forced', target: 'target', toward: 'facing', distance: 600, speed: 1500 }],
      vfx: { archetype: 'beam', color: '#9fe85c', scale: 0.8 }
    }
  },
  {
    id: 'glimmer-cape', name: 'Glimmer Cape', tier: 'core', cost: 1950,
    components: ['cloak', 'shadow-amulet'], recipeCost: 400,
    passiveMods: { magicResistPct: 20 },
    lore: 'Woven from dusk. Wrap a friend in it and watch them stop existing.',
    glyph: 'cloak',
    active: {
      id: 'glimmer-active',
      name: 'Glimmer',
      targeting: 'unit-target',
      affects: 'ally',
      castRange: 800,
      castPoint: 0,
      cooldown: [14],
      manaCost: [90],
      effects: [
        { kind: 'status', status: 'invis', duration: 5, target: 'target', params: { fadeTime: 0.6, threatDropPct: 45 } },
        { kind: 'statmod', mods: { magicResistPct: 45 }, duration: 5, target: 'target' }
      ],
      vfx: { archetype: 'shield', color: '#b89fff', color2: '#4a3a78', scale: 0.8 }
    }
  },
  {
    id: 'mekansm', name: 'Mekansm', tier: 'core', cost: 1875,
    components: ['chainmail', 'ring-of-regen', 'ring-of-regen'], recipeCost: 975,
    passiveMods: { armor: 5, hpRegen: 3.5 },
    aura: { radius: 1200, affects: 'allies', mods: { hpRegen: 2 } },
    lore: 'A whirring heart of brass that believes in the whole party.',
    glyph: 'gear',
    active: {
      id: 'mekansm-active',
      name: 'Restore',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [65],
      manaCost: [100],
      effects: [{ kind: 'heal', amount: 300, target: 'allies-in-radius', radius: 1200 }],
      vfx: { archetype: 'ground-aoe', color: '#7dffb5', color2: '#e7d9a8', scale: 1 }
    }
  },
  {
    id: 'battlefury', name: 'Battlefury', tier: 'core', cost: 3975,
    components: ['broadsword', 'claymore', 'quarterstaff'], recipeCost: 750,
    passiveMods: { damage: 50, hpRegen: 7.5, manaRegen: 3 },
    attackMod: { cleave: { pct: 60, radius: 600 } },
    lore: 'An axe with opinions about crowds.',
    glyph: 'axe',
    appearance: { weapon: { kind: 'broad-cleaver', color: '#c8cdd8' } },
    attackVisual: [{ kind: 'cleave-sweep', color: '#d8dde8', scale: 1.25 }]
  },
  {
    id: 'crystalys', name: 'Crystalys', tier: 'core', cost: 1900,
    components: ['broadsword', 'blades-of-attack'], recipeCost: 450,
    passiveMods: { damage: 32 },
    attackMod: { critChance: 20, critMult: 160 },
    lore: 'A blade of living crystal that sings on the lucky swings.',
    glyph: 'blade',
    appearance: { parts: ['crystal-edge'], tint: '#ffccd8' },
    attackVisual: [{ kind: 'crit-lunge', color: '#ff5f5f', color2: '#ffffff', scale: 0.85 }]
  },
  {
    id: 'diffusal-blade', name: 'Diffusal Blade', tier: 'core', cost: 2500,
    components: ['blade-of-alacrity', 'blade-of-alacrity'], recipeCost: 500,
    passiveMods: { agi: 20 },
    attackMod: { manaBurnPerHit: 40, manaBurnAsDamagePct: 100 },
    lore: 'It drinks spells out of the blood.',
    glyph: 'blade',
    active: {
      id: 'diffusal-active',
      name: 'Inhibit',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 600,
      castPoint: 0,
      cooldown: [15],
      effects: [
        { kind: 'purge', target: 'target' },
        { kind: 'status', status: 'slow', duration: 3, target: 'target', params: { moveSlowPct: 50 } }
      ],
      vfx: { archetype: 'beam', color: '#c8a0ff', color2: '#7a5cc8', scale: 0.7 }
    }
  },
  {
    id: 'maelstrom', name: 'Maelstrom', tier: 'core', cost: 2950,
    components: ['mithril-hammer', 'gloves-of-haste'], recipeCost: 900,
    passiveMods: { damage: 24, attackSpeed: 20 },
    attackMod: { procChance: 30, procDamage: 140 },
    lore: 'A hammer with a storm trapped in the head. It leaks.',
    glyph: 'hammer',
    appearance: { weapon: { kind: 'storm-haft', color: '#7ddcff', emissive: '#244b7a' }, aura: { archetype: 'storm', color: '#7ddcff', color2: '#ffffff' } },
    attackVisual: [{ kind: 'lightning-bounce', color: '#7ddcff', color2: '#ffffff', scale: 1.1 }],
    elementOnHit: 'electro'
  },
  {
    id: 'drum-of-endurance', name: 'Drum of Endurance', tier: 'basic', cost: 1650,
    components: ['crown', 'sages-mask'], recipeCost: 1025,
    passiveMods: { str: 4, agi: 4, int: 4 },
    aura: { radius: 1200, affects: 'allies', mods: { moveSpeed: 20 } },
    charges: 4,
    lore: 'Its beat keeps tired legs honest.',
    glyph: 'drum',
    active: {
      id: 'drums-active',
      name: 'Endurance',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [60],
      effects: [
        { kind: 'statmod', mods: { moveSpeedPct: 13, attackSpeed: 45 }, duration: 6, target: 'allies-in-radius', radius: 1200 }
      ],
      vfx: { archetype: 'ground-aoe', color: '#ffb35c', scale: 0.9 }
    }
  },
  {
    id: 'vladmirs-offering', name: 'Vladmir\u2019s Offering', tier: 'core', cost: 2175,
    components: ['ring-of-regen', 'sages-mask', 'blades-of-attack'], recipeCost: 1375,
    passiveMods: { hpRegen: 1.75, manaRegen: 1 },
    aura: { radius: 1200, affects: 'allies', mods: { lifestealPct: 15, damagePct: 12, armor: 3 } },
    lore: 'A fanged chalice that tithes every wound.',
    glyph: 'fang'
  },
  {
    id: 'assault-cuirass', name: 'Assault Cuirass', tier: 'core', cost: 5500,
    components: ['hyperstone', 'platemail', 'chainmail'], recipeCost: 1550,
    passiveMods: { armor: 10, attackSpeed: 30 },
    aura: { radius: 1200, affects: 'allies', mods: { armor: 5, attackSpeed: 25 } },
    lore: 'A marching fortress with a heartbeat.',
    glyph: 'armor',
    appearance: { parts: ['pauldrons'], tint: '#d4d9e6', aura: { archetype: 'shield', color: '#d4d9e6', color2: '#ffd86a' } }
  },
  {
    id: 'divine-rapier', name: 'Divine Rapier', tier: 'core', cost: 6200,
    components: ['sacred-relic', 'demon-edge'], recipeCost: 600,
    passiveMods: { damage: 350 },
    lore: 'A victory condition with a handle. It drops when pride dies.',
    glyph: 'blade',
    appearance: { weapon: { kind: 'glowing-blade', color: '#ffe27d', emissive: '#806a18' }, aura: { archetype: 'global-mark', color: '#ffe27d', color2: '#ffffff' } },
    attackVisual: [{ kind: 'tinted-impact', color: '#ffe27d', color2: '#ffffff', scale: 1.35 }]
  },
  {
    id: 'butterfly', name: 'Butterfly', tier: 'core', cost: 5375,
    components: ['eaglesong', 'quarterstaff', 'quarterstaff'], recipeCost: 825,
    passiveMods: { agi: 35, damage: 25, attackSpeed: 35, evasionPct: 35 },
    lore: 'The blade misses because you have already left.',
    glyph: 'wing',
    appearance: { parts: ['wing-blades'], tint: '#c8ffd8' },
    attackVisual: [{ kind: 'crit-lunge', color: '#95ffbc', color2: '#ffffff', scale: 1.15 }]
  },
  {
    id: 'scythe-of-vyse', name: 'Scythe of Vyse', tier: 'core', cost: 7075,
    components: ['mystic-staff', 'ultimate-orb', 'void-stone'], recipeCost: 675,
    passiveMods: { int: 30, str: 15, agi: 15, manaRegen: 5 },
    lore: 'Scholarship, sharpened into livestock.',
    glyph: 'scythe',
    appearance: { weapon: { kind: 'staff', color: '#c8a0ff', emissive: '#3d145e' }, parts: ['hex-sigil'], aura: { archetype: 'beam', color: '#c8a0ff', color2: '#ffffff' } },
    active: {
      id: 'hex-active',
      name: 'Hex',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 800,
      castPoint: 0,
      cooldown: [22],
      manaCost: [250],
      effects: [{ kind: 'status', status: 'hex', duration: 3.5, target: 'target' }],
      vfx: { archetype: 'beam', color: '#c8a0ff', scale: 0.8 },
      anim: 'item-use',
      sound: 'item'
    }
  },
  {
    id: 'heart-of-tarrasque', name: 'Heart of Tarrasque', tier: 'core', cost: 5175,
    components: ['reaver', 'vitality-booster', 'ring-of-regen'], recipeCost: 1200,
    passiveMods: { str: 40, maxHp: 250, hpRegenPctMax: 1.6 },
    lore: 'The old beast is dead. Its stubbornness is not.',
    glyph: 'heart',
    appearance: { parts: ['heart-core'], aura: { archetype: 'shield', color: '#c83a3a', color2: '#ffb08a' } }
  },
  {
    id: 'eye-of-skadi', name: 'Eye of Skadi', tier: 'core', cost: 7475,
    components: ['ultimate-orb', 'ultimate-orb', 'point-booster'], recipeCost: 675,
    passiveMods: { str: 22, agi: 22, int: 22, maxHp: 220, maxMana: 220 },
    attackMod: { procChance: 100, procStatus: { status: 'slow', duration: 2.5, params: { moveSlowPct: 35, attackSlowPct: 35, tag: 'skadi-cold' } } },
    lore: 'A cold eye that teaches every strike to linger.',
    glyph: 'orb',
    appearance: { parts: ['frost-shards'], tint: '#a8e8ff', aura: { archetype: 'storm', color: '#a8e8ff', color2: '#ffffff' } },
    attackVisual: [{ kind: 'tinted-impact', color: '#a8e8ff', color2: '#ffffff', scale: 1.05 }],
    elementOnHit: 'cryo'
  },
  {
    id: 'refresher-orb', name: 'Refresher Orb', tier: 'core', cost: 6275,
    components: ['mystic-staff', 'void-stone', 'void-stone'], recipeCost: 1875,
    passiveMods: { int: 25, manaRegen: 6 },
    lore: 'A second chance for every cooldown.',
    glyph: 'orb',
    active: {
      id: 'refresher-active',
      name: 'Refresh',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [180],
      manaCost: [300],
      effects: [{ kind: 'exotic', id: 'refresh-cooldowns' }],
      vfx: { archetype: 'global-mark', color: '#8ee8ff', scale: 1 },
      anim: 'item-use',
      sound: 'item'
    }
  },
  {
    id: 'aghanims-scepter', name: "Aghanim's Scepter", tier: 'core', cost: 5800,
    components: ['point-booster', 'ogre-axe', 'staff-of-wizardry', 'blade-of-alacrity'], recipeCost: 1600,
    passiveMods: { str: 10, agi: 10, int: 10, maxHp: 175, maxMana: 175 },
    lore: 'A blue invitation for a hero to become more themselves.',
    glyph: 'staff',
    appearance: { parts: ['mana-orb'], tint: '#73d9ff', aura: { archetype: 'global-mark', color: '#73d9ff', color2: '#ffffff' } }
  },
  {
    id: 'aegis-of-the-immortal', name: 'Aegis of the Immortal', tier: 'core', cost: 0,
    lore: 'A held promise: die once, stand once.',
    glyph: 'shield'
  },
  {
    id: 'refresher-shard', name: 'Refresher Shard', tier: 'consumable', cost: 0,
    charges: 1,
    lore: 'A smaller second chance, won from the pit.',
    glyph: 'shard'
  },
  {
    id: 'cheese', name: 'Cheese', tier: 'consumable', cost: 0,
    charges: 1,
    lore: 'Improbably dense, extremely reassuring.',
    glyph: 'cheese',
    active: {
      id: 'cheese-active',
      name: 'Eat Cheese',
      targeting: 'no-target',
      castPoint: 0,
      cooldown: [1],
      effects: [{ kind: 'heal', amount: 2500, target: 'self' }, { kind: 'mana', op: 'restore', amount: 1500, target: 'self' }],
      vfx: { archetype: 'shield', color: '#fff29a', scale: 0.8 },
      anim: 'item-use',
      sound: 'item'
    }
  }
];

export const EXTENDED_COMPONENTS: ItemDef[] = [
  { id: 'ring-of-protection', name: 'Ring of Protection', tier: 'component', cost: 175, passiveMods: { armor: 1 }, lore: 'A small brass circle that says no to the first chip of steel.', glyph: 'ring' },
  { id: 'ring-of-health', name: 'Ring of Health', tier: 'component', cost: 700, passiveMods: { hpRegen: 6.5 }, lore: 'Warm metal, steady pulse.', glyph: 'ring' },
  { id: 'gem-of-true-sight', name: 'Gem of True Sight', tier: 'component', cost: 900, passiveMods: { visionPct: 15 }, lore: 'It sees what the map would rather keep secret.', glyph: 'eye' },
  {
    id: 'helm-of-iron-will', name: 'Helm of Iron Will', tier: 'component', cost: 925,
    components: ['chainmail', 'ring-of-regen'], recipeCost: 200,
    passiveMods: { armor: 5, hpRegen: 5 },
    lore: 'A helmet for people who intend to keep walking forward.', glyph: 'helm'
  },
  {
    id: 'oblivion-staff', name: 'Oblivion Staff', tier: 'basic', cost: 1625,
    components: ['quarterstaff', 'robe-of-the-magi', 'sages-mask'], recipeCost: 125,
    passiveMods: { damage: 10, attackSpeed: 10, int: 6, manaRegen: 1 },
    lore: 'A staff that turns concentration into tempo.', glyph: 'staff'
  },
  { id: 'talisman-of-evasion', name: 'Talisman of Evasion', tier: 'component', cost: 1300, passiveMods: { evasionPct: 16 }, lore: 'Hold it right and blades choose someone else.', glyph: 'wing' },
  {
    id: 'javelin', name: 'Javelin', tier: 'component', cost: 1100,
    passiveMods: { damage: 10 },
    attackMod: { procChance: 25, procDamage: 70 },
    lore: 'A point-first argument with a habit of punching through armor.', glyph: 'spear',
    attackVisual: [{ kind: 'tinted-impact', color: '#f0d37a', scale: 0.75 }]
  },
  { id: 'blitz-knuckles', name: 'Blitz Knuckles', tier: 'component', cost: 1000, passiveMods: { attackSpeed: 35 }, lore: 'They make hesitation feel physically uncomfortable.', glyph: 'fist' },
  {
    id: 'perseverance', name: 'Perseverance', tier: 'basic', cost: 1650,
    components: ['ring-of-health', 'void-stone'], recipeCost: 150,
    passiveMods: { hpRegen: 6.5, manaRegen: 2.25 },
    lore: 'Health and mana, both taught to come back.', glyph: 'ring'
  },
  {
    id: 'headdress', name: 'Headdress', tier: 'basic', cost: 425,
    components: ['ring-of-regen'], recipeCost: 250,
    passiveMods: { hpRegen: 1.75 },
    aura: { radius: 1200, affects: 'allies', mods: { hpRegen: 2 } },
    lore: 'A little team medicine stitched into a circlet.', glyph: 'helm'
  },
  {
    id: 'buckler', name: 'Buckler', tier: 'basic', cost: 425,
    components: ['ring-of-protection'], recipeCost: 250,
    passiveMods: { armor: 1 },
    aura: { radius: 1200, affects: 'allies', mods: { armor: 2 } },
    lore: 'Small shield, wide confidence.', glyph: 'shield'
  },
  {
    id: 'ring-of-basilius', name: 'Ring of Basilius', tier: 'basic', cost: 425,
    components: ['sages-mask', 'ring-of-protection'], recipeCost: 75,
    passiveMods: { manaRegen: 1, armor: 1 },
    aura: { radius: 1200, affects: 'allies', mods: { manaRegen: 1 } },
    lore: 'A modest aura for lanes that plan to last.', glyph: 'ring'
  }
];

export const EXTENDED_ASSEMBLED: ItemDef[] = [
  {
    id: 'power-treads', name: 'Power Treads', tier: 'basic', cost: 1400,
    components: ['boots-of-speed', 'gloves-of-haste', 'belt-of-strength'], recipeCost: 0,
    passiveMods: { moveSpeed: 45, attackSpeed: 25, str: 10 },
    lore: 'Fast boots with a strength bias; the toggle is simplified into raw tread power.', glyph: 'boot',
    appearance: { parts: ['boot-trail'], tint: '#d84747' }
  },
  {
    id: 'phase-boots', name: 'Phase Boots', tier: 'basic', cost: 1500,
    components: ['boots-of-speed', 'blades-of-attack', 'chainmail'], recipeCost: 0,
    passiveMods: { moveSpeed: 45, damage: 9, armor: 5 },
    lore: 'They do not ask the crowd to move; they move through it.', glyph: 'boot',
    active: {
      id: 'phase-boots-active', name: 'Phase', targeting: 'no-target', castPoint: 0, cooldown: [8],
      effects: [{ kind: 'statmod', mods: { moveSpeedPct: 22 }, duration: 3, target: 'self' }],
      vfx: { archetype: 'shield', color: '#ffb35c', scale: 0.55 }
    },
    appearance: { parts: ['boot-trail'], tint: '#ffb35c' }
  },
  {
    id: 'tranquil-boots', name: 'Tranquil Boots', tier: 'basic', cost: 1100,
    components: ['boots-of-speed', 'ring-of-regen', 'ring-of-protection'], recipeCost: 250,
    passiveMods: { moveSpeed: 55, hpRegen: 12, armor: 1 },
    lore: 'Quiet feet, quick recovery.', glyph: 'boot',
    damageLockoutSec: 3,
    appearance: { parts: ['boot-trail'], tint: '#9ff0b0' }
  },
  {
    id: 'boots-of-travel', name: 'Boots of Travel', tier: 'core', cost: 2500,
    components: ['boots-of-speed'], recipeCost: 2000,
    passiveMods: { moveSpeed: 90 },
    lore: 'The map folds under your heel.', glyph: 'boot',
    active: {
      id: 'travel-boots-active', name: 'Town Portal', targeting: 'point-target', castRange: 5000, castPoint: 1.2, cooldown: [40], manaCost: [75],
      effects: [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 5000 }],
      vfx: { archetype: 'global-mark', color: '#73d9ff', scale: 0.9 }
    },
    appearance: { parts: ['boot-trail'], tint: '#73d9ff' }
  },
  {
    id: 'guardian-greaves', name: 'Guardian Greaves', tier: 'core', cost: 5050,
    components: ['arcane-boots', 'mekansm', 'headdress'], recipeCost: 1450,
    passiveMods: { moveSpeed: 45, maxMana: 250, armor: 5, hpRegen: 5 },
    aura: { radius: 1200, affects: 'allies', mods: { hpRegen: 3, armor: 3 } },
    lore: 'A full-party reset strapped to a pair of boots.', glyph: 'boot',
    active: {
      id: 'guardian-greaves-active', name: 'Mend', targeting: 'no-target', castPoint: 0, cooldown: [65], manaCost: [100],
      effects: [
        { kind: 'purge', target: 'allies-in-radius' },
        { kind: 'heal', amount: 350, target: 'allies-in-radius', radius: 1200 },
        { kind: 'mana', op: 'restore', amount: 200, target: 'allies-in-radius', radius: 1200 }
      ],
      vfx: { archetype: 'ground-aoe', color: '#7dffb5', color2: '#86c8ff', scale: 1.1 }
    },
    appearance: { parts: ['boot-trail', 'pauldrons'], tint: '#7dffb5' }
  },
  {
    id: 'vanguard', name: 'Vanguard', tier: 'core', cost: 1825,
    components: ['ring-of-health', 'vitality-booster'], recipeCost: 125,
    passiveMods: { maxHp: 250, hpRegen: 6.5, attackDamageTakenReductionPct: 12 },
    lore: 'It turns chip damage into background noise.', glyph: 'shield',
    appearance: { parts: ['pauldrons'], tint: '#b46a3c' }
  },
  {
    id: 'hood-of-defiance', name: 'Hood of Defiance', tier: 'core', cost: 1700,
    components: ['ring-of-regen', 'cloak', 'helm-of-iron-will'], recipeCost: 50,
    passiveMods: { hpRegen: 6.75, armor: 5, magicResistPct: 20 },
    lore: 'A hood for walking into spellfire first.', glyph: 'cloak',
    active: {
      id: 'hood-active', name: 'Barrier', targeting: 'no-target', castPoint: 0, cooldown: [60],
      effects: [{ kind: 'statmod', mods: { magicResistPct: 35 }, duration: 8, target: 'self' }],
      vfx: { archetype: 'shield', color: '#8ee8ff', scale: 0.8 }
    }
  },
  {
    id: 'pipe-of-insight', name: 'Pipe of Insight', tier: 'core', cost: 3475,
    components: ['hood-of-defiance', 'headdress'], recipeCost: 1350,
    passiveMods: { hpRegen: 8, magicResistPct: 25 },
    aura: { radius: 1200, affects: 'allies', mods: { magicResistPct: 10, hpRegen: 2 } },
    lore: 'The team breathes in, and the next spell breaks softer.', glyph: 'pipe',
    appearance: { parts: ['pauldrons'], tint: '#8ee8ff', aura: { archetype: 'shield', color: '#8ee8ff', color2: '#ffffff' } },
    active: {
      id: 'pipe-active', name: 'Insight Barrier', targeting: 'no-target', castPoint: 0, cooldown: [60], manaCost: [100],
      effects: [{ kind: 'statmod', mods: { magicResistPct: 35, damageTakenReductionPct: 12 }, duration: 10, target: 'allies-in-radius', radius: 1200 }],
      vfx: { archetype: 'ground-aoe', color: '#8ee8ff', color2: '#ffffff', scale: 1.05 }
    }
  },
  {
    id: 'crimson-guard', name: 'Crimson Guard', tier: 'core', cost: 3675,
    components: ['vanguard', 'buckler'], recipeCost: 1425,
    passiveMods: { maxHp: 250, hpRegen: 6.5, armor: 3, attackDamageTakenReductionPct: 12 },
    aura: { radius: 1200, affects: 'allies', mods: { armor: 2 } },
    lore: 'A shield wall condensed into one press.', glyph: 'shield',
    appearance: { parts: ['pauldrons'], tint: '#d84a42' },
    active: {
      id: 'crimson-active', name: 'Guard', targeting: 'no-target', castPoint: 0, cooldown: [35],
      effects: [{ kind: 'statmod', mods: { attackDamageTakenReductionPct: 28, armor: 4 }, duration: 10, target: 'allies-in-radius', radius: 1200 }],
      vfx: { archetype: 'ground-aoe', color: '#d84a42', color2: '#ffd0a0', scale: 1 }
    }
  },
  {
    id: 'shivas-guard', name: "Shiva's Guard", tier: 'core', cost: 4950,
    components: ['platemail', 'mystic-staff'], recipeCost: 750,
    passiveMods: { armor: 15, int: 25 },
    aura: { radius: 900, affects: 'enemies', mods: { attackSpeed: -35 } },
    lore: 'A frozen sermon delivered in armor.', glyph: 'armor',
    appearance: { parts: ['frost-shards', 'pauldrons'], tint: '#bfeaff', aura: { archetype: 'storm', color: '#bfeaff', color2: '#ffffff' } },
    active: {
      id: 'shivas-active', name: 'Arctic Blast', targeting: 'no-target', castPoint: 0, cooldown: [30], manaCost: [100],
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 200, target: 'enemies-in-radius', radius: 900 },
        { kind: 'status', status: 'slow', duration: 4, target: 'enemies-in-radius', radius: 900, params: { moveSlowPct: 40 } }
      ],
      vfx: { archetype: 'storm', color: '#a8e8ff', color2: '#ffffff', scale: 1.1 }
    },
    elementOnHit: 'cryo'
  },
  {
    id: 'lotus-orb', name: 'Lotus Orb', tier: 'core', cost: 5200,
    components: ['platemail', 'mystic-staff'], recipeCost: 1000,
    passiveMods: { armor: 10, int: 25, manaRegen: 2 },
    lore: 'A mirrored flower. Until reflect scripting lands, it gives the dispel-and-shield half of the promise.', glyph: 'orb',
    appearance: { parts: ['mana-orb'], tint: '#ff86d8', aura: { archetype: 'shield', color: '#5ad8c8', color2: '#ffffff' } },
    active: {
      id: 'lotus-active', name: 'Echo Shell', targeting: 'unit-target', affects: 'ally', castRange: 900, castPoint: 0, cooldown: [15], manaCost: [175],
      effects: [
        { kind: 'purge', target: 'target' },
        { kind: 'statmod', mods: { magicResistPct: 35, statusResistPct: 35 }, duration: 6, target: 'target' }
      ],
      vfx: { archetype: 'shield', color: '#ff86d8', color2: '#ffffff', scale: 0.85 }
    }
  },
  {
    id: 'linkens-sphere', name: "Linken's Sphere", tier: 'core', cost: 5800,
    components: ['perseverance', 'ultimate-orb'], recipeCost: 1350,
    passiveMods: { str: 15, agi: 15, int: 15, hpRegen: 6.5, manaRegen: 2.25 },
    lore: 'A private answer to the next spell aimed at you.', glyph: 'orb',
    appearance: { parts: ['mana-orb'], tint: '#b7a0ff' },
    active: {
      id: 'linkens-active', name: 'Transfer Shield', targeting: 'unit-target', affects: 'ally', castRange: 700, castPoint: 0, cooldown: [12], manaCost: [100],
      effects: [{ kind: 'status', status: 'magic-immune', duration: 1.2, target: 'target' }],
      vfx: { archetype: 'shield', color: '#b7a0ff', color2: '#ffffff', scale: 0.75 }
    }
  },
  {
    id: 'aeon-disk', name: 'Aeon Disk', tier: 'core', cost: 3000,
    components: ['vitality-booster', 'platemail'], recipeCost: 600,
    passiveMods: { maxHp: 250, armor: 10, statusResistPct: 20 },
    lore: 'A panic button with a philosopher inside.', glyph: 'disc',
    active: {
      id: 'aeon-active', name: 'Combo Breaker', targeting: 'no-target', castPoint: 0, cooldown: [105],
      effects: [
        { kind: 'statmod', mods: { damageTakenReductionPct: 75, damagePct: -100 }, duration: 2.5, target: 'self' },
        { kind: 'status', status: 'disarm', duration: 2.5, target: 'self' }
      ],
      vfx: { archetype: 'global-mark', color: '#ffd27f', color2: '#ffffff', scale: 0.85 }
    }
  },
  {
    id: 'eternal-shroud', name: 'Eternal Shroud', tier: 'core', cost: 3200,
    components: ['hood-of-defiance', 'vitality-booster'], recipeCost: 500,
    passiveMods: { maxHp: 250, hpRegen: 6.75, armor: 5, magicResistPct: 30, manaRegen: 1.5 },
    lore: 'Spellfire goes in. Stamina comes out.', glyph: 'cloak',
    active: {
      id: 'eternal-shroud-active', name: 'Shroud', targeting: 'no-target', castPoint: 0, cooldown: [45],
      effects: [{ kind: 'statmod', mods: { magicResistPct: 45, manaRegen: 8 }, duration: 8, target: 'self' }],
      vfx: { archetype: 'shield', color: '#5fe0c0', color2: '#ffffff', scale: 0.8 }
    }
  },
  {
    id: 'manta-style', name: 'Manta Style', tier: 'core', cost: 5750,
    components: ['yasha', 'ultimate-orb'], recipeCost: 850,
    passiveMods: { agi: 26, str: 10, int: 10, attackSpeed: 12, moveSpeedPct: 8 },
    lore: 'Step sideways out of yourself and make the enemy count wrong.', glyph: 'mirror',
    active: {
      id: 'manta-active', name: 'Mirror Image', targeting: 'no-target', castPoint: 0, cooldown: [34], manaCost: [125],
      effects: [
        { kind: 'purge', target: 'self' },
        { kind: 'summon', at: 'self', count: 2, summon: { id: 'manta-illusion', name: 'Manta Illusion', lifetime: 18, stats: { maxHp: 520, damage: 35, armor: 1, moveSpeed: 330, attackRange: 150, baseAttackTime: 1.7 }, silhouette: { build: 'biped', scale: 0.86, bodyShape: 'slim', head: 'hood', weapon: 'sword' }, palette: ['#87d8ff', '#ffffff', '#4a5d8a'] } }
      ],
      vfx: { archetype: 'summon-pop', color: '#87d8ff', color2: '#ffffff', scale: 0.9 }
    }
  },
  { id: 'sange-and-yasha', name: 'Sange and Yasha', tier: 'core', cost: 4800, components: ['sange', 'yasha'], recipeCost: 600, passiveMods: { str: 16, agi: 16, attackSpeed: 18, moveSpeedPct: 10, statusResistPct: 15, lifestealPct: 12 }, lore: 'Red edge, quick edge, one rhythm.', glyph: 'blade', attackVisual: [{ kind: 'crit-lunge', color: '#ff6b4a', color2: '#8fd8ff', scale: 0.9 }] },
  { id: 'kaya-and-sange', name: 'Kaya and Sange', tier: 'core', cost: 4800, components: ['kaya', 'sange'], recipeCost: 600, passiveMods: { int: 16, str: 16, spellAmpPct: 16, manaRegen: 1.5, statusResistPct: 15, lifestealPct: 12 }, lore: 'One blade for the spell, one for surviving the reply.', glyph: 'blade' },
  { id: 'yasha-and-kaya', name: 'Yasha and Kaya', tier: 'core', cost: 4800, components: ['yasha', 'kaya'], recipeCost: 600, passiveMods: { agi: 16, int: 16, attackSpeed: 18, moveSpeedPct: 10, spellAmpPct: 16, manaRegen: 1.5 }, lore: 'A caster-carry compromise that refuses to be slow.', glyph: 'blade' },
  {
    id: 'desolator', name: 'Desolator', tier: 'core', cost: 4500,
    components: ['demon-edge', 'blitz-knuckles'], recipeCost: 1300,
    passiveMods: { damage: 50, attackSpeed: 15 },
    attackMod: { procChance: 100, procStatus: { status: 'buff', duration: 7, params: { mods: { armor: -6 }, tag: 'desolator-armor' } } },
    lore: 'It leaves armor as a memory.', glyph: 'blade',
    appearance: { weapon: { kind: 'glowing-blade', color: '#d92727', emissive: '#5a0808' } },
    attackVisual: [{ kind: 'tinted-impact', color: '#d92727', color2: '#ffb0a0', scale: 1.05 }]
  },
  {
    id: 'daedalus', name: 'Daedalus', tier: 'core', cost: 5300,
    components: ['crystalys', 'demon-edge'], recipeCost: 1200,
    passiveMods: { damage: 88 },
    attackMod: { critChance: 30, critMult: 225 },
    lore: 'The crit is not luck. It is architecture.', glyph: 'blade',
    appearance: { parts: ['crystal-edge'], tint: '#ff6f86' },
    attackVisual: [{ kind: 'crit-lunge', color: '#ff4f6f', color2: '#ffffff', scale: 1.35 }]
  },
  {
    id: 'monkey-king-bar', name: 'Monkey King Bar', tier: 'core', cost: 5300,
    components: ['javelin', 'javelin', 'demon-edge'], recipeCost: 900,
    passiveMods: { damage: 52, attackSpeed: 35 },
    attackMod: { procChance: 80, procDamage: 70 },
    lore: 'A staff that finds the target even through excuses.', glyph: 'staff',
    appearance: { weapon: { kind: 'staff', color: '#f0d36a', emissive: '#7a5a12' } },
    attackVisual: [{ kind: 'tinted-impact', color: '#f0d36a', color2: '#ffffff', scale: 0.95 }]
  },
  {
    id: 'skull-basher', name: 'Skull Basher', tier: 'core', cost: 2300,
    components: ['javelin', 'belt-of-strength'], recipeCost: 750,
    passiveMods: { damage: 25, str: 10 },
    attackMod: { procChance: 25, procDamage: 70, procStatus: { status: 'stun', duration: 1.1 } },
    lore: 'Subtlety, with teeth.', glyph: 'hammer',
    attackVisual: [{ kind: 'tinted-impact', color: '#d8c0a0', scale: 1 }]
  },
  {
    id: 'abyssal-blade', name: 'Abyssal Blade', tier: 'core', cost: 6650,
    components: ['skull-basher', 'reaver', 'vitality-booster'], recipeCost: 550,
    passiveMods: { damage: 35, str: 35, maxHp: 250 },
    attackMod: { procChance: 25, procDamage: 90, procStatus: { status: 'stun', duration: 1.2 } },
    lore: 'A bash upgraded into a decision.', glyph: 'blade',
    active: {
      id: 'abyssal-active', name: 'Overwhelm', targeting: 'unit-target', affects: 'enemy', castRange: 150, castPoint: 0, cooldown: [35],
      effects: [{ kind: 'status', status: 'stun', duration: 2, target: 'target' }, { kind: 'damage', dtype: 'physical', amount: 120, target: 'target' }],
      vfx: { archetype: 'stun-stars', color: '#8a3cff', color2: '#ffffff', scale: 0.9 }
    },
    attackVisual: [{ kind: 'tinted-impact', color: '#8a3cff', color2: '#ffffff', scale: 1.2 }]
  },
  {
    id: 'mjollnir', name: 'Mjollnir', tier: 'core', cost: 5600,
    components: ['maelstrom', 'hyperstone'], recipeCost: 650,
    passiveMods: { damage: 24, attackSpeed: 80 },
    attackMod: { procChance: 35, procDamage: 180 },
    lore: 'A storm that has learned to sit still until swung.', glyph: 'hammer',
    active: {
      id: 'mjollnir-active', name: 'Static Charge', targeting: 'unit-target', affects: 'ally', castRange: 800, castPoint: 0, cooldown: [35], manaCost: [50],
      values: { dps: [80], radius: [450] },
      effects: [{ kind: 'status', status: 'buff', duration: 15, target: 'target', params: { tag: 'mjollnir-shield', periodic: { interval: 1, effects: [{ kind: 'damage', dtype: 'magical', amount: 'dps', target: 'enemies-in-radius', radius: 'radius' }] } } }],
      vfx: { archetype: 'storm', color: '#7ddcff', color2: '#ffffff', scale: 0.8 }
    },
    appearance: { weapon: { kind: 'storm-haft', color: '#7ddcff', emissive: '#244b7a' }, aura: { archetype: 'storm', color: '#7ddcff', color2: '#ffffff' } },
    attackVisual: [{ kind: 'lightning-bounce', color: '#7ddcff', color2: '#ffffff', scale: 1.25 }],
    elementOnHit: 'electro'
  },
  {
    id: 'satanic', name: 'Satanic', tier: 'core', cost: 6200,
    components: ['sange', 'morbid-mask', 'reaver'], recipeCost: 400,
    passiveMods: { str: 41, statusResistPct: 15, lifestealPct: 25 },
    lore: 'Survive by taking back every wound.', glyph: 'mask',
    appearance: { tint: '#7a1414', aura: { archetype: 'shield', color: '#b01818', color2: '#ffb08a' } },
    attackVisual: [{ kind: 'tinted-impact', color: '#b01818', color2: '#ff9a5a', scale: 1 }],
    active: {
      id: 'satanic-active', name: 'Unholy Rage', targeting: 'no-target', castPoint: 0, cooldown: [35],
      effects: [{ kind: 'statmod', mods: { lifestealPct: 150, damageTakenReductionPct: 10 }, duration: 6, target: 'self' }],
      vfx: { archetype: 'shield', color: '#b01818', color2: '#ffb08a', scale: 0.9 }
    }
  },
  {
    id: 'silver-edge', name: 'Silver Edge', tier: 'core', cost: 4600,
    components: ['shadow-amulet', 'crystalys', 'blitz-knuckles'], recipeCost: 700,
    passiveMods: { damage: 32, attackSpeed: 35 },
    attackMod: { critChance: 20, critMult: 160, procStatus: { status: 'break', duration: 4 } },
    lore: 'Disappear, then make their passive disappear too.', glyph: 'blade',
    active: {
      id: 'silver-edge-active', name: 'Shadow Walk', targeting: 'no-target', castPoint: 0, cooldown: [20],
      effects: [{ kind: 'status', status: 'invis', duration: 14, target: 'self', params: { fadeTime: 0.3, threatDropPct: 60 } }, { kind: 'statmod', mods: { moveSpeedPct: 20 }, duration: 14, target: 'self' }],
      vfx: { archetype: 'shield', color: '#b9c8ff', scale: 0.75 }
    },
    attackVisual: [{ kind: 'crit-lunge', color: '#cfd8ff', color2: '#ffffff', scale: 1 }]
  },
  {
    id: 'echo-sabre', name: 'Echo Sabre', tier: 'core', cost: 3500,
    components: ['oblivion-staff', 'ogre-axe'], recipeCost: 875,
    passiveMods: { str: 10, int: 6, damage: 15, attackSpeed: 10, manaRegen: 1 },
    attackMod: { procChance: 100, bonusDamage: 35, procStatus: { status: 'slow', duration: 0.8, params: { moveSlowPct: 80 } } },
    lore: 'The second hit arrives before the first one has finished explaining.', glyph: 'blade',
    attackVisual: [{ kind: 'tinted-impact', color: '#86c8ff', color2: '#ffffff', scale: 0.9 }]
  },
  {
    id: 'orchid-malevolence', name: 'Orchid Malevolence', tier: 'core', cost: 3500,
    components: ['oblivion-staff', 'oblivion-staff'], recipeCost: 250,
    passiveMods: { int: 12, damage: 20, attackSpeed: 20, manaRegen: 2 },
    lore: 'A quiet flower for loud casters.', glyph: 'flower',
    active: {
      id: 'orchid-active', name: 'Soul Burn', targeting: 'unit-target', affects: 'enemy', castRange: 900, castPoint: 0, cooldown: [18], manaCost: [100],
      effects: [{ kind: 'status', status: 'silence', duration: 5, target: 'target' }, { kind: 'statmod', mods: { damageTakenReductionPct: -15 }, duration: 5, target: 'target' }],
      vfx: { archetype: 'beam', color: '#d88cff', color2: '#ffffff', scale: 0.75 }
    }
  },
  {
    id: 'bloodthorn', name: 'Bloodthorn', tier: 'core', cost: 6500,
    components: ['orchid-malevolence', 'crystalys'], recipeCost: 1100,
    passiveMods: { int: 12, damage: 52, attackSpeed: 20, manaRegen: 2 },
    attackMod: { critChance: 20, critMult: 160 },
    lore: 'Silence first. Then the knives agree.', glyph: 'flower',
    active: {
      id: 'bloodthorn-active', name: 'Bloodthorn', targeting: 'unit-target', affects: 'enemy', castRange: 900, castPoint: 0, cooldown: [15], manaCost: [100],
      effects: [{ kind: 'status', status: 'silence', duration: 5, target: 'target' }, { kind: 'statmod', mods: { damageTakenReductionPct: -25 }, duration: 5, target: 'target' }],
      vfx: { archetype: 'beam', color: '#ff4f86', color2: '#ffffff', scale: 0.85 }
    },
    attackVisual: [{ kind: 'crit-lunge', color: '#ff4f86', color2: '#ffffff', scale: 1.15 }]
  },
  {
    id: 'nullifier', name: 'Nullifier', tier: 'core', cost: 5300,
    components: ['sacred-relic', 'helm-of-iron-will'], recipeCost: 975,
    passiveMods: { damage: 55, armor: 5, hpRegen: 5 },
    lore: 'A blunt answer to tricks, buffs, and excuses.', glyph: 'relic',
    active: {
      id: 'nullifier-active', name: 'Nullify', targeting: 'unit-target', affects: 'enemy', castRange: 600, castPoint: 0, cooldown: [10], manaCost: [75],
      effects: [{ kind: 'purge', target: 'target' }, { kind: 'status', status: 'slow', duration: 4, target: 'target', params: { moveSlowPct: 35 } }],
      vfx: { archetype: 'beam', color: '#d8d8d8', scale: 0.75 }
    },
    attackVisual: [{ kind: 'tinted-impact', color: '#d8d8d8', color2: '#ffffff', scale: 1 }]
  },
  {
    id: 'radiance', name: 'Radiance', tier: 'core', cost: 4700,
    components: ['sacred-relic'], recipeCost: 1300,
    passiveMods: { damage: 55 },
    aura: { radius: 700, affects: 'enemies', mods: { damageTakenReductionPct: -4 } },
    lore: 'A holy burn that makes standing near you a mistake.', glyph: 'sun',
    attackVisual: [{ kind: 'tinted-impact', color: '#ffb13b', color2: '#ffffff', scale: 1.05 }],
    appearance: { parts: ['mana-orb'], tint: '#ffb13b', aura: { archetype: 'global-mark', color: '#ffb13b', color2: '#ffffff' } },
    elementOnHit: 'pyro'
  },
  {
    id: 'medallion-of-courage', name: 'Medallion of Courage', tier: 'basic', cost: 1075,
    components: ['chainmail', 'sages-mask', 'ring-of-protection'], recipeCost: 175,
    passiveMods: { armor: 6, manaRegen: 1 },
    lore: 'Courage, lent out one armor swing at a time.', glyph: 'medal',
    active: {
      id: 'medallion-active', name: 'Valor', targeting: 'unit-target', affects: 'enemy', castRange: 900, castPoint: 0, cooldown: [12],
      effects: [{ kind: 'statmod', mods: { armor: -5 }, duration: 8, target: 'target' }],
      vfx: { archetype: 'beam', color: '#d8b45c', scale: 0.65 }
    }
  },
  {
    id: 'solar-crest', name: 'Solar Crest', tier: 'core', cost: 2950,
    components: ['medallion-of-courage', 'crown', 'talisman-of-evasion'], recipeCost: 125,
    passiveMods: { str: 4, agi: 4, int: 4, armor: 6, manaRegen: 1, evasionPct: 16 },
    lore: 'A medallion promoted into a whole sun.', glyph: 'sun',
    active: {
      id: 'solar-active', name: 'Shine', targeting: 'unit-target', affects: 'any', castRange: 900, castPoint: 0, cooldown: [16],
      effects: [{ kind: 'statmod', mods: { armor: 6, attackSpeed: 45, moveSpeedPct: 10 }, duration: 8, target: 'target' }],
      vfx: { archetype: 'beam', color: '#ffd66b', color2: '#ffffff', scale: 0.75 }
    }
  },
  {
    id: 'urn-of-shadows', name: 'Urn of Shadows', tier: 'basic', cost: 880,
    components: ['sages-mask', 'gauntlets-of-strength', 'ring-of-protection'], recipeCost: 390,
    passiveMods: { str: 3, manaRegen: 1, armor: 1 },
    charges: 0, maxCharges: 10,
    triggers: [{ on: 'on-nearby-death', radius: 1400, chargeGain: 1 }],
    lore: 'It keeps score for the dead.', glyph: 'urn',
    active: {
      id: 'urn-active', name: 'Soul Release', targeting: 'unit-target', affects: 'enemy', castRange: 750, castPoint: 0, cooldown: [7],
      effects: [{ kind: 'status', status: 'buff', duration: 8, target: 'target', params: { dotDps: 25, dotType: 'magical', tag: 'urn-burn' } }],
      vfx: { archetype: 'beam', color: '#8a5cff', scale: 0.65 }
    }
  },
  {
    id: 'spirit-vessel', name: 'Spirit Vessel', tier: 'core', cost: 2780,
    components: ['urn-of-shadows', 'vitality-booster'], recipeCost: 900,
    passiveMods: { str: 3, maxHp: 250, manaRegen: 1, armor: 1 },
    charges: 0, maxCharges: 12,
    triggers: [{ on: 'on-nearby-death', radius: 1400, chargeGain: 1 }],
    lore: 'An urn with a sharper opinion about healing.', glyph: 'urn',
    active: {
      id: 'spirit-vessel-active', name: 'Soul Burn', targeting: 'unit-target', affects: 'enemy', castRange: 750, castPoint: 0, cooldown: [7],
      effects: [{ kind: 'status', status: 'buff', duration: 8, target: 'target', params: { dotDps: 45, dotType: 'magical', mods: { hpRegen: -20 }, tag: 'vessel-burn' } }],
      vfx: { archetype: 'beam', color: '#b08cff', color2: '#ffffff', scale: 0.75 }
    }
  },
  {
    id: 'holy-locket', name: 'Holy Locket', tier: 'core', cost: 2400,
    components: ['headdress', 'magic-wand', 'energy-booster'], recipeCost: 725,
    passiveMods: { maxMana: 250, hpRegen: 2.5 },
    charges: 0, maxCharges: 20,
    triggers: [{ on: 'on-nearby-enemy-cast', radius: 1200, chargeGain: 1 }],
    consumesAllCharges: true,
    lore: 'A wand that learned bedside manner.', glyph: 'locket',
    active: {
      id: 'holy-locket-active', name: 'Blessed Charges', targeting: 'unit-target', affects: 'ally', castRange: 700, castPoint: 0, cooldown: [13],
      effects: [{ kind: 'heal', amount: 22, target: 'target', perCharge: true }, { kind: 'mana', op: 'restore', amount: 12, target: 'target', perCharge: true }],
      vfx: { archetype: 'shield', color: '#fff4b0', color2: '#ffffff', scale: 0.7 }
    }
  },
  {
    id: 'helm-of-the-dominator', name: 'Helm of the Dominator', tier: 'core', cost: 2400,
    components: ['helm-of-iron-will', 'morbid-mask'], recipeCost: 575,
    passiveMods: { armor: 5, hpRegen: 5, lifestealPct: 18 },
    aura: { radius: 1200, affects: 'allies', mods: { damagePct: 8 } },
    lore: 'Leadership, but with a very heavy helmet.', glyph: 'helm',
    active: {
      id: 'dominator-active', name: 'Dominate', targeting: 'point-target', castRange: 700, castPoint: 0, cooldown: [45],
      effects: [{ kind: 'summon', at: 'point', summon: { id: 'dominated-creep', name: 'Dominated Creep', lifetime: 60, stats: { maxHp: 900, damage: 45, armor: 3, moveSpeed: 320, attackRange: 150, baseAttackTime: 1.6 }, silhouette: { build: 'quad', scale: 0.9, bodyShape: 'bulky', head: 'horned', weapon: 'none' }, palette: ['#8a5a36', '#d8b080', '#2a180f'] } }],
      vfx: { archetype: 'summon-pop', color: '#d8b080', scale: 0.85 }
    }
  },
  {
    id: 'helm-of-the-overlord', name: 'Helm of the Overlord', tier: 'core', cost: 5600,
    components: ['helm-of-the-dominator', 'ultimate-orb'], recipeCost: 400,
    passiveMods: { str: 15, agi: 15, int: 15, armor: 8, hpRegen: 6, lifestealPct: 20 },
    aura: { radius: 1200, affects: 'allies', mods: { damagePct: 15, armor: 3 } },
    lore: 'The dominated thing gets bigger. So does the problem.', glyph: 'helm',
    active: {
      id: 'overlord-active', name: 'Dominate Ancient', targeting: 'point-target', castRange: 700, castPoint: 0, cooldown: [45],
      effects: [{ kind: 'summon', at: 'point', summon: { id: 'dominated-ancient', name: 'Dominated Ancient', lifetime: 75, stats: { maxHp: 1500, damage: 70, armor: 6, moveSpeed: 330, attackRange: 150, baseAttackTime: 1.5, magicResistPct: 30 }, silhouette: { build: 'quad', scale: 1.15, bodyShape: 'bulky', head: 'horned', weapon: 'none' }, palette: ['#5a3a2a', '#d8c080', '#1a1008'] } }],
      vfx: { archetype: 'summon-pop', color: '#d8c080', scale: 1 }
    }
  },
  {
    id: 'veil-of-discord', name: 'Veil of Discord', tier: 'core', cost: 1500,
    components: ['robe-of-the-magi', 'robe-of-the-magi', 'headdress'], recipeCost: 175,
    passiveMods: { int: 12, hpRegen: 2 },
    lore: 'A cheap argument that makes every spell louder.', glyph: 'veil',
    active: {
      id: 'veil-active', name: 'Magic Weakness', targeting: 'ground-aoe', castRange: 1000, castPoint: 0, cooldown: [22], manaCost: [50],
      effects: [{ kind: 'status', status: 'buff', duration: 12, target: 'enemies-in-radius', radius: 600, params: { mods: { magicResistPct: -18 }, tag: 'veil-discord' } }],
      vfx: { archetype: 'ground-aoe', color: '#c88cff', color2: '#ffffff', scale: 0.9 }
    }
  },
  {
    id: 'rod-of-atos', name: 'Rod of Atos', tier: 'core', cost: 2750,
    components: ['staff-of-wizardry', 'crown', 'crown'], recipeCost: 850,
    passiveMods: { int: 18, str: 8, agi: 8 },
    lore: 'Point, root, punish.', glyph: 'staff',
    active: {
      id: 'atos-active', name: 'Cripple', targeting: 'unit-target', affects: 'enemy', castRange: 1100, castPoint: 0, cooldown: [18], manaCost: [50],
      effects: [{ kind: 'status', status: 'root', duration: 2, target: 'target' }],
      vfx: { archetype: 'beam', color: '#d8a0ff', scale: 0.75 }
    }
  },
  {
    id: 'gleipnir', name: 'Gleipnir', tier: 'core', cost: 6500,
    components: ['rod-of-atos', 'maelstrom'], recipeCost: 800,
    passiveMods: { int: 18, str: 8, agi: 8, damage: 24, attackSpeed: 20 },
    attackMod: { procChance: 30, procDamage: 140 },
    lore: 'Lightning tied into a knot.', glyph: 'chain',
    active: {
      id: 'gleipnir-active', name: 'Eternal Chains', targeting: 'ground-aoe', castRange: 1100, castPoint: 0, cooldown: [18], manaCost: [200],
      effects: [{ kind: 'damage', dtype: 'magical', amount: 180, target: 'enemies-in-radius', radius: 450 }, { kind: 'status', status: 'root', duration: 2, target: 'enemies-in-radius', radius: 450 }],
      vfx: { archetype: 'storm', color: '#7ddcff', color2: '#d8a0ff', scale: 1 }
    },
    attackVisual: [{ kind: 'lightning-bounce', color: '#7ddcff', color2: '#ffffff', scale: 1.1 }],
    elementOnHit: 'electro'
  },
  {
    id: 'dagon', name: 'Dagon', tier: 'core', cost: 2300,
    components: ['null-talisman', 'staff-of-wizardry'], recipeCost: 795,
    passiveMods: { int: 16, str: 2, agi: 2, maxMana: 60 },
    lore: 'A wand for people who think subtle damage is a waste of time.', glyph: 'wand',
    active: {
      id: 'dagon-active', name: 'Energy Burst', targeting: 'unit-target', affects: 'enemy', castRange: 650, castPoint: 0, cooldown: [35], manaCost: [120],
      effects: [{ kind: 'damage', dtype: 'magical', amount: 400, target: 'target' }],
      vfx: { archetype: 'beam', color: '#ff4fd8', color2: '#ffffff', scale: 0.9 }
    }
  },
  {
    id: 'ghost-scepter', name: 'Ghost Scepter', tier: 'basic', cost: 1500,
    passiveMods: { str: 5, agi: 5, int: 5 },
    lore: 'Step out of reach, but not out of danger.', glyph: 'ghost',
    active: {
      id: 'ghost-active', name: 'Ghost Form', targeting: 'no-target', castPoint: 0, cooldown: [22],
      effects: [{ kind: 'statmod', mods: { attackDamageTakenReductionPct: 90, magicResistPct: -25 }, duration: 4, target: 'self' }, { kind: 'status', status: 'disarm', duration: 4, target: 'self' }],
      vfx: { archetype: 'shield', color: '#d8e8ff', scale: 0.75 }
    }
  },
  {
    id: 'ethereal-blade', name: 'Ethereal Blade', tier: 'core', cost: 5000,
    components: ['eaglesong', 'ghost-scepter'], recipeCost: 700,
    passiveMods: { agi: 30, str: 5, int: 5 },
    lore: 'Make them untouchable, then make magic matter.', glyph: 'blade',
    active: {
      id: 'ethereal-active', name: 'Ether Blast', targeting: 'unit-target', affects: 'enemy', castRange: 800, castPoint: 0, cooldown: [22], manaCost: [100],
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 250, target: 'target' },
        { kind: 'statmod', mods: { attackDamageTakenReductionPct: 90, magicResistPct: -35 }, duration: 4, target: 'target' },
        { kind: 'status', status: 'disarm', duration: 4, target: 'target' }
      ],
      vfx: { archetype: 'beam', color: '#9fd8ff', color2: '#ffffff', scale: 0.85 }
    },
    appearance: { weapon: { kind: 'glowing-blade', color: '#9fd8ff', emissive: '#1c4a6e' } }
  },
  {
    id: 'wind-waker', name: 'Wind Waker', tier: 'core', cost: 6025,
    components: ['euls-scepter', 'force-staff'], recipeCost: 1100,
    passiveMods: { int: 20, manaRegen: 4, moveSpeed: 40, hpRegen: 2.5 },
    lore: 'A cyclone with travel plans.', glyph: 'cyclone',
    active: {
      id: 'wind-waker-active', name: 'Cyclone Drift', targeting: 'unit-target', affects: 'ally', castRange: 700, castPoint: 0, cooldown: [18], manaCost: [175],
      effects: [{ kind: 'status', status: 'cyclone', duration: 2.5, target: 'target' }, { kind: 'statmod', mods: { moveSpeedPct: 40 }, duration: 2.5, target: 'target' }],
      vfx: { archetype: 'storm', color: '#c8ffff', color2: '#ffffff', scale: 0.9 }
    }
  },
  {
    id: 'hand-of-midas', name: 'Hand of Midas', tier: 'core', cost: 2200,
    components: ['gloves-of-haste'], recipeCost: 1750,
    passiveMods: { attackSpeed: 35 },
    lore: 'A gold sink that dreams of becoming a gold faucet.', glyph: 'hand',
    active: {
      id: 'midas-active', name: 'Transmute', targeting: 'unit-target', affects: 'enemy', castRange: 600, castPoint: 0, cooldown: [90],
      effects: [{ kind: 'damage', dtype: 'pure', amount: 999, target: 'target' }],
      vfx: { archetype: 'beam', color: '#ffd45c', color2: '#ffffff', scale: 0.8 }
    }
  },
  {
    id: 'octarine-core', name: 'Octarine Core', tier: 'core', cost: 5200,
    components: ['mystic-staff', 'vitality-booster', 'point-booster'], recipeCost: 200,
    passiveMods: { int: 25, maxHp: 425, maxMana: 175, spellAmpPct: 12, manaRegen: 3 },
    lore: 'A spellcaster heart that beats between cooldowns.', glyph: 'orb',
    appearance: { parts: ['mana-orb'], tint: '#b08cff', aura: { archetype: 'global-mark', color: '#b08cff', color2: '#ffffff' } }
  },
  {
    id: 'aether-lens', name: 'Aether Lens', tier: 'core', cost: 2250,
    components: ['energy-booster', 'void-stone'], recipeCost: 650,
    passiveMods: { maxMana: 250, manaRegen: 2.25, castRange: 225 },
    lore: 'Stand farther away from your decisions.', glyph: 'lens'
  },
  {
    id: 'meteor-hammer', name: 'Meteor Hammer', tier: 'core', cost: 2850,
    components: ['staff-of-wizardry', 'ring-of-health', 'crown'], recipeCost: 700,
    passiveMods: { int: 14, str: 4, agi: 4, hpRegen: 6.5 },
    lore: 'A channel, a warning, then a crater.', glyph: 'hammer',
    active: {
      id: 'meteor-active', name: 'Meteor Hammer', targeting: 'ground-aoe', castRange: 600, castPoint: 0, cooldown: [24], manaCost: [100],
      channel: { duration: 1.5, onEnd: [{ kind: 'damage', dtype: 'magical', amount: 250, target: 'enemies-in-radius', radius: 325 }, { kind: 'status', status: 'stun', duration: 0.8, target: 'enemies-in-radius', radius: 325 }] },
      vfx: { archetype: 'global-mark', color: '#ff9a3a', color2: '#ffffff', scale: 1 }
    }
  },
  {
    id: 'heavens-halberd', name: "Heaven's Halberd", tier: 'core', cost: 3650,
    components: ['sange', 'talisman-of-evasion'], recipeCost: 250,
    passiveMods: { str: 16, statusResistPct: 15, lifestealPct: 12, evasionPct: 20 },
    lore: 'A carry item for making another carry stop.', glyph: 'spear',
    active: {
      id: 'halberd-active', name: 'Disarm', targeting: 'unit-target', affects: 'enemy', castRange: 650, castPoint: 0, cooldown: [18], manaCost: [100],
      effects: [{ kind: 'status', status: 'disarm', duration: 4, target: 'target' }],
      vfx: { archetype: 'beam', color: '#ffd66b', scale: 0.75 }
    },
    appearance: { weapon: { kind: 'long-pole', color: '#ffd66b' } }
  },
  { id: 'aghanims-blessing', name: "Aghanim's Blessing", tier: 'core', cost: 5800, passiveMods: { str: 10, agi: 10, int: 10, maxHp: 175, maxMana: 175 }, lore: 'The scepter lesson, learned permanently.', glyph: 'staff', appearance: { parts: ['mana-orb'], tint: '#73d9ff', aura: { archetype: 'global-mark', color: '#73d9ff', color2: '#ffffff' } } },
  { id: 'aghanims-shard', name: "Aghanim's Shard", tier: 'core', cost: 1400, passiveMods: { str: 3, agi: 3, int: 3, spellAmpPct: 4 }, lore: 'A small blue permission slip for future hero upgrades.', glyph: 'shard', appearance: { parts: ['mana-orb'], tint: '#73d9ff' } },
  { id: 'moon-shard', name: 'Moon Shard', tier: 'core', cost: 4400, components: ['hyperstone', 'hyperstone'], recipeCost: 400, passiveMods: { attackSpeed: 140 }, lore: 'A piece of the moon that makes the hands frantic.', glyph: 'shard', attackVisual: [{ kind: 'tinted-impact', color: '#d8e8ff', color2: '#ffffff', scale: 0.8 }] },
  {
    id: 'bloodstone', name: 'Bloodstone', tier: 'core', cost: 4000,
    components: ['perseverance', 'point-booster'], recipeCost: 1150,
    passiveMods: { maxHp: 175, maxMana: 175, hpRegen: 6.5, manaRegen: 2.25, spellAmpPct: 10 },
    lore: 'A caster battery that pays you back when the fight gets ugly.', glyph: 'gem',
    active: {
      id: 'bloodstone-active', name: 'Bloodpact', targeting: 'no-target', castPoint: 0, cooldown: [30],
      effects: [{ kind: 'heal', amount: 450, target: 'self' }, { kind: 'mana', op: 'restore', amount: 300, target: 'self' }],
      vfx: { archetype: 'shield', color: '#d82040', color2: '#ffffff', scale: 0.85 }
    },
    appearance: { parts: ['heart-core'], tint: '#d82040' }
  },
  {
    id: 'soul-ring', name: 'Soul Ring', tier: 'basic', cost: 805,
    components: ['ring-of-regen', 'sages-mask'], recipeCost: 455,
    passiveMods: { hpRegen: 1.75, manaRegen: 1 },
    lore: 'Borrow mana from your future bruises.', glyph: 'ring',
    active: {
      id: 'soul-ring-active', name: 'Sacrifice', targeting: 'no-target', castPoint: 0, cooldown: [25],
      effects: [{ kind: 'damage', dtype: 'pure', amount: 150, target: 'self' }, { kind: 'mana', op: 'restore', amount: 170, target: 'self' }],
      vfx: { archetype: 'shield', color: '#b01840', scale: 0.6 }
    }
  }
];

// A pressed item reads on the body (§3.11): self-displacers dash, the rest
// play the generic item-use beat. Explicit tags on an active always win.
function normalizeItemActive(item: ItemDef): ItemDef {
  const a = item.active;
  if (a) {
    const selfDash = (a.effects ?? []).some((e) => e.kind === 'displace' && e.target === 'self');
    a.anim = a.anim ?? (selfDash ? 'dash' : 'item-use');
    a.sound = a.sound ?? 'item';
  }
  return item;
}

const RARITY_OVERRIDES: Record<string, ItemRarity> = {
  // Drop-gated recipe cores.
  'demon-edge': 'mythical',
  'sacred-relic': 'mythical',
  reaver: 'mythical',
  eaglesong: 'mythical',
  'mystic-staff': 'mythical',
  'ultimate-orb': 'rare',
  // Boss/raid anchors.
  'assault-cuirass': 'legendary',
  'divine-rapier': 'immortal',
  butterfly: 'immortal',
  'scythe-of-vyse': 'immortal',
  'heart-of-tarrasque': 'immortal',
  'eye-of-skadi': 'immortal',
  'refresher-orb': 'immortal',
  'aghanims-scepter': 'immortal',
  'abyssal-blade': 'immortal',
  bloodthorn: 'immortal',
  radiance: 'immortal',
  satanic: 'immortal',
  'octarine-core': 'immortal',
  'aghanims-blessing': 'immortal',
  'aghanims-shard': 'mythical',
  'aegis-of-the-immortal': 'arcana',
  'refresher-shard': 'immortal',
  cheese: 'legendary'
};

const SOURCE_OVERRIDES: Record<string, DropSource[]> = {
  // These components are the dropped recipe membrane for the top-end anchors.
  'demon-edge': ['creep', 'echo', 'boss', 'raid', 'dungeon'],
  'sacred-relic': ['creep', 'echo', 'boss', 'raid', 'dungeon'],
  reaver: ['creep', 'echo', 'boss', 'raid', 'dungeon'],
  eaglesong: ['creep', 'echo', 'boss', 'raid', 'dungeon'],
  'mystic-staff': ['creep', 'echo', 'boss', 'raid', 'dungeon'],
  // Prestige anchors never enter shops or the gamble pool.
  'divine-rapier': ['raid', 'special-battle'],
  butterfly: ['boss', 'raid', 'dungeon'],
  'scythe-of-vyse': ['boss', 'raid', 'dungeon'],
  'heart-of-tarrasque': ['boss', 'raid', 'dungeon'],
  'eye-of-skadi': ['boss', 'raid', 'dungeon'],
  'refresher-orb': ['boss', 'raid', 'dungeon'],
  'aghanims-scepter': ['boss', 'raid', 'dungeon'],
  'abyssal-blade': ['boss', 'raid', 'dungeon'],
  bloodthorn: ['boss', 'raid', 'dungeon'],
  radiance: ['boss', 'raid', 'dungeon'],
  satanic: ['boss', 'raid', 'dungeon'],
  'octarine-core': ['boss', 'raid', 'dungeon'],
  'aghanims-blessing': ['boss', 'raid', 'dungeon'],
  'aghanims-shard': ['boss', 'raid', 'dungeon'],
  'aegis-of-the-immortal': ['raid'],
  'refresher-shard': ['raid'],
  cheese: ['raid']
};

function defaultRarity(item: ItemDef): ItemRarity {
  if (item.tier === 'consumable') return 'common';
  if (item.tier === 'component') {
    if (item.cost >= 2200) return 'mythical';
    if (item.cost >= 1000) return 'rare';
    return 'uncommon';
  }
  if (item.tier === 'basic') return 'uncommon';
  if (item.cost >= 5000) return 'legendary';
  if (item.cost >= 2500) return 'mythical';
  return 'rare';
}

function normalizeLootMetadata(item: ItemDef): ItemDef {
  return {
    ...item,
    rarity: item.rarity ?? RARITY_OVERRIDES[item.id] ?? defaultRarity(item),
    exclusiveTo: item.exclusiveTo ?? SOURCE_OVERRIDES[item.id]
  };
}

export const ALL_ITEMS: ItemDef[] = [...CONSUMABLES, ...COMPONENTS, ...EXTENDED_COMPONENTS, ...ASSEMBLED, ...EXTENDED_ASSEMBLED]
  .map(normalizeItemActive)
  .map(normalizeLootMetadata);
