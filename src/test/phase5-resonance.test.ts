import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { Sim } from '../core/sim';
import { REG } from '../core/registry';
import { applyDamage } from '../core/combat';
import { resonanceMods } from '../core/resonance';

beforeAll(() => registerAllContent());

function duelSim(): Sim {
  const sim = new Sim({ seed: 55, bounds: { w: 2400, h: 2400 } });
  sim.resonanceEnabled = true;
  return sim;
}

describe('Phase 5 resonance reactions', () => {
  it('applies elements and fires deterministic Vaporize damage', () => {
    const sim = duelSim();
    const kunkka = sim.spawnHero(REG.hero('kunkka'), { team: 0, pos: { x: 500, y: 500 }, level: 15, ctrl: { kind: 'none' } });
    const lina = sim.spawnHero(REG.hero('lina'), { team: 0, pos: { x: 540, y: 500 }, level: 15, ctrl: { kind: 'none' } });
    const target = sim.spawnHero(REG.hero('sven'), { team: 1, pos: { x: 700, y: 500 }, level: 15, ctrl: { kind: 'none' } });

    applyDamage(sim, kunkka, target, 100, 'magical', { element: 'hydro' });
    const hpAfterHydro = target.hp;
    applyDamage(sim, lina, target, 100, 'magical', { element: 'pyro' });

    const damageWithVaporize = hpAfterHydro - target.hp;
    expect(damageWithVaporize).toBeGreaterThan(100);
    expect(sim.events.drain().some((e) => e.t === 'reaction' && e.reaction === 'vaporize')).toBe(true);
  });

  it('Freeze and Superconduct resolve through generic statuses', () => {
    const sim = duelSim();
    const cm = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 500, y: 500 }, level: 15, ctrl: { kind: 'none' } });
    const kunkka = sim.spawnHero(REG.hero('kunkka'), { team: 0, pos: { x: 540, y: 500 }, level: 15, ctrl: { kind: 'none' } });
    const zeus = sim.spawnHero(REG.hero('zeus'), { team: 0, pos: { x: 580, y: 500 }, level: 15, ctrl: { kind: 'none' } });
    const target = sim.spawnHero(REG.hero('sven'), { team: 1, pos: { x: 700, y: 500 }, level: 15, ctrl: { kind: 'none' } });

    applyDamage(sim, kunkka, target, 50, 'magical', { element: 'hydro' });
    applyDamage(sim, cm, target, 50, 'magical', { element: 'cryo' });
    expect(target.hasStatus('frozen')).toBe(true);

    target.removeStatusWhere((s) => s.status === 'frozen');
    target.elementAuras = {};
    applyDamage(sim, cm, target, 50, 'magical', { element: 'cryo' });
    applyDamage(sim, zeus, target, 50, 'magical', { element: 'electro' });
    expect(target.statuses.some((s) => s.tag === 'reaction:superconduct' && (s.mods?.armor ?? 0) < 0)).toBe(true);
  });

  it('party resonance returns shared-element buffs and Harmony fallback', () => {
    const pyro = resonanceMods(['lina', 'ember-spirit', 'juggernaut'], (id) => REG.hero(id));
    expect(pyro.id).toBe('pyro-resonance');
    expect(pyro.mods.damage).toBeGreaterThan(0);

    const harmony = resonanceMods(['juggernaut', 'pudge', 'sniper'], (id) => REG.hero(id));
    expect(harmony.id).toBe('harmony-resonance');
  });
});

describe('Phase 5 feel orders', () => {
  it('attack-move acquires enemies along the path', () => {
    const sim = new Sim({ seed: 91, bounds: { w: 2400, h: 2400 } });
    const jug = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 300, y: 500 }, level: 8, ctrl: { kind: 'player' } });
    const creep = sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: 650, y: 500 }, wild: true });

    sim.order(jug.uid, { kind: 'attack-move', point: { x: 1200, y: 500 } });
    sim.run(4);

    expect(creep.hp).toBeLessThan(creep.stats.maxHp);
  });
});
