import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Game, newGameSave } from '../systems/game';

beforeAll(() => registerAllContent());

function freshGame(): Game {
  return Game.headless(newGameSave('juggernaut'), { cinematics: true });
}

// ----------------------------------------------------------------
// Test 24: codex/journal state (Phase 6 §3.14)
// ----------------------------------------------------------------
describe('codex/journal state (test 24)', () => {
  it('codex reveals the current region on encounter, but not unvisited ones', () => {
    const g = freshGame();
    const startRegion = g.region.id;
    const ids = g.codexEntries().regions.map((r) => r.id);
    expect(ids, 'current region revealed on encounter').toContain(startRegion);

    const other = [...REG.regions.values()].find((r) => r.id !== startRegion);
    expect(other, 'a second region exists').toBeDefined();
    expect(ids, 'unvisited region stays hidden').not.toContain(other!.id);
  });

  it('hero codex entries gate on encounter (recruit), not on data existence', () => {
    const g = freshGame();
    const stranger = [...REG.heroes.values()].find(
      (h) => !g.recruited.has(h.id) && !g.party.some((r) => r.heroId === h.id)
    )!;
    expect(stranger, 'an unmet hero exists').toBeDefined();
    expect(g.codexEntries().heroes.map((h) => h.id), 'unmet hero hidden').not.toContain(stranger.id);

    // The recruit hook calls exactly this; encountering reveals the entry.
    g.codexUnlock('hero:' + stranger.id);
    expect(g.codexEntries().heroes.map((h) => h.id), 'encountered hero revealed').toContain(stranger.id);
  });

  it('codex shows creeps and raids only after they are encountered', () => {
    const g = freshGame();
    expect(g.codexEntries().raids, 'no raids before clearing').toHaveLength(0);
    g.codexUnlock('raid:roshan-pit');
    g.codexUnlock('creep:kobold');
    const cx = g.codexEntries();
    expect(cx.raids.map((r) => r.id)).toContain('roshan-pit');
    expect(cx.raids[0].title.length, 'raid carries its homage title').toBeGreaterThan(0);
    expect(cx.creeps.map((c) => c.id)).toContain('kobold');
  });

  it('codex unlocks persist across a save round-trip', () => {
    const g = freshGame();
    g.codexUnlock('raid:lord-of-terror');
    const save = g.buildSave();
    expect(save.codexUnlocks).toContain('raid:lord-of-terror');
    const reloaded = Game.headless(save);
    expect(reloaded.codexEntries().raids.map((r) => r.id)).toContain('lord-of-terror');
  });

  it('the Loop lore thread unlocks from story milestones', () => {
    const g = freshGame();
    expect(g.codexEntries().lore.map((l) => l.id)).toEqual(['loop-sundering']);

    g.badges.add('lunar-badge');
    expect(g.codexEntries().lore.map((l) => l.id)).toContain('loop-echoes');

    g.eliteFive.championDown = true;
    expect(g.codexEntries().lore.map((l) => l.id)).toContain('loop-tower');
  });

  it('cutscenes play from registry data and persist seen state', () => {
    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();

    expect(g.playCutscene('bind-stinger', { hero: 'Lich', heroId: 'lich', bark: 'The cold remembers.' })).toBe(true);
    const view = g.cinematic.view();
    expect(view?.title).toBe('Lich Joins');
    expect(view?.text).toBe('The cold remembers.');
    expect(g.buildSave().journalSeen).toContain('cinematic:bind-stinger:Lich');

    // §3.4: the first tap completes the typewriter, the next advances past the last beat.
    g.cinematicAdvance();
    g.cinematicAdvance();
    expect(g.cinematic.active).toBe(false);
  });

  it('seasonal events and legend callouts unlock codex tracks', () => {
    const g = freshGame();
    while (g.cinematic.active) g.cinematicSkip();

    expect(g.runSeasonalEvent('diretide-roshan-candy')).toBe(true);
    expect(g.codexEntries().festivals.map((f) => f.id)).toContain('diretide-roshan-candy');
    expect(g.cinematic.view()?.title).toBe('Roshan Wakes Hungry');
    g.cinematicSkip();

    expect(g.triggerLegendCallout('pit-remembers')).toBe(true);
    expect(g.triggerLegendCallout('pit-remembers')).toBe(false);
    expect(g.codexEntries().legends.map((l) => l.id)).toContain('pit-remembers');
  });

  it('the journal reflects raids, factions, reputation, and elite progress', () => {
    const g = freshGame();
    g.reputation = 12;
    g.factionChoices = { 'nightsilver-woods': 'luna' };
    g.raidProgress = { 'roshan-pit': { clears: 2, dryStreak: 0 } };
    g.eliteFive = { defeated: 3, championDown: false };

    const j = g.journalSections();
    expect(j.reputation).toBe(12);
    expect(j.factions.map((f) => f.heroId)).toContain('luna');
    expect(j.factions[0].regionName, 'faction resolves a real region name').toBe('Nightsilver Woods');
    expect(j.raids.find((r) => r.id === 'roshan-pit')?.clears).toBe(2);
    expect(j.elite.defeated).toBe(3);
  });

  it('marking the journal seen records acknowledgements that persist', () => {
    const g = freshGame();
    g.markJournalSeen(['raid:roshan-pit', 'badge:frost-badge']);
    expect(g.buildSave().journalSeen).toContain('raid:roshan-pit');
    expect(g.buildSave().journalSeen).toContain('badge:frost-badge');
  });
});
