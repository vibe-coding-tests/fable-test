import { TUNING } from '../data/tuning';
import { add, dist, dist2, norm, pointSegDist, scale, sub, v2 } from './math2d';
import { combatProfile, type CombatProfile, type CombatRole } from './combat-profile';
import { itemArchetypes, type ItemArchetype } from './item-archetype';
import { abilityArchetypes, type AbilityArchetype } from './ability-archetype';
import { comboStepMatchesOrder, orderForComboStep, planSaveChain, planTeamCombos, planUnitCombo, type ComboPlan, type ComboStep } from './combo-planner';
import { bossArchetypeBias } from './boss-brain';
import { abilityVal } from './values';
import { itemReady } from './items';
import { isDisabled } from './status';
import { REG } from './registry';
import type { AbilityDef, EffectNode, ItemDef, Order, StatusId, TargetSel, Team, ValueRef, Vec2 } from './types';
import type { Sim, TeamMind } from './sim';
import type { Unit } from './unit';

// ============================================================
// Utility scorer (AI_OVERHAUL §1, Layer 2). Given a unit and a
// focus, enumerate candidate actions and score each from cheap
// considerations weighted by the unit's CombatProfile. The best
// action becomes an Order. One scorer serves creeps, bosses, and
// the gambit fallback. Pure and deterministic; ties break by slot
// then uid.
// ============================================================

const HARD_DISABLES: ReadonlySet<StatusId> = new Set<StatusId>([
  'stun', 'root', 'hex', 'fear', 'sleep', 'frozen', 'cyclone'
]);
const SOFT_DISABLES: ReadonlySet<StatusId> = new Set<StatusId>([
  'silence', 'slow', 'disarm', 'blind', 'break'
]);

interface AbilityIntent {
  offensive: boolean;
  aoe: boolean;
  hardControl: boolean;
  softControl: boolean;
  heal: boolean;
  buff: boolean;
  escape: boolean;
  affectsAlly: boolean;
  radius: number;        // representative aoe radius at this level (0 = single)
}

const INTENT_CACHE = new WeakMap<AbilityDef, Omit<AbilityIntent, 'radius'>>();

/** Classify what an ability is *for*, independent of level (radius resolved separately). */
function classify(def: AbilityDef): Omit<AbilityIntent, 'radius'> {
  const cached = INTENT_CACHE.get(def);
  if (cached) return cached;
  const out = {
    offensive: false,
    aoe: false,
    hardControl: false,
    softControl: false,
    heal: false,
    buff: false,
    escape: false,
    affectsAlly: def.affects === 'ally'
  };
  scan(def.effects, out);
  if (def.channel?.tick) scan(def.channel.tick.effects, out);
  if (def.channel?.onEnd) scan(def.channel.onEnd, out);
  if (def.toggle) scan(def.toggle.effects, out);
  // a unit-target ability that affects allies is support intent even if effects are thin
  if (def.affects === 'ally' && !out.heal && !out.buff) out.buff = true;
  INTENT_CACHE.set(def, out);
  return out;
}

function scan(nodes: EffectNode[] | undefined, out: Omit<AbilityIntent, 'radius'>): void {
  if (!nodes) return;
  for (const n of nodes) {
    switch (n.kind) {
      case 'damage':
        out.offensive = true;
        if (n.radius !== undefined) out.aoe = true;
        break;
      case 'heal':
        out.heal = true;
        if (n.radius !== undefined) out.aoe = true;
        break;
      case 'mana':
        if (n.op === 'burn') out.offensive = true;
        break;
      case 'status':
        if (HARD_DISABLES.has(n.status)) out.hardControl = true;
        else if (SOFT_DISABLES.has(n.status)) out.softControl = true;
        else if (n.status === 'buff') out.buff = true;
        if (n.radius !== undefined) out.aoe = true;
        break;
      case 'displace':
        if (n.mode === 'blink' || n.toward === 'away-from-caster') out.escape = true;
        else { out.offensive = true; out.hardControl = true; }
        break;
      case 'statmod':
        out.buff = true;
        break;
      case 'summon':
        out.offensive = true;
        break;
      case 'zone':
        out.aoe = true;
        if (n.zone.tick) scan(n.zone.tick.effects, out);
        if (n.zone.onEnter) scan(n.zone.onEnter.effects, out);
        break;
      case 'projectile':
        scan(n.proj.onHit, out);
        break;
      case 'repeat':
        scan(n.effects, out);
        break;
      case 'purge':
        break;
      case 'exotic':
        out.offensive = true;
        break;
    }
  }
}

function intentOf(def: AbilityDef, level: number): AbilityIntent {
  const base = classify(def);
  let radius = 0;
  if (base.aoe) radius = representativeRadius(def, level);
  return { ...base, radius };
}

function representativeRadius(def: AbilityDef, level: number): number {
  let r = 0;
  const visit = (nodes?: EffectNode[]) => {
    if (!nodes) return;
    for (const n of nodes) {
      const nr = (n as { radius?: number | string }).radius;
      if (nr !== undefined) r = Math.max(r, abilityVal(def, nr, level));
      if (n.kind === 'zone') {
        if (n.zone.radius !== undefined) r = Math.max(r, abilityVal(def, n.zone.radius, level));
        if (n.zone.tick) visit(n.zone.tick.effects);
      }
      if (n.kind === 'projectile') { visit(n.proj.onHit); if (n.proj.width !== undefined) r = Math.max(r, abilityVal(def, n.proj.width, level)); }
      if (n.kind === 'repeat') visit(n.effects);
    }
  };
  visit(def.effects);
  if (def.channel?.tick) visit(def.channel.tick.effects);
  return r > 0 ? r : 300;
}

// ---------- reactive reads (AI_OVERHAUL §2) ----------

export type CastCategory = 'blink' | 'ult' | 'channel' | 'any';

interface CurrentCast {
  def: AbilityDef;
  level: number;
  channeling: boolean;
  targetUid?: number;
  point?: Vec2;
}

function defHasBlink(def: AbilityDef): boolean {
  const visit = (nodes?: EffectNode[]): boolean => {
    if (!nodes) return false;
    for (const n of nodes) {
      if (n.kind === 'displace' && n.mode === 'blink') return true;
      if (n.kind === 'repeat' && visit(n.effects)) return true;
    }
    return false;
  };
  return visit(def.effects);
}

/** The ability/item def a unit is currently casting or channeling, if any. */
function currentCastDef(u: Unit): CurrentCast | null {
  const cs = u.cast;
  if (cs) {
    if (cs.source === 'ability') {
      const a = u.abilities[cs.slot];
      return a ? { def: a.def, level: a.level, channeling: false, targetUid: cs.targetUid, point: cs.point } : null;
    }
    const idef = REG.items.get(u.items[cs.slot]?.defId ?? '')?.active;
    return idef ? { def: idef, level: 1, channeling: false, targetUid: cs.targetUid, point: cs.point } : null;
  }
  const ch = u.channel;
  if (ch) {
    if (ch.source === 'ability') {
      const a = u.abilities[ch.slot];
      return a ? { def: a.def, level: a.level, channeling: true, targetUid: ch.targetUid, point: ch.point } : null;
    }
    const idef = REG.items.get(u.items[ch.slot]?.defId ?? '')?.active;
    return idef ? { def: idef, level: 1, channeling: true, targetUid: ch.targetUid, point: ch.point } : null;
  }
  return null;
}

function castMatches(def: AbilityDef, channeling: boolean, category: CastCategory): boolean {
  switch (category) {
    case 'any': return true;
    case 'ult': return def.ult === true;
    case 'channel': return channeling || !!def.channel;
    case 'blink': return defHasBlink(def);
  }
}

function currentTarget(sim: Sim, cur: CurrentCast): Unit | undefined {
  return cur.targetUid !== undefined ? sim.unit(cur.targetUid) : undefined;
}

function primaryCenter(sim: Sim, caster: Unit, cur: CurrentCast): Vec2 {
  return cur.point ?? currentTarget(sim, cur)?.pos ?? caster.pos;
}

function pointThreatensUnit(point: Vec2 | undefined, radius: number, victim: Unit): boolean {
  if (!point) return false;
  const r = Math.max(0, radius) + victim.radius * 0.5;
  return dist2(victim.pos, point) <= r * r;
}

function selectorThreatensUnit(sim: Sim, caster: Unit, victim: Unit, cur: CurrentCast, selector: TargetSel, radiusRef?: ValueRef): boolean {
  const radius = radiusRef !== undefined ? abilityVal(cur.def, radiusRef, cur.level) : 0;
  const target = currentTarget(sim, cur);
  switch (selector) {
    case 'target':
      if (target?.uid === victim.uid) return true;
      return radius > 0 && pointThreatensUnit(target?.pos, radius, victim);
    case 'enemies-in-radius':
    case 'random-enemy-in-radius':
      return victim.team !== caster.team && pointThreatensUnit(primaryCenter(sim, caster, cur), radius, victim);
    case 'units-in-radius':
      return pointThreatensUnit(primaryCenter(sim, caster, cur), radius, victim);
    case 'self':
    case 'allies-in-radius':
    case 'lowest-hp-ally-in-radius':
    case 'point':
      return false;
  }
}

function zoneThreatensUnit(sim: Sim, caster: Unit, victim: Unit, cur: CurrentCast, node: Extract<EffectNode, { kind: 'zone' }>): boolean {
  const z = node.zone;
  const disables =
    nodesContainHardDisable(z.tick?.effects ?? []) ||
    nodesContainHardDisable(z.onEnter?.effects ?? []);
  if (!disables) return false;

  if (z.shape === 'line') {
    const point = cur.point ?? currentTarget(sim, cur)?.pos;
    if (!point) return false;
    const width = abilityVal(cur.def, z.width, cur.level);
    return pointSegDist(victim.pos, caster.pos, point) <= width / 2 + victim.radius * 0.5;
  }

  const center =
    node.at === 'self' ? caster.pos :
    node.at === 'target' ? currentTarget(sim, cur)?.pos :
    primaryCenter(sim, caster, cur);
  return pointThreatensUnit(center, abilityVal(cur.def, z.radius, cur.level), victim);
}

