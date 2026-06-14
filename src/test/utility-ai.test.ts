import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { setupMacroSim } from '../core/macro';
import { chooseUtilityOrder, pickUtilityFocus } from '../core/utility';
import { combatProfile } from '../core/combat-profile';
import { thinkGambit } from '../core/controllers';
import { TUNING } from '../data/tuning';
import type { EffectCtx } from '../core/effects';
import type { AbilityDef, MacroHeroSetup } from '../core/types';
import type { Unit } from '../core/unit';

// ============================================================
// AI_OVERHAUL A0: the utility scorer + combatProfile. One scorer
// drives creeps, bosses, and the gambit fallback. These lock the
// per-consideration behavior so later slices do not regress it.
// ============================================================

beforeAll(() => registerAllContent());

function sim1v1(aHero: string, bHeroes: string[], level = 18) {
  const teamA: MacroHeroSetup[] = [{ heroId: aHero, level }];
  const teamB: MacroHeroSetup[] = bHeroes.map((h) => ({ heroId: h, level }));
  const sim = setupMacroSim({ seed: 4242, teamA, teamB, maxSec: 30 });
  const hero = sim.unitsArr.find((u) => u.team === 0 && u.heroId === aHero)!;
  const enemies = sim.unitsArr.filter((u) => u.team === 1);
  return { sim, hero, enemies };
}

const TEST_CHEAP_NUKE: AbilityDef = {
  id: 'test-cheap-nuke',
  name: 'Cheap Nuke',
  targeting: 'unit-target',
  affects: 'enemy',
  castRange: 700,
  manaCost: [0],
  cooldown: [1],
  values: { damage: [100] },
  effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }],
  vfx: { archetype: 'projectile', color: '#b89fff', scale: 0.8 },
  anim: 'staff-cast',
  sound: 'void'
};

const TEST_AOE_ULT: AbilityDef = {
  id: 'test-aoe-ult',
  name: 'AoE Ult',
  targeting: 'ground-aoe',
  ult: true,
  castRange: 800,
  manaCost: [300],
  cooldown: [100],
  values: { damage: [260], radius: [420] },
  effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }],
  vfx: { archetype: 'ground-aoe', color: '#b89fff', scale: 1.2 },
  anim: 'staff-cast',
  sound: 'void'
};

function installAbilities(u: Unit, defs: AbilityDef[]): void {
  u.abilities = defs.map((def) => ({
    def,
    level: 1,
    cooldownUntil: 0,
    charges: -1,
    nextChargeAt: 0,
    toggled: false,
    nextToggleTickAt: 0
  }));
}

describe('combatProfile derives character from data', () => {
  it('reads melee fronts, ranged backs, and supports', () => {
    const { hero: sven } = sim1v1('sven', ['lich']);
    const sniper = sim1v1('sniper', ['lich']).hero;
    const cm = sim1v1('crystal-maiden', ['lich']).hero;
    const omni = sim1v1('omniknight', ['lich']).hero;

    const pSven = combatProfile(sven);
    expect(pSven.ranged).toBe(false);
    expect(pSven.posture).toBe('frontline');

    const pSniper = combatProfile(sniper);
    expect(pSniper.ranged).toBe(true);
    expect(pSniper.posture).toBe('backline');
    expect(pSniper.kiteDistance).toBeGreaterThan(0);

    expect(combatProfile(cm).posture).toBe('backline');
    // a support values protecting allies far above the neutral baseline
    expect(combatProfile(omni).weights.saveAllies).toBeGreaterThan(1.0);
  });
});

