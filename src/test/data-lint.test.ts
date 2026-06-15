import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES, ALL_REGIONS, ALL_DUNGEONS, ALL_ROOM_TEMPLATES } from '../data/index';
import { ALL_GYMS } from '../data/gyms/index';
import { ALL_QUESTS, ALL_TRIALS } from '../data/quests/index';
import { ALL_QUEST_DEFS } from '../data/quests/board';
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
import { PHASE5_STARTER_ASSETS, ENABLED_HERO_COHORTS, creepCreatureUrl, heroBaseId, heroBaseUrl } from '../engine/assets';
import { HERO_LIKENESS_PROFILES } from '../engine/models';
import { PERFORMANCE_BUDGET } from '../engine/performance';
import { TUNING } from '../data/tuning';
import { heroWorldSize, creepWorldSize, bossWorldSize, summonWorldSize, questGiverWorldSize, bossVisualScale, bossVisualScaleForRank, inBand, SIZE_BANDS, SIZE_PROMPTS, generationPrompt, type ResolvedWorldSize } from '../engine/world-size';
import { HERO_HEIGHT_M, footprintToRadius } from '../engine/scale';
import { BUILT_WORLD_SIZES, CHEST_COLLISION, DRESSING_PROP_COLLISION, GROUND_LOOT_COLLISION, SHRINE_COLLISION, TOWN_BUILDING_COLLISION, TOWN_LANDMARK_COLLISION } from '../data/world/props';
import { readFileSync, writeFileSync } from 'node:fs';
import type { AbilityDef, AnimGesture, AttackVisualKind, DropSource, EffectNode, ItemAppearancePart, ItemWeaponVisualKind, SoundArchetype, SummonSpec, ValueRef, VfxArchetype } from '../core/types';
import { abilityMaxLevel } from '../core/values';
import { canBuyMasteryNode, deriveMasteryTrees, masteryNodeIndex, masteryPointsForLevel } from '../core/mastery';
import { gestureForAbility, soundForAbility } from '../core/gestures';
import { collisionBodyPushOut, resolveUnitBodies } from '../core/collision';
import { DUNGEON_PACK_RING_RADIUS, dungeonPackSpawnPositions } from '../core/dungeon-spawn';
import { resolveCastPreview } from '../core/cast-preview';
import { Sim } from '../core/sim';
import { tagBoonPowerScore, tagBudgetTier, type TagBudgetTier } from '../data/tag-boons';

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
const GATED_TOP_TIER = ['assault-cuirass', 'divine-rapier', 'butterfly', 'scythe-of-vyse', 'heart-of-tarrasque', 'eye-of-skadi', 'refresher-orb', 'aghanims-scepter', 'lotus-orb', 'linkens-sphere', 'manta-style', 'daedalus', 'monkey-king-bar', 'abyssal-blade', 'mjollnir', 'bloodthorn', 'nullifier', 'radiance', 'satanic', 'helm-of-the-overlord', 'gleipnir', 'wind-waker', 'octarine-core', 'aghanims-blessing', 'aghanims-shard', 'aegis-of-the-immortal', 'refresher-shard', 'cheese'];
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, mythical: 3, legendary: 4, immortal: 5, arcana: 6 } as const;
const RESERVED_DROP_SOURCES: DropSource[] = ['boss', 'raid', 'dungeon', 'special-battle'];
const CODED_DROP_HOMES: Record<string, DropSource[]> = {
  // Roshan repeat rewards are delivered by `Game.deliverRaidLoot` after the
  // configured repeat clear, not by the base raid table every clear.
  'refresher-shard': ['raid'],
  cheese: ['raid']
};

function reachableCutsceneIds(): Set<string> {
  const ids = new Set([
    'prologue-moon-breaks',
    'bind-first',
    'bind-stinger',
    'raid-clear-stinger',
    'boss-clear-stinger',
    'boss-phase-stinger',
    'void-prelate-phase-break',
    'last-eldwurm-phase-break',
    'echo-milestone-stinger',
    'resonance-first-reaction',
    'trial-dialogue-stinger',
    'elite-gauntlet-open',
    'champion-intro',
    'champion-clear',
    'item-aegis-of-the-immortal-first-hold',
    'item-divine-rapier-first-hold',
    'item-chase-first-hold',
    'outworld-first-contact',
    'outworld-all-clear'
  ]);
  for (const region of ALL_REGIONS) {
    if (region.arrivalBeat) ids.add(region.arrivalBeat);
  }
  for (const gym of ALL_GYMS) ids.add(`badge-${gym.badgeId}`);
  for (const raid of ALL_RAIDS) {
    ids.add(`raid-intro-${raid.id}`);
    ids.add(`raid-clear-${raid.id}`);
    if (raid.id !== 'void-prelate' && raid.id !== 'last-eldwurm') ids.add(`raid-phase-${raid.id}`);
  }
  ALL_DRAFTS[0]?.members.forEach((_, index) => ids.add(`elite-persona-${index}`));
  for (const event of ALL_SEASONAL_EVENTS) ids.add(event.cutsceneId);
  for (const legend of ALL_LEGENDS) ids.add(legend.cutsceneId);
  return ids;
}
const ITEM_WEAPON_VISUALS: ItemWeaponVisualKind[] = ['none', 'sword', 'staff', 'hook', 'totem', 'rifle', 'cleaver', 'broad-cleaver', 'glowing-blade', 'long-pole', 'storm-haft'];
const ITEM_APPEARANCE_PARTS: ItemAppearancePart[] = ['pauldrons', 'heart-core', 'frost-shards', 'boot-trail', 'wing-blades', 'crystal-edge', 'mana-orb', 'hex-sigil', 'cloak', 'halo', 'shield', 'banner'];
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
        expect(hero.tagBoon, `${hero.id}: tag boon`).toBeDefined();
        expect(hero.tagBoon!.id).toBe(`${hero.id}-tag-boon`);
        expect(['tag-in', 'tag-out', 'both']).toContain(hero.tagBoon!.fire);
        expect(hero.tagBoon!.effects.length, `${hero.id}: tag boon effects`).toBeGreaterThan(0);
        expect(hero.tagBoon!.gaugeSec, `${hero.id}: tag gauge`).toBeGreaterThan(0);
        expect(hero.tagBoon!.tooltip.startsWith('TAG'), `${hero.id}: tag tooltip`).toBe(true);
        if (hero.tagBoon!.element) expect(ACTIVE_ELEMENTS).toContain(hero.tagBoon!.element);
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

      it('mastery tree derives as four gated branches with mechanical hooks', () => {
        const trees = deriveMasteryTrees(hero);
        expect(trees.length).toBe(4);
        expect(masteryPointsForLevel(TUNING.levelCap), 'mastery budget at cap').toBe(14);
        expect(TUNING.mastery.pointLevels.at(-1), 'last mastery point level').toBe(28);
        trees.forEach((branch, branchIdx) => {
          expect(branch.abilityId).toBe(hero.abilities[branchIdx].id);
          expect(branch.nodes.length).toBe(4);
          expect(branch.nodes.map((node) => node.kind)).toEqual(['growth', 'keystone', 'growth', 'capstone']);
          branch.nodes.forEach((node, tierIdx) => {
            expect(node.tier).toBe(tierIdx + 1);
            expect(node.id).toBeTruthy();
            expect(node.description.length).toBeGreaterThan(10);
            if (node.kind === 'keystone' || node.kind === 'capstone') expect(node.mechanic, `${hero.id}/${node.id}: mechanic`).toBeTruthy();
            const legalPrefix = Array(16).fill(0);
            for (let tier = 1; tier < node.tier; tier++) legalPrefix[masteryNodeIndex(branchIdx, tier)] = 1;
            expect(canBuyMasteryNode(hero, TUNING.levelCap, hero.abilities.map((ability) => abilityMaxLevel(ability)), legalPrefix, masteryNodeIndex(branchIdx, node.tier)), `${hero.id}/${node.id}: reachable`).toBe(true);
            if (node.abilityOverride) {
              const ab = hero.abilities.find((a) => a.id === node.abilityOverride!.abilityId);
              expect(ab?.values?.[node.abilityOverride.valueKey], `${hero.id}/${node.id}: key ${node.abilityOverride.valueKey}`).toBeDefined();
            }
            if (node.cooldownAdd) {
              const ab = hero.abilities.find((a) => a.id === node.cooldownAdd!.abilityId);
              expect(ab?.cooldown, `${hero.id}/${node.id}: cooldownAdd target`).toBeDefined();
            }
            if (node.grantsExotic) expect(REG.exotics.has(node.grantsExotic), `${hero.id}/${node.id}: exotic ${node.grantsExotic}`).toBe(true);
          });
        });
      });
    });
  }
});

