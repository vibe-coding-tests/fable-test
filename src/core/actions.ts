import { TUNING } from '../data/tuning';
import { dist, v2 } from './math2d';
import { attackImpact } from './combat';
import { execEffects, type EffectCtx } from './effects';
import { REG } from './registry';
import { cannotAttack, cannotCast, cannotMove, isDisabled } from './status';
import type { Unit } from './unit';
import { faceToward, integrateForcedMoves, steerToward } from './movement';
import { levelArr } from './values';
import type { AbilityDef } from './types';
import type { Sim } from './sim';

// ------------------------------------------------------------------
// Per-unit action state machine: orders -> movement / attacks / casts
// / channels / toggles / capture. Shared by every controller.
// ------------------------------------------------------------------

export function abilityCtx(def: AbilityDef, level: number, defIdPrefix = ''): EffectCtx {
  return {
    defId: defIdPrefix + def.id,
    values: def.values,
    level: Math.max(1, level),
    piercesImmunity: def.piercesImmunity,
    element: def.element,
    vfx: def.vfx
  };
}

export function updateUnitActions(sim: Sim, u: Unit, dt: number): void {
  if (!u.alive) return;
  const now = sim.time;

  // forced movement overrides everything
  if (integrateForcedMoves(sim, u, dt)) return;

  // toggles tick regardless of orders
  updateToggles(sim, u);

  // hard disables: drop windup, stall
  if (isDisabled(u.summary)) {
    u.windupUntil = -1;
    return;
  }

  // fear: run from source
  if (u.summary.feared !== null) {
    const src = sim.unit(u.summary.feared);
    if (src) {
      const away = v2(u.pos.x + (u.pos.x - src.pos.x), u.pos.y + (u.pos.y - src.pos.y));
      steerToward(sim, u, away, dt, 10);
    }
    return;
  }

  // taunt: forced basic attacks against the taunter. This matters in raids
  // where Axe-style control should move boss threat, not just block spells.
  if (u.summary.taunted !== null) {
    const src = sim.unit(u.summary.taunted);
    if (src && src.alive && src.team !== u.team && !src.summary.untargetable && src.isVisibleTo(u.team, now)) {
      pursueAndAttack(sim, u, src, dt);
      return;
    }
  }

  // capture channel: stand still, progress
  if (u.captureCh) {
    const target = sim.unit(u.captureCh.targetUid);
    if (!target || !target.alive) {
      sim.interruptCapture(u, 'target-lost');
      return;
    }
    if (dist(u.pos, target.pos) > TUNING.captureRange + 80) {
      sim.interruptCapture(u, 'out-of-range');
      return;
    }
    const total = u.captureCh.until - u.captureCh.startedAt;
    const pct = Math.min(1, (now - u.captureCh.startedAt) / total);
    if (sim.tickCount % 6 === 0) sim.events.emit({ t: 'capture-progress', target: target.uid, pct });
    if (now >= u.captureCh.until) sim.completeCapture(u, target);
    return;
  }

  // ability channel
  if (u.channel) {
    const ch = u.channel;
    const { def, level, ctx } = channelSource(sim, u);
    if (!def) {
      u.channel = null;
      return;
    }
    const target = ch.targetUid !== undefined ? sim.unit(ch.targetUid) : undefined;
    const primary = { target: target && target.alive ? target : undefined, point: ch.point };
    while (ch.nextTickAt <= now && now < ch.until) {
      if (def.channel?.tick) execEffects(sim, u, ctx, def.channel.tick.effects, primary);
      if (def.toggle) break;
      ch.nextTickAt += ch.interval;
    }
    if (now >= ch.until) {
      if (def.channel?.onEnd) execEffects(sim, u, ctx, def.channel.onEnd, primary);
      u.channel = null;
      u.order = { kind: 'stop' };
    }
    void level;
    return;
  }

  // cast point in progress
  if (u.cast) {
    const c = u.cast;
    const target = c.targetUid !== undefined ? sim.unit(c.targetUid) : undefined;
    if (target && target.alive) faceToward(u, target.pos, dt);
    else if (c.point) faceToward(u, c.point, dt);
    if (now >= c.fireAt) {
      u.cast = null;
      fireCast(sim, u, c.source, c.slot, target && target.alive ? target : undefined, c.point);
    }
    return;
  }

  // order dispatch
  switch (u.order.kind) {
    case 'stop':
    case 'hold': {
      autoAcquire(sim, u, dt, u.order.kind === 'hold');
      break;
    }
    case 'move': {
      u.windupUntil = -1;
      if (steerToward(sim, u, u.order.point, dt, Math.max(12, u.radius * 0.5))) {
        u.order = { kind: 'stop' };
      }
      break;
    }
    case 'attack-move': {
      const enemy = nearestEnemy(sim, u, TUNING.attackMoveAcquireRadius);
      if (enemy) {
        pursueAndAttack(sim, u, enemy, dt);
      } else {
        u.windupUntil = -1;
        if (steerToward(sim, u, u.order.point, dt, Math.max(12, u.radius * 0.5))) u.order = { kind: 'stop' };
      }
      break;
    }
    case 'attack-unit': {
      const target = sim.unit(u.order.uid);
      if (!target || !target.alive || target.summary.untargetable || !target.isVisibleTo(u.team, now)) {
        u.order = { kind: 'stop' };
        break;
      }
      pursueAndAttack(sim, u, target, dt);
      break;
    }
    case 'follow': {
      const target = sim.unit(u.order.uid);
      if (!target || !target.alive) {
        u.order = { kind: 'stop' };
        break;
      }
      if (dist(u.pos, target.pos) > 180) steerToward(sim, u, target.pos, dt, 150);
      break;
    }
    case 'cast': {
      handleCastOrder(sim, u, dt);
      break;
    }
    case 'item': {
      handleItemOrder(sim, u, dt);
      break;
    }
    case 'capture': {
      handleCaptureOrder(sim, u, dt);
      break;
    }
  }
}

