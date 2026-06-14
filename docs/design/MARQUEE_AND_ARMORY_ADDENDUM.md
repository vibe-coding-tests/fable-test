# MARQUEE & ARMORY ADDENDUM — more bosses to chase, and a bench you can actually gear

A follow-up to `LOOT_OVERHAUL.md` and `DUNGEON_OVERHAUL.md`, written because most of their machinery already shipped (LOOT L2–L4, DUNGEON D0–D1) and two things the player asked for sit cleanly *on top of* that machinery rather than inside it. This is an addendum, not a new spec and not a rewrite: it appends content and one collection-management slice to systems that already exist, so every green acceptance row in the parent docs stays green and nothing here disturbs the headless core (`src/core/`), the seeded rollers, or `boundary.test.ts`.

Two additions, both additive and reversible the way the rest of the project is:

1. **A second wave of marquee bosses and raids** — cross-franchise homages on Dota hero chassis, widening the curated chase the loot loop already delivers.
2. **The Armory as a first-class collection layer** — turning the already-shipped bind-and-move plumbing into a real bench-gearing screen, because a 65-hero roster collecting 35 live item slots needs management, not just storage.

Read it after the two parent docs; it assumes their vocabulary (`ItemDropTable`, `DropSource`, rarity/quality, `bound`, the Armory, `themedLoot`, `generateDungeon`, `DungeonDef.guardian`).

---

## 0. WHY AN ADDENDUM (not a new spec, not a rewrite)

Both requests were checked against the shipped code before this doc was written, and neither is new architecture:

- **Marquee bosses/raids are content, not systems.** The schema is built: `BossDef` carries phases + a `LootTable`, `RaidDef` carries add-waves/zones/enrage/loot, `themedLoot()` already routes loot by the chassis hero's attribute, and `DungeonDef.guardian` already points a dungeon's final room at a `BossDef`. A new marquee boss is a row in `ALL_RAIDS`, an entry in `themedLoot`'s mapping, and optionally a `guardian` id — no new code path.
- **Item mobility already shipped (LOOT L2).** Bound gear moves between heroes through the Armory today (`equipArmoryItem`, `reclaimArmoryItem`), never sells, salvages to `essence`. What's missing is not *movement* — it's the *management surface* for moving things across a 65-hero bench. That is a UI + two view-models, not a mechanic.

Because both additions cross-cut the two parent docs (a marquee boss is simultaneously a raid, a dungeon guardian, and a themed loot anchor), they live in one shared companion doc that both parents point to, rather than as parallel edits that would have to stay in sync. Existing slice numbering continues here: the loot work is **L8**, the dungeon work is **D8**, and the content authoring is the **C-series**.

---

## 1. SETTLED ADDITIONS — the pillars this addendum holds

**1.1 Homage, never the trademark.** Every marquee boss ships as an *original* name and title evoking its touchstone, mounted on a Dota hero's kit as the mechanical chassis — exactly the convention the four shipped raids already follow (Kerrigan → "The Queen of Blades" on a Broodmother chassis, the Lich King → "The Frost-Crowned King" on a Lich chassis, Diablo → "The Lord of Terror" on a Doom chassis). The shipped denylist guard (`data/denylist.ts`, test 23) only catches Dota *esports* trademarks today; Blizzard/Valve character names are not in it, so the homage rule here is a **stated convention**, with each touchstone → original mapping recorded in `DECISIONS.md`, not an automated check. (Whether to widen the denylist to cover the new franchises is an open decision, §7.)

**1.2 A marquee boss is one entity expressed through three existing surfaces.** It is a raid (the menu-and-arena fight that already works), and/or a dungeon guardian (the same `BossDef` standing at the bottom of a generated descent), and a curated loot anchor (its signature items, reserved at the top qualities). The same definition feeds all three; we never author a boss three times.

**1.3 The peak stays reserved.** New marquee bosses extend the chase, they do not cheapen it. Their signature **Immortal** copies and **Unusual** quality stay `exclusiveTo: ['raid']` / `['special-battle']`, unreachable from any shop or the Black Market wheels, exactly as `LOOT_OVERHAUL.md` §3.3 reserves the existing peak. More chase, same ceiling discipline.

**1.4 The roster is the sink; the Armory is how you tend it.** With five fielded heroes wearing six items plus one neutral each — 35 live slots — against a 65-hero bench, the long game is *gearing the bench*, and that only works if reassigning gear across the bench is a one-screen action, not a per-hero chore. Mobility already exists; this pillar makes it legible and fast.

