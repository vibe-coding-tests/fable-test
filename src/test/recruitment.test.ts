import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { QUEST_HERO_IDS } from '../data/quests';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { applyDamage } from '../core/combat';
import { spawnHeroEchoUnit } from '../core/echo-unit';
import { TrialRunner, trialGateOpen, type TrialGateCtx } from '../core/trials';
import { buildDefaultGambit } from '../core/controllers';
import { autoPicksForLevel, buildHero } from '../core/hero-setup';
import { makeItemState } from '../core/items';
import { recruitLevelCap } from '../core/progression';
import { xpForLevel } from '../core/stats';
import { TUNING } from '../data/tuning';
import { Game, newGameSave } from '../systems/game';
import type { SimEvent } from '../core/types';

beforeAll(() => registerAllContent());

function arena(seed = 1): Sim {
  const sim = new Sim({ seed, bounds: { w: 16000, h: 16000 } });
  sim.events.captureAll = true;
  return sim;
}

function spawnPlayer(sim: Sim, heroId = 'juggernaut', pos = { x: 5900, y: 6800 }, level = 20) {
  return sim.spawnHero(REG.hero(heroId), { team: 0, pos, level, ctrl: { kind: 'player' } });
}

const OPEN_CTX: TrialGateCtx = { reputation: 0, recruitedTotal: 0, raidClears: 0 };

function makeRunner(sim: Sim, trialId: string, playerUid: number, gateCtx: TrialGateCtx = OPEN_CTX): TrialRunner {
  return new TrialRunner(sim, playerUid, REG.trial(trialId), { level: 18, gateCtx });
}

function feed(sim: Sim, runner: TrialRunner): void {
  for (const ev of sim.events.drain()) runner.observe(ev);
}

// ----------------------------------------------------------------
// Test 1: echo fidelity (Phase 2 §3.2)
// ----------------------------------------------------------------
describe('echo fidelity', () => {
  it('runs the gambit controller, carries the HP tax + no items + echo flag, and dies to the reward path', () => {
    const sim = arena();
    const ref = spawnHeroEchoUnit(sim, { heroId: 'lich', team: 1, pos: { x: 5000, y: 5000 }, level: 15, hpTaxPct: 0, echoFlag: false });
    const echo = spawnHeroEchoUnit(sim, { heroId: 'lich', team: 1, pos: { x: 5300, y: 5000 }, level: 15 });

    expect(echo.ctrl.kind).toBe('gambit');
    expect(echo.ctrl.rules && echo.ctrl.rules.length).toBeGreaterThan(0);
    expect(echo.isEcho).toBe(true);
    expect(echo.items.every((i) => i === null)).toBe(true);
    // ×0.6 survivability tax against an untaxed reference build
    expect(echo.stats.maxHp / ref.stats.maxHp).toBeCloseTo(0.6, 2);

    const player = spawnPlayer(sim, 'juggernaut', { x: 5350, y: 5000 }, 30);
    applyDamage(sim, player, echo, 1e9, 'physical');
    expect(echo.alive).toBe(false);
    expect(sim.events.history.some((e) => e.t === 'kill-credit' && e.victimUid === echo.uid)).toBe(true);
  });
});

// ----------------------------------------------------------------
// Test 2: echo kills advance the shard-gated Find (Phase 2 §3.1)
// ----------------------------------------------------------------
describe('echo-advances-find', () => {
  it('banks shards on echo death and only reveals the trial marker at the threshold', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const heroId = 'sven';
    const questId = REG.hero(heroId).recruitmentQuestId!;
    const needed = REG.quest(questId).findShardsNeeded ?? TUNING.findShardsNeeded;

    // kill the live Sven echo through the real loop -> +1 shard, still a rumor
    const echoes = (g as unknown as { echoHeroes: Map<number, string> }).echoHeroes;
    const echoUid = [...echoes.entries()].find(([, sid]) => sid === 'tv-echo-sven')?.[0];
    expect(echoUid).toBeDefined();
    applyDamage(g.sim, null, g.sim.unit(echoUid!)!, 1e9, 'physical');
    g.update(0.05);
    expect(g.questProgress[questId].attunement).toBe(1);
    expect(g.questProgress[questId].stage).toBe('unfound'); // 1 < needed -> still hidden

    // earn the remaining shards -> the marker reveals
    const advance = (g as unknown as { advanceAttunement(id: string): void }).advanceAttunement.bind(g);
    for (let i = 1; i < needed; i++) advance(heroId);
    expect(g.questProgress[questId].attunement).toBeGreaterThanOrEqual(needed);
    expect(g.questProgress[questId].stage).toBe('found');
  });
});

