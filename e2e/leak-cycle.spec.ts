import { test, expect, type Page } from '@playwright/test';
import { boot, expectNoPageErrors, waitForPlayableUi, watchPageErrors } from './helpers';

// Clear any active cut-scene through the game API (no DOM polling). Region
// arrival can fire a story beat; the leak measurement must run on a steady frame.
async function clearCine(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__test?.skipCinematics?.());
}

// OPTIMIZATION 2.0 §D.3 / §G.3: region-cycle leak guard.
//
// Travels A -> B -> A -> B ... within one page session and asserts that the
// module-level asset cache (the cross-scene signal that survives the per-region
// renderer rebuild) and the per-scene renderer object counts stay FLAT rather
// than growing each cycle. main.ts evicts non-retained textures/models on every
// `ancients:load`, scene.ts guards every async load with a scene token and now
// releases the WebGL context on teardown, so a long session that walks the world
// must not climb in GPU memory or live geometries/textures.
const REGION_A = 'tranquil-vale';
const REGION_B = 'nightsilver-woods';
const ROUND_TRIPS = 3;

interface AssetStats {
  gpuTextureBytes: number;
  modelCacheSize: number;
  textureCacheSize: number;
  hdrCacheSize: number;
}
interface CycleSample {
  region: string;
  assets: AssetStats;
  geometries: number;
  textures: number;
}

test.describe('region-cycle leak guard (webgl)', () => {
  test.use({ viewport: { width: 1024, height: 720 } });

  test('asset cache and renderer objects stay flat across A→B→A cycling', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchPageErrors(page);

    // 'low' skips the holdout/hero-model preload chain (flaky under SwiftShader)
    // but still loads per-region terrain textures, so the asset-cache leak signal
    // is intact and the scene builds fast enough to cycle many times.
    await boot(page, { webgl: true, region: REGION_A, seed: 4242, quality: 'low' });
    await waitForPlayableUi(page);
    await clearCine(page);

    const settle = async (region: string): Promise<CycleSample> => {
      // Wait until the freshly-built game reports the target region and the
      // loading overlay is gone, then give async model/texture loads a moment.
      // The scene (terrain/textures) is keyed off regionId, not worldSeed, so
      // repeat visits rebuild the same graph and object counts are comparable.
      await page.waitForFunction(
        (target) => {
          const api = (window as any).__test;
          try {
            if (!api?.ready?.()) return false;
            const loading = document.getElementById('loading-screen');
            const loaded = !loading || getComputedStyle(loading).display === 'none';
            return api.state().regionId === target && loaded;
          } catch {
            return false; // mid-teardown: __game swapped out, retry next poll
          }
        },
        region,
        { timeout: 60_000 }
      );
      await page.waitForTimeout(1200);
      return page.evaluate(() => {
        const api = (window as any).__test;
        const stats = api.perfStats();
        return {
          region: api.state().regionId,
          assets: stats.assets,
          geometries: stats.graphics?.geometries ?? 0,
          textures: stats.graphics?.textures ?? 0
        } as CycleSample;
      });
    };

    const travel = async (region: string): Promise<void> => {
      await page.evaluate((target) => {
        const g = (window as any).__game;
        const save = g.buildSave();
        save.regionId = target;
        save.campRespawn = {};
        save.echoRespawn = {};
        save.groundItemDrops = [];
        save.savedAt = Date.now();
        window.dispatchEvent(new CustomEvent('ancients:load', { detail: save }));
      }, region);
      await settle(region);
      await clearCine(page);
    };

    const samples: CycleSample[] = [];
    samples.push(await settle(REGION_A));
    for (let i = 0; i < ROUND_TRIPS; i++) {
      await travel(REGION_B);
      samples.push(await settle(REGION_B));
      await travel(REGION_A);
      samples.push(await settle(REGION_A));
    }

    // The very first visit warms the caches; compare steady-state visits to it.
    const aVisits = samples.filter((s) => s.region === REGION_A);
    const first = aVisits[0];
    const last = aVisits[aVisits.length - 1];
    expect(aVisits.length).toBeGreaterThanOrEqual(2);

    console.log(
      `[leak-cycle] region-A visits: ` +
        aVisits
          .map((s) => `${Math.round(s.assets.gpuTextureBytes / 1024)}KB/${s.geometries}g/${s.textures}t`)
          .join('  ')
    );

    // GPU texture bytes must not climb cycle over cycle. A small slack absorbs
    // late async loads; a real disposal leak would multiply, not nudge.
    expect(last.assets.gpuTextureBytes).toBeLessThanOrEqual(first.assets.gpuTextureBytes * 1.25 + 256 * 1024);
    // The per-scene renderer rebuilds the same region, so live object counts
    // must return to (near) the same place, not accumulate.
    expect(last.geometries).toBeLessThanOrEqual(first.geometries * 1.25 + 8);
    expect(last.textures).toBeLessThanOrEqual(first.textures * 1.25 + 8);
    // Bounded caches: cycling two regions can't grow the model/texture cache without limit.
    expect(last.assets.modelCacheSize).toBeLessThanOrEqual(first.assets.modelCacheSize + 4);
    expect(last.assets.textureCacheSize).toBeLessThanOrEqual(first.assets.textureCacheSize + 4);

    expectNoPageErrors(errors);
  });
});