function projectileThreatensUnit(sim: Sim, caster: Unit, victim: Unit, cur: CurrentCast, node: Extract<EffectNode, { kind: 'projectile' }>): boolean {
  if (!nodesContainHardDisable(node.proj.onHit)) return false;
  if (node.proj.model === 'homing' || node.to === 'target') return cur.targetUid === victim.uid;
  const point = cur.point ?? currentTarget(sim, cur)?.pos;
  if (!point) return false;
  const width = abilityVal(cur.def, node.proj.width, cur.level);
  return pointSegDist(victim.pos, caster.pos, point) <= width / 2 + victim.radius * 0.5;
}

function nodeThreatensUnit(sim: Sim, caster: Unit, victim: Unit, cur: CurrentCast, node: EffectNode): boolean {
  switch (node.kind) {
    case 'status':
      return HARD_DISABLES.has(node.status) && selectorThreatensUnit(sim, caster, victim, cur, node.target, node.radius);
    case 'displace':
      return node.mode !== 'blink' && selectorThreatensUnit(sim, caster, victim, cur, node.target, node.radius);
    case 'zone':
      return zoneThreatensUnit(sim, caster, victim, cur, node);
    case 'projectile':
      return projectileThreatensUnit(sim, caster, victim, cur, node);
    case 'repeat':
      return nodesThreatenUnit(sim, caster, victim, cur, node.effects);
    default:
      return false;
  }
}

function nodesThreatenUnit(sim: Sim, caster: Unit, victim: Unit, cur: CurrentCast, nodes: EffectNode[]): boolean {
  return nodes.some((node) => nodeThreatensUnit(sim, caster, victim, cur, node));
}

function nodeContainsHardDisable(node: EffectNode): boolean {
  switch (node.kind) {
    case 'status':
      return HARD_DISABLES.has(node.status);
    case 'displace':
      return node.mode !== 'blink';
    case 'zone':
      return nodesContainHardDisable(node.zone.tick?.effects ?? []) || nodesContainHardDisable(node.zone.onEnter?.effects ?? []);
    case 'projectile':
      return nodesContainHardDisable(node.proj.onHit);
    case 'repeat':
      return nodesContainHardDisable(node.effects);
    default:
      return false;
  }
}

function nodesContainHardDisable(nodes: EffectNode[]): boolean {
  return nodes.some(nodeContainsHardDisable);
}

function hardDisableThreatensUnit(sim: Sim, caster: Unit, victim: Unit, cur: CurrentCast): boolean {
  return nodesThreatenUnit(sim, caster, victim, cur, cur.def.effects ?? []) ||
    nodesThreatenUnit(sim, caster, victim, cur, cur.def.channel?.tick?.effects ?? []) ||
    nodesThreatenUnit(sim, caster, victim, cur, cur.def.channel?.onEnd ?? []);
}

/** An enemy within range is casting/channeling something of the given category. */
export function enemyCastSeen(sim: Sim, u: Unit, category: CastCategory, radius = 1500): boolean {
  let seen = false;
  sim.forEachNearbyUnit(u.pos, radius + 80, (o) => {
    if (seen || !enemyCandidate(sim, u, o)) return;
    if (dist2(o.pos, u.pos) > radius * radius) return;
    const cur = currentCastDef(o);
    if (cur && castMatches(cur.def, cur.channeling, category)) seen = true;
  });
  return seen;
}

/** An enemy within range is mid-cast of a hard disable that may land on the team. */
export function incomingDisable(sim: Sim, u: Unit, radius = 1200): boolean {
  let inc = false;
  sim.forEachNearbyUnit(u.pos, radius + 80, (o) => {
    if (inc || !enemyCandidate(sim, u, o)) return;
    if (dist2(o.pos, u.pos) > radius * radius) return;
    const cur = currentCastDef(o);
    if (cur && classify(cur.def).hardControl && hardDisableThreatensUnit(sim, o, u, cur)) inc = true;
  });
  return inc;
}

// ---------- candidate predicates ----------

function enemyCandidate(sim: Sim, u: Unit, o: Unit): boolean {
  return o.alive && o.team !== u.team && o.kind !== 'npc' && !o.summary.untargetable && o.isVisibleTo(u.team, sim.time);
}

export function dangerousScore(o: Unit): number {
  const attackDps = o.stats.damage / Math.max(0.2, o.stats.attackInterval);
  const casterBias = o.abilities.some((a) => a.level > 0 && a.cooldownUntil <= 0 && a.def.targeting !== 'passive' && a.def.targeting !== 'aura') ? TUNING.ai.casterBias : 0;
  const heroBias = o.kind === 'hero' ? TUNING.ai.heroBias : 0;
  const lowHpPenalty = (1 - o.hp / Math.max(1, o.stats.maxHp)) * TUNING.ai.lowHpPenalty;
  return attackDps + casterBias + heroBias - lowHpPenalty;
}

/** Extra ai-depth past the normal-tier baseline (0 at default, up to ~0.55 at Hell). */
function aiDepthBonus(u: Unit): number {
  const depth = u.ctrl.aiDepth ?? TUNING.ai.bossAiDepth;
  return Math.max(0, depth - TUNING.ai.depthRefAiDepth);
}

function dangerNorm(o: Unit): number {
  return Math.max(0, Math.min(1, dangerousScore(o) / TUNING.ai.dangerNorm));
}

/** A target is worth committing to by how killable and how dangerous it is. */
function targetValue(o: Unit): number {
  const hpPct = o.hp / Math.max(1, o.stats.maxHp);
  return 0.5 + (1 - hpPct) * 0.8 + dangerNorm(o) * 0.6;
}

function castRangeOf(def: AbilityDef, u: Unit, level: number): number {
  const base = def.castRange !== undefined ? abilityVal(def, def.castRange, level) : 600;
  return base + u.stats.castRangeBonus;
}

// ---------- target acquisition ----------

function lowestWoundedAlly(sim: Sim, u: Unit, range: number, savePct: number): Unit | null {
  let best: Unit | null = null;
  let bestPct = Infinity;
  sim.forEachNearbyUnit(u.pos, range + 80, (o) => {
    if (!o.alive || o.team !== u.team || o.kind === 'npc') return;
    if (dist2(o.pos, u.pos) > range * range) return;
    const pct = o.hp / Math.max(1, o.stats.maxHp);
    if (pct >= savePct) return;
    if (pct < bestPct) { bestPct = pct; best = o; }
  });
  return best;
}

function woundedAlliesNear(sim: Sim, u: Unit, range: number, pct: number): number {
  let n = 0;
  sim.forEachNearbyUnit(u.pos, range + 80, (o) => {
    if (!o.alive || o.team !== u.team || o.kind === 'npc') return;
    if (dist2(o.pos, u.pos) > range * range) return;
    if (o.hp / Math.max(1, o.stats.maxHp) < pct) n++;
  });
  return n;
}

/** Allies (and self) grouped within radius — the cluster a team-mitigation guard covers. */
function clusteredAllies(sim: Sim, u: Unit, radius: number): number {
  let n = 0;
  sim.forEachNearbyUnit(u.pos, radius + 80, (o) => {
    if (!o.alive || o.team !== u.team) return;
    if (o.kind !== 'hero' && o.kind !== 'creep') return;
    if (dist2(o.pos, u.pos) <= radius * radius) n++;
  });
  return n;
}

/** The disabled ally most worth a dispel (Lotus Echo Shell): lowest HP, ties by uid. */
function mostDisabledAllyInRange(sim: Sim, u: Unit, range: number): Unit | null {
  let best: Unit | null = null;
  let bestPct = Infinity;
  sim.forEachNearbyUnit(u.pos, range + 80, (o) => {
    if (!o.alive || o.team !== u.team || o.kind === 'npc') return;
    if (dist2(o.pos, u.pos) > range * range) return;
    if (!isDisabled(o.summary)) return;
    const pct = o.hp / Math.max(1, o.stats.maxHp);
    if (pct < bestPct || (pct === bestPct && (best === null || o.uid < best.uid))) {
      bestPct = pct;
      best = o;
    }
  });
  return best;
}

function enemyChannelingInRange(sim: Sim, u: Unit, range: number): Unit | null {
  let best: Unit | null = null;
  sim.forEachNearbyUnit(u.pos, range + 80, (o) => {
    if (!enemyCandidate(sim, u, o)) return;
    if (dist2(o.pos, u.pos) > range * range) return;
    const casting = o.castingUntil > sim.time || (o.channel != null && o.channel.until > sim.time);
    if (casting && (best === null || o.uid < best.uid)) best = o;
  });
  return best;
}

function bestOffensiveTarget(sim: Sim, u: Unit, focus: Unit | null, range: number, aimAt?: CombatRole): Unit | null {
  // prefer the focus when it is a valid enemy in range, so casts reinforce the team's commit
  if (focus && enemyCandidate(sim, u, focus) && dist2(u.pos, focus.pos) <= range * range) return focus;
  let best: Unit | null = null;
  let bestScore = -Infinity;
  sim.forEachNearbyUnit(u.pos, range + 80, (o) => {
    if (!enemyCandidate(sim, u, o)) return;
    if (dist2(o.pos, u.pos) > range * range) return;
    // §3 playbook lean: with no shared focus to converge on, tilt the scan toward
    // the role this unit is built to aim at (a disabler leads onto the enemy carry).
    const lean = aimAt && o.kind === 'hero' && combatProfile(o).role === aimAt ? TUNING.ai.aimAtBonus : 0;
    const score = targetValue(o) + lean;
    if (score > bestScore || (score === bestScore && (best === null || o.uid < best.uid))) {
      bestScore = score;
      best = o;
    }
  });
  return best;
}

