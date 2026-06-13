import { TUNING } from '../data/tuning';
import { clamp } from './math2d';
import { REG } from './registry';
import { deriveStats, levelFromXp, xpForLevel, type DerivedStats } from './stats';
import {
  STATUS_META,
  summarize,
  type StatusInstance,
  type StatusSummary
} from './status';
import type {
  AbilityDef,
  AttackModSpec,
  Attribute,
  CreepDef,
  CreepTier,
  GambitRule,
  HeroBaseStats,
  HeroDef,
  Order,
  SilhouetteSpec,
  StatusId,
  SummonSpec,
  Team,
  TriggerSpec,
  UnitKind,
  Vec2
} from './types';
import { abilityMaxLevel, abilityVal, levelArr } from './values';

export interface AbilityState {
  def: AbilityDef;
  level: number;             // 0 = not learned
  cooldownUntil: number;
  charges: number;           // -1 = not charge-based
  nextChargeAt: number;
  toggled: boolean;
  nextToggleTickAt: number;
}

export interface ItemState {
  defId: string;
  charges: number;           // -1 = n/a
  cooldownUntil: number;
}

export interface CastState {
  source: 'ability' | 'item';
  slot: number;
  fireAt: number;
  targetUid?: number;
  point?: Vec2;
}

export interface ChannelState {
  source: 'ability' | 'item';
  slot: number;
  until: number;
  nextTickAt: number;
  interval: number;
  targetUid?: number;
  point?: Vec2;
}

export interface CaptureChannelState {
  targetUid: number;
  startedAt: number;
  until: number;
}

export interface ForcedMove {
  kind: 'knockback' | 'pull' | 'forced';
  dir: Vec2;                 // unit vector (recomputed for pulls)
  speed: number;
  until: number;
  pullToUid?: number;
  stopAtDist?: number;
}

export interface ControllerRef {
  kind: 'player' | 'creep' | 'gambit' | 'boss' | 'ward' | 'none';
  /** creep AI home */
  homePos?: Vec2;
  /** follow owner (entourage / summons) */
  followOwner?: boolean;
  /** gambit rules */
  rules?: GambitRule[];
  focusUid?: number;
  /** boss threat table: unit uid -> threat score */
  threat?: Record<number, number>;
  wanderTarget?: Vec2 | null;
  nextThinkAt?: number;
  leashed?: boolean;
}

export interface TriggerRuntime {
  spec: TriggerSpec;
  /** values context for refs */
  values?: Record<string, number[]>;
  level: number;             // owning ability level (1 for items)
  sourceLabel: string;
  itemSlot?: number;         // trigger owned by an item
  lastFiredAt: number;
  stacks: number;
}

let UID = 1;
export function nextUid(): number {
  return UID++;
}
export function resetUidCounter(to = 1): void {
  UID = to;
}

export class Unit {
  uid: number;
  kind: UnitKind;
  team: Team;
  name: string;

  heroId?: string;
  creepId?: string;
  star: 1 | 2 | 3 = 1;
  ownerUid?: number;         // summons / entourage
  lifetimeUntil?: number;    // summons
  capturable = false;
  tier?: CreepTier;
  aggroRadius?: number;
  /** renderer hint for summons/wards (heroes and creeps resolve via REG) */
  visual?: { silhouette: SilhouetteSpec; palette: [string, string, string] };

  attribute: Attribute;
  base: HeroBaseStats;

  level = 1;
  xp = 0;

  pos: Vec2;
  prevPos: Vec2;
  facing = 0;
  radius: number;

  hp: number;
  mana: number;
  alive = true;
  diedAt = -1;
  removeAt = -1;

  abilities: AbilityState[] = [];
  items: (ItemState | null)[] = [null, null, null, null, null, null];
  statuses: StatusInstance[] = [];
  elementAuras: Partial<Record<Exclude<import('./types').ElementId, 'neutral'>, { gauge: number; until: number; sourceUid: number }>> = {};
  permanentMods: Record<string, number> = {};  // Flesh Heap stacks etc.
  externalMods: Record<string, number> = {};   // talents + facets, applied at setup
  triggers: TriggerRuntime[] = [];
  triggerStacks = new Map<string, number>();   // stacks per ability id (Flesh Heap)

  order: Order = { kind: 'stop' };
  attackTargetUid = -1;
  windupUntil = -1;          // attack point in progress
  windupTargetUid = -1;
  nextAttackReadyAt = 0;
  cast: CastState | null = null;
  channel: ChannelState | null = null;
  captureCh: CaptureChannelState | null = null;
  forced: ForcedMove[] = [];

