import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { createRaidMechanicRunner, runRaidEncounter, setupRaidSim, type RaidEncounterSetup } from '../core/macro';
import { rollLoot } from '../core/phase3';
import { applyDamage } from '../core/combat';
import { freshEchoProgress } from '../core/echo';
import { xpForLevel } from '../core/stats';
import { REG } from '../core/registry';
import { Game, newGameSave } from '../systems/game';
import { ALL_RAIDS } from '../data/raids';
import type { GambitRule, GameSave, MacroHeroSetup, RaidDef, SummonSpec } from '../core/types';

// ============================================================
// Phase 6 §3.9 / tests 13, 14, 16: raid mechanics execute in
// the sim — phase-transition zones, add waves, taunt redirect,
// the enrage timer — and Divine Rapier drops on macro death.
// ============================================================

beforeAll(() => registerAllContent());

const STRONG_PARTY: MacroHeroSetup[] = [
  { heroId: 'juggernaut', level: 30, items: ['battlefury', 'butterfly', 'black-king-bar'] },
  { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'] },
  { heroId: 'lich', level: 30, items: ['mekansm', 'glimmer-cape'] },
  { heroId: 'crystal-maiden', level: 30, items: ['glimmer-cape', 'arcane-boots'] },
  { heroId: 'sniper', level: 30, items: ['maelstrom', 'dragon-lance'] }
];

const THRALL: SummonSpec = {
  id: 'test-thrall',
  name: 'Test Thrall',
  lifetime: 60,
  stats: { maxHp: 400, damage: 10, armor: 0, moveSpeed: 320, attackRange: 120, baseAttackTime: 1.6 },
  silhouette: { build: 'biped', scale: 0.7, weapon: 'sword', head: 'horned' },
  palette: ['#b23a2a', '#33100c', '#ff9a68']
};

// A controlled raid: a tanky, soft-hitting boss so the fight lasts long enough to
// cross every HP threshold and the enrage timer, and the party never wipes.
const SCRIPTED: RaidDef = {
  id: 'test-scripted-raid',
  name: 'Scripted Proving',
  title: 'Test Title',
  location: 'Test Arena',
  unlockQuest: 'recruit-phoenix',
  dialogue: ['Scripted line.'],
  boss: { heroId: 'sven', level: 30, items: ['assault-cuirass'], hpScale: 4, damageScale: 0.25 },
  addWaves: [{ atHpPct: 90, summon: THRALL, count: 3 }],
  zones: [
    { atHpPct: 96, zone: { shape: 'circle', radius: 220, duration: 5, tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 20, target: 'target' }] } } }
  ],
  enrageSec: 3,
  loot: { guaranteed: ['ultimate-orb'], assembledPool: ['eye-of-skadi'], dropPct: { normal: 0.2, nightmare: 0.3, hell: 0.4 }, pity: 8 },
  signatureExotic: 'test-signature'
};

