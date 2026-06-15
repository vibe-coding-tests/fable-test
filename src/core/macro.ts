import { TUNING } from '../data/tuning';
import { REG } from './registry';
import { Sim } from './sim';
import { buildDefaultGambit } from './controllers';
import { pickBossMechanic } from './boss-brain';
import { autoPicksForLevel, buildHero } from './hero-setup';
import { makeItemState } from './items';
import { raidSetupFromDef } from './phase3';
import { applyElementAura } from './combat';
import { slotToWorld, type Formation } from './board';
import type { EffectCtx } from './effects';
import type { ActiveElement, BossDef, DifficultyTier, HeroDef, MacroHeroSetup, RaidBossSetup, RaidDef, StatModMap, Vec2, ZoneSpec } from './types';
import type { Unit } from './unit';

const RAPIER_ID = 'divine-rapier';
const HERO_HEIGHT_M = 1.8;
const BOSS_RANK_HEIGHT_FLOOR_M: Record<BossDef['rank'], number> = {
  'mini-boss': 2.2,
  boss: 3.5,
  'world-boss': 6
};

// ------------------------------------------------------------------
// Macro layer (SPEC §7): 5v5 on a small arena, auto-resolving on the
// shared core. Headless-runnable to completion inside a test.
// ------------------------------------------------------------------

export interface MacroSetup {
  seed: number;
  teamA: MacroHeroSetup[];
  teamB: MacroHeroSetup[];
  /** Optional board placement per side (§3). A hero with no cell falls back to formationDepth. */
  formationA?: Formation;
  formationB?: Formation;
  maxSec?: number;
}

export interface RaidSetup {
  seed: number;
  party: MacroHeroSetup[];
  boss: RaidBossSetup;
  bossRank?: RaidDef['bossRank'];
  maxSec?: number;
}

export interface RapierDrop {
  itemId: string;
  fromUid: number;
  /** uid of the enemy hero that claimed it for the round, or -1 if none alive. */
  toUid: number;
}

export interface MacroResult {
  winner: 0 | 1 | -1;
  timeSec: number;
  ticks: number;
  survivors: { heroId: string; team: number; hpPct: number }[];
  hash: string;
  sim: Sim;
  /** Divine Rapiers that dropped from a dying holder this fight (Phase 3 §4.2). */
  rapierDrops: RapierDrop[];
  /** Whether a held Aegis auto-revive fired during the fight. */
  aegisConsumed: boolean;
}

/** A raid mechanic that fired in the sim (Phase 3 §3.B / Phase 6 §3.9). */
export interface RaidMechanicFired {
  kind: 'add-wave' | 'zone' | 'signature' | 'enrage';
  id: string;
  atSec: number;
  bossHpPct: number;
}

export interface RaidEncounterSetup {
  def: RaidDef;
  party: MacroHeroSetup[];
  tier: DifficultyTier;
  seed: number;
  /** Party carries a single Aegis charge (one-use auto-revive). */
  aegis?: boolean;
  maxSec?: number;
  /** Keep the full sim event history (tests/inspection); off in the live loop. */
  captureEvents?: boolean;
}

export interface RaidEncounterResult extends MacroResult {
  cleared: boolean;
  fired: RaidMechanicFired[];
}

export interface RaidMechanicRunner {
  fired: RaidMechanicFired[];
  tick(sim: Sim): void;
}

interface BattleHooks {
  /** Fires once per tick (after the sim steps) so raid mechanics can execute in the sim. */
  onTick?: (sim: Sim) => void;
  /** Team holding a single Aegis: the first hero on it to fall auto-revives once. */
  aegisTeam?: 0 | 1;
}

