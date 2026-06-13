import type { AbilityDef, DamageType, EffectNode, HeroDef, StatusId, SummonSpec, TargetSel, ValueRef, VfxArchetype } from '../../core/types';
import { gestureForAbility, soundForAbility } from '../../core/gestures';

type Kit = [AbilityDef, AbilityDef, AbilityDef, AbilityDef];

const D4 = [85, 140, 195, 250];
const U3 = [240, 380, 520];
const SPEED = [1000, 1000, 1000, 1000];

function vfx(archetype: VfxArchetype, color: string, color2?: string): AbilityDef['vfx'] {
  return { archetype, color, color2, scale: 0.9 };
}

function tag(a: AbilityDef): AbilityDef {
  return { ...a, anim: gestureForAbility(a), sound: soundForAbility(a) };
}

function withAnim(a: AbilityDef, anim: NonNullable<AbilityDef['anim']>): AbilityDef {
  return { ...a, anim };
}

function kit(a: AbilityDef, b: AbilityDef, c: AbilityDef, d: AbilityDef): Kit {
  return [tag(a), tag(b), tag(c), tag(d)];
}

function status(status: StatusId, duration: ValueRef, params?: Record<string, ValueRef | string | number | boolean>): EffectNode {
  return { kind: 'status', status, duration, target: 'target', params };
}

function line(id: string, name: string, color: string, onHit: EffectNode[] = [], dtype: DamageType = 'magical'): AbilityDef {
  return {
    id, name, targeting: 'skillshot', castRange: 850, castPoint: 0.25, manaCost: [80, 90, 100, 110], cooldown: [12, 11, 10, 9],
    values: { damage: D4, speed: SPEED },
    effects: [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 180, range: 850, onHit: [{ kind: 'damage', dtype, amount: 'damage', target: 'target' }, ...onHit] } }],
    vfx: vfx('projectile', color)
  };
}

function target(id: string, name: string, color: string, onHit: EffectNode[] = [], dtype: DamageType = 'magical'): AbilityDef {
  return {
    id, name, targeting: 'unit-target', affects: 'enemy', castRange: 700, castPoint: 0.25, manaCost: [80, 90, 100, 110], cooldown: [12, 11, 10, 9],
    values: { damage: D4 },
    effects: [{ kind: 'damage', dtype, amount: 'damage', target: 'target' }, ...onHit],
    vfx: vfx('beam', color)
  };
}

function nova(id: string, name: string, color: string, onHit: EffectNode[] = [], dtype: DamageType = 'magical'): AbilityDef {
  return {
    id, name, targeting: 'no-target', castPoint: 0.2, manaCost: [80, 90, 100, 110], cooldown: [14, 13, 12, 11],
    values: { damage: D4, radius: [325, 350, 375, 400] },
    effects: [{ kind: 'damage', dtype, amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, ...onHit],
    vfx: vfx('storm', color)
  };
}

function ground(id: string, name: string, color: string, onEnter: EffectNode[] = [], dtype: DamageType = 'magical'): AbilityDef {
  return {
    id, name, targeting: 'ground-aoe', castRange: 850, castPoint: 0.3, manaCost: [90, 100, 110, 120], cooldown: [18, 16, 14, 12],
    values: { damage: [45, 65, 85, 105], radius: [300, 325, 350, 375], duration: [5, 5, 5, 5] },
    effects: [{ kind: 'zone', at: 'point', zone: { shape: 'circle', radius: 'radius', duration: 'duration', tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype, amount: 'damage', target: 'target' }, ...onEnter] } } }],
    vfx: vfx('ground-aoe', color)
  };
}

function buff(id: string, name: string, color: string, mods: Record<string, ValueRef>, values: Record<string, number[]> = { duration: [6, 6, 6, 6] }, targetSel: TargetSel = 'self'): AbilityDef {
  return {
    id, name, targeting: targetSel === 'self' ? 'no-target' : 'unit-target', affects: targetSel === 'self' ? undefined : 'ally', castRange: targetSel === 'self' ? undefined : 650, castPoint: 0.2, manaCost: [60, 70, 80, 90], cooldown: [18, 16, 14, 12],
    values,
    effects: [{ kind: 'statmod', mods, duration: 'duration', target: targetSel }],
    vfx: vfx('shield', color)
  };
}

function passive(id: string, name: string, color: string, mods: Record<string, ValueRef>, values: Record<string, number[]> = { damage: [0, 0, 0, 0] }): AbilityDef {
  return { id, name, targeting: 'passive', values, passiveMods: mods, vfx: vfx('shield', color) };
}

function attack(id: string, name: string, color: string, attackMod: AbilityDef['attackMod'], values: Record<string, number[]>): AbilityDef {
  return { id, name, targeting: 'attack-modifier', values, attackMod, vfx: vfx('stun-stars', color) };
}

function ultArea(id: string, name: string, color: string, effects: EffectNode[], archetype: VfxArchetype = 'global-mark'): AbilityDef {
  return {
    id, name, targeting: 'no-target', ult: true, castPoint: 0.45, manaCost: [150, 225, 300], cooldown: [100, 85, 70],
    values: { damage: U3, radius: [500, 575, 650], disable: [1.5, 2, 2.5], duration: [6, 7, 8] },
    effects,
    vfx: vfx(archetype, color)
  };
}

