# Heroes & Items Completion Plan

Goal: finish the Dota roster and item catalog in Ancients. Add every hero and
every iconic item that is still missing, authored with real kits that read like
their Dota counterparts. Complex heroes (Rubick, Meepo, Arc Warden, Morphling,
and friends) get scaled-down designs that keep the feel without the full
micro/scripting burden.

This is a content plan, not an engine rewrite. The ability/status/item engine in
`/src/core/` already covers almost everything we need; new heroes and items are
data, plus a small number of new exotics for the genuinely scripted mechanics.

**Completion update (2026-06-13):** this plan is now implemented. The roster is at
122 heroes: the 57 missing heroes are authored, the 45 Phase 3 heroes have real
kits through `src/data/heroes/phase3-kits.ts`, the item catalog includes the §6
recognizable items/components, recruitment and echo placement are wired, and the
exotic budget lands at 16/25. The final polish pass added likeness profiles for
the iconic new heroes called out in §7.2 and real bounded core handlers for the
registered exotics in `src/core/exotics.ts`.

---

## 1. Where we are

Registry today (per `PROGRESS.md` and the data files):

- **65 heroes**, in three groups:
  - 9 fully hand-authored "feel" heroes: Juggernaut, Crystal Maiden, Pudge,
    Earthshaker, Sniper, Lich, Luna, Sven, Axe (`src/data/heroes/*.ts`).
  - 11 hand-authored Phase 2 heroes with real per-ability kits
    (`src/data/heroes/phase2.ts`).
  - 45 Phase 3 heroes generated from a seed by a generic factory
    (`src/data/heroes/phase3.ts`). They have correct names, lore, regions, and
    ability *names*, but their ability *mechanics* are templated
    (strike / control / passive-or-summon / ult), so they do not yet read like
    their Dota kits.
- **~78 items** registered, including the identity set called out in the spec
  (Blink, BKB, Euls, Force Staff, Glimmer, Mekansm, Battlefury, Diffusal,
  Maelstrom, Scythe, Skadi, Heart, Rapier, Refresher, Aghs).
- **~10 exotics** registered (`invoke`, `chronosphere`, `stone-gaze`,
  `reincarnation`, `rearm`, plus raid signatures). The data-lint cap is **25**,
  so we have ~15 exotic slots free.

Dota 2 currently ships ~126 heroes, so roughly **57 heroes are missing entirely**
(listed in §4). On items, the engine supports far more than we have authored;
~40 recognizable items are missing (listed in §6).

This plan covers **two hero cohorts plus the item catalog**:

- the **~57 heroes that don't exist yet** (§4.1–4.5), and
- the **45 templated Phase 3 heroes** that exist but play generically — these get
  re-authored into real kits (§4.6), because "preserve the general feel" applies to
  them just as much (Invoker doesn't actually invoke, Faceless Void's Chronosphere
  is the generic templated ult).

After this work, the whole roster reads like Dota, not just the count.

---

## 2. Definition of done (the gates any new content must clear)

These come straight from the existing tests; treat them as the acceptance bar.

**Per hero (`src/test/data-lint.test.ts`):**

- `attribute` in `str | agi | int | uni`; exactly **4 abilities**, exactly **1**
  with `ult: true`.
- **4 talent tiers** at levels 10/15/20/25, 2 options each; talent/facet
  ability-overrides must point at real ability value keys.
- **>= 1 facet**, a 3-color palette, **>= 6 barks**, `moveSpeed > 200`,
  `turnRate > 0.2`, an `animProfile` (`rig`/`castStyle`/`voiceTimbre`).
- `region` must resolve to a registered region.
- Every ability needs a valid `vfx.archetype`, a hex color, and a valid
  `anim` + `sound` from the closed vocabularies.
- Every ability `status` must be in the shared status list; every `ValueRef`
  string must exist in that ability's `values`.
- Any `exotic` id referenced must be registered.
- Non-starter heroes need a recruitment quest (`ALL_QUESTS.some(q => q.heroId === id)`).

**Recruitment wiring is templated and cheap.** Adding a hero id to the
`HERO_REGION` map in `src/data/quests/index.ts` auto-generates the recruitment
quest *and* the trial (Find -> Trial -> Bind). Add a `SPECIAL_TRIALS` entry only
when a hero deserves a bespoke trial kind; otherwise the heuristic picks one.

**Per item (`src/test/data-lint.test.ts`):**

- `cost >= 0`; every component id resolves; **recipe math must balance**
  (`sum(component costs) + recipeCost === cost`).
- Item `active` lints exactly like an ability (vfx/anim/sound/value refs/exotics).
- `appearance` parts/weapon kinds and `attackVisual` kinds must be from the known
  lists; `elementOnHit` must be an active element.
- Gated top-tier items must **not** appear in any normal `shopInventory`.

**Whole-roster gates:**

- **Kit smoke** (`src/test/kit-smoke.test.ts` and friends): every ability of
  every hero and every item active must execute in a headless sim at levels
  1/15/30 without throwing.
- **Exotic budget**: `REG.exotics.size <= 25`.
- **Boundary**: nothing under `/src/core/` may import `three` or touch the DOM,
  and the renderer-only `appearance`/`attackVisual` fields are never read by core.
- `npm run typecheck`, `npm test`, and `npm run build` stay green.

---

## 3. Authoring approach

**Author real kits, not the generic factory.** The new heroes should look like
the Phase 2 heroes in `phase2.ts`: a hand-written 4-ability array per hero, each
ability built from the §2 effect vocabulary, scaled to action-RPG pacing but
mechanically faithful. We keep the `phase2.ts` helpers (`hero(...)`, `talents`,
`rangedBase`/`meleeBase`) so each entry is mostly the ability array plus a short
seed.

**File organization.** Group the new heroes into themed batch files that mirror
the regions, the same way `phase2.ts`/`phase3.ts` already split the roster:

```
src/data/heroes/roster/strength.ts      // missing STR heroes
src/data/heroes/roster/agility.ts       // missing AGI heroes
src/data/heroes/roster/intelligence.ts  // missing INT heroes
src/data/heroes/roster/universal.ts     // missing UNI heroes
src/data/heroes/roster/complex.ts       // scaled-down complex heroes + their exotics
```

Each file exports a `HeroDef[]`; `src/data/index.ts` spreads them into
`ALL_HEROES` (which already maps `withElementTags`, so element tags are free).