  ctrl: ControllerRef = { kind: 'none' };

  bounty = { xp: 0, gold: 0 };

  lastEnemyDamageAt = -999;  // for blink lockout + save combat lock
  lastDealtDamageAt = -999;
  recentDamagers: { uid: number; at: number }[] = [];

  // caches (recomputed each tick)
  summary: StatusSummary;
  stats: DerivedStats;

  // render hints
  castingUntil = -1;

  constructor(opts: {
    kind: UnitKind;
    team: Team;
    name: string;
    attribute: Attribute;
    base: HeroBaseStats;
    pos: Vec2;
    radius: number;
    level?: number;
  }) {
    this.uid = nextUid();
    this.kind = opts.kind;
    this.team = opts.team;
    this.name = opts.name;
    this.attribute = opts.attribute;
    this.base = { ...opts.base };
    this.pos = { ...opts.pos };
    this.prevPos = { ...opts.pos };
    this.radius = opts.radius;
    this.level = opts.level ?? 1;
    this.summary = summarize([], 0);
    this.stats = this.computeStats(0);
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
  }

  // ---------- stats ----------

  private aggregateMods(): Record<string, number> {
    const total: Record<string, number> = {};
    const addAll = (m?: Record<string, number>) => {
      if (!m) return;
      for (const k in m) total[k] = (total[k] ?? 0) + m[k];
    };
    addAll(this.externalMods);
    addAll(this.permanentMods);
    // ability passives (disabled by break)
    if (!this.summary.broken) {
      for (const a of this.abilities) {
        if (a.level <= 0 || !a.def.passiveMods) continue;
        const m: Record<string, number> = {};
        for (const k in a.def.passiveMods) m[k] = abilityVal(a.def, a.def.passiveMods[k], a.level);
        addAll(m);
      }
    }
    // item passives always apply (all six slots, SPEC §5)
    for (const it of this.items) {
      if (!it) continue;
      const def = REG.items.get(it.defId);
      if (def?.passiveMods) addAll(def.passiveMods as Record<string, number>);
    }
    // statuses (incl. auras applied as buff statuses)
    addAll(this.summary.mods);
    return total;
  }

  computeStats(now: number): DerivedStats {
    this.summary = summarize(this.statuses, now);
    return deriveStats({
      attribute: this.attribute,
      base: this.base,
      level: this.level,
      mods: this.aggregateMods(),
      moveSlowFactor: this.summary.moveSlowFactor,
      attackSlowTotal: this.summary.attackSlowTotal,
      msOverride: this.summary.msOverride
    });
  }

  refresh(now: number): void {
    const prevMaxHp = this.stats.maxHp;
    const prevMaxMana = this.stats.maxMana;
    this.stats = this.computeStats(now);
    if (this.stats.maxHp !== prevMaxHp) {
      this.hp = clamp(this.hp + Math.max(0, this.stats.maxHp - prevMaxHp), 0, this.stats.maxHp);
    }
    this.hp = Math.min(this.hp, this.stats.maxHp);
    if (this.stats.maxMana > prevMaxMana) this.mana += this.stats.maxMana - prevMaxMana;
    this.mana = Math.min(this.mana, this.stats.maxMana);
  }

  // ---------- statuses ----------

  /** Returns false when blocked by magic immunity. */
  addStatus(inst: StatusInstance, piercesImmunity = false): boolean {
    const meta = STATUS_META[inst.status];
    if (inst.isDebuff && this.summary.magicImmune && !piercesImmunity) return false;
    if (!this.alive) return false;
    const existing = this.statuses.find((s) => s.tag === inst.tag && s.status === inst.status);
    if (existing) {
      existing.until = Math.max(existing.until, inst.until);
      existing.mods = inst.mods;
      existing.dotDps = inst.dotDps;
      existing.moveSlowPct = inst.moveSlowPct;
      existing.attackSlowPct = inst.attackSlowPct;
      existing.sourceUid = inst.sourceUid;
      if (inst.periodic && existing.periodic) existing.periodic.interval = inst.periodic.interval;
      return true;
    }
    this.statuses.push(inst);
    void meta;
    return true;
  }

  hasStatus(status: StatusId): boolean {
    return this.statuses.some((s) => s.status === status);
  }

  removeStatusWhere(pred: (s: StatusInstance) => boolean): StatusInstance[] {
    const removed: StatusInstance[] = [];
    this.statuses = this.statuses.filter((s) => {
      if (pred(s)) {
        removed.push(s);
        return false;
      }
      return true;
    });
    return removed;
  }

