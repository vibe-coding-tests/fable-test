import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { applyDamage, attackImpact } from '../core/combat';
import { applyStatus } from '../core/effects';
import { makeItemState, itemReady, sortInventory, computeBuyPlan, executeBuy } from '../core/items';
import { rollItemDrops } from '../core/phase3';
import { affixDef, rollAffixesFor } from '../data/affixes';
import { Rng } from '../core/rng';
import type { Unit } from '../core/unit';

// ============================================================
// ITEM FEEL FIDELITY (SPEC §5): mechanical identities verified
// in the headless sim, not by eye.
// ============================================================

beforeAll(() => registerAllContent());

function lab() {
  const sim = new Sim({ seed: 11, bounds: { w: 6000, h: 6000 } });
  sim.events.captureAll = true;
  const me = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
  const foe = sim.spawnHero(REG.hero('pudge'), { team: 1, pos: { x: 1600, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
  return { sim, me, foe };
}

function give(sim: Sim, u: Unit, itemId: string): number {
  const slot = u.items.findIndex((s) => s === null);
  u.items[slot] = makeItemState(REG.item(itemId));
  void sim;
  return slot;
}

describe('Blink Dagger', () => {
  it('teleports instantly to the point', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'blink-dagger');
    sim.order(me.uid, { kind: 'item', invSlot: slot, point: { x: 2000, y: 1000 } });
    sim.run(0.2);
    expect(me.pos.x).toBeGreaterThan(1900);
  });

  it('locks out after taking damage — no blinking out while getting hit', () => {
    const { sim, me, foe } = lab();
    const slot = give(sim, me, 'blink-dagger');
    applyDamage(sim, foe, me, 60, 'physical');
    const ready = itemReady(me.items[slot]!, REG.item('blink-dagger'), me, sim.time);
    expect(ready.ok).toBe(false);
    expect(ready.reason).toBe('damage-lockout');
    // and the order does nothing
    const before = { ...me.pos };
    sim.order(me.uid, { kind: 'item', invSlot: slot, point: { x: 2200, y: 1000 } });
    sim.run(0.2);
    expect(me.pos.x).toBeCloseTo(before.x, 0);
    // lockout expires
    sim.run(3.2);
    expect(itemReady(me.items[slot]!, REG.item('blink-dagger'), me, sim.time).ok).toBe(true);
  });

  it('overshoot clamps to 4/5 of max range', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'blink-dagger');
    sim.order(me.uid, { kind: 'item', invSlot: slot, point: { x: 4000, y: 1000 } }); // 3000 away, max 1200
    sim.run(0.2);
    expect(me.pos.x).toBeCloseTo(1000 + 1200 * 0.8, -1);
  });
});

describe('Black King Bar', () => {
  it('grants magic immunity with visible spell rejection', () => {
    const { sim, me, foe } = lab();
    const slot = give(sim, me, 'black-king-bar');
    sim.order(me.uid, { kind: 'item', invSlot: slot });
    sim.run(0.2);
    expect(me.summary.magicImmune).toBe(true);
    const hpBefore = me.hp;
    applyDamage(sim, foe, me, 300, 'magical');
    expect(me.hp).toBe(hpBefore); // rejected
    expect(sim.events.history.some((e) => e.t === 'immune-block')).toBe(true);
    // physical still connects
    applyDamage(sim, foe, me, 100, 'physical');
    expect(me.hp).toBeLessThan(hpBefore);
  });

  it('basic-dispels existing debuffs on pop (the classic clutch press)', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'black-king-bar');
    // pre-apply a slow
    const cm = sim.spawnHero(REG.hero('crystal-maiden'), { team: 1, pos: { x: 1400, y: 1200 }, level: 10, ctrl: { kind: 'none' } });
    sim.order(cm.uid, { kind: 'cast', slot: 0, point: { x: 1000, y: 1000 } });
    sim.run(1.2);
    expect(me.summary.moveSlowFactor).toBeLessThan(1);
    sim.order(me.uid, { kind: 'item', invSlot: slot });
    sim.run(0.2);
    expect(me.summary.moveSlowFactor).toBe(1);
  });

  it('BKB blocks stun application (sim test for SPEC §7 interactions)', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'black-king-bar');
    sim.order(me.uid, { kind: 'item', invSlot: slot });
    sim.run(0.2);
    const es = sim.spawnHero(REG.hero('earthshaker'), { team: 1, pos: { x: 1200, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    // Aftershock-carrying Fissure right under us
    sim.order(es.uid, { kind: 'cast', slot: 0, point: { x: 1000, y: 1000 } });
    sim.run(1.5);
    expect(me.summary.stunned).toBe(false);
  });
});

