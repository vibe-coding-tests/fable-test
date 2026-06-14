# SWAP COMBAT OVERHAUL — the tag-in is the Genshin verb

How the 1–5 hero swap stops being a "switch which hero I'm holding" and becomes the combat verb the overworld is *built around* — the apply-then-detonate, burst-then-bench, peel-on-arrival rhythm that is Genshin's actual identity and is not in Dota at all. Companion to `SPEC.md` (§6 Micro Combat, §9/§5 Resonance), `GAMEPLAY_OVERHAUL.md` (the Genshin/overworld side, P6 reaction-driven swap), `COMBAT_OVERHAUL.md` (the live-control side: Captain's Call, live raids), `DECISIONS.md`, and `PROGRESS.md`.

Same footing as the rest of the project. **The headless deterministic core (`src/core/`) stays untouched in spirit** — it never imports `three`, never touches the DOM, stays deterministic for a seed. The tag-in machinery already lives mostly in `src/systems/Game` (the overworld orchestrator owns the swap), and everything proposed here is built the way Resonance and the gambit grammar were: a **generic, data-driven extension of the existing status / heal / purge / zone / aura vocabulary (`SPEC.md §2`), spending zero exotic slots**, and respecting **the layer split** — tag-in depth lives in the **micro overworld and raids**; gyms and the Elite Five stay pure-Dota macro. No proposal here changes a combat result the core resolves; `boundary.test.ts` stays green.

---

## 0. WHERE WE ARE — the tag-in, measured honestly

The swap exists and it already has the bones of a tag-in system. Read the shipped code:

```5597:5615:src/systems/game.ts
    this.activeIdx = idx;
    const baseSwapCd = this.settings.resonance ? TUNING.resonanceSwapCooldownSec : TUNING.swapCooldownSec;
    const swapCdReduction = Math.min(0.8, Math.max(0, u.stats.swapCdReductionPct) / 100);
    this.swapReadyAt = this.sim.time + baseSwapCd * (1 - swapCdReduction);
    const tagHealPct = Math.max(0, u.stats.swapInHealPct);
    if (tagHealPct > 0) healUnit(this.sim, u, u.stats.maxHp * (tagHealPct / 100), u);
    const tagBurstPct = Math.max(0, u.stats.swapInDamagePct);
    if (tagBurstPct > 0) {
      u.addStatus({
        status: 'buff',
        tag: 'swap-in-burst',
        sourceUid: u.uid,
        sourceTeam: u.team,
        isDebuff: false,
        until: this.sim.time + 3,
        mods: { damagePct: tagBurstPct, spellAmpPct: tagBurstPct }
      }, true);
      this.sim.events.emit({ t: 'status-apply', uid: u.uid, status: 'buff', duration: 3 });
    }
```

So today there is exactly:

- **A swap cooldown.** `swapCooldownSec: 4` base, `resonanceSwapCooldownSec: 1.2` with Resonance on (`tuning.ts`), reducible by the `swapCdReductionPct` stat (capped 80%). Death-swap is free. The swapped-in hero's ability cooldowns are floored at 50% of remaining (`swapCdFloorPct: 0.5`) so you cannot ult-cycle by swapping.
- **Two tag-in bonuses, both stat-gated and both generic.** `swapInHealPct` heals a flat % of max HP on arrival; `swapInDamagePct` grants a 3s self `damagePct + spellAmpPct` buff. Nobody has either stat by default — they only come from three items (`breacher-cloak`, `exchange-mark`, `quickstep-cord`) and the `resonance-catalyst` line.

Three honest findings.

**Finding 1 — the cooldown is doing two jobs and doing both badly.** A single 4-second timer governs *both* "I want to reposition / dodge by swapping" *and* "I want the tag-in payoff." Four seconds is far too long for the first job (Genshin's swap floor is **1 second**, hard-coded — confirmed against the wiki) so the overworld swap reads as a heavy commitment, not a combat verb. And because the *bonus* is welded to that same timer, there is no sense in which the payoff is a resource you *time*. You either have the items or you don't; if you do, every swap off cooldown is identical. Genshin's whole rotation game is that each character's contribution is gated by **its own** cooldown, and you weave swaps to keep everything up (the 15s/18s/21s rotation windows the theorycraft is built on). We have one global timer and no per-hero gauge.

**Finding 2 — the bonus vocabulary is two verbs wide, and it is power-blind.** Heal and self-damage. That is it. There is no team buff, no defensive arrival, no cleanse-on-tag, no element detonation, nothing that fires when you swap *out*. And critically: the two bonuses we have are **selfish** and scale off raw stats, which is exactly backwards from what makes a swap roster fun. In Genshin the supports are the swap stars — Bennett's burst leaves a team ATK field, Kazuha swaps out and his swirl keeps shredding, Furina buffs on the way in. The off-field/on-swap payoff is *why you bring a support over a fourth carry*. Our DPS-favoring stat scaling means a carry gets the bigger tag-in burst, so the swap rewards the heroes that least need help.

**Finding 3 — off-field persistence is promised but the overworld swap tears it down.** `SPEC.md §5` says Resonance honors off-field persistence — "a swapped-out hero's zones, summons, and wards keep ticking (already supported; just don't tear them down on swap)." But the overworld swap removes the unit outright:

```5582:5591:src/systems/game.ts
    if (cur.unit) {
      this.serializeHero(cur);
      cur.lastCombatAt = Math.max(
        cur.unit.lastDealtDamageAt,
        cur.unit.lastEnemyDamageAt,
        cur.lastCombatAt
      );
      this.sim.removeUnit(cur.unit.uid);
      cur.unit = null;
    }
```

`removeUnit` deletes the hero, which takes their summons, zones, and channels with them. So the single most Genshin thing about swap combat — apply Hydro with A, swap to Cryo B, and A's water field is *still there* to Freeze against — does not actually happen on the overworld path. The raid path keeps everyone fielded (`SPEC.md §4`), so it gets this for free; the overworld, where the Genshin fantasy lives, does not.

**The root cause, in one line.** The tag-in was built as two stat-driven side effects on a repositioning swap, not as a designed system with a power budget, a per-hero identity, and a swap-out half. This doc makes it one.

---

## 0.5 STATUS — what has shipped (S0–S5 done; S6 channel-DPS + swap-grace done)

This doc started as a design proposal; most of it is now code. Read this section as the honest ledger so the rest of the doc reads as the *full vision*, not a wishlist.

**Shipped and green (`gameplay-overhaul.test.ts`, `data-lint.test.ts`, `boundary.test.ts`):**

- **S0 — the seam.** `TagBoonDef` + `TagArchetype` + `HeroDef.tagBoon` (`core/types.ts`); the new stat fields `tagBoonAmpPct` / `tagGaugeReductionPct` / `tagChainWindowBonusSec`. `fireTagBoon` resolves a boon's `EffectNode`s through the same `execEffects` resolver abilities use (`systems/game.ts`). The legacy heal/burst is re-expressed as effects (`data/tag-boons.ts` `LEGACY_SWAP_EFFECTS`).
- **S1 — the cooldown split.** `swapFloorSec: 1.5` / `resonanceSwapFloorSec: 1.0` replace the old 4s timer; per-hero `tagGaugeReadyAt` on the roster entry re-arms in real time on the bench; the boon fires only on a ready gauge. Gauge ring per portrait (`ui/hud.ts`).
- **S2 — effects + budget.** The archetype set is authored and resolves as ordinary effects; `tagBoonPowerScore` / `tagBudgetTier` + the budget data-lint enforce the inverse-power law; a two-support rotation out-tempos a three-carry line in a fixed-seed harness.
- **S3 — combos.** Tag Chain bookkeeping (`tagChainWindowSec` / `tagChainAmpPerStepPct` / `tagChainMaxSteps`) with the escalating amp; off-field bench-instead-of-remove under Resonance (`markOffField` / `reapOffFieldUnits`, `resonanceOffFieldPersistenceSec`); Imprint tag-out legacies.
- **S4 — items + readability.** The new tag items (`relay-standard`, `heralds-token`, `vanguard-sigil`, `echo-conduit`, `chainweaver-band`); reaction-preview on the swap prompt; the chain counter and off-field markers in the combat readout. The AI gambit reads `tag-in-ready` and `combo-setup-active` (`core/controllers.ts`) also landed.
- **S5 — the full §6 table + first-class Soak.** All ~122 heroes resolve a hand-authored signature tag from `AUTHORED` in `data/tag-boons.ts` (no hero left on the role-template path; `generatedBoon` is now only a safety net). **Soak** is a real archetype: `field()` lays a lingering enemy `zone` whose damage tick re-applies the hero's element (Kunkka's wet torrent, Razor's static field, Batrider's napalm, …), and `offField()` gives drop/imprint heroes a tag-out legacy field. Every authored boon stays inside the §4 budget bands — the inverse-power law and the budget data-lint stay green.
- **S6 (partial) — §8 depth.** Off-field *channel* DPS (§8.2): a channel flagged `channel.offField: true` survives swap-out and keeps ticking while its caster is benched (`channelPersistsOffField` / `markOffField`); shipped on Drow's Multishot and Witch Doctor's Death Ward. The swap-cancel grace window (§8.3): a swap pressed during the active hero's cast point is queued (`pendingSwapIdx` / `flushPendingSwap`, `swapCancelGraceSec`) and fires once the cast resolves, so the input never eats a cast.

