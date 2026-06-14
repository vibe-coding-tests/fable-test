import type { GameSave, QuestSave, QuestStatus } from './types';
import { migratePhase6Save } from './phase6';

// ------------------------------------------------------------------
// Save v7 (QUEST.md): adds the bounty/chapter quest map. Additive —
// old saves load clean with an empty quest map and pick the system up
// live on the next refresh.
// ------------------------------------------------------------------

const STATUSES: ReadonlySet<QuestStatus> = new Set<QuestStatus>(['locked', 'active', 'complete', 'claimed', 'cooldown']);

export function normalizeQuestSaves(value: unknown): Record<string, QuestSave> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, QuestSave> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Partial<QuestSave>;
    const status: QuestStatus = STATUSES.has(rec.status as QuestStatus) ? (rec.status as QuestStatus) : 'locked';
    const progress = Array.isArray(rec.progress)
      ? rec.progress.map((v) => (typeof v === 'number' && v > 0 ? Math.floor(v) : 0))
      : [];
    out[id] = {
      status,
      progress,
      completions: typeof rec.completions === 'number' && rec.completions > 0 ? Math.floor(rec.completions) : 0,
      ...(typeof rec.availableAt === 'number' ? { availableAt: rec.availableAt } : {})
    };
  }
  return out;
}

export function migratePhase7Save(s: GameSave | { version: number; [k: string]: unknown }): GameSave {
  const base = migratePhase6Save(s as GameSave);
  return {
    ...base,
    version: 7,
    quests: normalizeQuestSaves((base as GameSave & { quests?: unknown }).quests)
  };
}
