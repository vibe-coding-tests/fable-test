# Skill Trees (Masteries)

Goal: replace the flat "+2 all attributes" level-up pick with a Diablo-style
mastery tree, so leveling a hero is a build decision instead of a stat dump.
Each hero gets four trees — one per ability — and the points you earn while
leveling buy nodes that either add stats or rewrite how an existing spell
behaves. Two heroes who hit level 30 with the same gear can still play very
differently depending on where their points went.

This is a content + light-engine plan, not an engine rewrite. The ability /
status / talent machinery in `/src/core/` already does almost everything a tree
node needs (`StatModMap`, ability value overrides, cooldown adds, passive mods).
A mastery node is mostly a `TalentDef`-shaped patch with an unlock gate; the new
work is the gating, the point currency, the per-hero node data, and the UI.

Status: **draft**. Numbers in this doc are starting points and are tunable in
`tuning.ts` per the project's "identity first, balance later" rule.

---

## 1. Why change the current system

Today every hero shares one skill-point pool spent on three things
(`src/systems/game.ts`):

- **Ability ranks** — 15 points max all four abilities (3 basics × 4 + ult × 3).
- **Talent tiers** — 4 binary picks at hero level 10/15/20/25.
- **+2 all attributes** — the "attribute pick" buy-option, up to 11 times
  (`maxAttributePoints = levelCap − abilityRanks − 4`).

The ability ranks and talents already carry identity. The attribute pick does
not: it is the same "+2 STR/AGI/INT" on every hero, every time. That is the slot
this overhaul targets. Masteries fold the talent decisions and the attribute
spend into one per-hero tree, and turn the boring stat buy into a real choice
between stat growth and spell-shaping.

The numbers the design is built around (level 30, four abilities, four tiers per
tree, ~14 points to spend) line up almost exactly with the budget the engine
already hands out, so the migration is close to a 1:1 swap.

---

## 2. The model in one screen

- **Level cap stays 30** (`TUNING.levelCap`).
- **Ability ranks are unchanged.** You still spend the normal skill point to
  rank Q/W/E/R; 15 points max the kit out by level 30.
- **Each ability owns a tree** = a branch of **4 nodes** (tiers T1→T4). Four
  abilities → **16 nodes** total per hero.
- **A node unlocks when its ability is leveled.** Tier *T* in an ability's
  branch is locked until that ability reaches **rank ≥ T**. Putting your first
  point in Blade Fury opens its T1 node; ranking it to 2 opens T2; and so on.
  This is the "skill trees unlock when a skill is leveled up" idea, made literal.
- **Nodes buy in order** inside a branch: T1 before T2 before T3 before T4.
- **You spend Mastery Points (MP), a separate currency.** Leveling grants
  **14 MP total**, one at each even hero level from 2 to 28.
- **16 nodes, 14 points.** You can never fill every tree. The build is *which
  two nodes you skip* and *which trees you go deep in*. That gap is the whole
  point — it is where customization lives.

### 2.1 The point math

| Track | Points | Source | Notes |
|-------|--------|--------|-------|
| Ability ranks | 15 | 1 skill point per level, gated by hero level | Unchanged. 3 basics ×4 + ult ×3. |
| **Mastery Points** | **14** | +1 at hero levels 2,4,6,…,28 | New. Replaces the 4 talent picks + 11 attribute picks. |
| **Tree capacity** | **16 nodes** | 4 abilities × 4 tiers | You can afford 14 of 16. |

Old flex budget was `4 talents + 11 attribute = 15` generic points. New flex
budget is `14` mastery points, each buying a node that is individually stronger
and hero-specific. Dropping one point (15→14) is deliberate: it keeps the "leave
two nodes behind" tension clean (16 − 14 = 2) instead of "leave one behind".

### 2.2 Node tiers, by role in the branch

Every branch follows the same shape so the trees read consistently and stay
authorable across 122 heroes:

| Tier | Unlock | Kind | What it does |
|------|--------|------|--------------|
| **T1** | ability rank ≥ 1 | **Growth** | A modest, archetype-driven stat/scaling bump (see §4). The "+2 attributes" replacement. |
| **T2** | ability rank ≥ 2 | **Keystone** | The first recognizable spell mutator: new trigger, target rule, status rider, conversion, or cross-skill link. |
| **T3** | ability rank ≥ 3 | **Growth** | A second, larger growth node — often scales with the keystone. |
| **T4** | ability rank ≥ 4 (ult: hero level ≥ 25) | **Capstone** | The build-defining transform. It should change how the spell is used, not how large its numbers are. |

Growth nodes (T1/T3) are generated from the ability's **archetype** plus the
hero's **primary attribute** (§4), so they don't need bespoke authoring per
hero — only the keystone (T2) and capstone (T4) are hand-written. That is what
makes "design all 122 heroes" tractable: ~2 authored nodes per ability, the rest
templated.

**Authoring bar:** if a T2/T4 node can be written as "+damage", "+radius",
"-cooldown", "+attribute", "longer", "larger", or "faster", it belongs in T1/T3
or item tuning. T2/T4 nodes must add a rule. Good nodes change at least one of:

- **Trigger:** when the spell fires, repeats, refunds, primes, or reacts.
- **Targeting:** who it can affect, how it chooses targets, or whether it chains.
- **Shape:** projectile to zone, zone to aura, self-buff to ally buff, single-hit
  to persistent object.
- **Conversion:** damage becomes healing, self-harm becomes fuel, overheal becomes
  shield, mana burn becomes silence.
- **Coupling:** one ability primes, copies, stores, or consumes another ability.
- **Object play:** summons, wards, mines, illusions, terrain, or echoes enter the
  build as real pieces.
- **Risk rule:** the node adds a constraint, tradeoff, or timing window that makes
  the stronger effect a playstyle.

### 2.3 The ult branch is special

Ultimates have only 3 ranks, so their branch can't gate all four tiers on rank.
The ult branch uses:

- T1 → ult rank ≥ 1 (hero level 6)
- T2 → ult rank ≥ 2 (hero level 12)
- T3 → ult rank ≥ 3 (hero level 18)
- **T4 (capstone) → hero level ≥ 25**, ult maxed.

This keeps every branch a uniform 4 nodes and puts the ult capstone at the same
power spike the old level-25 talent occupied.

---

## 3. Worked example: Juggernaut

Juggernaut's four abilities are Blade Fury (zone), Healing Ward (summon), Blade
Dance (passive), Omnislash (ult). His four trees:

**Blade Fury (Q) — "Whirlwind" tree**

| Tier | Node | Effect |
|------|------|--------|
| T1 | Honed Edge | Blade Fury's ticks gain a small AGI-scaling growth bump. |
| T2 | *Keystone* — Unyielding | Blade Fury cleanses one debuff when it starts, then blocks new movement-impairing effects while spinning. |
| T3 | Cutting Wind | Blade Fury's growth node improves the spin's area and tick scaling. |
| T4 | *Capstone* — Bladestorm | Blade Fury is no longer a locked self-spin: Juggernaut may attack and cast during it, but the spin becomes a shorter commitment window. |

**Healing Ward (W) — "Ancestor" tree**

| Tier | Node | Effect |
|------|------|--------|
| T1 | Vital Roots | Healing Ward gains summon-growth durability from Juggernaut's level. |
| T2 | *Keystone* — Cleansing Spring | The ward removes a debuff from allies it meaningfully heals, making its placement a cleanse decision. |
| T3 | Deep Reserves | The ward's healing growth scales with missing health instead of flat output. |
| T4 | *Capstone* — Twin Wards | Summons a second ward mirrored across Juggernaut, letting a build cover two lanes of a fight. |

**Blade Dance (E) — "Duelist" tree**

| Tier | Node | Effect |
|------|------|--------|
| T1 | Sharp Eye | Blade Dance gains normal attack-mod growth. |
| T2 | *Keystone* — Bloodletting | Blade Dance crits mark enemies as wounded; Healing Ward prioritizes wounded allies, and Omnislash prefers wounded enemies. |
| T3 | Killing Edge | Blade Dance growth improves crit payoff without changing the proc rule. |
| T4 | *Capstone* — Perfect Form | The first attack after any ability is a guaranteed Blade Dance event, turning spell cadence into melee cadence. |

**Omnislash (R) — "Bladeform" tree**

| Tier | Node | Effect |
|------|------|--------|
| T1 | Relentless | Omnislash gets ult-growth scaling on jump budget. |
| T2 | Lingering Cuts | Omnislash leaves marked cuts that Blade Dance and Blade Fury can consume for bonus effects. |
| T3 | Swift Return | Omnislash's growth node improves recovery time and target selection. |
| T4 | *Capstone* — Omnipresence | During Omnislash, Blade Fury is free-cast and follows you between jumps. |

With 14 MP, a Juggernaut player might fully commit Whirlwind + Duelist (8 points,
two capstones), then spend the remaining 6 on the first three Bladeform nodes and
the first three Ancestor nodes — a spin-to-win crit build that skips both
capstones in the support trees. Another player maxes Ancestor + Bladeform for a
push/teamfight Jug. Same hero, same gear, different unit.

---

## 4. Node template library (the templated 80%)

Growth nodes (T1/T3) and the *fallback* keystone/capstone are generated from the
ability's archetype, which is already inferable from the `AbilityDef` (we tag it
from `ult` / `targeting` / `passiveMods` / `aura` / `attackMod` / `effects`).
This is the same trick the standard-roster factory uses for talents
(`src/data/heroes/roster-standard.ts`), extended to four tiers.

Archetype tags used in the appendix: **NUKE** (damage spell), **ZONE** (ground
area/DoT), **ATKMOD** (attack modifier / orb), **PASS** (passive or aura),
**SUMMON**, **CHANNEL**, **UTIL** (mobility / buff / disable, no direct damage),
**ULT**.

### 4.1 Growth node templates (T1 / T3)

Growth nodes are where the old numeric power goes. They are deliberately modest
and boring. They can touch damage, radius, cooldown, summon durability, attack
speed, attributes, item values, or swap timing. The rule is that a growth node
should never be the memorable part of the build.

| Archetype | T1 growth | T3 growth |
|-----------|-----------|-----------|
| NUKE | damage scaling or mana efficiency | cast comfort, repeat reliability, or damage scaling |
| ZONE | area, duration, tick reliability | persistence, arming speed, or area scaling |
| ATKMOD | proc budget or attack cadence | proc payoff or charge budget |
| PASS | primary-stat flavor or passive baseline | passive scaling or threshold comfort |
| SUMMON | summon durability / damage baseline | summon count budget, leash, or lifetime scaling |
| CHANNEL | channel output or mana comfort | channel recovery or interruption protection |
| UTIL | cooldown / range comfort | uptime, target comfort, or effect reliability |
| ULT (T1/T3) | ult budget | ult recovery or reliability |

A growth node's primary-stat flavor follows the hero's attribute: STR heroes get
the HP/regen-leaning variant, AGI the attack-speed/armor variant, INT the
mana/spell-amp variant, UNI splits. This is why the appendix only spells out the
**keystones and capstones** — the growth nodes are determined by the row's
archetype tag plus the hero's attribute.

### 4.2 Keystone / capstone fallback grammar (T2 / T4)

For heroes where a bespoke transform is not authored yet, the builder can use a
mechanic grammar. These fallbacks should still read like spell rules, not balance
patches:

