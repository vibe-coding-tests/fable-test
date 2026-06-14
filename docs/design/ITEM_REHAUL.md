# ITEM REHAUL — "LOOT THAT FEELS ALIVE"

A ground-up redesign of how items drop, roll their properties, and improve over time. Companion to `SPEC.md`, `STORY.md`, and `PRESENTATION_SPEC.md`. Same crunch-mode rules: this is direction and priority, not a gate.

This is the v2 direction. v1 proposed a single Grade scalar as the whole story. v2 keeps Grade but makes it one axis among several, and adds the parts that make a looter exciting: random affixes you chase, signature powers that change how you play, sockets, sets, and a loot moment with real ceremony. The three touchstones:

- **Borderlands** for the dopamine of the drop itself: the beam, the sound, the "what does this one *do*."
- **Diablo** for crafting and rolling: affixes, rerolls, imprints, tempering, gems.
- **WoW** for the scaffolding: rarity colors, item level, sockets, set bonuses.

---

## 0. THE PROBLEM IN ONE PARAGRAPH

Right now every dropped item is identical to its crafted or bought version. A Crystalys from a creep kill is the same as a Crystalys from a shop. There are no reasons to keep killing the same camp, no decisions at the Tinker's Bench beyond quality upgrades, and no texture to loot. It either drops or it doesn't, and when it does you already know exactly what you have. The fix is to give each copy of an item its own identity: a set of rolled properties that vary from drop to drop, a few of which are exciting enough to change your build. Then we build an economy of currencies that lets players push that identity upward, with risk and reward calibrated for a single-player game. The goal: every session produces multiple upgrade moments, every item slot feels like it can always get better, and the Tinker's Bench becomes a destination rather than a stop on the way out.

---

## 1. THE FIVE THINGS THAT MAKE AN ITEM

Today an item is its `ItemDef` plus an optional `quality`. Two Daedaluses are the same item. This rehaul gives every dropped copy its own identity across five axes. Each axis answers a different question, and each has its own visual language so the player can read them at a glance.

| Axis | Question it answers | Source | Visual |
|------|--------------------|--------|--------|
| **Tier** | How powerful a class of item is this? | item def (cost-based) | tooltip header label |
| **Rarity** | How rare is this *kind* of item? | item def | the glow color (outer border) |
| **Grade** | How well did *this copy* roll? | rolled on drop | a condition frame + pip count |
| **Affixes** | What bonus properties did it roll? | rolled on drop | the bonus stat lines, blue text |
| **Quality** | What cosmetic prestige does it carry? | drop luck + Forge | particle effect + name flourish |

Two more layers sit on top of an item once it exists: **sockets** (player-filled gem slots) and **set membership** (collect matching pieces for a bonus).

