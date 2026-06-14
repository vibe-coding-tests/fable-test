import { TUNING } from '../data/tuning';
import { affixDef } from '../data/affixes';
import { angleOf, dist, dist2, norm, sub, v2 } from './math2d';
import { EventBus } from './events';
import { Rng } from './rng';
import { REG } from './registry';
import { SpatialGrid } from './spatial';
import { applyDamage, attackImpact } from './combat';
import { applyStatus, execEffects, type EffectCtx } from './effects';
import { abilityCtx, breakInvis, emitBark, fireCast, updateUnitActions } from './actions';
import { soundForAbility } from './gestures';
import { thinkUnit } from './controllers';
import { computeTeamMind } from './utility';
import { itemReady } from './items';
import { makeCreepUnit, makeSummonUnit, Unit, type ItemState } from './unit';
import { abilityMaxLevel, levelArr } from './values';
import type {
  CreepDef,
  DifficultyTier,
  EffectNode,
  HeroDef,
  Order,
  ProjectileSpec,
  StatusId,
  StatusParams,
  SummonSpec,
  Team,
  TriggerSpec,
  TriggerEvent,
  Vec2,
  VfxSpec,
  ZoneSpec
} from './types';

// ============================================================
// The renderer-independent combat simulation (SPEC §1.1).
// Fixed 30 Hz tick, deterministic for a given seed.
// ============================================================

export interface SimOptions {
  seed: number;
  bounds: { w: number; h: number };
  obstacles?: { pos: Vec2; radius: number }[];
}

export interface Projectile {
  pid: number;
  casterUid: number;
  team: Team;
  pos: Vec2;
  speed: number;
  model: 'homing' | 'linear';
  targetUid?: number;
  dir?: Vec2;
  travelled: number;
  range: number;
  width: number;
  bouncesLeft: number;
  bounceRadius: number;
  hitUids: number[];
  onHit: EffectNode[];
  ctx: EffectCtx;
  disjointable: boolean;
  hitsAllies: boolean;
  attackPayload?: { attackerUid: number };
  dead: boolean;
}

export interface Zone {
  zid: number;
  casterUid: number;
  team: Team;
  shape: 'circle' | 'line';
  pos?: Vec2;
  radius?: number;
  a?: Vec2;
  b?: Vec2;
  width: number;
  wall: boolean;
  until: number;
  followUid?: number;
  tickInterval?: number;
  nextTickAt: number;
  tickEffects?: EffectNode[];
  tickAffects?: 'enemies' | 'allies' | 'all';
  auraMods?: { affects: 'enemies' | 'allies'; mods: Record<string, number> };
  onEnter?: { effects: EffectNode[]; affects: 'enemies' | 'allies'; windowSec?: number };
  entered: number[];
  ctx: EffectCtx;
  createdAt: number;
}

export interface Repeater {
  casterUid: number;
  remaining: number;
  interval: number;
  nextAt: number;
  effects: EffectNode[];
  retarget?: string;
  radius: number;
  ctx: EffectCtx;
  targetUid?: number;
  point?: Vec2;
}

/**
 * Per-team coordination state (AI_OVERHAUL §1, Layer 1). Computed once per team
 * per decision window and read by the gambit controller so allies converge on a
 * shared focus and sequence their commit instead of fighting as five soloists.
 */
export interface TeamMind {
  focusUid: number | null;  // the target the team should converge on
  focusScore: number;
  engaged: boolean;         // an ally is in the fight; safe to commit / burst
  spread: boolean;          // enemy area damage is on allies; hold spacing
  computedTick: number;
}

export class Sim {
  time = 0;
  tickCount = 0;
  readonly dt = TUNING.dt;
  rng: Rng;
  events = new EventBus();
  bounds: { w: number; h: number };
  obstacles: { pos: Vec2; radius: number }[];

  unitsArr: Unit[] = [];
  private byUid = new Map<number, Unit>();
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  repeaters: Repeater[] = [];
  resonanceEnabled = false;
  /**
   * Player-facing overworld battle-scale multiplier (OPTIMIZATION 2.0 §F.2).
   * Scales the per-owner summon/illusion ceiling for THIS sim only. The overworld
   * sim sets it from the graphics settings; gym/Elite/raid/dungeon sims leave it
   * at 1 so a macro outcome can never depend on a performance dial (§E.6 fairness).
   */
  summonCapScale = 1;
  private spatial = new SpatialGrid(256);
  private spatialDirty = true;

  /** uid of the unit the player is directly controlling (last-hit bonus) */
  playerActiveUid = -1;
  private pidSeq = 1;
  private zidSeq = 1;
  private auraNextAt = 0;
  private teamMinds = new Map<Team, TeamMind>();

  constructor(opts: SimOptions) {
    this.rng = new Rng(opts.seed);
    this.bounds = opts.bounds;
    this.obstacles = opts.obstacles ?? [];
  }

  /** Resolve a unit by uid (dead-but-not-removed units still resolve). */
  unit(uid: number): Unit | undefined {
    return this.byUid.get(uid);
  }

  /** uid is reassigned per-sim so identical setups produce identical sims (determinism). */
  private uidSeq = 1;
  addUnit(u: Unit): Unit {
    u.uid = this.uidSeq++;
    this.unitsArr.push(u);
    this.byUid.set(u.uid, u);
    this.spatialDirty = true;
    return u;
  }

  removeUnit(uid: number): void {
    const idx = this.unitsArr.findIndex((u) => u.uid === uid);
    if (idx >= 0) this.unitsArr.splice(idx, 1);
    this.byUid.delete(uid);
    this.spatialDirty = true;
  }

