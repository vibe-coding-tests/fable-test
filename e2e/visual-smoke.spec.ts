import { test, expect, type Page } from '@playwright/test';
import {
  attachElementScreenshot,
  attachScreenshot,
  boot,
  expectNoPageErrors,
  skipActiveCinematic,
  waitForPlayableUi,
  watchPageErrors
} from './helpers';

const MODAL_CARD = '#modal-root:not(.hidden) .modal-card';

async function closeModal(page: Page): Promise<void> {
  await page.evaluate(() => (document.querySelector('#modal-close') as HTMLElement | null)?.click());
  await page.waitForFunction(() => !document.querySelector('#modal-root:not(.hidden) .modal-card'), null, {
    timeout: 10_000
  });
}

test.describe('visual smoke', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('captures major player-facing states @visual', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = watchPageErrors(page);

    // 'low' quality skips the env/vfx/holdout/party-model preload chain that
    // otherwise gates boot; this smoke test only asserts UI states, not fidelity.
    await boot(page, { webgl: true, hero: 'juggernaut', seed: 2026, quality: 'low' });
    await waitForPlayableUi(page);
    await expect(page.locator('#cinematic-layer')).toBeVisible();
    await attachScreenshot(page, testInfo, '01-cinematic-prologue');

    await skipActiveCinematic(page);
    await expect(page.locator('#hero-panel')).toContainText('Juggernaut');
    await expect(page.locator('#hero-panel')).toContainText('Facet:');
    await expect(page.locator('#hero-panel')).toContainText(/HP \+\d/);
    await expect(page.locator('#hero-panel')).toContainText(/MP \+\d/);
    await attachScreenshot(page, testInfo, '02-overworld-hud');
    await page.waitForFunction(() => Boolean((window as any).__test?.ready?.()), null, { timeout: 30_000 });

    await page.evaluate(() => {
      const g = (window as any).__test.game();
      const u = g.activeUnit() ?? g.party?.[0]?.unit;
      u.pos = { ...g.region.town.pos };
      u.prevPos = { ...g.region.town.pos };
      (window as any).__test.step();
    });
    await expect.poll(async () => (await page.evaluate(() => (window as any).__test.game().inTown()))).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true })));
    await expect(page.locator(MODAL_CARD)).toContainText('Shop');
    await attachElementScreenshot(page, testInfo, '03-town-shop', MODAL_CARD);
    await closeModal(page);

    await page.evaluate(() => (document.querySelector('[data-open="journal"]') as HTMLElement | null)?.click());
    await expect(page.locator(MODAL_CARD)).toContainText('Quest Journal');
    await attachElementScreenshot(page, testInfo, '04-quest-journal', MODAL_CARD);
    await closeModal(page);

    await page.evaluate(() => (document.querySelector('[data-open="codex"]') as HTMLElement | null)?.click());
    await expect(page.locator(MODAL_CARD)).toContainText('Compendium');
    await attachElementScreenshot(page, testInfo, '05-compendium', MODAL_CARD);
    await closeModal(page);

    expectNoPageErrors(errors);
  });
});
