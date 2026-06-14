import type { AbilityDef, HeroBaseStats, HeroDef, StatModMap } from '../../core/types';
import { AUTHORED_PHASE3_KITS, AUTHORED_PHASE3_AGHANIMS } from './phase3-kits';
import { buildSeedAghanim } from './seed-aghanim';
import { echoLoopNote } from './loop-note';

type HeroSeed = {
  id: string;
  name: string;
  title: string;
  attribute: HeroDef['attribute'];
  roles: string[];
  region: string;
  abilities: [string, string, string, string];
  palette: [string, string, string];
  ranged?: boolean;
  summon?: boolean;
  exotic?: string;
};

const PIERCING_GENERATED_ULTS = new Set(['doom']);

function baseStats(attribute: HeroDef['attribute'], ranged: boolean): HeroBaseStats {
  const primary = attribute === 'uni' ? 'agi' : attribute;
  return {
    str: primary === 'str' ? 25 : 19,
    agi: primary === 'agi' ? 25 : 18,
    int: primary === 'int' ? 25 : 18,
    strGain: primary === 'str' ? 3.2 : 2.1,
    agiGain: primary === 'agi' ? 3.2 : 2.1,
    intGain: primary === 'int' ? 3.2 : 2.1,
    baseDamage: ranged ? 28 : 36,
    baseArmor: primary === 'agi' ? 4 : 2,
    attackRange: ranged ? 600 : 150,
    attackPoint: ranged ? 0.4 : 0.32,
    baseAttackTime: 1.7,
    attackProjectileSpeed: ranged ? 1000 : undefined,
    moveSpeed: ranged ? 300 : 310,
    turnRate: 0.6,
    hpRegen: primary === 'str' ? 3.5 : primary === 'agi' ? 2.5 : 2.0,
    manaRegen: primary === 'int' ? 2.5 : 1.5
  };
}

function vfxColor(seed: HeroSeed): string {
  return seed.palette[0];
}

function strike(seed: HeroSeed): AbilityDef {
  return {
    id: `${seed.id}-strike`,
    name: seed.abilities[0],
    targeting: seed.ranged ? 'unit-target' : 'skillshot',
    affects: 'enemy',
    castRange: seed.ranged ? 700 : 450,
    castPoint: 0.25,
    manaCost: [70, 80, 90, 100],
    cooldown: [10, 9, 8, 7],
    values: { damage: [85, 140, 195, 250], speed: [1000, 1000, 1000, 1000] },
    effects: seed.ranged
      ? [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }]
      : [{ kind: 'projectile', to: 'point', proj: { model: 'linear', speed: 'speed', width: 160, range: 700, onHit: [{ kind: 'damage', dtype: 'physical', amount: 'damage', target: 'target' }] } }],
    vfx: { archetype: seed.ranged ? 'beam' : 'projectile', color: vfxColor(seed), scale: 0.8 },
    anim: seed.ranged ? 'staff-cast' : 'melee-swing',
    sound: seed.ranged ? 'storm' : 'blade'
  };
}