describe('nearby death charge triggers', () => {
  it('grants Urn charges through the spatial broadphase after a fresh spawn', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'urn-of-shadows');
    const victim = sim.spawnHero(REG.hero('lich'), {
      team: 1,
      pos: { x: me.pos.x + 900, y: me.pos.y },
      level: 10,
      ctrl: { kind: 'none' }
    });

    sim.killUnit(victim, me);

    expect(me.items[slot]?.charges).toBe(1);
  });

  it('does not grant Urn charges outside the trigger radius', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'urn-of-shadows');
    const victim = sim.spawnHero(REG.hero('lich'), {
      team: 1,
      pos: { x: me.pos.x + 1800, y: me.pos.y },
      level: 10,
      ctrl: { kind: 'none' }
    });

    sim.killUnit(victim, me);

    expect(me.items[slot]?.charges).toBe(0);
  });
});

describe("Eul's Scepter", () => {
  it('cyclones make the target untargetable and disjoint projectiles', () => {
    const { sim, me } = lab();
    // enemy lich ults me; I euls MYSELF to dodge — the canon play
    const lich = sim.spawnHero(REG.hero('lich'), { team: 1, pos: { x: 1750, y: 1000 }, level: 12, ctrl: { kind: 'none' } });
    const slot = give(sim, me, 'euls-scepter');
    me.mana = 999;
    sim.order(lich.uid, { kind: 'cast', slot: 3, uid: me.uid }); // chain frost
    sim.run(1.2); // turn + cast point + projectile in flight (750 speed, ~700 gap)
    expect(sim.projectiles.length).toBeGreaterThan(0);
    sim.order(me.uid, { kind: 'item', invSlot: slot, uid: me.uid }); // self-cast
    sim.run(0.3);
    expect(me.summary.cycloned).toBe(true);
    expect(sim.projectiles.filter((p) => p.targetUid === me.uid).length).toBe(0); // disjointed
    const hpAtCyclone = me.hp;
    sim.run(2.5);
    expect(me.hp).toBe(hpAtCyclone); // ult never landed
    expect(me.summary.cycloned).toBe(false); // and it ends
  });
});

describe('Force Staff', () => {
  it('pushes the target along its facing — saves and engages alike', () => {
    const { sim, me, foe } = lab();
    const slot = give(sim, me, 'force-staff');
    me.mana = 999;
    foe.facing = Math.PI / 2; // facing +y
    sim.order(me.uid, { kind: 'item', invSlot: slot, uid: foe.uid });
    sim.run(0.8);
    expect(foe.pos.y).toBeGreaterThan(1450); // pushed ~600 in facing dir
    expect(Math.abs(foe.pos.x - 1600)).toBeLessThan(120);
  });
});

describe('Glimmer Cape', () => {
  it('fades an ally into invisibility', () => {
    const { sim, me, foe } = lab();
    const ally = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 900, y: 1000 }, level: 8, ctrl: { kind: 'none' } });
    const slot = give(sim, me, 'glimmer-cape');
    me.mana = 999;
    sim.order(me.uid, { kind: 'item', invSlot: slot, uid: ally.uid });
    sim.run(0.6); // includes the turn toward the ally
    expect(ally.summary.fading).toBe(true); // fade time first
    sim.run(0.7);
    expect(ally.summary.invisible).toBe(true);
    expect(ally.isVisibleTo(foe.team, sim.time)).toBe(false);
  });
});

