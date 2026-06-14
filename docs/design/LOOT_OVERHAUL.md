# LOOT OVERHAUL — items, drops, rarity, quality, and the gold-vs-loot economy

How a finite Dota item set becomes a real looter without leaving Dota's element. Companion to `SPEC.md` (the design target, especially §4 World & Progression / Raids, §5 Roster & Items, §6 Micro Combat), `DECISIONS.md` (calls already made, especially the M4 economy rows), `COMBAT_OVERHAUL.md` (the live-combat side), and `PROGRESS.md` (what shipped).

> **Addendum:** `MARQUEE_AND_ARMORY_ADDENDUM.md` extends this doc with a second wave of marquee homage bosses/raids (more curated chase) and the **L8** Armory collection layer (gearing the 65-hero bench from one screen, building on the shipped L2 bind-and-move).

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays untouched in its resolution layer.** It never imports `three`, never touches the DOM, and stays deterministic for a seed. The drop roller is a pure seeded function alongside `rollLoot`; rarity, quality, and item-appearance metadata stay data the renderer reads, never the sim (`SPEC.md` §1.1). Everything here is additive and reversible, the way Resonance and the combat context were: the existing loot paths (`rollLoot`, `scaledBounty`, neutral drops, the gated-shop guard) stay the tested system of record, and new tables wrap them rather than replace them. `boundary.test.ts` stays green.

---

## STATUS — 2026-06-14 (as built)

**The whole overhaul shipped.** Every phase L0–L7 landed, plus the L8 Armory addendum and later loot-pacing work, and the cross-cutting gates hold: `npm test` and `npm run build` are green, `rollLoot` keeps its signature as a wrapper, and `boundary.test.ts` stays green (the core never reads rarity or quality). Section 0 below is preserved as the *pre-overhaul baseline that motivated the work* — its three findings ("most drops are gold," "boss tables are an id-hash," "gold inflates") were true when this was written and have since been fixed. The rest of the doc reads as the design of record for the system that now exists.

What's live, by slice:

- **L0 — the drop-table keystone: done.** `src/core/types.ts` carries `ItemRarity` / `ItemQuality` / `DropSource` / `ItemDropTable` / `DropSlot` / `DropEntry` (plus `ItemDef.rarity`/`exclusiveTo`, `ItemSave.quality`/`bound`/`inscribedKills`, `CreepDef.drops`). `rollItemDrops` lives in `src/core/phase3.ts`; `rollLoot` is now a thin wrapper over it (`lootTableToDropTable`), so every shipped boss/raid table rolls identically. Seeded, headless, deterministic.
- **L1 — drops on creeps: done.** `src/data/creep-drops.ts` defaults a table by creep tier; `rollItemDropsForCreep` runs in the kill path beside the preserved neutral roll, with an extra `rollEliteCreepDrop` for elite variants. Overworld kills roll at the region's combat tier.
- **L2 + L8 — bind to a hero and the Armory: done.** Top-tier drops carry `ItemSave.bound`; `sellItem` refuses a bound item and returns it to the Armory (`inventoryStash`) instead of minting gold. The L8 addendum widened it to the whole bench: `armoryView()`, per-hero equip/reclaim, saved `loadouts`, `gearFieldLoadouts`, contention reporting, all behind the v6 save migration.
- **L3 — curated chase and reserved sources: done.** `data/bosses.ts` `themedLoot` anchors items by the boss's attribute lane (agility → Butterfly/Skadi, strength → Heart/Assault, intelligence → Scythe/Refresher/Aghs); every item resolves a rarity; `exclusiveTo` reservations are enforced by one shared source predicate used by shops and the Black Market; owned-hero echoes drop attribute-themed components.
- **L4 — the gold rebalance: done.** The Black Market gamble vendor (`blackMarketRecipeWheel`, `blackMarketRelicWheel`) with the Legendary relic ceiling and escalating in-visit cost; bound-dupe salvage into `essence`; recipe re-tier so anchors need a drop-gated core; the faucet retune in `tuning.ts` (deepest `regionRewardMult` and `postCapXpToGold` pulled down).
- **L5 — quality: done.** `src/data/quality.ts` ships the six grades (Standard/Inscribed/Genuine/Frozen/Corrupted/Unusual) as bounded `StatModMap` deltas summed through `unit.aggregateMods`; `qualityOdds` on drop slots is luck-at-source; Inscribed banks the holder's kills (`creditInscribedKills`, capped); `upgradeArmoryItemQuality` spends essence + gold for the deterministic grind path.
- **L6 — readability and feedback: done.** The Valve rarity palette + quality colors in `data/quality.ts`, rarity-tinted loot toasts across every source, quality borders, and the loot filter (`src/systems/loot-filter.ts`).
- **L7 — the Compendium: done.** `atlasEntries()` inverts every drop table / shop list / gamble pool into an item-sourced Atlas; `heroCompendium()` projects `HeroDef` (abilities + full talent/facet/Aghs tree); both are pure view-models surfaced in the codex (`K`) hub. Covered by `src/test/compendium.test.ts`.

Beyond the original phasing: per-band **loot pacing** with an EG rarity split (`TUNING.loot.egRaritySplit`, `src/test/loot-pacing.test.ts`), Gameplay 2.0 combat-tier wiring so deep-region kills roll the nightmare/hell columns, and the dungeon `DropSource` consuming all of this (`DUNGEON_OVERHAUL.md`). The per-decision resolutions the build settled are recorded inline in §7.

---

## 0. WHERE WE WERE — the pre-overhaul baseline (kept for the rationale)

> Historical. This section is the honest measurement from *before* the overhaul, kept because it is the argument for why the loot loop exists. The three findings below describe the starting point; see the STATUS block above for the shipped state, and the inline code references for where each gap now lives.

The item *engine* is in good shape. Recipes, component consumption, six slots with the active/passive split, the dedicated neutral slot, charges, lockouts, auras, and item actives through the ability engine all work and are tested. The catalog is a faithful, closed Dota set: about 78 items (7 consumables, ~40 components, ~30 assembled) plus 15 neutral items across 5 tiers. The economy is wired end to end: kills pay scaled gold/XP, bosses and raids roll loot with pity, gold sinks exist, and the gated top-tier set is kept out of every shop.