  unitsInRadius(center: Vec2, radius: number, pred: (u: Unit) => boolean): Unit[] {
    const out: Unit[] = [];
    this.forEachNearbyUnit(center, radius + 64, (u) => {
      if (!u.alive || u.kind === 'npc') return;
      const r = radius + u.radius * 0.5;
      if (dist2(u.pos, center) <= r * r && pred(u)) out.push(u);
    });
    out.sort((a, b) => a.uid - b.uid);
    return out;
  }

  forEachNearbyUnit(center: Vec2, radius: number, fn: (u: Unit) => void): void {
    this.ensureSpatial();
    this.spatial.forEachRadius(center, radius, fn);
  }

  nearestUnit(center: Vec2, radius: number, pred: (u: Unit) => boolean): Unit | null {
    this.ensureSpatial();
    return this.spatial.nearest(center, radius, pred);
  }

  rebuildSpatial(): void {
    this.spatial.rebuild(this.unitsArr);
    this.spatialDirty = false;
  }

  private ensureSpatial(): void {
    if (this.spatialDirty) this.rebuildSpatial();
  }

  /**
   * Shared coordination state for a team, recomputed at most once per
   * TUNING.ai.teamFocusReassessTicks. Cheap: one pass over the unit list per
   * team per interval, reused by every ally that thinks inside that interval.
   */
  teamMind(team: Team): TeamMind {
    const prev = this.teamMinds.get(team);
    if (prev && this.tickCount - prev.computedTick < TUNING.ai.teamFocusReassessTicks) return prev;
    const tm = computeTeamMind(this, team, prev ?? null);
    this.teamMinds.set(team, tm);
    return tm;
  }

  // ---------- spawning ----------

  spawnHero(def: HeroDef, opts: { team: Team; pos: Vec2; level?: number; ctrl: Unit['ctrl']; skillOrder?: number[]; abilityLevels?: number[] }): Unit {
    const u = new Unit({
      kind: 'hero',
      team: opts.team,
      name: def.name,
      attribute: def.attribute,
      base: { ...def.baseStats },
      pos: opts.pos,
      radius: TUNING.unitRadiusHero,
      level: opts.level ?? 1
    });
    u.heroId = def.id;
    u.animProfile = def.animProfile;
    u.barks = def.barks;
    u.setupHeroAbilities(def);
    if (opts.abilityLevels) u.setAbilityLevels(opts.abilityLevels);
    else u.autoLevelAbilities(opts.skillOrder ?? def.skillOrder);
    u.ctrl = opts.ctrl;
    u.bounty = { xp: 100 + (opts.level ?? 1) * 40, gold: 80 + (opts.level ?? 1) * 25 };
    u.refresh(this.time);
    u.hp = u.stats.maxHp;
    u.mana = u.stats.maxMana;
    this.addUnit(u);
    return u;
  }

  spawnCreep(def: CreepDef, opts: { team: Team; pos: Vec2; star?: 1 | 2 | 3; wild?: boolean; homePos?: Vec2; ownerUid?: number; regionId?: string; combatTier?: DifficultyTier }): Unit {
    const u = makeCreepUnit(def, { team: opts.team, pos: opts.pos, star: opts.star, wild: opts.wild, regionId: opts.regionId, combatTier: opts.combatTier });
    u.aggroRadius = def.aggroRadius;
    if (opts.ownerUid !== undefined) {
      u.ownerUid = opts.ownerUid;
      u.ctrl = { kind: 'creep', followOwner: true };
    } else {
      u.ctrl = { kind: 'creep', homePos: opts.homePos ?? { ...opts.pos } };
    }
    this.addUnit(u);
    return u;
  }

  spawnSummon(spec: SummonSpec, owner: Unit, pos: Vec2, ctx: EffectCtx): Unit {
    const lifetime = typeof spec.lifetime === 'number' ? spec.lifetime : levelArr(ctx.values?.[spec.lifetime], ctx.level, 30);
    this.enforceOwnerSummonCeiling(owner, spec);
    const u = makeSummonUnit(spec, { owner, pos, now: this.time });
    u.lifetimeUntil = this.time + lifetime;
    u.ctrl = spec.cannotAttack ? { kind: 'ward' } : { kind: 'creep', followOwner: true };
    this.addUnit(u);
    this.events.emit({ t: 'summon', uid: u.uid, pos: { ...pos } });
    return u;
  }

  private enforceOwnerSummonCeiling(owner: Unit, spec: SummonSpec): void {
    const isIllusion = /illusion|image|clone|double|replicate/i.test(`${spec.id} ${spec.name}`);
    const base = isIllusion ? TUNING.scaleCeilings.illusions : TUNING.scaleCeilings.summons;
    const cap = Math.max(1, Math.round(base * this.summonCapScale));
    const owned = this.unitsArr
      .filter((u) => u.alive && u.ownerUid === owner.uid && /illusion|image|clone|double|replicate/i.test(`${u.creepId ?? ''} ${u.name}`) === isIllusion)
      .sort((a, b) => a.uid - b.uid);
    while (owned.length >= cap) {
      const retire = owned.shift();
      if (!retire) break;
      this.killUnit(retire, null, true);
      this.removeUnit(retire.uid);
    }
  }

  // ---------- orders ----------

  order(uid: number, order: Order): void {
    const u = this.byUid.get(uid);
    if (!u || !u.alive) return;
    // new orders cancel windup/cast/channel/capture
    if (u.channel) u.channel = null;
    if (u.cast) u.cast = null;
    if (u.captureCh) this.interruptCapture(u, 'cancelled');
    if (order.kind !== 'attack-unit' || (u.order.kind === 'attack-unit' && u.order.uid !== order.uid)) {
      u.windupUntil = -1;
    }
    u.order = order;
  }

