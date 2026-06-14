import { test, expect } from '@playwright/test';
import { boot } from './helpers';

test.describe('story and cinematics', () => {
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