The gap is the loot *loop*. Three findings.

**Finding 1 — most "drops" are gold, not items.** A wild creep kill pays gold and XP and rolls one neutral item by tier (10 / 14 / 20 / 28% for small / medium / large / ancient). At the time that was the entire item yield from the overworld (the kill path now also routes a creep item-drop table — the L1 fix, shown here):

```6834:6842:src/systems/game.ts
    // neutral drop on a slain wild creep (§3.7): rolls into the dedicated neutral stash.
    if (victim && victim.kind === 'creep' && victim.tier) {
      this.rollItemDropsForCreep(victim.creepId, victim.tier, ev.victimUid, creepCombatTier(this.region.id), victim.pos);
      if (this.eliteCreepUids.delete(ev.victimUid)) this.rollEliteCreepDrop(victim.tier, ev.victimUid, victim.pos);
      this.rollNeutralFor(victim.tier, ev.victimUid);
      this.advanceQuests({ kind: 'kill-creeps', amount: 1, tier: victim.tier, regionId: this.region.id });
    }
```

> **As built:** the `rollItemDropsForCreep` / `rollEliteCreepDrop` calls above are L1 — the gap below is closed. When this finding was written, only the neutral roll existed.

`SPEC.md` §5 says "Consumables (tangos, salves, clarities, dust, smoke) drop from creeps; components drop from echoes and trainers." Neither shipped at the time. Creeps drop no consumables and no components; echoes pay a gold surplus and unlock talents but drop nothing. So the only items that fall in the open world are neutrals, and the only place a "major item" can drop is a boss or a raid.

**Finding 2 — the boss/raid tables are thin and uncurated.** At the time, a boss table was one guaranteed component plus one assembled-pool entry, both picked by hashing the boss's hero id. That hash is now the attribute-lane `themedLoot` builder (L3):

```52:66:src/data/bosses.ts
function themedLoot(heroId: string, rank: BossDef['rank']): LootTable {
  const isMini = rank === 'mini-boss';
  let guaranteed = ['ultimate-orb'];
  let assembledPool = ['aghanims-scepter', 'refresher-orb'];
  if (AGILITY_CARRIES.has(heroId)) {
    guaranteed = ['eaglesong'];
    assembledPool = ['butterfly', 'eye-of-skadi', 'abyssal-blade', 'bloodthorn', /* ... */];
  } else if (STRENGTH_TITANS.has(heroId)) {
    guaranteed = ['reaver'];
    assembledPool = ['heart-of-tarrasque', 'satanic', 'radiance', /* ... */];
  } else if (INTELLIGENCE_BOSSES.has(heroId)) {
    guaranteed = ['mystic-staff'];
    assembledPool = ['scythe-of-vyse', 'refresher-orb', 'octarine-core', /* ... */];
  }
  ...
}
```

The roller behind every boss and raid was a single guaranteed list plus a single assembled slot with pity. `rollLoot` survives with its old shape but is now a thin wrapper that delegates to the L0 `rollItemDrops` keystone:

```213:223:src/core/phase3.ts
export function rollLoot(table: LootTable, tier: DifficultyTier, dryStreak: number, seed: number, band?: LootBand, source?: DropSource, opts: { /* ... */ } = {}): LootRoll {
  const roll = rollItemDrops(lootTableToDropTable(table, source), tier, { assembled: dryStreak }, new Rng(seed), band, { source, /* ... */ });
  const guaranteed = roll.items.slice(0, table.guaranteed.length);
  const assembled = roll.items[table.guaranteed.length];
  return {
    guaranteed,
    assembled,
    dryStreak: roll.dryStreaks.assembled ?? dryStreak,
    pityUsed: !!assembled && roll.pityUsed
  };
}
```

`SPEC.md` §5 wants the opposite of a hash: "specific bosses are the efficient source for specific items (Butterfly farms from an agility-carry boss, Heart from a strength titan)." Right now a Butterfly is as likely from a strength titan as from anyone, and most of the catalog never drops at all.

**Finding 3 — gold inflates because its only big outlet is closed, and drops leak into it.** The faucet scales hard with depth. Kill gold multiplies region by tier by creep-tier by star:

```146:157:src/data/tuning.ts
  regionRewardMult: {
    'tranquil-vale': 1.0,
    'nightsilver-woods': 1.12,
    icewrack: 1.25,
    'devarshi-desert': 1.42,
    shadeshore: 1.6,
    'vile-reaches': 1.82,
    quoidge: 2.05,
    'hidden-wood': 2.15,
    'mount-joerlak': 2.35,
    'mad-moon-crater': 2.55
  },
```

The other multipliers stack on top (`tierRewardMult`, `creepTierRewardMult`, `creepStarBountyMult` at `tuning.ts:185-187`). When this was written, a Mad Moon ancient three-star on Hell paid roughly 3.0 × 2.45 × 2.6 × 2.8 ≈ 54× the base bounty, and at the level cap every kill also minted gold through `postCapXpToGold` — the sinks did not keep up. **As built (L4):** the deep `regionRewardMult` values were pulled down (Mad Moon 3.0 → 2.55) and `postCapXpToGold` capped, so the worst-case multiple is meaningfully lower and the surplus moved into drop rates. The shop carries consumables, components, and a few mid assembled per region; once a fielded hero is built, gold has little to buy, because the expensive end (Rapier, Butterfly, Scythe, Heart, Skadi, Refresher, Aghs) is correctly drop-gated out of every shop. So gold's largest natural outlet is removed by design, while the faucet climbs.

Worse, dropped power leaked back into gold. Selling was a flat fraction of cost with no exception for gated items. **As built (L2)**, `sellItem` now refuses a bound item and returns it to the Armory instead, plugging the leak — liquid items still sell at the normal ratio:

```6187:6212:src/systems/game.ts
  sellItem(invSlot: number): void {
    const u = this.activeUnit();
    if (!u) return;
    const it = u.items[invSlot];
    if (!it) return;
    const def = REG.item(it.defId);
    if (it.bound) {
      // ... pull the bound copy out of the inventory ...
      this.inventoryStash.push(saved);
      this.msg(`${def.name} is bound — returned to the Armory`, 'info');
      return;
    }
    u.items[invSlot] = null;
    u.items = sortInventory(u.items);
    // ...
    const value = sellValue(def);
    this.awardGold(value, 'sell', u.pos);
    this.msg(`Sold ${def.name} (+${value}g)`, 'info');
  }
```

