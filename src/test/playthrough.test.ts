import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { ALL_GYMS } from '../data/gyms/index';
import { ALL_RAIDS } from '../data/raids';
import { ELITE_DRAFT } from '../data/drafts';
import { Game, newGameSave } from '../systems/game';
import type { GambitRule, GameSave, ItemSave, MacroHeroSetup } from '../core/types';

beforeAll(() => registerAllContent());

// ----------------------------------------------------------------
// Ship gate (Phase 6 §7 / G3): the headless form of the §8 demo. A
// strong, fully-recruited squad runs the connected critical path —
// new game → all 8 badges → all four raids → Elite Five → Champion —
// proving every stage is reachable and resolvable with no structural
// blocker, then proving the whole run survives a v4 save round-trip.
//
// Per-stage *winnability* and mechanics are proven elsewhere (tests 6,
// 13–18); this asserts the path threads end to end.
// ----------------------------------------------------------------

const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 3 }, { k: 'fight-time-gt', sec: 2 }], then: { k: 'cast', slot: 3, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'ability-ready', slot: 1 }, { k: 'enemies-within', radius: 700, count: 1 }], then: { k: 'cast', slot: 1, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 2 }], then: { k: 'cast', slot: 2, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

// A maxed, well-geared five — strong enough to clear the gauntlet across
// the varied seeds each stage uses. Item ids are all referenced by other
// suites, so they're known to resolve in the registry.
const SQUAD: { heroId: string; items: string[] }[] = [
  { heroId: 'juggernaut', items: ['black-king-bar', 'battlefury', 'crystalys', 'butterfly', 'heart-of-tarrasque'] },
  { heroId: 'sven', items: ['black-king-bar', 'crystalys', 'hyperstone', 'platemail', 'heart-of-tarrasque'] },
  { heroId: 'sniper', items: ['dragon-lance', 'maelstrom', 'crystalys', 'butterfly', 'black-king-bar'] },
  { heroId: 'lich', items: ['kaya', 'glimmer-cape', 'force-staff', 'platemail', 'mekansm'] },
  { heroId: 'earthshaker', items: ['blink-dagger', 'black-king-bar', 'platemail', 'heart-of-tarrasque', 'crystalys'] }
];

function padItems(ids: string[]): (ItemSave | null)[] {
  const slots: (ItemSave | null)[] = ids.map((id) => ({ id }));
  while (slots.length < 6) slots.push(null);
  return slots.slice(0, 6);
}

/** A new-game save with the starter swapped for a maxed, fully-recruited five. */
function shipGateSave(): GameSave {
  const save = newGameSave('juggernaut');
  const template = save.roster[0];
  save.roster = SQUAD.map((s) => ({
    ...structuredClone(template),
    heroId: s.heroId,
    level: 30,
    xp: 0,
    gambits: AGGRO,
    items: padItems(s.items)
  }));
  save.party = SQUAD.map((s) => s.heroId);
  save.recruited = SQUAD.map((s) => s.heroId);
  save.gold = 99999;
  return save;
}

const STRONG_TEAM: MacroHeroSetup[] = SQUAD.map((s) => ({ heroId: s.heroId, level: 30, items: s.items, gambits: AGGRO }));

/** Retry a winnable stage across a few seeds (a player "tries again"); fail loudly if it never clears. */
function clearWithin(label: string, tries: number, attempt: () => boolean): void {
  for (let i = 0; i < tries; i++) {
    if (attempt()) return;
  }
  throw new Error(`${label} did not clear within ${tries} attempts — possible blocker`);
}

describe('ship gate: full playthrough (G3)', () => {
  it('new game → 8 badges → 4 raids → Elite Five → Champion, then survives a v4 round-trip', () => {
    const game = Game.headless(shipGateSave());

    // --- all 8 gym badges (real headless best-of-3 auto-resolve) ---
    for (const gym of ALL_GYMS) {
      clearWithin(`gym ${gym.id}`, 8, () => {
        const won = game.challengeGym(gym.id);
        if (!won) game.playtime += 1; // vary the fight seed and try again
        return won;
      });
    }
    expect(game.badges.size, 'all 8 badges earned').toBe(8);
    // a full badge run lifts the recruit ceiling to its cap (§3.4)
    expect(game.recruitLevelCap()).toBe(30);

    // --- all four raids cleared ---
    for (const raid of ALL_RAIDS) {
      clearWithin(`raid ${raid.id}`, 8, () => {
        const r = game.runRaid(raid.id);
        if (!r.won) game.playtime += 1;
        return r.won;
      });
    }
    const raidsCleared = Object.values(game.raidProgress).filter((p) => (p?.clears ?? 0) > 0).length;
    expect(raidsCleared, 'all four raids cleared').toBe(ALL_RAIDS.length);

    // --- Elite Five gauntlet, in order ---
    for (let i = 0; i < ELITE_DRAFT.members.length; i++) {
      const before = game.eliteFive.defeated;
      clearWithin(`elite member ${i}`, 8, () => {
        const r = game.runEliteMatch({ playerTeam: STRONG_TEAM, seed: 1000 + i * 17 + game.eliteFive.defeated });
        return r.won && game.eliteFive.defeated === before + 1; // a loss leaves it untouched (§3.10)
      });
    }
    expect(game.eliteFive.defeated, 'all five Elite cleared').toBe(ELITE_DRAFT.members.length);

    // --- the Champion (gated behind the five) ---
    clearWithin('champion', 8, () => {
      const r = game.runChampion({ playerTeam: STRONG_TEAM, seed: 5000 + (game.eliteFive.championDown ? 0 : 1) });
      return r.won;
    });
    expect(game.eliteFive.championDown, 'Champion defeated').toBe(true);

    // codex/journal recorded the run as we went (encounter-gated unlocks)
    const codex = game.codexEntries();
    expect(codex.raids.length, 'raids appear in the codex after clearing').toBeGreaterThanOrEqual(ALL_RAIDS.length);
    expect(game.journalSections().raids.length).toBeGreaterThanOrEqual(ALL_RAIDS.length);

    // --- the whole completed run survives a v4 save round-trip ---
    const save = game.buildSave();
    expect(save.version).toBe(4);
    const reloaded = Game.headless(save);
    expect(reloaded.badges.size).toBe(8);
    expect(reloaded.eliteFive.defeated).toBe(ELITE_DRAFT.members.length);
    expect(reloaded.eliteFive.championDown).toBe(true);
    expect(Object.values(reloaded.raidProgress).filter((p) => (p?.clears ?? 0) > 0).length).toBe(ALL_RAIDS.length);
  }, 90000);
});
