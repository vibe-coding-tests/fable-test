import { TUNING } from '../data/tuning';
import { dist } from './math2d';
import { REG } from './registry';
import { elementForItemHit, isActiveElement, reactionFor, type ActiveElement } from './resonance';
import { armorMultiplier } from './stats';
import type { Unit } from './unit';
import type { DamageType } from './types';
import { resolveVal } from './values';
import type { Sim } from './sim';

export interface DamageOpts {
  fromAttack?: boolean;
  ignoreArmor?: boolean;
  noTriggers?: boolean;
  element?: import('./types').ElementId;
}

/** Central damage pipeline. Returns post-mitigation damage dealt. */
export function applyDamage(
  sim: Sim,
  source: Unit | null,
  victim: Unit,
  rawAmount: number,
  dtype: DamageType,
  opts: DamageOpts = {}
): number {
  if (!victim.alive || rawAmount <= 0) return 0;
  if (victim.summary.invulnerable) return 0;
  if (dtype === 'magical' && victim.summary.magicImmune) {
    sim.events.emit({ t: 'immune-block', uid: victim.uid });
    return 0;
  }

  let amount = rawAmount;
  if (source && !opts.fromAttack && dtype !== 'physical') {
    amount *= 1 + source.stats.spellAmpPct / 100;
  }
  if (source && source.team !== victim.team && sim.resonanceEnabled && isActiveElement(opts.element)) {
    const reaction = applyElement(sim, source, victim, opts.element, amount);
    amount *= reaction.damageMultiplier;
  }
  if (dtype === 'physical' && !opts.ignoreArmor) amount *= armorMultiplier(victim.stats.armor);
  if (dtype === 'magical') amount *= 1 - victim.stats.magicResistPct / 100;
  amount *= 1 - victim.stats.damageTakenReductionPct / 100;
  if (opts.fromAttack) amount *= 1 - victim.stats.attackDamageTakenReductionPct / 100;
  if (amount <= 0) return 0;

  victim.hp -= amount;
  const isEnemy = source !== null && source.team !== victim.team;
  if (isEnemy && source) {
    victim.lastEnemyDamageAt = sim.time;
    source.lastDealtDamageAt = sim.time;
    if (victim.ctrl.kind === 'boss') {
      const threat = victim.ctrl.threat ?? (victim.ctrl.threat = {});
      threat[source.uid] = (threat[source.uid] ?? 0) + amount;
    }
    victim.recentDamagers = victim.recentDamagers.filter((r) => sim.time - r.at < TUNING.participantWindowSec);
    const existing = victim.recentDamagers.find((r) => r.uid === source.uid);
    if (existing) existing.at = sim.time;
    else victim.recentDamagers.push({ uid: source.uid, at: sim.time });
  }

  sim.events.emit({
    t: 'damage',
    uid: victim.uid,
    from: source?.uid ?? -1,
    amount: Math.round(amount),
    dtype
  });

  if (isEnemy && !opts.noTriggers) {
    // damage breaks sleep / salve-style regen
    const broken = victim.removeStatusWhere((s) => !!s.breakOnDamage);
    for (const b of broken) sim.events.emit({ t: 'status-expire', uid: victim.uid, status: b.status });
    // damage interrupts the Binding Totem channel (SPEC §5)
    if (victim.captureCh) sim.interruptCapture(victim, 'damaged');
    // on-damage-taken triggers (Blink lockout is checked from lastEnemyDamageAt directly)
    sim.runTriggers(victim, 'on-damage-taken', { other: source ?? undefined });
  }

  if (victim.hp <= 0) {
    sim.killUnit(victim, source);
  }
  return amount;
}

function applyReactionStatus(sim: Sim, source: Unit, target: Unit, reactionId: string, mods: Record<string, number> | undefined, duration: number): void {
  const applied = target.addStatus({
    status: 'buff',
    tag: `reaction:${reactionId}`,
    sourceUid: source.uid,
    sourceTeam: source.team,
    until: sim.time + duration,
    isDebuff: source.team !== target.team,
    mods
  }, true);
  if (applied) sim.events.emit({ t: 'status-apply', uid: target.uid, status: 'buff', duration });
}

