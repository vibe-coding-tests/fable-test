import { TUNING } from '../data/tuning';
import { abilityVal } from './values';
import { itemReady } from './items';
import { itemArchetypes } from './item-archetype';
import { bossArchetypeBias } from './boss-brain';
import { elementForItemHit, isActiveElement, reactionFor, type ActiveElement } from './resonance';
import { dist2, norm, scale, sub, add, v2 } from './math2d';
import { REG } from './registry';
import type { Sim } from './sim';
import type { Unit } from './unit';
import type { AbilityDef, EffectNode, GambitTargetMode, ItemDef, Order, StatusId, TagArchetype, Vec2 } from './types';

type ComboStepRole = 'enabler' | 'amplifier' | 'immunity' | 'payoff';

export interface ComboStep {
  kind: 'cast' | 'item';
  slot: number;
  unitUid?: number;
  role: ComboStepRole;
  targetMode: GambitTargetMode;
  windowSec: number;
}

export interface ComboPlan {
  steps: ComboStep[];
  targetUid: number;
  score: number;
  nextStep: ComboStep;
}

export interface TeamComboPlan {
  saveHolderUid: number | null;
  initiatorUid: number | null;
  lockdownUid: number | null;
  chains: ComboPlan[];
}

interface ComboCandidate extends ComboStep {
  def: AbilityDef;
  score: number;
  range: number;
  manaCost: number;
  initiationReach: number;
  element: ActiveElement | null;
}

interface AbilityComboIntent {
  offensive: boolean;
  hardControl: boolean;
  softControl: boolean;
  amplify: boolean;
  initiation: boolean;
  aoe: boolean;
}

const HARD_DISABLES: ReadonlySet<StatusId> = new Set<StatusId>([
  'stun', 'root', 'hex', 'fear', 'sleep', 'frozen', 'cyclone'
]);
const SOFT_DISABLES: ReadonlySet<StatusId> = new Set<StatusId>([
  'silence', 'slow', 'disarm', 'blind', 'break'
]);
const SETUP_TAGS: ReadonlySet<TagArchetype> = new Set<TagArchetype>(['Lockdown', 'Gather', 'Soak']);

