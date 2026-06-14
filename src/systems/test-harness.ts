import { REG } from '../core/registry';
import { getAssetCacheStats, type AssetCacheStats } from '../engine/asset-loaders';
import { newGameSave } from './game';
import type { Game } from './game';
import type { DifficultyTier, GameSave } from '../core/types';
import type { GraphicsRenderStats } from '../engine/scene';

// ------------------------------------------------------------------
// E2E / QA test harness. Enabled via ?test in the URL (see main.ts).
//
// Goal: make the browser game drivable from Playwright (or the console)
// without WebGL, without the title screen, and without waiting on real
// time. It exposes `window.__test`, a thin, deterministic control surface
// over the live `Game`:
//
//   - boot:     start a fresh, seeded game in any region (skips title)
//   - render:   optional headless render (?render=headless) so tests never
//               touch WebGL — pure gameplay logic at full speed
//   - time:     fastForward(seconds) steps the sim synchronously; no rAF,
//               no real-time waits
//   - state:    state() returns a JSON snapshot Playwright can assert on
//   - cheats:   the ?debug panel actions (gold/xp/heal/clear) as API calls
//
// This is QA-only and is never wired in a normal player boot.
// ------------------------------------------------------------------

const params = (): URLSearchParams => new URLSearchParams(location.search);

export function testEnabled(): boolean {
  return params().has('test');
}

/** When true, boot the in-browser Game with the headless scene/audio (no WebGL). */
export function testRenderHeadless(): boolean {
  return params().get('render') === 'headless';
}

/** Starter hero for the auto-boot game (?hero=...), defaults to juggernaut. */
export function testStarterHero(): string {
  const h = params().get('hero');
  return h && REG.heroes.has(h) ? h : 'juggernaut';
}

