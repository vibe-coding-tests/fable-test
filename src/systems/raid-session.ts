import { createRaidMechanicRunner, heroesAlive, setupRaidSim, type RaidEncounterResult } from '../core/macro';
import { raidSetupFromDef } from '../core/phase3';
import type { DifficultyTier, MacroHeroSetup, RaidDef, SeasonalModeKind } from '../core/types';
import type { EffectCtx } from '../core/effects';
import type { Sim } from '../core/sim';
import type { Unit } from '../core/unit';

export interface LiveRaidFestivalObjective {
  mode: SeasonalModeKind;
  wavesSpawned: number;
  tributeTicks: number;
  timerSec: number;
  nextPressureAt: number;
}

export class LiveRaid {
  readonly def: RaidDef;
  readonly tier: DifficultyTier;
  readonly sim: Sim;
  readonly boss: Unit;
  readonly partyUids: number[];
  readonly maxTicks: number;
  private readonly mechanics;
  private readonly gambitControllers = new Map<number, Unit['ctrl']>();
  private readonly handledFallen = new Set<number>();
  private readonly festivalMode?: SeasonalModeKind;
  private readonly festivalCtx: EffectCtx;
  private aegisAvailable: boolean;
  private aegisConsumed = false;
  private claimedUid: number | null = null;
  private festivalWavesSpawned = 0;
  private festivalTributeTicks = 0;
  private nextFestivalPressureAt = 14;

  driverIdx = 0;
  done = false;
  result: RaidEncounterResult | null = null;

  constructor(def: RaidDef, party: MacroHeroSetup[], tier: DifficultyTier, seed: number, opts?: { maxSec?: number; aegis?: boolean; festivalMode?: SeasonalModeKind }) {
    this.def = def;
    this.tier = tier;
    this.festivalMode = opts?.festivalMode;
    this.festivalCtx = { defId: `festival:${opts?.festivalMode ?? def.id}`, level: def.boss.level ?? 30, vfx: { archetype: 'summon-pop', color: '#ffd86a' } };
    const rs = raidSetupFromDef(def, party, tier, seed);
    const limit = opts?.maxSec ?? rs.maxSec;
    this.sim = setupRaidSim({ seed: rs.seed, party: rs.party, boss: rs.boss, maxSec: limit });
    this.boss = this.sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    this.partyUids = this.sim.unitsArr.filter((u) => u.team === 0 && u.kind === 'hero').map((u) => u.uid);
    for (const uid of this.partyUids) {
      const u = this.sim.unit(uid);
      if (u?.ctrl.kind === 'gambit') this.gambitControllers.set(uid, cloneGambitController(u.ctrl));
    }
    this.maxTicks = Math.round(limit / this.sim.dt);
    this.mechanics = createRaidMechanicRunner(def, this.sim, this.boss);
    this.aegisAvailable = !!opts?.aegis;
    this.sim.playerActiveUid = this.partyUids[0] ?? -1;
  }

  drivenUnit(): Unit | null {
    const u = this.sim.unit(this.partyUids[this.driverIdx]);
    if (u?.alive) return u;
    return heroesAlive(this.sim, 0)[0] ?? null;
  }

  claimDriver(): Unit | null {
    const u = this.drivenUnit();
    if (!u) return null;
    if (this.claimedUid !== null && this.claimedUid !== u.uid) this.restoreGambit(this.claimedUid);
    this.claimedUid = u.uid;
    u.ctrl = { kind: 'player' };
    this.sim.playerActiveUid = u.uid;
    return u;
  }

  selectDriver(idx: number): boolean {
    const uid = this.partyUids[idx];
    const u = uid !== undefined ? this.sim.unit(uid) : undefined;
    if (!u || !u.alive) return false;
    if (this.claimedUid !== null && this.claimedUid !== uid) {
      this.restoreGambit(this.claimedUid);
      u.ctrl = { kind: 'player' };
      this.claimedUid = uid;
    }
    this.driverIdx = idx;
    this.sim.playerActiveUid = u.uid;
    return true;
  }

  cameraFollow(): Unit | null {
    return this.drivenUnit() ?? heroesAlive(this.sim, 0)[0] ?? this.boss;
  }

