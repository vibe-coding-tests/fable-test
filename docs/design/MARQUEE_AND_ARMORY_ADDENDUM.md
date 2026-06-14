# MARQUEE & ARMORY ADDENDUM - shipped closure for bosses, raids, and the bench

Companion to `LOOT_OVERHAUL.md` and `DUNGEON_OVERHAUL.md`.

This addendum started as the plan for two player-facing asks: more marquee bosses to chase, and an Armory screen that can gear the whole 65-hero roster instead of only the active five. The code now has both. Treat this file as the shipped design record for C1, C2, and L8, plus the small amount of follow-up still worth tracking.

---

## STATUS - 2026-06-14 (as built)

**Complete in code.** The marquee wave, marquee descents, and bench Armory layer all shipped on top of the existing loot, raid, dungeon, and save systems. The headless core boundary still holds: no combat roller, effect interpreter, or deterministic resolution path moved for this addendum.

What's live:

- **C1 - marquee raid wave: done.** `src/data/raids.ts` now has 11 raids: the four earlier raids plus seven marquee wave-one raids. `src/test/marquee.test.ts` asserts the seven marquee ids, loot lanes, seeded raid timelines, pity, and raid-quality Unusual rolls.
- **C2 - marquee descents: done.** `src/data/dungeons.ts` now has four dungeons: Frost Hollow plus The Severed Dark, Worldstone Vault, and Ember Caldera. The three marquee descents reuse the shipped generator and dungeon session, end in a guardian room, and have lane-anchored guardian loot.
- **L8 - Armory collection layer: done.** `Game` exposes `armoryView()`, `equipArmoryItemForHero()`, `reclaimArmoryItemForHero()`, saved loadouts, `applyHeroLoadout()`, `gearFieldLoadouts()`, and contention reporting. The HUD renders the Armory bench, stash, filters, salvage, forge controls, loadout actions, and gear-the-field action.
- **Save migration: done.** `GameSave.loadouts` is part of the save shape. Phase 6 added and normalizes Armory loadouts; the current save version is 7 because board quests shipped later.
- **D8 - guardian polish: folded into C2.** The useful D8 work shipped as data: themed descents, templates, affixes, spawn pools, and guardian loot. No separate system slice remains.

The focused verification suite is `src/test/marquee.test.ts`, `src/test/economy.test.ts`, `src/test/save-migration.test.ts`, and the registry checks in `src/test/data-lint.test.ts`.

---

## 0. WHY THIS ADDENDUM EXISTS

The parent docs had already built the machinery:

- `LOOT_OVERHAUL.md` shipped rarity, quality, bound drops, curated boss loot, source reservations, the Black Market, salvage, and the item Atlas.
- `DUNGEON_OVERHAUL.md` shipped deterministic generated dungeons, room rewards, guardian rooms, affixes, modifiers, and persistent guardian pity.
- The raid runner already supported add-waves, zones, enrage, scripted dialogue, unlock quests, and seeded headless outcomes.

This addendum only needed to add content and widen the Armory's reach. That is how it shipped: new data rows and systems-layer collection management, not a new combat architecture.

---

## 1. SETTLED RULES

**Original homages.** Every cross-franchise boss ships under an original name and title on a Dota hero chassis. The touchstone mapping lives in `DECISIONS.md`; the shipped name never uses the touchstone's trademarked character name.

**One boss, several surfaces.** A marquee boss can be a raid, a dungeon guardian, and a loot anchor. It is still authored through the same existing content records: `RaidDef`, `BossDef`, `DungeonDef.guardian`, and loot tables.

**Combat drops own the peak.** Aegis, Refresher Shard, and Cheese remain raid-only through `exclusiveTo`. Top-tier chase anchors are combat drops from boss, raid, and dungeon sources, and the shared source predicate keeps them out of shops and the Black Market. Raid tables carry the marquee Unusual-quality chance; this addendum's boss and dungeon guardian tables top out below Unusual.