export function setupMacroSim(setup: MacroSetup): Sim {
  const sim = new Sim({
    seed: setup.seed,
    bounds: { w: TUNING.arenaWidth, h: TUNING.arenaHeight }
  });
  const placeTeam = (team: 0 | 1, list: MacroHeroSetup[], formation?: Formation) => {
    const dir = team === 0 ? 1 : -1;
    const baseX = team === 0 ? TUNING.macroTeamXInset : TUNING.arenaWidth - TUNING.macroTeamXInset;
    const spacing = Math.min(420, TUNING.arenaHeight / (list.length + 1));
    const centerY = TUNING.arenaHeight / 2;
    list.forEach((h, i) => {
      const level = h.level ?? 10;
      const build = buildHero(REG.hero(h.heroId), autoPicksForLevel(level), 0);
      // If the board authored a cell for this hero, spawn + anchor on it (§3.4);
      // otherwise fall back to the role heuristic (byte-identical to before, Goal 6).
      const slot = formation?.placements[h.heroId];
      const placed = slot ? slotToWorld(team, slot) : null;
      const homePos = placed
        ? { ...placed.pos }
        : {
            x: baseX + dir * formationDepth(build.def.roles, build.def.baseStats.attackRange),
            y: centerY + (i - (list.length - 1) / 2) * spacing
          };
      const u = spawnConfiguredHero(sim, h, team, homePos, {
        kind: 'gambit',
        rules: h.gambits ?? buildDefaultGambit(build.def.roles),
        homePos
      }, level, build);
      u.facing = placed ? placed.facing : team === 0 ? 0 : Math.PI;
    });
  };
  placeTeam(0, setup.teamA, setup.formationA);
  placeTeam(1, setup.teamB, setup.formationB);
  return sim;
}

export function setupRaidSim(setup: RaidSetup): Sim {
  const sim = new Sim({
    seed: setup.seed,
    bounds: { w: TUNING.arenaWidth, h: TUNING.arenaHeight }
  });
  const aiDepth = setup.boss.aiDepth ?? TUNING.ai.bossAiDepth;

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
      homePos,
      aiDepth
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
    homePos: { x: TUNING.arenaWidth - TUNING.macroTeamXInset, y: centerY },
    boss: { depth: aiDepth, enrageSec: setup.boss.enrageSec }
  }, bossLevel, bossBuild);
  const hpScale = setup.boss.hpScale ?? TUNING.raidBossHpScale;
  const damageScale = setup.boss.damageScale ?? TUNING.raidBossDamageScale;
  const armorScale = TUNING.applyBossArmorTier ? setup.boss.armorScale ?? 1 : 1;
  boss.externalMods.maxHp = (boss.externalMods.maxHp ?? 0) + boss.stats.maxHp * (hpScale - 1);
  boss.externalMods.damagePct = (boss.externalMods.damagePct ?? 0) + (damageScale - 1) * 100;
  boss.externalMods.armor = (boss.externalMods.armor ?? 0) + boss.base.baseArmor * (armorScale - 1);
  const sourceHero = REG.hero(setup.boss.heroId);
  const visualScale = setup.bossRank
    ? bossVisualScaleForRank(setup.bossRank, sourceHero)
    : TUNING.bossVisualScale;
  const visualFootprintRadius = setup.bossRank
    ? visualFootprintRadiusForBoss(sourceHero, visualScale)
    : TUNING.unitRadiusHero * TUNING.bossVisualScale;
  boss.radius = TUNING.unitRadiusHero * TUNING.raidBossRadiusScale;
  boss.visualScale = visualScale;
  boss.footprintDecoupled = true;
  boss.visualFootprintRadius = visualFootprintRadius;
  boss.hitRadius = Math.max(boss.radius, boss.visualFootprintRadius);
  boss.targetRadius = boss.hitRadius;
  boss.pickRadius = boss.hitRadius;
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
    if (slot >= 0) u.items[slot] = makeItemState(REG.item(itemId), h.itemOverrides?.[itemId]);
  }
  u.markStatsDirty();
  u.markVisualDirty();
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

function heroHeightM(hero: HeroDef): number {
  return hero.worldSize?.heightM ?? HERO_HEIGHT_M * hero.silhouette.scale;
}

function heroFootprintM(hero: HeroDef): number {
  return hero.worldSize?.footprintM ?? TUNING.unitRadiusHero / 100;
}