// ----------------------------------------------------------------
// Test 3: every trial runner reaches complete (success) and fail (failure)
// ----------------------------------------------------------------
const VFX = { archetype: 'shield', color: '#ffffff' };
function castEvent(uid: number, abilityId: string): SimEvent {
  return { t: 'cast', uid, abilityId, vfx: VFX } as unknown as SimEvent;
}

const MECHANIC_SAMPLES: { trial: string; mechanic: string }[] = [
  { trial: 'trial-earthshaker', mechanic: 'duel' },
  { trial: 'trial-crystal-maiden', mechanic: 'duel' },
  { trial: 'trial-axe', mechanic: 'cull' },
  { trial: 'trial-sniper', mechanic: 'hit' },
  { trial: 'trial-invoker', mechanic: 'combo' },
  { trial: 'trial-phantom-assassin', mechanic: 'assassinate' },
  { trial: 'trial-chen', mechanic: 'convert' },
  { trial: 'trial-sven', mechanic: 'fetch' },
  { trial: 'trial-night-stalker', mechanic: 'endure' },
  { trial: 'trial-riki', mechanic: 'endure' },
  { trial: 'trial-kunkka', mechanic: 'choice' },
  { trial: 'trial-shadow-fiend', mechanic: 'choice' },
  { trial: 'trial-elder-titan', mechanic: 'choice' },
  { trial: 'trial-phoenix', mechanic: 'gated' },
  { trial: 'trial-io', mechanic: 'gated' }
];

function driveSuccess(sim: Sim, runner: TrialRunner, player: { uid: number; pos: { x: number; y: number } }): void {
  const m = runner.mechanic;
  if (m === 'duel' || m === 'cull' || m === 'assassinate') {
    for (const uid of [...runner.spawnedUids]) {
      const u = sim.unit(uid);
      if (u) applyDamage(sim, sim.unit(player.uid)!, u, 1e9, 'physical');
    }
    feed(sim, runner);
  } else if (m === 'hit') {
    for (let i = 0; i < 4; i++) runner.observe({ t: 'damage', uid: runner.spawnedUids[0], from: player.uid, amount: 1, dtype: 'physical' } as SimEvent);
  } else if (m === 'combo') {
    for (const ab of ['quas', 'wex', 'exort']) runner.observe(castEvent(player.uid, ab));
  } else if (m === 'convert') {
    for (let i = 0; i < 2; i++) runner.observe({ t: 'capture-complete', target: runner.spawnedUids[i], creepId: 'x' } as SimEvent);
  } else if (m === 'fetch') {
    const u = sim.unit(player.uid)!;
    u.pos = { ...runner.marker };
  } else if (m === 'choice') {
    if (runner.kind === 'faction-choice') runner.choose('kunkka');
    else if (runner.kind === 'souls-pact') runner.choose('honor');
    else runner.choose(String(runner.trial.params?.answer ?? 'origin'));
  }
  // endure + gated resolve purely on tick
}