**The roster is the sink.** Bound top-tier items move across owned heroes through the Armory. The long game is gearing more heroes, not converting rare drops into gold.

**Dupes stay useful.** A second copy can gear another hero, resolve a loadout conflict, upgrade through essence, or be salvaged. The Armory view makes those choices visible.

---

## 2. MARQUEE WAVE - C1 SHIPPED

Wave one shipped as seven marquee raids on top of the four earlier raids.

| Raid id | Shipped name | Touchstone | Chassis | Lane | Extra surface |
|---|---|---|---|---|---|
| `renegade-marshal` | The Renegade Marshal | Jim Raynor | `sniper` | Agility / marksman | Raid only |
| `void-prelate` | The Void Prelate | Zeratul | `templar-assassin` | Agility / assassin | `severed-dark` guardian via `marquee-void-prelate` |
| `forsaken-queen` | The Forsaken Queen | Sylvanas | `drow-ranger` | Agility / ranger | Raid only |
| `sundered-betrayer` | The Sundered Betrayer | Illidan | `terrorblade` | Agility / metamorph | Raid only |
| `prime-evil` | The Lord of Destruction | Baal | `wraith-king` | Strength / titan | `worldstone-vault` guardian via `boss-wraith-king` |
| `lord-of-hatred` | The Lord of Hatred | Mephisto | `razor` | Intelligence / lightning | Raid only |
| `last-eldwurm` | The Last Eldwurm | Dota-native | `dragon-knight` | Strength / intelligence hybrid | `ember-caldera` guardian via `marquee-last-eldwurm` |

Each raid carries:

- `name`, `title`, `location`, `unlockQuest`, and original dialogue.
- A `boss` setup with a Dota `heroId`, level, items, HP scale, and damage scale.
- Add-waves, zones, and enrage values that the existing raid session executes.
- A curated `raidLoot()` table with guaranteed components, assembled anchors, pity, and raid quality odds.

The code path is pure content. The test path proves it stays that way: `src/test/marquee.test.ts` runs every marquee raid through `runRaidEncounter()` on a fixed seed and checks that the scripted add-wave and zone beats fire deterministically.

### Loot Lanes

The shipped lane choices are deliberate:

- Agility raids anchor items such as `eaglesong`, `butterfly`, `eye-of-skadi`, `bloodthorn`, `abyssal-blade`, `diffusal-blade`, and `maelstrom`.
- Strength raids anchor `reaver`, `heart-of-tarrasque`, `satanic`, `radiance`, `assault-cuirass`, and `black-king-bar`.
- Intelligence raids anchor `mystic-staff`, `scythe-of-vyse`, `refresher-orb`, `octarine-core`, `aghanims-scepter`, and `aghanims-blessing`.
- The Last Eldwurm intentionally crosses strength and intelligence, with Reaver plus Aghanim-style anchors.

That means a player can learn where to farm a category. The Void Prelate does not hand out strength titan gear; the Lord of Hatred does not pretend to be an agility carry.

### Homage Scope

The denylist remains scoped to Dota esports names. Blizzard and Valve character touchstones are handled by convention and review, with the original-name mapping recorded in `DECISIONS.md`. The code validates shipped names and dialogue for the existing denylist, but it does not try to automate every cross-franchise homage decision.

---

## 3. MARQUEE DESCENTS - C2/D8 SHIPPED

Three marquee raids also became dungeon descents. They reuse the same dungeon generator/session that Frost Hollow proved.

| Dungeon id | Name | Region | Guardian | Loot lane |
|---|---|---|---|---|
| `severed-dark` | The Severed Dark | `quoidge` | `marquee-void-prelate` | Agility anchors |
| `worldstone-vault` | Worldstone Vault | `vile-reaches` | `boss-wraith-king` | Strength anchors |
| `ember-caldera` | Ember Caldera | `mad-moon-crater` | `marquee-last-eldwurm` | Strength / intelligence anchors |

