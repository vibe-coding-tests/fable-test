import { TUNING } from '../data/tuning';
import { dist2 } from './math2d';
import { REG } from './registry';
import { spawnHeroEchoUnit } from './echo-unit';
import type { Sim } from './sim';
import type { SimEvent, TrialDef, TrialKind, Vec2 } from './types';

// ------------------------------------------------------------------
// Recruitment trials (Phase 2 §3.3, Phase 3 §4.5). A TrialRunner takes a
// TrialDef, spawns its scripted setup into the live Sim, observes sim events,
// and ticks toward `complete` or `fail`. The same runner drives the live
// overworld trial and the headless acceptance tests (which feed scripted
// events + time). Each kind dispatches to one of a small set of mechanics so
// the bespoke kinds share code while keeping distinct success/fail rules.
// ------------------------------------------------------------------

export type TrialOutcome = 'running' | 'complete' | 'fail';

/** Mechanic families; every TrialKind maps to exactly one. */
type TrialMechanic =
  | 'duel'        // beat the hero echo
  | 'endure'      // survive to the deadline
  | 'cull'        // kill N spawns before the deadline
  | 'hit'         // land N hits on a moving target
  | 'combo'       // cast N distinct ability schools
  | 'assassinate' // kill the marked target fast
  | 'convert'     // capture N creeps (not kill them)
  | 'fetch'       // reach the relic marker
  | 'choice'      // pick an option (faction / pact / riddle)
  | 'gated';      // opens only when an external condition is met

const MECHANIC: Record<TrialKind, TrialMechanic> = {
  'honor-duel': 'duel',
  'frost-exam': 'duel',
  'timed-cull': 'cull',
  'skillshot-exam': 'hit',
  'combo-exam': 'combo',
  'assassination-contract': 'assassinate',
  'persuasion-gauntlet': 'convert',
  'relic-fetch': 'fetch',
  'survive-night': 'endure',
  'stealth-hunt': 'endure',
  'faction-choice': 'choice',
  'souls-pact': 'choice',
  'lore-riddle': 'choice',
  'raid-recruit': 'gated',
  'roster-legend': 'gated'
};

export function trialMechanic(kind: TrialKind): TrialMechanic {
  return MECHANIC[kind];
}

export interface TrialGateCtx {
  reputation: number;
  recruitedTotal: number; // roster size (roster-legend)
  raidClears: number;     // total raid clears (raid-recruit)
}

export interface TrialGateResult {
  open: boolean;
  reason: string;
}

/** Whether a trial is even attemptable: reputation + special gates (§3.2, §3.1). */
export function trialGateOpen(trial: TrialDef, ctx: TrialGateCtx): TrialGateResult {
  if (trial.reputationGate !== undefined && ctx.reputation < trial.reputationGate) {
    return { open: false, reason: `requires reputation ${trial.reputationGate}+ (have ${ctx.reputation})` };
  }
  if (trial.kind === 'roster-legend') {
    const need = Number(trial.params?.recruitsNeeded ?? TUNING.rosterLegendNeeded);
    if (ctx.recruitedTotal < need) return { open: false, reason: `recruit ${need} heroes first (have ${ctx.recruitedTotal})` };
  }
  if (trial.kind === 'raid-recruit') {
    const need = Number(trial.params?.raidsNeeded ?? 1);
    if (ctx.raidClears < need) return { open: false, reason: 'clear a raid first' };
  }
  return { open: true, reason: '' };
}

export interface TrialStartOpts {
  /** Level for spawned echoes/targets (the attempting party's lead level). */
  level: number;
  gateCtx: TrialGateCtx;
}

function firstCreepId(): string {
  const id = [...REG.creeps.keys()][0];
  if (!id) throw new Error('no creeps registered for trial spawn');
  return id;
}

export class TrialRunner {
  readonly trial: TrialDef;
  readonly kind: TrialKind;
  readonly mechanic: TrialMechanic;
  outcome: TrialOutcome = 'running';
  reason = '';
  /** Karma delta to apply when the trial resolves (souls-pact greed lowers it). */
  karmaDelta = 0;
  /** Faction picked, for faction-choice (consumed by the recruitment path). */
  factionChoice: string | null = null;
  /** uids the runner spawned, for cleanup on resolve. */
  readonly spawnedUids: number[] = [];

  private sim: Sim;
  private playerUid: number;
  private deadline = 0;          // sim.time at which the timer expires
  private deadlineIsSuccess = false;
  private goal = 1;
  private progress = 0;
  private castSchools = new Set<string>();
  private markerPos: Vec2;
  private reachRadius = 0;
  private gateOpen = true;