describe('trial-completion', () => {
  for (const { trial } of MECHANIC_SAMPLES) {
    it(`${trial} reaches complete on scripted success`, () => {
      const sim = arena(trial.length * 7);
      const player = spawnPlayer(sim);
      const gate: TrialGateCtx = { reputation: 0, recruitedTotal: 999, raidClears: 9 }; // open gated trials
      const runner = makeRunner(sim, trial, player.uid, gate);
      driveSuccess(sim, runner, player);
      const now = runner.mechanic === 'endure' ? sim.time + 9999 : sim.time;
      expect(runner.tick(now)).toBe('complete');
    });

    it(`${trial} reaches fail on scripted failure`, () => {
      const sim = arena(trial.length * 13 + 1);
      const player = spawnPlayer(sim);
      const closed: TrialGateCtx = { reputation: 0, recruitedTotal: 0, raidClears: 0 }; // gated trials shut
      const runner = makeRunner(sim, trial, player.uid, closed);
      if (runner.mechanic === 'endure') {
        runner.observe({ t: 'death', uid: player.uid, killer: -1 } as SimEvent);
        expect(runner.tick(sim.time)).toBe('fail');
      } else if (runner.kind === 'lore-riddle') {
        runner.choose('definitely-wrong');
        expect(runner.tick(sim.time)).toBe('fail');
      } else {
        // duel/cull/hit/combo/assassinate/convert/fetch/faction-choice/souls-pact: run out the clock; gated: shut gate
        expect(runner.tick(sim.time + 100000)).toBe('fail');
      }
    });
  }
});

// ----------------------------------------------------------------
// Test 3b: a failed trial relocates and resets shards to the floor, never locks out
// ----------------------------------------------------------------
describe('trial relocation', () => {
  it('drops shards to the floor and moves the marker on failure', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const heroId = 'axe';
    const questId = REG.hero(heroId).recruitmentQuestId!;
    const needed = REG.quest(questId).findShardsNeeded ?? TUNING.findShardsNeeded;
    // pretend the marker is found
    g.questProgress[questId] = { stage: 'found', attunement: needed, trialCompletions: 0 };

    const npcs = (g as unknown as { npcHeroes: Map<number, string> }).npcHeroes;
    const npcUid = [...npcs.entries()].find(([, id]) => id === heroId)?.[0];
    expect(npcUid).toBeDefined();
    const npc = g.sim.unit(npcUid!)!;
    const startPos = { ...npc.pos };

    // stand next to the recruit and start the trial
    const player = g.activeUnit()!;
    player.pos = { x: npc.pos.x + 80, y: npc.pos.y };
    g.tryRecruit(npcUid!);
    expect(g.activeTrial).not.toBeNull();

    // fail the trial: the attempting hero falls
    applyDamage(g.sim, null, player, 1e9, 'physical');
    g.update(0.05);

    expect(g.activeTrial).toBeNull();
    const floor = TUNING.relocationShardFloor;
    expect(g.questProgress[questId].attunement).toBe(Math.min(floor, needed));
    expect(g.questProgress[questId].stage).toBe('unfound'); // a rumor again, never locked
    const moved = g.sim.unit(npcUid!)!;
    expect(moved.pos.x !== startPos.x || moved.pos.y !== startPos.y).toBe(true);
  });
});

// ----------------------------------------------------------------
// Test 4: the Bind 1v1 runs to a result for every recruit chain
// ----------------------------------------------------------------
function runBindDuel(recruitHeroId: string): { ended: boolean; playerWon: boolean } {
  const sim = new Sim({ seed: 100 + recruitHeroId.length, bounds: { w: 6000, h: 6000 } });
  const pBuild = buildHero(REG.hero('juggernaut'), autoPicksForLevel(30), 0);
  const player = sim.spawnHero(pBuild.def, {
    team: 0,
    pos: { x: 2800, y: 3000 },
    level: 30,
    ctrl: { kind: 'gambit', rules: buildDefaultGambit(pBuild.def.roles), homePos: { x: 2800, y: 3000 } }
  });
  for (const k in pBuild.externalMods) player.externalMods[k] = (player.externalMods[k] ?? 0) + pBuild.externalMods[k];
  for (const id of ['butterfly', 'assault-cuirass', 'black-king-bar']) {
    const slot = player.items.findIndex((x) => x === null);
    if (slot >= 0) player.items[slot] = makeItemState(REG.item(id));
  }
  player.markStatsDirty();
  player.refresh(0);
  player.hp = player.stats.maxHp;
  player.mana = player.stats.maxMana;

  const echo = spawnHeroEchoUnit(sim, { heroId: recruitHeroId, team: 1, pos: { x: 3300, y: 3000 }, level: 8, gambit: true });

  const maxTicks = Math.round(50 / sim.dt);
  let ended = false;
  for (let i = 0; i < maxTicks; i++) {
    sim.tick();
    if (!echo.alive || !player.alive) {
      ended = true;
      break;
    }
  }
  return { ended, playerWon: !echo.alive };
}

