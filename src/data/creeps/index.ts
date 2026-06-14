import type { CreepDef } from '../../core/types';
import { gestureForAbility, soundForAbility } from '../../core/gestures';

// ============================================================
// Phase 1 wild creeps — the catchable "Pokémon" of the vale,
// with their real Dota neutral abilities (SPEC §5).
// ============================================================

export const KOBOLD: CreepDef = {
  id: 'kobold',
  name: 'Kobold',
  tier: 'small',
  stats: { maxHp: 240, damage: 14, armor: 0, magicResistPct: 0, moveSpeed: 280, attackRange: 100, baseAttackTime: 1.6 },
  abilities: [],
  bounty: { xp: 28, gold: 16 },
  silhouette: { build: 'biped', scale: 0.55, bodyShape: 'slim', head: 'bare', weapon: 'sword' },
  palette: ['#b8743c', '#7a4a22', '#e8d8a0'],
  aggroRadius: 500
};

export const KOBOLD_FOREMAN: CreepDef = {
  id: 'kobold-foreman',
  name: 'Kobold Foreman',
  tier: 'medium',
  stats: { maxHp: 400, damage: 22, armor: 1, magicResistPct: 0, moveSpeed: 290, attackRange: 100, baseAttackTime: 1.5 },
  abilities: [
    {
      id: 'kobold-speed-aura',
      name: 'Speed Aura',
      targeting: 'aura',
      aura: { radius: 900, affects: 'allies', mods: { moveSpeedPct: 12 } },
      vfx: { archetype: 'global-mark', color: '#ffd27f', scale: 0.4 }
    }
  ],
  bounty: { xp: 48, gold: 30 },
  silhouette: { build: 'biped', scale: 0.7, bodyShape: 'slim', head: 'helm', weapon: 'totem', extras: ['belt'] },
  palette: ['#c8843c', '#7a4a22', '#ffd27f'],
  aggroRadius: 550
};

export const HILL_TROLL: CreepDef = {
  id: 'hill-troll',
  name: 'Hill Troll Berserker',
  tier: 'medium',
  stats: { maxHp: 360, damage: 26, armor: 0, magicResistPct: 0, moveSpeed: 290, attackRange: 500, baseAttackTime: 1.55, attackProjectileSpeed: 1200 },
  abilities: [],
  bounty: { xp: 52, gold: 32 },
  silhouette: { build: 'biped', scale: 0.8, bodyShape: 'slim', head: 'bare', weapon: 'rifle', extras: ['quiver'] },
  palette: ['#7a9b5c', '#4a6b3c', '#e8d8a0'],
  aggroRadius: 600
};

export const VHOUL_ASSASSIN: CreepDef = {
  id: 'vhoul-assassin',
  name: 'Vhoul Assassin',
  tier: 'medium',
  stats: { maxHp: 330, damage: 20, armor: 2, magicResistPct: 0, moveSpeed: 310, attackRange: 110, baseAttackTime: 1.4 },
  abilities: [
    {
      id: 'vhoul-envenom',
      name: 'Envenomed Weapon',
      targeting: 'attack-modifier',
      values: { dps: [12, 18, 24] },
      attackMod: {
        procChance: 100,
        procStatus: { status: 'buff', duration: 3, params: { dotDps: 'dps', dotType: 'magical', tag: 'vhoul-poison' } }
      },
      vfx: { archetype: 'projectile', color: '#9fdc5c', scale: 0.4 }
    }
  ],
  bounty: { xp: 56, gold: 34 },
  silhouette: { build: 'biped', scale: 0.65, bodyShape: 'slim', head: 'hood', weapon: 'sword', extras: ['cape'] },
  palette: ['#5c7a3c', '#2c3a1c', '#c8e85c'],
  aggroRadius: 550
};