function ultTarget(id: string, name: string, color: string, effects: EffectNode[], dtype: DamageType = 'magical'): AbilityDef {
  return {
    id, name, targeting: 'unit-target', affects: 'enemy', ult: true, castRange: 700, castPoint: 0.35, manaCost: [150, 225, 300], cooldown: [100, 85, 70],
    values: { damage: U3, disable: [1.5, 2, 2.5], duration: [6, 7, 8] },
    effects: [{ kind: 'damage', dtype, amount: 'damage', target: 'target' }, ...effects],
    vfx: vfx('global-mark', color)
  };
}

function summon(id: string, name: string, palette: [string, string, string], attackRange = 150): SummonSpec {
  return {
    id, name, lifetime: 'duration',
    stats: { maxHp: 420, damage: 34, armor: 2, moveSpeed: 325, attackRange, baseAttackTime: 1.45, magicResistPct: 10 },
    silhouette: { build: attackRange > 200 ? 'ward' : 'biped', scale: 0.75, head: 'bare', weapon: attackRange > 200 ? 'staff' : 'sword' },
    palette
  };
}

function summonSpell(id: string, name: string, color: string, spec: SummonSpec, count: ValueRef = 1): AbilityDef {
  const countValues = typeof count === 'string' ? [2, 2, 3, 3] : [count, count, count, count];
  return {
    id, name, targeting: 'ground-aoe', castRange: 750, castPoint: 0.35, manaCost: [90, 100, 110, 120], cooldown: [24, 22, 20, 18],
    values: { count: countValues, duration: [18, 20, 22, 24], damage: [0, 0, 0, 0] },
    effects: [{ kind: 'summon', summon: spec, count, at: 'point' }],
    vfx: vfx('summon-pop', color)
  };
}

const serpentWard = summon('phase3-serpent-ward', 'Serpent Ward', ['#a347ff', '#ffca66', '#3d124f'], 550);
const nagaImage = summon('phase3-naga-image', 'Naga Image', ['#4bb8d8', '#f0d08a', '#174257']);
const tombstone = summon('phase3-tombstone', 'Tombstone', ['#5aa36a', '#233323', '#d8e8aa'], 500);
const forgeSpirit = summon('phase3-forge-spirit', 'Forge Spirit', ['#f8d36a', '#a8e8ff', '#7a3cff'], 500);
const treant = summon('phase3-treant', 'Treant', ['#4dbd62', '#8b5a2b', '#d8ffd8']);
const beast = summon('phase3-wild-beast', 'Wild Beast', ['#b8723a', '#3d2716', '#f0c080']);
const spider = summon('phase3-spiderling', 'Spiderling', ['#5b2b72', '#111111', '#d38cff']);
const golem = summon('phase3-warlock-golem', 'Golem', ['#9b2d2d', '#3a1010', '#f2c06b']);
const familiar = summon('phase3-familiar', 'Familiar', ['#77778f', '#22222f', '#c8c8e8'], 450);
const terrorImage = summon('phase3-terror-image', 'Terrorblade Image', ['#4bb8ff', '#101426', '#d8f5ff'], 150);
const egg = summon('phase3-supernova', 'Supernova', ['#ff7a30', '#ffe07a', '#7a1e08'], 0);