function applyElement(sim: Sim, source: Unit, target: Unit, element: ActiveElement, baseAmount: number): { damageMultiplier: number } {
  const now = sim.time;
  for (const key of Object.keys(target.elementAuras) as ActiveElement[]) {
    if ((target.elementAuras[key]?.until ?? 0) <= now) delete target.elementAuras[key];
  }

  const existing = (Object.keys(target.elementAuras) as ActiveElement[]).find((e) => e !== element);
  const reaction = existing ? reactionFor(existing, element) : null;
  let damageMultiplier = 1;
  if (reaction) {
    damageMultiplier = reaction.damageMultiplier ?? 1;
    const scale = 1 + source.stats.spellAmpPct / 100;
    sim.events.emit({ t: 'reaction', uid: target.uid, from: source.uid, reaction: reaction.id, elements: [existing!, element] });
    if (reaction.extraDamagePct) {
      applyDamage(sim, source, target, Math.max(1, baseAmount * reaction.extraDamagePct * scale), 'magical', { noTriggers: true });
    }
    if (reaction.status === 'frozen') {
      const duration = reaction.statDuration ?? 1.5;
      const applied = target.addStatus({
        status: 'frozen',
        tag: 'reaction:freeze',
        sourceUid: source.uid,
        sourceTeam: source.team,
        until: sim.time + duration,
        isDebuff: true
      }, true);
      if (applied) sim.events.emit({ t: 'status-apply', uid: target.uid, status: 'frozen', duration });
    }
    if (reaction.statMods) {
      applyReactionStatus(sim, source, target, reaction.id, reaction.statMods as Record<string, number>, reaction.statDuration ?? 4);
    }
    if (reaction.consume === 'both' || reaction.consume === 'existing') delete target.elementAuras[existing!];
  }

  target.elementAuras[element] = {
    gauge: Math.min(2, (target.elementAuras[element]?.gauge ?? 0) + 1),
    until: now + 4,
    sourceUid: source.uid
  };
  sim.events.emit({ t: 'element-apply', uid: target.uid, from: source.uid, element, gauge: target.elementAuras[element]!.gauge });
  return { damageMultiplier };
}

export function healUnit(sim: Sim, target: Unit, amount: number): number {
  if (!target.alive || amount <= 0) return 0;
  const before = target.hp;
  target.hp = Math.min(target.stats.maxHp, target.hp + amount);
  const healed = target.hp - before;
  if (healed > 0.5) sim.events.emit({ t: 'heal', uid: target.uid, amount: Math.round(healed) });
  return healed;
}

