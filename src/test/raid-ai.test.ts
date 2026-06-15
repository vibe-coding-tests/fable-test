import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { runRaidEncounter, setupRaidSim } from '../core/macro';
import { LiveRaid } from '../systems/raid-session';
import { raidSetupFromDef } from '../core/phase3';
import { chooseUtilityOrder, enemyBossEnraged, raidPeelTarget } from '../core/utility';
import { planUnitCombo } from '../core/combo-planner';
import { combatProfile } from '../core/combat-profile';
import { ALL_RAIDS } from '../data/raids';
import { TUNING } from '../data/tuning';
import type { EffectCtx } from '../core/effects';
import type { MacroHeroSetup, SummonSpec } from '../core/types';
import type { Unit } from '../core/unit';

// ============================================================
// AI_OVERHAUL A6: raid-aware ally considerations (peel adds, burn the
// enrage), the AI-depth difficulty lever, and live == headless on a
// fixed seed.
// ============================================================

beforeAll(() => registerAllContent());

const ADD: SummonSpec = {
  id: 'test-add',
  name: 'Add',
  lifetime: 60,
  stats: { maxHp: 300, damage: 20, armor: 0, moveSpeed: 320, attackRange: 120, baseAttackTime: 1.6 },
  silhouette: { build: 'biped', scale: 0.6, weapon: 'sword', head: 'horned' },
  palette: ['#b23a2a', '#33100c', '#ff9a68']
};
const CTX: EffectCtx = { defId: 'test', level: 1, vfx: { archetype: 'ground-aoe', color: '#ff7a3a', color2: '#ffd27a' } };

const PARTY: MacroHeroSetup[] = [
  { heroId: 'juggernaut', level: 30, items: ['battlefury', 'butterfly'] },
  { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'] },
  { heroId: 'lich', level: 30, items: ['mekansm', 'glimmer-cape'] },
  { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'arcane-boots'] },
  { heroId: 'sniper', level: 30, items: ['maelstrom', 'dragon-lance'] }
];

function raid(party: string[]) {
  const sim = setupRaidSim({
    seed: 61,
    party: party.map((heroId) => ({ heroId, level: 22 })),
    boss: { heroId: 'sven', level: 26, hpScale: 4, damageScale: 1 },
    maxSec: 60
  });
  const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
  const get = (heroId: string) => sim.unitsArr.find((u) => u.team === 0 && u.heroId === heroId)!;
  return { sim, boss, get };
}

