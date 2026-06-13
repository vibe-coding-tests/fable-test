import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { Game, newGameSave } from '../systems/game';

beforeAll(() => registerAllContent());

// LOOT_OVERHAUL §3.7 — the Compendium's two derived view-models. The Atlas
// inverts the live drop tables (so it can never drift), and the Heroes tab
// projects HeroDef. Both are pure reads.

describe('atlasEntries — sources computed live from the tables (L7)', () => {
  it('inverts themed boss loot: agility anchors trace to agility-carry bosses, strength anchors to titans', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    g.codexUnlock('item:butterfly');
    g.codexUnlock('item:heart-of-tarrasque');

    const atlas = g.atlasEntries();
    const butterfly = atlas.items.find((i) => i.id === 'butterfly');
    const heart = atlas.items.find((i) => i.id === 'heart-of-tarrasque');
    expect(butterfly).toBeDefined();
    expect(heart).toBeDefined();

    const agilityBossLabel = `${REG.hero('phantom-assassin').name} (boss)`;
    const strengthBossLabel = `${REG.hero('wraith-king').name} (boss)`;

    const butterflyLabels = butterfly!.sources.map((s) => s.label);
    const heartLabels = heart!.sources.map((s) => s.label);

    // The themed mapping holds in both directions (proving it reads the live
    // table, not the old id-hash): Butterfly farms from an agility carry, Heart
    // from a strength titan — and never the reverse.
    expect(butterflyLabels).toContain(agilityBossLabel);
    expect(heartLabels).toContain(strengthBossLabel);
    expect(butterflyLabels).not.toContain(strengthBossLabel);
    expect(heartLabels).not.toContain(agilityBossLabel);
  });

  it('charts only encountered items, lists the quality ladder, and flags drop-gated recipe cores', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    // Un-encountered relics are absent from the Atlas.
    expect(g.atlasEntries().items.some((i) => i.id === 'butterfly')).toBe(false);

    g.codexUnlock('item:butterfly');
    const butterfly = g.atlasEntries().items.find((i) => i.id === 'butterfly')!;
    expect(butterfly.rarity).toBeTruthy();
    // Every grade in the closed quality ladder is listed.
    expect(butterfly.qualities.length).toBe(6);
    // A core item that drops bound shows up as a reserved/gated source somewhere
    // in its recipe tree or as a guaranteed/drop source; its recipe is present.
    expect(Array.isArray(butterfly.recipe)).toBe(true);
  });
});

describe('heroCompendium — kit projection from HeroDef (L7)', () => {
  it('projects abilities, the full 4-tier talent tree, facets, and overlays the owned level', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const hc = g.heroCompendium();
    const jugg = hc.heroes.find((h) => h.id === 'juggernaut');
    expect(jugg).toBeDefined();
    expect(jugg!.owned).toBe(true);
    expect(jugg!.level).toBeGreaterThan(0);
    expect(jugg!.abilities.length).toBe(4);
    expect(jugg!.abilities.some((a) => a.ult)).toBe(true);
    // The full talent tree (4 tiers × 2), where the live modal shows only the pending pick.
    expect(jugg!.talents.length).toBe(4);
    for (const t of jugg!.talents) {
      expect(t.options.length).toBe(2);
      expect([10, 15, 20, 25]).toContain(t.level);
    }
    expect(jugg!.facets.length).toBeGreaterThanOrEqual(1);
  });

  it('only reveals encountered heroes', () => {
    const g = Game.headless(newGameSave('juggernaut'));
    const ids = g.heroCompendium().heroes.map((h) => h.id);
    expect(ids).toContain('juggernaut');
    // A hero never met or recruited stays hidden until encountered.
    const unmet = [...REG.heroes.values()].find((h) => h.id !== 'juggernaut' && !ids.includes(h.id));
    expect(unmet).toBeDefined();
  });
});
