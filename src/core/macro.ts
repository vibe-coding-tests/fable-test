import { TUNING } from '../data/tuning';
import { REG } from './registry';
import { Sim } from './sim';
import { buildDefaultGambit } from './controllers';
import { autoPicksForLevel, buildHero } from './hero-setup';
import { makeItemState } from './items';
import type { MacroHeroSetup, RaidBossSetup } from './types';
import type { Unit } from './unit';

// ------------------------------------------------------------------
// Macro layer (SPEC §7): 5v5 on a small arena, auto-resolving on the
// shared core. Headless-runnable to completion inside a test.
// ------------------------------------------------------------------

export interface MacroSetup {
  seed: number;
  teamA: MacroHeroSetup[];
  teamB: MacroHeroSetup[];
  maxSec?: number;
}

export interface RaidSetup {
  seed: number;
  party: MacroHeroSetup[];
  boss: RaidBossSetup;
  maxSec?: number;
}

export interface MacroResult {
  winner: 0 | 1 | -1;
  timeSec: number;
  ticks: number;
  survivors: { heroId: string; team: number; hpPct: number }[];
  hash: string;
  sim: Sim;
}

export function setupMacroSim(setup: MacroSetup): Sim {
  const sim = new Sim({
    seed: setup.seed,
    bounds: { w: TUNING.arenaWidth, h: TUNING.arenaHeight }
  });
  const placeTeam = (team: 0 | 1, list: MacroHeroSetup[]) => {
    const dir = team === 0 ? 1 : -1;
    const baseX = team === 0 ? TUNING.macroTeamXInset : TUNING.arenaWidth - TUNING.macroTeamXInset;
    const spacing = Math.min(420, TUNING.arenaHeight / (list.length + 1));
    const centerY = TUNING.arenaHeight / 2;
    list.forEach((h, i) => {
      const level = h.level ?? 10;
      const build = buildHero(REG.hero(h.heroId), autoPicksForLevel(level), 0);
      const homePos = {
        x: baseX + dir * formationDepth(build.def.roles, build.def.baseStats.attackRange),
        y: centerY + (i - (list.length - 1) / 2) * spacing
      };
      const u = spawnConfiguredHero(sim, h, team, homePos, {
        kind: 'gambit',
        rules: h.gambits ?? buildDefaultGambit(build.def.roles),
        homePos
      }, level, build);
      u.facing = team === 0 ? 0 : Math.PI;
    });
  };
  placeTeam(0, setup.teamA);
  placeTeam(1, setup.teamB);
  return sim;
}

export function setupRaidSim(setup: RaidSetup): Sim {
  const sim = new Sim({
    seed: setup.seed,
    bounds: { w: TUNING.arenaWidth, h: TUNING.arenaHeight }
  });

  const spacing = Math.min(360, TUNING.arenaHeight / (setup.party.length + 1));
  const centerY = TUNING.arenaHeight / 2;
  setup.party.forEach((h, i) => {
    const level = h.level ?? 14;
    const build = buildHero(REG.hero(h.heroId), autoPicksForLevel(level), 0);
    const homePos = {
      x: TUNING.macroTeamXInset + formationDepth(build.def.roles, build.def.baseStats.attackRange),
      y: centerY + (i - (setup.party.length - 1) / 2) * spacing
    };
    const u = spawnConfiguredHero(sim, h, 0, homePos, {
      kind: 'gambit',
      rules: h.gambits ?? buildDefaultGambit(build.def.roles),
      homePos
    }, level, build);
    u.facing = 0;
  });

  const bossLevel = setup.boss.level ?? 18;
  const bossBuild = buildHero(REG.hero(setup.boss.heroId), autoPicksForLevel(bossLevel), 0);
  const boss = spawnConfiguredHero(sim, setup.boss, 1, {
    x: TUNING.arenaWidth - TUNING.macroTeamXInset,
    y: centerY
  }, {
    kind: 'boss',
    threat: {},
    homePos: { x: TUNING.arenaWidth - TUNING.macroTeamXInset, y: centerY }
  }, bossLevel, bossBuild);
  const hpScale = setup.boss.hpScale ?? TUNING.raidBossHpScale;
  const damageScale = setup.boss.damageScale ?? TUNING.raidBossDamageScale;
  boss.externalMods.maxHp = (boss.externalMods.maxHp ?? 0) + boss.stats.maxHp * (hpScale - 1);
  boss.externalMods.damagePct = (boss.externalMods.damagePct ?? 0) + (damageScale - 1) * 100;
  boss.radius = TUNING.unitRadiusHero * TUNING.raidBossRadiusScale;
  boss.markStatsDirty();
  boss.refresh(0);
  boss.hp = boss.stats.maxHp;
  boss.mana = boss.stats.maxMana;
  boss.facing = Math.PI;

  return sim;
}