describe('raid-aware considerations', () => {
  it('a frontliner peels an add off the backline', () => {
    const { sim, boss, get } = raid(['sven', 'crystal-maiden']);
    const sven = get('sven');       // frontline
    const cm = get('crystal-maiden'); // backline
    sven.pos = { x: boss.pos.x - 200, y: boss.pos.y };
    cm.pos = { x: boss.pos.x - 700, y: boss.pos.y };
    const add = sim.spawnSummon(ADD, boss, { x: cm.pos.x + 110, y: cm.pos.y }, CTX);
    sim.rebuildSpatial();

    expect(combatProfile(sven).posture).toBe('frontline');
    const peel = raidPeelTarget(sim, sven, combatProfile(sven));
    expect(peel?.uid).toBe(add.uid);

    // a backliner does not peel
    expect(raidPeelTarget(sim, cm, combatProfile(cm))).toBeNull();
  });

  it('no peel without a boss present (not a raid)', () => {
    const sim = setupRaidSim({
      seed: 9, party: [{ heroId: 'sven', level: 22 }], boss: { heroId: 'sven', level: 24 }, maxSec: 30
    });
    const sven = sim.unitsArr.find((u) => u.team === 0)!;
    const fakeBoss = sim.unitsArr.find((u) => u.team === 1)!;
    fakeBoss.ctrl = { kind: 'gambit' }; // strip the boss controller
    sim.rebuildSpatial();
    expect(raidPeelTarget(sim, sven, combatProfile(sven))).toBeNull();
  });

  it('burns the enrage: a ranged carry stops kiting once the boss is enraged', () => {
    const { sim, boss, get } = raid(['sniper', 'crystal-maiden']);
    const sniper = get('sniper');
    // isolate the spacing fallback: no abilities to score
    sniper.abilities.forEach((a) => (a.level = 0));
    sniper.pos = { x: 2000, y: 2000 };
    boss.pos = { x: 2200, y: 2000 }; // crowding the kiter
    sim.rebuildSpatial();
    expect(combatProfile(sniper).kiteDistance).toBeGreaterThan(0);

    boss.ctrl.boss!.phase = 'sustained';
    expect(enemyBossEnraged(sim, sniper)).toBe(false);
    expect(chooseUtilityOrder(sim, sniper, boss)?.kind).toBe('move'); // kites

    boss.ctrl.boss!.phase = 'enrage';
    expect(enemyBossEnraged(sim, sniper)).toBe(true);
    expect(chooseUtilityOrder(sim, sniper, boss)?.kind).toBe('attack-unit'); // burns
  });

  it('stacks the heal: a support meks when the party is wounded', () => {
    const sim = setupRaidSim({
      seed: 61,
      party: [
        { heroId: 'lich', level: 22, items: ['mekansm'] },
        { heroId: 'juggernaut', level: 22 },
        { heroId: 'sven', level: 22 }
      ],
      boss: { heroId: 'sven', level: 26, hpScale: 4, damageScale: 1 },
      maxSec: 60
    });
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    const lich = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lich')!;
    const j = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'juggernaut')!;
    const s = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    lich.pos = { x: 2000, y: 2000 };
    j.pos = { x: 2120, y: 2000 };
    s.pos = { x: 2000, y: 2120 };
    boss.pos = { x: 5000, y: 1500 };
    j.hp = j.stats.maxHp * 0.55;
    s.hp = s.stats.maxHp * 0.55;
    sim.rebuildSpatial();
    const order = chooseUtilityOrder(sim, lich, boss);
    expect(order?.kind).toBe('item');
    if (order?.kind === 'item') expect(lich.items[order.invSlot]?.defId).toBe('mekansm');
  });

  it('wounded allies stack toward a ready Mek carrier', () => {
    const sim = setupRaidSim({
      seed: 62,
      party: [
        { heroId: 'lich', level: 22, items: ['mekansm'] },
        { heroId: 'sven', level: 22 },
        { heroId: 'juggernaut', level: 22 }
      ],
      boss: { heroId: 'sven', level: 26, hpScale: 4, damageScale: 1 },
      maxSec: 60
    });
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    const lich = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lich')!;
    const sven = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const jugg = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'juggernaut')!;
    lich.pos = { x: 2000, y: 2000 };
    sven.pos = { x: 900, y: 2000 };
    jugg.pos = { x: 2100, y: 2080 };
    boss.pos = { x: 3600, y: 2000 };
    sven.hp = sven.stats.maxHp * 0.55;
    jugg.hp = jugg.stats.maxHp * 0.55;
    sim.rebuildSpatial();

    const order = chooseUtilityOrder(sim, sven, boss);
    expect(order?.kind).toBe('move');
    if (order?.kind === 'move') expect(order.point).toEqual(lich.pos);
  });

  it('wounded allies prefer a nearby friendly field aura', () => {
    const sim = setupRaidSim({
      seed: 63,
      party: [
        { heroId: 'lich', level: 22, items: ['vladmirs-offering'] },
        { heroId: 'sven', level: 22 }
      ],
      boss: { heroId: 'sven', level: 26, hpScale: 4, damageScale: 1 },
      maxSec: 60
    });
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    const lich = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'lich')!;
    const sven = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    sven.abilities.forEach((a) => (a.level = 0));
    lich.pos = { x: 2000, y: 2000 };
    sven.pos = { x: 700, y: 2000 };
    boss.pos = { x: 3600, y: 2000 };
    sven.hp = sven.stats.maxHp * 0.55;
    sim.rebuildSpatial();

    const order = chooseUtilityOrder(sim, sven, boss);
    expect(order?.kind).toBe('move');
    if (order?.kind === 'move') expect(order.point).toEqual(lich.pos);
  });

  it('field carriers close to keep hostile aura pressure on the focus', () => {
    const sim = setupRaidSim({
      seed: 64,
      party: [{ heroId: 'sven', level: 22, items: ['radiance'] }],
      boss: { heroId: 'lich', level: 26, hpScale: 4, damageScale: 1 },
      maxSec: 60
    });
    const sven = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    sven.abilities.forEach((a) => (a.level = 0));
    sven.pos = { x: 2000, y: 2000 };
    boss.pos = { x: 3000, y: 2000 };
    sim.rebuildSpatial();

    const order = chooseUtilityOrder(sim, sven, boss);
    expect(order?.kind).toBe('move');
    if (order?.kind === 'move') expect(order.point.x).toBeGreaterThan(sven.pos.x);
  });

  it('scatters from a raid signature-sized zone before tunneling the boss', () => {
    const { sim, boss, get } = raid(['sniper', 'crystal-maiden']);
    const sniper = get('sniper');
    const center = { x: 2000, y: 2000 };
    sniper.pos = { x: center.x + 120, y: center.y };
    boss.pos = { x: 3600, y: 2000 };
    sim.addZone({
      caster: boss,
      ctx: CTX,
      spec: { shape: 'circle', duration: 6, radius: 460, tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 80, target: 'target' }] } },
      duration: 6,
      pos: center,
      radius: 460
    });
    sim.rebuildSpatial();

    const before = Math.hypot(sniper.pos.x - center.x, sniper.pos.y - center.y);
    const order = chooseUtilityOrder(sim, sniper, boss);
    expect(order?.kind).toBe('move');
    if (order?.kind === 'move') {
      const after = Math.hypot(order.point.x - center.x, order.point.y - center.y);
      expect(after).toBeGreaterThan(before);
    }
  });

  it('raid ai-depth tightens combo chains from two steps to three', () => {
    const build = (aiDepth: number) => {
      const sim = setupRaidSim({
        seed: 66,
        party: [{ heroId: 'zeus', level: 24, items: ['rod-of-atos', 'veil-of-discord', 'dagon'] }],
        boss: { heroId: 'sven', level: 26, hpScale: 4, damageScale: 1, aiDepth },
        maxSec: 60
      });
      const zeus = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'zeus')!;
      const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
      zeus.abilities.forEach((a) => (a.level = 0));
      zeus.pos = { x: 2000, y: 2000 };
      boss.pos = { x: 2350, y: 2000 };
      zeus.mana = zeus.stats.maxMana;
      sim.rebuildSpatial();
      return planUnitCombo(sim, zeus, boss);
    };

    expect(build(TUNING.bossTierAiDepth.normal)?.steps.map((s) => s.role)).toEqual(['amplifier', 'payoff']);
    expect(build(TUNING.bossTierAiDepth.hell)?.steps.map((s) => s.role)).toEqual(['enabler', 'amplifier', 'payoff']);
  });
});