describe('bind-duel-runs', () => {
  it('every recruit chain in the roster resolves a binding duel', () => {
    const slow: string[] = [];
    for (const heroId of QUEST_HERO_IDS) {
      const r = runBindDuel(heroId);
      if (!r.ended || !r.playerWon) slow.push(heroId);
    }
    expect(slow).toEqual([]);
  });
});

// ----------------------------------------------------------------
// Test 5: reputation gates both ways; the Souls Pact lowers karma
// ----------------------------------------------------------------
describe('reputation-gate', () => {
  it('a good-karma gate opens above threshold and stays shut below it', () => {
    const omni = REG.trial('trial-omniknight');
    expect(omni.reputationGate).toBe(TUNING.reputationGoodGate);
    expect(trialGateOpen(omni, { reputation: TUNING.reputationGoodGate - 1, recruitedTotal: 0, raidClears: 0 }).open).toBe(false);
    expect(trialGateOpen(omni, { reputation: TUNING.reputationGoodGate, recruitedTotal: 0, raidClears: 0 }).open).toBe(true);
  });

  it('the Souls Pact greed path lowers karma', () => {
    const sim = arena();
    const player = spawnPlayer(sim);
    const runner = makeRunner(sim, 'trial-shadow-fiend', player.uid);
    expect(runner.kind).toBe('souls-pact');
    runner.choose('greed');
    expect(runner.karmaDelta).toBe(-TUNING.reputationSoulsPactDrop);
    expect(runner.tick(sim.time)).toBe('complete');
  });
});

// ----------------------------------------------------------------
// Test 8: recruit level ceiling by badge count; XP banks past the cap
// ----------------------------------------------------------------
describe('recruit-ceiling', () => {
  it('the cap is [15,22,30...] by badge count', () => {
    expect(recruitLevelCap(0)).toBe(15);
    expect(recruitLevelCap(1)).toBe(22);
    expect(recruitLevelCap(2)).toBe(30);
    expect(recruitLevelCap(5)).toBe(30);
  });

  it('XP past the ceiling banks and only converts post-cap', () => {
    const sim = arena();
    const h = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 100, y: 100 }, level: 1, ctrl: { kind: 'none' } });
    h.addXp(xpForLevel(30) * 2, 15); // far past the ceiling
    expect(h.level).toBe(15);                          // clamped by the badge ceiling
    expect(h.xp).toBeGreaterThan(xpForLevel(15));      // banked, not lost
    h.addXp(0, 30);                                    // a new badge raises the ceiling
    expect(h.level).toBe(30);                          // banked XP catches up
  });
});

// ----------------------------------------------------------------
// TV -> Nightsilver requires the first recruit (Phase 2 §3.4)
// ----------------------------------------------------------------
describe('TV->Nightsilver recruit gate', () => {
  it('is blocked with only the starter and clears after a recruit', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const gate = g.region.gates!.find((x) => x.id === 'tv-to-nw')!;
    expect(gate.requiresRecruits).toBe(1);

    // stand on the gate with only the starter recruited
    g.activeUnit()!.pos = { ...gate.pos };
    expect(g.recruitedCount()).toBe(0);
    expect(g.tryTravel()).toBe(false);
    expect(g.toasts.at(-1)!.text.toLowerCase()).toContain('recruit');

    // recruiting a second hero satisfies the gate condition
    g.recruited.add('sven');
    expect(g.recruitedCount()).toBe(1);
    expect(g.recruitedCount()).toBeGreaterThanOrEqual(gate.requiresRecruits!);
  });
});