describe('utility scorer picks actions by value, not slot order', () => {
  it('casts an area nuke into a cluster of enemies', () => {
    const { sim, hero, enemies } = sim1v1('earthshaker', ['sniper', 'lich', 'crystal-maiden']);
    hero.pos = { x: 2000, y: 2000 };
    enemies[0].pos = { x: 2120, y: 2000 };
    enemies[1].pos = { x: 2000, y: 2120 };
    enemies[2].pos = { x: 1900, y: 1900 };
    sim.rebuildSpatial();

    const order = chooseUtilityOrder(sim, hero, enemies[0]);
    expect(order?.kind).toBe('cast');
  });

  it('does not burn the area nuke on empty ground', () => {
    const { sim, hero, enemies } = sim1v1('earthshaker', ['sniper']);
    hero.pos = { x: 2000, y: 2000 };
    enemies[0].pos = { x: 5200, y: 2000 }; // far out of every cast range
    sim.rebuildSpatial();

    const order = chooseUtilityOrder(sim, hero, enemies[0]);
    // nothing worth casting at this range: fall back to engaging the focus
    expect(order?.kind === 'cast').toBe(false);
  });

  it('prefers a combo finisher shortly after its setup spell', () => {
    const { sim, hero, enemies } = sim1v1('earthshaker', ['sniper', 'lich']);
    hero.pos = { x: 2000, y: 2000 };
    enemies[0].pos = { x: 2180, y: 2000 };
    enemies[1].pos = { x: 2220, y: 2080 };
    sim.rebuildSpatial();

    const setup = hero.abilities.findIndex((a) => a.def.id === 'es-fissure');
    const finisher = hero.abilities.findIndex((a) => a.def.id === 'es-echo-slam');
    expect(setup).toBeGreaterThanOrEqual(0);
    expect(finisher).toBeGreaterThanOrEqual(0);

    const first = chooseUtilityOrder(sim, hero, enemies[0]);
    expect(first).toMatchObject({ kind: 'cast', slot: setup });

    hero.lastAbilityCastId = 'es-fissure';
    hero.lastAbilityCastAt = sim.time;
    const afterSetup = chooseUtilityOrder(sim, hero, enemies[0]);
    expect(afterSetup).toMatchObject({ kind: 'cast', slot: finisher });
  });

  it('heals the most wounded ally in range', () => {
    const teamA: MacroHeroSetup[] = [{ heroId: 'omniknight', level: 18 }, { heroId: 'sven', level: 18 }];
    const sim = setupMacroSim({ seed: 7, teamA, teamB: [{ heroId: 'lich', level: 18 }], maxSec: 30 });
    const omni = sim.unitsArr.find((u) => u.heroId === 'omniknight')!;
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;

    omni.pos = { x: 2000, y: 2000 };
    ally.pos = { x: 2150, y: 2000 };
    enemy.pos = { x: 2300, y: 2000 };
    ally.hp = ally.stats.maxHp * 0.4; // clearly wounded
    sim.rebuildSpatial();

    const order = chooseUtilityOrder(sim, omni, enemy);
    expect(order?.kind).toBe('cast');
    if (order?.kind === 'cast') expect(order.uid).toBe(ally.uid);
  });

  it('conserves scarce mana instead of dumping an expensive ult for low value', () => {
    const { sim, hero, enemies } = sim1v1('crystal-maiden', ['sniper', 'lich', 'sven'], 30);
    installAbilities(hero, [TEST_CHEAP_NUKE, TEST_AOE_ULT]);
    hero.pos = { x: 2000, y: 2000 };
    enemies[0].pos = { x: 2300, y: 2000 };
    enemies[1].pos = { x: 2360, y: 2040 };
    enemies[2].pos = { x: 2280, y: 2100 };
    hero.mana = hero.stats.maxMana;
    sim.rebuildSpatial();

    const fullPool = chooseUtilityOrder(sim, hero, enemies[0]);
    expect(fullPool).toMatchObject({ kind: 'cast', slot: 1 });

    const prevFloor = TUNING.ai.manaFloorPct;
    const prevWeight = TUNING.ai.manaConservationWeight;
    try {
      TUNING.ai.manaFloorPct = 0.95;
      TUNING.ai.manaConservationWeight = 1;
      hero.mana = hero.manaCostOf(1);
      const scarce = chooseUtilityOrder(sim, hero, enemies[0]);
      expect(scarce).toMatchObject({ kind: 'cast', slot: 0 });
    } finally {
      TUNING.ai.manaFloorPct = prevFloor;
      TUNING.ai.manaConservationWeight = prevWeight;
    }
  });

  it('holds an AoE ult for a cluster at high ai depth', () => {
    const { sim, hero, enemies } = sim1v1('earthshaker', ['sniper', 'lich', 'crystal-maiden'], 30);
    installAbilities(hero, [TEST_CHEAP_NUKE, TEST_AOE_ULT]);
    hero.ctrl.aiDepth = TUNING.bossTierAiDepth.hell;
    hero.pos = { x: 2000, y: 2000 };
    enemies[0].pos = { x: 2300, y: 2000 };
    enemies[1].pos = { x: 3800, y: 2000 };
    enemies[2].pos = { x: 3900, y: 2100 };
    sim.rebuildSpatial();

    const single = chooseUtilityOrder(sim, hero, enemies[0]);
    expect(single).toMatchObject({ kind: 'cast', slot: 0 });

    enemies[1].pos = { x: 2320, y: 2040 };
    enemies[2].pos = { x: 2260, y: 2090 };
    sim.rebuildSpatial();
    const cluster = chooseUtilityOrder(sim, hero, enemies[0]);
    expect(cluster).toMatchObject({ kind: 'cast', slot: 1 });
  });
});

describe('pickUtilityFocus is threat- and value-aware', () => {
  it('prefers a wounded nearby threat over a healthy distant body', () => {
    const { sim, hero, enemies } = sim1v1('sniper', ['lich', 'crystal-maiden']);
    hero.pos = { x: 2000, y: 2000 };
    const wounded = enemies[0];
    const healthy = enemies[1];
    wounded.pos = { x: 2200, y: 2000 };
    wounded.hp = wounded.stats.maxHp * 0.25;
    healthy.pos = { x: 3600, y: 2000 };
    healthy.hp = healthy.stats.maxHp;

    const focus = pickUtilityFocus(sim, hero);
    expect(focus?.uid).toBe(wounded.uid);
  });
});

