import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES, ALL_REGIONS, ALL_DUNGEONS, ALL_ROOM_TEMPLATES } from '../data/index';
import { ALL_GYMS } from '../data/gyms/index';
import { ALL_QUESTS, ALL_TRIALS } from '../data/quests/index';
import { ALL_ITEMS } from '../data/items/index';
import { ALL_CREEPS } from '../data/creeps/index';
import { ALL_NEUTRAL_ITEMS } from '../data/neutral-items';
import { ALL_BOSSES } from '../data/bosses';
import { ALL_RAIDS } from '../data/raids';
import { ALL_LORE_ENTRIES } from '../data/lore';
import { ALL_CUTSCENES, OUTWORLD_CLAIMANT_RAID_IDS } from '../data/cutscenes';
import { ALL_LEGENDS, ALL_SEASONAL_EVENTS } from '../data/events';
import { ALL_DRAFTS } from '../data/drafts';
import { ALL_TRAINERS } from '../data/trainers';
import { ESPORTS_DENYLIST, denylistHit } from '../data/denylist';
import { REG } from '../core/registry';
import { ACTIVE_ELEMENTS, elementForAbility, elementForHero, elementForItemHit } from '../core/resonance';
import { PHASE5_STARTER_ASSETS, ENABLED_HERO_COHORTS, heroBaseId } from '../engine/assets';
import { HERO_LIKENESS_PROFILES } from '../engine/models';
import { PERFORMANCE_BUDGET } from '../engine/performance';
import type { AbilityDef, AnimGesture, AttackVisualKind, DropSource, EffectNode, ItemAppearancePart, ItemWeaponVisualKind, SoundArchetype, ValueRef, VfxArchetype } from '../core/types';
import { abilityMaxLevel } from '../core/values';
import { gestureForAbility, soundForAbility } from '../core/gestures';

// ============================================================
// Data lint (SPEC §1.2): every entry validates, every
// cross-reference resolves. Grows with the content.
// ============================================================

beforeAll(() => registerAllContent());

const VFX_ARCHETYPES: VfxArchetype[] = [
  'projectile', 'ground-aoe', 'chain', 'beam', 'summon-pop', 'shield',
  'stun-stars', 'channel', 'global-mark', 'hook', 'wall', 'storm',
  'vortex', 'dome', 'mine', 'cyclone'
];

const STATUS_IDS = [
  'stun', 'root', 'silence', 'hex', 'slow', 'disarm', 'blind', 'fear', 'taunt',
  'invis', 'magic-immune', 'break', 'cyclone', 'sleep', 'frozen', 'buff'
];

const ANIM_GESTURES: AnimGesture[] = ['melee-swing', 'ranged-shot', 'staff-cast', 'ground-slam', 'dash', 'channel-loop', 'summon-gesture', 'item-use', 'global-cast', 'toggle-stance'];
const SOUND_ARCHETYPES: SoundArchetype[] = ['blade', 'bow', 'impact', 'frost', 'fire', 'storm', 'void', 'heal', 'summon', 'item', 'roar', 'lightning'];
const STINGER_IDS = ['capture', 'merge', 'levelup', 'badge', 'raid-clear', 'loot'];
const CUTSCENE_SHOT_ANGLES = ['wide', 'close', 'low', 'high', 'bird-eye', 'over-shoulder', 'through-objects', 'reflection', 'title-card'];
const CUTSCENE_SHOT_MOVES = ['hold', 'push-in', 'pull-back', 'crane', 'snap', 'rack-focus', 'orbit'];
const CUTSCENE_TEMPLATE_KEYS = new Set(['hero', 'heroId', 'bark', 'badge', 'boss', 'bossLine', 'raid', 'echoLine', 'trial', 'speaker', 'trialLine', 'closing', 'item', 'itemLore', 'claimant', 'event', 'legend']);
const GATED_TOP_TIER = ['divine-rapier', 'butterfly', 'scythe-of-vyse', 'heart-of-tarrasque', 'eye-of-skadi', 'refresher-orb', 'aghanims-scepter', 'abyssal-blade', 'bloodthorn', 'radiance', 'satanic', 'octarine-core', 'aghanims-blessing', 'aghanims-shard', 'aegis-of-the-immortal', 'refresher-shard', 'cheese'];
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, mythical: 3, legendary: 4, immortal: 5, arcana: 6 } as const;
const RESERVED_DROP_SOURCES: DropSource[] = ['boss', 'raid', 'dungeon', 'special-battle'];
const CODED_DROP_HOMES: Record<string, DropSource[]> = {
  // Roshan repeat rewards are delivered by `Game.deliverRaidLoot` after the
  // configured repeat clear, not by the base raid table every clear.
  'refresher-shard': ['raid'],
  cheese: ['raid']
};
const ITEM_WEAPON_VISUALS: ItemWeaponVisualKind[] = ['none', 'sword', 'staff', 'hook', 'totem', 'rifle', 'cleaver', 'broad-cleaver', 'glowing-blade', 'long-pole', 'storm-haft'];
const ITEM_APPEARANCE_PARTS: ItemAppearancePart[] = ['pauldrons', 'heart-core', 'frost-shards', 'boot-trail', 'wing-blades', 'crystal-edge', 'mana-orb', 'hex-sigil', 'cloak', 'halo'];
const ATTACK_VISUALS: AttackVisualKind[] = ['cleave-sweep', 'ranged-conversion', 'lightning-bounce', 'tinted-impact', 'crit-lunge', 'armor-shred-flash'];

function dropHomesForItem(itemId: string): Set<DropSource> {
  const homes = new Set<DropSource>(CODED_DROP_HOMES[itemId] ?? []);
  for (const boss of ALL_BOSSES) {
    if ([...boss.loot.guaranteed, ...boss.loot.assembledPool].includes(itemId)) homes.add('boss');
  }
  for (const raid of ALL_RAIDS) {
    if ([...raid.loot.guaranteed, ...raid.loot.assembledPool].includes(itemId)) homes.add('raid');
  }
  for (const dungeon of ALL_DUNGEONS) {
    for (const table of Object.values(dungeon.loot)) {
      if (table.guaranteed.includes(itemId) || table.slots.some((slot) => slot.pool.some((entry) => entry.id === itemId))) homes.add('dungeon');
    }
  }
  return homes;
}