**1.5 Dupes still never die.** More bosses means more drops of items you already own. The existing answer holds and is reinforced here: a second copy gears another bench hero through the Armory, upgrades quality through `essence`, or salvages. The Armory layer makes "which of my heroes still needs this" answerable at a glance, so a dupe always has an obvious home.

---

## 2. THE MARQUEE WAVE — more bosses, more raids (the C-series)

### 2.1 The first wave (focused, ~6)

Two per external franchise plus a Dota-native convergence boss. Each row names the touchstone, the shipped original, the Dota chassis (whose kit and `heroId` back the fight), and the attribute theme that selects its loot anchors through the existing `themedLoot` lanes. Names and chassis are a first sketch to settle while building (§7), not final:

| Touchstone | Franchise | Shipped name (original) | Title | Chassis (`heroId`) | Attribute → anchor lane |
|---|---|---|---|---|---|
| Jim Raynor | StarCraft | **The Renegade Marshal** | Outlaw of the Fallen Fleet | `sniper` | agility marksman → Hurricane Pike, Maelstrom→Mjollnir, crit cores |
| Zeratul | StarCraft | **The Void Prelate** | Blade of the Severed Dark | `templar-assassin` *(blink assassin)* | agility → Manta, Diffusal, Nullifier cores |
| Illidan | Warcraft | **The Sundered Betrayer** | Warden of the Black Temple | `terrorblade`/`night-stalker` *(demon metamorph)* | agility/strength → Satanic, Manta, Skadi |
| Sylvanas | Warcraft | **The Forsaken Queen** | Banshee of the Cold Arrow | `drow-ranger` | agility ranger → Hurricane Pike, Eye of Skadi |
| Baal | Diablo | **The Lord of Destruction** | Last of the Prime Evils | `wraith-king`/`magnus` *(strength titan)* | strength → Heart, Assault Cuirass, Reaver |
| Mephisto | Diablo | **The Lord of Hatred** | Voice in the Lightless Hall | `razor`/`zeus` *(lightning)* | intelligence → Scythe, Refresher, Aghs |
| *(Dota-native)* | Dota | **The Last Eldwurm** | Ember Beneath the Mad Moon | `dragon-knight`/`jakiro` *(dragon)* | strength/int → Shiva's, Bloodthorn, Aghs |

The Lich King's chassis (`lich`) and Diablo-as-Lord-of-Terror (`doom`) and Kerrigan (`broodmother`) are already taken by the four shipped raids; this wave deliberately picks new chassis. Where a desired chassis is already a regional boss (e.g. `terrorblade` is the Mad Moon boss), either swap the chassis or accept that a chassis can back both a regional boss and a marquee raid — they are different encounters. Flagged in §7.

### 2.2 Loot: extend the themed lanes, reserve the peak

Each marquee boss's anchor pool is its chassis attribute's signature set, so the player still learns "where to farm what." Mechanically this is a small extension of the shipped mapping:

```14:41:src/data/bosses.ts
function themedLoot(heroId: string, rank: BossDef['rank']): LootTable {
  const isMini = rank === 'mini-boss';
  let guaranteed = ['ultimate-orb'];
  let assembledPool = ['aghanims-scepter', 'refresher-orb'];
  if (AGILITY_CARRIES.has(heroId)) {
    guaranteed = ['eaglesong'];
    assembledPool = ['butterfly', 'eye-of-skadi', 'diffusal-blade'];
  } else if (STRENGTH_TITANS.has(heroId)) {
```

The marquee bosses either join the existing attribute sets (so `themedLoot` resolves them with zero new code) or carry a **bespoke** `ItemDropTable` (the richer `LOOT_OVERHAUL.md` §2 form) when their signature differs from the generic lane — e.g. the Renegade Marshal anchoring Hurricane Pike + a Maelstrom→Mjollnir line rather than the generic agility Butterfly. Their guaranteed-Mythical component, a component slot, and a Legendary/Immortal anchor slot follow the §3.1 boss-table shape. The **Immortal** signature copy and any **Unusual** quality stay `exclusiveTo: ['raid']` (or `['special-battle']` for the convergence boss), so the Black Market and shops never reach them.

### 2.3 Where they live: raids, guardians, regions

- **As raids.** Each marquee boss is a new entry beside the four in `ALL_RAIDS`, carrying its `title`/`dialogue` (required narrative fields), add-waves, zones, enrage, `unlockQuest`, and themed `loot`. The raid runner (`runRaidEncounter`) and the live raid session already execute every beat; this is data.

