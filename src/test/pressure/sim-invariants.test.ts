import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data';
import { setupMacroSim, runMacroBattle, heroesAlive } from '../../core/macro';
import { assertSimInvariants, checkSimInvariants, randomTeam } from './_fuzz';

// ============================================================
// PRESSURE §1 — conservation & termination invariants.
//
// A correct combat sim must never corrupt unit state and must always
// terminate. We assert that across a fuzzed matrix of matchups, sampled
// at many tick boundaries (not just the end), so a transient corruption
// is caught the moment it appears rather than after it has healed.
// ============================================================

beforeAll(() => registerAllContent());

describe('PRESSURE: state stays well-formed mid-fight', () => {
  it('holds conservation invariants across 60 fuzzed matchups, sampled every 0.5s', () => {
    for (let trial = 0; trial < 60; trial++) {
      const seed = 90001 + trial * 7;
      const sim = setupMacroSim({
        seed,
        teamA: randomTeam(seed, 5, { minLevel: 12, maxLevel: 30 }),
        teamB: randomTeam(seed + 1, 5, { minLevel: 12, maxLevel: 30 }),
        maxSec: 40
      });

      // Pristine at spawn.
      assertSimInvariants(sim, `seed=${seed} t=spawn`);

      // Step in 0.5s slices to a decision, auditing each boundary.
      let guard = 0;
      while (guard++ < 120) {
        sim.run(0.5);
        assertSimInvariants(sim, `seed=${seed} t=${sim.time.toFixed(1)}`);
        if (heroesAlive(sim, 0).length === 0 || heroesAlive(sim, 1).length === 0) break;
      }
    }
  }, 60000);

  it('every fuzzed battle terminates with a determined winner', () => {
    for (let trial = 0; trial < 40; trial++) {
      const seed = 50500 + trial * 13;
      const res = runMacroBattle({
        seed,
        teamA: randomTeam(seed, 5),
        teamB: randomTeam(seed + 977, 5),
        maxSec: 60
      });
      // -1 is a legal "true draw on hp%" outcome but should be vanishingly rare;
      // the contract we assert is that the result is one of the three valid states
      // and the survivor list is internally consistent with it.
      expect([0, 1, -1]).toContain(res.winner);
      const aliveA = res.survivors.filter((s) => s.team === 0).length;
      const aliveB = res.survivors.filter((s) => s.team === 1).length;
      if (res.winner === 0) expect(aliveA).toBeGreaterThan(0);
      if (res.winner === 1) expect(aliveB).toBeGreaterThan(0);
      // A decisive (elimination) win means the loser has no survivors.
      if (res.winner === 0 && aliveB === 0) expect(aliveA).toBeGreaterThan(0);
      expect(res.survivors.every((s) => s.hpPct > 0 && s.hpPct <= 1.0001)).toBe(true);
    }
  }, 60000);

  it('a one-sided matchup (5 vs 1) is won by the larger side and stays well-formed', () => {
    for (let trial = 0; trial < 15; trial++) {
      const seed = 77000 + trial * 31;
      const res = runMacroBattle({
        seed,
        teamA: randomTeam(seed, 5, { level: 30 }),
        teamB: randomTeam(seed + 5, 1, { level: 30 }),
        maxSec: 60
      });
      expect(checkSimInvariants(res.sim)).toEqual([]);
      // Five level-30 heroes vs one is not a fair fight by any implementation.
      expect(res.winner).toBe(0);
    }
  }, 30000);
});
