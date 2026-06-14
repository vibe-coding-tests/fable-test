import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data/index';
import { REG } from '../core/registry';
import { Sim } from '../core/sim';
import { applyStatus } from '../core/effects';
import { applyDamage } from '../core/combat';
import { makeItemState } from '../core/items';
import { dist } from '../core/math2d';

// ============================================================
// HERO FEEL FIDELITY (SPEC §6): each kit's mechanical identity
// verified headless — hooks drag, fissures block, channels
// channel, auras hum, totem empowers exactly one swing.
// ============================================================

beforeAll(() => registerAllContent());

function arena(seed = 21) {
  const sim = new Sim({ seed, bounds: { w: 8000, h: 8000 } });
  sim.events.captureAll = true;
  return sim;
}

describe('Pudge', () => {
  it('Meat Hook is a skillshot that drags the victim to him', () => {
    const sim = arena();
    const pudge = sim.spawnHero(REG.hero('pudge'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const victim = sim.spawnHero(REG.hero('sniper'), { team: 1, pos: { x: 2000, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    const hpBefore = victim.hp;
    sim.order(pudge.uid, { kind: 'cast', slot: 0, point: { x: 2000, y: 1000 } });
    sim.run(2.5);
    expect(victim.hp).toBeLessThan(hpBefore);
    expect(dist(victim.pos, pudge.pos)).toBeLessThan(220); // dragged in
  });

  it('Meat Hook can miss — it is a skillshot, not a lock-on', () => {
    const sim = arena();
    const pudge = sim.spawnHero(REG.hero('pudge'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const victim = sim.spawnHero(REG.hero('sniper'), { team: 1, pos: { x: 2000, y: 1600 }, level: 10, ctrl: { kind: 'none' } });
    sim.order(pudge.uid, { kind: 'cast', slot: 0, point: { x: 2000, y: 400 } }); // aimed wide
    sim.run(2);
    expect(victim.hp).toBe(victim.stats.maxHp);
    expect(dist(victim.pos, { x: 2000, y: 1600 })).toBeLessThan(50); // never moved
  });

  it('Dismember channels: silence on the channeler frees the victim', () => {
    const sim = arena();
    const pudge = sim.spawnHero(REG.hero('pudge'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    const victim = sim.spawnHero(REG.hero('juggernaut'), { team: 1, pos: { x: 1150, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    sim.order(pudge.uid, { kind: 'cast', slot: 3, uid: victim.uid });
    sim.run(1.0);
    expect(pudge.channel).not.toBeNull();
    expect(victim.summary.stunned).toBe(true);
    // silence interrupts the channel (SPEC §7 cross-interaction)
    const lich = sim.spawnHero(REG.hero('lich'), { team: 1, pos: { x: 1400, y: 1100 }, level: 10, ctrl: { kind: 'none' } });
    applyStatus(sim, lich, pudge, 'silence', 2, undefined, { defId: 'test-silence', level: 1, vfx: { archetype: 'shield', color: '#ffffff' } });
    sim.run(0.6);
    expect(pudge.channel).toBeNull();
    sim.run(0.6);
    expect(victim.summary.stunned).toBe(false); // rolling stun lapsed after channel broke
  });
});

describe('Earthshaker', () => {
  it('Fissure creates impassable terrain that blocks pathing for everyone', () => {
    const sim = arena();
    const es = sim.spawnHero(REG.hero('earthshaker'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const runner = sim.spawnHero(REG.hero('juggernaut'), { team: 1, pos: { x: 2000, y: 2400 }, level: 10, ctrl: { kind: 'player' } });
    // wall across the runner's straight path (ES walks into cast range first)
    sim.order(es.uid, { kind: 'cast', slot: 0, point: { x: 2600, y: 1000 } });
    sim.run(2.5);
    expect(sim.zones.some((z) => z.wall)).toBe(true);
    // runner tries to cross the wall line
    sim.order(runner.uid, { kind: 'move', point: { x: 2000, y: 600 } });
    sim.run(2.0);
    // blocked: still on the far side (wall spans y=1000 line region)
    expect(runner.pos.y).toBeGreaterThan(1080);
    // wall expires, path opens
    sim.run(5);
    expect(sim.zones.some((z) => z.wall)).toBe(false);
    sim.order(runner.uid, { kind: 'move', point: { x: 2000, y: 600 } });
    sim.run(3);
    expect(runner.pos.y).toBeLessThan(700);
  });

  it('Fissure stuns on cast and Aftershock stacks a second stun', () => {
    const sim = arena();
    const es = sim.spawnHero(REG.hero('earthshaker'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const victim = sim.spawnHero(REG.hero('sniper'), { team: 1, pos: { x: 1300, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    sim.order(es.uid, { kind: 'cast', slot: 0, point: { x: 1600, y: 1000 } });
    sim.run(1.0);
    expect(victim.summary.stunned).toBe(true);
    const stuns = sim.events.history.filter((e) => e.t === 'status-apply' && (e as { status: string }).status === 'stun' && (e as { uid: number }).uid === victim.uid);
    expect(stuns.length).toBeGreaterThanOrEqual(2); // fissure + aftershock
  });

  it('Enchant Totem empowers exactly the next attack', () => {
    const sim = arena();
    const es = sim.spawnHero(REG.hero('earthshaker'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const dummy = sim.spawnCreep(REG.creep('granite-golem'), { team: 1, pos: { x: 1150, y: 1000 }, wild: true });
    dummy.ctrl = { kind: 'none' };
    sim.order(es.uid, { kind: 'cast', slot: 1 });
    sim.run(0.6);
    expect(es.statuses.some((s) => s.tag === 'es-totem-charge')).toBe(true);
    sim.order(es.uid, { kind: 'attack-unit', uid: dummy.uid });
    sim.run(2);
    expect(es.statuses.some((s) => s.tag === 'es-totem-charge')).toBe(false); // consumed
    // physical only: Aftershock's magical pop must not be confused with the swing
    const hits = sim.events.history.filter(
      (e) => e.t === 'damage' && (e as { uid: number }).uid === dummy.uid && (e as { amount: number }).amount > 0 && (e as { dtype: string }).dtype === 'physical'
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const first = (hits[0] as { amount: number }).amount;
    const later = (hits[hits.length - 1] as { amount: number }).amount;
    expect(first).toBeGreaterThan(later * 1.6); // totem swing visibly bigger
  });
});

describe('Crystal Maiden', () => {
  it('Arcane Aura is global for the whole team', () => {
    const sim = arena();
    const cm = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 500, y: 500 }, level: 10, ctrl: { kind: 'none' } });
    const farAlly = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 7500, y: 7500 }, level: 10, ctrl: { kind: 'none' } });
    const enemy = sim.spawnHero(REG.hero('pudge'), { team: 1, pos: { x: 7000, y: 7000 }, level: 10, ctrl: { kind: 'none' } });
    sim.run(1.2);
    expect(farAlly.summary.mods.manaRegen).toBeGreaterThan(0);
    expect(cm.summary.mods.manaRegen).toBeGreaterThan(0);
    expect(enemy.summary.mods.manaRegen ?? 0).toBe(0);
  });

  it('Frostbite roots: target cannot move but can still attack', () => {
    const sim = arena();
    const cm = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const victim = sim.spawnHero(REG.hero('juggernaut'), { team: 1, pos: { x: 1400, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    sim.order(cm.uid, { kind: 'cast', slot: 1, uid: victim.uid });
    sim.run(0.8);
    expect(victim.summary.rooted).toBe(true);
    const posAtRoot = { ...victim.pos };
    sim.order(victim.uid, { kind: 'move', point: { x: 3000, y: 1000 } });
    sim.run(0.8);
    expect(dist(victim.pos, posAtRoot)).toBeLessThan(30); // rooted in place
    expect(victim.hp).toBeLessThan(victim.stats.maxHp); // dot ticking
  });

  it('Freezing Field channels a storm of explosions; CM stands still', () => {
    const sim = arena();
    const cm = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    cm.mana = 999;
    const targets = [0, 1, 2, 3].map((i) =>
      sim.spawnCreep(REG.creep('hellbear'), { team: 1, pos: { x: 1350 + (i % 2) * 300, y: 700 + i * 200 }, wild: true })
    );
    for (const t of targets) t.ctrl = { kind: 'none' };
    const totalBefore = targets.reduce((a, t) => a + t.hp, 0);
    sim.order(cm.uid, { kind: 'cast', slot: 3 });
    sim.run(6);
    expect(cm.channel).not.toBeNull();
    const totalAfter = targets.reduce((a, t) => a + t.hp, 0);
    expect(totalAfter).toBeLessThan(totalBefore - 300); // explosions landing
    expect(targets.some((t) => t.summary.moveSlowFactor < 1)).toBe(true); // field chill
  });
});

describe('Juggernaut', () => {
  it('Blade Fury makes him spell-immune while shredding nearby enemies', () => {
    const sim = arena();
    const jug = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 1000 }, level: 8, ctrl: { kind: 'player' } });
    const cm = sim.spawnHero(REG.hero('crystal-maiden'), { team: 1, pos: { x: 1250, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    sim.order(jug.uid, { kind: 'cast', slot: 0 });
    sim.run(0.3);
    expect(jug.summary.magicImmune).toBe(true);
    // CM nova bounces off
    sim.order(cm.uid, { kind: 'cast', slot: 0, point: { x: 1000, y: 1000 } });
    const hpBefore = jug.hp;
    sim.run(1.5);
    expect(jug.hp).toBeGreaterThanOrEqual(hpBefore - 1); // immune to the nuke
    expect(cm.hp).toBeLessThan(cm.stats.maxHp); // spin damage ticking on her
  });

  it('Omnislash slashes between enemies and Jugg is untargetable during', () => {
    const sim = arena();
    const jug = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    jug.mana = 999;
    const a = sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: 1300, y: 1000 }, wild: true });
    const b = sim.spawnCreep(REG.creep('kobold'), { team: 1, pos: { x: 1500, y: 1100 }, wild: true });
    a.ctrl = { kind: 'none' };
    b.ctrl = { kind: 'none' };
    sim.order(jug.uid, { kind: 'cast', slot: 3, uid: a.uid });
    sim.run(1.0);
    expect(jug.summary.untargetable).toBe(true);
    sim.run(3);
    expect(a.alive && b.alive).toBe(false); // kobolds did not enjoy that
    expect(jug.summary.untargetable).toBe(false);
  });

  it('Omnislash can start on a spell-immune enemy hero', () => {
    const sim = arena();
    const jug = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    jug.mana = 999;
    const target = sim.spawnHero(REG.hero('crystal-maiden'), { team: 1, pos: { x: 1300, y: 1000 }, level: 8, ctrl: { kind: 'none' } });
    applyStatus(sim, target, target, 'magic-immune', 10, { tag: 'test-bkb' }, { defId: 'test-bkb', level: 1, vfx: { archetype: 'shield', color: '#ffd27f' } });
    target.refresh(sim.time);
    const hpBefore = target.hp;
    sim.order(jug.uid, { kind: 'cast', slot: 3, uid: target.uid });
    sim.run(1.2);
    expect(jug.lastAbilityCastId).toBe('jug-omnislash');
    expect(target.hp).toBeLessThan(hpBefore);
  });

  it('item actives do not steal Omnislash dash presentation mid-sequence', () => {
    const sim = arena();
    const jug = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    jug.mana = 999;
    jug.items[0] = makeItemState(REG.item('black-king-bar'));
    const targets = [
      sim.spawnHero(REG.hero('pudge'), { team: 1, pos: { x: 1300, y: 1000 }, level: 12, ctrl: { kind: 'none' } }),
      sim.spawnHero(REG.hero('sven'), { team: 1, pos: { x: 1500, y: 1120 }, level: 12, ctrl: { kind: 'none' } })
    ];
    const hpBefore = targets.reduce((sum, target) => sum + target.hp, 0);

    sim.order(jug.uid, { kind: 'cast', slot: 3, uid: targets[0].uid });
    sim.run(0.8);
    expect(jug.summary.untargetable).toBe(true);
    expect(jug.castGesture).toBe('dash'); // mid-slash: airborne dash pose

    sim.order(jug.uid, { kind: 'item', invSlot: 0 });
    sim.run(0.1);

    // the item still fires...
    expect(jug.summary.magicImmune).toBe(true);
    expect(jug.items[0]?.cooldownUntil).toBeGreaterThan(sim.time);
    // ...without grounding the slash sequence: the dash pose holds and the
    // presentation lock keeps it past the item's own cast window.
    expect(jug.castGesture).toBe('dash');
    expect(jug.castGestureLockUntil).toBeGreaterThan(sim.time);
    expect(jug.castingUntil).toBeGreaterThan(sim.time);
    sim.run(1.5);
    expect(targets.reduce((sum, target) => sum + target.hp, 0)).toBeLessThan(hpBefore);
  });

  it('piercing ultimates still damage and disable spell-immune heroes', () => {
    const sim = arena();
    const tide = sim.spawnHero(REG.hero('tidehunter'), { team: 0, pos: { x: 1000, y: 1000 }, level: 18, ctrl: { kind: 'player' } });
    tide.mana = 999;
    const target = sim.spawnHero(REG.hero('crystal-maiden'), { team: 1, pos: { x: 1250, y: 1000 }, level: 12, ctrl: { kind: 'none' } });
    applyStatus(sim, target, target, 'magic-immune', 10, { tag: 'test-bkb' }, { defId: 'test-bkb', level: 1, vfx: { archetype: 'shield', color: '#ffd27f' } });
    target.refresh(sim.time);
    const hpBefore = target.hp;
    sim.order(tide.uid, { kind: 'cast', slot: 3 });
    sim.run(1.0);
    expect(tide.lastAbilityCastId).toBe('tide-ravage');
    expect(target.hp).toBeLessThan(hpBefore);
    expect(target.summary.stunned).toBe(true);
  });

  it('Healing Ward heals percent max HP around it', () => {
    const sim = arena();
    const jug = sim.spawnHero(REG.hero('juggernaut'), { team: 0, pos: { x: 1000, y: 1000 }, level: 8, ctrl: { kind: 'player' } });
    jug.hp = jug.stats.maxHp * 0.5;
    sim.order(jug.uid, { kind: 'cast', slot: 1 });
    sim.run(4);
    expect(jug.hp).toBeGreaterThan(jug.stats.maxHp * 0.6);
    expect(sim.unitsArr.some((u) => u.kind === 'ward')).toBe(true);
  });
});

describe('Sniper', () => {
  it('outranges everything: attack range grows with Take Aim', () => {
    const sim = arena();
    const sniper = sim.spawnHero(REG.hero('sniper'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    expect(sniper.stats.attackRange).toBeGreaterThan(700); // 550 base + take aim
  });

  it('Shrapnel uses charges and rains damage in the zone', () => {
    const sim = arena();
    const sniper = sim.spawnHero(REG.hero('sniper'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const target = sim.spawnCreep(REG.creep('hellbear'), { team: 1, pos: { x: 1800, y: 1000 }, wild: true });
    target.ctrl = { kind: 'none' };
    const slot = sniper.abilities.findIndex((a) => a.def.id === 'sniper-shrapnel');
    const chargesBefore = sniper.abilities[slot].charges;
    expect(chargesBefore).toBeGreaterThanOrEqual(3);
    sim.order(sniper.uid, { kind: 'cast', slot, point: { x: 1800, y: 1000 } });
    sim.run(3.5);
    expect(sniper.abilities[slot].charges).toBe(chargesBefore - 1);
    expect(target.hp).toBeLessThan(target.stats.maxHp);
    expect(target.summary.moveSlowFactor).toBeLessThan(1);
  });

  it('Assassinate aims (channel) then fires a long-range bolt', () => {
    const sim = arena();
    const sniper = sim.spawnHero(REG.hero('sniper'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    sniper.mana = 999;
    const mark = sim.spawnHero(REG.hero('pudge'), { team: 1, pos: { x: 2800, y: 1000 }, level: 8, ctrl: { kind: 'none' } });
    const hpBefore = mark.hp;
    sim.order(sniper.uid, { kind: 'cast', slot: 3, uid: mark.uid });
    sim.run(0.9);
    expect(sniper.channel).not.toBeNull(); // aiming
    expect(mark.hp).toBe(hpBefore);
    sim.run(2.5);
    expect(mark.hp).toBeLessThan(hpBefore - 200); // bolt landed
  });
});

describe('Luna', () => {
  it('Lunar Blessing buffs allied damage and Eclipse fires repeated Lucent beams', () => {
    const sim = arena();
    const luna = sim.spawnHero(REG.hero('luna'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    const ally = sim.spawnHero(REG.hero('sniper'), { team: 0, pos: { x: 1200, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    const targets = [0, 1, 2].map((i) =>
      sim.spawnCreep(REG.creep('hellbear'), { team: 1, pos: { x: 1400 + i * 150, y: 950 + i * 80 }, wild: true })
    );
    for (const t of targets) t.ctrl = { kind: 'none' };
    sim.run(1.2);
    expect(ally.summary.mods.damage).toBeGreaterThan(0);
    luna.mana = 999;
    const before = targets.reduce((sum, t) => sum + t.hp, 0);
    sim.order(luna.uid, { kind: 'cast', slot: 3 });
    sim.run(4);
    const after = targets.reduce((sum, t) => sum + t.hp, 0);
    expect(after).toBeLessThan(before - 300);
    expect(sim.events.history.filter((e) => e.t === 'status-apply' && (e as { status: string }).status === 'stun').length).toBeGreaterThan(0);
  });
});

describe('Sven', () => {
  it('Storm Hammer stuns clustered enemies and Gods Strength massively boosts attacks', () => {
    const sim = arena();
    const sven = sim.spawnHero(REG.hero('sven'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    const a = sim.spawnHero(REG.hero('axe'), { team: 1, pos: { x: 1450, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    const b = sim.spawnHero(REG.hero('pudge'), { team: 1, pos: { x: 1570, y: 1030 }, level: 10, ctrl: { kind: 'none' } });
    sven.mana = 999;
    sim.order(sven.uid, { kind: 'cast', slot: 0, uid: a.uid });
    sim.run(1.8);
    expect(a.summary.stunned).toBe(true);
    expect(b.summary.stunned).toBe(true);
    const damageBefore = sven.stats.damage;
    sim.order(sven.uid, { kind: 'cast', slot: 3 });
    sim.run(0.8);
    expect(sven.stats.damage).toBeGreaterThan(damageBefore * 2);
  });
});

describe('Axe', () => {
  it("Berserker's Call taunts and Counter Helix punishes attackers", () => {
    const sim = arena();
    const axe = sim.spawnHero(REG.hero('axe'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const attacker = sim.spawnHero(REG.hero('juggernaut'), { team: 1, pos: { x: 1130, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    axe.mana = 999;
    sim.order(axe.uid, { kind: 'cast', slot: 0 });
    sim.run(0.8);
    expect(attacker.summary.taunted).toBe(axe.uid);
    const hpBefore = attacker.hp;
    applyDamage(sim, attacker, axe, 50, 'physical');
    expect(attacker.hp).toBeLessThan(hpBefore); // helix fired around Axe
  });
});

describe('Lich', () => {
  it('Chain Frost bounces between clustered enemies', () => {
    const sim = arena();
    const lich = sim.spawnHero(REG.hero('lich'), { team: 0, pos: { x: 1000, y: 1000 }, level: 12, ctrl: { kind: 'player' } });
    lich.mana = 999;
    const pack = [0, 1, 2].map((i) =>
      sim.spawnCreep(REG.creep('hellbear'), { team: 1, pos: { x: 1700 + i * 150, y: 1000 + (i % 2) * 150 }, wild: true })
    );
    for (const p of pack) p.ctrl = { kind: 'none' };
    sim.order(lich.uid, { kind: 'cast', slot: 3, uid: pack[0].uid });
    sim.run(6);
    const hurt = pack.filter((p) => p.hp < p.stats.maxHp).length;
    expect(hurt).toBeGreaterThanOrEqual(2); // bounced at least once
  });

  it('Frost Shield blunts attack damage on the carrier', () => {
    const sim = arena();
    const lich = sim.spawnHero(REG.hero('lich'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    const ally = sim.spawnHero(REG.hero('crystal-maiden'), { team: 0, pos: { x: 1200, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    const bruiser = sim.spawnHero(REG.hero('juggernaut'), { team: 1, pos: { x: 1350, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    lich.mana = 999;

    // measure unshielded hit
    sim.order(bruiser.uid, { kind: 'attack-unit', uid: ally.uid });
    sim.run(2);
    const unshielded = sim.events.history.filter((e) => e.t === 'damage' && (e as { uid: number }).uid === ally.uid).map((e) => (e as { amount: number }).amount);
    sim.order(lich.uid, { kind: 'cast', slot: 1, uid: ally.uid });
    sim.run(0.8);
    const shieldedStart = sim.events.history.length;
    sim.run(2);
    const shielded = sim.events.history.slice(shieldedStart).filter((e) => e.t === 'damage' && (e as { uid: number }).uid === ally.uid).map((e) => (e as { amount: number }).amount);
    expect(Math.max(...shielded)).toBeLessThan(Math.max(...unshielded) * 0.75);
  });

  it('Sinister Gaze drags the victim toward Lich while channeled', () => {
    const sim = arena();
    const lich = sim.spawnHero(REG.hero('lich'), { team: 0, pos: { x: 1000, y: 1000 }, level: 10, ctrl: { kind: 'player' } });
    lich.mana = 999;
    const victim = sim.spawnHero(REG.hero('sniper'), { team: 1, pos: { x: 1500, y: 1000 }, level: 10, ctrl: { kind: 'none' } });
    const dBefore = dist(victim.pos, lich.pos);
    sim.order(lich.uid, { kind: 'cast', slot: 2, uid: victim.uid });
    sim.run(2.2);
    expect(dist(victim.pos, lich.pos)).toBeLessThan(dBefore - 150);
  });
});

describe('hero weight', () => {
  it('movement and turn rates differ per hero (CM slow, Jugg nimble)', () => {
    const cm = REG.hero('crystal-maiden');
    const jug = REG.hero('juggernaut');
    expect(cm.baseStats.moveSpeed).toBeLessThan(jug.baseStats.moveSpeed);
    expect(cm.baseStats.turnRate).toBeLessThan(jug.baseStats.turnRate);
  });
});
