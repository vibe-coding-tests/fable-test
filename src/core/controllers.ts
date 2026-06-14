import { TUNING } from '../data/tuning';
import { add, closestOnSeg, dist, dist2, norm, pointSegDist, scale, sub, v2 } from './math2d';
import { nearestEnemy } from './actions';
import { REG } from './registry';
import { chooseUtilityOrder, dangerousScore, enemyCastSeen, incomingDisable, pickUtilityFocus } from './utility';
import { dominantRole } from './combat-profile';
import { tauntToTop } from './threat';
import { pickBossFocus } from './boss-brain';
import { isDisabled } from './status';
import type { Unit } from './unit';
import type { GambitAction, GambitCondition, GambitRule, GambitTargetMode, Vec2 } from './types';
import type { Sim } from './sim';
import type { Zone } from './sim';

// -----------------------------------------------------------------
// Controllers are swappable per unit (SPEC §1.1):
//   player — orders come from outside (input / Captain Call)
//   creep  — wild camps, summons, entourage
//   gambit — macro battles + AI party members in raids
//   boss   — raid boss threat-table controller
// -----------------------------------------------------------------

export function thinkUnit(sim: Sim, u: Unit): void {
  if (!u.alive) return;
  const c = u.ctrl;
  if (c.kind === 'player' || c.kind === 'ward' || c.kind === 'none') return;
  const cadence =
    c.kind === 'creep' ? TUNING.creepThinkTicks :
    c.kind === 'boss' ? TUNING.bossThinkTicks :
    TUNING.gambitThinkTicks;
  if ((sim.tickCount + u.uid) % cadence !== 0) return;
  if (c.kind === 'creep') thinkCreep(sim, u);
  else if (c.kind === 'boss') thinkBoss(sim, u);
  else if (c.kind === 'gambit') thinkGambit(sim, u);
}

// ---------- creep AI ----------

function thinkCreep(sim: Sim, u: Unit): void {
  const c = u.ctrl;

  // owned units (entourage / summons): guard the owner
  if (u.ownerUid !== undefined && c.followOwner) {
    const owner = sim.unit(u.ownerUid);
    if (!owner || !owner.alive) {
      u.order = { kind: 'stop' };
      return;
    }
    const enemy = nearestEnemyOf(sim, u, owner.pos, TUNING.entourageGuardRadius) ?? nearestEnemyOf(sim, u, u.pos, TUNING.entourageChaseRadius);
    if (enemy) {
      u.order = chooseUtilityOrder(sim, u, enemy) ?? { kind: 'attack-unit', uid: enemy.uid };
    } else if (dist2(u.pos, owner.pos) > TUNING.entourageFollowStart * TUNING.entourageFollowStart) {
      u.order = { kind: 'follow', uid: owner.uid };
    } else if (u.order.kind === 'follow' && dist2(u.pos, owner.pos) <= TUNING.entourageFollowStop * TUNING.entourageFollowStop) {
      u.order = { kind: 'stop' };
    }
    return;
  }

  // wild creeps: home camp, aggro, leash
  const home = c.homePos ?? u.pos;
  const dHome = dist(u.pos, home);

  if (c.leashed) {
    if (dHome < 120) {
      c.leashed = false;
      u.hp = u.stats.maxHp; // leash reset heals to full (DECISIONS)
      u.order = { kind: 'stop' };
    } else {
      u.order = { kind: 'move', point: { ...home } };
    }
    return;
  }
  if (dHome > TUNING.creepLeashRadius) {
    c.leashed = true;
    u.order = { kind: 'move', point: { ...home } };
    return;
  }

  const aggroR = u.aggroRadius ?? TUNING.creepAggroRadius;
  const enemy = nearestEnemy(sim, u, aggroR);
  if (enemy) {
    u.order = chooseUtilityOrder(sim, u, enemy) ?? { kind: 'attack-unit', uid: enemy.uid };
    return;
  }

  // idle wander around camp
  if (u.order.kind === 'stop') {
    if (c.nextThinkAt === undefined || sim.time >= c.nextThinkAt) {
      c.nextThinkAt = sim.time + 3 + (u.uid % 5);
      const ang = sim.rng.range(0, Math.PI * 2);
      const r = sim.rng.range(0, TUNING.creepWanderRadius);
      c.wanderTarget = v2(home.x + Math.cos(ang) * r, home.y + Math.sin(ang) * r);
      u.order = { kind: 'move', point: c.wanderTarget };
    }
  }
}

