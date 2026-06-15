import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { setupMacroSim } from '../core/macro';
import { planTeamCombos, planUnitCombo } from '../core/combo-planner';
import { chooseUtilityOrder } from '../core/utility';
import { combatProfile } from '../core/combat-profile';
import { TUNING } from '../data/tuning';
import type { AbilityDef, MacroHeroSetup } from '../core/types';
import type { Unit } from '../core/unit';

beforeAll(() => registerAllContent());

const TEST_PAYOFF_ULT: AbilityDef = {
  id: 'test-payoff-ult',
  name: 'Payoff Ult',
  targeting: 'ground-aoe',
  ult: true,
  castRange: 350,
  castPoint: 0,
  manaCost: [100],
  cooldown: [40],
  values: { damage: [320], radius: [360] },
  effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'enemies-in-radius', radius: 'radius' }],
  vfx: { archetype: 'ground-aoe', color: '#ff8a3a', scale: 1 },
  anim: 'staff-cast',
  sound: 'fire'
};

/** An explicit hydro nuke: lays a hydro soak that a pyro payoff vaporizes (§4 element node). */
const TEST_HYDRO_SOAK: AbilityDef = {
  id: 'test-hydro-soak',
  name: 'Hydro Soak',
  targeting: 'unit-target',
  affects: 'enemy',
  element: 'hydro',
  castRange: 700,
  manaCost: [40],
  cooldown: [3],
  values: { damage: [80] },
  effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }],
  vfx: { archetype: 'projectile', color: '#3aa0ff', scale: 0.8 },
  anim: 'staff-cast',
  sound: 'void'
};

const TEST_PYRO_NUKE: AbilityDef = {
  id: 'test-pyro-nuke',
  name: 'Pyro Nuke',
  targeting: 'unit-target',
  affects: 'enemy',
  element: 'pyro',
  castRange: 700,
  manaCost: [40],
  cooldown: [3],
  values: { damage: [220] },
  effects: [{ kind: 'damage', dtype: 'magical', amount: 'damage', target: 'target' }],
  vfx: { archetype: 'projectile', color: '#ff7a3a', scale: 0.8 },
  anim: 'staff-cast',
  sound: 'fire'
};

const TEST_PYRO_NUKE_B: AbilityDef = { ...TEST_PYRO_NUKE, id: 'test-pyro-nuke-b', name: 'Pyro Nuke B', values: { damage: [180] } };

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

function simWith(teamA: MacroHeroSetup[], teamB: MacroHeroSetup[] = [{ heroId: 'sven', level: 18 }]) {
  const sim = setupMacroSim({ seed: 5150, teamA, teamB, maxSec: 30 });
  const hero = sim.unitsArr.find((u) => u.team === 0 && u.kind === 'hero')!;
  const focus = sim.unitsArr.find((u) => u.team === 1 && u.kind === 'hero')!;
  hero.pos = { x: 2000, y: 2000 };
  focus.pos = { x: 2800, y: 2000 };
  sim.rebuildSpatial();
  return { sim, hero, focus };
}