  festivalObjective(): LiveRaidFestivalObjective | null {
    if (!this.festivalMode) return null;
    return {
      mode: this.festivalMode,
      wavesSpawned: this.festivalWavesSpawned,
      tributeTicks: this.festivalTributeTicks,
      timerSec: Math.max(0, this.maxTicks * this.sim.dt - this.sim.time),
      nextPressureAt: this.nextFestivalPressureAt
    };
  }

  step(dt: number): void {
    if (this.done) return;
    const ticks = Math.max(1, Math.round(dt / this.sim.dt));
    for (let i = 0; i < ticks && !this.done; i++) this.stepOnce();
  }

  private stepOnce(): void {
    this.sim.tick();
    this.mechanics.tick(this.sim);
    this.tickFestivalPressure();
    this.handleFallen();
    const partyAlive = heroesAlive(this.sim, 0).length;
    const bossAlive = this.boss.alive ? 1 : 0;
    if (partyAlive === 0 || bossAlive === 0 || this.sim.tickCount >= this.maxTicks) {
      this.done = true;
      const winner = partyAlive > 0 && bossAlive === 0 ? 0 : 1;
      this.result = {
        winner,
        cleared: winner === 0,
        timeSec: this.sim.time,
        ticks: this.sim.tickCount,
        survivors: this.sim.unitsArr
          .filter((u) => u.alive && u.kind === 'hero')
          .map((u) => ({ heroId: u.heroId ?? '?', team: u.team, hpPct: u.hp / u.stats.maxHp })),
        hash: this.sim.hash(),
        sim: this.sim,
        rapierDrops: [],
        aegisConsumed: this.aegisConsumed,
        fired: this.mechanics.fired
      };
    }
  }

  private tickFestivalPressure(): void {
    if (!this.festivalMode || !this.boss.alive || this.sim.time < this.nextFestivalPressureAt) return;
    if (this.festivalMode === 'roshan-candy') {
      this.festivalTributeTicks += 1;
      this.spawnFestivalAdds(2 + Math.min(3, this.festivalTributeTicks));
      this.nextFestivalPressureAt += 18;
    } else if (this.festivalMode === 'wave-defense') {
      this.spawnFestivalAdds(3);
      this.nextFestivalPressureAt += 16;
    } else if (this.festivalMode === 'damage-race') {
      this.boss.externalMods.damagePct = (this.boss.externalMods.damagePct ?? 0) + 8;
      this.boss.markStatsDirty();
      this.boss.refresh(this.sim.time);
      this.festivalTributeTicks += 1;
      this.nextFestivalPressureAt += 15;
    }
  }

  private spawnFestivalAdds(count: number): void {
    const spec = this.def.addWaves[0]?.summon;
    if (!spec) return;
    for (let i = 0; i < count; i++) {
      const ang = (i / Math.max(1, count)) * Math.PI * 2 + this.festivalWavesSpawned * 0.37;
      const pos = { x: this.boss.pos.x + Math.cos(ang) * 190, y: this.boss.pos.y + Math.sin(ang) * 190 };
      this.sim.spawnSummon(spec, this.boss, pos, this.festivalCtx);
    }
    this.festivalWavesSpawned += 1;
  }

  private handleFallen(): void {
    for (const uid of this.partyUids) {
      const u = this.sim.unit(uid);
      if (!u || u.alive || this.handledFallen.has(uid)) continue;
      if (this.claimedUid === uid) this.claimedUid = null;
      if (this.aegisAvailable) {
        if (this.sim.reviveUnit(u, 1, 1)) {
          this.aegisAvailable = false;
          this.aegisConsumed = true;
          continue;
        }
      }
      this.handledFallen.add(uid);
    }
  }

  private restoreGambit(uid: number): void {
    const u = this.sim.unit(uid);
    const ctrl = this.gambitControllers.get(uid);
    if (!u || !ctrl) return;
    u.ctrl = cloneGambitController(ctrl);
  }
}

function cloneGambitController(ctrl: Unit['ctrl']): Unit['ctrl'] {
  return {
    ...ctrl,
    homePos: ctrl.homePos ? { ...ctrl.homePos } : undefined,
    rules: ctrl.rules ? structuredClone(ctrl.rules) : undefined
  };
}