export const HELLBEAR: CreepDef = {
  id: 'hellbear',
  name: 'Hellbear Smasher',
  tier: 'large',
  stats: { maxHp: 950, damage: 45, armor: 3, magicResistPct: 10, moveSpeed: 280, attackRange: 128, baseAttackTime: 1.75 },
  abilities: [
    {
      id: 'hellbear-clap',
      name: 'Thunder Clap',
      targeting: 'no-target',
      castPoint: 0.3,
      manaCost: [60, 70, 80],
      cooldown: [12, 11, 10],
      values: {
        damage: [90, 130, 170],
        radius: [300, 300, 300],
        slowMs: [25, 30, 35]
      },
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
        { kind: 'status', status: 'slow', duration: 3, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slowMs', attackSlowPct: 'slowMs' } }
      ],
      vfx: { archetype: 'ground-aoe', color: '#c87a5c', color2: '#7a3a22', scale: 1 }
    }
  ],
  bounty: { xp: 110, gold: 70 },
  silhouette: { build: 'brute', scale: 1.2, bodyShape: 'bulky', head: 'horned', weapon: 'none' },
  palette: ['#a05c3c', '#5e2f1a', '#e8b15c'],
  aggroRadius: 650
};

export const GRANITE_GOLEM: CreepDef = {
  id: 'granite-golem',
  name: 'Granite Golem',
  tier: 'ancient',
  stats: { maxHp: 2200, damage: 80, armor: 6, magicResistPct: 40, moveSpeed: 270, attackRange: 140, baseAttackTime: 2.0 },
  abilities: [
    {
      id: 'golem-granite-aura',
      name: 'Granite Aura',
      targeting: 'aura',
      aura: { radius: 900, affects: 'allies', mods: { maxHp: 200 }, excludeSelf: true },
      vfx: { archetype: 'global-mark', color: '#a9a9c8', scale: 0.5 }
    },
    {
      id: 'golem-bash',
      name: 'Crushing Fists',
      targeting: 'attack-modifier',
      attackMod: {
        procChance: 15,
        procDamage: 40,
        procStatus: { status: 'stun', duration: 0.6 }
      },
      vfx: { archetype: 'stun-stars', color: '#e8e8ff', scale: 0.5 }
    }
  ],
  bounty: { xp: 300, gold: 190 },
  silhouette: { build: 'golem', scale: 1.5, bodyShape: 'bulky', head: 'bare', weapon: 'none' },
  palette: ['#8a8aa9', '#4a4a6b', '#c8c8e8'],
  aggroRadius: 600
};

export const GHOST: CreepDef = {
  id: 'ghost',
  name: 'Ghost',
  tier: 'small',
  stats: { maxHp: 300, damage: 18, armor: 0, magicResistPct: 20, moveSpeed: 300, attackRange: 450, baseAttackTime: 1.6, attackProjectileSpeed: 900 },
  abilities: [
    {
      id: 'ghost-frost-touch',
      name: 'Frost Touch',
      targeting: 'attack-modifier',
      attackMod: { procChance: 100, procStatus: { status: 'slow', duration: 1.5, params: { moveSlowPct: 18 } } },
      vfx: { archetype: 'projectile', color: '#bfeaff', scale: 0.4 }
    }
  ],
  bounty: { xp: 40, gold: 24 },
  silhouette: { build: 'blob', scale: 0.65, head: 'skull', weapon: 'none' },
  palette: ['#c7eaff', '#7fa8c8', '#ffffff'],
  aggroRadius: 560
};

export const ALPHA_WOLF: CreepDef = {
  id: 'alpha-wolf',
  name: 'Alpha Wolf',
  tier: 'medium',
  stats: { maxHp: 520, damage: 32, armor: 1, magicResistPct: 0, moveSpeed: 330, attackRange: 110, baseAttackTime: 1.45 },
  abilities: [
    {
      id: 'wolf-crit-aura',
      name: 'Packleader Aura',
      targeting: 'aura',
      aura: { radius: 900, affects: 'allies', mods: { damagePct: 12 } },
      vfx: { archetype: 'global-mark', color: '#d8d0aa', scale: 0.45 }
    }
  ],
  bounty: { xp: 70, gold: 44 },
  silhouette: { build: 'quad', scale: 0.85, head: 'bare', weapon: 'none' },
  palette: ['#7c6a54', '#3e352a', '#d8d0aa'],
  aggroRadius: 650
};