Before that fix, a dropped Divine Rapier (cost 6200) sold for 3100 gold — the rarest thing in the game converting straight into the most abundant. That was the loop the player intuition flagged: more gold than items to spend it on.

**The root cause, in one line.** The game has a Diablo *appetite* for drops sitting on a Dota *closed set*, and the two were never reconciled. You cannot flood items the way Diablo does, because a Battlefury is always a Battlefury. So the looter feeling has to come from where a closed set can actually supply it: breadth across a 65-hero roster, a curated chase per source, dupes that feed upgrades instead of dying, and Dota's own **rarity and quality** axes instead of invented affixes. None of that is built, so the drop excitement defaulted to gold, and gold inflated.

---

## 1. THE LOOT MODEL — settled

Six pillars. They hold the Dota rules while borrowing Diablo's *cadence* (drop tables, pity, a gamble vendor) and Valve's *own collectible vocabulary* (rarity tiers, quality grades).

**1.1 Two economies, one membrane.** Split items by how liquid they are.

- The **gold economy** is liquid: consumables, components, and basic/mid assembled. You buy them, you sell them, the shop is their home. This is the buildup money.
- The **loot economy** is bound: top-tier components and assembled items. They drop, they attach to heroes, and they never convert to gold.

The membrane between the two is the **recipe**. A top-tier item is a dropped *core* plus gold-bought commons plus recipe gold. Gold finishes builds; drops unlock them. This is the cleanest fix for "more gold than items": gold always has a target (completing the item around a drop), and the valuable end never floods back into gold (no selling Rapier, no buying Heart raw). It is also pure Dota — recipes already work exactly this way; the only change is *which* component is gold-gated versus drop-gated.

**1.2 Loot binds to a hero — the roster is the sink.** You have ~65 heroes and field 5. That is the item sink the closed set needs. A found top-tier item equips on a hero and **binds** to your collection: free to move between your own heroes (reclaim to an Armory, exactly like neutrals move today), never liquidated to gold. The long game is gearing the bench so any five you field are ready, the way a Pokémon trainer keeps each creature's build. This is the direct answer to "we have many heroes but only 5 active, items should stay attached to a hero": make it literal, and make breadth the chase.

**1.3 Drops scale to the source and are curated by identity.** Every source describes its drops in one vocabulary (§2), tuned to its difficulty: small creeps drop consumables, big creeps add components, bosses drop their themed signature items, raids are the most generous, owned-hero echoes feed components. Detail in §3.1 and §3.3.

**1.4 Rarity and quality are Dota's own expansion lever.** This is the answer to "expand it without going out of our element." Valve already ships a finite item set that feels deep through two axes, and we adopt both.

- **Rarity** is the prestige/color ladder every collectible Dota cosmetic carries: Common → Uncommon → Rare → Mythical → Legendary → Immortal → Arcana. We stamp a rarity on every main item and recipe core. Rarity decides which drop-table slot and which gamble tier an item lives in, how gated its source is, and the color of its loot beam. It turns the flat catalog into a legible ladder.
- **Quality** is the modifier grade Valve stamps on a *specific copy*: Standard, Inscribed, Genuine, Frozen, Corrupted, Unusual, and so on. The same base item exists in many qualities. A quality is a **bounded, named twist that preserves the item's identity**, never a random stat roll: an Inscribed Battlefury tracks its holder's kills and grows a little; a Corrupted BKB is a darker, stronger sidegrade with a defined downside; an Unusual anything is the prestige copy with a signature particle and the best bounded bonus. The base item is still itself (a Corrupted BKB is still "the magic-immunity button," `SPEC.md` §5 ITEM FEEL intact).

Quality is the lever because it multiplies the catalog *legally*: 78 base items × a handful of qualities is a deep collection to chase, and we invented zero non-Dota items to get it, because quality grades are themselves canon. Inscribed especially marries pillar 1.2 — it tracks *that hero's* kills, so it wants to bind.

**1.5 Dupes are never dead.** `SPEC.md` §5 already promises this for echoes and creeps; extend it to items. A second copy of a top-tier item gears another hero, or upgrades quality (combine duplicates to raise a Standard item toward Inscribed and beyond, the Valve-faithful "upgrade" path and the same shape as the neutral three-dupe enchant today), or salvages into an **essence** currency that feeds quality upgrades and the gamble vendor. A drop you already own is still a good drop.

**1.6 Dota rules hold.** Closed item set, real recipes, identity fidelity. The "roll" is *which curated item drops, at what quality* — never random stats bolted onto an item. Rarity and quality are closed, named, hand-authored axes, not procedural affixes.

What we are explicitly not doing: random-affix items, an infinite generated catalog, or selling top-tier drops for gold. The split is deliberate and the doc holds it.

---

## 2. THE KEYSTONE — one item drop table, carrying rarity and quality

The original `LootTable` was a guaranteed list plus a single assembled slot. It still exists (so the shipped tables keep working), now carrying optional rarity pools and source quality odds:

```704:712:src/core/types.ts
export interface LootTable {
  guaranteed: string[];
  assembledPool: string[];
  assembledRarityPools?: Partial<Record<ItemRarity, string[]>>;
  dropPct: Record<DifficultyTier, number>;
  pity: number;
  /** Optional luck-at-source quality odds for the assembled drop (LOOT L5). */
  qualityOdds?: Partial<Record<ItemQuality, number>>;
}
```

The keystone generalized it to a weighted, multi-slot table that also rolls rarity and quality, so creeps, bosses, raids, echoes, chests, and the gamble vendor all speak one vocabulary. **As built**, the types below ship in `src/core/types.ts` and the roller in `src/core/phase3.ts`:

