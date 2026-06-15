import { REG } from '../core/registry';
import { xpForLevel } from '../core/stats';
import { getAssetCacheStats, type AssetCacheStats } from '../engine/asset-loaders';
import { newGameSave } from './game';
import type { Game } from './game';
import type { TargetingState } from './input';
import type { DifficultyTier, GameSave, GraphicsQuality } from '../core/types';
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

/** Mount the real HUD/input over the headless scene for DOM-focused browser tests. */
export function testHudEnabled(): boolean {
  return params().get('hud') === '1';
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

const QUALITY_VALUES: readonly GraphicsQuality[] = ['auto', 'low', 'medium', 'high', 'ultra'];

/** Optional graphics-quality override (?quality=...). 'low' skips the env/vfx/
 *  holdout/party-model preload chain, so WebGL smoke tests boot far faster. */
export function testQuality(): GraphicsQuality | undefined {
  const q = params().get('quality');
  return q && (QUALITY_VALUES as readonly string[]).includes(q) ? (q as GraphicsQuality) : undefined;
}

export interface NewGameOpts {
  hero?: string;
  region?: string;
  seed?: number;
  gold?: number;
  headless?: boolean;
  quality?: GraphicsQuality;
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
  quests: TestQuestState;
}

/** Quest snapshot for QA: status tallies plus the visible (non-locked, non-claimed) board. */
export interface TestQuestState {
  total: number;
  locked: number;
  active: number;
  complete: number;
  claimed: number;
  cooldown: number;
  board: { id: string; status: string; claimable: boolean }[];
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

export interface TestInputState {
  hoverUid: number;
  hoverGround: { x: number; y: number } | null;
  targeting: TargetingState;
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
  /** Dispose the live game/HUD/input stack before browser teardown. */
  shutdown(): void;
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
  /** Clear any active/queued cut-scene so `fastForward` advances the live sim.
   *  Headless-safe (no DOM). The main loop early-returns while a cinematic is
   *  active, so sim-advancing specs must call this first. Returns true if a
   *  cinematic was cleared. */
  skipCinematics(): boolean;
  /** Pad the party up to 5 heroes (for gym/raid/dungeon flows that require a full
   *  party) and optionally set every member's level. Returns the party size. */
  fillParty(opts?: { heroIds?: string[]; level?: number }): number;
  /** Build a deterministic same-creep crowd around the active hero for browser perf baselines. */
  spawnPerfFight(opts?: { units?: number; creepId?: string; radius?: number }): TestPerfFightResult | null;
  /** Spawn `count` wild creeps adjacent to the active hero so combat/reward specs
   *  don't depend on a hardcoded world coordinate that drifts with data edits. */
  spawnWildCreepNearActive(opts?: { count?: number; creepId?: string }): TestPerfFightResult | null;
  /** Feed a normalized quest progression beat into the live quest tracker. */
  advanceQuest(ev: { kind: string; amount?: number; regionId?: string; tier?: string; targetId?: string }): void;
  /** Current real-renderer graphics stats, or null in headless mode. */
  graphicsStats(): GraphicsRenderStats | null;
  /** Graphics + asset cache counters used by the browser perf smoke route. */
  perfStats(): TestPerfStats;
  /** Clear the rolling frame window before a sampled perf interval. */
  resetGraphicsStats(): void;
  /** Seed pointer-derived hover for headless input tests that dispatch real key/mouse events. */
  setInputHover(hover: { uid?: number; ground?: { x: number; y: number } | null }): boolean;
  /** Snapshot the live InputController state when HUD/input is mounted. */
  inputState(): TestInputState | null;
  /** JSON snapshot for Playwright assertions. */
  state(): TestState;
}

export interface HarnessDeps {
  getGame: () => Game | null;
  getInput?: () => { hoverUid: number; hoverGround: { x: number; y: number } | null; targeting: TargetingState } | null;
  start: (save: GameSave, opts?: { headless?: boolean; hud?: boolean }) => void;
  load: (save: GameSave) => void;
  shutdown?: () => void;
  headless: boolean;
  hud?: boolean;
  updateUi?: () => void;
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
  if (opts.quality && save.settings.graphics) save.settings.graphics.quality = opts.quality;
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
      deps.start(buildNewGameSave(opts), { headless: opts.headless ?? deps.headless, hud: deps.hud });
    },
    start: (save, opts) => deps.start(save, { headless: opts?.headless ?? deps.headless, hud: deps.hud }),
    load: (save) => deps.load(save),
    shutdown: () => deps.shutdown?.(),
    fastForward: (seconds, stepMs = 1000 / 30) => {
      const game = deps.getGame();
      if (!game) return;
      const stepSec = stepMs / 1000;
      const steps = Math.max(1, Math.ceil(seconds / stepSec));
      for (let i = 0; i < steps; i++) {
        game.update(stepSec);
        deps.updateUi?.();
      }
    },
    step: (stepMs = 1000 / 30) => {
      deps.getGame()?.update(stepMs / 1000);
      deps.updateUi?.();
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
        u.refresh(game.sim.time);
      }
      rec.level = u.level;
      rec.xp = u.xp;
      rec.abilityLevels = u.abilities.map((a) => a.level);
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
    skipCinematics: () => {
      const game = deps.getGame();
      if (!game) return false;
      const wasActive = game.cinematic.active;
      let guard = 0;
      while (game.cinematic.active && guard++ < 200) game.cinematicSkip();
      game.cinematic.clear();
      return wasActive;
    },
    fillParty: (opts = {}) => {
      const game = deps.getGame();
      if (!game) return 0;
      const pool =
        opts.heroIds && opts.heroIds.length
          ? opts.heroIds
          : ['pudge', 'earthshaker', 'sven', 'axe', 'lich', 'luna', 'sniper', 'crystal-maiden', 'juggernaut'];
      const recruit = (game as unknown as { recruitHero(h: string): boolean }).recruitHero.bind(game);
      for (const id of pool) {
        if (game.party.length >= 5) break;
        if (!REG.heroes.has(id)) continue;
        if (game.party.some((r) => r.heroId === id)) continue;
        recruit(id);
      }
      if (opts.level !== undefined) {
        const lvl = Math.max(1, Math.floor(opts.level));
        const targetXp = xpForLevel(lvl);
        for (const rec of game.party) {
          const u = rec.unit;
          if (u) {
            if (u.xp < targetXp) {
              u.addXp(targetXp - u.xp);
              u.refresh(game.sim.time);
            }
            rec.level = u.level;
            rec.xp = u.xp;
            rec.abilityLevels = u.abilities.map((a) => a.level);
          } else {
            rec.level = Math.max(rec.level, lvl);
            rec.xp = Math.max(rec.xp, targetXp);
          }
        }
      }
      return game.party.length;
    },
    spawnPerfFight: (opts = {}) => spawnPerfFight(deps.getGame(), opts),
    spawnWildCreepNearActive: (opts = {}) => spawnWildCreepNearActive(deps.getGame(), opts),
    advanceQuest: (ev) => {
      const game = deps.getGame() as unknown as { advanceQuests?: (e: unknown) => void } | null;
      game?.advanceQuests?.({ amount: 1, ...ev });
    },
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
    setInputHover: (hover) => {
      const input = deps.getInput?.();
      if (!input) return false;
      input.hoverUid = hover.uid ?? -1;
      input.hoverGround = hover.ground ? { ...hover.ground } : null;
      return true;
    },
    inputState: () => {
      const input = deps.getInput?.();
      return input
        ? {
            hoverUid: input.hoverUid,
            hoverGround: input.hoverGround ? { ...input.hoverGround } : null,
            targeting: { ...input.targeting } as TargetingState
          }
        : null;
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

function spawnWildCreepNearActive(
  game: Game | null,
  opts: { count?: number; creepId?: string }
): TestPerfFightResult | null {
  if (!game) return null;
  const sim = game.sim;
  const hero = game.activeUnit();
  if (!hero) return null;
  const count = Math.max(1, Math.floor(opts.count ?? 3));
  const fallbackCreepId = game.region.camps[0]?.creepId ?? [...REG.creeps.keys()][0];
  if (!fallbackCreepId) return null;
  const creepId = opts.creepId && REG.creeps.has(opts.creepId) ? opts.creepId : fallbackCreepId;
  const def = REG.creep(creepId);
  const center = { ...hero.pos };
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const pos = { x: center.x + Math.cos(angle) * 140, y: center.y + Math.sin(angle) * 140 };
    sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...center }, regionId: game.region.id });
  }
  return {
    requestedUnits: count + 1,
    totalUnits: sim.unitsArr.filter((u) => u.alive).length,
    hostiles: count,
    creepId
  };
}