| Archetype | T2 keystone fallback | T4 capstone fallback |
|-----------|----------------------|----------------------|
| NUKE | adds a conditional rider: mark, reveal, wound, silence-on-repeat, or target-state bonus | changes targeting: bounce, fork, echo, return path, stored second cast, or execute refund |
| ZONE | adds a terrain rule: arm, trap, pull, blind, reveal, or persist after the caster leaves | changes ownership: follows a unit, splits into satellites, becomes a wall/ring, or consumes another spell mark |
| ATKMOD | adds a combat tag: mark, bleed, expose, mana debt, wound, or charge | changes proc law: guaranteed after a spell, copied by cleave/splash, consumed for a spell reset, or shared with summons |
| PASS | turns the passive into a rule that other abilities can read | creates a threshold event: low-HP trigger, on-kill trigger, on-disable trigger, or shared aura transform |
| SUMMON | summons inherit one named hero mechanic | summons become build pieces: mirror casts, death triggers, formation rules, body-blocking, or command focus |
| CHANNEL | adds a stance rule: slow movement, stored release, split beam, tether, or interruption payoff | changes commitment: recast endpoint, lingering field, ally tether, or cannot-be-interrupted-once trigger |
| UTIL | adds a second legal use: self/ally/enemy swap, cleanse, shield, bait, mark, or setup | creates a reset/conversion rule: refund on kill, convert damage to healing, duplicate to ally, or trigger another branch |
| ULT | primes a basic spell or creates a build-specific state | the signature transform, always hand-authored |

Ult capstones are always hand-authored. They are the headline of each hero's
build. The appendix gives every hero's four keystones and four capstones; growth
nodes use §4.1 and carry the numeric budget.

### 4.3 What moves out of the tree

Some knobs are still useful, but they should live in tuning, items, gyms, or
swap tech instead of pretending to be mastery identity:

- **Stats / attributes:** T1/T3 growth only.
- **Ability numbers:** T1/T3 growth or balance tuning.
- **Item numbers:** item affixes, set bonuses, or forge upgrades.
- **Swap numbers:** gym/trainer progression, swap equipment, or macro upgrades.
- **Talent-style scalar picks:** retire them or convert them into mechanic hooks.

Example: "Assassinate has more cast range" is a growth node. "Assassinate fires
from the last Shrapnel zone if Sniper has line of sight" is a keystone. "A kill
with Assassinate arms every active Shrapnel zone to fire once" is a capstone.

---

## 5. Data model

### 5.1 Types (`src/core/types.ts`)

A mastery node reuses the existing patch primitives, so it can do anything a
talent, facet, or Aghanim payload can do:

```ts
export interface MasteryNode {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  kind: 'growth' | 'keystone' | 'capstone';
  description: string;
  // Reuses the talent/facet patch vocabulary:
  mods?: StatModMap;
  abilityOverride?: { abilityId: string; valueKey: string; mode: 'add' | 'mul' | 'set'; amount: number };
  cooldownAdd?: { abilityId: string; amount: number };
  abilityPatch?: HeroAbilityPatch;   // for capstones that change behavior, not just numbers
  grantsExotic?: string;             // rare; e.g. "free-cast follows you" capstones
}

export interface MasteryBranch {
  abilityId: string;                 // which of the 4 abilities this tree belongs to
  nodes: [MasteryNode, MasteryNode, MasteryNode, MasteryNode]; // T1..T4
}

// On HeroDef:
//   masteryTrees?: [MasteryBranch, MasteryBranch, MasteryBranch, MasteryBranch];
// Optional: if absent, derive all 16 nodes from the §4 templates at registration time.
```

`masteryTrees` is **optional on `HeroDef`**. If a hero omits it, a builder
(`deriveMasteryTrees(hero)`) synthesizes all 16 nodes from the §4 templates using
each ability's archetype + the hero's attribute. Hand-authored heroes ship their
own `masteryTrees`; everyone else gets a valid tree for free, exactly like the
talent factory works today. The appendix's keystone/capstone text is the data
that fills the authored `masteryTrees` over time.

### 5.2 Save / progress (`HeroSave`)

Replace the two flat fields with one allocation array:

```ts
// remove: attributePoints?: number;
// remove: talentPicks: (0 | 1 | null)[];
// add:
masteryRanks?: number[];   // length 16, value 0/1 per node (T-order within each branch)
```

`masteryRanks` indexes nodes as `branch*4 + (tier-1)`. A value of 1 means bought.
The sum must be ≤ MP earned and ≤ 14, and each set bit must satisfy its unlock
gate (ability rank, tier order). Validation lives next to the current
`pendingSkillPoints` / `maxAttributePoints` logic in `src/systems/game.ts`.

### 5.3 Migration

Old saves carry `attributePoints` and `talentPicks`. On load:

- Convert each picked talent into the matching tree's keystone/capstone where one
  exists (talent tier 10/15 → that ability's T2; 20/25 → its T4). Buy the required
  earlier nodes in that branch when they are legal and the legacy MP budget can
  cover them.
- Convert remaining legacy attribute/talent credit into the cheapest legal nodes
  the hero has unlocked, up to the MP they would have earned.
- If conversion is ambiguous, refund: clear `masteryRanks` and hand back full MP
  so the player re-specs. Re-spec is free anyway (§6), so a clean refund is the
  safe default and probably what we ship.

---

## 6. Point flow, gating, and respec

**Earning MP.** `Unit.addXp` already recomputes level and marks stats dirty
(`src/core/unit.ts`). Add a `masteryPointsForLevel(level)` helper (returns
`floor` of even-levels-reached up to 28, capped 14). The HUD shows pending MP the
same way it shows pending skill points today.

**Spending MP.** New `Game.buyMasteryNode(recIdx, nodeIdx)`:

1. node must be unlocked: its ability is at rank ≥ its tier (ult T4 needs hero
   level ≥ 25), and the previous tier in that branch is already bought;
2. player has pending MP;
3. set the bit, mark stats dirty, rebuild the hero (§7).

Mirrors `applyTalent` / `applyAttributePoint`.

**Pending-point formula** changes to two independent pools:

```
pendingAbilityPoints = level − sum(abilityLevels)          // gated as today
pendingMasteryPoints = masteryPointsForLevel(level) − sum(masteryRanks)
```

The old `pendingSkillPoints` that mixed abilities + talents + attributes goes
away; abilities and masteries are now separate, which is also clearer in the HUD.

**Respec.** Action-RPG friendly: re-spec all masteries for free at a town
shrine / between expeditions (not mid-fight). Optionally a small gold cost scaling
with level if we want it to matter. Ability ranks stay un-respec'd (they're
gated by level and everyone maxes them anyway).

---

## 7. Build pipeline integration (`src/core/hero-setup.ts`)

`buildHero(base, picks, facetIdx, echo, augments)` already deep-clones the def and
applies talents/facets/aghs into `externalMods` + patched ability `values`. Add a
`masteryRanks` argument and, after the talent pass, fold each bought node in:

- `mods` → merge into `externalMods` (same path as talent `mods`).
- `abilityOverride` / `cooldownAdd` → reuse `applyOverride` (the talent path).
- `abilityPatch` → reuse the Aghanim `abilityPatches` path (`HeroAbilityPatch`).
- `grantsExotic` → add a registered mastery exotic to castable abilities. For
  passive, aura, and attack-modifier branches, attach the same hook through the
  ability trigger path so the node still has runtime behavior.

Masteries use the same build rails as talents/facets/aghs. The new code is the
gate check, the MP currency, and the shared runtime hook for mechanic verbs.

**Order of application:** base → level scaling → masteries → facet → aghanim →
items → statuses. Masteries are "innate to the build" so they apply early, before
gear, like talents do.

---

## 8. UI (`src/ui/hud.ts`, compendium)

- **In-run:** the existing skill-point panel grows a "Masteries" sub-panel: four
  vertical branches (one per ability icon), four pips each, locked pips greyed
  until the ability hits the matching rank. Pending MP count at the top. Click a
  legal pip to buy. Hover shows the node text.
- **Compendium:** `heroCompendium()` already renders a "full talent tree" view
  (`LOOT_OVERHAUL.md`). Swap that for the 4×4 mastery grid so players can plan a
  build before recruiting, including the locked capstones.
- **Read direction:** top = T1 (cheap, early), bottom = T4 (capstone). Keystones
  (T2) and capstones (T4) get a brighter frame so the two "decision" rows pop.

---

## 9. Tests / gates (extend `src/test/data-lint.test.ts`)

Per hero (authored or derived):

- exactly **4 branches**, each mapped to one of the hero's real ability ids;
- each branch has exactly **4 nodes**, tiers 1–4 in order, kinds
  growth/keystone/growth/capstone;
- every `abilityOverride` / `abilityPatch` points at a real ability + value key
  (same check talents already pass);
- **reachability:** with 14 MP and rank gating, every node must be *buyable* in
  some legal order by level 30 (no node gated behind something unreachable);
- **budget:** 16 nodes, MP schedule sums to 14, so the "skip 2" invariant holds;
- **mechanic bar:** authored T2/T4 nodes must include at least one non-scalar
  behavior marker (`mark`, `consume`, `chain`, `echo`, `split`, `follow`,
  `convert`, `summon`, `refund`, `recast`, `retarget`, `copy`, `store`,
  `prime`, `mirror`, `persist`, etc.); scalar-only text is rejected or demoted
  to a T1/T3 growth node;
- any `grantsExotic` id is registered (exotic budget ≤ 25 still applies).

Kit-smoke: every capstone `abilityPatch` must run headless at the node's unlock
level without throwing (same bar as abilities/items today).

---

## 10. Delivery plan

1. **Engine + types.** `MasteryNode`/`MasteryBranch`, `HeroDef.masteryTrees?`,
   `deriveMasteryTrees` template builder, MP currency, gate checks, `buildHero`
   fold-in, save migration. Ship with **all 122 heroes on derived trees** so the
   system is live before any bespoke authoring. Gate: data-lint + kit-smoke green.
2. **UI.** In-run mastery panel + compendium grid + respec shrine.
3. **Bespoke authoring, in cohort batches**, replacing derived trees with the
   appendix's hand-authored keystones/capstones:
   - **[done]** the 9 feel heroes (§A.1) — authored via `authoredMasteryTrees`
     in each hero file (`src/data/heroes/*.ts`), keystone/capstone names,
     descriptions, and mechanic verbs from the appendix; growth nodes inherit the
     `TUNING.mastery` budget. Covered by the existing data-lint + kit-smoke gates.
   - Phase 2 (§A.2), then the iconic Phase 3 ults (§A.3);
   - standard roster (§A.4) and complex heroes (§A.5) last, since their derived
     trees are already serviceable.
4. **Balance pass** in `tuning.ts`: MP schedule, growth percentages, capstone
   power. Deferrable per project norms.
5. **Runtime mechanic verbs.** The shared `mastery-mechanic` exotic implements
   the first pass of `mark`, `consume`, `chain`, `echo`, `follow`, `refund`,
   `recast`, `copy`, `store`, `prime`, `mirror`, and related verbs. Castable
   abilities receive it directly; passive and attack-modifier branches receive it
   through triggers.

The system is fully playable after step 1 (every hero has a real 16-node tree
from templates); steps 3–5 are the polish that makes each hero's tree feel
authored instead of generated.

---

## Appendix A — Per-hero trees (all 122)

Format per hero: one line per ability branch.

```
**Ability [ARCHETYPE]** — K: <T2 keystone> · C: <T4 capstone>
```

T1/T3 growth nodes follow the §4.1 template for that archetype + the hero's
attribute, so only the two decision nodes are listed. Ult branches always list a
hand-authored capstone. `(attr · roles)` heads each hero.