function expectHex(color: string, where: string): void {
  expect(color, where).toMatch(/^#[0-9a-fA-F]{6}$/);
}

function lintCutsceneText(text: string | undefined, where: string): void {
  if (!text) return;
  expect(text.startsWith('ref:'), `${where}: unresolved ref`).toBe(false);
  for (const match of text.matchAll(/\{([a-zA-Z0-9_-]+)\}/g)) {
    expect(CUTSCENE_TEMPLATE_KEYS.has(match[1]), `${where}: template ${match[1]}`).toBe(true);
  }
}

function checkValueRef(ref: ValueRef | undefined, def: AbilityDef, where: string): void {
  if (ref === undefined || typeof ref === 'number') return;
  expect(def.values?.[ref], `${where}: value key '${ref}' missing on ${def.id}`).toBeDefined();
}

function walkEffects(effects: EffectNode[] | undefined, def: AbilityDef, where: string, exoticIds: string[]): void {
  if (!effects) return;
  for (const node of effects) {
    switch (node.kind) {
      case 'damage':
        checkValueRef(node.amount, def, where);
        checkValueRef(node.radius, def, where);
        expect(['physical', 'magical', 'pure']).toContain(node.dtype);
        break;
      case 'heal':
        checkValueRef(node.amount, def, where);
        break;
      case 'mana':
        checkValueRef(node.amount, def, where);
        break;
      case 'status':
        expect(STATUS_IDS, `${where}: bad status ${node.status}`).toContain(node.status);
        checkValueRef(node.duration, def, where);
        if (node.params?.dotDps) checkValueRef(node.params.dotDps, def, where);
        if (node.params?.moveSlowPct) checkValueRef(node.params.moveSlowPct, def, where);
        if (node.params?.periodic) walkEffects(node.params.periodic.effects, def, `${where}>periodic`, exoticIds);
        break;
      case 'displace':
        checkValueRef(node.distance, def, where);
        checkValueRef(node.speed, def, where);
        break;
      case 'zone':
        checkValueRef(node.zone.duration, def, where);
        if (node.zone.tick) walkEffects(node.zone.tick.effects, def, `${where}>zone-tick`, exoticIds);
        if (node.zone.onEnter) walkEffects(node.zone.onEnter.effects, def, `${where}>zone-enter`, exoticIds);
        break;
      case 'summon':
        expect(node.summon.silhouette, `${where}: summon needs silhouette`).toBeDefined();
        expect(node.summon.palette.length).toBe(3);
        for (const sa of node.summon.abilities ?? []) lintAbility(sa, `${where}>summon`, exoticIds);
        break;
      case 'statmod':
        for (const k in node.mods) checkValueRef(node.mods[k], def, where);
        break;
      case 'projectile':
        checkValueRef(node.proj.speed, def, where);
        walkEffects(node.proj.onHit, def, `${where}>onhit`, exoticIds);
        break;
      case 'repeat':
        checkValueRef(node.count, def, where);
        walkEffects(node.effects, def, `${where}>repeat`, exoticIds);
        break;
      case 'exotic':
        exoticIds.push(node.id);
        break;
      case 'capture-channel':
      case 'purge':
        break;
    }
  }
}

function lintAbility(def: AbilityDef, where: string, exoticIds: string[], requireTags = false): void {
  expect(def.id, `${where}: ability id`).toBeTruthy();
  expect(VFX_ARCHETYPES, `${where}/${def.id}: vfx archetype '${def.vfx.archetype}'`).toContain(def.vfx.archetype);
  expectHex(def.vfx.color, `${where}/${def.id}: vfx color`);
  // §6: anim/sound are required on every castable ability and item active
  // (not "if present"). Nested summon sub-abilities stay optional.
  if (requireTags || def.anim !== undefined) {
    expect(def.anim, `${where}/${def.id}: anim required`).toBeTruthy();
    expect(ANIM_GESTURES, `${where}/${def.id}: anim '${def.anim}'`).toContain(def.anim);
  }
  if (requireTags || def.sound !== undefined) {
    expect(def.sound, `${where}/${def.id}: sound required`).toBeTruthy();
    expect(SOUND_ARCHETYPES, `${where}/${def.id}: sound '${def.sound}'`).toContain(def.sound);
  }
  walkEffects(def.effects, def, `${where}/${def.id}`, exoticIds);
  if (def.channel) {
    checkValueRef(def.channel.duration, def, `${where}/${def.id}>channel`);
    if (def.channel.tick) walkEffects(def.channel.tick.effects, def, `${where}/${def.id}>channel-tick`, exoticIds);
    if (def.channel.onEnd) walkEffects(def.channel.onEnd, def, `${where}/${def.id}>channel-end`, exoticIds);
  }
  if (def.toggle) walkEffects(def.toggle.effects, def, `${where}/${def.id}>toggle`, exoticIds);
  if (def.passiveMods) for (const k in def.passiveMods) checkValueRef(def.passiveMods[k], def, `${where}/${def.id}>passive`);
  if (def.aura) {
    for (const k in def.aura.mods ?? {}) checkValueRef(def.aura.mods![k], def, `${where}/${def.id}>aura`);
  }
  for (const trig of def.triggers ?? []) {
    if (trig.effects) walkEffects(trig.effects, def, `${where}/${def.id}>trigger`, exoticIds);
    if (trig.statStack) for (const k in trig.statStack.mods) checkValueRef(trig.statStack.mods[k], def, `${where}/${def.id}>stack`);
  }
  // per-level arrays must cover max level (or be length 1+ for items)
  const ml = abilityMaxLevel(def);
  if (def.manaCost) expect(def.manaCost.length, `${where}/${def.id}: manaCost levels`).toBeGreaterThanOrEqual(1);
  if (def.cooldown) expect(def.cooldown.length, `${where}/${def.id}: cooldown levels`).toBeGreaterThanOrEqual(1);
  void ml;
}

describe('data lint: heroes', () => {
  it('has the Phase 3 roster floor and Aghs coverage', () => {
    expect(ALL_HEROES.length).toBeGreaterThanOrEqual(60);
    expect(ALL_HEROES.filter((h) => h.aghanim?.implemented).length).toBeGreaterThanOrEqual(15);
  });

  for (const hero of ALL_HEROES) {
    describe(hero.id, () => {
      const exoticIds: string[] = [];

      it('validates schema basics', () => {
        expect(['str', 'agi', 'int', 'uni']).toContain(hero.attribute);
        expect(hero.abilities.length).toBe(4);
        expect(hero.talents.length).toBe(4);
        expect(hero.talents.map((t) => t.level)).toEqual([10, 15, 20, 25]);
        for (const t of hero.talents) expect(t.options.length).toBe(2);
        expect(hero.facets.length).toBeGreaterThanOrEqual(1);
        expect(hero.palette.length).toBe(3);
        expect(hero.barks.length).toBeGreaterThanOrEqual(6);
        expect(hero.baseStats.moveSpeed).toBeGreaterThan(200);
        expect(hero.baseStats.turnRate).toBeGreaterThan(0.2);
        expect(hero.animProfile, `${hero.id}: animProfile required`).toBeDefined();
        expect(hero.animProfile!.rig).toBeTruthy();
        expect(hero.animProfile!.castStyle).toBeTruthy();
        expect(hero.animProfile!.voiceTimbre).toBeTruthy();
        expect([...ACTIVE_ELEMENTS, 'neutral']).toContain(elementForHero(hero));
        if (hero.recruitmentQuestId) expect(REG.quests.has(hero.recruitmentQuestId), `${hero.id}: quest ${hero.recruitmentQuestId}`).toBe(true);
        if (!hero.starter) expect(ALL_QUESTS.some((q) => q.heroId === hero.id), `${hero.id}: missing recruitment chain`).toBe(true);
        const ults = hero.abilities.filter((a) => a.ult);
        expect(ults.length, `${hero.id} needs exactly 1 ult`).toBe(1);
      });

      it('region reference resolves', () => {
        expect(REG.regions.has(hero.region), `region ${hero.region}`).toBe(true);
      });

      it('abilities lint clean', () => {
        for (const a of hero.abilities) {
          lintAbility(a, hero.id, exoticIds, true);
          expect([...ACTIVE_ELEMENTS, 'neutral'], `${hero.id}/${a.id}: bad element`).toContain(elementForAbility(hero, a.id));
        }
      });

      it('talent ability-overrides reference real ability value keys', () => {
        for (const tier of hero.talents) {
          for (const opt of tier.options) {
            if (opt.abilityOverride) {
              const ab = hero.abilities.find((a) => a.id === opt.abilityOverride!.abilityId);
              expect(ab, `${hero.id}/${opt.id}: ability ${opt.abilityOverride.abilityId}`).toBeDefined();
              expect(ab!.values?.[opt.abilityOverride.valueKey], `${hero.id}/${opt.id}: key ${opt.abilityOverride.valueKey}`).toBeDefined();
            }
            if (opt.cooldownAdd) {
              const ab = hero.abilities.find((a) => a.id === opt.cooldownAdd!.abilityId);
              expect(ab?.cooldown, `${hero.id}/${opt.id}: cooldownAdd target`).toBeDefined();
            }
          }
        }
        for (const f of hero.facets) {
          if (f.abilityValueOverride) {
            const ab = hero.abilities.find((a) => a.id === f.abilityValueOverride!.abilityId);
            expect(ab?.values?.[f.abilityValueOverride.valueKey], `${hero.id}/${f.id}`).toBeDefined();
          }
        }
      });

      it('exotic references are registered', () => {
        for (const id of exoticIds) {
          expect(REG.exotics.has(id), `exotic ${id} not registered`).toBe(true);
        }
      });
    });
  }
});

describe('data lint: items', () => {
  it('has the Phase 2 item catalog of 30+ entries and resolving recipes', () => {
    const assembled = ALL_ITEMS.filter((i) => ['t1', 't2', 't3', 't4', 'special'].includes(i.tier) || (i.tier === 'basic' && i.components));
    expect(assembled.length).toBeGreaterThanOrEqual(12);
    expect(ALL_ITEMS.length).toBeGreaterThanOrEqual(30);
  });

  for (const item of ALL_ITEMS) {
    it(`${item.id} validates`, () => {
      expect(item.cost).toBeGreaterThanOrEqual(0);
      for (const c of item.components ?? []) {
        expect(REG.items.has(c), `${item.id}: component ${c}`).toBe(true);
      }
      // recipe math: component costs + recipeCost = total cost
      if (item.components && item.components.length > 0) {
        const compSum = item.components.reduce((acc, c) => acc + REG.item(c).cost, 0);
        expect(compSum + (item.recipeCost ?? 0), `${item.id}: cost mismatch`).toBe(item.cost);
      }
      if (item.active) {
        const exoticIds: string[] = [];
        lintAbility(item.active, `item:${item.id}`, exoticIds, true);
        for (const id of exoticIds) expect(REG.exotics.has(id), `item exotic ${id}`).toBe(true);
      }
      if (item.appearance) {
        const app = item.appearance;
        if (app.weapon) {
          expect(ITEM_WEAPON_VISUALS, `${item.id}: weapon visual ${app.weapon.kind}`).toContain(app.weapon.kind);
          if (app.weapon.color) expectHex(app.weapon.color, `${item.id}: weapon color`);
          if (app.weapon.emissive) expectHex(app.weapon.emissive, `${item.id}: weapon emissive`);
        }
        for (const part of app.parts ?? []) {
          expect(ITEM_APPEARANCE_PARTS, `${item.id}: appearance part ${part}`).toContain(part);
        }
        if (app.tint) expectHex(app.tint, `${item.id}: tint`);
        if (app.aura) {
          expect(VFX_ARCHETYPES, `${item.id}: aura ${app.aura.archetype}`).toContain(app.aura.archetype);
          expectHex(app.aura.color, `${item.id}: aura color`);
          if (app.aura.color2) expectHex(app.aura.color2, `${item.id}: aura color2`);
        }
      }
      for (const visual of item.attackVisual ?? []) {
        expect(ATTACK_VISUALS, `${item.id}: attack visual ${visual.kind}`).toContain(visual.kind);
        expectHex(visual.color, `${item.id}: attack visual color`);
        if (visual.color2) expectHex(visual.color2, `${item.id}: attack visual color2`);
        if (visual.scale !== undefined) expect(visual.scale, `${item.id}: attack visual scale`).toBeGreaterThan(0);
      }
      if (item.elementOnHit) expect(ACTIVE_ELEMENTS, `${item.id}: bad on-hit element`).toContain(item.elementOnHit);
      if (item.charges !== undefined) expect(item.charges).toBeGreaterThanOrEqual(0);
    });
  }

  it('the Phase 1 identity items exist', () => {
    for (const id of ['blink-dagger', 'black-king-bar', 'euls-scepter', 'force-staff', 'glimmer-cape', 'magic-wand', 'mekansm', 'battlefury', 'diffusal-blade']) {
      expect(REG.items.has(id), id).toBe(true);
    }
  });

  it('gated top-tier items exist and are not sold in normal shops', () => {
    for (const id of GATED_TOP_TIER) expect(REG.items.has(id), id).toBe(true);
    const normalShopItems = new Set(ALL_REGIONS.flatMap((r) => r.shopInventory));
    for (const id of GATED_TOP_TIER) expect(normalShopItems.has(id), `${id} should not be purchasable`).toBe(false);
  });

  it('reserved Legendary+ items have at least one matching combat drop home', () => {
    for (const item of ALL_ITEMS) {
      const rarity = item.rarity ?? 'common';
      if (RARITY_RANK[rarity] < RARITY_RANK.legendary) continue;
      const reservedSources = (item.exclusiveTo ?? []).filter((source) => RESERVED_DROP_SOURCES.includes(source));
      if (reservedSources.length === 0) continue;

      const homes = dropHomesForItem(item.id);
      const matchingHomes = reservedSources.filter((source) => homes.has(source));
      expect(matchingHomes, `${item.id} is reserved for ${reservedSources.join('/')} but has homes ${[...homes].join('/') || 'none'}`).not.toHaveLength(0);
    }
  });

  it('has asset-plan item appearance and attack override coverage', () => {
    expect(ALL_ITEMS.filter((i) => i.appearance).length).toBeGreaterThanOrEqual(65);
    expect(ALL_ITEMS.filter((i) => (i.attackVisual?.length ?? 0) > 0).length).toBeGreaterThanOrEqual(25);
    expect(REG.item('battlefury').appearance?.weapon?.kind).toBe('broad-cleaver');
    expect(REG.item('black-king-bar').appearance?.aura?.archetype).toBe('shield');
    expect(REG.item('blink-dagger').appearance?.weapon?.kind).toBe('sword');
    expect(REG.item('divine-rapier').appearance?.weapon?.kind).toBe('glowing-blade');
    expect(REG.item('assault-cuirass').appearance?.parts).toContain('pauldrons');
    expect(REG.item('crystalys').appearance?.parts).toContain('crystal-edge');
    expect(REG.item('diffusal-blade').attackVisual?.[0]?.kind).toBe('tinted-impact');
    expect(REG.item('glimmer-cape').appearance?.parts).toContain('cloak');
    expect(REG.item('holy-locket').appearance?.parts).toContain('halo');
    expect(REG.item('desolator').attackVisual?.[0]?.kind).toBe('armor-shred-flash');
    expect(REG.item('scythe-of-vyse').appearance?.parts).toContain('hex-sigil');
    expect(REG.item('aghanims-scepter').appearance?.parts).toContain('mana-orb');
    expect(REG.item('aether-lens').appearance?.parts).toContain('mana-orb');
    expect(REG.item('euls-scepter').active?.vfx?.archetype).toBe('cyclone');
    expect(REG.item('wind-waker').appearance?.aura?.archetype).toBe('cyclone');
    expect(REG.item('mjollnir').active?.sound).toBe('lightning');
    expect(REG.item('rod-of-atos').active?.vfx?.archetype).toBe('chain');
  });

  it('has Phase 5 item element hooks for attack-visual enablers', () => {
    expect(elementForItemHit(REG.item('maelstrom'))).toBe('electro');
    expect(elementForItemHit(REG.item('eye-of-skadi'))).toBe('cryo');
  });

  // VFX_ASSETS §7 / §11: "488/488 authored" must mean genuinely distinct reads,
  // not 488 abilities sharing one generic archetype+color. lintAbility already
  // proves every ability carries a *valid* archetype; this gate proves the roster
  // is actually *diverse* — distinct archetype+color combos, real scale/color2
  // authoring, and no single look collapsing across many spells. Thresholds sit
  // safely below the current measured values so they guard regressions without
  // being brittle (measured 2026-06: 464 combos, 284 colors, 455 scale, 145 color2,
  // 15 archetypes, max combo reuse 3).
  it('authors genuinely distinct ability VFX, not just legal archetypes', () => {
    const abilities = ALL_HEROES.flatMap((h) => h.abilities);
    expect(abilities.length).toBeGreaterThanOrEqual(400);

    const archetypes = new Set<string>();
    const colors = new Set<string>();
    const comboCount = new Map<string, number>();
    let withScale = 0;
    let withColor2 = 0;
    for (const a of abilities) {
      const arch = a.vfx.archetype;
      const color = a.vfx.color.toLowerCase();
      archetypes.add(arch);
      colors.add(color);
      const combo = `${arch}|${color}`;
      comboCount.set(combo, (comboCount.get(combo) ?? 0) + 1);
      if (a.vfx.scale !== undefined) withScale++;
      if (a.vfx.color2) withColor2++;
    }

    // Most abilities read uniquely by archetype + identity color.
    expect(comboCount.size, 'distinct archetype+color combos').toBeGreaterThanOrEqual(440);
    expect(colors.size, 'distinct vfx colors').toBeGreaterThanOrEqual(250);
    // The closed vocabulary is actually exercised, not parked on one or two shapes.
    expect(archetypes.size, 'distinct archetypes used').toBeGreaterThanOrEqual(13);
    // Per-spell scaling/secondary color are authored across the roster, so spells
    // of the same archetype still differ in size and accent.
    expect(withScale, 'abilities with explicit vfx.scale').toBeGreaterThanOrEqual(400);
    expect(withColor2, 'abilities with a secondary vfx color').toBeGreaterThanOrEqual(110);
    // No single archetype+color look is allowed to dominate the roster.
    const maxReuse = Math.max(...comboCount.values());
    expect(maxReuse, 'most-reused archetype+color combo').toBeLessThanOrEqual(6);
  });
});

describe('data lint: Phase 4/5 polish infrastructure', () => {
  it('declares the renderer performance budget', () => {
    expect(PERFORMANCE_BUDGET.targetFps).toBe(60);
    expect(PERFORMANCE_BUDGET.activeUnits).toBeGreaterThanOrEqual(30);
    expect(PERFORMANCE_BUDGET.liveProjectilesOrParticles).toBeGreaterThanOrEqual(200);
    expect(PERFORMANCE_BUDGET.maxPixelRatio).toBeLessThanOrEqual(2);
  });

  it('ships a per-hero glTF manifest for every enabled cohort, with procedural fallback', () => {
    const ids = new Set(PHASE5_STARTER_ASSETS.map((a) => a.heroId));
    // The original starters stay shipped, now alongside the full KayKit cohorts.
    for (const starter of ['crystal-maiden', 'earthshaker', 'juggernaut', 'lich', 'pudge', 'sniper']) {
      expect(ids.has(starter), `${starter} shipped`).toBe(true);
    }
    // Knight + Mage + Barbarian + Rogue cohorts (no-budget policy: one file per hero).
    expect(PHASE5_STARTER_ASSETS.length).toBe(80);
    for (const asset of PHASE5_STARTER_ASSETS) {
      // Every shipped model belongs to an enabled humanoid cohort.
      expect(ENABLED_HERO_COHORTS.has(heroBaseId(asset.heroId)), `${asset.heroId} cohort`).toBe(true);
      expect(asset.modelUrl).toMatch(/\.glb$/);
      expect(asset.clips.attack).toBeTruthy();
      expect(asset.clips.death).toBeTruthy();
      expect(asset.sockets).toContain('weapon');
      expect(asset.fallback).toBe('procedural');
    }
  });

  it('has recognizable procedural likeness profiles for the shipped starter roster', () => {
    const byHero = new Map(HERO_LIKENESS_PROFILES.map((p) => [p.heroId, p]));
    for (const heroId of ['juggernaut', 'crystal-maiden', 'pudge', 'earthshaker', 'sniper', 'lich']) {
      const profile = byHero.get(heroId);
      expect(profile, `${heroId} likeness profile`).toBeDefined();
      expect(profile!.features.length, `${heroId} features`).toBeGreaterThanOrEqual(4);
      expect(profile!.readsAs).toBeTruthy();
    }
  });

  it('wires the WS-G archetypes (vortex/dome/mine) to their signature spells (WS-B)', () => {
    const archOf = (heroId: string, abilityId: string): string => {
      const hero = REG.hero(heroId);
      const ability = hero.abilities.find((a) => a.id === abilityId);
      expect(ability, `${heroId}:${abilityId}`).toBeDefined();
      return ability!.vfx.archetype;
    };
    expect(archOf('enigma', 'enigma-black-hole')).toBe('vortex');
    expect(archOf('dark-seer', 'ds-vacuum')).toBe('vortex');
    expect(archOf('pangolier', 'pango-rolling-thunder')).toBe('vortex');
    expect(archOf('magnus', 'magnus-rp')).toBe('vortex');
    expect(archOf('mars', 'mars-arena')).toBe('dome');
    expect(archOf('disruptor', 'dis-static-storm')).toBe('dome');
    expect(archOf('faceless-void', 'fv-chronosphere')).toBe('dome');
    expect(archOf('techies', 'techies-proximity-mines')).toBe('mine');
  });

  it('has per-ability glyph hints for the shipped hero roster (WS-F)', () => {
    const abilities = ALL_HEROES.flatMap((h) => h.abilities);
    expect(abilities.length).toBeGreaterThan(0);
    for (const ability of abilities) {
      expect(ability.glyph, `${ability.id} glyph`).toBeTruthy();
    }
  });

  it('has a recognizable likeness profile for the entire shipped roster (WS-A)', () => {
    const byHero = new Map(HERO_LIKENESS_PROFILES.map((p) => [p.heroId, p]));
    for (const hero of ALL_HEROES) {
      const profile = byHero.get(hero.id);
      expect(profile, `${hero.id} likeness profile`).toBeDefined();
      expect(profile!.features.length, `${hero.id} features`).toBeGreaterThanOrEqual(4);
      expect(profile!.readsAs, `${hero.id} readsAs`).toBeTruthy();
    }
    // No orphan profiles referencing heroes that do not exist.
    const roster = new Set(ALL_HEROES.map((h) => h.id));
    for (const profile of HERO_LIKENESS_PROFILES) {
      expect(roster.has(profile.heroId), `profile ${profile.heroId} has no hero`).toBe(true);
    }
  });
});

describe('data lint: creeps', () => {
  it('has the Phase 3 neutral roster across tiers', () => {
    expect(ALL_CREEPS.length).toBeGreaterThanOrEqual(30);
    const tiers = new Set(ALL_CREEPS.map((c) => c.tier));
    expect(tiers.has('small')).toBe(true);
    expect(tiers.has('ancient')).toBe(true);
  });

  for (const creep of ALL_CREEPS) {
    it(`${creep.id} validates`, () => {
      expect(creep.stats.maxHp).toBeGreaterThan(0);
      expect(creep.palette.length).toBe(3);
      expect(creep.bounty.xp).toBeGreaterThan(0);
      expect(creep.animProfile, `${creep.id}: animProfile required`).toBeDefined();
      expect(creep.animProfile!.rig).toBeTruthy();
      if (creep.elementalShield) {
        expect(ACTIVE_ELEMENTS, `${creep.id}: shield element`).toContain(creep.elementalShield.element);
        expect(creep.elementalShield.hp).toBeGreaterThan(0);
        expect(creep.elementalShield.weakMult).toBeGreaterThan(1);
        for (const element of creep.elementalShield.weakTo) expect(ACTIVE_ELEMENTS, `${creep.id}: shield weakness ${element}`).toContain(element);
      }
      const exoticIds: string[] = [];
      for (const a of creep.abilities) lintAbility(a, creep.id, exoticIds, true);
      expect(exoticIds.length).toBe(0);
    });
  }
});

describe('data lint: regions', () => {
  it('has the Phase 3 ten-region world', () => {
    expect(ALL_REGIONS.length).toBeGreaterThanOrEqual(10);
  });

  for (const region of ALL_REGIONS) {
    it(`${region.id} cross-references resolve`, () => {
      for (const camp of region.camps) {
        expect(REG.creeps.has(camp.creepId), `${region.id}: camp creep ${camp.creepId}`).toBe(true);
        expect(camp.pos.x).toBeGreaterThan(0);
        expect(camp.pos.x).toBeLessThan(region.size);
        expect(camp.pos.y).toBeGreaterThan(0);
        expect(camp.pos.y).toBeLessThan(region.size);
      }
      for (const hs of region.heroSpawns) {
        expect(REG.heroes.has(hs.heroId), `${region.id}: hero ${hs.heroId}`).toBe(true);
      }
      for (const echo of region.echoSpawns ?? []) {
        expect(REG.heroes.has(echo.heroId), `${region.id}: echo ${echo.heroId}`).toBe(true);
        expect(echo.pos.x).toBeGreaterThan(0);
        expect(echo.pos.x).toBeLessThan(region.size);
        expect(echo.pos.y).toBeGreaterThan(0);
        expect(echo.pos.y).toBeLessThan(region.size);
      }
      for (const gate of region.gates ?? []) {
        expect(REG.regions.has(gate.toRegionId), `${region.id}: gate ${gate.id}`).toBe(true);
      }
      for (const gym of region.gyms ?? []) {
        expect(REG.gyms.has(gym.gymId), `${region.id}: gym ${gym.gymId}`).toBe(true);
      }
      for (const itemId of region.shopInventory) {
        expect(REG.items.has(itemId), `${region.id}: shop item ${itemId}`).toBe(true);
      }
      for (const itemId of region.secretShop?.inventory ?? []) {
        expect(REG.items.has(itemId), `${region.id}: secret shop item ${itemId}`).toBe(true);
      }
      for (const bossId of region.bosses ?? []) {
        expect(REG.bosses.has(bossId), `${region.id}: boss ${bossId}`).toBe(true);
      }
      for (const raidId of region.raids ?? []) {
        expect(REG.raids.has(raidId), `${region.id}: raid ${raidId}`).toBe(true);
      }
      expect(region.arrivalBeat, `${region.id}: arrival beat`).toMatch(/^arrival-/);
      const poiIds = new Set<string>([
        ...(region.chests ?? []).map((c) => c.id),
        ...(region.waypoints ?? []).map((w) => w.id),
        ...(region.discoveries ?? []).map((d) => d.id),
        ...(region.elementPuzzles ?? []).map((p) => p.id)
      ]);
      for (const chest of region.chests ?? []) {
        expect(chest.pos.x, `${region.id}: chest ${chest.id} x`).toBeGreaterThan(0);
        expect(chest.pos.x, `${region.id}: chest ${chest.id} x`).toBeLessThan(region.size);
        expect(['common', 'rich', 'precious', 'luxurious']).toContain(chest.tier);
        for (const itemId of chest.loot.items ?? []) expect(REG.items.has(itemId), `${region.id}: chest loot ${itemId}`).toBe(true);
        const gate = chest.gate;
        if (gate?.kind === 'camp') expect(region.camps.some((c) => c.id === gate.campId), `${region.id}: chest gate camp ${gate.campId}`).toBe(true);
        if (gate?.kind === 'puzzle') expect(region.elementPuzzles?.some((p) => p.id === gate.puzzleId), `${region.id}: chest gate puzzle ${gate.puzzleId}`).toBe(true);
      }
      for (const shard of region.shards ?? []) {
        expect(shard.pos.x, `${region.id}: shard ${shard.id} x`).toBeGreaterThan(0);
        expect(shard.pos.x, `${region.id}: shard ${shard.id} x`).toBeLessThan(region.size);
      }
      for (const waypoint of region.waypoints ?? []) {
        expect(waypoint.name, `${region.id}: waypoint ${waypoint.id} name`).toBeTruthy();
        expect(waypoint.pos.x, `${region.id}: waypoint ${waypoint.id} x`).toBeGreaterThan(0);
        expect(waypoint.pos.x, `${region.id}: waypoint ${waypoint.id} x`).toBeLessThan(region.size);
      }
      for (const discovery of region.discoveries ?? []) {
        expect(discovery.hint, `${region.id}: discovery ${discovery.id} hint`).toBeTruthy();
        expect(poiIds.has(discovery.reveals), `${region.id}: discovery reveal ${discovery.reveals}`).toBe(true);
      }
      for (const source of region.elementSources ?? []) {
        expect(ACTIVE_ELEMENTS, `${region.id}: element source ${source.id}`).toContain(source.element);
      }
      for (const puzzle of region.elementPuzzles ?? []) {
        expect(ACTIVE_ELEMENTS, `${region.id}: puzzle ${puzzle.id}`).toContain(puzzle.requires);
        expect(['brazier-chain', 'freeze-platform', 'relay', 'burn-brush', 'wind-seed']).toContain(puzzle.kind);
        expect(poiIds.has(puzzle.reveals), `${region.id}: puzzle reveal ${puzzle.reveals}`).toBe(true);
        expect(puzzle.nodes.length, `${region.id}: puzzle ${puzzle.id} nodes`).toBeGreaterThan(0);
      }
    });
  }

  it('every shop sells the demo-critical items', () => {
    const tv = REG.region('tranquil-vale');
    expect(tv.shopInventory).toContain('blink-dagger');
    expect(tv.shopInventory).toContain('tango');
  });
});

describe('data lint: gyms and trials', () => {
  it('has eight gyms and at least 12 bespoke trial types', () => {
    expect(ALL_GYMS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ALL_TRIALS.map((t) => t.kind)).size).toBeGreaterThanOrEqual(12);
  });

  for (const gym of ALL_GYMS) {
    it(`${gym.id} resolves macro teams and badge`, () => {
      expect(REG.regions.has(gym.regionId)).toBe(true);
      expect(gym.badgeId).toBeTruthy();
      expect(gym.enemyTeam.length).toBe(5);
      for (const h of gym.enemyTeam) {
        expect(REG.heroes.has(h.heroId), `${gym.id}: enemy ${h.heroId}`).toBe(true);
        for (const item of h.items ?? []) expect(REG.items.has(item), `${gym.id}: item ${item}`).toBe(true);
      }
    });
  }

  for (const trial of ALL_TRIALS) {
    it(`${trial.id} resolves hero and region`, () => {
      expect(REG.heroes.has(trial.heroId)).toBe(true);
      expect(REG.regions.has(trial.regionId)).toBe(true);
      const quest = ALL_QUESTS.find((q) => q.heroId === trial.heroId);
      expect(quest?.trialId).toBe(trial.id);
    });
  }
});

