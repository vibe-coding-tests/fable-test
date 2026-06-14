import { test, expect } from '@playwright/test';
import { boot, state } from './helpers';

// Frost Hollow lives in Icewrack; boot the harness straight into that region.
test.describe('dungeons', () => {
  test('Frost Hollow runs to a full clear and delivers loot', async ({ page }) => {
    await boot(page, { region: 'icewrack', seed: 4242 });

    const s0 = await state(page);
    expect(s0.regionId).toBe('icewrack');

    // Drive the whole descent inside the page: enter, then per room fast-forward
    // a beat, force-clear the spawned pack, and take an exit once one unlocks.
    // Force-clearing keeps the run deterministic regardless of combat balance.
    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const started = g.startDungeon('frost-hollow', 'normal');
      if (!started) return { started: false } as const;

      let guard = 0;
      let exitsTaken = 0;
      // Loot now spawns as ground drops you walk over (loot rehaul), so watch the
      // dungeon-context ground pile grow during the descent instead of the stash.
      let maxGroundDrops = 0;
      const goldBefore = g.gold;
      while (g.liveDungeon && guard++ < 600) {
        t.fastForward(0.6);
        t.clearHostiles();
        maxGroundDrops = Math.max(maxGroundDrops, g.groundItemDrops?.length ?? 0);
        const d = g.liveDungeon;
        if (d && d.exitsUnlocked()) {
          const exits = d.availableExits();
          if (exits.length > 0 && g.chooseDungeonExit(exits[0].index)) exitsTaken++;
        }
      }
      const progress = g.dungeonProgress['frost-hollow'] ?? null;
      return {
        started: true,
        finished: !g.liveDungeon,
        guard,
        exitsTaken,
        clears: progress?.clears ?? 0,
        bestDepth: progress?.bestDepth ?? 0,
        maxGroundDrops,
        // either loot dropped on the ground, or resin ran dry and it converted to gold
        gotLoot: maxGroundDrops > 0 || g.gold > goldBefore
      } as const;
    });

    expect(result.started).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.clears).toBeGreaterThanOrEqual(1);
    expect(result.bestDepth).toBeGreaterThan(0);
    expect(result.gotLoot).toBe(true); // guaranteed room/guardian drops landed

    const s1 = await state(page);
    expect(s1.dungeon).toBeNull();
  });

  test('a dungeon cannot start outside its region', async ({ page }) => {
    await boot(page, { region: 'tranquil-vale', seed: 1 });
    const started = await page.evaluate(() =>
      (window as any).__game.startDungeon('frost-hollow', 'normal')
    );
    expect(started).toBe(false);
    expect((await state(page)).dungeon).toBeNull();
  });
});