```ts
// data-side; the core's resolution layer never reads it
type ItemRarity =
  | 'common' | 'uncommon' | 'rare' | 'mythical' | 'legendary' | 'immortal' | 'arcana';

type ItemQuality =
  | 'standard' | 'inscribed' | 'genuine' | 'frozen' | 'corrupted' | 'unusual';

type DropSource = 'shop' | 'creep' | 'echo' | 'boss' | 'raid' | 'special-battle' | 'gamble';

interface DropEntry { id: string; weight: number; quality?: ItemQuality; }

interface DropSlot {
  rarity: ItemRarity;                        // which rung this slot rolls
  rolls: number;                             // independent attempts at this slot
  chance: Record<DifficultyTier, number>;    // per-roll probability the slot yields
  pool: DropEntry[];                          // weighted candidates
  qualityOdds?: Partial<Record<ItemQuality, number>>; // chance the rolled copy is upgraded
  pity?: number;                             // bad-luck guarantee on the Nth dry roll
  source?: DropSource;                       // exclusivity tag (see §3.3)
}

interface ItemDropTable {
  guaranteed: string[];                      // always drops (today's behavior)
  slots: DropSlot[];                         // weighted slots, independent dry streaks
}
```

The base item gains a rarity, and a dropped copy remembers its quality and binding:

```ts
// ItemDef gains:  rarity?: ItemRarity;  exclusiveTo?: DropSource[];
// ItemSave gains: quality?: ItemQuality;  bound?: boolean;
```

`rarity` is optional and defaulted from cost/tier so we tag the catalog incrementally rather than all at once. And one roller, a strict superset of `rollLoot`:

```ts
function rollItemDrops(
  table: ItemDropTable,
  tier: DifficultyTier,
  dryStreaks: Record<string, number>,   // per-slot, keyed by rarity or slot id
  rng: Rng
): { items: ItemSave[]; dryStreaks: Record<string, number>; pityUsed: boolean };
```

`rollLoot` becomes a thin wrapper: a guaranteed list plus one Standard-quality assembled slot with pity is just the one-slot case, so every shipped boss and raid table keeps working unchanged while the new tables get more slots, rarity, and quality odds. The roller reuses the existing seeded `Rng` (`rng.chance`, `rng.pick`, plus a small weighted pick), so it stays deterministic and headless-testable, the same discipline `rollLoot` and `rollNeutralDrop` already follow.

Why this first: it is the single dependency under every other slice. Build the table and roller once, build them carefully, and creep drops, themed boss tables, raid generosity, echo components, chests, source exclusivity, and the gamble vendor all become data plus a call site. This is the loot equivalent of the combat doc's `CombatContext` keystone: invisible on its own (migrated tables roll identically), and it unlocks the rest.

---

## 3. THE SYSTEMS, AS SEAMS

Each subsection names the change, the design, and the seam: what existing vocabulary it extends and where it lives, so nothing here is a from-scratch system or a core rewrite.

### 3.1 Drops on every source (the felt fix)

**Design.** Make every kill a possible item, scaled to what it is. Rarity rungs map onto sources so the ladder reads cleanly:

- **Creeps** gain an optional `drops?: ItemDropTable` on `CreepDef`, defaulted by tier so authors write nothing for the common case. Small and medium roll a **Common** consumable slot (tango / salve / clarity / dust / ward / smoke). Large adds an **Uncommon/Rare** component slot. Ancient adds a **Rare/Mythical** component slot and keeps its neutral roll. This closes the `SPEC.md` §5 consumable gap and gives big creeps a reason to be worth fighting beyond gold.
- **Bosses** move off the hero-id hash to a curated, identity-themed table (§3.3): a guaranteed **Mythical** component matched to the boss's attribute, a component slot, and a **Legendary/Immortal** anchor slot of that boss's signature item(s). Mini-bosses get the smaller table `SPEC.md` §4 calls for.
- **Raids** express their existing anchors as the same table at the most generous chances and the best quality odds, keeping Roshan's Aegis / Cheese / Refresher specifics in `deliverRaidLoot`.
- **Echoes** add a component slot to the owned-hero surplus path.

**The seam.** The roller from §2 plus routing in the kill path. `handleKillCredit` already detects a slain wild creep and calls `rollNeutralFor`; add a sibling that calls `rollItemDrops` for the creep's table and routes results by rarity (consumables and components to the item stash, neutrals stay on their own path). Boss and raid call sites already invoke `rollLoot`; they swap to `rollItemDrops`. Per-slot dry streaks live where `dryStreak` already lives (`raidProgress`, `difficulty`), keyed by slot. No core resolution changes; this is data plus the same award plumbing kills already use.

### 3.2 Loot binds to a hero (the Armory)

**Design.** A found top-tier item belongs to your collection, not your wallet. It equips on a hero, moves freely to any other hero through an **Armory** (the unequipped-loot stash), and cannot be sold for gold. Liquid items (consumables, components, basic assembled) still sell at `sellRatio` so the shop economy is unchanged. This makes "items stay attached to a hero" literal and plugs the Rapier-to-gold leak at its source. Inscribed-quality copies track their holder, so they bind by nature.

**The seam.** This is mostly reuse. The neutral system already proves the pattern: `equipNeutral` / `reclaimNeutral` move an item between a dedicated slot and a stash and never touch gold (`DECISIONS.md`, M4). Generalize it:

- Mark bound items with `ItemSave.bound`, set true when a `core`-tier, `heldUniques`, or rarity-`legendary`-and-up item drops. (The gated set is already enumerated as `GATED_TOP_TIER` in `systems/game.ts`, so "what binds" reuses an existing list and the rarity ladder.)
- `sellItem` refuses a bound item and offers "return to Armory" instead. Equip/reclaim move bound items between heroes, exactly as neutrals move today.
- The Armory is the existing `inventoryStash`, surfaced for assignment rather than left as a holding pen.

No core change: binding is a save-and-systems concern. The sim never asked where an item came from.

### 3.3 Curated chase and reserved sources

**Design.** Replace the hash with intent, and reserve the prestige end for the content that earns it.

Each boss's anchor pool is its hero's signature item(s), so the player learns where to farm what, which is the `SPEC.md` §5 "specific bosses are the efficient source for specific items" rule. A first sketch of the mapping, by the boss hero's attribute and role:

- **Agility carries** (Phantom Assassin, Medusa, Terrorblade, Faceless Void, Spectre) anchor Butterfly, Eye of Skadi, Diffusal-tier cores.
- **Strength titans** (Wraith King, Tidehunter, Magnus, Elder Titan, Centaur) anchor Heart of Tarrasque, Assault Cuirass, Reaver cores.
- **Intelligence bosses** (Invoker, Zeus, Lich, Outworld Destroyer) anchor Scythe of Vyse, Refresher Orb, Aghs, Mystic Staff cores.