function nearestEnemyOf(sim: Sim, u: Unit, around: Vec2, radius: number): Unit | null {
  return sim.nearestUnit(
    around,
    radius,
    (o) => o.alive && o.team !== u.team && o.kind !== 'npc' && !o.summary.untargetable && o.isVisibleTo(u.team, sim.time)
  );
}

function thinkBoss(sim: Sim, u: Unit): void {
  // Taunt forces basic attacks on the taunter (Dota rule + raid taunt redirect tests),
  // and lifts the taunter to the top of the threat table so it stays the target after
  // the taunt expires (AI_OVERHAUL §4, WoW taunt-to-top).
  const taunter = u.summary.taunted !== null ? sim.unit(u.summary.taunted) : undefined;
  if (taunter && taunter.alive && taunter.team !== u.team && !taunter.summary.untargetable && taunter.isVisibleTo(u.team, sim.time)) {
    if (u.ctrl.threat) tauntToTop(u.ctrl.threat, taunter.uid);
    u.ctrl.focusUid = taunter.uid;
    u.order = { kind: 'attack-unit', uid: taunter.uid };
    return;
  }

  // phase-FSM (AI_OVERHAUL §5) picks the posture target; the scorer turns it into an action
  let focus = pickBossFocus(sim, u) ?? pickUtilityFocus(sim, u) ?? undefined;
  if (focus && !focus.isVisibleTo(u.team, sim.time)) focus = undefined;
  u.ctrl.focusUid = focus?.uid;

  if (focus) {
    u.order = chooseUtilityOrder(sim, u, focus) ?? { kind: 'attack-unit', uid: focus.uid };
  } else {
    u.order = { kind: 'stop' };
  }
}

// ---------- gambit controller (SPEC §7) ----------

export function thinkGambit(sim: Sim, u: Unit): void {
  const c = u.ctrl;
  const rules = c.rules ?? [];

  // Optional leash (overworld echoes, §3.3): tether to home so a gambit unit does
  // not roam the whole region. Macro/raid units leave leashRadius unset and skip this.
  if (c.homePos && c.leashRadius !== undefined) {
    const home = c.homePos;
    const dHome = dist(u.pos, home);
    if (c.leashed) {
      if (dHome < 160) {
        c.leashed = false;
        u.hp = u.stats.maxHp;
      } else {
        u.order = { kind: 'move', point: { ...home } };
        return;
      }
    } else if (dHome > c.leashRadius) {
      c.leashed = true;
      u.order = { kind: 'move', point: { ...home } };
      return;
    }
  }

  // maintain focus target: converge on the team-mind's shared focus when it is
  // reachable (AI_OVERHAUL §1, Layer 1), else keep a valid current focus or pick locally.
  const tm = sim.teamMind(u.team);
  const shared = tm.focusUid !== null ? sim.unit(tm.focusUid) : undefined;
  let focus: Unit | undefined;
  if (shared && shared.alive && !shared.summary.untargetable && shared.isVisibleTo(u.team, sim.time) && withinLeash(u, shared)) {
    focus = shared;
  } else {
    focus = c.focusUid !== undefined ? sim.unit(c.focusUid) : undefined;
    if (!focus || !focus.alive || focus.summary.untargetable || !focus.isVisibleTo(u.team, sim.time) || !withinLeash(u, focus)) {
      focus = pickUtilityFocus(sim, u, (o) => withinLeash(u, o)) ?? undefined;
    }
  }
  c.focusUid = focus?.uid;
  if (focus) c.encounterStartAt ??= sim.time;
  else c.encounterStartAt = undefined;

  for (const rule of rules) {
    if (!rule.if.every((cond) => evalCondition(sim, u, cond, focus))) continue;
    if (applyAction(sim, u, rule.then, focus)) return;
  }
  // no authored rule fired: let the utility scorer decide, else hold the focus
  const auto = focus ? chooseUtilityOrder(sim, u, focus) : null;
  if (auto) u.order = auto;
  else if (focus) u.order = { kind: 'attack-unit', uid: focus.uid };
  else u.order = { kind: 'stop' };
}

/** Leash gate for gambit echoes: an enemy out of tether range is ignored. */
function withinLeash(u: Unit, target: Unit): boolean {
  const c = u.ctrl;
  if (c.leashRadius === undefined || !c.homePos) return true;
  return dist2(target.pos, c.homePos) <= c.leashRadius * c.leashRadius;
}

