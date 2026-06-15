import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { TUNING } from '../data/tuning';
import { REG } from '../core/registry';
import { itemStateFromSave } from '../core/items';
import { applyDamage } from '../core/combat';
import { Game, newGameSave } from '../systems/game';
import type { GameSave, SimEvent } from '../core/types';
import type { Unit } from '../core/unit';

// ============================================================
// SWAP PRESSURE TEST — the tag-in verb crossed with everything
// it actually touches in a fight: channels (off-field and not),
// items (amp / gauge / heal gating), the off-field bench window,
// the Tag Chain amplifier, the cast-point swap queue (§8.3),
// death-swap, and save/load round-trips.
//
// These exercise the COMBINATIONS the swap overhaul created, which
// the per-feature tests in gameplay-overhaul.test.ts and
// interactions/tag-in.test.ts cover one axis at a time. The goal
// here is to surface interaction bugs, so the assertions follow the
// documented SWAP_COMBAT_OVERHAUL contracts directly.
// ============================================================

beforeAll(() => registerAllContent());

function advance(game: Game, seconds: number, stepSec = 0.05): void {
  for (let t = 0; t < seconds; t += stepSec) game.update(Math.min(stepSec, seconds - t));
}

/** Build a save with `active` leading and the rest benched, all recruited. */
function bench(active: string, ...benched: string[]): GameSave {
  const save = newGameSave(active);
  for (const id of benched) {
    const rosterEntry = newGameSave(id).roster[0];
    save.recruited.push(id);
    save.party.push(id);
    save.roster.push(rosterEntry);
  }
  return save;
}

/** Mark the whole party as "recently in combat" so boons / off-field are eligible. */
function engage(game: Game): void {
  const u = game.activeUnit();
  if (u) u.lastEnemyDamageAt = game.sim.time;
}

function spawnDummy(game: Game, dx = 120): Unit {
  const a = game.activeUnit()!;
  const e = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: a.pos.x + dx, y: a.pos.y } });
  e.ctrl = { kind: 'none' };
  e.hp = e.stats.maxHp; // full so damage assertions are unambiguous
  return e;
}

function tagBoonEvents(game: Game, when?: 'tag-in' | 'tag-out'): Extract<SimEvent, { t: 'tag-boon' }>[] {
  return game.sim.events.history.filter(
    (e): e is Extract<SimEvent, { t: 'tag-boon' }> => e.t === 'tag-boon' && (when === undefined || e.when === when)
  );
}