function spawnConfiguredHero(
  sim: Sim,
  h: MacroHeroSetup,
  team: 0 | 1,
  pos: { x: number; y: number },
  ctrl: Unit['ctrl'],
  level: number,
  build = buildHero(REG.hero(h.heroId), autoPicksForLevel(level), 0)
): Unit {
  const u = sim.spawnHero(build.def, {
    team,
    pos,
    level,
    ctrl
  });
  for (const k in build.externalMods) {
    u.externalMods[k] = (u.externalMods[k] ?? 0) + build.externalMods[k];
  }
  for (const itemId of h.items ?? []) {
    const slot = u.items.findIndex((s) => s === null);
    if (slot >= 0) u.items[slot] = makeItemState(REG.item(itemId));
  }
  u.markStatsDirty();
  u.refresh(0);
  u.hp = u.stats.maxHp;
  u.mana = u.stats.maxMana;
  return u;
}

function formationDepth(roles: string[], attackRange: number): number {
  const depth = TUNING.macroFormationDepth;
  if (roles.includes('initiator') || roles.includes('durable')) return depth;
  if (roles.includes('support') || attackRange >= 550) return -depth;
  return 0;
}

export function heroesAlive(sim: Sim, team: number): Unit[] {
  return sim.unitsArr.filter((u) => u.alive && u.team === team && u.kind === 'hero');
}

export function runMacroBattle(setup: MacroSetup): MacroResult {
  const sim = setupMacroSim(setup);
  return runBattleToResult(sim, setup.maxSec ?? TUNING.macroMaxSec);
}

export function runRaidBattle(setup: RaidSetup): MacroResult {
  const sim = setupRaidSim(setup);
  return runBattleToResult(sim, setup.maxSec ?? TUNING.macroMaxSec);
}

function runBattleToResult(sim: Sim, maxSec: number): MacroResult {
  const maxTicks = Math.round(maxSec / sim.dt);

  let winner: 0 | 1 | -1 = -1;
  while (sim.tickCount < maxTicks) {
    sim.tick();
    const a = heroesAlive(sim, 0).length;
    const b = heroesAlive(sim, 1).length;
    if (a === 0 || b === 0) {
      winner = a > 0 ? 0 : b > 0 ? 1 : -1;
      break;
    }
  }
  if (winner === -1) {
    // timeout: higher surviving hp% total wins
    const score = (team: number) => heroesAlive(sim, team).reduce((acc, u) => acc + u.hp / u.stats.maxHp, 0);
    const sa = score(0);
    const sb = score(1);
    winner = sa > sb ? 0 : sb > sa ? 1 : -1;
  }

  return {
    winner,
    timeSec: sim.time,
    ticks: sim.tickCount,
    survivors: sim.unitsArr
      .filter((u) => u.alive && u.kind === 'hero')
      .map((u) => ({ heroId: u.heroId ?? '?', team: u.team, hpPct: u.hp / u.stats.maxHp })),
    hash: sim.hash(),
    sim
  };
}
