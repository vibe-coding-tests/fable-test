import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

// Thin wrappers over the in-page ?test harness (src/systems/test-harness.ts).
// All gameplay assertions go through window.__test / window.__game, which the
// harness installs on boot.

export interface BootOpts {
  hero?: string;
  region?: string;
  seed?: number;
  debug?: boolean;
  /** Use the real WebGL renderer instead of the headless scene. */
  webgl?: boolean;
  /** Mount the real HUD over the headless scene for DOM/control tests. */
  hud?: boolean;
  /** Graphics quality override. 'low' skips the heavy env/vfx/holdout/party-model
   *  preload chain, so the WebGL boot is much faster for UI-focused smoke tests. */
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
}

export interface PartyMember {
  heroId: string;
  level: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  moveSpeed: number;
  itemCount: number;
}

export interface GameState {
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
  party: PartyMember[];
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
  quests: {
    total: number;
    locked: number;
    active: number;
    complete: number;
    claimed: number;
    cooldown: number;
    board: { id: string; status: string; claimable: boolean }[];
  };
}

/** Navigate to the game in test mode and wait for the harness to be live. */
export async function boot(page: Page, opts: BootOpts = {}): Promise<void> {
  const q = new URLSearchParams({ test: '1' });
  if (!opts.webgl) q.set('render', 'headless');
  if (opts.hud) q.set('hud', '1');
  if (opts.debug) q.set('debug', '1');
  if (opts.hero) q.set('hero', opts.hero);
  if (opts.region) q.set('region', opts.region);
  if (opts.seed !== undefined) q.set('seed', String(opts.seed));
  if (opts.quality) q.set('quality', opts.quality);
  await page.goto('/?' + q.toString());
  await page.waitForFunction(() => Boolean((window as any).__test?.ready?.()), null, {
    timeout: 60_000
  });
}

export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export function expectNoPageErrors(errors: string[]): void {
  expect(errors).toEqual([]);
}

export async function waitForPlayableUi(page: Page): Promise<void> {
  await page.locator('#top-bar .region').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading-screen');
    return Boolean((window as any).__game) || !loading || getComputedStyle(loading).display === 'none';
  }, null, { timeout: 60_000 });
}

/**
 * Headless-safe cinematic clear. The game loop early-returns while a cut-scene
 * is active, so `fastForward` does NOT advance the sim until the cinematic is
 * gone. Any headless spec that steps combat/time must call this right after
 * `boot`. Prefer this over `skipActiveCinematic` (which also pokes the DOM) for
 * pure `render=headless` specs.
 */
export async function clearCinematics(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__test?.ready?.()), null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__test.skipCinematics());
}

export async function skipActiveCinematic(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__game), null, { timeout: 30_000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    const clear = () => {
      let guard = 0;
      while (g?.cinematic?.active && guard++ < 100) g.cinematicSkip();
      g?.cinematic?.clear?.();
      const layer = document.getElementById('cinematic-layer');
      if (layer) {
        layer.classList.add('hidden');
        layer.innerHTML = '';
      }
    };
    clear();
    (window as any).__test.step();
    clear();
  });
  await page.waitForFunction(() => {
    const g = (window as any).__game;
    let guard = 0;
    while (g?.cinematic?.active && guard++ < 100) g.cinematicSkip();
    g?.cinematic?.clear?.();
    const layer = document.getElementById('cinematic-layer');
    if (layer && !g?.cinematic?.active) {
      layer.classList.add('hidden');
      layer.innerHTML = '';
    }
    return !g?.cinematic?.active;
  }, null, {
    timeout: 10_000
  });
}

export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<string> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  return path;
}

/**
 * Screenshot a single element (its bounding box) rather than the whole page.
 *
 * Under the software (SwiftShader) renderer a full-page capture composites the
 * live WebGL canvas, which is very slow. For DOM-overlay states (modals/panels)
 * the canvas behind them is irrelevant, so capturing just the element is both
 * faster and produces a tighter, more useful artifact.
 */
export async function attachElementScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  target: string | Locator
): Promise<string> {
  const locator = typeof target === 'string' ? page.locator(target) : target;
  const path = testInfo.outputPath(`${name}.png`);
  await locator.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
  return path;
}

export async function state(page: Page): Promise<GameState> {
  return page.evaluate(() => (window as any).__test.state() as GameState);
}

/** Advance game time synchronously by `seconds` (no real-time wait). */
export async function fastForward(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => (window as any).__test.fastForward(s), seconds);
}