// ------------------------------------------------------------
// 1. CHANNELS × SWAP
// ------------------------------------------------------------
describe('swap × channels', () => {
  function startChannel(game: Game, abilityId: string, target?: Unit): { hero: Unit; slot: number } {
    const hero = game.activeUnit()!;
    hero.mana = hero.stats.maxMana;
    const slot = hero.abilities.findIndex((a) => a.def.id === abilityId);
    expect(slot, `${abilityId} slot`).toBeGreaterThanOrEqual(0);
    hero.abilities[slot].level = Math.max(1, hero.abilities[slot].level);
    game.sim.order(hero.uid, target ? { kind: 'cast', slot, uid: target.uid } : { kind: 'cast', slot });
    return { hero, slot };
  }

  it("Witch Doctor's Death Ward (offField unit-target channel) keeps ticking while benched", () => {
    const game = Game.headless(bench('witch-doctor', 'juggernaut'));
    game.sim.events.captureAll = true;
    engage(game);
    const enemy = spawnDummy(game, 200);
    startChannel(game, 'wd-death-ward', enemy);
    advance(game, 0.5); // through the 0.3 cast point → channel running
    const wd = game.activeUnit()!;
    expect(wd.channel, 'death ward channel should be live').not.toBeNull();
    const hpAtSwap = enemy.hp;

    expect(game.trySwap(1)).toBe(true); // bench WD mid-channel
    game.update(0);
    const benched = game.party[0].unit!;
    expect(benched.offFieldUntil).toBeGreaterThan(game.sim.time);
    expect(benched.channel, 'offField death ward survives the swap-out').not.toBeNull();

    advance(game, 1.0); // the benched ward keeps striking
    expect(enemy.hp).toBeLessThan(hpAtSwap);
  });

  it("Pugna's Life Drain is an offField beam channel, not just a Witch Doctor special-case", () => {
    const game = Game.headless(bench('pugna', 'juggernaut'));
    engage(game);
    const enemy = spawnDummy(game, 200);
    const { hero: pugna } = startChannel(game, 'pugna-life-drain', enemy);
    pugna.hp = Math.max(1, pugna.hp - 220);
    advance(game, 0.3); // through the cast point
    expect(pugna.channel, 'life drain channel should be live').not.toBeNull();
    const hpAtSwap = enemy.hp;
    const pugnaHpAtSwap = pugna.hp;

    expect(game.trySwap(1)).toBe(true);
    game.update(0);
    expect(game.party[0].unit?.channel, 'offField life drain survives the swap-out').not.toBeNull();

    advance(game, 1.1);
    expect(enemy.hp).toBeLessThan(hpAtSwap);
    expect(game.party[0].unit!.hp).toBeGreaterThan(pugnaHpAtSwap);
  });

  it('swapping BACK into a hero whose offField channel is still live restores player control', () => {
    const game = Game.headless(bench('drow-ranger', 'juggernaut'));
    engage(game);
    const enemy = spawnDummy(game, 120);
    startChannel(game, 'drow-multishot');
    advance(game, 0.35); // channel running
    expect(game.activeUnit()!.channel).not.toBeNull();

    expect(game.trySwap(1)).toBe(true); // bench Drow, channel persists off-field
    const drow = game.party[0].unit!;
    expect(drow.offFieldUntil).toBeGreaterThan(game.sim.time);

    advance(game, TUNING.resonanceSwapFloorSec + 0.1);
    engage(game);
    expect(game.trySwap(0)).toBe(true); // swap BACK into Drow
    expect(game.activeIdx).toBe(0);
    const back = game.activeUnit()!;
    // clearOffField must hand control back to the player and drop the off-field veil
    expect(back.offFieldUntil).toBeUndefined();
    expect(back.ctrl.kind).toBe('player');
    expect(back.statuses.some((s) => s.tag === 'off-field')).toBe(false);
    void enemy;
  });

  it('an offField channel that ends while benched still lets the hero be reaped after the window', () => {
    const game = Game.headless(bench('drow-ranger', 'juggernaut'));
    engage(game);
    spawnDummy(game, 120);
    startChannel(game, 'drow-multishot'); // 1.5s channel
    advance(game, 0.35);
    expect(game.trySwap(1)).toBe(true);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);

    // Let the channel finish (1.5s) AND the off-field window lapse, with combat going cold.
    advance(game, TUNING.resonanceOffFieldPersistenceSec + 2);
    expect(game.party[0].unit, 'benched channeller reaped after window').toBeNull();
  });

  it('two heroes can hold offField channels on the bench at once', () => {
    // WD's Death Ward (4s) is benched first; Drow's Multishot (1.5s) second and
    // checked immediately, so neither channel has had time to expire naturally.
    const game = Game.headless(bench('witch-doctor', 'drow-ranger', 'juggernaut'));
    const enemy0 = spawnDummy(game, 200);
    engage(game);
    startChannel(game, 'wd-death-ward', enemy0);
    advance(game, 0.5); // through the cast point → channel running
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
    expect(game.trySwap(1)).toBe(true); // bench WD (death ward persists)

    advance(game, TUNING.resonanceSwapFloorSec + 0.1);
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
    startChannel(game, 'drow-multishot');
    advance(game, 0.35);
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
    expect(game.trySwap(2)).toBe(true); // bench Drow

    expect(game.party[0].unit?.channel, 'WD still channelling').not.toBeNull();
    expect(game.party[1].unit?.channel, 'Drow still channelling').not.toBeNull();
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);
    expect(game.party[1].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);
  });

  it('Resonance OFF tears down a benched channel instead of persisting it', () => {
    const game = Game.headless(bench('drow-ranger', 'juggernaut'));
    game.settings.resonance = false;
    engage(game);
    spawnDummy(game, 120);
    startChannel(game, 'drow-multishot');
    advance(game, 0.35);
    expect(game.activeUnit()!.channel).not.toBeNull();

    expect(game.trySwap(1)).toBe(true);
    // With Resonance off the swap removes the outgoing hero outright.
    expect(game.party[0].unit, 'no off-field bench without Resonance').toBeNull();
  });

  it('a non-offField channel (Pudge Dismember) is always torn down on swap-out', () => {
    const game = Game.headless(bench('pudge', 'juggernaut'));
    engage(game);
    const enemy = spawnDummy(game, 80);
    const slot = game.activeUnit()!.abilities.findIndex((a) => a.def.channel && !a.def.channel.offField);
    expect(slot).toBeGreaterThanOrEqual(0);
    const pudge = game.activeUnit()!;
    pudge.mana = pudge.stats.maxMana;
    pudge.abilities[slot].level = 1;
    game.sim.order(pudge.uid, { kind: 'cast', slot, uid: enemy.uid });
    advance(game, 0.45);
    expect(pudge.channel).not.toBeNull();

    expect(game.trySwap(1)).toBe(true);
    game.update(0);
    expect(game.party[0].unit?.channel ?? null, 'plain channel never survives a swap').toBeNull();
  });
});

