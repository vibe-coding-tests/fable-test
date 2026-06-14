import { TUNING } from '../data/tuning';
import { rollAffixesFor } from '../data/affixes';
import { refreshResolvedMods } from '../data/forge';
import { gradeFloor, ITEM_GRADES, rollGrade, type GradeFloorSource } from '../data/grade';
import { isGemId, socketsForDrop } from '../data/gems';
import { REG } from './registry';
import { Rng, hashString } from './rng';
import type {
  BossDef,
  CreepTier,
  DifficultyTier,
  DropEntry,
  DropSource,
  DraftDef,
  GameSave,
  ItemDropTable,
  ItemGrade,
  ItemQuality,
  ItemRarity,
  ItemSave,
  LootBand,
  LootTable,
  MacroHeroSetup,
  NeutralItemDef,
  RaidDef,
  StatModMap
} from './types';

export interface LootRoll {
  guaranteed: ItemSave[];
  assembled?: ItemSave;
  dryStreak: number;
  pityUsed: boolean;
}

export interface ItemDropRoll {
  items: ItemSave[];
  dryStreaks: Record<string, number>;
  pityUsed: boolean;
}

export interface ItemDropRollOptions {
  source?: DropSource | GradeFloorSource;
  gradeFloorBump?: number;
  gradeFloorMin?: ItemGrade;
  regionId?: string;
  /** Hell + full badges/raids opens the T5 "ancient" affix tier (ITEM_REHAUL §14). */
  endgameUnlocked?: boolean;
}

const QUALITY_ORDER: ItemQuality[] = ['unusual', 'corrupted', 'frozen', 'genuine', 'inscribed', 'standard'];
type EndgameRarity = Extract<ItemRarity, 'arcana' | 'immortal' | 'legendary'>;
const EG_RARITY_ORDER: EndgameRarity[] = ['arcana', 'immortal', 'legendary'];

function pickWeighted(pool: DropEntry[], rng: Rng): DropEntry {
  const total = pool.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return rng.pick(pool);
  const draw = rng.range(0, total);
  let acc = 0;
  for (const entry of pool) {
    acc += Math.max(0, entry.weight);
    if (draw < acc) return entry;
  }
  return pool[pool.length - 1];
}

function rollEgRarity(band: LootBand, rng: Rng): ItemRarity {
  const odds = TUNING.loot.egRaritySplit[band];
  const total = EG_RARITY_ORDER.reduce((sum, rarity) => sum + Math.max(0, odds[rarity] ?? 0), 0);
  if (total <= 0) return 'legendary';
  const draw = rng.range(0, total);
  let acc = 0;
  for (const rarity of EG_RARITY_ORDER) {
    acc += Math.max(0, odds[rarity] ?? 0);
    if (draw < acc) return rarity;
  }
  return 'legendary';
}

function pickDropEntry(slot: ItemDropTable['slots'][number], rng: Rng, band?: LootBand): DropEntry {
  if (!slot.raritySplit || !band) return pickWeighted(slot.pool, rng);
  const target = rollEgRarity(band, rng);
  const matching = slot.pool.filter((entry) => (entry.rarity ?? slot.rarity) === target);
  return pickWeighted(matching.length > 0 ? matching : slot.pool, rng);
}

function rollQuality(entry: DropEntry, table: ItemDropTable['slots'][number], tier: DifficultyTier, rng: Rng): ItemQuality | undefined {
  if (entry.quality) return entry.quality === 'standard' ? undefined : entry.quality;
  const odds = table.qualityOddsByTier?.[tier] ?? table.qualityOdds;
  if (!odds) return undefined;
  const total = QUALITY_ORDER.reduce((sum, q) => sum + Math.max(0, odds[q] ?? 0), 0);
  if (total <= 0) return undefined;
  const draw = rng.range(0, total);
  let acc = 0;
  for (const q of QUALITY_ORDER) {
    acc += Math.max(0, odds[q] ?? 0);
    if (draw < acc) return q === 'standard' ? undefined : q;
  }
  return undefined;
}

function itemSupportsRolledIdentity(itemId: string): boolean {
  if (isGemId(itemId)) return false;
  const def = REG.item(itemId);
  return !['consumable', 'special'].includes(def.tier);
}

function gradeSourceForDrop(source?: DropSource | GradeFloorSource): GradeFloorSource | undefined {
  switch (source) {
    case 'boss': return 'boss';
    case 'raid': return 'raid';
    case 'special-battle': return 'special';
    case 'elite': return 'elite';
    case 'special': return 'special';
    default: return undefined;
  }
}

