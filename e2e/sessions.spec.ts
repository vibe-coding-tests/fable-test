import { test, expect } from '@playwright/test';
import { boot, clearCinematics, state, watchPageErrors, expectNoPageErrors } from './helpers';

// Gyms and raids had zero e2e coverage despite the item rehaul routing loot,
// stingers, codex unlocks, and autosave through Game.challengeGym / Game.runRaid.
// Unit tests already prove winnability; the value here is the live in-browser
// integration path (loot delivery, badge/clear state, no crashes). Both need a
// full party of 5, so the new fillParty() checkpoint pads + levels the roster.
test.describe('macro sessions (gym & raid)', () => {
  test('a full party clears a gym and earns a badge', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 51 });
    await clearCinematics(page);

    const filled = await page.evaluate(() => (window as any).__test.fillParty({ level: 30 }));
    expect(filled).toBe(5);

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      const before = g.badges.size;
      let attempts = 0;
      let won = false;
      // Re-seed across attempts (match seed folds in playtime) so a maxed five
      // converges on a win the way the headless gym unit test does.
      while (!won && attempts++ < 14) {
        t.fastForward(1);
        g.challengeGym('lunar-gym');
        if (g.badges.size > before) won = true;
      }
      return { won, attempts, badges: g.badges.size };
    });

    expect(result.won).toBe(true);
    expect(result.badges).toBeGreaterThanOrEqual(1);
    expectNoPageErrors(errors);
  });

  test('a full party clears a raid and the clear is recorded with loot', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 52 });
    await clearCinematics(page);
    await page.evaluate(() => (window as any).__test.fillParty({ level: 30 }));

    const result = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      let attempts = 0;
      let won = false;
      while (!won && attempts++ < 14) {
        t.fastForward(1);
        const r = g.runRaid('roshan-pit', 'normal');
        if (r.won) won = true;
      }
      return {
        won,
        attempts,
        clears: g.raidProgress['roshan-pit']?.clears ?? 0,
        // Clearing the boss is the encounter that unlocks its codex entry and
        // (for Roshan) banks the one-use Aegis — proves the loot/codex path ran.
        codexUnlocked: g.codexUnlocks.has('raid:roshan-pit'),
        aegisHeld: g.raidProgress['roshan-pit']?.aegisHeld ?? false
      };
    });

    expect(result.won).toBe(true);
    expect(result.clears).toBeGreaterThanOrEqual(1);
    expect(result.codexUnlocked).toBe(true);
    expectNoPageErrors(errors);
  });
});