export function planUnitCombo(sim: Sim, u: Unit, focus: Unit): ComboPlan | null {
  if (!validFocus(sim, u, focus)) return null;

  const candidates = comboCandidates(sim, u, focus);
  const payoffs = candidates.filter((c) => c.role === 'payoff');
  if (payoffs.length === 0) return null;

  const plans: ComboPlan[] = [];
  const consider = (steps: ComboCandidate[], score: number) => {
    const plan = buildPlan(steps, focus.uid, score, nextStepFor(sim, focus, steps));
    if (plan) plans.push(plan);
  };

  // payoff-only: an opening already exists (CC / amplify), or a live elemental soak
  // on the focus whose element this payoff will react with (§4 element node).
  for (const payoff of payoffs) {
    if (!canReachStep(u, focus, payoff, 0)) continue;
    if (!comboSetupActive(sim, focus) && !focusReactsWith(sim, focus, payoff.element) && !(recentInitiationActive(sim, u) && u.summary.magicImmune)) continue;
    consider([payoff], payoff.score * reactionMult(sim, focus, [], payoff));
  }

  const baseSetups = candidates.filter((c) => c.role === 'enabler' || c.role === 'amplifier');
  const immunities = candidates.filter((c) => c.role === 'immunity');
  for (const payoff of payoffs) {
    const setups = setupOptionsFor(baseSetups, candidates, payoff);
    for (const setup of setups) {
      if (sameAction(setup, payoff)) continue;
      const reachBonus = setup.role === 'enabler' ? setup.initiationReach : 0;
      if (!canReachStep(u, focus, setup, 0)) continue;
      if (!canReachStep(u, focus, payoff, reachBonus)) continue;
      if (!canPayPlan(u, [setup, payoff])) continue;
      if (
        comboChainLen(u) >= 3 &&
        setup.role === 'enabler' &&
        setup.initiationReach > 0 &&
        enemyReplyLoaded(sim, u, focus) &&
        immunities.some((immune) =>
          !sameAction(setup, immune) &&
          !sameAction(immune, payoff) &&
          canReachStep(u, focus, immune, reachBonus) &&
          canPayPlan(u, [setup, immune, payoff])
        )
      ) {
        continue;
      }
      consider([setup, payoff], chainScore([setup], payoff, reactionMult(sim, focus, [setup], payoff)));
    }
  }

  // §4 depth: deeper AI commits to the full enabler→amplifier→payoff chain,
  // or an initiator's enabler→immunity→payoff chain, budgeting mana and reach
  // across all three before spending the enabler.
  if (comboChainLen(u) >= 3) {
    for (const payoff of payoffs) {
      const setups = setupOptionsFor(baseSetups, candidates, payoff);
      const enablers = setups.filter((c) => c.role === 'enabler');
      const amplifiers = setups.filter((c) => c.role === 'amplifier');
      for (const enabler of enablers) {
        if (!canReachStep(u, focus, enabler, 0)) continue;
        const reachBonus = enabler.initiationReach;
        for (const amp of amplifiers) {
          if (sameAction(enabler, amp) || sameAction(enabler, payoff) || sameAction(amp, payoff)) continue;
          if (!canReachStep(u, focus, amp, reachBonus)) continue;
          if (!canReachStep(u, focus, payoff, reachBonus)) continue;
          if (!canPayPlan(u, [enabler, amp, payoff])) continue;
          consider([enabler, amp, payoff], chainScore([enabler, amp], payoff, reactionMult(sim, focus, [enabler, amp], payoff)));
        }
      }
      for (const enabler of enablers.filter((c) => c.initiationReach > 0)) {
        if (!canReachStep(u, focus, enabler, 0)) continue;
        const reachBonus = enabler.initiationReach;
        for (const immune of immunities) {
          if (sameAction(enabler, immune) || sameAction(enabler, payoff) || sameAction(immune, payoff)) continue;
          if (!canReachStep(u, focus, immune, reachBonus)) continue;
          if (!canReachStep(u, focus, payoff, reachBonus)) continue;
          if (!enemyReplyLoaded(sim, u, focus)) continue;
          if (!canPayPlan(u, [enabler, immune, payoff])) continue;
          consider([enabler, immune, payoff], chainScore([enabler, immune], payoff, reactionMult(sim, focus, [enabler], payoff)));
        }
      }
    }
  }

  // Rebuild-each-tick bridge for initiation items: Blink itself leaves no status
  // on the focus, so the caster's recent initiation item is the live opening that
  // lets BKB become the next step before the payoff.
  if (recentInitiationActive(sim, u) && enemyReplyLoaded(sim, u, focus)) {
    for (const payoff of payoffs) {
      if (!canReachStep(u, focus, payoff, 0)) continue;
      for (const immune of immunities) {
        if (sameAction(immune, payoff)) continue;
        if (!canReachStep(u, focus, immune, 0)) continue;
        if (!canPayPlan(u, [immune, payoff])) continue;
        consider([immune, payoff], chainScore([immune], payoff, reactionMult(sim, focus, [], payoff)));
      }
    }
  }

  plans.sort((a, b) => b.score - a.score || planTieKey(a).localeCompare(planTieKey(b)));
  const best = plans[0];
  return best && best.score >= TUNING.ai.combo.minScore ? best : null;
}

export function planTeamCombos(sim: Sim, team: number, focus: Unit | null): TeamComboPlan {
  const allies = sim.unitsArr
    .filter((u) => u.alive && u.team === team && u.kind === 'hero')
    .sort((a, b) => a.uid - b.uid);
  const out: TeamComboPlan = {
    saveHolderUid: pickSaveHolder(sim, allies),
    initiatorUid: null,
    lockdownUid: null,
    chains: []
  };
  if (!focus || allies.length === 0) return out;
  if (!focus.alive || focus.team === team || focus.summary.untargetable || focus.summary.magicImmune || !focus.isVisibleTo(team, sim.time)) return out;

  const allSteps = allies.flatMap((u) => comboCandidates(sim, u, focus));
  const enablers = allSteps.filter((s) => s.role === 'enabler');
  const amplifiers = allSteps.filter((s) => s.role === 'amplifier');
  const payoffs = allSteps.filter((s) => s.role === 'payoff');

  // default assignments — used when no committed chain claims the role.
  out.initiatorUid = enablers.find((s) => s.initiationReach > 0)?.unitUid ?? null;
  out.lockdownUid = enablers.find((s) => s.initiationReach <= 0)?.unitUid ?? null;

  // Build every cross-unit chain candidate: a setup from one unit feeding a payoff
  // from another, optionally amplified by a third. §5 wants several wombos at once,
  // so we rank them and greedily commit the best non-overlapping chains.
  const ownerReaches = (step: ComboCandidate, bonus = 0): boolean => {
    const owner = sim.unit(step.unitUid ?? -1);
    return !!owner && canReachStep(owner, focus, step, bonus) && canPayPlan(owner, [step]);
  };
  const built: { steps: ComboCandidate[]; score: number }[] = [];
  for (const setup of enablers) {
    if (!ownerReaches(setup)) continue;
    for (const payoff of payoffs) {
      if (payoff.unitUid === setup.unitUid || !ownerReaches(payoff)) continue;
      const amp = amplifiers.find(
        (a) => a.unitUid !== setup.unitUid && a.unitUid !== payoff.unitUid && ownerReaches(a)
      );
      const setupsArr = amp ? [setup, amp] : [setup];
      const mult = reactionMult(sim, focus, setupsArr, payoff);
      built.push({ steps: [...setupsArr, payoff], score: chainScore(setupsArr, payoff, mult) });
    }
  }
  built.sort((a, b) => b.score - a.score || chainKey(a.steps).localeCompare(chainKey(b.steps)));

  const used = new Set<number>();
  const committed: ComboCandidate[][] = [];
  for (const ch of built) {
    if (ch.score < TUNING.ai.combo.minScore) break;
    const owners = ch.steps.map((s) => s.unitUid ?? -1);
    if (owners.some((o) => used.has(o))) continue;
    committed.push(ch.steps);
    const plan = buildPlan(ch.steps, focus.uid, ch.score, nextStepFor(sim, focus, ch.steps));
    if (plan) out.chains.push(plan);
    for (const o of owners) used.add(o);
    if (out.chains.length >= TUNING.ai.combo.maxTeamChains) break;
  }

  // Role assignments prefer a committed chain's owner over a loose default
  // (deterministic: lowest uid wins among committed owners of the same role).
  const committedSteps = committed.flat();
  const committedInitiator = lowestOwner(committedSteps.filter((s) => s.role === 'enabler' && s.initiationReach > 0));
  const committedLockdown = lowestOwner(committedSteps.filter((s) => s.role === 'enabler' && s.initiationReach <= 0));
  if (committedInitiator !== null) out.initiatorUid = committedInitiator;
  if (committedLockdown !== null) out.lockdownUid = committedLockdown;
  return out;
}