const EMPTY_QUESTS: TestQuestState = {
  total: 0,
  locked: 0,
  active: 0,
  complete: 0,
  claimed: 0,
  cooldown: 0,
  board: []
};

function questSummary(game: Game): TestQuestState {
  const g = game as unknown as {
    questBoard?: () => { id: string; status: string; claimable: boolean }[];
    quests?: Record<string, { status?: string }>;
  };
  if (typeof g.questBoard !== 'function') return EMPTY_QUESTS;
  // questBoard() refreshes availability, so locked->active unlocks are reflected.
  const board = g.questBoard().map((q) => ({ id: q.id, status: q.status, claimable: q.claimable }));
  const counts = { locked: 0, active: 0, complete: 0, claimed: 0, cooldown: 0 };
  let total = 0;
  for (const def of REG.questDefs.values()) {
    total++;
    const status = g.quests?.[def.id]?.status ?? 'locked';
    if (status in counts) counts[status as keyof typeof counts]++;
  }
  return { total, ...counts, board };
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
    dungeon: null,
    quests: EMPTY_QUESTS
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
        : null,
      quests: questSummary(game)
    };
  } catch {
    return { ...empty, ready: true };
  }
}

export function installTestApi(deps: HarnessDeps): void {
  (window as unknown as { __test: TestApi }).__test = makeTestApi(deps);
}