  constructor(sim: Sim, playerUid: number, trial: TrialDef, opts: TrialStartOpts) {
    this.sim = sim;
    this.playerUid = playerUid;
    this.trial = trial;
    this.kind = trial.kind;
    this.mechanic = MECHANIC[trial.kind];
    this.markerPos = { ...trial.pos };
    const gate = trialGateOpen(trial, opts.gateCtx);
    this.gateOpen = gate.open;
    if (!gate.open) {
      // a gated trial that isn't open yet starts already failed-to-open;
      // the caller checks gateOpen before constructing in the live path.
      this.reason = gate.reason;
    }
    this.start(opts);
  }

  private num(key: string, fallback: number): number {
    const v = this.trial.params?.[key];
    return typeof v === 'number' ? v : fallback;
  }

  private start(opts: TrialStartOpts): void {
    const sec = this.num('time', TUNING.trialDefaultSec);
    switch (this.mechanic) {
      case 'duel': {
        // souls-pact / lore-riddle wait for a choice before any duel; honor/frost spawn now.
        this.deadline = this.sim.time + this.num('time', 90);
        this.spawnEcho(opts.level);
        this.goal = 1;
        break;
      }
      case 'endure': {
        this.deadline = this.sim.time + sec;
        this.deadlineIsSuccess = true;
        const adds = this.num('adds', 2);
        for (let i = 0; i < adds; i++) {
          this.spawnTrialCreep({ x: this.trial.pos.x + 220 * (i + 1), y: this.trial.pos.y + 120 * (i - adds / 2) }, opts.level);
        }
        break;
      }
      case 'cull': {
        this.deadline = this.sim.time + sec;
        this.goal = this.num('count', 4);
        for (let i = 0; i < this.goal; i++) {
          this.spawnTrialCreep({ x: this.trial.pos.x + 180 * Math.cos((i / this.goal) * Math.PI * 2), y: this.trial.pos.y + 180 * Math.sin((i / this.goal) * Math.PI * 2) }, opts.level);
        }
        break;
      }
      case 'hit': {
        this.deadline = this.sim.time + sec;
        this.goal = this.num('hits', 3);
        this.spawnTrialCreep({ x: this.trial.pos.x + 300, y: this.trial.pos.y }, opts.level);
        break;
      }
      case 'combo': {
        this.deadline = this.sim.time + this.num('time', 20);
        this.goal = this.num('schools', 3);
        break;
      }
      case 'assassinate': {
        this.deadline = this.sim.time + this.num('time', 18);
        this.goal = 1;
        this.spawnTrialCreep({ x: this.trial.pos.x + 260, y: this.trial.pos.y + 60 }, opts.level);
        break;
      }
      case 'convert': {
        this.deadline = this.sim.time + sec;
        this.goal = this.num('count', 2);
        for (let i = 0; i < this.goal + 1; i++) {
          this.spawnTrialCreep({ x: this.trial.pos.x + 160 * (i + 1), y: this.trial.pos.y + 90 * (i - 1) }, opts.level, true);
        }
        break;
      }
      case 'fetch': {
        this.deadline = this.sim.time + sec;
        this.reachRadius = this.num('reachRadius', 260);
        this.markerPos = { x: this.trial.pos.x + this.num('relicDx', 600), y: this.trial.pos.y + this.num('relicDy', 0) };
        const guards = this.num('guards', 1);
        for (let i = 0; i < guards; i++) {
          this.spawnTrialCreep({ x: this.markerPos.x + 80 * (i - guards / 2), y: this.markerPos.y + 70 }, opts.level);
        }
        break;
      }
      case 'choice': {
        this.deadline = this.sim.time + this.num('time', 60);
        break;
      }
      case 'gated': {
        // open if the gate passed (checked in ctor). Resolve on the next tick.
        this.deadline = 0;
        break;
      }
    }
  }

  private spawnEcho(level: number): void {
    const u = spawnHeroEchoUnit(this.sim, {
      heroId: this.trial.heroId,
      team: 1,
      pos: { x: this.trial.pos.x + 260, y: this.trial.pos.y + 40 },
      level,
      gambit: true,
      leashRadius: TUNING.echoLeashRadius,
      echoFlag: true,
      nameSuffix: ' Trial Echo',
      bountyMult: 0.8
    });
    this.spawnedUids.push(u.uid);
  }