// ============================================================
// Save chain (GAMBIT_AI_OVERHAUL §4 worked example): two saves on a dived ally,
// sequenced rather than fired on the same tick. A reposition save (Force Staff)
// breaks the crush first; once the ally is out, a shield save (Glimmer Cape)
// covers the chase on a later tick. Rebuilt each tick, like the combo planner:
// the ally's live state (still crushed? still under fire?) is the only memory.
// ============================================================

export interface SaveStep {
  kind: 'item';
  slot: number;
  role: 'reposition' | 'shield';
}

export interface SavePlan {
  allyUid: number;
  steps: SaveStep[];
  nextStep: SaveStep;
}

/** An item active that physically moves its target (Force Staff, Wind Waker). */
function itemRepositions(def: ItemDef): boolean {
  const visit = (nodes?: EffectNode[]): boolean => {
    if (!nodes) return false;
    return nodes.some((n) => (n.kind === 'displace') || (n.kind === 'repeat' && visit(n.effects)));
  };
  return !!def.active && visit(def.active.effects);
}

/**
 * Plan a sequenced save on the most-dived ally. Only engages when the unit holds a
 * reposition save (the case the per-item Glimmer/Mek considers do not sequence): the
 * reposition fires while the ally is still in a melee crush, the shield follows after.
 * Pure over sim state; deterministic (ally ties break by uid). Null when no chain applies.
 */
export function planSaveChain(sim: Sim, u: Unit): SavePlan | null {
  const reposition: SaveStep[] = [];
  const shield: SaveStep[] = [];
  let ownsReposition = false;
  let maxRange = 0;
  for (let slot = 0; slot < u.items.length; slot++) {
    const it = u.items[slot];
    if (!it) continue;
    const def = REG.items.get(it.defId);
    if (!def?.active) continue;
    if (def.active.affects !== 'ally' && def.active.affects !== 'any') continue;
    if (!itemArchetypes(def).has('save')) continue;
    const repositions = itemRepositions(def);
    if (repositions) ownsReposition = true;
    if (!itemReady(it, def, u, sim.time).ok) continue;
    const range = (typeof def.active.castRange === 'number' ? def.active.castRange : 600) + u.stats.castRangeBonus;
    maxRange = Math.max(maxRange, range);
    if (repositions) reposition.push({ kind: 'item', slot, role: 'reposition' });
    else shield.push({ kind: 'item', slot, role: 'shield' });
  }
  // The chain is the new behavior; a lone shield save is already covered per-item.
  if (!ownsReposition) return null;
  if (reposition.length === 0 && shield.length === 0) return null;

  const range = Math.min(maxRange, TUNING.ai.itemRange.saveAllyRange + u.stats.castRangeBonus);
  const ally = mostDivedAlly(sim, u, range);
  if (!ally) return null;

  const steps: SaveStep[] = [...(reposition[0] ? [reposition[0]] : []), ...(shield[0] ? [shield[0]] : [])];
  // reposition first while the ally is still crushed; once the crush is broken the
  // shield covers the retreat. With one order per tick, this never doubles up.
  const crushed = enemiesNear(sim, ally, TUNING.ai.itemRange.saveCrushRadius) > 0;
  const nextStep = crushed && reposition[0] ? reposition[0] : (shield[0] ?? reposition[0]);
  if (!nextStep) return null;
  return { allyUid: ally.uid, steps, nextStep };
}