```37:51:src/data/raids.ts
export const ALL_RAIDS: RaidDef[] = [
  {
    id: 'roshan-pit',
    name: "Roshan's Pit",
    title: 'The Pit That Never Stays Empty',
    location: 'Mad Moon Crater',
    unlockQuest: 'recruit-phoenix',
    boss: { heroId: 'sven', level: 30, items: ['black-king-bar', 'assault-cuirass'], hpScale: 2.8, damageScale: 1.05 },
    addWaves: [{ atHpPct: 55, summon: fallen, count: 3 }],
    zones: [{ atHpPct: 70, zone: { ...fireZone, radius: 260 } }],
```

- **As dungeon guardians.** A marquee boss `id` can be the `guardian` of a new `DungeonDef`, so the same fight is also the destination at the bottom of a generated descent, with the dungeon's per-room `loot` themed to that boss (the agility dungeon drops the agility anchors, etc.). This is exactly the shipped Frost Hollow pattern, pointed at a marquee `BossDef`:

```83:101:src/data/dungeons.ts
export const FROST_HOLLOW: DungeonDef = {
  id: 'frost-hollow',
  name: 'Frost Hollow',
  regionId: 'icewrack',
  biome: 'snow',
  templates: ['frost-entry', 'frost-crossing', 'frost-cache'],
  roomCount: { min: 6, max: 8 },
  spawnPool: [
    { creepId: 'ghost', weight: 4, cost: 10 },
```

- **As regional content.** Each marquee boss is placed in a deep region (Vile Reaches onward) with a matching biome dungeon where wanted, and gated behind a recruit/quest `unlockQuest` so it reads as earned marquee content, not a menu entry that appears on day one.

**The seam.** New rows in `ALL_RAIDS`, `ALL_DUNGEONS`, and the `themedLoot` mapping (or bespoke `ItemDropTable`s), plus `DECISIONS.md` touchstone→original entries. No new system: the raid runner, the dungeon session, the loot roller, and the reservation predicate all already exist and stay the system of record.

---

## 3. THE ARMORY & THE BENCH — collection management made first-class (L8)

### 3.1 The burden the player named

Five fielded heroes × (six item slots + one neutral) = **35 live slots**, drawn against a bench of up to **65 heroes**. With more marquee bosses raining curated drops, the collection grows fast, and the shipped Armory — which only equips/reclaims for *currently fielded* heroes — turns bench-gearing into a swap-field-equip-swap-back grind:

```1554:1558:src/systems/game.ts
  /** Equip an item from the Armory stash into a hero's regular six-slot inventory. */
  equipArmoryItem(recIdx: number, stashIdx: number): boolean {
    const rec = this.party[recIdx];
    const saved = this.inventoryStash[stashIdx];
    if (!rec || !saved) return false;
```

`recIdx` indexes `this.party` (the fielded five), so you cannot hand a dropped Heart to a benched titan without fielding it first. The mobility works; the *reach* is the gap.

### 3.2 The Armory screen (the management surface)

A first-class screen — the home of the bind-to-hero model — built from the existing stash plus two derived view-models:

- **Browse the bench, not just the field.** Generalize `equipArmoryItem` / `reclaimArmoryItem` to address **any owned hero** (fielded or benched), not only `this.party`. A benched hero stores its build in its save record (it already does — `rec.items`), so equipping to a benched hero is the same splice against `rec.items` the unfielded branch already runs; we only widen the index from "party slot" to "owned-hero id." This is the one functional change in the slice.
- **The Armory inventory.** The unequipped bound pool (`inventoryStash`) shown with rarity color and quality border (the `LOOT_OVERHAUL.md` §3.6 palette), filterable by rarity/quality/attribute-fit, with a "salvage" action for dupes already wired (`salvageArmoryItem`).
- **Per-hero panels.** For each owned hero, its six slots + neutral slot, with one-click equip-from-Armory and reclaim, and a "what this hero wants" hint cross-linked to the Atlas (`LOOT_OVERHAUL.md` §3.7) so gearing decisions are legible.

### 3.3 Loadouts and gear-the-field

The QoL the bench actually needs:

