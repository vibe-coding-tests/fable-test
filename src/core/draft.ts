import { REG } from './registry';
import { Rng } from './rng';
import type { Attribute, DraftFormat, DraftRule, ItemTier, MacroHeroSetup } from './types';

// ============================================================
// Composition formats (AUTOBATTLER_OVERHAUL §5). Pure, deterministic.
// The validator gates what a player may commit and is legible to the enemy
// AI, which drafts into the same format. The counter-draft heuristic answers
// a committed shape; the pick/ban engine yields two legal teams. No DOM/three.
// ============================================================

const TIER_RANK: Record<ItemTier, number> = {
  consumable: 0, component: 1, basic: 1, t1: 1, t2: 2, t3: 3, t4: 4, special: 4
};

function rolesOf(heroId: string): readonly string[] {
  return REG.heroes.get(heroId)?.roles ?? [];
}

function attrOf(heroId: string): Attribute | null {
  return REG.heroes.get(heroId)?.attribute ?? null;
}

function roleCount(heroes: MacroHeroSetup[], role: string): number {
  return heroes.filter((h) => rolesOf(h.heroId).includes(role)).length;
}

function attrCount(heroes: MacroHeroSetup[], attribute: Attribute): number {
  return heroes.filter((h) => attrOf(h.heroId) === attribute).length;
}

function itemTierRank(itemId: string): number {
  const def = REG.items.get(itemId);
  return def ? TIER_RANK[def.tier] : 0;
}

/** Point-budget cost of a hero: the max cost among its roles (default 1). */
function heroCost(heroId: string, costByRole?: Record<string, number>): number {
  if (!costByRole) return 1;
  let c = 1;
  for (const r of rolesOf(heroId)) if (costByRole[r] !== undefined) c = Math.max(c, costByRole[r]);
  return c;
}

export interface RuleStatus {
  rule: DraftRule;
  ok: boolean;
  label: string;   // short human-facing constraint, e.g. "Carries ≤ 2"
  detail: string;  // live status, e.g. "2/2" or "missing 1"
}

export interface DraftValidation {
  ok: boolean;
  statuses: RuleStatus[];
}