**The element engine already works.** Zones carry the boon's element through the stored effect context, and zone ticks reuse it (`sim.ts`), so a zone with a damage tick re-applies the element every tick. Off-field zones keep ticking because the benched unit stays alive. Reactions fire through `applyElementAura` (`core/combat.ts`). So apply→swap→detonate is real today.

**The honest gaps (what the *full vision* still wants):**

1. ~~Per-hero signature tags are not yet individually authored.~~ **Closed in S5** — all ~122 heroes have a hand-authored signature tag.
2. ~~Soak is not a first-class archetype.~~ **Closed in S5** — `field()` / `offField()` lay real lingering element zones.
3. **The last of §8 depth.** Off-field *channel* DPS (§8.2) and the swap-cancel grace window (§8.3) **shipped in S6**. The remaining proposal is the **charge-meter alternative (§2.3)** — deliberately left in the back pocket per §2.3 (the design recommends against it as the default); building it would add a persisted-setting + save-migration surface for an opt-in the design leans away from. Also still a follow-on: real `summon` bodies for off-field summoners (S5 used lingering zones), pending exported summon specs.

---

## 1. THE DESIGN GOALS — settled

1. **The swap is a fluent combat verb.** Reposition-swapping is cheap and fast (a short floor, near Genshin's 1s), so you swap to dodge, to peel, to re-angle, freely.
2. **The tag-in *payoff* is a timed resource.** Each hero's arrival bonus — its **Tag-In Boon** — sits on its own cooldown (the **Tag Gauge**), so weaving the team to keep boons up is the skill, exactly like a Genshin rotation. Swapping with the gauge down still swaps; it just doesn't pay the boon.
3. **The tag-in fires a real effect, not just a buff.** A boon is a list of `EffectNode`s resolved by the *same* engine abilities use (§3), so a tag-in can cast a nuke, a stun, a knockback, a summon drop, a heal field, an element soak — anything. This is the one place we are **not bound by Dota's "swap = pick a hero" rule**; the swap is a cast button with a hero attached.
4. **Every hero has a signature, support-flavored tag-in built for combos.** Even the hardest carry leaves *something* the next hero can cash in on (a slow, a mark, a soak, a gather). The roster becomes a set of setup→payoff pairs, and **combos are the point** (§3.5) — the fun is in the chain, not the single press.
5. **Power runs inverse to raw strength.** A hard carry's tag-in is small and mostly selfish; a support's is large, team-wide, and combo-defining. The tag-in is where supports earn their slot — the answer to "why not a fourth carry."
6. **Off-field persistence is honored on the overworld path**, gated by Resonance, so the apply-then-detonate combo actually works where the player explores.
7. **Everything degrades gracefully.** With Resonance off and no tag items, the swap behaves like today's base game. Gyms/Elite never see any of it.

---

## 2. THE COOLDOWN — decouple the swap from the boon

This is the keystone change and it is small. Today one timer (`swapReadyAt`) gates everything. Split it in two.

### 2.1 The swap floor (fast)

A short anti-spam floor on the swap *action itself*, so you can't machine-gun-swap to cheese animation timing, but swapping to reposition is fluid:

```ts
// tuning.ts — proposed
swapFloorSec: 1.5,            // base; was swapCooldownSec: 4
resonanceSwapFloorSec: 1.0,  // matches Genshin's hard 1s; was 1.2
```

`swapCdReductionPct` still applies to the floor (so quickstep builds feel snappy), but the floor is already so short that reduction mostly matters for the *gauge* below. The 50% ability-cooldown floor on the swapped-in hero (`swapCdFloorPct`) is **unchanged** — it is the anti-ult-cycle rule and is orthogonal to this split.

### 2.2 The Tag Gauge (the resource)

Each hero carries a per-hero **Tag Gauge cooldown**: the boon fires on tag-in only if that hero's gauge is ready, then the gauge goes on cooldown. The gauge runs whether the hero is on field or benched (it is real time, like a Genshin ability), so a hero you swapped away from is re-arming while you play the others.

```ts
// RosterEntry addition (systems-side; the core never reads it)
tagGaugeReadyAt: number;   // game time the Tag-In Boon is next available
```

Base gauge cooldown is role-scaled (the power budget, §4): a hypercarry's small selfish boon is cheap (~6s), a support's big team boon is expensive (~12s). `swapCdReductionPct` shaves the gauge, so a dedicated swap build (Quickstep Cord → Breacher Cloak / Exchange Mark) turns the tag-in into a near-constant tool — that is the build identity.

**Why this is the fun fix.** It turns the roster into a rotation. You open with the support's Warcry (team ATK up), swap to the carry inside the window, swap to the second support to refresh, come back. Keeping four gauges staggered and the buffs overlapping is the exact "uptime vs downtime" loop the Genshin community theorycrafts (KQM team-building; the 18–20s rotation window). And it is legible: the HUD already shows the party slots; it gains a small gauge ring per portrait (§9).

### 2.3 The charge alternative (logged, not chosen)

Considered: replace the floor with a **2-charge** swap meter (swap twice fast, then wait for a charge to refill). It feels great for burst rotations and is very Genshin-adjacent. Rejected as the default because it complicates the dodge-swap (you don't want to be out of charges when you need to peel) and the gauge model already delivers the "time your payoff" depth without rationing the *movement*. Keep it in the back pocket for a high-skill setting toggle. Decide at S1.

---

## 3. THE TAG-IN EFFECT — a cast, not just a buff

This is the section that changed, and it is the core of the spec. A **Tag-In Boon** is not a fixed buff type — it is **a small list of `EffectNode`s resolved at the moment of swap, by the exact effect resolver abilities already use.** The core already defines the whole vocabulary (`src/core/types.ts`):

```104:149:src/core/types.ts
export type EffectNode =
  | {
      kind: 'damage';
      dtype: DamageType;
      amount: ValueRef;
      target: TargetSel;
      radius?: ValueRef;          // for *-in-radius selectors
      perUnitBonus?: ValueRef;    // Echo Slam: extra per unit within radius
      attackDamagePct?: ValueRef; // % of caster attack damage added (Omnislash strikes)
      offsetRing?: { min: ValueRef; max: ValueRef }; // Freezing Field: center offset random in ring
    }
  | { kind: 'heal'; amount: ValueRef; target: TargetSel; radius?: ValueRef; pctMaxHp?: boolean; perCharge?: boolean }
  | {
      kind: 'mana';
      op: 'burn' | 'restore';
      amount: ValueRef;
      target: TargetSel;
      radius?: ValueRef;
      burnedAsDamagePct?: number; // mana burned also dealt as physical (Diffusal/Mana Break)
      perCharge?: boolean;        // scale by charges consumed (Magic Wand)
    }
  | {
      kind: 'status';
      status: StatusId;
      duration: ValueRef;
      target: TargetSel;
      radius?: ValueRef;
      params?: StatusParams;
    }
  | {
      kind: 'displace';
      mode: 'knockback' | 'pull' | 'forced' | 'blink';
      target: TargetSel;
      distance?: ValueRef;
      speed?: ValueRef;            // units/sec for non-blink
      toward?: 'caster' | 'point' | 'facing' | 'away-from-caster' | 'target-unit';
      radius?: ValueRef;
    }
  | { kind: 'zone'; zone: ZoneSpec; at: 'point' | 'self' | 'target' | 'line-to-point'; follow?: boolean }
  | { kind: 'summon'; summon: SummonSpec; count?: ValueRef; at: 'point' | 'self' }
  | { kind: 'statmod'; mods: Record<string, ValueRef>; duration: ValueRef; target: TargetSel; radius?: ValueRef }
  | { kind: 'projectile'; proj: ProjectileSpec; to: 'target' | 'point' }
  | { kind: 'repeat'; count: ValueRef; interval: number; effects: EffectNode[]; retarget?: TargetSel; radius?: ValueRef }
  | { kind: 'capture-channel' }          // Binding Totem (player innate)
  | { kind: 'purge'; target: TargetSel } // remove purgeable (buffs from enemies, debuffs from allies)
  | { kind: 'exotic'; id: string; params?: Record<string, unknown> };
```

**So a tag-in can do anything an ability can.** A `status` node is a stun, slow, root, silence, or mark. A `displace` is a knockback, a pull-to-center, or a blink. A `summon` drops a spider or a treant on arrival. A `zone` lays a fire patch or a slow field. A `damage` node is a nuke. A `heal`/`statmod` over `allies-in-radius` is the team buff. This is exactly the freedom the redesign asked for: **the tag-in is a cast button with a hero attached, and we are not bound by Dota's "swap just picks a hero."** Every hero gets a signature cast that exists to *set up or pay off* a combo.

### 3.1 The data shape (implementation)

A boon is data, keyed by hero id, living in `src/data/` like every other content table. The interpreter is generic, so adding or retuning a hero never touches code.

```ts
// src/core/types.ts — additive, deterministic, no DOM/three
export interface TagBoonDef {
  id: string;                       // 'lina-tag', etc.
  fire: 'tag-in' | 'tag-out' | 'both';
  effects: EffectNode[];            // resolved by the existing effect resolver
  outEffects?: EffectNode[];        // optional separate list for the 'tag-out' half
  gaugeSec: number;                 // Tag Gauge cooldown (§2.2), role-scaled (§4 budget)
  archetype: TagArchetype;          // for tooltip wording + AI hints + budget lint (below)
  element?: ActiveElement;          // for Soak tags; defaults to elementForHero
  tooltip: string;                  // the one-line copy (§3.4)
}

// HeroDef gains:  tagBoon?: TagBoonDef;
```

The `archetype` tag is **descriptive, not mechanical** — the effects are the truth. It exists so the tooltip generator, the AI combo hints (§3.5), and the budget data-lint (§4) can reason about a boon without parsing its effect list. The common archetypes:

| Archetype | Typical effects | Combo role | Whose identity |
|-----------|-----------------|------------|----------------|
| **Onslaught** | self `statmod` (damagePct/spellAmp) | payoff | carries, nukers — small |
| **Vanguard** | self `statmod` (DR) + shield | survive | bruisers, durable |
| **Bloodrush** | self `heal` + move/attack `statmod` | reposition | melee carries, escapes |
| **Warcry** | `statmod` over `allies-in-radius` | payoff amp | offense supports — big |
| **Mend** | `heal` over `allies-in-radius` (+ HoT zone) | sustain | healers — biggest |
| **Cleanse** | `purge` + `statmod` statusResist on allies | save | utility supports |
| **Lockdown** | `status` (stun/root/slow/hex) on enemies | **setup** | disablers |
| **Gather** | `displace` pull / knockback / vortex | **setup** | initiators |
| **Strike** | `damage` (often `attackDamagePct`/reaction) | payoff | nukers, finishers |
| **Soak** | element apply (`status` aura / `zone`) | **setup** (Resonance) | Hydro/Dendro/Anemo enablers |
| **Drop** | `summon` / `zone` left on field | off-field | summoners |
| **Imprint** | `outEffects` left behind on swap-**out** | off-field/legacy | supports, summoners |

The point of listing them is the **combo grammar** in §3.5: setup archetypes (Lockdown, Gather, Soak) create a state; payoff archetypes (Strike, Onslaught, Warcry) cash it in. Designing the roster is balancing those two halves.

### 3.2 The interpreter and integration point

One function, called from the swap path. It replaces today's inline heal/burst block (`src/systems/game.ts` 5601–5615):

```ts
// systems-side; resolves through the core's existing effect resolver
function fireTagBoon(game, u, when: 'tag-in' | 'tag-out') {
  const boon = REG.hero(rec.heroId).tagBoon;
  if (!boon || boon.fire !== when && boon.fire !== 'both') return;
  if (game.sim.time < rec.tagGaugeReadyAt) return;        // gauge not ready → no boon (§2.2)
  if (!game.recentlyInCombat(rec)) return;                // out of combat → no waste
  const list = when === 'tag-out' ? (boon.outEffects ?? boon.effects) : boon.effects;
  resolveEffects(game.sim, u, list, /* caster */ u, /* point */ u.pos); // the ability resolver
  const ampd = boon.gaugeSec * (1 - reductionFrom(u.stats));            // tagGaugeReductionPct
  rec.tagGaugeReadyAt = game.sim.time + ampd;
}
```

`resolveEffects` is the exact path `castAbility` already walks, so a tag-in stun, summon, or nuke resolves **identically** to the same effect on an ability — deterministic, headless, already tested. The only new core surface is the `TagBoonDef`/stat fields (§10 architecture). Tag-out fires from the swap-out branch *before* `removeUnit`/bench (§5 off-field). Magnitude scaling (`tagBoonAmpPct`, §7 items) multiplies the relevant `ValueRef`s at resolve time, same as spell amp already does.

### 3.3 Targeting — where does the cast land?

A tag-in has no manual aim by default (the swap is one key). The boon resolves at the **arriving hero's position/facing**, which is exactly where you swapped to, so positioning *is* the aim — you swap-in next to the cluster to land the gather, behind the carry to drop the shield. `TargetSel` already gives `enemies-in-radius`, `allies-in-radius`, `lowest-hp-ally-in-radius`, etc., so "stun nearby foes," "heal nearby allies," "pull foes to me" all express cleanly. A small set of boons may want a brief aim cursor (a skillshot tag-in); flag that per-boon with an optional `aim: true` and reuse the existing targeting UI — decide which heroes deserve it at S2.

### 3.4 The tooltip contract

Every boon reads as one line the player can parse mid-fight. Format: **`TAG-IN: <effect> · <gauge>s`** (or `TAG-OUT:`/`TAG:` when it has both). Examples spanning the new range:

- Lina — `TAG-IN: scorch nearby foes + self +18% spell dmg 3s · 6s` (Strike + Onslaught)
- Tidehunter — `TAG-IN: anchor-slam, slow nearby foes 40% 2s · 9s` (Lockdown)
- Magnus — `TAG-IN: pull nearby foes to you · 10s` (Gather)
- Crystal Maiden — `TAG-IN: heal allies 12% + 40/s 4s, frost nearby foes · 12s` (Mend + Soak)
- Warlock — `TAG-OUT: leave a Fatal Bond field 5s · 11s` (Imprint)

The HUD already surfaces stat rows (`describe.ts` maps `swapInDamagePct → "Swap-in damage"`); the boon line is one more derived readout next to the swap-CD row, plus the gauge ring per portrait (§9).

### 3.5 COMBOS — the point of the system

A single tag-in is a small play. **The chain is the game.** Because tag-ins resolve real effects, swapping in sequence composes: hero A's tag leaves a state (a slow, a soak, a gather, a mark, a field), and hero B's tag-in pays it off (a nuke, a stun-extension, a reaction, a burst). The skill is reading the board and ordering the swaps — Genshin's whole identity, ours by construction.

**The combo grammar (one sentence): a *setup* tag (Lockdown / Gather / Soak / Drop) creates a transient state; a *payoff* tag (Strike / Onslaught / Warcry / a reaction) consumes it inside the window.** Three engines drive combos, in increasing depth:

1. **Plain effect chaining (always on, no Resonance needed).** Magnus tags in → pulls the pack together; swap to Tidehunter → his tag-in slow-slams the clumped pack; swap to Lina → her tag-in scorch nukes them while clustered. No special rule — the effects just stack in space and time because you positioned and ordered them. This works in the base game.

2. **Elemental reactions (Resonance + off-field, §5).** The classic apply→detonate: tag a Soak hero (Hydro) to wet the pack, swap to a Strike hero (Pyro/Cryo) and the tag-in *Vaporizes/Freezes* against the lingering aura. Off-field persistence (§5) is what makes the *benched* soaker's field still be there to react to. This is pillar P6 of `GAMEPLAY_OVERHAUL`, finally driven by the swap itself.

3. **The Tag Chain window (the new amplifier).** Define a short **chain window** (~2.5s) after any tag-in. A tag-in that fires inside another hero's still-open window is a **chained tag**, and chained tags get a small, escalating bonus — e.g. the 2nd tag in a chain +15% effect, the 3rd +30%, decaying if you break the chain. This rewards *fast, deliberate* rotations over idle swapping and gives the combo a felt crescendo (and a number on screen). It is pure systems bookkeeping (a `chainCount` + `chainExpiresAt` on the orchestrator), it amplifies the `ValueRef`s at resolve time, and it is off by default outside Resonance if we want base-mode to stay flat. Decide the exact curve at S2.

**Worked combos (the shipping fantasy):**

| Combo | Sequence | Why it works |
|-------|----------|--------------|
| **Wombo gather** | Magnus (pull) → Sand King (Geo soak + dust) → Lina (scorch) | Gather clumps, soak primes, Strike nukes the clump — chain-amped |
| **Freeze burst** | Mirana (Hydro/Anemo soak) → Crystal Maiden (Cryo frost) → Gyrocopter (Strike) | Wet → Freeze (reaction) → free hits on a frozen pack |
| **Peel save** | (carry diving) → Omniknight (Mend + magic-resist) → Abaddon (Cleanse + shield) | Two support tags chain to hard-rescue a dived ally |
| **Vape blast** | Kunkka (Hydro torrent) → Lina (Pyro) | Vaporize on a 2-tag chain; the simplest "feels great" combo |
| **Imprint cash-in** | Warlock (TAG-OUT bond field) → Phantom Assassin (Onslaught) | Swap *away* from Warlock to leave the field, swap *to* the carry to burst inside it |
| **Stun extend** | Tidehunter (slow-slam) → Earthshaker (Geo stun) → Sven (Onslaught) | Lockdown → Lockdown stacks lockup, carry tags in to delete |

**AI and combos.** In a live raid the four you don't drive run gambits; the gauge + archetype tags let the AI participate in the chain. Add a `tag-in-ready` gambit condition and a `combo-setup-active` read (is a setup state up on the focus?), so an ally can announce "my gather is ready" or auto-pay-off a soak the team-mind sees — the same reactive read class as `enemy-cast-seen` in `AI_OVERHAUL.md`, pointed at the gauge and the chain state. The team-mind can also *suggest* the next swap in the chain on the HUD (§10).

---

## 4. THE POWER BUDGET — support-favored, by design

The rule the whole system turns on: **the weaker a hero/item is on the raw-power axis, the stronger its tag-in payoff.** A hypercarry already wins the game by farming and right-clicking; its tag-in is a garnish. A pure support contributes little personal damage; its tag-in *is* its contribution. This makes the swap the great equalizer and answers "why bring a support."

Concrete budget tiers (tune at S2; these are the shape, not the final numbers):

| Power tier | Example heroes | Boon scope | Combo role | Magnitude | Gauge |
|------------|----------------|------------|------------|-----------|-------|
| **Hypercarry** | Anti-Mage, Spectre, Medusa, Faceless Void, PA, Morphling, Luna, Juggernaut, Troll, Slark, Terrorblade | self, **+ a tiny setup crumb** | payoff (consumes combos) | small (~10%); the crumb is a 1s slow/mark | short (~6s) |
| **Nuker / mid** | Lina, Zeus, QoP, Storm, Ember, SF, Invoker, Tinker, Leshrac, Puck | self + small enemy Strike | payoff | modest (Strike nuke + ~15% self, 3s) | short (~7s) |
| **Durable / initiator** | Tide, Axe, Mars, Centaur, DK, Tiny, Slardar, Primal Beast, Bristleback, Spirit Breaker | self or small team + CC | **setup** (Lockdown/Gather) | medium (slow/pull/stun + ~12–18% DR) | medium (~9s) |
| **Support (off-DPS)** | Disruptor, Jakiro, WD, Dark Willow, Snapfire, Skywrath, Venomancer, Grimstroke | **team**, AoE + Drop/Soak | setup **and** payoff amp | large (Warcry ~18–22%, fields, soaks) | medium (~10s) |
| **Hard support** | Crystal Maiden, Lich, Dazzle, Omniknight, KotL, Warlock, Treant, Chen, Io, Ogre, Abaddon | **team**, AoE | save / sustain / Imprint | **largest** (big heals, big shields, cleanse, lingering fields) | long (~12s) |

The asymmetry is the point. A carry's tag-in is +10% to itself plus a one-second crumb the *next* hero uses; a support's tag-in heals the whole party for a fifth of their health, gathers the pack, drops a damage field, or strips every debuff off the team. Bringing two supports and rotating their boons should out-tempo bringing three carries, the same way a Bennett+Kazuha core out-damages a fourth DPS in Genshin. **Even the carry crumb matters**: it guarantees every hero contributes to the chain, so there is no "dead" tag-in and combos can route through anyone. **Sub-DPS vs support** (the distinction the research kept surfacing): off-DPS supports lean Warcry/Drop/Soak (they still deal damage and enable reactions); hard supports lean Mend/Bulwark/Cleanse/Imprint (pure utility). All gauge-gated, all team-relevant, all bigger than any carry's.

**Budget data-lint.** A test sums each boon's effect magnitudes into a rough "power score" weighted by `archetype` and scope, and asserts it sits inside its tier's band — so a carry can't quietly ship a support-sized boon, and the inverse-power law stays enforced as content grows (the same discipline as the existing data-lint cross-reference checks).

---

## 5. OFF-FIELD PERSISTENCE — make the overworld honor it (Resonance)

The **Soak** and **Drop/Imprint** archetypes (§3.1) — and elemental combos generally — only sing if a benched hero's *stuff* keeps existing. Today the overworld swap calls `removeUnit`, which deletes the hero and everything it owns. The fix is to **bench instead of destroy**, gated by Resonance so base-mode behavior is untouched.

**Design.** When Resonance is on and a hero is swapped out mid-combat (i.e. recently in combat — the code already tracks `lastCombatAt`), do not remove the unit. Instead mark it **off-field**: it stops taking player orders and stops being a primary target, but its **zones, summons, wards, and lingering element auras keep ticking** for a short persistence window (or until it would naturally expire), exactly as `SPEC.md §5.5` specifies. After the window, or when fully out of combat, it serializes and is removed as today. The swapped-in hero arrives normally and its Soak/Strike tag can detonate against what the benched hero left.

**The seam.** This is a branch in the existing swap path, not a new system. `removeUnit` already exists; what is needed is an "off-field" unit state the sim skips for control/targeting but still steps for zones/summons. The cleanest version reuses the controller vocabulary: a swapped-out-but-persisting hero gets a passive/`idle` controller and an `offFieldUntil` stamp, and `Sim.step` already steps all units' owned effects — so leaving the unit in place *is* persistence. Summons re-owner to the new active hero where it matters (the code already does `retargetEntourage` on swap). Out of combat, nothing changes: the hero serializes and leaves immediately, so the overworld stays clean when you're just walking.

**Gating.** Resonance off → swap behaves exactly like today (remove on swap, no persistence, a Soak degrades to a small self buff with nothing to react against, while Drop/Imprint still work as plain lingering summons/zones/buffs because they're generic, not elemental). Plain (non-elemental) effect-chaining combos (§3.5 engine 1) still work without Resonance. The macro layer never benches mid-fight (everyone's already fielded in raids; gyms don't use the overworld swap). `boundary.test.ts` stays green — this is all systems-side.

---

## 6. THE HERO TABLE — a signature combo tag for every hero

Element from `core/resonance.ts` (`HERO_ELEMENTS`); class condensed from each hero's `roles`. **Combo role** is the grammar from §3.5: **Setup** (creates a state the next tag pays off — CC, gather, soak, mark), **Payoff** (consumes a state — burst, nuke, reaction), **Save** (rescue/sustain), **Off-field** (legacy left on swap-out), **Self** (selfish, smallest). Every hero — including hypercarries — leaves *something* the team can chain off, per Goal 4. Effects are expressed in the `EffectNode` vocabulary (§3); the tooltip is the shipping copy; magnitudes are S2 placeholders bounded by the §4 budget. Elements only matter with Resonance on (a Soak degrades to flavor otherwise).

Reading a row: the **Tag** column names the `EffectNode`s in plain words; the **combo** is what it sets up or pays off.

### Strength — bruisers, tanks, initiators (mostly Setup/Save)

| Hero | Elem | Class | Role | Tag effect (EffectNodes) | Combo |
|------|------|-------|------|--------------------------|-------|
| Axe | — | init/durable | Setup | `status` taunt-pulse: nearby foes briefly drawn + slowed; self DR | gathers + holds foes for AoE payoff |
| Pudge | — | disabler/durable | Setup | `displace` pull: yank the nearest foe to you + `status` slow | drags a target into the team to delete |
| Tidehunter | hydro | durable/init | Setup | `status` anchor-slam: 40% slow `enemies-in-radius` 2s + Hydro soak | wets + pins a pack for Cryo/Pyro |
| Kunkka | hydro | carry/disabler | Setup | `zone` torrent patch at feet (slow + Hydro) | a wet trap the next hero detonates |
| Slardar | hydro | durable/disabler | Setup | `status` armor-corrode `enemies-in-radius` + Hydro | softens armor → carry payoff |
| Sven | — | carry | Payoff | self `statmod` +damage + `status` 0.75s mini-stun nearby | bursts, and the crumb-stun extends a chain |
| Earthshaker | geo | initiator | Setup | `status` stun `enemies-in-radius` 1s + Geo | the canonical wombo opener |
| Mars | — | init/durable | Setup | `displace` shove foes inward (arena) + allies frontal DR | walls a pack in for AoE |
| Tiny | geo | carry/durable | Setup | `displace` toss the nearest foe to your feet + Geo | repositions a target onto the team |
| Sand King | geo | init/nuker | Setup | `zone` caustic dust (slow + DoT) + Geo soak | a soak field that primes reactions |
| Centaur | — | durable/init | Save | allies `statmod` DR + `heal` small + brief stomp slow | front-line stabilize + a little CC |
| Dragon Knight | — | durable/carry | Self | self `statmod` DR + AS, brief splash | durable arrival, mild crumb |
| Bristleback | — | durable/carry | Self | self `statmod` DR (refreshes on hit) | a tanky tag, no setup |
| Spirit Breaker | — | initiator | Setup | `displace` short charge-shove + `status` mini-bash | knocks a target into range |
| Primal Beast | — | init/durable | Setup | `status` brief root `enemies-in-radius` + self DR | roots a pack in place |
| Huskar | pyro | carry/durable | Payoff | self +damage (HP-scaled) + Pyro arrival | low-HP burst that ignites soaks |
| Alchemist | — | carry/durable | Self | self +damage + regen; crumb: a gold-mark on a foe | selfish, a tiny bounty tag |
| Wraith King | — | carry/durable | Payoff | self +damage + lifesteal + crumb mini-stun | sustain burst + chain crumb |
| Lifestealer | — | carry/durable | Self | self `heal` + AS | aggressive reposition |
| Doom | pyro | carry/durable | Setup | `status` silence the nearest foe 1.5s + Pyro | shuts a caster for the payoff |
| Night Stalker | — | durable/init | Setup | `status` blind/slow `enemies-in-radius` (bigger at night) | de-fangs a pack |
| Underlord | — | durable/support | Save | allies `statmod` big DR aura + `zone` slow patch | team wall + a slow trap |
| Omniknight | — | support/durable | Save | `heal` 14% allies + `statmod` 30% magic resist | hard rescue vs magic burst |
| Abaddon | — | support/durable | Save | `purge` 1 debuff allies + shield `statmod` | cleanse-shield a dived ally |
| Dawnbreaker | pyro | carry/support | Save | `heal` allies + Pyro arrival nuke `enemies-in-radius` | heal + ignite in one tag |
| Earthshaker-tier Elder Titan | geo | init/disabler | Setup | `status` echo-stun + armor-shred + Geo | stun + sunder for payoff |
| Treant Protector | dendro | support/durable | Save | `heal` allies + HoT `zone` + Dendro | sustain field + reaction primer |
| Ogre Magi | — | support/durable | Save | allies shield + brief AS `statmod` | bloodlust-on-arrival |
| Legion Commander | — | carry/init | Payoff | self +damage + crumb mini-stun nearest | duel-arrival burst |

### Agility — carries, nukers, escapes (mostly Payoff/Self, with setup crumbs)

| Hero | Elem | Class | Role | Tag effect (EffectNodes) | Combo |
|------|------|-------|------|--------------------------|-------|
| Juggernaut | — | carry | Payoff | self +damage + AS; crumb: brief slow nearest | spin-arrival cleanup |
| Luna | — | carry | Payoff | self +damage + a glaive `damage` bounce nearby | small AoE crumb |
| Sniper | — | carry | Self | self +damage + range | clean ranged arrival |
| Anti-Mage | — | carry/escape | Setup | `mana` burn nearest + self move speed | mana-strip crumb vs casters |
| Phantom Assassin | — | carry/escape | Payoff | self +damage + guaranteed-crit primer | the chain finisher |
| Spectre | — | carry/durable | Payoff | self DR + `damage` desolate pulse nearby | durable burst arrival |
| Faceless Void | — | carry/init | Setup | `status` brief slow-bubble `enemies-in-radius` | mini-chronosphere setup |
| Medusa | — | carry/durable | Self | self shield (mana-scaled) + split-shot crumb | tanky carry arrival |
| Morphling | hydro | carry/escape | Setup | `zone` Hydro wave at feet + self +damage | wets a line for reactions |
| Slark | — | carry/escape | Self | self `heal` + move speed; crumb: −armor mark | elusive burst |
| Troll Warlord | — | carry/durable | Self | self big AS + crumb slow | attack-speed dump |
| Terrorblade | — | carry/pusher | Off-field | `summon` 2 images linger on swap-out | leaves bodies to keep DPS |
| Ursa | — | carry/durable | Payoff | self stacking-damage primer + crumb mini-bash | focus-target deleter |
| Drow Ranger | — | carry/disabler | Setup | `status` slow + −armor `enemies-in-radius` | ranged team setup |
| Clinkz | pyro | carry/escape | Payoff | self +damage + Pyro arrows (ignite soaks) | reaction finisher |
| Gyrocopter | — | carry/nuker | Payoff | self +damage + `damage` rocket nearby | AoE burst arrival |
| Razor | electro | carry/durable | Setup | `zone` static field (Electro + DoT) at feet | an electro trap for combos |
| Templar Assassin | — | carry/escape | Self | self +damage + brief evasion; crumb meld-mark | sneaky burst |
| Weaver | — | carry/escape | Self | self move speed + `heal` + brief untargetable feel | hit-and-run reposition |
| Riki | — | carry/escape | Setup | `zone` smoke (silence + miss) at feet | a silence field for the team |
| Bounty Hunter | — | escape/nuker | Setup | `status` track-mark nearest (−armor, team gold) | marks a kill target |
| Naga Siren | hydro | carry/pusher | Off-field | `summon` images + Hydro `zone` linger on swap-out | bodies + a wet field |
| Bloodseeker | — | carry/init | Payoff | self `heal` + move speed (kill-scaled) + slow crumb | chase finisher |
| Shadow Fiend | pyro | carry/nuker | Payoff | `damage` triple-raze nearby + Pyro + self spell amp | the AoE detonator |
| Ember Spirit | pyro | carry/escape | Payoff | `damage` flame nova nearby + Pyro arrival | mobile igniter |
| Arc Warden | — | carry/nuker | Off-field | `summon` a striking tempest double on swap-out | off-field DPS |
| Meepo | — | carry/pusher | Setup | `displace` short net-pull nearest + crumb | drags one in |
| Monkey King | — | carry/escape | Payoff | self +damage + brief crit + crumb mini-stun | jump-in burst |
| Phantom Lancer | — | carry/escape | Off-field | `summon` lancer images linger on swap-out | a wall of bodies |
| Broodmother | — | carry/pusher | Off-field | `summon` spiderlings + `zone` web linger on swap-out | persistent map pressure |
| Nyx Assassin | — | disabler/escape | Setup | `status` brief stun + mana-burn nearest | caster lockpick |
| Viper | — | carry/durable | Setup | `status` corrosive (−AS, slow, poison) + DoT | a debuff soak |

### Intelligence — nukers, supports, pushers (Setup/Payoff/Save)

| Hero | Elem | Class | Role | Tag effect (EffectNodes) | Combo |
|------|------|-------|------|--------------------------|-------|
| Crystal Maiden | cryo | support | Setup/Save | `heal` allies 12% + 40/s `zone` + Cryo `status` frost nearby | sustain + freeze primer |
| Lich | cryo | support | Setup | `status` frost-armor allies + Cryo nova nearby | shields + a cryo soak |
| Lina | pyro | nuker/support | Payoff | `damage` scorch `enemies-in-radius` + Pyro + self spell amp | the headline detonator |
| Zeus | electro | nuker | Payoff | `damage` bolt the most-dangerous foe + Electro | single-target nuke + soak |
| Jakiro | cryo | support/nuker | Setup | `zone` macropyre line (DoT) + Cryo + allies spell amp | a burning lane + buff |
| Witch Doctor | — | support/disabler | Save | `heal` allies + HoT + crumb stun nearest | sustain + a tiny lock |
| Disruptor | electro | support/disabler | Off-field | `zone` static field persists on swap-out (Electro) | off-field shred + soak |
| Grimstroke | — | support/nuker | Setup | `status` ink-bind nearest pair (slow/silence) + allies spell amp | locks + amps |
| Keeper of the Light | — | support/nuker | Save | `mana` restore allies + small `heal` | refuels the casters' rotation |
| Leshrac | — | nuker/pusher | Payoff | `zone` pulse-nova (DoT) at feet + self spell amp | a damage field that ticks |
| Necrophos | — | durable/nuker | Save | `heal` allies + `status` anti-heal nearest foe | sustain + healing-cut |
| Puck | — | escape/nuker | Setup | `status` brief silence-orb `enemies-in-radius` | a silence window |
| Pugna | — | nuker/pusher | Setup | `status` −magic-resist nearest + self spell amp | opens a target to magic |
| Queen of Pain | — | nuker/escape | Payoff | `damage` scream nearby + self spell amp | mobile AoE burst |
| Shadow Demon | — | support/disabler | Setup | `status` disruption/break the most-dangerous foe | isolates a target |
| Shadow Shaman | — | support/disabler | Setup | `status` hex the nearest foe 1.5s | hard single-lock |
| Death Prophet | — | pusher/nuker/durable | Off-field | `summon` exorcism spirits linger on swap-out | off-field DPS |
| Lion | — | support/disabler/nuker | Setup | `status` hex + `mana` burn nearest | the lockpick + mana strip |
| Winter Wyvern | cryo | support/disabler | Save | `heal` an ally big (Cold Embrace) + Cryo nearby | clutch save + freeze primer |
| Invoker | — | nuker/disabler | Payoff | `damage` sunstrike-style nuke nearest + self spell amp | a precise detonator |
| Silencer | — | support/disabler | Cleanse | `purge` allies + `status` silence-resist; crumb silence foes | anti-cast bubble |
| Outworld Destroyer | — | carry/nuker | Setup | `status` astral-banish nearest 1s + self mana shield | removes + sets up |
| Skywrath Mage | anemo | support/nuker | Setup | `status` ancient-seal nearest (−magic-resist) + Anemo + allies spell amp | the magic-amp opener |
| Tinker | — | nuker/pusher | Payoff | `damage` laser + `status` blind nearest + self spell amp | nuke + a blind crumb |
| Enchantress | dendro | support/pusher | Setup | `zone` Dendro growth + allies AS | a reaction garden + haste |
| Chen | dendro | support/pusher | Save | `heal` allies + HoT + Dendro | sustain + primer |
| Nature's Prophet | dendro | pusher/nuker | Off-field | `summon` treants + `zone` sprout linger on swap-out | bodies + a root-trap |
| Warlock | — | support/init | Off-field | `zone` Fatal Bond field persists on swap-out (shared damage) | the iconic cash-in field |
| Visage | — | support/pusher | Off-field | `summon` familiars persist on swap-out | off-field DPS + stuns |
| Dazzle | — | support/nuker | Off-field | `zone` Shadow heal-tick field persists on swap-out | off-field sustain |
| Dark Willow | dendro | support/disabler | Setup | `status` fear/root `enemies-in-radius` + allies spell amp | a CC + amp combo |
| Bane | — | support/disabler | Setup | `status` sleep/nightmare the most-dangerous foe | takes one foe out of the fight |
| Ancient Apparition | cryo | support/disabler | Setup | `status` anti-heal + Cryo `enemies-in-radius` | freeze primer + healing-cut |
| Snapfire | pyro | support/nuker | Payoff | `damage` cookie-blast nearby + allies +damage + Pyro | AoE + team buff |
| Rubick | — | support/disabler | Cleanse | `purge` allies + brief spell-shield `statmod` | anti-magic save |
| Storm Spirit | electro | carry/escape/nuker | Payoff | `damage` overload zap nearby + Electro + self spell amp | mobile electro burst |

### Universal — flex, initiators, summoners (Setup/Save/Off-field)

| Hero | Elem | Class | Role | Tag effect (EffectNodes) | Combo |
|------|------|-------|------|--------------------------|-------|
| Mirana | anemo | carry/nuker/escape | Setup | `displace` gust gather `enemies-in-radius` + Anemo | gather + swirl primer |
| Vengeful Spirit | anemo | support/disabler | Setup | `status` −armor `enemies-in-radius` + allies +damage + Anemo | armor-break + team buff |
| Windranger | — | disabler/nuker/escape | Setup | `status` shackle the nearest foe (root) + self AS | a single root for payoff |
| Brewmaster | — | init/durable/carry | Save | allies DR + self brief spell-immune feel | front-line stabilize |
| Marci | — | support/init | Payoff | allies +damage + move speed + crumb dispel | the rally buff |
| Magnus | geo | initiator/disabler | Setup | `displace` reverse-polarity pull `enemies-in-radius` + Geo | the premier gather |
| Tusk | cryo | init/disabler/durable | Setup | `status` shard-slow + Cryo + allies shield | slow + freeze primer |
| Phoenix | pyro | support/nuker | Save | `heal` allies (Sun Ray) + Pyro nearby | sustain + ignite |
| Io | — | support/escape | Save | `heal` + tether the lowest-HP ally + share move speed | the ride-along save |
| Dark Seer | — | initiator/pusher | Setup | `displace` vacuum `enemies-in-radius` + allies ion-shield | gather + shield |
| Enigma | — | init/pusher/disabler | Off-field | `summon` eidolons persist on swap-out | off-field DPS army |
| Beastmaster | — | initiator/pusher | Off-field | `summon` hawk + boar (slow aura) persist on swap-out | scout + off-field slow |
| Undying | — | support/durable/pusher | Off-field | `summon` Tombstone + zombies persist on swap-out | a damage/slow generator |
| Clockwerk | — | init/disabler/durable | Setup | `displace` hook the nearest foe to you + crumb stun | a single-target grab |
| Batrider | pyro | initiator/disabler | Setup | `status` sticky-napalm (−MS, +Pyro turn-rate burn) `enemies-in-radius` | the Pyro soak opener |
| Earth Spirit | geo | initiator/disabler | Setup | `displace` roll-pull + Geo + self shield | gather + soak |
| Lone Druid | — | carry/pusher | Off-field | `summon` Spirit Bear persists on swap-out | a second body that fights |
| Lycan | — | carry/pusher | Off-field | `summon` wolves persist on swap-out | off-field pressure |
| Pangolier | — | initiator/escape | Setup | `displace` roll-knockback `enemies-in-radius` + self DR | scatter or wall |
| Timbersaw | — | durable/escape/nuker | Self | self DR (armor-scaled) + `damage` chakram nearby | tanky AoE arrival |
| Void Spirit | — | escape/nuker | Payoff | `damage` aether nova nearby + self spell amp + phase | mobile burst |
| Techies | — | nuker/disabler | Off-field | `zone` primed mine field persists on swap-out | a delayed-detonation trap |

*(Heroes appearing under two attributes are listed once where their identity is clearest; the implementation keys off hero id. "Crumb" = the tiny setup effect even pure carries carry, per §4, so no tag-in is ever inert in a chain.)*

---

## 7. THE ITEM TABLE — same support-favored law, in gear

Items get the same treatment: **support items grant team-wide tag-in boons; carry items grant small selfish ones or none (raw stats instead).** This makes a support's gear an active part of the rotation and keeps carry gear about the carry. Existing items first, then a few new tag-focused builds.

### Existing items, with a tag-in line added

| Item | Today | Add (tag-in) | Class lean |
|------|-------|--------------|------------|
| Mekansm | active team heal | **TAG-IN: heal nearby allies 8%** (Mend, small) | support |
| Guardian Greaves | active heal+dispel | **TAG-IN: cleanse 1 debuff on allies** (Cleanse) | support |
| Glimmer Cape | active ally invis | **TAG-IN: allies +15% magic resist 3s** (Save) | support |
| Vladmir's Offering | aura | **TAG-IN: allies +8% lifesteal/damage 4s** (Warcry) | support |
| Force Staff | active push | **TAG-IN: shove the nearest foe (a free Gather crumb)** | flex |
| Pipe of Insight *(if shipped)* | aura/active | **TAG-IN: team magic shield** (Save) | support |
| Drum of Endurance | active team MS/AS | **TAG-IN: allies +10% AS 3s** (Warcry, small) | flex/support |
| Headdress / Buckler / Basilius | regen/armor auras | **TAG-IN: tiny ally heal / +armor** (minor) | early support |
| Black King Bar | spell immunity | *(no tag boon — it is already premium)* | carry/defense |
| Battlefury / Crystalys / Butterfly / Maelstrom / MoM | raw carry stats | **small self Onslaught only, if any** (~6–8%) | carry |
| Power Treads / Phase Boots | raw stats | *(none — boots are boots)* | all |

### New tag-focused items (extend the existing `swap*` stat family)

These build on the three that already exist (`quickstep-cord`, `breacher-cloak`, `exchange-mark`) and the `swapCdReductionPct / swapInDamagePct / swapInHealPct` stats, plus a proposed `tagBoonAmpPct` (scales the boon's magnitude) and `tagGaugeReductionPct` (shaves the gauge).

| Item | Build | Tag effect | Class lean |
|------|-------|------------|------------|
| Quickstep Cord *(exists)* | component | `swapCdReductionPct: 12` → shaves gauge | all |
| Breacher Cloak *(exists)* | t1 | `swapCdReductionPct: 28, swapInDamagePct: 18` (self Onslaught) | carry |
| Exchange Mark *(exists)* | t1 | `swapCdReductionPct: 18, swapInHealPct: 8` (self heal) | bruiser |
| **Relay Standard** *(new)* | t2, support | `tagBoonAmpPct: 30` — your team boons (Warcry/Bulwark/Mend/Cleanse) hit **harder and wider** | hard support |
| **Heralds' Token** *(new)* | t1, support | `tagGaugeReductionPct: 25` — boons re-arm faster (more combo links per fight) | support |
| **Vanguard Sigil** *(new)* | t1, durable | grants a Bulwark tag-in even to heroes without one | tank |
| **Echo Conduit** *(new)* | t2, enabler | `reactionAmpPct`, and your Soak tag leaves a lingering element field | Resonance teams |
| **Chainweaver Band** *(new)* | t2, swap-spec | extends the §3.5 chain window +1s and adds +1 chain step | combo rotators |

The asymmetry mirrors §4: **Relay Standard** (a support's capstone) multiplies team boons; **Breacher Cloak** (a carry's swap item) just buffs the carry. A support who buys into the tag tree becomes the engine of the rotation; a carry who buys in gets a personal nudge.

---

## 8. OTHER COMPONENTS WE WERE MISSING

Beyond the cooldown split, the wide boon set, and off-field persistence, the research surfaced pieces of Genshin's swap depth we don't have. Ranked by value-per-cost.

1. **The swap-OUT payoff (Imprint).** Covered above — but worth naming as its own missing pillar. Genshin's swap economy is *two-sided*: you tag in for an effect **and** tag out leaving an effect (Noblesse burst → swap; off-field DPS summons). We only had a tag-in half. Imprint is the other half and it is where summoners and field-supports finally justify the swap.
2. **Off-field ability ticking, not just summons.** True off-field *DPS* (a benched hero's damage zone keeps hitting) is the deepest Genshin hook. §5 enables it for summons/zones; the stretch is letting a hero's *channeled* effect keep ticking off-field for its duration. Scope it behind Resonance and a per-ability `offField: true` flag so it is opt-in data, not a blanket rule.
3. **A swap-cancel grace window.** `SPEC.md §5.5` mentions "an optional swap-cancel grace keeps a swap from eating an in-progress cast." Genshin players animation-cancel by swapping. We should define it once: a swap issued during a cast either (a) queues until the cast point resolves (no lost cast) or (b) is allowed to cancel the *backswing* but not steal the damage — the exact contract `COMBAT_OVERHAUL`/`GAMEPLAY_OVERHAUL §3.0` already drew for the dash. Reuse that decision, don't reinvent it.
4. **Swap-in invulnerability frames — explicitly NO.** Genshin gives some swaps brief i-frames. `GAMEPLAY_OVERHAUL §7.8` already ruled the dash gets **no i-frames** (Dota-honest: you dodge by repositioning, not immunity). The tag-in inherits that ruling: arriving is fast travel, not a dodge button. Logged so nobody re-litigates it.
5. **An energy / "momentum" funnel resource — optional, probably skip.** Genshin's swap rotations are gated by an energy economy (you funnel particles to bursters). It is a major retention lever for a gacha and mostly *friction* for a single-player game (the same logic that softened resin in `GAMEPLAY_OVERHAUL §3.5`). The Tag Gauge (§2.2) already gives the "time your payoff" depth without a second resource bar. Recommend: **do not add energy**; if a sense of "charging up a big tag" is wanted, let landing reactions shave the gauge instead of adding a meter.
6. **Readability — the rotation must be legible (§9 below).** None of this lands if the player can't see gauges, boon timings, and the live combo chain. This is the C4-style presentation slice for the swap.
7. **AI use of the tag in raids.** In a live raid you drive one and the other four run gambits; the effect system means the AI should *also* tag-in usefully when you swap to it, and should help *route the combo*. The gambit grammar (`AI_OVERHAUL.md`) learns a `tag-in-ready` condition and a `combo-setup-active` read (is a Setup state up on the focus?), so an ally announces "my gather is ready," auto-pays-off a soak the team-mind sees, and the HUD can suggest the next link — the same `enemy-cast-seen`-class reactive read, pointed at the gauge and the §3.5 chain state.

---

## 9. READABILITY — make the rotation visible

Pure presentation, no core change, keyed off state the orchestrator already holds. Sits beside `COMBAT_OVERHAUL` C4's `combatReadout`.

- **Gauge rings on party portraits.** Each 1–5 slot shows a small radial fill for its Tag Gauge: full = boon ready (a soft glow), filling = cooldown. This is the single most important readout — it turns the rotation into a thing you *see*.
- **The boon tooltip line.** On the hero panel / portrait hover, the `TAG-IN:` / `TAG-OUT:` line from §3.1, next to the existing swap-CD stat row (`describe.ts`).
- **Arrival beat.** A distinct VFX/audio beat when a boon fires (and a duller one when you swap with the gauge down, so the player learns the difference). Reuse the `status-apply` event already emitted on swap-in.
- **Off-field markers (Resonance).** A faint indicator on lingering benched-hero zones/summons so the apply-then-detonate combo is visible: "the water is still here, tag in Cryo."
- **Reaction-preview on tag-in.** When a Soak/Strike tag would react with an element already on the target, show the reaction name on the swap prompt — the apply→swap→detonate loop becomes a decision you can see coming.
- **The combo chain counter.** When a chain is live (§3.5), show the chain count and a draining window bar near the active portrait, plus a small "next link" hint (which benched hero's tag pays off the current state). This is what makes the combo *feel* like a combo — a number that climbs and a clock that pressures the next swap. A fighting-game-style "WOMBO ×3" flourish on a big chain is on the table.

---

## 10. ARCHITECTURE IMPACT — what touches what

| Layer | What it gains | Touches the headless core? |
|-------|---------------|----------------------------|
| `src/core/` | The **`TagBoonDef` type** + `HeroDef.tagBoon`, and the **new stat fields** (`tagBoonAmpPct`, `tagGaugeReductionPct`) in `DerivedStats`/`StatModMap`, exactly like the existing `swapInDamagePct` family. The boon `effects` are plain `EffectNode`s the **existing resolver already interprets** — no new resolution math, no new effect kind. Additive, deterministic, no DOM/three. | Minimal (a data type + stat plumbing; effect resolution is unchanged) |
| `src/data/` | Per-hero `tagBoon` (the §6 table: `fire`, `effects`/`outEffects`, `gaugeSec`, `archetype`, `tooltip`), keyed by hero id; new tag items; **most of the work is here, as data.** | No |
| `src/systems/` | The cooldown split (`swapFloorSec` + per-roster `tagGaugeReadyAt`); `fireTagBoon` calling the existing `resolveEffects` from the swap-in/out path; the §3.5 chain bookkeeping (`chainCount`/`chainExpiresAt`); off-field bench-instead-of-remove branch (Resonance). | No (calls existing core primitives) |
| `src/engine/` | Gauge rings on portraits; arrival VFX/audio beat; off-field markers; reaction-preview; the combo chain counter/window bar. | No (`boundary.test.ts` stays green) |
| `GameSave` | `tagGaugeReadyAt` per roster entry (runtime-ish; defaults to 0 on load). Bump `SAVE_VERSION` with a defaulting migration, the established pattern. | N/A |

**The core touch is a data type + stat plumbing — the *effects already resolve through the engine abilities use* (§3.2).** A tag-in stun, summon, pull, or nuke is the same `EffectNode` the same resolver, so it is deterministic and headless-testable the moment it ships. Off-field persistence is "don't call `removeUnit` yet," not a new mechanic. The chain amplifier is a multiplier on `ValueRef`s, the way spell amp already works. Same risk profile as Resonance and the tag-in code that already shipped.

---

## 11. PHASING — shippable slices, each playable and green

**S0 — The `TagBoonDef` seam + name what exists.** Add the `TagBoonDef` type and `HeroDef.tagBoon`; wire `fireTagBoon` to call the existing `resolveEffects` (§3.2); re-express today's heal/burst as a `tagBoon` with `statmod`/`heal` effects. Give every hero a `tagBoon` entry from §6 (carries first, mostly self + a crumb), surface the tooltip line. The swap behaves as today; the machinery is now general. Unblocks everything.

**S1 — Decouple the cooldown.** Split `swapReadyAt` into the short floor + the per-hero Tag Gauge (§2). Lower the floor to ~1.5s (1.0s Resonance). The boon fires only on a ready gauge. Add the gauge ring to the HUD. The headline *feel* change and the smallest one once S0 exists. Decide the charge-alternative and the swap-cancel grace here.

**S2 — The creative effect set + the power budget.** Author the full §6 table for real — the Setup/Payoff/Save effects (stuns, pulls, soaks, nukes, summons, heal/cleanse fields) as plain `EffectNode` lists; tune the §4 budget + budget data-lint so supports out-tempo a fourth carry. Headless test per archetype on a fixed seed (a tag-in stun lands a stun; a gather pulls; a soak applies the element; a mend heals nearby allies; a strike nukes). The meaty design slice — the one that makes supports matter and gives every hero its identity.

**S3 — Combos: chain window + off-field + Imprint.** The §3.5 chain bookkeeping and amplifier; bench-instead-of-remove under Resonance (§5); the Imprint swap-out legacies. Tests: a benched hydro field still Freezes when a cryo hero tags in; a chained 2nd/3rd tag is measurably amplified; a Warlock swapped out leaves his bond ticking. Resonance off → plain effect-chaining still works (engine 1), elemental/persistence off. The slice that turns the system into a *combo* system.

**S4 — The item tree + readability polish.** The new tag items (§7), `tagBoonAmpPct`/`tagGaugeReductionPct`, off-field markers, reaction-preview, arrival beats, and the combo chain counter. The pass that makes a support's *gear* part of the rotation and the whole loop — gauges, chains, reactions — legible.

**S5 — Author the full §6 table + first-class Soak.** Replace the role-templates with each hero's *signature* tag from §6 (§0.5 gap 1), keyed by hero id, so every hero is the combo piece the table describes. Promote **Soak** to a real archetype (§0.5 gap 2): a Soak tag lays a lingering **element field** — a `zone` whose tick re-applies the hero's element (and usually a slow/DoT) — so a benched soaker leaves the element on the ground for the next hero to detonate, on the overworld path, under Resonance. Off-field heroes (Enigma, Broodmother, Visage, Lone Druid, …) leave persistent off-field pressure on swap-out — a lingering field/legacy that keeps ticking while they are benched (the tested off-field path; real `summon` bodies are a follow-on once their specs are exported). All authored inside the §4 budget bands so the data-lint stays green and the inverse-power law holds. Pure data plus the Soak helper — no new core surface.

**S6 — The remaining §8 depth.** *Shipped:* off-field *channel* DPS behind a per-ability `channel.offField: true` flag (§8.2) and the swap-cancel grace window (§8.3, reusing the dash's §3.0 timing contract — a swap during a cast point queues until the cast fires). *Deferred:* the optional charge-meter toggle (§2.3), kept in the back pocket per its own section rather than made the default. Each piece is independent and additive.

S0–S1 carry no balance risk and land fast. S2 is the design-dense slice; S3 is where combos come alive; S5 is where every hero finally reads as itself.

---

## 12. ACCEPTANCE — each slice is done when

| Slice | Done when |
|-------|-----------|
| S0 | `TagBoonDef`/`HeroDef.tagBoon` exist; `fireTagBoon` resolves a boon's `EffectNode`s through the same path `castAbility` uses; today's heal/burst are re-expressed as a `tagBoon`; every hero has an entry; the `TAG-IN`/`TAG-OUT` tooltip line renders; no behavior change and the full suite (incl. `boundary.test.ts`, fixed-seed determinism) stays green. |
| S1 | The swap floor and the per-hero Tag Gauge are separate timers; swapping with a spent gauge repositions but pays no boon; the floor is ~1.5s (1.0s Resonance); the gauge ring shows on each portrait; a unit test asserts a boon fires only on a ready gauge and the gauge re-arms in real time on the bench. |
| S2 | Each archetype resolves through the effect engine with a headless test (a tag-in `status` stun stuns; a `displace` gather pulls; a `heal` over `allies-in-radius` heals nearby; a `purge` cleanses; a `damage` strike nukes; a Soak applies the element); the §4 budget data-lint passes (no carry ships a support-sized boon) and a two-support rotation out-tempos a three-carry line in a fixed-seed harness; the gambit editor exposes `tag-in-ready`. |
| S3 | A chained 2nd/3rd tag is measurably amplified inside the window and decays after; with Resonance on a benched hero's zone/summon keeps ticking and an apply→swap→detonate reaction resolves deterministically; Imprint leaves its legacy for its window; with Resonance off, plain effect-chaining still composes and the swap removes-on-swap as today; macro layer never benches mid-fight; `boundary.test.ts` green. |
| S4 | The new tag items grant their stats and compose; `tagBoonAmpPct` scales boon magnitude, `tagGaugeReductionPct` shaves the gauge, the chain item extends the window; off-field markers, reaction-preview, arrival beats, and the combo chain counter render; no readout changes a combat result, so determinism tests stay green. |
| S5 | Every hero resolves its own signature tag from §6 (no hero left on the role-template path); **Soak** lays a real lingering element field that a benched soaker leaves behind and a later tag detonates; off-field summoner tags leave persistent off-field pressure (lingering zones; real `summon` bodies are a follow-on); the §4 budget data-lint stays green for all authored boons and the inverse-power law holds; the full suite + `boundary.test.ts` stay green. |
| S6 | A channel flagged `channel.offField` keeps ticking off-field after a swap-out and a non-flagged channel is still torn down (headless tests, `gameplay-overhaul.test.ts`); a swap pressed during the active hero's cast point is queued and fires once the cast resolves, never cancelling the cast (headless test); the full suite + `boundary.test.ts` stay green. The charge-meter toggle (§2.3) is deferred by design. |

Cross-cutting gates (every slice): `npm test` + `npm run build` green; `boundary.test.ts` green (no `three`/DOM in core); save migration defaults cleanly; no exotic slots spent; gyms/Elite Five play identically with all of this toggled on or off.

---

## 13. PRINCIPLES (consistent with `SPEC.md §10`, `GAMEPLAY_OVERHAUL §8`, `COMBAT_OVERHAUL §8`)

- **The tag-in is the Genshin verb.** Dota doesn't have it; this is where the third pillar of the blend actually lives. Make swapping a thing you *do in a fight*, not a thing you do between fights.
- **The tag-in is a cast, not a buff — and combos are the point.** Here we are *not* bound by Dota's rules: a tag-in can stun, pull, soak, summon, or nuke. Every hero leaves something the next hero pays off, so the roster is a set of setup→payoff pairs and the fun is the chain. Design heroes as combo pieces, not isolated buttons.
- **Two timers, two jobs.** A cheap floor for repositioning; a per-hero gauge for the payoff. Conflating them was the original sin.
- **Supports earn their slot at the tag-in.** Power runs inverse to raw strength. The rotation is the equalizer; it is the answer to "why not a fourth carry."
- **Both sides of the swap pay.** Tag in for an arrival; tag out for a legacy. The swap economy is two-sided or it is shallow.
- **Reuse the vocabulary, spend zero exotics.** A boon is a list of `EffectNode`s the core's resolver already interprets; off-field persistence is "don't remove yet"; the chain amp is a `ValueRef` multiplier. If a boon seems to need a bespoke mechanic, redesign it as effects + a magnitude + a gauge.
- **Additive and reversible, like Resonance.** Resonance off and no tag items → the base game's swap. Gyms/Elite untouched.
- **The sim owns timing; the renderer animates it.** Arrival beats, gauge rings, off-field markers, and the swap-cancel grace all honor the §3.0 timing contract; readouts never change a result.
- **Ship slices.** S1 alone (the cooldown split) is worth shipping — it fixes the loudest feel problem on its own. Build ahead, keep it green, demo the rotation.