/** Resolve one attack impact (after windup / projectile arrival). */
export function attackImpact(sim: Sim, attacker: Unit, victim: Unit): void {
  if (!victim.alive || !attacker.alive) return;

  // miss: target evasion + attacker blind
  const ev = victim.stats.evasionPct / 100;
  const blind = attacker.summary.blindPct / 100;
  const missChance = 1 - (1 - ev) * (1 - blind);
  if (missChance > 0 && sim.rng.chance(missChance)) {
    sim.events.emit({ t: 'miss', uid: attacker.uid, target: victim.uid });
    return;
  }

  const mods = attacker.collectAttackMods();
  let flat = 0;
  let pct = 0;
  let critMult = 1;
  let manaBurn = 0;
  let manaBurnAsDamagePct = 0;
  let lifestealPct = attacker.stats.lifestealPct;
  let cleavePct = 0;
  let cleaveRadius = 0;
  const consumeTags: string[] = [];
  const procs: { damage: number; status?: { status: string; duration: number; params?: unknown } }[] = [];

  for (const m of mods) {
    const V = (ref: unknown, fb = 0) => resolveVal(ref as never, m.values, m.level, fb);
    if (m.spec.bonusDamage) flat += V(m.spec.bonusDamage);
    if (m.spec.bonusDamagePct) pct += V(m.spec.bonusDamagePct);
    if (m.spec.critChance) {
      const c = V(m.spec.critChance) / 100;
      if (sim.rng.chance(c)) critMult = Math.max(critMult, V(m.spec.critMult, 150) / 100);
    }
    if (m.spec.procChance) {
      const c = V(m.spec.procChance) / 100;
      if (sim.rng.chance(c)) {
        procs.push({ damage: V(m.spec.procDamage) });
        if (m.spec.procStatus) {
          sim.applyStatusFromSpec(attacker, victim, m.spec.procStatus.status, V(m.spec.procStatus.duration), m.spec.procStatus.params, {
            defId: `proc:${attacker.uid}`,
            values: m.values,
            level: m.level,
            vfx: { archetype: 'stun-stars', color: '#ffe27d', scale: 0.5 }
          });
        }
      }
    }
    if (m.spec.manaBurnPerHit) {
      manaBurn += V(m.spec.manaBurnPerHit);
      manaBurnAsDamagePct = Math.max(manaBurnAsDamagePct, m.spec.manaBurnAsDamagePct ?? 0);
    }
    if (m.spec.lifestealPct) lifestealPct += V(m.spec.lifestealPct);
    if (m.spec.cleave) {
      cleavePct += V(m.spec.cleave.pct);
      cleaveRadius = Math.max(cleaveRadius, V(m.spec.cleave.radius));
    }
    if (m.consumeTag) consumeTags.push(m.consumeTag);
  }

  const variance = 1 + sim.rng.range(-TUNING.attackDamageVariance, TUNING.attackDamageVariance);
  const baseDamage = attacker.stats.damage * variance + flat;
  const total = baseDamage * (1 + pct / 100) * critMult;

  const dealt = applyDamage(sim, attacker, victim, total, 'physical', { fromAttack: true });
  if (critMult > 1 && dealt > 0) {
    sim.events.emit({ t: 'damage', uid: victim.uid, from: attacker.uid, amount: 0, dtype: 'physical', crit: true });
  }

  for (const p of procs) {
    if (p.damage > 0) applyDamage(sim, attacker, victim, p.damage, 'physical', { fromAttack: true });
  }

  if (manaBurn > 0 && victim.alive) {
    const burned = Math.min(victim.mana, manaBurn);
    victim.mana -= burned;
    if (burned > 0 && manaBurnAsDamagePct > 0) {
      applyDamage(sim, attacker, victim, burned * (manaBurnAsDamagePct / 100), 'physical', { fromAttack: false });
    }
  }

  if (lifestealPct > 0 && dealt > 0) healUnit(sim, attacker, dealt * (lifestealPct / 100));

  if (sim.resonanceEnabled && victim.alive) {
    for (const it of attacker.items) {
      if (!it) continue;
      const element = elementForItemHit(REG.item(it.defId));
      if (element) applyElement(sim, attacker, victim, element, Math.max(1, dealt || total));
    }
  }

  // cleave rewards stacking enemies (Battlefury / Sven identity, SPEC §5/§6)
  if (cleavePct > 0 && cleaveRadius > 0) {
    const cleaveDmg = baseDamage * (cleavePct / 100);
    for (const o of sim.unitsArr) {
      if (!o.alive || o === victim || o.team === attacker.team) continue;
      if (o.summary.untargetable) continue;
      if (dist(o.pos, victim.pos) <= cleaveRadius) {
        applyDamage(sim, attacker, o, cleaveDmg, 'physical', { fromAttack: false, ignoreArmor: true });
      }
    }
  }

  // consume one-shot attack buffs (Enchant Totem)
  for (const tag of consumeTags) {
    attacker.removeStatusWhere((s) => s.tag === tag);
  }

  sim.events.emit({ t: 'attack-impact', uid: attacker.uid, target: victim.uid });
  sim.runTriggers(attacker, 'on-attack-land', { other: victim });
}
