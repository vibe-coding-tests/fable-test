import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { setupMacroSim } from '../core/macro';
import { thinkGambit } from '../core/controllers';
import type { EffectCtx } from '../core/effects';
import type { GambitRule, MacroHeroSetup } from '../core/types';

beforeAll(() => registerAllContent());

function simWithRules(rules: GambitRule[]) {
  const teamA: MacroHeroSetup[] = [{ heroId: 'sniper', level: 18, gambits: rules }];
  const teamB: MacroHeroSetup[] = [
    { heroId: 'sven', level: 18 },
    { heroId: 'crystal-maiden', level: 18 }
  ];
  const sim = setupMacroSim({ seed: 991, teamA, teamB, maxSec: 30 });
  const hero = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
  const enemies = sim.unitsArr.filter((u) => u.team === 1);
  return { sim, hero, enemies };
}

describe('gambit AI positioning and targeting', () => {
  it('focus-fire can acquire the most dangerous enemy', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'always' }], then: { k: 'focus-fire', targetMode: 'most-dangerous' } }
    ]);
    const expected = [...enemies].sort((a, b) => b.stats.damage / b.stats.attackInterval - a.stats.damage / a.stats.attackInterval)[0];

    thinkGambit(sim, hero);

    expect(hero.order).toEqual({ kind: 'attack-unit', uid: expected.uid });
    expect(hero.ctrl.focusUid).toBe(expected.uid);
  });

  it('kite moves away from a close focus target', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'always' }], then: { k: 'kite', distance: 600 } }
    ]);
    const enemy = enemies[0];
    hero.pos = { x: 1000, y: 1000 };
    enemy.pos = { x: 1120, y: 1000 };
    hero.ctrl.focusUid = enemy.uid;

    thinkGambit(sim, hero);

    expect(hero.order.kind).toBe('move');
    if (hero.order.kind === 'move') expect(hero.order.point.x).toBeLessThan(hero.pos.x);
  });

  it('dodge-zones moves out of a hostile damage zone', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'standing-in-zone' }], then: { k: 'dodge-zones' } },
      { if: [{ k: 'always' }], then: { k: 'hold' } }
    ]);
    const enemy = enemies[0];
    const ctx: EffectCtx = { defId: 'test-zone', level: 1, vfx: { archetype: 'ground-aoe', color: '#ff0000' } };
    sim.addZone({
      caster: enemy,
      ctx,
      spec: {
        shape: 'circle',
        radius: 300,
        duration: 5,
        tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 10, target: 'target' }] }
      },
      duration: 5,
      pos: { ...hero.pos },
      radius: 300
    });

    thinkGambit(sim, hero);

    expect(hero.order.kind).toBe('move');
    if (hero.order.kind === 'move') {
      const before = (hero.pos.x - enemy.pos.x) ** 2 + (hero.pos.y - enemy.pos.y) ** 2;
      const after = (hero.order.point.x - hero.pos.x) ** 2 + (hero.order.point.y - hero.pos.y) ** 2;
      expect(before).toBeGreaterThanOrEqual(0);
      expect(after).toBeGreaterThan(0);
    }
  });

  it('fight-time-gt is relative to the current encounter, not absolute sim time', () => {
    const { sim, hero, enemies } = simWithRules([
      { if: [{ k: 'fight-time-gt', sec: 5 }], then: { k: 'hold' } },
      { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
    ]);
    const enemy = enemies[0];
    hero.pos = { x: 1000, y: 1000 };
    enemy.pos = { x: 1300, y: 1000 };
    hero.ctrl.focusUid = enemy.uid;
    sim.time = 100;
    sim.rebuildSpatial();

    thinkGambit(sim, hero);
    expect(hero.order.kind).toBe('attack-unit');
    expect(hero.ctrl.encounterStartAt).toBe(100);

    sim.time = 106;
    thinkGambit(sim, hero);
    expect(hero.order.kind).toBe('hold');
  });
});