function bumpGradeFloor(floor: ItemGrade, bump = 0): ItemGrade {
  if (bump <= 0) return floor;
  const idx = ITEM_GRADES.indexOf(floor);
  return ITEM_GRADES[Math.min(ITEM_GRADES.length - 1, idx + Math.floor(bump))];
}

function maxGradeFloor(a: ItemGrade, b?: ItemGrade): ItemGrade {
  if (!b) return a;
  return ITEM_GRADES.indexOf(b) > ITEM_GRADES.indexOf(a) ? b : a;
}

export function instantiateDroppedItem(
  id: string,
  tier: DifficultyTier,
  rng: Rng,
  quality?: ItemQuality,
  source?: DropSource | GradeFloorSource,
  gradeFloorBump = 0,
  endgameUnlocked = false,
  gradeFloorMin?: ItemGrade,
  regionId?: string
): ItemSave {
  const item: ItemSave = { id };
  if (quality) item.quality = quality;
  if (!itemSupportsRolledIdentity(id)) return item;

  const def = REG.item(id);
  const floor = maxGradeFloor(bumpGradeFloor(gradeFloor(def, { difficulty: tier, source: gradeSourceForDrop(source) }), gradeFloorBump), gradeFloorMin);
  const grade = rollGrade(floor, rng.next());
  const gradeRoll = rng.next();
  const affixes = rollAffixesFor(def, grade, tier, rng, endgameUnlocked, regionId);
  const sockets = socketsForDrop(grade, def.socketCap ?? 0, rng.next());
  return refreshResolvedMods({ ...item, grade, gradeRoll, affixes, sockets }, def);
}

function assembledEntries(table: LootTable): DropEntry[] {
  if (!table.assembledRarityPools) return table.assembledPool.map((id) => ({ id, weight: 1 }));
  const rarityForId = new Map<string, ItemRarity>();
  for (const [rarity, ids] of Object.entries(table.assembledRarityPools) as [ItemRarity, string[]][]) {
    for (const id of ids) rarityForId.set(id, rarity);
  }
  return table.assembledPool.map((id) => {
    const rarity = rarityForId.get(id);
    return rarity ? { id, weight: 1, rarity } : { id, weight: 1 };
  });
}

export function lootTableToDropTable(table: LootTable, source?: DropSource): ItemDropTable {
  return {
    guaranteed: [...table.guaranteed],
    slots: [
      {
        id: 'assembled',
        rarity: 'legendary',
        rolls: 1,
        chance: table.dropPct,
        pool: assembledEntries(table),
        qualityOdds: table.qualityOdds,
        pity: table.pity,
        source,
        raritySplit: !!table.assembledRarityPools
      }
    ]
  };
}

export function rollItemDrops(table: ItemDropTable, tier: DifficultyTier, dryStreaks: Record<string, number>, rng: Rng, band?: LootBand, opts: ItemDropRollOptions = {}): ItemDropRoll {
  const items: ItemSave[] = table.guaranteed.map((id) => instantiateDroppedItem(id, tier, rng, undefined, opts.source, opts.gradeFloorBump, opts.endgameUnlocked, opts.gradeFloorMin, opts.regionId));
  const nextDry = { ...dryStreaks };
  let pityUsed = false;

  for (const slot of table.slots) {
    const key = slot.id ?? slot.rarity;
    let dry = nextDry[key] ?? 0;
    const rolls = Math.max(0, Math.floor(slot.rolls));
    for (let i = 0; i < rolls; i++) {
      const pity = !!slot.pity && dry + 1 >= slot.pity;
      const hit = slot.pool.length > 0 && (pity || rng.chance(slot.chance[tier]));
      if (!hit) {
        dry += 1;
        continue;
      }
      const entry = pickDropEntry(slot, rng, band);
      const quality = rollQuality(entry, slot, tier, rng);
      items.push(instantiateDroppedItem(entry.id, tier, rng, quality, slot.source ?? opts.source, opts.gradeFloorBump, opts.endgameUnlocked, opts.gradeFloorMin, opts.regionId));
      dry = 0;
      pityUsed = pityUsed || pity;
    }
    nextDry[key] = dry;
  }

  return { items, dryStreaks: nextDry, pityUsed };
}