describe('raid-mechanics (test 13)', () => {
  it('fires phase zones, add waves, signature, and the enrage timer in the sim', () => {
    const setup: RaidEncounterSetup = { def: SCRIPTED, party: STRONG_PARTY, tier: 'normal', seed: 4242, maxSec: 90, captureEvents: true };
    const a = runRaidEncounter(setup);
    const b = runRaidEncounter({ ...setup, captureEvents: false });

    expect(a.cleared, 'the scripted raid should be winnable').toBe(true);
    expect(a.hash).toBe(b.hash); // deterministic

    const kinds = new Set(a.fired.map((f) => f.kind));
    expect(kinds.has('zone')).toBe(true);
    expect(kinds.has('add-wave')).toBe(true);
    expect(kinds.has('signature')).toBe(true);
    expect(kinds.has('enrage')).toBe(true);

    // add wave actually summoned units into the sim, and a zone spawned on the ground
    const summons = a.sim.events.history.filter((e) => e.t === 'summon');
    expect(summons.length).toBeGreaterThanOrEqual(3); // the 3-thrall add wave entered the sim
    expect(a.sim.events.history.some((e) => e.t === 'zone-spawn')).toBe(true);

    // the enrage fired on the timer, not at a fractional hp threshold
    const enrage = a.fired.find((f) => f.kind === 'enrage')!;
    expect(enrage.atSec).toBeGreaterThanOrEqual(SCRIPTED.enrageSec);
    // zone fires high, signature at the halfway mark — order reflects boss hp falling
    const zone = a.fired.find((f) => f.kind === 'zone')!;
    const sig = a.fired.find((f) => f.kind === 'signature')!;
    expect(zone.bossHpPct).toBeGreaterThan(sig.bossHpPct);
  });

  it('uses the boss/threat controller: taunt redirects the boss in the raid path', () => {
    const sim = setupRaidSim({
      seed: 99,
      party: [{ heroId: 'axe', level: 20 }, { heroId: 'sniper', level: 20 }],
      boss: { heroId: 'sven', level: 24, hpScale: 3, damageScale: 1 },
      maxSec: 30
    });
    const axe = sim.unitsArr.find((u) => u.heroId === 'axe')!;
    const sniper = sim.unitsArr.find((u) => u.heroId === 'sniper')!;
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;

    applyDamage(sim, sniper, boss, 400, 'physical', { ignoreArmor: true });
    sim.run(0.5);
    expect(boss.ctrl.focusUid).toBe(sniper.uid);

    boss.addStatus({ status: 'taunt', tag: 'axe-taunt', sourceUid: axe.uid, sourceTeam: axe.team, until: sim.time + 2, isDebuff: true });
    boss.refresh(sim.time);
    sim.run(0.5);
    expect(boss.order).toMatchObject({ kind: 'attack-unit', uid: axe.uid });
  });

  it('arms simultaneous beats but lets the boss brain start one per tick', () => {
    const gated: RaidDef = {
      ...SCRIPTED,
      id: 'test-fsm-gated-raid',
      signatureExotic: undefined,
      enrageSec: 999,
      addWaves: [{ atHpPct: 90, summon: THRALL, count: 2 }],
      zones: [{ atHpPct: 90, zone: SCRIPTED.zones[0].zone }]
    };
    const sim = setupRaidSim({
      seed: 77,
      party: [{ heroId: 'sven', level: 22 }, { heroId: 'lich', level: 22 }],
      boss: gated.boss,
      maxSec: 30
    });
    const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
    const party = sim.unitsArr.filter((u) => u.team === 0);
    party[0].pos = { x: 1000, y: 1000 };
    party[1].pos = { x: 1080, y: 1000 };
    sim.rebuildSpatial();

    boss.hp = boss.stats.maxHp * 0.8; // both HP-gated beats arm together
    const mechanics = createRaidMechanicRunner(gated, sim, boss);
    mechanics.tick(sim);
    expect(mechanics.fired).toHaveLength(1);
    mechanics.tick(sim);
    expect(mechanics.fired).toHaveLength(2);
  });
});

describe('raid-loot (test 14)', () => {
  it('every shipped raid clears in a 5v1 and rolls from its own loot table', () => {
    for (const def of ALL_RAIDS) {
      const r = runRaidEncounter({ def, party: STRONG_PARTY, tier: 'normal', seed: 1000 + def.id.length, maxSec: def.enrageSec + 30 });
      expect(r.cleared, `${def.id} should clear`).toBe(true);

      const loot = rollLoot(def.loot, 'normal', 0, 7777 + def.id.length);
      expect(loot.guaranteed.map((g) => g.id)).toEqual(def.loot.guaranteed);
      if (loot.assembled) expect(def.loot.assembledPool).toContain(loot.assembled.id);
    }
  });

  it('honors pity: the 8th straight dry clear forces an assembled drop', () => {
    const def = ALL_RAIDS[0];
    let dry = 0;
    let pityHit = false;
    for (let clear = 0; clear < 8; clear++) {
      // a seed that never rolls a natural drop, so the streak climbs to pity
      const loot = rollLoot(def.loot, 'normal', dry, 1); // dropPct 0.10 — seed 1 stays dry early
      if (loot.assembled) { pityHit = loot.pityUsed; dry = 0; } else { dry = loot.dryStreak; }
    }
    expect(pityHit).toBe(true);
  });
});

