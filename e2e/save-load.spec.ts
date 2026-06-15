import { test, expect } from '@playwright/test';
import { boot, clearCinematics, state } from './helpers';

// Save format is at v9. Round-trip the whole thing through real localStorage + a page reload
// — the path a player actually exercises — not just an in-memory buildSave/migrate
// unit test.
test.describe('save & load', () => {
  test('a manual slot save survives a page reload', async ({ page }) => {
    await boot(page, { hero: 'sniper', seed: 41, region: 'icewrack' });
    await clearCinematics(page);

    // Mutate state to something distinct from a fresh boot, then save to slot 1.
    const saved = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.addGold(7777);
      t.addXp(60_000);
      const ok = g.saveToSlot(0); // slot index 0 -> "ancients.save.1"
      const raw = localStorage.getItem('ancients.save.1');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        ok,
        version: parsed?.version ?? null,
        gold: Math.round(g.gold),
        regionId: g.region.id,
        heroId: g.party[0].heroId,
        level: g.party[0].level
      };
    });

    expect(saved.ok).toBe(true);
    expect(saved.version).toBe(9);
    expect(saved.gold).toBeGreaterThanOrEqual(7777);

    // Hard reload: the auto-boot starts a *fresh* game, proving the restore comes
    // from storage and not leftover in-memory state.
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).__test?.ready?.()), null, { timeout: 30_000 });

    const fresh = await state(page);
    expect(fresh.gold).not.toBe(saved.gold); // fresh game, not the saved one

    // Load the persisted slot back through the normal load event path.
    await page.evaluate(() => {
      const raw = localStorage.getItem('ancients.save.1');
      const parsed = JSON.parse(raw!);
      (window as any).__test.load(parsed);
    });
    await page.waitForFunction(
      (want) => {
        const g = (window as any).__game;
        return Boolean(g) && g.region?.id === want;
      },
      saved.regionId,
      { timeout: 30_000 }
    );

    const restored = await state(page);
    expect(restored.regionId).toBe(saved.regionId);
    expect(restored.gold).toBe(saved.gold);
    expect(restored.party[0].heroId).toBe(saved.heroId);
    expect(restored.party[0].level).toBe(saved.level);
  });
});
