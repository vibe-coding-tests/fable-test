import { TUNING } from '../data/tuning';
import { heroesAlive, setupMacroSim, type MacroResult } from '../core/macro';
import { counterFormation, defaultFormation } from '../core/board';
import { REG } from '../core/registry';
import type { ControllerRef } from '../core/unit';
import type { Unit } from '../core/unit';
import type { Formation, GambitRule, GymDef, MacroHeroSetup } from '../core/types';
import type { Sim } from '../core/sim';

/** An authored board for a lineup (§6.4): the same archetype-aware default the
 *  player gets, so both sides deploy on a real board, not the role heuristic.
 *  Pure over the setups; heroes missing from the registry are skipped. */
export function defaultBoardFor(team: MacroHeroSetup[], opponent?: Formation): Formation {
  const defs = team.map((h) => REG.heroes.get(h.heroId)).filter((d): d is NonNullable<typeof d> => !!d);
  return opponent ? counterFormation(defs, opponent) : defaultFormation(defs);
}

export interface GymMatchHero {
  heroId: string;
  level: number;
  items?: string[];
  gambits?: GambitRule[];
}

export interface GymRoundResult {
  round: number;
  winner: 0 | 1 | -1;
  result: MacroResult;
}

export interface GymMatchResult {
  gymId: string;
  playerWins: number;
  enemyWins: number;
  winner: 0 | 1 | -1;
  rounds: GymRoundResult[];
}

/**
 * A timed player-control window over a gambit-driven hero (SPEC §7). One side
 * of a fight owns a controller; spending a charge hands a chosen hero to
 * `player` control for `captainCallSec`, then reverts and decrements.
 */
export class CaptainCallController {
  remaining: number;
  activeUid: number | null = null;
  expiresAt = 0;
  used = 0;
  private previous: ControllerRef | null = null;

  constructor(public readonly team: 0 | 1 = 0, charges = TUNING.captainCallsPerFight) {
    this.remaining = charges;
  }

  activate(sim: Sim, uid: number): boolean {
    const u = sim.unit(uid);
    if (!u || !u.alive || u.team !== this.team || this.remaining <= 0 || this.activeUid !== null) return false;
    this.remaining -= 1;
    this.used += 1;
    this.activeUid = uid;
    this.expiresAt = sim.time + TUNING.captainCallSec;
    this.previous = structuredClone(u.ctrl);
    u.ctrl = { kind: 'player' };
    if (this.team === 0) sim.playerActiveUid = uid;
    return true;
  }

  tick(sim: Sim): void {
    if (this.activeUid === null || sim.time < this.expiresAt) return;
    const u = sim.unit(this.activeUid);
    if (u && this.previous) u.ctrl = this.previous;
    this.activeUid = null;
    this.previous = null;
    if (this.team === 0) sim.playerActiveUid = heroesAlive(sim, 0)[0]?.uid ?? -1;
  }
}

function toSetups(team: GymMatchHero[]): MacroHeroSetup[] {
  return team.slice(0, 5).map((h) => ({ heroId: h.heroId, level: h.level, items: h.items, gambits: h.gambits }));
}

/**
 * A live, stepped best-of-3 gym fight (Phase 6 §3.5). Both sides own a
 * `CaptainCallController`; the enemy receives `gym.enemyBonusCaptainCalls`
 * extra charges. The same class drives the headless auto-resolve (autoPlayer)
 * and the rendered live fight where the player spends calls by hand.
 */
export class LiveGymFight {
  readonly gym: GymDef;
  private readonly teamA: MacroHeroSetup[];
  private readonly seed: number;
  private readonly autoPlayer: boolean;
  private readonly bestTo: number;
  private readonly formationA?: Formation;
  private readonly formationB: Formation;

  round = 1;
  playerWins = 0;
  enemyWins = 0;
  done = false;
  result: GymMatchResult | null = null;

  sim!: Sim;
  playerCaptain!: CaptainCallController;
  enemyCaptain!: CaptainCallController;
  private maxTicks = 0;
  private readonly rounds: GymRoundResult[] = [];

  constructor(gym: GymDef, teamA: GymMatchHero[], seed: number, opts?: { autoPlayer?: boolean; formationA?: Formation }) {
    this.gym = gym;
    this.teamA = toSetups(teamA);
    this.seed = seed;
    this.autoPlayer = opts?.autoPlayer ?? false;
    this.formationA = opts?.formationA;
    this.formationB = defaultBoardFor(gym.enemyTeam, this.formationA);
    this.bestTo = Math.ceil(gym.bestOf / 2);
    this.startRound();
  }

  private startRound(): void {
    this.sim = setupMacroSim({
      seed: this.seed + this.round * 17,
      teamA: this.teamA,
      teamB: this.gym.enemyTeam,
      maxSec: TUNING.macroMaxSec,
      formationA: this.formationA,
      formationB: this.formationB
    });
    this.playerCaptain = new CaptainCallController(0, TUNING.captainCallsPerFight);
    this.enemyCaptain = new CaptainCallController(1, TUNING.captainCallsPerFight + (this.gym.enemyBonusCaptainCalls ?? 0));
    this.sim.playerActiveUid = heroesAlive(this.sim, 0)[0]?.uid ?? -1;
    this.maxTicks = Math.round(TUNING.macroMaxSec / this.sim.dt);
  }

  /** Advance the live fight by `dt` real seconds (fixed sim ticks under the hood). */
  step(dt: number): void {
    if (this.done) return;
    const ticks = Math.max(1, Math.round(dt / this.sim.dt));
    for (let i = 0; i < ticks && !this.done; i++) {
      if (this.stepOnce()) break;
    }
  }