function bossVisualScaleForRank(rank: BossDef['rank'], hero: HeroDef): number {
  const heightM = heroHeightM(hero);
  return +(Math.max(heightM, BOSS_RANK_HEIGHT_FLOOR_M[rank]) / heightM).toFixed(4);
}

function visualFootprintRadiusForBoss(hero: HeroDef, visualScale: number): number {
  return Math.round(heroFootprintM(hero) * visualScale * 100);
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

function nearestLivingEnemyHero(sim: Sim, fallen: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const u of sim.unitsArr) {
    if (!u.alive || u.kind !== 'hero' || u.team === fallen.team) continue;
    const d = (u.pos.x - fallen.pos.x) ** 2 + (u.pos.y - fallen.pos.y) ** 2;
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
}

function runBattleToResult(sim: Sim, maxSec: number, hooks: BattleHooks = {}): MacroResult {
  const maxTicks = Math.round(maxSec / sim.dt);
  const rapierDrops: RapierDrop[] = [];
  const handledFallen = new Set<number>();
  let aegisAvailable = hooks.aegisTeam !== undefined;
  let aegisConsumed = false;

  // Death handling shared by every macro/raid fight: a held Aegis stands a fallen hero
  // back up once; a Divine Rapier dropped by a dying holder is claimed by the nearest
  // living enemy hero for the round (Phase 3 §4.2).
  const handleFallen = () => {
    for (const u of sim.unitsArr) {
      if (u.kind !== 'hero' || u.alive || handledFallen.has(u.uid)) continue;
      if (aegisAvailable && hooks.aegisTeam !== undefined && u.team === hooks.aegisTeam) {
        if (sim.reviveUnit(u, 1, 1)) {
          aegisAvailable = false;
          aegisConsumed = true;
          continue; // back on its feet — do not loot a living hero
        }
      }
      handledFallen.add(u.uid);
      const slot = u.items.findIndex((s) => s?.defId === RAPIER_ID);
      if (slot < 0) continue;
      const item = u.items[slot]!;
      u.items[slot] = null;
      u.markStatsDirty();
      u.markVisualDirty();
      u.refresh(sim.time);
      const taker = nearestLivingEnemyHero(sim, u);
      if (taker) {
        const free = taker.items.findIndex((s) => s === null);
        if (free >= 0) {
          taker.items[free] = item;
          taker.markStatsDirty();
          taker.markVisualDirty();
          taker.refresh(sim.time);
        }
      }
      rapierDrops.push({ itemId: RAPIER_ID, fromUid: u.uid, toUid: taker?.uid ?? -1 });
    }
  };

  let winner: 0 | 1 | -1 = -1;
  while (sim.tickCount < maxTicks) {
    sim.tick();
    hooks.onTick?.(sim);
    handleFallen();
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
    sim,
    rapierDrops,
    aegisConsumed
  };
}

// ------------------------------------------------------------------
// Raid encounter (Phase 6 §3.9): a 5v1 where the boss's scripted
// mechanics actually execute in the sim — phase-transition zones,
// add waves, a signature beat, and a hard enrage when the timer
// expires. Threat + taunt come for free from the boss controller.
// ------------------------------------------------------------------

interface RaidMech {
  key: string;
  kind: RaidMechanicFired['kind'];
  atHpPct: number;
  wave?: { summon: RaidDef['addWaves'][number]['summon']; count: number };
  zone?: ZoneSpec;
  sigId?: string;
}

function zoneNum(v: ZoneSpec['radius'], fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

function partyCentroid(sim: Sim): Vec2 | null {
  const live = heroesAlive(sim, 0);
  if (live.length === 0) return null;
  return {
    x: live.reduce((a, u) => a + u.pos.x, 0) / live.length,
    y: live.reduce((a, u) => a + u.pos.y, 0) / live.length
  };
}

export function runRaidEncounter(setup: RaidEncounterSetup): RaidEncounterResult {
  const { def } = setup;
  const rs = raidSetupFromDef(def, setup.party, setup.tier, setup.seed);
  const maxSec = setup.maxSec ?? rs.maxSec;
  const sim = setupRaidSim({ seed: rs.seed, party: rs.party, boss: rs.boss, bossRank: def.bossRank ?? 'boss', maxSec });
  if (setup.captureEvents) sim.events.captureAll = true;
  const boss = sim.unitsArr.find((u) => u.team === 1 && u.ctrl.kind === 'boss')!;
  const mechanics = createRaidMechanicRunner(def, sim, boss);

  const base = runBattleToResult(sim, maxSec, { onTick: mechanics.tick, aegisTeam: setup.aegis ? 0 : undefined });
  return { ...base, cleared: base.winner === 0, fired: mechanics.fired };
}

// ------------------------------------------------------------------
// Domain encounter (GAMEPLAY_OVERHAUL §3.5, Pillar P5): an element-themed
// instanced challenge on the raid runner. A single scaled boss, a run-wide
// "disorder" rule (statmod aura on the party + optional periodic element tick
// on every unit), and an element entry/clear gate. Reactions always resolve in
// a domain (element-themed by design), counted from the captured event history
// so reaction-count clear conditions are deterministic and headless-testable.
// ------------------------------------------------------------------

export interface DomainDisorderRule {
  mods?: StatModMap;
  tick?: { element: ActiveElement; interval: number };
}

export interface DomainEncounterSetup {
  seed: number;
  party: MacroHeroSetup[];
  boss: RaidBossSetup;
  maxSec?: number;
  disorder?: DomainDisorderRule;
  clear: { kind: 'defeat' | 'time-limit' | 'reaction-count'; param?: number };
}

export interface DomainEncounterResult extends MacroResult {
  cleared: boolean;
  reactions: number;
}

export function runDomainEncounter(setup: DomainEncounterSetup): DomainEncounterResult {
  const maxSec = setup.maxSec ?? TUNING.macroMaxSec;
  const sim = setupRaidSim({ seed: setup.seed, party: setup.party, boss: setup.boss, maxSec });
  sim.resonanceEnabled = true;     // domains are element-themed; reactions always resolve here
  sim.events.captureAll = true;    // count reactions for reaction-count clears

  // Disorder: a run-wide statmod aura applied to the player party.
  if (setup.disorder?.mods) {
    for (const u of sim.unitsArr) {
      if (u.team !== 0 || u.kind !== 'hero') continue;
      for (const k of Object.keys(setup.disorder.mods) as (keyof StatModMap)[]) {
        const v = setup.disorder.mods[k];
        if (typeof v === 'number') u.externalMods[k as string] = (u.externalMods[k as string] ?? 0) + v;
      }
      u.markStatsDirty();
      u.refresh(sim.time);
    }
  }

  const tick = setup.disorder?.tick;
  let nextTickAt = tick ? tick.interval : Infinity;
  const onTick = (s: Sim) => {
    if (!tick || s.time < nextTickAt) return;
    nextTickAt += tick.interval;
    const src = s.unitsArr.find((x) => x.alive && x.team === 1) ?? null;
    for (const u of s.unitsArr) {
      if (!u.alive || u.kind === 'npc' || u.kind === 'ward') continue;
      applyElementAura(s, src ?? u, u, tick.element, 1, true);
    }
  };

  const base = runBattleToResult(sim, maxSec, { onTick });
  const reactions = sim.events.history.filter((e) => e.t === 'reaction').length;
  const won = base.winner === 0;
  let cleared = won;
  if (setup.clear.kind === 'time-limit') cleared = won && base.timeSec <= (setup.clear.param ?? maxSec);
  else if (setup.clear.kind === 'reaction-count') cleared = won && reactions >= (setup.clear.param ?? 0);
  return { ...base, cleared, reactions };
}

export function createRaidMechanicRunner(def: RaidDef, sim: Sim, boss: Unit): RaidMechanicRunner {
  // One unique mechanic instance per scripted beat (dup summon ids stay distinct).
  const mechs: RaidMech[] = [
    ...def.addWaves.map((w, i) => ({ key: `wave-${i}`, kind: 'add-wave' as const, atHpPct: w.atHpPct, wave: { summon: w.summon, count: w.count } })),
    ...def.zones.map((z, i) => ({ key: `zone-${i}`, kind: 'zone' as const, atHpPct: z.atHpPct, zone: z.zone }))
  ];
  if (def.signatureExotic) mechs.push({ key: 'signature', kind: 'signature', atHpPct: 50, sigId: def.signatureExotic });
  mechs.push({ key: 'enrage', kind: 'enrage', atHpPct: 0 });

  const fired: RaidMechanicFired[] = [];
  const done = new Set<string>();
  const armedAt = new Map<string, number>();
  const ctx: EffectCtx = { defId: `raid:${def.id}`, level: boss.level, vfx: { archetype: 'ground-aoe', color: '#ff7a3a', color2: '#ffd27a' } };

  const record = (m: RaidMech) => {
    done.add(m.key);
    armedAt.delete(m.key);
    fired.push({ kind: m.kind, id: m.sigId ?? m.key, atSec: sim.time, bossHpPct: 100 * boss.hp / Math.max(1, boss.stats.maxHp) });
  };

  const arm = (m: RaidMech, at: number) => {
    if (!done.has(m.key) && !armedAt.has(m.key)) armedAt.set(m.key, at);
  };

  const spawnZone = (spec: ZoneSpec, radiusMul = 1) => {
    const at = partyCentroid(sim);
    if (!at) return;
    sim.addZone({ caster: boss, ctx, spec, duration: zoneNum(spec.duration, 8), pos: { ...at }, radius: zoneNum(spec.radius, 320) * radiusMul });
  };

  const tick = (s: Sim) => {
    if (!boss.alive) return;
    const hpPct = 100 * boss.hp / Math.max(1, boss.stats.maxHp);
    for (const m of mechs) {
      if (done.has(m.key)) continue;
      if (m.kind === 'enrage') {
        if (s.time >= def.enrageSec) arm(m, s.time);
        continue;
      }
      if (hpPct <= m.atHpPct) arm(m, s.time);
    }

    const candidates = mechs
      .filter((m) => !done.has(m.key) && armedAt.has(m.key))
      .map((m) => ({ key: m.key, kind: m.kind, atHpPct: m.atHpPct, armedAt: armedAt.get(m.key)! }));
    const chosenKey = pickBossMechanic(s, boss, candidates);
    if (!chosenKey) return;
    const m = mechs.find((candidate) => candidate.key === chosenKey);
    if (!m) return;

    if (m.kind === 'enrage') {
      // hard ramp: the boss stops playing fair once the timer expires.
      boss.externalMods.damagePct = (boss.externalMods.damagePct ?? 0) + 120;
      boss.externalMods.attackSpeed = (boss.externalMods.attackSpeed ?? 0) + 120;
      boss.externalMods.moveSpeedPct = (boss.externalMods.moveSpeedPct ?? 0) + 30;
      boss.markStatsDirty();
      boss.refresh(s.time);
      record(m);
      return;
    }
      if (m.kind === 'add-wave' && m.wave) {
        for (let i = 0; i < m.wave.count; i++) {
          const ang = (i / m.wave.count) * Math.PI * 2;
          const pos = { x: boss.pos.x + Math.cos(ang) * 150, y: boss.pos.y + Math.sin(ang) * 150 };
          s.spawnSummon(m.wave.summon, boss, pos, ctx);
        }
        record(m);
      } else if (m.kind === 'zone' && m.zone) {
        spawnZone(m.zone);
        record(m);
      } else if (m.kind === 'signature') {
        // Signature beat: a wide, harder telegraphed zone on the party (composed from the
        // zone primitive since the registered exotic is a presentation no-op).
        spawnZone(SIGNATURE_ZONE, 1);
        record(m);
      }
  };

  return { fired, tick };
}

const SIGNATURE_ZONE: ZoneSpec = {
  shape: 'circle',
  radius: 460,
  duration: 6,
  tick: { interval: 0.5, affects: 'enemies', effects: [{ kind: 'damage', dtype: 'magical', amount: 80, target: 'target' }] }
};
