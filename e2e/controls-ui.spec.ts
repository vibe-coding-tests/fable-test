import { test, expect, type Page } from '@playwright/test';
import { boot, expectNoPageErrors, skipActiveCinematic, state, waitForPlayableUi, watchPageErrors } from './helpers';

const MODAL_CARD = '#modal-root:not(.hidden) .modal-card';

async function openMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator(MODAL_CARD)).toContainText('Menu');
}

async function focusGame(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__test?.state && (window as any).__game), null, { timeout: 30_000 });
  await waitForPlayableUi(page);
  await page.evaluate(() => window.focus());
}

test.describe('controls + HUD UI', () => {
  test('keyboard shop flow buys and sells through DOM controls', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 8101, hud: true });
    await skipActiveCinematic(page);
    await focusGame(page);
    expect((await state(page)).inTown).toBe(true);

    const before = await page.evaluate(() => {
      const g = (window as any).__game;
      const u = g.activeUnit();
      (window as any).__test.addGold(3000);
      (window as any).__test.addXp(5000);
      u.refresh(g.sim.time);
      return { gold: g.gold, moveSpeed: u.stats.moveSpeed, itemCount: u.items.filter(Boolean).length };
    });
    await skipActiveCinematic(page);

    await page.keyboard.press('b');
    await expect(page.locator(MODAL_CARD)).toContainText('Shop');
    await page.locator('[data-tab="component"]').evaluate((el) => (el as HTMLElement).click());
    await page.locator('[data-buy="boots-of-speed"]').evaluate((el) => (el as HTMLElement).click());

    const bought = await page.evaluate(() => {
      const g = (window as any).__game;
      const u = g.activeUnit();
      u.markStatsDirty();
      u.refresh(g.sim.time);
      return {
        gold: g.gold,
        moveSpeed: u.stats.moveSpeed,
        itemCount: u.items.filter(Boolean).length,
        bootsSlot: u.items.findIndex((it: any) => it?.defId === 'boots-of-speed')
      };
    });
    expect(bought.bootsSlot).toBeGreaterThanOrEqual(0);
    expect(bought.gold).toBeLessThan(before.gold);
    expect(bought.itemCount).toBe(before.itemCount + 1);
    expect(bought.moveSpeed).toBeGreaterThan(before.moveSpeed);
    await skipActiveCinematic(page);

    await page.locator(`[data-sell="${bought.bootsSlot}"]`).evaluate((el) => (el as HTMLElement).click());
    const sold = await page.evaluate(() => {
      const g = (window as any).__game;
      const u = g.activeUnit();
      u.markStatsDirty();
      u.refresh(g.sim.time);
      return {
        gold: g.gold,
        moveSpeed: u.stats.moveSpeed,
        itemCount: u.items.filter(Boolean).length,
        hasBoots: u.items.some((it: any) => it?.defId === 'boots-of-speed')
      };
    });
    expect(sold.hasBoots).toBe(false);
    expect(sold.gold).toBeGreaterThan(bought.gold);
    expect(sold.itemCount).toBe(before.itemCount);
    expect(sold.moveSpeed).toBe(before.moveSpeed);
    expectNoPageErrors(errors);
  });

  test('F5 quick-save writes slot one through the input binding', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'sniper', region: 'icewrack', seed: 8102, hud: true });
    await skipActiveCinematic(page);
    await focusGame(page);
    await page.evaluate(() => {
      localStorage.removeItem('ancients.save.1');
      (window as any).__test.addGold(4321);
    });

    await page.keyboard.press('F5');
    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('ancients.save.1');
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        exists: Boolean(raw),
        version: parsed?.version ?? null,
        gold: parsed?.gold ?? 0,
        regionId: parsed?.regionId ?? null,
        heroId: parsed?.party?.[0] ?? null
      };
    });

    expect(saved.exists).toBe(true);
    expect(saved.version).toBe(9);
    expect(saved.gold).toBeGreaterThanOrEqual(4321);
    expect(saved.regionId).toBe('icewrack');
    expect(saved.heroId).toBe('sniper');
    expectNoPageErrors(errors);
  });

  test('menu settings toggles mutate runtime options and Esc closes cleanly', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'juggernaut', seed: 8103, hud: true });
    await skipActiveCinematic(page);
    await focusGame(page);

    await openMenu(page);
    const initial = await page.evaluate(() => {
      const g = (window as any).__game;
      return { quickcast: g.settings.quickcast, resonance: g.settings.resonance };
    });

    await page.locator('#opt-quickcast').evaluate((el, checked) => {
      const input = el as HTMLInputElement;
      input.checked = checked as boolean;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, !initial.quickcast);
    await page.locator('#opt-resonance').evaluate((el, checked) => {
      const input = el as HTMLInputElement;
      input.checked = checked as boolean;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, !initial.resonance);
    const toggled = await page.evaluate(() => {
      const g = (window as any).__game;
      return {
        quickcast: g.settings.quickcast,
        resonance: g.settings.resonance,
        simResonance: g.sim.resonanceEnabled
      };
    });

    expect(toggled.quickcast).toBe(!initial.quickcast);
    expect(toggled.resonance).toBe(!initial.resonance);
    expect(toggled.simResonance).toBe(!initial.resonance);

    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-root')).toHaveClass(/hidden/);
    const afterClose = await page.evaluate(() => (window as any).__game.paused);
    expect(afterClose).toBe(false);
    expectNoPageErrors(errors);
  });

  test('quickcast off arms targeting; quickcast on casts at the hovered enemy', async ({ page }) => {
    const errors = watchPageErrors(page);
    await boot(page, { hero: 'zeus', seed: 8104, hud: true });
    await skipActiveCinematic(page);
    await focusGame(page);

    const setup = await page.evaluate(() => {
      const g = (window as any).__game;
      const t = (window as any).__test;
      g.settings.quickcast = false;
      const zeus = g.activeUnit();
      zeus.mana = zeus.stats.maxMana;
      zeus.abilities[0].level = 1; // Arc Lightning, unit-target
      t.spawnWildCreepNearActive({ count: 1 });
      const enemy = g.sim.unitsArr.find((u: any) => u.alive && u.team !== zeus.team);
      enemy.ctrl = { kind: 'none' };
      enemy.pos = { x: zeus.pos.x + 120, y: zeus.pos.y };
      enemy.prevPos = { ...enemy.pos };
      enemy.hp = enemy.stats.maxHp;
      g.sim.events.captureAll = true;
      return { enemyUid: enemy.uid };
    });
    expect(await page.evaluate((enemyUid) =>
      (window as any).__test.setInputHover({ uid: enemyUid, ground: { ...(window as any).__game.sim.unit(enemyUid).pos } }),
    setup.enemyUid)).toBe(true);

    await page.keyboard.press('q');
    const armed = await page.evaluate(() => {
      const g = (window as any).__game;
      return {
        targeting: (window as any).__test.inputState()?.targeting,
        casts: g.sim.events.history.filter((e: any) => e.t === 'cast' && e.abilityId === 'zeus-arc').length
      };
    });
    expect(armed.targeting).toMatchObject({ kind: 'ability', slot: 0 });
    expect(armed.casts).toBe(0);

    await page.keyboard.press('Escape');
    await page.evaluate((enemyUid) => {
      const g = (window as any).__game;
      const zeus = g.activeUnit();
      zeus.mana = zeus.stats.maxMana;
      zeus.abilities[0].cooldownUntil = 0;
      g.settings.quickcast = true;
    }, setup.enemyUid);
    expect(await page.evaluate((enemyUid) =>
      (window as any).__test.setInputHover({ uid: enemyUid, ground: { ...(window as any).__game.sim.unit(enemyUid).pos } }),
    setup.enemyUid)).toBe(true);
    await page.keyboard.press('q');
    await page.evaluate(() => (window as any).__test.fastForward(0.4));

    const cast = await page.evaluate((enemyUid) => {
      const g = (window as any).__game;
      const enemy = g.sim.unit(enemyUid);
      return {
        targeting: (window as any).__test.inputState()?.targeting,
        casts: g.sim.events.history.filter((e: any) => e.t === 'cast' && e.abilityId === 'zeus-arc').length,
        enemyDamaged: enemy.hp < enemy.stats.maxHp
      };
    }, setup.enemyUid);
    expect(cast.targeting).toMatchObject({ kind: 'none' });
    expect(cast.casts).toBeGreaterThanOrEqual(1);
    expect(cast.enemyDamaged).toBe(true);
    expectNoPageErrors(errors);
  });
});
