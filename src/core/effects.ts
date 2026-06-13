import { clamp, dist, fromAngle, norm, sub, v2 } from './math2d';
import { applyDamage, healUnit } from './combat';
import { REG } from './registry';
import { STATUS_META, statusTagAuto, type StatusInstance } from './status';
import type { Unit } from './unit';
import type { EffectNode, ElementId, StatusId, StatusParams, TargetSel, ValueRef, Vec2, VfxSpec } from './types';
import { resolveVal } from './values';
import type { Sim } from './sim';

export interface EffectCtx {
  defId: string;
  values?: Record<string, number[]>;
  level: number;
  piercesImmunity?: boolean;
  element?: ElementId;
  vfx: VfxSpec;
  /** charges consumed by this activation (Magic Wand) */
  chargeCount?: number;
}

export interface EffectPrimary {
  target?: Unit;
  point?: Vec2;
}

const FALLBACK_VFX: VfxSpec = { archetype: 'ground-aoe', color: '#ffffff' };

export function execEffects(sim: Sim, caster: Unit, ctx: EffectCtx, effects: EffectNode[], primary: EffectPrimary): void {
  for (const node of effects) {
    execNode(sim, caster, ctx, node, primary);
  }
}

function V(ctx: EffectCtx, ref: ValueRef | undefined, fallback = 0): number {
  return resolveVal(ref, ctx.values, ctx.level, fallback);
}

function centerOf(caster: Unit, primary: EffectPrimary): Vec2 {
  return primary.point ?? primary.target?.pos ?? caster.pos;
}

function selectUnits(sim: Sim, caster: Unit, ctx: EffectCtx, sel: TargetSel, radiusRef: ValueRef | undefined, primary: EffectPrimary): Unit[] {
  const radius = V(ctx, radiusRef, 0);
  switch (sel) {
    case 'target':
      return primary.target && primary.target.alive ? [primary.target] : [];
    case 'self':
      return caster.alive ? [caster] : [];
    case 'point':
      return [];
    case 'enemies-in-radius': {
      const c = centerOf(caster, primary);
      return sim.unitsInRadius(c, radius, (u) => u.team !== caster.team && !u.summary.invulnerable);
    }
    case 'allies-in-radius': {
      const c = centerOf(caster, primary);
      return sim.unitsInRadius(c, radius, (u) => u.team === caster.team);
    }
    case 'units-in-radius': {
      const c = centerOf(caster, primary);
      return sim.unitsInRadius(c, radius, (u) => !u.summary.invulnerable);
    }
    case 'random-enemy-in-radius': {
      const list = sim.unitsInRadius(caster.pos, radius, (u) => u.team !== caster.team && !u.summary.invulnerable && !u.summary.untargetable);
      if (list.length === 0) return [];
      return [list[sim.rng.int(0, list.length - 1)]];
    }
    case 'lowest-hp-ally-in-radius': {
      const list = sim.unitsInRadius(caster.pos, radius, (u) => u.team === caster.team);
      if (list.length === 0) return [];
      let best = list[0];
      for (const u of list) if (u.hp / u.stats.maxHp < best.hp / best.stats.maxHp) best = u;
      return [best];
    }
  }
}

