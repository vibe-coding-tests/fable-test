import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { ALL_ITEMS } from '../data/items';
import { ALL_BOSSES } from '../data/bosses';
import { ALL_RAIDS } from '../data/raids';
import { ALL_DUNGEONS } from '../data/dungeons';
import { REG } from '../core/registry';
import type { ItemDropTable, ItemRarity } from '../core/types';

// ============================================================
// GAMEPLAY_2.0_REHAUL §3.3 acceptance: "every Immortal has an efficient home
// boss" (and raid/dungeon). This is the verifiable contract behind the themed
// drop tables — if a prestige core is ever added without a combat source, this
// fails instead of the item silently becoming unobtainable.
// ============================================================

beforeAll(() => registerAllContent());

/** Items that intentionally have no themed pool home: scripted Roshan repeat drops. */
const SCRIPTED_DROPS = new Set(['refresher-shard', 'cheese']);

function tablePoolIds(table: ItemDropTable): string[] {
  const ids: string[] = [...(table.guaranteed ?? [])];
  for (const slot of table.slots ?? []) for (const p of slot.pool) ids.push(p.id);
  return ids;
}

function combatHomeIds(): Set<string> {
  const home = new Set<string>();
  for (const b of ALL_BOSSES) {
    for (const id of b.loot.guaranteed ?? []) home.add(id);
    for (const id of b.loot.assembledPool ?? []) home.add(id);
  }
  for (const r of ALL_RAIDS) {
    for (const id of r.loot.guaranteed ?? []) home.add(id);
    for (const id of r.loot.assembledPool ?? []) home.add(id);
  }
  for (const d of ALL_DUNGEONS) {
    for (const table of Object.values(d.loot)) for (const id of tablePoolIds(table)) home.add(id);
  }
  return home;
}

describe('§3.3: every prestige core has an efficient combat home', () => {
  it('routes each Immortal/Arcana item to at least one boss, raid, or dungeon source', () => {
    const home = combatHomeIds();
    const prestige: ItemRarity[] = ['immortal', 'arcana'];
    const orphans = ALL_ITEMS
      .filter((it) => prestige.includes(it.rarity ?? 'rare') && !SCRIPTED_DROPS.has(it.id))
      .map((it) => it.id)
      .filter((id) => !home.has(id));
    expect(orphans, `prestige items with no themed combat source: ${orphans.join(', ')}`).toEqual([]);
  });

  it('gives crit/attack carry bosses a Daedalus home (2.0 §3.3 example)', () => {
    // a representative agility carry boss should be able to drop the crit cores
    const pa = REG.boss('boss-phantom-assassin');
    for (const core of ['daedalus', 'monkey-king-bar', 'mjollnir']) {
      expect(pa.loot.assembledPool, `PA boss drops ${core}`).toContain(core);
    }
  });

  it('themes every boss with a non-empty assembled pool of real items', () => {
    for (const b of ALL_BOSSES) {
      expect(b.loot.assembledPool.length, `${b.id} has an assembled pool`).toBeGreaterThan(0);
      for (const id of b.loot.assembledPool) {
        expect(REG.items.has(id), `${b.id} anchor ${id} resolves`).toBe(true);
      }
    }
  });
});