describe('AI-depth difficulty lever', () => {
  it('dials boss aiDepth up by tier, beside the stat scaling', () => {
    const def = ALL_RAIDS[0];
    const normal = raidSetupFromDef(def, PARTY, 'normal', 1).boss;
    const nightmare = raidSetupFromDef(def, PARTY, 'nightmare', 1).boss;
    const hell = raidSetupFromDef(def, PARTY, 'hell', 1).boss;

    expect(normal.aiDepth).toBe(TUNING.bossTierAiDepth.normal);
    expect(nightmare.aiDepth).toBe(TUNING.bossTierAiDepth.nightmare);
    expect(hell.aiDepth).toBe(TUNING.bossTierAiDepth.hell);
    expect(normal.aiDepth).toBeLessThan(nightmare.aiDepth!);
    expect(nightmare.aiDepth).toBeLessThan(hell.aiDepth!);

    // the lever is independent of stat scaling, which also rises
    expect(hell.hpScale).toBeGreaterThan(normal.hpScale);
    expect(hell.armorScale).toBeGreaterThan(normal.armorScale);

    // and it reaches the live sim's boss controller
    const normalSim = setupRaidSim({ seed: 1, party: PARTY, boss: normal, maxSec: 30 });
    const normalBoss = normalSim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    const sim = setupRaidSim({ seed: 1, party: PARTY, boss: hell, maxSec: 30 });
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    expect(boss.ctrl.boss?.depth).toBe(TUNING.bossTierAiDepth.hell);
    expect(boss.stats.armor).toBeGreaterThan(normalBoss.stats.armor);
    const ally = sim.unitsArr.find((u) => u.team === 0 && u.kind === 'hero')!;
    expect(ally.ctrl.aiDepth).toBe(TUNING.bossTierAiDepth.hell);
  });
});

describe('live raid == headless encounter', () => {
  it('agrees with the headless encounter on a fixed seed', () => {
    const def = ALL_RAIDS[0];
    const seed = 24680;
    const headless = runRaidEncounter({ def, party: PARTY, tier: 'normal', seed });

    const live = new LiveRaid(def, PARTY, 'normal', seed);
    let guard = 0;
    while (!live.done && guard++ < live.maxTicks + 5) live.step(1 / 30);

    expect(live.result).not.toBeNull();
    expect(live.result!.winner).toBe(headless.winner);
    expect(live.result!.ticks).toBe(headless.ticks);
    expect(live.result!.hash).toBe(headless.hash);
  });

  it('claims manual control only after player input, then restores swapped heroes to AI', () => {
    const live = new LiveRaid(ALL_RAIDS[0], PARTY, 'normal', 13579);
    const first = live.drivenUnit()!;
    expect(first.ctrl.kind).toBe('gambit');

    expect(live.claimDriver()?.uid).toBe(first.uid);
    expect(first.ctrl.kind).toBe('player');

    expect(live.selectDriver(1)).toBe(true);
    const second = live.drivenUnit()!;
    expect(first.ctrl.kind).toBe('gambit');
    expect(second.ctrl.kind).toBe('player');
  });
});