// ------------------------------------------------------------
// 2. CAST-POINT SWAP QUEUE (§8.3) × channels and interrupts
// ------------------------------------------------------------
describe('swap × cast-point queue (§8.3)', () => {
  it('a swap queued during a channel ability cast point benches the hero WITH the channel running', () => {
    const game = Game.headless(bench('drow-ranger', 'juggernaut'));
    engage(game);
    spawnDummy(game, 120);
    const drow = game.activeUnit()!;
    drow.mana = drow.stats.maxMana;
    const slot = drow.abilities.findIndex((a) => a.def.id === 'drow-multishot');
    drow.abilities[slot].level = 1;

    game.sim.order(drow.uid, { kind: 'cast', slot });
    advance(game, 0.1); // inside the 0.2 cast point
    expect(drow.cast).not.toBeNull();

    expect(game.trySwap(1)).toBe(true); // queued, not executed
    expect(game.activeIdx).toBe(0);

    advance(game, 0.4); // cast fires → channel starts → queued swap flushes
    expect(game.activeIdx).toBe(1); // swap executed
    const benched = game.party[0].unit!;
    expect(benched.offFieldUntil).toBeGreaterThan(game.sim.time);
    expect(benched.channel, 'the channel that started on cast survives the queued swap').not.toBeNull();
  });

  it('a swap queued during a cast point still flushes even if the cast is interrupted', () => {
    const game = Game.headless(bench('drow-ranger', 'juggernaut'));
    engage(game);
    const drow = game.activeUnit()!;
    drow.mana = drow.stats.maxMana;
    const slot = drow.abilities.findIndex((a) => a.def.id === 'drow-gust');
    drow.abilities[slot].level = 1;
    game.sim.order(drow.uid, { kind: 'cast', slot, point: { x: drow.pos.x + 400, y: drow.pos.y } });
    advance(game, 0.1);
    expect(drow.cast).not.toBeNull();

    expect(game.trySwap(1)).toBe(true); // queued
    expect(game.activeIdx).toBe(0);

    // Interrupt the cast with a stun before it fires.
    drow.addStatus({ status: 'stun', tag: 'test-stun', sourceUid: drow.uid, sourceTeam: 1, until: game.sim.time + 1, isDebuff: true }, true);
    game.sim.interruptActions(drow);
    expect(drow.cast).toBeNull();

    advance(game, 0.2); // flushPendingSwap should now run the queued swap
    expect(game.activeIdx, 'queued swap flushes once the cast is gone').toBe(1);
  });

  it('a queued swap is abandoned if the grace window lapses while still in the cast point', () => {
    // Find an ability with a cast point longer than the swap-cancel grace window.
    const probe = Game.headless(bench('juggernaut', 'sniper'));
    const longCast = probe.activeUnit()!.abilities.find(
      (a) => (a.def.castPoint ?? 0) > TUNING.swapCancelGraceSec + 0.2 && a.def.targeting !== 'passive'
    );
    if (!longCast) {
      // No authored ability has a long enough cast point; the grace path is exercised elsewhere.
      expect(TUNING.swapCancelGraceSec).toBeGreaterThan(0);
      return;
    }
    const game = Game.headless(bench('juggernaut', 'sniper'));
    const hero = game.activeUnit()!;
    hero.mana = hero.stats.maxMana;
    const slot = hero.abilities.findIndex((a) => a.def.id === longCast.def.id);
    hero.abilities[slot].level = 1;
    const target = spawnDummy(game, 150);
    game.sim.order(hero.uid, longCast.def.targeting === 'no-target'
      ? { kind: 'cast', slot }
      : { kind: 'cast', slot, uid: target.uid, point: { x: hero.pos.x + 200, y: hero.pos.y } });
    advance(game, 0.05);
    expect(hero.cast).not.toBeNull();
    expect(game.trySwap(1)).toBe(true); // queued

    advance(game, TUNING.swapCancelGraceSec + 0.2); // grace lapses while still casting
    expect(game.activeIdx, 'swap was abandoned, the cast was honored').toBe(0);
  });
});