/** Optional fixed world seed (?seed=...) for reproducible runs. */
export function testSeed(): number | undefined {
  const s = params().get('seed');
  if (s === null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export interface NewGameOpts {
  hero?: string;
  region?: string;
  seed?: number;
  gold?: number;
  headless?: boolean;
}

export interface TestState {
  ready: boolean;
  mode: 'headless' | 'webgl';
  regionId: string;
  regionName: string;
  gold: number;
  playtime: number;
  dayTime: number;
  isNight: boolean;
  inTown: boolean;
  inCombat: boolean;
  activeIdx: number;
  party: {
    heroId: string;
    level: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    alive: boolean;
    moveSpeed: number;
    itemCount: number;
  }[];
  recruited: number;
  badges: number;
  caught: number;
  stash: number;
  dungeon: null | {
    id: string;
    tier: string;
    roomIndex: number;
    roomType: string;
    depth: number;
    exitsUnlocked: boolean;
    done: boolean;
  };
}

export interface TestPerfFightResult {
  requestedUnits: number;
  totalUnits: number;
  hostiles: number;
  creepId: string;
}

export interface TestPerfStats {
  graphics: GraphicsRenderStats | null;
  assets: AssetCacheStats;
}

export interface TestApi {
  /** True once a Game instance is live. */
  ready(): boolean;
  mode: 'headless' | 'webgl';
  /** The live Game (escape hatch for advanced assertions). */
  game(): Game | null;
  /** Build a fresh save without starting it. */
  newGameSave(heroId?: string): GameSave;
  /** Build + start a fresh, seeded game (skips the title screen). */
  startNewGame(opts?: NewGameOpts): void;
  /** Start an explicit save. */
  start(save: GameSave, opts?: { headless?: boolean }): void;
  /** Load a save through the normal in-app event path. */
  load(save: GameSave): void;
  /** Step the sim synchronously for `seconds` of game time (no real-time wait). */
  fastForward(seconds: number, stepMs?: number): void;
  /** One update step (default ~33ms). */
  step(stepMs?: number): void;
  // cheats (mirror the ?debug panel) ----------------------------------
  addGold(n: number): void;
  addXp(n: number, recIdx?: number): void;
  healParty(): void;
  /** Kill every hostile in the sim currently receiving input. Returns the count. */
  clearHostiles(): number;
  teleportActive(x: number, y: number): void;
  /** Build a deterministic same-creep crowd around the active hero for browser perf baselines. */
  spawnPerfFight(opts?: { units?: number; creepId?: string; radius?: number }): TestPerfFightResult | null;
  /** Current real-renderer graphics stats, or null in headless mode. */
  graphicsStats(): GraphicsRenderStats | null;
  /** Graphics + asset cache counters used by the browser perf smoke route. */
  perfStats(): TestPerfStats;
  /** Clear the rolling frame window before a sampled perf interval. */
  resetGraphicsStats(): void;
  /** JSON snapshot for Playwright assertions. */
  state(): TestState;
}

export interface HarnessDeps {
  getGame: () => Game | null;
  start: (save: GameSave, opts?: { headless?: boolean }) => void;
  load: (save: GameSave) => void;
  headless: boolean;
}

function buildNewGameSave(opts: NewGameOpts): GameSave {
  const save = newGameSave(opts.hero && REG.heroes.has(opts.hero) ? opts.hero : 'juggernaut');
  if (opts.region && REG.regions.has(opts.region)) {
    const region = REG.region(opts.region);
    save.regionId = region.id;
    save.worldSeed = region.seed;
    save.playerPos = { x: region.town.pos.x, y: region.town.pos.y + 500 };
    save.explorationPct = { [region.id]: 0 };
  }
  if (opts.seed !== undefined) save.worldSeed = opts.seed;
  if (opts.gold !== undefined) save.gold = opts.gold;
  save.savedAt = Date.now();
  return save;
}

export function makeTestApi(deps: HarnessDeps): TestApi {
  const api: TestApi = {
    mode: deps.headless ? 'headless' : 'webgl',
    ready: () => deps.getGame() !== null,
    game: () => deps.getGame(),
    newGameSave: (heroId = 'juggernaut') => newGameSave(REG.heroes.has(heroId) ? heroId : 'juggernaut'),
    startNewGame: (opts = {}) => {
      deps.start(buildNewGameSave(opts), { headless: opts.headless ?? deps.headless });
    },
    start: (save, opts) => deps.start(save, { headless: opts?.headless ?? deps.headless }),
    load: (save) => deps.load(save),
    fastForward: (seconds, stepMs = 1000 / 30) => {
      const game = deps.getGame();
      if (!game) return;
      const stepSec = stepMs / 1000;
      const steps = Math.max(1, Math.ceil(seconds / stepSec));
      for (let i = 0; i < steps; i++) game.update(stepSec);
    },
    step: (stepMs = 1000 / 30) => {
      deps.getGame()?.update(stepMs / 1000);
    },
    addGold: (n) => {
      const game = deps.getGame();
      if (game) game.gold += n;
    },
    addXp: (n, recIdx) => {
      const game = deps.getGame();
      if (!game) return;
      const idx = recIdx ?? game.activeIdx;
      const rec = game.party[idx];
      const u = rec?.unit;
      if (!rec || !u) return;
      const gained = u.addXp(n);
      if (gained > 0) {
        u.autoLevelAbilities(REG.hero(rec.heroId).skillOrder);
        u.refresh(game.sim.time);
      }
      rec.level = u.level;
      rec.xp = u.xp;
    },
    healParty: () => {
      const game = deps.getGame();
      if (!game) return;
      for (const rec of game.party) {
        const u = rec.unit;
        if (u && u.alive) {
          u.hp = u.stats.maxHp;
          u.mana = u.stats.maxMana;
        }
      }
    },
    clearHostiles: () => {
      const game = deps.getGame();
      if (!game) return 0;
      const sim = game.inputSim();
      const killer = game.controlledUnit();
      const allyTeam = killer ? killer.team : 0;
      let n = 0;
      for (const c of [...sim.unitsArr]) {
        if (c.alive && c.team !== allyTeam) {
          sim.killUnit(c, killer);
          n++;
        }
      }
      return n;
    },
    teleportActive: (x, y) => {
      const u = deps.getGame()?.activeUnit();
      if (u) {
        u.pos = { x, y };
        u.prevPos = { x, y };
      }
    },
    spawnPerfFight: (opts = {}) => spawnPerfFight(deps.getGame(), opts),
    graphicsStats: () => {
      const scene = deps.getGame()?.scene as unknown as { graphicsStats?: () => GraphicsRenderStats } | undefined;
      return scene?.graphicsStats?.() ?? null;
    },
    perfStats: () => {
      const scene = deps.getGame()?.scene as unknown as { graphicsStats?: () => GraphicsRenderStats } | undefined;
      return {
        graphics: scene?.graphicsStats?.() ?? null,
        assets: getAssetCacheStats()
      };
    },
    resetGraphicsStats: () => {
      const scene = deps.getGame()?.scene as unknown as { resetGraphicsStats?: () => void } | undefined;
      scene?.resetGraphicsStats?.();
    },
    state: () => snapshot(deps.getGame(), deps.headless ? 'headless' : 'webgl')
  };
  return api;
}

function spawnPerfFight(game: Game | null, opts: { units?: number; creepId?: string; radius?: number }): TestPerfFightResult | null {
  if (!game) return null;
  const sim = game.sim;
  const hero = game.activeUnit();
  if (!hero) return null;
  const requestedUnits = Math.max(2, Math.floor(opts.units ?? 30));
  const hostiles = requestedUnits - 1;
  const fallbackCreepId = game.region.camps[0]?.creepId ?? [...REG.creeps.keys()][0];
  if (!fallbackCreepId) return null;
  const creepId = opts.creepId && REG.creeps.has(opts.creepId) ? opts.creepId : fallbackCreepId;
  const def = REG.creep(creepId);
  const center = {
    x: game.region.town.pos.x,
    y: game.region.town.pos.y + 900
  };
  hero.pos = { ...center };
  hero.prevPos = { ...center };
  hero.hp = hero.stats.maxHp;
  hero.mana = hero.stats.maxMana;

  for (const u of [...sim.unitsArr]) {
    if (u.uid !== hero.uid) sim.removeUnit(u.uid);
  }

  const radius = Math.max(220, opts.radius ?? Math.max(520, def.aggroRadius ?? 520));
  for (let i = 0; i < hostiles; i++) {
    const ring = Math.floor(i / 12);
    const inRing = Math.min(12, hostiles - ring * 12);
    const angle = ((i % 12) / inRing) * Math.PI * 2;
    const r = radius + ring * 180;
    const pos = {
      x: center.x + Math.cos(angle) * r,
      y: center.y + Math.sin(angle) * r
    };
    sim.spawnCreep(def, {
      team: 1,
      pos,
      wild: true,
      homePos: { ...center },
      regionId: game.region.id
    });
  }
  return {
    requestedUnits,
    totalUnits: sim.unitsArr.filter((u) => u.alive).length,
    hostiles,
    creepId
  };
}

function snapshot(game: Game | null, mode: 'headless' | 'webgl'): TestState {
  const empty: TestState = {
    ready: false,
    mode,
    regionId: '',
    regionName: '',
    gold: 0,
    playtime: 0,
    dayTime: 0,
    isNight: false,
    inTown: false,
    inCombat: false,
    activeIdx: 0,
    party: [],
    recruited: 0,
    badges: 0,
    caught: 0,
    stash: 0,
    dungeon: null
  };
  if (!game) return empty;
  try {
    const dungeon = game.liveDungeon;
    return {
      ready: true,
      mode,
      regionId: game.region.id,
      regionName: game.region.name,
      gold: Math.round(game.gold),
      playtime: Math.round(game.playtime),
      dayTime: game.dayTime,
      isNight: game.isNight(),
      inTown: game.inTown(),
      inCombat: game.inCombat(),
      activeIdx: game.activeIdx,
      party: game.party.map((rec) => {
        const u = rec.unit;
        return {
          heroId: rec.heroId,
          level: rec.level,
          hp: u ? Math.round(u.hp) : 0,
          maxHp: u ? Math.round(u.stats.maxHp) : 0,
          mana: u ? Math.round(u.mana) : 0,
          maxMana: u ? Math.round(u.stats.maxMana) : 0,
          alive: u ? u.alive : false,
          moveSpeed: u ? Math.round(u.stats.moveSpeed) : 0,
          itemCount: u ? u.items.filter((it) => it !== null).length : 0
        };
      }),
      recruited: game.recruited.size,
      badges: game.badges.size,
      caught: game.caught.length,
      stash: game.inventoryStash.length,
      dungeon: dungeon
        ? {
            id: dungeon.def.id,
            tier: dungeon.tier as DifficultyTier,
            roomIndex: dungeon.room.index,
            roomType: dungeon.room.type,
            depth: dungeon.layout.depth,
            exitsUnlocked: dungeon.exitsUnlocked(),
            done: dungeon.done
          }
        : null
    };
  } catch {
    return { ...empty, ready: true };
  }
}

export function installTestApi(deps: HarnessDeps): void {
  (window as unknown as { __test: TestApi }).__test = makeTestApi(deps);
}