export function rollLoot(table: LootTable, tier: DifficultyTier, dryStreak: number, seed: number, band?: LootBand, source?: DropSource, opts: { gradeFloorBump?: number; gradeFloorMin?: ItemGrade; regionId?: string; endgameUnlocked?: boolean } = {}): LootRoll {
  const roll = rollItemDrops(lootTableToDropTable(table, source), tier, { assembled: dryStreak }, new Rng(seed), band, { source, gradeFloorBump: opts.gradeFloorBump, gradeFloorMin: opts.gradeFloorMin, regionId: opts.regionId, endgameUnlocked: opts.endgameUnlocked });
  const guaranteed = roll.items.slice(0, table.guaranteed.length);
  const assembled = roll.items[table.guaranteed.length];
  return {
    guaranteed,
    assembled,
    dryStreak: roll.dryStreaks.assembled ?? dryStreak,
    pityUsed: !!assembled && roll.pityUsed
  };
}

export function tierScale(tier: DifficultyTier): { hp: number; damage: number; armor: number } {
  return TUNING.bossTierScale[tier];
}

export function bossBkbItemOverrides(tier: DifficultyTier): NonNullable<MacroHeroSetup['itemOverrides']> {
  const bkb = TUNING.bossBkbByTier[tier];
  return { 'black-king-bar': { cooldown: bkb.cooldown, values: { duration: [bkb.duration] } } };
}

function withBossBkbOverrides(setup: MacroHeroSetup, tier: DifficultyTier): MacroHeroSetup {
  return {
    ...setup,
    itemOverrides: {
      ...(setup.itemOverrides ?? {}),
      ...bossBkbItemOverrides(tier)
    }
  };
}

export function creepCombatTier(regionId: string): DifficultyTier {
  const mult = TUNING.regionRewardMult[regionId as keyof typeof TUNING.regionRewardMult] ?? 1;
  if (mult >= 2.0) return 'hell';
  if (mult >= 1.4) return 'nightmare';
  return 'normal';
}

export function bossTierUnlocked(progress: { tier: DifficultyTier; dryClears: number } | undefined, target: DifficultyTier, badgeCleared: boolean): boolean {
  if (target === 'normal') return true;
  if (!badgeCleared || !progress) return false;
  if (target === 'nightmare') return true;
  return progress.tier === 'nightmare' && progress.dryClears === 0;
}

export function scaledBounty(
  bounty: { xp: number; gold: number },
  regionId: string,
  tier: DifficultyTier,
  creepTier?: CreepTier,
  star: 1 | 2 | 3 = 1
): { xp: number; gold: number } {
  const regionMult = TUNING.regionRewardMult[regionId as keyof typeof TUNING.regionRewardMult] ?? 1;
  const tierMult = TUNING.tierRewardMult[tier];
  const creepMult = creepTier ? TUNING.creepTierRewardMult[creepTier] : 1;
  const starMult = TUNING.creepStarBountyMult[star - 1] ?? 1;
  const mult = regionMult * tierMult * creepMult * starMult;
  return { xp: Math.round(bounty.xp * mult), gold: Math.round(bounty.gold * mult) };
}

export function rollNeutralDrop(
  creepTier: CreepTier,
  candidates: NeutralItemDef[],
  seed: number
): NeutralItemDef | null {
  const rng = new Rng(seed);
  if (!rng.chance(TUNING.neutralDropPctByTier[creepTier])) return null;
  const pool = candidates.filter((n) => n.dropFromTier === creepTier);
  return pool.length ? rng.pick(pool) : null;
}

export function rerollNeutralItem(currentId: string, candidates: NeutralItemDef[], seed: number): NeutralItemDef {
  const current = candidates.find((n) => n.id === currentId);
  if (!current) throw new Error(`unknown neutral item: ${currentId}`);
  const pool = candidates.filter((n) => n.tier === current.tier && n.id !== currentId);
  return pool.length ? new Rng(seed).pick(pool) : current;
}

export function enchantNeutralItem(currentId: string, stash: { id: string; count: number }[], candidates: NeutralItemDef[]): { item: NeutralItemDef; stash: { id: string; count: number }[] } {
  const current = candidates.find((n) => n.id === currentId);
  if (!current?.enchantsInto) throw new Error(`neutral item cannot enchant: ${currentId}`);
  const count = stash.find((s) => s.id === currentId)?.count ?? 0;
  if (count < 3) throw new Error(`need three duplicates to enchant: ${currentId}`);
  const next = candidates.find((n) => n.id === current.enchantsInto);
  if (!next) throw new Error(`missing neutral enchant target: ${current.enchantsInto}`);
  return {
    item: next,
    stash: stash.map((s) => (s.id === currentId ? { ...s, count: s.count - 3 } : s)).filter((s) => s.count > 0)
  };
}

export function buybackCost(level: number, buybacks: number): number {
  return Math.round(TUNING.buybackBaseCost + level * 38 + buybacks * 175);
}