function enemyCandidate(sim: Sim, u: Unit, o: Unit): boolean {
  return o.alive && o.team !== u.team && o.kind !== 'npc' && !o.summary.untargetable && o.isVisibleTo(u.team, sim.time) && withinLeash(u, o);
}

function zoneContainsUnit(z: Zone, u: Unit): boolean {
  if (z.shape === 'circle') {
    if (!z.pos) return false;
    const r = (z.radius ?? 0) + u.radius * 0.5;
    return dist2(u.pos, z.pos) <= r * r;
  }
  return z.a !== undefined && z.b !== undefined && pointSegDist(u.pos, z.a, z.b) <= z.width / 2 + u.radius * 0.5;
}

function zoneThreatensUnit(z: Zone, u: Unit): boolean {
  if (z.team === u.team) return false;
  const tickThreat = z.tickEffects && (z.tickAffects === undefined || z.tickAffects === 'enemies' || z.tickAffects === 'all');
  const enterThreat = z.onEnter && (z.onEnter.affects === 'enemies');
  const auraThreat = z.auraMods && z.auraMods.affects === 'enemies';
  return !!(tickThreat || enterThreat || auraThreat);
}

function hostileZoneContaining(sim: Sim, u: Unit): Zone | undefined {
  return sim.zones.find((z) => zoneThreatensUnit(z, u) && zoneContainsUnit(z, u));
}

function zoneEscapePoint(z: Zone, u: Unit): Vec2 | null {
  if (z.shape === 'circle') {
    if (!z.pos) return null;
    const dir = norm(sub(u.pos, z.pos));
    const safeDir = dir.x === 0 && dir.y === 0 ? v2(1, 0) : dir;
    return add(z.pos, scale(safeDir, (z.radius ?? 0) + u.radius + TUNING.ai.zoneEscapeMargin));
  }
  if (!z.a || !z.b) return null;
  const closest = closestOnSeg(u.pos, z.a, z.b);
  const dir = norm(sub(u.pos, closest));
  const safeDir = dir.x === 0 && dir.y === 0 ? v2(1, 0) : dir;
  return add(closest, scale(safeDir, z.width / 2 + u.radius + TUNING.ai.zoneEscapeMargin));
}

function evalCondition(sim: Sim, u: Unit, cond: GambitCondition, focus: Unit | undefined): boolean {
  switch (cond.k) {
    case 'always':
      return true;
    case 'self-hp-below':
      return u.hp / u.stats.maxHp < cond.pct / 100;
    case 'ally-hp-below':
      return sim.unitsArr.some((o) => o.alive && o.team === u.team && o !== u && o.hp / o.stats.maxHp < cond.pct / 100);
    case 'enemy-hp-below':
      return sim.unitsArr.some((o) => o.alive && o.team !== u.team && o.kind !== 'npc' && o.hp / o.stats.maxHp < cond.pct / 100);
    case 'self-mana-above':
      return u.stats.maxMana > 0 && u.mana / u.stats.maxMana > cond.pct / 100;
    case 'self-mana-below':
      return u.stats.maxMana > 0 && u.mana / u.stats.maxMana < cond.pct / 100;
    case 'has-status': {
      const target = cond.target === 'focus' ? focus : u;
      if (!target) return false;
      if (cond.status === 'buff') return target.statuses.some((s) => s.status === 'buff');
      return target.hasStatus(cond.status);
    }
    case 'target-role':
      return focus?.heroId ? REG.hero(focus.heroId).roles.includes(cond.role) : false;
    case 'target-attribute':
      return focus?.attribute === cond.attribute;
    case 'enemies-within':
      return sim.unitsInRadius(u.pos, cond.radius, (o) => enemyCandidate(sim, u, o)).length >= cond.count;
    case 'allies-alive':
      return sim.unitsArr.filter((o) => o.alive && o.team === u.team && o.kind === 'hero').length >= cond.count;
    case 'ability-ready':
      return u.abilityReady(cond.slot, sim.time).ok;
    case 'fight-time-gt':
      return sim.time - (u.ctrl.encounterStartAt ?? sim.time) > cond.sec;
    case 'standing-in-zone':
      return hostileZoneContaining(sim, u) !== undefined;
    case 'focus-is-role':
      return focus?.heroId ? REG.hero(focus.heroId).roles.includes(cond.role) : false;
    case 'distance-to-focus-gt':
      return focus ? dist2(u.pos, focus.pos) > cond.dist * cond.dist : false;
    case 'distance-to-focus-lt':
      return focus ? dist2(u.pos, focus.pos) < cond.dist * cond.dist : false;
    case 'enemy-cast-seen':
      return enemyCastSeen(sim, u, cond.category);
    case 'self-disabled':
      return isDisabled(u.summary);
    case 'incoming-disable':
      return incomingDisable(sim, u);
  }
}