  /** Run to a final result with no live player (used by auto-resolve + tests). */
  runHeadless(): GymMatchResult {
    let guard = 0;
    while (!this.done && guard++ < 5_000_000) this.stepOnce();
    return this.result!;
  }

  /** Player spends a charge on an ult-ready hero (or `preferUid`). */
  playerCaptainCall(preferUid?: number): boolean {
    if (this.done) return false;
    const own = heroesAlive(this.sim, 0);
    if (own.length === 0) return false;
    let caller = preferUid !== undefined ? this.sim.unit(preferUid) : undefined;
    if (!caller || !caller.alive || caller.team !== 0) {
      caller = own.find((u) => u.abilityReady(3, this.sim.time).ok) ?? own[0];
    }
    return caller ? this.playerCaptain.activate(this.sim, caller.uid) : false;
  }

  /** Player-side heroes still alive in the current round, in party/spawn order. */
  playerHeroes(): Unit[] {
    return heroesAlive(this.sim, 0);
  }

  /** Unit currently driven by live input during a real Captain's Call. */
  playerDrivenUnit(): Unit | null {
    if (this.playerCaptain.activeUid === null) return null;
    return this.sim.unit(this.playerCaptain.activeUid) ?? null;
  }

  /** The unit the camera should track: an active player caller, else a player hero. */
  cameraFollow(): Unit | null {
    if (this.playerCaptain.activeUid !== null) {
      const u = this.sim.unit(this.playerCaptain.activeUid);
      if (u) return u;
    }
    return heroesAlive(this.sim, 0)[0] ?? null;
  }

  /** Returns true once the round has ended. */
  private stepOnce(): boolean {
    if (this.done) return true;
    const a = heroesAlive(this.sim, 0);
    const b = heroesAlive(this.sim, 1);
    if (a.length === 0 || b.length === 0 || this.sim.tickCount >= this.maxTicks) {
      this.endRound();
      return true;
    }
    this.autoCall(this.enemyCaptain, b);
    if (this.autoPlayer) this.autoCall(this.playerCaptain, a);
    this.steer(this.enemyCaptain, a);
    if (this.autoPlayer) this.steer(this.playerCaptain, b);
    this.sim.tick();
    this.playerCaptain.tick(this.sim);
    this.enemyCaptain.tick(this.sim);
    return false;
  }

  private autoCall(cap: CaptainCallController, own: Unit[]): void {
    if (cap.remaining <= 0 || cap.activeUid !== null) return;
    if (this.sim.time <= 4 + cap.used * 12) return;
    const caller = own.find((u) => u.abilityReady(3, this.sim.time).ok) ?? own[0];
    if (caller) cap.activate(this.sim, caller.uid);
  }

  private steer(cap: CaptainCallController, foes: Unit[]): void {
    if (cap.activeUid === null) return;
    const caller = this.sim.unit(cap.activeUid);
    if (!caller) return;
    const target = [...foes].sort((x, y) => x.hp / x.stats.maxHp - y.hp / y.stats.maxHp)[0];
    if (!target) return;
    caller.order = caller.abilityReady(3, this.sim.time).ok
      ? { kind: 'cast', slot: 3, uid: target.uid, point: { ...target.pos } }
      : { kind: 'attack-unit', uid: target.uid };
  }

  private endRound(): void {
    let winner = this.decideWinner();
    if (winner === 0) this.playerWins += 1;
    else if (winner === 1) this.enemyWins += 1;
    this.rounds.push({ round: this.round, winner, result: this.snapshot(winner) });

    if (this.playerWins >= this.bestTo || this.enemyWins >= this.bestTo || this.round >= this.gym.bestOf) {
      this.done = true;
      this.result = {
        gymId: this.gym.id,
        playerWins: this.playerWins,
        enemyWins: this.enemyWins,
        winner: this.playerWins > this.enemyWins ? 0 : this.enemyWins > this.playerWins ? 1 : -1,
        rounds: this.rounds
      };
      return;
    }
    this.round += 1;
    this.startRound();
  }

  private decideWinner(): 0 | 1 | -1 {
    const a = heroesAlive(this.sim, 0).length;
    const b = heroesAlive(this.sim, 1).length;
    if (a > 0 && b === 0) return 0;
    if (b > 0 && a === 0) return 1;
    const score = (team: number) => heroesAlive(this.sim, team).reduce((acc, u) => acc + u.hp / u.stats.maxHp, 0);
    const sa = score(0);
    const sb = score(1);
    return sa > sb ? 0 : sb > sa ? 1 : -1;
  }

  private snapshot(winner: 0 | 1 | -1): MacroResult {
    return {
      winner,
      timeSec: this.sim.time,
      ticks: this.sim.tickCount,
      survivors: this.sim.unitsArr
        .filter((u) => u.alive && u.kind === 'hero')
        .map((u) => ({ heroId: u.heroId ?? '?', team: u.team, hpPct: u.hp / u.stats.maxHp })),
      hash: this.sim.hash(),
      sim: this.sim,
      rapierDrops: [],
      aegisConsumed: false
    };
  }
}

export function runGymMatch(gym: GymDef, team: GymMatchHero[], seed: number, formationA?: Formation): GymMatchResult {
  return new LiveGymFight(gym, team, seed, { autoPlayer: true, formationA }).runHeadless();
}

export function setupCaptainCallSmoke(gym: GymDef, team: GymMatchHero[], seed: number): { sim: Sim; captain: CaptainCallController } {
  const sim = setupMacroSim({
    seed,
    teamA: toSetups(team),
    teamB: gym.enemyTeam,
    maxSec: 20
  });
  return { sim, captain: new CaptainCallController() };
}