/** The ally most in need of a save: lowest HP, under fire, with a crush on it. Ties by uid. */
function mostDivedAlly(sim: Sim, u: Unit, range: number): Unit | null {
  let best: Unit | null = null;
  let bestPct = Infinity;
  for (const a of sim.unitsArr) {
    if (!a.alive || a.team !== u.team || (a.kind !== 'hero' && a.kind !== 'creep')) continue;
    if (dist2(a.pos, u.pos) > range * range) continue;
    const pct = a.hp / Math.max(1, a.stats.maxHp);
    if (pct >= TUNING.ai.saveAllyHpPct) continue;
    if (sim.time - a.lastEnemyDamageAt > 1.5) continue;
    if (enemiesNear(sim, a, TUNING.ai.itemRange.saveCrushRadius) === 0) continue;
    if (pct < bestPct || (pct === bestPct && (best === null || a.uid < best.uid))) {
      bestPct = pct;
      best = a;
    }
  }
  return best;
}

function enemiesNear(sim: Sim, u: Unit, radius: number): number {
  let n = 0;
  sim.forEachNearbyUnit(u.pos, radius + 80, (o) => {
    if (o.alive && o.team !== u.team && o.kind !== 'npc' && o.kind !== 'ward' && !o.summary.untargetable && dist2(o.pos, u.pos) <= radius * radius) n++;
  });
  return n;
}

/** Lowest unit uid among a set of candidate steps, or null when there are none. */
function lowestOwner(steps: ComboCandidate[]): number | null {
  let best: number | null = null;
  for (const s of steps) {
    if (s.unitUid === undefined) continue;
    if (best === null || s.unitUid < best) best = s.unitUid;
  }
  return best;
}

export function comboStepMatchesOrder(step: ComboStep, order: Order): boolean {
  if (step.kind === 'cast') return order.kind === 'cast' && order.slot === step.slot;
  return order.kind === 'item' && order.invSlot === step.slot;
}

export function comboPlanContainsOrder(plan: ComboPlan, order: Order): boolean {
  return plan.steps.some((step) => comboStepMatchesOrder(step, order));
}

export function orderForComboStep(sim: Sim, u: Unit, plan: ComboPlan): Order | null {
  const focus = sim.unit(plan.targetUid);
  if (!focus || !validFocus(sim, u, focus)) return null;
  const step = plan.nextStep;
  const def = step.kind === 'cast'
    ? u.abilities[step.slot]?.def
    : REG.items.get(u.items[step.slot]?.defId ?? '')?.active;
  if (!def) return null;
  return orderForDef(u, focus, step, def);
}

function buildPlan(steps: ComboCandidate[], targetUid: number, score: number, nextStep: ComboCandidate): ComboPlan | null {
  if (steps.length === 0) return null;
  return {
    steps: steps.map(stripCandidate),
    targetUid,
    score,
    nextStep: stripCandidate(nextStep)
  };
}

function comboCandidates(sim: Sim, u: Unit, focus: Unit): ComboCandidate[] {
  const out: ComboCandidate[] = [];
  for (let slot = 0; slot < u.abilities.length; slot++) {
    const a = u.abilities[slot];
    if (!a || a.level <= 0) continue;
    if (!u.abilityReady(slot, sim.time).ok) continue;
    const role = abilityComboRole(a.def);
    if (!role) continue;
    out.push({
      kind: 'cast',
      slot,
      unitUid: u.uid,
      role,
      targetMode: targetModeForDef(a.def, role),
      windowSec: TUNING.ai.comboWindowSec,
      def: a.def,
      score: abilityComboScore(u, focus, a.def, a.level, role),
      range: castRangeOf(a.def, u, a.level),
      manaCost: u.manaCostOf(slot),
      initiationReach: initiationReachOf(a.def, a.level),
      element: candidateElement(u, 'cast', a.def)
    });
  }

  for (let slot = 0; slot < u.items.length; slot++) {
    const it = u.items[slot];
    if (!it) continue;
    const def = REG.items.get(it.defId);
    if (!def?.active) continue;
    const ready = itemReady(it, def, u, sim.time);
    if (!ready.ok) continue;
    const role = itemComboRole(def);
    if (!role) continue;
    out.push({
      kind: 'item',
      slot,
      unitUid: u.uid,
      role,
      targetMode: targetModeForDef(def.active, role),
      windowSec: TUNING.ai.comboWindowSec,
      def: def.active,
      score: itemComboScore(u, focus, def, role),
      range: castRangeOf(def.active, u, 1),
      manaCost: def.active.manaCost?.[0] ?? 0,
      initiationReach: initiationReachOf(def.active, 1),
      element: candidateElement(u, 'item', def.active, def)
    });
  }

  return out.sort((a, b) => b.score - a.score || roleRank(a.role) - roleRank(b.role) || a.kind.localeCompare(b.kind) || a.slot - b.slot);
}

