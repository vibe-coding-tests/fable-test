import type { RaidDef, SummonSpec, ZoneSpec } from '../core/types';
import { TUNING } from './tuning';

const fallen: SummonSpec = {
  id: 'raid-fallen-pack',
  name: 'Rift Thrall',
  lifetime: 40,
  stats: { maxHp: 520, damage: 32, armor: 1, moveSpeed: 315, attackRange: 120, baseAttackTime: 1.5 },
  silhouette: { build: 'biped', scale: 0.72, weapon: 'sword', head: 'horned' },
  palette: ['#b23a2a', '#33100c', '#ff9a68']
};

const swarm: SummonSpec = {
  id: 'raid-swarmling',
  name: 'Crater Swarmling',
  lifetime: 35,
  stats: { maxHp: 420, damage: 28, armor: 0, moveSpeed: 345, attackRange: 110, baseAttackTime: 1.4 },
  silhouette: { build: 'quad', scale: 0.62, weapon: 'none', head: 'horned' },
  palette: ['#5f2a7a', '#16081f', '#d882ff']
};

const fireZone: ZoneSpec = {
  shape: 'circle',
  radius: 320,
  duration: 8,
  tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 55, target: 'target' }] }
};

const frostZone: ZoneSpec = {
  shape: 'circle',
  radius: 380,
  duration: 9,
  auraMods: { affects: 'enemies', mods: { moveSpeedPct: -35, attackSpeed: -30 } },
  tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 42, target: 'target' }] }
};

// Raids are the most generous source, so a cleared anchor has a real shot at a
// higher-quality copy (LOOT_OVERHAUL §3.5 "luck at the source"). Unusual is the
// reserved prestige grade raids alone can drop.
const RAID_QUALITY_ODDS = { inscribed: 0.12, frozen: 0.08, genuine: 0.06, unusual: 0.03 };