Each descent has a themed spawn pool, affix pool, room templates, opt-in modifiers, a guardian id, and a per-room loot map. Guardian drops carry pity and source quality odds. They do not add a new dungeon engine.

`src/test/marquee.test.ts` covers the acceptance contract:

- Each marquee dungeon registers and resolves its guardian, creeps, and templates.
- Generation is deterministic on the same seed and sensitive to a different seed.
- The final room is the guardian room.
- Guardian loot drops its themed anchor within a seed sweep.
- Dungeon guardian quality does not roll Unusual for this addendum's tables.

D8 is therefore closed as data polish. Future franchise-themed rooms should be added as more `DungeonDef`, `RoomTemplate`, spawn, and loot data, not as a new architecture slice.

---

## 4. ARMORY & BENCH - L8 SHIPPED

L8 widened the shipped bind-and-move model from active-party inventory management to whole-roster collection management.

### Bench Reach

The old party-index methods still exist as back-compat wrappers:

- `equipArmoryItem(recIdx, stashIdx)` resolves the party slot and calls `equipArmoryItemForHero(heroId, stashIdx)`.
- `reclaimArmoryItem(recIdx, invSlot)` resolves the party slot and calls `reclaimArmoryItemForHero(heroId, invSlot)`.

The real API now addresses any owned hero by `heroId`. It works for fielded heroes and benched heroes because both are saved as hero records with six item slots. Equipping still respects item level requirements, and reclaiming only returns bound main-slot items to the Armory.

### Loadouts

Loadouts shipped as named item-id slot sets:

- `saveHeroLoadout(heroId, name)` records the hero's six current item ids.
- `heroLoadout(heroId, name)` returns a normalized six-slot tuple.
- `applyHeroLoadout(heroId, name)` pulls matching bound items from the Armory or keeps matching equipped copies, returns displaced bound items to the Armory, and fails clearly if required items are missing.
- `gearFieldLoadouts(name)` applies the named loadout to each fielded hero that has one saved.
- `loadoutConflicts(name)` reports when more heroes claim an item id than the owned bound copies can satisfy.

The conflict behavior is important: one Butterfly claimed by two loadouts blocks the bulk gear action and reports the contention instead of silently dropping one hero's build.

### UI Surface

The HUD Armory section is part of the Town Services modal. It shows:

- The Armory stash with rarity color, grade frame, quality label, item comparison, set progress, affixes, sockets, salvage, lock, forge, and quality upgrade controls.
- A hero selector that includes fielded and benched heroes.
- Per-hero panels with level, fielded/bench status, bound items, saved loadouts, Aghanim augments, conflicts, Save Loadout, Apply, and Reclaim All actions.
- Loot filter controls and a gear-the-field button.

The screen grew beyond the original L8 minimum because later forge, gem, filter, and augment systems also live naturally in the Armory. The L8 core remains the same: one screen for moving and applying bound gear across the roster.

### Save Shape

`GameSave.loadouts` is serialized as `ArmoryLoadouts`. Phase 6 added normalization for older saves and trims invalid loadout shapes into six slots. The current `SAVE_VERSION` is 7 because board quests landed afterward, but L8's migration remains the Phase 6 layer.

---

## 5. ARCHITECTURE IMPACT

| Layer | Shipped change | Core resolution impact |
|---|---|---|
| `src/core/` | Save/loadout types and Phase 6 normalization. Existing raid, loot, dungeon, and effect primitives are reused. | No combat resolution change. |
| `src/data/` | Seven marquee raids, three marquee dungeons, two added marquee guardian boss ids, lane-tuned loot tables, and original homage mappings. | None. Data only. |
| `src/systems/` | Whole-roster Armory methods, loadout application, contention reporting, save/build integration, dungeon and raid delivery through existing sessions. | None. Calls existing primitives. |
| `src/ui/` | Armory bench screen inside Town Services, stash and hero panels, loadout actions, filters, forge/salvage/socket controls, and gear-the-field. | None. View and input surface only. |
| `src/test/` | Marquee suite, Armory economy tests, save migration tests, and registry/data-lint coverage. | Protects the boundary. |