function resolveGambitTarget(sim: Sim, u: Unit, mode: GambitTargetMode, focus: Unit | undefined): { unit?: Unit; point?: Vec2 } {
  switch (mode) {
    case 'self':
      return { unit: u, point: { ...u.pos } };
    case 'focus':
      return focus ? { unit: focus, point: { ...focus.pos } } : {};
    case 'lowest-hp-enemy': {
      let best: Unit | undefined;
      for (const o of sim.unitsArr) {
        if (!enemyCandidate(sim, u, o)) continue;
        if (!best || o.hp / o.stats.maxHp < best.hp / best.stats.maxHp) best = o;
      }
      return best ? { unit: best, point: { ...best.pos } } : {};
    }
    case 'lowest-hp-in-range': {
      let best: Unit | undefined;
      const range = Math.max(300, u.stats.attackRange + 150);
      for (const o of sim.unitsArr) {
        if (!enemyCandidate(sim, u, o)) continue;
        if (dist2(o.pos, u.pos) > range * range) continue;
        if (!best || o.hp / o.stats.maxHp < best.hp / best.stats.maxHp) best = o;
      }
      return best ? { unit: best, point: { ...best.pos } } : {};
    }
    case 'nearest-enemy': {
      let best: Unit | undefined;
      let bestD = Infinity;
      for (const o of sim.unitsArr) {
        if (!enemyCandidate(sim, u, o)) continue;
        const d = dist2(o.pos, u.pos);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      return best ? { unit: best, point: { ...best.pos } } : {};
    }
    case 'enemy-casting': {
      let best: Unit | undefined;
      let bestUntil = -Infinity;
      for (const o of sim.unitsArr) {
        if (!enemyCandidate(sim, u, o)) continue;
        const until = Math.max(o.castingUntil, o.channel?.until ?? -Infinity);
        if (until <= sim.time) continue;
        if (until > bestUntil) {
          bestUntil = until;
          best = o;
        }
      }
      return best ? { unit: best, point: { ...best.pos } } : {};
    }
    case 'most-dangerous': {
      let best: Unit | undefined;
      let bestScore = -Infinity;
      for (const o of sim.unitsArr) {
        if (!enemyCandidate(sim, u, o)) continue;
        const score = dangerousScore(o);
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      return best ? { unit: best, point: { ...best.pos } } : {};
    }
    case 'lowest-hp-ally': {
      let best: Unit | undefined;
      for (const o of sim.unitsArr) {
        if (!o.alive || o.team !== u.team) continue;
        if (!best || o.hp / o.stats.maxHp < best.hp / best.stats.maxHp) best = o;
      }
      return best ? { unit: best, point: { ...best.pos } } : {};
    }
    case 'most-clustered': {
      // evaluate cluster size at each enemy position
      let bestPoint: Vec2 | undefined;
      let bestCount = 0;
      let bestUnit: Unit | undefined;
      for (const o of sim.unitsArr) {
        if (!enemyCandidate(sim, u, o)) continue;
        const count = sim.unitsInRadius(o.pos, TUNING.ai.clusterRadius, (x) => enemyCandidate(sim, u, x)).length;
        if (count > bestCount) {
          bestCount = count;
          bestPoint = { ...o.pos };
          bestUnit = o;
        }
      }
      return bestPoint ? { point: bestPoint, unit: bestUnit } : {};
    }
  }
}

function applyAction(sim: Sim, u: Unit, action: GambitAction, focus: Unit | undefined): boolean {
  switch (action.k) {
    case 'cast': {
      const a = u.abilities[action.slot];
      if (!a || !u.abilityReady(action.slot, sim.time).ok) return false;
      const t = a.def.targeting;
      if (t === 'passive' || t === 'aura' || t === 'attack-modifier') return false;
      const tgt = resolveGambitTarget(sim, u, action.targetMode, focus);
      if (t === 'no-target' || t === 'toggle') {
        u.order = { kind: 'cast', slot: action.slot };
        return true;
      }
      if (t === 'unit-target') {
        if (!tgt.unit) return false;
        const affects = a.def.affects ?? 'enemy';
        if (affects === 'enemy' && tgt.unit.team === u.team) return false;
        if (affects === 'ally' && tgt.unit.team !== u.team) return false;
        u.order = { kind: 'cast', slot: action.slot, uid: tgt.unit.uid };
        return true;
      }
      if (!tgt.point) return false;
      u.order = { kind: 'cast', slot: action.slot, point: tgt.point };
      return true;
    }
    case 'use-item': {
      const slot = u.items.findIndex((it) => it && it.defId === action.itemId);
      if (slot < 0) return false;
      const it = u.items[slot]!;
      if (sim.time < it.cooldownUntil || it.charges === 0) return false;
      const tgt = resolveGambitTarget(sim, u, action.targetMode, focus);
      u.order = { kind: 'item', invSlot: slot, uid: tgt.unit?.uid, point: tgt.point };
      return true;
    }
    case 'attack-focus': {
      if (!focus) return false;
      u.order = { kind: 'attack-unit', uid: focus.uid };
      return true;
    }
    case 'focus-fire': {
      const tgt = resolveGambitTarget(sim, u, action.targetMode ?? 'focus', focus);
      if (!tgt.unit || tgt.unit.team === u.team) return false;
      u.ctrl.focusUid = tgt.unit.uid;
      u.order = { kind: 'attack-unit', uid: tgt.unit.uid };
      return true;
    }
    case 'kite': {
      if (!focus) return false;
      const desired = action.distance ?? Math.max(TUNING.ai.kiteActionMin, Math.min(TUNING.ai.kiteActionMax, u.stats.attackRange * TUNING.ai.kiteActionRangeFrac));
      const d = dist(u.pos, focus.pos);
      if (d < desired) {
        const away = norm(sub(u.pos, focus.pos));
        const dir = away.x === 0 && away.y === 0 ? v2(-1, 0) : away;
        u.order = { kind: 'move', point: add(u.pos, scale(dir, desired - d + TUNING.ai.kiteActionStepBonus)) };
        return true;
      }
      u.order = { kind: 'attack-unit', uid: focus.uid };
      return true;
    }
    case 'dodge-zones': {
      const z = hostileZoneContaining(sim, u);
      if (!z) return false;
      const point = zoneEscapePoint(z, u);
      if (!point) return false;
      u.order = { kind: 'move', point };
      return true;
    }
    case 'retreat': {
      const home = u.ctrl.homePos ?? u.pos;
      if (dist2(u.pos, home) < TUNING.ai.retreatArriveDist * TUNING.ai.retreatArriveDist) return false;
      u.order = { kind: 'move', point: { ...home } };
      return true;
    }
    case 'hold': {
      u.order = { kind: 'hold' };
      return true;
    }
  }
}

/**
 * Role-true default gambits (AI_OVERHAUL §3). The old defaults fired abilities by
 * fixed slot index (0..3) and ended in an unconditional `focus-fire`, which both
 * assumed a kit layout and suppressed the scorer entirely. These defaults instead
 * author only what the Layer 2 scorer should *not* override — zone-dodging and a
 * little role-shaped self-preservation — and leave the "what now" (which ability,
 * which item, kite vs commit, save an ally) to `chooseUtilityOrder`, which is
 * kit-aware and role-weighted via CombatProfile. The editor still replaces these.
 */
export function buildDefaultGambit(roles: string[]): GambitRule[] {
  const role = dominantRole(roles);
  const rules: GambitRule[] = [];

  // Universal: never sit in a telegraphed area effect.
  rules.push({ if: [{ k: 'standing-in-zone' }], then: { k: 'dodge-zones' } });

  switch (role) {
    case 'support':
      // peel out when focused; the scorer already saves allies by weight
      rules.push({ if: [{ k: 'self-hp-below', pct: 42 }], then: { k: 'retreat' } });
      break;
    case 'escape':
      rules.push({ if: [{ k: 'self-hp-below', pct: 36 }], then: { k: 'retreat' } });
      break;
    case 'carry':
      // protect the investment: disengage low rather than feed (ranged kite, melee fall back)
      rules.push({ if: [{ k: 'self-hp-below', pct: 26 }], then: { k: 'kite' } });
      break;
    case 'nuker':
      rules.push({ if: [{ k: 'self-hp-below', pct: 30 }], then: { k: 'kite' } });
      break;
    // initiator / durable / disabler / generalist hold the line and commit
  }

  // No unconditional catch-all: the utility scorer drives offense, item use, and
  // spacing, so the action stays role-true and kit-true without authored slots.
  return rules;
}