  interruptActions(u: Unit): void {
    if (u.channel) {
      u.channel = null;
      u.order = { kind: 'stop' };
    }
    if (u.cast) {
      u.cast = null;
      u.order = { kind: 'stop' };
    }
    if (u.captureCh) this.interruptCapture(u, 'disabled');
    u.windupUntil = -1;
  }

  interruptCapture(u: Unit, _reason: string): void {
    if (!u.captureCh) return;
    const target = this.byUid.get(u.captureCh.targetUid);
    if (target) target.removeStatusWhere((s) => s.tag === 'binding-totem');
    this.events.emit({ t: 'capture-interrupt', target: u.captureCh.targetUid });
    u.captureCh = null;
  }

  completeCapture(channeler: Unit, target: Unit): void {
    channeler.captureCh = null;
    target.alive = false;
    this.events.emit({ t: 'capture-complete', target: target.uid, creepId: target.creepId ?? 'unknown' });
    this.removeUnit(target.uid);
  }

  // ---------- items ----------

  fireItemActive(u: Unit, invSlot: number, target: Unit | undefined, point?: Vec2): void {
    const it = u.items[invSlot];
    if (!it) return;
    const def = REG.item(it.defId);
    if (!def.active) return;
    const ready = itemReady(it, def, u, this.time);
    if (!ready.ok) return;

    const active = def.active;
    const values = it.activeOverride?.values ?? active.values;
    if (active.manaCost) u.mana -= active.manaCost[0];
    it.cooldownUntil = this.time + (it.activeOverride?.cooldown ?? (active.cooldown ? active.cooldown[0] : 0));
    let chargesConsumed = 0;
    if (def.consumesAllCharges) {
      chargesConsumed = Math.max(0, it.charges);
      it.charges = 0;
    } else if (it.charges > 0) {
      it.charges--;
      chargesConsumed = 1;
      if (it.charges === 0 && def.tier === 'consumable') {
        u.items[invSlot] = null;
        u.markStatsDirty();
        u.markVisualDirty();
      }
    }

    const ctx: EffectCtx = {
      defId: `item:${def.id}`,
      values,
      level: 1,
      piercesImmunity: active.piercesImmunity,
      vfx: active.vfx,
      chargeCount: chargesConsumed
    };
    this.events.emit({ t: 'item-used', uid: u.uid, itemId: def.id });
    this.events.emit({ t: 'cast', uid: u.uid, abilityId: `item:${def.id}`, vfx: active.vfx, target: target?.uid, point, sound: soundForAbility(active), timbre: u.animProfile?.voiceTimbre });
    if (active.channel) {
      const durationRef = active.channel.duration;
      const duration = typeof durationRef === 'number' ? durationRef : levelArr(values?.[durationRef], 1, 3);
      const interval = active.channel.tick?.interval ?? 0.5;
      u.channel = {
        source: 'item',
        slot: invSlot,
        until: this.time + duration,
        nextTickAt: this.time + interval,
        interval,
        targetUid: target?.uid,
        point: point ? { ...point } : undefined
      };
      this.events.emit({ t: 'status-apply', uid: u.uid, status: 'buff', duration });
    }
    if (active.effects) execEffects(this, u, ctx, active.effects, { target, point });
    breakInvis(this, u);
  }

  /** Magic Wand style charge gain on nearby item, telegraphed enemy casts. */
  notifyEnemyCast(caster: Unit): void {
    this.forEachNearbyUnit(caster.pos, 1280, (u) => {
      if (!u.alive || u.team === caster.team) return;
      for (const it of u.items) {
        if (!it) continue;
        const def = REG.items.get(it.defId);
        if (!def) continue;
        for (const trig of this.itemTriggers(it, def?.triggers)) {
          if (trig.on !== 'on-nearby-enemy-cast') continue;
          const radius = typeof trig.radius === 'number' ? trig.radius : 1200;
          if (dist2(u.pos, caster.pos) > radius * radius) continue;
          if (trig.chargeGain && def.maxCharges) {
            it.charges = Math.min(def.maxCharges, Math.max(0, it.charges) + trig.chargeGain);
          }
        }
      }
    });
  }