  private spawnTrialCreep(pos: Vec2, level: number, capturable = false): void {
    const creepId = (this.trial.params?.creepId as string) ?? firstCreepId();
    const def = REG.creep(creepId);
    const u = this.sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...pos } });
    void level;
    if (capturable) u.capturable = true;
    this.spawnedUids.push(u.uid);
  }

  /** Resolve a choice trial. Returns true when the choice settled the outcome. */
  choose(choice: string): boolean {
    if (this.mechanic !== 'choice' || this.outcome !== 'running') return false;
    if (this.kind === 'faction-choice') {
      this.factionChoice = choice;
      this.finish('complete', `chose ${choice}`);
      return true;
    }
    if (this.kind === 'souls-pact') {
      if (choice === 'greed') {
        this.karmaDelta = -TUNING.reputationSoulsPactDrop;
        this.finish('complete', 'took the greedy pact');
      } else {
        this.karmaDelta = TUNING.reputationHonorGain;
        this.finish('complete', 'refused the pact');
      }
      return true;
    }
    if (this.kind === 'lore-riddle') {
      const answer = String(this.trial.params?.answer ?? 'origin');
      if (choice === answer) this.finish('complete', 'answered the riddle');
      else this.finish('fail', 'wrong answer');
      return true;
    }
    return false;
  }

  observe(ev: SimEvent): void {
    if (this.outcome !== 'running') return;
    switch (ev.t) {
      case 'death':
        if (this.spawnedUids.includes(ev.uid)) {
          if (this.mechanic === 'duel' || this.mechanic === 'cull' || this.mechanic === 'assassinate') {
            this.progress += 1;
          } else if (this.mechanic === 'convert') {
            // a converted creep killed instead of captured is a failure beat
            this.progress -= 1;
          }
        }
        if (ev.uid === this.playerUid && this.mechanic !== 'choice' && this.mechanic !== 'gated') {
          this.finish('fail', 'the recruit fell');
        }
        break;
      case 'capture-complete':
        if (this.mechanic === 'convert' && this.spawnedUids.includes(ev.target)) {
          this.progress += 1;
        }
        break;
      case 'damage':
        if (this.mechanic === 'hit' && ev.from === this.playerUid && this.spawnedUids.includes(ev.uid)) {
          this.progress += 1;
        }
        break;
      case 'cast':
        if (this.mechanic === 'combo' && ev.uid === this.playerUid) {
          this.castSchools.add(ev.abilityId);
          this.progress = this.castSchools.size;
        }
        break;
      default:
        break;
    }
  }

  tick(now: number): TrialOutcome {
    if (this.outcome !== 'running') return this.outcome;

    if (this.mechanic === 'gated') {
      if (this.gateOpen) this.finish('complete', 'the gate stands open');
      else this.finish('fail', this.reason || 'the gate is shut');
      return this.outcome;
    }

    // goal reached?
    if ((this.mechanic === 'duel' || this.mechanic === 'cull' || this.mechanic === 'hit' ||
         this.mechanic === 'combo' || this.mechanic === 'assassinate' || this.mechanic === 'convert') &&
        this.progress >= this.goal) {
      this.finish('complete', 'trial passed');
      return this.outcome;
    }

    if (this.mechanic === 'fetch') {
      const p = this.sim.unit(this.playerUid);
      if (p && p.alive && dist2(p.pos, this.markerPos) <= this.reachRadius * this.reachRadius) {
        this.finish('complete', 'relic recovered');
        return this.outcome;
      }
    }

    // deadline
    if (this.deadline > 0 && now >= this.deadline) {
      this.finish(this.deadlineIsSuccess ? 'complete' : 'fail', this.deadlineIsSuccess ? 'endured to dawn' : 'ran out of time');
    }
    return this.outcome;
  }

  /** Marker the live game shows / relocates on failure. */
  get marker(): Vec2 {
    return this.mechanic === 'fetch' ? this.markerPos : { ...this.trial.pos };
  }

  /** Snapshot of progress for the HUD. */
  status(): { progress: number; goal: number; mechanic: TrialMechanic } {
    return { progress: Math.max(0, this.progress), goal: this.goal, mechanic: this.mechanic };
  }

  private finish(outcome: 'complete' | 'fail', reason: string): void {
    this.outcome = outcome;
    this.reason = reason;
    // despawn anything still standing from the trial setup
    for (const uid of this.spawnedUids) {
      const u = this.sim.unit(uid);
      if (u && u.alive) this.sim.removeUnit(uid);
    }
  }
}