/** Describe a rule for the draft screen (label) regardless of the current team. */
export function describeRule(rule: DraftRule): string {
  switch (rule.kind) {
    case 'ban-hero': return `Banned: ${rule.heroIds.map((id) => REG.heroes.get(id)?.name ?? id).join(', ')}`;
    case 'ban-role': return `No ${rule.roles.join('/')}`;
    case 'require-role': return `${cap(rule.role)} ≥ ${rule.min}`;
    case 'cap-role': return `${cap(rule.role)} ≤ ${rule.max}`;
    case 'cap-attribute': return `${rule.attribute.toUpperCase()} heroes ≤ ${rule.max}`;
    case 'unique-attribute': return 'One per attribute';
    case 'level-cap': return `Level ≤ ${rule.max}`;
    case 'item-tier-cap': return `Item tier ≤ ${rule.max}`;
    case 'point-budget': return `Point budget ${rule.total}`;
  }
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function checkRule(rule: DraftRule, heroes: MacroHeroSetup[]): RuleStatus {
  const label = describeRule(rule);
  switch (rule.kind) {
    case 'ban-hero': {
      const offenders = heroes.filter((h) => rule.heroIds.includes(h.heroId));
      return { rule, ok: offenders.length === 0, label, detail: offenders.length ? `${offenders.map((h) => REG.heroes.get(h.heroId)?.name ?? h.heroId).join(', ')} banned` : 'clear' };
    }
    case 'ban-role': {
      const offenders = heroes.filter((h) => rolesOf(h.heroId).some((r) => rule.roles.includes(r)));
      return { rule, ok: offenders.length === 0, label, detail: offenders.length ? `${offenders.length} illegal` : 'clear' };
    }
    case 'require-role': {
      const n = roleCount(heroes, rule.role);
      return { rule, ok: n >= rule.min, label, detail: `${n}/${rule.min}` };
    }
    case 'cap-role': {
      const n = roleCount(heroes, rule.role);
      return { rule, ok: n <= rule.max, label, detail: `${n}/${rule.max}` };
    }
    case 'cap-attribute': {
      const n = attrCount(heroes, rule.attribute);
      return { rule, ok: n <= rule.max, label, detail: `${n}/${rule.max}` };
    }
    case 'unique-attribute': {
      const attrs = heroes.map((h) => attrOf(h.heroId));
      const ok = new Set(attrs).size === attrs.length;
      return { rule, ok, label, detail: ok ? 'all unique' : 'duplicate' };
    }
    case 'level-cap': {
      const offenders = heroes.filter((h) => (h.level ?? 1) > rule.max);
      return { rule, ok: offenders.length === 0, label, detail: offenders.length ? `${offenders.length} over` : 'ok' };
    }
    case 'item-tier-cap': {
      const offenders = heroes.filter((h) => (h.items ?? []).some((id) => itemTierRank(id) > rule.max));
      return { rule, ok: offenders.length === 0, label, detail: offenders.length ? `${offenders.length} luxury` : 'ok' };
    }
    case 'point-budget': {
      const spent = heroes.reduce((acc, h) => acc + heroCost(h.heroId, rule.costByRole), 0);
      return { rule, ok: spent <= rule.total, label, detail: `${spent}/${rule.total}` };
    }
  }
}

/** Validate a committed five against a format (§5.1). No format => always legal. */
export function validateDraft(format: DraftFormat | undefined, heroes: MacroHeroSetup[]): DraftValidation {
  if (!format || format.rules.length === 0) return { ok: true, statuses: [] };
  const statuses = format.rules.map((r) => checkRule(r, heroes));
  return { ok: statuses.every((s) => s.ok), statuses };
}

export function isLegalDraft(format: DraftFormat | undefined, heroes: MacroHeroSetup[]): boolean {
  return validateDraft(format, heroes).ok;
}

// ---------- legal-team building (AI + satisfiability + counter-draft fill) ----------

/** The hard constraints that adding a hero must never break (require-role is a goal, not a gate). */
function canAdd(format: DraftFormat, team: MacroHeroSetup[], hero: MacroHeroSetup): boolean {
  for (const rule of format.rules) {
    switch (rule.kind) {
      case 'ban-hero': if (rule.heroIds.includes(hero.heroId)) return false; break;
      case 'ban-role': if (rolesOf(hero.heroId).some((r) => rule.roles.includes(r))) return false; break;
      case 'cap-role': if (rolesOf(hero.heroId).includes(rule.role) && roleCount(team, rule.role) + 1 > rule.max) return false; break;
      case 'cap-attribute': if (attrOf(hero.heroId) === rule.attribute && attrCount(team, rule.attribute) + 1 > rule.max) return false; break;
      case 'unique-attribute': if (team.some((h) => attrOf(h.heroId) === attrOf(hero.heroId))) return false; break;
      case 'level-cap': if ((hero.level ?? 1) > rule.max) return false; break;
      case 'item-tier-cap': if ((hero.items ?? []).some((id) => itemTierRank(id) > rule.max)) return false; break;
      case 'point-budget': {
        const spent = team.reduce((acc, h) => acc + heroCost(h.heroId, rule.costByRole), 0);
        if (spent + heroCost(hero.heroId, rule.costByRole) > rule.total) return false;
        break;
      }
      case 'require-role': break; // a goal, satisfied in pass 1
    }
  }
  return true;
}

export interface BuildOpts {
  level?: number;
  items?: (heroId: string) => string[] | undefined;
  size?: number;
}

/**
 * Greedily build a legal team of up to `size` from a pool (§5.4 fill / AI draft).
 * Pass 1 satisfies every `require-role` minimum; pass 2 fills the rest. Deterministic
 * for a seed (sorted pool, rng tiebreak), so a counter-draft replays identically.
 */
export function buildLegalTeam(
  format: DraftFormat | undefined,
  pool: string[],
  seed: number,
  opts: BuildOpts = {}
): MacroHeroSetup[] {
  const size = opts.size ?? 5;
  const level = opts.level ?? 30;
  const fmt: DraftFormat = format ?? { rules: [] };
  const rng = new Rng(seed);
  const make = (heroId: string): MacroHeroSetup => ({ heroId, level, items: opts.items?.(heroId) });
  const ordered = [...new Set(pool)].filter((id) => REG.heroes.has(id)).sort();
  // a stable shuffle so distinct seeds yield distinct (still deterministic) teams
  const shuffled = ordered.map((id) => ({ id, k: rng.next() })).sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : 1)).map((e) => e.id);

  const team: MacroHeroSetup[] = [];
  const taken = new Set<string>();
  const add = (id: string): void => { team.push(make(id)); taken.add(id); };

  // pass 1: meet require-role mins
  for (const rule of fmt.rules) {
    if (rule.kind !== 'require-role') continue;
    while (roleCount(team, rule.role) < rule.min && team.length < size) {
      const pick = shuffled.find((id) => !taken.has(id) && rolesOf(id).includes(rule.role) && canAdd(fmt, team, make(id)));
      if (!pick) break;
      add(pick);
    }
  }
  // pass 2: fill remaining slots. Under a point-budget, prefer cheaper heroes so a
  // tight budget still reaches a full five (greedy-by-cost beats greedy-by-order).
  const budget = fmt.rules.find((r) => r.kind === 'point-budget') as Extract<DraftRule, { kind: 'point-budget' }> | undefined;
  const fillOrder = budget
    ? [...shuffled].sort((a, b) => heroCost(a, budget.costByRole) - heroCost(b, budget.costByRole))
    : shuffled;
  for (const id of fillOrder) {
    if (team.length >= size) break;
    if (taken.has(id)) continue;
    if (canAdd(fmt, team, make(id))) add(id);
  }
  return team;
}