function pickSaveHolder(sim: Sim, allies: Unit[]): number | null {
  let best: Unit | null = null;
  let bestScore = -Infinity;
  for (const u of allies) {
    let hasSave = false;
    for (let slot = 0; slot < u.items.length; slot++) {
      const it = u.items[slot];
      if (!it) continue;
      const def = REG.items.get(it.defId);
      if (!def?.active || !itemReady(it, def, u, sim.time).ok) continue;
      const arch = itemArchetypes(def);
      if (arch.has('save') || arch.has('sustain') || arch.has('cleanse')) hasSave = true;
    }
    for (let slot = 0; slot < u.abilities.length; slot++) {
      const a = u.abilities[slot];
      if (!a || !u.abilityReady(slot, sim.time).ok) continue;
      if (a.def.affects === 'ally') hasSave = true;
    }
    if (!hasSave) continue;
    const score = (u.heroId ? 0.25 : 0) + (u.stats.castRangeBonus / 1000) + (u.mana / Math.max(1, u.stats.maxMana));
    if (score > bestScore || (score === bestScore && (best === null || u.uid < best.uid))) {
      best = u;
      bestScore = score;
    }
  }
  return best?.uid ?? null;
}

function stripCandidate({ kind, slot, unitUid, role, targetMode, windowSec }: ComboCandidate): ComboStep {
  return { kind, slot, unitUid, role, targetMode, windowSec };
}

function abilityComboRole(def: AbilityDef): ComboStep['role'] | null {
  const intent = scanAbility(def);
  if (intent.offensive) return 'payoff';
  if (intent.hardControl || intent.softControl || intent.initiation) return 'enabler';
  if (intent.amplify) return 'amplifier';
  return null;
}

function itemComboRole(def: ItemDef): ComboStep['role'] | null {
  const arch = itemArchetypes(def);
  if (arch.has('nuke')) return 'payoff';
  if (arch.has('amplify')) return 'amplifier';
  if (arch.has('initiation') || arch.has('lockdown')) return 'enabler';
  if (arch.has('immunity') && def.active?.targeting === 'no-target') return 'immunity';
  return null;
}

function abilityComboScore(u: Unit, focus: Unit, def: AbilityDef, level: number, role: ComboStep['role']): number {
  const intent = scanAbility(def);
  const base = targetValue(focus);
  const ult = def.ult ? 0.6 : 0;
  const aoe = intent.aoe ? 0.35 : 0;
  const control = intent.hardControl ? 0.55 : intent.softControl ? 0.28 : 0;
  const reach = initiationReachOf(def, level) > 0 ? 0.25 : 0;
  const roleBonus = role === 'payoff' ? 0.9 : role === 'amplifier' ? 0.55 : role === 'immunity' ? 0.5 : 0.45;
  const depth = Math.max(0, (u.ctrl.aiDepth ?? TUNING.ai.bossAiDepth) - TUNING.ai.depthRefAiDepth) * 0.1;
  return base + roleBonus + ult + aoe + control + reach + depth;
}

function itemComboScore(u: Unit, focus: Unit, def: ItemDef, role: ComboStep['role']): number {
  const arch = itemArchetypes(def);
  const base = targetValue(focus);
  const roleBonus = role === 'payoff' ? 0.85 : role === 'amplifier' ? 0.7 : role === 'immunity' ? 0.62 : 0.5;
  const initiation = arch.has('initiation') ? 0.35 : 0;
  const lockdown = arch.has('lockdown') ? 0.35 : 0;
  const field = arch.has('field') ? 0.15 : 0;
  const depth = Math.max(0, (u.ctrl.aiDepth ?? TUNING.ai.bossAiDepth) - TUNING.ai.depthRefAiDepth) * 0.1;
  // GAMBIT_AI_OVERHAUL Phase 3 §5: the boss reaches for posture-appropriate item
  // archetypes inside its chains, not just in the per-cast item scorer.
  const bias = u.ctrl.kind === 'boss' ? bossArchetypeBias(u, def) : 1;
  return (base + roleBonus + initiation + lockdown + field + depth) * bias;
}

function comboChainLen(u: Unit): number {
  const depth = u.ctrl.aiDepth ?? TUNING.ai.bossAiDepth;
  return depth >= TUNING.ai.combo.tripleChainMinDepth ? 3 : 2;
}

function canPayPlan(u: Unit, steps: ComboCandidate[]): boolean {
  const total = steps.reduce((sum, step) => sum + step.manaCost, 0);
  if (total <= 0) return true;
  if (u.mana < total) return false;
  const afterPct = (u.mana - total) / Math.max(1, u.stats.maxMana);
  return afterPct >= Math.max(0, TUNING.ai.manaFloorPct - TUNING.ai.combo.planManaMargin);
}

