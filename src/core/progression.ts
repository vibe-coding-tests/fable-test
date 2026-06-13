import { TUNING } from '../data/tuning';
import { xpForLevel } from './stats';

// ------------------------------------------------------------------
// XP & gold distribution (SPEC §6): active 100%, swapped-in
// participants 75%, bench 50%, +15% last-hit bonus, one shared wallet.
// Pure functions — the systems layer feeds in party state.
// ------------------------------------------------------------------

export interface PartyMemberState {
  heroId: string;
  isActive: boolean;
  /** participated = dealt/took damage within the participant window */
  participated: boolean;
}

export interface KillReward {
  perHeroXp: { heroId: string; xp: number }[];
  gold: number;
}

export function computeKillReward(bounty: { xp: number; gold: number }, party: PartyMemberState[], lastHitByPlayer: boolean): KillReward {
  const bonus = lastHitByPlayer ? 1 + TUNING.lastHitBonusPct : 1;
  const xp = bounty.xp * bonus;
  const gold = Math.round(bounty.gold * bonus);
  const perHeroXp = party.map((m) => ({
    heroId: m.heroId,
    xp: Math.round(xp * (m.isActive ? TUNING.xpActivePct : m.participated ? TUNING.xpParticipantPct : TUNING.xpBenchPct))
  }));
  return { perHeroXp, gold };
}

/** Post-cap XP converts to gold (SPEC §5). Returns gold earned. */
export function overflowXpToGold(level: number, xp: number, addXp: number): number {
  if (level < TUNING.levelCap) {
    const room = xpForLevel(TUNING.levelCap) - xp;
    const overflow = Math.max(0, addXp - room);
    return Math.round(overflow * TUNING.postCapXpToGold);
  }
  return Math.round(addXp * TUNING.postCapXpToGold);
}

/** Recruit level ceiling by badge count (§3.4); clamps to the last tuning entry. */
export function recruitLevelCap(badgeCount: number): number {
  const arr = TUNING.recruitLevelCap;
  return arr[Math.min(Math.max(0, badgeCount), arr.length - 1)];
}

export function xpProgress(level: number, xp: number): { current: number; needed: number; pct: number } {
  if (level >= TUNING.levelCap) return { current: 0, needed: 0, pct: 1 };
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { current: xp - cur, needed: next - cur, pct: (xp - cur) / (next - cur) };
}
