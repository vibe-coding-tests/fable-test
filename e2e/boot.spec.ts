import { test, expect } from '@playwright/test';
import { boot, state } from './helpers';

test.describe('boot', () => {
  test('headless harness boots a fresh game with no page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await boot(page);
    const s = await state(page);

    expect(s.ready).toBe(true);
    expect(s.mode).toBe('headless');
    expect(s.regionId).toBe('tranquil-vale');
    expect(s.party).toHaveLength(1);
    expect(s.party[0].alive).toBe(true);
    expect(s.party[0].maxHp).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('real WebGL renderer boots and sizes the canvas', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await boot(page, { webgl: true });

    const info = await page.evaluate(() => {
      const c = document.getElementById('game-canvas') as HTMLCanvasElement | null;
      const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
      return {
        hasGame: Boolean((window as any).__game),
        width: c?.width ?? 0,
        height: c?.height ?? 0,
        hasGl: Boolean(gl)
      };
    });

    expect(info.hasGame).toBe(true);
    expect(info.width).toBeGreaterThan(0);
    expect(info.height).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