export function tomePurchase(gold: number, tomesUsed: number): { ok: boolean; gold: number; xp: number; tomesUsed: number } {
  const cost = Math.round(TUNING.tomeCost * (1 + tomesUsed * 0.35));
  if (gold < cost) return { ok: false, gold, xp: 0, tomesUsed };
  return { ok: true, gold: gold - cost, xp: Math.round(TUNING.tomeXp / (1 + tomesUsed * 0.25)), tomesUsed: tomesUsed + 1 };
}

export function respecCost(perfectedTier: boolean): number | null {
  return perfectedTier ? null : TUNING.respecCost;
}

/** Legacy v2/v3 settings shape (pre save-v4 audio channels). v4 saves carry `audio`. */
export interface LegacySettings {
  quickcast: boolean;
  resonance?: boolean;
  minimap?: boolean;
  masterVolume?: number;
  sfxVolume?: number;
  musicVolume?: number;
  audio?: { master: number; sfx: number; voice: number; stinger: number; music: number; muted: boolean };
}

/** A v3-shaped save: Phase 3 fields present, but pre-v4 settings and no karma/codex/journal. */
export type GameSaveV3 = Omit<GameSave, 'version' | 'settings' | 'reputation' | 'codexUnlocks' | 'journalSeen'> & {
  version: number;
  settings: LegacySettings;
  reputation?: number;
  codexUnlocks?: string[];
  journalSeen?: string[];
};

export function defaultPhase3SaveFields(): Pick<GameSave, 'difficulty' | 'inventoryStash' | 'groundItemDrops' | 'raidProgress' | 'eliteFive' | 'factionChoices' | 'heldUniques' | 'neutralStash' | 'lootMarks' | 'goldSinks'> {
  return {
    difficulty: {},
    inventoryStash: [],
    groundItemDrops: [],
    raidProgress: {},
    eliteFive: { defeated: 0, championDown: false },
    factionChoices: {},
    heldUniques: [],
    neutralStash: [],
    lootMarks: { early: 0, mid: 0, late: 0 },
    goldSinks: { buybacks: 0, tomesUsed: 0, respecs: 0, gambleRolls: 0, salvages: 0 }
  };
}

export function migratePhase3Save(s: { version: number; [k: string]: unknown }): GameSaveV3 {
  const base = s as unknown as GameSaveV3;
  const defaults = defaultPhase3SaveFields();
  const settings = (base.settings ?? {}) as LegacySettings;
  return {
    ...base,
    version: 3,
    roster: base.roster.map((r) => ({ ...r, neutralSlot: r.neutralSlot ?? null })),
    difficulty: base.difficulty ?? defaults.difficulty,
    inventoryStash: base.inventoryStash ?? defaults.inventoryStash,
    groundItemDrops: base.groundItemDrops ?? defaults.groundItemDrops,
    raidProgress: base.raidProgress ?? defaults.raidProgress,
    eliteFive: base.eliteFive ?? defaults.eliteFive,
    factionChoices: base.factionChoices ?? defaults.factionChoices,
    heldUniques: base.heldUniques ?? defaults.heldUniques,
    neutralStash: base.neutralStash ?? defaults.neutralStash,
    lootMarks: { ...defaults.lootMarks, ...(base.lootMarks ?? {}) },
    goldSinks: { ...defaults.goldSinks, ...(base.goldSinks ?? {}) },
    settings: {
      ...settings,
      quickcast: settings.quickcast ?? true,
      resonance: settings.resonance ?? false,
      minimap: settings.minimap,
      masterVolume: settings.masterVolume ?? 0.8,
      sfxVolume: settings.sfxVolume ?? 0.8,
      musicVolume: settings.musicVolume ?? 0.6
    }
  };
}

export function draftTeams(def: DraftDef, recruited: string[], seed: number): { player: MacroHeroSetup[]; enemy: MacroHeroSetup[]; bans: string[] } {
  const rng = new Rng(seed);
  const recruitedSet = new Set(recruited);
  const playerPool = recruited.filter((id) => recruitedSet.has(id));
  const enemyPool = [...new Set(def.members.flatMap((m) => m.pool))];
  const player: MacroHeroSetup[] = [];
  const enemy: MacroHeroSetup[] = [];
  const bans: string[] = [];

  for (const step of def.banPickOrder) {
    if (step === 'ban') {
      const pool = [...playerPool, ...enemyPool].filter((id) => !bans.includes(id) && !player.some((h) => h.heroId === id) && !enemy.some((h) => h.heroId === id));
      if (pool.length) bans.push(rng.pick(pool));
      continue;
    }
    const playerChoices = playerPool.filter((id) => !bans.includes(id) && !player.some((h) => h.heroId === id));
    if (player.length < 5 && playerChoices.length) player.push({ heroId: rng.pick(playerChoices), level: 30, items: ['black-king-bar', 'butterfly'] });
    const enemyChoices = enemyPool.filter((id) => !bans.includes(id) && !enemy.some((h) => h.heroId === id));
    if (enemy.length < 5 && enemyChoices.length) enemy.push({ heroId: rng.pick(enemyChoices), level: 30, items: ['black-king-bar', 'heart-of-tarrasque'] });
  }

  return { player, enemy, bans };
}

