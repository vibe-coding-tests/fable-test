import { beforeAll, describe, expect, it } from 'vitest';
import { ALL_HEROES, registerAllContent } from '../data';
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

const TEST_AOE_NUKE: AbilityDef = {
  id: 'test-aoe-nuke',
  name: 'AoE Nuke',
  targeting: 'ground-aoe',
  castRange: 800,
  manaCost: [120],
  cooldown: [8],
  values: { damage: [220], radius: [420] },
  effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }],
  vfx: { archetype: 'ground-aoe', color: '#b89fff', scale: 1.1 },
  anim: 'staff-cast',
  sound: 'void'
};

const TEST_HEX: AbilityDef = {
  id: 'test-hex',
  name: 'Test Hex',
  targeting: 'unit-target',
  affects: 'enemy',
  castRange: 800,
  manaCost: [0],
  cooldown: [1],
  values: { dur: [2] },
  effects: [{ kind: 'status', status: 'hex', duration: 'dur', target: 'target' }],
  vfx: { archetype: 'stun-stars', color: '#70d8ff' },
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

  it('populates setup-to-ultimate combo data across the roster', () => {
    const comboHeroes = ALL_HEROES.filter((hero) => (hero.combo?.length ?? 0) > 0);
    expect(comboHeroes.length).toBeGreaterThan(30);

    const lion = ALL_HEROES.find((hero) => hero.id === 'lion')!;
    expect(lion.combo).toContainEqual(expect.objectContaining({ before: 'lion-earth-spike', after: 'lion-finger' }));
    expect(lion.combo).toContainEqual(expect.objectContaining({ before: 'lion-hex', after: 'lion-finger' }));

    const earthshaker = ALL_HEROES.find((hero) => hero.id === 'earthshaker')!;
    expect(earthshaker.combo).toEqual([{ before: 'es-fissure', after: 'es-echo-slam', windowSec: 4, weight: 1.55 }]);

    for (const hero of comboHeroes) {
      const abilityIds = new Set(hero.abilities.map((ability) => ability.id));
      for (const combo of hero.combo ?? []) {
        expect(abilityIds.has(combo.before), `${hero.id}/${combo.before}`).toBe(true);
        expect(abilityIds.has(combo.after), `${hero.id}/${combo.after}`).toBe(true);
        expect(hero.abilities.find((ability) => ability.id === combo.after)?.ult, `${hero.id}/${combo.after}`).toBe(true);
      }
    }
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

  it('holds a non-ult cluster-nuke for a cluster (archetype hold generalized past ults)', () => {
    // AUTOBATTLER_OVERHAUL §6.3: the cluster-hold discipline now keys off the `cluster-nuke`
    // archetype, so even a non-ult AoE nuke is held for the count — the old gate held ults only.
    const { sim, hero, enemies } = sim1v1('earthshaker', ['sniper', 'lich', 'crystal-maiden'], 30);
    installAbilities(hero, [TEST_CHEAP_NUKE, TEST_AOE_NUKE]);
    hero.ctrl.aiDepth = TUNING.bossTierAiDepth.hell;
    hero.pos = { x: 2000, y: 2000 };
    enemies[0].pos = { x: 2300, y: 2000 };
    enemies[1].pos = { x: 3800, y: 2000 };
    enemies[2].pos = { x: 3900, y: 2100 };
    sim.rebuildSpatial();

    expect(chooseUtilityOrder(sim, hero, enemies[0])).toMatchObject({ kind: 'cast', slot: 0 });

    enemies[1].pos = { x: 2320, y: 2040 };
    enemies[2].pos = { x: 2260, y: 2090 };
    sim.rebuildSpatial();
    expect(chooseUtilityOrder(sim, hero, enemies[0])).toMatchObject({ kind: 'cast', slot: 1 });
  });

  it('redirects a single-lockdown onto an enemy mid-channel to interrupt it', () => {
    const { sim, hero, enemies } = sim1v1('lion', ['lich', 'crystal-maiden'], 18);
    installAbilities(hero, [TEST_HEX]);
    hero.pos = { x: 2000, y: 2000 };
    const focus = enemies[0];
    const channeler = enemies[1];
    focus.pos = { x: 2300, y: 2000 };       // nearer, the default focus
    channeler.pos = { x: 2600, y: 2000 };   // farther, but mid-channel
    channeler.channel = { source: 'ability', slot: 0, until: sim.time + 2, nextTickAt: sim.time + 0.5, interval: 0.5 };
    sim.rebuildSpatial();

    const order = chooseUtilityOrder(sim, hero, focus);
    expect(order).toMatchObject({ kind: 'cast', slot: 0, uid: channeler.uid });
  });

  it('uses a nuker playbook to lead with amplify before burst items', () => {
    const sim = setupMacroSim({
      seed: 2026,
      teamA: [{ heroId: 'zeus', level: 18, items: ['veil-of-discord', 'dagon'] }],
      teamB: [{ heroId: 'sven', level: 18 }],
      maxSec: 30
    });
    const zeus = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'zeus')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    installAbilities(zeus, []);
    zeus.pos = { x: 2000, y: 2000 };
    enemy.pos = { x: 2450, y: 2000 };
    sim.rebuildSpatial();

    expect(chooseUtilityOrder(sim, zeus, enemy)).toMatchObject({ kind: 'item', invSlot: 0 });

    zeus.items[0]!.cooldownUntil = sim.time + 10;
    expect(chooseUtilityOrder(sim, zeus, enemy)).toMatchObject({ kind: 'item', invSlot: 1 });
  });

  it('uses a support playbook to save before group sustain', () => {
    const sim = setupMacroSim({
      seed: 2027,
      teamA: [
        { heroId: 'crystal-maiden', level: 18, items: ['glimmer-cape', 'pipe-of-insight'] },
        { heroId: 'sven', level: 18 }
      ],
      teamB: [{ heroId: 'axe', level: 18 }],
      maxSec: 30
    });
    const support = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'crystal-maiden')!;
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    installAbilities(support, []);
    support.pos = { x: 2000, y: 2000 };
    ally.pos = { x: 2120, y: 2000 };
    enemy.pos = { x: 2240, y: 2000 };
    ally.hp = ally.stats.maxHp * 0.35;
    ally.lastEnemyDamageAt = sim.time;
    sim.rebuildSpatial();

    expect(chooseUtilityOrder(sim, support, enemy)).toMatchObject({ kind: 'item', invSlot: 0, uid: ally.uid });
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

describe('AUTOBATTLER §6.1 — formation posture on the team-mind', () => {
  function fiveVsFive(seed = 555) {
    const teamA: MacroHeroSetup[] = [
      { heroId: 'axe', level: 18 }, { heroId: 'sven', level: 18 },
      { heroId: 'sniper', level: 18 }, { heroId: 'lich', level: 18 },
      { heroId: 'crystal-maiden', level: 18 }
    ];
    const teamB: MacroHeroSetup[] = [
      { heroId: 'tidehunter', level: 18 }, { heroId: 'luna', level: 18 },
      { heroId: 'jakiro', level: 18 }, { heroId: 'lina', level: 18 },
      { heroId: 'crystal-maiden', level: 18 }
    ];
    return setupMacroSim({ seed, teamA, teamB, maxSec: 30 });
  }

  it('splits the team into a front line and a backline', () => {
    const sim = fiveVsFive();
    const tm = sim.teamMind(0);
    const sniper = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
    const axe = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'axe')!;
    expect(tm.frontLineUids.length).toBeGreaterThan(0);
    expect(tm.backlineUids).toContain(sniper.uid);   // ranged carry holds the back
    expect(tm.frontLineUids).toContain(axe.uid);     // durable initiator holds the front
    expect(tm.backlineUids).not.toContain(axe.uid);
  });

  it('assigns a peeler to the channeling backliner first', () => {
    const sim = setupMacroSim({
      seed: 7,
      teamA: [{ heroId: 'axe', level: 18 }, { heroId: 'sniper', level: 18 }, { heroId: 'lich', level: 18 }],
      teamB: [{ heroId: 'sven', level: 18 }],
      maxSec: 30
    });
    const axe = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'axe')!;
    const sniper = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
    const lich = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lich')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    axe.pos = { x: 2000, y: 2000 };
    sniper.pos = { x: 2200, y: 2000 };
    lich.pos = { x: 2000, y: 2400 };
    enemy.pos = { x: 3000, y: 2000 };
    sniper.channel = { source: 'ability', slot: 3, until: sim.time + 3, nextTickAt: sim.time + 0.5, interval: 0.5 };
    sim.rebuildSpatial();

    const tm = sim.teamMind(0);
    expect(tm.protectAssignments[axe.uid]).toBe(sniper.uid); // the channeler outranks lich
  });

  it('names the enemy support as the flank target', () => {
    const sim = setupMacroSim({
      seed: 11,
      teamA: [{ heroId: 'lion', level: 18 }],
      teamB: [{ heroId: 'axe', level: 18 }, { heroId: 'crystal-maiden', level: 18 }, { heroId: 'sniper', level: 18 }],
      maxSec: 30
    });
    const lion = sim.unitsArr.find((u) => u.team === 0)!;
    const enemies = sim.unitsArr.filter((u) => u.team === 1);
    const cm = enemies.find((u) => u.heroId === 'crystal-maiden')!;
    lion.pos = { x: 2000, y: 2000 };
    enemies.forEach((e, i) => (e.pos = { x: 2400 + i * 80, y: 2000 }));
    sim.rebuildSpatial();

    expect(sim.teamMind(0).flankTargetUid).toBe(cm.uid); // team-buff caster is the softest
  });

  it('is deterministic: identical sims yield identical posture', () => {
    const a = sim1v1('axe', ['sven']);
    const b = sim1v1('axe', ['sven']);
    const ta = a.sim.teamMind(0);
    const tb = b.sim.teamMind(0);
    expect(ta.frontLineUids).toEqual(tb.frontLineUids);
    expect(ta.backlineUids).toEqual(tb.backlineUids);
    expect(ta.protectAssignments).toEqual(tb.protectAssignments);
    expect(ta.flankTargetUid).toBe(tb.flankTargetUid);
  });
});

describe('AUTOBATTLER §6.2/§6.3 — board-aware movement and casting', () => {
  it('a displaced pre-engage unit drifts back to its anchor; seated, it holds', () => {
    const sim = setupMacroSim({
      seed: 31,
      teamA: [{ heroId: 'sven', level: 18 }, { heroId: 'sniper', level: 18 }],
      teamB: [{ heroId: 'lich', level: 18 }],
      maxSec: 30
    });
    const sven = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const sniper = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sniper')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    enemy.pos = { x: 4150, y: 2800 };  // far corner: out of every range, not engaged
    sven.pos = { x: 1500, y: 2000 };   // a frontliner closer to the enemy → backline holds
    sniper.ctrl.homePos = { x: 800, y: 800 };
    sniper.pos = { x: 800, y: 2000 };  // displaced from the anchor, still far from the enemy
    sim.rebuildSpatial();
    expect(sim.teamMind(0).engaged).toBe(false);

    const reform = chooseUtilityOrder(sim, sniper, enemy);
    expect(reform?.kind).toBe('move');
    if (reform?.kind === 'move') {
      expect(reform.point.x).toBeCloseTo(800, 3);
      expect(reform.point.y).toBeCloseTo(800, 3);
    }

    sniper.pos = { x: 800, y: 800 }; // seated on the anchor
    sim.rebuildSpatial();
    expect(chooseUtilityOrder(sim, sniper, enemy)?.kind).toBe('hold');
  });

  it('a single-lockdown spends on the collapse target over the nearest body', () => {
    const sim = setupMacroSim({
      seed: 13,
      teamA: [{ heroId: 'lion', level: 18 }],
      teamB: [{ heroId: 'axe', level: 18 }, { heroId: 'crystal-maiden', level: 18 }],
      maxSec: 30
    });
    const lion = sim.unitsArr.find((u) => u.team === 0)!;
    const axe = sim.unitsArr.find((u) => u.team === 1 && u.heroId === 'axe')!;
    const cm = sim.unitsArr.find((u) => u.team === 1 && u.heroId === 'crystal-maiden')!;
    installAbilities(lion, [TEST_HEX]);
    lion.pos = { x: 2000, y: 2000 };
    axe.pos = { x: 2300, y: 2000 };   // nearest body
    cm.pos = { x: 2600, y: 2000 };    // the soft collapse target, in range
    sim.rebuildSpatial();

    expect(sim.teamMind(0).flankTargetUid).toBe(cm.uid);
    const order = chooseUtilityOrder(sim, lion, axe);
    expect(order).toMatchObject({ kind: 'cast', slot: 0, uid: cm.uid });
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
