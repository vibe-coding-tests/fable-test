import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { runMacroBattle, setupMacroSim, type MacroSetup } from '../core/macro';
import { counterFormation, slotToWorld, type BoardSlot, type Formation } from '../core/board';
import { REG } from '../core/registry';
import { TUNING } from '../data/tuning';

// ============================================================
// AUTOBATTLER_OVERHAUL §3 (Phase 2): the board seam. A pure cell->world
// map plus an optional Formation branch in setupMacroSim that feeds spawn
// + homePos, falling back byte-identically to formationDepth with none.
// ============================================================

beforeAll(() => registerAllContent());

const TEAM_A = [
  { heroId: 'juggernaut', level: 12 },
  { heroId: 'crystal-maiden', level: 12 },
  { heroId: 'pudge', level: 12 },
  { heroId: 'earthshaker', level: 12 },
  { heroId: 'sniper', level: 12 }
];
const TEAM_B = [
  { heroId: 'lich', level: 12 },
  { heroId: 'sven', level: 12 },
  { heroId: 'axe', level: 12 },
  { heroId: 'luna', level: 12 },
  { heroId: 'lion', level: 12 }
];

describe('slotToWorld is a pure deterministic map', () => {
  it('returns identical points for identical cells', () => {
    const slot: BoardSlot = { col: 2, row: 1 };
    expect(slotToWorld(0, slot)).toEqual(slotToWorld(0, slot));
  });

  it('places front toward center and back toward the team edge, mirrored per side', () => {
    const back = slotToWorld(0, { col: 0, row: 2 }).pos;
    const mid = slotToWorld(0, { col: 1, row: 2 }).pos;
    const front = slotToWorld(0, { col: 2, row: 2 }).pos;
    // team 0 advances with +x: front is closest to the center line.
    expect(back.x).toBeLessThan(mid.x);
    expect(mid.x).toBeLessThan(front.x);
    expect(mid.x).toBe(TUNING.macroTeamXInset);

    // team 1 is mirrored across the arena's vertical center.
    const front1 = slotToWorld(1, { col: 2, row: 2 }).pos;
    expect(front1.x).toBe(TUNING.arenaWidth - front.x);
    expect(slotToWorld(0, { col: 0, row: 2 }).facing).toBe(0);
    expect(slotToWorld(1, { col: 0, row: 2 }).facing).toBe(Math.PI);

    // mid row sits on the arena's horizontal center; rows spread vertically.
    expect(mid.y).toBe(TUNING.arenaHeight / 2);
    expect(slotToWorld(0, { col: 1, row: 0 }).pos.y).toBeLessThan(mid.y);
    expect(slotToWorld(0, { col: 1, row: 4 }).pos.y).toBeGreaterThan(mid.y);
  });
});

describe('setupMacroSim consumes a supplied Formation', () => {
  it('spawns each placed hero on its cell, with a cell-derived anchor and facing', () => {
    const placements: Record<string, BoardSlot> = {
      juggernaut: { col: 2, row: 0 },
      'crystal-maiden': { col: 0, row: 1 },
      pudge: { col: 2, row: 2 },
      earthshaker: { col: 1, row: 3 },
      sniper: { col: 0, row: 4 }
    };
    const formation: Formation = { placements };
    const sim = setupMacroSim({ seed: 7, teamA: TEAM_A, teamB: TEAM_B, formationA: formation, maxSec: 1 });

    for (const [heroId, slot] of Object.entries(placements)) {
      const u = sim.unitsArr.find((x) => x.team === 0 && x.heroId === heroId)!;
      const w = slotToWorld(0, slot);
      expect(u.pos).toEqual(w.pos);                 // spawned on the cell
      expect(u.ctrl.homePos).toEqual(w.pos);        // anchored to the cell (it holds here)
      expect(u.facing).toBe(w.facing);
    }
  });

  it('falls back to formationDepth for heroes with no cell', () => {
    // Only place one hero; the rest must spawn exactly as an unplaced team would.
    const placed = setupMacroSim({
      seed: 7, teamA: TEAM_A, teamB: TEAM_B, maxSec: 1,
      formationA: { placements: { juggernaut: { col: 2, row: 0 } } }
    });
    const bare = setupMacroSim({ seed: 7, teamA: TEAM_A, teamB: TEAM_B, maxSec: 1 });

    for (const h of TEAM_A) {
      if (h.heroId === 'juggernaut') continue;
      const a = placed.unitsArr.find((x) => x.team === 0 && x.heroId === h.heroId)!;
      const b = bare.unitsArr.find((x) => x.team === 0 && x.heroId === h.heroId)!;
      expect(a.pos).toEqual(b.pos);
      expect(a.ctrl.homePos).toEqual(b.ctrl.homePos);
    }
  });
});

describe('counterFormation reacts to the authored opponent board', () => {
  it('places a diver onto an exposed back-row threat', () => {
    const enemyDefs = ['earthshaker', 'axe', 'lina', 'lich', 'sniper'].map((id) => REG.hero(id));
    const opponent: Formation = {
      placements: {
        sniper: { col: 0, row: 4 },
        lich: { col: 1, row: 2 },
        sven: { col: 2, row: 2 },
        juggernaut: { col: 2, row: 1 },
        'crystal-maiden': { col: 0, row: 0 }
      }
    };
    const counter = counterFormation(enemyDefs, opponent);

    expect(counter.placements.earthshaker.col).toBe(2);
    expect([0, 4]).toContain(counter.placements.earthshaker.row);
    expect(new Set(Object.values(counter.placements).map((s) => `${s.col}:${s.row}`)).size).toBe(5);
  });
});

describe('an unplaced team is byte-identical to today', () => {
  const SETUP: MacroSetup = { seed: 1337, teamA: TEAM_A, teamB: TEAM_B, maxSec: 120 };

  it('no Formation reproduces the exact same fight hash', () => {
    const baseline = runMacroBattle(SETUP);
    const explicitUndefined = runMacroBattle({ ...SETUP, formationA: undefined, formationB: undefined });
    expect(explicitUndefined.hash).toBe(baseline.hash);
    expect(explicitUndefined.ticks).toBe(baseline.ticks);
  });

  it('a supplied Formation actually changes the spawn (and the fight)', () => {
    const baseline = runMacroBattle(SETUP);
    const placed = runMacroBattle({
      ...SETUP,
      formationA: {
        placements: {
          juggernaut: { col: 2, row: 0 },
          'crystal-maiden': { col: 0, row: 4 },
          pudge: { col: 2, row: 2 },
          earthshaker: { col: 1, row: 1 },
          sniper: { col: 0, row: 3 }
        }
      }
    });
    expect(placed.hash).not.toBe(baseline.hash);
    expect(placed.winner).not.toBe(-1); // still resolves decisively
  });
});