export function raidSetupFromDef(def: RaidDef, party: MacroHeroSetup[], tier: DifficultyTier, seed: number): { seed: number; party: MacroHeroSetup[]; boss: MacroHeroSetup & { hpScale: number; damageScale: number; armorScale: number; aiDepth: number; enrageSec: number }; maxSec: number } {
  const scale = tierScale(tier);
  return {
    seed,
    party,
    boss: {
      ...withBossBkbOverrides(def.boss, tier),
      hpScale: (def.boss.hpScale ?? TUNING.raidBossHpScale) * scale.hp,
      damageScale: (def.boss.damageScale ?? TUNING.raidBossDamageScale) * scale.damage,
      armorScale: scale.armor,
      // AI-depth lever beside the stat scaling (AI_OVERHAUL §6)
      aiDepth: def.boss.aiDepth ?? TUNING.bossTierAiDepth[tier],
      enrageSec: def.enrageSec
    },
    maxSec: def.enrageSec + 30
  };
}

export function bossFightSetupFromDef(def: BossDef, party: MacroHeroSetup[], tier: DifficultyTier, seed: number): { seed: number; party: MacroHeroSetup[]; boss: MacroHeroSetup & { hpScale: number; damageScale: number; armorScale: number; aiDepth: number } } {
  const scale = tierScale(tier);
  return {
    seed,
    party,
    boss: {
      heroId: def.heroId,
      level: def.rank === 'boss' ? 28 : 24,
      items: ['black-king-bar', 'assault-cuirass'],
      itemOverrides: bossBkbItemOverrides(tier),
      hpScale: TUNING.raidBossHpScale * TUNING.regionalBossHpScale * scale.hp,
      damageScale: TUNING.raidBossDamageScale * scale.damage,
      armorScale: scale.armor,
      aiDepth: TUNING.bossTierAiDepth[tier]
    }
  };
}

export function raidMechanicTimeline(def: RaidDef): { atHpPct: number; kind: 'add-wave' | 'zone' | 'enrage' | 'signature'; id: string }[] {
  const out: { atHpPct: number; kind: 'add-wave' | 'zone' | 'enrage' | 'signature'; id: string }[] = [
    ...def.addWaves.map((w) => ({ atHpPct: w.atHpPct, kind: 'add-wave' as const, id: w.summon.id })),
    ...def.zones.map((z, i) => ({ atHpPct: z.atHpPct, kind: 'zone' as const, id: `${def.id}-zone-${i}` })),
    { atHpPct: 0, kind: 'enrage' as const, id: `${def.id}-enrage-${def.enrageSec}` }
  ];
  if (def.signatureExotic) out.push({ atHpPct: 50, kind: 'signature' as const, id: def.signatureExotic });
  return out.sort((a, b) => b.atHpPct - a.atHpPct);
}

export function dayNightMods(heroId: string, isNight: boolean): StatModMap {
  if (!isNight) return {};
  if (heroId === 'night-stalker') return { damage: 24, moveSpeed: 35, attackSpeed: 45, visionPct: 60 };
  if (heroId === 'luna') return { damage: 12, visionPct: 35 };
  return {};
}

export function visionRadius(base: number, isNight: boolean, mods: StatModMap = {}): number {
  const night = isNight ? TUNING.nightVisionMult : 1;
  const bonus = 1 + (mods.visionPct ?? 0) / 100;
  return Math.round(base * night * bonus);
}

export function chooseFaction(current: Record<string, string>, factionId: string, heroId: string, choices: [string, string]): Record<string, string> {
  if (!choices.includes(heroId)) throw new Error(`invalid faction choice: ${heroId}`);
  if (current[factionId] && current[factionId] !== heroId) throw new Error(`faction already chose ${current[factionId]}`);
  return { ...current, [factionId]: heroId };
}

export function stableContentSeed(id: string, salt = 0): number {
  return hashString(`${id}:${salt}`);
}

export function bossLootSeed(boss: BossDef, tier: DifficultyTier, clearNo: number): number {
  return stableContentSeed(`${boss.id}:${tier}`, clearNo);
}