export const SATYR_BANISHER: CreepDef = {
  id: 'satyr-banisher',
  name: 'Satyr Banisher',
  tier: 'medium',
  stats: { maxHp: 430, damage: 24, armor: 1, magicResistPct: 15, moveSpeed: 300, attackRange: 550, baseAttackTime: 1.7, attackProjectileSpeed: 900 },
  abilities: [
    {
      id: 'satyr-purge',
      name: 'Purge',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 600,
      manaCost: [75, 75, 75],
      cooldown: [14, 12, 10],
      effects: [
        { kind: 'purge', target: 'target' },
        { kind: 'status', status: 'slow', duration: 2.5, target: 'target', params: { moveSlowPct: 45 } }
      ],
      vfx: { archetype: 'shield', color: '#b880ff', scale: 0.6 }
    }
  ],
  bounty: { xp: 74, gold: 48 },
  silhouette: { build: 'biped', scale: 0.85, head: 'horned', weapon: 'staff' },
  palette: ['#8a5c9f', '#3a244f', '#d8a8ff'],
  aggroRadius: 620
};

export const HARPY_STORMCRAFTER: CreepDef = {
  id: 'harpy-stormcrafter',
  name: 'Harpy Stormcrafter',
  tier: 'medium',
  stats: { maxHp: 380, damage: 22, armor: 0, magicResistPct: 10, moveSpeed: 320, attackRange: 550, baseAttackTime: 1.65, attackProjectileSpeed: 1000 },
  abilities: [
    {
      id: 'harpy-chain-lightning',
      name: 'Chain Lightning',
      targeting: 'unit-target',
      affects: 'enemy',
      castRange: 650,
      manaCost: [80, 90, 100],
      cooldown: [12, 11, 10],
      values: { damage: [85, 125, 165], bounces: [2, 3, 4], radius: [500, 500, 500], speed: [900, 900, 900] },
      effects: [{ kind: 'projectile', to: 'target', proj: { model: 'homing', speed: 'speed', bounces: { count: 'bounces', radius: 'radius' }, onHit: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }] } }],
      vfx: { archetype: 'chain', color: '#f0e36f', scale: 0.6 }
    }
  ],
  bounty: { xp: 76, gold: 50 },
  silhouette: { build: 'bird', scale: 0.8, head: 'bare', weapon: 'none', extras: ['wings'] },
  palette: ['#e0d56a', '#6a6f9f', '#ffffff'],
  elementalShield: { element: 'electro', hp: 120, weakTo: ['cryo', 'pyro'], weakMult: 3 },
  aggroRadius: 650
};

