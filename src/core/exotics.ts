import { applyDamage, healUnit } from './combat';
import { applyStatus, execEffects, type EffectCtx, type EffectPrimary } from './effects';
import { levelArr, resolveVal } from './values';
import type { AbilityDef, EffectNode, StatusParams, ValueRef, Vec2, ZoneSpec } from './types';
import type { Unit } from './unit';
import type { Sim } from './sim';

export interface ExoticContext {
  sim: Sim;
  caster: Unit;
  ctx: EffectCtx;
  primary: EffectPrimary;
  params?: Record<string, unknown>;
}

type ExoticHandler = (ctx: ExoticContext) => void;

function V(ctx: EffectCtx, ref: ValueRef | undefined, fallback = 0): number {
  return resolveVal(ref, ctx.values, ctx.level, fallback);
}

function duration(ctx: EffectCtx, fallback = 6): number {
  return V(ctx, 'duration', fallback);
}

function center(caster: Unit, primary: EffectPrimary): Vec2 {
  return primary.point ?? primary.target?.pos ?? caster.pos;
}

function buff(ctx: ExoticContext, target: Unit, tag: string, seconds: number, mods: Record<string, number>): void {
  applyStatus(ctx.sim, ctx.caster, target, 'buff', seconds, { tag, mods } as StatusParams, ctx.ctx);
}

function enemiesAround({ sim, caster, ctx, primary }: ExoticContext, fallbackRadius = 600): Unit[] {
  const c = center(caster, primary);
  const radius = V(ctx, 'radius', fallbackRadius);
  return sim.unitsInRadius(c, radius, (u) => u.team !== caster.team && !u.summary.untargetable && !u.summary.invulnerable);
}

function followAura(ctx: ExoticContext, tag: string, mods: Record<string, ValueRef>, radius = 900): void {
  const seconds = duration(ctx.ctx, 10);
  const zone: ZoneSpec = {
    shape: 'circle',
    radius,
    duration: seconds,
    tick: {
      interval: 0.5,
      affects: 'allies',
      effects: [{ kind: 'statmod', mods, duration: 0.7, target: 'target' }]
    }
  };
  ctx.sim.addZone({ caster: ctx.caster, ctx: ctx.ctx, spec: zone, duration: seconds, pos: { ...ctx.caster.pos }, radius, followUid: ctx.caster.uid });
  buff(ctx, ctx.caster, tag, seconds, { damageTakenReductionPct: 10 });
}

function learnedCastables(target: Unit): { def: AbilityDef; level: number }[] {
  return target.abilities
    .filter((a) => {
      if (a.level <= 0 || !a.def.effects) return false;
      if (a.def.id === 'rubick-spell-steal') return false;
      return !['passive', 'aura', 'attack-modifier'].includes(a.def.targeting);
    })
    .map((a) => ({ def: a.def, level: a.level }));
}

function spellSteal(ctx: ExoticContext): void {
  const target = ctx.primary.target;
  if (!target || !target.alive) return;
  const candidates = learnedCastables(target);
  if (candidates.length === 0) return;
  candidates.sort((a, b) => Number(!!b.def.ult) - Number(!!a.def.ult) || b.level - a.level || b.def.id.localeCompare(a.def.id));
  const stolen = candidates[0];
  const stolenCtx: EffectCtx = {
    defId: `stolen:${stolen.def.id}`,
    values: stolen.def.values,
    level: Math.max(1, stolen.level),
    piercesImmunity: stolen.def.piercesImmunity,
    element: stolen.def.element,
    vfx: stolen.def.vfx
  };
  ctx.sim.events.emit({ t: 'cast', uid: ctx.caster.uid, abilityId: stolenCtx.defId, vfx: stolen.def.vfx, target: target.uid, point: { ...target.pos } });
  execEffects(ctx.sim, ctx.caster, stolenCtx, stolen.def.effects ?? [], { target, point: { ...target.pos } });
}

function dividedWeStand(ctx: ExoticContext): void {
  followAura(ctx, 'exotic:divided-we-stand', { damage: 12, moveSpeedPct: 10, lifestealPct: 10 });
}

function tempestDouble(ctx: ExoticContext): void {
  followAura(ctx, 'exotic:tempest-double', { damage: 18, attackSpeed: 35, spellAmpPct: 8 });
  const ult = ctx.caster.abilities.find((a) => a.def.id === ctx.ctx.defId);
  if (ult) ult.cooldownUntil = Math.min(ult.cooldownUntil, ctx.sim.time + 18);
}