/** Best cluster center among enemies in cast range, with how many it would catch. */
function bestCluster(sim: Sim, u: Unit, range: number, radius: number): { point: Vec2; count: number } | null {
  const inRange = sim.unitsInRadius(u.pos, range, (o) => enemyCandidate(sim, u, o));
  if (inRange.length === 0) return null;
  let bestPoint: Vec2 | null = null;
  let bestCount = 0;
  for (const c of inRange) {
    let count = 0;
    for (const o of inRange) {
      if (dist2(o.pos, c.pos) <= radius * radius) count++;
    }
    if (count > bestCount) { bestCount = count; bestPoint = { ...c.pos }; }
  }
  return bestPoint ? { point: bestPoint, count: bestCount } : null;
}

/**
 * Best aim direction for a `skillshot-line` (AUTOBATTLER_OVERHAUL §6.3): the ray from
 * the caster that rakes the most enemies within `width`. Returns the far endpoint as the
 * cast point so the line is angled down the densest row. Deterministic: ties break by uid.
 */
function bestLine(sim: Sim, u: Unit, range: number, width: number): { point: Vec2; count: number } | null {
  const inRange = sim.unitsInRadius(u.pos, range, (o) => enemyCandidate(sim, u, o));
  if (inRange.length === 0) return null;
  let bestPoint: Vec2 | null = null;
  let bestCount = 0;
  let bestUid = Infinity;
  const half = width / 2;
  for (const aim of inRange) {
    const dir = norm(sub(aim.pos, u.pos));
    if (dir.x === 0 && dir.y === 0) continue;
    const end = add(u.pos, scale(dir, range));
    let count = 0;
    for (const o of inRange) {
      if (pointSegDist(o.pos, u.pos, end) <= half + o.radius * 0.5) count++;
    }
    if (count > bestCount || (count === bestCount && aim.uid < bestUid)) {
      bestCount = count;
      bestPoint = end;
      bestUid = aim.uid;
    }
  }
  return bestPoint ? { point: bestPoint, count: bestCount } : null;
}

/** Nearest-uid enemy mid-channel within range: the interrupt target for a single-lockdown. */
function enemyMidChannelInRange(sim: Sim, u: Unit, range: number): Unit | null {
  let best: Unit | null = null;
  sim.forEachNearbyUnit(u.pos, range + 80, (o) => {
    if (!enemyCandidate(sim, u, o)) return;
    if (dist2(o.pos, u.pos) > range * range) return;
    if (o.channel != null && o.channel.until > sim.time && (best === null || o.uid < best.uid)) best = o;
  });
  return best;
}

function enemiesNear(sim: Sim, u: Unit, radius: number): number {
  let n = 0;
  sim.forEachNearbyUnit(u.pos, radius + 80, (o) => {
    if (enemyCandidate(sim, u, o) && dist2(o.pos, u.pos) <= radius * radius) n++;
  });
  return n;
}

// ---------- raid-aware considerations (AI_OVERHAUL §6) ----------

/** An enemy boss is in its enrage phase: the party should burn, not kite. */
export function enemyBossEnraged(sim: Sim, u: Unit): boolean {
  for (const e of sim.unitsArr) {
    if (e.alive && e.team !== u.team && e.ctrl.boss?.phase === 'enrage') return true;
  }
  return false;
}

function bossPresent(sim: Sim, u: Unit): boolean {
  for (const e of sim.unitsArr) {
    if (e.alive && e.team !== u.team && e.ctrl.kind === 'boss') return true;
  }
  return false;
}

/**
 * Peel target for a frontline unit in a raid: the nearest enemy add (summon/creep)
 * that is menacing a backline ally. A tank that sees adds on the casters goes and
 * bodies them instead of mindlessly tunneling the boss.
 */
export function raidPeelTarget(sim: Sim, u: Unit, profile: CombatProfile): Unit | null {
  if (profile.posture !== 'frontline' || !bossPresent(sim, u)) return null;
  const depthBonus = aiDepthBonus(u);
  const r = TUNING.ai.raid;
  const searchRadius = r.peelSearch + depthBonus * r.peelSearchPerDepth;
  const menaceRadius = r.peelMenace + depthBonus * r.peelMenacePerDepth;
  let best: Unit | null = null;
  let bestD = Infinity;
  sim.forEachNearbyUnit(u.pos, searchRadius + 20, (e) => {
    if (!enemyCandidate(sim, u, e)) return;
    if (e.kind !== 'summon' && e.kind !== 'creep') return;
    if (dist2(e.pos, u.pos) > searchRadius * searchRadius) return;
    let menacing = false;
    sim.forEachNearbyUnit(e.pos, menaceRadius + 20, (a) => {
      if (menacing || !a.alive || a.team !== u.team || a === u) return;
      if (combatProfile(a).posture !== 'backline') return;
      if (dist2(a.pos, e.pos) <= menaceRadius * menaceRadius) menacing = true;
    });
    if (!menacing) return;
    const d = dist2(e.pos, u.pos);
    if (d < bestD || (d === bestD && best !== null && e.uid < best.uid)) { bestD = d; best = e; }
  });
  return best;
}

function raidSignatureScatterOrder(sim: Sim, u: Unit): Order | null {
  if (!bossPresent(sim, u)) return null;
  const r = TUNING.ai.raid;
  const earlyMargin = r.scatterMargin + aiDepthBonus(u) * r.scatterMarginPerDepth;
  for (const z of sim.zones) {
    if (z.team === u.team || !z.tickEffects || z.shape !== 'circle' || !z.pos) continue;
    const radius = z.radius ?? 0;
    if (radius < r.scatterMinRadius) continue;
    const harms = z.tickEffects.some((e) => e.kind === 'damage') && z.tickAffects !== 'allies';
    if (!harms) continue;
    if (dist2(u.pos, z.pos) > (radius + earlyMargin) * (radius + earlyMargin)) continue;
    const away = norm(sub(u.pos, z.pos));
    const dir = away.x === 0 && away.y === 0 ? v2((u.uid % 2 === 0 ? 1 : -1), 0) : away;
    return { kind: 'move', point: add(z.pos, scale(dir, radius + u.radius + earlyMargin)) };
  }
  return null;
}

function readyMekCarrier(sim: Sim, u: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const ally of sim.unitsArr) {
    if (!ally.alive || ally.team !== u.team || ally.kind !== 'hero') continue;
    const slot = ally.items.findIndex((it) => it?.defId === 'mekansm');
    if (slot < 0) continue;
    const it = ally.items[slot]!;
    const def = REG.items.get(it.defId);
    if (!def || !itemReady(it, def, ally, sim.time).ok) continue;
    const d = dist2(u.pos, ally.pos);
    if (d < bestD || (d === bestD && (best === null || ally.uid < best.uid))) { bestD = d; best = ally; }
  }
  return best;
}

function woundedRaidAlliesNear(sim: Sim, team: Team, center: Vec2, radius: number): number {
  let n = 0;
  sim.forEachNearbyUnit(center, radius + 80, (ally) => {
    if (!ally.alive || ally.team !== team || ally.kind !== 'hero') return;
    if (dist2(ally.pos, center) > radius * radius) return;
    if (ally.hp / Math.max(1, ally.stats.maxHp) < 0.72) n++;
  });
  return n;
}

function raidStackForHealOrder(sim: Sim, u: Unit): Order | null {
  if (!bossPresent(sim, u)) return null;
  const depthBonus = aiDepthBonus(u);
  const r = TUNING.ai.raid;
  const stackHpPct = r.stackHpPct + depthBonus * r.stackHpPctPerDepth;
  if (u.hp / Math.max(1, u.stats.maxHp) >= stackHpPct) return null;
  const carrier = readyMekCarrier(sim, u);
  if (!carrier || carrier.uid === u.uid) return null;
  const stackRange = r.stackRange + depthBonus * r.stackRangePerDepth;
  if (woundedRaidAlliesNear(sim, u.team, carrier.pos, stackRange) < 2) return null;
  const d = dist(u.pos, carrier.pos);
  if (d <= r.stackMinDist || d > stackRange) return null;
  return { kind: 'move', point: { ...carrier.pos } };
}

interface Scored { score: number; order: Order; slot: number }

function manaAdjustedScore(u: Unit, score: number, manaCost: number): number {
  if (manaCost <= 0 || u.stats.maxMana <= 0) return score;
  const afterPct = (u.mana - manaCost) / Math.max(1, u.stats.maxMana);
  const floor = TUNING.ai.manaFloorPct;
  if (afterPct >= floor) return score;
  const pressure = Math.min(1, (floor - afterPct) / Math.max(0.01, floor));
  // §5.7: deeper-AI units husband mana harder (difficulty plays better, not just bigger).
  const weight = TUNING.ai.manaConservationWeight * (1 + aiDepthBonus(u) * TUNING.ai.depthDisciplineGain);
  return score * Math.max(0.25, 1 - pressure * weight);
}

/**
 * AUTOBATTLER_OVERHAUL §6.3: archetype-driven hold discipline. A `teamfight-ult`
 * or `cluster-nuke` is held below the cluster threshold so it is never spent on a
 * lone body — generalized from the boss's `partyClusterCount` to every unit, at all
 * depths (deeper AI holds harder). null = no hold (single-target / utility).
 */
type HoldKind = 'teamfight-ult' | 'cluster-nuke' | null;