function execNode(sim: Sim, caster: Unit, ctx: EffectCtx, node: EffectNode, primary: EffectPrimary): void {
  switch (node.kind) {
    case 'damage': {
      let effPrimary = primary;
      if (node.offsetRing) {
        // Freezing Field: explosion centered at a random ring point around the primary center
        const base = centerOf(caster, primary);
        const ang = sim.rng.range(0, Math.PI * 2);
        const r = sim.rng.range(V(ctx, node.offsetRing.min), V(ctx, node.offsetRing.max));
        effPrimary = { ...primary, point: v2(base.x + Math.cos(ang) * r, base.y + Math.sin(ang) * r), target: undefined };
      }
      const units = selectUnits(sim, caster, ctx, node.target, node.radius, effPrimary);
      let amount = V(ctx, node.amount);
      if (node.attackDamagePct) amount += caster.stats.damage * (V(ctx, node.attackDamagePct) / 100);
      if (node.perUnitBonus) {
        const c = centerOf(caster, effPrimary);
        const r = V(ctx, node.radius, 0);
        const nearby = sim.unitsInRadius(c, r, (u) => u.team !== caster.team).length;
        amount += V(ctx, node.perUnitBonus) * nearby;
      }
      if ((node.target === 'enemies-in-radius' || node.target === 'units-in-radius') && node.radius) {
        sim.events.emit({ t: 'aoe-burst', pos: centerOf(caster, effPrimary), radius: V(ctx, node.radius, 0), vfx: ctx.vfx });
      }
      for (const u of units) applyDamage(sim, caster, u, amount, node.dtype, { element: ctx.element });
      break;
    }
    case 'heal': {
      const units = selectUnits(sim, caster, ctx, node.target, node.radius, primary);
      for (const u of units) {
        let amount = node.pctMaxHp ? u.stats.maxHp * (V(ctx, node.amount) / 100) : V(ctx, node.amount);
        if (node.perCharge) amount *= ctx.chargeCount ?? 0;
        healUnit(sim, u, amount);
      }
      break;
    }
    case 'mana': {
      const units = selectUnits(sim, caster, ctx, node.target, node.radius, primary);
      let amount = V(ctx, node.amount);
      if (node.perCharge) amount *= ctx.chargeCount ?? 0;
      for (const u of units) {
        if (node.op === 'restore') {
          u.mana = Math.min(u.stats.maxMana, u.mana + amount);
        } else {
          const burned = Math.min(u.mana, amount);
          u.mana -= burned;
          if (node.burnedAsDamagePct && burned > 0) {
            applyDamage(sim, caster, u, burned * (node.burnedAsDamagePct / 100), 'magical');
          }
        }
      }
      break;
    }
    case 'status': {
      const units = selectUnits(sim, caster, ctx, node.target, node.radius, primary);
      const duration = V(ctx, node.duration);
      for (const u of units) {
        applyStatus(sim, caster, u, node.status, duration, node.params, ctx);
      }
      break;
    }
    case 'displace': {
      const units = selectUnits(sim, caster, ctx, node.target, node.radius, primary);
      for (const u of units) execDisplace(sim, caster, ctx, node, u, primary);
      break;
    }
    case 'zone': {
      spawnZoneNode(sim, caster, ctx, node, primary);
      break;
    }
    case 'summon': {
      const count = Math.max(1, Math.round(V(ctx, node.count, 1)));
      const at = node.at === 'point' ? centerOf(caster, primary) : caster.pos;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + 0.7;
        const pos = v2(at.x + Math.cos(ang) * 60, at.y + Math.sin(ang) * 60);
        sim.spawnSummon(node.summon, caster, pos, ctx);
      }
      break;
    }
    case 'statmod': {
      const units = selectUnits(sim, caster, ctx, node.target, node.radius, primary);
      const duration = V(ctx, node.duration);
      const mods: Record<string, number> = {};
      for (const k in node.mods) mods[k] = V(ctx, node.mods[k]);
      for (const u of units) {
        applyStatus(sim, caster, u, 'buff', duration, { mods: mods as Record<string, ValueRef> }, ctx);
      }
      break;
    }
    case 'projectile': {
      sim.spawnProjectile(caster, ctx, node.proj, {
        targetUid: node.to === 'target' ? primary.target?.uid : undefined,
        toPoint: node.to === 'point' ? (primary.point ?? primary.target?.pos) : undefined
      });
      break;
    }
    case 'repeat': {
      sim.addRepeater({
        casterUid: caster.uid,
        remaining: Math.max(1, Math.round(V(ctx, node.count, 1))),
        interval: node.interval,
        nextAt: sim.time, // first iteration fires this tick
        effects: node.effects,
        retarget: node.retarget,
        radius: V(ctx, node.radius, 0),
        ctx,
        targetUid: primary.target?.uid,
        point: primary.point ? { ...primary.point } : undefined
      });
      break;
    }
    case 'capture-channel': {
      // handled at order level (sim.orderCapture); nothing to do here
      break;
    }
    case 'purge': {
      const units = selectUnits(sim, caster, ctx, node.target, undefined, primary);
      for (const u of units) {
        const removeDebuffs = u.team === caster.team;
        const removed = u.dispel(removeDebuffs);
        for (const r of removed) sim.events.emit({ t: 'status-expire', uid: u.uid, status: r.status });
      }
      break;
    }
    case 'exotic': {
      const impl = REG.exotics.get(node.id);
      if (!impl) throw new Error(`exotic not registered: ${node.id}`);
      impl({ sim, caster, ctx, primary, params: node.params });
      break;
    }
  }
}