This appendix is a **mechanic hook pass**, not a balance sheet. Some entries use
short phrases like "stronger", "larger", or "longer" as tuning shorthand, but a
final node fails authoring review unless it contains a rule from §2.2/§4.2:
chain, echo, mark, consume, split, persist, follow, convert, summon, refund,
recast, retarget, or cross-trigger. Numeric-only entries get rewritten into T1/T3
growth or moved to tuning.

### A.1 The nine feel heroes

**Juggernaut** (agi · carry/pusher/escape) — full tree in §3.

**Crystal Maiden** (int · support/disabler/nuker)
- **Crystal Nova [NUKE]** — K: Nova marks chilled enemies for Frostbite priority · C: Nova leaves a frozen field that can feed Freezing Field explosions.
- **Frostbite [UTIL]** — K: Frostbite stores damage taken while rooted, then bursts when the root ends · C: Frostbite chains to a chilled target.
- **Arcane Aura [PASS]** — K: aura turns excess mana regen into spell recovery after casts · C: aura primes the next ice spell whenever CM spends enough mana.
- **Freezing Field [ULT]** — K: explosions seek chilled or rooted enemies first · C: CM can drift while channeling, leaving a trail of smaller frost bursts.

**Pudge** (str · disabler/durable/initiator)
- **Meat Hook [NUKE]** — K: hooked enemies arrive marked as fresh meat for Rot and Dismember · C: Hook pins the victim beside Pudge instead of only repositioning them.
- **Rot [UTIL]** — K: Rot consumes fresh-meat marks to briefly heal Pudge · C: Rot can be pulsed into a burst that trades self-harm for crowd control.
- **Flesh Heap [PASS]** — K: Flesh Heap stacks change Rot's self-harm into a build resource · C: takedowns leave a corpse marker Pudge can Hook for healing or repositioning.
- **Dismember [ULT]** — K: Dismember heals Pudge for the damage dealt · C: Dismember pulls a second nearby enemy into the chew (split damage).

**Earthshaker** (str · initiator/disabler/nuker)
- **Fissure [ZONE]** — K: Fissure's wall primes enemies for Aftershock · C: Fissure can be cast as a self-centered ring for commit builds.
- **Enchant Totem [UTIL]** — K: the empowered hit sends a shock line through Fissure walls · C: Enchant Totem becomes a short leap that lands with Aftershock.
- **Aftershock [PASS]** — K: Aftershock remembers the last spell that triggered it · C: Aftershock echoes again when an enemy is pinned by Fissure.
- **Echo Slam [ULT]** — K: Echo Slam consumes Aftershock marks for extra echoes · C: Echo Slam leaves a delayed after-echo at the cast point.

**Sniper** (agi · carry/nuker)
- **Shrapnel [ZONE]** — K: Shrapnel reveals and tags enemies as spotted · C: overlapping Shrapnel zones become firing nests that can host Assassinate.
- **Headshot [PASS]** — K: Headshot tags targets for Take Aim priority · C: Headshot becomes guaranteed against spotted enemies, with reduced payoff.
- **Take Aim [PASS]** — K: Take Aim turns standing still into a charged shot rule · C: charged shots ignore defensive layers on spotted enemies.
- **Assassinate [ULT]** — K: Assassinate can fire from the nearest active Shrapnel nest · C: a kill with Assassinate arms every Shrapnel nest to fire once.

**Lich** (int · support/nuker/disabler)
- **Frost Blast [NUKE]** — K: Frost Blast creates a frost shard on hit · C: shards make future Frost Blasts bounce through them.
- **Frost Shield [UTIL]** — K: attackers of the shielded ally are marked brittle · C: Frost Shield pulses consume brittle marks for crowd control.
- **Sinister Gaze [CHANNEL]** — K: gaze drains mana into a stored frost shard · C: breaking gaze early leaves the shard behind as a trap.
- **Chain Frost [ULT]** — K: Chain Frost prefers brittle or shard-marked enemies · C: Chain Frost gains new bounces by revisiting the same hero through shards.

**Luna** (agi · carry/nuker/pusher)
- **Lucent Beam [NUKE]** — K: Lucent Beam also pops a small Moon Glaive bounce on hit · C: Lucent Beam strikes twice when it kills, refunding half its cooldown.
- **Moon Glaives [PASS]** — K: glaive bounces mark enemies as moonlit · C: bounces seek moonlit and low-HP targets first.
- **Lunar Blessing [PASS]** — K: aura turns nearby allied attacks into moonlight charge · C: stored moonlight changes Eclipse's beam budget and target preference.
- **Eclipse [ULT]** — K: Eclipse beams prefer moonlit heroes · C: Eclipse follows Luna instead of striking a fixed area.

**Sven** (str · carry/durable/initiator)
- **Storm Hammer [NUKE]** — K: hammered enemies become stormbound for Great Cleave · C: Storm Hammer splits through stormbound targets.
- **Great Cleave [PASS]** — K: cleave applies stormbound to secondary targets · C: cleave becomes an armor-agnostic shockwave during God's Strength.
- **Warcry [UTIL]** — K: Warcry gives allies a block shield that scales with nearby stormbound enemies · C: Warcry also commands allied summons to charge Sven's target.
- **God's Strength [ULT]** — K: God's Strength consumes stormbound marks for extra cleave events · C: Great Cleave becomes a full-ring shockwave while active.

**Axe** (str · initiator/durable/disabler)
- **Berserker's Call [UTIL]** — K: taunted enemies are marked for Counter Helix · C: Call drags marked enemies inward instead of only forcing attacks.
- **Battle Hunger [UTIL]** — K: Battle Hunger marks enemies as panicked when they fail to fight back · C: Battle Hunger spreads from executed or panicked enemies.
- **Counter Helix [PASS]** — K: Helix consumes taunt marks for a guaranteed spin · C: Helix can trigger from spell hits while Call is active.
- **Culling Blade [ULT]** — K: Culling Blade primes Call on execute · C: an execute turns the next Call into a team charge instead of a solo taunt.

### A.2 Phase 2 heroes

**Mirana** (agi · carry/nuker/escape/disabler)
- **Starstorm [NUKE]** — K: Starstorm marks the nearest enemy as moonlit · C: the second wave centers on a moonlit or low-HP enemy.
- **Sacred Arrow [NUKE]** — K: long-travel arrows mark enemies for Starstorm · C: a perfect arrow creates a fear burst and refunds Leap.
- **Leap [UTIL]** — K: landing primes Mirana's next attack or Arrow · C: Leap can be recast once if the first landing creates a hit.
- **Moonlight Shadow [ULT]** — K: breaking invisibility primes Starstorm · C: attacks from Moonlight Shadow call a Starstorm wave at the attacker.

**Lina** (int · nuker/disabler/support)
- **Dragon Slave [NUKE]** — K: Dragon Slave brands enemies as scorched · C: Dragon Slave returns along its path, consuming scorch marks.
- **Light Strike Array [NUKE]** — K: scorched enemies make LSA arm faster · C: LSA applies a burn that feeds Fiery Soul.
- **Fiery Soul [PASS]** — K: max stacks turn Lina's next spell into an overcast · C: at max stacks, attacks splash fire and extend scorch.
- **Laguna Blade [ULT]** — K: Laguna consumes scorch for execution pressure · C: Laguna splits into a cross that also hits enemies behind the target.

**Zeus** (int · nuker)
- **Arc Lightning [NUKE]** — K: Arc Lightning tags enemies as charged · C: every charged chain can fork through two paths.
- **Lightning Bolt [NUKE]** — K: Bolt reveals and primes charged enemies · C: Bolt strikes all charged enemies clustered around the target.
- **Static Field [PASS]** — K: Static Field triggers from Arc Lightning on charged enemies · C: Static Field converts charged enemy health into pure shock.
- **Thundergod's Wrath [ULT]** — K: Wrath reveals and charges every enemy · C: Wrath repeats on enemies that spend or receive a charge.

**Drow Ranger** (agi · carry/disabler)
- **Frost Arrows [ATKMOD]** — K: Frost Arrows stack a brittle state · C: fully brittle targets are briefly rooted by the next Frost Arrow.
- **Gust [UTIL]** — K: Gust pushes enemies through brittle stacks · C: Gust refreshes Marksmanship's next precision shot.
- **Multishot [CHANNEL]** — K: Multishot arrows apply Frost Arrows · C: Drow can walk while channeling, turning Multishot into a kiting stance.
- **Marksmanship [ULT]** — K: Marksmanship splits toward brittle enemies · C: precision arrows keep their bonus even when enemies close the gap.

**Jakiro** (int · support/nuker/disabler/pusher)
- **Dual Breath [NUKE]** — K: fire and ice paths leave separate burn/chill marks · C: the fire wave returns along chilled ground.
- **Ice Path [ZONE]** — K: Ice Path leaves frozen ground after the stun · C: frozen ground can redirect Dual Breath or Macropyre.
- **Liquid Fire [ATKMOD]** — K: Liquid Fire marks buildings and enemies as kindling · C: kindling spreads Liquid Fire to nearby targets.
- **Macropyre [ULT]** — K: Macropyre consumes chill marks to create freezing patches · C: Macropyre becomes a fire-and-ice lane that both burns and traps.

**Witch Doctor** (int · support/disabler/nuker)
- **Paralyzing Cask [NUKE]** — K: Cask prioritizes cursed or ward-targeted enemies · C: hero bounces refresh the Cask chain.
- **Voodoo Restoration [UTIL]** — K: Restoration converts overheal into cleanse charge · C: Restoration spends cleanse charge to dispel allies.
- **Maledict [UTIL]** — K: Maledict records team damage as curse debt · C: curse debt is shared across all cursed enemies before it bursts.
- **Death Ward [ULT]** — K: Death Ward focuses cursed enemies · C: Witch Doctor may reposition the ward once, keeping its target memory.

**Omniknight** (str · support/durable)
- **Purification [UTIL]** — K: Purification marks healed allies as consecrated · C: consecrated allies emit a damage-block shield when struck.
- **Repel [UTIL]** — K: Repel can jump from a consecrated ally to the next ally hit by a disable · C: Repel can protect two allies through that jump rule.
- **Hammer of Purity [ATKMOD]** — K: Hammer heals Omni when it strikes a consecrated target's attacker · C: Hammer executes summons and wounded enemies with holy backlash.
- **Guardian Angel [ULT]** — K: Guardian Angel consecrates the team · C: allies who would die under Guardian Angel revive when it ends.

**Windranger** (uni · disabler/nuker/escape)
- **Shackleshot [NUKE]** — K: Shackleshot creates a phantom anchor when no tree exists · C: Shackleshot can never fully whiff, but phantom anchors break quickly.
- **Powershot [NUKE]** — K: Powershot marks its path as a wind lane · C: wind lanes slow enemies and empower Windrun.
- **Windrun [UTIL]** — K: Windrun reads wind lanes for evasion and repositioning · C: Windrun grants brief invisibility when crossing a wind lane.
- **Focus Fire [ULT]** — K: Focus Fire attacks stack wind-cut marks · C: wind-cut marks let Powershot shred armor along the Focus Fire line.

**Phantom Assassin** (agi · carry/escape)
- **Stifling Dagger [NUKE]** — K: dagger applies her current attack (lifesteal, on-hits) · C: a dagger kill resets Phantom Strike's cooldown.
- **Phantom Strike [UTIL]** — K: Strike primes the next dagger or attack as an ambush event · C: Phantom Strike can target allies, blinking PA beside them.
- **Blur [UTIL]** — K: Blur hides PA and stores an ambush charge · C: nearby enemies are exposed, making them vulnerable to ambush crits.
- **Coup de Grace [ULT]** — K: Coup de Grace consumes ambush charge for execution pressure · C: Coup crits execute wounded enemies.