describe('single-unit combo planner', () => {
  it('uses Blink as the setup step when it unlocks a ready payoff', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'earthshaker', level: 18, items: ['blink-dagger', 'black-king-bar'] }]);
    installAbilities(hero, [TEST_PAYOFF_ULT]);
    hero.mana = hero.stats.maxMana;

    const plan = planUnitCombo(sim, hero, focus);
    expect(plan?.nextStep).toMatchObject({ kind: 'item', slot: 0, role: 'enabler' });
    expect(plan?.steps.at(-1)).toMatchObject({ kind: 'cast', slot: 0, role: 'payoff' });
    expect(chooseUtilityOrder(sim, hero, focus)).toMatchObject({ kind: 'item', invSlot: 0 });
  });

  it('does not spend BKB when the Blink plan has already died', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'earthshaker', level: 18, items: ['blink-dagger', 'black-king-bar'] }]);
    installAbilities(hero, [TEST_PAYOFF_ULT]);
    focus.alive = false;

    expect(planUnitCombo(sim, hero, focus)).toBeNull();
    expect(chooseUtilityOrder(sim, hero, focus)).not.toMatchObject({ kind: 'item', invSlot: 1 });
  });

  it('casts Veil before Dagon and holds the nuke until setup lands', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'zeus', level: 18, items: ['dagon', 'veil-of-discord'] }]);
    installAbilities(hero, []);
    focus.pos = { x: 2450, y: 2000 };
    focus.externalMods.magicResistPct = 100;
    focus.markStatsDirty();
    focus.refresh(sim.time);
    sim.rebuildSpatial();

    const plan = planUnitCombo(sim, hero, focus);
    expect(plan?.nextStep).toMatchObject({ kind: 'item', slot: 1, role: 'amplifier' });
    expect(chooseUtilityOrder(sim, hero, focus)).toMatchObject({ kind: 'item', invSlot: 1 });
  });

  it('aborts when the target leaves payoff range and no opener can bridge it', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'zeus', level: 18, items: ['veil-of-discord', 'dagon'] }]);
    installAbilities(hero, []);
    focus.pos = { x: 5200, y: 2000 };
    sim.rebuildSpatial();

    expect(planUnitCombo(sim, hero, focus)).toBeNull();
  });

  it('aborts the chain when the target gains immunity mid-window', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'zeus', level: 18, items: ['dagon', 'veil-of-discord'] }]);
    installAbilities(hero, []);
    focus.pos = { x: 2450, y: 2000 };
    focus.externalMods.magicResistPct = 100; // a Veil→Dagon plan exists pre-immunity
    focus.markStatsDirty();
    focus.refresh(sim.time);
    sim.rebuildSpatial();
    expect(planUnitCombo(sim, hero, focus)).not.toBeNull();

    // the focus pops magic immunity (BKB): the enabler is never spent on a dead plan.
    focus.addStatus({ status: 'magic-immune', tag: 'test-bkb', sourceUid: focus.uid, sourceTeam: focus.team, until: sim.time + 5, isDebuff: false });
    focus.refresh(sim.time);
    expect(focus.summary.magicImmune).toBe(true);

    // the chain aborts: the planner no longer drives the Veil→Dagon sequence.
    expect(planUnitCombo(sim, hero, focus)).toBeNull();
  });

  it('assembles the full enabler-amplifier-payoff chain only at high ai depth', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'zeus', level: 18, items: ['rod-of-atos', 'veil-of-discord', 'dagon'] }]);
    installAbilities(hero, []);
    hero.pos = { x: 2000, y: 2000 };
    focus.pos = { x: 2300, y: 2000 };
    hero.mana = hero.stats.maxMana;
    sim.rebuildSpatial();

    hero.ctrl.aiDepth = TUNING.bossTierAiDepth.normal;
    expect(planUnitCombo(sim, hero, focus)?.steps).toHaveLength(2);

    hero.ctrl.aiDepth = TUNING.bossTierAiDepth.hell;
    const deep = planUnitCombo(sim, hero, focus);
    expect(deep?.steps.map((s) => s.role)).toEqual(['enabler', 'amplifier', 'payoff']);
    expect(deep?.nextStep).toMatchObject({ role: 'enabler', slot: 0 });
  });

  it('treats an element setup as a first-class enabler when it reacts with the payoff', () => {
    // §4: a hydro soak and a pyro nuke are both offensive payoffs, but the planner
    // promotes the reacting soak to an enabler so the pyro lands into vaporize.
    const { sim, hero, focus } = simWith([{ heroId: 'lion', level: 18 }]);
    installAbilities(hero, [TEST_HYDRO_SOAK, TEST_PYRO_NUKE]);
    hero.pos = { x: 2000, y: 2000 };
    focus.pos = { x: 2300, y: 2000 };
    hero.mana = hero.stats.maxMana;
    sim.rebuildSpatial();

    const plan = planUnitCombo(sim, hero, focus);
    expect(plan?.steps).toHaveLength(2);
    expect(plan?.steps.map((s) => s.role)).toEqual(['enabler', 'payoff']);
    expect(plan?.nextStep.role).toBe('enabler');
    expect(plan?.nextStep.kind).toBe('cast');
  });

  it('treats a recent setup tag as a live opening for the payoff', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'zeus', level: 18, items: ['dagon'] }]);
    installAbilities(hero, []);
    hero.pos = { x: 2000, y: 2000 };
    focus.pos = { x: 2350, y: 2000 };
    focus.lastTagSetupAt = sim.time;
    focus.lastTagSetupArchetype = 'Soak';
    focus.lastTagSetupElement = 'hydro';
    sim.rebuildSpatial();

    const plan = planUnitCombo(sim, hero, focus);
    expect(plan?.steps).toHaveLength(1);
    expect(plan?.nextStep).toMatchObject({ kind: 'item', slot: 0, role: 'payoff' });

    focus.lastTagSetupAt = sim.time - TUNING.ai.comboWindowSec - 0.1;
    expect(planUnitCombo(sim, hero, focus)).toBeNull();
  });

  it('does not chain two same-element nukes — a soak cannot react with itself', () => {
    const { sim, hero, focus } = simWith([{ heroId: 'lion', level: 18 }]);
    installAbilities(hero, [TEST_PYRO_NUKE, TEST_PYRO_NUKE_B]);
    hero.pos = { x: 2000, y: 2000 };
    focus.pos = { x: 2300, y: 2000 };
    hero.mana = hero.stats.maxMana;
    sim.rebuildSpatial();

    expect(planUnitCombo(sim, hero, focus)).toBeNull();
  });

  it('replays identical plans for identical seeds and state', () => {
    const build = () => {
      const ctx = simWith([{ heroId: 'zeus', level: 18, items: ['dagon', 'veil-of-discord'] }]);
      installAbilities(ctx.hero, []);
      ctx.focus.pos = { x: 2450, y: 2000 };
      ctx.sim.rebuildSpatial();
      return ctx;
    };
    const a = build();
    const b = build();

    expect(planUnitCombo(a.sim, a.hero, a.focus)).toEqual(planUnitCombo(b.sim, b.hero, b.focus));
    expect(chooseUtilityOrder(a.sim, a.hero, a.focus)).toEqual(chooseUtilityOrder(b.sim, b.hero, b.focus));
  });

  it('threads BKB between a Blink initiation and the payoff when the reply is loaded', () => {
    const { sim, hero, focus } = simWith(
      [{ heroId: 'earthshaker', level: 18, items: ['blink-dagger', 'black-king-bar'] }],
      [{ heroId: 'sven', level: 18 }, { heroId: 'lion', level: 18 }]
    );
    installAbilities(hero, [TEST_PAYOFF_ULT]);
    hero.ctrl.aiDepth = TUNING.bossTierAiDepth.hell;
    hero.mana = hero.stats.maxMana;
    focus.pos = { x: 2800, y: 2000 };
    const otherEnemy = sim.unitsArr.find((u) => u.team === 1 && u.uid !== focus.uid)!;
    otherEnemy.pos = { x: 2860, y: 2060 };
    sim.rebuildSpatial();

    const fullDive = planUnitCombo(sim, hero, focus);
    expect(fullDive?.steps.map((s) => s.role)).toEqual(['enabler', 'immunity', 'payoff']);
    expect(fullDive?.nextStep).toMatchObject({ kind: 'item', slot: 0, role: 'enabler' });

    hero.lastItemActiveId = 'blink-dagger';
    hero.lastItemActiveAt = sim.time;
    hero.items[0]!.cooldownUntil = sim.time + 10;
    hero.pos = { x: 2460, y: 2000 };
    focus.pos = { x: 2520, y: 2000 };
    otherEnemy.pos = { x: 2580, y: 2040 };
    sim.rebuildSpatial();
    expect(planUnitCombo(sim, hero, focus)?.nextStep).toMatchObject({ kind: 'item', slot: 1, role: 'immunity' });
    expect(chooseUtilityOrder(sim, hero, focus)).toMatchObject({ kind: 'item', invSlot: 1 });

    hero.addStatus({ status: 'magic-immune', tag: 'test-bkb', sourceUid: hero.uid, sourceTeam: hero.team, until: sim.time + 4, isDebuff: false });
    hero.refresh(sim.time);
    hero.items[1]!.cooldownUntil = sim.time + 10;
    expect(planUnitCombo(sim, hero, focus)?.nextStep).toMatchObject({ kind: 'cast', slot: 0, role: 'payoff' });
  });
});

