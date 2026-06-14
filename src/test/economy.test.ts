import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent } from '../data';
import { REG } from '../core/registry';
import { applyDamage } from '../core/combat';
import { freshEchoProgress } from '../core/echo';
import { rollLoot, scaledBounty } from '../core/phase3';
import { overflowXpToGold } from '../core/progression';
import { xpForLevel } from '../core/stats';
import { GRADE_UP_COSTS, IMPRINT_COSTS, MASTERWORK_COSTS, REFORGE_COSTS, REROLL_AFFIX_COSTS } from '../data/forge';
import { gemDef } from '../data/gems';
import { TUNING } from '../data/tuning';
import { GATED_TOP_TIER, Game, itemAllowedFromSource, newGameSave } from '../systems/game';
import type { CreepDef, GambitRule, GameSave, SimEvent } from '../core/types';

beforeAll(() => registerAllContent());

const AGGRO: GambitRule[] = [
  { if: [{ k: 'ability-ready', slot: 3 }, { k: 'fight-time-gt', sec: 2 }], then: { k: 'cast', slot: 3, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 0 }], then: { k: 'cast', slot: 0, targetMode: 'focus' } },
  { if: [{ k: 'ability-ready', slot: 1 }, { k: 'enemies-within', radius: 700, count: 1 }], then: { k: 'cast', slot: 1, targetMode: 'most-clustered' } },
  { if: [{ k: 'ability-ready', slot: 2 }], then: { k: 'cast', slot: 2, targetMode: 'focus' } },
  { if: [{ k: 'always' }], then: { k: 'attack-focus' } }
];

// The known-strong, gym-clearing lineup (mirrors gyms.test.ts) used wherever a
// fight needs to be winnable at the level cap.
const STRONG_TEAM: { heroId: string; items: string[] }[] = [
  { heroId: 'juggernaut', items: ['black-king-bar', 'battlefury', 'crystalys'] },
  { heroId: 'sven', items: ['black-king-bar', 'crystalys', 'hyperstone'] },
  { heroId: 'sniper', items: ['dragon-lance', 'maelstrom', 'crystalys'] },
  { heroId: 'lich', items: ['kaya', 'glimmer-cape', 'force-staff'] },
  { heroId: 'earthshaker', items: ['blink-dagger', 'black-king-bar', 'platemail'] }
];

function rosterItems(ids: string[]): (GameSave['roster'][number]['items']) {
  const slots: GameSave['roster'][number]['items'] = [null, null, null, null, null, null];
  ids.slice(0, 6).forEach((id, i) => (slots[i] = { id }));
  return slots;
}

/** A full party of five level-cap heroes with every gym badge (so the recruit ceiling is 30). */
function fullPartySave(level = 30): GameSave {
  const save = newGameSave(STRONG_TEAM[0].heroId);
  save.party = STRONG_TEAM.map((t) => t.heroId);
  save.recruited = STRONG_TEAM.map((t) => t.heroId);
  save.roster = STRONG_TEAM.map((t) => ({
    heroId: t.heroId,
    level,
    xp: xpForLevel(level),
    items: rosterItems(t.items),
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: AGGRO,
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0]
  }));
  save.badges = [...REG.gyms.values()].map((g) => g.badgeId);
  return save;
}

/** A single-hero save (used to isolate the live kill-reward path). */
function soloSave(heroId = 'juggernaut', level = 10, badges: string[] = []): GameSave {
  const save = newGameSave(heroId);
  save.roster[0].level = level;
  save.roster[0].xp = xpForLevel(level);
  save.badges = badges;
  return save;
}

function addBenchHero(save: GameSave, heroId: string, level = 20, items: string[] = []): void {
  if (!save.recruited.includes(heroId)) save.recruited.push(heroId);
  save.roster.push({
    heroId,
    level,
    xp: xpForLevel(level),
    items: rosterItems(items),
    neutralSlot: null,
    talentPicks: [0, 0, 0, 0],
    gambits: AGGRO,
    echo: freshEchoProgress(),
    facetIdx: 0,
    hpPct: 1,
    manaPct: 1,
    abilityCooldowns: [0, 0, 0, 0]
  });
}

function creepOfTier(tier: CreepDef['tier']): CreepDef {
  const def = [...REG.creeps.values()].find((c) => c.tier === tier);
  if (!def) throw new Error(`no creep of tier ${tier}`);
  return def;
}

/** Kill a freshly spawned wild creep with the active hero and let the loop bank the reward. */
function killWildCreep(g: Game, def: CreepDef): Extract<SimEvent, { t: 'kill-credit' }> {
  const hero = g.activeUnit()!;
  const pos = { x: hero.pos.x + 140, y: hero.pos.y };
  const creep = g.sim.spawnCreep(def, { team: 1, pos, wild: true, homePos: { ...pos } });
  const before = g.sim.events.history.length;
  applyDamage(g.sim, hero, creep, 1e9, 'physical');
  g.update(0.05);
  const ev = g.sim.events.history
    .slice(before)
    .find((e): e is Extract<SimEvent, { t: 'kill-credit' }> => e.t === 'kill-credit' && e.victimUid === creep.uid);
  if (!ev) throw new Error('no kill-credit emitted');
  return ev;
}