**Reserved by source (`exclusiveTo`).** Some items, and some qualities, only come from the marquee content, and never from a shop or the gamble vendor:

- **Raid-only.** The Aegis, the Rapier-tier anchors, and the highest-quality copies (Unusual) of raid anchors. Roshan keeps Cheese and the Refresher Shard.
- **Boss-only.** Each boss's signature **Immortal**-rarity copy of its anchor (the efficient, repeatable source for that one item).
- **Special-battle-only.** A small reserved set from the marquee hero fights: the Elite Five members, the Champion, and the recruitment Bind duels. These drop **Arcana**-rarity prestige items and Genuine-quality "proof you beat them here" copies. This is the top of the chase and it cannot be bought or gambled at any price.

The first quest/boss copy of a gated item stays gated; additional copies stay farmable through these tables, which is exactly the `SPEC.md` §5 "first copy gated, extras farmable" rule.

**The seam.** Mostly data. Replace `loot(heroId)` in `data/bosses.ts` with a builder that reads the boss hero's `attribute` and `roles` (already on `HeroDef`) and selects a themed `ItemDropTable`. Tag reserved items with `exclusiveTo` and reserved high qualities with the slot's `source`. The gamble pool (§3.4) and the shop guard both filter out anything whose `exclusiveTo` excludes their source, so reservation is enforced in one predicate, reusing the `GATED_TOP_TIER` discipline.

### 3.4 Close the faucet, open the sinks (the gold rebalance)

**Design.** Give gold a permanent home, route it back into the loot chase, and stop minting it faster than the game can absorb. The centerpiece is a town **gamble vendor** (a Black Market, deep-region/badge-gated), with two wheels:

- **The recipe wheel (cheap, build-finishing).** Spend a modest gold lump for one roll at an unlocked rarity band, yielding a recipe core or component of that band. This is the everyday gold sink and the steady supply that finishes the builds your drops start, so gold always has a target. Pure Dota: it hands you the gold-buyable half of a recipe, faster.
- **The relic wheel (expensive, exciting).** Spend a large gold lump for one roll on a chosen rarity's assembled pool, up to a **ceiling** (Legendary), Standard quality, bound. A small `qualityOdds` chance upgrades the copy. This is Diablo's Gheed: surplus gold converts back into the loot chase instead of into raw stats. Its cost escalates with use within a visit so it supplements bosses rather than replacing them, and it **cannot** roll Immortal/Arcana or any `exclusiveTo` item, so the reserved sources in §3.3 stay the only path to the very top.

Two more sinks complete the picture:

- **Recipes consume drops.** Re-tier the top assembled items so the recipe needs one dropped core (the boss/raid component) that gold cannot buy, plus gold-bought commons plus recipe gold. Every drop then pulls gold out of the wallet to finish. The schema already supports `components` and `recipeCost`; the work is moving specific components from shop lists into drop tables.
- **Salvage and quality upgrade (dupes never dead).** Salvage a bound dupe into **essence**; spend essence plus gold to raise an item's quality (Standard → Inscribed → …) or to reroll a relic-wheel result. This mirrors `tinkerEnchant` (three dupes up a tier) generalized to assembled items, and gives gold a sink that respects the closed set.
- **Retune the faucet.** Taper the deepest region/tier/star stacking and cap `postCapXpToGold` so a Hell ancient three-star does not mint ~54× base, and move that surplus into *drop rates* instead. All of it lives in `tuning.ts`, the one place balance is meant to change.

**The seam.** `buyItem` / `shopSells` already reject the gated set and require an item to belong to a shop (`DECISIONS.md`, M4), so the recipe re-tier is shop-list data plus the existing guard, and the gamble wheels reuse the same `exclusiveTo` predicate to bound their pools. The recipe wheel, relic wheel, salvage, and quality upgrade are new `Game` actions next to `buyback` / `buyTome` / `respec` / `tinkerReroll`, surfaced in the existing Town Services modal (`Y`). The faucet retune is constants.

### 3.5 Quality as a system (the expansion, in detail)

**Design.** Quality is a closed, hand-authored set of named grades. Each grade has a color/visual treatment and one bounded mechanical character that reads on sight and never breaks item identity:

- **Standard** — the bought or built version. The baseline.
- **Inscribed** — tracks the holder's hero kills and gains a small **capped** permanent stack (the canon "it tracks stats" grade, reshaped into a slow-growing item). Binds to its hero by nature.
- **Genuine** — the authenticated drop from a specific source (a "you beat them here" copy), a modest flat bonus over Standard. Comes from bosses and special battles, never the shop.
- **Frozen** — a frost-themed copy: small defensive or on-hit flavor, mostly cosmetic. The accessible collectible grade.
- **Corrupted** — a darker, stronger sidegrade with a defined downside (more power, less survivability, say). Risk/reward, and unmistakably itself.
- **Unusual** — the rarest grade: a signature particle effect plus the best bounded bonus. Source-reserved (raids and special battles), the Arcana-equivalent prestige chase.

Where quality comes from: a drop slot's `qualityOdds` rolls an upgrade at the source (a raid anchor has a real chance to drop Inscribed or Unusual; a creep drop is almost always Standard), and the salvage/essence path lets the player *earn* a quality upgrade deterministically (§3.4). Two ways in: luck at the source, or grind through dupes.

**The seam.** Quality lives entirely outside the resolution core. `ItemSave.quality` is render + a small stat-resolution overlay applied where item passives are already summed (the same add/subtract pass neutrals use), so a Corrupted item's delta and an Inscribed item's stacks flow through the existing dirty-stat refresh. The visual treatment (border color, particle for Unusual) is renderer-only data, exactly like `appearance` and `attackVisual` already are (`SPEC.md` §5). The core never reads quality; it reads the stat mods the systems layer hands it. `boundary.test.ts` stays green.

### 3.6 Readability and feedback (make the loot legible)

Drops only feel good if the player can read them. Presentation only, keyed off events the systems already emit.

