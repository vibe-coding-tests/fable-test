import { combatProfile } from './combat-profile';
import { dist2 } from './math2d';
import { pickThreatTarget } from './threat';
import { REG } from './registry';
import type { Sim } from './sim';
import type { Unit } from './unit';

// ============================================================
// Boss phase-FSM (AI_OVERHAUL §5, Layer 3). A thin outer machine —
// opening / sustained / pressure / enrage / desperation — that picks
// a target posture and starts armed raid beats. Inside a phase the
// boss still uses the shared utility scorer to choose moment actions
// (cast / cluster / attack); the FSM decides what posture and scripted
// mechanic pressure it commits to.
//
// Variety is seeded off a fork of sim.rng (deterministic, and isolated
// so it does not perturb the global stream), so attempts differ while
// replays stay identical.
// ============================================================

export type BossPhase = 'opening' | 'sustained' | 'pressure' | 'enrage' | 'desperation';
export type BossTargetPref = 'threat' | 'healer' | 'cluster' | 'kill';
export type BossMechanicKind = 'add-wave' | 'zone' | 'signature' | 'enrage';

export interface BossMechanicCandidate {
  key: string;
  kind: BossMechanicKind;
  atHpPct: number;
  armedAt: number;
}

export interface BossState {
  /** raid enrage timer in seconds; once crossed the boss enters the enrage phase */
  enrageSec?: number;
  /** 0..1 opportunism: how often the boss leaves the threat target for a play */
  depth: number;
  /** last phase the plan was rolled for (so the pref is stable within a phase) */
  phase?: BossPhase;
  /** the target posture chosen for the current phase */
  pref?: BossTargetPref;
}

const CLUSTER_RADIUS = 360;
const PHASE_RANK: Record<BossPhase, number> = { opening: 0, sustained: 1, pressure: 2, desperation: 3, enrage: 4 };

function enemyOf(sim: Sim, boss: Unit, o: Unit): boolean {
  return o.alive && o.team !== boss.team && o.kind !== 'npc' && !o.summary.untargetable && o.isVisibleTo(boss.team, sim.time);
}

/** Phase from the enrage timer and boss HP. HP sub-phases give the late fight teeth. */
export function bossPhaseOf(sim: Sim, boss: Unit): BossPhase {
  const cfg = boss.ctrl.boss;
  const hpPct = boss.hp / Math.max(1, boss.stats.maxHp);
  if (cfg?.enrageSec !== undefined && sim.time >= cfg.enrageSec) return 'enrage';
  if (hpPct <= 0.18) return 'desperation';
  if (hpPct <= 0.5) return 'pressure';
  if (hpPct >= 0.85) return 'opening';
  return 'sustained';
}

/** Seeded posture for a phase. Higher depth => more off-threat plays. Isolated rng. */
function rollPref(sim: Sim, boss: Unit, phase: BossPhase, depth: number): BossTargetPref {
  const r = sim.rng.fork(boss.uid * 131 + phaseCode(phase) * 7 + Math.floor(sim.time));
  switch (phase) {
    case 'pressure': return r.chance(depth * 0.45) ? 'healer' : 'threat';
    case 'enrage': return r.chance(depth * 0.5) ? 'cluster' : 'threat';
    case 'desperation': return r.chance(depth * 0.5) ? 'kill' : 'threat';
    default: return 'threat'; // opening / sustained: honor the threat table
  }
}

function phaseCode(p: BossPhase): number {
  return p === 'opening' ? 1 : p === 'sustained' ? 2 : p === 'pressure' ? 3 : p === 'enrage' ? 4 : 5;
}

function ensureBossPlan(sim: Sim, boss: Unit): { phase: BossPhase; pref: BossTargetPref } | null {
  const cfg = boss.ctrl.boss;
  if (!cfg) return null;
  const phase = bossPhaseOf(sim, boss);
  if (cfg.phase !== phase || cfg.pref === undefined) {
    cfg.phase = phase;
    cfg.pref = rollPref(sim, boss, phase, cfg.depth);
  }
  return { phase, pref: cfg.pref };
}