function finalAbilityScore(u: Unit, score: number, intent: AbilityIntent, order: Order, focus: Unit | null, manaCost = 0, clusterCount = Infinity, hold: HoldKind = null): number {
  let out = score;
  if (focus && ((order.kind === 'cast' && order.uid === focus.uid) || (order.kind === 'attack-unit' && order.uid === focus.uid))) {
    out *= 0.75 + combatProfile(u).weights.focusFollow * 0.25;
  }

  const boss = u.ctrl.kind === 'boss' ? u.ctrl.boss : undefined;
  if (boss) {
    const m = TUNING.ai.bossScore;
    if (boss.pref === 'cluster' && intent.aoe) out *= m.cluster;
    if (boss.pref === 'kill' && intent.offensive && !intent.aoe) out *= m.kill;
    if (boss.pref === 'healer' && (intent.hardControl || intent.softControl)) out *= m.healer;
    if (boss.phase === 'enrage' && intent.offensive) out *= m.enrage;
    if (boss.phase === 'desperation' && (intent.hardControl || intent.escape || intent.buff)) out *= m.desperation;
  }

  if (hold && intent.aoe && clusterCount < TUNING.ai.holdClusterMin) {
    const depth = u.ctrl.aiDepth ?? TUNING.ai.bossAiDepth;
    const aa = TUNING.ai.abilityArchetype;
    const floor = hold === 'teamfight-ult' ? aa.teamfightUltFloor : aa.clusterNukeFloor;
    out *= Math.max(floor, 1 - aa.holdSlope * depth);
  }
  return manaAdjustedScore(u, out, manaCost);
}

/** The hold discipline an aoe ability is subject to (teamfight-ult ranks above cluster-nuke). */
function holdKindOf(def: AbilityDef): HoldKind {
  const arch = abilityArchetypes(def);
  if (arch.has('teamfight-ult')) return 'teamfight-ult';
  if (arch.has('cluster-nuke')) return 'cluster-nuke';
  return null;
}

function comboAdjustedScore(u: Unit, def: AbilityDef, now: number, score: number): number {
  if (!u.heroId || !u.lastAbilityCastId) return score;
  const combo = REG.heroes.get(u.heroId)?.combo;
  if (!combo) return score;
  let mult = 1;
  for (const c of combo) {
    if (c.after !== def.id || c.before !== u.lastAbilityCastId) continue;
    const window = c.windowSec ?? TUNING.ai.comboWindowSec;
    const age = now - u.lastAbilityCastAt;
    if (age < 0 || age > window) continue;
    mult = Math.max(mult, c.weight ?? TUNING.ai.comboWeight);
  }
  // §5.7: deeper-AI units lean into combo sequencing harder.
  if (mult > 1) mult = 1 + (mult - 1) * (1 + aiDepthBonus(u) * TUNING.ai.depthDisciplineGain);
  return score * mult;
}

function itemArchetypeBias(profile: CombatProfile, def: ItemDef): number {
  const archetypes = itemArchetypes(def);
  if (archetypes.size === 0) return 1;

  const roleWeights = (TUNING.ai.archetypeWeight[profile.role] ?? TUNING.ai.archetypeWeight.generalist) as Partial<Record<ItemArchetype, number>>;
  let roleMult = 1;
  for (const archetype of archetypes) roleMult = Math.max(roleMult, roleWeights[archetype] ?? 1);

  let playbookMult = 1;
  profile.playbook.reach.forEach((archetype, idx) => {
    if (!archetypes.has(archetype)) return;
    playbookMult = Math.max(playbookMult, 1.08 - Math.min(idx, 4) * 0.015);
  });

  return Math.min(1.6, roleMult * playbookMult);
}

function stepBelongsToUnit(step: ComboStep, u: Unit): boolean {
  return step.unitUid === undefined || step.unitUid === u.uid;
}

function planContainsUnitOrder(plan: ComboPlan, u: Unit, order: Order): boolean {
  return plan.steps.some((step) => stepBelongsToUnit(step, u) && comboStepMatchesOrder(step, order));
}

function plannedComboScore(u: Unit, cand: Scored, plan: ComboPlan | null): Scored {
  if (!plan) return cand;
  if (stepBelongsToUnit(plan.nextStep, u) && comboStepMatchesOrder(plan.nextStep, cand.order)) {
    return { ...cand, score: cand.score * TUNING.ai.combo.nextStepBonus };
  }
  if (planContainsUnitOrder(plan, u, cand.order)) {
    return { ...cand, score: Math.min(cand.score * TUNING.ai.combo.holdPayoffPenalty, TUNING.ai.castScoreFloor * 0.8) };
  }
  return cand;
}

function teamComboPlanForUnit(tm: TeamMind, u: Unit, focus: Unit | null): ComboPlan | null {
  const plan = tm.chains.find((chain) => chain.steps.some((step) => step.unitUid === u.uid));
  if (!plan) return null;
  if (!focus) return plan;
  const payoff = plan.steps.find((step) => step.unitUid === u.uid && step.role === 'payoff');
  if (payoff && comboSetupActiveForPlan(focus)) {
    return { ...plan, nextStep: payoff };
  }
  return plan;
}

function comboSetupActiveForPlan(focus: Unit): boolean {
  const s = focus.summary;
  if (s.stunned || s.rooted || s.silenced || s.hexed || s.disarmed || s.frozen || s.sleeping || s.cycloned || s.feared !== null || s.taunted !== null) return true;
  return (s.mods.magicResistPct ?? 0) < 0 || (s.mods.damageTakenReductionPct ?? 0) < 0 || (s.mods.armor ?? 0) < 0;
}

function scoreAbility(sim: Sim, u: Unit, slot: number, focus: Unit | null, profile: CombatProfile): Scored | null {
  const a = u.abilities[slot];
  if (!a || a.level <= 0) return null;
  const t = a.def.targeting;
  if (t === 'passive' || t === 'aura' || t === 'attack-modifier') return null;
  if (!u.abilityReady(slot, sim.time).ok) return null;
  const manaCost = u.manaCostOf(slot);
  const intent = intentOf(a.def, a.level);
  const archetypes = abilityArchetypes(a.def);
  const holdKind = holdKindOf(a.def);
  const finish = (score: number, order: Order, clusterCount = Infinity, hold: HoldKind = null): Scored => ({
    score: comboAdjustedScore(u, a.def, sim.time, finalAbilityScore(u, score, intent, order, focus, manaCost, clusterCount, hold)),
    order,
    slot
  });

  // toggle: switch on once enemies are close
  if (t === 'toggle') {
    if (a.toggled) return null;
    if (enemiesNear(sim, u, u.stats.attackRange + 320) === 0) return null;
    const order: Order = { kind: 'cast', slot };
    return finish(0.7 * profile.weights.aggression, order);
  }

  const w = profile.weights;
  const range = castRangeOf(a.def, u, a.level) * 1.1;

  // protective casts on a wounded ally (heal, shield, save buff)
  if (intent.affectsAlly && (intent.heal || intent.buff)) {
    const ally = lowestWoundedAlly(sim, u, range, TUNING.ai.saveAllyHpPct);
    if (!ally) return null;
    const need = 1 - ally.hp / Math.max(1, ally.stats.maxHp);
    let s = w.saveAllies * (0.5 + need);
    if (sim.time - ally.lastEnemyDamageAt < 1.5) s += 0.4; // actively under fire
    const order: Order = t === 'no-target' ? { kind: 'cast', slot } : { kind: 'cast', slot, uid: ally.uid };
    return finish(s, order);
  }

  // self / no-target steroid (BKB-style, Warcry): cast when a fight is on
  if (t === 'no-target' && intent.buff && !intent.offensive) {
    if (enemiesNear(sim, u, u.stats.attackRange + 320) === 0) return null;
    const order: Order = { kind: 'cast', slot };
    return finish(0.75 * w.aggression, order);
  }

  if (!intent.offensive && !intent.hardControl && !intent.softControl) return null;

  const controlW = intent.hardControl ? w.control : intent.softControl ? w.control * 0.6 : 0;

  // §6.3: a skillshot-line angles down a row — pick the aim direction that rakes the
  // most enemies, instead of clipping the single nearest body.
  if (archetypes.has('skillshot-line') && (t === 'skillshot' || t === 'point-target')) {
    const width = intent.radius || TUNING.ai.abilityArchetype.skillshotWidth;
    const line = bestLine(sim, u, range, width);
    if (line && line.count > 0) {
      const s = (w.aoe * (0.4 + line.count)) + controlW * 0.4 * line.count + (intent.offensive ? w.burst * 0.4 : 0);
      const order: Order = { kind: 'cast', slot, point: line.point };
      return finish(s, order, line.count, holdKind);
    }
  }

  // area effect: value the cluster it catches
  if (intent.aoe || t === 'ground-aoe') {
    if (t === 'no-target') {
      const count = enemiesNear(sim, u, intent.radius || 300);
      if (count === 0) return null;
      const s = (w.aoe * (0.4 + count)) + controlW * 0.4 * count;
      const order: Order = { kind: 'cast', slot };
      return finish(s, order, count, holdKind);
    }
    const cluster = bestCluster(sim, u, range, intent.radius || 300);
    if (!cluster || cluster.count === 0) return null;
    const s = (w.aoe * (0.4 + cluster.count)) + controlW * 0.4 * cluster.count;
    if (t === 'unit-target') {
      const tgt = bestOffensiveTarget(sim, u, focus, range);
      if (!tgt) return null;
      const order: Order = { kind: 'cast', slot, uid: tgt.uid };
      return finish(s, order, cluster.count, holdKind);
    }
    const order: Order = { kind: 'cast', slot, point: cluster.point };
    return finish(s, order, cluster.count, holdKind);
  }

  // single-target nuke / disable
  let target = bestOffensiveTarget(sim, u, focus, range, profile.playbook.aimAt);
  // §6.3: a single-lockdown spends on the enemy whose death most collapses their
  // formation — the team-mind's flank target (their exposed backline) — not the
  // nearest body, when that collapse target is reachable.
  let collapseTarget = false;
  if (archetypes.has('single-lockdown')) {
    const tm = sim.teamMind(u.team);
    const collapse = tm.flankTargetUid !== null ? sim.unit(tm.flankTargetUid) : undefined;
    if (collapse && collapse.alive && collapse.team !== u.team && !collapse.summary.untargetable &&
        collapse.isVisibleTo(u.team, sim.time) && dist(u.pos, collapse.pos) <= range) {
      target = collapse;
      collapseTarget = true;
    }
  }
  // §6.3: a single-lockdown / hard disable interrupts an enemy mid-channel — redirect
  // the lockdown onto the channeler whose pay-over-time we want to break.
  let channelInterrupt = false;
  if (intent.hardControl || a.def.piercesImmunity) {
    const aa = TUNING.ai.abilityArchetype;
    const channeler = enemyMidChannelInRange(sim, u, Math.min(range, aa.channelInterruptRange));
    if (channeler) { target = channeler; channelInterrupt = true; }
  }
  if (!target) return null;
  const value = targetValue(target);
  let s = (intent.offensive ? w.burst * value : 0) + controlW * (0.6 + dangerNorm(target));
  // interrupting a channel or mid-cast is high value
  const interrupting = channelInterrupt || ((intent.hardControl || a.def.piercesImmunity) && (target.castingUntil > sim.time || (target.channel && target.channel.until > sim.time)));
  if (interrupting) s += channelInterrupt ? TUNING.ai.abilityArchetype.channelInterruptBonus : 0.8;
  if (collapseTarget && !channelInterrupt) s += TUNING.ai.abilityArchetype.collapseTargetBonus;
  if (t === 'unit-target') {
    const order: Order = { kind: 'cast', slot, uid: target.uid };
    return finish(s, order);
  }
  const order: Order = { kind: 'cast', slot, point: { ...target.pos } };
  return finish(s, order);
}