- **Rarity-colored loot, the Valve palette.** A drop toast and beam colored by rarity so a Common reads differently from an Arcana at a glance: Common `#B0C3D9`, Uncommon `#5E98D9`, Rare `#4B69FF`, Mythical `#8847FF`, Legendary `#D32CE6`, Immortal `#E4AE39`, Arcana `#ADE55C`. The reward-streak HUD and gold count-up already exist (`DECISIONS.md`, presentation reward slice); this extends them to items.
- **Quality on the item.** A quality border in the inventory and an Unusual particle on the equipped model, the same render-only overlay path `appearance` uses.
- **"For which hero?" assignment.** When a bound item drops, prompt the assignment (or auto-route to the Armory with a one-click "equip on …"), so the bind-to-hero model is a choice the player sees.
- **Source hints in the codex.** Each top-tier item's codex entry names its source and rarity ("Heart of Tarrasque — Immortal; anchors from strength-titan bosses; relic wheel up to Legendary"), so the chase is legible. The codex is already encounter-gated and data-driven (`DECISIONS.md`, M8).
- **Pity, surfaced.** Show the dry-streak counter for a boss or raid so bad-luck protection is visible.

None of this changes a roll. It makes the loop visible enough to enjoy.

### 3.7 The Compendium — where everything is (the Atlas) and who everyone is (Heroes)

Two reference screens the player keeps wanting, and they are one menu. The loot system in §§3.1–3.5 only pays off if the player can answer "where do I farm a Butterfly?", and a 65-hero roster only pays off if the player can answer "what does this hero even do?" Both are **derived views over data we already author**, so they cannot drift from the game and cost almost nothing to keep correct.

The home is the existing Codex (`K`), upgraded from a lore list into a tabbed **Compendium**: Heroes · Items · Creeps · Regions · Raids. The codex already returns pure view-models the HUD renders (`codexEntries()`, `DECISIONS.md` M8); the Compendium adds two richer ones.

**The Atlas (the Items tab — your loot guide).** For any item, one card answers what it is and where it comes from:

- Identity: stats, rarity (with its color), the recipe (components, and which one is the drop-gated core), and the quality grades it can wear.
- **Sources, computed from the tables.** Which bosses, raids, and special battles drop it (at which tier and odds), whether a shop sells it, and whether the recipe or relic wheel can roll it. This is a `Game.atlasEntries()` view-model that scans every `ItemDropTable`, shop list, and gamble pool and inverts them, so the guide is always in sync with the data and there is no second source of truth to maintain. Add a boss anchor in data and it shows up in the Atlas for free.
- Reverse lookups both ways: open a boss to see its drop table, open an item to see its sources. "Butterfly → Phantom Assassin (Immortal copy); relic wheel up to Legendary; Queen of Blades (Unusual chance)" reads straight off the tables.

**Heroes (the Heroes tab — abilities and skill trees).** Every hero, browsable, rendered from `HeroDef` (all of this is already authored): the four abilities with their values and cooldowns, the **full talent tree** (4 tiers × 2 at 10/15/20/25, where the current modal only shows the one pending pick), the facet(s), the Aghs upgrade, role and attribute, lore, and barks. For a hero you own, overlay their live level, talent picks, echo-unlocked branches, and current build; for one you have only met, show the kit so you can plan the recruit. A `Game.heroCompendium()` view-model mirrors `codexEntries()`. This is a browse screen over existing systems, not a new mechanic: talents, facets, and Aghs already resolve through `buildHero`.

**Why they belong together.** The two tabs cross-link, which is the roster-gearing loop made legible. A hero's card names the items that hero wants, each linking to its Atlas card and source; an item's card names the heroes it is best on. The player moves from "who do I field" to "what do they need" to "where do I get it" without leaving the menu. The Heroes tab also pairs with the recruitment **journal**, which already tracks where unrecruited heroes are found (`DECISIONS.md` M8), so "who, what kit, where to recruit, what to gear" is one connected reference.

**The seam.** Two view-models in `Game` beside `codexEntries()` / `journalSections()`, and a tabbed render in the HUD's existing codex modal (`renderCodexModal`, the `K` menu). The Atlas is pure derivation from the loot data; the Heroes tab is pure projection of `HeroDef` plus the owned hero's save state. No core change, and no new authored content beyond what the loot slices already add.

---

## 4. ARCHITECTURE IMPACT — what touches what

| Layer | What it gains | Touches the headless resolution core? |
|-------|---------------|----------------------------------------|
| `src/core/` | Additive types in `types.ts` (`ItemRarity`, `ItemQuality`, `DropSource`, `ItemDropTable`, `DropSlot`, `DropEntry`; `ItemDef.rarity?` + `exclusiveTo?`; `ItemSave.quality?` + `bound?`; `CreepDef.drops?`; richer `BossDef.loot`); `rollItemDrops` in `phase3.ts` generalizing `rollLoot` (kept as a wrapper). All pure, seeded, deterministic. No effect, damage, status, or item-resolution change. | No — the drop roller is a pure helper beside `rollLoot`; rarity/quality/appearance stay render + stat-overlay data the sim never reads (§1.1). `boundary.test.ts` stays green. |
| `src/systems/` | Creep-drop routing in `handleKillCredit`; bound-item rules in `sellItem` + equip/reclaim; the quality stat overlay in the existing item-mod pass; gamble wheels / salvage / quality-upgrade actions; echo component drop; the `exclusiveTo` predicate shared by shop and gamble; the `atlasEntries()` / `heroCompendium()` view-models (derived, no new state); per-slot dry-streak bookkeeping. | No (calls existing core helpers and award plumbing). |
| `src/data/` | Creep `drops` defaults; themed boss tables replacing the hash; raid tables as `ItemDropTable`; rarity tags + `exclusiveTo` on the catalog; the quality table; recipe re-tiering; shop-list trims for drop-gated cores. | No. |
| `src/ui/` + `src/engine/` | Rarity-colored loot toasts/beams, quality borders + the Unusual particle, the Armory + assignment panel, gamble/salvage/quality UI in Town Services, the **Compendium** hub (Heroes + Items/Atlas tabs) upgrading the codex, codex source+rarity lines, pity counters. | No (`boundary.test.ts` stays green). |
| `GameSave` | `ItemSave.quality` + `bound`, an `essence` counter, per-slot dry streaks, Inscribed kill counters. Additive, so old saves load; `SAVE_VERSION` bump with a migration that defaults quality `standard`, `bound=false`, `essence=0`, empty streaks. | N/A |

