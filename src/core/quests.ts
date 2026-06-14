// ============================================================
// Quest logic (QUEST.md): pure, total, deterministic.
// Operates on plain data — a QuestDef, a QuestSave, and a
// snapshot QuestContext — so it stays headless-testable and
// free of three/DOM. The systems layer (Game) feeds it
// normalized QuestEvents and applies the rewards.
// ============================================================

import type { CreepTier, QuestDef, QuestObjective, QuestObjectiveKind, QuestPrereq, QuestSave, QuestStatus } from './types';

export interface QuestContext {
  badges: number;
  recruited: number;
  raidClears: number;
  reachedRegions: ReadonlySet<string>;
  claimedQuests: ReadonlySet<string>;
  playtimeSec: number;
}

export interface QuestEvent {
  kind: QuestObjectiveKind;
  amount: number;
  regionId?: string;
  tier?: CreepTier;
  targetId?: string;
}

export function defaultQuestSave(def: QuestDef): QuestSave {
  return {
    status: 'locked',
    progress: def.objectives.map(() => 0),
    completions: 0
  };
}

/** Defensive normalize: keep progress array sized to the def, clamp values. */
export function normalizeQuestSave(def: QuestDef, save: QuestSave | undefined): QuestSave {
  const base = save ?? defaultQuestSave(def);
  const progress = def.objectives.map((obj, i) => {
    const v = base.progress[i];
    return clampCount(typeof v === 'number' ? v : 0, obj.count);
  });
  const status: QuestStatus = (['locked', 'active', 'complete', 'claimed', 'cooldown'] as QuestStatus[]).includes(base.status)
    ? base.status
    : 'locked';
  return {
    status,
    progress,
    completions: Math.max(0, Math.floor(base.completions ?? 0)),
    ...(typeof base.availableAt === 'number' ? { availableAt: base.availableAt } : {})
  };
}

export function prereqMet(def: QuestDef, ctx: QuestContext): boolean {
  return prereqSatisfied(def.prereq, ctx);
}

/** A prereq is met when every named gate holds AND, if present, at least one anyOf branch holds. */
function prereqSatisfied(p: QuestPrereq | undefined, ctx: QuestContext): boolean {
  if (!p) return true;
  if (p.badges !== undefined && ctx.badges < p.badges) return false;
  if (p.recruited !== undefined && ctx.recruited < p.recruited) return false;
  if (p.raidClears !== undefined && ctx.raidClears < p.raidClears) return false;
  if (p.region !== undefined && !ctx.reachedRegions.has(p.region)) return false;
  if (p.quests) {
    for (const q of p.quests) if (!ctx.claimedQuests.has(q)) return false;
  }
  if (p.anyOf && p.anyOf.length > 0) {
    if (!p.anyOf.some((branch) => prereqSatisfied(branch, ctx))) return false;
  }
  return true;
}

/**
 * Lifecycle gate. locked -> active once prereq is met; a recurring quest in
 * cooldown -> active (progress reset) once availableAt elapses. Terminal
 * (claimed) and in-flight (active/complete) states are left untouched.
 */
export function refreshAvailability(def: QuestDef, save: QuestSave, ctx: QuestContext): QuestSave {
  const s = normalizeQuestSave(def, save);
  if (s.status === 'locked') {
    if (prereqMet(def, ctx)) return { ...s, status: 'active', progress: def.objectives.map(() => 0) };
    return s;
  }
  if (s.status === 'cooldown') {
    const ready = s.availableAt === undefined || ctx.playtimeSec >= s.availableAt;
    if (ready && prereqMet(def, ctx)) {
      return { status: 'active', progress: def.objectives.map(() => 0), completions: s.completions };
    }
    return s;
  }
  return s;
}

export function matchesObjective(obj: QuestObjective, ev: QuestEvent): boolean {
  if (obj.kind !== ev.kind) return false;
  if (obj.regionId !== undefined && obj.regionId !== ev.regionId) return false;
  if (obj.tier !== undefined && obj.tier !== ev.tier) return false;
  if (obj.targetId !== undefined && obj.targetId !== ev.targetId) return false;
  return true;
}

export function isComplete(def: QuestDef, save: QuestSave): boolean {
  return def.objectives.every((obj, i) => (save.progress[i] ?? 0) >= obj.count);
}

/** Increment matching objectives on an active quest; flip to complete when all met. */
export function advance(def: QuestDef, save: QuestSave, ev: QuestEvent): { save: QuestSave; justCompleted: boolean } {
  const s = normalizeQuestSave(def, save);
  if (s.status !== 'active') return { save: s, justCompleted: false };
  const amount = Math.max(0, Math.floor(ev.amount));
  if (amount === 0) return { save: s, justCompleted: false };
  let changed = false;
  const progress = s.progress.map((cur, i) => {
    const obj = def.objectives[i];
    if (!matchesObjective(obj, ev)) return cur;
    const next = clampCount(cur + amount, obj.count);
    if (next !== cur) changed = true;
    return next;
  });
  if (!changed) return { save: s, justCompleted: false };
  const next: QuestSave = { ...s, progress };
  if (isComplete(def, next)) {
    next.status = 'complete';
    return { save: next, justCompleted: true };
  }
  return { save: next, justCompleted: false };
}

/**
 * Claim a completed quest. Event quests become claimed (terminal); recurring
 * quests go to cooldown (re-arms after cooldownSec) or straight back to active
 * when no cooldown is set. Returns the same save when not claimable.
 */
export function claim(def: QuestDef, save: QuestSave, ctx: QuestContext): { save: QuestSave; claimed: boolean } {
  const s = normalizeQuestSave(def, save);
  if (s.status !== 'complete') return { save: s, claimed: false };
  const completions = s.completions + 1;
  if (def.kind === 'recurring') {
    const cd = def.cooldownSec ?? 0;
    if (cd > 0) {
      return { save: { status: 'cooldown', progress: def.objectives.map(() => 0), completions, availableAt: ctx.playtimeSec + cd }, claimed: true };
    }
    return { save: { status: 'active', progress: def.objectives.map(() => 0), completions }, claimed: true };
  }
  return { save: { status: 'claimed', progress: s.progress, completions }, claimed: true };
}

function clampCount(v: number, max: number): number {
  if (v < 0) return 0;
  if (v > max) return max;
  return Math.floor(v);
}