// ---------- item actives (AI_OVERHAUL §2) ----------
// Hand-tuned considers cover high-risk defensive items first. Everything else
// falls back to the ability intent classifier so new active items get sane use
// without bespoke gambit rules.

function scoreItemByIntent(sim: Sim, u: Unit, slot: number, focus: Unit | null, profile: CombatProfile, bossBias = 1): Scored | null {
  if (!TUNING.ai.itemIntentFallback) return null;
  const def = REG.items.get(u.items[slot]?.defId ?? '');
  if (!def?.active) return null;
  const active = def.active;
  const archetypes = itemArchetypes(def);
  const intent = intentOf(active, 1);
  const t = active.targeting;
  const w = profile.weights;
  const ITEM = 1000 + slot;
  const range = castRangeOf(active, u, 1) * 1.1;
  const manaCost = active.manaCost?.[0] ?? 0;
  const finish = (score: number, order: Order, clusterCount = Infinity, hold: HoldKind = null): Scored => ({
    score: finalAbilityScore(u, bossBias * score * itemArchetypeBias(profile, def), intent, order, focus, manaCost, clusterCount, hold),
    order,
    slot: ITEM
  });

  if (intent.escape) {
    const pressured = u.hp / Math.max(1, u.stats.maxHp) < profile.retreatHpPct || enemiesNear(sim, u, 420) > 0;
    if (!pressured) return null;
    const awayFrom = focus && focus.team !== u.team ? focus.pos : u.pos;
    const dir = norm(sub(u.pos, awayFrom));
    const point = t === 'point-target' ? add(u.pos, scale(dir.x === 0 && dir.y === 0 ? v2(1, 0) : dir, 650)) : undefined;
    const order: Order = t === 'point-target' ? { kind: 'item', invSlot: slot, point } : { kind: 'item', invSlot: slot, uid: u.uid };
    return finish(TUNING.ai.itemScore.intentEscape * Math.max(0.8, w.survival), order);
  }

  if (intent.affectsAlly && (intent.heal || intent.buff)) {
    const ally = lowestWoundedAlly(sim, u, range, TUNING.ai.saveAllyHpPct);
    if (!ally) return null;
    const need = 1 - ally.hp / Math.max(1, ally.stats.maxHp);
    const order: Order = t === 'no-target' ? { kind: 'item', invSlot: slot } : { kind: 'item', invSlot: slot, uid: ally.uid };
    return finish(w.saveAllies * (0.55 + need), order);
  }

  if (t === 'no-target' && intent.buff && !intent.offensive) {
    if (enemiesNear(sim, u, u.stats.attackRange + 320) === 0) return null;
    const order: Order = { kind: 'item', invSlot: slot };
    return finish(0.7 * w.aggression, order);
  }

  const archetypeOffense = archetypes.has('nuke') || archetypes.has('amplify');
  const archetypeControl = archetypes.has('lockdown');
  if (!intent.offensive && !intent.hardControl && !intent.softControl && !archetypeOffense && !archetypeControl) return null;
  const controlW = intent.hardControl ? w.control : (intent.softControl || archetypeControl) ? w.control * 0.6 : 0;
  const amplifyW = archetypes.has('amplify') ? Math.max(w.burst, w.control * 0.6) : 0;

  if (intent.aoe || t === 'ground-aoe') {
    if (t === 'no-target') {
      const count = enemiesNear(sim, u, intent.radius || 300);
      if (count === 0) return null;
      const order: Order = { kind: 'item', invSlot: slot };
      const s = (w.aoe * (0.35 + count)) + controlW * 0.35 * count + amplifyW * (0.35 + count * 0.2);
      return finish(s, order, count, active.ult ? 'teamfight-ult' : null);
    }
    const cluster = bestCluster(sim, u, range, intent.radius || 300);
    if (!cluster || cluster.count === 0) return null;
    const s = (w.aoe * (0.35 + cluster.count)) + controlW * 0.35 * cluster.count + amplifyW * (0.35 + cluster.count * 0.2);
    if (t === 'unit-target') {
      const target = bestOffensiveTarget(sim, u, focus, range, profile.playbook.aimAt);
      if (!target) return null;
      const order: Order = { kind: 'item', invSlot: slot, uid: target.uid };
      return finish(s, order, cluster.count, active.ult ? 'teamfight-ult' : null);
    }
    const order: Order = { kind: 'item', invSlot: slot, point: cluster.point };
    return finish(s, order, cluster.count, active.ult ? 'teamfight-ult' : null);
  }

  const target = bestOffensiveTarget(sim, u, focus, range, profile.playbook.aimAt);
  if (!target) return null;
  const value = targetValue(target);
  let s = ((intent.offensive || archetypes.has('nuke')) ? w.burst * value : 0) + controlW * (0.6 + dangerNorm(target)) + amplifyW * (0.7 + dangerNorm(target));
  if ((intent.hardControl || active.piercesImmunity) && (target.castingUntil > sim.time || (target.channel && target.channel.until > sim.time))) s += TUNING.ai.itemScore.interruptBonus;
  const order: Order = t === 'unit-target' ? { kind: 'item', invSlot: slot, uid: target.uid } : { kind: 'item', invSlot: slot, point: { ...target.pos } };
  return finish(s, order);
}

function scoreItemActive(sim: Sim, u: Unit, slot: number, focus: Unit | null, profile: CombatProfile): Scored | null {
  const it = u.items[slot];
  if (!it) return null;
  const def = REG.items.get(it.defId);
  if (!def?.active) return null;
  if (!itemReady(it, def, u, sim.time).ok) return null;
  const w = profile.weights;
  const ITEM = 1000 + slot; // tie-break bucket so items lose tie with same-score abilities

  const is = TUNING.ai.itemScore;
  const ir = TUNING.ai.itemRange;
  const finish = (score: number, order: Order): Scored => ({
    score: score * itemArchetypeBias(profile, def),
    order,
    slot: ITEM
  });
  switch (it.defId) {
    case 'black-king-bar': {
      // pop magic immunity when a hard disable is landing or an enemy ult/channel is up nearby
      const fighting = enemiesNear(sim, u, u.stats.attackRange + 360) > 0;
      if (!fighting) return null;
      const threatened = incomingDisable(sim, u, 1000) || enemyCastSeen(sim, u, 'ult', 1100) || enemyCastSeen(sim, u, 'channel', 1100);
      if (!threatened) return null;
      return finish(is.bkb * Math.max(0.9, w.survival), { kind: 'item', invSlot: slot });
    }
    case 'force-staff': {
      // self-peel out of a melee crush when low
      if (u.hp / Math.max(1, u.stats.maxHp) > profile.retreatHpPct) return null;
      if (enemiesNear(sim, u, ir.forceFight) === 0) return null;
      return finish(is.force * Math.max(0.9, w.survival), { kind: 'item', invSlot: slot, uid: u.uid });
    }
    case 'glimmer-cape': {
      const ally = lowestWoundedAlly(sim, u, ir.glimmerAlly + u.stats.castRangeBonus, TUNING.ai.saveAllyHpPct);
      if (!ally) return null;
      const need = 1 - ally.hp / Math.max(1, ally.stats.maxHp);
      const underFire = sim.time - ally.lastEnemyDamageAt < 1.5 ? is.glimmerUnderFire : 0;
      return finish(w.saveAllies * (is.glimmer + need) + underFire, { kind: 'item', invSlot: slot, uid: ally.uid });
    }
    case 'mekansm': {
      const wounded = woundedAlliesNear(sim, u, ir.mekWounded, ir.mekWoundedPct);
      if (wounded < ir.mekMinWounded) return null;
      return finish(w.saveAllies * (is.mekBase + wounded * is.mekPer), { kind: 'item', invSlot: slot });
    }
    case 'euls-scepter': {
      const range = ir.euls + u.stats.castRangeBonus;
      const channeling = enemyChannelingInRange(sim, u, range);
      const target = channeling ?? bestOffensiveTarget(sim, u, focus, range, profile.playbook.aimAt);
      if (!target) return null;
      let s = w.control * (is.eulsBase + dangerNorm(target));
      if (channeling) s += is.interruptBonus; // interrupt
      return finish(s, { kind: 'item', invSlot: slot, uid: target.uid });
    }
    // §2 signature considers: area-mitigation guards pop for a clustered group that
    // is actually taking (or about to take) area damage, not on any lone body.
    case 'crimson-guard':
    case 'pipe-of-insight': {
      const grouped = clusteredAllies(sim, u, ir.teamGuardRadius);
      if (grouped < is.teamGuardMinAllies) return null;
      const threatened = sim.teamMind(u.team).spread || enemyCastSeen(sim, u, 'ult', 1100) || enemiesNear(sim, u, u.stats.attackRange + 360) >= 2;
      if (!threatened) return null;
      const base = it.defId === 'crimson-guard' ? is.crimson : is.pipe;
      return finish(base * Math.max(0.8, w.saveAllies) * (0.6 + grouped * 0.2), { kind: 'item', invSlot: slot });
    }
    // §2 Lotus Orb: spend Echo Shell to dispel-and-shield a disabled ally, not as a
    // generic heal on whoever is lowest — the dispel is the whole point of the timing.
    case 'lotus-orb': {
      const ally = mostDisabledAllyInRange(sim, u, ir.lotusRange + u.stats.castRangeBonus);
      if (!ally) return null;
      return finish(w.saveAllies * is.lotus * (1 + (1 - ally.hp / Math.max(1, ally.stats.maxHp)) * 0.5), { kind: 'item', invSlot: slot, uid: ally.uid });
    }
  }
  return scoreItemByIntent(sim, u, slot, focus, profile);
}