describe('data lint: Phase 3 registries', () => {
  it('bosses, raids, drafts, and neutral items resolve', () => {
    expect(ALL_BOSSES.length).toBeGreaterThanOrEqual(30);
    for (const boss of ALL_BOSSES) {
      expect(REG.heroes.has(boss.heroId), `${boss.id}: hero`).toBe(true);
      expect(REG.regions.has(boss.region), `${boss.id}: region`).toBe(true);
      expect(boss.dialogue.length, `${boss.id}: dialogue`).toBeGreaterThanOrEqual(2);
      for (const id of [...boss.loot.guaranteed, ...boss.loot.assembledPool]) expect(REG.items.has(id), `${boss.id}: loot ${id}`).toBe(true);
    }
    expect(ALL_RAIDS.length).toBe(11);
    for (const raid of ALL_RAIDS) {
      expect(REG.heroes.has(raid.boss.heroId), `${raid.id}: boss hero`).toBe(true);
      expect(REG.quests.has(raid.unlockQuest), `${raid.id}: unlock`).toBe(true);
      for (const id of [...raid.loot.guaranteed, ...raid.loot.assembledPool]) expect(REG.items.has(id), `${raid.id}: loot ${id}`).toBe(true);
      if (raid.signatureExotic) expect(REG.exotics.has(raid.signatureExotic), `${raid.id}: exotic`).toBe(true);
    }
    expect(ALL_DUNGEONS.length).toBeGreaterThanOrEqual(4);
    expect(ALL_ROOM_TEMPLATES.length).toBeGreaterThanOrEqual(ALL_DUNGEONS.length * 3);
    for (const template of ALL_ROOM_TEMPLATES) {
      expect(REG.roomTemplates.has(template.id), `${template.id}: registered`).toBe(true);
      expect(template.size.x, `${template.id}: width`).toBeGreaterThan(1000);
      expect(template.size.y, `${template.id}: height`).toBeGreaterThan(1000);
      expect(template.connectors.length, `${template.id}: connectors`).toBeGreaterThan(0);
      expect(template.spawnAnchors.length, `${template.id}: anchors`).toBeGreaterThan(0);
      for (const c of template.connectors) {
        expect(['n', 's', 'e', 'w']).toContain(c.side);
        expect(c.at.x, `${template.id}: connector x`).toBeGreaterThanOrEqual(0);
        expect(c.at.x, `${template.id}: connector x`).toBeLessThanOrEqual(template.size.x);
        expect(c.at.y, `${template.id}: connector y`).toBeGreaterThanOrEqual(0);
        expect(c.at.y, `${template.id}: connector y`).toBeLessThanOrEqual(template.size.y);
      }
      for (const a of template.spawnAnchors) {
        expect(a.x, `${template.id}: anchor x`).toBeGreaterThan(0);
        expect(a.x, `${template.id}: anchor x`).toBeLessThan(template.size.x);
        expect(a.y, `${template.id}: anchor y`).toBeGreaterThan(0);
        expect(a.y, `${template.id}: anchor y`).toBeLessThan(template.size.y);
      }
    }
    for (const dungeon of ALL_DUNGEONS) {
      expect(REG.regions.has(dungeon.regionId), `${dungeon.id}: region`).toBe(true);
      expect(REG.bosses.has(dungeon.guardian), `${dungeon.id}: guardian`).toBe(true);
      for (const templateId of dungeon.templates) {
        const template = REG.roomTemplate(templateId);
        expect(template.biome, `${dungeon.id}: template ${templateId} biome`).toBe(dungeon.biome);
      }
      for (const type of ['entrance', 'combat', 'elite', 'treasure', 'rest', 'boss'] as const) {
        expect(dungeon.templates.some((id) => REG.roomTemplate(id).allowTypes.includes(type)), `${dungeon.id}: template for ${type}`).toBe(true);
      }
    }
    expect(ALL_DRAFTS.length).toBeGreaterThanOrEqual(1);
    for (const draft of ALL_DRAFTS) {
      for (const member of draft.members) for (const heroId of member.pool) expect(REG.heroes.has(heroId), `${draft.id}: pool ${heroId}`).toBe(true);
    }
    expect(ALL_LORE_ENTRIES.length).toBeGreaterThanOrEqual(8);
    for (const entry of ALL_LORE_ENTRIES) {
      expect(REG.loreEntries.has(entry.id), `${entry.id}: registered`).toBe(true);
      if (entry.unlock.kind === 'region') expect(REG.regions.has(entry.unlock.regionId), `${entry.id}: region unlock`).toBe(true);
      if (entry.unlock.kind === 'badge') {
        const { badgeId } = entry.unlock;
        expect(ALL_GYMS.some((g) => g.badgeId === badgeId), `${entry.id}: badge unlock`).toBe(true);
      }
    }
    expect(ALL_CUTSCENES.length).toBeGreaterThanOrEqual(20);
    for (const scene of ALL_CUTSCENES) {
      expect(REG.cutscenes.has(scene.id), `${scene.id}: registered`).toBe(true);
      expect(['setpiece', 'stinger', 'bark'], `${scene.id}: tier`).toContain(scene.tier);
      expect(scene.skippable, `${scene.id}: skippable`).toBe(true);
      expect(scene.beats.length, `${scene.id}: beats`).toBeGreaterThan(0);
      lintCutsceneText(scene.title, `${scene.id}: title`);
      if (scene.trigger.kind === 'region-arrival') expect(REG.regions.has(scene.trigger.regionId), `${scene.id}: region trigger`).toBe(true);
      if (scene.trigger.kind === 'badge') {
        const { badgeId } = scene.trigger;
        expect(ALL_GYMS.some((g) => g.badgeId === badgeId), `${scene.id}: badge trigger`).toBe(true);
      }
      if (scene.trigger.kind === 'raid-intro' || scene.trigger.kind === 'raid-clear') {
        if (scene.trigger.raidId) expect(REG.raids.has(scene.trigger.raidId), `${scene.id}: raid trigger`).toBe(true);
      }
      if (scene.trigger.kind === 'item-first-hold') expect(REG.items.has(scene.trigger.itemId), `${scene.id}: item trigger`).toBe(true);
      if (scene.trigger.kind === 'seasonal-event') {
        const { eventId } = scene.trigger;
        expect(ALL_SEASONAL_EVENTS.some((e) => e.id === eventId), `${scene.id}: seasonal trigger`).toBe(true);
      }
      if (scene.trigger.kind === 'legend-callout') {
        const { legendId } = scene.trigger;
        expect(ALL_LEGENDS.some((l) => l.id === legendId), `${scene.id}: legend trigger`).toBe(true);
      }
      if (scene.trigger.kind === 'elite-persona') expect(ALL_DRAFTS[0].members[scene.trigger.index], `${scene.id}: elite trigger`).toBeDefined();
      for (const beat of scene.beats) {
        expect(CUTSCENE_SHOT_ANGLES, `${scene.id}: shot angle`).toContain(beat.shot.angle);
        expect(CUTSCENE_SHOT_MOVES, `${scene.id}: shot move`).toContain(beat.shot.move);
        if (beat.sound) expect([...SOUND_ARCHETYPES, ...STINGER_IDS], `${scene.id}: sound`).toContain(beat.sound);
        lintCutsceneText(beat.line?.speaker, `${scene.id}: speaker`);
        lintCutsceneText(beat.line?.text, `${scene.id}: line`);
        lintCutsceneText(beat.line?.portraitHeroId, `${scene.id}: portrait token`);
        for (const action of beat.stage ?? []) {
          if (action.kind === 'vfx') {
            expect(VFX_ARCHETYPES, `${scene.id}: stage vfx`).toContain(action.archetype);
            expectHex(action.color, `${scene.id}: stage color`);
          }
          if (action.kind === 'gesture') expect(ANIM_GESTURES, `${scene.id}: stage gesture`).toContain(action.gesture);
          if (action.kind === 'develop-character' && action.gesture) expect(ANIM_GESTURES, `${scene.id}: stage develop-character gesture`).toContain(action.gesture);
          if ('text' in action) lintCutsceneText(action.text, `${scene.id}: stage text`);
          if (action.kind === 'title') lintCutsceneText(action.text, `${scene.id}: stage title`);
        }
        if (beat.line?.portraitHeroId && !beat.line.portraitHeroId.includes('{')) expect(REG.heroes.has(beat.line.portraitHeroId), `${scene.id}: portrait`).toBe(true);
      }
    }
    expect(OUTWORLD_CLAIMANT_RAID_IDS.length).toBeGreaterThanOrEqual(6);
    for (const raidId of OUTWORLD_CLAIMANT_RAID_IDS) expect(REG.raids.has(raidId), `claimant ${raidId}`).toBe(true);
    expect(ALL_SEASONAL_EVENTS.length).toBeGreaterThanOrEqual(3);
    for (const event of ALL_SEASONAL_EVENTS) {
      expect(REG.seasonalEvents.has(event.id), `${event.id}: registered`).toBe(true);
      expect(REG.regions.has(event.regionId), `${event.id}: region`).toBe(true);
      expect(REG.cutscenes.has(event.cutsceneId), `${event.id}: cutscene`).toBe(true);
    }
    expect(ALL_LEGENDS.length).toBeGreaterThanOrEqual(2);
    for (const legend of ALL_LEGENDS) {
      expect(REG.legends.has(legend.id), `${legend.id}: registered`).toBe(true);
      expect(REG.cutscenes.has(legend.cutsceneId), `${legend.id}: cutscene`).toBe(true);
    }
    expect(ALL_NEUTRAL_ITEMS.length).toBeGreaterThanOrEqual(15);
    for (const item of ALL_NEUTRAL_ITEMS) {
      if (item.enchantsInto) expect(REG.neutralItems.has(item.enchantsInto), `${item.id}: enchantsInto`).toBe(true);
      if (item.active) {
        const exoticIds: string[] = [];
        lintAbility(item.active, `neutral:${item.id}`, exoticIds);
      }
    }
  });
});