**Tusk** (str · initiator/disabler/durable)
- **Ice Shards [NUKE]** — K: shard walls mark enemies who collide with them · C: Ice Shards can shatter on command for a follow-up burst.
- **Snowball [NUKE]** — K: Snowball picks up nearby allies as passengers · C: Snowball can be re-aimed once mid-roll and gains effects from each passenger.
- **Tag Team [ZONE]** — K: Tag Team marks enemies hit by allies · C: marked enemies take a guaranteed mini-bash from the next coordinated hit.
- **Walrus Punch [ULT]** — K: Walrus Punch marks the target as airborne for Tag Team · C: wounded airborne targets are punched again before they land.

**Ancient Apparition** (int · support/disabler/nuker)
- **Cold Feet [UTIL]** — K: Cold Feet marks enemies who keep moving as frostbound · C: frostbound enemies still trigger Cold Feet if AA dies.
- **Ice Vortex [ZONE]** — K: Vortex follows the most frostbound enemy inside it · C: Vortex becomes a moving magic-amp trap.
- **Chilling Touch [ATKMOD]** — K: Chilling Touch applies frostbound stacks · C: frostbound targets suffer healing failure when struck.
- **Ice Blast [ULT]** — K: Ice Blast seeks frostbound clusters · C: shattering an enemy refreshes part of the Ice Blast cycle.

### A.3 Phase 3 heroes

**Legion Commander** (str · carry/durable/initiator)
- **Overwhelming Odds [NUKE]** - K: each enemy hit grants Legion +6 damage for 4s; C: Odds also taunts the highest-HP enemy hit for 0.8s.
- **Press the Attack [UTIL]** - K: also dispels one debuff and grants +25 move speed; C: can be cast on Legion and an ally at the same time.
- **Moment of Courage [ATKMOD]** - K: proc also grants a small barrier from lifesteal; C: proc chance doubles during Duel and for 4s after winning one.
- **Duel [ULT]** - K: Duel grants +20 temporary damage on cast; C: a Duel win grants permanent damage and refreshes Press the Attack.

**Vengeful Spirit** (agi · support/disabler)
- **Magic Missile [NUKE]** - K: stun splashes a 0.4s mini-stun around the target; C: Missile bounces once to the nearest enemy hero.
- **Wave of Terror [NUKE]** - K: armor reduction lasts 2s longer and grants Venge vision; C: Wave echoes back from max range for 50% damage.
- **Vengeance Aura [PASS]** - K: allies in aura gain +8% attack damage; C: when Venge drops below 35% HP, the aura doubles for 5s.
- **Nether Swap [ULT]** - K: swapped enemy is slowed 45% for 2s; C: Swap leaves a vengeful image behind that attacks for 4s.

**Shadow Fiend** (agi · carry/nuker)
- **Shadowraze [NUKE]** - K: consecutive razes on the same target deal +18% damage; C: each raze leaves a soul mark that detonates on Requiem.
- **Necromastery [ATKMOD]** - K: soul count grants +12 attack speed at high stacks; C: killing a marked enemy refunds a Shadowraze charge.
- **Presence of the Dark Lord [PASS]** - K: aura also reduces magic resistance by 6%; C: enemies inside Presence take a fear pulse when Requiem starts.
- **Requiem of Souls [ULT]** - K: +4 soul waves and +0.4s fear; C: Requiem casts a second inward wave after 1s.

**Riki** (agi · carry/escape)
- **Smoke Screen [ZONE]** - K: Smoke also blinds for 20%; C: Smoke follows Riki for 3s after cast.
- **Blink Strike [NUKE]** - K: Blink Strike grants +20 attack speed for 3s; C: Blink Strike stores two charges and refunds one on kill.
- **Cloak and Dagger [PASS]** - K: first attack from invis slows 35%; C: breaking invis guarantees a backstab crit.
- **Tricks of the Trade [ULT]** - K: +2 strikes and +80 radius; C: Riki can recast to blink to the lowest-HP enemy inside the ring.

**Bounty Hunter** (agi · escape/nuker)
- **Shuriken Toss [NUKE]** - K: Shuriken ricochets to tracked or low-HP enemies; C: Shuriken resets if it kills a tracked target.
- **Jinada [ATKMOD]** - K: Jinada steals a small amount of move speed; C: Jinada applies on Shuriken Toss at 70% value.
- **Shadow Walk [UTIL]** - K: leaving invis grants +35 attack speed; C: Shadow Walk can be refreshed after a takedown.
- **Track [ULT]** - K: tracked enemies take +8% damage from Bounty; C: killing a tracked enemy splashes Track to nearby enemies.

**Lion** (int · support/disabler/nuker)
- **Earth Spike [NUKE]** - K: Spike leaves cracked ground that slows; C: Spike splits into three lines from Lion.
- **Hex [UTIL]** - K: Hexed targets take +10% spell damage; C: Hex jumps to a nearby enemy when it expires.
- **Mana Drain [CHANNEL]** - K: drains mana as damage faster below 50% mana; C: Lion can move slowly while draining.
- **Finger of Death [ULT]** - K: +120 damage and a 1s fear on kill; C: Finger gains permanent damage on hero kill and splashes 30%.

**Winter Wyvern** (int · support/disabler)
- **Arctic Burn [UTIL]** - K: attacks during Arctic Burn slow more and pierce evasion; C: Arctic Burn also grants flying movement over terrain.
- **Splinter Blast [NUKE]** - K: splinters apply a 25% slow; C: the first target also takes the splinter burst.
- **Cold Embrace [UTIL]** - K: Embrace heals for a burst when it ends; C: Embrace pulses frost damage to enemies each second.
- **Winter's Curse [ULT]** - K: +0.6s curse duration and +150 radius; C: cursed target shares damage taken with nearby enemies after it ends.

**Sand King** (str · initiator/disabler/nuker)
- **Burrowstrike [NUKE]** - K: Burrowstrike leaves a short sand trail that slows; C: Sand King may recast once from the end point.
- **Sand Storm [ZONE]** - K: storm blinds enemies by 20%; C: Sand Storm follows Sand King at half speed.
- **Caustic Finale [ATKMOD]** - K: Caustic explosions slow for 2s; C: any Caustic explosion reapplies Caustic to enemies hit.
- **Epicenter [ULT]** - K: +2 pulses and +60 radius; C: Epicenter pulses continue for 2s after Sand King moves or dies.

**Nyx Assassin** (uni · disabler/escape/nuker)
- **Impale [NUKE]** - K: Impale travels faster and stuns +0.3s; C: Impale erupts again at max range.
- **Mind Flare [NUKE]** - K: burns extra mana before dealing damage; C: deals bonus damage based on the target's missing mana.
- **Spiked Carapace [UTIL]** - K: reflects a flat burst to the attacker; C: first reflected hit also stuns in a small AoE.
- **Vendetta [ULT]** - K: Vendetta strike applies Break for 4s; C: a Vendetta kill refreshes Vendetta and grants brief invisibility.

**Medusa** (agi · carry/durable)
- **Split Shot [ATKMOD]** - K: split arrows apply 25% of on-hit effects; C: Split Shot always prefers lowest-HP secondary targets.
- **Mystic Snake [NUKE]** - K: each bounce steals a small amount of mana; C: Snake returns to Medusa, shielding her for mana stolen.
- **Mana Shield [PASS]** - K: shield conversion improves at low HP; C: Mana Shield can absorb a lethal hit once per fight.
- **Stone Gaze [ULT]** - K: petrify threshold builds 25% faster; C: petrified enemies shatter for bonus physical damage.

**Viper** (agi · carry/durable)
- **Poison Attack [ATKMOD]** - K: poison stacks reduce healing by 20%; C: max stacks root for 0.6s.
- **Nethertoxin [ZONE]** - K: zone applies Break for 1.5s; C: Nethertoxin follows the poisoned enemy with the highest HP.
- **Corrosive Skin [PASS]** - K: attackers are slowed by poison; C: Corrosive Skin spreads Poison Attack to attackers.
- **Viper Strike [ULT]** - K: +1.5s duration and stronger slow; C: Viper Strike bounces once to a nearby poisoned enemy.

**Kunkka** (str · carry/disabler)
- **Torrent [ZONE]** - K: Torrent pulls enemies slightly toward the center; C: Torrent creates two delayed aftershocks.
- **Tidebringer [ATKMOD]** - K: cleave applies a 20% slow; C: Tidebringer cleave can crit.
- **X Marks the Spot [UTIL]** - K: marked target takes +8% damage from Kunkka; C: returning the target triggers a Torrent at the mark.
- **Ghostship [ULT]** - K: allies hit by the ship gain +25% damage reduction; C: Ghostship sails twice along crossing paths.

**Tidehunter** (str · durable/initiator)
- **Gush [NUKE]** - K: armor reduction deepens by 3; C: Gush sprays in a cone behind the target.
- **Kraken Shell [PASS]** - K: damage block improves while disabled; C: Kraken Shell purges Tide when a damage threshold is reached.
- **Anchor Smash [NUKE]** - K: enemy damage reduction lasts 2s longer; C: Anchor Smash also procs Kraken Shell's purge threshold.
- **Ravage [ULT]** - K: +120 radius and +0.4s stun; C: Ravage has a second smaller wave after 1.2s.

**Slardar** (str · durable/disabler)
- **Guardian Sprint [UTIL]** - K: Sprint grants status resistance while moving toward enemies; C: Sprint leaves a wake that speeds allies.
- **Slithereen Crush [NUKE]** - K: Crush slows after the stun; C: Crush repeats at half radius after 0.8s.
- **Bash of the Deep [ATKMOD]** - K: Bash shreds 3 armor; C: every fourth attack bashes with no proc roll.
- **Corrosive Haze [ULT]** - K: Haze grants true sight and +4 armor shred; C: Haze spreads to nearby enemies when the target is bashed.

**Naga Siren** (agi · carry/pusher/disabler)
- **Mirror Image [SUMMON]** - K: images spawn with a short damage shield; C: images copy Rip Tide at reduced value.
- **Ensnare [UTIL]** - K: rooted target takes +10% physical damage; C: Ensnare can catch two targets.
- **Rip Tide [ATKMOD]** - K: armor reduction stacks twice; C: Rip Tide triggers from images independently.
- **Song of the Siren [ULT]** - K: +1s duration and +150 radius; C: ending Song casts Ensnare on the closest enemy hero.

**Slark** (agi · carry/escape)
- **Dark Pact [NUKE]** - K: purge happens earlier in the pulse; C: Dark Pact leaves a shadow burst that repeats for 50% damage.
- **Pounce [UTIL]** - K: Pounce leash slows and deals minor damage; C: Pounce gains a second charge.
- **Essence Shift [ATKMOD]** - K: stolen stats last 4s longer; C: Slark gains permanent agility from hero takedowns.
- **Shadow Dance [ULT]** - K: regen starts instantly; C: Shadow Dance refreshes Pounce when Slark drops below 40% HP.

**Lifestealer** (str · carry/durable)
- **Rage [UTIL]** - K: Rage grants +25 attack speed; C: Rage can be cast while disabled once per fight.
- **Feast [PASS]** - K: Feast heals more against high-HP enemies; C: Feast damage becomes partially pure below 40% target HP.
- **Ghoul Frenzy [ATKMOD]** - K: attacks steal move speed; C: max Frenzy stacks briefly root the target.
- **Infest [ULT]** - K: exit damage heals Lifestealer; C: Infest can target an ally and grants them Feast while occupied.

