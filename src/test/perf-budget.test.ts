import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import type { Unit } from '../core/unit';
import type { EffectNode, ProjectileSpec, VfxSpec } from '../core/types';

beforeAll(() => registerAllContent());

interface StressOpts {
  units: number;
  projectiles: number;
  resonance?: boolean;
}

const HERO_POOL = [
  'juggernaut',
  'crystal-maiden',
  'pudge',
  'earthshaker',
  'sniper',
  'lich',
  'luna',
  'sven',
  'axe',
  'jakiro',
  'omniknight',
  'windranger'
];

const STRESS_VFX: VfxSpec = { archetype: 'projectile', color: '#88ccff', scale: 0.45 };

function spawnStressUnit(sim: Sim, i: number, total: number): Unit {
  const team = i % 2;
  const sideIdx = Math.floor(i / 2);
  const sideCount = Math.ceil(total / 2);
  const t = sideCount <= 1 ? 0 : sideIdx / (sideCount - 1);
  const y = 1400 + t * 3400;
  const x = team === 0 ? 2300 + (sideIdx % 4) * 80 : 5700 - (sideIdx % 4) * 80;
  return sim.spawnHero(REG.hero(HERO_POOL[i % HERO_POOL.length]), {
    team,
    pos: { x, y },
    level: 18,
    ctrl: { kind: 'creep', homePos: { x, y } }
  });
}

function addStressZones(sim: Sim, casters: Unit[]): void {
  const slowAndDamage: EffectNode[] = [
    { kind: 'damage', dtype: 'magical', amount: 12, target: 'target' },
    { kind: 'status', status: 'slow', duration: 0.75, target: 'target', params: { moveSlowPct: 10 } }
  ];
  for (let i = 0; i < Math.min(8, casters.length); i++) {
    const caster = casters[i];
    const enemySide = caster.team === 0 ? 1 : -1;
    sim.addZone({
      caster,
      ctx: { defId: `perf-zone:${i}`, level: 1, vfx: { archetype: 'ground-aoe', color: '#66ddaa', scale: 1 } },
      spec: {
        shape: 'circle',
        radius: 480,
        duration: 10,
        tick: { interval: 0.5, effects: slowAndDamage, affects: 'enemies' },
        auraMods: { affects: 'allies', mods: { armor: 1 } }
      },
      duration: 10,
      pos: { x: caster.pos.x + enemySide * 450, y: caster.pos.y },
      radius: 480
    });
  }
}

function addStressProjectiles(sim: Sim, casters: Unit[], count: number): void {
  const onHit: EffectNode[] = [
    { kind: 'damage', dtype: 'magical', amount: 8, target: 'target' },
    { kind: 'status', status: 'slow', duration: 0.35, target: 'target', params: { moveSlowPct: 8 } }
  ];
  const spec: ProjectileSpec = {
    model: 'linear',
    speed: 1600,
    width: 46,
    range: 4400,
    onHit,
    disjointable: false
  };
  for (let i = 0; i < count; i++) {
    const caster = casters[i % casters.length];
    const dir = caster.team === 0 ? 1 : -1;
    const offset = ((i * 37) % 900) - 450;
    sim.spawnProjectile(
      caster,
      { defId: `perf-projectile:${i}`, level: 1, vfx: STRESS_VFX },
      spec,
      { toPoint: { x: caster.pos.x + dir * 3800, y: caster.pos.y + offset } }
    );
  }
}

function buildStressSim(opts: StressOpts): Sim {
  const sim = new Sim({ seed: 9090, bounds: { w: 8000, h: 8000 } });
  sim.events.captureAll = true;
  sim.resonanceEnabled = !!opts.resonance;
  const units: Unit[] = [];
  for (let i = 0; i < opts.units; i++) units.push(spawnStressUnit(sim, i, opts.units));
  addStressZones(sim, units);
  addStressProjectiles(sim, units, opts.projectiles);
  return sim;
}

function runMeasured(sim: Sim, seconds: number): { elapsedMs: number; ticks: number; hash: string } {
  const ticks = Math.round(seconds / sim.dt);
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) sim.tick();
  const elapsedMs = performance.now() - t0;
  return { elapsedMs, ticks, hash: sim.hash() };
}

describe('simulation performance budget', () => {
  it('simulates the target 30-unit / 200-projectile stress case with headroom', () => {
    const result = runMeasured(buildStressSim({ units: 30, projectiles: 200 }), 1);

    // This is intentionally generous for CI. It guards against crawling while
    // leaving precise baseline tracking to manual bench runs.
    expect(result.elapsedMs).toBeLessThan(750);
    expect(result.ticks).toBe(30);
  });

  it('keeps a 60-unit stress case comfortably bounded', () => {
    const result = runMeasured(buildStressSim({ units: 60, projectiles: 120 }), 1);

    // Wall-clock ratios are noisy when Vitest runs test files concurrently.
    // The absolute ceiling still catches the old quadratic crawl while staying
    // stable on loaded developer machines and CI workers.
    expect(result.elapsedMs).toBeLessThan(650);
    expect(result.ticks).toBe(30);
  });
});

describe('large mixed simulation determinism', () => {
  it('keeps the same hash across at-scale runs', () => {
    const a = runMeasured(buildStressSim({ units: 42, projectiles: 180 }), 5);
    const b = runMeasured(buildStressSim({ units: 42, projectiles: 180 }), 5);

    expect(b.hash).toBe(a.hash);
  });

  it('keeps the same hash across at-scale resonance runs', () => {
    const a = runMeasured(buildStressSim({ units: 42, projectiles: 180, resonance: true }), 5);
    const b = runMeasured(buildStressSim({ units: 42, projectiles: 180, resonance: true }), 5);

    expect(b.hash).toBe(a.hash);
  });
});