function canReachStep(u: Unit, focus: Unit, step: ComboCandidate, reachBonus: number): boolean {
  if (step.def.targeting === 'no-target' || step.def.targeting === 'toggle') return true;
  const range = step.range + reachBonus;
  return dist2(u.pos, focus.pos) <= range * range;
}

function validFocus(sim: Sim, u: Unit, focus: Unit): boolean {
  return focus.alive && focus.team !== u.team && !focus.summary.untargetable && !focus.summary.magicImmune && focus.isVisibleTo(u.team, sim.time);
}

function comboSetupActive(sim: Sim, focus: Unit): boolean {
  const s = focus.summary;
  if (s.stunned || s.rooted || s.silenced || s.hexed || s.disarmed || s.frozen || s.sleeping || s.cycloned || s.feared !== null || s.taunted !== null) {
    return true;
  }
  if (s.moveSlowFactor < 0.999 || s.attackSlowTotal > 0) return true;
  if (recentSetupTagActive(sim, focus)) return true;
  return (s.mods.magicResistPct ?? 0) < 0 || (s.mods.damageTakenReductionPct ?? 0) < 0 || (s.mods.armor ?? 0) < 0;
}

function scanAbility(def: AbilityDef): AbilityComboIntent {
  const out = { offensive: false, hardControl: false, softControl: false, amplify: false, initiation: false, aoe: false };
  scanEffects(def.effects, out);
  if (def.channel?.tick) scanEffects(def.channel.tick.effects, out);
  if (def.channel?.onEnd) scanEffects(def.channel.onEnd, out);
  if (def.toggle) scanEffects(def.toggle.effects, out);
  if (def.targeting === 'ground-aoe') out.aoe = true;
  return out;
}

function scanEffects(nodes: EffectNode[] | undefined, out: AbilityComboIntent): void {
  if (!nodes) return;
  for (const n of nodes) {
    switch (n.kind) {
      case 'damage':
      case 'exotic':
        out.offensive = true;
        if ((n as { radius?: unknown }).radius !== undefined) out.aoe = true;
        break;
      case 'status':
        if (HARD_DISABLES.has(n.status)) out.hardControl = true;
        else if (SOFT_DISABLES.has(n.status)) out.softControl = true;
        if (n.params?.mods && modsAmplify(n.params.mods)) out.amplify = true;
        if (n.params?.dotDps !== undefined) out.offensive = true;
        if (n.radius !== undefined) out.aoe = true;
        if (n.params?.periodic) scanEffects(n.params.periodic.effects, out);
        break;
      case 'statmod':
        if (modsAmplify(n.mods)) out.amplify = true;
        break;
      case 'displace':
        if (n.mode === 'blink' && n.target === 'self') out.initiation = true;
        else out.hardControl = true;
        break;
      case 'zone':
        out.aoe = true;
        scanEffects(n.zone.tick?.effects, out);
        scanEffects(n.zone.onEnter?.effects, out);
        break;
      case 'projectile':
        scanEffects(n.proj.onHit, out);
        break;
      case 'repeat':
        scanEffects(n.effects, out);
        break;
      case 'mana':
        if (n.op === 'burn') out.offensive = true;
        break;
      case 'summon':
      case 'heal':
      case 'purge':
      case 'capture-channel':
        break;
    }
  }
}

function targetModeForDef(def: AbilityDef, role: ComboStep['role']): GambitTargetMode {
  if (def.targeting === 'no-target' || def.targeting === 'toggle') return 'self';
  if (role === 'payoff') return 'focus';
  if (def.targeting === 'ground-aoe') return 'most-clustered';
  return 'focus';
}

function orderForDef(u: Unit, focus: Unit, step: ComboStep, def: AbilityDef): Order | null {
  if (def.targeting === 'no-target' || def.targeting === 'toggle') {
    return step.kind === 'cast' ? { kind: 'cast', slot: step.slot } : { kind: 'item', invSlot: step.slot };
  }
  if (def.targeting === 'unit-target') {
    return step.kind === 'cast'
      ? { kind: 'cast', slot: step.slot, uid: focus.uid }
      : { kind: 'item', invSlot: step.slot, uid: focus.uid };
  }
  const point = pointForStep(u, focus, def);
  return step.kind === 'cast'
    ? { kind: 'cast', slot: step.slot, point }
    : { kind: 'item', invSlot: step.slot, point };
}