**Undying** (str · support/durable/pusher)
- **Decay [NUKE]** - K: stolen strength lasts 4s longer; C: Decay also heals Undying for each hero hit.
- **Soul Rip [UTIL]** - K: stronger when cast near Tombstone; C: Soul Rip can heal Tombstone and damage enemies at the same time.
- **Tombstone [SUMMON]** - K: zombies slow harder; C: Tombstone spawns a guardian zombie when destroyed.
- **Flesh Golem [ULT]** - K: aura amps damage to nearby enemies; C: enemies dying near Undying extend Flesh Golem.

**Doom** (str · carry/durable/disabler)
- **Devour [UTIL]** - K: Devour grants a short armor buff; C: Devour stores a second creep-bonus profile.
- **Scorched Earth [ZONE]** - K: heals Doom for a share of damage dealt; C: Scorched Earth follows Doom and leaves burning ground behind.
- **Infernal Blade [ATKMOD]** - K: burn deals extra damage to high-HP targets; C: every third Infernal Blade mini-stuns.
- **Doom [ULT]** - K: +1s duration and +80 damage; C: Doom spreads at half duration if the target dies.

**Wraith King** (str · carry/durable)
- **Wraithfire Blast [NUKE]** - K: blast burn heals Wraith King for 30%; C: Blast summons a skeleton at the target.
- **Vampiric Spirit [PASS]** - K: lifesteal also applies to nearby allies; C: lifesteal overheal becomes a temporary shield.
- **Mortal Strike [ATKMOD]** - K: crits summon a skeleton on hero hit; C: first attack after Reincarnation is a guaranteed Mortal Strike.
- **Reincarnation [ULT]** - K: slows enemies harder on revive; C: Reincarnation also revives nearby skeletons and refreshes Wraithfire Blast.

**Night Stalker** (str · durable/initiator)
- **Void [NUKE]** - K: Void mini-stuns during night; C: Void refreshes when cast during Dark Ascension.
- **Crippling Fear [UTIL]** - K: silence also reduces vision; C: Fear becomes an aura during night.
- **Hunter in the Night [PASS]** - K: night bonuses begin at 50% strength during day; C: takedowns extend night bonuses for 4s.
- **Dark Ascension [ULT]** - K: grants flying movement and +150 vision; C: Dark Ascension causes Void to hit all visible enemies once.

**Invoker** (int · nuker/disabler)
- **Quas Wex Exort [UTIL]** - K: each orb grants a small matching stat package; C: switching orb focus refreshes one basic cooldown.
- **Sun Strike [NUKE]** - K: Sun Strike reveals before landing; C: kills with Sun Strike split a second strike nearby.
- **Forge Spirit [SUMMON]** - K: spirits shred armor on hit; C: summons a second spirit and shares Invoker's spell amp.
- **Invoke [ULT]** - K: Invoke reduces the cooldown of the next spell; C: Invoke casts the last invoked spell a second time at 50% power.

**Silencer** (int · support/disabler)
- **Arcane Curse [NUKE]** - K: Curse lasts longer on silenced enemies; C: Curse spreads when a cursed enemy casts or dies.
- **Glaives of Wisdom [ATKMOD]** - K: attacks burn mana; C: Glaives deal bonus damage based on Silencer's INT.
- **Last Word [UTIL]** - K: triggers faster and applies a brief slow; C: Last Word bounces to another enemy after triggering.
- **Global Silence [ULT]** - K: +1s duration and enemies take +8% magic damage; C: first spell cast after Global Silence ends is interrupted again.

**Outworld Destroyer** (int · carry/nuker)
- **Arcane Orb [ATKMOD]** - K: Orb damage scales with current mana; C: Orb splashes around imprisoned targets.
- **Astral Imprisonment [UTIL]** - K: imprisoned target loses mana on release; C: can store two charges.
- **Essence Flux [PASS]** - K: mana restore also grants a short spell-amp buff; C: Flux can trigger from attacks with Arcane Orb.
- **Sanity's Eclipse [ULT]** - K: +120 radius and +10% mana difference damage; C: enemies below 25% mana are stunned after Eclipse.

**Skywrath Mage** (int · support/nuker)
- **Arcane Bolt [NUKE]** - K: Bolt scales harder with INT; C: every third Bolt fires a second missile.
- **Concussive Shot [NUKE]** - K: slow lasts 1s longer; C: Shot seeks the lowest-HP visible enemy and splashes.
- **Ancient Seal [UTIL]** - K: magic amp increases by 8%; C: Seal spreads to enemies hit by Mystic Flare.
- **Mystic Flare [ULT]** - K: +1s duration and +80 radius; C: Flare follows the sealed target.

**Tinker** (int · nuker/pusher)
- **Laser [NUKE]** - K: blind duration +1s; C: Laser refracts to a second target.
- **Heat-Seeking Missile [NUKE]** - K: +1 missile target; C: missiles prioritize recently lasered enemies and stun briefly.
- **Defense Matrix [UTIL]** - K: barrier also grants status resistance; C: Matrix can be cast on an ally and Tinker together.
- **Rearm [ULT]** - K: channel time reduced; C: Rearm also refreshes item actives with a long internal cooldown.

**Enchantress** (int · support/pusher)
- **Impetus [ATKMOD]** - K: damage scales harder with distance; C: Impetus pierces and hits a second enemy behind the target.
- **Enchant [SUMMON]** - K: charmed units gain +25 attack speed; C: Enchant can hold two controlled creeps.
- **Nature's Attendants [UTIL]** - K: wisps cleanse one debuff over the duration; C: attendants also damage nearby enemies.
- **Untouchable [ULT]** - K: attack slow increases by 20; C: attackers are briefly disarmed after hitting Enchantress twice.

**Chen** (int · support/pusher)
- **Penitence [UTIL]** - K: target takes +10% damage from Chen's units; C: Penitence spreads to another enemy when the target dies.
- **Holy Persuasion [SUMMON]** - K: persuaded creeps gain armor and magic resist; C: Persuasion stores an extra creep.
- **Divine Favor [PASS]** - K: aura grants +6% healing amp; C: aura shares Chen's item healing with controlled units.
- **Hand of God [ULT]** - K: +120 heal and +1s regen; C: Hand also revives the weakest controlled creep.

**Nature's Prophet** (int · pusher/nuker)
- **Sprout [ZONE]** - K: trees damage and slow enemies inside; C: Sprout summons treants when it expires.
- **Teleportation [UTIL]** - K: landing grants +30 attack speed; C: Teleportation leaves a return portal for allies.
- **Nature's Call [SUMMON]** - K: treants gain armor and bonus building damage; C: creates one greater treant per cast.
- **Wrath of Nature [ULT]** - K: +2 bounces and stronger final hit; C: every hero hit spawns a treant nearby.

**Beastmaster** (uni · initiator/pusher)
- **Wild Axes [NUKE]** - K: axes apply a stacking damage amp; C: axes return a second time after reaching max range.
- **Call of the Wild [SUMMON]** - K: beasts gain Beastmaster's attack-speed bonuses; C: summons both hawk and boar variants together.
- **Inner Beast [PASS]** - K: aura grants +10% attack speed to summons; C: aura doubles during Primal Roar.
- **Primal Roar [ULT]** - K: side enemies are pushed farther and slowed; C: Roar commands all summons to leap at the target.

**Broodmother** (agi · carry/pusher/escape)
- **Insatiable Hunger [UTIL]** - K: lifesteal becomes a shield at full HP; C: Hunger spreads to spiderlings at half value.
- **Spin Web [ZONE]** - K: Web grants extra regen and evasion; C: webs connect, letting Brood blink between them.
- **Spawn Spiderlings [SUMMON]** - K: spiderlings inherit Poison Sting-like slow; C: hero kills spawn a spiderling swarm.
- **Silken Bola [ULT]** - K: miss chance and slow increase; C: Bola splits to nearby enemies standing in webs.

**Warlock** (int · support/initiator)
- **Fatal Bonds [UTIL]** - K: shared damage ratio increases; C: bonded enemies also share disables at reduced duration.
- **Shadow Word [UTIL]** - K: healing/damage ticks are faster; C: Word can affect an ally and an enemy at once.
- **Upheaval [CHANNEL]** - K: slow ramps faster; C: Warlock can move at 50% speed while channeling.
- **Chaotic Offering [ULT]** - K: golem gains +25% HP and attack damage; C: summons a second smaller golem.

**Visage** (uni · support/pusher)
- **Grave Chill [UTIL]** - K: steals more move and attack speed; C: Chill also commands familiars to focus the target.
- **Soul Assumption [NUKE]** - K: stores one extra charge; C: releases a second shot at the nearest wounded enemy.
- **Gravekeeper Cloak [PASS]** - K: cloak layers recharge faster; C: losing all layers releases a slowing shockwave.
- **Summon Familiars [ULT]** - K: familiars gain Stone Form damage; C: familiars revive once at half HP.

**Magnus** (uni · initiator/disabler)
- **Shockwave [NUKE]** - K: pulls enemies slightly toward Magnus; C: Shockwave travels out and back.
- **Empower [UTIL]** - K: grants +15% cleave to melee allies; C: Empower also affects all nearby summons.
- **Skewer [UTIL]** - K: Skewer distance +150 and slow after impact; C: Skewer can be recast to stop and slam early.
- **Reverse Polarity [ULT]** - K: +100 radius and +0.3s stun; C: RP casts a free Shockwave from the center.

**Elder Titan** (str · initiator/disabler)
- **Echo Stomp [ZONE]** - K: sleep duration +0.4s; C: Stomp repeats from Astral Spirit if active.
- **Astral Spirit [SUMMON]** - K: spirit grants more move speed on return; C: spirit copies Echo Stomp at 50% power.
- **Natural Order [PASS]** - K: armor and magic resist reduction deepen near both bodies; C: Natural Order applies to enemies hit by Earth Splitter for 4s.
- **Earth Splitter [ULT]** - K: crack pulls enemies toward center; C: Splitter leaves a Natural Order field for 5s.

**Tiny** (str · carry/durable)
- **Avalanche [ZONE]** - K: extra tick and +0.3s stun; C: Avalanche follows tossed enemies.
- **Toss [NUKE]** - K: Tossed unit lands with bonus splash; C: Toss can target trees or summons for extra damage.
- **Tree Grab [ATKMOD]** - K: attacks cleave wider; C: Tree Grab throws the tree on final charge.
- **Grow [ULT]** - K: +20% bonus damage and +5 armor; C: Grow causes Tiny's spells to stun buildings and bosses briefly.

**Treant Protector** (str · support/durable)
- **Nature's Grasp [ZONE]** - K: grasp slows more near trees; C: grasp vines seek the nearest rooted enemy.
- **Leech Seed [UTIL]** - K: pulses heal allies harder; C: Seed jumps when its target dies.
- **Living Armor [UTIL]** - K: armor also blocks magic damage; C: can armor all allies at reduced value.
- **Overgrowth [ULT]** - K: +1s root and +100 radius; C: rooted enemies take Nature's Grasp damage over time.

**Centaur Warrunner** (str · durable/initiator)
- **Hoof Stomp [NUKE]** - K: +0.4s stun; C: Stomp repeats at half radius after 1s.
- **Double Edge [NUKE]** - K: self-damage becomes a delayed bleed; C: Double Edge deals bonus damage equal to a share of Centaur's strength.
- **Retaliate [PASS]** - K: attackers take more return damage; C: Retaliate triggers an AoE pulse when Centaur is stunned.
- **Stampede [ULT]** - K: allies gain damage reduction while stampeding; C: Stampede knockbacks enemies on first contact.

