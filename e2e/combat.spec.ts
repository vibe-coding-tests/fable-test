import { test, expect } from '@playwright/test';
import { boot, clearCinematics } from './helpers';

// The cast pipeline (actions.ts / gestures.ts / combat.ts) changed a lot in the
// recent passes, but the only existing ability coverage just checked "casting
// doesn't throw". This proves the real contract: an active cast deducts mana,
// starts its cooldown, is blocked while on cooldown, and recovers afterward.
test.describe('combat — ability mana & cooldown', () => {
  test('an active cast deducts mana, goes on cooldown, then recovers', async ({ page }) => {
    await boot(page, { hero: 'crystal-maiden', seed: 31 });
    await clearCinematics(page);

    const r = await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.addXp(120_000); // max level so every ability is learned
      const u = g.activeUnit();
      const sim = g.sim;
      const point = { x: u.pos.x + 250, y: u.pos.y };

      // Find the first learned ability that actually fires an active cast:
      // cast it and keep the one whose cooldown advances past now (skips
      // passives/toggles and target-only abilities that no-op on a bare point).
      let slot = -1;
      let manaBefore = 0;
      let manaAfter = 0;
      for (let i = 0; i < u.abilities.length; i++) {
        if (u.abilities[i].level <= 0) continue;
        u.mana = u.stats.maxMana;
        if (!u.abilityReady(i, sim.time).ok) continue;
        const mb = u.mana;
        g.castAbility(i, { point });
        t.fastForward(0.7);
        if (u.abilities[i].cooldownUntil > sim.time) {
          slot = i;
          manaBefore = mb;
          manaAfter = u.mana;
          break;
        }
      }
      if (slot < 0) return { slot };

      const onCooldown = u.abilities[slot].cooldownUntil > sim.time;
      const recastReady = u.abilityReady(slot, sim.time);

      // Top mana back up and wait out the cooldown; it should arm again.
      u.mana = u.stats.maxMana;
      t.fastForward(40);
      const readyAgain = u.abilityReady(slot, sim.time);

      return { slot, manaBefore, manaAfter, onCooldown, recastReason: recastReady.reason ?? null, recastOk: recastReady.ok, readyAgainOk: readyAgain.ok };
    });

    expect(r.slot).toBeGreaterThanOrEqual(0);
    expect(r.manaAfter).toBeLessThan(r.manaBefore!); // mana was spent
    expect(r.onCooldown).toBe(true);
    expect(r.recastOk).toBe(false); // blocked while on cooldown
    expect(r.recastReason).toBe('cooldown');
    expect(r.readyAgainOk).toBe(true); // recovered after the cooldown elapsed
  });
});