/**
 * The single deterministic best legal choice from a pool for a side mid-draft (§4.2):
 * prefers a hero that fills an unmet `require-role`, else any legal pick, seeded-shuffled
 * for variety. Used for an AI pick (own pool/team/format) and an AI ban (the opponent's
 * pool/team/format — deny their strongest legal option). Null if nothing is legal.
 */
export function chooseDraft(opts: {
  pool: string[];
  team: MacroHeroSetup[];
  banned: string[];
  format?: DraftFormat;
  level?: number;
  seed: number;
}): string | null {
  const fmt = opts.format ?? { rules: [] };
  const level = opts.level ?? 30;
  const rng = new Rng(opts.seed);
  const avail = [...new Set(opts.pool)].filter(
    (id) => REG.heroes.has(id) && !opts.banned.includes(id) && !opts.team.some((h) => h.heroId === id)
  );
  const shuffled = avail.map((id) => ({ id, k: rng.next() })).sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : 1)).map((e) => e.id);
  const unmet = fmt.rules.filter((r): r is Extract<DraftRule, { kind: 'require-role' }> => r.kind === 'require-role' && roleCount(opts.team, r.role) < r.min);
  const needed = shuffled.find((id) => unmet.some((r) => rolesOf(id).includes(r.role)) && canAdd(fmt, opts.team, { heroId: id, level }));
  if (needed) return needed;
  return shuffled.find((id) => canAdd(fmt, opts.team, { heroId: id, level })) ?? null;
}

/** Whether a hero may legally be added to a team under a format (exposed for draft UIs). */
export function canDraftHero(format: DraftFormat | undefined, team: MacroHeroSetup[], heroId: string, level = 30): boolean {
  if (!REG.heroes.has(heroId)) return false;
  if (team.some((h) => h.heroId === heroId)) return false;
  return canAdd(format ?? { rules: [] }, team, { heroId, level });
}

/** Is there *any* legal five drawable from this pool? (acceptance: each format satisfiable). */
export function formatSatisfiable(format: DraftFormat | undefined, pool: string[]): boolean {
  const team = buildLegalTeam(format, pool, 1, { level: format?.rules.find((r) => r.kind === 'level-cap') ? (format.rules.find((r) => r.kind === 'level-cap') as { max: number }).max : 30 });
  return team.length === 5 && isLegalDraft(format, team);
}