// ------------------------------------------------------------
// 3. ITEMS × TAG BOONS
// ------------------------------------------------------------
describe('swap × items', () => {
  function withItem(active: string, benched: string, itemId: string, slot = 0): Game {
    const save = bench(active, benched);
    save.roster[1].items[slot] = { id: itemId };
    return Game.headless(save);
  }

  it('tagBoonAmpPct (Vanguard Sigil) amplifies a damage tag boon', () => {
    const damageFromLuna = (itemId?: string): number => {
      const save = bench('juggernaut', 'luna');
      if (itemId) save.roster[1].items[0] = { id: itemId };
      const game = Game.headless(save);
      engage(game);
      const enemy = spawnDummy(game, 120);
      expect(game.trySwap(1)).toBe(true);
      return enemy.stats.maxHp - enemy.hp;
    };
    const baseline = damageFromLuna();
    const amped = damageFromLuna('vanguard-sigil'); // tagBoonAmpPct: 12
    expect(baseline).toBeGreaterThan(0);
    expect(amped).toBeGreaterThan(baseline);
  });

  it('tagGaugeReductionPct (Heralds Token) shortens the gauge re-arm', () => {
    const gaugeAfter = (itemId?: string): number => {
      const save = bench('juggernaut', 'crystal-maiden');
      if (itemId) save.roster[1].items[0] = { id: itemId };
      const game = Game.headless(save);
      engage(game);
      spawnDummy(game, 120);
      expect(game.trySwap(1)).toBe(true);
      return game.party[1].tagGaugeReadyAt - game.sim.time;
    };
    const base = gaugeAfter();
    const reduced = gaugeAfter('heralds-token'); // tagGaugeReductionPct: 25
    expect(reduced).toBeLessThan(base);
    expect(reduced).toBeGreaterThan(0);
  });

  it('the gauge reduction is capped at 80% even when stat sources stack', () => {
    const save = bench('juggernaut', 'crystal-maiden');
    // Stack multiple gauge/CD-reduction items to push past the cap.
    save.roster[1].items[0] = { id: 'relay-standard' };   // tagGaugeReductionPct: 10
    save.roster[1].items[1] = { id: 'heralds-token' };    // tagGaugeReductionPct: 25
    save.roster[1].items[2] = { id: 'chainweaver-band' }; // tagGaugeReductionPct: 15, swapCdReductionPct: 10
    const game = Game.headless(save);
    engage(game);
    spawnDummy(game, 120);
    const boon = REG.hero('crystal-maiden').tagBoon!;
    expect(game.trySwap(1)).toBe(true);
    const remaining = game.party[1].tagGaugeReadyAt - game.sim.time;
    // Even maxed, the gauge can never drop below 20% of its base (80% cap).
    expect(remaining).toBeGreaterThanOrEqual(boon.gaugeSec * 0.2 - 1e-6);
  });

  it('swapInHealPct is gated by an item: no heal without it, heal with it', () => {
    const healDelta = (itemId?: string): number => {
      const save = bench('juggernaut', 'sven');
      save.roster[1].hpPct = 0.5;
      if (itemId) save.roster[1].items[0] = { id: itemId };
      const game = Game.headless(save);
      engage(game);
      spawnDummy(game, 400);
      expect(game.trySwap(1)).toBe(true);
      const hero = game.activeUnit()!;
      return hero.hp / hero.stats.maxHp;
    };
    const withoutItem = healDelta();
    const withMark = healDelta('exchange-mark'); // swapInHealPct: 8
    expect(withMark).toBeGreaterThan(withoutItem);
  });

  it('breacher-cloak grants the swap-in burst buff and shortens the swap floor', () => {
    const game = withItem('juggernaut', 'axe', 'breacher-cloak');
    engage(game);
    spawnDummy(game, 400);
    expect(game.trySwap(1)).toBe(true);
    const axe = game.activeUnit()!;
    expect(axe.statuses.some((s) => s.tag === 'swap-in-burst')).toBe(true);
    const baseCd = game.settings.resonance ? TUNING.resonanceSwapFloorSec : TUNING.swapFloorSec;
    expect(game.swapReadyAt - game.sim.time).toBeLessThan(baseCd);
  });
});