The addendum stayed additive. The raid runner, dungeon session, loot roller, item source predicate, and save migration chain remain the systems of record.

---

## 6. ACCEPTANCE - AS BUILT

| Slice | Done evidence |
|---|---|
| C1 | All seven marquee raids register on top of the four earlier raids; each has a title, dialogue, valid chassis, valid unlock quest, lane-correct loot, deterministic raid timeline, add-waves/zones, pity, and raid quality odds. |
| C2 | The three marquee dungeons register; each resolves region, templates, creeps, and guardian; each generates deterministically; each ends in a guardian room; guardian loot drops lane anchors with pity. |
| L8 | A bound item equips onto a benched hero and returns to the Armory without fielding that hero; loadouts save, apply, and survive a save round-trip; gear-the-field applies fielded loadouts; single-copy contention is reported and blocks bulk equip. |
| D8 | Closed through C2 data: themed descents, templates, affixes, spawn pools, and guardian loot are shipped without new dungeon code. |

Cross-cutting gates:

- `rollLoot` and `rollItemDrops` keep their public role as the loot system of record.
- Shops and Black Market paths still use the shared source restrictions and gated top-tier checks.
- `boundary.test.ts` should remain green because this addendum does not add renderer or DOM dependencies to the headless core.
- Homage names stay original. The franchise touchstone is tracked in `DECISIONS.md`, not shipped as the boss name.

---

## 7. DECISIONS LOCKED

1. **Names and chassis.** Locked as the seven-row C1 table above. The Sundered Betrayer was added after the initial six-boss row and is now part of wave one.
2. **Denylist scope.** Keep the automated denylist focused on Dota esports terms. Cross-franchise boss names are handled by original naming plus decision-log review.
3. **Raid vs. guardian.** All seven are raids. Void Prelate, Lord of Destruction, and Last Eldwurm also anchor descents. No special-battle-only convergence boss shipped in this wave.
4. **Loadout model.** Use named six-slot item-id sets. Missing items fail clearly. Displaced bound items auto-return to the Armory.
5. **Bench reach.** L8 targets any owned hero, fielded or benched. Item level requirements still apply.
6. **Stash pressure.** The Armory remains friendly and uncapped in this slice. Salvage, filters, locks, essence, and contention reporting handle pressure.
7. **Next wave.** No second wave is scheduled here. If one happens, author it as a new C3 content slice after playtesting the current seven.

---

## 8. REMAINING FOLLOW-UPS

These are not blockers for the addendum's shipped state:

- **Playtest tuning.** The raid HP/damage scales mirror the earlier marquee raids, but the seven-fight wave still wants a human pass for time-to-kill, add pressure, and reward feel.
- **Decision-log cleanup.** `DECISIONS.md` records the original six-boss C1 row and a later Story closure row for the Sundered Betrayer. The facts are present; a future cleanup can merge them into one entry.
- **Future homage guard.** If future waves expand beyond reviewed one-off names, consider a separate cross-franchise touchstone checklist. The current shipped wave does not need a broader denylist.

---

## 9. PRINCIPLES PRESERVED

- **Original names, recognizable silhouettes.** A veteran can catch the touchstone; the shipped name is ours.
- **One content definition, multiple surfaces.** Raid, guardian, and loot anchor all point at existing data shapes.
- **The roster consumes the loot.** Bound gear moves through the Armory so bench depth becomes the chase.
- **Dupes have jobs.** Gear another hero, fix contention, upgrade quality, or salvage.
- **Additive and reversible.** New raids, dungeons, loadout state, and Armory view-models sit on existing systems.
- **Keep the core deterministic.** The headless combat and loot contracts stay testable on fixed seeds.