**The core touch is a pure roller plus one stat overlay, not the resolution layer.** `rollItemDrops` sits exactly where `rollLoot` and `rollNeutralDrop` sit; the quality delta flows through the same item-mod summation neutrals already use. No ability, item active, status, or damage path changes.

**Determinism and the system of record.** The shipped loot tests (`economy.test.ts` boss-rerun, neutral drops, gold sinks; `raids.test.ts` raid-loot and pity) stay green because `rollLoot` keeps its signature and behavior. New tables and the new roller are added beside them, seeded the same way, so a migrated boss rolls identically and a new creep table is reproducible on a seed.

---

## 5. PHASING — shippable slices, each playable and green

Ordered so the keystone lands first, then the loudest felt fix, then the binding model, then the curated chase, then the economy rebalance, then the quality depth, then readability, then the compendium. Build ahead freely; each slice stands on its own.

**L0 — the drop-table keystone.** Add the rarity/quality/source types, `ItemDropTable` / `DropSlot` / `DropEntry`, and `rollItemDrops`; make `rollLoot` a wrapper; migrate every shipped boss and raid table to the one-slot form. No behavior change: every loot test stays green and rolls are identical. Invisible, and it unlocks the rest.

**L1 — drops on creeps.** Consumables from small/medium, components from large/ancient, neutral roll preserved. The biggest felt change for the smallest code once L0 exists, and it closes the `SPEC.md` §5 gap.

**L2 — bind to a hero + plug the sell leak.** The Armory, the `bound` flag on top-tier drops, `sellItem` refusing bound items, free reassignment between heroes. Establishes the "items attach to a hero" pillar and stops gold inflation at its largest leak.

**L3 — curated tables, rarity tags, reserved sources.** Replace the hash with attribute/role-themed anchor pools; stamp rarity across the catalog; tag `exclusiveTo` for raid/boss/special-battle items; add the echo component drop. The chase becomes legible and the prestige end becomes reserved.

**L4 — the gold rebalance.** The gamble vendor's recipe and relic wheels; recipe re-tier so anchors need a dropped core; salvage + essence; the faucet retune in `tuning.ts`. The direct answer to "more gold than items," and the home for "gambling for recipes and bigger items."

**L5 — quality.** The named quality grades, their bounded deltas, `qualityOdds` on drop slots, the quality-upgrade path through essence, and Inscribed kill-tracking. The catalog expansion, landing after rarity and the economy so it tunes against a stable base.

**L6 — readability and feedback.** Rarity colors, quality borders + the Unusual particle, assignment prompts, codex source/rarity lines, pity counters. The presentation pass that makes L1–L5 legible.

**L7 — the Compendium.** Upgrade the codex (`K`) into a tabbed hub: a Heroes tab (abilities + the full talent/facet/Aghs tree) and an Items tab (the Atlas: stats, rarity, recipe, quality, and sources computed from the live tables), cross-linked. Both are derived view-models, so the slice is pure read and lands after the loot data it reads. It answers "where do I find this" and "what does this hero do" in one menu.

L0 and L1 carry no balance risk and land fast. L2 is the pillar. L4 and L5 are the meaty slices and want a playtest pass before their numbers lock. L7 is pure view: no balance risk, and it makes the whole system legible.

---

## 6. ACCEPTANCE — each slice is done when (testable, `PROGRESS.md` style)

| Slice | Done when |
|-------|-----------|
| L0 | `rollItemDrops` is deterministic on a fixed seed, honors per-slot chance, pity, and weights over a sweep. Every migrated boss/raid table rolls identically to its pre-migration `rollLoot` result for the same seed and dry streak (a golden test). The full existing loot suite stays green; `boundary.test.ts` green. |
| L1 | A small creep yields a consumable within N kills on a seed; a large creep yields a component; an ancient still yields its neutral. Drops route to the item stash (consumables/components) and the neutral stash (neutrals) by rarity. Headless, on a fixed seed. |
| L2 | A bound top-tier item cannot be sold (`sellItem` refuses or returns it to the Armory), moves freely between two heroes, and never converts to gold; a liquid component still sells at `sellRatio`. A save round-trip preserves `bound`. |
| L3 | The agility-carry boss's anchor pool contains Butterfly/Skadi and the strength titan's contains Heart/Assault Cuirass (and not the reverse); every catalog item resolves a rarity; a `raid`/`special-battle` `exclusiveTo` item never appears in any shop list; a mini-boss table is smaller than a boss table; an owned-hero echo kill can drop a component. All on fixed seeds. |
| L4 | A recipe-wheel roll debits gold and yields a core/component of the chosen band; a relic-wheel roll debits a larger lump and yields exactly one bound assembled at or below the Legendary ceiling, never an `exclusiveTo` or Immortal/Arcana item; salvaging a bound dupe grants essence and consumes the dupe; an anchor's recipe requires a drop-gated core that `shopSells` rejects; the retuned faucet keeps a deep-farm kill's gold under a target multiple of base. The M4 gated-item guard still holds. |
| L5 | A drop slot with `qualityOdds` can produce a non-Standard copy on a seed; an Inscribed copy accrues a capped stack as its holder gets kills; a Corrupted copy applies both its bonus and its downside through the item-mod pass; spending essence raises a copy's quality deterministically; quality survives a save round-trip; `boundary.test.ts` stays green (the core never reads `quality`). |
| L6 | Each drop shows a rarity-colored toast in the Valve palette; an Unusual copy shows its particle; a bound drop prompts assignment; a top-tier codex entry names its source and rarity; a boss/raid screen shows its dry-streak counter. None of it changes a roll (loot determinism tests stay green). |
| L7 | The Compendium opens from `K` with Heroes and Items tabs. An item's Atlas card lists every source computed from the live tables (add a boss anchor in data and it appears with no Atlas edit, asserted by a test that the inversion matches the tables); a hero's card shows all four abilities and the full 4-tier talent tree from `HeroDef`, with an owned hero's picks and build overlaid. The view-models are pure (no save writes). |