function execDisplace(
  sim: Sim,
  caster: Unit,
  ctx: EffectCtx,
  node: Extract<EffectNode, { kind: 'displace' }>,
  u: Unit,
  primary: EffectPrimary
): void {
  const distance = V(ctx, node.distance, 0);
  switch (node.mode) {
    case 'blink': {
      let dest: Vec2;
      if (node.toward === 'target-unit' && primary.target) {
        const t = primary.target;
        const off = norm(sub(u.pos, t.pos));
        const gap = t.radius + u.radius + 10;
        dest = v2(t.pos.x + off.x * gap, t.pos.y + off.y * gap);
      } else {
        const want = primary.point ?? centerOf(caster, primary);
        const d = dist(u.pos, want);
        const max = distance > 0 ? distance : Infinity;
        // Dota rule: overshooting clamps to 4/5 of max blink range
        const allowed = d <= max ? d : max * 0.8;
        const dir = d > 1e-4 ? norm(sub(want, u.pos)) : fromAngle(u.facing);
        dest = v2(u.pos.x + dir.x * allowed, u.pos.y + dir.y * allowed);
      }
      dest.x = clamp(dest.x, u.radius, sim.bounds.w - u.radius);
      dest.y = clamp(dest.y, u.radius, sim.bounds.h - u.radius);
      const from = { ...u.pos };
      u.pos = dest;
      u.prevPos = { ...dest };
      sim.disjointProjectiles(u.uid);
      sim.events.emit({ t: 'blink', uid: u.uid, from, to: { ...dest } });
      break;
    }
    case 'knockback': {
      let dir: Vec2;
      if (node.toward === 'away-from-caster') dir = norm(sub(u.pos, caster.pos));
      else if (node.toward === 'point' && primary.point) dir = norm(sub(primary.point, u.pos));
      else dir = norm(sub(u.pos, caster.pos));
      if (dir.x === 0 && dir.y === 0) dir = fromAngle(caster.facing);
      const speed = V(ctx, node.speed, Math.max(600, distance / 0.4));
      u.forced.push({ kind: 'knockback', dir, speed, until: sim.time + distance / speed });
      break;
    }
    case 'pull': {
      const speed = V(ctx, node.speed, 1200);
      u.forced.push({
        kind: 'pull',
        dir: v2(0, 0),
        speed,
        until: sim.time + 5,
        pullToUid: caster.uid,
        stopAtDist: caster.radius + u.radius + 16
      });
      break;
    }
    case 'forced': {
      let dir: Vec2;
      switch (node.toward) {
        case 'caster':
          dir = norm(sub(caster.pos, u.pos));
          break;
        case 'facing':
          dir = fromAngle(u.facing);
          break;
        case 'point':
          dir = primary.point ? norm(sub(primary.point, u.pos)) : fromAngle(u.facing);
          break;
        case 'away-from-caster':
          dir = norm(sub(u.pos, caster.pos));
          break;
        default:
          dir = fromAngle(u.facing);
      }
      const speed = V(ctx, node.speed, Math.max(400, distance / 0.5));
      u.forced.push({ kind: 'forced', dir, speed, until: sim.time + (distance > 0 ? distance / speed : 0.4) });
      break;
    }
  }
}

/** Status-carried attack mods are resolved to plain numbers at apply time. */
function resolveAttackMod(spec: import('./types').AttackModSpec, ctx: EffectCtx): import('./types').AttackModSpec {
  const r = (v: ValueRef | undefined) => (v === undefined ? undefined : resolveVal(v, ctx.values, ctx.level));
  return {
    critChance: r(spec.critChance),
    critMult: r(spec.critMult),
    procChance: r(spec.procChance),
    procDamage: r(spec.procDamage),
    procStatus: spec.procStatus,
    manaBurnPerHit: r(spec.manaBurnPerHit),
    manaBurnAsDamagePct: spec.manaBurnAsDamagePct,
    bonusDamage: r(spec.bonusDamage),
    bonusDamagePct: r(spec.bonusDamagePct),
    lifestealPct: r(spec.lifestealPct),
    cleave: spec.cleave ? { pct: r(spec.cleave.pct)!, radius: r(spec.cleave.radius)! } : undefined
  };
}