  /** Generic trigger dispatch for ability-level triggers. */
  runTriggers(u: Unit, event: TriggerEvent, ctx2: { other?: Unit }): void {
    if (!u.alive) return;
    const fireTrigger = (
      trig: TriggerSpec,
      key: string,
      ctx: EffectCtx,
      stackKey: string,
      chargeTarget?: { item: ItemState; maxCharges?: number }
    ): void => {
      if (trig.on !== event) return;
      if (trig.radius && ctx2.other) {
        const radius = typeof trig.radius === 'number' ? trig.radius : levelArr(ctx.values?.[trig.radius], ctx.level, 0);
        if (dist2(u.pos, ctx2.other.pos) > radius * radius) return;
      }
      if (trig.cooldown) {
        const last = this.triggerCooldowns.get(`${u.uid}:${key}`) ?? -999;
        if (this.time - last < trig.cooldown) return;
        this.triggerCooldowns.set(`${u.uid}:${key}`, this.time);
      }
      if (trig.statStack) {
        const mods: Record<string, number> = {};
        for (const k in trig.statStack.mods) {
          mods[k] = typeof trig.statStack.mods[k] === 'number'
            ? (trig.statStack.mods[k] as number)
            : levelArr(ctx.values?.[trig.statStack.mods[k] as string], ctx.level);
        }
        const cur = u.triggerStacks.get(stackKey) ?? 0;
        if (!trig.statStack.max || cur < trig.statStack.max) {
          u.triggerStacks.set(stackKey, cur + 1);
          for (const k in mods) u.permanentMods[k] = (u.permanentMods[k] ?? 0) + mods[k];
          u.markStatsDirty();
        }
      }
      if (trig.chargeGain && chargeTarget?.maxCharges) {
        chargeTarget.item.charges = Math.min(
          chargeTarget.maxCharges,
          Math.max(0, chargeTarget.item.charges) + trig.chargeGain
        );
      }
      if (trig.effects) {
        execEffects(this, u, ctx, trig.effects, { target: ctx2.other, point: ctx2.other?.pos ?? u.pos });
      }
    };

    for (const a of u.abilities) {
      if (a.level <= 0 || !a.def.triggers) continue;
      if (u.summary.broken) continue; // break disables passive triggers
      for (const trig of a.def.triggers) {
        const ctx = abilityCtx(a.def, a.level);
        fireTrigger(trig, `trig:${a.def.id}:${trig.on}`, ctx, a.def.id);
      }
    }
    for (const it of u.items) {
      if (!it) continue;
      const def = REG.items.get(it.defId);
      if (!def) continue;
      for (const trig of this.itemTriggers(it, def.triggers)) {
        fireTrigger(
          trig,
          `item:${it.defId}:${trig.on}`,
          { defId: `item:${it.defId}`, level: 1, vfx: { archetype: 'stun-stars', color: '#ffd86a', scale: 0.45 } },
          `item:${it.defId}:${trig.on}`,
          { item: it, maxCharges: def.maxCharges }
        );
      }
    }
    if (!u.summary.broken) {
      u.setTriggers.forEach((trig, i) => {
        fireTrigger(trig, `set:${i}:${trig.on}`, { defId: `set:${i}`, level: 1, vfx: { archetype: 'stun-stars', color: '#a8e6ff', scale: 0.4 } }, `set:${i}:${trig.on}`);
      });
    }
  }
  private triggerCooldowns = new Map<string, number>();

  private itemTriggers(it: ItemState, base: TriggerSpec[] = []): TriggerSpec[] {
    const affixTriggers = (it.affixes ?? [])
      .map((affix) => affixDef(affix.affixId).trigger)
      .filter((trigger): trigger is TriggerSpec => !!trigger);
    return [...base, ...affixTriggers];
  }

  // ---------- projectiles ----------

  spawnProjectile(caster: Unit, ctx: EffectCtx, spec: ProjectileSpec, to: { targetUid?: number; toPoint?: Vec2 }): void {
    const speed = typeof spec.speed === 'number' ? spec.speed : levelArr(ctx.values?.[spec.speed], ctx.level, 900);
    const range = typeof spec.range === 'number' ? spec.range : spec.range ? levelArr(ctx.values?.[spec.range], ctx.level, 1500) : 3000;
    const width = typeof spec.width === 'number' ? spec.width : spec.width ? levelArr(ctx.values?.[spec.width], ctx.level, 100) : 100;
    const p: Projectile = {
      pid: this.pidSeq++,
      casterUid: caster.uid,
      team: caster.team,
      pos: { ...caster.pos },
      speed,
      model: spec.model,
      targetUid: spec.model === 'homing' ? to.targetUid : undefined,
      travelled: 0,
      range,
      width,
      bouncesLeft: spec.bounces ? Math.round(typeof spec.bounces.count === 'number' ? spec.bounces.count : levelArr(ctx.values?.[spec.bounces.count], ctx.level, 0)) : 0,
      bounceRadius: spec.bounces ? (typeof spec.bounces.radius === 'number' ? spec.bounces.radius : levelArr(ctx.values?.[spec.bounces.radius], ctx.level, 600)) : 0,
      hitUids: [],
      onHit: spec.onHit,
      ctx,
      disjointable: spec.disjointable ?? spec.model === 'homing',
      hitsAllies: spec.hitsAllies ?? false,
      dead: false
    };
    if (spec.model === 'linear') {
      const aim = to.toPoint ?? (to.targetUid !== undefined ? this.unit(to.targetUid)?.pos : undefined);
      const dir = aim ? norm(sub(aim, caster.pos)) : norm({ x: Math.cos(caster.facing), y: Math.sin(caster.facing) });
      p.dir = dir.x === 0 && dir.y === 0 ? { x: 1, y: 0 } : dir;
    }
    this.projectiles.push(p);
    this.events.emit({
      t: 'projectile-spawn',
      pid: p.pid,
      from: { ...p.pos },
      vfx: ctx.vfx,
      targetUid: p.targetUid,
      toPoint: to.toPoint ? { ...to.toPoint } : undefined
    });
  }

  spawnAttackProjectile(attacker: Unit, target: Unit, speed: number): void {
    const p: Projectile = {
      pid: this.pidSeq++,
      casterUid: attacker.uid,
      team: attacker.team,
      pos: { ...attacker.pos },
      speed,
      model: 'homing',
      targetUid: target.uid,
      travelled: 0,
      range: 5000,
      width: 0,
      bouncesLeft: 0,
      bounceRadius: 0,
      hitUids: [],
      onHit: [],
      ctx: { defId: 'attack', level: 1, vfx: { archetype: 'projectile', color: '#ffd27f', scale: 0.5 } },
      disjointable: false, // attack projectiles always land (DECISIONS)
      hitsAllies: false,
      attackPayload: { attackerUid: attacker.uid },
      dead: false
    };
    this.projectiles.push(p);
    this.events.emit({ t: 'projectile-spawn', pid: p.pid, from: { ...p.pos }, vfx: p.ctx.vfx, targetUid: target.uid });
  }