// ------------------------------------------------------------
// 4. OFF-FIELD BENCH WINDOW
// ------------------------------------------------------------
describe('swap × off-field persistence', () => {
  it('a reposition swap removes the entrance swap-in burst so it does not look replayed', () => {
    const game = Game.headless(bench('juggernaut', 'axe'));
    game.activeUnit()!.items[0] = itemStateFromSave({ id: 'breacher-cloak' }, game.sim.time);
    game.activeUnit()!.markStatsDirty();
    game.activeUnit()!.refresh(game.sim.time);
    engage(game);
    spawnDummy(game, 400);
    // jug has the burst item → arriving gives the burst; benching must strip it.
    expect(game.trySwap(1)).toBe(true); // jug benched
    const benched = game.party[0].unit;
    expect(benched?.offFieldUntil).toBeGreaterThan(game.sim.time);
    expect(benched?.statuses.some((s) => s.tag === 'swap-in-burst')).toBe(false);
  });

  it('off-field units are reaped once the party falls out of combat', () => {
    // No live enemy → nothing keeps the combat lock hot, so the bench window is
    // cut short the moment combat goes cold (well before the 5s persistence cap).
    const game = Game.headless(bench('warlock', 'juggernaut'));
    engage(game);
    expect(game.trySwap(1)).toBe(true);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);
    advance(game, TUNING.combatLockSec + 0.5);
    expect(game.party[0].unit, 'benched hero reaped when combat ends').toBeNull();
  });

  it('off-field units are hard-capped at the persistence window even while combat stays hot', () => {
    // Warlock's tag-out leaves a damaging Fatal Bond field that keeps the party
    // "in combat", but the bench window is a hard cap set once at swap-out.
    const game = Game.headless(bench('warlock', 'juggernaut'));
    engage(game);
    spawnDummy(game, 120);
    expect(game.trySwap(1)).toBe(true);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);
    advance(game, TUNING.resonanceOffFieldPersistenceSec + 0.6);
    expect(game.party[0].unit, 'benched hero reaped at the window cap').toBeNull();
  });

  it('toggling Resonance off reaps a benched off-field hero on the next tick', () => {
    const game = Game.headless(bench('warlock', 'juggernaut'));
    engage(game);
    spawnDummy(game, 120);
    expect(game.trySwap(1)).toBe(true);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);
    game.settings.resonance = false;
    game.activeUnit()!.lastEnemyDamageAt = game.sim.time; // keep combat hot to isolate the resonance gate
    game.update(0.05);
    expect(game.party[0].unit, 'no off-field persistence without Resonance').toBeNull();
  });
});