describe('team combo planner', () => {
  it('assigns one save holder so two supports do not double-save', () => {
    const sim = setupMacroSim({
      seed: 6100,
      teamA: [
        { heroId: 'lich', level: 18, items: ['glimmer-cape'] },
        { heroId: 'crystal-maiden', level: 18, items: ['glimmer-cape'] },
        { heroId: 'sven', level: 18 }
      ],
      teamB: [{ heroId: 'axe', level: 18 }],
      maxSec: 30
    });
    const supports = sim.unitsArr.filter((u) => u.team === 0 && (u.heroId === 'lich' || u.heroId === 'crystal-maiden'));
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    for (const support of supports) {
      installAbilities(support, []);
      support.pos = { x: 2000, y: 2000 + support.uid * 20 };
    }
    ally.pos = { x: 2120, y: 2000 };
    ally.hp = ally.stats.maxHp * 0.3;
    ally.lastEnemyDamageAt = sim.time;
    enemy.pos = { x: 2300, y: 2000 };
    sim.rebuildSpatial();

    const tm = sim.teamMind(0);
    expect(tm.saveHolderUid).not.toBeNull();
    const orders = supports.map((support) => ({ support, order: chooseUtilityOrder(sim, support, enemy) }));
    const saveOrders = orders.filter(({ order }) => order?.kind === 'item');
    expect(saveOrders).toHaveLength(1);
    expect(saveOrders[0].support.uid).toBe(tm.saveHolderUid);
  });

  it('sequences a disabler lockdown before a nuker payoff on the shared focus', () => {
    const sim = setupMacroSim({
      seed: 6200,
      teamA: [
        { heroId: 'lion', level: 18, items: ['rod-of-atos'] },
        { heroId: 'zeus', level: 18, items: ['dagon'] }
      ],
      teamB: [{ heroId: 'sven', level: 18 }],
      maxSec: 30
    });
    const disabler = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lion')!;
    const nuker = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'zeus')!;
    const focus = sim.unitsArr.find((u) => u.team === 1)!;
    installAbilities(disabler, []);
    installAbilities(nuker, []);
    disabler.pos = { x: 2000, y: 2000 };
    nuker.pos = { x: 2000, y: 2060 };
    focus.pos = { x: 2450, y: 2000 };
    sim.rebuildSpatial();

    const teamPlan = planTeamCombos(sim, 0, focus);
    expect(teamPlan.lockdownUid).toBe(disabler.uid);
    expect(teamPlan.chains[0]?.nextStep).toMatchObject({ unitUid: disabler.uid, role: 'enabler' });
    expect(chooseUtilityOrder(sim, disabler, focus)).toMatchObject({ kind: 'item', invSlot: 0 });
    expect(chooseUtilityOrder(sim, nuker, focus)).not.toMatchObject({ kind: 'item', invSlot: 0 });

    focus.addStatus({ status: 'root', tag: 'test-root', sourceUid: disabler.uid, sourceTeam: disabler.team, until: sim.time + 2, isDebuff: true });
    focus.refresh(sim.time);
    expect(chooseUtilityOrder(sim, nuker, focus)).toMatchObject({ kind: 'item', invSlot: 0 });
  });

  it('commits multiple simultaneous cross-unit chains on one focus', () => {
    // §5: two disablers and two nukers should run two wombos at once, never
    // double-committing a unit, with the lockdown role drawn from a live chain.
    const sim = setupMacroSim({
      seed: 6400,
      teamA: [
        { heroId: 'lion', level: 18, items: ['rod-of-atos'] },
        { heroId: 'crystal-maiden', level: 18, items: ['rod-of-atos'] },
        { heroId: 'zeus', level: 18, items: ['dagon'] },
        { heroId: 'lina', level: 18, items: ['dagon'] }
      ],
      teamB: [{ heroId: 'sven', level: 18 }],
      maxSec: 30
    });
    const heroes = sim.unitsArr.filter((u) => u.team === 0 && u.kind === 'hero');
    const focus = sim.unitsArr.find((u) => u.team === 1)!;
    for (const h of heroes) {
      installAbilities(h, []);
      h.pos = { x: 2000, y: 1900 + h.uid * 20 };
      h.mana = h.stats.maxMana;
    }
    focus.pos = { x: 2300, y: 2000 };
    sim.rebuildSpatial();

    const teamPlan = planTeamCombos(sim, 0, focus);
    expect(teamPlan.chains.length).toBeGreaterThanOrEqual(2);

    const owners = teamPlan.chains.flatMap((c) => c.steps.map((s) => s.unitUid));
    expect(new Set(owners).size).toBe(owners.length); // no unit in two chains at once

    for (const chain of teamPlan.chains) {
      const enabler = chain.steps.find((s) => s.role === 'enabler');
      const payoff = chain.steps.find((s) => s.role === 'payoff');
      expect(enabler).toBeDefined();
      expect(payoff).toBeDefined();
      expect(enabler!.unitUid).not.toBe(payoff!.unitUid); // genuinely cross-unit
    }
    expect(teamPlan.lockdownUid).not.toBeNull();
  });

  it('keeps team combo planning deterministic', () => {
    const build = () => {
      const sim = setupMacroSim({
        seed: 6300,
        teamA: [
          { heroId: 'lion', level: 18, items: ['rod-of-atos'] },
          { heroId: 'zeus', level: 18, items: ['dagon'] }
        ],
        teamB: [{ heroId: 'sven', level: 18 }],
        maxSec: 30
      });
      const disabler = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lion')!;
      const nuker = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'zeus')!;
      const focus = sim.unitsArr.find((u) => u.team === 1)!;
      installAbilities(disabler, []);
      installAbilities(nuker, []);
      disabler.pos = { x: 2000, y: 2000 };
      nuker.pos = { x: 2000, y: 2060 };
      focus.pos = { x: 2450, y: 2000 };
      sim.rebuildSpatial();
      return { sim, focus };
    };
    const a = build();
    const b = build();
    expect(planTeamCombos(a.sim, 0, a.focus)).toEqual(planTeamCombos(b.sim, 0, b.focus));
  });
});