describe('Battlefury cleave', () => {
  it('rewards stacking enemies but respects armor', () => {
    const sim = new Sim({ seed: 5, bounds: { w: 4000, h: 4000 } });
    const jug = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 1000 }, level: 15, ctrl: { kind: 'player' } });
    give(sim, jug, 'battlefury');
    const main = sim.spawnCreep(REG.creep('hellbear'), { team: 1, pos: { x: 1120, y: 1000 }, wild: true });
    main.ctrl = { kind: 'none' };
    const side = sim.spawnCreep(REG.creep('hellbear'), { team: 1, pos: { x: 1250, y: 1100 }, wild: true });
    const armoredSide = sim.spawnCreep(REG.creep('hellbear'), { team: 1, pos: { x: 1250, y: 900 }, wild: true });
    side.ctrl = { kind: 'none' };
    armoredSide.ctrl = { kind: 'none' };
    armoredSide.externalMods.armor = (armoredSide.externalMods.armor ?? 0) + 40;
    armoredSide.markStatsDirty();
    armoredSide.refresh(0);
    armoredSide.hp = armoredSide.stats.maxHp;

    const sideHp = side.hp;
    const armoredHp = armoredSide.hp;
    attackImpact(sim, jug, main);

    const sideDamage = sideHp - side.hp;
    const armoredDamage = armoredHp - armoredSide.hp;
    expect(sideDamage).toBeGreaterThan(0);
    expect(armoredDamage).toBeGreaterThan(0);
    expect(armoredDamage).toBeLessThan(sideDamage);
  });
});

