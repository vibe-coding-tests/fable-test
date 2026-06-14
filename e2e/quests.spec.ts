import { test, expect } from '@playwright/test';
import { boot, clearCinematics, state } from './helpers';

const MODAL_CARD = '#modal-root:not(.hidden) .modal-card';

// Quest board (QUEST.md): recurring bounties + chained event chapters, tracked
// through the live Game (refreshQuests/advanceQuests/claimQuest) and persisted
// in save v7. Drive it entirely through the headless harness checkpoints
// (__test.advanceQuest + state().quests) plus the __game escape hatch.
test.describe('quests', () => {
  test('a fresh game seeds the board with the no-prereq quests active', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 301 });
    const q = (await state(page)).quests;

    // Whole authored catalogue is registered; nothing is claimed on a new save.
    expect(q.total).toBeGreaterThanOrEqual(9);
    expect(q.claimed).toBe(0);
    // The three prereq-free bounties + the opening chapter unlock immediately.
    expect(q.active).toBeGreaterThanOrEqual(4);
    // Badge/quest-gated entries stay locked until their prereq is met.
    expect(q.locked).toBeGreaterThan(0);

    const ids = q.board.map((b) => b.id);
    expect(ids).toContain('bounty-cull-wilds');
    expect(ids).toContain('chapter-first-light');
    // A badge-gated chapter must not be on the visible board yet.
    expect(ids).not.toContain('chapter-vale-warden');
  });

  test('progressing a bounty to its objective marks it claimable', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 302 });

    await page.evaluate(() =>
      (window as any).__test.advanceQuest({ kind: 'kill-creeps', amount: 12 })
    );

    const q = (await state(page)).quests;
    const cull = q.board.find((b) => b.id === 'bounty-cull-wilds');
    expect(cull).toBeTruthy();
    expect(cull!.status).toBe('complete');
    expect(cull!.claimable).toBe(true);
    expect(q.complete).toBeGreaterThanOrEqual(1);
  });

  test('claiming a recurring bounty pays out and re-arms it', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 303 });

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      t.advanceQuest({ kind: 'kill-creeps', amount: 12 });
      const goldBefore = g.gold;
      const claimed = g.claimQuest('bounty-cull-wilds');
      t.fastForward(1); // let any presentation-deferred reward gold settle
      const board = g.questBoard();
      const cull = board.find((b: any) => b.id === 'bounty-cull-wilds');
      return { claimed, goldBefore, goldAfter: g.gold, status: cull?.status ?? null };
    });

    expect(result.claimed).toBe(true);
    expect(result.goldAfter).toBeGreaterThan(result.goldBefore); // 400g reward
    // Recurring with no cooldown re-arms straight back to active.
    expect(result.status).toBe('active');
  });

  test('claiming an event chapter chains its successor onto the board', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 304 });

    const result = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      t.advanceQuest({ kind: 'recruit-heroes', amount: 1 });
      const claimed = g.claimQuest('chapter-first-light');
      const ids = g.questBoard().map((b: any) => b.id);
      const firstLight = g.quests['chapter-first-light']?.status ?? null;
      return { claimed, firstLight, unlockedSuccessor: ids.includes('chapter-vale-warden') };
    });

    expect(result.claimed).toBe(true);
    // Event chapters are terminal once claimed...
    expect(result.firstLight).toBe('claimed');
    // ...and unlock their `next` via the quest prereq.
    expect(result.unlockedSuccessor).toBe(true);
  });

  test('quest progress survives a save round-trip (v7)', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 305 });

    const restored = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      // Claim the opening chapter so the save carries a claimed + an unlocked quest.
      t.advanceQuest({ kind: 'recruit-heroes', amount: 1 });
      g.claimQuest('chapter-first-light');
      // Partial progress on a bounty that must persist exactly.
      t.advanceQuest({ kind: 'kill-creeps', amount: 5 });

      const save = JSON.parse(JSON.stringify(g.buildSave()));
      t.load(save);
      return { save };
    });
    expect(restored.save.version).toBeGreaterThanOrEqual(7);

    await page.waitForFunction(() => Boolean((window as any).__test?.ready?.()), null, { timeout: 30_000 });

    const after = await page.evaluate(() => {
      const g = (window as any).__game;
      return {
        firstLight: g.quests['chapter-first-light']?.status ?? null,
        cullProgress: g.quests['bounty-cull-wilds']?.progress?.[0] ?? 0,
        valeWardenVisible: g.questBoard().some((b: any) => b.id === 'chapter-vale-warden')
      };
    });

    expect(after.firstLight).toBe('claimed');
    expect(after.cullProgress).toBe(5);
    expect(after.valeWardenVisible).toBe(true);
  });

  // The other specs drive the model directly; this one proves the full UI loop:
  // open the Journal (real HUD over the headless scene), click the Claim button,
  // and confirm the reward landed and the row refreshed.
  test('claiming a bounty from the Journal pays out and refreshes the row', async ({ page }) => {
    await boot(page, { hero: 'juggernaut', seed: 306, hud: true });
    await clearCinematics(page);

    // Drive the bounty to its objective through the harness seam.
    await page.evaluate(() => (window as any).__test.advanceQuest({ kind: 'kill-creeps', amount: 12 }));
    const goldBefore = await page.evaluate(() => (window as any).__game.gold);

    await page.evaluate(() => (document.querySelector('[data-open="journal"]') as HTMLElement | null)?.click());
    await expect(page.locator(MODAL_CARD)).toContainText('Bounties');

    const claimBtn = page.locator('[data-claim-quest="bounty-cull-wilds"]');
    await expect(claimBtn).toBeVisible();
    await claimBtn.click();

    // 400g reward paid, and the re-armed (active) bounty drops its Claim button.
    expect(await page.evaluate(() => (window as any).__game.gold)).toBeGreaterThan(goldBefore);
    await expect(page.locator('[data-claim-quest="bounty-cull-wilds"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__game.quests['bounty-cull-wilds']?.status ?? null)).toBe('active');
  });
});
