import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../../data';
import { setupMacroSim, runMacroBattle } from '../../core/macro';
import { resetUidCounter } from '../../core/unit';
import { randomTeam } from './_fuzz';
import type { MacroSetup } from '../../core/macro';

// ============================================================
// PRESSURE §2 — determinism & timestep contracts.
//
// The sim claims to be a deterministic, fixed-timestep machine whose
// only randomness is the seeded Rng. We verify that claim as a property
// over fuzzed matchups rather than one hand-picked seed:
//   * repeatability  — equal inputs (incl. uid baseline) ⇒ equal output
//   * granularity    — the result is independent of how time is sliced
//   * seed-sensitivity — the seed actually drives the outcome
//
// NOTE: the AI think cadence staggers by absolute unit uid, which is a
// process-global counter. So "equal inputs" must pin the uid baseline
// (resetUidCounter) to be a clean function-of-seed test. The dependence
// on global spawn history is documented separately in §2.4.
// ============================================================

beforeAll(() => registerAllContent());

function freshResult(setup: MacroSetup, uidBase = 1): ReturnType<typeof runMacroBattle> {
  resetUidCounter(uidBase);
  return runMacroBattle(setup);
}

describe('PRESSURE: same input, same output (repeatability)', () => {
  it('20 fuzzed matchups replay to an identical hash, winner, tick count, and event stream', () => {
    for (let trial = 0; trial < 20; trial++) {
      const seed = 30000 + trial * 101;
      const setup: MacroSetup = {
        seed,
        teamA: randomTeam(seed, 5),
        teamB: randomTeam(seed + 333, 5),
        maxSec: 40
      };
      const a = freshResult(setup);
      const aEvents = a.sim.events.history.length;
      const b = freshResult(setup);
      const bEvents = b.sim.events.history.length;

      expect(b.hash, `hash mismatch at seed ${seed}`).toBe(a.hash);
      expect(b.winner).toBe(a.winner);
      expect(b.ticks).toBe(a.ticks);
      expect(bEvents).toBe(aEvents);
    }
  }, 60000);
});

describe('PRESSURE: result is independent of timestep slicing', () => {
  it('running the whole fight at once equals running it in fine slices', () => {
    for (let trial = 0; trial < 10; trial++) {
      const seed = 41000 + trial * 57;
      const teamA = randomTeam(seed, 4);
      const teamB = randomTeam(seed + 11, 4);

      resetUidCounter(1);
      const whole = setupMacroSim({ seed, teamA, teamB, maxSec: 12 });
      whole.run(12);

      resetUidCounter(1);
      const sliced = setupMacroSim({ seed, teamA, teamB, maxSec: 12 });
      // 0.1s slices are tick-aligned (3 ticks each at 30 Hz) and must accumulate
      // to the exact same state as a single run of the same total duration.
      for (let t = 0; t < 120; t++) sliced.run(0.1);

      expect(sliced.tickCount).toBe(whole.tickCount);
      expect(sliced.hash(), `slice/whole divergence at seed ${seed}`).toBe(whole.hash());
    }
  }, 30000);
});

describe('PRESSURE: the seed actually drives the simulation', () => {
  it('distinct seeds on the same teams mostly diverge (RNG is wired through)', () => {
    const teamA = randomTeam(9090, 5);
    const teamB = randomTeam(9091, 5);
    const hashes = new Set<string>();
    for (let s = 0; s < 16; s++) {
      const r = freshResult({ seed: 1000 + s, teamA, teamB, maxSec: 30 });
      hashes.add(r.hash);
    }
    // If the seed were ignored, all 16 fights would collapse to one fingerprint.
    // We allow a couple of coincidental collisions but demand real spread.
    expect(hashes.size).toBeGreaterThan(8);
  }, 30000);
});

describe('PRESSURE §2.4 — documented: outcome depends on global uid baseline', () => {
  // This is a known fragility, not a passing-by-accident assertion: the AI think
  // cadence keys off absolute uid, a process-global counter. The SAME (seed, teams)
  // can therefore resolve differently depending on how many units were spawned
  // earlier in the process. We pin both baselines and assert they match — locking
  // in the contract we *do* honor (clean baseline ⇒ reproducible) and giving a
  // regression anchor if the stagger is ever made uid-independent.
  it('is reproducible when the uid baseline is pinned', () => {
    const setup: MacroSetup = {
      seed: 24680,
      teamA: randomTeam(24680, 5),
      teamB: randomTeam(24681, 5),
      maxSec: 30
    };
    const a = freshResult(setup, 1);
    const b = freshResult(setup, 1);
    expect(b.hash).toBe(a.hash);
  }, 20000);
});