  /** Basic dispel: removes purgeable debuffs (self-cast like BKB) or purgeable buffs (enemy purge). */
  dispel(removeDebuffs: boolean): StatusInstance[] {
    return this.removeStatusWhere((s) => {
      const meta = STATUS_META[s.status];
      if (!meta.purgeable) return false;
      return removeDebuffs ? s.isDebuff : !s.isDebuff;
    });
  }

  // ---------- abilities ----------

  setupHeroAbilities(def: HeroDef): void {
    this.abilities = def.abilities.map((a) => ({
      def: a,
      level: 0,
      cooldownUntil: 0,
      charges: -1,
      nextChargeAt: 0,
      toggled: false,
      nextToggleTickAt: 0
    }));
  }

  /** Auto-assign skill points: ult at 6/12/18, basics round-robin via skillOrder. */
  autoLevelAbilities(skillOrder?: number[]): void {
    for (const a of this.abilities) a.level = 0;
    const ultIdx = this.abilities.findIndex((a) => a.def.ult);
    const basics = this.abilities.map((_, i) => i).filter((i) => i !== ultIdx);
    const order = (skillOrder ?? basics).filter((i) => basics.includes(i));
    let oi = 0;
    for (let lvl = 1; lvl <= this.level; lvl++) {
      if (ultIdx >= 0 && (lvl === 6 || lvl === 12 || lvl === 18)) {
        const ult = this.abilities[ultIdx];
        if (ult.level < abilityMaxLevel(ult.def)) {
          ult.level++;
          continue;
        }
      }
      // find next basic that can still level
      let assigned = false;
      for (let tries = 0; tries < order.length; tries++) {
        const slot = order[oi % order.length];
        oi++;
        const ab = this.abilities[slot];
        if (ab.level < abilityMaxLevel(ab.def)) {
          ab.level++;
          assigned = true;
          break;
        }
      }
      if (!assigned && ultIdx >= 0) {
        const ult = this.abilities[ultIdx];
        if (ult.level < abilityMaxLevel(ult.def)) ult.level++;
      }
    }
    // init charges
    for (const a of this.abilities) {
      const ch = a.def.values?.charges;
      if (a.level > 0 && ch) {
        const max = levelArr(ch, a.level);
        if (a.charges < 0) a.charges = max;
        else a.charges = Math.min(a.charges, max);
      }
    }
  }

  abilityReady(slot: number, now: number, manaScale = 1): { ok: boolean; reason?: string } {
    const a = this.abilities[slot];
    if (!a || a.level <= 0) return { ok: false, reason: 'not-learned' };
    if (a.def.targeting === 'passive' || a.def.targeting === 'aura' || a.def.targeting === 'attack-modifier') {
      return { ok: false, reason: 'passive' };
    }
    const usesCharges = a.charges >= 0;
    if (usesCharges) {
      if (a.charges <= 0) return { ok: false, reason: 'cooldown' };
    } else if (now < a.cooldownUntil) {
      return { ok: false, reason: 'cooldown' };
    }
    const cost = levelArr(a.def.manaCost, a.level) * TUNING.manaCostScale * manaScale;
    if (this.mana < cost) return { ok: false, reason: 'mana' };
    return { ok: true };
  }

  // ---------- xp ----------

  /** Returns number of levels gained. */
  addXp(amount: number): number {
    if (this.kind !== 'hero') return 0;
    const before = this.level;
    this.xp += amount;
    const capXp = xpForLevel(TUNING.levelCap);
    if (this.xp > capXp) this.xp = capXp;
    this.level = levelFromXp(this.xp);
    return this.level - before;
  }

  // ---------- attack mods ----------

  collectAttackMods(): { spec: AttackModSpec; values?: Record<string, number[]>; level: number; consumeTag?: string }[] {
    const out: { spec: AttackModSpec; values?: Record<string, number[]>; level: number; consumeTag?: string }[] = [];
    if (!this.summary.broken) {
      for (const a of this.abilities) {
        if (a.level > 0 && a.def.attackMod) out.push({ spec: a.def.attackMod, values: a.def.values, level: a.level });
      }
    }
    for (const it of this.items) {
      if (!it) continue;
      const def = REG.items.get(it.defId);
      if (def?.attackMod) out.push({ spec: def.attackMod, level: 1 });
    }
    for (const s of this.statuses) {
      if (s.attackMod) out.push({ spec: s.attackMod, level: 1, consumeTag: s.consumeOnAttack ? s.tag : undefined });
    }
    return out;
  }