// --- shared headless-Game scaffolding (mirrors economy.test.ts) ---
const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 3 }, { k: 'fight-time-gt', sec: 2 }], then: { k: 'cast', slot: 3, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'ability-ready', slot: 1 }, { k: 'enemies-within', radius: 700, count: 1 }], then: { k: 'cast', slot: 1, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 2 }], then: { k: 'cast', slot: 2, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

const PARTY_ITEMS: { heroId: string; items: string[] }[] = [
  { heroId: 'juggernaut', items: ['black-king-bar', 'battlefury', 'butterfly'] },
  { heroId: 'sven', items: ['black-king-bar', 'assault-cuirass', 'heart-of-tarrasque'] },
  { heroId: 'sniper', items: ['dragon-lance', 'maelstrom', 'crystalys'] },
  { heroId: 'lich', items: ['scythe-of-vyse', 'glimmer-cape', 'aghanims-scepter'] },
  { heroId: 'earthshaker', items: ['blink-dagger', 'black-king-bar', 'assault-cuirass'] }
];

function rosterItems(ids: string[]): GameSave['roster'][number]['items'] {
  const slots: GameSave['roster'][number]['items'] = [null, null, null, null, null, null];
  ids.slice(0, 6).forEach((id, i) => (slots[i] = { id }));
  return slots;
}

function fullPartySave(regionId = 'tranquil-vale'): GameSave {
  const save = newGameSave(PARTY_ITEMS[0].heroId);
  save.regionId = regionId;
  save.party = PARTY_ITEMS.map((t) => t.heroId);
  save.recruited = PARTY_ITEMS.map((t) => t.heroId);
  save.roster = PARTY_ITEMS.map((t) => ({
    heroId: t.heroId,
    level: 30,
    xp: xpForLevel(30),
    items: rosterItems(t.items),
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: AGGRO,
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0]
  }));
  save.badges = [...REG.gyms.values()].map((g) => g.badgeId);
  return save;
}

describe('live raid control context', () => {
  it('starts a live raid, swaps drivers, and routes orders into the raid sim', () => {
    const g = Game.headless(fullPartySave());
    expect(g.startLiveRaid('roshan-pit', 'normal')).toBe(true);
    const raid = g.liveRaid!;
    const targetUid = raid.partyUids[1];
    const target = raid.sim.unit(targetUid)!;

    expect(g.trySwap(1)).toBe(true);
    expect(g.controlledUnit()?.uid).toBe(targetUid);

    const point = { x: target.pos.x + 160, y: target.pos.y + 20 };
    g.orderMove(point);

    expect(raid.sim.unit(targetUid)?.order).toEqual({ kind: 'move', point });
  });
});