**Storm Spirit** (int · carry/escape/nuker)
- **Static Remnant [ZONE]** - K: remnant arms faster; C: leaves two smaller remnants after exploding.
- **Electric Vortex [UTIL]** - K: pull distance and slow increase; C: Vortex chains to a second nearby enemy.
- **Overload [ATKMOD]** - K: Overload slow lasts longer; C: every spell grants two Overload charges.
- **Ball Lightning [ULT]** - K: mana cost reduced; C: passing through a Remnant refreshes part of Ball Lightning's mana.

**Ember Spirit** (agi · carry/escape/nuker)
- **Searing Chains [UTIL]** - K: +1 target; C: Chains prioritize heroes hit by Sleight of Fist.
- **Sleight of Fist [NUKE]** - K: applies attack modifiers at 60%; C: kills during Sleight refresh a Fire Remnant charge.
- **Flame Guard [UTIL]** - K: absorbs more magic damage; C: Flame Guard explodes when broken.
- **Fire Remnant [ULT]** - K: +1 remnant and faster travel; C: arriving at a remnant casts a small Flame Guard burst.

**Spectre** (agi · carry/durable)
- **Spectral Dagger [NUKE]** - K: dagger trail grants more movement and phases allies; C: Dagger creates a haunt image at the target.
- **Desolate [ATKMOD]** - K: isolated threshold widens; C: Desolate damage becomes pure against isolated targets.
- **Dispersion [PASS]** - K: reflection stronger at low HP; C: Dispersion marks attackers for Spectral Dagger.
- **Haunt [ULT]** - K: illusions last 2s longer; C: Reality swap can be used twice during Haunt.

**Faceless Void** (agi · carry/initiator)
- **Time Walk [UTIL]** - K: heals more recent damage; C: Time Walk leaves an echo that repeats last attack.
- **Time Dilation [ZONE]** - K: cooldown slow increases; C: affected enemies take damage when their cooldowns tick.
- **Time Lock [ATKMOD]** - K: bash damage +25%; C: every fourth hit Time Locks.
- **Chronosphere [ULT]** - K: +80 radius and +0.5s duration; C: Void's allies can attack into Chronosphere at reduced speed.

**Terrorblade** (agi · carry/pusher)
- **Reflection [UTIL]** - K: reflection illusions deal more damage; C: reflected enemies are disarmed briefly.
- **Conjure Image [SUMMON]** - K: images take less damage; C: creates a Metamorphosis image if Terrorblade is transformed.
- **Metamorphosis [UTIL]** - K: transformation grants +75 attack range; C: Metamorphosis also transforms active images.
- **Sunder [ULT]** - K: minimum HP floor improves; C: Sunder can target an image to heal Terrorblade without harming an ally.

**Phoenix** (uni · support/nuker)
- **Icarus Dive [UTIL]** - K: Dive burn slows enemies; C: can recast to stop and pulse fire.
- **Fire Spirits [NUKE]** - K: +1 spirit; C: spirits orbit Phoenix until fired, burning nearby enemies.
- **Sun Ray [CHANNEL]** - K: heal and damage scale harder with target max HP; C: Phoenix may turn faster and move slowly while channeling.
- **Supernova [ULT]** - K: egg gains +2 hit count; C: successful Supernova refreshes Fire Spirits and casts Sun Ray outward.

**Io** (uni · support/escape)
- **Tether [UTIL]** - K: tethered ally gains +20 move speed; C: Tether also shares a portion of Io's regen and shields.
- **Spirits [NUKE]** - K: +1 spirit and larger explosion; C: spirits can be collapsed early for a burst.
- **Overcharge [UTIL]** - K: stronger attack speed and damage reduction; C: Overcharge applies to all tethered summons and illusions.
- **Relocate [ULT]** - K: shorter return delay; C: Relocate leaves a healing field at both endpoints.

### A.4 Standard roster

**Abaddon** (str · support/durable)
- **Mist Coil [UTIL]** - K: self-damage is reduced and heal is stronger below 40% HP; C: Coil can bounce once between Abaddon and an ally.
- **Aphotic Shield [UTIL]** - K: shield grants +20% status resistance; C: shield explosion heals allies for 35% of damage absorbed.
- **Curse of Avernus [ATKMOD]** - K: curse stacks slow faster; C: max curse stacks silence for 0.8s.
- **Borrowed Time [ULT]** - K: healing during Borrowed Time grants attack speed; C: first lethal hit on an ally within 600 triggers a mini Borrowed Time on them.

**Alchemist** (str · carry/durable)
- **Acid Spray [ZONE]** - K: armor reduction increases by 2; C: Acid Spray follows Alchemist while Chemical Rage is active.
- **Unstable Concoction [NUKE]** - K: stun gains +0.4s at full brew; C: Concoction splits after impact to hit two nearby enemies.
- **Greevil's Greed [PASS]** - K: greed stacks also grant +2 damage; C: kill streak stacks grant a temporary item cooldown reduction.
- **Chemical Rage [ULT]** - K: +25 attack speed and +10 HP regen; C: Chemical Rage causes Acid Spray ticks to heal Alchemist.

**Bristleback** (str · durable/carry)
- **Viscous Nasal Goo [UTIL]** - K: Goo gains an extra armor stack; C: Goo spreads from Quill Spray targets.
- **Quill Spray [NUKE]** - K: stacks last 2s longer; C: every third Quill Spray fires twice.
- **Bristleback [PASS]** - K: rear damage reduction increases; C: taking enough rear damage triggers a free Quill Spray.
- **Warpath [ULT]** - K: +1 max stack and faster stack gain; C: Warpath stacks also grant status resistance.

**Dawnbreaker** (str · carry/durable/support)
- **Starbreaker [NUKE]** - K: final swing stuns +0.3s; C: Starbreaker can move toward the target during swings.
- **Celestial Hammer [NUKE]** - K: hammer trail heals allies slightly; C: hammer can be recalled early, damaging on both paths.
- **Luminosity [ATKMOD]** - K: proc heals nearby allies for 35% of lifesteal; C: first hit after Solar Guardian guarantees Luminosity.
- **Solar Guardian [ULT]** - K: +120 radius and +80 heal; C: landing casts Starbreaker automatically at half damage.

**Dragon Knight** (str · durable/carry/disabler)
- **Breathe Fire [NUKE]** - K: damage reduction lasts 2s longer; C: fire cone leaves burning ground.
- **Dragon Tail [UTIL]** - K: stun gains +0.4s in dragon form; C: Dragon Tail splashes to enemies behind the target.
- **Dragon Blood [PASS]** - K: armor and regen increase while disabled; C: Dragon Blood grants a shield when dropping below 40% HP.
- **Elder Dragon Form [ULT]** - K: +100 attack range and +20 damage; C: attacks splash Breathe Fire damage during dragon form.

**Huskar** (str · carry/durable)
- **Inner Vitality [UTIL]** - K: regen doubles below 35% HP; C: can be self-cast automatically when Life Break is used.
- **Burning Spear [ATKMOD]** - K: burn stacks reduce healing; C: max stacks detonate for bonus magic damage.
- **Berserker's Blood [PASS]** - K: grants more magic resist at low HP; C: low-HP threshold also grants status resistance.
- **Life Break [ULT]** - K: self-damage reduced and slow increased; C: Life Break refreshes Burning Spear stacks and applies max stacks.

**Mars** (str · initiator/durable/disabler)
- **Spear of Mars [NUKE]** - K: stunned target takes +10% damage from Mars; C: Spear creates a short wall if it misses.
- **God's Rebuke [NUKE]** - K: +20% crit damage; C: Rebuke sends a shockwave along its cone.
- **Bulwark [PASS]** - K: front damage block increases; C: blocked hits charge a free God's Rebuke.
- **Arena of Blood [ULT]** - K: walls deal more damage on contact; C: Spear of Mars pins enemies to Arena walls from any angle.

**Ogre Magi** (str · support/disabler/durable)
- **Fireblast [NUKE]** - K: +0.4s stun; C: Fireblast always multicasts once at 60% value.
- **Ignite [NUKE]** - K: Ignite hits one extra enemy; C: Ignite spreads when its target is hit by Fireblast.
- **Bloodlust [UTIL]** - K: grants +10% status resistance; C: Bloodlust also applies to nearby allies at half value.
- **Multicast [ULT]** - K: +1 repeat chance band; C: every multicast lowers the next spell cooldown by 1s.

**Primal Beast** (str · initiator/durable/disabler)
- **Onslaught [NUKE]** - K: charge impact slows for 2s; C: Onslaught can be turned once mid-charge.
- **Trample [ZONE]** - K: radius +60 and damage +10%; C: Trample continues during Onslaught.
- **Uproar [PASS]** - K: grants extra armor at max stacks; C: casting Uproar fears nearby enemies briefly.
- **Pulverize [ULT]** - K: +0.5s duration and wider impact; C: Pulverize slams damage around both Primal and the target.

**Spirit Breaker** (str · initiator/disabler/durable)
- **Charge of Darkness [NUKE]** - K: charge stun +0.3s; C: Charge hits enemies passed through.
- **Bulldoze [UTIL]** - K: stronger status resistance and move speed; C: Bulldoze also grants a damage shield based on speed.
- **Greater Bash [ATKMOD]** - K: bash damage scales with move speed; C: first attack after Charge always bashes.
- **Nether Strike [ULT]** - K: +120 damage and +0.4s stun; C: Nether Strike refreshes Charge on hit.

**Underlord** (str · durable/support/pusher)
- **Firestorm [ZONE]** - K: +1 wave and +60 radius; C: Firestorm follows Pit of Malice enemies.
- **Pit of Malice [ZONE]** - K: root lasts +0.3s; C: Pit triggers twice on each enemy with a short cooldown.
- **Atrophy Aura [PASS]** - K: aura also reduces attack speed; C: enemy deaths in aura grant Underlord temporary damage.
- **Dark Rift [ULT]** - K: heal increases and channel shortens; C: arrival creates a Pit of Malice at the endpoint.

**Anti-Mage** (agi · carry/escape)
- **Mana Break [ATKMOD]** - K: burns extra mana from shielded enemies; C: mana burn splashes to a nearby enemy.
- **Blink [UTIL]** - K: Blink grants evasion for 2s; C: Blink stores a second charge.
- **Counterspell [UTIL]** - K: duration +0.5s; C: reflected spells trigger Mana Break on the caster.
- **Mana Void [ULT]** - K: +100 radius and mini-stun; C: Mana Void repeats at 40% damage if it kills.

**Bloodseeker** (agi · carry/initiator)
- **Bloodrage [UTIL]** - K: grants +20 attack speed; C: Bloodrage can be cast on an enemy to amplify damage they take.
- **Blood Rite [ZONE]** - K: silence lasts +1s; C: Blood Rite leaves a blood pool that slows.
- **Thirst [PASS]** - K: low-HP enemy threshold widens; C: killing a Thirst-marked enemy refreshes Blood Rite.
- **Rupture [ULT]** - K: rupture damage ticks faster; C: moving during Rupture pulls Bloodseeker toward the target.

**Clinkz** (agi · carry/escape)
- **Strafe [UTIL]** - K: grants projectile evasion; C: Strafe also fires a searing arrow at the nearest enemy each second.
- **Searing Arrows [ATKMOD]** - K: bonus damage applies to buildings and summons; C: every fifth arrow explodes.
- **Skeleton Walk [UTIL]** - K: invis grants more move speed; C: exiting invis summons a burning skeleton archer.
- **Death Pact [ULT]** - K: +250 max HP and +20 damage; C: Death Pact creates two skeleton archers on cast.

