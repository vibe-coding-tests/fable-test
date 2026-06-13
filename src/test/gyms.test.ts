import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { ALL_GYMS } from '../data/gyms';
import { LiveGymFight, runGymMatch, type GymMatchHero } from '../systems/macro-session';
import { TUNING } from '../data/tuning';
import { heroesAlive } from '../core/macro';
import type { GambitRule } from '../core/types';

beforeAll(() => registerAllContent());

// A sane, aggressive player-authored gambit: open with the ult into the
// cluster, chain the basic kit on the focus, then right-click.
const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 3 }, { k: 'fight-time-gt', sec: 2 }], then: { k: 'cast', slot: 3, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'ability-ready', slot: 1 }, { k: 'enemies-within', radius: 700, count: 1 }], then: { k: 'cast', slot: 1, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 2 }], then: { k: 'cast', slot: 2, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

// A strong, level-capped roster with sane item loadouts. The player is meant to
// win each gym with good play, not be handed a trivial fight.
const PLAYER_TEAM: GymMatchHero[] = [
  { heroId: 'juggernaut', level: 30, items: ['black-king-bar', 'battlefury', 'crystalys'], gambits: AGGRO },
  { heroId: 'sven', level: 30, items: ['black-king-bar', 'crystalys', 'hyperstone'], gambits: AGGRO },
  { heroId: 'sniper', level: 30, items: ['dragon-lance', 'maelstrom', 'crystalys'], gambits: AGGRO },
  { heroId: 'lich', level: 30, items: ['kaya', 'glimmer-cape', 'force-staff'], gambits: AGGRO },
  { heroId: 'earthshaker', level: 30, items: ['blink-dagger', 'black-king-bar', 'platemail'], gambits: AGGRO }
];

const SEED = 4242;

describe('Phase 6 gym-winnable (test 6)', () => {
  it('beats each of the 8 gyms best-of-3 with player-authored gambits, deterministically', () => {
    for (const gym of ALL_GYMS) {
      const a = runGymMatch(gym, PLAYER_TEAM, SEED);
      const b = runGymMatch(gym, PLAYER_TEAM, SEED);
      expect(a.winner, `${gym.id} should be winnable`).toBe(0);
      expect(a.playerWins).toBeGreaterThanOrEqual(2);
      expect(b.rounds[0].result.hash).toBe(a.rounds[0].result.hash); // deterministic
      expect(a.rounds.length).toBeGreaterThanOrEqual(2);
      expect(a.rounds.length).toBeLessThanOrEqual(3);
    }
  }, 30000); // 8 gyms × 2 runs × best-of-3 = up to 48 full macro sims; well past the 5s default

  it('grants the enemy its enemyBonusCaptainCalls in the live fight', () => {
    for (const gym of ALL_GYMS) {
      const fight = new LiveGymFight(gym, PLAYER_TEAM, SEED, { autoPlayer: true });
      const expected = TUNING.captainCallsPerFight + (gym.enemyBonusCaptainCalls ?? 0);
      expect(fight.enemyCaptain.remaining + fight.enemyCaptain.used).toBe(expected);
      expect(fight.enemyCaptain.team).toBe(1);
      // the enemy should actually spend at least one call over a full match
      fight.runHeadless();
    }
  }, 20000); // 8 full headless matches
});

// A durable, even matchup so a round lasts well past the call window and the
// attach -> revert transition can be observed inside a single round.
const EVEN_TEAM: GymMatchHero[] = [
  { heroId: 'pudge', level: 14, items: ['platemail', 'vladmirs-offering'], gambits: AGGRO },
  { heroId: 'axe', level: 14, items: ['platemail', 'blink-dagger'], gambits: AGGRO },
  { heroId: 'sven', level: 14, items: ['mekansm'], gambits: AGGRO },
  { heroId: 'lich', level: 14, items: ['glimmer-cape'], gambits: AGGRO },
  { heroId: 'crystal-maiden', level: 14, items: ['glimmer-cape'], gambits: AGGRO }
];

describe('Phase 6 captain-call-live (test 7)', () => {
  it('a player Captain Call attaches to a live gym hero, reverts after the window, and decrements', () => {
    const gym = REG.gym('lunar-gym');
    const fight = new LiveGymFight(gym, EVEN_TEAM, SEED, { autoPlayer: false });

    // warm up a couple seconds so a fight is underway
    fight.step(2);
    expect(fight.done).toBe(false);

    const before = fight.playerCaptain.remaining;
    const startRound = fight.round;
    expect(before).toBe(TUNING.captainCallsPerFight);

    const ok = fight.playerCaptainCall();
    expect(ok).toBe(true);
    const calledUid = fight.playerCaptain.activeUid;
    expect(calledUid).not.toBeNull();
    expect(fight.playerCaptain.remaining).toBe(before - 1);
    expect(fight.sim.unit(calledUid!)!.ctrl.kind).toBe('player');
    expect(fight.sim.unit(calledUid!)!.team).toBe(0);

    // step the window in small slices, staying inside this round; control reverts
    let reverted = false;
    for (let t = 0; t < TUNING.captainCallSec + 3 && fight.round === startRound && !fight.done; t += 0.25) {
      fight.step(0.25);
      if (fight.playerCaptain.activeUid === null) {
        reverted = true;
        break;
      }
    }
    expect(reverted, 'the call window should expire inside one round').toBe(true);
    expect(fight.playerCaptain.remaining).toBe(before - 1);
    const called = fight.sim.unit(calledUid!);
    if (fight.round === startRound && called && called.alive) expect(called.ctrl.kind).toBe('gambit');
  });

  it('the live fight is genuinely stepped (the enemy spends bonus calls too)', () => {
    const gym = REG.gym('frost-gym'); // enemyBonusCaptainCalls: 2
    const fight = new LiveGymFight(gym, PLAYER_TEAM, SEED, { autoPlayer: false });
    let guard = 0;
    while (!fight.done && guard++ < 4000) {
      fight.step(0.5);
      if (fight.playerCaptain.remaining > 0 && fight.playerCaptain.activeUid === null && heroesAlive(fight.sim, 0).length > 0) {
        fight.playerCaptainCall();
      }
    }
    expect(fight.done).toBe(true);
    expect(fight.result).not.toBeNull();
    expect(fight.enemyCaptain.used).toBeGreaterThan(0);
  });
});