This applies to the six main inventory slots. Three other item categories live outside that economy with their own slot rules: neutral items, augments (Aghanim's), and consumables. They get their own treatment in §8.

The big change from v1: **affixes are the identity, Grade is the roll quality.** Grade no longer carries the whole experience. It decides how many affix slots an item gets and how high its numbers roll. The affixes decide whether you keep it. A Pristine item with two dull affixes can lose to a Sharp item that rolled lifesteal plus a crit proc on the hero who wants exactly that.

### Why these axes do not collide

v1 painted Grade in the same colors as Rarity, which would have put two meanings on one swatch. v2 keeps them apart:

- **Rarity is the glow.** It uses the existing Dota palette (common grey through arcana). It tells you how special the item *type* is, and it drives loot marks, salvage value, and binding exactly as today.
- **Grade is the condition.** It uses a separate metal ramp (cracked grey for Broken, dull bronze, clean steel, bright steel, silver, mirror-gold for Pristine) shown as a frame treatment plus a row of pips. It reads as craftsmanship, not magic.
- **Affixes are text.** They live in the tooltip body as colored stat lines, like Diablo.
- **Quality is a particle effect** and a small name flourish (Inscribed, Frozen, Unusual), exactly the Dota cosmetic read.

One icon can carry all of them without becoming soup: a colored glow (rarity), a metal frame with pips (grade), a particle (quality), and a tooltip full of affix lines.

---

## 2. ITEM TIERS — FORMALIZING WHAT ALREADY EXISTS

The code has a flat `tier` field (`component` / `basic` / `core`). In practice "core" covers nearly a 4× price range and four meaningfully different power bands. This rehaul makes those bands explicit. The `tier` field on `ItemDef` gains `t1` through `t4`. Existing `core` items get re-tiered on audit. Rarity overrides stay as-is.

### Tier map

| Tier | Label | Cost range | Rarity (typical) | Examples |
|------|-------|-----------|-------------------|---------|
| `consumable` | Consumable | — | common | Tango, Salve, Clarity, Wards, Smoke |
| `component` | Component | 50–3400g | uncommon–mythical | Iron Branch through Sacred Relic |
| `basic` | Basic | 425–2100g | uncommon | Boots variants, Bracer, Yasha/Sange/Kaya, Drum, Medallion |
| `t1` | Tier 1 Core | 1800–2500g | rare | Crystalys, Dragon Lance, Mask of Madness, Blink Dagger, Force Staff, Vanguard, Mekansm, Glimmer Cape, Dagon |
| `t2` | Tier 2 Core | 2500–4800g | mythical | Orchid, Desolator, Eul's, Echo Sabre, Skull Basher, Sange+Yasha/Kaya pairs, Shiva's Guard, Pipe, Crimson Guard, Battlefury |
| `t3` | Tier 3 Core | 4800–6100g | legendary | BKB, Daedalus, MKB, Manta, Mjollnir, Assault Cuirass, Guardian Greaves, Ethereal Blade, Wind Waker, Linkens, Satanic |
| `t4` | Tier 4 Core | 5175–7500g | immortal | Butterfly, Heart of Tarrasque, Scythe of Vyse, Eye of Skadi, Refresher Orb, Octarine Core, Aghanim's Scepter, Abyssal Blade, Bloodthorn, Radiance |
| `special` | Special | — | immortal/arcana | Divine Rapier (raid/special-battle), Aegis (raid), Cheese/Refresher Shard (Roshan) |

**Tier sets the affix ceiling.** A higher-tier item draws affixes from richer pools and supports more sockets. It also sets a soft level requirement (see §3.4) and a grade floor: a T4 item never drops below Standard, a T3 never below Worn. Finding a Heart of Tarrasque is always a meaningful event, even at its lowest legal grade.

---

## 3. GRADE — HOW WELL THIS COPY ROLLED

Grade is the per-copy roll-quality band. It does three jobs: it sets how many affix slots the item rolls, it sets the magnitude percentile of the item's base flat stats and of each affix value, and it nudges the level requirement. It is the ladder a player climbs at the Forge. It is no longer the whole experience, because the affixes that fill those slots are what give the item character.

### 3.1 The six grades

| Grade | Frame | Affix slots | Stat percentile | Signature chance | Socket chance |
|-------|-------|-------------|-----------------|------------------|---------------|
| **Broken** | cracked grey | 0 | 0–22% | — | — |
| **Worn** | dull bronze | 1 | 18–42% | — | — |
| **Standard** | clean steel | 1 | 36–64% | — | — |
| **Sharp** | bright steel | 2 | 58–80% | — | 15% |
| **Refined** | silver | 2 | 74–92% | 8% | 35% |
| **Pristine** | mirror-gold | 3 | 88–100% | 20% | 60% (up to 2) |

Adjacent percentile bands overlap by 4 points so rolls near a boundary feel smooth rather than stepped. The frame colors are deliberately a metal-condition ramp, separate from the rarity glow palette (§1).

### 3.2 How the magnitude roll works

Every flat stat (base and affix alike) has a roll variance of ±20% on its nominal value. Grade picks a slice of that band:

```
statMultiplier = 0.80 + percentile × 0.40
```

At the 0th percentile a stat is ×0.80. At the 100th it is ×1.20. The full Broken-to-Pristine spread is a 1.5× ratio on flat stats for the same item.

**Only flat stats take the magnitude roll:** `damage`, `armor`, `str`, `agi`, `int`, `maxHp`, `maxMana`, `attackSpeed`, `hpRegen`, `manaRegen`, `moveSpeed`. Percentage mods, active effects, proc damage, and auras on the *base item* stay at nominal, so the player can always read what an item's abilities do. Affixes are where the spicier rolls live (§4), and affixes can carry percentage and behavior properties because they are clearly labeled as bonuses on this specific copy.

Items with no base passive stats (Blink Dagger) still roll affix slots and grade by the same rules.

### 3.3 Affix slots scale with grade

The slot count in §3.1 is the heart of why grade matters now. A Broken item is a naked base. A Pristine item carries three rolled affixes plus a one-in-five shot at a signature power. Climbing grade is no longer "the same item, bigger number." It is "the same item, more room to become something." Two players who both grind a slot to Pristine can end up with very different items.

### 3.4 Item level and requirements (softened from v1)

v1 scaled the level requirement by grade, which meant a Pristine drop could sit unusable for ten levels. In a five-hero roster game where the level cap is gated by badges and you swap heroes constantly, that produced dead loot. v2 ties the requirement to **tier only**, so the aspiration ("this is an endgame item") survives without the long dead-stash wait.

| Cost range | ilevel | Level req |
|-----------|--------|-----------|
| 50–500g | 1 | 1 |
| 500–1200g | 4 | 4 |
| 1200–2200g | 7 | 7 |
| 2200–3600g | 11 | 11 |
| 3600–5000g | 15 | 15 |
| 5000–6500g | 18 | 18 |
| 6500g+ | 21 | 21 |

Grade adds at most +2 to this, and only at Refined/Pristine, as a light "you grew into the best version" beat rather than a wall. A found item is usable soon after it drops, which keeps the loop tight.

### 3.5 Grade floors by context

Floors are minimums. A drop can always roll higher. Multiple conditions stack and the highest wins.

**By item tier:** Basic/T1/T2 no floor; T3 Worn; T4 Standard; Special Pristine.

**By difficulty:** Nightmare +1 grade step to all floors; Hell +2.

**By regional mastery (badges):** 3+ badges in a region lifts that region's drops to a Sharp floor; 6+ adds a Refined floor on boss kills; a full 8/8 set gives a Sharp floor on all boss drops and Standard on all raids.

**By source:** Elite creep Sharp; dungeon boss first clear Sharp/Refined/Pristine by difficulty; raid clear Refined; gym speed-clear Refined; raid Hell first clear one guaranteed Pristine.

---

## 4. AFFIXES — THE KEYSTONE

This is the change that turns a number into a piece of loot. Each dropped copy rolls a set of affixes from tiered pools. The affixes decide whether the item is trash, a sidegrade, or a godroll. They are the reason to keep killing a camp: the base item is known, but its affixes are a fresh roll every time.

### 4.1 Affixes are nearly free in this engine

The sim already speaks the vocabulary an affix needs. `ItemDef` carries `passiveMods` (a `StatModMap`), `attackMod` (`AttackModSpec` with crit, proc, cleave, lifesteal), `triggers` (the generic `on-kill` / `on-attack-land` / `on-damage-taken` system), and `aura`. An affix is a rolled fragment of one of those. A "+lifesteal" affix is a `StatModMap`. A "heal on kill" affix is a `TriggerSpec` with an `on-kill` effect. A "cleave" affix is an `AttackModSpec`. We compose affixes from the same primitives abilities already use, so the spicy ones cost data, not new systems.

### 4.2 Affix shape

```typescript
export type AffixKind = 'prefix' | 'suffix' | 'signature';

export interface AffixDef {
  id: string;
  name: string;                 // "of the Bear", "Razor-Edged", "Blooddrinker's"
  kind: AffixKind;
  tier: 1 | 2 | 3 | 4 | 5;      // affix power tier; gated by difficulty/region (§14)
  pools: AffixPoolId[];         // which item families can roll it (weapon-like, armor-like, caster-like, any)
  weight: number;               // roll weight within its pool
  // exactly one payload:
  statRanges?: Partial<Record<keyof StatMods, [number, number]>>;  // rolls a value per stat
  attack?: Partial<AttackModSpec>;
  trigger?: TriggerSpec;
  aura?: AuraSpec;
}

export interface RolledAffix {
  affixId: string;
  roll: number;                 // 0..1 position within the affix's ranges (grade-influenced)
  resolved: StatModMap;         // computed once at drop, cached
}
```

A `statRanges` affix rolls each stat within its band, and grade biases the roll position (a Pristine item rolls its affixes near the top of their ranges). Behavior affixes (`attack` / `trigger` / `aura`) carry fixed-but-labeled effects so their power stays readable.

### 4.3 Affix families and a sample pool

Affixes are filtered by an item's family so a staff does not roll cleave and a sword does not roll spell amp.

| Family | Reads from | Example affixes |
|--------|-----------|-----------------|
| **weapon-like** | items with `damage` / `attackMod` | Razor-Edged (+crit chance), Cleaving (cleave %), Blooddrinker's (lifesteal %), Heavy (+damage), Executioner's (on-kill: heal + move burst) |
| **armor-like** | items with `armor` / `maxHp` | of the Bear (+str/HP), Warded (+magic resist %), Thorned (on-damage-taken: reflect), of Endurance (+hp regen), Stalwart (+status resist %) |
| **caster-like** | items with `int` / `spellAmpPct` / actives | Arcane (+spell amp %), of Insight (+mana regen), Overcharged (active cooldown reduction), of the Mind (+int), Resonant (on-cast: small AoE) |
| **mobility / any** | any item | Swift (+move speed), of the Hawk (+attack range), Vital (+max HP), of Fortune (+a small amount of two random stats) |

The pool is data and grows freely. The point is that two copies of the same base diverge: one Crystalys rolls Razor-Edged + Blooddrinker's (a crit-lifesteal carry weapon), another rolls Heavy + Swift (a raw stat stick). Different heroes want different ones.

### 4.4 How many affixes, and from where

Affix slot count comes from **grade** (§3.1). Which affixes are eligible comes from **difficulty and region** (§14). A drop fills its slots by:

1. Pick prefix/suffix balance (a 2-slot item rolls one of each where possible).
2. Draw from the family pool, filtered to the unlocked affix tiers, weighted by `weight`.
3. Roll each affix's values, biased toward the top of the range by grade percentile.

This is the loop a player learns to read: grade tells you how many lines to expect, the lines themselves are the lottery.

---

## 5. SIGNATURE POWERS — THE ORANGE TEXT

Borderlands legendaries and Diablo uniques are exciting because they change how you play, not just how hard you hit. Two sources of that here.

**Built-in kits.** Most legendary and immortal item defs already carry a defining ability (Radiance's burn aura, Butterfly's flutter, Bloodthorn's silence-on-attack). That is the item's signature and it stays exactly as authored. No re-work needed; the Dota identity *is* the orange text.

**Rolled signatures.** At Refined and Pristine, an item can roll a `signature` affix: a curated, build-defining behavior drawn from a small pool, shown in orange in the tooltip. Examples:

- *Stormcaller's*: every third attack chains lightning to two nearby enemies.
- *Vampiric Surge*: a kill grants 4s of large lifesteal and move speed.
- *Glassbreaker*: attacks shred 2 armor for 4s, stacking.
- *Echoing*: your item active has a 20% chance to not go on cooldown.

Signatures roll at 8% on Refined and 20% on Pristine (§3.1), and only from tiers unlocked by difficulty. A signature is the godroll peak: rare, loud, worth chasing a slot to Pristine for. When one drops, it gets the full ceremony in §13.

---

## 6. SOCKETS AND GEMS

A cheap, beloved horizontal layer. Sockets are empty slots the player fills with gems, freely swappable at the Forge.

- **Sockets** roll on drop by grade (§3.1): Sharp 15%, Refined 35%, Pristine up to 2. Tier raises the cap (T3/T4 items can hold 2–3).
- **Gems** are a light item type with a single focused stat (Ruby +HP, Topaz +damage, Sapphire +mana, Emerald +armor, Diamond +all stats). They drop from creeps and chests and sell cheaply.
- **Gem grades** combine upward: three of one gem fuse into the next grade at the Forge, reusing the existing neutral-enchant pattern (`enchantsInto`). A Flawless Topaz is the payoff for hoarding chips.
- **Slotting is free; pulling costs.** Drop a gem in for nothing, pull it back out for a small Essence fee, so socket choices carry a little weight without being precious.

Sockets give players a way to patch a build hole on an otherwise-great item ("this Daedalus rolled no HP, socket a Ruby") and a reason to care about the small gem drops that would otherwise be noise.

---

## 7. SET BONUSES

A long-term chase that gives loot a collection goal. A handful of themed sets, each 3–4 items, flavored by region or boss. Set membership is a def field; the bonus applies to the hero wearing the pieces.

```typescript
// ItemDef addition
set?: string;            // set id, e.g. 'frostforged'

// new registry
export interface ItemSetDef {
  id: string;
  name: string;
  pieces: string[];                 // item ids
  bonuses: { atPieces: number; mods?: StatModMap; aura?: AuraSpec; trigger?: TriggerSpec }[];
}
```

Example: the **Frostforged** set (Icewrack) gives +6 armor at 2 pieces and an on-attack chill at 3. Bonuses reuse the existing statmod/aura/trigger application path, so a set bonus is the same machinery as an aura item. Sets pair naturally with the themed regional loot pools that already exist, and they give a reason to keep specific drops you would otherwise disenchant.

Set pieces show a set tag in the tooltip and count up live ("Frostforged 2/3") so the chase is visible.

---

## 8. ITEMS OUTSIDE THE SIX SLOTS

The grade-and-affix economy in §3–§7 governs the six main inventory slots. Three other item categories sit outside it, each with its own slot rules and its own relationship to grades and affixes.

### 8.1 Neutral items — the one found-power slot

Each hero keeps a single dedicated **neutral slot**, separate from the six item slots and from the augment slots below. A neutral cannot be sold; the bench only swaps it between slot and stash. That stays.

Neutrals are a different fantasy from the six-slot lottery: a curated power spike you find and understand at a glance, one at a time. So they take a lighter slice of the rehaul. A dropped neutral rolls a **grade** (the ±20% magnitude band from §3.2), which gives a found neutral a "is this a good one?" texture and a Forge upgrade path. It does **not** roll affixes, signatures, or sockets. Neutrals stay readable known quantities; the chase on them is grade alone.

Everything else neutral stays: tiers 1–5, drop by creep tier (rates bumped in §10.2), and the bench reroll / enchant (three duplicates into one up-tier) / reclaim. New: a neutral can be Grade-Up'd at the Forge like a main item, and disenchanted for Essence.

### 8.2 Augments — Aghanim's Scepter and Shard (NEW)

Today Aghanim's Scepter, Blessing, and Shard are stat-stick items that each eat one of the six inventory slots, and the hero's actual scepter upgrade (`HeroDef.aghanim`) is only descriptive. That makes "do I give up a slot for Aghs?" a non-decision and wastes the upgrade's identity.

Fix: a per-hero **augment track** with two dedicated slots that are not inventory slots.

- **Scepter augment.** Consuming an Aghanim's Scepter (or Blessing) permanently grants that hero its scepter upgrade plus the scepter's stat bonus. Permanent once applied. Aghanim's Blessing folds in here as the always-permanent scepter.
- **Shard augment.** Consuming an Aghanim's Shard permanently grants the shard upgrade plus its small stats.

This frees an inventory slot and matches the lore that a hero "becomes more themselves." It reads like a class mod you bank into the hero rather than a stat stick you juggle. Augments take no grade and no affixes; they are categorical upgrades like special items, where the power is the ability change, not a rolled number.

Acquisition is unchanged: Scepter, Blessing, and Shard still drop from bosses, raids, and dungeons or come from the recipe. The deeper work this unlocks is wiring each hero's actual scepter and shard ability change, turning `HeroDef.aghanim` from a descriptive flag into a real upgrade payload. The augment slot is the container; the per-hero upgrades fill in over time, with a stat-and-flag fallback for any hero whose upgrade is not yet authored.

### 8.3 Consumables — percentage, not flat

Flat heals fall off a cliff. Healing Salve's 400 HP is enormous at level 3 and trivial at level 25. So healing and mana consumables convert to a **percentage of max** over their existing durations, which keeps them useful at every level.

| Consumable | Today (flat) | Rehaul (% of max, same duration) | Breaks on damage |
|-----------|-------------|----------------------------------|------------------|
| Tango | 7 hp/s × 16s = 112 | 15% of max HP over 16s, ×3 charges | no |
| Healing Salve | 50 hp/s × 8s = 400 | 25% of max HP over 8s | yes |
| Clarity | 11 mana/s × 20s = 220 | 25% of max mana over 20s | yes |
| Faerie Fire / Mango / other instant restores | flat | small % of max, instant | — |

The durations and break-on-damage rules are unchanged, so the *feel* is identical and only the magnitude scales. Worked example: Tango at 15% per charge heals 90 HP on a 600-HP support and 450 HP on a 3000-HP tank, instead of a flat 112 that means everything early and nothing late. A small flat floor, so a very low-pool hero is not shortchanged, is optional and can be tuned after play data. Non-healing consumables (Dust, Wards, Smoke, Tome of Knowledge) are unchanged. Percentage heals scale with the maxHp affixes and grade from §3–§4, which is intended: stacking HP makes your sustain better too.

Implementation: the heal-over-time already runs through the `buff` status applying `hpRegenPctMax`, which exists and the sim reads for Healing Ward. Add the mirror stat `manaRegenPctMax`, point the consumable defs at the percentage stats, and the existing status path carries the rest.

---

## 9. QUALITY — NOW PURELY COSMETIC PRESTIGE

v1 ran Quality (standard through unusual) and Grade as two parallel power ladders, which was confusing: both had six rungs, both had colors, both bumped numbers. v2 resolves this by making **Grade the power axis and Quality the cosmetic prestige axis.** Quality keeps its existing six steps, its particle effects, and the Inscribed per-kill counter, plus a small stat flourish for flavor. It is the Dota cosmetic read: a Frozen item glows, an Unusual one carries a rare particle, an Inscribed one counts your kills.

The Quality Gamble at the Forge stays as a cosmetic chase for players who want a flashy item, separate from the power loop. It no longer competes with the grade and affix systems for the same mental slot. The existing essence/gold quality-upgrade path is unchanged.

---

## 10. DROP RATES — SINGLE-PLAYER GENEROUS

The current rates were tuned for a gated game. This is a single-player action RPG. Something real should drop from almost every large kill, and ancient kills should never feel dry. The question after a fight is which grade and which affixes you got, not whether you got anything.

### 10.1 Creep drop tables (revised)

Slots are independent rolls. Star rating (×1 / ×1.85 / ×3.2) scales HP and damage but not these percentages. Grade rolls against the source floor after the slot fires, then affixes fill the grade's slots.

**Small creeps**
| Slot | Normal | Nightmare | Hell | Pool |
|------|--------|-----------|------|------|
| Consumable / gem chip | 30% | 36% | 42% | All consumables; lesser gems |

**Medium creeps**
| Slot | Normal | Nightmare | Hell | Pool |
|------|--------|-----------|------|------|
| Consumable | 40% | 46% | 52% | All consumables |
| Early component | 25% | 32% | 40% | Iron Branch, Circlet, Gauntlets, Slippers, Mantle, Belt, Band, Robe, Blades of Attack |

**Large creeps**
| Slot | Normal | Nightmare | Hell | Pool |
|------|--------|-----------|------|------|
| Consumable | 35% | 42% | 50% | All consumables |
| Component (any) | 55% | 64% | 74% | Early and mid components |
| Assembled / EG core | 15% | 25% | 35% | T1 assembled; rare T3 endgame core |

**Ancient creeps**
| Slot | Normal | Nightmare | Hell | Pool |
|------|--------|-----------|------|------|
| Mid-high component | 60% | 72% | 84% | Broadsword through Sacred Relic |
| Mythical component | 28% | 38% | 50% | Same deep pool, separate roll |
| Endgame core | 20% | 32% | 46% | T3/T4 assembled (split by EG rarity table) |

### 10.2 Neutral item camps

| Camp | Old rate | New rate |
|------|----------|----------|
| Small | 10% | 16% |
| Medium | 14% | 20% |
| Large | 20% | 28% |
| Ancient | 28% | 38% |

### 10.3 Elite creeps (NEW)

A rare variant of large and ancient camp creeps: gold particle border, 1.2× scale, star-2 stat multipliers. Dangerous enough to register as a fight, rare enough to feel like a find.

| Elite type | Spawn chance | Guaranteed drop | Second slot chance |
|-----------|-------------|----------------|-------------------|
| Elite (large) | 4% of large spawns | Sharp+ assembled | 40% / 55% / 70% |
| Elite (ancient) | 3% of ancient spawns | Refined+ assembled | 55% / 70% / 85% |

### 10.4 Hero drops on kill (NEW)

When an enemy hero dies in a dungeon or overworld encounter, one random item from their equipped loadout falls at grade −1 (minimum Broken), affixes and all. Cap one item per enemy hero per run. This gives a reason to read the enemy team before engaging: a Sharp Battlefury with a Cleaving affix is visible loot you can hunt.

### 10.5 Dungeon rooms, bosses, raids, gym

Unchanged in structure from v1: room chests scale grade with depth; boss first clears guarantee Sharp/Refined/Pristine by difficulty; raids drop multiple Refined+ pieces with an immortal chance; gym badges drop a themed Sharp item, bumped to Refined on speed-clear with a Pristine chance on a perfect run. Bad-luck pity after 8 dry raids stays.

---

## 11. SOURCES BEYOND COMBAT

### 11.1 Roaming merchant — the transparent fallback

A wandering NPC that appears once every two region visits. Offers six items from the current region's pool. The player picks the item and the grade upfront, no gambling, priced at a premium. This sets a gold ceiling on each grade so no one has to grind a specific slot forever.

| Grade | Price multiplier |
|-------|----------------|
| Worn | 1.0× base cost |
| Standard | 1.25× base cost |
| Sharp | 1.6× base cost |
| Refined | 2.2× base cost |

Affixes on merchant items are still random, and Pristine is never sold, so a bought item never fully replaces a found one.

### 11.2 The Gamble Vendor (NEW)

The merchant is the safe path; this is the slot machine. Extending the existing Black Market (the `gamble` drop source already exists in code), a vendor sells a **random item of a chosen slot and tier** for currency, at a random grade and affix roll. You choose "weapon, T3" and pay; you get a surprise. This is the purest dopamine loop in the genre (Diablo's Kadala, Borderlands' Moxxi machines): a fast, repeatable spend with a real chance at a godroll. Prices scale with tier so it stays a sink, and a soft pity guarantees a Sharp+ result every N gambles so a dry streak still moves you forward.

### 11.3 Exploration caches

Hidden caches scattered through region maps, grade tied to region depth. Each holds 1–2 components, gems, or assembled items. Rewards reading the map instead of following the critical path.

---

## 12. THE FORGE — CRAFTING THE ROLL

The Tinker's Bench gains a Forge panel. v1's Forge was three flavors of the same magnitude gamble. v2's Forge is a real crafting bench built around affixes, with one important rule throughout: **no operation ever makes an item worse.** You spend currency and choose to keep a result. Anxiety comes from cost, never from loss. (Diablo's enchanting works this way; v1's "reroll can drop you a whole grade" is gone.)

### 12.1 One currency: Essence

v1 added Embers alongside the existing Essence, two recycle currencies doing the same job. v2 unifies on **Essence**. Disenchanting an item yields Essence; every Forge operation spends Essence and gold. Gold is the abundant, fast currency (gambles lean on gold); Essence is the considered, scarce one (deterministic operations lean on Essence). That split preserves the high-roller / patient / mixed play styles without a second currency to track.

**Disenchant (item → Essence), by grade:**

| Grade | Broken | Worn | Standard | Sharp | Refined | Pristine |
|-------|--------|------|----------|-------|---------|----------|
| Essence | 1 | 3 | 6 | 13 | 24 | 40 |

A signature affix or a high rarity adds a bonus, so recycling something special still feels worth more than vendoring junk.

### 12.2 The operations

| Operation | What it does | Cost | Risk |
|-----------|--------------|------|------|
| **Grade Up** | Add an affix slot and raise the magnitude band one grade | gold + Essence, scaling by grade | none |
| **Reroll Affix** | Reroll one chosen affix's identity and value from the pool | gold | none; preview the result, pay again to try, or keep |
| **Reforge** | Reroll all affixes at once | gold + Essence | none; cheaper per-affix than rerolling each, but you give up the ones you liked |
| **Imprint** | Lock one chosen affix so it survives a Reforge | Essence | none; the imprinted affix is guaranteed to reappear |
| **Masterwork** | Push the magnitude percentile of base stats and affixes toward the top of the current grade band | gold + Essence | none; diminishing returns near the cap |
| **Socket / Unsocket** | Add a socket (up to the tier cap) or pull a gem | gold to add, Essence to pull | none |
| **Fuse Gems** | Three same-grade gems into one of the next grade | gold | none |

Two paths to Grade Up coexist, same as v1's instinct: a **fast gamble path** (gold + a little Essence, a success chance, retry on fail) for players who want results now, and a **deterministic path** (a larger flat Essence cost, guaranteed) for players who would rather save and never gamble. Both end at the same place. Sample numbers:

| Grade Up | Gamble: gold + Essence (success) | Deterministic: Essence |
|----------|----------------------------------|------------------------|
| → Worn | 120g + 1 (85%) | 4 |
| → Standard | 280g + 2 (72%) | 10 |
| → Sharp | 550g + 4 (58%) | 22 |
| → Refined | 1100g + 8 (40%) | 42 |
| → Pristine | 2200g + 16 (22%) | 70 |

### 12.3 The three play styles, preserved

**High-roller:** Grade Up on the gamble path, Reroll Affix repeatedly chasing a signature. Burns gold fast, sees results fast.

**Patient:** Disenchant every duplicate, stack Essence, take the deterministic Grade Up path, Imprint the one good affix and Reforge around it. Slower, guaranteed, rewards consistency.

**Mixed:** Gamble grade up to Sharp (cheap, high odds), Essence-grade to Refined, then save the 22% Pristine gamble for one anchor slot. Imprint a found signature and socket a fused gem to finish the piece. The common pattern for a deliberate player.

---

## 13. LOOT FEEL — THE PART THAT SELLS IT

A looter lives or dies on the moment of the drop. v1 spent one line on this ("a grade pill on the loot toast"). It deserves a real pass, because the dopamine is mostly ceremony. The good news: the presentation systems already exist (the reward-streak audio with its semitone climb, the `StingerId` stinger system, the additive-bloom VFX language). This is wiring them to loot.

### 13.1 The beam

Every meaningful drop plants a vertical light pillar in the world, colored by rarity and scaled by grade. A common component is a faint glint. A legendary is a tall colored shaft. A Pristine or signature drop is a thick beam with rising particles and a brief bloom flare. This is the Borderlands orange-beam reflex: you learn to read the floor from across the screen and your eye goes straight to the good one.

### 13.2 The sound

Drop audio escalates with rarity and grade, reusing the reward-streak semitone climb already in the audio layer. A junk drop ticks. A rare chimes higher. A Pristine or signature drop fires a dedicated stinger (a new `StingerId`) plus a short slow-motion micro-pause, the same beat a Diablo unique or a Borderlands legendary gets. The sound is the reward before the player even reads the tooltip.

### 13.3 The comparison

The single most important UX in a looter: is this better than what I have? Every loot toast and tooltip shows a live comparison against the active hero's equipped item in that slot:

- A green up-arrow or red down-arrow next to each changed stat.
- The affix diff (what this copy adds or loses versus the equipped one).
- A bold "UPGRADE" or "SIDEGRADE" banner when it clearly beats or trades with the current piece.

Without this, generous drops become a reading chore. With it, the player feels the upgrade instantly.

### 13.4 The loot filter (NEW, and required)

Raising drop rates this much creates inventory spam, which kills the feel faster than dry drops do. So generosity ships with filtering:

- **Pickup rules** by tier, rarity, and grade, so trash does not even toast.
- **Auto-disenchant** below a player-set threshold (junk turns straight into Essence on pickup, with a running counter).
- **Salvage All** at the Forge with a grade/rarity filter and a confirmation, plus a per-item "lock" so a keeper is never scrapped.

The filter is what lets the drop rates stay loud. Diablo and Path of Exile live on this; it is part of the rates, not a nice-to-have.

---

## 14. DIFFICULTY AND THE ENDGAME CHASE

Once a slot is Pristine, v1 had nothing left to chase but more Pristines. Affixes fix this: even at max grade, you re-run content to fish for better affix rolls and rarer signatures. Difficulty is the ladder that gates the affix pool, the way Diablo's world tiers and Borderlands' Mayhem levels work.

| Difficulty | Affix tiers unlocked | Max affixes seen | Signature pool |
|-----------|---------------------|------------------|----------------|
| Normal | T1–T2 | grade cap (up to 3) | none |
| Nightmare | T1–T3 | grade cap | minor signatures |
| Hell | T1–T4 | grade cap | full signatures |
| Hell + full badges / raids | T1–T5 | grade cap | the ancient tier (the loudest signatures and ranges) |

Region also flavors the pool: Icewrack rolls frost-leaning affixes, and so on, reusing the themed loot the regions already have. The endgame becomes "run Hell to chase a T5 Stormcaller's roll on my Pristine Daedalus," which is a goal that outlasts grade.

---

## 15. COMPLETE UPGRADE LOOP EXAMPLE

Player is level 18, running Nightmare in Icewrack (3 badges).

1. An ancient creep drops a **Sharp Daedalus** (level req 18, usable now). Two affix slots rolled: *Heavy* (+damage) and *of the Hawk* (+attack range). Decent, not what this hero wants.
2. At the Forge they **Reroll Affix** on *of the Hawk* for gold. It lands on *Blooddrinker's* (+8% lifesteal). Now it is a crit-lifesteal weapon. They keep it.
3. Over two sessions they disenchant duplicates for Essence and take the **deterministic Grade Up** to Refined. The new third affix slot rolls, and the Refined signature check hits 8%: *Glassbreaker* (attacks shred armor). The beam and stinger fire; this is the session's highlight.
4. They **Imprint** Glassbreaker so it is safe, then **Masterwork** to push the damage and lifesteal toward the top of the Refined band.
5. The item rolled one socket. They **Fuse** three Topaz chips into a Flawless Topaz and slot it for raw damage.
6. Later, chasing Pristine, they **Grade Up** on the gamble path (22%). It fails twice, hits on the third. At Pristine the magnitude rolls near max and the imprinted Glassbreaker survives.

Total investment: modest gold, Essence from recycled drops, and a few sessions. Every step was a choice, and the signature drop was a moment.

---

## 16. IMPLEMENTATION

### 16.1 New type surface

```typescript
// types.ts additions

export type ItemTier = 'consumable' | 'component' | 'basic' | 't1' | 't2' | 't3' | 't4' | 'special';
export type ItemGrade = 'broken' | 'worn' | 'standard' | 'sharp' | 'refined' | 'pristine';
export type AffixKind = 'prefix' | 'suffix' | 'signature';
export type AffixPoolId = 'weapon-like' | 'armor-like' | 'caster-like' | 'mobility' | 'any';

export interface AffixDef {
  id: string;
  name: string;
  kind: AffixKind;
  tier: 1 | 2 | 3 | 4 | 5;
  pools: AffixPoolId[];
  weight: number;
  statRanges?: Partial<Record<keyof StatMods, [number, number]>>;
  attack?: Partial<AttackModSpec>;
  trigger?: TriggerSpec;
  aura?: AuraSpec;
}

export interface RolledAffix {
  affixId: string;
  roll: number;             // 0..1 within ranges
  resolved: StatModMap;     // computed at drop, cached
}

export interface InstancedItem {
  itemId: string;
  grade: ItemGrade;
  gradeRoll: number;        // 0..1 base-stat percentile within the grade band
  affixes: RolledAffix[];   // empty for neutrals and Broken-grade items
  sockets: (string | null)[]; // gem ids, null = empty
  resolvedMods: StatModMap; // base passiveMods + grade + affixes + gems, cached
  quality?: ItemQuality;    // cosmetic, unchanged from today
  inscribedKills?: number;
}

export interface ItemSetDef {
  id: string;
  name: string;
  pieces: string[];
  bonuses: { atPieces: number; mods?: StatModMap; aura?: AuraSpec; trigger?: TriggerSpec }[];
}

// Per-hero augment track (Aghanim's), separate from the six item slots and the neutral slot.
export interface HeroAugments {
  scepter?: boolean;        // Aghanim's Scepter / Blessing applied (permanent)
  shard?: boolean;          // Aghanim's Shard applied (permanent)
}
```

`ItemDef` gains `set?: string` and an optional `socketCap?: number`. `StatMods` gains `manaRegenPctMax` (the mirror of the existing `hpRegenPctMax`) for percentage mana consumables. `HeroDef.aghanim` grows from a descriptive flag toward a real upgrade payload (the scepter/shard ability change), with a stat-and-flag fallback until each hero's upgrade is authored.

### 16.2 New files

- **`src/data/grade.ts`**: `GRADE_DEFS` (slots, percentile band, frame color, signature/socket chance), `itemLevel()`, `gradeFloor()`, `gradeBaseStatMods()`, `levelReq()`.
- **`src/data/affixes.ts`**: `AFFIX_DEFS`, `AFFIX_POOLS`, `rollAffixesFor(item, grade, difficulty, region, rng)`, `resolveAffix(affix, roll)`, `affixPoolForItem(def)`.
- **`src/data/gems.ts`**: gem defs, `fuseGems()`, gem stat application.
- **`src/data/sets.ts`**: `ITEM_SET_DEFS`, `activeSetBonuses(equipped)`.
- **`src/data/forge.ts`**: cost tables and the pure operations `attemptGradeUp`, `rerollAffix`, `reforge`, `imprintAffix`, `masterwork`, `socket`/`unsocket`, `disenchant` (returns Essence). All pure given an rng, none can lower an item.
- **`src/systems/loot-filter.ts`**: pickup rules, auto-disenchant threshold, salvage-all with locks.

### 16.3 Existing file changes

- **`src/data/items/index.ts`**: re-tier `core` to `t1`–`t4`/`special`; tag `set` and `socketCap` where relevant; convert consumable heal/mana actives from flat `hpRegen`/`manaRegen` buffs to `hpRegenPctMax`/`manaRegenPctMax` (Tango, Salve, Clarity, instant restores per §8.3).
- **`src/data/creep-drops.ts`**: new generous rates (§10.1); resolution now produces an `InstancedItem` (grade then affixes); add the `elite` tier. Neutral drops roll a grade only, no affixes (§8.1).
- **`src/data/tuning.ts`**: `gradeRollVariance: 0.20`, `eliteSpawnChance`, `merchantGradeMultiplier`, `merchantRefreshPerVisits`, `gambleVendor` (prices, pity), `affixTiersByDifficulty`, `lootFilterDefaults`, updated `neutralDropPctByTier: { small: 0.16, medium: 0.20, large: 0.28, ancient: 0.38 }`.
- **`src/core/sim`**: read `manaRegenPctMax` in the regen path alongside the existing `hpRegenPctMax`.
- **`src/systems/game.ts`**: `instantiateDrop(itemDef, context): InstancedItem` (grade floor from context, sample grade, roll base percentile, roll affixes, roll sockets, cache `resolvedMods`); set-bonus application on equip; per-hero augment apply (`applyScepter` / `applyShard`, permanent) reading and freeing the slot the Aghs items used to take; gamble-vendor action; loot-filter hook on pickup.
- **Save/equip path** (`ItemSave`, `ItemState`): carry `grade`, `gradeRoll`, `affixes`, `sockets`; add per-hero `augments`. A save migration defaults existing items to Standard grade, no affixes, no sockets, and converts any equipped Aghs items into the matching augment so old saves load as the baseline they already were.
- **`src/ui/hud.ts`**: rarity glow + grade frame/pips (separate visuals, §1); tooltip with affix lines, signature in orange, set counter, sockets; the comparison arrows; the loot beam, escalating sound, and stinger; the loot-filter settings panel; an augment row on the hero sheet (Scepter / Shard) distinct from the six item slots.

### 16.4 Phased rollout

**Phase A — Identity on drops.** Add the types. Implement grade, affixes, sockets, and the drop instancer with the new rates. Items start dropping with grades and affixes. Tooltip shows them; comparison arrows in. Forge shows "coming soon." Shops and crafted items stay Standard, affix-free. Convert consumables to percentage here (small, self-contained, helps from level one).

**Phase B — Forge and new sources.** Full Forge (Grade Up, Reroll, Reforge, Imprint, Masterwork, Sockets, Fuse, Disenchant) on unified Essence. Elite creeps, hero drops, gamble vendor, merchant, caches. Sets live. Loot filter live. Augment track live (Aghs out of the inventory slots).

**Phase C — Feel and balance.** The beam, escalating audio, and signature stinger. Difficulty-gated affix tiers and the T5 endgame pool. Per-hero scepter/shard ability upgrades wired in over time. Full economy tuning pass from Phase A/B data.

---

## 17. BALANCE GUARDRAILS

**The tier gap beats the grade-and-affix gap.** A loaded Pristine Crystalys never out-scales a plain Daedalus. The ±20% band plus two or three affixes is loud within a tier and quiet across tiers. Any item that breaks this gets its `gradeRollVariance` or affix budget lowered individually.

**Affixes stay readable.** Behavior affixes (procs, triggers, auras) carry fixed labeled effects, not rolled magnitudes, so a player always knows what an affix does. Only flat-stat affixes roll a value, and those values stay inside the ±20% band.

**Signatures stay rare and special.** They roll at 8%/20% on Refined/Pristine only, and the loudest ones gate behind Hell and the T5 pool. A signature is a trophy, the way a Destiny godroll or a Diablo unique is, not a baseline expectation.

**No operation lowers an item.** Every Forge action either improves the item or leaves it untouched; the cost is the risk. This keeps the bench a place of forward progress.

**Special items and augments stay exceptional.** Divine Rapier, Aegis, Refresher Shard, Cheese, and the Aghanim's augments take no grade, no affixes, no sockets. Their power is categorical, not numerical.

**Percentage consumables scale, they do not spiral.** Heals are a percentage of max over a fixed duration with break-on-damage unchanged, so a tank heals more in absolute terms but at the same pace and the same interrupt risk. Tune the percentages against the highest HP pools in the game, not the lowest.

**The filter is part of the rates.** Generous drops only feel good with the loot filter shipping alongside them. Tune them together, never the rates alone.

---

*File: `ITEM_REHAUL.md` — v2 draft. All numbers subject to a tuning pass after Phase A play data.*

---

## Stat Balance Pass — Regen, AoE, and Utility (Jun 2026)

### Context

Dota 2 numbers port verbatim as a starting point, but this game's recovery economy is meaningfully different. There's no fountain, no rune respawns, and no full 5-player laning phase to fund consumable loops. Out-of-combat regen is the primary "catch your breath" mechanism between camps. The old values made recovery trivially slow — a hero taking 40% of their HP in a camp fight needed 2–3 full minutes of idle time to recover. That's incompatible with an exploration loop.

Target feel: a hero should recover ~25–30% max HP per minute at baseline and ~50–60% HP/min after one early regen item. Mana should feel similarly — not infinite, but a short pause between rooms should be enough to cast a few abilities again.

Hero cap is confirmed at **level 30**.

---

### HP Regen — Hero Base Stats

| Hero archetype | Old `hpRegen` | New `hpRegen` |
|:---|:---|:---|
| STR primary (roster-standard, roster-complex) | 1.8 | **3.5** |
| AGI primary (roster-standard, roster-complex) | 1.2 | **2.5** |
| INT primary (roster-standard, roster-complex) | 1.2 | **2.0** |
| phase3 seeded heroes | 1.3 (flat) | **3.5 / 2.5 / 2.0 by attr** |
| phase2 seeded heroes | 1.2 (flat) | **3.5 / 2.5 / 2.0 by attr** |
| Axe (STR) | 2.8 | **3.5** |
| Pudge (STR) | 2.5 | **3.5** |
| Sven (STR) | 2.0 | **3.5** |
| Earthshaker (STR) | 2.2 | **3.5** |
| Juggernaut (AGI) | 1.8 | **2.5** |
| Luna (AGI) | 1.5 | **2.5** |
| Sniper (AGI) | 1.2 | **2.5** |
| Lich (INT) | 1.2 | **2.0** |
| Crystal Maiden (INT) | 1.0 | **2.0** |

Note: `hpRegenPerStr = 0.1` is unchanged. Attribute gains already provide per-level scaling; the base bump closes the yawning gap in the early game before stats accrue.

---

### Mana Regen — Hero Base Stats

| Hero archetype | Old `manaRegen` | New `manaRegen` |
|:---|:---|:---|
| INT primary (all rosters) | 1.4 | **2.5** |
| STR / AGI primary (all rosters) | 0.9 | **1.5** |
| Axe, Pudge (STR) | 0.8 | **1.5** |
| Sven (STR) | 0.7 | **1.5** |
| Earthshaker (STR) | 0.9 | **1.5** |
| Juggernaut (AGI) | 0.8 | **1.5** |
| Luna (AGI) | 1.1 | **1.5** |
| Sniper (AGI) | 0.9 | **1.5** |
| Lich (INT) | 1.3 | **2.5** |
| Crystal Maiden (INT) | 1.2 | **2.5** |

---

### HP Regen — Items

| Item | Old `hpRegen` | New `hpRegen` | Notes |
|:---|:---|:---|:---|
| `ring-of-regen` | 1.75 | **3.5** | Component; doubled to match new baseline gap |
| `ring-of-health` | 6.5 | **9.0** | Component |
| `helm-of-iron-will` | 5 | **6.5** | Component |
| `headdress` passive | 1.75 | **3.5** | Self-passive |
| `headdress` aura | 2.0 | **3.0** | Team aura |
| `tranquil-boots` | 12 | **14** | Boots slot; already strong, modest bump |
| `guardian-greaves` passive | 5 | **7.0** | |
| `guardian-greaves` aura | 3 | **4.5** | Team aura |
| `perseverance` | 6.5 | **9.0** | |
| `vanguard` | 6.5 | **9.0** | |
| `hood-of-defiance` | 6.75 | **9.0** | |
| `pipe-of-insight` passive | 8 | **11** | |
| `pipe-of-insight` aura | 2 | **3.0** | Team aura |
| `crimson-guard` | 6.5 | **9.0** | |
| `mekansm` passive | 3.5 | **5.0** | |
| `mekansm` aura | 2 | **3.5** | Team aura |
| `battlefury` | 7.5 | **9.0** | |
| `force-staff` | 2.5 | **4.0** | |
| `nullifier` | 5 | **7.0** | |
| `vladmirs-offering` | 1.75 | **3.5** | Passive; aura unchanged |
| `soul-ring` | 1.75 | **3.5** | |
| `linken's-sphere` | 6.5 | **8.0** | |
| `meteor-hammer` | 6.5 | **9.0** | |
| `bloodstone` | 6.5 | **8.0** | |
| `eternal-shroud` | 6.75 | **9.0** | |
| `helm-of-the-dominator` | 5 | **6.5** | |
| `helm-of-the-overlord` | 6 | **8.0** | |
| `wind-waker` | 2.5 | **4.0** | |

`heart-of-tarrasque` — `hpRegenPctMax: 1.6%` unchanged. % regen scales with HP pool automatically; no adjustment needed.

---

### Mana Regen — Items

| Item | Old `manaRegen` | New `manaRegen` | Notes |
|:---|:---|:---|:---|
| `sages-mask` | 1.0 | **2.0** | Component; doubled |
| `void-stone` | 2.25 | **3.5** | Component |
| `oblivion-staff` | 1.0 | **2.0** | Component / basic |
| `kaya` | 1.5 | **2.5** | |
| `kaya-and-sange` | 1.5 | **2.5** | Kept consistent with kaya |
| `yasha-and-kaya` | 1.5 | **2.5** | Kept consistent with kaya |
| `euls-scepter` | 2.5 | **3.5** | |
| `battlefury` | 3.0 | **4.0** | |
| `perseverance` | 2.25 | **3.5** | |
| `ring-of-basilius` passive | 1.0 | **2.0** | |
| `ring-of-basilius` aura | 1.0 | **1.5** | Team aura |
| `vladmirs-offering` | 1.0 | **2.0** | |
| `soul-ring` | 1.0 | **2.0** | |
| `echo-sabre` | 1.0 | **2.0** | |
| `orchid-malevolence` | 2.0 | **3.0** | |
| `bloodthorn` | 2.0 | **3.0** | |
| `lotus-orb` | 2.0 | **3.5** | |
| `aether-lens` | 2.25 | **3.5** | |
| `refresher-orb` | 6.0 | **6.0** | Unchanged — already strong at tier |
| `octarine-core` | 3.0 | **4.0** | |
| `wind-waker` | 4.0 | **5.0** | |
| `scythe-of-vyse` | 5.0 | **6.0** | |
| `eternal-shroud` active statmod | 8 | **10** | 8-second burst |
| `bloodstone` | 2.25 | **3.5** | |
| `linken's-sphere` | 2.25 | **3.5** | |

---

### AoE Damage — Radiance

**Change:** Radiance aura updated from `damageTakenReductionPct: -4` to `damageTakenReductionPct: -10`.

Rationale: The `-4%` debuff was barely perceptible in fights. At -10%, enemies in the 700-unit aura take 10% more damage from all sources — a meaningful incentive to not stand near the carrier and a real contribution in grouped fights. In Dota 2, Radiance deals 60 DPS to nearby enemies; this proxy approach achieves a similar "burn disincentive" without requiring a periodic-damage aura system.

**Future work:** Extend `AuraSpec` to support `dotDps` + `dotType` so the burn can be implemented as true periodic magical damage rather than an amplification debuff. Once that lands, replace `damageTakenReductionPct: -10` with `dotDps: 60, dotType: 'magical'` to match the Dota original.

---

### AoE Damage — Camp Clustering

Verify that `TUNING.ai.clusterRadius = 360` keeps 3–5 enemies within a 400-unit AoE radius in standard camps. If enemies spread too far (e.g. kite AI pushes spacing beyond AoE reach), AoE numbers alone can't fix AoE feel. This should be validated with a targeted sim test before tuning AoE ability values.

---

### Utility Stats — Notes

- **`statusResistPct`** — useful only if status effects (stuns, slows, silences) are common and their uptime matters. Ensure encounters across all regions apply status effects frequently enough that 15–25% resist from an item like `kaya-and-sange` reads as a tangible reduction in lockdown. If encounters are too clean, this stat feels dead.
- **`visionPct`** — valuable only once fog-of-war is applied during exploration. Currently unused in camp encounters that spawn at known positions. Revisit after fog/vision system is enabled.
- **`castRange`** — most meaningful when enemies or mechanics create "just out of range" scenarios. Audit late-game boss encounters and dungeon mechanics to ensure there are consistent situations where an extra 225 units of cast range on `aether-lens` pays off.

---

## Tag-In / Genshin-Style Stat Pass (Jun 2026)

### Motivation

The game has hero swapping (resonance mode enables 1.2s CD; normal mode uses a 4s CD), a full elemental reaction system, and overworld traversal with a stamina pool. None of those systems had item hooks — swapping was entirely mechanical, reactions scaled only off `spellAmpPct`, and stamina was a flat global constant. This pass adds six new `StatMods` fields to close those gaps.

---

### New Stats

| Stat | Type | Description |
|---|---|---|
| `swapCdReductionPct` | passive | Reduces hero swap cooldown. Capped at 80%. Applied from the incoming hero's stats at swap time. |
| `swapInDamagePct` | passive | Grants a 3-second buff on tag-in: both `damagePct` and `spellAmpPct` are increased by this value. Creates a burst window for aggressive swapping. |
| `swapInHealPct` | passive | Instant heal on tag-in equal to `N%` of max HP. Rewards cycling heroes to recover without shrines. |
| `reactionAmpPct` | passive | Amplifies elemental reaction bonuses. Scales both `extraDamagePct` reactions (overload, superconduct, burning, etc.) and `damageMultiplier` reactions (vaporize, melt). Formula: `amp = 1 + reactionAmpPct / 100`. |
| `elementalGaugeSec` | passive | Extends element aura duration on enemies hit by this unit. Baseline is 4s; a value of 1.0 extends to 5s, improving setup windows for reaction combos. |
| `staminaBonus` | passive | Flat bonus to the overworld stamina pool. Stacks on the active hero's stats only — swapping to a hero without it returns the cap to baseline (existing stamina is not clipped). |

---

### System Wiring

**`swapCdReductionPct`** and tag-in effects fire inside `trySwap()` immediately after `spawnHeroFromRecord`:

```typescript
const baseSwapCd = resonance ? TUNING.resonanceSwapCooldownSec : TUNING.swapCooldownSec;
const cdMult = 1 - Math.min(0.8, (u.stats.swapCdReductionPct ?? 0) / 100);
this.swapReadyAt = this.sim.time + baseSwapCd * cdMult;

// instant heal
if (healPct > 0) u.hp = Math.min(maxHp, u.hp + maxHp * healPct / 100);

// 3s burst buff
if (burstPct > 0) u.addStatus({ status: 'buff', tag: 'swap-in-burst', until: now + 3,
  mods: { damagePct: burstPct, spellAmpPct: burstPct } }, true);
```

**`reactionAmpPct`** and **`elementalGaugeSec`** fire in `applyElementAura()` in `combat.ts`. Reaction amp multiplies both the flat extra-damage hit and the multiplier component. Gauge extension applies to the `until` timestamp on each applied aura.

**`staminaBonus`** is applied in `updateLocomotion()`: `staminaCap = TUNING.traversal.staminaMax + (activeUnit?.stats.staminaBonus ?? 0)`.

---

### New Items

#### Components

| Item | Cost | Key Stats | Notes |
|---|---|---|---|
| `quickstep-cord` | 350 | `swapCdReductionPct: 12` | Budget swap enabler. Useful on any swapping build. |
| `wanderer-wraps` | 300 | `staminaBonus: 60` | 25% more stamina. Good for exploration-heavy heroes. |
| `prismatic-shard` | 400 | `reactionAmpPct: 10` | Early elemental investment. Builds into `resonance-catalyst`. |

#### Assembled

| Item | Cost | Components | Key Stats | Role |
|---|---|---|---|---|
| `breacher-cloak` | 1800 | `quickstep-cord` + `blades-of-attack` + `chainmail` + 400 recipe | `swapCdReductionPct: 28`, `swapInDamagePct: 18`, `agi: 10`, `moveSpeed: 15` | AGI tag-in carry item. Swap in, burst, swap out. |
| `exchange-mark` | 1475 | `quickstep-cord` + `belt-of-strength` + `ring-of-regen` + 500 recipe | `swapCdReductionPct: 18`, `swapInHealPct: 8`, `str: 8`, `hpRegen: 3.5` | STR survivability item. Recover 8% HP each tag-in. |
| `resonance-catalyst` | 2100 | `prismatic-shard` + `staff-of-wizardry` + `sages-mask` + 525 recipe | `reactionAmpPct: 25`, `elementalGaugeSec: 1.0`, `spellAmpPct: 10`, `int: 10`, `manaRegen: 2.5` | INT elemental amplifier. Pairs with any elemental hero. |

---

### Design Notes

**Tag-in burst window (3 seconds):** Long enough to get off one cast and one attack animation, short enough that you have to commit to the swap before the camp fight ends to get value. The combined `damagePct + spellAmpPct` boost means it scales with whatever the hero was already building — agility carries get attack damage, casters get spell damage. No separate "tag-in physical" vs "tag-in magical" variants needed.

**`swapInHealPct` vs regen:** Flat heal on tag-in is distinct from `hpRegen` — it's a burst of recovery when you choose to swap, not passive trickle. On `exchange-mark` at 8%, a 1500 HP strength hero recovers 120 HP per swap. With a 4s base CD that's roughly equivalent to 1800 HP/min recovery, but only while actively swapping. Passive `hpRegen: 3.5` on the same item covers the idle case.

**`reactionAmpPct` scaling:** At 25% (full `resonance-catalyst`), vaporize goes from 1.5× to 1.625×. Overload's extra hit goes from 45% to 56.25% of base damage. These are meaningful improvements but don't break the reaction economy — reactions are still constrained by element gauge uptime, not amp values.

**`elementalGaugeSec` and setup:** Extending gauges from 4s to 5s gives a generous extra second to follow up a reaction. This matters in longer fights where the second attacker can lag behind the first. Doesn't affect the reaction trigger timing itself, only the window before the aura decays without a trigger.

**`staminaBonus` and hero swapping:** Stamina cap uses the active hero's staminaBonus only. There's no "party stamina pool" — the active hero is carrying the endurance. `wanderer-wraps` (+60 stamina) extends a sprint or two before exhaustion. Useful for scouting heroes who spend time moving between camps.

**Future work:** 
- A legendary-tier assembled item combining `breacher-cloak` and `exchange-mark` components (swap CD reduction + burst + survival in one slot).
- `swapInShieldPct` — brief absorption shield on tag-in, as opposed to instant heal. Useful for initiators who tag in against burst.
- A second wave of elemental items at the `core`/`t2–t3` tier once `resonance-catalyst` proves out in playtesting.