function control(seed: HeroSeed): AbilityDef {
  return {
    id: `${seed.id}-control`,
    name: seed.abilities[1],
    targeting: 'ground-aoe',
    castRange: 650,
    castPoint: 0.35,
    manaCost: [85, 95, 105, 115],
    cooldown: [16, 15, 14, 13],
    values: { damage: [70, 120, 170, 220], radius: [260, 280, 300, 320], disable: [1.1, 1.3, 1.5, 1.7] },
    effects: [
      { kind: 'damage', dtype: seed.attribute === 'agi' ? 'physical' : 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
      { kind: 'status', status: seed.roles.includes('disabler') ? 'stun' : 'slow', duration: 'disable', target: 'enemies-in-radius', radius: 'radius', params: seed.roles.includes('disabler') ? undefined : { moveSlowPct: 28 } }
    ],
    vfx: { archetype: 'ground-aoe', color: vfxColor(seed), color2: seed.palette[1], scale: 0.9 },
    anim: 'ground-slam',
    sound: seed.attribute === 'str' ? 'impact' : 'storm'
  };
}

function summonAbility(seed: HeroSeed): AbilityDef {
  return {
    id: `${seed.id}-summon`,
    name: seed.abilities[2],
    targeting: 'point-target',
    castRange: 500,
    castPoint: 0.3,
    manaCost: [90, 100, 110, 120],
    cooldown: [28, 25, 22, 19],
    values: { lifetime: [18, 22, 26, 30], count: [1, 1, 2, 2] },
    effects: [{
      kind: 'summon',
      at: 'point',
      count: 'count',
      summon: {
        id: `${seed.id}-minion`,
        name: `${seed.name} Minion`,
        lifetime: 'lifetime',
        stats: { maxHp: 520, damage: 34, armor: 2, moveSpeed: 310, attackRange: 130, baseAttackTime: 1.6 },
        silhouette: { build: 'biped', scale: 0.75, bodyShape: 'slim', head: 'bare', weapon: 'sword' },
        palette: seed.palette
      }
    }],
    vfx: { archetype: 'summon-pop', color: seed.palette[1], scale: 0.8 },
    anim: 'summon-gesture',
    sound: 'summon'
  };
}

function passive(seed: HeroSeed): AbilityDef {
  const mods: Record<string, number> = seed.attribute === 'str'
    ? { maxHp: 120, damage: 12 }
    : seed.attribute === 'agi'
      ? { attackSpeed: 25, evasionPct: 8 }
      : { manaRegen: 1.8, spellAmpPct: 8 };
  return {
    id: `${seed.id}-passive`,
    name: seed.abilities[2],
    targeting: seed.roles.includes('support') ? 'aura' : 'passive',
    passiveMods: seed.roles.includes('support') ? undefined : mods,
    aura: seed.roles.includes('support') ? { radius: 1000, affects: 'allies', mods: { hpRegen: 2, manaRegen: 1 } } : undefined,
    vfx: { archetype: 'shield', color: seed.palette[1], scale: 0.55 },
    anim: 'staff-cast',
    sound: seed.roles.includes('support') ? 'heal' : 'roar'
  };
}

function ultimate(seed: HeroSeed): AbilityDef {
  const effects: AbilityDef['effects'] = [
    { kind: 'damage', dtype: seed.attribute === 'str' ? 'physical' : 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
    { kind: 'status', status: seed.roles.includes('escape') ? 'slow' : 'stun', duration: 'disable', target: 'enemies-in-radius', radius: 'radius', params: seed.roles.includes('escape') ? { moveSlowPct: 45 } : undefined }
  ];
  if (seed.exotic) effects.unshift({ kind: 'exotic', id: seed.exotic, params: { heroId: seed.id } });
  return {
    id: `${seed.id}-ult`,
    name: seed.abilities[3],
    targeting: 'no-target',
    ult: true,
    piercesImmunity: PIERCING_GENERATED_ULTS.has(seed.id),
    castPoint: 0.45,
    manaCost: [150, 250, 350],
    cooldown: [95, 80, 65],
    values: { damage: [260, 420, 580], radius: [520, 600, 680], disable: [1.5, 2, 2.5] },
    effects,
    vfx: { archetype: seed.exotic ? 'global-mark' : 'storm', color: seed.palette[2], color2: seed.palette[0], scale: 1.2 },
    anim: seed.exotic ? 'global-cast' : 'channel-loop',
    sound: seed.exotic ? 'void' : 'roar'
  };
}

function talents(id: string, abilities: AbilityDef[]): HeroDef['talents'] {
  const basic = abilities.find((a) => !a.ult && a.values?.damage) ?? abilities[0];
  const ult = abilities.find((a) => a.ult && a.values?.damage) ?? abilities.find((a) => a.ult) ?? abilities[3];
  const basicKey = basic.values?.damage ? 'damage' : Object.keys(basic.values ?? { damage: [0] })[0];
  const ultKey = ult.values?.damage ? 'damage' : Object.keys(ult.values ?? { damage: [0] })[0];
  return [
    { level: 10, options: [{ id: `${id}-t10a`, name: '+8 Primary Stats', mods: { str: 3, agi: 3, int: 3 } as StatModMap }, { id: `${id}-t10b`, name: '+100 Health', mods: { maxHp: 100 } }] },
    { level: 15, options: [{ id: `${id}-t15a`, name: '+30 Attack Speed', mods: { attackSpeed: 30 } }, { id: `${id}-t15b`, name: '+10% Spell Amp', mods: { spellAmpPct: 10 } }] },
    { level: 20, options: [{ id: `${id}-t20a`, name: '+Ability Damage', abilityOverride: { abilityId: basic.id, valueKey: basicKey, mode: 'add', amount: 55 } }, { id: `${id}-t20b`, name: '+25 Move Speed', mods: { moveSpeed: 25 } }] },
    { level: 25, options: [{ id: `${id}-t25a`, name: '+Ultimate Damage', abilityOverride: { abilityId: ult.id, valueKey: ultKey, mode: 'add', amount: 120 } }, { id: `${id}-t25b`, name: '+18 All Stats', mods: { str: 18, agi: 18, int: 18 } }] }
  ];
}

function hero(seed: HeroSeed): HeroDef {
  const ranged = seed.ranged ?? seed.attribute === 'int';
  const abilities: AbilityDef[] = AUTHORED_PHASE3_KITS[seed.id] ?? [
    strike({ ...seed, ranged }),
    control({ ...seed, ranged }),
    seed.summon ? summonAbility({ ...seed, ranged }) : passive({ ...seed, ranged }),
    ultimate({ ...seed, ranged })
  ];
  return {
    id: seed.id,
    name: seed.name,
    title: seed.title,
    attribute: seed.attribute,
    roles: seed.roles,
    region: seed.region,
    lore: `${seed.name} follows the Mad Moon fractures into ${seed.region.replaceAll('-', ' ')}, translating a recognizable Dota kit into the shared Ancients rules.${echoLoopNote(seed.id)}`,
    baseStats: baseStats(seed.attribute, ranged),
    abilities,
    skillOrder: [0, 1, 2],
    talents: talents(seed.id, abilities),
    facets: [
      { id: `${seed.id}-facet-tempo`, name: 'Tempo', description: 'A Phase 3 facet that sharpens the hero identity.', mods: seed.attribute === 'str' ? { str: 6 } : seed.attribute === 'agi' ? { agi: 6 } : { int: 6 } },
      { id: `${seed.id}-facet-reach`, name: 'Reach', description: 'Adds cast range for macro and raid control.', mods: { castRange: 80 } }
    ],
    aghanim: AUTHORED_PHASE3_AGHANIMS[seed.id] ?? buildSeedAghanim(seed.name, abilities),
    silhouette: {
      build: seed.roles.includes('durable') ? 'brute' : seed.summon ? 'biped' : 'biped',
      scale: seed.roles.includes('durable') ? 1.12 : 1,
      bodyShape: seed.attribute === 'str' ? 'bulky' : seed.attribute === 'int' ? 'robed' : 'slim',
      head: seed.roles.includes('escape') ? 'hood' : seed.attribute === 'str' ? 'helm' : 'bare',
      weapon: ranged ? 'staff' : 'sword',
      extras: seed.summon ? ['cape'] : seed.roles.includes('carry') ? ['shoulderpads'] : []
    },
    palette: seed.palette,
    barks: [
      `${seed.name} hears the ancient draft begin.`,
      'No fragment gets to hide forever.',
      'Hold the line and count cooldowns.',
      'The map opens. So do they.',
      'Another echo, another answer.',
      'We farm the impossible until it drops.'
    ],
    bounty: { xp: 520, gold: 340 },
    recruitmentQuestId: `recruit-${seed.id}`,
    animProfile: { rig: ranged ? 'caster' : 'fighter', castStyle: seed.attribute === 'int' ? 'spell' : 'weapon', voiceTimbre: seed.attribute === 'str' ? 'low' : seed.attribute === 'agi' ? 'sharp' : 'bright' }
  };
}

const SEEDS: HeroSeed[] = [
  { id: 'legion-commander', name: 'Legion Commander', title: 'Tresdin', attribute: 'str', roles: ['carry', 'durable', 'initiator'], region: 'tranquil-vale', abilities: ['Overwhelming Odds', 'Press the Attack', 'Moment of Courage', 'Duel'], palette: ['#c23b2a', '#f0d48a', '#642018'] },
  { id: 'vengeful-spirit', name: 'Vengeful Spirit', title: 'Shendelzare', attribute: 'agi', roles: ['support', 'disabler'], region: 'tranquil-vale', abilities: ['Magic Missile', 'Wave of Terror', 'Vengeance Aura', 'Nether Swap'], palette: ['#5d75ff', '#c7d4ff', '#252a72'], ranged: true },
  { id: 'shadow-fiend', name: 'Shadow Fiend', title: 'Nevermore', attribute: 'agi', roles: ['carry', 'nuker'], region: 'nightsilver-woods', abilities: ['Shadowraze', 'Necromastery', 'Presence of the Dark Lord', 'Requiem of Souls'], palette: ['#111111', '#d84a32', '#5f0b0b'], ranged: true },
  { id: 'riki', name: 'Riki', title: 'Stealth Assassin', attribute: 'agi', roles: ['carry', 'escape'], region: 'nightsilver-woods', abilities: ['Smoke Screen', 'Blink Strike', 'Cloak and Dagger', 'Tricks of the Trade'], palette: ['#6a4cff', '#1c1436', '#c8b8ff'] },
  { id: 'bounty-hunter', name: 'Bounty Hunter', title: 'Gondar', attribute: 'agi', roles: ['escape', 'nuker'], region: 'nightsilver-woods', abilities: ['Shuriken Toss', 'Jinada', 'Shadow Walk', 'Track'], palette: ['#d99a28', '#4a2a12', '#f2df7a'] },
  { id: 'lion', name: 'Lion', title: 'Demon Witch', attribute: 'int', roles: ['support', 'disabler', 'nuker'], region: 'icewrack', abilities: ['Earth Spike', 'Hex', 'Mana Drain', 'Finger of Death'], palette: ['#a347ff', '#ffca66', '#3d124f'], ranged: true },
  { id: 'winter-wyvern', name: 'Winter Wyvern', title: 'Auroth', attribute: 'int', roles: ['support', 'disabler'], region: 'icewrack', abilities: ['Arctic Burn', 'Splinter Blast', 'Cold Embrace', "Winter's Curse"], palette: ['#9fe8ff', '#ffffff', '#3d75b8'], ranged: true },
  { id: 'sand-king', name: 'Sand King', title: 'Crixalis', attribute: 'str', roles: ['initiator', 'disabler', 'nuker'], region: 'devarshi-desert', abilities: ['Burrowstrike', 'Sand Storm', 'Caustic Finale', 'Epicenter'], palette: ['#d9a441', '#7a4b1c', '#fff0a8'] },
  { id: 'nyx-assassin', name: 'Nyx Assassin', title: 'Zealot Scarab', attribute: 'uni', roles: ['disabler', 'escape', 'nuker'], region: 'devarshi-desert', abilities: ['Impale', 'Mind Flare', 'Spiked Carapace', 'Vendetta'], palette: ['#5d3b9a', '#c4a3ff', '#1f1436'] },
  { id: 'medusa', name: 'Medusa', title: 'Gorgon', attribute: 'agi', roles: ['carry', 'durable'], region: 'devarshi-desert', abilities: ['Split Shot', 'Mystic Snake', 'Mana Shield', 'Stone Gaze'], palette: ['#2aa86b', '#d8f5a2', '#394b2c'], ranged: true, exotic: 'stone-gaze' },
  { id: 'viper', name: 'Viper', title: 'Netherdrake', attribute: 'agi', roles: ['carry', 'durable'], region: 'devarshi-desert', abilities: ['Poison Attack', 'Nethertoxin', 'Corrosive Skin', 'Viper Strike'], palette: ['#6fc247', '#273a18', '#c8ff7a'], ranged: true },
  { id: 'kunkka', name: 'Kunkka', title: 'Admiral', attribute: 'str', roles: ['carry', 'disabler'], region: 'shadeshore', abilities: ['Torrent', 'Tidebringer', 'X Marks the Spot', 'Ghostship'], palette: ['#2a6d9a', '#e8d8a0', '#112940'] },
  { id: 'tidehunter', name: 'Tidehunter', title: 'Leviathan', attribute: 'str', roles: ['durable', 'initiator'], region: 'shadeshore', abilities: ['Gush', 'Kraken Shell', 'Anchor Smash', 'Ravage'], palette: ['#2aa88f', '#13453e', '#b4f0dd'] },
  { id: 'slardar', name: 'Slardar', title: 'Slithereen Guard', attribute: 'str', roles: ['durable', 'disabler'], region: 'shadeshore', abilities: ['Guardian Sprint', 'Slithereen Crush', 'Bash of the Deep', 'Corrosive Haze'], palette: ['#8050d8', '#2a1a4a', '#cbb8ff'] },
  { id: 'naga-siren', name: 'Naga Siren', title: 'Slithice', attribute: 'agi', roles: ['carry', 'pusher', 'disabler'], region: 'shadeshore', abilities: ['Mirror Image', 'Ensnare', 'Rip Tide', 'Song of the Siren'], palette: ['#4bb8d8', '#f0d08a', '#174257'], summon: true },
  { id: 'slark', name: 'Slark', title: 'Nightcrawler', attribute: 'agi', roles: ['carry', 'escape'], region: 'shadeshore', abilities: ['Dark Pact', 'Pounce', 'Essence Shift', 'Shadow Dance'], palette: ['#2a6f8f', '#1b2730', '#9bdcff'] },
  { id: 'lifestealer', name: 'Lifestealer', title: "N'aix", attribute: 'str', roles: ['carry', 'durable'], region: 'vile-reaches', abilities: ['Rage', 'Feast', 'Ghoul Frenzy', 'Infest'], palette: ['#b24a32', '#34120d', '#e8b082'] },
  { id: 'undying', name: 'Undying', title: 'Dirge', attribute: 'str', roles: ['support', 'durable', 'pusher'], region: 'vile-reaches', abilities: ['Decay', 'Soul Rip', 'Tombstone', 'Flesh Golem'], palette: ['#5aa36a', '#233323', '#d8e8aa'], summon: true },
  { id: 'doom', name: 'Doom', title: 'Lucifer', attribute: 'str', roles: ['carry', 'durable', 'disabler'], region: 'vile-reaches', abilities: ['Devour', 'Scorched Earth', 'Infernal Blade', 'Doom'], palette: ['#c23a1f', '#201010', '#ff9a3a'] },
  { id: 'wraith-king', name: 'Wraith King', title: 'Ostarion', attribute: 'str', roles: ['carry', 'durable'], region: 'vile-reaches', abilities: ['Wraithfire Blast', 'Vampiric Spirit', 'Mortal Strike', 'Reincarnation'], palette: ['#41d878', '#143821', '#d8ffd8'], exotic: 'reincarnation' },
  { id: 'night-stalker', name: 'Night Stalker', title: 'Balanar', attribute: 'str', roles: ['durable', 'initiator'], region: 'vile-reaches', abilities: ['Void', 'Crippling Fear', 'Hunter in the Night', 'Dark Ascension'], palette: ['#1b2a58', '#050814', '#7a8cff'] },
  { id: 'invoker', name: 'Invoker', title: 'Arsenal Magus', attribute: 'int', roles: ['nuker', 'disabler'], region: 'quoidge', abilities: ['Quas Wex Exort', 'Sun Strike', 'Forge Spirit', 'Invoke'], palette: ['#f8d36a', '#a8e8ff', '#7a3cff'], ranged: true, summon: true, exotic: 'invoke' },
  { id: 'silencer', name: 'Silencer', title: 'Nortrom', attribute: 'int', roles: ['support', 'disabler'], region: 'quoidge', abilities: ['Arcane Curse', 'Glaives of Wisdom', 'Last Word', 'Global Silence'], palette: ['#b78cff', '#e8e8ff', '#332255'], ranged: true },
  { id: 'outworld-destroyer', name: 'Outworld Destroyer', title: 'Harbinger', attribute: 'int', roles: ['carry', 'nuker'], region: 'quoidge', abilities: ['Arcane Orb', 'Astral Imprisonment', 'Essence Flux', "Sanity's Eclipse"], palette: ['#64d8ff', '#222244', '#d8f7ff'], ranged: true },
  { id: 'skywrath-mage', name: 'Skywrath Mage', title: 'Dragonus', attribute: 'int', roles: ['support', 'nuker'], region: 'quoidge', abilities: ['Arcane Bolt', 'Concussive Shot', 'Ancient Seal', 'Mystic Flare'], palette: ['#7ec8ff', '#f7e39a', '#244d86'], ranged: true },
  { id: 'tinker', name: 'Tinker', title: 'Boush', attribute: 'int', roles: ['nuker', 'pusher'], region: 'quoidge', abilities: ['Laser', 'Heat-Seeking Missile', 'Defense Matrix', 'Rearm'], palette: ['#e05040', '#f8e07a', '#30405a'], ranged: true, exotic: 'rearm' },
  { id: 'enchantress', name: 'Enchantress', title: 'Aiushtha', attribute: 'int', roles: ['support', 'pusher'], region: 'hidden-wood', abilities: ['Impetus', 'Enchant', "Nature's Attendants", 'Untouchable'], palette: ['#73d86b', '#fff2a6', '#345d2f'], ranged: true, summon: true },
  { id: 'chen', name: 'Chen', title: 'Holy Knight', attribute: 'int', roles: ['support', 'pusher'], region: 'hidden-wood', abilities: ['Penitence', 'Holy Persuasion', 'Divine Favor', 'Hand of God'], palette: ['#f4e4a0', '#ffffff', '#67513a'], ranged: true, summon: true },
  { id: 'natures-prophet', name: "Nature's Prophet", title: 'Furion', attribute: 'int', roles: ['pusher', 'nuker'], region: 'hidden-wood', abilities: ['Sprout', 'Teleportation', "Nature's Call", "Wrath of Nature"], palette: ['#4dbd62', '#8b5a2b', '#d8ffd8'], ranged: true, summon: true },
  { id: 'beastmaster', name: 'Beastmaster', title: 'Karroch', attribute: 'uni', roles: ['initiator', 'pusher'], region: 'hidden-wood', abilities: ['Wild Axes', 'Call of the Wild', 'Inner Beast', 'Primal Roar'], palette: ['#b8723a', '#3d2716', '#f0c080'], summon: true },
  { id: 'broodmother', name: 'Broodmother', title: 'Black Arachnia', attribute: 'agi', roles: ['carry', 'pusher', 'escape'], region: 'hidden-wood', abilities: ['Insatiable Hunger', 'Spin Web', 'Spawn Spiderlings', 'Silken Bola'], palette: ['#5b2b72', '#111111', '#d38cff'], summon: true },
  { id: 'warlock', name: 'Warlock', title: 'Demnok Lannik', attribute: 'int', roles: ['support', 'initiator'], region: 'hidden-wood', abilities: ['Fatal Bonds', 'Shadow Word', 'Upheaval', 'Chaotic Offering'], palette: ['#9b2d2d', '#3a1010', '#f2c06b'], ranged: true, summon: true },
  { id: 'visage', name: 'Visage', title: 'Necrolic', attribute: 'uni', roles: ['support', 'pusher'], region: 'hidden-wood', abilities: ['Grave Chill', 'Soul Assumption', 'Gravekeeper Cloak', 'Summon Familiars'], palette: ['#77778f', '#22222f', '#c8c8e8'], ranged: true, summon: true },
  { id: 'magnus', name: 'Magnus', title: 'Magnoceros', attribute: 'uni', roles: ['initiator', 'disabler'], region: 'mount-joerlak', abilities: ['Shockwave', 'Empower', 'Skewer', 'Reverse Polarity'], palette: ['#7a4a32', '#d8b080', '#331a14'] },
  { id: 'elder-titan', name: 'Elder Titan', title: 'Worldsmith', attribute: 'str', roles: ['initiator', 'disabler'], region: 'mount-joerlak', abilities: ['Echo Stomp', 'Astral Spirit', 'Natural Order', 'Earth Splitter'], palette: ['#8a6a4a', '#e0d0b0', '#2f2418'], summon: true },
  { id: 'tiny', name: 'Tiny', title: 'Stone Giant', attribute: 'str', roles: ['carry', 'durable'], region: 'mount-joerlak', abilities: ['Avalanche', 'Toss', 'Tree Grab', 'Grow'], palette: ['#9a9a8a', '#56564f', '#e0e0d0'] },
  { id: 'treant-protector', name: 'Treant Protector', title: 'Rooftrellen', attribute: 'str', roles: ['support', 'durable'], region: 'mount-joerlak', abilities: ["Nature's Grasp", 'Leech Seed', 'Living Armor', 'Overgrowth'], palette: ['#3f7a3a', '#6b4f2a', '#d8f0a8'] },
  { id: 'centaur-warrunner', name: 'Centaur Warrunner', title: 'Bradwarden', attribute: 'str', roles: ['durable', 'initiator'], region: 'mount-joerlak', abilities: ['Hoof Stomp', 'Double Edge', 'Retaliate', 'Stampede'], palette: ['#9a5a32', '#4a2712', '#f0c090'] },
  { id: 'storm-spirit', name: 'Storm Spirit', title: 'Raijin Thunderkeg', attribute: 'int', roles: ['carry', 'escape', 'nuker'], region: 'mount-joerlak', abilities: ['Static Remnant', 'Electric Vortex', 'Overload', 'Ball Lightning'], palette: ['#58a8ff', '#ffffff', '#1c3c7a'], ranged: true },
  { id: 'ember-spirit', name: 'Ember Spirit', title: 'Xin', attribute: 'agi', roles: ['carry', 'escape', 'nuker'], region: 'mount-joerlak', abilities: ['Searing Chains', 'Sleight of Fist', 'Flame Guard', 'Fire Remnant'], palette: ['#ff6b2a', '#ffd27a', '#4a1308'] },
  { id: 'spectre', name: 'Spectre', title: 'Mercurial', attribute: 'agi', roles: ['carry', 'durable'], region: 'mad-moon-crater', abilities: ['Spectral Dagger', 'Desolate', 'Dispersion', 'Haunt'], palette: ['#7a67ff', '#1d1838', '#d8d0ff'] },
  { id: 'faceless-void', name: 'Faceless Void', title: 'Darkterror', attribute: 'agi', roles: ['carry', 'initiator'], region: 'mad-moon-crater', abilities: ['Time Walk', 'Time Dilation', 'Time Lock', 'Chronosphere'], palette: ['#5a46c8', '#1c163a', '#c2b8ff'], exotic: 'chronosphere' },
  { id: 'terrorblade', name: 'Terrorblade', title: 'Demon Marauder', attribute: 'agi', roles: ['carry', 'pusher'], region: 'mad-moon-crater', abilities: ['Reflection', 'Conjure Image', 'Metamorphosis', 'Sunder'], palette: ['#4bb8ff', '#101426', '#d8f5ff'], summon: true },
  { id: 'phoenix', name: 'Phoenix', title: 'Icarus', attribute: 'uni', roles: ['support', 'nuker'], region: 'mad-moon-crater', abilities: ['Icarus Dive', 'Fire Spirits', 'Sun Ray', 'Supernova'], palette: ['#ff7a30', '#ffe07a', '#7a1e08'], ranged: true },
  { id: 'io', name: 'Io', title: 'Wisp', attribute: 'uni', roles: ['support', 'escape'], region: 'mad-moon-crater', abilities: ['Tether', 'Spirits', 'Overcharge', 'Relocate'], palette: ['#c8f6ff', '#ffffff', '#7aa8ff'], ranged: true }
];

export const PHASE3_HEROES: HeroDef[] = SEEDS.map(hero);
