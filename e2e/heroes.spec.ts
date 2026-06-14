import { test, expect } from '@playwright/test';
import { boot, state } from './helpers';

const STARTERS = ['juggernaut', 'crystal-maiden', 'sniper'];

test.describe('heroes', () => {
  for (const hero of STARTERS) {
    test(`starter ${hero} spawns at level 1, alive, with stats`, async ({ page }) => {
      await boot(page, { hero, seed: 100 });
      const s = await state(page);
      expect(s.party[0].heroId).toBe(hero);
      expect(s.party[0].level).toBe(1);
      expect(s.party[0].alive).toBe(true);
      expect(s.party[0].maxHp).toBeGreaterThan(0);
      expect(s.party[0].maxMana).toBeGreaterThan(0);
    });
  }

  test('gaining XP levels the hero up and grows max HP', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 1 });
    const before = (await state(page)).party[0];

    await page.evaluate(() => (window as any).__test.addXp(50_000));
    const after = (await state(page)).party[0];

    expect(after.level).toBeGreaterThan(before.level);
    expect(after.maxHp).toBeGreaterThan(before.maxHp);
  });

  test('learned abilities can be cast without throwing', async ({ page }) => {
    await boot(page, { hero: 'crystal-maiden', seed: 7 });
    // Level up so abilities auto-learn, then issue casts at a point/self.
    const ok = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.addXp(80_000);
      const u = g.activeUnit();
      const point = { x: u.pos.x + 300, y: u.pos.y };
      for (let slot = 0; slot < 4; slot++) {
        g.castAbility(slot, { point });
      }
      t.fastForward(1);
      return g.activeUnit().alive;
    });
    expect(ok).toBe(true);
    expect((await state(page)).ready).toBe(true);
  });
});