- **Saved loadouts.** A named set of item ids assigned to a hero (a build), persisted per owned hero. Switching loadouts pulls the named items from the Armory onto the hero and returns the displaced ones, all through the existing bound move plumbing (never gold).
- **Gear-the-field in one action.** When you set your fielded five, "equip loadouts" pulls each one's assigned loadout from the Armory in a single click, so fielding a team is one decision (who) not thirty-five (which item where).
- **Contention is surfaced, not silent.** If two heroes' loadouts claim the same single bound copy, the screen flags it (you own one Heart; two builds want it) rather than silently failing — turning a frustration into the explicit "do I farm a second or shuffle it" decision the dupes-never-dead pillar wants.

### 3.4 Dupes, quality, essence — unchanged, just legible

No new economy. The Armory screen exposes the shipped `essence` salvage and the quality-upgrade path so a dupe's three options (gear another hero / upgrade quality / salvage) are one menu, and the contention flag in §3.3 tells you *which* heroes are still waiting on a copy.

**The seam.** Widen two existing `Game` methods from party-index to owned-hero-id; add a `loadouts` map to `GameSave` (additive, `SAVE_VERSION` bump with an empty-default migration) and `armoryView()` / `heroLoadout()` view-models beside the shipped `codexEntries()` / `atlasEntries()`; render an Armory tab in the existing party/Compendium UI. No core change, no new economy, no change to what binds. `boundary.test.ts` stays green.

---

## 4. ARCHITECTURE IMPACT — what touches what

| Layer | What it gains | Touches the headless resolution core? |
|---|---|---|
| `src/core/` | Nothing new required. Marquee bosses reuse `BossDef`/`RaidDef`/`LootTable`/`ItemDropTable`; the Armory reuses `ItemSave.bound`. (Optional: a `loadouts` type if modeled in core.) | No. No roller, effect, or resolution change. `boundary.test.ts` green. |
| `src/systems/` | `equipArmoryItem`/`reclaimArmoryItem` widened from `this.party` index to any owned-hero id; loadout apply/save/clear actions through the existing bound-move path; `armoryView()`/`heroLoadout()` derived view-models. Marquee raids/dungeons run on the existing `runRaidEncounter` / `DungeonSession` with no change. | No (calls existing helpers). |
| `src/data/` | New `ALL_RAIDS` entries; new `ALL_DUNGEONS` entries with marquee `guardian`s; `themedLoot` mapping extension and/or bespoke marquee `ItemDropTable`s with `exclusiveTo` reservations; region placement + `unlockQuest`s; `DECISIONS.md` touchstone→original entries. | No. |
| `src/ui/` | The Armory screen (bench browser, per-hero panels, rarity/quality display, contention flag), loadout editor, gear-the-field action; marquee boss/raid entries surface in existing Raids/Town Services + Compendium. | No. |
| `GameSave` | A `loadouts` map (per owned hero → named item-id sets). Additive; `SAVE_VERSION` bump with a migration defaulting it empty so old saves load. | N/A |

The only functional code change in the whole addendum is widening two Armory methods' addressing and adding loadouts; everything else is content data and derived views.

---

## 5. PHASING — shippable slices, each playable and green

Continues the parent docs' numbering. Each slice stands alone and keeps `npm test` + `npm run build` + `boundary.test.ts` green.

**C1 — the marquee wave (data).** Author the ~6 bosses as `ALL_RAIDS` entries with titles/dialogue/mechanics/themed loot, extend `themedLoot` (or add bespoke tables), reserve their Immortal/Unusual peaks, place them in regions behind `unlockQuest`s, and record touchstone→original mappings in `DECISIONS.md`. Pure content; the raid runner already executes it.

**C2 — marquee dungeons (data).** For the bosses that want a descent, add `DungeonDef`s with the marquee boss as `guardian` and per-room loot themed to it, reusing the shipped generator/session. Optional per boss.

**L8 — the Armory collection layer.** Widen `equipArmoryItem`/`reclaimArmoryItem` to any owned hero, add the `loadouts` save field + migration, the `armoryView()`/`heroLoadout()` view-models, the Armory screen, loadout editor, gear-the-field, and the contention flag. The one functional slice; lands the bench-gearing loop.

**D8 — guardian polish (optional).** If C2 marquee dungeons want bespoke room templates/affix themes per franchise (a void-themed Zeratul descent, a hellfire Baal descent), author them as the DUNGEON-doc data they already are. Pure content, no balance risk.