function pointForStep(u: Unit, focus: Unit, def: AbilityDef): Vec2 {
  if (scanAbility(def).initiation) {
    const away = norm(sub(u.pos, focus.pos));
    const dir = away.x === 0 && away.y === 0 ? v2(u.team === 0 ? -1 : 1, 0) : away;
    return add(focus.pos, scale(dir, Math.max(90, u.radius + focus.radius + 20)));
  }
  return { ...focus.pos };
}

function castRangeOf(def: AbilityDef, u: Unit, level: number): number {
  const base = def.castRange !== undefined ? abilityVal(def, def.castRange, level) : 600;
  if (scanAbility(def).initiation) return Math.max(base, initiationReachOf(def, level));
  return base + u.stats.castRangeBonus;
}

function initiationReachOf(def: AbilityDef, level: number): number {
  let reach = 0;
  const visit = (nodes?: EffectNode[]) => {
    if (!nodes) return;
    for (const n of nodes) {
      if (n.kind === 'displace' && n.mode === 'blink' && n.target === 'self') {
        reach = Math.max(reach, n.distance !== undefined ? abilityVal(def, n.distance, level) : 900);
      } else if (n.kind === 'repeat') visit(n.effects);
    }
  };
  visit(def.effects);
  return reach;
}

function targetValue(o: Unit): number {
  const hpPct = o.hp / Math.max(1, o.stats.maxHp);
  const attackDps = o.stats.damage / Math.max(0.2, o.stats.attackInterval);
  const danger = Math.max(0, Math.min(1, (attackDps + (o.kind === 'hero' ? TUNING.ai.heroBias : 0)) / TUNING.ai.dangerNorm));
  return 0.5 + (1 - hpPct) * 0.8 + danger * 0.6;
}

function modsAmplify(mods: Record<string, unknown> | undefined): boolean {
  if (!mods) return false;
  return negative(mods.magicResistPct) || negative(mods.armor) || negative(mods.damageTakenReductionPct) || negative(mods.hpRegen);
}

function negative(value: unknown): boolean {
  return typeof value === 'number' && value < 0;
}

function sameAction(a: ComboCandidate, b: ComboCandidate): boolean {
  return a.kind === b.kind && a.slot === b.slot;
}

function roleRank(role: ComboStep['role']): number {
  return role === 'enabler' ? 0 : role === 'immunity' ? 1 : role === 'amplifier' ? 2 : 3;
}

function planTieKey(plan: ComboPlan): string {
  return plan.steps.map((s) => `${roleRank(s.role)}:${s.kind}:${s.slot}`).join('|');
}

function chainKey(steps: ComboCandidate[]): string {
  return steps.map((s) => `${s.unitUid ?? -1}:${roleRank(s.role)}:${s.kind}:${s.slot}`).join('|');
}

/**
 * A chain's score: the payoff value (lifted by any reaction it cashes), discounted
 * once per setup step, plus each setup's own value. An amplifier multiplies the
 * payoff, so it is worth more than an enabler that only creates the opening.
 */
function chainScore(setups: ComboCandidate[], payoff: ComboCandidate, mult: number): number {
  const discount = Math.pow(TUNING.ai.combo.stepDiscount, setups.length);
  let score = payoff.score * mult * TUNING.ai.comboWeight * discount;
  for (const s of setups) {
    score += s.score * (s.role === 'amplifier' ? TUNING.ai.combo.amplifierValue : TUNING.ai.combo.enablerValue);
  }
  return score;
}

/**
 * Setup options for a payoff (GAMBIT_AI_OVERHAUL §4): the explicit enabler/amplifier
 * steps, plus first-class element nodes — an offensive spell whose element will react
 * with this payoff's element, reused as an enabler that lays the soak the payoff cashes.
 */
function setupOptionsFor(baseSetups: ComboCandidate[], candidates: ComboCandidate[], payoff: ComboCandidate): ComboCandidate[] {
  const out = baseSetups.slice();
  if (payoff.element) {
    for (const c of candidates) {
      if (c.role !== 'payoff' || sameAction(c, payoff)) continue;
      if (reacts(c.element, payoff.element)) out.push({ ...c, role: 'enabler' });
    }
  }
  return out;
}

/** Two distinct active elements that form a reaction (an element reacts with itself = no-op). */
function reacts(a: ActiveElement | null, b: ActiveElement | null): boolean {
  return a !== null && b !== null && a !== b && reactionFor(a, b) !== null;
}

/** Reaction lift: a setup element (or a live soak on the focus) that reacts with the payoff. */
function reactionMult(sim: Sim, focus: Unit, setups: ComboCandidate[], payoff: ComboCandidate): number {
  if (!payoff.element) return 1;
  for (const s of setups) {
    if (reacts(s.element, payoff.element)) return 1 + TUNING.ai.combo.reactionBonus;
  }
  return focusReactsWith(sim, focus, payoff.element) ? 1 + TUNING.ai.combo.reactionBonus : 1;
}

