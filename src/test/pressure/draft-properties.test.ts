import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data';
import { ALL_GYMS } from '../../data/gyms';
import {
  validateDraft,
  isLegalDraft,
  buildLegalTeam,
  counterDraft,
  formatSatisfiable,
  canDraftHero
} from '../../core/draft';
import { HERO_POOL, randomTeam, rng } from './_fuzz';
import type { DraftFormat, MacroHeroSetup } from '../../core/types';

// ============================================================
// PRESSURE §5 — draft/format algebra (pure, heavily fuzzed).
//
// The draft layer is the one place the player can hand the engine an
// arbitrary, possibly-illegal request, and the enemy AI answers it. The
// invariants here are absolute, not statistical:
//   * a validation's verdict equals the AND of its per-rule statuses
//   * a "legal team" the builder returns is actually legal
//   * the counter-draft NEVER turns a legal enemy illegal, and is
//     deterministic
//   * canDraftHero agrees with what actually validating the result says
// These are exactly the properties a from-scratch spec would demand, and
// they hold for inputs no example-based test enumerated.
// ============================================================

beforeAll(() => registerAllContent());

const FORMATS: { id: string; format: DraftFormat }[] = ALL_GYMS
  .filter((g) => g.format && g.format.rules.length > 0)
  .map((g) => ({ id: g.id, format: g.format! }));

/** The hard constraints (everything except require-role, which is a goal). */
function legalIgnoringGoals(format: DraftFormat, team: MacroHeroSetup[]): boolean {
  return validateDraft(format, team).statuses
    .filter((s) => s.rule.kind !== 'require-role')
    .every((s) => s.ok);
}

describe('PRESSURE: validation verdict is consistent with its statuses', () => {
  it('ok === every status ok, and isLegalDraft agrees, over 400 random teams', () => {
    for (let i = 0; i < 400; i++) {
      const seed = 100 + i;
      const { format } = FORMATS[i % FORMATS.length];
      const team = randomTeam(seed, 1 + (i % 6)); // sizes 1..6, including illegal over-caps
      const v = validateDraft(format, team);
      expect(v.ok).toBe(v.statuses.every((s) => s.ok));
      expect(isLegalDraft(format, team)).toBe(v.ok);
    }
  });
});

describe('PRESSURE: every shipped gym format is satisfiable and self-consistent', () => {
  it('a legal five is always draftable from the full roster', () => {
    for (const { id, format } of FORMATS) {
      expect(formatSatisfiable(format, HERO_POOL), `${id} should be satisfiable`).toBe(true);
    }
  });

  // Known content gap surfaced by this suite (subset-allowlisted, not locked in):
  //   tide-gym bans the `escape` role ("no slippery cores, stand and fight") but
  //   its own enemy team fields slark (carry/escape) and would-be naga. The player
  //   is forbidden a hero the boss fields. Fixing it (drop the ban or swap slark)
  //   is a content/balance call; until then we track it so NEW violations still fail
  //   and a fix flips the entry to a non-violation without breaking this test.
  const KNOWN_HARD_GAPS: Record<string, string[]> = {
    'tide-gym': ['No escape']
  };

  it("each gym's own enemy team obeys its own format's HARD constraints", () => {
    // Hard constraints (bans/caps/level/item-tier/budget/unique) are "illegal if
    // broken"; require-role is an aspirational goal the fixed encounter may not
    // meet (e.g. burrow-gym's enemy fields fewer supports than its Support ≥ 2
    // goal asks of the player). We assert the former and surface the latter.
    for (const gym of ALL_GYMS) {
      if (!gym.format || gym.format.rules.length === 0) continue;
      const v = validateDraft(gym.format, gym.enemyTeam);
      const hardViolations = v.statuses
        .filter((s) => !s.ok && s.rule.kind !== 'require-role')
        .map((s) => s.label);
      const allowed = new Set(KNOWN_HARD_GAPS[gym.id] ?? []);
      const unexpected = hardViolations.filter((label) => !allowed.has(label));
      expect(unexpected, `${gym.id} enemy team breaks hard rules`).toEqual([]);
    }
  });
});

describe('PRESSURE: buildLegalTeam only ever returns legal teams', () => {
  it('respects hard constraints for every format across 50 seeds', () => {
    for (const { id, format } of FORMATS) {
      for (let s = 0; s < 50; s++) {
        const team = buildLegalTeam(format, HERO_POOL, 1234 + s, { level: 28 });
        expect(team.length, `${id} seed ${s}`).toBeLessThanOrEqual(5);
        expect(legalIgnoringGoals(format, team), `${id} seed ${s} built an illegal team`).toBe(true);
        // No duplicate heroes may be drafted.
        const ids = team.map((h) => h.heroId);
        expect(new Set(ids).size, `${id} seed ${s} duplicate hero`).toBe(ids.length);
        // A full five must satisfy the whole format, goals included.
        if (team.length === 5) expect(isLegalDraft(format, team), `${id} seed ${s} full-but-illegal`).toBe(true);
      }
    }
  });
});

describe('PRESSURE: counter-draft is legal-preserving and deterministic', () => {
  it('never turns a legal enemy illegal, and replays identically', () => {
    for (const { id, format } of FORMATS) {
      for (let s = 0; s < 25; s++) {
        const seed = 7000 + s;
        const player = buildLegalTeam(format, HERO_POOL, seed * 3, { level: 28 });
        const baseEnemy = buildLegalTeam(format, HERO_POOL, seed * 5 + 1, { level: 28 });
        // Precondition: only assert preservation when the base enemy is itself legal.
        if (!isLegalDraft(format, baseEnemy)) continue;

        const r1 = counterDraft(format, player, baseEnemy, HERO_POOL, seed);
        const r2 = counterDraft(format, player, baseEnemy, HERO_POOL, seed);
        expect(r2, `${id} seed ${s} non-deterministic counter-draft`).toEqual(r1);

        expect(isLegalDraft(format, r1.enemy), `${id} seed ${s} counter produced an illegal enemy`).toBe(true);
        // No duplicate heroes after the swaps.
        const ids = r1.enemy.map((h) => h.heroId);
        expect(new Set(ids).size, `${id} seed ${s} counter duplicated a hero`).toBe(ids.length);
        // last-pick / none keep the squad size; mirror-shape yields a fresh five.
        if ((format.counterDraft ?? 'none') !== 'mirror-shape') {
          expect(r1.enemy.length).toBe(baseEnemy.length);
        }
      }
    }
  });
});

describe('PRESSURE: canDraftHero agrees with validating the result', () => {
  it('a hero it permits never breaks a hard constraint when added', () => {
    const r = rng(424242);
    for (const { id, format } of FORMATS) {
      for (let s = 0; s < 30; s++) {
        const team = randomTeam(9000 + s, r.int(0, 4));
        // canDraftHero answers "can I add to THIS team" assuming the team is
        // already legal; an already-broken team is out of its contract.
        if (!legalIgnoringGoals(format, team)) continue;
        const candidate = HERO_POOL[r.int(0, HERO_POOL.length - 1)];
        if (canDraftHero(format, team, candidate, 28)) {
          const next = [...team, { heroId: candidate, level: 28 }];
          expect(legalIgnoringGoals(format, next), `${id}: canDraftHero allowed ${candidate} but result is illegal`).toBe(true);
        }
      }
    }
  });
});
