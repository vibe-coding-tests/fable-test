import { test, expect } from '@playwright/test';
import { boot, clearCinematics, state } from './helpers';

test.describe('mechanics', () => {
  test('day/night toggles with the day-time clock', async ({ page }) => {
    await boot(page, { seed: 21 });
    const flips = await page.evaluate(() => {
      const g = (window as any).__game;
      g.dayTime = 0.1;
      const day = g.isNight();
      g.dayTime = 0.8;
      const night = g.isNight();
      return { day, night };
    });
    expect(flips.day).toBe(false);
    expect(flips.night).toBe(true);
  });

  test('resonance can be toggled on and off', async ({ page }) => {
    await boot(page, { seed: 22 });
    const r = await page.evaluate(() => {
      const g = (window as any).__game;
      g.setResonanceEnabled(false);
      const off = g.sim.resonanceEnabled;
      g.setResonanceEnabled(true);
      const on = g.sim.resonanceEnabled;
      return { off, on };
    });
    expect(r.off).toBe(false);
    expect(r.on).toBe(true);
  });

  test('killing wild creeps pays the player gold (reward loop)', async ({ page }) => {
    await boot(page, { seed: 23 });
    // The main loop pauses the sim while the prologue cut-scene plays, so
    // fastForward would never drain the kill-credit events. Clear it first.
    await clearCinematics(page);

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      // Spawn wild creeps next to the hero so the reward loop has hostiles to
      // clear regardless of where camps sit in the current region data.
      const fight = t.spawnWildCreepNearActive({ count: 3 });
      t.fastForward(0.5);
      const goldBefore = g.gold;
      const killed = t.clearHostiles();
      t.fastForward(0.5); // drain kill-credit events -> bounty
      return { spawned: fight?.hostiles ?? 0, killed, goldBefore, goldAfter: g.gold };
    });

    expect(result.spawned).toBeGreaterThan(0);

    expect(result.killed).toBeGreaterThan(0);
    expect(result.goldAfter).toBeGreaterThan(result.goldBefore);
  });

  test('a weakened wild creep becomes capture-eligible', async ({ page }) => {
    await boot(page, { seed: 24 });

    const cap = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.spawnWildCreepNearActive({ count: 3 });
      t.fastForward(0.5);
      // Find a nearby capturable hostile and chunk it down.
      const u = g.activeUnit();
      const target = g.sim.unitsArr.find(
        (c: any) =>
          c.alive &&
          c.team === 1 &&
          c.capturable &&
          Math.hypot(c.pos.x - u.pos.x, c.pos.y - u.pos.y) < 1400
      );
      if (!target) return { found: false, ok: false };
      target.hp = target.stats.maxHp * 0.08;
      const elig = g.captureEligible(target);
      return { found: true, ok: elig.ok, reason: elig.reason ?? null };
    });

    expect(cap.found).toBe(true);
    expect(cap.ok).toBe(true);
  });
});