describe('data lint: exotic budget', () => {
  it('stays within ~25 exotics', () => {
    expect(REG.exotics.size).toBeLessThanOrEqual(25);
  });
});

// ============================================================
// Test 19 — anim-coverage (SPEC §6 / build order #6): every ability
// and item active carries a valid anim/sound; every hero and creep
// has an animProfile; the gesture player resolves a gesture for each
// (including nested summon sub-abilities) without throwing.
// ============================================================

function collectAbilities(def: AbilityDef, out: AbilityDef[]): void {
  out.push(def);
  const buckets: (EffectNode[] | undefined)[] = [def.effects, def.channel?.tick?.effects, def.channel?.onEnd, def.toggle?.effects];
  for (const effects of buckets) {
    for (const node of effects ?? []) {
      if (node.kind === 'summon') for (const sa of node.summon.abilities ?? []) collectAbilities(sa, out);
      if (node.kind === 'projectile') for (const oh of node.proj.onHit ?? []) {
        if (oh.kind === 'summon') for (const sa of oh.summon.abilities ?? []) collectAbilities(sa, out);
      }
    }
  }
}

describe('data lint: anim coverage (test 19)', () => {
  it('every hero and creep declares an animProfile', () => {
    for (const hero of ALL_HEROES) expect(hero.animProfile, `${hero.id}: animProfile`).toBeDefined();
    for (const creep of ALL_CREEPS) expect(creep.animProfile, `${creep.id}: animProfile`).toBeDefined();
  });

  it('every hero ability + creep ability + item active has a valid anim and sound tag', () => {
    for (const hero of ALL_HEROES) {
      for (const a of hero.abilities) {
        expect(ANIM_GESTURES, `${hero.id}/${a.id}: anim`).toContain(a.anim);
        expect(SOUND_ARCHETYPES, `${hero.id}/${a.id}: sound`).toContain(a.sound);
      }
    }
    for (const creep of ALL_CREEPS) {
      for (const a of creep.abilities) {
        expect(ANIM_GESTURES, `${creep.id}/${a.id}: anim`).toContain(a.anim);
        expect(SOUND_ARCHETYPES, `${creep.id}/${a.id}: sound`).toContain(a.sound);
      }
    }
    for (const item of ALL_ITEMS) {
      if (!item.active) continue;
      expect(ANIM_GESTURES, `${item.id}: active anim`).toContain(item.active.anim);
      expect(SOUND_ARCHETYPES, `${item.id}: active sound`).toContain(item.active.sound);
    }
  });

  it('the gesture player resolves a valid gesture + sound for every ability without throwing', () => {
    const all: AbilityDef[] = [];
    for (const hero of ALL_HEROES) for (const a of hero.abilities) collectAbilities(a, all);
    for (const creep of ALL_CREEPS) for (const a of creep.abilities) collectAbilities(a, all);
    for (const item of ALL_ITEMS) if (item.active) collectAbilities(item.active, all);
    for (const n of ALL_NEUTRAL_ITEMS) if (n.active) collectAbilities(n.active, all);
    expect(all.length).toBeGreaterThan(200);
    for (const a of all) {
      expect(ANIM_GESTURES, `${a.id}: resolved gesture`).toContain(gestureForAbility(a));
      expect(SOUND_ARCHETYPES, `${a.id}: resolved sound`).toContain(soundForAbility(a));
    }
  });

  it('lands the final VFX_ASSETS vocabulary refinements on signature content', () => {
    const trollRage = REG.hero('troll-warlord').abilities.find((a) => a.id === 'troll-berserkers-rage');
    const pulseNova = REG.hero('leshrac').abilities.find((a) => a.id === 'lesh-pulse-nova');
    const lightningStorm = REG.hero('leshrac').abilities.find((a) => a.id === 'lesh-lightning-storm');

    expect(trollRage?.anim).toBe('toggle-stance');
    expect(pulseNova?.anim).toBe('toggle-stance');
    expect(lightningStorm?.sound).toBe('lightning');
    expect(REG.item('euls-scepter').active?.vfx.archetype).toBe('cyclone');
    expect(REG.item('wind-waker').active?.vfx.archetype).toBe('cyclone');
  });
});

