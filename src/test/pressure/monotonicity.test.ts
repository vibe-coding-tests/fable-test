import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data';
import { runMacroBattle } from '../../core/macro';
import { resetUidCounter } from '../../core/unit';
import { randomTeam, SAFE_ITEMS } from './_fuzz';
import type { MacroHeroSetup } from '../../core/types';

// ============================================================
// PRESSURE §4 — metamorphic ordering ("advantage helps").
//
// These assert relations between fights rather than absolute outcomes, so
// they never bake in a tuning constant. The contract: a strictly stronger
// version of a team (more levels, more items, more bodies) must not win
// LESS often against the same opponents. Individual fights can buck this
// (AI retargeting, overkill), so we assert it in aggregate over a seed
// sweep — the direction of the inequality is the spec.
// ============================================================

beforeAll(() => registerAllContent());

function winnerOf(seed: number, teamA: MacroHeroSetup[], teamB: MacroHeroSetup[]): 0 | 1 | -1 {
  resetUidCounter(1);
  return runMacroBattle({ seed, teamA, teamB, maxSec: 50 }).winner;
}

function setLevel(team: MacroHeroSetup[], level: number): MacroHeroSetup[] {
  return team.map((h) => ({ ...h, level }));
}

describe('PRESSURE: more level never lowers win rate', () => {
  it('a level-30 team A beats a fixed opponent at least as often as a level-16 team A', () => {
    let strongWins = 0;
    let weakWins = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const seed = 70700 + i * 13;
      const compA = randomTeam(seed, 5);
      const compB = setLevel(randomTeam(seed + 4242, 5), 22);
      if (winnerOf(seed, setLevel(compA, 30), compB) === 0) strongWins++;
      if (winnerOf(seed, setLevel(compA, 16), compB) === 0) weakWins++;
    }
    // Monotonicity: the higher-level build must win no fewer fights, and the
    // level gap should buy at least some real wins it didn't have before.
    expect(strongWins, `strong=${strongWins} weak=${weakWins}`).toBeGreaterThanOrEqual(weakWins);
    expect(strongWins, `strong=${strongWins} weak=${weakWins}`).toBeGreaterThan(weakWins);
  }, 120000);
});

describe('PRESSURE: more items never lowers win rate', () => {
  it('team A with a full combat loadout wins at least as often as the same team naked', () => {
    let armedWins = 0;
    let nakedWins = 0;
    const N = 36;
    for (let i = 0; i < N; i++) {
      const seed = 81800 + i * 19;
      const base = setLevel(randomTeam(seed, 5), 25);
      const armed = base.map((h) => ({ ...h, items: [...SAFE_ITEMS] }));
      const compB = setLevel(randomTeam(seed + 5150, 5), 25);
      if (winnerOf(seed, armed, compB) === 0) armedWins++;
      if (winnerOf(seed, base, compB) === 0) nakedWins++;
    }
    expect(armedWins, `armed=${armedWins} naked=${nakedWins}`).toBeGreaterThanOrEqual(nakedWins);
    expect(armedWins, `armed=${armedWins} naked=${nakedWins}`).toBeGreaterThan(nakedWins);
  }, 120000);
});

describe('PRESSURE: numbers advantage decides the aggregate', () => {
  it('a 5-body team beats a 3-body team of the same level most of the time', () => {
    let bigWins = 0;
    const N = 24;
    for (let i = 0; i < N; i++) {
      const seed = 90900 + i * 23;
      const five = setLevel(randomTeam(seed, 5), 24);
      const three = setLevel(randomTeam(seed + 6161, 3), 24);
      if (winnerOf(seed, five, three) === 0) bigWins++;
    }
    // Two extra equal-level bodies is a commanding edge; the larger side should
    // dominate. Not "always" (a stacked 3 can high-roll), but a clear majority.
    expect(bigWins, `5-body won ${bigWins}/${N}`).toBeGreaterThan(N * 0.7);
  }, 90000);
});