// ----------------------------------------------------------------
// Test 9: boss-rerun-live (Phase 3 §3.A / Phase 6 §3.6)
// ----------------------------------------------------------------
describe('boss-rerun-live (test 9)', () => {
  const BOSS = 'boss-phantom-assassin';

  it('gates tiers, runs a scaled live fight, delivers loot, and fires pity on the Nth dry clear', () => {
    const g = Game.headless(fullPartySave());

    // Fresh boss: only Normal is selectable (Nightmare needs a prior clear, Hell a Nightmare clear).
    expect(g.bossUnlockedTiers(BOSS)).toEqual(['normal']);

    // A Normal clear delivers the guaranteed component(s) and opens Nightmare.
    const stashBefore = g.inventoryStash.length;
    const normal = g.runBossFight(BOSS, 'normal');
    expect(normal.won).toBe(true);
    expect(g.inventoryStash.length).toBeGreaterThan(stashBefore);
    expect(g.bossUnlockedTiers(BOSS)).toContain('nightmare');
    expect(g.bossUnlockedTiers(BOSS)).not.toContain('hell'); // Hell still gated after a Normal clear

    // Simulate a long dry streak, then a Nightmare clear: pity must force the assembled drop.
    g.difficulty[BOSS] = { tier: 'nightmare', dryClears: TUNING.raidBadLuckPity - 1 };
    const uniquesBefore = g.heldUniques.length;
    const night = g.runBossFight(BOSS, 'nightmare');
    expect(night.won).toBe(true);
    expect(night.loot?.pityUsed).toBe(true);
    expect(night.loot?.assembled).toBeDefined();
    // the scaled loot lands in the player's inventory + held-uniques ledger
    expect(g.inventoryStash.some((it) => it.id === night.loot!.assembled!.id)).toBe(true);
    expect(g.heldUniques.length).toBeGreaterThan(uniquesBefore);

    // A pity-cleared Nightmare resets the dry streak and finally opens Hell.
    expect(g.difficulty[BOSS].dryClears).toBe(0);
    expect(g.bossUnlockedTiers(BOSS)).toContain('hell');
  });

  it('refuses a locked tier and never auto-vends the assembled into a shop', () => {
    const g = Game.headless(fullPartySave());
    // Hell is locked on a fresh boss.
    const hell = g.runBossFight(BOSS, 'hell');
    expect(hell.won).toBe(false);
    expect(g.difficulty[BOSS]).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// Test 10: reward scaling on live kills + post-cap XP -> gold (§3.7)
// ----------------------------------------------------------------
describe('reward-scaling-live (test 10)', () => {
  it('routes a live creep kill through scaledBounty (region/tier/creep-tier/star)', () => {
    const g = Game.headless(soloSave('juggernaut', 10));
    g.sim.events.captureAll = true;
    const def = creepOfTier('large');

    const goldBefore = g.gold;
    const ev = killWildCreep(g, def);
    const gained = g.gold - goldBefore;

    const scaled = scaledBounty(ev.bounty, g.region.id, 'normal', def.tier, 1);
    const bonus = ev.lastHitByPlayer ? 1 + TUNING.lastHitBonusPct : 1;
    const expectedKillGold = Math.round(scaled.gold * bonus);

    // a sub-cap solo hero earns exactly the scaled kill gold (no overflow yet)
    expect(gained).toBe(expectedKillGold);
    // and the creep-tier multiplier actually moved the number off the raw bounty
    expect(scaled.gold).toBeGreaterThan(ev.bounty.gold);
  });

  it('banks XP under the recruit ceiling but converts XP->gold once past the true level cap', () => {
    const def = creepOfTier('large');

    // (a) recruit ceiling honored: a sub-cap hero with no badges banks XP, no overflow gold.
    const banked = Game.headless(soloSave('juggernaut', 15, []));
    banked.sim.events.captureAll = true;
    expect(banked.recruitLevelCap()).toBe(TUNING.recruitLevelCap[0]);
    const beforeBank = banked.gold;
    const evBank = killWildCreep(banked, def);
    const scaledBank = scaledBounty(evBank.bounty, banked.region.id, 'normal', def.tier, 1);
    const bonusBank = evBank.lastHitByPlayer ? 1 + TUNING.lastHitBonusPct : 1;
    expect(banked.gold - beforeBank).toBe(Math.round(scaledBank.gold * bonusBank)); // kill gold only

    // (b) true level cap reached (all badges => ceiling 30): kill XP converts to gold.
    const capped = Game.headless(soloSave('juggernaut', TUNING.levelCap, [...REG.gyms.values()].map((g) => g.badgeId)));
    capped.sim.events.captureAll = true;
    const beforeCap = capped.gold;
    const evCap = killWildCreep(capped, def);
    const scaledCap = scaledBounty(evCap.bounty, capped.region.id, 'normal', def.tier, 1);
    const bonusCap = evCap.lastHitByPlayer ? 1 + TUNING.lastHitBonusPct : 1;
    const killGold = Math.round(scaledCap.gold * bonusCap);
    const heroXp = Math.round(scaledCap.xp * bonusCap * TUNING.xpActivePct);
    const overflowGold = overflowXpToGold(TUNING.levelCap, xpForLevel(TUNING.levelCap), heroXp);
    expect(overflowGold).toBeGreaterThan(0);
    expect(capped.gold - beforeCap).toBe(killGold + overflowGold);
  });
});

// ----------------------------------------------------------------
// Test 11: neutral-items-live (§3.7)
// ----------------------------------------------------------------
describe('neutral-items-live (test 11)', () => {
  it('drops a tiered neutral from a slain creep into the dedicated stash', () => {
    const g = Game.headless(soloSave('juggernaut', 12));
    g.sim.events.captureAll = true;
    const def = creepOfTier('ancient'); // 28% drop rate -> certain within the loop

    let dropped = false;
    for (let i = 0; i < 80 && !dropped; i++) {
      killWildCreep(g, def);
      dropped = g.neutralStash.length > 0;
    }
    expect(dropped).toBe(true);
    const got = REG.neutralItem(g.neutralStash[0].id);
    expect(got.dropFromTier).toBe('ancient');
  });

  it('drops consumables and components from wild creeps into the Armory stash', () => {
    const g = Game.headless(soloSave('juggernaut', 12));
    g.sim.events.captureAll = true;
    const small = creepOfTier('small');
    const large = creepOfTier('large');

    for (let i = 0; i < 80 && !g.inventoryStash.some((it) => REG.item(it.id).tier === 'consumable'); i++) {
      killWildCreep(g, small);
    }
    expect(g.inventoryStash.some((it) => REG.item(it.id).tier === 'consumable')).toBe(true);

    for (let i = 0; i < 80 && !g.inventoryStash.some((it) => REG.item(it.id).tier === 'component'); i++) {
      killWildCreep(g, large);
    }
    expect(g.inventoryStash.some((it) => REG.item(it.id).tier === 'component')).toBe(true);
  });

  it('slots a neutral into the dedicated slot, keeps it unsellable, and reclaims to the stash', () => {
    const save = soloSave('juggernaut', 20);
    save.neutralStash = [{ id: 'trusty-shovel', count: 1 }];
    const g = Game.headless(save);

    expect(g.equipNeutral(0, 'trusty-shovel')).toBe(true);
    expect(g.party[0].neutralSlot?.id).toBe('trusty-shovel');
    expect(g.neutralStash.find((s) => s.id === 'trusty-shovel')).toBeUndefined(); // consumed from stash

    // a neutral never occupies the six sellable item slots
    const hero = g.activeUnit()!;
    expect(hero.items.every((it) => !it || REG.items.has(it.defId))).toBe(true);
    expect([...REG.neutralItems.keys()].some((nid) => hero.items.some((it) => it?.defId === nid))).toBe(false);

    // reclaim returns it to the stash for the configured bench fee (never sells for gold)
    const goldBefore = g.gold;
    expect(g.reclaimNeutral(0)).toBe(true);
    expect(g.party[0].neutralSlot).toBeNull();
    expect(g.neutralStash.find((s) => s.id === 'trusty-shovel')?.count).toBe(1);
    expect(g.gold).toBe(goldBefore - TUNING.tinkersBench.reclaimCost);

    expect(g.equipNeutral(0, 'trusty-shovel')).toBe(true);
    g.gold = TUNING.tinkersBench.reclaimCost - 1;
    expect(g.reclaimNeutral(0)).toBe(false);
    expect(g.party[0].neutralSlot?.id).toBe('trusty-shovel');
  });

  it('rerolls within tier and enchants three duplicates up a tier at the Tinker\u2019s Bench', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 5000;
    save.neutralStash = [{ id: 'trusty-shovel', count: 3 }];
    const g = Game.headless(save);
    g.activeUnit()!.pos = { ...g.region.town.pos }; // stand in town for the bench

    // reroll stays in the same tier
    const original = REG.neutralItem('trusty-shovel');
    const rerolled = g.tinkerReroll('trusty-shovel');
    expect(rerolled).not.toBeNull();
    expect(rerolled!.tier).toBe(original.tier);

    // enchant 3 dupes -> deterministic one-tier-up result, dupes consumed
    const save2 = soloSave('juggernaut', 20);
    save2.gold = 5000;
    save2.neutralStash = [{ id: 'trusty-shovel', count: 3 }];
    const g2 = Game.headless(save2);
    g2.activeUnit()!.pos = { ...g2.region.town.pos };
    const enchanted = g2.tinkerEnchant('trusty-shovel');
    expect(enchanted?.id).toBe(original.enchantsInto);
    expect(REG.neutralItem(enchanted!.id).tier).toBe(original.tier + 1);
    expect(g2.neutralStash.find((s) => s.id === 'trusty-shovel')).toBeUndefined();
    expect(g2.neutralStash.find((s) => s.id === enchanted!.id)?.count).toBe(1);
  });

  it('preserves grade-only neutral copies through equip and reclaim', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 5000;
    save.neutralStash = [{
      id: 'trusty-shovel',
      count: 1,
      copies: [{ id: 'trusty-shovel', grade: 'sharp', gradeRoll: 0.9, resolvedMods: { maxHp: 12 } }]
    }];
    const g = Game.headless(save);

    expect(g.equipNeutral(0, 'trusty-shovel')).toBe(true);
    expect(g.party[0].neutralSlot?.grade).toBe('sharp');
    expect(g.party[0].neutralSlot?.resolvedMods?.maxHp).toBe(12);

    expect(g.reclaimNeutral(0)).toBe(true);
    const copy = g.neutralStash.find((s) => s.id === 'trusty-shovel')?.copies?.[0];
    expect(copy?.grade).toBe('sharp');
    expect(copy?.resolvedMods?.maxHp).toBe(12);
  });
});

describe('Armory and bound loot', () => {
  it('equips a bound drop, returns it to the Armory instead of selling, and preserves save state', () => {
    const save = soloSave('juggernaut', 20);
    save.inventoryStash = [{ id: 'butterfly', bound: true }];
    const g = Game.headless(save);

    expect(g.equipArmoryItem(0, 0)).toBe(true);
    const hero = g.activeUnit()!;
    const slot = hero.items.findIndex((it) => it?.defId === 'butterfly');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(hero.items[slot]?.bound).toBe(true);
    expect(g.inventoryStash).toEqual([]);

    const goldBefore = g.gold;
    g.sellItem(slot);
    expect(g.gold).toBe(goldBefore);
    expect(hero.items.some((it) => it?.defId === 'butterfly')).toBe(false);
    expect(g.inventoryStash).toContainEqual({ id: 'butterfly', bound: true });

    const roundTrip = g.buildSave();
    expect(roundTrip.inventoryStash).toContainEqual({ id: 'butterfly', bound: true });
  });

  it('enforces item level requirements before Armory equip', () => {
    const save = soloSave('juggernaut', 1);
    save.inventoryStash = [{ id: 'butterfly', bound: true, grade: 'pristine' }];
    const g = Game.headless(save);

    expect(g.equipArmoryItem(0, 0)).toBe(false);
    expect(g.inventoryStash).toHaveLength(1);
    expect(g.activeUnit()!.items.some((it) => it?.defId === 'butterfly')).toBe(false);
  });

  it('absorbs Aghanim items into permanent hero augments', () => {
    const save = soloSave('juggernaut', 20);
    save.inventoryStash = [{ id: 'aghanims-scepter', bound: true }];
    const g = Game.headless(save);

    expect(g.applyArmoryAugmentForHero('juggernaut', 0)).toBe(true);
    expect(g.inventoryStash).toEqual([]);
    expect(g.buildSave().roster[0].augments?.scepter).toBe(true);
    expect(g.applyArmoryAugmentForHero('juggernaut', 0)).toBe(false);
  });

  it('rolls item identity for Black Market and gamble-vendor copies', () => {
    const save = soloSave('juggernaut', 30, [...REG.gyms.values()].map((g) => g.badgeId));
    save.gold = 100000;
    const g = Game.headless(save);
    g.activeUnit()!.pos = { ...g.region.town.pos };

    const relic = g.blackMarketRelicWheel();
    expect(relic).not.toBeNull();
    expect(relic?.bound).toBe(true);
    expect(relic?.grade).toBeDefined();
    expect(relic?.resolvedMods).toBeDefined();

    const gambled = g.gambleVendorRoll('t3');
    expect(gambled).not.toBeNull();
    expect(gambled?.bound).toBe(true);
    expect(gambled?.grade).toBeDefined();
    expect(gambled?.affixes).toBeDefined();
  });

  it('still sells liquid components for gold', () => {
    const save = soloSave('juggernaut', 20);
    save.roster[0].items[0] = { id: 'broadsword' };
    const g = Game.headless(save);
    const hero = g.activeUnit()!;
    const slot = hero.items.findIndex((it) => it?.defId === 'broadsword');
    const goldBefore = g.gold;

    g.sellItem(slot);

    expect(g.gold - goldBefore).toBe(Math.round(REG.item('broadsword').cost * TUNING.sellRatio));
    expect(hero.items.some((it) => it?.defId === 'broadsword')).toBe(false);
  });

  it('equips and reclaims bound gear on a benched hero without fielding them', () => {
    const save = soloSave('juggernaut', 20);
    addBenchHero(save, 'sven', 20);
    save.inventoryStash = [{ id: 'heart-of-tarrasque', bound: true }];
    const g = Game.headless(save);

    expect(g.party.map((r) => r.heroId)).toEqual(['juggernaut']);
    expect(g.equipArmoryItemForHero('sven', 0)).toBe(true);
    expect(g.inventoryStash).toEqual([]);

    const view = g.armoryView();
    const sven = view.heroes.find((h) => h.heroId === 'sven')!;
    expect(sven.fielded).toBe(false);
    expect(sven.items.some((it) => it?.id === 'heart-of-tarrasque' && it.bound)).toBe(true);

    const saveWithBenchGear = g.buildSave();
    expect(saveWithBenchGear.party).toEqual(['juggernaut']);
    expect(saveWithBenchGear.roster.find((r) => r.heroId === 'sven')?.items.some((it) => it?.id === 'heart-of-tarrasque' && it.bound)).toBe(true);

    const slot = sven.items.findIndex((it) => it?.id === 'heart-of-tarrasque');
    expect(g.reclaimArmoryItemForHero('sven', slot)).toBe(true);
    expect(g.inventoryStash).toContainEqual({ id: 'heart-of-tarrasque', bound: true });
  });

  it('saves and applies a benched loadout through the Armory', () => {
    const save = soloSave('juggernaut', 20);
    addBenchHero(save, 'sven', 20, ['heart-of-tarrasque']);
    save.roster.find((r) => r.heroId === 'sven')!.items[0] = { id: 'heart-of-tarrasque', bound: true };
    const g = Game.headless(save);

    expect(g.saveHeroLoadout('sven')).toBe(true);
    expect(g.reclaimAllArmoryItemsForHero('sven')).toBe(1);
    expect(g.armoryView().heroes.find((h) => h.heroId === 'sven')!.items.every((it) => !it?.bound)).toBe(true);

    const applied = g.applyHeroLoadout('sven');
    expect(applied.ok).toBe(true);
    expect(g.armoryView().heroes.find((h) => h.heroId === 'sven')!.items.some((it) => it?.id === 'heart-of-tarrasque' && it.bound)).toBe(true);

    const roundTrip = Game.migrateSave(JSON.parse(JSON.stringify(g.buildSave())) as unknown)!;
    expect(roundTrip.loadouts.sven.Default).toEqual(['heart-of-tarrasque', null, null, null, null, null]);
  });

  it('gears fielded loadouts and reports contention for single-copy claims', () => {
    const save = fullPartySave(20);
    save.inventoryStash = [{ id: 'butterfly', bound: true }, { id: 'heart-of-tarrasque', bound: true }];
    const g = Game.headless(save);
    g.loadouts = {
      juggernaut: { Default: ['butterfly', null, null, null, null, null] },
      sven: { Default: ['heart-of-tarrasque', null, null, null, null, null] }
    };

    const geared = g.gearFieldLoadouts();
    expect(geared.applied).toBe(2);
    expect(g.armoryView().heroes.find((h) => h.heroId === 'juggernaut')!.items.some((it) => it?.id === 'butterfly')).toBe(true);
    expect(g.armoryView().heroes.find((h) => h.heroId === 'sven')!.items.some((it) => it?.id === 'heart-of-tarrasque')).toBe(true);

    const conflictSave = fullPartySave(20);
    conflictSave.roster[0].items[0] = { id: 'butterfly', bound: true };
    const conflicted = Game.headless(conflictSave);
    conflicted.loadouts = {
      juggernaut: { Default: ['butterfly', null, null, null, null, null] },
      sven: { Default: ['butterfly', null, null, null, null, null] }
    };

    const conflicts = conflicted.loadoutConflicts();
    expect(conflicts).toEqual([{ itemId: 'butterfly', requested: 2, owned: 1, claimedBy: ['juggernaut', 'sven'] }]);
    const blocked = conflicted.gearFieldLoadouts();
    expect(blocked.applied).toBe(0);
    expect(blocked.conflicts.length).toBe(1);
  });
});

// ----------------------------------------------------------------
// Test 12: gold-sinks-faithful (§3.8)
// ----------------------------------------------------------------
describe('gold-sinks-faithful (test 12)', () => {
  it('buyback revives a fallen hero for gold and tracks the sink', () => {
    // a full party so a death swaps to a teammate and the fallen hero waits to respawn
    const g = Game.headless(fullPartySave(20));
    g.gold = 5000;
    const fallen = g.activeUnit()!;
    applyDamage(g.sim, null, fallen, 1e9, 'physical');
    g.update(0.05);
    const downIdx = g.party.findIndex((r) => r.respawnAt > g.sim.time);
    expect(downIdx).toBeGreaterThanOrEqual(0); // someone is waiting to respawn

    const goldBefore = g.gold;
    const buybacksBefore = g.goldSinks.buybacks;
    expect(g.buyback(downIdx)).toBe(true);
    expect(g.gold).toBeLessThan(goldBefore);
    expect(g.goldSinks.buybacks).toBe(buybacksBefore + 1);
    expect(g.party[downIdx].respawnAt).toBe(0); // respawn timer skipped — hero is back, swap-ready
  });

  it('Tome converts gold to XP with diminishing returns', () => {
    const save = soloSave('juggernaut', 10);
    save.gold = 10000;
    const g = Game.headless(save);
    const goldBefore = g.gold;
    const xpBefore = g.activeUnit()!.xp;

    expect(g.buyTome(0)).toBe(true);
    expect(g.gold).toBeLessThan(goldBefore);
    expect(g.activeUnit()!.xp).toBeGreaterThan(xpBefore);
    expect(g.goldSinks.tomesUsed).toBe(1);

    // diminishing returns: the second Tome grants strictly less XP than the first
    const firstGain = g.activeUnit()!.xp - xpBefore;
    const xpMid = g.activeUnit()!.xp;
    expect(g.buyTome(0)).toBe(true);
    const secondGain = g.activeUnit()!.xp - xpMid;
    expect(secondGain).toBeLessThan(firstGain);
    expect(g.goldSinks.tomesUsed).toBe(2);
  });

  it('respec re-opens a non-perfected talent tier for gold, out of combat', () => {
    const save = soloSave('juggernaut', 25);
    save.gold = 5000;
    save.roster[0].talentPicks = [0, 1, 0, null];
    const g = Game.headless(save);
    const hero = g.activeUnit()!;
    hero.lastDealtDamageAt = -999;
    hero.lastEnemyDamageAt = -999;

    const goldBefore = g.gold;
    expect(g.respec(0)).toBe(true);
    expect(g.gold).toBe(goldBefore - TUNING.respecCost);
    expect(g.goldSinks.respecs).toBe(1);
    expect(g.party[0].talentPicks).toEqual([null, null, null, null]);
  });

  it('no shop or sink path ever vends a gated top-tier item', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 999999;
    const g = Game.headless(save);
    g.activeUnit()!.pos = { ...g.region.town.pos };

    // every gated item is excluded from every shop list...
    const shopItems = new Set([...REG.regions.values()].flatMap((r) => [...r.shopInventory, ...(r.secretShop?.inventory ?? [])]));
    for (const id of GATED_TOP_TIER) {
      expect(REG.items.has(id), id).toBe(true);
      expect(shopItems.has(id), `${id} listed in a shop`).toBe(false);
      // ...and the buy path itself refuses to vend it even when asked directly
      expect(g.shopSells(id)).toBe(false);
      const hero = g.activeUnit()!;
      const had = hero.items.filter((it) => it?.defId === id).length;
      g.buyItem(id);
      expect(hero.items.filter((it) => it?.defId === id).length).toBe(had);
    }
  });
});

// ----------------------------------------------------------------
// Loot overhaul L3/L4: curated chase + Black Market sinks
// ----------------------------------------------------------------
describe('loot overhaul curated chase and black-market sinks', () => {
  it('themes boss anchor pools by hero identity instead of the old hash', () => {
    const pa = REG.boss('boss-phantom-assassin');
    const wk = REG.boss('boss-wraith-king');
    const invoker = REG.boss('boss-invoker');

    expect(pa.loot.guaranteed).toContain('eaglesong');
    expect(pa.loot.assembledPool).toContain('butterfly');
    expect(pa.loot.assembledPool).toContain('eye-of-skadi');
    expect(pa.loot.assembledPool).not.toContain('heart-of-tarrasque');

    expect(wk.loot.guaranteed).toContain('reaver');
    expect(wk.loot.assembledPool).toContain('heart-of-tarrasque');
    expect(wk.loot.assembledPool).toContain('assault-cuirass');
    expect(wk.loot.assembledPool).not.toContain('butterfly');

    expect(invoker.loot.guaranteed).toContain('mystic-staff');
    expect(invoker.loot.assembledPool).toContain('scythe-of-vyse');
    expect(invoker.loot.assembledPool).toContain('refresher-orb');

    for (const item of REG.items.values()) expect(item.rarity, item.id).toBeDefined();
    expect(itemAllowedFromSource('divine-rapier', 'gamble')).toBe(false);
    expect(itemAllowedFromSource('aegis-of-the-immortal', 'shop')).toBe(false);
  });

  it('owned-hero echoes can drop attribute-themed components into the Armory', () => {
    const save = soloSave('sven', 20);
    const g = Game.headless(save);
    const before = g.inventoryStash.length;

    let dropped = false;
    for (let i = 0; i < 12 && !dropped; i++) {
      g.unlockOwnedHeroEcho('sven');
      dropped = g.inventoryStash.length > before;
    }

    expect(dropped).toBe(true);
    const ids = g.inventoryStash.slice(before).map((it) => it.id);
    expect(ids.some((id) => ['belt-of-strength', 'ogre-axe', 'reaver', 'vitality-booster'].includes(id))).toBe(true);
  });

  it('Black Market wheels spend gold, obey source reservations, and bind relics', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 20000;
    const g = Game.headless(save);
    g.activeUnit()!.pos = { ...g.region.town.pos };
    const marksBefore = { ...g.lootMarks };

    const goldBeforeRecipe = g.gold;
    const recipe = g.blackMarketRecipeWheel('rare');
    expect(recipe).not.toBeNull();
    expect(g.gold).toBe(goldBeforeRecipe - TUNING.blackMarket.recipeWheelCost);
    expect(REG.item(recipe!.id).tier === 'component' || REG.item(recipe!.id).tier === 'basic').toBe(true);
    expect(itemAllowedFromSource(recipe!.id, 'gamble')).toBe(true);

    const goldBeforeRelic = g.gold;
    const relic = g.blackMarketRelicWheel('legendary');
    expect(relic).not.toBeNull();
    const relicDef = REG.item(relic!.id);
    expect(g.gold).toBe(goldBeforeRelic - (TUNING.blackMarket.relicWheelBaseCost + TUNING.blackMarket.relicWheelStepCost));
    expect(['t1', 't2', 't3', 't4']).toContain(relicDef.tier);
    expect(relicDef.rarity).not.toBe('immortal');
    expect(relicDef.rarity).not.toBe('arcana');
    expect(GATED_TOP_TIER.has(relic!.id)).toBe(false);
    expect(g.inventoryStash.find((it) => it.id === relic!.id)?.bound).toBe(true);
    expect(g.lootMarks).toEqual(marksBefore);
  });

  it('Loot Marks accrue from earned progress drops and boss clears, then redeem for a bound Legendary', () => {
    const save = fullPartySave(30);
    save.gold = 20000;
    const g = Game.headless(save);
    g.activeUnit()!.pos = { ...g.region.town.pos };

    const before = g.lootMarks.early;
    const boss = g.runBossFight('boss-phantom-assassin', 'normal');
    expect(boss.won).toBe(true);
    expect(g.lootMarks.early).toBeGreaterThan(before);

    g.lootMarks.early = TUNING.loot.bandMarkQuota.early;
    const redeemed = g.blackMarketRedeemLootMark('early');
    expect(redeemed).not.toBeNull();
    expect(redeemed!.bound).toBe(true);
    expect(['t1', 't2', 't3', 't4']).toContain(REG.item(redeemed!.id).tier);
    expect(REG.item(redeemed!.id).rarity).toBe('legendary');
    expect(GATED_TOP_TIER.has(redeemed!.id)).toBe(false);
    expect(g.lootMarks.early).toBe(0);
    expect(g.inventoryStash.find((it) => it.id === redeemed!.id)?.bound).toBe(true);
    expect(g.buildSave().lootMarks.early).toBe(0);
  });

  it('assembles a specific Legendary from Armory components plus essence', () => {
    const save = soloSave('juggernaut', 20);
    save.inventoryStash = [{ id: 'hyperstone' }, { id: 'platemail' }, { id: 'chainmail' }];
    save.essence = TUNING.blackMarket.assemblyEssence;
    const g = Game.headless(save);
    g.activeUnit()!.pos = { ...g.region.town.pos };

    const quote = g.legendaryAssemblyOptions().find((o) => o.itemId === 'assault-cuirass');
    expect(quote?.canCraft).toBe(true);
    const marksBefore = { ...g.lootMarks };
    const assembled = g.assembleLegendary('assault-cuirass');

    expect(assembled).toMatchObject({ id: 'assault-cuirass', bound: true });
    expect(g.inventoryStash.some((it) => it.id === 'hyperstone')).toBe(false);
    expect(g.inventoryStash.some((it) => it.id === 'platemail')).toBe(false);
    expect(g.inventoryStash.some((it) => it.id === 'chainmail')).toBe(false);
    expect(g.inventoryStash.find((it) => it.id === 'assault-cuirass')?.bound).toBe(true);
    expect(g.essence).toBe(0);
    expect(g.lootMarks).toEqual(marksBefore);
  });

  it('optionally converts rich repeat loot into dry gold when resin is empty', () => {
    const prevEnabled = TUNING.resin.enabled;
    TUNING.resin.enabled = true;
    try {
      const save = fullPartySave(30);
      save.resin = 0;
      save.resinUpdatedAt = save.playtimeSec;
      const g = Game.headless(save);
      const goldBefore = g.gold;
      const stashBefore = g.inventoryStash.length;
      const marksBefore = g.lootMarks.early;

      const boss = g.runBossFight('boss-phantom-assassin', 'normal');
      expect(boss.won).toBe(true);
      expect(g.inventoryStash.length).toBe(stashBefore);
      expect(g.gold).toBeGreaterThan(goldBefore);
      expect(g.lootMarks.early).toBe(marksBefore + 1); // clear mark, but no item marks without full loot
      expect(g.resin).toBe(0);
    } finally {
      TUNING.resin.enabled = prevEnabled;
    }
  });

  it('salvages bound Armory dupes into essence without minting gold', () => {
    const save = soloSave('juggernaut', 20);
    save.inventoryStash = [{ id: 'battlefury', bound: true }, { id: 'broadsword' }];
    const g = Game.headless(save);
    const goldBefore = g.gold;

    const essence = g.salvageArmoryItem(0);
    expect(essence).toBeGreaterThan(0);
    expect(g.essence).toBe(essence);
    expect(g.gold).toBe(goldBefore);
    expect(g.inventoryStash.some((it) => it.id === 'battlefury')).toBe(false);
    expect(g.goldSinks.salvages).toBe(1);

    expect(g.salvageArmoryItem(0)).toBe(0);
    expect(g.inventoryStash.some((it) => it.id === 'broadsword')).toBe(true);
  });

  it('grades up a bound Armory item through the deterministic Forge path', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 10_000;
    save.essence = 100;
    save.inventoryStash = [{ id: 'daedalus', bound: true, grade: 'standard', gradeRoll: 0.4, affixes: [], sockets: [] }];
    const g = Game.headless(save);
    const quote = g.forgeGradeUpQuote(0, true)!;

    expect(quote.to).toBe('sharp');
    expect(g.forgeArmoryItemGrade(0, true)).toBe(true);
    expect(g.inventoryStash[0].grade).toBe('sharp');
    expect(g.inventoryStash[0].affixes?.length).toBeGreaterThan(0);
    expect(g.inventoryStash[0].resolvedMods).toBeDefined();
    expect(g.essence).toBe(100 - GRADE_UP_COSTS.sharp.deterministicEssence);
  });

  it('reforges affixes and masterworks grade roll for bound Armory items', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 10_000;
    save.essence = 100;
    save.inventoryStash = [{
      id: 'daedalus',
      bound: true,
      grade: 'sharp',
      gradeRoll: 0.2,
      affixes: [{ affixId: 'heavy', roll: 0.2, resolved: { damage: 6 } }],
      sockets: []
    }];
    const g = Game.headless(save);
    const goldBeforeReforge = g.gold;
    const essenceBeforeReforge = g.essence;

    expect(g.reforgeArmoryItem(0)).toBe(true);
    expect(g.inventoryStash[0].affixes?.length).toBeGreaterThan(0);
    expect(g.gold).toBe(goldBeforeReforge - REFORGE_COSTS.sharp.gold);
    expect(g.essence).toBe(essenceBeforeReforge - REFORGE_COSTS.sharp.essence);

    const beforeRoll = g.inventoryStash[0].gradeRoll!;
    const goldBeforeMasterwork = g.gold;
    const essenceBeforeMasterwork = g.essence;
    expect(g.masterworkArmoryItem(0)).toBe(true);
    expect(g.inventoryStash[0].gradeRoll).toBeGreaterThan(beforeRoll);
    expect(g.gold).toBe(goldBeforeMasterwork - MASTERWORK_COSTS.sharp.gold);
    expect(g.essence).toBe(essenceBeforeMasterwork - MASTERWORK_COSTS.sharp.essence);
  });

  it('sockets and unsockets Armory gems on bound items', () => {
    const save = soloSave('juggernaut', 20);
    save.inventoryStash = [
      { id: 'daedalus', bound: true, grade: 'refined', gradeRoll: 0.5, affixes: [], sockets: [null], resolvedMods: {} },
      { id: 'chipped-topaz' }
    ];
    const g = Game.headless(save);
    const gem = gemDef('chipped-topaz')!;

    expect(REG.item('chipped-topaz').exclusiveTo).toEqual(['creep', 'dungeon']);
    expect(g.equipArmoryItemForHero('juggernaut', 1)).toBe(false);
    expect(g.socketArmoryGem(0, 0, 1)).toBe(true);
    expect(g.inventoryStash).toHaveLength(1);
    expect(g.inventoryStash[0].sockets).toEqual(['chipped-topaz']);
    const damageWithGem = g.inventoryStash[0].resolvedMods?.damage ?? 0;
    expect(damageWithGem).toBeGreaterThan(gem.mods.damage ?? 0);

    expect(g.unsocketArmoryGem(0, 0)).toBe(true);
    expect(g.inventoryStash[0].sockets).toEqual([null]);
    expect(g.inventoryStash[0].resolvedMods?.damage ?? 0).toBeLessThan(damageWithGem);
    expect(g.inventoryStash[1]).toEqual({ id: 'chipped-topaz' });
  });

  it('rerolls, imprints, and preserves an affix through reforge', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 10_000;
    save.essence = 100;
    save.inventoryStash = [{
      id: 'daedalus',
      bound: true,
      grade: 'sharp',
      gradeRoll: 0.5,
      affixes: [
        { affixId: 'heavy', roll: 0.2, resolved: { damage: 6 } },
        { affixId: 'blooddrinkers', roll: 0.8, resolved: { lifestealPct: 9 } }
      ],
      sockets: []
    }];
    const g = Game.headless(save);

    expect(g.imprintArmoryAffix(0, 0)).toBe(true);
    expect(g.inventoryStash[0].imprintedAffixId).toBe('heavy');
    expect(g.essence).toBe(100 - IMPRINT_COSTS.sharp.essence);
    expect(g.rerollArmoryAffix(0, 0)).toBe(false);

    const goldBeforeReroll = g.gold;
    expect(g.rerollArmoryAffix(0, 1)).toBe(true);
    expect(g.gold).toBe(goldBeforeReroll - REROLL_AFFIX_COSTS.sharp.gold);

    expect(g.reforgeArmoryItem(0)).toBe(true);
    expect(g.inventoryStash[0].affixes?.some((affix) => affix.affixId === 'heavy')).toBe(true);
    expect(g.inventoryStash[0].imprintedAffixId).toBe('heavy');
  });

  it('adds sockets and fuses matching gems', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 10_000;
    save.essence = 100;
    save.inventoryStash = [
      { id: 'daedalus', bound: true, grade: 'refined', gradeRoll: 0.5, affixes: [], sockets: [] },
      { id: 'chipped-ruby' },
      { id: 'chipped-ruby' },
      { id: 'chipped-ruby' }
    ];
    const g = Game.headless(save);

    expect(g.addArmorySocketQuote(0)?.cap).toBeGreaterThan(0);
    expect(g.addArmorySocket(0)).toBe(true);
    expect(g.inventoryStash[0].sockets).toEqual([null]);

    const fuse = g.gemFuseOptions()[0];
    expect(fuse.to).toBe('Flawed Ruby');
    expect(g.fuseArmoryGems(fuse.indices)).toBe(true);
    expect(g.inventoryStash.some((item) => item.id === 'flawed-ruby')).toBe(true);
    expect(g.inventoryStash.filter((item) => item.id === 'chipped-ruby')).toHaveLength(0);
  });

  it('persists loot filter settings and salvages filtered unlocked junk only', () => {
    const save = soloSave('juggernaut', 20);
    save.inventoryStash = [
      { id: 'crystalys', bound: true, grade: 'broken', gradeRoll: 0.1, affixes: [], sockets: [] },
      { id: 'daedalus', bound: true, grade: 'pristine', gradeRoll: 1, affixes: [], sockets: [], locked: true }
    ];
    const g = Game.headless(save);
    g.setLootFilter({ minGrade: 'standard', minRarity: 'rare', autoDisenchantBelowGrade: 'standard' });

    const essence = g.salvageFilteredArmoryJunk();
    expect(essence).toBeGreaterThan(0);
    expect(g.inventoryStash.map((item) => item.id)).toEqual(['daedalus']);

    const rebuilt = g.buildSave();
    expect(rebuilt.lootFilter?.minGrade).toBe('standard');
    expect(rebuilt.lootFilter?.autoDisenchantBelowGrade).toBe('standard');
  });

  it('exposes live Black Market wheel costs through the view-model', () => {
    const save = soloSave('juggernaut', 20);
    save.gold = 5000;
    const g = Game.headless(save);
    g.activeUnit()!.pos = { ...g.region.town.pos };

    const view = g.blackMarketView();
    expect(view.inTown).toBe(true);
    expect(view.gold).toBe(5000);
    expect(view.recipeCost).toBe(TUNING.blackMarket.recipeWheelCost);
    expect(view.relicCost).toBe(TUNING.blackMarket.relicWheelBaseCost);
    expect(view.relicCeiling).toBe('legendary');
    expect(view.recipeRarities).toContain('rare');
  });

  it('relic-wheel copies can come pre-upgraded but never above the collectible grades', () => {
    let sawQuality = false;
    for (let s = 0; s < 80 && !sawQuality; s++) {
      const save = soloSave('juggernaut', 20);
      save.gold = 999999;
      const g = Game.headless(save);
      g.activeUnit()!.pos = { ...g.region.town.pos };
      g.goldSinks.gambleRolls = s; // vary the seeded quality salt
      const relic = g.blackMarketRelicWheel('legendary');
      expect(relic).not.toBeNull();
      if (relic!.quality) {
        sawQuality = true;
        // The wheel tops out below the reserved prestige grade.
        expect(relic!.quality).not.toBe('unusual');
        expect(relic!.bound).toBe(true);
      }
    }
    expect(sawQuality).toBe(true);
  });
});

describe('quality at the source (L5)', () => {
  it('raid anchors can drop an upgraded-quality copy on some seed', () => {
    const raid = REG.raid('roshan-pit');
    expect(raid.loot.qualityOdds).toBeDefined();

    let sawQuality = false;
    for (let s = 1; s <= 200 && !sawQuality; s++) {
      const roll = rollLoot(raid.loot, 'hell', 0, s);
      if (roll.assembled?.quality) sawQuality = true;
    }
    expect(sawQuality).toBe(true);
  });

  it('boss anchors carry modest source quality odds but never roll the reserved Unusual grade', () => {
    const boss = REG.boss('boss-phantom-assassin');
    expect(boss.loot.qualityOdds).toBeDefined();
    expect(boss.loot.qualityOdds!.unusual ?? 0).toBe(0);

    let sawQuality = false;
    for (let s = 1; s <= 400 && !sawQuality; s++) {
      const roll = rollLoot(boss.loot, 'hell', 0, s);
      if (roll.assembled?.quality) {
        sawQuality = true;
        expect(roll.assembled.quality).not.toBe('unusual');
      }
    }
    expect(sawQuality).toBe(true);
  });
});
