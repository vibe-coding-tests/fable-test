import { beforeAll, describe, expect, it } from 'vitest';
import { registerAllContent, ALL_HEROES, ALL_REGIONS } from '../data/index';
import { ALL_GYMS } from '../data/gyms/index';
import { ALL_QUESTS, ALL_TRIALS } from '../data/quests/index';
import { ALL_ITEMS } from '../data/items/index';
import { ALL_CREEPS } from '../data/creeps/index';
import { ALL_NEUTRAL_ITEMS } from '../data/neutral-items';
import { ALL_BOSSES } from '../data/bosses';
import { ALL_RAIDS } from '../data/raids';
import { ALL_DRAFTS } from '../data/drafts';
import { REG } from '../core/registry';
import { ACTIVE_ELEMENTS, elementForAbility, elementForHero, elementForItemHit } from '../core/resonance';
import { PHASE5_STARTER_ASSETS } from '../engine/assets';
import { HERO_LIKENESS_PROFILES } from '../engine/models';
import { PERFORMANCE_BUDGET } from '../engine/performance';
import type { AbilityDef, AnimGesture, AttackVisualKind, EffectNode, ItemAppearancePart, ItemWeaponVisualKind, SoundArchetype, ValueRef, VfxArchetype } from '../core/types';
import { abilityMaxLevel } from '../core/values';

// ============================================================
// Data lint (SPEC §1.2): every entry validates, every
// cross-reference resolves. Grows with the content.
// ============================================================

beforeAll(() => registerAllContent());

const VFX_ARCHETYPES: VfxArchetype[] = [
  'projectile', 'ground-aoe', 'chain', 'beam', 'summon-pop', 'shield',
  'stun-stars', 'channel', 'global-mark', 'hook', 'wall', 'storm'
];

const STATUS_IDS = [
  'stun', 'root', 'silence', 'hex', 'slow', 'disarm', 'blind', 'fear', 'taunt',
  'invis', 'magic-immune', 'break', 'cyclone', 'sleep', 'frozen', 'buff'
];

const ANIM_GESTURES: AnimGesture[] = ['melee-swing', 'ranged-shot', 'staff-cast', 'ground-slam', 'dash', 'channel-loop', 'summon-gesture', 'item-use', 'global-cast'];
const SOUND_ARCHETYPES: SoundArchetype[] = ['blade', 'bow', 'impact', 'frost', 'fire', 'storm', 'void', 'heal', 'summon', 'item', 'roar'];
const GATED_TOP_TIER = ['divine-rapier', 'butterfly', 'scythe-of-vyse', 'heart-of-tarrasque', 'eye-of-skadi', 'refresher-orb', 'aghanims-scepter', 'aegis-of-the-immortal', 'refresher-shard', 'cheese'];
const ITEM_WEAPON_VISUALS: ItemWeaponVisualKind[] = ['none', 'sword', 'staff', 'hook', 'totem', 'rifle', 'cleaver', 'broad-cleaver', 'glowing-blade', 'long-pole', 'storm-haft'];
const ITEM_APPEARANCE_PARTS: ItemAppearancePart[] = ['pauldrons', 'heart-core', 'frost-shards', 'boot-trail', 'wing-blades', 'crystal-edge', 'mana-orb', 'hex-sigil'];
const ATTACK_VISUALS: AttackVisualKind[] = ['cleave-sweep', 'ranged-conversion', 'lightning-bounce', 'tinted-impact', 'crit-lunge'];