/** The focus carries a live elemental aura that reacts with `el` (a soak ready to pop). */
function focusReactsWith(sim: Sim, focus: Unit, el: ActiveElement | null): boolean {
  if (!el) return false;
  if (recentSetupTagActive(sim, focus) && reacts(focus.lastTagSetupElement ?? null, el)) return true;
  for (const key of Object.keys(focus.elementAuras) as ActiveElement[]) {
    const aura = focus.elementAuras[key];
    if (aura && aura.until > sim.time && reacts(key, el)) return true;
  }
  return false;
}

/**
 * The step to take this tick. Rebuilt each decision tick (the doc's lean: rebuild,
 * with focus state as the only memory): walk the chain and return the first setup
 * whose opening is not yet on the focus, else the payoff.
 */
function nextStepFor(sim: Sim, focus: Unit, steps: ComboCandidate[]): ComboCandidate {
  for (let i = 0; i < steps.length - 1; i++) {
    const s = steps[i];
    if (s.role === 'enabler' && !enablerSatisfied(sim, focus)) return s;
    if (s.role === 'amplifier' && !amplifierSatisfied(focus)) return s;
    if (s.role === 'immunity' && !immunitySatisfied(s, sim)) return s;
  }
  return steps[steps.length - 1];
}

/** An enabler's opening is live: the focus is under control/slow or carries a soak. */
function enablerSatisfied(sim: Sim, focus: Unit): boolean {
  const s = focus.summary;
  if (s.stunned || s.rooted || s.silenced || s.hexed || s.disarmed || s.frozen || s.sleeping || s.cycloned || s.feared !== null || s.taunted !== null) return true;
  if (s.moveSlowFactor < 0.999 || s.attackSlowTotal > 0) return true;
  if (recentSetupTagActive(sim, focus)) return true;
  for (const key of Object.keys(focus.elementAuras) as ActiveElement[]) {
    const aura = focus.elementAuras[key];
    if (aura && aura.until > sim.time) return true;
  }
  return false;
}

/** An amplifier's mark is live: the focus already carries a damage-amp debuff. */
function amplifierSatisfied(focus: Unit): boolean {
  const m = focus.summary.mods;
  return (m.magicResistPct ?? 0) < 0 || (m.damageTakenReductionPct ?? 0) < 0 || (m.armor ?? 0) < 0;
}

function immunitySatisfied(step: ComboCandidate, sim: Sim): boolean {
  const owner = sim.unit(step.unitUid ?? -1);
  return owner?.summary.magicImmune === true;
}

function recentSetupTagActive(sim: Sim, focus: Unit): boolean {
  return focus.lastTagSetupAt > -900 &&
    sim.time - focus.lastTagSetupAt <= TUNING.ai.comboWindowSec &&
    focus.lastTagSetupArchetype !== undefined &&
    SETUP_TAGS.has(focus.lastTagSetupArchetype);
}

function recentInitiationActive(sim: Sim, u: Unit): boolean {
  if (!u.lastItemActiveId || sim.time - u.lastItemActiveAt > TUNING.ai.comboWindowSec) return false;
  const def = REG.items.get(u.lastItemActiveId);
  return !!def && itemArchetypes(def).has('initiation');
}

function enemyReplyLoaded(sim: Sim, u: Unit, focus: Unit): boolean {
  let nearby = 0;
  let disableReady = false;
  sim.forEachNearbyUnit(focus.pos, 900, (enemy) => {
    if (!enemy.alive || enemy.team === u.team || enemy.kind === 'npc' || enemy.kind === 'ward' || enemy.summary.untargetable) return;
    nearby++;
    for (let slot = 0; slot < enemy.abilities.length; slot++) {
      const ability = enemy.abilities[slot];
      if (!ability || ability.level <= 0 || !enemy.abilityReady(slot, sim.time).ok) continue;
      const intent = scanAbility(ability.def);
      if (intent.hardControl || intent.softControl || intent.aoe) disableReady = true;
    }
  });
  return disableReady || nearby >= 2;
}

/**
 * The active element a step *applies* as a soak — only when explicitly declared, so
 * element nodes are intentional. For a cast that is the ability's own `element`; for an
 * item, its active cast element or its on-hit element (Maelstrom/Mjollnir electro, etc.).
 * We deliberately do NOT fall back to the caster's hero element: a hero's neutral nuke
 * does not lay a reactable soak, and attributing one would fabricate phantom chains.
 */
function candidateElement(_u: Unit, kind: 'cast' | 'item', def: AbilityDef, itemDef?: ItemDef): ActiveElement | null {
  if (kind === 'cast') return isActiveElement(def.element) ? def.element : null;
  if (itemDef) {
    if (isActiveElement(itemDef.active?.element)) return itemDef.active!.element as ActiveElement;
    return elementForItemHit(itemDef);
  }
  return null;
}
