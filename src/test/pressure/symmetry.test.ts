import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data';
import { runMacroBattle } from '../../core/macro';
import { resetUidCounter } from '../../core/unit';
import { randomTeam } from './_fuzz';
import type { MacroHeroSetup } from '../../core/types';

// ============================================================
// PRESSURE §3 — symmetry & fairness (metamorphic).
//
// The arena spawns team 0 on the left and team 1 on the right; the rules
// are side-agnostic. So which physical side a team stands on must not, by
// itself, decide fights. We can't assert that for a single match (RNG and
// tie-breaks make any one seed lopsided), but it must hold in aggregate.
// These tests would catch a "team 0 always acts first / always wins" class
// of bug that example-based tests, which only ever check team 0, miss.
// ============================================================

beforeAll(() => registerAllContent());

function battle(seed: number, teamA: MacroHeroSetup[], teamB: MacroHeroSetup[]): 0 | 1 | -1 {
  resetUidCounter(1);
  return runMacroBattle({ seed, teamA, teamB, maxSec: 45 }).winner;
}

describe('PRESSURE: no global side bias across random matchups', () => {
  it('team 0 and team 1 win comparably when teams are randomized independently', () => {
    let team0 = 0;
    let team1 = 0;
    let draws = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const seed = 60600 + i * 17;
      const w = battle(seed, randomTeam(seed, 5), randomTeam(seed + 7919, 5));
      if (w === 0) team0++;
      else if (w === 1) team1++;
      else draws++;
    }
    const decisive = team0 + team1;
    // With independently-random teams, the physical side should be a coin flip.
    // A real side bias (e.g. lower-uid team always resolves first) shows up as a
    // gross skew well outside binomial noise; the band is deliberately wide.
    const team0Rate = team0 / decisive;
    expect(team0Rate, `team0 won ${team0}/${decisive} (draws=${draws})`).toBeGreaterThan(0.3);
    expect(team0Rate, `team0 won ${team0}/${decisive} (draws=${draws})`).toBeLessThan(0.7);
  }, 90000);
});

describe('PRESSURE: mirror matches are not decided by side', () => {
  it('an identical-composition mirror is won by both sides across seeds', () => {
    // Same five heroes, same levels, on both teams: the only differences are the
    // physical side and the shared RNG. Neither side may sweep.
    const comp = (off: number): MacroHeroSetup[] =>
      ['sven', 'lich', 'sniper', 'axe', 'crystal-maiden'].map((heroId) => ({ heroId, level: 25 + off * 0 }));
    let team0 = 0;
    let team1 = 0;
    const N = 30;
    for (let i = 0; i < N; i++) {
      const seed = 12120 + i * 29;
      const w = battle(seed, comp(0), comp(0));
      if (w === 0) team0++;
      else if (w === 1) team1++;
    }
    // A perfectly fair engine splits ~half/half; we only insist neither side is
    // shut out badly, which catches a structural left-side-wins bug.
    expect(Math.min(team0, team1), `mirror split ${team0}:${team1}`).toBeGreaterThanOrEqual(Math.floor(N * 0.25));
  }, 60000);
});