export const ALL_RAIDS: RaidDef[] = [
  {
    id: 'roshan-pit',
    name: "Roshan's Pit",
    title: 'The Pit That Never Stays Empty',
    location: 'Mad Moon Crater',
    unlockQuest: 'recruit-phoenix',
    boss: { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'], hpScale: 2.8, damageScale: 1.05 },
    addWaves: [{ atHpPct: 55, summon: fallen, count: 3 }],
    zones: [{ atHpPct: 70, zone: { ...fireZone, radius: 260 } }],
    enrageSec: 120,
    loot: { guaranteed: ['aegis-of-the-immortal'], assembledPool: ['divine-rapier', 'aghanims-scepter'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    signatureExotic: 'roshan-respawn',
    dialogue: ['You came for the prize the whole map is afraid to time.', 'Fall here and I simply rise again. Can you say the same?']
  },
  {
    id: 'lord-of-terror',
    name: 'The Lord of Terror',
    title: 'Warden of the Hell-Rift',
    location: 'Hell-rift beneath the Vile Reaches',
    unlockQuest: 'recruit-doom',
    boss: { heroId: 'doom', level: 30, items: ['black-king-bar'], hpScale: 2.4, damageScale: 1.05 },
    addWaves: [{ atHpPct: 75, summon: fallen, count: 4 }, { atHpPct: 35, summon: fallen, count: 5 }],
    zones: [{ atHpPct: 80, zone: fireZone }, { atHpPct: 45, zone: { ...fireZone, wall: true } }],
    enrageSec: 135,
    loot: { guaranteed: ['reaver'], assembledPool: ['heart-of-tarrasque'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    signatureExotic: 'terror-fear',
    dialogue: ['Your draft dies the moment I deign to look at it.', 'There is no buyback from the abyss.']
  },
  {
    id: 'lich-king',
    name: 'The Frost-Crowned King',
    title: 'Sovereign of the Frozen Summit',
    location: 'Icewrack glacier summit',
    unlockQuest: 'recruit-lich',
    boss: { heroId: 'lich', level: 30, items: ['glimmer-cape', 'black-king-bar'], hpScale: 2.3, damageScale: 1.0 },
    addWaves: [{ atHpPct: 65, summon: fallen, count: 3 }, { atHpPct: 30, summon: fallen, count: 4 }],
    zones: [{ atHpPct: 90, zone: frostZone }, { atHpPct: 50, zone: { ...frostZone, radius: 480 } }],
    enrageSec: 135,
    loot: { guaranteed: ['ultimate-orb'], assembledPool: ['eye-of-skadi'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    signatureExotic: 'defile-growth',
    dialogue: ['Climb my glacier and freeze beside everyone who tried.', 'Every nova writes your name in the frost.']
  },
  {
    id: 'queen-of-blades',
    name: 'The Queen of Blades',
    title: 'Mother of the Fallen Star',
    location: 'Fallen-star crater, Devarshi Desert',
    unlockQuest: 'recruit-phantom-assassin',
    boss: { heroId: 'broodmother', level: 30, items: ['diffusal-blade', 'black-king-bar'], hpScale: 2.3, damageScale: 1.05 },
    addWaves: [{ atHpPct: 85, summon: swarm, count: 4 }, { atHpPct: 55, summon: swarm, count: 5 }, { atHpPct: 25, summon: swarm, count: 6 }],
    zones: [{ atHpPct: 75, zone: { ...fireZone, radius: 300 } }, { atHpPct: 40, zone: { ...fireZone, radius: 420 } }],
    enrageSec: 135,
    loot: { guaranteed: ['mystic-staff'], assembledPool: ['refresher-orb'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    signatureExotic: 'swarm-spread',
    dialogue: ['My children outnumber your cooldowns.', 'The crater is a web — and you already walked in.']
  },

  // --- Marquee wave one (MARQUEE_AND_ARMORY_ADDENDUM §2.1 / C1). Each is an
  // original homage on a Dota chassis; the touchstone -> original mapping lives
  // in DECISIONS.md. Loot anchors follow the chassis attribute lane, and the
  // reserved Unusual grade rides RAID_QUALITY_ODDS so only raids can drop it.
  {
    id: 'renegade-marshal',
    name: 'The Renegade Marshal',
    title: 'Outlaw of the Fallen Fleet',
    location: 'Wreck of the Fallen Fleet, Shadeshore',
    unlockQuest: 'recruit-sniper',
    boss: { heroId: 'sniper', level: 30, items: ['maelstrom', 'black-king-bar'], hpScale: 2.4, damageScale: 1.05 },
    addWaves: [{ atHpPct: 60, summon: fallen, count: 3 }, { atHpPct: 25, summon: fallen, count: 4 }],
    zones: [{ atHpPct: 75, zone: { ...fireZone, radius: 280 } }],
    enrageSec: 130,
    loot: { guaranteed: ['eaglesong'], assembledPool: ['maelstrom', 'butterfly'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    dialogue: ['This whole fleet died screaming. Want to hear how it sounded?', "I don't miss. Ask the wreck behind me."]
  },
  {
    id: 'void-prelate',
    name: 'The Void Prelate',
    title: 'Blade of the Severed Dark',
    location: 'The Severed Dark, Quoidge',
    unlockQuest: 'recruit-templar-assassin',
    boss: { heroId: 'templar-assassin', level: 30, items: ['diffusal-blade', 'black-king-bar'], hpScale: 2.3, damageScale: 1.05 },
    addWaves: [{ atHpPct: 70, summon: swarm, count: 3 }, { atHpPct: 35, summon: swarm, count: 4 }],
    zones: [{ atHpPct: 80, zone: { ...frostZone, radius: 300 } }],
    enrageSec: 130,
    loot: { guaranteed: ['eaglesong'], assembledPool: ['butterfly', 'diffusal-blade', 'eye-of-skadi'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    dialogue: ['You see the blade only after it has already chosen you.', 'The dark between the stars remembers every name.']
  },
  {
    id: 'forsaken-queen',
    name: 'The Forsaken Queen',
    title: 'Banshee of the Cold Arrow',
    location: 'Frostmourn Hollow, Icewrack',
    unlockQuest: 'recruit-drow-ranger',
    boss: { heroId: 'drow-ranger', level: 30, items: ['eye-of-skadi', 'black-king-bar'], hpScale: 2.3, damageScale: 1.0 },
    addWaves: [{ atHpPct: 65, summon: fallen, count: 3 }, { atHpPct: 30, summon: fallen, count: 4 }],
    zones: [{ atHpPct: 85, zone: frostZone }, { atHpPct: 45, zone: { ...frostZone, radius: 460 } }],
    enrageSec: 135,
    loot: { guaranteed: ['eaglesong'], assembledPool: ['eye-of-skadi', 'butterfly'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    dialogue: ['My arrows do not thaw. Neither will the silence after them.', 'Death freed me of mercy. You will find that inconvenient.']
  },
  {
    id: 'prime-evil',
    name: 'The Lord of Destruction',
    title: 'Last of the Prime Evils',
    location: 'Worldstone Vault, the Vile Reaches',
    unlockQuest: 'recruit-wraith-king',
    boss: { heroId: 'wraith-king', level: 30, items: ['black-king-bar', 'assault-cuirass'], hpScale: 2.6, damageScale: 1.05 },
    addWaves: [{ atHpPct: 75, summon: fallen, count: 4 }, { atHpPct: 35, summon: fallen, count: 5 }],
    zones: [{ atHpPct: 80, zone: fireZone }, { atHpPct: 40, zone: { ...fireZone, wall: true } }],
    enrageSec: 135,
    loot: { guaranteed: ['reaver'], assembledPool: ['heart-of-tarrasque', 'assault-cuirass', 'black-king-bar'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    dialogue: ['The last of my brothers fell. I did not.', 'Your world keeps a stone at its heart. I came down for it.']
  },
  {
    id: 'lord-of-hatred',
    name: 'The Lord of Hatred',
    title: 'Voice in the Lightless Hall',
    location: 'The Lightless Hall, Mount Joerlak',
    unlockQuest: 'recruit-razor',
    boss: { heroId: 'razor', level: 30, items: ['black-king-bar', 'aghanims-scepter'], hpScale: 2.4, damageScale: 1.0 },
    addWaves: [{ atHpPct: 60, summon: swarm, count: 4 }],
    zones: [{ atHpPct: 80, zone: fireZone }, { atHpPct: 45, zone: { ...fireZone, radius: 400 } }],
    enrageSec: 135,
    loot: { guaranteed: ['mystic-staff'], assembledPool: ['scythe-of-vyse', 'refresher-orb', 'aghanims-scepter'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    dialogue: ['Every hatred in this world borrows my voice.', 'Speak my name aloud and the hall goes dark.']
  },
  {
    id: 'last-eldwurm',
    name: 'The Last Eldwurm',
    title: 'Ember Beneath the Mad Moon',
    location: 'Ember Caldera, Mad Moon Crater',
    unlockQuest: 'recruit-dragon-knight',
    boss: { heroId: 'dragon-knight', level: 30, items: ['black-king-bar', 'assault-cuirass'], hpScale: 2.5, damageScale: 1.05 },
    addWaves: [{ atHpPct: 70, summon: swarm, count: 3 }, { atHpPct: 35, summon: fallen, count: 4 }],
    zones: [{ atHpPct: 80, zone: fireZone }, { atHpPct: 40, zone: { ...fireZone, radius: 420, wall: true } }],
    enrageSec: 140,
    loot: { guaranteed: ['reaver'], assembledPool: ['heart-of-tarrasque', 'aghanims-scepter', 'assault-cuirass'], dropPct: TUNING.raidAssembledDropPct, pity: TUNING.raidBadLuckPity, qualityOdds: RAID_QUALITY_ODDS },
    dialogue: ['The last of the dragons does not flee a falling moon.', 'Embers older than your gods wait beneath my wings.']
  }
];