export function applyStatus(
  sim: Sim,
  caster: Unit | null,
  target: Unit,
  status: StatusId,
  duration: number,
  params: StatusParams | undefined,
  ctx: EffectCtx
): boolean {
  if (duration <= 0 || !target.alive) return false;
  const meta = STATUS_META[status];
  const casterTeam = caster?.team ?? -1;
  const isDebuff = status === 'buff' ? casterTeam !== target.team : meta.debuff;
  const effectiveDuration = isDebuff
    ? duration * (1 - clamp(target.stats.statusResistPct, 0, 80) / 100)
    : duration;

  const inst: StatusInstance = {
    status,
    tag: params?.tag ?? `${ctx.defId}:${status}`,
    sourceUid: caster?.uid ?? -1,
    sourceTeam: casterTeam,
    until: sim.time + effectiveDuration,
    isDebuff
  };
  if (params) {
    if (params.mods) {
      const mods: Record<string, number> = {};
      for (const k in params.mods) mods[k] = resolveVal(params.mods[k], ctx.values, ctx.level);
      inst.mods = mods;
    }
    if (params.dotDps) {
      inst.dotDps = resolveVal(params.dotDps, ctx.values, ctx.level);
      inst.dotType = params.dotType ?? 'magical';
    }
    if (params.moveSlowPct) inst.moveSlowPct = resolveVal(params.moveSlowPct, ctx.values, ctx.level);
    if (params.attackSlowPct) inst.attackSlowPct = resolveVal(params.attackSlowPct, ctx.values, ctx.level);
    if (params.breakOnDamage) inst.breakOnDamage = true;
    if (params.fadeTime !== undefined) inst.fadeTime = params.fadeTime;
    if (params.periodic) {
      inst.periodic = { interval: params.periodic.interval, effects: params.periodic.effects, nextAt: sim.time + params.periodic.interval };
    }
    if (params.attackMod) inst.attackMod = resolveAttackMod(params.attackMod, ctx);
    if (params.consumeOnAttack) inst.consumeOnAttack = true;
  }
  if (status === 'invis') {
    inst.fadeAt = sim.time + (inst.fadeTime ?? 0.6);
  }
  if (params?.basicDispelOnApply) {
    const removed = target.dispel(true);
    for (const r of removed) sim.events.emit({ t: 'status-expire', uid: target.uid, status: r.status });
  }

  const ok = target.addStatus(inst, ctx.piercesImmunity);
  if (!ok) {
    sim.events.emit({ t: 'immune-block', uid: target.uid });
    return false;
  }

  // store effect context for periodic ticks
  (inst as StatusInstance & { ectx?: EffectCtx }).ectx = ctx;

  if (meta.breaksChannel) sim.interruptActions(target);
  if (status === 'cyclone' || status === 'invis') sim.disjointProjectiles(target.uid);
  if (status === 'hex') sim.interruptActions(target);

  sim.events.emit({ t: 'status-apply', uid: target.uid, status, duration });
  target.refresh(sim.time);
  return true;
}

function spawnZoneNode(sim: Sim, caster: Unit, ctx: EffectCtx, node: Extract<EffectNode, { kind: 'zone' }>, primary: EffectPrimary): void {
  const spec = node.zone;
  const duration = V(ctx, spec.duration);
  if (spec.shape === 'line') {
    const from = { ...caster.pos };
    const point = primary.point ?? primary.target?.pos ?? v2(caster.pos.x + Math.cos(caster.facing), caster.pos.y + Math.sin(caster.facing));
    const dir = norm(sub(point, from));
    const length = V(ctx, spec.length, 800);
    const width = V(ctx, spec.width, 100);
    const a = v2(from.x + dir.x * (caster.radius + 40), from.y + dir.y * (caster.radius + 40));
    const b = v2(a.x + dir.x * length, a.y + dir.y * length);
    sim.addZone({ caster, ctx, spec, duration, a, b, width });
  } else {
    let pos: Vec2;
    if (node.at === 'self') pos = { ...caster.pos };
    else if (node.at === 'target' && primary.target) pos = { ...primary.target.pos };
    else pos = { ...(primary.point ?? caster.pos) };
    sim.addZone({
      caster,
      ctx,
      spec,
      duration,
      pos,
      radius: V(ctx, spec.radius, 300),
      followUid: node.follow ? caster.uid : undefined
    });
  }
}