function scoreBossItemActive(sim: Sim, u: Unit, slot: number, focus: Unit | null, profile: CombatProfile): Scored | null {
  if (isDisabled(u.summary)) return null;
  const it = u.items[slot];
  if (!it) return null;
  const def = REG.items.get(it.defId);
  if (!def?.active) return null;
  if (!itemReady(it, def, u, sim.time).ok) return null;
  const ITEM = 1000 + slot;

  const is = TUNING.ai.itemScore;
  const ir = TUNING.ai.itemRange;
  // GAMBIT_AI_OVERHAUL Phase 3 §5: the boss posture biases which archetypes it reaches for.
  const archBias = bossArchetypeBias(u, def);
  switch (it.defId) {
    case 'black-king-bar': {
      if (u.summary.magicImmune) return null;
      const threatened = incomingDisable(sim, u, 1200) || enemyCastSeen(sim, u, 'ult', 1300) || enemyCastSeen(sim, u, 'channel', 1300);
      if (!threatened) return null;
      return { score: is.bossBkb * Math.max(0.9, profile.weights.survival) * archBias, order: { kind: 'item', invSlot: slot }, slot: ITEM };
    }
    case 'glimmer-cape': {
      if (u.summary.invisible || u.summary.fading) return null;
      const hpPct = u.hp / Math.max(1, u.stats.maxHp);
      if (hpPct > ir.bossGlimmerHpPct && sim.time - u.lastEnemyDamageAt > 1.5) return null;
      return { score: is.bossGlimmer * Math.max(0.8, profile.weights.survival) * archBias, order: { kind: 'item', invSlot: slot, uid: u.uid }, slot: ITEM };
    }
    case 'euls-scepter': {
      const range = ir.euls + u.stats.castRangeBonus;
      const target = enemyChannelingInRange(sim, u, range) ?? bestOffensiveTarget(sim, u, focus, range);
      if (!target) return null;
      return { score: is.bossEuls * Math.max(0.8, profile.weights.control) * archBias, order: { kind: 'item', invSlot: slot, uid: target.uid }, slot: ITEM };
    }
    case 'force-staff': {
      const hpPct = u.hp / Math.max(1, u.stats.maxHp);
      if (hpPct > ir.bossForceHpPct || enemiesNear(sim, u, 420) === 0) return null;
      return { score: is.bossForce * Math.max(0.8, profile.weights.survival) * archBias, order: { kind: 'item', invSlot: slot, uid: u.uid }, slot: ITEM };
    }
  }
  return scoreItemByIntent(sim, u, slot, focus, profile, is.bossIntentBias * archBias);
}

/**
 * Choose the best combat order for a unit that has acquired `focus`.
 * Returns the order, or null to let the caller fall back (e.g. attack-focus).
 */
export function chooseUtilityOrder(sim: Sim, u: Unit, focus: Unit | null): Order | null {
  const profile = combatProfile(u);
  let teamPlan: ComboPlan | null = null;
  let teamMind: TeamMind | null = null;

  if (u.ctrl.kind === 'gambit') {
    const tm = sim.teamMind(u.team);
    teamMind = tm;
    teamPlan = teamComboPlanForUnit(tm, u, focus);
    const scatter = raidSignatureScatterOrder(sim, u);
    if (scatter) return scatter;

    const spread = tm.spread ? spreadSpacingOrder(sim, u) : null;
    if (spread) return spread;

    const friendlyField = raidFriendlyFieldOrder(sim, u);
    if (friendlyField) return friendlyField;

    const stack = raidStackForHealOrder(sim, u);
    if (stack) return stack;

    // §4 save chain: the team's save-holder sequences a reposition save (Force Staff)
    // then a shield save (Glimmer) on the most-dived ally — one per tick, never both
    // at once. The per-item considers still cover the lone-save case.
    if (tm.saveHolderUid === null || tm.saveHolderUid === u.uid) {
      const savePlan = planSaveChain(sim, u);
      if (savePlan) return { kind: 'item', invSlot: savePlan.nextStep.slot, uid: savePlan.allyUid };
    }

    if (focus && !tm.engaged && shouldHoldBackForEngage(sim, u, focus, profile) && !urgentSupportAvailable(sim, u, profile)) {
      // §6.2 anchor gravity: a unit that would hold pre-engage instead drifts back
      // to its authored cell when displaced, so the formation re-forms. It never
      // preempts a cast (the hold branch is already the do-nothing path).
      return anchorReformOrder(sim, u, profile) ?? { kind: 'hold' };
    }

    // raid peel (AI_OVERHAUL §6): a frontliner redirects to an add threatening the backline
    const peel = raidPeelTarget(sim, u, profile);
    if (peel) focus = peel;

    // §6.1 formation peel: an assigned peeler intercepts the threat on its
    // protected backliner; else a committed diver routes onto the enemy flank.
    const protect = protectPeelTarget(sim, u, tm);
    if (protect) focus = protect;
    else {
      const flankT = flankFocus(sim, u, tm);
      if (flankT) focus = flankT;
    }
  }

  const comboPlan = teamPlan ?? (focus && (u.ctrl.kind === 'gambit' || u.ctrl.kind === 'boss') ? planUnitCombo(sim, u, focus) : null);
  let best: Scored | null = null;
  let plannedStepCovered = false;
  for (let slot = 0; slot < u.abilities.length; slot++) {
    const raw = scoreAbility(sim, u, slot, focus, profile);
    const cand = raw ? plannedComboScore(u, raw, comboPlan) : null;
    if (!cand) continue;
    if (comboPlan && comboStepMatchesOrder(comboPlan.nextStep, cand.order)) plannedStepCovered = true;
    if (!best || cand.score > best.score) best = cand; // lower slot wins ties (scanned first)
  }
  // item actives: gambit heroes use party/autobattler considers; raid bosses use
  // a narrower boss-brain subset for survivals and interrupts. Creeps carry none.
  if (u.ctrl.kind === 'gambit' || u.ctrl.kind === 'boss') {
    for (let slot = 0; slot < u.items.length; slot++) {
      const raw = u.ctrl.kind === 'boss'
        ? scoreBossItemActive(sim, u, slot, focus, profile)
        : scoreItemActive(sim, u, slot, focus, profile);
      if (raw && teamMind && teamMind.saveHolderUid !== null && teamMind.saveHolderUid !== u.uid && itemOrderUsesAssignedSave(u, raw.order)) continue;
      // §5 role assignments: a unit that is neither the team's designated initiator
      // nor lockdown source — and is not part of a committed cross-unit chain —
      // holds its engage/lockdown item so two units never blow two on the same jump.
      if (raw && teamMind && teamPlan === null && itemOrderViolatesRole(u, raw.order, teamMind)) continue;
      const cand = raw ? plannedComboScore(u, raw, comboPlan) : null;
      if (!cand) continue;
      if (comboPlan && comboStepMatchesOrder(comboPlan.nextStep, cand.order)) plannedStepCovered = true;
      if (!best || cand.score > best.score) best = cand;
    }
  }
  if (comboPlan && stepBelongsToUnit(comboPlan.nextStep, u) && !plannedStepCovered) {
    const order = orderForComboStep(sim, u, comboPlan);
    if (order && (!best || comboPlan.score > best.score) && comboPlan.score >= TUNING.ai.castScoreFloor) return order;
  }
  if (best && best.score >= TUNING.ai.castScoreFloor) return best.order;

  if (!focus) return null;

  const hostileField = raidHostileFieldOrder(sim, u, focus, profile);
  if (hostileField) return hostileField;

  // ranged kiters keep spacing when an enemy crowds them, but still trade — except
  // when the boss is enraged, when the party burns instead of giving ground (§6).
  if (profile.kiteDistance > 0 && !enemyBossEnraged(sim, u)) {
    const d = dist(u.pos, focus.pos);
    if (d < profile.kiteDistance * TUNING.ai.kiteCloseFrac) {
      const away = norm(sub(u.pos, focus.pos));
      const dir = away.x === 0 && away.y === 0 ? v2(-1, 0) : away;
      return { kind: 'move', point: add(u.pos, scale(dir, profile.kiteDistance - d + TUNING.ai.kiteStepBonus)) };
    }
  }
  return { kind: 'attack-unit', uid: focus.uid };
}

// §6.2: pull a displaced gambit unit back toward its board cell when no fight is
// on it, so the authored formation re-forms. Narrow by design — it never fires
// while an enemy is in reach or the unit is hurt, so it can't override combat.
function anchorReformOrder(sim: Sim, u: Unit, profile: CombatProfile): Order | null {
  const home = u.ctrl.homePos;
  if (!home) return null;
  const aa = TUNING.ai.abilityArchetype;
  if (dist(u.pos, home) <= aa.anchorReformRadius) return null;
  if (enemiesNear(sim, u, u.stats.attackRange + 200) > 0) return null;
  if (u.hp / Math.max(1, u.stats.maxHp) < profile.retreatHpPct) return null;
  return { kind: 'move', point: { ...home } };
}