/** Wounded, low-threat support: the healer the boss wants to cut off. */
function reachableHealer(sim: Sim, boss: Unit): Unit | null {
  let best: Unit | null = null;
  let bestScore = -Infinity;
  for (const o of sim.unitsArr) {
    if (!enemyOf(sim, boss, o) || o.kind !== 'hero' || !o.heroId) continue;
    if (combatProfile(o).role !== 'support') continue;
    const d = dist2(o.pos, boss.pos);
    const hpNeed = 1 - o.hp / Math.max(1, o.stats.maxHp);
    const threat = boss.ctrl.threat?.[o.uid] ?? 0;
    const lowThreat = 1 / (1 + threat / 600);
    const reach = 1 / (1 + d / (900 * 900));
    const score = hpNeed * 2.2 + lowThreat * 0.9 + reach * 0.45;
    if (score > bestScore || (score === bestScore && best !== null && o.uid < best.uid)) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/** Enemy whose neighborhood packs the most bodies: the AoE anchor. */
function nearbyEnemyCount(sim: Sim, boss: Unit, center: Unit): number {
  let n = 0;
  sim.forEachNearbyUnit(center.pos, CLUSTER_RADIUS + 80, (o) => {
    if (enemyOf(sim, boss, o) && dist2(o.pos, center.pos) <= CLUSTER_RADIUS * CLUSTER_RADIUS) n++;
  });
  return n;
}

function clusterTarget(sim: Sim, boss: Unit): Unit | null {
  const enemies = sim.unitsArr.filter((o) => enemyOf(sim, boss, o));
  let best: Unit | null = null;
  let bestCount = -1;
  for (const c of enemies) {
    const n = nearbyEnemyCount(sim, boss, c);
    if (n > bestCount || (n === bestCount && best !== null && c.uid < best.uid)) { bestCount = n; best = c; }
  }
  return best;
}

/** Lowest effective-HP enemy: secure a kill. */
function killTarget(sim: Sim, boss: Unit): Unit | null {
  let best: Unit | null = null;
  let bestPct = Infinity;
  for (const o of sim.unitsArr) {
    if (!enemyOf(sim, boss, o)) continue;
    const pct = o.hp / Math.max(1, o.stats.maxHp);
    if (pct < bestPct || (pct === bestPct && best !== null && o.uid < best.uid)) { bestPct = pct; best = o; }
  }
  return best;
}

/**
 * Boss focus for this think: the threat target by default, overridden by the
 * phase posture (healer / cluster / kill) when the seeded plan calls for it.
 * The shared scorer then turns the focus into an action.
 */
export function pickBossFocus(sim: Sim, boss: Unit): Unit | null {
  const cfg = boss.ctrl.boss;
  const threatT = pickThreatTarget(sim, boss);
  if (!cfg) return threatT; // no brain configured: pure threat (unchanged behavior)

  ensureBossPlan(sim, boss);

  let chosen: Unit | null = null;
  if (cfg.pref === 'healer') chosen = reachableHealer(sim, boss);
  else if (cfg.pref === 'cluster') chosen = clusterTarget(sim, boss);
  else if (cfg.pref === 'kill') chosen = killTarget(sim, boss);

  return chosen ?? threatT;
}

function mechanicPhase(kind: BossMechanicKind, atHpPct: number): BossPhase {
  if (kind === 'enrage') return 'enrage';
  if (kind === 'signature') return 'pressure';
  if (atHpPct >= 85) return 'opening';
  if (atHpPct > 50) return 'sustained';
  if (atHpPct > 18) return 'pressure';
  return 'desperation';
}

function partyClusterCount(sim: Sim, boss: Unit): number {
  const enemies = sim.unitsArr.filter((o) => enemyOf(sim, boss, o));
  let best = 0;
  for (const c of enemies) {
    const n = nearbyEnemyCount(sim, boss, c);
    if (n > best) best = n;
  }
  return best;
}

function mechanicBase(kind: BossMechanicKind): number {
  switch (kind) {
    case 'enrage': return 100;
    case 'signature': return 70;
    case 'add-wave': return 55;
    case 'zone': return 45;
  }
}

/**
 * Pick one armed raid beat for the boss to start this tick. Thresholds arm
 * candidates elsewhere; this phase-FSM chooses the actual initiation so mechanics
 * can be held for a cluster or staged instead of all firing from a side channel.
 */
export function pickBossMechanic(sim: Sim, boss: Unit, candidates: BossMechanicCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const plan = ensureBossPlan(sim, boss);
  if (!plan) return [...candidates].sort((a, b) => a.key.localeCompare(b.key))[0].key;

  const clusterCount = partyClusterCount(sim, boss);
  let best: BossMechanicCandidate | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const phase = mechanicPhase(c.kind, c.atHpPct);
    if (PHASE_RANK[phase] > PHASE_RANK[plan.phase]) continue;

    if ((c.kind === 'zone' || c.kind === 'signature') && clusterCount < 2 && sim.time - c.armedAt < 2) {
      continue; // hold the area beat briefly until there is something worth hitting
    }

    let score = mechanicBase(c.kind) + PHASE_RANK[phase] * 4 + (sim.time - c.armedAt) * 3;
    if (phase === plan.phase) score += 12;
    if ((c.kind === 'zone' || c.kind === 'signature') && plan.pref === 'cluster') score += 18;
    if (c.kind === 'add-wave' && (plan.pref === 'healer' || plan.phase === 'pressure')) score += 8;
    if (c.kind === 'enrage' && plan.phase === 'enrage') score += 50;

    if (score > bestScore || (score === bestScore && best !== null && c.key < best.key)) {
      bestScore = score;
      best = c;
    }
  }
  return best?.key ?? null;
}
