import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { bossFightSetupFromDef, creepCombatTier } from '../core/phase3';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { makeItemState } from '../core/items';
import { runRaidBattle } from '../core/macro';
import { abilityVal } from '../core/values';

function attackOnlyCreepTtk(opts: {
  heroId: string;
  level: number;
  items?: string[];
  creepId: string;
  regionId?: string;
  combatTier?: 'normal' | 'nightmare' | 'hell';
  maxSec?: number;
}): number {
  const sim = new Sim({ seed: 2026, bounds: { w: 3000, h: 3000 } });
  const hero = sim.spawnHero(REG.hero(opts.heroId), { team: 0, pos: { x: 1000, y: 1000 }, level: opts.level, ctrl: { kind: 'none' } });
  (opts.items ?? []).forEach((id, i) => {
    hero.items[i] = makeItemState(REG.item(id));
  });
  hero.markStatsDirty();
  hero.refresh(sim.time);
  hero.hp = hero.stats.maxHp;
  hero.mana = hero.stats.maxMana;

  const creep = sim.spawnCreep(REG.creep(opts.creepId), {
    team: 1,
    pos: { x: 1120, y: 1000 },
    wild: true,
    regionId: opts.regionId,
    combatTier: opts.combatTier
  });
  creep.ctrl = { kind: 'none' };
  hero.order = { kind: 'attack-unit', uid: creep.uid };

  const maxSec = opts.maxSec ?? 60;
  const ticks = Math.ceil(maxSec / TUNING.dt);
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    if (!creep.alive) return sim.time;
  }
  return maxSec;
}

beforeAll(() => registerAllContent());

describe('Gameplay 2.0 combat scaling', () => {
  it('maps region depth to overworld creep combat tier', () => {
    expect(creepCombatTier('tranquil-vale')).toBe('normal');
    expect(creepCombatTier('shadeshore')).toBe('nightmare');
    expect(creepCombatTier('mad-moon-crater')).toBe('hell');
  });

  it('scales wild creep durability and damage by region and tier', () => {
    const def = REG.creep('hellbear');
    const baseSim = new Sim({ seed: 1, bounds: { w: 3000, h: 3000 } });
    const lateSim = new Sim({ seed: 1, bounds: { w: 3000, h: 3000 } });

    const base = baseSim.spawnCreep(def, { team: 1, pos: { x: 500, y: 500 }, wild: true });
    const late = lateSim.spawnCreep(def, {
      team: 1,
      pos: { x: 500, y: 500 },
      wild: true,
      regionId: 'mad-moon-crater',
      combatTier: 'hell'
    });

    expect(late.stats.maxHp).toBeGreaterThan(base.stats.maxHp * 8);
    expect(late.stats.damage).toBeGreaterThan(base.stats.damage * 4);
    expect(late.stats.maxHp).toBeCloseTo(base.stats.maxHp * TUNING.creepCombatScale.hpByRegion['mad-moon-crater'] * TUNING.creepCombatScale.tier.hell, 0);
  });

  it('scales offensive creep ability values by region and tier without changing geometry', () => {
    const def = REG.creep('hellbear');
    const baseSim = new Sim({ seed: 2, bounds: { w: 3000, h: 3000 } });
    const lateSim = new Sim({ seed: 2, bounds: { w: 3000, h: 3000 } });
    const base = baseSim.spawnCreep(def, { team: 1, pos: { x: 500, y: 500 }, wild: true });
    const late = lateSim.spawnCreep(def, {
      team: 1,
      pos: { x: 500, y: 500 },
      wild: true,
      regionId: 'mad-moon-crater',
      combatTier: 'hell'
    });
    const baseAbility = base.abilities[0];
    const lateAbility = late.abilities[0];
    const expected = TUNING.creepCombatScale.damageByRegion['mad-moon-crater'] * TUNING.creepCombatScale.tier.hell;

    expect(abilityVal(lateAbility.def, 'damage', lateAbility.level)).toBeCloseTo(abilityVal(baseAbility.def, 'damage', baseAbility.level) * expected, 4);
    expect(abilityVal(lateAbility.def, 'radius', lateAbility.level)).toBe(abilityVal(baseAbility.def, 'radius', baseAbility.level));
  });

  it('keeps representative attack-only creep TTK in broad farming bands', () => {
    const trash = attackOnlyCreepTtk({ heroId: 'juggernaut', level: 10, creepId: 'kobold', maxSec: 8 });
    const ancient = attackOnlyCreepTtk({
      heroId: 'juggernaut',
      level: 30,
      items: ['butterfly', 'daedalus', 'monkey-king-bar', 'mjollnir', 'assault-cuirass', 'divine-rapier'],
      creepId: 'ancient-thunderhide',
      regionId: 'mad-moon-crater',
      combatTier: 'hell',
      maxSec: 30
    });

    expect(trash).toBeGreaterThan(0);
    expect(trash).toBeLessThanOrEqual(4);
    expect(ancient).toBeGreaterThanOrEqual(4);
    expect(ancient).toBeLessThanOrEqual(18);
  });

  it('keeps a geared party regional boss kill in the intended fight-length range', () => {
    const party = ['juggernaut', 'sven', 'sniper', 'crystal-maiden', 'omniknight'].map((heroId) => ({
      heroId,
      level: 18,
      items: ['black-king-bar']
    }));
    const result = runRaidBattle(bossFightSetupFromDef(REG.boss('boss-phantom-assassin'), party, 'normal', 7001));

    expect(result.winner).toBe(0);
    expect(result.timeSec).toBeGreaterThanOrEqual(30);
    expect(result.timeSec).toBeLessThanOrEqual(140);
  });
});