  isVisibleTo(team: Team, now: number): boolean {
    if (this.team === team) return true;
    if (this.summary.invisible && !(this.summary.mods.revealed > 0)) return false;
    void now;
    return true;
  }

  manaCostOf(slot: number): number {
    const a = this.abilities[slot];
    if (!a) return 0;
    return levelArr(a.def.manaCost, Math.max(1, a.level)) * TUNING.manaCostScale;
  }

  cooldownOf(slot: number): number {
    const a = this.abilities[slot];
    if (!a) return 0;
    return levelArr(a.def.cooldown, Math.max(1, a.level)) * TUNING.cooldownScale;
  }
}

// ---------- factory helpers ----------

export function heroBaseToStats(def: HeroDef): HeroBaseStats {
  return { ...def.baseStats };
}

export function creepToBase(def: CreepDef, star: 1 | 2 | 3): HeroBaseStats {
  const dm = TUNING.starDamageMult[star - 1];
  return {
    str: 0, agi: 0, int: 0, strGain: 0, agiGain: 0, intGain: 0,
    baseDamage: def.stats.damage * dm,
    baseArmor: def.stats.armor,
    attackRange: def.stats.attackRange,
    attackPoint: 0.4,
    baseAttackTime: def.stats.baseAttackTime,
    attackProjectileSpeed: def.stats.attackProjectileSpeed,
    moveSpeed: def.stats.moveSpeed,
    turnRate: 0.8,
    hpRegen: 0.5,
    manaRegen: 1.0
  };
}

export function makeCreepUnit(def: CreepDef, opts: { team: Team; pos: Vec2; star?: 1 | 2 | 3; wild?: boolean }): Unit {
  const star = opts.star ?? 1;
  const sm = TUNING.starStatMult[star - 1];
  const u = new Unit({
    kind: 'creep',
    team: opts.team,
    name: def.name,
    attribute: 'str',
    base: creepToBase(def, star),
    pos: opts.pos,
    radius: TUNING.unitRadiusCreep[def.tier]
  });
  u.creepId = def.id;
  u.star = star;
  u.tier = def.tier;
  u.capturable = !!opts.wild;
  u.bounty = { xp: def.bounty.xp * sm, gold: def.bounty.gold * sm };
  // creeps: fixed pools, no attribute scaling
  u.externalMods = {
    maxHp: def.stats.maxHp * sm - (TUNING.baseHp + 0),
    magicResistPct: def.stats.magicResistPct - TUNING.baseMagicResist
  };
  u.abilities = def.abilities.map((a) => ({
    def: a,
    level: Math.min(star, abilityMaxLevel(a)),
    cooldownUntil: 0,
    charges: -1,
    nextChargeAt: 0,
    toggled: false,
    nextToggleTickAt: 0
  }));
  u.refresh(0);
  u.hp = u.stats.maxHp;
  u.mana = u.stats.maxMana;
  return u;
}

export function makeSummonUnit(spec: SummonSpec, opts: { owner: Unit; pos: Vec2; now: number }): Unit {
  const u = new Unit({
    kind: spec.cannotAttack ? 'ward' : 'summon',
    team: opts.owner.team,
    name: spec.name,
    attribute: 'str',
    base: {
      str: 0, agi: 0, int: 0, strGain: 0, agiGain: 0, intGain: 0,
      baseDamage: spec.stats.damage,
      baseArmor: spec.stats.armor,
      attackRange: spec.stats.attackRange,
      attackPoint: 0.35,
      baseAttackTime: spec.stats.baseAttackTime,
      moveSpeed: spec.stats.moveSpeed,
      turnRate: 0.9,
      hpRegen: 0,
      manaRegen: 0
    },
    pos: opts.pos,
    radius: 20
  });
  u.creepId = spec.id;
  u.ownerUid = opts.owner.uid;
  u.visual = { silhouette: spec.silhouette, palette: spec.palette };
  u.externalMods = {
    maxHp: spec.stats.maxHp - TUNING.baseHp,
    magicResistPct: (spec.stats.magicResistPct ?? 0) - TUNING.baseMagicResist
  };
  u.abilities = (spec.abilities ?? []).map((a) => ({
    def: a,
    level: 1,
    cooldownUntil: 0,
    charges: -1,
    nextChargeAt: 0,
    toggled: false,
    nextToggleTickAt: 0
  }));
  u.refresh(opts.now);
  u.hp = u.stats.maxHp;
  u.mana = u.stats.maxMana;
  return u;
}