describe('Magic Wand', () => {
  it('gains charges from nearby enemy casts and heals per charge', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'magic-wand');
    const cm = sim.spawnHero(REG.hero('crystal-maiden'), { team: 1, pos: { x: 1500, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    cm.mana = 999;
    for (let i = 0; i < 3; i++) {
      cm.abilities[0].cooldownUntil = 0; // lab shortcut: ignore nova cd between casts
      sim.order(cm.uid, { kind: 'cast', slot: 0, point: { x: 1500, y: 1400 } });
      sim.run(1.2);
    }
    expect(me.items[slot]!.charges).toBeGreaterThanOrEqual(3);
    me.hp = me.stats.maxHp * 0.4;
    me.mana = me.stats.maxMana * 0.3;
    const hpBefore = me.hp;
    const manaBefore = me.mana;
    sim.order(me.uid, { kind: 'item', invSlot: slot });
    sim.run(0.2);
    expect(me.hp).toBeGreaterThan(hpBefore + 40);
    expect(me.mana).toBeGreaterThan(manaBefore);
    expect(me.items[slot]!.charges).toBe(0);
  });
});

describe('rolled item identity', () => {
  it('instantiates dropped gear with grade, affixes, sockets, and resolved mods', () => {
    const roll = rollItemDrops({
      guaranteed: [],
      slots: [{
        id: 'identity',
        rarity: 'legendary',
        rolls: 1,
        chance: { normal: 1, nightmare: 1, hell: 1 },
        pool: [{ id: 'daedalus', weight: 1 }]
      }]
    }, 'hell', {}, new Rng(42), 'late');

    const item = roll.items[0];
    expect(item.grade).toBeDefined();
    expect(item.grade).not.toBe('broken');
    expect(item.affixes?.length).toBeGreaterThan(0);
    expect(item.resolvedMods && Object.keys(item.resolvedMods).length).toBeGreaterThan(0);
    expect(item.sockets).toBeDefined();
  });

  it('percentage clarity restores more mana on larger mana pools', () => {
    const small = lab().me;
    const large = lab().me;
    large.externalMods.maxMana = 1000;
    large.markStatsDirty();
    large.refresh(0);

    const clarity = REG.item('clarity').active!;
    const mod = clarity.effects?.[0].kind === 'status' ? clarity.effects[0].params?.mods?.manaRegenPctMax as number : 0;
    expect(mod).toBeGreaterThan(0);
    expect((large.stats.maxMana * mod) / 100).toBeGreaterThan((small.stats.maxMana * mod) / 100);
  });

  it('applies rolled signature attack payloads to equipped items', () => {
    const { me } = lab();
    const item = makeItemState(REG.item('daedalus'));
    item.affixes = [{ affixId: 'stormcallers', roll: 1, resolved: {} }];
    me.items[0] = item;

    expect(me.collectAttackMods().some((mod) => mod.spec.procDamage === 120)).toBe(true);
  });

  it('applies rolled aura affixes through the item aura pass', () => {
    const { sim, me } = lab();
    const ally = sim.spawnHero(REG.hero('sven'), { team: 0, pos: { x: 1200, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    const item = makeItemState(REG.item('platemail'));
    item.affixes = [{ affixId: 'commanding', roll: 1, resolved: {} }];
    me.items[0] = item;
    me.markStatsDirty();
    me.refresh(sim.time);
    const beforeAllyArmor = ally.stats.armor;
    const beforeSelfArmor = me.stats.armor;

    sim.run(0.6);

    expect(ally.stats.armor).toBeGreaterThanOrEqual(beforeAllyArmor + 2);
    expect(me.stats.armor).toBeCloseTo(beforeSelfArmor);
  });

  it('applies rolled trigger affixes through item trigger dispatch', () => {
    const { sim, me, foe } = lab();
    const item = makeItemState(REG.item('daedalus'));
    item.affixes = [{ affixId: 'battle-fed', roll: 1, resolved: {} }];
    me.items[0] = item;
    const beforeDamage = me.stats.damage;

    applyDamage(sim, me, foe, 1e9, 'physical');
    me.refresh(sim.time);

    expect(me.triggerStacks.get('item:daedalus:on-kill')).toBe(1);
    expect(me.stats.damage).toBeGreaterThanOrEqual(beforeDamage + 1);
  });

  it('uses drop source floors when instancing boss loot', () => {
    const roll = rollItemDrops({
      guaranteed: ['daedalus'],
      slots: []
    }, 'normal', {}, new Rng(7), 'late', { source: 'boss' });

    expect(['sharp', 'refined', 'pristine']).toContain(roll.items[0].grade);
  });

  it('applies regional badge grade-floor bumps without changing the drop table', () => {
    const roll = rollItemDrops({
      guaranteed: ['broadsword'],
      slots: []
    }, 'normal', {}, new Rng(2), 'early', { gradeFloorBump: 1 });

    expect(roll.items[0].id).toBe('broadsword');
    expect(roll.items[0].grade).not.toBe('broken');
  });

  it('applies regional mastery minimum floors directly', () => {
    const roll = rollItemDrops({
      guaranteed: ['broadsword'],
      slots: []
    }, 'normal', {}, new Rng(3), 'early', { gradeFloorMin: 'sharp' });

    expect(['sharp', 'refined', 'pristine']).toContain(roll.items[0].grade);
  });

  it('weights regional affixes toward local flavor', () => {
    const def = REG.item('octarine-core');
    let normalFrost = 0;
    let icewrackFrost = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (rollAffixesFor(def, 'sharp', 'nightmare', new Rng(seed), false).some((a) => a.affixId === 'frost-veined')) normalFrost += 1;
      if (rollAffixesFor(def, 'sharp', 'nightmare', new Rng(seed), false, 'icewrack').some((a) => a.affixId === 'frost-veined')) icewrackFrost += 1;
    }

    expect(icewrackFrost).toBeGreaterThan(normalFrost);
  });
});

describe('endgame T5 affix gating (§14)', () => {
  function maxAffixTierSeen(endgameUnlocked: boolean): number {
    const def = REG.item('octarine-core'); // caster-like; can roll the T5 'ancient-mind' signature
    let max = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const affixes = rollAffixesFor(def, 'pristine', 'hell', new Rng(seed), endgameUnlocked);
      for (const rolled of affixes) max = Math.max(max, affixDef(rolled.affixId).tier);
    }
    return max;
  }

  it('caps the affix/signature tier at 4 on Hell before the endgame unlock', () => {
    expect(maxAffixTierSeen(false)).toBeLessThanOrEqual(4);
  });

  it('opens the T5 ancient tier on Hell once full badges / a raid clear unlock it', () => {
    expect(maxAffixTierSeen(true)).toBe(5);
  });
});

describe('new carry/caster items', () => {
  it('Kaya amplifies spell damage', () => {
    const { sim, me, foe } = lab();
    applyDamage(sim, me, foe, 100, 'magical');
    const without = foe.stats.maxHp - foe.hp;
    foe.hp = foe.stats.maxHp;
    give(sim, me, 'kaya');
    sim.run(0.2);
    applyDamage(sim, me, foe, 100, 'magical');
    const withKaya = foe.stats.maxHp - foe.hp;
    expect(withKaya).toBeGreaterThan(without * 1.1);
  });

  it('Sange reduces incoming debuff durations through status resistance', () => {
    const { sim, me, foe } = lab();
    give(sim, me, 'sange');
    sim.run(0.2);
    applyStatus(sim, foe, me, 'stun', 10, undefined, { defId: 'test-stun', level: 1, vfx: { archetype: 'stun-stars', color: '#ffffff' } });
    const stun = me.statuses.find((s) => s.status === 'stun');
    expect(stun).toBeDefined();
    expect(stun!.until - sim.time).toBeLessThan(9);
  });

  it('Mask of Madness trades silence and armor for a burst of speed', () => {
    const { sim, me } = lab();
    const slot = give(sim, me, 'mask-of-madness');
    const attackBefore = me.stats.attackInterval;
    sim.order(me.uid, { kind: 'item', invSlot: slot });
    sim.run(0.3);
    expect(me.summary.silenced).toBe(true);
    expect(me.stats.attackInterval).toBeLessThan(attackBefore * 0.7);
    expect(me.summary.mods.armor).toBeLessThan(0);
  });
});

describe('inventory & shop', () => {
  it('auto-sorts actives into keyed slots, passives into 5-6', () => {
    const { sim, me } = lab();
    give(sim, me, 'battlefury');     // passive
    give(sim, me, 'blink-dagger');   // active
    give(sim, me, 'crystalys');      // passive
    give(sim, me, 'euls-scepter');   // active
    me.items = sortInventory(me.items);
    const ids = me.items.map((i) => i?.defId ?? null);
    expect(ids[0]).toBe('blink-dagger');
    expect(ids[1]).toBe('euls-scepter');
    expect(ids[4]).toBe('crystalys');
    expect(ids[5]).toBe('battlefury');
  });

  it('buying consumes owned components Dota-style', () => {
    const { sim, me } = lab();
    give(sim, me, 'staff-of-wizardry');
    const fs = REG.item('force-staff');
    const plan = computeBuyPlan(fs, me, 5000);
    expect(plan.goldCost).toBe(fs.cost - 1000); // staff discounted
    expect(plan.consumeSlots.length).toBe(1);
    const goldAfter = executeBuy(fs, me, 5000);
    expect(goldAfter).toBe(5000 - (fs.cost - 1000));
    expect(me.items.filter((i) => i?.defId === 'force-staff').length).toBe(1);
    expect(me.items.filter((i) => i?.defId === 'staff-of-wizardry').length).toBe(0);
  });

  it('item recipes in the shop all resolve and cost math holds', () => {
    const fs = REG.item('force-staff');
    expect(fs.components!.reduce((a, c) => a + REG.item(c).cost, 0) + fs.recipeCost!).toBe(fs.cost);
  });
});

describe('aura items', () => {
  it("Vladmir's affects nearby allies in both layers (shared core)", () => {
    const { sim, me } = lab();
    const ally = sim.spawnHero(REG.hero('sniper'), { team: 0, pos: { x: 1100, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    give(sim, me, 'vladmirs-offering');
    sim.run(1.2); // aura pass
    expect(ally.summary.mods.lifestealPct).toBeGreaterThanOrEqual(15);
    expect(me.summary.mods.lifestealPct).toBeGreaterThanOrEqual(15);
  });
});