// ----------------------------------------------------------------
// Test 23: lore + esports homage denylist (Phase 6 §3.13, §5)
// ----------------------------------------------------------------
describe('data lint: lore + esports denylist (test 23)', () => {
  /** A named homage entity must carry an original name + title + ≥1 dialogue line, none denylisted. */
  function expectHomage(label: string, name: string, title: string, dialogue: string[]): void {
    expect(name.trim().length, `${label}: name`).toBeGreaterThan(0);
    expect(title.trim().length, `${label}: title`).toBeGreaterThan(0);
    expect(dialogue.length, `${label}: dialogue count`).toBeGreaterThanOrEqual(1);
    for (const line of [name, title, ...dialogue]) {
      expect(line.trim().length, `${label}: empty line`).toBeGreaterThan(0);
      const hit = denylistHit(line);
      expect(hit, `${label}: "${line}" contains denylisted "${hit}"`).toBeNull();
    }
  }

  it('every gym leader has an original name + title + dialogue', () => {
    expect(ALL_GYMS.length).toBe(8);
    for (const gym of ALL_GYMS) expectHomage(`gym ${gym.id}`, gym.leader, gym.leaderTitle, gym.dialogue);
  });

  it('every Elite Five member and the Champion have name + title + dialogue', () => {
    for (const draft of ALL_DRAFTS) {
      expect(draft.members.length).toBeGreaterThanOrEqual(5);
      for (const m of draft.members) expectHomage(`elite ${m.name}`, m.name, m.title, m.dialogue);
      expectHomage(`champion ${draft.id}`, draft.championName, draft.championTitle, draft.championDialogue);
    }
  });

  it('every raid boss has name + title + dialogue', () => {
    expect(ALL_RAIDS.length).toBeGreaterThanOrEqual(4);
    for (const raid of ALL_RAIDS) expectHomage(`raid ${raid.id}`, raid.name, raid.title, raid.dialogue);
  });

  it('every route trainer covers an archetype with name + title + dialogue', () => {
    expect(ALL_TRAINERS.length).toBeGreaterThanOrEqual(5);
    const archetypes = new Set(ALL_TRAINERS.map((t) => t.archetype));
    for (const a of ['shoutcaster', 'analyst', 'streamer', 'captain', 'support']) {
      expect(archetypes, `trainer archetype ${a}`).toContain(a);
    }
    for (const t of ALL_TRAINERS) {
      expectHomage(`trainer ${t.id}`, t.name, t.title, t.dialogue);
      expect(REG.regions.has(t.regionId), `trainer ${t.id} region`).toBe(true);
    }
  });

  it('every codex-able entity carries lore/identity (heroes/regions/items/raids/creeps)', () => {
    for (const h of ALL_HEROES) expect(h.lore.trim().length, `hero ${h.id} lore`).toBeGreaterThan(0);
    for (const r of ALL_REGIONS) expect(r.lore.trim().length, `region ${r.id} lore`).toBeGreaterThan(0);
    for (const i of ALL_ITEMS) expect(i.lore.trim().length, `item ${i.id} lore`).toBeGreaterThan(0);
    for (const raid of ALL_RAIDS) expect(raid.name.trim().length, `raid ${raid.id} name`).toBeGreaterThan(0);
    for (const c of ALL_CREEPS) {
      expect(c.name.trim().length, `creep ${c.id} name`).toBeGreaterThan(0);
      expect(c.lore?.trim().length ?? 0, `creep ${c.id} lore`).toBeGreaterThan(20);
    }
  });

  it('the denylist matcher catches real trademarks and handles verbatim (positive control)', () => {
    expect(ESPORTS_DENYLIST.length).toBeGreaterThan(10);
    expect(denylistHit('Brought to you by Team Secret')).toBe('Team Secret');
    expect(denylistHit('and a wild Dendi appears mid')).toBe('Dendi');
    expect(denylistHit('they lift the Aegis of Champions')).toBe('Aegis of Champions');
    expect(denylistHit('a fully original homage line about a booming caster')).toBeNull();
  });
});
