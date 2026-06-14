import { test, expect } from '@playwright/test';
import { boot } from './helpers';

test.describe('story and cinematics', () => {
  test('prologue cinematic overlay controls work through player input', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await boot(page, { hero: 'juggernaut', seed: 202, hud: true });

    await page.waitForFunction(() => {
      const layer = document.getElementById('cinematic-layer');
      return !!layer &&
        !layer.classList.contains('hidden') &&
        layer.textContent?.includes('The Moon Breaks') &&
        layer.querySelector('[data-cinematic="next"]') &&
        layer.querySelector('[data-cinematic="ff"]') &&
        layer.querySelector('[data-cinematic="skip"]');
    }, null, { timeout: 30_000 });

    const initialHandle = await page.waitForFunction(() => (window as any).__game?.cinematic.view(), null, { timeout: 30_000 });
    const initial = await initialHandle.jsonValue() as { id: string; beatIndex: number };
    expect(initial.id).toBe('prologue-moon-breaks');
    expect(initial.beatIndex).toBe(0);
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => ((window as any).__game?.cinematic.view()?.beatIndex ?? 0) > 0, null, { timeout: 5_000 });

    await page.evaluate(() => {
      document.querySelector('[data-cinematic="ff"]')?.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    });
    await page.waitForFunction(() => ((window as any).__game?.cinematic.view()?.speed ?? 1) > 1, null, { timeout: 5_000 });
    await page.evaluate(() => {
      document.querySelector('[data-cinematic="ff"]')?.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    });
    await page.waitForFunction(() => ((window as any).__game?.cinematic.view()?.speed ?? 0) === 1, null, { timeout: 5_000 });

    const skipProgress = await page.evaluate(() => {
      const btn = document.querySelector('[data-cinematic="skip"]');
      if (!btn) throw new Error('skip button missing');
      btn.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      (window as any).__test.step();
      return (window as any).__game.cinematic.view()?.skipProgress ?? 0;
    });
    expect(skipProgress).toBeGreaterThan(0);
    await page.evaluate(() => (window as any).__test.fastForward(1));
    await page.waitForFunction(() => {
      const g = (window as any).__game;
      return g?.cinematic.active === false || g?.cinematic.view()?.id !== 'prologue-moon-breaks';
    }, null, { timeout: 5_000 });
    await page.evaluate(() => {
      document.querySelector('[data-cinematic="skip"]')?.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      const g = (window as any).__game;
      let guard = 0;
      while (g?.cinematic.active && guard++ < 20) g.cinematicSkip();
      (window as any).__test.step();
    });
    await page.waitForFunction(() => document.getElementById('cinematic-layer')?.classList.contains('hidden'), null, { timeout: 5_000 });
    await expect(page.locator('#hero-panel')).toContainText('Facet:');
    await expect(page.locator('#hero-panel')).toContainText(/HP \+\d/);
    await expect(page.locator('#hero-panel')).toContainText(/MP \+\d/);

    expect(errors).toEqual([]);
  });

  test('prologue, gallery, Loop codex, bind scene, and festival intro work in-browser', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await boot(page, { hero: 'juggernaut', seed: 101 });

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const initialView = g.cinematic.view();
      const initialGallery = g.cinematicGallery().flatMap((group: any) => group.entries);

      while (g.cinematic.active) g.cinematicSkip();
      const loopAtStart = g.codexEntries().lore.map((entry: any) => entry.id);

      const bindPlayed = g.playCutscene('bind-first', {
        hero: 'Juggernaut',
        heroId: 'juggernaut',
        bark: 'The blade remembers.'
      });
      const bindView = g.cinematic.view();
      while (g.cinematic.active) g.cinematicSkip();

      const festivalStarted = g.runSeasonalEvent('wraith-night-altar');
      const festivalView = g.cinematic.view();
      const festivals = g.codexEntries().festivals.map((entry: any) => entry.id);

      return {
        initialId: initialView?.id,
        initialTitle: initialView?.title,
        prologueSeenInGallery: initialGallery.some((entry: any) => entry.id === 'prologue-moon-breaks' && entry.seen),
        hasLockedGalleryEntry: initialGallery.some((entry: any) => entry.seen === false && String(entry.title).startsWith('???')),
        loopAtStart,
        bindPlayed,
        bindId: bindView?.id,
        bindText: bindView?.text,
        festivalStarted,
        festivalId: festivalView?.id,
        festivals
      };
    });

    expect(result.initialId).toBe('prologue-moon-breaks');
    expect(result.initialTitle).toContain('Moon Breaks');
    expect(result.prologueSeenInGallery).toBe(true);
    expect(result.hasLockedGalleryEntry).toBe(true);
    expect(result.loopAtStart).toContain('loop-sundering');
    expect(result.bindPlayed).toBe(true);
    expect(result.bindId).toBe('bind-first');
    expect(result.bindText).toContain('The blade remembers.');
    expect(result.festivalStarted).toBe(true);
    expect(result.festivalId).toBe('seasonal-wraith-night-altar');
    expect(result.festivals).toContain('wraith-night-altar');
    expect(errors).toEqual([]);
  });
});
