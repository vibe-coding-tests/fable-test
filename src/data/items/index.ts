import type { ItemDef } from '../../core/types';

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
      effects: [{ kind: 'status', status: 'invis', duration: 12, target: 'allies-in-radius', radius: 1200, params: { fadeTime: 0.2, tag: 'smoke' } }],
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
        { kind: 'status', status: 'invis', duration: 5, target: 'target', params: { fadeTime: 0.6 } },
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

export const ALL_ITEMS: ItemDef[] = [...CONSUMABLES, ...COMPONENTS, ...ASSEMBLED];