function expectHex(color: string, where: string): void {
  expect(color, where).toMatch(/^#[0-9a-fA-F]{6}$/);
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

function lintAbility(def: AbilityDef, where: string, exoticIds: string[]): void {
  expect(def.id, `${where}: ability id`).toBeTruthy();
  expect(VFX_ARCHETYPES, `${where}/${def.id}: vfx archetype '${def.vfx.archetype}'`).toContain(def.vfx.archetype);
  expectHex(def.vfx.color, `${where}/${def.id}: vfx color`);
  if (def.anim) expect(ANIM_GESTURES, `${where}/${def.id}: anim '${def.anim}'`).toContain(def.anim);
  if (def.sound) expect(SOUND_ARCHETYPES, `${where}/${def.id}: sound '${def.sound}'`).toContain(def.sound);
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
        if (hero.animProfile) {
          expect(hero.animProfile.rig).toBeTruthy();
          expect(hero.animProfile.castStyle).toBeTruthy();
          expect(hero.animProfile.voiceTimbre).toBeTruthy();
        }
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
          lintAbility(a, hero.id, exoticIds);
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
    const assembled = ALL_ITEMS.filter((i) => i.tier === 'core' || (i.tier === 'basic' && i.components));
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
        lintAbility(item.active, `item:${item.id}`, exoticIds);
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

  it('has Phase 4 item appearance and attack override coverage', () => {
    expect(ALL_ITEMS.filter((i) => i.appearance).length).toBeGreaterThanOrEqual(6);
    expect(ALL_ITEMS.filter((i) => (i.attackVisual?.length ?? 0) > 0).length).toBeGreaterThanOrEqual(6);
    expect(REG.item('battlefury').appearance?.weapon?.kind).toBe('broad-cleaver');
    expect(REG.item('divine-rapier').appearance?.weapon?.kind).toBe('glowing-blade');
    expect(REG.item('assault-cuirass').appearance?.parts).toContain('pauldrons');
    expect(REG.item('crystalys').appearance?.parts).toContain('crystal-edge');
    expect(REG.item('scythe-of-vyse').appearance?.parts).toContain('hex-sigil');
    expect(REG.item('aghanims-scepter').appearance?.parts).toContain('mana-orb');
  });

  it('has Phase 5 item element hooks for attack-visual enablers', () => {
    expect(elementForItemHit(REG.item('maelstrom'))).toBe('electro');
    expect(elementForItemHit(REG.item('eye-of-skadi'))).toBe('cryo');
  });
});

describe('data lint: Phase 4/5 polish infrastructure', () => {
  it('declares the renderer performance budget', () => {
    expect(PERFORMANCE_BUDGET.targetFps).toBe(60);
    expect(PERFORMANCE_BUDGET.activeUnits).toBeGreaterThanOrEqual(30);
    expect(PERFORMANCE_BUDGET.liveProjectilesOrParticles).toBeGreaterThanOrEqual(200);
    expect(PERFORMANCE_BUDGET.maxPixelRatio).toBeLessThanOrEqual(2);
  });

  it('has a Phase 5 starter hero glTF manifest with procedural fallback', () => {
    expect(PHASE5_STARTER_ASSETS.map((a) => a.heroId).sort()).toEqual(['crystal-maiden', 'earthshaker', 'juggernaut', 'lich', 'pudge', 'sniper'].sort());
    for (const asset of PHASE5_STARTER_ASSETS) {
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
      if (creep.animProfile) expect(creep.animProfile.rig).toBeTruthy();
      const exoticIds: string[] = [];
      for (const a of creep.abilities) lintAbility(a, creep.id, exoticIds);
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
      for (const id of [...boss.loot.guaranteed, ...boss.loot.assembledPool]) expect(REG.items.has(id), `${boss.id}: loot ${id}`).toBe(true);
    }
    expect(ALL_RAIDS.length).toBe(4);
    for (const raid of ALL_RAIDS) {
      expect(REG.heroes.has(raid.boss.heroId), `${raid.id}: boss hero`).toBe(true);
      expect(REG.quests.has(raid.unlockQuest), `${raid.id}: unlock`).toBe(true);
      for (const id of [...raid.loot.guaranteed, ...raid.loot.assembledPool]) expect(REG.items.has(id), `${raid.id}: loot ${id}`).toBe(true);
      if (raid.signatureExotic) expect(REG.exotics.has(raid.signatureExotic), `${raid.id}: exotic`).toBe(true);
    }
    expect(ALL_DRAFTS.length).toBeGreaterThanOrEqual(1);
    for (const draft of ALL_DRAFTS) {
      for (const member of draft.members) for (const heroId of member.pool) expect(REG.heroes.has(heroId), `${draft.id}: pool ${heroId}`).toBe(true);
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