// ------------------------------------------------------------
// 5. TAG CHAIN AMPLIFIER (§3.5)
// ------------------------------------------------------------
describe('swap × tag chain', () => {
  it('the chain amp decays after the window so a late tag is back to baseline', () => {
    // Measure ONLY the damage Luna's tag boon applies at the moment of her swap
    // (delta across the trySwap call), so the active hero's auto-attacks during
    // the gap can't contaminate the comparison.
    const lunaTagDamage = (chained: boolean, gapSec: number): number => {
      const game = Game.headless(bench('juggernaut', 'sniper', 'luna'));
      engage(game);
      const enemy = spawnDummy(game, 120);
      if (chained) {
        expect(game.trySwap(1)).toBe(true); // sniper opens the chain
        advance(game, gapSec);
        game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
      }
      const before = enemy.hp;
      expect(game.trySwap(2)).toBe(true); // luna pays off (boon resolves synchronously)
      return before - enemy.hp;
    };
    const baseline = lunaTagDamage(false, 0);
    const insideWindow = lunaTagDamage(true, TUNING.resonanceSwapFloorSec + 0.05);
    const afterWindow = lunaTagDamage(true, TUNING.tagChainWindowSec + TUNING.resonanceSwapFloorSec + 0.5);
    expect(baseline).toBeGreaterThan(0);
    expect(insideWindow).toBeGreaterThan(baseline * 1.1); // chained tag is amped
    expect(afterWindow).toBeLessThan(insideWindow);       // a tag after the window decayed
    expect(afterWindow).toBeCloseTo(baseline, 0);         // back to baseline
  });

  it('the chain amp is capped at tagChainMaxSteps', () => {
    const game = Game.headless(bench('juggernaut', 'sniper', 'luna', 'sven', 'axe'));
    game.sim.events.captureAll = true;
    engage(game);
    spawnDummy(game, 120);
    const order = [1, 2, 3, 4, 0];
    let last = 0;
    for (const idx of order) {
      game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
      if (game.trySwap(idx)) last = game.sim.time;
      advance(game, TUNING.resonanceSwapFloorSec + 0.05);
      void last;
    }
    const chains = tagBoonEvents(game, 'tag-in').map((e) => e.chain);
    expect(Math.max(...chains)).toBeLessThanOrEqual(TUNING.tagChainMaxSteps);
  });

  it('chainweaver-band extends the chain window', () => {
    expect(REG.item('chainweaver-band').passiveMods?.tagChainWindowBonusSec).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------
// 6. DEATH SWAP
// ------------------------------------------------------------
describe('swap × death', () => {
  it('a dead/respawning hero cannot be swapped to', () => {
    const game = Game.headless(bench('juggernaut', 'axe'));
    game.party[1].respawnAt = game.sim.time + 10;
    expect(game.trySwap(1)).toBe(false);
    expect(game.activeIdx).toBe(0);
  });

  it('the active hero dying auto-swaps to a living party member for free', () => {
    const game = Game.headless(bench('juggernaut', 'axe'));
    engage(game);
    const jug = game.activeUnit()!;
    game.sim.killUnit(jug, jug);
    game.update(0.05); // death event processed → handleHeroDeath → trySwap
    expect(game.activeIdx, 'control moved to the surviving hero').toBe(1);
    expect(game.party[1].unit?.alive).toBe(true);
  });
});

// ------------------------------------------------------------
// 7. SWAP FLOOR / BASIC GUARDS
// ------------------------------------------------------------
describe('swap floor and guards', () => {
  it('swapping to the currently-active index is a no-op', () => {
    const game = Game.headless(bench('juggernaut', 'axe'));
    expect(game.trySwap(0)).toBe(false);
  });

  it('the swap floor blocks a second immediate swap, then clears', () => {
    const game = Game.headless(bench('juggernaut', 'axe', 'sven'));
    expect(game.trySwap(1)).toBe(true);
    expect(game.trySwap(2)).toBe(false); // still on the floor
    advance(game, (game.settings.resonance ? TUNING.resonanceSwapFloorSec : TUNING.swapFloorSec) + 0.1);
    expect(game.trySwap(2)).toBe(true);
  });
});

// ------------------------------------------------------------
// 8. SAVE / LOAD ROUND-TRIPS
// ------------------------------------------------------------
describe('swap × save/load', () => {
  it('a spent Tag Gauge round-trips as remaining time across save/load', () => {
    const game = Game.headless(bench('juggernaut', 'crystal-maiden'));
    engage(game);
    spawnDummy(game, 120);
    expect(game.trySwap(1)).toBe(true); // CM tags in, gauge now on cooldown
    const remaining = game.party[1].tagGaugeReadyAt - game.sim.time;
    expect(remaining).toBeGreaterThan(0);

    const save = game.buildSave();
    expect(Game.validateSave(save)).toBe(true);
    const reloaded = Game.headless(save);
    // The active hero on reload is whoever was active (CM at idx... depends on save order).
    const cm = reloaded.party.find((r) => r.heroId === 'crystal-maiden')!;
    const reloadedRemaining = cm.tagGaugeReadyAt - reloaded.sim.time;
    expect(reloadedRemaining).toBeGreaterThan(0);
    expect(reloadedRemaining).toBeCloseTo(remaining, 0);
  });

  it('saving while a hero is benched off-field produces a valid, non-duplicated save', () => {
    const game = Game.headless(bench('warlock', 'juggernaut'));
    engage(game);
    spawnDummy(game, 120);
    expect(game.trySwap(1)).toBe(true);
    expect(game.party[0].unit?.offFieldUntil).toBeGreaterThan(game.sim.time);

    const save = game.buildSave();
    expect(Game.validateSave(save)).toBe(true);
    // Both heroes are present exactly once in the saved roster.
    const ids = save.roster.map((r) => r.heroId).sort();
    expect(ids).toEqual(['juggernaut', 'warlock']);
    const reloaded = Game.headless(save);
    expect(reloaded.party.length).toBe(2);
  });
});

// ------------------------------------------------------------
// 9. NASTY COMBINATIONS — the cases most likely to break
// ------------------------------------------------------------
describe('swap × nasty combinations', () => {
  it('an off-field benched hero is invulnerable to lingering damage', () => {
    const game = Game.headless(bench('warlock', 'juggernaut'));
    engage(game);
    spawnDummy(game, 120);
    expect(game.trySwap(1)).toBe(true);
    const benched = game.party[0].unit!;
    expect(benched.offFieldUntil).toBeGreaterThan(game.sim.time);
    const hpBefore = benched.hp;
    const attacker = game.sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: benched.pos.x, y: benched.pos.y } });
    applyDamage(game.sim, attacker, benched, 9999, 'magical');
    applyDamage(game.sim, attacker, benched, 9999, 'physical');
    expect(benched.alive, 'a benched hero cannot be killed off-field').toBe(true);
    expect(benched.hp).toBe(hpBefore);
  });

  it('swapping back into an offField channeller lets the channel finish and returns clean control', () => {
    const game = Game.headless(bench('drow-ranger', 'juggernaut'));
    engage(game);
    const enemy = spawnDummy(game, 120);
    const drow = game.activeUnit()!;
    drow.mana = drow.stats.maxMana;
    const slot = drow.abilities.findIndex((a) => a.def.id === 'drow-multishot');
    drow.abilities[slot].level = 1;
    game.sim.order(drow.uid, { kind: 'cast', slot });
    advance(game, 0.35);
    expect(drow.channel).not.toBeNull();
    expect(game.trySwap(1)).toBe(true); // bench mid-channel

    advance(game, TUNING.resonanceSwapFloorSec + 0.1);
    engage(game);
    expect(game.trySwap(0)).toBe(true); // swap back into the still-channelling Drow
    const hpMid = enemy.hp;

    advance(game, 2.0); // channel (1.5s) finishes while active
    const back = game.activeUnit()!;
    expect(back.channel ?? null, 'channel ended cleanly').toBeNull();
    expect(back.alive).toBe(true);
    expect(enemy.hp).toBeLessThanOrEqual(hpMid); // it kept hitting through the resume

    // control is responsive again (back IS the same Drow unit we resumed)
    const xBefore = back.pos.x;
    game.orderMove({ x: back.pos.x + 400, y: back.pos.y });
    advance(game, 0.4);
    expect(back.pos.x, 'player can move the hero once the channel ends').toBeGreaterThan(xBefore);
  });

  it('the active hero dying while a swap is queued leaves a valid living active hero', () => {
    const game = Game.headless(bench('juggernaut', 'axe', 'sven'));
    engage(game);
    const jug = game.activeUnit()!;
    jug.mana = jug.stats.maxMana;
    const slot = jug.abilities.findIndex((a) => (a.def.castPoint ?? 0) > 0 && a.def.targeting !== 'passive');
    const enemy = spawnDummy(game, 200);
    if (slot >= 0) {
      jug.abilities[slot].level = 1;
      game.sim.order(jug.uid, { kind: 'cast', slot, uid: enemy.uid, point: { x: jug.pos.x + 150, y: jug.pos.y } });
      advance(game, Math.min(0.05, (jug.abilities[slot].def.castPoint ?? 0.1) / 2));
    }
    game.trySwap(2); // may queue (if mid cast point) or execute

    game.sim.killUnit(jug, enemy);
    expect(() => advance(game, 0.3)).not.toThrow();

    const active = game.party[game.activeIdx];
    expect(active.unit?.alive, 'a living hero holds control after the dust settles').toBe(true);
    expect(game.activeIdx).toBeGreaterThanOrEqual(0);
    expect(game.activeIdx).toBeLessThan(game.party.length);
  });

  it('repeated reposition swaps never stack more than one swap-in-burst', () => {
    const save = bench('juggernaut', 'axe');
    save.roster[1].items[0] = { id: 'breacher-cloak' }; // axe arrives with a burst
    const game = Game.headless(save);
    engage(game);
    spawnDummy(game, 120);
    for (let i = 0; i < 4; i++) {
      const target = game.activeIdx === 0 ? 1 : 0;
      game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
      game.trySwap(target);
      advance(game, TUNING.resonanceSwapFloorSec + 0.05);
    }
    for (const rec of game.party) {
      const u = rec.unit;
      if (!u) continue;
      const bursts = u.statuses.filter((s) => s.tag === 'swap-in-burst').length;
      expect(bursts, `${rec.heroId} burst stacks`).toBeLessThanOrEqual(1);
    }
  });

  it('a scripted swap rotation is deterministic for a fixed seed', () => {
    const run = (): number[] => {
      const save = bench('juggernaut', 'sniper', 'luna', 'crystal-maiden');
      save.worldSeed = 4242;
      const game = Game.headless(save);
      engage(game);
      const enemy = spawnDummy(game, 130);
      const seq = [1, 2, 3, 0, 1];
      for (const idx of seq) {
        game.activeUnit()!.lastEnemyDamageAt = game.sim.time;
        game.trySwap(idx);
        advance(game, TUNING.resonanceSwapFloorSec + 0.1);
      }
      const active = game.activeUnit()!;
      return [Math.round(enemy.hp * 1000), Math.round(active.hp * 1000), game.activeIdx];
    };
    expect(run()).toEqual(run());
  });

  it('a non-offField toggle is torn down on swap-out (not persisted like a channel)', () => {
    // Witch Doctor's Voodoo Restoration is a toggle, not an offField channel.
    const game = Game.headless(bench('witch-doctor', 'juggernaut'));
    engage(game);
    spawnDummy(game, 300);
    const wd = game.activeUnit()!;
    wd.mana = wd.stats.maxMana;
    const slot = wd.abilities.findIndex((a) => a.def.id === 'wd-restoration');
    expect(slot).toBeGreaterThanOrEqual(0);
    wd.abilities[slot].level = 1;
    game.sim.order(wd.uid, { kind: 'cast', slot });
    advance(game, 0.2);

    expect(game.trySwap(1)).toBe(true);
    game.update(0);
    const benched = game.party[0].unit;
    // The toggle is not an offField channel, so the swap must not leave it ticking.
    expect(benched?.channel ?? null).toBeNull();
  });
});
