import { test, expect } from '@playwright/test';
import { boot, expectNoPageErrors, skipActiveCinematic, waitForPlayableUi, watchPageErrors } from './helpers';

const PERF_ENABLED = process.env.PERF_SMOKE === '1';
const SAMPLE_SECONDS = readPositiveNumber(process.env.PERF_SMOKE_SECONDS, 60);
const WARMUP_SECONDS = readPositiveNumber(process.env.PERF_SMOKE_WARMUP_SECONDS, 3);
const UNIT_COUNTS = readUnitCounts(process.env.PERF_SMOKE_UNITS ?? '30,60');

test.describe('browser perf smoke', () => {
  test.skip(!PERF_ENABLED, 'manual OPTIMIZATION 2.0 browser baseline; run with npm run test:e2e:perf');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('records graphics HUD baselines @perf', async ({ page }, testInfo) => {
    test.setTimeout((45 + (WARMUP_SECONDS + SAMPLE_SECONDS + 10) * UNIT_COUNTS.length) * 1000);
    const errors = watchPageErrors(page);

    await boot(page, { webgl: true, debug: true, hero: 'juggernaut', seed: 2026 });
    await waitForPlayableUi(page);
    await skipActiveCinematic(page);
    await page.locator('#debug-panel [data-d-stats]').waitFor({ state: 'visible', timeout: 30_000 });

    for (const units of UNIT_COUNTS) {
      const fight = await page.evaluate((unitCount) => {
        const api = (window as any).__test;
        return api.spawnPerfFight({ units: unitCount, creepId: 'kobold', radius: 560 });
      }, units);
      expect(fight).not.toBeNull();
      expect(fight.totalUnits).toBe(units);

      await page.waitForTimeout(WARMUP_SECONDS * 1000);
      await page.evaluate(() => (window as any).__test.resetGraphicsStats());
      await page.waitForTimeout(SAMPLE_SECONDS * 1000);

      const stats = await page.evaluate(() => (window as any).__test.perfStats());
      expect(stats.graphics).not.toBeNull();
      expect(stats.graphics.frameMsP95).toBeGreaterThan(0);
      expect(stats.graphics.drawCalls).toBeGreaterThan(0);

      const record = {
        route: 'browser-perf-smoke',
        units,
        sampleSeconds: SAMPLE_SECONDS,
        warmupSeconds: WARMUP_SECONDS,
        fight,
        ...stats
      };
      const body = JSON.stringify(record, null, 2);
      await testInfo.attach(`perf-${units}-units.json`, {
        body,
        contentType: 'application/json'
      });
      console.log(
        `[perf-smoke] ${units} units: ` +
          `${stats.graphics.frameMsAvg.toFixed(1)} avg / ${stats.graphics.frameMsP95.toFixed(1)} p95 ms, ` +
          `${stats.graphics.drawCalls} draw, ${Math.round(stats.graphics.triangles / 1000)}k tri, ` +
          `${stats.graphics.textures} tex, ${stats.graphics.programs ?? '?'} programs, ` +
          `dpr ${stats.graphics.dpr.toFixed(2)}, ` +
          `assets ${formatBytes(stats.assets.loadedBytes)} / ${formatBytes(stats.assets.manifestBytes)}`
      );
    }

    expectNoPageErrors(errors);
  });
});

function readPositiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readUnitCounts(raw: string): number[] {
  const counts = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= 2)
    .map((n) => Math.floor(n));
  return counts.length > 0 ? counts : [30, 60];
}

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
}