export const AUTHORED_PHASE3_KITS: Partial<Record<HeroDef['id'], Kit>> = {
  'legion-commander': kit(
    nova('lc-overwhelming-odds', 'Overwhelming Odds', '#c23b2a', [{ kind: 'statmod', mods: { moveSpeed: 35 }, duration: 3, target: 'self' }], 'physical'),
    buff('lc-press-the-attack', 'Press the Attack', '#f0d48a', { attackSpeed: 60, hpRegen: 18 }, { duration: [5, 5, 5, 5] }, 'target'),
    attack('lc-moment-of-courage', 'Moment of Courage', '#642018', { procChance: 'chance', bonusDamage: 'damage', lifestealPct: 'lifesteal' }, { chance: [18, 22, 26, 30], damage: [35, 55, 75, 95], lifesteal: [25, 35, 45, 55] }),
    ultTarget('lc-duel', 'Duel', '#c23b2a', [{ kind: 'status', status: 'taunt', duration: 'disable', target: 'target' }, { kind: 'status', status: 'taunt', duration: 'disable', target: 'self' }, { kind: 'statmod', mods: { damage: 30 }, duration: 'duration', target: 'self' }], 'physical')
  ),
  'vengeful-spirit': kit(
    target('venge-magic-missile', 'Magic Missile', '#5d75ff', [status('stun', 1.4)]),
    line('venge-wave-of-terror', 'Wave of Terror', '#c7d4ff', [{ kind: 'statmod', mods: { armor: -4 }, duration: 5, target: 'target' }], 'physical'),
    passive('venge-vengeance-aura', 'Vengeance Aura', '#252a72', { damagePct: 12, attackRange: 60 }),
    ultTarget('venge-nether-swap', 'Nether Swap', '#5d75ff', [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }, { kind: 'status', status: 'slow', duration: 'disable', target: 'target', params: { moveSlowPct: 45 } }])
  ),
  'shadow-fiend': kit(
    nova('sf-shadowraze-near', 'Shadowraze', '#d84a32', [], 'magical'),
    attack('sf-necromastery', 'Necromastery', '#111111', { procChance: 100, bonusDamage: 'damage' }, { damage: [14, 26, 38, 50] }),
    passive('sf-presence', 'Presence of the Dark Lord', '#5f0b0b', { damage: 16 }),
    withAnim(ultArea('sf-requiem', 'Requiem of Souls', '#d84a32', [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'fear', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'storm'), 'global-cast')
  ),
  riki: kit(
    ground('riki-smoke-screen', 'Smoke Screen', '#6a4cff', [{ kind: 'status', status: 'silence', duration: 1.2, target: 'target' }, { kind: 'status', status: 'blind', duration: 1.2, target: 'target' }]),
    target('riki-blink-strike', 'Blink Strike', '#c8b8ff', [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'target-unit' }], 'physical'),
    passive('riki-cloak-and-dagger', 'Cloak and Dagger', '#1c1436', { evasionPct: 18, damage: 18 }),
    withAnim(ultArea('riki-tricks', 'Tricks of the Trade', '#6a4cff', [{ kind: 'status', status: 'cyclone', duration: 1.5, target: 'self' }, { kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], 'channel'), 'channel-loop')
  ),
  'bounty-hunter': kit(
    target('bh-shuriken-toss', 'Shuriken Toss', '#d99a28'),
    attack('bh-jinada', 'Jinada', '#f2df7a', { procChance: 100, bonusDamage: 'damage', procStatus: { status: 'slow', duration: 1.5, params: { moveSlowPct: 'slow' } } }, { damage: [30, 55, 80, 105], slow: [12, 18, 24, 30] }),
    buff('bh-shadow-walk', 'Shadow Walk', '#4a2a12', { moveSpeedPct: 18, damage: 18 }, { duration: [8, 9, 10, 11] }),
    ultTarget('bh-track', 'Track', '#d99a28', [{ kind: 'status', status: 'break', duration: 'duration', target: 'target' }, { kind: 'statmod', mods: { moveSpeedPct: 20 }, duration: 'duration', target: 'self' }])
  ),
  lion: kit(
    line('lion-earth-spike', 'Earth Spike', '#a347ff', [status('stun', 1.4)]),
    target('lion-hex', 'Hex', '#ffca66', [status('hex', 2.2)]),
    target('lion-mana-drain', 'Mana Drain', '#3d124f', [{ kind: 'mana', op: 'burn', amount: 'damage', target: 'target', burnedAsDamagePct: 0.5 }]),
    ultTarget('lion-finger', 'Finger of Death', '#a347ff', [])
  ),
  'winter-wyvern': kit(
    buff('ww-arctic-burn', 'Arctic Burn', '#9fe8ff', { attackRange: 180, damage: 20 }, { duration: [6, 7, 8, 9] }),
    target('ww-splinter-blast', 'Splinter Blast', '#ffffff', [{ kind: 'status', status: 'slow', duration: 2, target: 'target', params: { moveSlowPct: 35 } }]),
    buff('ww-cold-embrace', 'Cold Embrace', '#3d75b8', { damageTakenReductionPct: 65, hpRegen: 20 }, { duration: [3, 3.5, 4, 4.5] }, 'target'),
    ultTarget('ww-winters-curse', "Winter's Curse", '#9fe8ff', [{ kind: 'status', status: 'taunt', duration: 'disable', target: 'target' }])
  ),
  'sand-king': kit(
    line('sk-burrowstrike', 'Burrowstrike', '#d9a441', [status('stun', 1.3)]),
    ground('sk-sand-storm', 'Sand Storm', '#7a4b1c', [{ kind: 'status', status: 'blind', duration: 1, target: 'target' }]),
    attack('sk-caustic-finale', 'Caustic Finale', '#fff0a8', { procChance: 100, bonusDamage: 'damage', procStatus: { status: 'slow', duration: 2, params: { moveSlowPct: 'slow' } } }, { damage: [20, 35, 50, 65], slow: [10, 15, 20, 25] }),
    withAnim(ultArea('sk-epicenter', 'Epicenter', '#d9a441', [{ kind: 'repeat', count: 6, interval: 0.45, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 1, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 35 } }] }], 'storm'), 'channel-loop')
  ),
  'nyx-assassin': kit(
    line('nyx-impale', 'Impale', '#5d3b9a', [status('stun', 1.4)]),
    target('nyx-mind-flare', 'Mind Flare', '#c4a3ff', [{ kind: 'mana', op: 'burn', amount: 'damage', target: 'target', burnedAsDamagePct: 0.7 }]),
    buff('nyx-spiked-carapace', 'Spiked Carapace', '#1f1436', { damageTakenReductionPct: 45 }, { duration: [2, 2.5, 3, 3.5] }),
    ultTarget('nyx-vendetta', 'Vendetta', '#5d3b9a', [{ kind: 'status', status: 'break', duration: 'duration', target: 'target' }], 'physical')
  ),
  medusa: kit(
    attack('medusa-split-shot', 'Split Shot', '#2aa86b', { procChance: 100, cleave: { pct: 'cleave', radius: 450 } }, { damage: [0, 0, 0, 0], cleave: [35, 45, 55, 65] }),
    target('medusa-mystic-snake', 'Mystic Snake', '#d8f5a2', [{ kind: 'mana', op: 'burn', amount: 'damage', target: 'target', burnedAsDamagePct: 0.4 }]),
    passive('medusa-mana-shield', 'Mana Shield', '#394b2c', { damageTakenReductionPct: 20, maxMana: 180 }),
    ultArea('medusa-stone-gaze', 'Stone Gaze', '#2aa86b', [{ kind: 'exotic', id: 'stone-gaze', params: { heroId: 'medusa' } }, { kind: 'status', status: 'frozen', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'global-mark')
  ),
  viper: kit(
    attack('viper-poison-attack', 'Poison Attack', '#6fc247', { procChance: 100, bonusDamage: 'damage', procStatus: { status: 'slow', duration: 3, params: { moveSlowPct: 'slow', dotDps: 'dps', dotType: 'magical' } } }, { damage: [12, 22, 32, 42], slow: [12, 18, 24, 30], dps: [10, 18, 26, 34] }),
    ground('viper-nethertoxin', 'Nethertoxin', '#273a18', [{ kind: 'status', status: 'break', duration: 1, target: 'target' }]),
    passive('viper-corrosive-skin', 'Corrosive Skin', '#c8ff7a', { magicResistPct: 16, damageTakenReductionPct: 8 }),
    ultTarget('viper-viper-strike', 'Viper Strike', '#6fc247', [{ kind: 'status', status: 'slow', duration: 'duration', target: 'target', params: { moveSlowPct: 55, dotDps: 'damage', dotType: 'magical' } }])
  ),
  kunkka: kit(
    ground('kunkka-torrent', 'Torrent', '#2a6d9a', [{ kind: 'status', status: 'stun', duration: 1, target: 'target' }]),
    attack('kunkka-tidebringer', 'Tidebringer', '#e8d8a0', { procChance: 100, bonusDamage: 'damage', cleave: { pct: 'cleave', radius: 420 } }, { damage: [35, 60, 85, 110], cleave: [70, 85, 100, 115] }),
    target('kunkka-x-marks', 'X Marks the Spot', '#112940', [{ kind: 'status', status: 'root', duration: 1.4, target: 'target' }]),
    ultArea('kunkka-ghostship', 'Ghostship', '#2a6d9a', [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'statmod', mods: { damageTakenReductionPct: 35 }, duration: 'duration', target: 'allies-in-radius', radius: 'radius' }])
  ),
  tidehunter: kit(
    target('tide-gush', 'Gush', '#2aa88f', [{ kind: 'statmod', mods: { armor: -5 }, duration: 4, target: 'target' }, { kind: 'status', status: 'slow', duration: 4, target: 'target', params: { moveSlowPct: 35 } }]),
    passive('tide-kraken-shell', 'Kraken Shell', '#13453e', { damageTakenReductionPct: 14, statusResistPct: 25 }),
    nova('tide-anchor-smash', 'Anchor Smash', '#b4f0dd', [{ kind: 'statmod', mods: { damagePct: -25 }, duration: 4, target: 'enemies-in-radius', radius: 'radius' }], 'physical'),
    withAnim(ultArea('tide-ravage', 'Ravage', '#2aa88f', [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'storm'), 'ground-slam')
  ),
  slardar: kit(
    buff('slardar-sprint', 'Guardian Sprint', '#8050d8', { moveSpeedPct: 35 }, { duration: [5, 6, 7, 8] }),
    nova('slardar-crush', 'Slithereen Crush', '#cbb8ff', [{ kind: 'status', status: 'stun', duration: 1.2, target: 'enemies-in-radius', radius: 'radius' }], 'physical'),
    attack('slardar-bash', 'Bash of the Deep', '#2a1a4a', { procChance: 25, bonusDamage: 'damage', procStatus: { status: 'stun', duration: 0.8 } }, { damage: [35, 55, 75, 95] }),
    ultTarget('slardar-haze', 'Corrosive Haze', '#8050d8', [{ kind: 'statmod', mods: { armor: -12 }, duration: 'duration', target: 'target' }, { kind: 'status', status: 'break', duration: 'duration', target: 'target' }], 'physical')
  ),
  'naga-siren': kit(
    summonSpell('naga-mirror-image', 'Mirror Image', '#4bb8d8', nagaImage, 'count'),
    target('naga-ensnare', 'Ensnare', '#f0d08a', [status('root', 2.2)]),
    nova('naga-rip-tide', 'Rip Tide', '#174257', [{ kind: 'statmod', mods: { armor: -4 }, duration: 4, target: 'enemies-in-radius', radius: 'radius' }], 'physical'),
    withAnim(ultArea('naga-song', 'Song of the Siren', '#4bb8d8', [{ kind: 'status', status: 'sleep', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'channel'), 'channel-loop')
  ),
  slark: kit(
    nova('slark-dark-pact', 'Dark Pact', '#2a6f8f', [{ kind: 'purge', target: 'self' }], 'magical'),
    line('slark-pounce', 'Pounce', '#9bdcff', [status('root', 1.6)]),
    attack('slark-essence-shift', 'Essence Shift', '#1b2730', { procChance: 100, bonusDamage: 'damage', procStatus: { status: 'slow', duration: 1.5, params: { moveSlowPct: 20 } } }, { damage: [12, 22, 32, 42] }),
    ultArea('slark-shadow-dance', 'Shadow Dance', '#2a6f8f', [{ kind: 'status', status: 'invis', duration: 'duration', target: 'self' }, { kind: 'statmod', mods: { hpRegen: 40, moveSpeedPct: 30 }, duration: 'duration', target: 'self' }])
  ),
  lifestealer: kit(
    buff('ls-rage', 'Rage', '#b24a32', { magicResistPct: 80, moveSpeedPct: 20 }, { duration: [3, 4, 5, 6] }),
    attack('ls-feast', 'Feast', '#e8b082', { procChance: 100, bonusDamage: 'damage', lifestealPct: 'lifesteal' }, { damage: [18, 30, 42, 54], lifesteal: [18, 24, 30, 36] }),
    passive('ls-ghoul-frenzy', 'Ghoul Frenzy', '#34120d', { attackSpeed: 45, moveSpeed: 20 }),
    ultTarget('ls-infest', 'Infest', '#b24a32', [{ kind: 'heal', amount: 'damage', target: 'self' }, { kind: 'status', status: 'slow', duration: 'disable', target: 'target', params: { moveSlowPct: 45 } }], 'physical')
  ),
  undying: kit(
    nova('undying-decay', 'Decay', '#5aa36a', [{ kind: 'statmod', mods: { str: -3 }, duration: 8, target: 'enemies-in-radius', radius: 'radius' }, { kind: 'statmod', mods: { str: 6 }, duration: 8, target: 'self' }]),
    target('undying-soul-rip', 'Soul Rip', '#d8e8aa', [{ kind: 'heal', amount: 'damage', target: 'self' }]),
    summonSpell('undying-tombstone', 'Tombstone', '#233323', tombstone, 1),
    ultArea('undying-flesh-golem', 'Flesh Golem', '#5aa36a', [{ kind: 'statmod', mods: { maxHp: 450, damage: 55 }, duration: 'duration', target: 'self' }, { kind: 'status', status: 'slow', duration: 'disable', target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 35 } }])
  ),
  doom: kit(
    target('doom-devour', 'Devour', '#c23a1f', [{ kind: 'heal', amount: 'damage', target: 'self' }], 'pure'),
    ground('doom-scorched-earth', 'Scorched Earth', '#ff9a3a', [{ kind: 'heal', amount: 20, target: 'self' }]),
    attack('doom-infernal-blade', 'Infernal Blade', '#201010', { procChance: 100, bonusDamage: 'damage', procStatus: { status: 'stun', duration: 0.6, params: { dotDps: 'dps', dotType: 'magical' } } }, { damage: [25, 45, 65, 85], dps: [12, 20, 28, 36] }),
    ultTarget('doom-doom', 'Doom', '#c23a1f', [{ kind: 'status', status: 'silence', duration: 'duration', target: 'target' }, { kind: 'status', status: 'disarm', duration: 'duration', target: 'target' }])
  ),
  'wraith-king': kit(
    target('wk-wraithfire-blast', 'Wraithfire Blast', '#41d878', [status('stun', 1.4)]),
    buff('wk-vampiric-spirit', 'Vampiric Spirit', '#d8ffd8', { lifestealPct: 24, damage: 20 }, { duration: [8, 9, 10, 11] }),
    attack('wk-mortal-strike', 'Mortal Strike', '#143821', { critChance: 25, critMult: 'crit', bonusDamage: 'damage' }, { damage: [20, 35, 50, 65], crit: [170, 210, 250, 290] }),
    ultArea('wk-reincarnation', 'Reincarnation', '#41d878', [{ kind: 'exotic', id: 'reincarnation', params: { heroId: 'wraith-king' } }, { kind: 'heal', amount: 'damage', target: 'self' }, { kind: 'status', status: 'slow', duration: 'disable', target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 55 } }])
  ),
  'night-stalker': kit(
    target('ns-void', 'Void', '#1b2a58', [status('slow', 3, { moveSlowPct: 45 })]),
    nova('ns-crippling-fear', 'Crippling Fear', '#050814', [{ kind: 'status', status: 'fear', duration: 1.4, target: 'enemies-in-radius', radius: 'radius' }]),
    passive('ns-hunter-in-the-night', 'Hunter in the Night', '#7a8cff', { moveSpeedPct: 16, attackSpeed: 50 }),
    ultArea('ns-dark-ascension', 'Dark Ascension', '#1b2a58', [{ kind: 'statmod', mods: { damage: 65, moveSpeedPct: 25, visionPct: 45 }, duration: 'duration', target: 'self' }, { kind: 'status', status: 'fear', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }])
  ),
  invoker: kit(
    buff('invoker-orbs', 'Quas Wex Exort', '#f8d36a', { spellAmpPct: 10, manaRegen: 2, attackSpeed: 25 }, { duration: [8, 9, 10, 11] }),
    withAnim(ground('invoker-sun-strike', 'Sun Strike', '#f8d36a', [], 'pure'), 'global-cast'),
    summonSpell('invoker-forge-spirit', 'Forge Spirit', '#7a3cff', forgeSpirit, 1),
    ultArea('invoker-invoke', 'Invoke', '#a8e8ff', [{ kind: 'exotic', id: 'invoke', params: { heroId: 'invoker' } }, { kind: 'repeat', count: 3, interval: 0.4, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }] }], 'global-mark')
  ),
  silencer: kit(
    ground('silencer-arcane-curse', 'Arcane Curse', '#b78cff', [{ kind: 'status', status: 'silence', duration: 0.8, target: 'target' }]),
    attack('silencer-glaives', 'Glaives of Wisdom', '#e8e8ff', { procChance: 100, bonusDamage: 'damage', manaBurnPerHit: 'burn', manaBurnAsDamagePct: 0.6 }, { damage: [18, 30, 42, 54], burn: [20, 30, 40, 50] }),
    target('silencer-last-word', 'Last Word', '#332255', [status('silence', 2.2)]),
    ultArea('silencer-global-silence', 'Global Silence', '#b78cff', [{ kind: 'status', status: 'silence', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'global-mark')
  ),
  'outworld-destroyer': kit(
    attack('od-arcane-orb', 'Arcane Orb', '#64d8ff', { procChance: 100, bonusDamage: 'damage', manaBurnPerHit: 'burn', manaBurnAsDamagePct: 0.5 }, { damage: [20, 35, 50, 65], burn: [20, 35, 50, 65] }),
    target('od-astral-imprisonment', 'Astral Imprisonment', '#d8f7ff', [status('cyclone', 1.8), { kind: 'mana', op: 'restore', amount: 'damage', target: 'self' }]),
    passive('od-essence-flux', 'Essence Flux', '#222244', { maxMana: 220, manaRegen: 2 }),
    ultArea('od-sanitys-eclipse', "Sanity's Eclipse", '#64d8ff', [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'mana', op: 'burn', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }])
  ),
  'skywrath-mage': kit(
    target('sky-arcane-bolt', 'Arcane Bolt', '#7ec8ff'),
    target('sky-concussive-shot', 'Concussive Shot', '#f7e39a', [status('slow', 3, { moveSlowPct: 40 })]),
    target('sky-ancient-seal', 'Ancient Seal', '#244d86', [{ kind: 'status', status: 'silence', duration: 3, target: 'target' }, { kind: 'statmod', mods: { magicResistPct: -20 }, duration: 3, target: 'target' }]),
    withAnim(ultArea('sky-mystic-flare', 'Mystic Flare', '#7ec8ff', [{ kind: 'repeat', count: 4, interval: 0.35, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }] }], 'channel'), 'channel-loop')
  ),
  tinker: kit(
    target('tinker-laser', 'Laser', '#e05040', [status('blind', 2.5)]),
    target('tinker-missile', 'Heat-Seeking Missile', '#f8e07a'),
    buff('tinker-defense-matrix', 'Defense Matrix', '#30405a', { damageTakenReductionPct: 35, statusResistPct: 30 }, { duration: [5, 6, 7, 8] }, 'target'),
    ultArea('tinker-rearm', 'Rearm', '#e05040', [{ kind: 'exotic', id: 'rearm', params: { heroId: 'tinker' } }, { kind: 'exotic', id: 'refresh-cooldowns', params: { heroId: 'tinker' } }, { kind: 'statmod', mods: { spellAmpPct: 18 }, duration: 'duration', target: 'self' }], 'global-mark')
  ),
  enchantress: kit(
    attack('ench-impetus', 'Impetus', '#73d86b', { procChance: 100, bonusDamage: 'damage' }, { damage: [25, 45, 65, 85] }),
    target('ench-enchant', 'Enchant', '#fff2a6', [status('slow', 3, { moveSlowPct: 45 })]),
    buff('ench-attendants', "Nature's Attendants", '#345d2f', { hpRegen: 28 }, { duration: [6, 7, 8, 9] }),
    ultArea('ench-untouchable', 'Untouchable', '#73d86b', [{ kind: 'statmod', mods: { evasionPct: 50, attackDamageTakenReductionPct: 35 }, duration: 'duration', target: 'self' }, { kind: 'status', status: 'slow', duration: 'disable', target: 'enemies-in-radius', radius: 'radius', params: { attackSlowPct: 55 } }])
  ),
  chen: kit(
    target('chen-penitence', 'Penitence', '#f4e4a0', [status('slow', 3, { moveSlowPct: 35 })]),
    summonSpell('chen-persuasion', 'Holy Persuasion', '#ffffff', beast, 1),
    buff('chen-divine-favor', 'Divine Favor', '#67513a', { hpRegen: 18, armor: 4 }, { duration: [6, 7, 8, 9] }, 'target'),
    ultArea('chen-hand-of-god', 'Hand of God', '#f4e4a0', [{ kind: 'heal', amount: 'damage', target: 'allies-in-radius', radius: 'radius' }], 'global-mark')
  ),
  'natures-prophet': kit(
    ground('np-sprout', 'Sprout', '#4dbd62', [{ kind: 'status', status: 'root', duration: 1, target: 'target' }]),
    buff('np-teleportation', 'Teleportation', '#d8ffd8', { moveSpeedPct: 30, castRange: 120 }, { duration: [5, 6, 7, 8] }),
    summonSpell('np-natures-call', "Nature's Call", '#8b5a2b', treant, 'count'),
    ultArea('np-wrath', 'Wrath of Nature', '#4dbd62', [{ kind: 'repeat', count: 5, interval: 0.25, effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'random-enemy-in-radius', radius: 'radius' }] }], 'chain')
  ),
  beastmaster: kit(
    line('bm-wild-axes', 'Wild Axes', '#b8723a', [], 'physical'),
    summonSpell('bm-call-of-the-wild', 'Call of the Wild', '#f0c080', beast, 2),
    passive('bm-inner-beast', 'Inner Beast', '#3d2716', { attackSpeed: 45, damage: 12 }),
    ultTarget('bm-primal-roar', 'Primal Roar', '#b8723a', [{ kind: 'status', status: 'stun', duration: 'disable', target: 'target' }, { kind: 'displace', mode: 'knockback', target: 'target', toward: 'away-from-caster', distance: 320, speed: 1000 }], 'physical')
  ),
  broodmother: kit(
    buff('brood-hunger', 'Insatiable Hunger', '#5b2b72', { damage: 45, lifestealPct: 35 }, { duration: [6, 7, 8, 9] }),
    ground('brood-spin-web', 'Spin Web', '#111111', [{ kind: 'status', status: 'slow', duration: 1, target: 'target', params: { moveSlowPct: 25 } }]),
    summonSpell('brood-spiderlings', 'Spawn Spiderlings', '#d38cff', spider, 'count'),
    ultTarget('brood-silken-bola', 'Silken Bola', '#5b2b72', [{ kind: 'status', status: 'root', duration: 'disable', target: 'target' }, { kind: 'status', status: 'blind', duration: 'duration', target: 'target' }], 'physical')
  ),
  warlock: kit(
    target('warlock-fatal-bonds', 'Fatal Bonds', '#9b2d2d', [{ kind: 'status', status: 'taunt', duration: 1.2, target: 'target' }]),
    buff('warlock-shadow-word', 'Shadow Word', '#f2c06b', { hpRegen: 22 }, { duration: [6, 7, 8, 9] }, 'target'),
    ground('warlock-upheaval', 'Upheaval', '#3a1010', [{ kind: 'status', status: 'slow', duration: 1.2, target: 'target', params: { moveSlowPct: 35 } }]),
    ultArea('warlock-chaotic-offering', 'Chaotic Offering', '#9b2d2d', [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'summon', summon: golem, count: 1, at: 'self' }], 'summon-pop')
  ),
  visage: kit(
    target('visage-grave-chill', 'Grave Chill', '#77778f', [{ kind: 'status', status: 'slow', duration: 3, target: 'target', params: { moveSlowPct: 35, attackSlowPct: 35 } }, { kind: 'statmod', mods: { attackSpeed: 35, moveSpeed: 25 }, duration: 3, target: 'self' }]),
    target('visage-soul-assumption', 'Soul Assumption', '#c8c8e8'),
    passive('visage-cloak', 'Gravekeeper Cloak', '#22222f', { damageTakenReductionPct: 16, magicResistPct: 12 }),
    ultArea('visage-familiars', 'Summon Familiars', '#77778f', [{ kind: 'summon', summon: familiar, count: 2, at: 'self' }, { kind: 'status', status: 'stun', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'summon-pop')
  ),
  magnus: kit(
    line('magnus-shockwave', 'Shockwave', '#7a4a32', [{ kind: 'displace', mode: 'pull', target: 'target', toward: 'caster', distance: 180, speed: 900 }]),
    buff('magnus-empower', 'Empower', '#d8b080', { damagePct: 25 }, { duration: [8, 9, 10, 11] }, 'target'),
    line('magnus-skewer', 'Skewer', '#331a14', [{ kind: 'displace', mode: 'pull', target: 'target', toward: 'caster', distance: 360, speed: 1100 }, status('stun', 0.8)], 'physical'),
    withAnim(ultArea('magnus-rp', 'Reverse Polarity', '#7a4a32', [{ kind: 'displace', mode: 'pull', target: 'enemies-in-radius', radius: 'radius', toward: 'caster', distance: 520, speed: 1200 }, { kind: 'status', status: 'stun', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], 'storm'), 'ground-slam')
  ),
  'elder-titan': kit(
    nova('et-echo-stomp', 'Echo Stomp', '#8a6a4a', [{ kind: 'status', status: 'sleep', duration: 1.6, target: 'enemies-in-radius', radius: 'radius' }]),
    summonSpell('et-astral-spirit', 'Astral Spirit', '#e0d0b0', beast, 1),
    passive('et-natural-order', 'Natural Order', '#2f2418', { spellAmpPct: 10, damage: 16 }),
    withAnim(ultArea('et-earth-splitter', 'Earth Splitter', '#8a6a4a', [{ kind: 'damage', dtype: 'pure', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'slow', duration: 'disable', target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 55 } }], 'wall'), 'ground-slam')
  ),
  tiny: kit(
    ground('tiny-avalanche', 'Avalanche', '#9a9a8a', [{ kind: 'status', status: 'stun', duration: 0.8, target: 'target' }], 'physical'),
    target('tiny-toss', 'Toss', '#e0e0d0', [{ kind: 'displace', mode: 'knockback', target: 'target', toward: 'away-from-caster', distance: 360, speed: 1000 }], 'physical'),
    buff('tiny-tree-grab', 'Tree Grab', '#56564f', { damage: 45, attackRange: 80 }, { duration: [6, 7, 8, 9] }),
    ultArea('tiny-grow', 'Grow', '#9a9a8a', [{ kind: 'statmod', mods: { damage: 90, armor: 10, attackSpeed: -25 }, duration: 'duration', target: 'self' }, { kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }])
  ),
  'treant-protector': kit(
    ground('treant-natures-grasp', "Nature's Grasp", '#3f7a3a', [{ kind: 'status', status: 'root', duration: 1, target: 'target' }]),
    target('treant-leech-seed', 'Leech Seed', '#6b4f2a', [{ kind: 'heal', amount: 'damage', target: 'self' }]),
    buff('treant-living-armor', 'Living Armor', '#d8f0a8', { armor: 8, hpRegen: 18 }, { duration: [6, 7, 8, 9] }, 'target'),
    ultArea('treant-overgrowth', 'Overgrowth', '#3f7a3a', [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'root', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'wall')
  ),
  'centaur-warrunner': kit(
    nova('centaur-hoof-stomp', 'Hoof Stomp', '#9a5a32', [{ kind: 'status', status: 'stun', duration: 1.3, target: 'enemies-in-radius', radius: 'radius' }], 'physical'),
    nova('centaur-double-edge', 'Double Edge', '#f0c090', [{ kind: 'damage', dtype: 'pure', amount: 80, target: 'self' }], 'physical'),
    passive('centaur-retaliate', 'Retaliate', '#4a2712', { armor: 8, damage: 18 }),
    ultArea('centaur-stampede', 'Stampede', '#9a5a32', [{ kind: 'statmod', mods: { moveSpeedPct: 45 }, duration: 'duration', target: 'allies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 0.8, target: 'enemies-in-radius', radius: 'radius' }])
  ),
  'storm-spirit': kit(
    ground('storm-remnant', 'Static Remnant', '#58a8ff'),
    target('storm-vortex', 'Electric Vortex', '#ffffff', [{ kind: 'displace', mode: 'pull', target: 'target', toward: 'caster', distance: 300, speed: 900 }, status('stun', 1.1)]),
    attack('storm-overload', 'Overload', '#1c3c7a', { procChance: 35, bonusDamage: 'damage', procStatus: { status: 'slow', duration: 1, params: { moveSlowPct: 35 } } }, { damage: [30, 50, 70, 90] }),
    withAnim(ultArea('storm-ball-lightning', 'Ball Lightning', '#58a8ff', [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 800 }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], 'global-mark'), 'dash')
  ),
  'ember-spirit': kit(
    nova('ember-searing-chains', 'Searing Chains', '#ff6b2a', [{ kind: 'status', status: 'root', duration: 1.6, target: 'enemies-in-radius', radius: 'radius' }]),
    nova('ember-sleight', 'Sleight of Fist', '#ffd27a', [], 'physical'),
    buff('ember-flame-guard', 'Flame Guard', '#4a1308', { damageTakenReductionPct: 35 }, { duration: [6, 7, 8, 9] }),
    withAnim(ultArea('ember-fire-remnant', 'Fire Remnant', '#ff6b2a', [{ kind: 'displace', mode: 'blink', target: 'self', toward: 'point', distance: 850 }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }]), 'dash')
  ),
  spectre: kit(
    line('spectre-dagger', 'Spectral Dagger', '#7a67ff', [status('slow', 2.5, { moveSlowPct: 35 })]),
    attack('spectre-desolate', 'Desolate', '#d8d0ff', { procChance: 100, bonusDamage: 'damage' }, { damage: [20, 35, 50, 65] }),
    passive('spectre-dispersion', 'Dispersion', '#1d1838', { damageTakenReductionPct: 16, armor: 4 }),
    withAnim(ultArea('spectre-haunt', 'Haunt', '#7a67ff', [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'fear', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'global-mark'), 'summon-gesture')
  ),
  'faceless-void': kit(
    buff('fv-time-walk', 'Time Walk', '#5a46c8', { moveSpeedPct: 45, damageTakenReductionPct: 30 }, { duration: [3, 3.5, 4, 4.5] }),
    nova('fv-time-dilation', 'Time Dilation', '#c2b8ff', [{ kind: 'status', status: 'slow', duration: 3, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 35, attackSlowPct: 35 } }]),
    attack('fv-time-lock', 'Time Lock', '#1c163a', { procChance: 24, bonusDamage: 'damage', procStatus: { status: 'stun', duration: 0.6 } }, { damage: [25, 45, 65, 85] }),
    ultArea('fv-chronosphere', 'Chronosphere', '#5a46c8', [{ kind: 'exotic', id: 'chronosphere', params: { heroId: 'faceless-void' } }, { kind: 'status', status: 'frozen', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }], 'global-mark')
  ),
  terrorblade: kit(
    target('tb-reflection', 'Reflection', '#4bb8ff', [status('slow', 2.5, { moveSlowPct: 35 })]),
    summonSpell('tb-conjure-image', 'Conjure Image', '#d8f5ff', terrorImage, 'count'),
    buff('tb-metamorphosis', 'Metamorphosis', '#101426', { attackRange: 350, damage: 55 }, { duration: [8, 10, 12, 14] }),
    ultTarget('tb-sunder', 'Sunder', '#4bb8ff', [{ kind: 'heal', amount: 'damage', target: 'self' }, { kind: 'damage', dtype: 'pure', amount: 'damage', target: 'target' }], 'pure')
  ),
  phoenix: kit(
    line('phoenix-icarus-dive', 'Icarus Dive', '#ff7a30', [status('slow', 2, { moveSlowPct: 30 })]),
    target('phoenix-fire-spirits', 'Fire Spirits', '#ffe07a', [{ kind: 'status', status: 'slow', duration: 3, target: 'target', params: { attackSlowPct: 55, dotDps: 24, dotType: 'magical' } }]),
    line('phoenix-sun-ray', 'Sun Ray', '#7a1e08', [{ kind: 'heal', amount: 'damage', target: 'self' }]),
    withAnim(ultArea('phoenix-supernova', 'Supernova', '#ff7a30', [{ kind: 'summon', summon: egg, count: 1, at: 'self' }, { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }, { kind: 'status', status: 'stun', duration: 'disable', target: 'enemies-in-radius', radius: 'radius' }], 'global-mark'), 'summon-gesture')
  ),
  io: kit(
    buff('io-tether', 'Tether', '#c8f6ff', { moveSpeedPct: 20, hpRegen: 18 }, { duration: [6, 7, 8, 9] }, 'target'),
    nova('io-spirits', 'Spirits', '#ffffff'),
    buff('io-overcharge', 'Overcharge', '#7aa8ff', { attackSpeed: 70, damageTakenReductionPct: 20 }, { duration: [5, 6, 7, 8] }, 'target'),
    ultArea('io-relocate', 'Relocate', '#c8f6ff', [{ kind: 'statmod', mods: { moveSpeedPct: 45, castRange: 300 }, duration: 'duration', target: 'allies-in-radius', radius: 'radius' }, { kind: 'heal', amount: 'damage', target: 'allies-in-radius', radius: 'radius' }], 'global-mark')
  )
};