Cross-cutting gates (every slice): `npm test` and `npm run build` green; `boundary.test.ts` green; `rollLoot` keeps its signature so the shipped boss/raid/neutral tests stay the system of record; no exotic slots spent; the gated-shop guard (`GATED_TOP_TIER`) and the `exclusiveTo` predicate reject reserved items from every buy and gamble path.

---

## 7. OPEN DECISIONS — settled by the build

Each was meant to be settled while building; it was. The original framing is kept, with the resolution recorded inline.

1. **Bind strength.** Hard-bound (recommended, and what the roster-as-sink model wants) versus sellable at a steep loss for an emergency gold valve. Hard-bound keeps the two economies clean; a steep-loss sale is friendlier but reopens a small leak. Decide in L2.
   - **Resolved (L2):** hard-bound. `sellItem` refuses a bound item and returns it to the Armory; bound copies never convert to gold. No steep-loss valve was added.
2. **What binds.** Recommended: `core`-tier, `heldUniques`, and rarity-`legendary`-and-up items bind; consumables, components, and basic assembled stay liquid so the shop keeps working. Confirm the cut line against `GATED_TOP_TIER` and the rarity ladder in L2/L3.
   - **Resolved (L2):** the cut line is exactly the recommendation — `shouldBindDroppedItem` binds anything in `GATED_TOP_TIER`, any main-item tier, or rarity legendary-and-up; everything else stays liquid.
3. **Relic-wheel ceiling and cost curve.** Recommended ceiling is Legendary, with escalating in-visit cost, so the gamble supplements bosses and never reaches the reserved Immortal/Arcana end. Tune in L4 against the retuned faucet, not before.
   - **Resolved (L4):** Legendary ceiling, cost `relicWheelBaseCost + gambleRolls × relicWheelStepCost` (escalates per visit), `exclusiveTo`/`GATED_TOP_TIER` filtered out, result bound. The relic wheel supplements bosses, never replaces them.
4. **How much weight quality carries.** Recommended: most grades are collectible + a small bounded stat; Inscribed (grows) and Corrupted (sidegrade with a downside) are the only grades with real mechanical character, and even they stay inside the item's Dota identity. Random affixes stay out. Confirm the per-grade deltas in L5 so power does not creep.
   - **Resolved (L5):** `data/quality.ts` ships bounded `StatModMap` deltas per grade; Inscribed grows a capped per-kill stack, Corrupted is a sidegrade with a defined downside, the rest are mostly collectible. No random affixes — the core only reads the resolved mods.
5. **How many quality grades to ship.** Recommended starting set: Standard, Inscribed, Frozen, Corrupted, Unusual (Genuine optional if special-battle drops want an authenticated grade). More Valve grades (Elder, Exalted, Autographed, Cursed) can join later as pure-cosmetic collectibles. Decide in L5.
   - **Resolved (L5):** all six shipped, Genuine included (the authenticated "you beat them here" grade). Further Valve grades can still join as pure data.
6. **What counts as a "special hero battle."** Recommended: the Elite Five, the Champion, and recruitment Bind duels. Open question whether owned-hero echo "perfected" completions also drop a reserved item. Decide in L3.
   - **Resolved (L3):** the marquee/special-battle set reserves its items through the `exclusiveTo` source predicate; owned-hero echoes drop attribute-themed components but were not given a reserved special-battle drop, so the prestige reservation stays with the named battles.
7. **Faucet retune magnitude.** Hold the region/tier/star and post-cap-gold numbers until L4 is playable, then balance against the new sinks. Keep the shipped reward-scaling tests as the reference for the auto-resolve and farming paths.
   - **Resolved (L4):** the deepest `regionRewardMult` values were pulled down (Mad Moon 3.0 → 2.55) and `postCapXpToGold` capped, with the reward-scaling tests held green; later Gameplay 2.0 work added per-region creep-combat scaling on top.
8. **Stash pressure.** Whether the Armory is unbounded or capped (a cap creates a salvage decision; unbounded is friendlier). Optional auto-salvage of unwanted dupes into essence. Decide in L4 alongside salvage.
   - **Resolved (L4):** the Armory (`inventoryStash`) is unbounded; salvage to essence is a manual choice, not forced by a cap.
9. **Atlas reveal model.** Encounter-gated like the codex (you see only sources you have met) versus a full almanac (a strategy guide that shows every source up front). Recommended hybrid: the item and its rarity show once seen, exact sources reveal as you encounter them, and a settings toggle opens full spoilers for players who want the whole map. Decide in L7.
   - **Resolved (L7):** the Atlas (`atlasEntries()`) is a pure derivation that inverts the live drop tables / shop lists / gamble pools, surfaced in the codex (`K`) hub and inheriting the codex's encounter-gated reveal, so the guide can never drift from the data.

---

## 8. PRINCIPLES (consistent with `SPEC.md` §10 and the companion overhaul docs)

- **Two economies, one membrane.** Gold buys the buildup and finishes drops; top-tier power drops, binds, and never sells. The recipe is the seam between them.
- **The roster is the sink.** With 65 heroes and five fielded, gearing the bench is the long game, so a closed item set still feeds a looter.
- **Expand inside the element.** Rarity and quality are Valve's own way to make a finite set feel deep. We adopt both and invent zero non-Dota items; quality is a closed named axis, never random affixes.
- **One vocabulary for every drop.** Creeps, bosses, raids, echoes, chests, and the gamble all roll the same `ItemDropTable` through one seeded roller, the way the gambit grammar is one closed grammar.
- **Reserve the peak.** The shop and the gamble supply the climb; raids, bosses, and special hero battles own the Immortal/Arcana and Unusual top, and nothing buyable reaches it.
- **Dupes are never dead.** A second copy gears another hero, upgrades quality, or salvages to essence.
- **The guide is derived, never authored.** The Atlas is computed from the drop tables and the Heroes tab from `HeroDef`, so the reference can never drift from the game.
- **Additive and reversible.** `rollLoot` stays the tested path; new tables wrap it. The base game is never worse for any of this existing.
- **Keep the core headless and deterministic.** The only core changes are a pure seeded roller and a stat overlay beside the ones already there. `boundary.test.ts` stays green.
- **Ship slices.** L0 is invisible but unblocks everything; L1 alone makes the overworld drop items and is worth shipping on its own. Build ahead, keep it green, demo often.
