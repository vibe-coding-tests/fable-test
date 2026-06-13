import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { makeItemState } from '../core/items';

beforeAll(() => registerAllContent());

describe('unit stat cache', () => {
  it('recomputes when direct item mutations change passive stats', () => {
    const sim = new Sim({ seed: 11, bounds: { w: 2000, h: 2000 } });
    const hero = sim.spawnHero(REG.hero('juggernaut'), {
      team: 0,
      pos: { x: 500, y: 500 },
      level: 10,
      ctrl: { kind: 'none' }
    });
    const before = hero.stats.damage;

    hero.items[0] = makeItemState(REG.item('crystalys'));
    hero.refresh(sim.time);

    expect(hero.stats.damage).toBeGreaterThan(before);
  });

  it('refreshes time-sensitive invis fade without status churn', () => {
    const sim = new Sim({ seed: 12, bounds: { w: 2000, h: 2000 } });
    const hero = sim.spawnHero(REG.hero('crystal-maiden'), {
      team: 0,
      pos: { x: 500, y: 500 },
      level: 10,
      ctrl: { kind: 'none' }
    });

    hero.addStatus({
      status: 'invis',
      tag: 'test-invis',
      sourceUid: hero.uid,
      sourceTeam: hero.team,
      until: sim.time + 5,
      isDebuff: false,
      fadeAt: sim.time + 0.5
    });
    hero.refresh(sim.time);
    expect(hero.summary.fading).toBe(true);
    expect(hero.summary.invisible).toBe(false);

    hero.refresh(sim.time + 0.6);
    expect(hero.summary.fading).toBe(false);
    expect(hero.summary.invisible).toBe(true);
  });
});