describe('team-mind converges the team on a shared focus', () => {
  it('all reachable allies fight the same target', () => {
    const teamA: MacroHeroSetup[] = [
      { heroId: 'juggernaut', level: 18 },
      { heroId: 'sven', level: 18 },
      { heroId: 'sniper', level: 18 },
      { heroId: 'lich', level: 18 },
      { heroId: 'earthshaker', level: 18 }
    ];
    const teamB: MacroHeroSetup[] = [
      { heroId: 'pudge', level: 18 },
      { heroId: 'crystal-maiden', level: 18 },
      { heroId: 'luna', level: 18 },
      { heroId: 'axe', level: 18 },
      { heroId: 'jakiro', level: 18 }
    ];
    const sim = setupMacroSim({ seed: 321, teamA, teamB, maxSec: 30 });
    // let the teams close until the fight is actually joined
    let guard = 0;
    while (!sim.teamMind(0).engaged && guard++ < 24) sim.run(0.5);

    const tm = sim.teamMind(0);
    expect(tm.focusUid).not.toBeNull();
    expect(tm.engaged).toBe(true);

    const allies = sim.unitsArr.filter((u) => u.team === 0 && u.alive && u.kind === 'hero');
    expect(allies.length).toBeGreaterThanOrEqual(2);
    for (const a of allies) thinkGambit(sim, a); // re-evaluate at one tick
    const focuses = new Set(allies.map((a) => a.ctrl.focusUid));
    expect(focuses.size).toBe(1);
    expect([...focuses][0]).toBe(tm.focusUid);

    const focusUnit = sim.unit(tm.focusUid!);
    expect(focusUnit?.team).toBe(1); // it is an enemy
  });
});

describe('team-mind flags influence decisions', () => {
  it('backliners hold until a frontline ally opens the fight', () => {
    const teamA: MacroHeroSetup[] = [
      { heroId: 'sven', level: 18 },
      { heroId: 'sniper', level: 18 }
    ];
    const sim = setupMacroSim({ seed: 89, teamA, teamB: [{ heroId: 'lich', level: 18 }], maxSec: 30 });
    const sven = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const sniper = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    sven.pos = { x: 1900, y: 2000 };
    sniper.pos = { x: 900, y: 2000 };
    enemy.pos = { x: 2800, y: 2000 };
    sim.rebuildSpatial();

    expect(sim.teamMind(0).engaged).toBe(false);
    expect(chooseUtilityOrder(sim, sniper, enemy)?.kind).toBe('hold');
  });

  it('spread flag makes stacked allies step apart', () => {
    const sim = setupMacroSim({
      seed: 90,
      teamA: [{ heroId: 'sniper', level: 18 }, { heroId: 'lich', level: 18 }],
      teamB: [{ heroId: 'axe', level: 18 }],
      maxSec: 30
    });
    const sniper = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lich')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    sniper.pos = { x: 2000, y: 2000 };
    ally.pos = { x: 2060, y: 2000 };
    enemy.pos = { x: 3000, y: 2000 };
    sim.rebuildSpatial();

    const ctx: EffectCtx = { defId: 'test-zone', level: 1, vfx: { archetype: 'ground-aoe', color: '#ff7a3a' } };
    sim.addZone({
      caster: enemy,
      ctx,
      spec: { shape: 'circle', duration: 5, radius: 300, tick: { interval: 1, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 1, target: 'enemies-in-radius', radius: 300 }] } },
      duration: 5,
      pos: { ...ally.pos },
      radius: 300
    });

    expect(sim.teamMind(0).spread).toBe(true);
    expect(chooseUtilityOrder(sim, sniper, enemy)?.kind).toBe('move');
  });
});

describe('the scorer is deterministic', () => {
  it('returns the identical order across two identical sims', () => {
    const build = (): { sim: ReturnType<typeof setupMacroSim>; hero: Unit; focus: Unit } => {
      const { sim, hero, enemies } = sim1v1('earthshaker', ['sniper', 'lich', 'crystal-maiden']);
      hero.pos = { x: 2000, y: 2000 };
      enemies[0].pos = { x: 2120, y: 2000 };
      enemies[1].pos = { x: 2000, y: 2120 };
      enemies[2].pos = { x: 1900, y: 1900 };
      sim.rebuildSpatial();
      return { sim, hero, focus: enemies[0] };
    };
    const a = build();
    const b = build();
    expect(chooseUtilityOrder(a.sim, a.hero, a.focus)).toEqual(chooseUtilityOrder(b.sim, b.hero, b.focus));
  });
});