**Scaling rule for the complex heroes (the user's ask).** Keep the *decision*
and the *silhouette of the mechanic*, drop the heavy machinery:

- Preserve: the targeting type, the delivery (skillshot vs lock-on vs channel),
  the signature fantasy ("I stole your spell", "I have many of me", "I copy
  myself"), and the counterplay.
- Simplify: replace true multi-unit micro, full spell libraries, and exact
  illusion accounting with a bounded, AI-driven, or single-instance version.

**Faithfulness checklist per hero** (the §6 heuristic in `SPEC.md`): a Dota
player picking the hero up should recognize how it plays. Skillshots can miss,
channels channel, point-targets turn the hero, melee must close distance.

**Recruitment + placement per hero:**

1. Add `heroId -> regionId` to `HERO_REGION` (auto quest + trial).
2. Add a `heroSpawns`/`echoSpawns` entry in that region's data so the hero is
   findable and farmable as an echo.
3. Optional: a `SPECIAL_TRIALS` entry for a bespoke trial kind.
4. Optional: add to a gym team, draft pool, or boss/raid loot if it fits.

---

## 4. Heroes to author

Two cohorts:

- **§4.1–4.5**: the ~57 heroes that don't exist yet, grouped by attribute, with
  §4.5 covering the scaled-down complex ones.
- **§4.6**: the 45 Phase 3 heroes that exist but use generic templated mechanics,
  re-authored into real kits.

For the new-hero tables, each entry lists the four abilities and the engine
approach. "Standard" means it composes from existing primitives with no exotic.
A star (*) marks a complex hero detailed in §4.5. Region assignments follow the
spec's lore map (§4 of `SPEC.md`).

### 4.1 Strength (missing)

| Hero | Region | Kit (Q/W/E/R) | Engine notes |
|------|--------|----------------|--------------|
| Abaddon | shadeshore | Mist Coil, Aphotic Shield, Curse of Avernus (aura), Borrowed Time | Standard. Borrowed Time = timed buff that converts damage to heal via `damageTakenReductionPct` + heal tick. |
| Alchemist | vile-reaches | Acid Spray (zone), Unstable Concoction (channel-charge stun), Greevil's Greed (passive gold), Chemical Rage (statmod) | Standard. Concoction = self channel that scales stun/damage with charge time. |
| Bristleback | vile-reaches | Viscous Nasal Goo, Quill Spray, Bristleback (rear damage block), Warpath (stacking) | Standard. Bristleback = `attackDamageTakenReductionPct` gated on facing; Warpath = on-cast stacking statmod. |
| Chaos Knight* | mad-moon-crater | Chaos Bolt (random stun), Reality Rift, Chaos Strike (crit), Phantasm (illusions) | Phantasm uses the existing summon/illusion path (see Phantom Lancer). |
| Dawnbreaker | tranquil-vale | Starbreaker (combo swing), Celestial Hammer (skillshot + return), Luminosity (heal on crit), Solar Guardian (global) | Standard. Solar Guardian = `global-mark` heal/stun zone at target point. |
| Dragon Knight | shadeshore | Breathe Fire, Dragon Tail (stun), Dragon Blood (passive), Elder Dragon Form (ranged transform) | Standard. Ult = timed statmod swapping attackRange/projectile + splash. |
| Huskar | vile-reaches | Inner Vitality, Burning Spear (DoT stack), Berserker's Blood (low-HP scaling), Life Break (HP-cost leap) | Standard. Berserker's Blood reads current HP% via statmod recompute. |
| Mars | shadeshore | Spear of Mars (skillshot pin), God's Rebuke, Bulwark (frontal block), Arena of Blood (wall) | Standard. Arena = `wall` zone ring (impassable terrain we already have for Fissure). |
| Ogre Magi | icewrack | Fireblast (stun), Ignite (DoT slow), Bloodlust (ally buff), Multicast (passive) | Standard. Multicast = chance to repeat the last cast via `repeat` with a proc roll. |
| Primal Beast | vile-reaches | Onslaught (charge), Trample, Uproar (stacking), Pulverize (channel lock) | Standard. Onslaught = self forced-move that knocks back on contact. |
| Spirit Breaker | mount-joerlak | Charge of Darkness (global homing charge), Bulldoze, Greater Bash (proc), Nether Strike (blink + stun) | Standard. Charge = long forced-move toward a marked unit with bash on arrival. |
| Underlord | vile-reaches | Firestorm (zone), Pit of Malevolence (root zone), Atrophy Aura, Dark Rift (team teleport) | Standard. Dark Rift = delayed `blink` for allies-in-radius to a point. |

### 4.2 Agility (missing)

| Hero | Region | Kit (Q/W/E/R) | Engine notes |
|------|--------|----------------|--------------|
| Anti-Mage | quoidge | Mana Break (attack-mod), Blink (short cd), Counterspell (spell block), Mana Void | Standard. Counterspell = timed `magic-immune`-lite reflect window via trigger. |
| Arc Warden* | mount-joerlak | Flux, Magnetic Field (evasion zone), Spark Wraith (delayed seeker), Tempest Double | Tempest Double = new `tempest-double` exotic (§5). |
| Bloodseeker | vile-reaches | Bloodrage, Blood Rite (delayed silence zone), Thirst (passive ms), Rupture (move-to-bleed) | Standard. Rupture = `buff` that deals damage proportional to distance moved. |
| Clinkz | mad-moon-crater | Strafe, Searing Arrows (attack-mod), Skeleton Walk (invis), Death Pact (summon-eat) | Standard. Death Pact = consume a summon/creep for max-HP buff. |
| Gyrocopter | shadeshore | Rocket Barrage (self aura DoT), Homing Missile (slow seeker), Flak Cannon (multi-hit), Call Down | Standard. Flak = N attacks hit all enemies in radius via attack-mod trigger. |
| Hoodwink | hidden-wood | Acorn Shot (bounce), Bushwhack (root zone), Scurry (evasion), Sharpshooter (channel skillshot) | Standard. Sharpshooter = charge channel -> long line damage scaling with charge. |
| Meepo* | mount-joerlak | Earthbind (net), Poof (blink + AoE), Petrify/Ransack, Divided We Stand | Divided We Stand = `divided-we-stand` exotic (§5); scaled to AI-driven clones. |
| Monkey King* | hidden-wood | Boundless Strike, Tree Dance + Primal Spring, Jingu Mastery (stacking crit), Wukong's Command | Wukong's Command = summon ring of AI soldiers + self-untargetable zone. |
| Morphling* | shadeshore | Waveform, Adaptive Strike, Morph (str<->agi), Replicate | Morph/Replicate = `morph-shift` exotic (§5). |
| Phantom Lancer* | hidden-wood | Spirit Lance, Doppelganger, Phantom Rush, Juxtapose (illusions) | Illusions via the summon path with a hard cap; no per-illusion micro. |
| Razor | mount-joerlak | Plasma Field (out+in ring), Static Link (drain link), Storm Surge, Eye of the Storm | Standard. Static Link = channeled `buff` moving `damage` from target to Razor. |
| Templar Assassin | quoidge | Refraction (charge block), Meld (invis bonus), Psi Blades (cleave-line), Psionic Trap | Standard. Refraction = N-instance damage block + bonus damage statmod. |
| Troll Warlord | shadeshore | Berserker's Rage (melee/ranged toggle), Whirling Axes, Fervor, Battle Trance | Standard. Toggle swaps attackRange + abilities' modifiers. |
| Ursa | mount-joerlak | Earthshock, Overpower (attack-speed burst), Fury Swipes (stacking on-hit), Enrage | Standard. Fury Swipes = stacking `bonusDamage` via attack trigger. |
| Venomancer | devarshi-desert | Venomous Gale, Poison Sting (attack-mod), Plague Ward (summon), Poison Nova | Standard. Wards are standard summons; Nova is a ground DoT ring. |
| Weaver | mad-moon-crater | The Swarm (summon bugs), Shukuchi (invis dash), Geminate Attack (double), Time Lapse (rewind) | Time Lapse = snapshot HP+position buff, restored after a delay (no exotic; a timed `buff` carrying stored state). |

### 4.3 Intelligence (missing)

| Hero | Region | Kit (Q/W/E/R) | Engine notes |
|------|--------|----------------|--------------|
| Death Prophet | vile-reaches | Crypt Swarm, Silence, Spirit Siphon (drain link), Exorcism (summon swarm) | Standard. Exorcism = many short-lived AI spirits via summon `count`. |
| Disruptor | mount-joerlak | Thunder Strike, Glimpse (pull-back to old pos), Kinetic Field (barrier), Static Storm (silence zone) | Standard. Glimpse = delayed `blink` of target to a stored position. |
| Grimstroke | quoidge | Stroke of Fate (line), Phantom's Embrace (latch DoT), Ink Swell (ally buff + stun), Soulbind | Soulbind = link two enemies so disables on one copy to the other (status mirror via trigger). |
| Keeper of the Light | quoidge | Illuminate (charge beam), Blinding Light (knockback + miss), Chakra Magic (mana), Spirit Form | Standard. Illuminate = channel-charge then wide line nuke. |
| Leshrac | quoidge | Split Earth (delayed stun), Diabolic Edict (random pulses), Lightning Storm (chain slow), Pulse Nova (toggle aura DoT) | Standard. Pulse Nova = `toggle` with mana-per-sec AoE damage. |
| Necrophos | vile-reaches | Death Pulse (heal+nuke ring), Ghost Shroud, Heartstopper Aura, Reaper's Scythe | Standard. Scythe = damage scaling with missing HP + respawn-time flavor (no exotic). |
| Puck | hidden-wood | Illusory Orb (orb + teleport to it), Waning Rift (silence nova), Phase Shift (dodge), Dream Coil (tether stun) | Standard. Phase Shift = brief self `cyclone`-style untargetable; Coil = tether that punishes leashing. |
| Pugna | quoidge | Nether Blast, Decrepify (ghost), Nether Ward (summon punisher), Life Drain (channel) | Standard. Nether Ward = summon that reflects/zaps on enemy casts via trigger. |
| Queen of Pain | quoidge | Shadow Strike (DoT), Blink, Scream of Pain (nova), Sonic Wave | Standard. |
| Rubick* | quoidge | Telekinesis (lift + throw), Fade Bolt, Arcane Supremacy (passive), Spell Steal | Spell Steal = `spell-steal` exotic (§5), scaled to copy the last enemy ability seen. |
| Shadow Demon | vile-reaches | Disruption (banish + illusions), Shadow Poison (stacking), Demonic Purge (slow + dispel), Disseminate | Standard. Disruption = brief untargetable banish then 2 weak summons. |
| Shadow Shaman | icewrack | Ether Shock, Hex, Shackles (channel), Mass Serpent Ward (summon line) | Standard. Hex reuses the `hex` status; wards are summons. |

### 4.4 Universal (missing)

| Hero | Region | Kit (Q/W/E/R) | Engine notes |
|------|--------|----------------|--------------|
| Bane | nightsilver-woods | Enfeeble, Brain Sap, Nightmare (sleep), Fiend's Grip (channel lock) | Standard. Nightmare reuses `sleep`; Grip reuses channel + drain. |
| Batrider | hidden-wood | Sticky Napalm (stack), Flamebreak (knockback), Firefly (trail), Flaming Lasso (drag) | Standard. Lasso = lock + forced-move that drags the victim with Batrider. |
| Brewmaster* | mount-joerlak | Thunder Clap, Cinder Brew, Drunken Brawler (evasion/crit), Primal Split | Primal Split = `primal-split` exotic (§5); scaled to 3 AI brewlings. |
| Clockwerk | quoidge | Battery Assault, Power Cogs (wall box), Rocket Flare (global), Hookshot (grapple) | Standard. Cogs = small ring of `wall` zones; Hookshot = self blink to first hit. |
| Dark Seer | mount-joerlak | Vacuum (pull), Ion Shell (attached DoT), Surge (ally speed), Wall of Replica (illusion wall) | Standard. Wall = line zone that spawns capped illusions of crossers (summon). |
| Dark Willow | hidden-wood | Bramble Maze (root zone), Shadow Realm (range buff), Cursed Crown (delayed stun), Bedlam/Terrorize | Standard. Terrorize reuses `fear`. |
| Dazzle | vile-reaches | Poison Touch, Shallow Grave (death-prevent), Shadow Wave (bounce heal), Bad Juju (cd aura) | Standard. Shallow Grave = `buff` that floors HP at 1 for its duration. |
| Earth Spirit | mount-joerlak | Boulder Smash, Rolling Boulder (dash line), Geomagnetic Grip, Magnetize (DoT) | Standard. Stone remnants can be summons that the kit consumes; scale to no-remnant if simpler. |
| Enigma | mad-moon-crater | Malefice (repeating stun), Demonic Conversion (eidolon summons), Midnight Pulse (% zone), Black Hole (channel pull) | Standard. Black Hole = channel + sustained pull-toward-point + stun in radius. |
| Lone Druid* | hidden-wood | Spirit Bear (summon), Savage Roar, Battle Cry, True Form | Bear via summon path with a persistent flag; scaled to AI bear (no manual control). |
| Lycan* | hidden-wood | Summon Wolves, Howl, Feral Impulse (aura), Shapeshift | Wolves are standard summons; Shapeshift = timed statmod + crit. No exotic needed. |
| Marci | tranquil-vale | Dispose (toss), Rebound (leap + stun), Sidekick (ally buff), Unleash (combo flurry) | Standard. Unleash = timed multi-hit burst windows via attack triggers. |
| Pangolier | mount-joerlak | Swashbuckle (dash slashes), Shield Crash, Lucky Shot (proc), Rolling Thunder (roll) | Standard. Rolling Thunder = forced-move loop that stuns on contact (reuse Snowball/charge path). |
| Snapfire | shadeshore | Scatterblast, Firesnap Cookie (hop + stun), Lil' Shredder (attack mod), Mortimer Kisses (channel barrage) | Standard. Cookie = ally/self displace + stun on landing. |
| Techies* | vile-reaches | Sticky Bomb, Reactive Tazer, Blast Off, Proximity Mines | Proximity Mines = `remote-mines` exotic (pre-plant), already anticipated by the spec. |
| Timbersaw | hidden-wood | Whirling Death, Timber Chain (grapple to tree), Reactive Armor (stacks), Chakram | Standard. Timber Chain = self blink toward a prop/point; Reactive Armor = stacking regen/armor. |
| Void Spirit | mad-moon-crater | Aether Remnant, Dissimilate (portal dash), Resonant Pulse (shield nova), Astral Step | Standard. Astral Step = multi-charge blink + line damage. |

### 4.5 Complex heroes — scaled-down designs

The brief: keep the feel, cut the difficulty. Each of these keeps its signature
decision and silhouette but runs on a bounded, AI-friendly implementation so it
works in the overworld (one player-controlled unit) and in headless macro sims.

**Rubick — Spell Steal kept, library trimmed.**
- Telekinesis, Fade Bolt, Arcane Supremacy: standard primitives.
- Spell Steal (`spell-steal` exotic): the sim already records the last ability
  cast by each unit (barks/events read it). Steal copies the *last enemy ability
  seen by Rubick* into his ult slot as a one-level castable for a duration, using
  that ability's existing `AbilityDef`. No new spell authoring — we reuse the
  victim's data. Scale-down: only the single most recent enemy cast is stealable,
  and only basic non-ult or ult depending on a facet. This preserves "I cast your
  spell back at you" without a full steal UI.

**Meepo — many-of-me without manual micro.**
- Earthbind (net root zone), Poof (blink to a Meepo + AoE), Ransack (lifesteal):
  standard.
- Divided We Stand (`divided-we-stand` exotic): spawns AI-controlled Meepo clones
  (1 at level 1, scaling) that share a fraction of the main Meepo's stats and run
  the gambit/creep controller, auto-following and casting Poof toward the main.
  Scale-down: clones are AI summons, not separately controlled units, and a clone
  death does not instantly kill the team (a softened version of the real rule, to
  keep it fair in an action-RPG). The "swarm of Meepos that blink onto a target"
  fantasy survives.

**Arc Warden — one double, on a timer.**
- Flux, Magnetic Field, Spark Wraith: standard.
- Tempest Double (`tempest-double` exotic): spawns a single AI copy of Arc Warden
  with his current abilities and a fraction of item effects, for a short lifetime.
  Scale-down: the double is AI-driven (rides the gambit controller / focuses the
  same target), not player-controlled. The "two Arc Wardens nuke at once" payoff
  remains.

**Morphling — attribute shift kept simple.**
- Waveform (dash line), Adaptive Strike: standard.
- Morph + Replicate (`morph-shift` exotic): Morph is a toggle/active that shifts a
  pool of points between STR and AGI via timed statmods (a clean stat trade, not a
  continuous slider). Replicate spawns one AI illusion of a target hero (summon
  path) for a duration. Scale-down: discrete morph steps instead of the analog
  agi/str slider; one replicate instead of full illusion control.

**Brewmaster — Primal Split as three brewlings.**
- Thunder Clap, Cinder Brew, Drunken Brawler: standard.
- Primal Split (`primal-split` exotic): for the duration, Brewmaster becomes
  untargetable/hidden and spawns 3 AI elemental brewlings (earth/storm/fire) with
  distinct stat profiles and one ability each; when the timer ends he reappears at
  the earth brewling (or last survivor). Scale-down: brewlings are AI, not three
  player-microed units. The "split into a wrecking crew" feel survives.

**Phantom Lancer / Chaos Knight — illusions as capped summons.**
- Use the existing summon path to create illusions (a `summon` with reduced
  damage taken/dealt and a hard cap), no new exotic. Juxtapose/Phantasm spawn N
  illusions that run creep AI and expire on a timer. Scale-down: a fixed cap and
  AI control rather than full illusion juggling.

**Lone Druid / Lycan — pets as persistent AI summons.**
- Spirit Bear and the wolves are standard summons with a long/permanent lifetime
  and creep AI. Lone Druid's bear scales with a few "bear items" modeled as the
  summon's own stat growth rather than a second inventory. Scale-down: no manual
  bear control; it fights as an entourage member (which the game already supports).

**Techies — pre-planted Proximity Mines.**
- `remote-mines` exotic (the spec already reserves this idea): plant invisible
  mines at a point that arm after a delay and detonate when an enemy enters the
  radius. Reuses the zone + trigger machinery. Scale-down: a charge-limited mine
  count and simple proximity detonation, no remote-detonate micro.

**Invoker (already present, templated) — optional upgrade.**
- The `invoke` exotic already exists. A faithful-but-reduced Invoker uses the
  spec's "6-spell subset" (e.g. Cold Snap, EMP, Tornado, Sun Strike, Forge Spirit,
  Deafening Blast) selected by a Quas/Wex/Exort orb state. Now tracked in §4.6.

### 4.6 Re-author the 45 templated Phase 3 heroes (real kits)

These heroes already ship (names, lore, regions, recruitment, presentation are
done) but their abilities come from the generic `strike/control/passive/ult`
factory in `phase3.ts`. Re-author each into a real 4-ability kit using the §3
approach (hand-written ability arrays, like `phase2.ts`), keeping the existing
id, region, palette, silhouette, barks, and recruitment wiring. Most compose from
existing primitives; the exotics they reference (`stone-gaze`, `reincarnation`,
`invoke`, `rearm`, `chronosphere`) are **already registered**, so no exotic-budget
cost. A star (*) reuses the summon/illusion path with an AI cap.

The mechanical work is to replace the factory output with the real kit. Group by
region (the same regions they already live in) so each batch is a coherent slice.

| Hero | Real kit (Q/W/E/R) | Engine notes |
|------|--------------------|--------------|
| Legion Commander | Overwhelming Odds, Press the Attack, Moment of Courage, Duel | Duel = paired lock both can't move/attack others; winner gains permanent damage. |
| Vengeful Spirit | Magic Missile (stun), Wave of Terror, Vengeance Aura, Nether Swap | Nether Swap = instant position swap (two `blink` displaces). |
| Shadow Fiend | Shadowraze (3 ranges), Necromastery (stacks), Presence (aura), Requiem of Souls | Raze = 3 fixed-distance nukes; Requiem = lines of damage scaling with soul stacks. |
| Riki | Smoke Screen (silence+miss zone), Blink Strike, Cloak and Dagger (backstab+invis), Tricks of the Trade | Permanent invis passive; Tricks = channel AoE backstab. |
| Bounty Hunter | Shuriken Toss, Jinada (crit+slow), Shadow Walk, Track | Track = debuff granting bonus gold + ms (links to the gold economy). |
| Lion | Earth Spike, Hex, Mana Drain (channel), Finger of Death | Hex/`hex` status reused; Finger = big single-target nuke. |
| Winter Wyvern | Arctic Burn, Splinter Blast, Cold Embrace (ally invuln+heal), Winter's Curse | Curse = `taunt`/forced-attack on a target's allies (scaled). |
| Sand King | Burrowstrike (line stun), Sand Storm (invis DoT zone), Caustic Finale, Epicenter | Epicenter = channel then expanding pulse rings (zone). |
| Nyx Assassin | Impale, Mana Burn/Mind Flare, Spiked Carapace (reflect), Vendetta (invis burst) | Carapace = timed reflect+stun on the next hit (trigger). |
| Medusa | Split Shot, Mystic Snake, Mana Shield, Stone Gaze | `stone-gaze` exotic already registered. |
| Viper | Poison Attack (attack-mod), Nethertoxin, Corrosive Skin, Viper Strike | Strike = heavy slow + DoT single target. |
| Kunkka | Torrent (delayed geyser), Tidebringer (cleave attack-mod), X Marks the Spot, Ghostship | X Marks = tether a unit, return it after delay; Ghostship = delayed crash stun zone. |
| Tidehunter | Gush, Kraken Shell (block+dispel), Anchor Smash, Ravage | Ravage = AoE stun ring from self. |
| Slardar | Guardian Sprint, Slithereen Crush (stun), Bash of the Deep, Corrosive Haze | Haze = -armor + true sight debuff. |
| Naga Siren* | Mirror Image (illusions), Ensnare (root), Rip Tide, Song of the Siren | Song = AoE `sleep`; images via summon cap. |
| Slark | Dark Pact (self-dispel pulse), Pounce (leap+leash), Essence Shift (stat steal), Shadow Dance | Essence Shift = on-hit stat steal stacks; Dance = heal+ms when unseen. |
| Lifestealer | Rage (magic-immune), Open Wounds/Feast, Ghoul Frenzy, Infest | Infest = hide inside a unit, burst out (reuse summon/host trick or scale to a buff). |
| Undying* | Decay (steal str), Soul Rip, Tombstone (summon), Flesh Golem | Tombstone = summon that spawns zombies; Golem = self transform + plague aura. |
| Doom | Devour, Scorched Earth, Infernal Blade, Doom | Doom = long single-target silence+disarm+DoT (the signature shutdown). |
| Wraith King | Wraithfire Blast, Vampiric Spirit, Mortal Strike (crit), Reincarnation | `reincarnation` exotic already registered. |
| Night Stalker | Void, Crippling Fear (fear at night), Hunter in the Night, Dark Ascension | Day/night already in engine; ult forces night + buffs him. |
| Invoker | Quas/Wex/Exort + a 6-spell subset, Invoke | `invoke` exotic registered; ship the reduced spell set from §4.5. |
| Silencer | Arcane Curse, Glaives of Wisdom (int-as-damage), Last Word, Global Silence | Global Silence = map-wide `silence`. |
| Outworld Destroyer | Arcane Orb (attack-mod), Astral Imprisonment (banish), Essence Flux, Sanity's Eclipse | Astral = brief `cyclone`-style banish + mana steal. |
| Skywrath Mage | Arcane Bolt, Concussive Shot, Ancient Seal (magic-amp), Mystic Flare | Flare = focused damage zone split among enemies. |
| Tinker | Laser (blind), Heat-Seeking Missile, Defense Matrix, Rearm | `rearm` exotic already registered (resets cooldowns). |
| Enchantress* | Impetus (distance damage), Enchant (convert/slow), Nature's Attendants (heal wisps), Untouchable | Enchant ties to capture; wisps are summons. |
| Chen* | Penitence, Holy Persuasion (convert), Divine Favor, Hand of God (global heal) | Persuasion converts a wild creep (ties to capture/entourage). |
| Nature's Prophet* | Sprout (tree prison), Teleportation, Nature's Call (treants), Wrath of Nature | Sprout = ring of `wall` zones; treants are summons. |
| Beastmaster* | Wild Axes, Call of the Wild (hawk+boar), Inner Beast (aura), Primal Roar | Roar = single-target stun + push-aside. |
| Broodmother* | Insatiable Hunger, Spin Web (zone), Spawn Spiderlings, Silken Bola | Spiderlings are summons that multiply on kills (capped). |
| Warlock* | Fatal Bonds (shared damage), Shadow Word, Upheaval (growing slow), Chaotic Offering | Offering = summon a golem + AoE stun. |
| Visage* | Grave Chill, Soul Assumption (charge nuke), Gravekeeper Cloak, Summon Familiars | Familiars are summons with a stone-form stun. |
| Magnus | Shockwave, Empower (cleave buff), Skewer (drag), Reverse Polarity | RP = AoE pull-to-center + long stun (signature wombo). |
| Elder Titan* | Echo Stomp (sleep), Astral Spirit (summon), Natural Order (aura), Earth Splitter | Astral Spirit = a detachable summon that returns with bonuses. |
| Tiny | Avalanche, Toss (throw a unit), Tree Grab, Grow | Toss = pick the nearest unit and hurl it to a point (displace). |
| Treant Protector | Nature's Grasp, Leech Seed, Living Armor (global block), Overgrowth | Overgrowth = AoE `root`; Living Armor = ally block charges. |
| Centaur Warrunner | Hoof Stomp (stun), Double Edge, Retaliate (return), Stampede | Stampede = team speed + trample-stun on contact. |
| Storm Spirit | Static Remnant, Electric Vortex (pull), Overload (on-cast proc), Ball Lightning | Ball Lightning = mana-cost-per-distance blink (the signature mobility). |
| Ember Spirit | Searing Chains (root), Sleight of Fist (dash multi-hit), Flame Guard (shield), Fire Remnant | Remnants are placed, then dashed to (summon + blink-to). |
| Spectre | Spectral Dagger (trail), Desolate, Dispersion (reflect), Haunt | Haunt = global illusions onto every enemy hero (summon cap). |
| Faceless Void | Time Walk, Time Dilation, Time Lock (bash), Chronosphere | `chronosphere` exotic already registered (zone-freeze he must enter). |
| Terrorblade* | Reflection, Conjure Image, Metamorphosis, Sunder | Sunder = HP swap with a target/self; images via summon cap. |
| Phoenix | Icarus Dive, Fire Spirits, Sun Ray (channel beam), Supernova | Supernova = self becomes an egg/sun that must be destroyed (HP-object summon). |
| Io | Tether (link), Spirits (orbiting damage), Overcharge, Relocate | Tether links to an ally sharing regen/buffs; Relocate = team teleport + return. |

Note: most "summon" entries reuse the existing summon primitive with a hard cap
(the §4.5 illusion/pet rule), so they cost no new exotics. The five exotic-bearing
heroes here (Medusa, Wraith King, Invoker, Tinker, Faceless Void) reference exotics
that are already implemented.

---

## 5. Exotic budget

Cap is 25 (`data-lint`), ~10 used today. New exotics this plan introduces:

| Exotic id | For | Why it needs scripting |
|-----------|-----|------------------------|
| `spell-steal` | Rubick | Copy the last-seen enemy ability into a slot. |
| `divided-we-stand` | Meepo | Spawn/track AI clones tied to the main unit. |
| `tempest-double` | Arc Warden | Spawn one self-copy with current abilities. |
| `morph-shift` | Morphling | Discrete STR/AGI point shifting + replicate. |
| `primal-split` | Brewmaster | Hide self, field 3 typed brewlings, recombine. |
| `remote-mines` | Techies | Pre-planted, proximity-armed mines. |

That is **6 new exotics**, landing total usage around **16/25**, comfortably
under the cap. Everything else in §4 (illusions, pets, channels, zones, charges,
links, stat shifts) composes from existing primitives with **no** exotic.

Each new id is registered in `registerAllContent()` (`src/data/index.ts`) alongside
the current list. The bounded hook implementations live in `/src/core/exotics.ts`;
`appearance`/`attackVisual` remain renderer data and are not read by core.

---

## 6. Missing items (~40)

All of these compose from the existing item engine (passives, auras, actives,
recipes, charges, attack mods, appearance/attackVisual). The hard rule from the
data-lint is **recipe math must balance**, so each assembled item lists its
components and a recipe cost that sums to the total. Many need a few new
*component* items first (marked "needs component").

Author them in the existing `src/data/items/index.ts` arrays (or split into
`src/data/items/extended.ts` if the file gets unwieldy). Slot the spec-named ones
(Lotus Orb, Pipe) first since they are called out explicitly.

### 6.1 New components needed first

`ring-of-protection`, `ring-of-health`, `gem-of-true-sight`, `helm-of-iron-will`,
`oblivion-staff`, `talisman-of-evasion`, `javelin`, `blitz-knuckles`,
`mystic-staff` (have), `perseverance` (assembled from ring-of-health + void-stone),
`titan-sliver` recipe parts. These unlock the assembled items below.

### 6.2 Boots upgrades

| Item | Identity | Notes |
|------|----------|-------|
| Power Treads | attribute-toggle attack speed boots | Toggle swaps which attribute it boosts. |
| Phase Boots | damage + phase-move active | Active = brief unobstructed move + ms. |
| Tranquil Boots | regen + ms, breaks on damage | `hpRegen` + `damageLockout`-style break. |
| Boots of Travel | huge ms + teleport | Active = long-range self blink to a friendly point. |
| Guardian Greaves | Mek + Pipe upgrade, dispel | Aura heal + dispel active. needs Mek/Pipe. |

### 6.3 Survivability / defensive

| Item | Components | Identity |
|------|-----------|----------|
| Vanguard | ring-of-health + vitality-booster + recipe | Damage block chance. |
| Hood of Defiance | ring-of-regen + cloak ×2 + recipe | Magic resist + barrier. |
| Pipe of Insight | Hood + Headdress + recipe | Team magic barrier active (spec-named). |
| Crimson Guard | Vanguard + Buckler + recipe | Team block active. |
| Shiva's Guard | platemail + mystic-staff + recipe | Armor + slow aura + Arctic Blast nova. |
| Lotus Orb | platemail + mystic-staff + recipe | **Reflects targeted spells** (spec-named). |
| Linken's Sphere | perseverance + ultimate-orb + recipe | Blocks the next targeted spell (cooldown). |
| Aeon Disk | vitality-booster + platemail + recipe | Auto-saves at low HP. |
| Eternal Shroud | Hood + vitality-booster + recipe | Magic resist + spell lifesteal. |
| Black King Bar | already present | — |

### 6.4 Carry / damage

| Item | Components | Identity |
|------|-----------|----------|
| Power Treads | (see boots) | — |
| Manta Style | yasha + ultimate-orb + recipe | Active spawns capped illusions (summon path) + dispel. |
| Sange and Yasha | sange + yasha + recipe | Combined stats + ms. |
| Kaya and Sange / Yasha and Kaya | kaya + sange / yasha + recipe | The two other SnY-family combines. |
| Desolator | demon-edge + blitz-knuckles + recipe | Armor-shred on hit (`procStatus` -armor); red impact `attackVisual`. |
| Daedalus | crystalys + demon-edge + recipe | Big crit; crit-lunge `attackVisual`. |
| Monkey King Bar | javelin ×2 + demon-edge + recipe | True-strike + bash proc. |
| Skull Basher -> Abyssal Blade | javelin + belt + recipe -> + reaver + vitality | Bash proc -> active hard stun. |
| Mjollnir | maelstrom + hyperstone + recipe | Bigger chain lightning + static shield; Electro on-hit. |
| Satanic | sange + morbid-mask + reaver + recipe | Lifesteal + unholy rage active. |
| Silver Edge | shadow-amulet + ... + recipe | Invis + break on hit. |
| Echo Sabre | oblivion-staff + ogre-axe + recipe | Double-attack proc. |
| Bloodthorn | orchid + crystalys + recipe | Silence + crit + true strike. needs Orchid. |
| Orchid Malevolence | oblivion-staff ×2 + recipe | Soul Burn silence active. |
| Nullifier | sacred-relic + ... + recipe | Mute/purge active. |
| Radiance | sacred-relic + recipe | Burn aura DoT + miss; Pyro on-hit, burn `attackVisual`. |
| Butterfly | already present | — |

### 6.5 Support / utility

| Item | Components | Identity |
|------|-----------|----------|
| Medallion of Courage | chainmail + sages-mask + recipe | Armor-shred active. |
| Solar Crest | Medallion + ... + recipe | Armor shred/buff + evasion. |
| Urn of Shadows -> Spirit Vessel | sages-mask + ... | Heal/damage charges; Vessel = % HP burn. |
| Holy Locket | Headdress + ... + recipe | Amplifies heals; charge burst. |
| Headdress / Buckler / Ring of Basilius | sages-mask/ring-of-regen + recipe | Cheap aura components for Mek/Pipe/Crimson. |
| Helm of the Dominator -> Overlord | helm-of-iron-will + morbid-mask + recipe | Dominate a creep (ties into capture). |
| Veil of Discord | robe ×2 + ... + recipe | Magic-amp debuff zone. |
| Rod of Atos -> Gleipnir | staff + recipe -> + maelstrom | Root active -> AoE root + chain. |
| Dagon | null-talisman + ... + recipe | Single-target nuke, level-upgradable. |
| Ethereal Blade | eaglesong + ghost-scepter + recipe | Ghost + magic burst. needs Ghost Scepter. |
| Ghost Scepter | (basic) | Self ethereal (no physical in/out). |
| Wind Waker | Euls + Force Staff + recipe | Self cyclone + steerable. |
| Hand of Midas | gloves-of-haste + recipe | Transmute a creep for gold/xp. |
| Octarine Core | mystic-staff + vitality + recipe | Cooldown reduction + spell lifesteal. |
| Aether Lens | energy-booster + ... + recipe | Cast range + cooldown. |
| Meteor Hammer | staff + ... + recipe | Channeled AoE stun/DoT. |
| Heaven's Halberd | sange + talisman-of-evasion + recipe | Disarm active + evasion. |
| Aghanim's Blessing / Shard | gated | Permanent Aghs effect; Shard = small upgrade (spec-named "Aghanim's Shard"). |
| Moon Shard | hyperstone ×2 + recipe | Big attack speed; consumable variant. |
| Bloodstone | (assembled) | Spell lifesteal + charges (Bloodstone identity). |
| Soul Ring | ring-of-regen + ... | HP-for-mana active. |

### 6.6 Item authoring rules

- **Keep the decision recognizable** (`SPEC.md` §5 item-feel rule): a Dota player
  should know what it does, when to buy it, and when to press it.
- Reuse existing `attackVisual`/`appearance` hooks for the visible ones
  (Desolator red impact, Radiance burn, Mjollnir lightning, Manta illusions).
- Gated top-tier additions (Radiance, Satanic, Abyssal, Bloodthorn, Octarine,
  Aghanim's Blessing) must stay out of normal `shopInventory` and come from
  bosses/raids/quests, per the lint test for `GATED_TOP_TIER`.
- Wire new components into town/secret-shop inventories so the recipes are
  buildable in-game.

---

## 7. Presentation: assets, animations, abilities, sound, VFX, icons

This is the part that is easy to forget: a hero/item is not "done" when its
numbers exist. It needs to animate, sound, glow, and read on the model. The good
news is the presentation layer is **data-driven off closed vocabularies**, so most
of it comes for free and is already gated by tests. The work is deciding, per
signature ability/item, whether the default is good enough or deserves a
hand-authored tag — and, rarely, whether to extend a vocabulary.

### 7.1 The closed vocabularies (what's free vs. what costs engine work)

Everything below lives in `src/core/types.ts` and is enforced by `data-lint`
(tests 19–21). Picking from these lists is **free** (pure data). Adding a new
entry costs a small engine change in the listed file **plus** adding it to the
lint arrays and a quick coverage test.

| Vocabulary | Entries today | Source of truth | Renderer/synth |
|------------|---------------|-----------------|----------------|
| `AnimGesture` | 9: melee-swing, ranged-shot, staff-cast, ground-slam, dash, channel-loop, summon-gesture, item-use, global-cast | `types.ts` | `engine/animator.ts` |
| `SoundArchetype` | 11: blade, bow, impact, frost, fire, storm, void, heal, summon, item, roar | `types.ts` | `engine/audio.ts` |
| `VfxArchetype` | 12: projectile, ground-aoe, chain, beam, summon-pop, shield, stun-stars, channel, global-mark, hook, wall, storm | `types.ts` | `engine/vfx.ts` |
| `SilhouetteSpec` | build ×7, bodyShape ×3, head ×6, weapon ×7, extras ×8 | `types.ts` | `engine/models.ts` |
| `AttackVisualKind` | 5: cleave-sweep, ranged-conversion, lightning-bounce, tinted-impact, crit-lunge | `types.ts` | `engine/animator.ts`/`vfx.ts` |
| `ItemAppearancePart` / `ItemWeaponVisualKind` | parts ×8, weapon kinds incl. broad-cleaver/glowing-blade/long-pole/storm-haft | `types.ts` | `engine/models.ts` |

**Auto-resolution means zero-code by default.** `core/gestures.ts`
(`gestureForAbility` / `soundForAbility`) infers a valid gesture and sound from an
ability's targeting + effects + vfx archetype when `anim`/`sound` are omitted. So
a brand-new hero authored purely as data already animates and makes sound, and
`audio.ts` will synthesize a cast voice keyed off the `sound` archetype and
pitch-shifted by the hero's `animProfile.voiceTimbre`. Icons are generated
procedurally at startup (`engine/icons.ts`) from each ability/item's palette +
glyph, so **new abilities and items get HUD/shop icons for free**.

### 7.2 Per-hero presentation checklist

For every new hero (required fields are already lint-gated):

1. **`silhouette`** — `build`/`bodyShape`/`head`/`weapon`/`extras` from the lists.
   Choose parts that read as the hero (Mars = helm + spear-as-`totem` or `sword`,
   Dawnbreaker = helm + hammer-as-`totem`, Necrophos = robed + skull + staff).
2. **`palette`** — the 3-color Dota identity (required).
3. **`animProfile`** — `rig` (brute/fighter/caster), `castStyle` (weapon/spell),
   `voiceTimbre` (low/sharp/bright). Drives animation weight **and** voice pitch.
4. **`barks`** — >= 6 original in-character lines (required; fire on cast/kill).
5. **Per ability**: a `vfx.archetype` + color (required). Let `anim`/`sound`
   auto-resolve unless the ability is signature — then hand-author the tag the way
   the 9 "feel" heroes and the Phase 2 factory do (e.g. a channel ult should read
   as `channel-loop` + `void`; a leap should read as `dash`).
6. **Likeness profile (optional, for the iconic ones)** — add a
   `HERO_LIKENESS_PROFILE` entry in `engine/models.ts` (`readsAs` + >= 4 features)
   so the procedural model builder gives it recognizable details instead of the
   generic body. Only 21 heroes have these today; prioritize crowd-pleasers among
   the new roster (Anti-Mage, Queen of Pain, Mars, Monkey King, Rubick, Techies).
7. **glTF model (optional, Phase 5)** — the async pipeline + procedural fallback
   are wired (`engine/assets.ts`), but `ENABLED_HERO_MODELS` is intentionally empty
   so nothing 404s. Only flip a hero on when an original/CC0 GLB actually ships.
   Not required for this plan.

### 7.3 Per-item presentation checklist

1. **`glyph`** — picks the procedural icon shape (required-ish; free icon).
2. **Active items**: the `active` block lints like an ability, so it needs a
   `vfx.archetype` + color and gets `anim`/`sound` (auto or hand-authored). Item
   actives default `anim` to `dash` for self-displacers, else `item-use`.
3. **Visible items**: add an `appearance` block (weapon swap / part / tint /
   attached aura) and/or an `attackVisual` override, reusing existing kinds:
   - Desolator -> `tinted-impact` (red) + armor-shred read.
   - Radiance -> attached burn aura + `tinted-impact`; `elementOnHit: 'pyro'`.
   - Mjollnir -> `storm-haft` weapon + `lightning-bounce`; `elementOnHit: 'electro'`.
   - Manta -> illusion summon-pop on cast.
   - Daedalus/Bloodthorn -> `crit-lunge`.
   These satisfy the Phase 4 coverage lint (>= 6 items with appearance, >= 6 with
   attackVisual) and keep the boundary green (core never reads these fields).

### 7.4 When to extend a vocabulary (and the cost)

Default to **mapping onto the closest existing archetype** — the 12 VFX archetypes
are color/shape parameterized and cover most signature spells (Black Hole and Void
Spirit's rifts -> `storm`/`global-mark`; Techies mines -> `ground-aoe` telegraph;
Mars Arena -> `wall`). Add a new vocabulary entry only when a signature truly has
no good fit and the payoff is worth it. Candidate additions, each optional:

- `VfxArchetype: 'vortex'` (Black Hole / Rolling Thunder / Void Spirit) and/or
  `'mine'` (Techies) — add to `types.ts`, render in `engine/vfx.ts`, add to the
  `VFX_ARCHETYPES` lint array + a coverage assertion.
- New `SilhouetteSpec` parts if a hero can't be built from current ones (e.g. a
  `weapon: 'gun'` distinct from `rifle`, or a `mount` extra for Spirit Breaker /
  centaur-likes) — add to the type, the model builder, and the lint arrays.
- New `AttackVisualKind` (e.g. `'armor-shred-flash'` for Desolator/Nullifier) —
  only if `tinted-impact` reads poorly.

**Cost of any extension**: one enum entry + one renderer/synth branch + one lint
array entry + one coverage test. Keep additions few; the whole point of the closed
vocabularies is that 99% of new content is pure data.

### 7.5 Sound specifics

`engine/audio.ts` synthesizes per ability `sound` archetype, with the owner's
`voiceTimbre` shifting pitch so a kit "sounds like its caster". New heroes inherit
this automatically. Stingers (capture/levelup/merge/badge/raid-clear) are a fixed
set and need no per-hero work. If a signature ability wants a distinct timbre,
either reuse a better-fitting archetype (e.g. `fire` for Pyro spells, `frost` for
Cryo, `roar` for big STR ults) or add a `SoundArchetype` entry as in §7.4. The
mute path and voice-pool cap (tests 20–21) must keep passing — new content cannot
add raw audio imports (the no-asset guard, test 21).

---

## 8. Delivery plan

Delivered in batches, each intended to ship green (`npm test` + `npm run build`).
The implemented order was:

1. **Components + boots + defensive items** (§6.1–6.3). No new heroes; unblocks
   most recipes. Update shop inventories. Gate check: recipe math + shop lint.
2. **Carry/support items** (§6.4–6.5), including the spec-named Lotus Orb and Pipe.
   Reuse attack visuals. Gate check: item lint + kit smoke on actives.
3. **Standard missing heroes, STR + AGI** (§4.1–4.2 minus complex). Add to
   `HERO_REGION`, region spawns, batch files. Author each hero's presentation per
   §7.2 (silhouette, palette, animProfile, barks, per-ability vfx; hand-author
   anim/sound on signature abilities). Gate check: data-lint + anim/audio coverage
   (tests 19–21) + kit smoke.
4. **Standard missing heroes, INT + UNI** (§4.3–4.4 minus complex). Same data +
   presentation work, same gates.
5. **Complex heroes + 6 new exotics** (§4.5, §5). Implement exotic hooks in core,
   add unit tests mirroring `hero-kits.test.ts` (e.g. "Tempest Double spawns one
   AI copy", "Spell Steal copies the last enemy cast", "Meepo clones follow and
   Poof"). Gate check: exotic budget <= 25, kit smoke, new feel tests.
6. **Placement + integration**: echo spawns for farmability, a few new entries in
   gym teams / draft pools / boss loot so the new roster shows up in macro and the
   Diablo loop. Update `PROGRESS.md` and `DECISIONS.md`.
7. **Presentation polish pass (optional, last)**: likeness profiles (§7.2 step 6)
   for the most iconic new heroes, `appearance`/`attackVisual` on the visible new
   items (§7.3), and any vocabulary extensions decided in §7.4. Keep the no-asset
   guard and boundary check green.

Each batch: every new ability/item active gets a valid `vfx`/`anim`/`sound` (auto
or hand-authored — never skip, it's lint-gated), add a couple of `hero-kits`-style
feel tests for the bespoke pieces, then run the full suite (`npm run typecheck`,
`npm test`, `npm run build`).

### Re-authoring the 45 templated Phase 3 heroes (§4.6)

A first-class part of this effort, scheduled after the missing roster so we are not
touching two large hero efforts at once. Re-author in **region batches** (they
already live in regions), replacing the `phase3.ts` factory output with real
ability arrays. The exotics they need are already registered, so no budget cost.
Suggested order, most-iconic regions first:

8. **Quoidge / Scholar's City** — Invoker (reduced spell set), Silencer, Outworld
   Destroyer, Skywrath Mage, Tinker. The highest-payoff batch (Invoker + Rearm).
9. **Mad Moon Crater + Mount Joerlak** — Faceless Void (real Chronosphere zone),
   Spectre, Terrorblade, Phoenix, Io; Magnus (Reverse Polarity), Storm/Ember Spirit,
   Tiny, Elder Titan, Centaur, Treant. The wombo/signature-ult heroes.
10. **Shadeshore + Vile Reaches** — Kunkka, Tidehunter, Slardar, Naga Siren, Slark;
    Lifestealer, Undying, Doom, Wraith King, Night Stalker.
11. **Hidden Wood (summoners) + remaining** — Enchantress, Chen, Nature's Prophet,
    Beastmaster, Broodmother, Warlock, Visage (the summoner fantasy the spec
    prioritizes); plus Legion Commander, Vengeful Spirit, Shadow Fiend, Riki,
    Bounty Hunter, Lion, Winter Wyvern, Sand King, Nyx, Medusa, Viper.

Per re-authored hero: keep the existing id/region/palette/silhouette/barks/
recruitment, swap in the real 4-ability array, re-check `anim`/`sound` per ability
(§7), and add a `hero-kits`-style feel test for the signature mechanic (e.g.
"Chronosphere freezes units in a zone Void must enter", "Ball Lightning costs mana
per distance", "Reverse Polarity pulls to center then stuns"). The phase3 factory
remains as a fallback path, but every current Phase 3 seed now has an authored kit.

---

## 9. Risks and notes

- **Kit-smoke breadth.** Every ability runs at levels 1/15/30 headless. Bespoke
  effects (links, stored-state buffs like Weaver's Time Lapse, charge-channels)
  must handle all three levels and the "no valid target" case without throwing.
  Write the value arrays to cover max level.
- **Exotic implementations are real code, not data.** The 6 new exotics need core
  logic and the most careful testing. Keep them minimal and AI-driven to limit
  surface area, and never let them read renderer-only fields.
- **AI-controlled extra units** (Meepo clones, Tempest Double, brewlings, pets)
  ride the existing gambit/creep controllers. Verify they do not break the
  headless 5v5 determinism tests or the perf budget (30 active units / 200
  projectiles).
- **Recruitment/trial scale.** Adding ~57 `HERO_REGION` entries auto-creates 57
  quests + trials. That is fine for the templated kinds; only add `SPECIAL_TRIALS`
  where a bespoke trial genuinely improves the hero's intro.
- **Region crowding.** Spreading ~57 heroes across 10 regions means denser echo
  fields. Keep spawn positions within `region.size` bounds (lint checks this) and
  avoid overlapping the existing roster's spots.
- **Balance is explicitly deferrable.** Per `SPEC.md` §0/§6, numbers can be tuned
  later via `tuning.ts`. Prioritize mechanical identity over perfect balance in the
  first pass.
- **Presentation is lint-gated, not optional.** Every ability/item active must
  carry a valid `vfx`/`anim`/`sound` (tests 19–21) or the suite goes red. The
  defaults auto-resolve, so the failure mode is forgetting a `vfx.archetype` or
  using an off-list value, not missing assets. Likeness profiles and glTF models
  are the genuinely optional layer — skipping them just means a generic procedural
  model, never a broken build.
- **Resist vocabulary creep.** Each new VFX/sound/silhouette/attack-visual entry
  is engine code + a lint array + a test, and dilutes the "content is pure data"
  property. Map onto existing archetypes first; add an entry only for a signature
  with no acceptable fit (§7.4).
- **Count target.** This lands the roster near the full ~126 Dota heroes and the
  item catalog near ~120 entries. The exact final count can flex; the bar is "every
  recognizable Dota hero and item is present and plays like itself."