// §6.1: an assigned peeler focuses the enemy most threatening its protected
// backliner (the channeling/ exposed caster), so it peels instead of chasing.
function protectPeelTarget(sim: Sim, u: Unit, tm: TeamMind): Unit | null {
  const protectedUid = tm.protectAssignments[u.uid];
  if (protectedUid === undefined) return null;
  const ally = sim.unit(protectedUid);
  if (!ally || !ally.alive) return null;
  const radius = TUNING.ai.formation.peelRadius;
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const e of sim.unitsArr) {
    if (!e.alive || e.team === u.team || e.kind === 'npc' || e.kind === 'ward') continue;
    if (e.summary.untargetable || !e.isVisibleTo(u.team, sim.time)) continue;
    const d = dist(e.pos, ally.pos);
    if (d > radius) continue;
    if (d < bestD || (d === bestD && (best === null || e.uid < best.uid))) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

// §6.1: a committed diver (initiator/escape) routes onto the enemy's exposed
// backliner — the flank target the team-mind named — instead of the front body.
function flankFocus(sim: Sim, u: Unit, tm: TeamMind): Unit | null {
  if (tm.flankTargetUid === null || !tm.engaged) return null;
  const roles = u.heroId ? (REG.heroes.get(u.heroId)?.roles ?? []) : [];
  if (!roles.includes('initiator') && !roles.includes('escape')) return null;
  const t = sim.unit(tm.flankTargetUid);
  if (!t || !t.alive || t.team === u.team || t.summary.untargetable) return null;
  if (!t.isVisibleTo(u.team, sim.time)) return null;
  if (dist(u.pos, t.pos) > TUNING.ai.formation.flankRange) return null;
  return t;
}

function itemOrderUsesAssignedSave(u: Unit, order: Order): boolean {
  if (order.kind !== 'item') return false;
  const def = REG.items.get(u.items[order.invSlot]?.defId ?? '');
  if (!def) return false;
  const arch = itemArchetypes(def);
  return arch.has('save') || arch.has('sustain') || arch.has('cleanse');
}

/**
 * §5 duplicate-role suppression. An engage item (initiation) used by a non-initiator,
 * or a pure-lockdown item used by a non-lockdown-source, is held — so the team commits
 * one Blink and one chain stun on a jump, not five. Items that double as a save/escape
 * or a nuke keep their other uses (Eul's still self-escapes; Gleipnir still nukes).
 */
function itemOrderViolatesRole(u: Unit, order: Order, tm: TeamMind): boolean {
  if (order.kind !== 'item') return false;
  const def = REG.items.get(u.items[order.invSlot]?.defId ?? '');
  if (!def) return false;
  const arch = itemArchetypes(def);
  if (arch.has('initiation') && !arch.has('save') && tm.initiatorUid !== null && tm.initiatorUid !== u.uid) {
    return true;
  }
  if (arch.has('lockdown') && !arch.has('save') && !arch.has('escape') && !arch.has('nuke') && !arch.has('cleanse') &&
      tm.lockdownUid !== null && tm.lockdownUid !== u.uid) {
    return true;
  }
  return false;
}

function raidFriendlyFieldOrder(sim: Sim, u: Unit): Order | null {
  if (!bossPresent(sim, u)) return null;
  const hpPct = u.hp / Math.max(1, u.stats.maxHp);
  const depthBonus = aiDepthBonus(u);
  const stackHpPct = TUNING.ai.raid.stackHpPct + depthBonus * TUNING.ai.raid.stackHpPctPerDepth;
  if (hpPct >= stackHpPct) return null;

  let best: Unit | null = null;
  let bestD = Infinity;
  let bestRadius = 0;
  for (const ally of sim.unitsArr) {
    if (!ally.alive || ally.team !== u.team || ally.kind !== 'hero') continue;
    const radius = friendlyFieldRadius(ally);
    if (radius <= 0) continue;
    const d = dist2(u.pos, ally.pos);
    if (d <= radius * radius) return null;
    const reach = TUNING.ai.raid.stackRange + depthBonus * TUNING.ai.raid.stackRangePerDepth;
    if (d > reach * reach) continue;
    if (d < bestD || (d === bestD && (best === null || ally.uid < best.uid))) {
      best = ally;
      bestD = d;
      bestRadius = radius;
    }
  }
  if (!best) return null;
  void bestRadius;
  return { kind: 'move', point: { ...best.pos } };
}

function raidHostileFieldOrder(sim: Sim, u: Unit, focus: Unit, profile: CombatProfile): Order | null {
  if (!bossPresent(sim, u) || profile.posture === 'backline') return null;
  const radius = hostileFieldRadius(u);
  if (radius <= 0) return null;
  const d = dist(u.pos, focus.pos);
  if (d <= radius * 0.85 || d > radius + 520) return null;
  const dir = norm(sub(focus.pos, u.pos));
  const point = add(u.pos, scale(dir.x === 0 && dir.y === 0 ? v2(1, 0) : dir, Math.min(320, d - radius * 0.75)));
  return { kind: 'move', point };
}

function friendlyFieldRadius(u: Unit): number {
  let radius = 0;
  for (const it of u.items) {
    if (!it) continue;
    const def = REG.items.get(it.defId);
    if (!def?.aura || def.aura.affects !== 'allies') continue;
    if (!itemArchetypes(def).has('field')) continue;
    if (typeof def.aura.radius === 'number') radius = Math.max(radius, def.aura.radius);
  }
  return radius;
}

function hostileFieldRadius(u: Unit): number {
  let radius = 0;
  for (const it of u.items) {
    if (!it) continue;
    const def = REG.items.get(it.defId);
    if (!def?.aura || def.aura.affects !== 'enemies') continue;
    if (!itemArchetypes(def).has('field')) continue;
    if (typeof def.aura.radius === 'number') radius = Math.max(radius, def.aura.radius);
  }
  return radius;
}

/**
 * Defend a dived ally (the `peel` gambit action, COMBAT_OVERHAUL §3.2). Prefers the
 * raid frontline-peel target (an add menacing the backline); otherwise finds the
 * most-pressured friendly hero (lowest HP with an enemy crowding it) and bodies the
 * nearest enemy to it. Returns null when no ally needs peeling. Deterministic: ties
 * break by uid.
 */
export function peelOrder(sim: Sim, u: Unit): Order | null {
  const raidAdd = raidPeelTarget(sim, u, combatProfile(u));
  if (raidAdd) return { kind: 'attack-unit', uid: raidAdd.uid };

  const r = TUNING.ai.peelDiveRadius;
  let ally: Unit | null = null;
  let allyPct = Infinity;
  for (const a of sim.unitsArr) {
    if (!a.alive || a === u || a.team !== u.team || a.kind !== 'hero') continue;
    let dived = false;
    sim.forEachNearbyUnit(a.pos, r + 40, (e) => {
      if (dived || !enemyCandidate(sim, u, e)) return;
      if (dist2(e.pos, a.pos) <= r * r) dived = true;
    });
    if (!dived) continue;
    const pct = a.hp / Math.max(1, a.stats.maxHp);
    if (pct < allyPct || (pct === allyPct && (ally === null || a.uid < ally.uid))) { allyPct = pct; ally = a; }
  }
  if (!ally) return null;

  const peerAlly: Unit = ally;
  let diver: Unit | null = null;
  let diverD = Infinity;
  sim.forEachNearbyUnit(peerAlly.pos, r + 40, (e) => {
    if (!enemyCandidate(sim, u, e)) return;
    const d = dist2(e.pos, peerAlly.pos);
    if (d > r * r) return;
    if (d < diverD || (d === diverD && (diver === null || e.uid < diver.uid))) { diverD = d; diver = e; }
  });
  if (diver) return { kind: 'attack-unit', uid: (diver as Unit).uid };
  return { kind: 'move', point: { ...peerAlly.pos } };
}

/** Spread response from team-mind: step out if another ally is stacked on top of us. */
export function spreadSpacingOrder(sim: Sim, u: Unit): Order | null {
  let nearestPos: Vec2 | null = null;
  let nearestD = Infinity;
  sim.forEachNearbyUnit(u.pos, 300, (a) => {
    if (!a.alive || a === u || a.team !== u.team || a.kind === 'npc') return;
    const d = dist2(a.pos, u.pos);
    if (d < nearestD) { nearestD = d; nearestPos = { ...a.pos }; }
  });
  if (!nearestPos || nearestD > 260 * 260) return null;
  const away = norm(sub(u.pos, nearestPos));
  const dir = away.x === 0 && away.y === 0 ? v2(1, 0) : away;
  return { kind: 'move', point: add(u.pos, scale(dir, 320)) };
}

/**
 * Engage sequencing from team-mind: backliners do not walk into danger before a
 * frontline ally has opened the fight.
 */
function shouldHoldBackForEngage(sim: Sim, u: Unit, focus: Unit, profile: CombatProfile): boolean {
  if (profile.posture !== 'backline') return false;
  if (dist(u.pos, focus.pos) <= u.stats.attackRange * TUNING.ai.engageRangeMult) return false;
  for (const ally of sim.unitsArr) {
    if (!ally.alive || ally === u || ally.team !== u.team || ally.kind !== 'hero') continue;
    if (combatProfile(ally).posture !== 'frontline') continue;
    if (dist2(ally.pos, focus.pos) < dist2(u.pos, focus.pos)) return true;
  }
  return false;
}

function urgentSupportAvailable(sim: Sim, u: Unit, profile: CombatProfile): boolean {
  if (profile.weights.saveAllies < 0.8) return false;
  if (lowestWoundedAlly(sim, u, 850 + u.stats.castRangeBonus, TUNING.ai.saveAllyHpPct)) return true;
  return woundedAlliesNear(sim, u, 750, 0.7) >= 2;
}

// ---------- team-mind (AI_OVERHAUL §1, Layer 1) ----------

/** How good a single target is for the *whole team* to converge on. */
function teamFocusScore(target: Unit, allies: Unit[]): number {
  let sumDist = 0;
  let near = 0;
  for (const a of allies) {
    const d = dist(a.pos, target.pos);
    sumDist += d;
    if (d < 1100) near++;
  }
  const avgDistNorm = allies.length > 0 ? sumDist / allies.length / 4000 : 1;
  const hpPct = target.hp / Math.max(1, target.stats.maxHp);
  const heroBias = target.kind === 'hero' ? 0.5 : 0;
  return (1 - hpPct) * 1.0 + dangerNorm(target) * 0.9 + heroBias + near * 0.15 - avgDistNorm * 0.5;
}

function enemyAoeOnTeam(sim: Sim, team: Team, allies: Unit[]): boolean {
  for (const z of sim.zones) {
    if (z.team === team || !z.tickEffects) continue;
    const harms = z.tickEffects.some((e) => e.kind === 'damage') && z.tickAffects !== 'allies';
    if (!harms) continue;
    const r = (z.radius ?? 0) + 220;
    for (const a of allies) {
      const c = z.pos ?? a.pos;
      if (dist2(a.pos, c) <= r * r) return true;
    }
  }
  return false;
}

/**
 * Compute a team's shared focus, engage state, and spread flag. Sticky: the held
 * focus survives unless a challenger beats it by TUNING.ai.focusStickiness, which
 * stops the whole team jittering between targets tick to tick.
 */
export function computeTeamMind(sim: Sim, team: Team, prev: TeamMind | null): TeamMind {
  const allies: Unit[] = [];
  const enemies: Unit[] = [];
  for (const u of sim.unitsArr) {
    if (!u.alive || u.kind === 'npc' || u.kind === 'ward') continue;
    if (u.team === team) allies.push(u);
    else enemies.push(u);
  }

  let best: Unit | null = null;
  let bestScore = -Infinity;
  for (const e of enemies) {
    if (!enemyCandidate(sim, allies[0] ?? e, e) || e.team === team) continue;
    if (!e.isVisibleTo(team, sim.time)) continue;
    const score = teamFocusScore(e, allies);
    if (score > bestScore || (score === bestScore && (best === null || e.uid < best.uid))) {
      bestScore = score;
      best = e;
    }
  }

  // stickiness: keep the previously held focus unless clearly out-valued
  if (prev && prev.focusUid !== null) {
    const held = sim.unit(prev.focusUid);
    if (held && held.alive && held.team !== team && !held.summary.untargetable && held.isVisibleTo(team, sim.time)) {
      const heldScore = teamFocusScore(held, allies);
      if (!best || (best.uid !== held.uid && bestScore < heldScore * TUNING.ai.focusStickiness)) {
        best = held;
        bestScore = heldScore;
      }
    }
  }

  let engaged = false;
  if (best) {
    for (const a of allies) {
      if (dist(a.pos, best.pos) < a.stats.attackRange + 260) { engaged = true; break; }
      if (sim.time - a.lastDealtDamageAt < 1.5 || sim.time - a.lastEnemyDamageAt < 1.5) { engaged = true; break; }
    }
  }

  const teamCombo = planTeamCombos(sim, team, best);
  const formation = computeFormation(sim, team, allies, enemies);
  return {
    focusUid: best ? best.uid : null,
    focusScore: best ? bestScore : -Infinity,
    engaged,
    spread: enemyAoeOnTeam(sim, team, allies),
    saveHolderUid: teamCombo.saveHolderUid,
    initiatorUid: teamCombo.initiatorUid,
    lockdownUid: teamCombo.lockdownUid,
    chains: teamCombo.chains,
    frontLineUids: formation.frontLineUids,
    backlineUids: formation.backlineUids,
    protectAssignments: formation.protectAssignments,
    flankTargetUid: formation.flankTargetUid,
    computedTick: sim.tickCount
  };
}

// ============================================================
// Formation posture (AUTOBATTLER_OVERHAUL §6.1). Pure reads over positions,
// roles, and ability archetypes — no board object needed at read time, since
// homePos already seated the five. Splits each side into a front line and a
// backline, ties a peeler to the most-exposed (channeling) backliner, and
// names the enemy's softest backliner as the flank target.
// ============================================================

const BACK_ARCHETYPES: ReadonlySet<AbilityArchetype> = new Set<AbilityArchetype>([
  'channel', 'cluster-nuke', 'team-buff', 'skillshot-line'
]);

function heroArchetypeSet(u: Unit): Set<AbilityArchetype> {
  const out = new Set<AbilityArchetype>();
  if (!u.heroId) return out;
  const def = REG.heroes.get(u.heroId);
  if (!def) return out;
  for (const a of def.abilities) for (const x of abilityArchetypes(a)) out.add(x);
  return out;
}

function isFrontliner(u: Unit): boolean {
  const roles = u.heroId ? (REG.heroes.get(u.heroId)?.roles ?? []) : [];
  if (roles.includes('durable') || roles.includes('initiator')) return true;
  return u.stats.attackRange <= 150 && roles.length === 0; // melee creep bodies hold the front
}

function isBackliner(u: Unit): boolean {
  if (isFrontliner(u)) return false;
  const roles = u.heroId ? (REG.heroes.get(u.heroId)?.roles ?? []) : [];
  if (roles.includes('support') || roles.includes('nuker') || roles.includes('carry')) return true;
  if (u.stats.attackRange >= 550) return true;
  const arch = heroArchetypeSet(u);
  for (const a of BACK_ARCHETYPES) if (arch.has(a)) return true;
  return false;
}

function isChanneling(sim: Sim, u: Unit): boolean {
  return u.channel != null && u.channel.until > sim.time;
}

function nearestEnemyDist(u: Unit, enemies: Unit[]): number {
  let best = Infinity;
  for (const e of enemies) best = Math.min(best, dist(u.pos, e.pos));
  return best;
}

interface FormationRead {
  frontLineUids: number[];
  backlineUids: number[];
  protectAssignments: Record<number, number>;
  flankTargetUid: number | null;
}

function computeFormation(sim: Sim, team: Team, allies: Unit[], enemies: Unit[]): FormationRead {
  const heroAllies = allies.filter((a) => a.kind === 'hero' || a.kind === 'creep');
  const front = heroAllies.filter(isFrontliner);
  const back = heroAllies.filter(isBackliner);

  // most-exposed backliner first; a channeling ally gets the authored save bonus
  // from tuning so the "protect the channel" priority is visible and tunable.
  const saveBonus = TUNING.ai.abilityArchetype.friendlyChannelSaveBonus;
  const needy = [...back].sort((a, b) => {
    const ca = isChanneling(sim, a) ? saveBonus : 0;
    const cb = isChanneling(sim, b) ? saveBonus : 0;
    if (ca !== cb) return cb - ca;
    const da = nearestEnemyDist(a, enemies);
    const db = nearestEnemyDist(b, enemies);
    if (da !== db) return da - db; // closer to the enemy = more exposed
    return a.uid - b.uid;
  });

  // tie each free peeler (a frontliner) to the most-exposed uncovered backliner.
  const protectAssignments: Record<number, number> = {};
  const usedPeelers = new Set<number>();
  for (const b of needy) {
    let bestPeeler: Unit | null = null;
    let bestD = Infinity;
    for (const p of front) {
      if (usedPeelers.has(p.uid)) continue;
      const d = dist(p.pos, b.pos);
      if (d < bestD || (d === bestD && (bestPeeler === null || p.uid < bestPeeler.uid))) {
        bestD = d;
        bestPeeler = p;
      }
    }
    if (!bestPeeler) break;
    usedPeelers.add(bestPeeler.uid);
    protectAssignments[bestPeeler.uid] = b.uid;
  }

  // the enemy's softest backliner is the flank target (the assassin read).
  const enemyBack = enemies.filter((e) => isBackliner(e) && e.isVisibleTo(team, sim.time));
  let flank: Unit | null = null;
  let flankScore = -Infinity;
  for (const e of enemyBack) {
    const arch = heroArchetypeSet(e);
    const value =
      (arch.has('team-buff') ? 2 : 0) +
      (arch.has('cluster-nuke') || arch.has('channel') ? 1.5 : 0) +
      (1 - e.hp / Math.max(1, e.stats.maxHp));
    if (value > flankScore || (value === flankScore && (flank === null || e.uid < flank.uid))) {
      flankScore = value;
      flank = e;
    }
  }

  return {
    frontLineUids: front.map((u) => u.uid),
    backlineUids: back.map((u) => u.uid),
    protectAssignments,
    flankTargetUid: flank ? flank.uid : null
  };
}

/**
 * Per-unit focus pick (AI_OVERHAUL §0/§3): threat-, value-, and distance-aware,
 * replacing the old low-hp-and-near heuristic. The team-mind (A1) layers a shared
 * focus on top of this.
 */
export function pickUtilityFocus(sim: Sim, u: Unit, leashOk?: (o: Unit) => boolean): Unit | null {
  let best: Unit | null = null;
  let bestScore = -Infinity;
  for (const o of sim.unitsArr) {
    if (!enemyCandidate(sim, u, o)) continue;
    if (leashOk && !leashOk(o)) continue;
    const hpPct = o.hp / Math.max(1, o.stats.maxHp);
    const distNorm = dist(o.pos, u.pos) / 4000;
    const heroBias = o.kind === 'hero' ? 0.5 : 0;
    const score = (1 - hpPct) * 1.0 + dangerNorm(o) * 0.8 + heroBias - distNorm * 0.7;
    if (score > bestScore || (score === bestScore && (best === null || o.uid < best.uid))) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}