export const POLAR_FURBOLG: CreepDef = {
  id: 'polar-furbolg',
  name: 'Polar Furbolg',
  tier: 'large',
  stats: { maxHp: 1050, damage: 50, armor: 4, magicResistPct: 10, moveSpeed: 285, attackRange: 130, baseAttackTime: 1.8 },
  abilities: [
    {
      id: 'furbolg-war-club',
      name: 'War Club',
      targeting: 'no-target',
      castPoint: 0.35,
      manaCost: [70, 80, 90],
      cooldown: [13, 12, 11],
      values: { damage: [110, 155, 200], radius: [320, 320, 320] },
      effects: [
        { kind: 'damage', dtype: 'physical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
        { kind: 'status', status: 'stun', duration: 0.6, target: 'enemies-in-radius', radius: 'radius' }
      ],
      vfx: { archetype: 'ground-aoe', color: '#d8f4ff', scale: 1 }
    }
  ],
  bounty: { xp: 130, gold: 86 },
  silhouette: { build: 'brute', scale: 1.2, bodyShape: 'bulky', head: 'bare', weapon: 'totem' },
  palette: ['#d8f4ff', '#8197a8', '#f8ffff'],
  aggroRadius: 670
};

export const ICE_SHAMAN: CreepDef = {
  id: 'ice-shaman',
  name: 'Ice Shaman',
  tier: 'medium',
  stats: { maxHp: 460, damage: 24, armor: 1, magicResistPct: 20, moveSpeed: 285, attackRange: 550, baseAttackTime: 1.7, attackProjectileSpeed: 900 },
  abilities: [
    {
      id: 'ice-shaman-nova',
      name: 'Frost Ward',
      targeting: 'ground-aoe',
      castRange: 650,
      manaCost: [90, 95, 100],
      cooldown: [15, 13, 11],
      values: { damage: [70, 110, 150], radius: [300, 320, 340], slow: [25, 30, 35] },
      effects: [
        { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' },
        { kind: 'status', status: 'slow', duration: 3, target: 'enemies-in-radius', radius: 'radius', params: { moveSlowPct: 'slow', attackSlowPct: 'slow' } }
      ],
      vfx: { archetype: 'ground-aoe', color: '#bfeaff', scale: 0.8 }
    }
  ],
  bounty: { xp: 80, gold: 54 },
  silhouette: { build: 'biped', scale: 0.8, bodyShape: 'robed', head: 'hood', weapon: 'staff' },
  palette: ['#bfeaff', '#4f6c88', '#ffffff'],
  aggroRadius: 620
};

function creep(
  id: string,
  name: string,
  tier: CreepDef['tier'],
  abilityName: string,
  palette: [string, string, string],
  opts: { ranged?: boolean; summon?: boolean; aura?: boolean; stun?: boolean } = {}
): CreepDef {
  const tierStats = {
    small: { maxHp: 260, damage: 16, armor: 0, xp: 34, gold: 20, scale: 0.62 },
    medium: { maxHp: 520, damage: 30, armor: 1, xp: 72, gold: 46, scale: 0.85 },
    large: { maxHp: 980, damage: 48, armor: 3, xp: 125, gold: 82, scale: 1.15 },
    ancient: { maxHp: 1900, damage: 78, armor: 6, xp: 260, gold: 165, scale: 1.45 }
  }[tier];
  const abilities = opts.summon
    ? [{
        id: `${id}-summon`,
        name: abilityName,
        targeting: 'point-target' as const,
        castRange: 450,
        manaCost: [80, 90, 100],
        cooldown: [18, 16, 14],
        values: { lifetime: [14, 18, 22] },
        effects: [{
          kind: 'summon' as const,
          at: 'point' as const,
          summon: {
            id: `${id}-minion`,
            name: `${name} Minion`,
            lifetime: 'lifetime',
            stats: { maxHp: 260, damage: 18, armor: 0, moveSpeed: 300, attackRange: 120, baseAttackTime: 1.6 },
            silhouette: { build: 'biped' as const, scale: 0.55, weapon: 'sword' as const },
            palette
          }
        }],
        vfx: { archetype: 'summon-pop' as const, color: palette[0], scale: 0.5 },
        anim: 'summon-gesture' as const,
        sound: 'summon' as const
      }]
    : opts.aura
      ? [{
          id: `${id}-aura`,
          name: abilityName,
          targeting: 'aura' as const,
          aura: { radius: 900, affects: 'allies' as const, mods: (tier === 'ancient' ? { armor: 4, damagePct: 10 } : { damagePct: 8 }) as Record<string, number> },
          vfx: { archetype: 'global-mark' as const, color: palette[0], scale: 0.45 },
          anim: 'staff-cast' as const,
          sound: 'roar' as const
        }]
      : [{
          id: `${id}-ability`,
          name: abilityName,
          targeting: opts.ranged ? 'unit-target' as const : 'no-target' as const,
          affects: opts.ranged ? 'enemy' as const : undefined,
          castRange: opts.ranged ? 600 : undefined,
          manaCost: [55, 65, 75],
          cooldown: [12, 11, 10],
          values: { damage: [55, 90, 125], radius: [260, 280, 300], stun: [0.6, 0.8, 1.0] },
          effects: opts.ranged
            ? [{ kind: 'damage' as const, dtype: 'magical' as const, amount: 'damage', target: 'target' as const }, ...(opts.stun ? [{ kind: 'status' as const, status: 'stun' as const, duration: 'stun', target: 'target' as const }] : [])]
            : [{ kind: 'damage' as const, dtype: 'physical' as const, amount: 'damage', target: 'enemies-in-radius' as const, radius: 'radius' }, { kind: 'status' as const, status: opts.stun ? 'stun' as const : 'slow' as const, duration: 'stun', target: 'enemies-in-radius' as const, radius: 'radius', params: opts.stun ? undefined : { moveSlowPct: 22 } }],
          vfx: { archetype: opts.ranged ? 'projectile' as const : 'ground-aoe' as const, color: palette[0], scale: 0.6 },
          anim: opts.ranged ? 'ranged-shot' as const : 'ground-slam' as const,
          sound: opts.ranged ? 'storm' as const : 'impact' as const
        }];

  return {
    id,
    name,
    tier,
    stats: {
      maxHp: tierStats.maxHp,
      damage: tierStats.damage,
      armor: tierStats.armor,
      magicResistPct: tier === 'ancient' ? 35 : tier === 'large' ? 15 : 0,
      moveSpeed: opts.ranged ? 300 : 285,
      attackRange: opts.ranged ? 520 : 120,
      baseAttackTime: 1.65,
      attackProjectileSpeed: opts.ranged ? 900 : undefined
    },
    abilities,
    bounty: { xp: tierStats.xp, gold: tierStats.gold },
    silhouette: { build: tier === 'ancient' ? 'golem' : opts.ranged ? 'biped' : 'brute', scale: tierStats.scale, bodyShape: tier === 'small' ? 'slim' : 'bulky', head: opts.aura ? 'horned' : 'bare', weapon: opts.ranged ? 'staff' : 'none' },
    palette,
    aggroRadius: tier === 'ancient' ? 720 : 600,
    animProfile: { rig: tier === 'ancient' ? 'ancient' : 'neutral', castStyle: opts.ranged ? 'caster' : 'beast', voiceTimbre: tier }
  };
}

export const PHASE3_CREEPS: CreepDef[] = [
  creep('fell-spirit', 'Fell Spirit', 'small', 'Mana Burn', ['#9f7aff', '#2b1c48', '#e8dcff'], { ranged: true }),
  creep('gnoll-assassin', 'Gnoll Assassin', 'small', 'Envenomed Weapon', ['#8f6a3a', '#2f2112', '#d8c08a']),
  creep('harpy-scout', 'Harpy Scout', 'small', 'Take Off', ['#d8d06a', '#5a5f8a', '#ffffff'], { ranged: true }),
  creep('centaur-courser', 'Centaur Courser', 'medium', 'War Stomp', ['#9a6840', '#3b2414', '#d8b080'], { stun: true }),
  creep('satyr-mindstealer', 'Satyr Mindstealer', 'medium', 'Mana Burn', ['#8a5c9f', '#2d1840', '#d8a8ff'], { ranged: true }),
  creep('giant-wolf', 'Giant Wolf', 'medium', 'Pack Howl', ['#7c6a54', '#3e352a', '#d8d0aa'], { aura: true }),
  creep('ogre-bruiser', 'Ogre Bruiser', 'medium', 'Ogre Smash', ['#4f8fc0', '#23384a', '#c8e8ff'], { stun: true }),
  creep('ogre-frostmage', 'Ogre Frostmage', 'medium', 'Ice Armor', ['#9fdcff', '#35536a', '#ffffff'], { ranged: true, aura: true }),
  creep('mud-golem', 'Mud Golem', 'medium', 'Hurl Boulder', ['#8a6a4a', '#3e3022', '#c8ad86'], { ranged: true, stun: true }),
  creep('dark-troll', 'Dark Troll', 'medium', 'Ensnare', ['#5b657a', '#1d2430', '#b8c0d0'], { ranged: true }),
  creep('wildwing', 'Wildwing', 'medium', 'Tornado', ['#b8a878', '#4a4230', '#f0e0b0'], { ranged: true }),
  creep('wildwing-ripper', 'Wildwing Ripper', 'large', 'Toughness Aura', ['#c0a060', '#4f3b20', '#f3e0a8'], { aura: true }),
  creep('ogre-magi-large', 'Ogre Magi', 'large', 'Frost Armor', ['#3f7fb8', '#213d58', '#bfe8ff'], { ranged: true }),
  creep('thunderhide', 'Thunderhide', 'large', 'Slam', ['#6f7a52', '#2d3520', '#d4e08a'], { stun: true }),
  creep('dark-troll-summoner', 'Dark Troll Summoner', 'large', 'Raise Dead', ['#404a60', '#181c28', '#a8b0c8'], { ranged: true, summon: true }),
  creep('centaur-conqueror', 'Centaur Conqueror', 'large', 'War Stomp', ['#a46a3d', '#3d2414', '#e0b080'], { stun: true }),
  creep('enraged-wildkin', 'Enraged Wildkin', 'large', 'Hurricane', ['#b0a05f', '#3f3920', '#f0e6a0'], { ranged: true }),
  creep('rock-golem', 'Rock Golem', 'ancient', 'Shard Split', ['#8a8580', '#46403c', '#d4d0c8'], { stun: true }),
  creep('black-dragon', 'Black Dragon', 'ancient', 'Fireball', ['#262020', '#b84828', '#ffb070'], { ranged: true }),
  creep('prowler-shaman', 'Prowler Shaman', 'ancient', 'Prowler Hex', ['#704a8f', '#25162f', '#d8b0ff'], { ranged: true, summon: true }),
  creep('prowler-acolyte', 'Prowler Acolyte', 'ancient', 'Ancient Lifesteal Aura', ['#604078', '#20132c', '#caa8f0'], { aura: true }),
  creep('frostbitten-golem', 'Frostbitten Golem', 'ancient', 'Ice Shatter', ['#bfeaff', '#587080', '#ffffff'], { stun: true }),
  creep('elder-jungle-stalker', 'Elder Jungle Stalker', 'ancient', 'Ancient Frenzy', ['#3f7a3c', '#182a16', '#b8e8a8'], { aura: true }),
  creep('ancient-thunderhide', 'Ancient Thunderhide', 'ancient', 'Frenzy Slam', ['#6f8a4a', '#263418', '#d8f09a'], { stun: true })
];

// The hand-authored Phase 1 creeps predate the anim/sound schema; default
// their tags + animProfile from each ability's data (§3.11). Factory creeps
// already carry these, so the ?? defaults are no-ops for them.
function creepLore(c: CreepDef): string {
  const ability = c.abilities[0]?.name;
  const tier = c.tier === 'ancient' ? 'ancient camp' : `${c.tier}-tier wild`;
  const hook = ability ? `It is known for ${ability}, a trick the local camps repeat whenever the Loop stirs.` : 'It survives by simple teeth, numbers, and knowing when a shard-road is weak.';
  return `${c.name} is a ${tier} denizen whose camp has learned to live beside fallen Moon-stone. ${hook}`;
}

function normalizeCreep(c: CreepDef): CreepDef {
  c.lore = c.lore ?? creepLore(c);
  if (!c.animProfile) {
    const ranged = c.stats.attackRange > 350;
    c.animProfile = {
      rig: c.tier === 'ancient' ? 'ancient' : 'neutral',
      castStyle: ranged ? 'caster' : 'beast',
      voiceTimbre: c.tier
    };
  }
  for (const a of c.abilities) {
    a.anim = a.anim ?? gestureForAbility(a);
    a.sound = a.sound ?? soundForAbility(a);
  }
  return c;
}

export const ALL_CREEPS: CreepDef[] = [
  KOBOLD,
  KOBOLD_FOREMAN,
  HILL_TROLL,
  VHOUL_ASSASSIN,
  HELLBEAR,
  GRANITE_GOLEM,
  GHOST,
  ALPHA_WOLF,
  SATYR_BANISHER,
  HARPY_STORMCRAFTER,
  POLAR_FURBOLG,
  ICE_SHAMAN,
  ...PHASE3_CREEPS
].map(normalizeCreep);