**Gyrocopter** (agi · carry/nuker)
- **Rocket Barrage [NUKE]** - K: +3 rockets; C: rockets prioritize stunned or slowed enemies.
- **Homing Missile [NUKE]** - K: missile gains HP and stun duration; C: missile explodes in a larger AoE and mini-stuns secondary targets.
- **Flak Cannon [UTIL]** - K: +2 attacks and +80 search radius; C: Flak attacks apply 40% of on-hit effects.
- **Call Down [ULT]** - K: +1 missile wave; C: second wave leaves burning ground.

**Hoodwink** (agi · nuker/escape/disabler)
- **Acorn Shot [NUKE]** - K: +2 bounces; C: Acorn Shot creates a tree on first hit for Bushwhack.
- **Bushwhack [ZONE]** - K: root duration +0.4s; C: Bushwhack fires an Acorn Shot at each trapped hero.
- **Scurry [UTIL]** - K: evasion and move speed last longer; C: Scurry makes the next Sharpshooter charge faster.
- **Sharpshooter [ULT]** - K: +150 range and stronger slow; C: fully charged shot pierces to hit a second target.

**Razor** (agi · carry/durable)
- **Plasma Field [NUKE]** - K: outer ring deals extra damage; C: ring returns a second time after a short delay.
- **Static Link [UTIL]** - K: drain rate increases; C: linked damage becomes attack speed when the link ends.
- **Storm Surge [PASS]** - K: grants more move speed near enemies; C: taking spell damage triggers a mini Plasma Field.
- **Eye of the Storm [ULT]** - K: strikes faster; C: Eye prioritizes Static Link targets and shreds armor twice.

**Templar Assassin** (agi · carry/escape)
- **Refraction [UTIL]** - K: +1 damage and block instance; C: Refraction refreshes one instance on hero kill.
- **Meld [ATKMOD]** - K: armor reduction deepens; C: Meld can be cast during Refraction without breaking stance.
- **Psi Blades [PASS]** - K: spill range increases; C: spilled Psi Blades apply Meld armor reduction at half value.
- **Psionic Trap [ULT]** - K: trap slow is stronger and arms faster; C: detonating a trap grants Refraction charges.

**Troll Warlord** (agi · carry/durable)
- **Berserker's Rage [ATKMOD]** - K: melee hits gain armor and root chance; C: switching forms grants a short burst of both form bonuses.
- **Whirling Axes [NUKE]** - K: blind/slow values increase; C: axes spin around Troll for 2s after cast.
- **Fervor [PASS]** - K: max stacks +2; C: changing targets preserves half Fervor stacks.
- **Battle Trance [ULT]** - K: duration +1s; C: during Trance, Fervor stacks apply to Whirling Axes.

**Ursa** (agi · carry/durable)
- **Earthshock [ZONE]** - K: slow lasts longer; C: Earthshock triggers an extra Fury Swipes stack.
- **Overpower [UTIL]** - K: +2 attacks; C: Overpower attacks cleave around the target.
- **Fury Swipes [ATKMOD]** - K: stacks last 3s longer; C: max stacks cause the next hit to mini-stun.
- **Enrage [ULT]** - K: damage reduction increases; C: Enrage refreshes Overpower and doubles Fury Swipes gain.

**Venomancer** (agi · support/pusher)
- **Venomous Gale [NUKE]** - K: gale applies Poison Sting stacks; C: Gale splits into two side projectiles.
- **Poison Sting [ATKMOD]** - K: poison reduces healing; C: poison stacks detonate when Poison Nova hits.
- **Plague Ward [SUMMON]** - K: wards gain attack speed; C: wards inherit Poison Sting at full value.
- **Poison Nova [ULT]** - K: duration +2s and radius +100; C: Nova refreshes all Poison Sting stacks.

**Weaver** (agi · carry/escape)
- **The Swarm [SUMMON]** - K: beetles shred armor faster; C: beetles duplicate when their target drops below 50% HP.
- **Shukuchi [UTIL]** - K: speed and damage increase; C: Shukuchi stores a second charge.
- **Geminate Attack [ATKMOD]** - K: second attack applies on-hit effects; C: Geminate fires a third attack after Time Lapse.
- **Time Lapse [ULT]** - K: restores more mana and dispels; C: Time Lapse leaves a swarm beetle trail behind.

**Death Prophet** (int · pusher/nuker/durable)
- **Crypt Swarm [NUKE]** - K: swarm returns for 50% damage; C: Crypt Swarm heals Death Prophet per hero hit.
- **Silence [ZONE]** - K: duration +1s; C: Silence summons a spirit over each silenced hero.
- **Spirit Siphon [CHANNEL]** - K: drain slow increases; C: Siphon can link to two targets.
- **Exorcism [ULT]** - K: +3 spirits; C: spirits prioritize silenced or siphoned targets.

**Disruptor** (int · support/disabler/nuker)
- **Thunder Strike [NUKE]** - K: +1 strike; C: final strike drops a small Kinetic Field.
- **Glimpse [UTIL]** - K: returned target is slowed; C: Glimpse also returns one nearby summoned unit or illusion.
- **Kinetic Field [ZONE]** - K: field forms faster and lasts longer; C: field shocks enemies that touch its edge.
- **Static Storm [ULT]** - K: damage ramps faster; C: Storm also mutes items for the final 2s.

**Grimstroke** (int · support/nuker/disabler)
- **Stroke of Fate [NUKE]** - K: damage scales higher per enemy hit; C: Stroke paints the ground, slowing enemies.
- **Phantom's Embrace [SUMMON]** - K: phantom latch lasts longer; C: killing a latched target sends the phantom to a new one.
- **Ink Swell [UTIL]** - K: explosion stun +0.4s; C: Ink Swell can be placed on a phantom or summon.
- **Soulbind [ULT]** - K: linked targets share more spell effects; C: Soulbind creates a third short link to the nearest enemy.

**Keeper of the Light** (int · support/nuker)
- **Illuminate [CHANNEL]** - K: charge damage ramps faster; C: Illuminate can be released while moving.
- **Blinding Light [UTIL]** - K: knockback farther and blind stronger; C: Blinding Light leaves a radiant slow field.
- **Chakra Magic [UTIL]** - K: restores more mana and reduces cooldowns; C: Chakra also empowers the target's next spell.
- **Spirit Form [ULT]** - K: duration +3s; C: Spirit Form creates a free Illuminate after Chakra Magic.

**Leshrac** (int · nuker/pusher)
- **Split Earth [ZONE]** - K: stun +0.3s; C: Split Earth erupts twice.
- **Diabolic Edict [ZONE]** - K: +4 explosions; C: Edict prioritizes heroes and buildings.
- **Lightning Storm [NUKE]** - K: +2 jumps; C: lightning leaves a slow field under each target.
- **Pulse Nova [ULT]** - K: mana cost reduced and radius increased; C: Pulse Nova casts a Lightning Storm every fifth pulse.

**Necrophos** (int · durable/nuker)
- **Death Pulse [NUKE]** - K: heal and damage +12%; C: Death Pulse repeats when it hits three or more units.
- **Ghost Shroud [UTIL]** - K: healing amp increases; C: ending Shroud releases a Death Pulse.
- **Heartstopper Aura [PASS]** - K: aura damage increases near low-HP enemies; C: enemies dying in aura heal Necrophos.
- **Reaper's Scythe [ULT]** - K: execute threshold improves; C: Scythe kill refreshes Ghost Shroud and adds a Heartstopper burst.

**Puck** (int · escape/nuker/disabler)
- **Illusory Orb [NUKE]** - K: Orb moves faster and damages more; C: Orb can be recast twice, first to jaunt and second to return.
- **Waning Rift [NUKE]** - K: silence lasts +0.6s; C: Rift pulls enemies toward Puck before silencing.
- **Phase Shift [UTIL]** - K: duration +0.5s; C: exiting Phase Shift casts a small Waning Rift.
- **Dream Coil [ULT]** - K: snap damage and stun increase; C: enemies tethered by Coil are pulled together when one snaps.

**Pugna** (int · nuker/pusher)
- **Nether Blast [ZONE]** - K: building damage increases; C: blast repeats at half damage after 1s.
- **Decrepify [UTIL]** - K: magic amp increases; C: Decrepify spreads to enemies hit by Nether Blast.
- **Nether Ward [SUMMON]** - K: ward mana-burn damage increases; C: ward pulses silence when enemy spells trigger it.
- **Life Drain [ULT]** - K: drain rate +20%; C: Life Drain can chain to one extra enemy or ally.

**Queen of Pain** (int · nuker/escape)
- **Shadow Strike [NUKE]** - K: poison slow increases; C: poison jumps when the target is hit by Scream of Pain.
- **Blink [UTIL]** - K: Blink grants spell amp for 2s; C: Blink leaves a damaging afterimage.
- **Scream of Pain [NUKE]** - K: radius +80; C: Scream hits twice against poisoned enemies.
- **Sonic Wave [ULT]** - K: width and damage increase; C: Sonic Wave echoes from terrain or max range.

**Shadow Demon** (int · support/disabler)
- **Disruption [UTIL]** - K: illusion damage improves; C: Disruption can target allies and enemies with separate cooldowns.
- **Disrupted Image [SUMMON]** - K: images gain attack speed; C: images explode with Shadow Poison when they expire.
- **Shadow Poison [NUKE]** - K: +1 stack cap and larger detonation; C: detonating five stacks spreads two stacks nearby.
- **Disseminate [ULT]** - K: shared damage ratio increases; C: Disseminate also shares healing received as damage to enemies.

**Shadow Shaman** (int · support/disabler/pusher)
- **Ether Shock [NUKE]** - K: +2 targets; C: Ether Shock bounces from hexed or shackled targets.
- **Hex [UTIL]** - K: duration +0.5s; C: Hexed targets are attacked by Serpent Wards at priority.
- **Shackles [CHANNEL]** - K: damage and duration increase; C: Shaman may move slowly while channeling.
- **Mass Serpent Ward [ULT]** - K: +2 wards; C: wards form a tighter cage and apply a small slow on hit.

**Bane** (uni · support/disabler)
- **Enfeeble [UTIL]** - K: damage reduction increases; C: Enfeeble also lowers status resistance.
- **Brain Sap [NUKE]** - K: heal increases below 50% HP; C: Brain Sap bounces to a sleeping or gripped enemy.
- **Nightmare [UTIL]** - K: Nightmare deals light damage over time; C: Nightmare spreads once when attacked.
- **Fiend's Grip [ULT]** - K: mana drain and damage increase; C: Grip summons Nightmare on nearby enemies for 2s.

**Batrider** (uni · initiator/disabler)
- **Sticky Napalm [UTIL]** - K: max stacks +2; C: Firefly and Flamebreak apply two stacks.
- **Flamebreak [NUKE]** - K: knockback farther and burn longer; C: Flamebreak explodes again after landing.
- **Firefly [ZONE]** - K: trail lasts longer; C: Firefly grants flying movement and drops Napalm on first contact.
- **Flaming Lasso [ULT]** - K: duration +0.5s; C: dragging a target through Firefly trail refreshes Lasso damage ticks.

**Clockwerk** (uni · initiator/disabler/durable)
- **Battery Assault [ZONE]** - K: mini-stun interval improves; C: Battery Assault prioritizes enemies trapped in Cogs.
- **Power Cogs [ZONE]** - K: cogs have more HP and mana burn; C: cogs launch enemies inward when they expire.
- **Rocket Flare [NUKE]** - K: reveals longer; C: Rocket Flare leaves a target mark for Hookshot.
- **Hookshot [ULT]** - K: stun duration +0.4s; C: Hookshot refreshes Battery Assault and creates Cogs on arrival.

