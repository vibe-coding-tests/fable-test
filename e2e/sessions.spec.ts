import { test, expect } from '@playwright/test';
import { boot, clearCinematics, skipActiveCinematic, state, watchPageErrors, expectNoPageErrors } from './helpers';

// Gyms and raids had zero e2e coverage despite the item rehaul routing loot,
// stingers, codex unlocks, and autosave through Game.challengeGym / Game.runRaid.
// Unit tests already prove winnability; the value here is the live in-browser
// integration path (loot delivery, badge/clear state, no crashes). Both need a
// full party of 5, so the new fillParty() checkpoint pads + levels the roster.
test.describe('macro sessions (gym & raid)', () => {
  test('drafts, places, and fights a gym through the HUD', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 53, hud: true });
    await clearCinematics(page);

    await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.fillParty({ heroIds: ['sven', 'sniper', 'lich', 'lina'], level: 30 });
      const loadouts: Record<string, string[]> = {
        juggernaut: ['battlefury', 'blink-dagger'],
        sven: ['crystalys'],
        sniper: ['dragon-lance'],
        lich: ['glimmer-cape'],
        lina: ['kaya']
      };
      for (const rec of g.party) {
        rec.items = [0, 1, 2, 3, 4, 5].map((idx) => loadouts[rec.heroId]?.[idx] ? { id: loadouts[rec.heroId][idx] } : null);
      }
      (window as any).__hud.openGymPrefight('lunar-gym');
      t.step();
    });
    await skipActiveCinematic(page);

    await expect(page.locator('#modal-root:not(.hidden)')).toContainText('Lunar Gym');
    await page.locator('[data-pf="draft"]').click();
    await expect(page.locator('#modal-root:not(.hidden)')).toContainText('Draft & Deploy');

    await page.locator('select[data-draft-item="juggernaut:0"]').selectOption('blink-dagger');
    await page.locator('[data-draft-gambit-preset="juggernaut:aggro"]').click();
    await page.locator('[data-pool="juggernaut"]').click();
    await page.locator('[data-cell="0:4"]').click();
    await page.locator('[data-draft="commit"]').click();

    await expect(page.locator('#modal-root:not(.hidden)')).toContainText('Drafted five');
    await expect(page.locator('[data-pf-edit-draft="juggernaut"]')).toBeVisible();
    await page.locator('[data-pf="live"]').click();
    await page.evaluate(() => (window as any).__test.step());
    await expect(page.locator('#live-gym-bar')).toBeVisible();

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const draft = g.gymDraft('lunar-gym');
      const saved = draft.heroes.find((h: any) => h.heroId === 'juggernaut');
      const live = g.liveGym.playerHeroes().find((u: any) => u.heroId === 'juggernaut');
      return {
        draftItem: saved.items[0],
        draftRules: saved.gambits?.length ?? 0,
        placed: draft.formation.placements.juggernaut,
        liveHasBlink: live.items.some((it: any) => it?.defId === 'blink-dagger'),
        liveRules: live.ctrl.kind === 'gambit' ? live.ctrl.rules.length : 0
      };
    });

    expect(result).toMatchObject({
      draftItem: 'blink-dagger',
      placed: { col: 0, row: 4 },
      liveHasBlink: true
    });
    expect(result.draftRules).toBeGreaterThan(0);
    expect(result.liveRules).toBeGreaterThan(0);
    expectNoPageErrors(errors);
  });

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
    await page.evaluate(() => {
      const t = (window as any).__test;
      const g = (window as any).__game;
      t.fillParty({ heroIds: ['sven', 'sniper', 'lich', 'earthshaker'], level: 30 });

      // Stable raid-clear loadout: mirrors the macro raid unit fixtures instead
      // of relying on the generic fillParty roster, whose items are intentionally empty.
      const loadouts: Record<string, string[]> = {
        'juggernaut': ['black-king-bar', 'battlefury', 'butterfly'],
        'sven': ['black-king-bar', 'assault-cuirass', 'heart-of-tarrasque'],
        'sniper': ['dragon-lance', 'maelstrom', 'crystalys'],
        'lich': ['scythe-of-vyse', 'glimmer-cape', 'aghanims-scepter'],
        'earthshaker': ['blink-dagger', 'black-king-bar', 'assault-cuirass']
      };
      const aggro = [
        { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
        { if: [{ k: 'ability-ready', slot: 1 }], then: { k: 'cast', slot: 1, targetMode: 'focus' } },
        { if: [{ k: 'ability-ready', slot: 2 }], then: { k: 'cast', slot: 2, targetMode: 'focus' } },
        { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
      ];
      for (const rec of g.party) {
        rec.items = [0, 1, 2, 3, 4, 5].map((idx) => loadouts[rec.heroId]?.[idx] ? { id: loadouts[rec.heroId][idx] } : null);
        rec.gambits = aggro;
      }
    });

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