function morphShift(ctx: ExoticContext): void {
  const seconds = duration(ctx.ctx, 10);
  const lowHp = ctx.caster.hp / Math.max(1, ctx.caster.stats.maxHp) < 0.45;
  const agi = Math.abs(V(ctx.ctx, 'agi', 12));
  const str = Math.max(6, Math.abs(V(ctx.ctx, 'str', 6)));
  if (lowHp) {
    buff(ctx, ctx.caster, 'exotic:morph-shift', seconds, { str, maxHp: str * 22, damageTakenReductionPct: 12 });
  } else {
    buff(ctx, ctx.caster, 'exotic:morph-shift', seconds, { agi, attackSpeed: 18, moveSpeedPct: 8 });
  }
}

function primalSplit(ctx: ExoticContext): void {
  const seconds = duration(ctx.ctx, 16);
  buff(ctx, ctx.caster, 'exotic:primal-split-hidden', seconds, { invulnerable: 1, untargetable: 1, hpRegen: 20 });
  followAura(ctx, 'exotic:primal-split-command', { damage: 16, armor: 3, moveSpeedPct: 8 }, 1000);
}

function remoteMines(ctx: ExoticContext): void {
  const seconds = duration(ctx.ctx, 20);
  const point = { ...center(ctx.caster, ctx.primary) };
  const radius = V(ctx.ctx, 'radius', 360);
  const mine: EffectNode = {
    kind: 'zone',
    at: 'point',
    zone: {
      shape: 'circle',
      radius: 'radius',
      duration: 'duration',
      onEnter: {
        affects: 'enemies',
        windowSec: seconds,
        effects: [
          { kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' },
          { kind: 'status', status: 'stun', duration: 0.5, target: 'target' }
        ]
      }
    }
  };
  ctx.sim.addZone({
    caster: ctx.caster,
    ctx: ctx.ctx,
    spec: { shape: 'circle', radius, duration: 0.9 },
    duration: 0.9,
    pos: point,
    radius
  });
  ctx.sim.addRepeater({
    casterUid: ctx.caster.uid,
    remaining: 1,
    interval: 1,
    nextAt: ctx.sim.time + 1,
    effects: [mine],
    radius,
    ctx: ctx.ctx,
    point
  });
}

function chronosphere(ctx: ExoticContext): void {
  const seconds = duration(ctx.ctx, 6);
  const radius = V(ctx.ctx, 'radius', 550);
  const freeze: ZoneSpec = {
    shape: 'circle',
    radius,
    duration: seconds,
    tick: {
      interval: 0.5,
      affects: 'enemies',
      effects: [{ kind: 'status', status: 'frozen', duration: 0.6, target: 'target' }]
    }
  };
  ctx.sim.addZone({ caster: ctx.caster, ctx: ctx.ctx, spec: freeze, duration: seconds, pos: { ...center(ctx.caster, ctx.primary) }, radius });
  buff(ctx, ctx.caster, 'exotic:chronosphere-owner', seconds, { attackSpeed: 45, moveSpeedPct: 12 });
}

function stoneGaze(ctx: ExoticContext): void {
  for (const enemy of enemiesAround(ctx, 650)) {
    applyStatus(ctx.sim, ctx.caster, enemy, 'blind', 3, { tag: 'exotic:stone-gaze:blind', mods: { blindPct: 60 } } as StatusParams, ctx.ctx);
    applyStatus(ctx.sim, ctx.caster, enemy, 'slow', 3, { tag: 'exotic:stone-gaze:slow', moveSlowPct: 35 } as StatusParams, ctx.ctx);
  }
}

function reincarnation(ctx: ExoticContext): void {
  const seconds = duration(ctx.ctx, 8);
  healUnit(ctx.sim, ctx.caster, ctx.caster.stats.maxHp * 0.25, ctx.caster);
  buff(ctx, ctx.caster, 'exotic:reincarnation', seconds, { damageTakenReductionPct: 25, hpRegen: 30 });
  ctx.sim.events.emit({ t: 'revive', uid: ctx.caster.uid, pos: { ...ctx.caster.pos } });
}

function invoke(ctx: ExoticContext): void {
  const seconds = duration(ctx.ctx, 8);
  buff(ctx, ctx.caster, 'exotic:invoke-orbs', seconds, { spellAmpPct: 12, manaRegen: 4, attackSpeed: 18 });
  ctx.caster.mana = Math.min(ctx.caster.stats.maxMana, ctx.caster.mana + 120);
}

function refreshCooldowns(ctx: ExoticContext): void {
  for (const ability of ctx.caster.abilities) {
    if (ability.def.id === ctx.ctx.defId || ability.def.id === 'tinker-rearm') continue;
    ability.cooldownUntil = Math.min(ability.cooldownUntil, ctx.sim.time);
    if (ability.charges >= 0) {
      const max = levelArr(ability.def.values?.charges, Math.max(1, ability.level), ability.charges);
      ability.charges = Math.max(ability.charges, max);
      ability.nextChargeAt = ctx.sim.time;
    }
  }
  for (const item of ctx.caster.items) {
    if (item) item.cooldownUntil = Math.min(item.cooldownUntil, ctx.sim.time);
  }
}

function rearm(ctx: ExoticContext): void {
  refreshCooldowns(ctx);
  buff(ctx, ctx.caster, 'exotic:rearm-focus', duration(ctx.ctx, 4), { spellAmpPct: 10, manaRegen: 5 });
}

function terrorFear(ctx: ExoticContext): void {
  for (const enemy of enemiesAround(ctx, 700)) applyStatus(ctx.sim, ctx.caster, enemy, 'fear', 2.5, { tag: 'exotic:terror-fear' } as StatusParams, ctx.ctx);
}

function defileGrowth(ctx: ExoticContext): void {
  buff(ctx, ctx.caster, 'exotic:defile-growth', duration(ctx.ctx, 10), { damage: 20, maxHp: 180, armor: 3 });
}

function swarmSpread(ctx: ExoticContext): void {
  const c = center(ctx.caster, ctx.primary);
  for (const enemy of enemiesAround(ctx, 650)) {
    applyDamage(ctx.sim, ctx.caster, enemy, 45 + V(ctx.ctx, 'damage', 0) * 0.25, 'magical', { element: ctx.ctx.element, piercesImmunity: ctx.ctx.piercesImmunity });
    applyStatus(ctx.sim, ctx.caster, enemy, 'slow', 2, { tag: 'exotic:swarm-spread', moveSlowPct: 25 } as StatusParams, ctx.ctx);
  }
  ctx.sim.events.emit({ t: 'aoe-burst', pos: { ...c }, radius: V(ctx.ctx, 'radius', 650), vfx: ctx.ctx.vfx });
}

function masteryTargets(ctx: ExoticContext, radius = 650): Unit[] {
  if (ctx.primary.target && ctx.primary.target.alive && ctx.primary.target.team !== ctx.caster.team && !ctx.primary.target.summary.invulnerable) return [ctx.primary.target];
  return enemiesAround(ctx, radius);
}

function masteryDamage(ctx: ExoticContext, mult = 1): number {
  return Math.max(24, V(ctx.ctx, 'damage', 0) * 0.22 + ctx.caster.stats.damage * 0.18) * mult;
}

function nearestEnemy(ctx: ExoticContext, origin: Vec2, excludeUid?: number, radius = 650): Unit | undefined {
  return ctx.sim.unitsInRadius(origin, radius, (u) => u.team !== ctx.caster.team && u.uid !== excludeUid && !u.summary.untargetable && !u.summary.invulnerable)
    .sort((a, b) => {
      const ahp = a.hp / Math.max(1, a.stats.maxHp);
      const bhp = b.hp / Math.max(1, b.stats.maxHp);
      return ahp - bhp;
    })[0];
}

function reduceCurrentAbilityCooldown(ctx: ExoticContext, pct: number, floorSec = 0): void {
  const ability = ctx.caster.abilities.find((a) => a.def.id === ctx.ctx.defId);
  if (!ability || ability.cooldownUntil <= ctx.sim.time) return;
  const remaining = ability.cooldownUntil - ctx.sim.time;
  ability.cooldownUntil = ctx.sim.time + Math.max(floorSec, remaining * (1 - pct));
}

function masteryMechanic(ctx: ExoticContext): void {
  const mechanic = String(ctx.params?.mechanic ?? '');
  const tier = Number(ctx.params?.tier ?? 2);
  const power = tier >= 4 ? 1.45 : 1;
  const targets = masteryTargets(ctx);
  const target = targets[0];
  const tag = `mastery:${mechanic}:${ctx.params?.abilityId ?? ctx.ctx.defId}`;

  switch (mechanic) {
    case 'mark':
      for (const enemy of targets) applyStatus(ctx.sim, ctx.caster, enemy, 'buff', 4 * power, { tag, mods: { magicResistPct: -4 * power, armor: -1 * power } } as StatusParams, ctx.ctx);
      break;
    case 'consume': {
      if (!target) break;
      const marked = target.statuses.find((s) => s.tag.startsWith('mastery:mark:'));
      if (marked) marked.until = ctx.sim.time;
      applyDamage(ctx.sim, ctx.caster, target, masteryDamage(ctx, marked ? 1.25 * power : 0.65 * power), 'magical', { element: ctx.ctx.element, piercesImmunity: ctx.ctx.piercesImmunity });
      break;
    }
    case 'chain': {
      if (!target) break;
      const next = nearestEnemy(ctx, target.pos, target.uid);
      if (next) applyDamage(ctx.sim, ctx.caster, next, masteryDamage(ctx, 0.55 * power), 'magical', { element: ctx.ctx.element, piercesImmunity: ctx.ctx.piercesImmunity });
      break;
    }
    case 'echo':
      buff(ctx, ctx.caster, tag, 4 * power, { spellAmpPct: 5 * power, manaRegen: 1.5 * power });
      break;
    case 'split':
      for (const enemy of enemiesAround(ctx, 520).slice(0, tier >= 4 ? 3 : 2)) applyDamage(ctx.sim, ctx.caster, enemy, masteryDamage(ctx, 0.35 * power), 'magical', { element: ctx.ctx.element, piercesImmunity: ctx.ctx.piercesImmunity });
      break;
    case 'follow':
      ctx.sim.addZone({ caster: ctx.caster, ctx: ctx.ctx, spec: { shape: 'circle', radius: 260, duration: 4 * power, tick: { interval: 0.75, affects: 'enemies', effects: [{ kind: 'status', status: 'slow', duration: 0.9, target: 'target', params: { tag, moveSlowPct: 18 * power } }] } }, duration: 4 * power, pos: { ...ctx.caster.pos }, radius: 260, followUid: ctx.caster.uid });
      break;
    case 'persist':
      ctx.sim.addZone({ caster: ctx.caster, ctx: ctx.ctx, spec: { shape: 'circle', radius: 280, duration: 3.5 * power, tick: { interval: 0.75, affects: 'enemies', effects: [{ kind: 'status', status: 'slow', duration: 0.9, target: 'target', params: { tag, moveSlowPct: 16 * power } }] } }, duration: 3.5 * power, pos: { ...center(ctx.caster, ctx.primary) }, radius: 280 });
      break;
    case 'convert':
      ctx.caster.mana = Math.min(ctx.caster.stats.maxMana, ctx.caster.mana + 18 * power + V(ctx.ctx, 'mana', 0) * 0.1);
      if (target) applyDamage(ctx.sim, ctx.caster, target, masteryDamage(ctx, 0.35 * power), 'pure', { piercesImmunity: ctx.ctx.piercesImmunity });
      break;
    case 'summon':
    case 'copy':
    case 'mirror':
      buff(ctx, ctx.caster, tag, 5 * power, { damage: 8 * power, attackSpeed: 12 * power, spellAmpPct: 3 * power });
      break;
    case 'refund':
      reduceCurrentAbilityCooldown(ctx, 0.22 * power, 0.5);
      ctx.caster.mana = Math.min(ctx.caster.stats.maxMana, ctx.caster.mana + 12 * power);
      break;
    case 'recast':
      reduceCurrentAbilityCooldown(ctx, 0.36 * power, 1);
      break;
    case 'retarget': {
      const next = nearestEnemy(ctx, center(ctx.caster, ctx.primary), target?.uid, 800);
      if (next) applyDamage(ctx.sim, ctx.caster, next, masteryDamage(ctx, 0.5 * power), 'magical', { element: ctx.ctx.element, piercesImmunity: ctx.ctx.piercesImmunity });
      break;
    }
    case 'store':
    case 'prime':
      buff(ctx, ctx.caster, tag, 6 * power, { spellAmpPct: 6 * power, damage: 6 * power });
      break;
  }
  if (['split', 'follow', 'persist', 'chain'].includes(mechanic)) ctx.sim.events.emit({ t: 'aoe-burst', pos: { ...center(ctx.caster, ctx.primary) }, radius: V(ctx.ctx, 'radius', 420), vfx: ctx.ctx.vfx });
}

export const EXOTIC_IMPLS: Record<string, ExoticHandler> = {
  invoke,
  chronosphere,
  'stone-gaze': stoneGaze,
  reincarnation,
  rearm,
  'refresh-cooldowns': refreshCooldowns,
  'spell-steal': spellSteal,
  'divided-we-stand': dividedWeStand,
  'tempest-double': tempestDouble,
  'morph-shift': morphShift,
  'primal-split': primalSplit,
  'remote-mines': remoteMines,
  'terror-fear': terrorFear,
  'defile-growth': defileGrowth,
  'swarm-spread': swarmSpread,
  'mastery-mechanic': masteryMechanic,
  'roshan-respawn': () => {}
};