describe('save chain, playbook lean, role suppression, signature considers', () => {
  it('sequences a reposition save then a shield save on a dived ally (§4)', () => {
    const sim = setupMacroSim({
      seed: 7001,
      teamA: [
        { heroId: 'crystal-maiden', level: 18, items: ['force-staff', 'glimmer-cape'] },
        { heroId: 'sven', level: 18 }
      ],
      teamB: [{ heroId: 'axe', level: 18 }],
      maxSec: 30
    });
    const cm = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'crystal-maiden')!;
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    installAbilities(cm, []);
    cm.pos = { x: 2000, y: 2000 };
    ally.pos = { x: 2120, y: 2000 };
    enemy.pos = { x: 2260, y: 2000 };          // inside saveCrushRadius of the ally
    ally.hp = ally.stats.maxHp * 0.3;          // dived and low
    ally.lastEnemyDamageAt = sim.time;         // under fire
    sim.rebuildSpatial();

    const forceSlot = cm.items.findIndex((it) => it?.defId === 'force-staff');
    expect(forceSlot).toBeGreaterThanOrEqual(0);

    // tick 1: the reposition save (Force Staff) fires first, aimed at the dived ally
    const first = chooseUtilityOrder(sim, cm, enemy);
    expect(first?.kind).toBe('item');
    if (first?.kind !== 'item') throw new Error('expected item');
    expect(cm.items[first.invSlot]?.defId).toBe('force-staff');
    expect(first.uid).toBe(ally.uid);

    // reposition spent: the shield save (Glimmer) follows — the two saves are
    // sequenced (one per tick), never fired on the same one.
    cm.items[forceSlot] = null;
    sim.rebuildSpatial();
    const second = chooseUtilityOrder(sim, cm, enemy);
    expect(second?.kind).toBe('item');
    if (second?.kind !== 'item') throw new Error('expected item');
    expect(cm.items[second.invSlot]?.defId).toBe('glimmer-cape');
    expect(second.uid).toBe(ally.uid);
  });

  it('leans a lockdown item onto the playbook aim-at role when no focus is set (§3)', () => {
    const sim = setupMacroSim({
      seed: 7002,
      teamA: [{ heroId: 'crystal-maiden', level: 18, items: ['rod-of-atos'] }],
      teamB: [{ heroId: 'axe', level: 18 }, { heroId: 'luna', level: 18 }],
      maxSec: 30
    });
    const cm = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'crystal-maiden')!;
    const bruiser = sim.unitsArr.find((u) => u.team === 1 && u.heroId === 'axe')!;
    const carry = sim.unitsArr.find((u) => u.team === 1 && u.heroId === 'luna')!;
    installAbilities(cm, []);
    cm.pos = { x: 2000, y: 2000 };
    bruiser.pos = { x: 2300, y: 2000 };        // nearer body
    carry.pos = { x: 2300, y: 2200 };          // the carry the support is built to lock
    sim.rebuildSpatial();

    expect(combatProfile(cm).playbook.aimAt).toBe('carry');
    expect(combatProfile(carry).role).toBe('carry');
    // no shared focus in range: the lockdown leans onto the carry, not the bruiser
    expect(chooseUtilityOrder(sim, cm, null)).toMatchObject({ kind: 'item', uid: carry.uid });
  });

  it('suppresses a duplicate lockdown from a non-assigned source outside a chain (§5)', () => {
    const sim = setupMacroSim({
      seed: 7003,
      teamA: [
        { heroId: 'lion', level: 18, items: ['rod-of-atos'] },
        { heroId: 'crystal-maiden', level: 18, items: ['rod-of-atos'] }
      ],
      teamB: [{ heroId: 'sven', level: 18 }],
      maxSec: 30
    });
    const lion = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lion')!;
    const cm = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'crystal-maiden')!;
    const focus = sim.unitsArr.find((u) => u.team === 1)!;
    installAbilities(lion, []);
    installAbilities(cm, []);
    lion.pos = { x: 2000, y: 2000 };
    cm.pos = { x: 2000, y: 2100 };
    focus.pos = { x: 2500, y: 2050 };
    lion.lastEnemyDamageAt = sim.time;          // team is engaged (no pre-engage hold)
    cm.lastEnemyDamageAt = sim.time;
    sim.rebuildSpatial();

    const tm = sim.teamMind(0);
    expect(tm.lockdownUid).not.toBeNull();
    const designated = tm.lockdownUid === lion.uid ? lion : cm;
    const other = tm.lockdownUid === lion.uid ? cm : lion;

    // the assigned source spends its lockdown; the other holds it (only one stun on the jump)
    expect(chooseUtilityOrder(sim, designated, focus)).toMatchObject({ kind: 'item' });
    expect(chooseUtilityOrder(sim, other, focus)).not.toMatchObject({ kind: 'item' });
  });

  it('suppresses a duplicate Blink from a non-assigned initiator outside a chain (§5)', () => {
    const sim = setupMacroSim({
      seed: 7006,
      teamA: [
        { heroId: 'earthshaker', level: 18, items: ['blink-dagger'] },
        { heroId: 'axe', level: 18, items: ['blink-dagger'] }
      ],
      teamB: [{ heroId: 'sven', level: 18 }],
      maxSec: 30
    });
    const shakers = sim.unitsArr.filter((u) => u.team === 0 && u.kind === 'hero');
    const focus = sim.unitsArr.find((u) => u.team === 1)!;
    for (const unit of shakers) {
      installAbilities(unit, []);
      unit.pos = { x: 2000, y: 1900 + unit.uid * 80 };
      unit.lastDealtDamageAt = sim.time;
    }
    focus.pos = { x: 2850, y: 2000 };
    sim.rebuildSpatial();

    const tm = sim.teamMind(0);
    expect(tm.initiatorUid).not.toBeNull();
    const other = shakers.find((u) => u.uid !== tm.initiatorUid)!;
    expect(chooseUtilityOrder(sim, other, focus)).not.toMatchObject({ kind: 'item' });
  });

  it('pops a Crimson Guard for a clustered group under area threat (§2)', () => {
    const sim = setupMacroSim({
      seed: 7004,
      teamA: [
        { heroId: 'axe', level: 18, items: ['crimson-guard'] },
        { heroId: 'sven', level: 18 },
        { heroId: 'luna', level: 18 }
      ],
      teamB: [{ heroId: 'lich', level: 18 }, { heroId: 'lina', level: 18 }],
      maxSec: 30
    });
    const axe = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'axe')!;
    const sven = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const luna = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'luna')!;
    const e1 = sim.unitsArr.find((u) => u.team === 1 && u.heroId === 'lich')!;
    const e2 = sim.unitsArr.find((u) => u.team === 1 && u.heroId === 'lina')!;
    installAbilities(axe, []);
    axe.pos = { x: 2000, y: 2000 };
    sven.pos = { x: 2150, y: 2000 };
    luna.pos = { x: 2000, y: 2150 };
    e1.pos = { x: 2200, y: 2000 };              // two enemies inside the area-threat radius
    e2.pos = { x: 2250, y: 2050 };
    sim.rebuildSpatial();

    const slot = axe.items.findIndex((it) => it?.defId === 'crimson-guard');
    expect(chooseUtilityOrder(sim, axe, e1)).toMatchObject({ kind: 'item', invSlot: slot });
  });

  it('spends Lotus Orb to dispel a controlled ally (§2)', () => {
    const sim = setupMacroSim({
      seed: 7005,
      teamA: [
        { heroId: 'crystal-maiden', level: 18, items: ['lotus-orb'] },
        { heroId: 'sven', level: 18 }
      ],
      teamB: [{ heroId: 'axe', level: 18 }],
      maxSec: 30
    });
    const cm = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'crystal-maiden')!;
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const enemy = sim.unitsArr.find((u) => u.team === 1)!;
    installAbilities(cm, []);
    cm.pos = { x: 2000, y: 2000 };
    ally.pos = { x: 2100, y: 2000 };
    enemy.pos = { x: 2400, y: 2000 };
    ally.addStatus({ status: 'stun', tag: 'test-stun', sourceUid: enemy.uid, sourceTeam: enemy.team, until: sim.time + 2, isDebuff: true });
    ally.refresh(sim.time);
    sim.rebuildSpatial();
    expect(ally.summary.stunned).toBe(true);

    const slot = cm.items.findIndex((it) => it?.defId === 'lotus-orb');
    expect(chooseUtilityOrder(sim, cm, enemy)).toMatchObject({ kind: 'item', invSlot: slot, uid: ally.uid });
  });
});
