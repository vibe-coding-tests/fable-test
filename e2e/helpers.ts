import type { Page } from '@playwright/test';

// Thin wrappers over the in-page ?test harness (src/systems/test-harness.ts).
// All gameplay assertions go through window.__test / window.__game, which the
// harness installs on boot.

export interface BootOpts {
  hero?: string;
  region?: string;
  seed?: number;
  /** Use the real WebGL renderer instead of the headless scene. */
  webgl?: boolean;
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
}

/** Navigate to the game in test mode and wait for the harness to be live. */
export async function boot(page: Page, opts: BootOpts = {}): Promise<void> {
  const q = new URLSearchParams({ test: '1' });
  if (!opts.webgl) q.set('render', 'headless');
  if (opts.hero) q.set('hero', opts.hero);
  if (opts.region) q.set('region', opts.region);
  if (opts.seed !== undefined) q.set('seed', String(opts.seed));
  await page.goto('/?' + q.toString());
  await page.waitForFunction(() => Boolean((window as any).__test?.ready?.()), null, {
    timeout: 30_000
  });
}

export async function state(page: Page): Promise<GameState> {
  return page.evaluate(() => (window as any).__test.state() as GameState);
}

/** Advance game time synchronously by `seconds` (no real-time wait). */
export async function fastForward(page: Page, seconds: number): Promise<void> {
  await page.evaluate((s) => (window as any).__test.fastForward(s), seconds);
}