// ---------- counter-draft (§5.4): the enemy answers your shape ----------

const ANTI_CARRY: readonly string[] = ['doom', 'axe', 'legion-commander', 'viper', 'slardar', 'bane', 'shadow-demon'];
const ANTI_COMBO: readonly string[] = ['silencer', 'nyx-assassin', 'anti-mage', 'night-stalker', 'doom'];

export interface CounterDraftResult {
  enemy: MacroHeroSetup[];
  swappedOut: string[];
  swappedIn: string[];
  reason: string;
}

function firstAvailableCounter(
  candidates: readonly string[],
  used: Set<string>,
  pool: Set<string>,
  format: DraftFormat | undefined,
  enemy: MacroHeroSetup[],
  outIdx: number,
  enemyLevel: number
): string | null {
  for (const id of candidates) {
    if (!REG.heroes.has(id) || used.has(id) || !pool.has(id)) continue;
    const next = enemy.map((h, i) => i === outIdx ? { heroId: id, level: enemyLevel, items: ['black-king-bar'] } : h);
    if (isLegalDraft(format, next)) return id;
  }
  return null;
}

/**
 * Answer a committed player shape (§5.4). `last-pick` swaps one or two enemy slots to
 * a deterministic counter (anti-carry vs a double-carry, a silence vs a combo team);
 * `mirror-shape` drafts a fresh legal five from the pool by seed; `none` is unchanged.
 */
export function counterDraft(
  format: DraftFormat | undefined,
  playerHeroes: MacroHeroSetup[],
  baseEnemy: MacroHeroSetup[],
  pool: string[],
  seed: number
): CounterDraftResult {
  const mode = format?.counterDraft ?? 'none';
  if (mode === 'none') return { enemy: baseEnemy, swappedOut: [], swappedIn: [], reason: '' };

  if (mode === 'mirror-shape') {
    const enemyLevel = baseEnemy[0]?.level ?? 24;
    const fresh = buildLegalTeam(format, pool, seed, {
      level: enemyLevel,
      items: () => ['black-king-bar']
    });
    const enemy = fresh.length === 5 ? fresh : baseEnemy;
    return { enemy, swappedOut: [], swappedIn: enemy.map((h) => h.heroId), reason: 'drafts a fresh five to a fixed shape' };
  }

  // last-pick: one or two targeted swaps answering the player's composition.
  const rng = new Rng(seed);
  const carries = roleCount(playerHeroes, 'carry');
  const casters = roleCount(playerHeroes, 'nuker') + attrCount(playerHeroes, 'int');
  const used = new Set([...baseEnemy.map((h) => h.heroId), ...playerHeroes.map((h) => h.heroId)]);
  const availablePool = new Set(pool.filter((id) => REG.heroes.has(id)));

  const wants: { pool: readonly string[]; reason: string }[] = [];
  if (carries >= 2) wants.push({ pool: ANTI_CARRY, reason: 'answers your double-carry with a lockdown' });
  if (casters >= 3) wants.push({ pool: ANTI_COMBO, reason: 'answers your spell-heavy draft with a silence' });
  if (wants.length === 0) wants.push({ pool: ANTI_CARRY, reason: 'tightens the lineup against your core' });

  const enemy = baseEnemy.map((h) => ({ ...h }));
  const swappedOut: string[] = [];
  const swappedIn: string[] = [];
  const enemyLevel = baseEnemy[0]?.level ?? 24;

  for (const want of wants.slice(0, 2)) {
    // swap out the enemy's least counter-relevant slot (deterministic: a non-durable body)
    const outIdx = pickSwapTarget(enemy, rng);
    if (outIdx < 0) break;
    const pick = firstAvailableCounter(want.pool, used, availablePool, format, enemy, outIdx, enemyLevel);
    if (!pick) continue;
    swappedOut.push(enemy[outIdx].heroId);
    enemy[outIdx] = { heroId: pick, level: enemyLevel, items: ['black-king-bar'] };
    used.add(pick);
    swappedIn.push(pick);
  }

  return {
    enemy,
    swappedOut,
    swappedIn,
    reason: swappedIn.length ? wants[0].reason : ''
  };
}