  disjointProjectiles(targetUid: number): void {
    for (const p of this.projectiles) {
      if (!p.dead && p.disjointable && p.targetUid === targetUid) {
        p.dead = true;
        this.events.emit({ t: 'projectile-expire', pid: p.pid, pos: { ...p.pos } });
      }
    }
  }

  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const caster = this.byUid.get(p.casterUid);

      if (p.model === 'homing') {
        const target = this.byUid.get(p.targetUid ?? -1);
        if (!target || (!target.alive && !p.attackPayload)) {
          p.dead = true;
          this.events.emit({ t: 'projectile-expire', pid: p.pid, pos: { ...p.pos } });
          continue;
        }
        if (!target.alive && p.attackPayload) {
          p.dead = true;
          this.events.emit({ t: 'projectile-expire', pid: p.pid, pos: { ...p.pos } });
          continue;
        }
        const d = dist(p.pos, target.pos);
        const step = p.speed * this.dt;
        if (d <= step + TUNING.projectileHitRadius + target.radius * 0.5) {
          p.pos = { ...target.pos };
          this.projectileImpact(p, target, caster);
        } else {
          const dir = norm(sub(target.pos, p.pos));
          p.pos.x += dir.x * step;
          p.pos.y += dir.y * step;
        }
      } else {
        // linear skillshot
        const step = p.speed * this.dt;
        const from = { ...p.pos };
        p.pos.x += (p.dir?.x ?? 1) * step;
        p.pos.y += (p.dir?.y ?? 0) * step;
        p.travelled += step;
        // first unit hit along the swept segment
        let hit: Unit | null = null;
        let hitD = Infinity;
        const mid = v2((from.x + p.pos.x) / 2, (from.y + p.pos.y) / 2);
        const broadRadius = dist(from, p.pos) / 2 + p.width / 2 + 72;
        this.forEachNearbyUnit(mid, broadRadius, (u) => {
          if (!u.alive || u.uid === p.casterUid || u.kind === 'npc') return;
          if (!p.hitsAllies && u.team === p.team) return;
          if (u.summary.untargetable || u.summary.invulnerable) return;
          if (p.hitUids.includes(u.uid)) return;
          const segD = segPointDist(from, p.pos, u.pos);
          if (segD <= p.width / 2 + u.radius) {
            const along = dist(from, u.pos);
            if (along < hitD) {
              hitD = along;
              hit = u;
            }
          }
        });
        if (hit) {
          const impactTarget = hit as Unit;
          p.pos = { ...impactTarget.pos };
          this.projectileImpact(p, impactTarget, caster);
        } else if (p.travelled >= p.range) {
          p.dead = true;
          this.events.emit({ t: 'projectile-expire', pid: p.pid, pos: { ...p.pos } });
        }
      }
    }
    let write = 0;
    for (let read = 0; read < this.projectiles.length; read++) {
      const p = this.projectiles[read];
      if (!p.dead) this.projectiles[write++] = p;
    }
    this.projectiles.length = write;
  }

  private projectileImpact(p: Projectile, target: Unit, caster: Unit | undefined): void {
    this.events.emit({ t: 'projectile-hit', pid: p.pid, pos: { ...p.pos }, targetUid: target.uid });
    p.hitUids.push(target.uid);

    if (p.attackPayload) {
      const attacker = this.byUid.get(p.attackPayload.attackerUid);
      if (attacker && attacker.alive && target.alive) {
        attackImpact(this, attacker, target);
      }
      p.dead = true;
      return;
    }

    if (caster && caster.alive) {
      execEffects(this, caster, p.ctx, p.onHit, { target, point: { ...target.pos } });
    } else if (caster) {
      execEffects(this, caster, p.ctx, p.onHit, { target, point: { ...target.pos } });
    }

    // bounces (Chain Frost)
    if (p.bouncesLeft > 0) {
      const next = this.nearestUnit(target.pos, p.bounceRadius, (u) => {
        return u.alive && u.team !== p.team && u.kind !== 'npc' && u.uid !== target.uid && !u.summary.untargetable;
      });
      if (next) {
        p.bouncesLeft--;
        p.targetUid = next.uid;
        if (p.hitUids.length > 6) p.hitUids.splice(0, p.hitUids.length - 6); // allow re-bouncing in small groups
        return;
      }
    }
    p.dead = true;
  }

  // ---------- zones ----------

  addZone(args: {
    caster: Unit;
    ctx: EffectCtx;
    spec: ZoneSpec;
    duration: number;
    pos?: Vec2;
    radius?: number;
    a?: Vec2;
    b?: Vec2;
    width?: number;
    followUid?: number;
  }): Zone {
    const { caster, ctx, spec } = args;
    const z: Zone = {
      zid: this.zidSeq++,
      casterUid: caster.uid,
      team: caster.team,
      shape: spec.shape,
      pos: args.pos,
      radius: args.radius,
      a: args.a,
      b: args.b,
      width: args.width ?? 100,
      wall: !!spec.wall,
      until: this.time + args.duration,
      followUid: args.followUid,
      tickInterval: spec.tick?.interval,
      nextTickAt: this.time + (spec.tick?.interval ?? 0.5),
      tickEffects: spec.tick?.effects,
      tickAffects: spec.tick?.affects,
      auraMods: spec.auraMods
        ? {
            affects: spec.auraMods.affects,
            mods: Object.fromEntries(
              Object.entries(spec.auraMods.mods).map(([k, v]) => [k, typeof v === 'number' ? v : levelArr(ctx.values?.[v], ctx.level)])
            )
          }
        : undefined,
      onEnter: spec.onEnter,
      entered: [],
      ctx,
      createdAt: this.time
    };
    this.zones.push(z);
    const center = z.pos ?? (z.a && z.b ? v2((z.a.x + z.b.x) / 2, (z.a.y + z.b.y) / 2) : caster.pos);
    this.events.emit({
      t: 'zone-spawn',
      zid: z.zid,
      pos: { ...center },
      spec: {
        shape: z.shape,
        radius: z.radius ?? 0,
        length: z.a && z.b ? dist(z.a, z.b) : 0,
        width: z.width,
        angle: z.a && z.b ? angleOf(sub(z.b, z.a)) : 0,
        wall: z.wall,
        duration: args.duration,
        followUid: z.followUid
      },
      vfx: ctx.vfx
    });
    return z;
  }

  private zoneContains(z: Zone, u: Unit): boolean {
    if (z.shape === 'circle') {
      if (!z.pos) return false;
      const r = (z.radius ?? 0) + u.radius * 0.5;
      return dist2(u.pos, z.pos) <= r * r;
    }
    return z.a !== undefined && z.b !== undefined && segPointDist(z.a, z.b, u.pos) <= z.width / 2 + u.radius * 0.5;
  }

  private forEachZoneCandidate(z: Zone, fn: (u: Unit) => void): void {
    if (z.shape === 'circle' && z.pos) {
      this.forEachNearbyUnit(z.pos, (z.radius ?? 0) + 72, fn);
      return;
    }
    if (z.shape === 'line' && z.a && z.b) {
      const mid = v2((z.a.x + z.b.x) / 2, (z.a.y + z.b.y) / 2);
      this.forEachNearbyUnit(mid, dist(z.a, z.b) / 2 + z.width / 2 + 72, fn);
    }
  }

  private updateZones(): void {
    for (const z of this.zones) {
      if (z.followUid !== undefined) {
        const f = this.byUid.get(z.followUid);
        if (f && f.alive && z.pos) {
          z.pos.x = f.pos.x;
          z.pos.y = f.pos.y;
        } else {
          z.until = Math.min(z.until, this.time); // follow source died: zone ends
        }
      }
      const caster = this.byUid.get(z.casterUid);
      const affectsMatch = (u: Unit, mode: 'enemies' | 'allies' | 'all'): boolean => {
        if (mode === 'all') return true;
        return mode === 'enemies' ? u.team !== z.team : u.team === z.team;
      };

      // on-enter (windowSec limits it to the zone's opening moments — Fissure's initial stun)
      if (z.onEnter && caster) {
        const window = z.onEnter.windowSec;
        const inWindow = window === undefined || this.time <= z.createdAt + window;
        if (inWindow) {
          this.forEachZoneCandidate(z, (u) => {
            if (!u.alive || u.kind === 'npc') return;
            if (!affectsMatch(u, z.onEnter!.affects)) return;
            if (!this.zoneContains(z, u)) return;
            if (z.entered.includes(u.uid)) return;
            z.entered.push(u.uid);
            execEffects(this, caster, z.ctx, z.onEnter!.effects, { target: u, point: { ...u.pos } });
          });
        }
      }

      // periodic tick
      if (z.tickEffects && z.tickInterval && caster) {
        while (z.nextTickAt <= this.time && this.time < z.until + 1e-9) {
          this.forEachZoneCandidate(z, (u) => {
            if (!u.alive || u.kind === 'npc') return;
            if (!affectsMatch(u, z.tickAffects ?? 'enemies')) return;
            if (!this.zoneContains(z, u)) return;
            execEffects(this, caster, z.ctx, z.tickEffects!, { target: u, point: { ...u.pos } });
          });
          z.nextTickAt += z.tickInterval;
        }
      }

      // aura mods (applied as short statuses, refreshed below in aura pass)
      if (z.auraMods) {
        const auraMods = z.auraMods;
        this.forEachZoneCandidate(z, (u) => {
          if (!u.alive || u.kind === 'npc') return;
          if (!affectsMatch(u, auraMods.affects)) return;
          if (!this.zoneContains(z, u)) return;
          const inst = {
            status: 'buff' as StatusId,
            tag: `zone:${z.zid}`,
            sourceUid: z.casterUid,
            sourceTeam: z.team,
            until: this.time + 0.6,
            isDebuff: auraMods.affects === 'enemies',
            mods: auraMods.mods
          };
          u.addStatus(inst, true);
        });
      }
    }
    let write = 0;
    for (let read = 0; read < this.zones.length; read++) {
      const z = this.zones[read];
      if (this.time >= z.until) {
        this.events.emit({ t: 'zone-expire', zid: z.zid });
      } else {
        this.zones[write++] = z;
      }
    }
    this.zones.length = write;
  }

  // ---------- repeaters (Omnislash / Chain Frost-style sequences) ----------

  addRepeater(r: Repeater): void {
    this.repeaters.push(r);
  }

  private updateRepeaters(): void {
    for (const r of this.repeaters) {
      const caster = this.byUid.get(r.casterUid);
      if (!caster || !caster.alive) {
        r.remaining = 0;
        continue;
      }
      while (r.remaining > 0 && r.nextAt <= this.time) {
        let target: Unit | undefined = r.targetUid !== undefined ? this.byUid.get(r.targetUid) : undefined;
        if (r.retarget === 'random-enemy-in-radius') {
          const list = this.unitsInRadius(caster.pos, r.radius, (u) => u.team !== caster.team && !u.summary.untargetable && u.kind !== 'npc');
          if (list.length === 0) {
            r.remaining = 0;
            break;
          }
          target = list[this.rng.int(0, list.length - 1)];
        }
        if (target && !target.alive) target = undefined;
        execEffects(this, caster, r.ctx, r.effects, { target, point: r.point ?? target?.pos });
        r.remaining--;
        r.nextAt += r.interval;
      }
    }
    let write = 0;
    for (let read = 0; read < this.repeaters.length; read++) {
      const r = this.repeaters[read];
      if (r.remaining > 0) this.repeaters[write++] = r;
    }
    this.repeaters.length = write;
  }

  // ---------- statuses / auras / regen ----------

  applyStatusFromSpec(
    caster: Unit,
    target: Unit,
    status: string,
    duration: number,
    params: unknown,
    ctx: EffectCtx
  ): void {
    applyStatus(this, caster, target, status as StatusId, duration, params as StatusParams | undefined, ctx);
  }

  private updateStatuses(): void {
    for (const u of this.unitsArr) {
      if (!u.alive) continue;
      const expired = u.removeStatusWhere((s) => this.time >= s.until);
      for (const s of expired) this.events.emit({ t: 'status-expire', uid: u.uid, status: s.status });
      for (const element of Object.keys(u.elementAuras) as (keyof typeof u.elementAuras)[]) {
        if ((u.elementAuras[element]?.until ?? 0) <= this.time) delete u.elementAuras[element];
      }

      for (const s of u.statuses) {
        // DoTs tick at 2 Hz to keep events readable
        if (s.dotDps) {
          const sd = s as typeof s & { nextDotAt?: number };
          if (sd.nextDotAt === undefined) sd.nextDotAt = this.time + 0.5;
          while (sd.nextDotAt <= this.time) {
            const src = this.byUid.get(s.sourceUid) ?? null;
            applyDamage(this, src, u, s.dotDps * 0.5, s.dotType ?? 'magical', { noTriggers: false });
            sd.nextDotAt += 0.5;
          }
        }
        // periodic composite effects (Frost Shield pulses)
        if (s.periodic) {
          const ectx = (s as typeof s & { ectx?: EffectCtx }).ectx;
          while (s.periodic.nextAt <= this.time) {
            const src = this.byUid.get(s.sourceUid);
            if (src && ectx) {
              execEffects(this, src, ectx, s.periodic.effects, { target: u, point: { ...u.pos } });
            }
            s.periodic.nextAt += s.periodic.interval;
          }
        }
      }
    }
  }

  private updateAuras(): void {
    if (this.time < this.auraNextAt) return;
    this.auraNextAt = this.time + 0.5;
    for (const u of this.unitsArr) {
      if (!u.alive) continue;
      // hero/creep aura abilities
      for (const a of u.abilities) {
        if (a.level <= 0 || !a.def.aura || u.summary.broken) continue;
        this.applyAura(u, `aura:${u.uid}:${a.def.id}`, a.def.aura.radius, a.def.aura.affects, resolveAuraMods(a.def, a.level), a.def.aura.excludeSelf);
      }
      // item auras: all six slots apply (SPEC §5)
      for (const it of u.items) {
        if (!it) continue;
        const def = REG.items.get(it.defId);
        if (def?.aura) {
          const mods: Record<string, number> = {};
          for (const k in def.aura.mods ?? {}) mods[k] = def.aura.mods![k] as number;
          this.applyAura(u, `aura:${u.uid}:item:${def.id}`, def.aura.radius, def.aura.affects, mods, def.aura.excludeSelf);
        }
        for (const affix of it.affixes ?? []) {
          const aura = affixDef(affix.affixId).aura;
          if (!aura) continue;
          const mods: Record<string, number> = {};
          for (const k in aura.mods ?? {}) mods[k] = aura.mods![k] as number;
          this.applyAura(u, `aura:${u.uid}:affix:${affix.affixId}`, aura.radius, aura.affects, mods, aura.excludeSelf);
        }
      }
      // set-bonus auras (ITEM_REHAUL §7)
      u.setAuras.forEach((aura, i) => {
        if (u.summary.broken) return;
        const mods: Record<string, number> = {};
        for (const k in aura.mods ?? {}) mods[k] = aura.mods![k] as number;
        this.applyAura(u, `aura:${u.uid}:set:${i}`, aura.radius, aura.affects, mods, aura.excludeSelf);
      });
    }
  }

  private applyAura(
    source: Unit,
    tag: string,
    radius: number | 'global',
    affects: 'allies' | 'enemies',
    mods: Record<string, number>,
    excludeSelf?: boolean
  ): void {
    const r = radius === 'global' ? Number.MAX_SAFE_INTEGER / 2 : radius;
    const applyTo = (u: Unit): void => {
      if (!u.alive || u.kind === 'npc') return;
      if (excludeSelf && u === source) return;
      const isAlly = u.team === source.team;
      if (affects === 'allies' && !isAlly) return;
      if (affects === 'enemies' && isAlly) return;
      if (radius !== 'global' && dist2(u.pos, source.pos) > r * r) return;
      u.addStatus(
        {
          status: 'buff',
          tag,
          sourceUid: source.uid,
          sourceTeam: source.team,
          until: this.time + 0.7,
          isDebuff: affects === 'enemies',
          mods
        },
        true
      );
    };
    if (radius === 'global') {
      for (const u of this.unitsArr) applyTo(u);
    } else {
      this.forEachNearbyUnit(source.pos, r + 64, applyTo);
    }
  }

  private updateRegenAndLifetimes(): void {
    for (const u of this.unitsArr) {
      if (!u.alive) continue;
      const s = u.stats;
      u.hp = Math.min(s.maxHp, u.hp + (s.hpRegen + (s.maxHp * s.hpRegenPctMax) / 100) * this.dt);
      u.mana = Math.min(s.maxMana, u.mana + (s.manaRegen + (s.maxMana * s.manaRegenPctMax) / 100) * this.dt);
      if (u.lifetimeUntil !== undefined && this.time >= u.lifetimeUntil) {
        this.killUnit(u, null, true);
      }
    }
    // sweep corpses
    for (let i = this.unitsArr.length - 1; i >= 0; i--) {
      const u = this.unitsArr[i];
      if (!u.alive && u.removeAt > 0 && this.time >= u.removeAt) this.removeUnit(u.uid);
    }
  }

  // ---------- death ----------

  killUnit(victim: Unit, killer: Unit | null, silent = false): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.diedAt = this.time;
    victim.removeAt = this.time + (victim.kind === 'hero' ? -1 : 3); // heroes linger for respawn logic upstream
    if (victim.kind === 'hero') victim.removeAt = -1;
    victim.statuses = [];
    victim.elementAuras = {};
    victim.channel = null;
    victim.cast = null;
    victim.forced = [];
    this.spatialDirty = true;
    if (victim.captureCh) this.interruptCapture(victim, 'death');
    // anyone capturing this unit gets interrupted
    for (const u of this.unitsArr) {
      if (u.captureCh && u.captureCh.targetUid === victim.uid) this.interruptCapture(u, 'target-died');
    }

    this.events.emit({ t: 'death', uid: victim.uid, killer: killer?.uid ?? -1 });
    if (!silent && killer && killer.team !== victim.team) {
      this.events.emit({
        t: 'kill-credit',
        victimUid: victim.uid,
        killerUid: killer.uid,
        bounty: { ...victim.bounty },
        lastHitByPlayer: killer.uid === this.playerActiveUid
      });
      this.runTriggers(killer, 'on-kill', { other: victim });
      if (killer.heroId) emitBark(this, killer); // a hero crows over a kill (§3.13), rate-limited
    }
    // on-nearby-death triggers (Flesh Heap, Urn/Vessel): broadphase first,
    // runTriggers still checks each trigger's exact radius.
    this.forEachNearbyUnit(victim.pos, 1500, (u) => {
      if (!u.alive || u === victim) return;
      this.runTriggers(u, 'on-nearby-death', { other: victim });
    });
  }

  /**
   * Revive a fallen unit in place (Aegis of the Immortal, Reincarnation). Restores hp/mana,
   * clears statuses and in-flight actions, and re-enters the spatial index next tick.
   * Returns false if the unit is already alive or has been swept from the sim.
   */
  reviveUnit(u: Unit, hpPct = 1, manaPct = 1): boolean {
    if (u.alive || !this.byUid.has(u.uid)) return false;
    u.alive = true;
    u.diedAt = -1;
    u.removeAt = -1;
    u.statuses = [];
    u.elementAuras = {};
    u.cast = null;
    u.channel = null;
    u.forced = [];
    u.order = { kind: 'stop' };
    u.windupUntil = -1;
    u.attackTargetUid = -1;
    u.markStatsDirty();
    u.refresh(this.time);
    u.hp = Math.max(1, Math.round(u.stats.maxHp * hpPct));
    u.mana = Math.round(u.stats.maxMana * manaPct);
    this.spatialDirty = true;
    this.events.emit({ t: 'revive', uid: u.uid, pos: { ...u.pos } });
    return true;
  }

  // ---------- main tick ----------

  tick(): void {
    this.time += this.dt;
    this.tickCount++;

    for (const u of this.unitsArr) {
      u.prevPos.x = u.pos.x;
      u.prevPos.y = u.pos.y;
    }
    this.ensureSpatial();

    this.updateStatuses();
    for (const u of this.unitsArr) {
      if (u.alive) u.refresh(this.time);
      // charge regeneration
      for (const a of u.abilities) {
        if (a.charges >= 0 && a.level > 0) {
          const max = levelArr(a.def.values?.charges, a.level, 1);
          if (a.charges < max && this.time >= a.nextChargeAt) {
            a.charges++;
            const rt = levelArr(a.def.values?.chargeRestoreTime, a.level, levelArr(a.def.cooldown, a.level, 10));
            a.nextChargeAt = this.time + rt * TUNING.cooldownScale;
          }
        }
      }
    }

    for (const u of this.unitsArr) thinkUnit(this, u);
    for (const u of this.unitsArr) updateUnitActions(this, u, this.dt);
    this.rebuildSpatial();

    this.updateProjectiles();
    this.updateZones();
    this.updateRepeaters();
    this.updateAuras();
    this.updateRegenAndLifetimes();
  }

  /** Run N seconds of simulation (tests). */
  run(seconds: number): void {
    const ticks = Math.round(seconds / this.dt);
    for (let i = 0; i < ticks; i++) this.tick();
  }

  /** Deterministic state fingerprint for sim equality tests. */
  hash(): string {
    let h = 2166136261;
    const mix = (n: number) => {
      h ^= Math.round(n * 8) & 0xffff;
      h = Math.imul(h, 16777619);
    };
    for (const u of this.unitsArr) {
      mix(u.uid);
      mix(u.pos.x);
      mix(u.pos.y);
      mix(u.hp);
      mix(u.mana);
      mix(u.alive ? 1 : 0);
    }
    mix(this.projectiles.length);
    mix(this.zones.length);
    return (h >>> 0).toString(16);
  }
}

function segPointDist(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

function resolveAuraMods(def: { values?: Record<string, number[]>; aura?: { mods?: Record<string, number | string> } }, level: number): Record<string, number> {
  const out: Record<string, number> = {};
  const mods = def.aura?.mods ?? {};
  for (const k in mods) {
    const v = mods[k];
    out[k] = typeof v === 'number' ? v : levelArr(def.values?.[v], level);
  }
  return out;
}