// SWAP_COMBAT_OVERHAUL §4: the inverse-power law. A boon's power score must sit
// inside its role tier's band, and no carry may ever out-budget a support — so a
// hard support's tag-in stays the team's biggest swing as the roster grows.
describe('data lint: tag boon power budget', () => {
  const BANDS: Record<TagBudgetTier, { score: [number, number]; gauge: [number, number] }> = {
    hypercarry: { score: [18, 42], gauge: [5, 8] },
    striker: { score: [12, 52], gauge: [5, 10] },
    frontline: { score: [22, 98], gauge: [6, 11] },
    support: { score: [42, 135], gauge: [9, 13] }
  };

  it('keeps every boon inside its tier band', () => {
    for (const hero of ALL_HEROES) {
      const tier = tagBudgetTier(hero);
      const band = BANDS[tier];
      const score = tagBoonPowerScore(hero.tagBoon!);
      expect(score, `${hero.id} (${tier}) score`).toBeGreaterThanOrEqual(band.score[0]);
      expect(score, `${hero.id} (${tier}) score`).toBeLessThanOrEqual(band.score[1]);
      expect(hero.tagBoon!.gaugeSec, `${hero.id} (${tier}) gauge`).toBeGreaterThanOrEqual(band.gauge[0]);
      expect(hero.tagBoon!.gaugeSec, `${hero.id} (${tier}) gauge`).toBeLessThanOrEqual(band.gauge[1]);
    }
  });

  it('enforces the inverse-power law: no carry out-budgets a support', () => {
    let maxCarry = 0;
    let minSupport = Infinity;
    let maxCarryGauge = 0;
    let minSupportGauge = Infinity;
    for (const hero of ALL_HEROES) {
      const tier = tagBudgetTier(hero);
      const score = tagBoonPowerScore(hero.tagBoon!);
      if (tier === 'hypercarry') {
        maxCarry = Math.max(maxCarry, score);
        maxCarryGauge = Math.max(maxCarryGauge, hero.tagBoon!.gaugeSec);
      } else if (tier === 'support') {
        minSupport = Math.min(minSupport, score);
        minSupportGauge = Math.min(minSupportGauge, hero.tagBoon!.gaugeSec);
      }
    }
    // a support's smallest boon still beats a carry's biggest, and re-arms slower.
    expect(minSupport).toBeGreaterThan(maxCarry);
    expect(minSupportGauge).toBeGreaterThan(maxCarryGauge);
  });
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
    // Representative starters stay shipped, now alongside the current KayKit cohorts.
    for (const starter of ['crystal-maiden', 'earthshaker', 'juggernaut', 'lich', 'axe', 'sniper']) {
      expect(ids.has(starter), `${starter} shipped`).toBe(true);
    }
    // Knight(13) + Mage(23) + Barbarian(12) + Rogue(17) humanoid cohorts. Phase 4/5/6
    // moved the worst non-humanoid offenders onto animated creature/generated bases:
    // winter-wyvern (dragon), clockwerk/timbersaw (mech), death-prophet/necrophos
    // (banshee/reaper), arc/outworld/razor (energy), pudge/undying/alchemist
    // (abomination brute), natures-prophet (treant), meepo (goblin), and
    // slardar/slark (the generated fishman family).
    expect(PHASE5_STARTER_ASSETS.length).toBe(65);
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

  it('keeps the asset remap plan wired to animated shared bases', () => {
    const expectCreepFamily = (ids: string[], family: string) => {
      for (const id of ids) {
        const build = ALL_CREEPS.find((c) => c.id === id)?.silhouette.build;
        expect(creepCreatureUrl(id, build), `${id} family`).toBe(`/assets/creeps/${family}.glb`);
      }
    };

    expectCreepFamily(['satyr-banisher', 'satyr-mindstealer', 'prowler-shaman', 'prowler-acolyte', 'prowler-shaman-minion'], 'demon');
    expectCreepFamily(['hill-troll', 'dark-troll', 'dark-troll-summoner', 'dark-troll-summoner-minion'], 'tribal');
    expectCreepFamily(['granite-golem', 'rock-golem', 'mud-golem', 'frostbitten-golem'], 'golelingevolved');
    expectCreepFamily(['hellbear', 'polar-furbolg'], 'bear');
    expectCreepFamily(['wildwing', 'wildwing-ripper', 'enraged-wildkin'], 'owlbear');
    expect(creepCreatureUrl('elder-jungle-stalker', 'golem')).toBe('/assets/creeps/wolf.glb');
    expect(creepCreatureUrl('future-bird', 'bird')).toBe('/assets/creeps/flier.glb');
    // vhoul are desert undead — the downloaded CC0 skeleton reads closer than goblin.
    expect(creepCreatureUrl('vhoul-assassin', 'biped')).toBe('/assets/creeps/skeleton.glb');
    // Phase 3 generated families: scorpion (sand-king), centaur (horse-torso), gnoll (hyena).
    expectCreepFamily(['centaur-courser', 'centaur-conqueror'], 'centaur');
    expect(creepCreatureUrl('gnoll-assassin', 'biped')).toBe('/assets/creeps/gnoll.glb');
    expect(heroBaseUrl(heroBaseId('sand-king'))).toBe('/assets/creeps/scorpion.glb');
    expect(heroBaseUrl(heroBaseId('centaur-warrunner'))).toBe('/assets/creeps/centaur.glb');

    expect(heroBaseUrl(heroBaseId('winter-wyvern'))).toBe('/assets/creeps/dragonevolved.glb');
    expect(heroBaseUrl(heroBaseId('phoenix'))).toBe('/assets/creeps/flier.glb');
    expect(heroBaseUrl(heroBaseId('batrider'))).toBe('/assets/creeps/flier.glb');
    expect(heroBaseUrl(heroBaseId('naga-siren'))).toBe('/assets/creeps/serpent.glb');
    expect(heroBaseUrl(heroBaseId('medusa'))).toBe('/assets/creeps/serpent.glb');
    expect(heroBaseUrl(heroBaseId('lone-druid'))).toBe('/assets/creeps/bear.glb');
    expect(heroBaseUrl(heroBaseId('bane'))).toBe('/assets/creeps/demon.glb');
    expect(heroBaseUrl(heroBaseId('leshrac'))).toBe('/assets/creeps/demon.glb');
    // Phase 4 Tier B: the worst non-humanoid cohort offenders ride animated creature
    // bodies instead of a plain knight/mage body.
    expect(heroBaseUrl(heroBaseId('clockwerk'))).toBe('/assets/creeps/goblin.glb');
    expect(heroBaseUrl(heroBaseId('timbersaw'))).toBe('/assets/creeps/goblin.glb');
    expect(heroBaseUrl(heroBaseId('death-prophet'))).toBe('/assets/creeps/ghost.glb');
    expect(heroBaseUrl(heroBaseId('arc-warden'))).toBe('/assets/creeps/energy.glb');
    expect(heroBaseUrl(heroBaseId('outworld-destroyer'))).toBe('/assets/creeps/energy.glb');
    expect(heroBaseUrl(heroBaseId('razor'))).toBe('/assets/creeps/energy.glb');
    expect(heroBaseUrl(heroBaseId('pudge'))).toBe('/assets/creeps/abomination.glb');
    expect(heroBaseUrl(heroBaseId('undying'))).toBe('/assets/creeps/abomination.glb');
    // Phase 6: the last long-tail humanoid-cohort compromises ride faithful animated
    // bases — alchemist on the brute body, the two fish-men on the new fishman family,
    // and the tree/reaper/ratling onto treant/ghost/goblin.
    expect(heroBaseUrl(heroBaseId('alchemist'))).toBe('/assets/creeps/abomination.glb');
    expect(heroBaseUrl(heroBaseId('slardar'))).toBe('/assets/creeps/fishman.glb');
    expect(heroBaseUrl(heroBaseId('slark'))).toBe('/assets/creeps/fishman.glb');
    expect(heroBaseUrl(heroBaseId('natures-prophet'))).toBe('/assets/creeps/treant.glb');
    expect(heroBaseUrl(heroBaseId('necrophos'))).toBe('/assets/creeps/ghost.glb');
    expect(heroBaseUrl(heroBaseId('meepo'))).toBe('/assets/creeps/goblin.glb');
    // faceless-void stays a humanoid knight (a bipedal alien reads acceptably);
    // pangolier (swashbuckler) and bloodseeker (feral brute) stay humanoid but in
    // truer cohorts (rogue / barbarian).
    expect(heroBaseId('faceless-void')).toBe('knight');
    expect(heroBaseId('pangolier')).toBe('rogue');
    expect(heroBaseId('bloodseeker')).toBe('barbarian');
    expect(heroBaseId('io')).toBe('procedural');
    expect(heroBaseId('enigma')).toBe('procedural');
    expect(heroBaseId('morphling')).toBe('procedural');
    expect(heroBaseId('ancient-apparition')).toBe('procedural');
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

  it('keeps Tranquil Vale Echoes in the onboarding band and out of Dawnshade leash reach', () => {
    const region = ALL_REGIONS.find((r) => r.id === 'tranquil-vale')!;
    expect(region.echoSpawns?.length).toBeGreaterThan(0);
    for (const echo of region.echoSpawns ?? []) {
      expect(echo.level, echo.id).toBeGreaterThanOrEqual(5);
      expect(echo.level, echo.id).toBeLessThanOrEqual(9);
      const dTown = Math.hypot(echo.pos.x - region.town.pos.x, echo.pos.y - region.town.pos.y);
      expect(dTown, echo.id).toBeGreaterThan(region.town.radius + TUNING.echoLeashRadius);
    }
    expect(region.echoSpawns?.find((e) => e.id === 'tv-echo-juggernaut')?.minPlayerLevel).toBe(6);
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
      // Verticality (GAMEPLAY_OVERHAUL §3.3): every climb/glide connector must reference a
      // real elevation tier, and water-zone polygons need at least a triangle.
      const tierCount = region.elevation?.tiers.length ?? 0;
      if (region.climbPoints?.length || region.glidePoints?.length) {
        expect(tierCount, `${region.id}: connectors need elevation tiers`).toBeGreaterThan(1);
      }
      for (const c of region.climbPoints ?? []) {
        expect(c.fromTier, `${region.id}: climb ${c.id} fromTier`).toBeLessThan(tierCount);
        expect(c.toTier, `${region.id}: climb ${c.id} toTier`).toBeLessThan(tierCount);
        expect(c.fromTier, `${region.id}: climb ${c.id} self-loop`).not.toBe(c.toTier);
      }
      for (const g of region.glidePoints ?? []) {
        expect(g.fromTier, `${region.id}: glide ${g.id} fromTier`).toBeGreaterThan(0);
        expect(g.fromTier, `${region.id}: glide ${g.id} fromTier`).toBeLessThan(tierCount);
      }
      for (const z of region.waterZones ?? []) {
        expect(z.poly.length, `${region.id}: water ${z.id} polygon`).toBeGreaterThanOrEqual(3);
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

  it('keeps the starter shop scoped to early-game items', () => {
    const tv = REG.region('tranquil-vale');
    expect(tv.shopInventory).toContain('tango');
    expect(tv.shopInventory).toContain('magic-wand');
    expect(tv.shopInventory).not.toContain('blink-dagger');
    expect(tv.shopInventory).not.toContain('black-king-bar');
    for (const itemId of tv.shopInventory) {
      expect(['consumable', 'component', 'basic'].includes(REG.item(itemId).tier), `${itemId} should stay starter-scoped`).toBe(true);
    }
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
    // Domains (GAMEPLAY_OVERHAUL §3.5): the encounter boss, region, loot, and any
    // element entry gate must all resolve to known content.
    for (const domain of REG.domains.values()) {
      expect(REG.heroes.has(domain.encounter.heroId), `${domain.id}: boss hero`).toBe(true);
      expect(REG.regions.has(domain.regionId), `${domain.id}: region`).toBe(true);
      expect(domain.resinCost, `${domain.id}: resinCost`).toBeGreaterThan(0);
      expect(domain.dialogue.length, `${domain.id}: dialogue`).toBeGreaterThanOrEqual(2);
      for (const id of [...domain.loot.guaranteed, ...domain.loot.assembledPool]) expect(REG.items.has(id), `${domain.id}: loot ${id}`).toBe(true);
      for (const id of domain.encounter.items ?? []) expect(REG.items.has(id), `${domain.id}: boss item ${id}`).toBe(true);
    }

    // Dishes (GAMEPLAY_OVERHAUL §3.7): each cooked dish needs a positive cost and the
    // payload its kind implies — buff dishes carry timed mods, heal dishes a restore %.
    for (const dish of REG.dishes.values()) {
      expect(dish.cost, `${dish.id}: cost`).toBeGreaterThan(0);
      expect(dish.lore.length, `${dish.id}: lore`).toBeGreaterThan(0);
      if (dish.kind === 'buff') {
        expect(dish.buff, `${dish.id}: buff payload`).toBeTruthy();
        expect(Object.keys(dish.buff!.mods).length, `${dish.id}: buff mods`).toBeGreaterThan(0);
        expect(dish.buff!.durationSec, `${dish.id}: buff duration`).toBeGreaterThan(0);
      }
      if (dish.kind === 'heal') expect(dish.restorePct, `${dish.id}: restorePct`).toBeGreaterThan(0);
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
    const reachableScenes = reachableCutsceneIds();
    for (const scene of ALL_CUTSCENES) {
      expect(REG.cutscenes.has(scene.id), `${scene.id}: registered`).toBe(true);
      expect(reachableScenes.has(scene.id), `${scene.id}: reachable from runtime call-sites`).toBe(true);
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
    for (const sceneId of reachableScenes) expect(REG.cutscenes.has(sceneId), `${sceneId}: runtime cutscene id`).toBe(true);
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

  // QUEST.md: bounties + chapters reference real content and obey kind invariants.
  it('quest defs resolve every reward/objective/chain reference and obey kind invariants', () => {
    expect(ALL_QUEST_DEFS.length).toBeGreaterThan(0);
    const ids = new Set(ALL_QUEST_DEFS.map((q) => q.id));
    const kinds = new Set(ALL_QUEST_DEFS.map((q) => q.kind));
    expect(kinds.has('recurring'), 'ships recurring bounties').toBe(true);
    expect(kinds.has('event'), 'ships event chapters').toBe(true);
    // An objective targetId narrows counting to one boss/raid/dungeon/region/badge/
    // hero/creep; a typo would make the quest silently uncompletable, so guard it
    // like a recipe reference (QUEST.md §7).
    const targetable = new Set<string>([
      ...REG.bosses.keys(),
      ...REG.raids.keys(),
      ...REG.dungeons.keys(),
      ...REG.regions.keys(),
      ...REG.heroes.keys(),
      ...REG.creeps.keys(),
      ...[...REG.gyms.values()].map((g) => g.badgeId)
    ]);
    for (const def of ALL_QUEST_DEFS) {
      expect(def.objectives.length, `${def.id} objectives`).toBeGreaterThan(0);
      for (const obj of def.objectives) {
        expect(obj.count, `${def.id}:${obj.kind} count`).toBeGreaterThan(0);
        if (obj.targetId) expect(targetable.has(obj.targetId), `${def.id}:${obj.kind} targetId ${obj.targetId}`).toBe(true);
        if (obj.regionId) expect(REG.regions.has(obj.regionId), `${def.id}:${obj.kind} regionId ${obj.regionId}`).toBe(true);
      }
      expect(def.rewards.length, `${def.id} rewards`).toBeGreaterThan(0);
      if (def.kind === 'recurring') expect(def.repeatable, `${def.id} recurring repeatable`).toBe(true);
      if (def.kind === 'event') expect(def.repeatable ?? false, `${def.id} event not repeatable`).toBe(false);
      for (const r of def.rewards) {
        if (r.kind === 'item') expect(REG.items.has(r.itemId), `${def.id} reward item ${r.itemId}`).toBe(true);
        if (r.kind === 'recruit') expect(REG.heroes.has(r.heroId), `${def.id} reward recruit ${r.heroId}`).toBe(true);
      }
      if (def.next) expect(ids.has(def.next), `${def.id} next ${def.next}`).toBe(true);
      for (const q of def.prereq?.quests ?? []) expect(ids.has(q), `${def.id} prereq quest ${q}`).toBe(true);
      if (def.prereq?.region) expect(REG.regions.has(def.prereq.region), `${def.id} prereq region`).toBe(true);
      for (const branch of def.prereq?.anyOf ?? []) {
        if (branch.region) expect(REG.regions.has(branch.region), `${def.id} anyOf region`).toBe(true);
        for (const q of branch.quests ?? []) expect(ids.has(q), `${def.id} anyOf prereq quest ${q}`).toBe(true);
      }
      // A timed window is opt-in but, if set, must be a positive duration.
      if (def.windowSec !== undefined) expect(def.windowSec, `${def.id} windowSec`).toBeGreaterThan(0);
      // A fork's branches each carry their own rewards and (optional) successor;
      // ids must be unique within the quest and every reference must resolve.
      if (def.choices) {
        expect(def.kind, `${def.id} only event quests fork`).toBe('event');
        expect(def.choices.length, `${def.id} fork needs ≥2 branches`).toBeGreaterThanOrEqual(2);
        const choiceIds = new Set<string>();
        for (const c of def.choices) {
          expect(choiceIds.has(c.id), `${def.id} duplicate choice ${c.id}`).toBe(false);
          choiceIds.add(c.id);
          expect(c.rewards.length, `${def.id}/${c.id} rewards`).toBeGreaterThan(0);
          for (const r of c.rewards) {
            if (r.kind === 'item') expect(REG.items.has(r.itemId), `${def.id}/${c.id} item ${r.itemId}`).toBe(true);
            if (r.kind === 'recruit') expect(REG.heroes.has(r.heroId), `${def.id}/${c.id} recruit ${r.heroId}`).toBe(true);
          }
          if (c.next) expect(ids.has(c.next), `${def.id}/${c.id} next ${c.next}`).toBe(true);
        }
      }
      // A choice-gate prereq must name a real fork quest and one of its branches.
      const cg = def.prereq?.choice;
      if (cg) {
        const fork = ALL_QUEST_DEFS.find((q) => q.id === cg.quest);
        expect(fork, `${def.id} prereq.choice quest ${cg.quest}`).toBeTruthy();
        expect((fork!.choices ?? []).some((c) => c.id === cg.choiceId), `${def.id} prereq.choice ${cg.quest}/${cg.choiceId}`).toBe(true);
      }
      for (const obj of def.objectives) {
        if (obj.kind === 'reach-region' && obj.targetId) expect(REG.regions.has(obj.targetId), `${def.id} reach-region target ${obj.targetId}`).toBe(true);
      }
      if (def.regionId) expect(REG.regions.has(def.regionId), `${def.id} home region ${def.regionId}`).toBe(true);
    }
  });

  // `next` (and a fork branch's `next`) is the authoritative chain link, so it
  // must agree with the successor's gate, point at a unique target, and not cycle.
  it('quest `next` chains (incl. fork branches) are unique, acyclic, and consistent with prereqs', () => {
    const byId = new Map(ALL_QUEST_DEFS.map((q) => [q.id, q]));
    // Every chain edge: a plain `next` (gated by prereq.quests) or a fork
    // branch `next` (gated by the specific prereq.choice).
    const edges: { from: string; to: string; branch?: string }[] = [];
    for (const def of ALL_QUEST_DEFS) {
      if (def.next) edges.push({ from: def.id, to: def.next });
      for (const c of def.choices ?? []) if (c.next) edges.push({ from: def.id, to: c.next, branch: c.id });
    }
    const claimedBy = new Map<string, string>(); // successor id -> predecessor edge label
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      const label = e.branch ? `${e.from}/${e.branch}` : e.from;
      expect(e.to, `${label} next must not self-loop`).not.toBe(e.from);
      expect(claimedBy.has(e.to), `${e.to} is the successor of both ${claimedBy.get(e.to)} and ${label}`).toBe(false);
      claimedBy.set(e.to, label);
      const successor = byId.get(e.to)!;
      if (e.branch) {
        expect(successor.prereq?.choice, `${label} -> ${e.to}: branch successor must gate on the choice`).toEqual({ quest: e.from, choiceId: e.branch });
      } else {
        expect(successor.prereq?.quests ?? [], `${e.from} -> ${e.to}: successor must gate on predecessor`).toContain(e.from);
      }
      (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    }
    // Walk every chain from its roots; a revisit means a cycle.
    for (const root of ALL_QUEST_DEFS) {
      if (claimedBy.has(root.id)) continue; // not a chain root
      const seen = new Set<string>();
      const stack = [root.id];
      while (stack.length) {
        const cur = stack.pop()!;
        expect(seen.has(cur), `quest chain cycle at ${cur}`).toBe(false);
        seen.add(cur);
        for (const nxt of adj.get(cur) ?? []) stack.push(nxt);
      }
    }
  });

  // QUEST.md: walking quest givers must home to a real region and post a
  // board that at least one registered quest actually uses, or the NPC is empty.
  it('quest givers reference real regions and post a real board', () => {
    const givers = [...REG.questGivers.values()];
    expect(givers.length).toBeGreaterThan(0);
    const boards = new Set(ALL_QUEST_DEFS.map((q) => q.giver).filter(Boolean) as string[]);
    const ids = new Set<string>();
    for (const g of givers) {
      expect(ids.has(g.id), `duplicate giver id ${g.id}`).toBe(false);
      ids.add(g.id);
      expect(REG.regions.has(g.regionId), `${g.id} region ${g.regionId}`).toBe(true);
      expect(boards.has(g.board), `${g.id} board "${g.board}" has no quests posted`).toBe(true);
      expect(g.patrol === undefined || g.patrol.length > 0, `${g.id} patrol must be non-empty if present`).toBe(true);
      expect((g.loopSec ?? 1) > 0, `${g.id} loopSec must be positive`).toBe(true);
    }
    // Every board referenced by a quest has a keeper posting it.
    for (const board of boards) {
      expect(givers.some((g) => g.board === board), `no giver posts board "${board}"`).toBe(true);
    }
  });
});

// ============================================================
// Test 24 — world size (OVERWORLD_PLANNING §9): every world entity
// resolves one canonical real-world size, bands hold, footprint and
// sim radius stay in parity, the built world reads from data (not
// call-site literals), and the §7 coverage matrix renders with no red.
// ============================================================

function collectSummons(): SummonSpec[] {
  const byId = new Map<string, SummonSpec>();
  const walk = (effects: EffectNode[] | undefined): void => {
    for (const node of effects ?? []) {
      if (node.kind === 'summon') {
        byId.set(node.summon.id, node.summon);
        for (const sa of node.summon.abilities ?? []) walk(sa.effects);
      }
      if (node.kind === 'projectile') walk(node.proj.onHit);
      if (node.kind === 'repeat') walk(node.effects);
      if (node.kind === 'zone') {
        walk(node.zone.tick?.effects);
        walk(node.zone.onEnter?.effects);
      }
      if (node.kind === 'status' && node.params?.periodic) walk(node.params.periodic.effects);
    }
  };
  const walkAbility = (a: AbilityDef): void => {
    walk(a.effects);
    walk(a.channel?.tick?.effects);
    walk(a.channel?.onEnd);
    walk(a.toggle?.effects);
  };
  for (const hero of ALL_HEROES) for (const a of hero.abilities) walkAbility(a);
  for (const creep of ALL_CREEPS) for (const a of creep.abilities) walkAbility(a);
  for (const item of ALL_ITEMS) if (item.active) walkAbility(item.active);
  return [...byId.values()];
}

interface SizeRow {
  id: string;
  kind: string;
  size: ResolvedWorldSize;
  simRadius?: number;
}

function buildSizeRows(): SizeRow[] {
  const rows: SizeRow[] = [];
  for (const hero of ALL_HEROES) rows.push({ id: hero.id, kind: 'hero', size: heroWorldSize(hero), simRadius: TUNING.unitRadiusHero });
  for (const creep of ALL_CREEPS) rows.push({ id: creep.id, kind: 'creep', size: creepWorldSize(creep), simRadius: TUNING.unitRadiusCreep[creep.tier] });
  for (const boss of ALL_BOSSES) rows.push({ id: boss.id, kind: 'boss', size: bossWorldSize(boss, REG.hero(boss.heroId)) });
  for (const summon of collectSummons()) rows.push({ id: summon.id, kind: 'summon', size: summonWorldSize(summon) });
  for (const giver of REG.questGivers.values()) rows.push({ id: giver.id, kind: 'npc', size: questGiverWorldSize(giver) });
  for (const built of BUILT_WORLD_SIZES) rows.push({ id: built.id, kind: built.kind, size: { ...built.worldSize, sizeClass: built.worldSize.sizeClass!, pose: built.worldSize.pose ?? 'static', footprintDecoupled: built.worldSize.footprintDecoupled ?? false } as ResolvedWorldSize });
  return rows;
}

describe('data lint: world size (test 24)', () => {
  let rows: SizeRow[] = [];
  beforeAll(() => { rows = buildSizeRows(); });

  it('every world entity resolves a finite height + footprint (§9.1)', () => {
    expect(rows.length).toBeGreaterThan(100);
    for (const row of rows) {
      expect(Number.isFinite(row.size.heightM) && row.size.heightM > 0, `${row.kind} ${row.id}: heightM`).toBe(true);
      expect(Number.isFinite(row.size.footprintM) && row.size.footprintM > 0, `${row.kind} ${row.id}: footprintM`).toBe(true);
    }
  });

  it('every height sits inside its sizeClass band (§9.2)', () => {
    for (const row of rows) {
      expect(SIZE_BANDS[row.size.sizeClass], `${row.kind} ${row.id}: unknown class ${row.size.sizeClass}`).toBeDefined();
      expect(inBand(row.size.sizeClass, row.size.heightM), `${row.kind} ${row.id}: ${row.size.heightM}m out of ${row.size.sizeClass} band`).toBe(true);
    }
  });

  it('declared heightM agrees with silhouette scale within ±5% (§9.3)', () => {
    const check = (id: string, scale: number, declared?: number): void => {
      if (declared === undefined) return;
      const derived = HERO_HEIGHT_M * scale;
      expect(Math.abs(declared - derived) / derived, `${id}: heightM ${declared} vs 1.8*scale ${derived}`).toBeLessThanOrEqual(0.05);
    };
    for (const hero of ALL_HEROES) check(hero.id, hero.silhouette.scale, hero.worldSize?.heightM);
    for (const creep of ALL_CREEPS) check(creep.id, creep.silhouette.scale, creep.worldSize?.heightM);
  });

  it('footprint * 100 matches the sim radius within ±15% unless decoupled (§9.4)', () => {
    for (const row of rows) {
      if (row.simRadius === undefined || row.size.footprintDecoupled) continue;
      const fromFoot = footprintToRadius(row.size.footprintM);
      const drift = Math.abs(fromFoot - row.simRadius) / row.simRadius;
      expect(drift, `${row.kind} ${row.id}: footprint ${row.size.footprintM}m -> ${fromFoot} vs radius ${row.simRadius}`).toBeLessThanOrEqual(0.15);
    }
  });

  it('the world reads as one place: creep < building < landmark, boss > human (§9.6)', () => {
    const heights = (kind: string): number[] => rows.filter((r) => r.kind === kind).map((r) => r.size.heightM);
    const buildings = rows.filter((r) => r.size.sizeClass === 'structure').map((r) => r.size.heightM);
    const landmarks = rows.filter((r) => r.size.sizeClass === 'landmark').map((r) => r.size.heightM);
    const tallestCreep = Math.max(...heights('creep'));
    const shortestBuilding = Math.min(...buildings);
    expect(tallestCreep, 'tallest routine creep must read under the shortest building').toBeLessThan(shortestBuilding);
    if (landmarks.length) {
      expect(Math.min(...landmarks), 'a landmark must tower over every structure').toBeGreaterThan(Math.max(...buildings));
    }
    for (const boss of rows.filter((r) => r.kind === 'boss')) {
      expect(boss.size.heightM, `${boss.id}: a boss must out-read every human`).toBeGreaterThanOrEqual(SIZE_BANDS.human.max);
    }
  });

  it('the built world sizes from data, not call-site literals (§9.7)', () => {
    const terrain = readFileSync('src/engine/terrain.ts', 'utf8');
    const scene = readFileSync('src/engine/scene.ts', 'utf8');
    expect(terrain).toContain("from '../data/world/props'");
    expect(terrain).toContain('TOWN_BUILDING_SIZE.heightM');
    expect(terrain).toContain('DRESSING_PROP_SIZES');
    expect(terrain).toContain('FOLIAGE_SIZES.tree.heightM');
    expect(terrain).toContain('FOLIAGE_SIZES.rock.heightM');
    // The hardcoded building fit target is gone.
    expect(terrain.includes('normalizedClone(loaded[i % loaded.length], 3.6)')).toBe(false);
    expect(scene).toContain('AMBIENT_CRITTERS');
    // The literal critter heights are gone.
    expect(scene.includes("height: 1.3, speed: 30")).toBe(false);
  });

  it('a boss renders bigger than its source hero, into the §3 band (§5.1)', () => {
    for (const boss of ALL_BOSSES) {
      const hero = REG.hero(boss.heroId);
      const lift = bossVisualScale(boss, hero);
      const floor = boss.rank === 'boss' ? SIZE_BANDS.huge.min : SIZE_BANDS.large.min;
      const bossH = bossWorldSize(boss, hero).heightM;
      expect(lift, `${boss.id}: boss must not render smaller than its source hero`).toBeGreaterThanOrEqual(1);
      expect(bossH, `${boss.id}: boss height ${bossH}m below ${boss.rank} floor ${floor}m`).toBeGreaterThanOrEqual(floor);
      // Lifting the hero base by the render scale reproduces the boss height.
      expect(heroWorldSize(hero).heightM * lift, `${boss.id}: lift must reproduce boss height`).toBeCloseTo(bossH, 2);
    }
    // The render fallback for arena bosses (no per-unit lift) lands a standard
    // hero in the huge band.
    expect(HERO_HEIGHT_M * TUNING.bossVisualScale).toBeGreaterThanOrEqual(SIZE_BANDS.huge.min);
    expect(bossVisualScaleForRank('boss', { silhouette: { build: 'biped', scale: 1 } } as never) * HERO_HEIGHT_M)
      .toBeCloseTo(SIZE_BANDS.huge.min, 2);
  });

  it('shipped world-sized GLBs agree with declared height within ±10% (§9.5)', () => {
    let manifest: { files?: { path: string; type?: string; worldSize?: { heightM?: number }; dimsM?: { h: number; w?: number; d?: number } }[] } | null = null;
    try {
      manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'));
    } catch {
      manifest = null;
    }
    expect(Array.isArray(manifest?.files ?? [])).toBe(true);
    const worldSized = (manifest?.files ?? []).filter((f) => f.type === 'model' && f.worldSize?.heightM);
    expect(worldSized.length, 'world-sized GLBs should be stamped into the manifest').toBeGreaterThan(100);
    for (const file of worldSized) {
      expect(file.dimsM?.h, `${file.path}: manifest dimsM.h`).toBeGreaterThan(0);
      expect(file.dimsM?.w, `${file.path}: manifest dimsM.w`).toBeGreaterThan(0);
      expect(file.dimsM?.d, `${file.path}: manifest dimsM.d`).toBeGreaterThan(0);
      const declared = file.worldSize!.heightM!;
      const drift = Math.abs(file.dimsM!.h - declared) / declared;
      expect(drift, `${file.path}: dimsM.h ${file.dimsM!.h} vs declared ${declared}`).toBeLessThanOrEqual(0.10);
    }
  });

  it('generation prompts inherit the band, in sync with the .mjs bridge (§5.6)', () => {
    // Every class carries lifelike anchor language, and the composed prompt
    // surfaces both the declared height and that anchor — so a generated GLB is
    // authored to read against its neighbors instead of rescaled after the fact.
    for (const sizeClass of Object.keys(SIZE_BANDS) as (keyof typeof SIZE_BANDS)[]) {
      expect(SIZE_PROMPTS[sizeClass], `${sizeClass}: missing prompt anchor`).toBeTruthy();
      const prompt = generationPrompt('sample', sizeClass, SIZE_BANDS[sizeClass].min);
      expect(prompt).toContain(sizeClass);
      expect(prompt).toContain(SIZE_PROMPTS[sizeClass]);
      expect(prompt, `${sizeClass}: prompt must carry a height target`).toMatch(/~\d/);
    }
    // The .mjs generators (no TS runtime) read the anchors from the resolver
    // bridge; it must match SIZE_PROMPTS so generation can't drift from the lint.
    let bridge: { prompts?: Record<string, string> } | null = null;
    try {
      bridge = JSON.parse(readFileSync('scripts/assets/world-sizes.generated.json', 'utf8'));
    } catch {
      bridge = null;
    }
    expect(bridge?.prompts, 'world-sizes bridge missing prompts — run UPDATE_WORLD_SIZES=1').toEqual(SIZE_PROMPTS);
    // And a generator actually consumes the bridge (closes rollout step 4).
    const gen = readFileSync('scripts/assets/generate_creature_families.mjs', 'utf8');
    expect(gen).toContain('world-sizes.generated.json');
    expect(gen).toContain('promptFor');
  });

  it('renders the §7 coverage matrix with no red boxes (§9.9)', () => {
    const byKind = new Map<string, number>();
    for (const row of rows) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
    let red = 0;
    for (const row of rows) {
      const green = Number.isFinite(row.size.heightM) && row.size.heightM > 0
        && Number.isFinite(row.size.footprintM) && row.size.footprintM > 0
        && !!SIZE_BANDS[row.size.sizeClass]
        && inBand(row.size.sizeClass, row.size.heightM);
      if (!green) red++;
    }
    const summary = [...byKind.entries()].sort().map(([k, n]) => `${k}:${n}`).join(' ');
    // eslint-disable-next-line no-console
    console.log(`[world-size matrix] ${rows.length} entities (${summary}); red boxes: ${red}`);
    expect(red, 'every entity must be fully sized (zero red boxes)').toBe(0);
  });

  it('emits the committed §7 coverage matrix, in sync with the registry (§7/§9.9)', () => {
    const matrix = renderSizeMatrix(rows);
    const MATRIX_PATH = 'docs/design/WORLD_SIZE_MATRIX.md';
    if (process.env.UPDATE_WORLD_SIZES) writeFileSync(MATRIX_PATH, matrix);
    let onDisk: string | null = null;
    try {
      onDisk = readFileSync(MATRIX_PATH, 'utf8');
    } catch {
      onDisk = null;
    }
    expect(onDisk, `${MATRIX_PATH} missing — run UPDATE_WORLD_SIZES=1 to generate`).not.toBeNull();
    expect(onDisk, 'world-size matrix drifted — run UPDATE_WORLD_SIZES=1 to refresh').toBe(matrix);
  });

  it('every camp fits its creep pack: footprint vs camp radius (§6)', () => {
    for (const region of ALL_REGIONS) {
      for (const camp of region.camps) {
        const r = footprintToRadius(creepWorldSize(REG.creep(camp.creepId)).footprintM);
        expect(r * 2, `${camp.id}: ${camp.creepId} (r=${r}) must fit camp radius ${camp.radius}`).toBeLessThan(camp.radius);
        // Loose hex packing (~0.55 disc density): the whole pack must fit the camp disc.
        const packArea = camp.count * Math.PI * r * r;
        const campArea = Math.PI * camp.radius * camp.radius;
        expect(packArea, `${camp.id}: ${camp.count}x ${camp.creepId} can't pack into camp`).toBeLessThan(campArea * 0.55);
      }
    }
  });

  it('the widest creature fits the smallest dungeon room with clearance (§6)', () => {
    const widest = Math.max(...ALL_CREEPS.map((c) => footprintToRadius(creepWorldSize(c).footprintM)));
    for (const t of ALL_ROOM_TEMPLATES) {
      const minDim = Math.min(t.size.x, t.size.y);
      expect(widest * 2, `room ${t.id} (${minDim}) too small for a ${widest}u creep footprint`).toBeLessThan(minDim * 0.5);
    }
  });

  it('structures frame a 2.2m door and gates clear the widest traveller (§3/§6)', () => {
    const DOOR_CLEAR_M = 2.2;
    // Every built structure/landmark a unit can stand beside frames a >=2.2m entrance.
    for (const row of rows.filter((r) => r.size.sizeClass === 'structure' || r.size.sizeClass === 'landmark')) {
      expect(row.size.heightM, `${row.id}: ${row.size.sizeClass} shorter than a 2.2m door frame`).toBeGreaterThanOrEqual(DOOR_CLEAR_M);
    }
    // The 1.8m hero clears that frame (the door-frame rule's whole point).
    expect(HERO_HEIGHT_M, 'the hero must clear a 2.2m door frame').toBeLessThan(DOOR_CLEAR_M);
    // Region gates (the routed path width) clear the widest traveller's footprint.
    const widest = Math.max(...ALL_CREEPS.map((c) => footprintToRadius(creepWorldSize(c).footprintM)));
    for (const region of ALL_REGIONS) {
      for (const gate of region.gates ?? []) {
        expect(gate.radius, `${gate.id}: path narrower than a ${widest}u traveller footprint`).toBeGreaterThan(widest * 2);
      }
    }
  });
});

/** Render the §7 coverage matrix as a stable, diff-friendly markdown table. */
function renderSizeMatrix(rows: SizeRow[]): string {
  const byKind = new Map<string, number>();
  for (const row of rows) byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
  const summary = [...byKind.entries()].sort().map(([k, n]) => `${k} ${n}`).join(', ');
  const sorted = [...rows].sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
  const body = sorted.map((r) => {
    const band = inBand(r.size.sizeClass, r.size.heightM) ? 'ok' : 'OUT';
    let radius = '—';
    if (r.size.footprintDecoupled) radius = 'decoupled';
    else if (r.simRadius !== undefined) {
      const fromFoot = footprintToRadius(r.size.footprintM);
      const drift = Math.round((Math.abs(fromFoot - r.simRadius) / r.simRadius) * 100);
      radius = `${fromFoot}u (${drift}%)`;
    }
    return `| ${r.kind} | ${r.id} | ${r.size.sizeClass} | ${r.size.heightM} | ${r.size.footprintM} | ${r.size.pose} | ${band} | ${radius} |`;
  });
  return [
    '# WORLD SIZE MATRIX (generated)',
    '',
    'OVERWORLD_PLANNING §7. One row per world entity, generated from the registry by',
    '`src/test/data-lint.test.ts`. Do not edit by hand — refresh with',
    '`UPDATE_WORLD_SIZES=1 npx vitest run src/test/data-lint.test.ts`.',
    '',
    `Entities: ${rows.length} (${summary}).`,
    '',
    '| kind | id | class | heightM | footprintM | pose | band | radius |',
    '|---|---|---|---|---|---|---|---|',
    ...body,
    ''
  ].join('\n');
}

function visitVolumeEffects(effects: readonly EffectNode[] | undefined, fn: (node: EffectNode) => void): void {
  for (const node of effects ?? []) {
    fn(node);
    if (node.kind === 'repeat') visitVolumeEffects(node.effects, fn);
    if (node.kind === 'projectile') visitVolumeEffects(node.proj.onHit, fn);
    if (node.kind === 'zone') {
      visitVolumeEffects(node.zone.tick?.effects, fn);
      visitVolumeEffects(node.zone.onEnter?.effects, fn);
    }
  }
}

function roomBlockingBodies(template: (typeof ALL_ROOM_TEMPLATES)[number], includeDoors = false): { pos: { x: number; y: number }; body: import('../core/types').CollisionBody; id: string }[] {
  return [
    ...(template.walls ?? []),
    ...(template.blockers ?? []),
    ...(includeDoors ? (template.doors ?? []).map((door) => door.body) : [])
  ].filter((body) => body.body.blocksMovement !== false);
}

function roomPointBlocked(template: (typeof ALL_ROOM_TEMPLATES)[number], point: { x: number; y: number }, radius: number, includeDoors = false): boolean {
  if (point.x < radius || point.y < radius || point.x > template.size.x - radius || point.y > template.size.y - radius) return true;
  return roomBlockingBodies(template, includeDoors).some((blocker) => !!collisionBodyPushOut(blocker.pos, blocker.body, point, radius));
}

function roomSpawnForbiddenBodies(template: (typeof ALL_ROOM_TEMPLATES)[number]): { pos: { x: number; y: number }; body: import('../core/types').CollisionBody; id: string }[] {
  return [
    ...(template.walls ?? []),
    ...(template.blockers ?? []),
    ...(template.doors ?? []).map((door) => door.body),
    ...(template.noSpawnZones ?? []),
    ...(template.safeZones ?? [])
  ];
}

function roomSpawnPointBlocked(template: (typeof ALL_ROOM_TEMPLATES)[number], point: { x: number; y: number }, radius: number): boolean {
  if (point.x < radius || point.y < radius || point.x > template.size.x - radius || point.y > template.size.y - radius) return true;
  return roomSpawnForbiddenBodies(template).some((blocker) => !!collisionBodyPushOut(blocker.pos, blocker.body, point, radius));
}

function roomSegmentClear(template: (typeof ALL_ROOM_TEMPLATES)[number], a: { x: number; y: number }, b: { x: number; y: number }, radius: number): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(d / 90));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (roomPointBlocked(template, p, radius)) return false;
  }
  return true;
}

function roomReachable(template: (typeof ALL_ROOM_TEMPLATES)[number], start: { x: number; y: number }, goal: { x: number; y: number }, radius: number): boolean {
  if (roomPointBlocked(template, start, radius) || roomPointBlocked(template, goal, radius)) return false;
  const step = 180;
  const nodes = [start, goal];
  for (let y = radius; y <= template.size.y - radius; y += step) {
    for (let x = radius; x <= template.size.x - radius; x += step) {
      const p = { x, y };
      if (!roomPointBlocked(template, p, radius)) nodes.push(p);
    }
  }
  const seen = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    const idx = queue.shift()!;
    if (idx === 1) return true;
    const a = nodes[idx];
    for (let i = 1; i < nodes.length; i++) {
      if (seen.has(i)) continue;
      const b = nodes[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > step * 1.45) continue;
      if (!roomSegmentClear(template, a, b, radius)) continue;
      seen.add(i);
      queue.push(i);
    }
  }
  return false;
}

// ============================================================
// Test 25 — collision and hitbox contract (COLLISION_HITBOX_SPEC):
// authored blockers are circle-only for the first cut, projectile blocker policy
// is explicit, footprint-decoupled units resolve widened hit/pick bodies, and
// authored ability volumes advertise matching presentation archetypes.
// ============================================================

describe('data lint: collision contract (test 25)', () => {
  it('terrain solid collision radii are declared in built-world data', () => {
    expect(TOWN_BUILDING_COLLISION.mode).toBe('solid');
    expect(TOWN_BUILDING_COLLISION.radius).toBeGreaterThan(0);
    expect(TOWN_BUILDING_COLLISION.blocksProjectiles).toBe(true);
    expect(TOWN_LANDMARK_COLLISION.mode).toBe('soft');
    expect(SHRINE_COLLISION.mode).toBe('soft');
    expect(CHEST_COLLISION.layer).toBe('loot');
    expect(GROUND_LOOT_COLLISION.layer).toBe('loot');
    expect(DRESSING_PROP_COLLISION.well.mode).toBe('solid');
    expect(DRESSING_PROP_COLLISION.market.mode).toBe('soft');

    const terrain = readFileSync('src/engine/terrain.ts', 'utf8');
    expect(terrain).toContain('TOWN_BUILDING_COLLISION.radius');
    expect(terrain).toContain('TOWN_LANDMARK_COLLISION');
    expect(terrain).toContain('pushRegionContactObstacles');
    expect(terrain).toContain('DRESSING_PROP_COLLISION');
    expect(terrain).toContain('source: \'terrain:town\'');
  });

  it('authored dungeon gameplay blockers use runtime-supported shapes and clear authored points', () => {
    const heroClearance = TUNING.unitRadiusHero + 60;
    for (const template of ALL_ROOM_TEMPLATES) {
      const blockers = [...(template.walls ?? []), ...(template.blockers ?? []), ...(template.doors ?? []).map((door) => door.body)];
      expect(template.walls?.some((wall) => wall.body.shape.kind === 'capsule'), `${template.id}: needs capsule wall geometry`).toBe(true);
      expect(template.doors?.length, `${template.id}: door bodies should match connectors`).toBe(template.connectors.length);
      expect(blockers.length, `${template.id}: missing authored collision blockers`).toBeGreaterThan(0);
      for (const blocker of blockers) {
        expect(blocker.pos.x, `${template.id}/${blocker.id}: x inside room`).toBeGreaterThanOrEqual(0);
        expect(blocker.pos.x, `${template.id}/${blocker.id}: x inside room`).toBeLessThanOrEqual(template.size.x);
        expect(blocker.pos.y, `${template.id}/${blocker.id}: y inside room`).toBeGreaterThanOrEqual(0);
        expect(blocker.pos.y, `${template.id}/${blocker.id}: y inside room`).toBeLessThanOrEqual(template.size.y);
        expect(['circle', 'capsule', 'rect'], `${template.id}/${blocker.id}: unsupported shape`).toContain(blocker.body.shape.kind);
        if (blocker.body.shape.kind === 'circle') expect(blocker.body.shape.radius, `${template.id}/${blocker.id}: radius`).toBeGreaterThan(0);
        if (blocker.body.shape.kind === 'capsule') {
          expect(blocker.body.shape.radius, `${template.id}/${blocker.id}: radius`).toBeGreaterThan(0);
          expect(blocker.body.shape.halfLength, `${template.id}/${blocker.id}: halfLength`).toBeGreaterThan(0);
        }
        if (blocker.body.shape.kind === 'rect') {
          expect(blocker.body.shape.width, `${template.id}/${blocker.id}: width`).toBeGreaterThan(0);
          expect(blocker.body.shape.depth, `${template.id}/${blocker.id}: depth`).toBeGreaterThan(0);
        }
        expect(blocker.body.blocksMovement, `${template.id}/${blocker.id}: should block movement`).toBe(true);
        expect(blocker.body.blocksProjectiles, `${template.id}/${blocker.id}: projectile blocker policy`).toBe(true);
        if (blocker.body.layer === 'door') continue;
        for (const anchor of [...template.spawnAnchors, ...template.connectors.map((c) => c.at)]) {
          expect(collisionBodyPushOut(blocker.pos, blocker.body, anchor, heroClearance), `${template.id}/${blocker.id}: anchor/connector too close`).toBeNull();
        }
      }
      for (const door of template.doors ?? []) {
        expect(door.clearWidth, `${template.id}/${door.id}: clearWidth`).toBeGreaterThan(TUNING.unitRadiusHero * 2 + 80);
        expect(door.openBody?.body.blocksMovement, `${template.id}/${door.id}: open body should be passable`).toBe(false);
      }
    }
  });

  it('dungeon room anchors and connectors are reachable around authored geometry', () => {
    const heroRadius = TUNING.unitRadiusHero;
    for (const template of ALL_ROOM_TEMPLATES) {
      const start = template.safeZones?.[0]?.pos ?? { x: Math.max(420, template.size.x * 0.18), y: template.size.y / 2 };
      for (const [i, target] of [...template.spawnAnchors, ...template.connectors.map((c) => c.at)].entries()) {
        expect(roomReachable(template, start, target, heroRadius), `${template.id}: point ${i} unreachable`).toBe(true);
      }
    }
  });

  it('dungeon safe and no-spawn zones are explicit non-blocking circles', () => {
    for (const template of ALL_ROOM_TEMPLATES) {
      const zones = [...(template.safeZones ?? []), ...(template.noSpawnZones ?? [])];
      expect(zones.length, `${template.id}: missing safe/no-spawn collision zones`).toBeGreaterThan(0);
      for (const zone of zones) {
        expect(zone.body.blocksMovement, `${template.id}/${zone.id}: zones should not block movement`).toBe(false);
        expect(zone.body.shape.kind, `${template.id}/${zone.id}: first-cut zones must be circles`).toBe('circle');
        if (zone.body.shape.kind === 'circle') expect(zone.body.shape.radius, `${template.id}/${zone.id}: radius`).toBeGreaterThan(0);
      }
    }
  });

  it('dungeon spawn anchors clear max pack rings for the largest creep body', () => {
    const largestCreepRadius = Math.max(...Object.values(TUNING.unitRadiusCreep));
    const maxPackBodies = 5;
    const minPairDistance = largestCreepRadius * 2 + 8;
    for (const template of ALL_ROOM_TEMPLATES) {
      for (const [anchorIdx, anchor] of template.spawnAnchors.entries()) {
        const positions = dungeonPackSpawnPositions(anchor, maxPackBodies, DUNGEON_PACK_RING_RADIUS);
        for (const [posIdx, pos] of positions.entries()) {
          expect(roomSpawnPointBlocked(template, pos, largestCreepRadius), `${template.id}: anchor ${anchorIdx} spawn ${posIdx} blocked`).toBe(false);
        }
        for (let i = 0; i < positions.length; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            const d = Math.hypot(positions[i].x - positions[j].x, positions[i].y - positions[j].y);
            expect(d, `${template.id}: anchor ${anchorIdx} pack bodies ${i}/${j} overlap`).toBeGreaterThanOrEqual(minPairDistance);
          }
        }
      }
    }
  });

  it('footprint-decoupled bosses resolve wider hit and pick bodies', () => {
    for (const boss of ALL_BOSSES) {
      const size = bossWorldSize(boss, REG.hero(boss.heroId));
      expect(size.footprintDecoupled, `${boss.id}: boss footprint policy`).toBe(true);
      const visualFootprintRadius = footprintToRadius(size.footprintM);
      const bodies = resolveUnitBodies({
        radius: TUNING.unitRadiusHero * TUNING.raidBossRadiusScale,
        kind: 'hero',
        footprintDecoupled: true,
        visualFootprintRadius
      });
      expect(bodies.hit.shape.kind).toBe('circle');
      expect(bodies.pick.shape.kind).toBe('circle');
      if (bodies.hit.shape.kind === 'circle') expect(bodies.hit.shape.radius, `${boss.id}: hit body`).toBeGreaterThanOrEqual(visualFootprintRadius);
      if (bodies.pick.shape.kind === 'circle') expect(bodies.pick.shape.radius, `${boss.id}: pick body`).toBeGreaterThanOrEqual(visualFootprintRadius);
    }

    const dungeonSession = readFileSync('src/systems/dungeon-session.ts', 'utf8');
    const raidSession = readFileSync('src/systems/raid-session.ts', 'utf8');
    const macro = readFileSync('src/core/macro.ts', 'utf8');
    for (const source of [dungeonSession, macro]) {
      expect(source).toContain('footprintDecoupled');
      expect(source).toContain('hitRadius');
      expect(source).toContain('pickRadius');
    }
    expect(raidSession).toContain('setupRaidSim');
    expect(raidSession).toContain('bossRank');
  });

  it('spell volumes use matching VFX archetypes where the data declares a volume', () => {
    const skillshotVfx = new Set<VfxArchetype>(['projectile', 'hook', 'beam']);
    const volumeVfx = new Set<VfxArchetype>(['ground-aoe', 'wall', 'shield', 'summon-pop', 'storm', 'dome', 'vortex']);
    for (const hero of ALL_HEROES) {
      for (const ability of hero.abilities as AbilityDef[]) {
        let hasLinearProjectile = false;
        let hasZone = false;
        visitVolumeEffects(ability.effects, (node) => {
          if (node.kind === 'projectile' && node.proj.model === 'linear') hasLinearProjectile = true;
          if (node.kind === 'zone') hasZone = true;
        });
        if (ability.targeting === 'skillshot' && hasLinearProjectile) {
          expect(skillshotVfx.has(ability.vfx.archetype), `${hero.id}/${ability.id}: skillshot preview archetype`).toBe(true);
        }
        if ((ability.targeting === 'ground-aoe' || ability.targeting === 'point-target') && hasZone) {
          expect(volumeVfx.has(ability.vfx.archetype), `${hero.id}/${ability.id}: zone preview archetype`).toBe(true);
        }
      }
    }
  });

  it('cast preview volumes resolve from the same authored radius and projectile specs', () => {
    const sim = new Sim({ seed: 2501, bounds: { w: 2400, h: 1600 } });
    const caster = sim.spawnHero(REG.hero('lina'), { team: 0, pos: { x: 500, y: 800 }, level: 1, ctrl: { kind: 'none' } });
    const dragonSlave = REG.hero('lina').abilities.find((a) => a.id === 'lina-dragon-slave')!;
    const slavePreview = resolveCastPreview(sim, caster, dragonSlave, 1, { point: { x: 1500, y: 800 } });
    const projectile = slavePreview.shapes.find((shape) => shape.kind === 'projectile');
    expect(projectile?.kind).toBe('projectile');
    if (projectile?.kind === 'projectile') {
      expect(projectile.width).toBe(180);
      expect(Math.hypot(projectile.to.x - projectile.from.x, projectile.to.y - projectile.from.y)).toBeCloseTo(950, 4);
    }

    const lsa = REG.hero('lina').abilities.find((a) => a.id === 'lina-lsa')!;
    const lsaPreview = resolveCastPreview(sim, caster, lsa, 1, { point: { x: 700, y: 800 } });
    const circle = lsaPreview.shapes.find((shape) => shape.kind === 'circle');
    expect(circle?.kind).toBe('circle');
    if (circle?.kind === 'circle') expect(circle.radius).toBe(260);
  });
});

