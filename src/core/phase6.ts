import type { ArmoryLoadouts, DifficultyTier, DungeonProgressSave, GameSave, GroundItemDrop, HeroAugments, HeroLoadoutSlots, HeroSave, ItemSave } from './types';
import { migratePhase5Save } from './phase5';

// ------------------------------------------------------------------
// Armory-management save v6: bench loadouts. The systems layer owns the
// behavior; the core only normalizes the serializable map for migrations.
// ------------------------------------------------------------------

export function normalizeLoadoutSlots(slots: unknown): HeroLoadoutSlots {
  const arr = Array.isArray(slots) ? slots : [];
  const out: HeroLoadoutSlots = [null, null, null, null, null, null];
  for (let i = 0; i < out.length; i++) {
    const v = arr[i];
    out[i] = typeof v === 'string' ? v : null;
  }
  return out;
}

export function normalizeArmoryLoadouts(value: unknown): ArmoryLoadouts {
  if (!value || typeof value !== 'object') return {};
  const out: ArmoryLoadouts = {};
  for (const [heroId, byName] of Object.entries(value as Record<string, unknown>)) {
    if (!byName || typeof byName !== 'object') continue;
    const normalized: Record<string, HeroLoadoutSlots> = {};
    for (const [name, slots] of Object.entries(byName as Record<string, unknown>)) {
      if (typeof name !== 'string' || name.trim().length === 0) continue;
      normalized[name] = normalizeLoadoutSlots(slots);
    }
    if (Object.keys(normalized).length > 0) out[heroId] = normalized;
  }
  return out;
}

const TIER_RANK: Record<DifficultyTier, number> = { normal: 0, nightmare: 1, hell: 2 };

function normalizeDryStreaks(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: Record<string, number> = {};
  for (const [slot, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && raw > 0) out[slot] = Math.floor(raw);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeDungeonProgress(value: unknown): Record<string, DungeonProgressSave> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, DungeonProgressSave> = {};
  for (const [dungeonId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Partial<DungeonProgressSave>;
    const bestTier = (['normal', 'nightmare', 'hell'] as const).includes(rec.bestTier as DifficultyTier) ? rec.bestTier as DifficultyTier : 'normal';
    const lastTier = (['normal', 'nightmare', 'hell'] as const).includes(rec.lastTier as DifficultyTier) ? rec.lastTier as DifficultyTier : undefined;
    const dryStreaks = normalizeDryStreaks(rec.dryStreaks);
    const bestEndlessLevel = typeof rec.bestEndlessLevel === 'number' && rec.bestEndlessLevel > 0 ? Math.floor(rec.bestEndlessLevel) : undefined;
    out[dungeonId] = {
      clears: Math.max(0, Math.floor(typeof rec.clears === 'number' ? rec.clears : 0)),
      wipes: Math.max(0, Math.floor(typeof rec.wipes === 'number' ? rec.wipes : 0)),
      bestDepth: Math.max(0, Math.floor(typeof rec.bestDepth === 'number' ? rec.bestDepth : 0)),
      bestTier,
      lastTier,
      lastModifiers: Array.isArray(rec.lastModifiers) ? rec.lastModifiers.filter((id): id is string => typeof id === 'string') : [],
      lastClearedAt: typeof rec.lastClearedAt === 'number' ? rec.lastClearedAt : undefined,
      ...(dryStreaks ? { dryStreaks } : {}),
      ...(bestEndlessLevel !== undefined ? { bestEndlessLevel } : {})
    };
  }
  return out;
}

export function higherDungeonTier(a: DifficultyTier, b: DifficultyTier): DifficultyTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function normalizeGroundItemDrops(value: unknown): GroundItemDrop[] {
  if (!Array.isArray(value)) return [];
  const out: GroundItemDrop[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Partial<GroundItemDrop>;
    if (typeof rec.uid !== 'number' || !rec.item || typeof rec.item.id !== 'string') continue;
    if (!rec.pos || typeof rec.pos.x !== 'number' || typeof rec.pos.y !== 'number') continue;
    out.push({
      uid: Math.max(1, Math.floor(rec.uid)),
      item: { ...rec.item },
      pos: { x: rec.pos.x, y: rec.pos.y },
      source: rec.source,
      context: rec.context === 'dungeon' ? 'dungeon' : 'overworld',
      createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : undefined
    });
  }
  return out;
}

function augmentKindForItem(item: ItemSave | null | undefined): keyof HeroAugments | null {
  if (!item) return null;
  if (item.id === 'aghanims-scepter' || item.id === 'aghanims-blessing') return 'scepter';
  if (item.id === 'aghanims-shard') return 'shard';
  return null;
}

export function migrateHeroAugments(hero: HeroSave): HeroSave {
  const augments: HeroAugments = { ...(hero.augments ?? {}) };
  const items = hero.items.map((item) => {
    const kind = augmentKindForItem(item);
    if (!kind) return item;
    augments[kind] = true;
    return null;
  }) as HeroSave['items'];
  return { ...hero, items, augments };
}

export function migratePhase6Save(s: GameSave | { version: number; [k: string]: unknown }): GameSave {
  const base = migratePhase5Save(s as GameSave);
  return {
    ...base,
    version: 6,
    roster: base.roster.map(migrateHeroAugments),
    loadouts: normalizeArmoryLoadouts((base as GameSave & { loadouts?: unknown }).loadouts),
    dungeonProgress: normalizeDungeonProgress((base as GameSave & { dungeonProgress?: unknown }).dungeonProgress),
    groundItemDrops: normalizeGroundItemDrops((base as GameSave & { groundItemDrops?: unknown }).groundItemDrops)
  };
}