/** Pick the enemy slot to replace: prefer a squishy/non-durable body, deterministic. */
function pickSwapTarget(enemy: MacroHeroSetup[], rng: Rng): number {
  const candidates = enemy
    .map((h, i) => ({ i, durable: rolesOf(h.heroId).includes('durable') }))
    .filter((e) => !e.durable);
  const pool = candidates.length ? candidates : enemy.map((_, i) => ({ i, durable: false }));
  return pool[rng.int(0, pool.length - 1)].i;
}

// ---------- Elite Five pick/ban (§4.2): a small deterministic state machine ----------

export interface PickBanResult {
  player: MacroHeroSetup[];
  enemy: MacroHeroSetup[];
  bans: string[];
}

/**
 * Alternating ban/pick over two pools (SPEC §7). Each pick is the highest-priority
 * legal hero for that side; bans remove the opponent's best remaining option. Both
 * teams come out legal w.r.t. their (optional) format. Deterministic for a seed.
 */
export function runPickBan(opts: {
  playerPool: string[];
  enemyPool: string[];
  order: ('pick' | 'ban')[];
  seed: number;
  playerFormat?: DraftFormat;
  enemyFormat?: DraftFormat;
  playerItems?: (heroId: string) => string[] | undefined;
  enemyItems?: (heroId: string) => string[] | undefined;
  level?: number;
}): PickBanResult {
  const rng = new Rng(opts.seed);
  const level = opts.level ?? 30;
  const banned = new Set<string>();
  const player: MacroHeroSetup[] = [];
  const enemy: MacroHeroSetup[] = [];
  const pFmt: DraftFormat = opts.playerFormat ?? { rules: [] };
  const eFmt: DraftFormat = opts.enemyFormat ?? { rules: [] };

  const avail = (poolIds: string[], team: MacroHeroSetup[]): string[] =>
    [...new Set(poolIds)]
      .filter((id) => REG.heroes.has(id) && !banned.has(id) && !team.some((h) => h.heroId === id))
      .sort();

  const order = (ids: string[]): string[] => ids.map((id) => ({ id, k: rng.next() })).sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : 1)).map((e) => e.id);

  let side: 0 | 1 = 0; // bans/picks alternate sides
  for (const step of opts.order) {
    if (step === 'ban') {
      // ban the opponent's strongest legal option
      const targetPool = side === 0 ? opts.enemyPool : opts.playerPool;
      const targetTeam = side === 0 ? enemy : player;
      const targetFmt = side === 0 ? eFmt : pFmt;
      const cand = order(avail(targetPool, targetTeam)).find((id) => canAdd(targetFmt, targetTeam, { heroId: id, level }));
      if (cand) banned.add(cand);
    } else {
      const team = side === 0 ? player : enemy;
      const pool = side === 0 ? opts.playerPool : opts.enemyPool;
      const fmt = side === 0 ? pFmt : eFmt;
      const items = side === 0 ? opts.playerItems : opts.enemyItems;
      if (team.length < 5) {
        const cand = order(avail(pool, team)).find((id) => canAdd(fmt, team, { heroId: id, level }));
        if (cand) team.push({ heroId: cand, level, items: items?.(cand) });
      }
    }
    side = side === 0 ? 1 : 0;
  }

  // top up to five (in case bans starved a side) and meet require-role goals
  const topUp = (team: MacroHeroSetup[], pool: string[], fmt: DraftFormat, items?: (id: string) => string[] | undefined): void => {
    const filled = buildLegalTeam(fmt, [...team.map((h) => h.heroId), ...pool].filter((id) => !banned.has(id)), opts.seed, { level, items });
    for (const h of filled) {
      if (team.length >= 5) break;
      if (!team.some((t) => t.heroId === h.heroId)) team.push(h);
    }
  };
  topUp(player, opts.playerPool, pFmt, opts.playerItems);
  topUp(enemy, opts.enemyPool, eFmt, opts.enemyItems);

  return { player: player.slice(0, 5), enemy: enemy.slice(0, 5), bans: [...banned] };
}