function autoAcquire(sim: Sim, u: Unit, dt: number, holdPosition: boolean): void {
  if (u.kind === 'ward' || u.kind === 'npc') return;
  if (u.ctrl.kind === 'none' || u.ctrl.kind === 'ward') return; // inert units (test dummies, scripted NPCs)
  // Idle player heroes retaliate in place (Dota idle aggro) but never chase.
  const playerIdle = u.ctrl.kind === 'player' && u.order.kind === 'stop';
  const range = holdPosition || playerIdle ? u.stats.attackRange + 60 : TUNING.aiAutoAcquireRadius;
  const enemy = nearestEnemy(sim, u, range);
  if (enemy) {
    if (holdPosition || playerIdle) attackIfInRange(sim, u, enemy, dt);
    else pursueAndAttack(sim, u, enemy, dt);
  }
}

export function nearestEnemy(sim: Sim, u: Unit, radius: number): Unit | null {
  let best: Unit | null = null;
  let bestD = radius;
  for (const o of sim.unitsArr) {
    if (!o.alive || o.team === u.team || o.kind === 'npc') continue;
    if (o.summary.untargetable || !o.isVisibleTo(u.team, sim.time)) continue;
    const d = dist(o.pos, u.pos);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function pursueAndAttack(sim: Sim, u: Unit, target: Unit, dt: number): void {
  const range = u.stats.attackRange + u.radius + target.radius;
  const d = dist(u.pos, target.pos);
  if (d > range + TUNING.meleeRangeBuffer) {
    if (u.windupUntil > 0) u.windupUntil = -1;
    if (cannotMove(u.summary)) return;
    steerToward(sim, u, target.pos, dt, range * 0.85);
    return;
  }
  attackIfInRange(sim, u, target, dt);
}

function attackIfInRange(sim: Sim, u: Unit, target: Unit, dt: number): void {
  const now = sim.time;
  const range = u.stats.attackRange + u.radius + target.radius;
  const faced = faceToward(u, target.pos, dt);

  // windup resolving?
  if (u.windupUntil > 0) {
    if (now >= u.windupUntil) {
      u.windupUntil = -1;
      const wt = sim.unit(u.windupTargetUid);
      if (wt && wt.alive && dist(u.pos, wt.pos) <= range + 180) {
        launchAttack(sim, u, wt);
        u.nextAttackReadyAt = now + Math.max(0.1, u.stats.attackInterval - u.stats.attackPoint);
      }
    }
    return;
  }

  if (dist(u.pos, target.pos) > range + TUNING.meleeRangeBuffer) return;
  if (!faced || cannotAttack(u.summary) || now < u.nextAttackReadyAt) return;

  // begin windup
  u.windupUntil = now + u.stats.attackPoint;
  u.windupTargetUid = target.uid;
  breakInvis(sim, u);
}

function launchAttack(sim: Sim, u: Unit, target: Unit): void {
  const projSpeed = u.base.attackProjectileSpeed;
  if (projSpeed && projSpeed > 0) {
    sim.spawnAttackProjectile(u, target, projSpeed);
    sim.events.emit({ t: 'attack-launch', uid: u.uid, target: target.uid, speed: projSpeed });
  } else {
    attackImpact(sim, u, target);
  }
}

export function breakInvis(sim: Sim, u: Unit): void {
  const removed = u.removeStatusWhere((s) => s.status === 'invis');
  for (const r of removed) sim.events.emit({ t: 'status-expire', uid: u.uid, status: r.status });
}

// ---------- cast handling ----------

function handleCastOrder(sim: Sim, u: Unit, dt: number): void {
  if (u.order.kind !== 'cast') return;
  const slot = u.order.slot;
  const a = u.abilities[slot];
  if (!a || a.level <= 0) {
    u.order = { kind: 'stop' };
    return;
  }
  const def = a.def;

  if (def.targeting === 'toggle') {
    toggleAbility(sim, u, slot);
    u.order = { kind: 'stop' };
    return;
  }

  if (cannotCast(u.summary)) return; // wait for the disable to pass (orders persist briefly)

  const ready = u.abilityReady(slot, sim.time);
  if (!ready.ok) {
    u.order = { kind: 'stop' };
    return;
  }

  const target = u.order.uid !== undefined ? sim.unit(u.order.uid) : undefined;
  const point = u.order.point;

  if (def.targeting === 'unit-target') {
    if (!target || !target.alive || target.summary.untargetable || !target.isVisibleTo(u.team, sim.time)) {
      u.order = { kind: 'stop' };
      return;
    }
    // linken/immunity check for enemy-targeted spells
    if (target.team !== u.team && target.summary.magicImmune && !def.piercesImmunity) {
      sim.events.emit({ t: 'immune-block', uid: target.uid });
      u.order = { kind: 'stop' };
      return;
    }
  }

  const castRange = (levelArr(asArr(def.castRange, def), a.level, 600) + u.stats.castRangeBonus) * TUNING.rangeScale;
  const aim = target?.pos ?? point;
  if (def.targeting !== 'no-target' && aim) {
    const d = dist(u.pos, aim) - (target ? target.radius : 0);
    if (d > castRange) {
      steerToward(sim, u, aim, dt, castRange * 0.92);
      return;
    }
    if (!faceToward(u, aim, dt)) return;
  }

  // begin cast point
  u.windupUntil = -1;
  const cp = def.castPoint ?? 0.3;
  u.cast = {
    source: 'ability',
    slot,
    fireAt: sim.time + cp,
    targetUid: target?.uid,
    point: point ? { ...point } : undefined
  };
  u.castingUntil = sim.time + cp + 0.25;
  u.order = { kind: 'stop' };
  breakInvis(sim, u);
}

function asArr(v: number | string | undefined, def: AbilityDef): number[] | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return [v];
  return def.values?.[v];
}

export function fireCast(sim: Sim, u: Unit, source: 'ability' | 'item', slot: number, target: Unit | undefined, point?: { x: number; y: number }): void {
  if (source === 'ability') {
    const a = u.abilities[slot];
    if (!a || a.level <= 0) return;
    const def = a.def;
    const ready = u.abilityReady(slot, sim.time);
    if (!ready.ok) return;

    // spend
    u.mana -= u.manaCostOf(slot);
    if (a.charges >= 0) {
      a.charges--;
      const rt = levelArr(def.values?.chargeRestoreTime, a.level, levelArr(def.cooldown, a.level, 10));
      if (a.nextChargeAt <= sim.time) a.nextChargeAt = sim.time + rt * TUNING.cooldownScale;
    } else {
      a.cooldownUntil = sim.time + u.cooldownOf(slot);
    }

    const ctx = abilityCtx(def, a.level);
    sim.events.emit({ t: 'cast', uid: u.uid, abilityId: def.id, vfx: def.vfx, target: target?.uid, point });
    sim.runTriggers(u, 'on-cast', { other: target });
    sim.notifyEnemyCast(u);

    const primary = { target, point };
    if (def.channel) {
      const duration = levelArr(asArr(def.channel.duration, def), a.level, 3);
      const interval = def.channel.tick?.interval ?? 0.5;
      u.channel = {
        source: 'ability',
        slot,
        until: sim.time + duration,
        nextTickAt: sim.time + interval,
        interval,
        targetUid: target?.uid,
        point: point ? { ...point } : undefined
      };
      sim.events.emit({ t: 'status-apply', uid: u.uid, status: 'buff', duration });
    }
    if (def.effects) execEffects(sim, u, ctx, def.effects, primary);
  } else {
    sim.fireItemActive(u, slot, target, point);
  }
}

function channelSource(sim: Sim, u: Unit): { def: AbilityDef | null; level: number; ctx: EffectCtx } {
  void sim;
  if (!u.channel) return { def: null, level: 1, ctx: { defId: 'none', level: 1, vfx: { archetype: 'channel', color: '#fff' } } };
  if (u.channel.source === 'ability') {
    const a = u.abilities[u.channel.slot];
    return { def: a.def, level: a.level, ctx: abilityCtx(a.def, a.level) };
  }
  const it = u.items[u.channel.slot];
  const def = it ? REG.items.get(it.defId)?.active ?? null : null;
  return { def: def ?? null, level: 1, ctx: def ? abilityCtx(def, 1, 'item:') : { defId: 'none', level: 1, vfx: { archetype: 'channel', color: '#fff' } } };
}

function toggleAbility(sim: Sim, u: Unit, slot: number): void {
  const a = u.abilities[slot];
  if (!a || a.level <= 0 || !a.def.toggle) return;
  a.toggled = !a.toggled;
  if (a.toggled) {
    a.nextToggleTickAt = sim.time;
    sim.events.emit({ t: 'cast', uid: u.uid, abilityId: a.def.id, vfx: a.def.vfx });
  } else {
    sim.events.emit({ t: 'status-expire', uid: u.uid, status: 'buff' });
  }
}

function updateToggles(sim: Sim, u: Unit): void {
  for (let slot = 0; slot < u.abilities.length; slot++) {
    const a = u.abilities[slot];
    if (!a.toggled || !a.def.toggle) continue;
    if (u.summary.silenced || u.summary.hexed) {
      // silenced: toggles stay on in Dota (Rot), so leave running
    }
    const t = a.def.toggle;
    while (a.nextToggleTickAt <= sim.time) {
      const ctx = abilityCtx(a.def, a.level);
      const manaPerTick = levelArr(asArr(t.manaPerSec, a.def), a.level, 0) * t.interval;
      if (manaPerTick > 0) {
        if (u.mana < manaPerTick) {
          a.toggled = false;
          break;
        }
        u.mana -= manaPerTick;
      }
      const selfDps = levelArr(asArr(t.selfDamagePerSec, a.def), a.level, 0);
      if (selfDps > 0) {
        u.hp -= selfDps * t.interval; // Rot self-damage cannot be lethal below 1
        if (u.hp < 1) u.hp = 1;
      }
      execEffects(sim, u, ctx, t.effects, { target: undefined, point: undefined });
      a.nextToggleTickAt += t.interval;
    }
  }
}

// ---------- item orders ----------

function handleItemOrder(sim: Sim, u: Unit, dt: number): void {
  if (u.order.kind !== 'item') return;
  const slot = u.order.invSlot;
  const it = u.items[slot];
  const def = it ? REG.items.get(it.defId) : undefined;
  if (!it || !def || !def.active) {
    u.order = { kind: 'stop' };
    return;
  }
  if (isDisabled(u.summary)) return;

  const active = def.active;
  const target = u.order.uid !== undefined ? sim.unit(u.order.uid) : undefined;
  const point = u.order.point;

  if (active.targeting === 'unit-target' && (!target || !target.alive)) {
    u.order = { kind: 'stop' };
    return;
  }

  const castRange = (typeof active.castRange === 'number' ? active.castRange : 600) + u.stats.castRangeBonus;
  const aim = target?.pos ?? point;
  if (active.targeting !== 'no-target' && aim) {
    if (dist(u.pos, aim) - (target ? target.radius : 0) > castRange) {
      steerToward(sim, u, aim, dt, castRange * 0.92);
      return;
    }
    if (!faceToward(u, aim, dt)) return;
  }

  u.order = { kind: 'stop' };
  sim.fireItemActive(u, slot, target, point);
}

// ---------- capture order ----------

function handleCaptureOrder(sim: Sim, u: Unit, dt: number): void {
  if (u.order.kind !== 'capture') return;
  const target = sim.unit(u.order.uid);
  if (!target || !target.alive || !target.capturable || !target.tier) {
    u.order = { kind: 'stop' };
    return;
  }
  const cfg = TUNING.capture[target.tier];
  if (target.hp / target.stats.maxHp > cfg.hpPct) {
    u.order = { kind: 'stop' };
    return;
  }
  if (dist(u.pos, target.pos) > TUNING.captureRange) {
    steerToward(sim, u, target.pos, dt, TUNING.captureRange * 0.9);
    return;
  }
  faceToward(u, target.pos, dt);
  u.captureCh = { targetUid: target.uid, startedAt: sim.time, until: sim.time + cfg.channelSec };
  // The totem binds its target for the channel: the creep cannot fight back,
  // but anything ELSE hitting the channeler still interrupts (DECISIONS).
  target.addStatus({
    status: 'stun',
    tag: 'binding-totem',
    sourceUid: u.uid,
    sourceTeam: u.team,
    until: sim.time + cfg.channelSec,
    isDebuff: true
  });
  sim.interruptActions(target);
  sim.events.emit({ t: 'capture-start', uid: u.uid, target: target.uid, duration: cfg.channelSec });
  u.order = { kind: 'stop' };
}