// A dominant scripted draft for the Elite gauntlet (3 strong items each vs the
// enemy's 2), so a winning seed is found quickly and deterministically.
const SUPER: MacroHeroSetup[] = [
  { heroId: 'juggernaut', level: 30, items: ['black-king-bar', 'butterfly', 'assault-cuirass'], gambits: AGGRO },
  { heroId: 'phantom-assassin', level: 30, items: ['black-king-bar', 'butterfly', 'crystalys'], gambits: AGGRO },
  { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass', 'heart-of-tarrasque'], gambits: AGGRO },
  { heroId: 'medusa', level: 30, items: ['black-king-bar', 'butterfly', 'eye-of-skadi'], gambits: AGGRO },
  { heroId: 'lich', level: 30, items: ['scythe-of-vyse', 'glimmer-cape', 'aghanims-scepter'], gambits: AGGRO }
];

describe('roshan-aegis (test 15)', () => {
  it('reviveUnit stands a fallen unit back up with restored hp', () => {
    const sim = setupRaidSim({ seed: 5, party: [{ heroId: 'sven', level: 20 }], boss: { heroId: 'sven', level: 20, hpScale: 2, damageScale: 1 }, maxSec: 10 });
    const hero = sim.unitsArr.find((u) => u.team === 0 && u.heroId === 'sven')!;
    applyDamage(sim, null, hero, 1e9, 'physical');
    expect(hero.alive).toBe(false);
    expect(sim.reviveUnit(hero)).toBe(true);
    expect(hero.alive).toBe(true);
    expect(hero.hp).toBeGreaterThan(0);
  });

  it('a held Aegis auto-revives a fallen hero once (consumed on death)', () => {
    const doomed: RaidEncounterSetup = {
      def: { ...SCRIPTED, addWaves: [], zones: [], signatureExotic: undefined, boss: { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'], hpScale: 5, damageScale: 3 } },
      party: [{ heroId: 'crystal-maiden', level: 6, items: [] }],
      tier: 'normal',
      seed: 11,
      maxSec: 60
    };
    expect(runRaidEncounter({ ...doomed, aegis: false }).aegisConsumed).toBe(false);
    expect(runRaidEncounter({ ...doomed, aegis: true }).aegisConsumed).toBe(true);
  });

  it('Roshan yields the Aegis, respawns on a timer, and repeat kills add Refresher Shard + Cheese', () => {
    const g = Game.headless(fullPartySave());

    const first = g.runRaid('roshan-pit', 'normal');
    expect(first.won).toBe(true);
    expect(g.aegisReady()).toBe(true); // the held one-use charge
    const respawnAt = g.raidProgress['roshan-pit'].roshanRespawnAt!;
    expect(respawnAt).toBeGreaterThan(g.playtime);

    // dead Roshan can't be re-pulled until the timer elapses
    expect(g.runRaid('roshan-pit', 'normal').won).toBe(false);

    g.playtime = respawnAt + 1;
    const second = g.runRaid('roshan-pit', 'normal');
    expect(second.won).toBe(true);
    const ground = g.groundItemDrops.map((drop) => drop.item.id);
    expect(ground).toContain('refresher-shard');
    expect(ground).toContain('cheese');
  });
});

describe('elite-gauntlet-winnable (test 17)', () => {
  it('a scripted draft clears all five Elite members and the Champion', () => {
    const g = Game.headless(fullPartySave());
    for (let member = 0; member < g.eliteMembers().length; member++) {
      let won = false;
      for (let s = 1; s <= 80 && !won; s++) won = g.runEliteMatch({ seed: s * 17 + member, playerTeam: SUPER }).won;
      expect(won, `Elite member ${member} should be beatable`).toBe(true);
      expect(g.eliteFive.defeated).toBe(member + 1);
    }
    let champ = false;
    for (let s = 1; s <= 80 && !champ; s++) champ = g.runChampion({ seed: s * 31, playerTeam: SUPER }).won;
    expect(champ).toBe(true);
    expect(g.eliteFive.championDown).toBe(true);
  });

  it('a mid-gauntlet loss restarts from that member, never a lockout', () => {
    const g = Game.headless(fullPartySave());
    g.eliteFive.defeated = 2;
    const weak: MacroHeroSetup[] = [{ heroId: 'crystal-maiden', level: 1, items: [] }];
    const r = g.runEliteMatch({ seed: 3, playerTeam: weak });
    expect(r.won).toBe(false);
    expect(g.eliteFive.defeated).toBe(2);   // unchanged — re-challenge member 2
    expect(g.eliteNextIndex()).toBe(2);     // not reset to 0, not advanced
  });

  it('the Champion is gated behind clearing all five', () => {
    const g = Game.headless(fullPartySave());
    g.eliteFive.defeated = 3;
    const r = g.runChampion({ seed: 1, playerTeam: SUPER });
    expect(r.won).toBe(false);
    expect(g.eliteFive.championDown).toBe(false);
    expect(g.toasts.at(-1)!.text.toLowerCase()).toContain('five');
  });
});

describe('faction-exclusivity-live (test 18)', () => {
  it('siding with Kunkka in Shadeshore recruitment locks Tidehunter through the real path', () => {
    const g = Game.headless(fullPartySave('shadeshore'));

    const npcs = (g as unknown as { npcHeroes: Map<number, string> }).npcHeroes;
    const kunkkaUid = [...npcs.entries()].find(([, id]) => id === 'kunkka')?.[0];
    const tideUid = [...npcs.entries()].find(([, id]) => id === 'tidehunter')?.[0];
    expect(kunkkaUid).toBeDefined();
    expect(tideUid).toBeDefined();

    // bring Kunkka's quest to the trial-ready stage, stand on him, and start the trial
    const questId = REG.hero('kunkka').recruitmentQuestId!;
    const needed = REG.quest(questId).findShardsNeeded!;
    g.questProgress[questId] = { stage: 'found', attunement: needed, trialCompletions: 0 };
    const kunkkaNpc = g.sim.unit(kunkkaUid!)!;
    g.activeUnit()!.pos = { x: kunkkaNpc.pos.x + 80, y: kunkkaNpc.pos.y };

    g.tryRecruit(kunkkaUid!);
    expect(g.activeTrial?.kind).toBe('faction-choice');

    // side with Kunkka through the real choice path
    g.resolveTrialChoice('kunkka');
    expect(g.factionChoices['shadeshore']).toBe('kunkka');
    expect(g.factionLockedHero('tidehunter')).toBe(true);
    expect(g.factionLockedHero('kunkka')).toBe(false);

    // the real recruitment path now refuses Tidehunter
    const tideNpc = g.sim.unit(tideUid!)!;
    g.activeUnit()!.pos = { x: tideNpc.pos.x + 80, y: tideNpc.pos.y };
    g.tryRecruit(tideUid!);
    expect(g.recruited.has('tidehunter')).toBe(false);
    expect(g.toasts.at(-1)!.text.toLowerCase()).toContain('sided against');
  });
});

describe('rapier-on-death (test 16)', () => {
  it('a hero holding Divine Rapier who dies drops it to the enemy team for the round', () => {
    // A doomed solo carry holding a Rapier against an overwhelming boss.
    const r = runRaidEncounter({
      def: {
        ...SCRIPTED,
        addWaves: [],
        zones: [],
        signatureExotic: undefined,
        enrageSec: 1,
        boss: { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass', 'divine-rapier'], hpScale: 6, damageScale: 3 }
      },
      party: [{ heroId: 'crystal-maiden', level: 6, items: ['divine-rapier'] }],
      tier: 'normal',
      seed: 7,
      maxSec: 60
    });

    expect(r.winner).toBe(1); // the squishy carry falls
    expect(r.rapierDrops.length).toBeGreaterThanOrEqual(1);
    const drop = r.rapierDrops.find((d) => d.itemId === 'divine-rapier')!;
    expect(drop.toUid).toBeGreaterThan(0); // claimed by a living enemy

    const fallen = r.sim.unit(drop.fromUid)!;
    expect(fallen.items.some((s) => s?.defId === 'divine-rapier')).toBe(false); // dropped
    const taker = r.sim.unit(drop.toUid)!;
    expect(taker.team).not.toBe(fallen.team);
    expect(taker.items.some((s) => s?.defId === 'divine-rapier')).toBe(true); // claimed
  });
});
