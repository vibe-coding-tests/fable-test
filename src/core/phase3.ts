import { TUNING } from '../data/tuning';
import { Rng, hashString } from './rng';
import type {
  BossDef,
  CreepTier,
  DifficultyTier,
  DraftDef,
  GameSave,
  ItemSave,
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

export function rollLoot(table: LootTable, tier: DifficultyTier, dryStreak: number, seed: number): LootRoll {
  const rng = new Rng(seed);
  const pityUsed = dryStreak + 1 >= table.pity;
  const hit = table.assembledPool.length > 0 && (pityUsed || rng.chance(table.dropPct[tier]));
  const assembled = hit ? { id: rng.pick(table.assembledPool) } : undefined;
  return {
    guaranteed: table.guaranteed.map((id) => ({ id })),
    assembled,
    dryStreak: assembled ? 0 : dryStreak + 1,
    pityUsed: !!assembled && pityUsed
  };
}

export function tierScale(tier: DifficultyTier): { hp: number; damage: number; armor: number } {
  return TUNING.bossTierScale[tier];
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

export function defaultPhase3SaveFields(): Pick<GameSave, 'difficulty' | 'inventoryStash' | 'raidProgress' | 'eliteFive' | 'factionChoices' | 'heldUniques' | 'neutralStash' | 'goldSinks'> {
  return {
    difficulty: {},
    inventoryStash: [],
    raidProgress: {},
    eliteFive: { defeated: 0, championDown: false },
    factionChoices: {},
    heldUniques: [],
    neutralStash: [],
    goldSinks: { buybacks: 0, tomesUsed: 0, respecs: 0 }
  };
}

export function migratePhase3Save(s: GameSave | (Omit<GameSave, 'version' | 'difficulty' | 'inventoryStash' | 'raidProgress' | 'eliteFive' | 'factionChoices' | 'heldUniques' | 'neutralStash' | 'goldSinks'> & { version: number })): GameSave {
  const base = s as GameSave;
  const defaults = defaultPhase3SaveFields();
  return {
    ...base,
    version: 3,
    roster: base.roster.map((r) => ({ ...r, neutralSlot: r.neutralSlot ?? null })),
    difficulty: base.difficulty ?? defaults.difficulty,
    inventoryStash: base.inventoryStash ?? defaults.inventoryStash,
    raidProgress: base.raidProgress ?? defaults.raidProgress,
    eliteFive: base.eliteFive ?? defaults.eliteFive,
    factionChoices: base.factionChoices ?? defaults.factionChoices,
    heldUniques: base.heldUniques ?? defaults.heldUniques,
    neutralStash: base.neutralStash ?? defaults.neutralStash,
    goldSinks: base.goldSinks ?? defaults.goldSinks,
    settings: {
      quickcast: base.settings?.quickcast ?? true,
      resonance: base.settings?.resonance ?? false,
      masterVolume: base.settings?.masterVolume ?? 0.8,
      sfxVolume: base.settings?.sfxVolume ?? 0.8,
      musicVolume: base.settings?.musicVolume ?? 0.6
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

export function raidSetupFromDef(def: RaidDef, party: MacroHeroSetup[], tier: DifficultyTier, seed: number): { seed: number; party: MacroHeroSetup[]; boss: MacroHeroSetup & { hpScale: number; damageScale: number }; maxSec: number } {
  const scale = tierScale(tier);
  return {
    seed,
    party,
    boss: {
      ...def.boss,
      hpScale: (def.boss.hpScale ?? TUNING.raidBossHpScale) * scale.hp,
      damageScale: (def.boss.damageScale ?? TUNING.raidBossDamageScale) * scale.damage
    },
    maxSec: def.enrageSec + 30
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
