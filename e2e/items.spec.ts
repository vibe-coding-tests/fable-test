import { test, expect } from '@playwright/test';
import { boot, state } from './helpers';

// The starter spawns next to Dawnshade, so the town shop is open immediately.
test.describe('items & loot', () => {
  test('buying Boots of Speed adds the item and raises move speed', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 11 });

    expect((await state(page)).inTown).toBe(true);

    const bought = await page.evaluate(() => {
      const g = (window as any).__game;
      const u = g.activeUnit();
      u.refresh(g.sim.time);
      const msBefore = u.stats.moveSpeed;
      const itemsBefore = u.items.filter((it: any) => it).length;

      (window as any).__test.addGold(2000);
      const goldBefore = g.gold;
      g.buyItem('boots-of-speed');
      // A sim tick would refresh dirtied stats; do it explicitly for the assertion.
      u.markStatsDirty();
      u.refresh(g.sim.time);

      return {
        goldSpent: goldBefore - g.gold,
        hasBoots: u.items.some((it: any) => it && it.defId === 'boots-of-speed'),
        msBefore,
        msAfter: u.stats.moveSpeed,
        itemsBefore,
        itemsAfter: u.items.filter((it: any) => it).length
      };
    });

    expect(bought.hasBoots).toBe(true);
    expect(bought.goldSpent).toBeGreaterThan(0);
    expect(bought.itemsAfter).toBe(bought.itemsBefore + 1);
    expect(bought.msAfter).toBeGreaterThan(bought.msBefore);
  });

  test('selling a bought item returns gold and frees the slot', async ({ page }) => {
    await boot(page, { hero: 'sniper', seed: 12 });

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      (window as any).__test.addGold(3000);
      g.buyItem('broadsword');
      const u = g.activeUnit();
      const slot = u.items.findIndex((it: any) => it && it.defId === 'broadsword');
      const goldBeforeSell = g.gold;
      const countBeforeSell = u.items.filter((it: any) => it).length;
      g.sellItem(slot);
      return {
        slotFound: slot >= 0,
        goldGained: g.gold - goldBeforeSell,
        countAfter: g.activeUnit().items.filter((it: any) => it).length,
        countBefore: countBeforeSell
      };
    });

    expect(result.slotFound).toBe(true);
    expect(result.goldGained).toBeGreaterThan(0);
    expect(result.countAfter).toBe(result.countBefore - 1);
  });

  test('the gated top-tier set is never sold by the shop', async ({ page }) => {
    await boot(page, { seed: 13 });
    const sells = await page.evaluate(() => {
      const g = (window as any).__game;
      // Top-tier power is never vended by any shop (§6).
      return ['divine-rapier', 'scythe-of-vyse', 'aghanims-scepter'].map((id) => g.shopSells(id));
    });
    expect(sells.every((v) => v === false)).toBe(true);
  });
});
