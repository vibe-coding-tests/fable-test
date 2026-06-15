import './ui/styles.css';
import { registerAllContent } from './data';
import { REG } from './core/registry';
import { Game, HeadlessAudio, HeadlessScene, resolveQuality } from './systems/game';
import { InputController } from './systems/input';
import { debugEnabled, mountDebugPanel } from './systems/debug';
import {
  installTestApi,
  testEnabled,
  testHudEnabled,
  testQuality,
  testRenderHeadless,
  testSeed,
  testStarterHero
} from './systems/test-harness';
import { Hud } from './ui/hud';
import { showTitle } from './ui/title';
import { withLoading } from './ui/loading';
import { evictModelAssets, evictTextureAssets, preloadAssetGroups } from './engine/asset-loaders';
import { ENABLED_HOLDOUT_SIGNATURES, holdoutReplacementUrl } from './engine/assets';
import {
  preloadPathsForRegion,
  prewarmModelPathsForSave,
  retainedAssetUrlsForRegion,
  retainedModelUrlsForSave
} from './systems/asset-retention';
import type { GameSave } from './core/types';

registerAllContent();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

let game: Game | null = null;
let input: InputController | null = null;
let hud: Hud | null = null;
let rafId = 0;
let tickTimer = 0;
let unmountDebug: (() => void) | null = null;

function teardown(): void {
  cancelAnimationFrame(rafId);
  clearInterval(tickTimer);
  input?.dispose();
  hud?.dispose();
  unmountDebug?.();
  game?.dispose();
  game = null;
  input = null;
  hud = null;
  unmountDebug = null;
  if (testEnabled()) delete (window as unknown as { __hud?: Hud }).__hud;
}

function updateUiOnce(): void {
  const pickableScene = game?.scene as unknown as { pick?: unknown } | undefined;
  if (typeof pickableScene?.pick === 'function') input?.update();
  hud?.update();
}

// Headless-render boot for the QA harness (?test&render=headless): build the
// real Game orchestrator over the no-op scene/audio so tests exercise gameplay
// logic without WebGL. DOM-focused tests can opt into the real HUD with ?hud=1.
function startGameHeadless(save: GameSave, opts: { hud?: boolean } = {}): void {
  teardown();
  game = new Game(canvas, save, { scene: new HeadlessScene(), audio: new HeadlessAudio() });
  (window as unknown as { __game: Game }).__game = game;
  if (opts.hud) {
    input = new InputController(game, canvas);
    hud = new Hud(game, input, () => undefined);
    if (testEnabled()) (window as unknown as { __hud: Hud }).__hud = hud;
    updateUiOnce();
  }
}

function startGame(save: GameSave, opts: { headless?: boolean; hud?: boolean } = {}): void {
  if (opts.headless) {
    startGameHeadless(save, { hud: opts.hud });
    return;
  }
  teardown();
  let regionName = 'the Isle';
  try {
    regionName = REG.region(save.regionId).name;
  } catch {
    /* unknown region id — keep the generic label */
  }
  const tier = resolveQuality(save.settings.graphics?.quality);
  const enhancedAssets = tier !== 'low';
  const retainedAssetUrls = retainedAssetUrlsForRegion(save.regionId, enhancedAssets, enhancedAssets);
  evictTextureAssets((url) => !retainedAssetUrls.has(url));
  const retainedModelUrls = retainedModelUrlsForSave(save);
  evictModelAssets((url) => !retainedModelUrls.has(url));
  // Build + warm the scene behind a loading screen so the one-time shader/env
  // compile hitch lands off-screen instead of on the first playable frame.
  withLoading(`Entering ${regionName}…`, async (progress) => {
    await preloadAssetGroups(enhancedAssets ? ['terrain', 'env', 'vfx'] : ['terrain'], {
      label: `${regionName} assets`,
      skipModels: true,
      paths: preloadPathsForRegion(save.regionId, enhancedAssets, enhancedAssets),
      onProgress: progress
    });
    if (enhancedAssets) {
      await preloadAssetGroups(['holdout'], {
        label: `${regionName} hero signatures`,
        paths: [...ENABLED_HOLDOUT_SIGNATURES].flatMap((id) => {
          const replacement = holdoutReplacementUrl(id)?.replace('/assets/', '');
          return [`holdouts/${id}.glb`, ...(replacement ? [replacement] : [])];
        }),
        onProgress: progress
      });
      const modelPaths = prewarmModelPathsForSave(save);
      if (modelPaths.length > 0) {
        await preloadAssetGroups(['hero', 'weapon'], {
          label: `${regionName} party models`,
          paths: modelPaths,
          onProgress: progress
        });
      }
    }
    game = new Game(canvas, save);
    game.prewarm();
    (window as unknown as { __game: Game }).__game = game;
    input = new InputController(game, canvas);
    hud = new Hud(game, input, () => {
      teardown();
      boot();
    });
    if (testEnabled()) (window as unknown as { __hud: Hud }).__hud = hud;
    if (debugEnabled()) unmountDebug = mountDebugPanel(game);

    let last = performance.now();
    const frame = (): void => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      input!.update();
      game!.update(dt);
      hud!.update();
    };
    const loop = (): void => {
      rafId = requestAnimationFrame(loop);
      frame();
    };
    rafId = requestAnimationFrame(loop);
    // rAF stops entirely while the tab/view is hidden; keep simulating so the
    // world doesn't freeze mid-fight (Game.update clamps dt internally).
    tickTimer = window.setInterval(() => {
      if (performance.now() - last > 200) frame();
    }, 100);
  });
}

function boot(): void {
  showTitle((save) => startGame(save));
}

const HEADLESS_RENDER = testEnabled() && testRenderHeadless();
const TEST_HUD = testEnabled() && testHudEnabled();

window.addEventListener('ancients:load', (e) => {
  const save = (e as CustomEvent<GameSave>).detail;
  startGame(save, { headless: HEADLESS_RENDER, hud: TEST_HUD });
});

if (testEnabled()) {
  installTestApi({
    getGame: () => game,
    getInput: () => input,
    start: (save, opts) => startGame(save, opts),
    load: (save) => window.dispatchEvent(new CustomEvent('ancients:load', { detail: save })),
    shutdown: teardown,
    headless: HEADLESS_RENDER,
    hud: TEST_HUD,
    updateUi: updateUiOnce
  });
  const region = new URLSearchParams(location.search).get('region') ?? undefined;
  (window as unknown as { __test: { startNewGame: (o: object) => void } }).__test.startNewGame({
    hero: testStarterHero(),
    seed: testSeed(),
    region,
    quality: testQuality(),
    headless: HEADLESS_RENDER
  });
} else {
  boot();
}