**Dark Seer** (uni · initiator/pusher)
- **Vacuum [ZONE]** - K: radius +80; C: Vacuum casts Ion Shell on the center-most ally or illusion.
- **Ion Shell [UTIL]** - K: damage and duration increase; C: Ion Shell duplicates onto the nearest ally at half value.
- **Surge [UTIL]** - K: grants status resistance; C: Surge leaves an Ion Shell trail.
- **Wall of Replica [ULT]** - K: illusions deal more damage; C: Vacuum pulls enemies into Wall when cast nearby.

**Dark Willow** (uni · support/disabler/nuker)
- **Bramble Maze [ZONE]** - K: brambles arm faster; C: rooted enemies spawn a new bramble on expiry.
- **Shadow Realm [UTIL]** - K: bonus damage charges faster; C: Shadow Realm grants invisibility during the charge.
- **Cursed Crown [UTIL]** - K: stun radius +80; C: Crown splits to a second target before detonation.
- **Terrorize [ULT]** - K: fear lasts longer; C: feared enemies leave brambles in their path.

**Dazzle** (uni · support/nuker)
- **Poison Touch [NUKE]** - K: poison slows harder; C: attacks refresh and spread Poison Touch.
- **Shallow Grave [UTIL]** - K: target gains move speed while grave holds; C: Grave heals for missing HP when it ends.
- **Shadow Wave [UTIL]** - K: +2 bounces; C: Shadow Wave bounces can revisit Dazzle once.
- **Bad Juju [ULT]** - K: cooldown reduction improves; C: every third spell casts a free Shadow Wave.

**Earth Spirit** (uni · initiator/disabler)
- **Boulder Smash [NUKE]** - K: slow/stun duration +0.3s; C: Smash can kick allies and remnants in the same cast.
- **Rolling Boulder [UTIL]** - K: impact radius +60; C: hitting a magnetized enemy refreshes Rolling Boulder.
- **Geomagnetic Grip [UTIL]** - K: silence lasts longer; C: Grip pulls two remnants and chains silence between them.
- **Magnetize [ULT]** - K: duration +2s; C: magnetized enemies share remnant-triggered disables.

**Enigma** (uni · initiator/pusher/disabler)
- **Malefice [UTIL]** - K: +1 stun tick; C: Malefice spreads to enemies near Eidolons.
- **Demonic Conversion [SUMMON]** - K: Eidolons split faster; C: Eidolons gain a ranged beam after splitting.
- **Eidolon [SUMMON]** - K: summons gain armor and attack speed; C: Eidolons explode into Midnight Pulse on death.
- **Midnight Pulse [ULT]** - K: damage increases by target max HP; C: Pulse pulls enemies slowly toward its center.

**Lone Druid** (uni · carry/pusher)
- **Spirit Bear [SUMMON]** - K: bear gains armor and damage; C: bear inherits Lone Druid's attack modifiers.
- **Savage Roar [UTIL]** - K: fear duration +0.4s; C: Roar also grants the bear haste.
- **Battle Cry [UTIL]** - K: grants more armor and damage; C: Battle Cry affects all summons nearby.
- **True Form [ULT]** - K: bonus HP and armor increase; C: True Form swaps control emphasis, empowering the bear while Druid tanks.

**Lycan** (uni · carry/pusher)
- **Summon Wolves [SUMMON]** - K: wolves gain evasion and damage; C: wolves apply a stacking bleed.
- **Wolf [SUMMON]** - K: wolf crit chance increases; C: wolves leap to Howl targets.
- **Howl [UTIL]** - K: enemy damage reduction increases; C: Howl also fears creeps and summons.
- **Feral Impulse [ULT]** - K: aura grants more damage and regen; C: Shapeshift-style haste applies to all wolves during Feral Impulse.

**Marci** (uni · support/initiator)
- **Dispose [NUKE]** - K: landing stun lasts longer; C: Dispose can throw enemies into allies to shield them.
- **Rebound [UTIL]** - K: ally buff grants more move speed; C: Rebound grants a second leap if it hits an enemy.
- **Sidekick [UTIL]** - K: lifesteal increases; C: Sidekick also grants shared attack damage.
- **Unleash [ULT]** - K: pulse radius and attack speed increase; C: Unleash pulses apply Dispose slow.

**Pangolier** (uni · initiator/escape)
- **Swashbuckle [NUKE]** - K: slash count +1; C: Swashbuckle applies Lucky Shot on every hit at reduced chance.
- **Shield Crash [ZONE]** - K: damage reduction increases per hero hit; C: Shield Crash can be cast during Rolling Thunder.
- **Lucky Shot [ATKMOD]** - K: disarm chance increases; C: Lucky Shot also shreds armor.
- **Rolling Thunder [ULT]** - K: turn rate improves; C: bouncing off terrain releases a Shield Crash pulse.

**Snapfire** (uni · support/nuker)
- **Scatterblast [NUKE]** - K: close-range damage bonus increases; C: Scatterblast knocks enemies into Firesnap Cookie range.
- **Firesnap Cookie [UTIL]** - K: jump distance and stun increase; C: Cookie leaves a burning patch at the landing spot.
- **Lil' Shredder [ATKMOD]** - K: armor shred stacks higher; C: Shredder bullets apply Mortimer burn at low value.
- **Mortimer Kisses [ULT]** - K: +2 globs and larger impact; C: glob impacts spawn mini Scatterblasts.

**Timbersaw** (uni · durable/escape/nuker)
- **Whirling Death [NUKE]** - K: stat loss increases; C: Whirling Death deals bonus pure damage near trees.
- **Timber Chain [UTIL]** - K: range +150; C: Chain can be recast on hit to pull again.
- **Reactive Armor [PASS]** - K: stacks grant status resistance; C: max stacks release a Whirling Death pulse.
- **Chakram [ULT]** - K: damage and slow increase; C: Chakram can orbit Timbersaw instead of staying placed.

**Void Spirit** (uni · escape/nuker)
- **Aether Remnant [UTIL]** - K: pull duration +0.3s; C: remnant splits into two angled pulls.
- **Dissimilate [NUKE]** - K: outer portals deal more damage; C: Dissimilate refreshes Resonant Pulse shield on hit.
- **Resonant Pulse [UTIL]** - K: shield increases per hero hit; C: shield bursts when broken.
- **Astral Step [ULT]** - K: +1 charge; C: Step marks enemies so Aether Remnant seeks them.

### A.5 Complex heroes

**Chaos Knight** (str · carry/durable/disabler)
- **Chaos Bolt [NUKE]** - K: damage and stun roll skew higher; C: Bolt splits between two targets, rolling separately.
- **Reality Rift [UTIL]** - K: armor reduction deepens; C: Rift pulls all active Phantasm illusions to the target.
- **Chaos Strike [ATKMOD]** - K: crit lifesteal improves; C: crits from illusions heal Chaos Knight at reduced value.
- **Phantasm [ULT]** - K: +1 illusion and +2s duration; C: Phantasm illusions cast Reality Rift on their first attack.

**Arc Warden** (agi · carry/nuker)
- **Flux [NUKE]** - K: slow and damage increase on isolated targets; C: Flux duplicates from Tempest Double at half value.
- **Magnetic Field [ZONE]** - K: field grants more evasion and attack speed; C: fields from Arc and Double overlap into a stun pulse.
- **Spark Wraith [ZONE]** - K: wraith arms faster; C: wraiths duplicate when triggered by Fluxed enemies.
- **Tempest Double [ULT]** - K: Double lasts longer and gains more damage; C: Double copies the next mastery capstone trigger once.

**Meepo** (agi · carry/pusher)
- **Earthbind [UTIL]** - K: net travels faster and roots longer; C: each clone throws a weaker net at the same target.
- **Poof [NUKE]** - K: Poof damage increases per clone nearby; C: Poof chains through all clones in cast order.
- **Ransack [ATKMOD]** - K: lifesteal shares between clones; C: attacks from clones stack a short armor shred.
- **Divided We Stand [ULT]** - K: +1 clone duration band and clone damage; C: when one clone drops low, all clones gain a brief Ransack surge.

**Monkey King** (agi · carry/escape/disabler)
- **Boundless Strike [NUKE]** - K: crit multiplier and stun increase; C: Boundless Strike commands Wukong soldiers to strike the line.
- **Tree Dance + Primal Spring [UTIL]** - K: leap range and slow increase; C: Primal Spring grants a free Jingu stack per hero hit.
- **Jingu Mastery [ATKMOD]** - K: stacks last longer; C: max Jingu turns the next Boundless Strike into a guaranteed crit.
- **Wukong's Command [ULT]** - K: +1 soldier ring and +2s duration; C: soldiers apply Jingu Mastery at reduced value.

**Morphling** (agi · carry/escape)
- **Waveform [NUKE]** - K: range and damage increase; C: Morphling can attack once during Waveform.
- **Adaptive Strike [NUKE]** - K: chooses stronger stun or damage from current stats; C: Strike fires both agility and strength versions.
- **Morph [UTIL]** - K: stat shift grants a temporary shield; C: shifting past a threshold refreshes Adaptive Strike.
- **Replicate [ULT]** - K: replicate gains more damage and duration; C: Replicate can cast the copied target's first basic spell once.

**Phantom Lancer** (agi · carry/escape/pusher)
- **Spirit Lance [NUKE]** - K: lance illusion lasts longer; C: lance spawns two illusions if it hits a hero.
- **Doppelganger [SUMMON]** - K: creates one stronger decoy; C: Doppelganger refreshes Phantom Rush on all illusions.
- **Phantom Rush [ATKMOD]** - K: rush bonus damage increases; C: illusions can trigger Rush with a shared cooldown.
- **Juxtapose [ULT]** - K: +1 illusion and more duration; C: max illusion count causes the next Spirit Lance to split.

**Rubick** (int · support/disabler/nuker)
- **Telekinesis [UTIL]** - K: lift duration +0.3s and larger landing stun; C: Telekinesis can throw the target toward a chosen point.
- **Fade Bolt [NUKE]** - K: damage reduction deepens; C: Fade Bolt steals a small amount of spell amp per hero hit.
- **Arcane Supremacy [PASS]** - K: more cast range and spell amp; C: every stolen or copied spell gains an extra mastery growth node.
- **Spell Steal [ULT]** - K: stolen spell duration increases; C: stealing a spell instantly casts Fade Bolt on the victim.

**Brewmaster** (uni · initiator/durable/carry)
- **Thunder Clap [NUKE]** - K: slow and attack slow increase; C: Clap applies the current brew stance's rider effect.
- **Cinder Brew [ZONE]** - K: burn ignites faster; C: any elemental damage detonates Cinder Brew in a larger radius.
- **Drunken Brawler [ATKMOD]** - K: crit and evasion windows improve; C: stance cycling grants a short buff from all stances.
- **Primal Split [ULT]** - K: brewlings gain HP and damage; C: if one brewling survives, Brewmaster returns with Thunder Clap ready.

**Techies** (uni · nuker/disabler)
- **Sticky Bomb [NUKE]** - K: latch radius and slow increase; C: Sticky Bomb splits into two smaller bombs after detonation.
- **Reactive Tazer [UTIL]** - K: disarm duration and move speed increase; C: Tazer explosion also drops a Sticky Bomb.
- **Blast Off [NUKE]** - K: self-damage reduced and silence increased; C: Blast Off arms a mine at the landing point.
- **Proximity Mines [ULT]** - K: mine damage and trigger radius increase; C: mines chain-detonate with falloff instead of consuming nearby mines instantly.
