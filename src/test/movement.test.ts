import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { resolveCollisions, steerToward } from '../core/movement';
import { dist, pointSegDist } from '../core/math2d';

beforeAll(() => registerAllContent());

describe('movement and collision', () => {
  it('steers toward an order point', () => {
    const sim = new Sim({ seed: 21, bounds: { w: 2000, h: 2000 } });
    const unit = sim.spawnHero(REG.hero('juggernaut'), {
      team: 0,
      pos: { x: 300, y: 300 },
      level: 1,
      ctrl: { kind: 'none' }
    });
    unit.facing = 0;

    const arrived = steerToward(sim, unit, { x: 500, y: 300 }, 0.25, 12);

    expect(arrived).toBe(false);
    expect(unit.pos.x).toBeGreaterThan(300);
    expect(Math.abs(unit.pos.y - 300)).toBeLessThan(1);
  });

  it('separates overlapping unit circles deterministically', () => {
    const sim = new Sim({ seed: 22, bounds: { w: 2000, h: 2000 } });
    const a = sim.spawnHero(REG.hero('juggernaut'), {
      team: 0,
      pos: { x: 500, y: 500 },
      level: 1,
      ctrl: { kind: 'none' }
    });
    const b = sim.spawnHero(REG.hero('axe'), {
      team: 1,
      pos: { x: 506, y: 500 },
      level: 1,
      ctrl: { kind: 'none' }
    });

    const before = dist(a.pos, b.pos);
    sim.rebuildSpatial();
    resolveCollisions(sim, a);

    expect(dist(a.pos, b.pos)).toBeGreaterThan(before);
  });

  it('pushes units out of temporary wall zones', () => {
    const sim = new Sim({ seed: 23, bounds: { w: 2000, h: 2000 } });
    const caster = sim.spawnHero(REG.hero('earthshaker'), {
      team: 0,
      pos: { x: 400, y: 500 },
      level: 10,
      ctrl: { kind: 'none' }
    });
    const unit = sim.spawnHero(REG.hero('pudge'), {
      team: 1,
      pos: { x: 540, y: 500 },
      level: 10,
      ctrl: { kind: 'none' }
    });
    const a = { x: 500, y: 300 };
    const b = { x: 500, y: 700 };
    sim.addZone({
      caster,
      ctx: { defId: 'test-wall', level: 1, vfx: { archetype: 'wall', color: '#aa8866' } },
      spec: { shape: 'line', width: 120, length: 400, duration: 5, wall: true },
      duration: 5,
      a,
      b,
      width: 120
    });

    resolveCollisions(sim, unit, true);

    expect(pointSegDist(unit.pos, a, b)).toBeGreaterThanOrEqual(60 + unit.radius - 0.1);
  });

  it('settles orders clicked against obstacle rims', () => {
    const sim = new Sim({
      seed: 24,
      bounds: { w: 2000, h: 2000 },
      obstacles: [{ pos: { x: 600, y: 500 }, radius: 80 }]
    });
    const unit = sim.spawnHero(REG.hero('juggernaut'), {
      team: 0,
      pos: { x: 420, y: 500 },
      level: 1,
      ctrl: { kind: 'none' }
    });
    unit.facing = 0;

    const clickedRim = { x: 704, y: 500 };
    let arrived = false;
    for (let i = 0; i < 300 && !arrived; i++) {
      arrived = steerToward(sim, unit, clickedRim, sim.dt, Math.max(12, unit.radius * 0.5));
    }

    expect(arrived).toBe(true);
    expect(dist(unit.pos, sim.obstacles[0].pos)).toBeGreaterThanOrEqual(sim.obstacles[0].radius + unit.radius - 0.1);
  });
});