C1 carries the only balance risk (a new raid's tuning) and wants a playtest pass before its numbers lock; everything else is content or view.

---

## 6. ACCEPTANCE — each slice is done when (testable, `PROGRESS.md` style)

| Slice | Done when |
|---|---|
| C1 | Each new marquee boss runs its full raid timeline headlessly (phases, add-waves, zones, enrage) and rolls its themed loot with pity on a fixed seed; its anchor pool matches its chassis attribute (the agility marquee anchors agility cores, not strength); its Immortal/Unusual copy never appears in any shop or Black Market pool (the `exclusiveTo` predicate holds); every marquee boss carries name+title+≥1 dialogue line (test 23 stays green); `DECISIONS.md` records each touchstone→original. |
| C2 | A marquee dungeon generates deterministically on a seed, ends in its marquee `guardian` room running the existing boss engine, and the guardian rolls its themed anchor; reproducible like Frost Hollow. |
| L8 | A bound item equips onto a **benched** (non-fielded) hero and back to the Armory without fielding it, and never converts to gold; a saved loadout applies in one action (pulls the named bound items onto the hero, returns the displaced) and survives a save round-trip; gear-the-field equips all five fielded heroes' loadouts in one call; a single bound copy claimed by two loadouts raises the contention flag rather than silently dropping one; `boundary.test.ts` stays green (no core touch). |
| D8 | A franchise-themed marquee dungeon's templates/affixes generate on a seed with no new core code; pure data. |

Cross-cutting gates (every slice): `npm test` and `npm run build` green; `boundary.test.ts` green; `rollLoot`/`rollItemDrops` keep their signatures so the shipped loot/raid tests stay the system of record; the gated-shop guard (`GATED_TOP_TIER`) and the `exclusiveTo` predicate still reject reserved items from every buy and gamble path; the homage convention holds (no verbatim trademark in a shipped name).

---

## 7. OPEN DECISIONS — settle these while building

1. **Final homage names and chassis.** The §2.1 table is a first sketch. Lock each shipped name + title and each `heroId` chassis, and resolve chassis collisions with regional bosses (swap, or accept shared chassis across a regional boss and a marquee raid). Decide in C1.
2. **Denylist scope.** The shipped denylist guards Dota *esports* trademarks only. Decide whether to widen it to catch Blizzard/Valve *character* names (turning the §1.1 convention into an automated guard) or to keep the homage rule a reviewed convention recorded in `DECISIONS.md`. Decide in C1.
3. **Raid vs. dungeon-guardian per boss.** Which marquee bosses are raids only, which also anchor a generated dungeon (C2), and which (the convergence boss) are `special-battle` reserved. Decide in C1/C2.
4. **Loadout model.** Item-id sets (simplest, recommended) vs. richer named builds that also remember neutral + talent intent. Whether displaced items auto-return to the Armory or prompt. Decide in L8.
5. **Bench-equip reach.** Whether L8 lets you equip to *any* owned hero or only heroes that meet a level/recruit gate, to avoid front-loading bound power onto an under-leveled bench hero. Decide in L8.
6. **Stash/loadout pressure.** Whether the Armory is unbounded (friendlier) or capped (a salvage decision); whether unused loadouts count against any cap. Inherits `LOOT_OVERHAUL.md` §7.8; confirm alongside L8.
7. **How many waves.** This is wave one (~6). Whether a second wave follows (more StarCraft/Warcraft/Diablo, or new franchises) once the first is tuned. Hold until C1 ships and plays.

---

## 8. PRINCIPLES (consistent with the parent docs and `SPEC.md` §10)

- **Homage, not the trademark.** Every marquee boss is an original name and title on a Dota chassis, winking at its touchstone, mapped in `DECISIONS.md` — the convention the shipped raids already keep.
- **One entity, three surfaces.** A marquee boss is authored once and expressed as a raid, a dungeon guardian, and a loot anchor; never authored three times.
- **Reserve the peak.** More chase, same ceiling: Immortal signatures and Unusual quality stay raid/special-battle reserved, unreachable from shop or gamble.
- **The roster is the sink; the Armory tends it.** Mobility already exists; this makes gearing the 65-hero bench a one-screen action, so a closed item set still feeds a looter.
- **Dupes are never dead, and now legible.** A second copy gears a bench hero, upgrades quality, or salvages — and the Armory tells you which hero is still waiting.
- **Additive and reversible.** New content rows and two widened methods; the raid runner, dungeon session, loot roller, and bind plumbing stay the tested systems of record. The base game is never worse for any of this existing.
- **Keep the core headless and deterministic.** Zero core change: no roller, effect, status, or resolution path moves. `boundary.test.ts` stays green.
- **Ship slices.** C1 alone widens the chase and is worth shipping; L8 alone makes the bench gearable and is worth shipping. Build ahead, keep it green, demo often.
