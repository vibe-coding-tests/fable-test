import { REG } from '../core/registry';
import { JUGGERNAUT } from './heroes/juggernaut';
import { CRYSTAL_MAIDEN } from './heroes/crystal-maiden';
import { PUDGE } from './heroes/pudge';
import { EARTHSHAKER } from './heroes/earthshaker';
import { SNIPER } from './heroes/sniper';
import { LICH } from './heroes/lich';
import { LUNA } from './heroes/luna';
import { SVEN } from './heroes/sven';
import { AXE } from './heroes/axe';
import { PHASE2_HEROES } from './heroes/phase2';
import { PHASE3_HEROES } from './heroes/phase3';
import { STANDARD_MISSING_HEROES } from './heroes/roster-standard';
import { COMPLEX_MISSING_HEROES } from './heroes/roster-complex';
import { HERO_BLURBS } from './heroes/blurbs';
import { ALL_ITEMS } from './items/index';
import { ALL_CREEPS } from './creeps/index';
import { TRANQUIL_VALE } from './regions/tranquil-vale';
import { NIGHTSILVER_WOODS } from './regions/nightsilver-woods';
import { ICEWRACK } from './regions/icewrack';
import { PHASE3_REGIONS } from './regions/phase3';
import { ALL_GYMS } from './gyms';
import { ALL_QUESTS, ALL_TRIALS } from './quests';
import { ALL_QUEST_DEFS } from './quests/board';
import { ALL_NEUTRAL_ITEMS } from './neutral-items';
import { ALL_BOSSES } from './bosses';
import { ALL_RAIDS } from './raids';
import { ALL_LORE_ENTRIES } from './lore';
import { ALL_CUTSCENES } from './cutscenes';
import { ALL_LEGENDS, ALL_SEASONAL_EVENTS } from './events';
import { ALL_DUNGEONS } from './dungeons';
import { ALL_ROOM_TEMPLATES } from './room-templates';
import { ALL_DRAFTS } from './drafts';
import { ALL_TRAINERS } from './trainers';
import { elementForAbility, elementForHero } from '../core/resonance';
import { EXOTIC_IMPLS, type ExoticContext } from '../core/exotics';
import { glyphForAbility } from '../core/gestures';
import type { AbilityDef, EffectNode, HeroComboRule, HeroDef, StatusId, TargetSel } from '../core/types';

const COMBO_SETUP_STATUSES: ReadonlySet<StatusId> = new Set(['stun', 'root', 'silence', 'hex', 'disarm', 'fear', 'taunt', 'cyclone', 'sleep', 'frozen']);
const COMBO_SOFT_SETUP_STATUSES: ReadonlySet<StatusId> = new Set(['slow', 'blind', 'break']);
const ENEMY_SELECTORS: ReadonlySet<TargetSel> = new Set(['enemies-in-radius', 'random-enemy-in-radius', 'units-in-radius']);

function visitsEnemyTarget(ability: AbilityDef, target: TargetSel): boolean {
  if (ENEMY_SELECTORS.has(target)) return true;
  if (target === 'target') return ability.affects !== 'ally';
  return false;
}

function walkEffects(effects: EffectNode[] | undefined, visit: (effect: EffectNode) => void): void {
  for (const effect of effects ?? []) {
    visit(effect);
    if (effect.kind === 'projectile') walkEffects(effect.proj.onHit, visit);
    else if (effect.kind === 'repeat') walkEffects(effect.effects, visit);
    else if (effect.kind === 'zone') {
      walkEffects(effect.zone.tick?.effects, visit);
      walkEffects(effect.zone.onEnter?.effects, visit);
    }
  }
}

function hasEnemyDamage(ability: AbilityDef): boolean {
  let found = false;
  walkEffects(ability.effects, (effect) => {
    if (effect.kind === 'damage' && visitsEnemyTarget(ability, effect.target)) found = true;
    else if (effect.kind === 'mana' && effect.op === 'burn' && visitsEnemyTarget(ability, effect.target)) found = true;
  });
  return found;
}

function hasEnemySetup(ability: AbilityDef): { hard: boolean; soft: boolean } {
  let hard = false;
  let soft = false;
  walkEffects(ability.effects, (effect) => {
    if (effect.kind === 'status' && visitsEnemyTarget(ability, effect.target)) {
      if (COMBO_SETUP_STATUSES.has(effect.status)) hard = true;
      if (COMBO_SOFT_SETUP_STATUSES.has(effect.status)) soft = true;
    } else if (effect.kind === 'displace' && visitsEnemyTarget(ability, effect.target)) {
      hard = true;
    } else if (effect.kind === 'statmod' && visitsEnemyTarget(ability, effect.target)) {
      const mods = effect.mods;
      if ((Number(mods.armor ?? 0) < 0) || (Number(mods.magicResistPct ?? 0) < 0) || (Number(mods.statusResistPct ?? 0) < 0)) soft = true;
      if ((Number(mods.moveSpeed ?? 0) < 0) || (Number(mods.moveSpeedPct ?? 0) < 0) || (Number(mods.attackSpeed ?? 0) < 0)) soft = true;
    }
  });
  return { hard, soft };
}

function inferComboRules(hero: HeroDef): HeroComboRule[] {
  if (hero.combo?.length) return hero.combo;
  const finishers = hero.abilities.filter((ability) => ability.ult && (hasEnemyDamage(ability) || hasEnemySetup(ability).hard));
  if (finishers.length === 0) return [];

  const rules: HeroComboRule[] = [];
  for (const before of hero.abilities) {
    if (before.ult || before.targeting === 'passive') continue;
    const setup = hasEnemySetup(before);
    if (!setup.hard && !setup.soft) continue;
    for (const after of finishers) {
      if (before.id === after.id) continue;
      rules.push({
        before: before.id,
        after: after.id,
        windowSec: setup.hard ? 4 : 3,
        weight: setup.hard ? 1.35 : 1.18
      });
    }
  }
  return rules;
}

function withElementTags(hero: HeroDef): HeroDef {
  const element = elementForHero(hero);
  const tagged = { ...hero, element, blurb: hero.blurb ?? HERO_BLURBS[hero.id] };
  const withTags = {
    ...tagged,
    abilities: hero.abilities.map((ability) => ({
      ...ability,
      element: ability.element ?? elementForAbility(tagged, ability.id),
      glyph: ability.glyph ?? glyphForAbility(ability)
    }))
  };
  const combo = inferComboRules(withTags);
  return combo.length > 0 ? { ...withTags, combo } : withTags;
}

export const ALL_HEROES: HeroDef[] = [JUGGERNAUT, CRYSTAL_MAIDEN, PUDGE, EARTHSHAKER, SNIPER, LICH, LUNA, SVEN, AXE, ...PHASE2_HEROES, ...PHASE3_HEROES, ...STANDARD_MISSING_HEROES, ...COMPLEX_MISSING_HEROES].map(withElementTags);
export const ALL_REGIONS = [TRANQUIL_VALE, NIGHTSILVER_WOODS, ICEWRACK, ...PHASE3_REGIONS];
export { ALL_DUNGEONS, ALL_ROOM_TEMPLATES };

let registered = false;

/** Register all content into the registry. Idempotent. */
export function registerAllContent(): void {
  if (registered) return;
  registered = true;
  for (const h of ALL_HEROES) REG.registerHero(h);
  for (const i of ALL_ITEMS) REG.registerItem(i);
  for (const c of ALL_CREEPS) REG.registerCreep(c);
  for (const r of ALL_REGIONS) REG.registerRegion(r);
  for (const t of ALL_TRIALS) REG.registerTrial(t);
  for (const q of ALL_QUESTS) REG.registerQuest(q);
  for (const q of ALL_QUEST_DEFS) REG.registerQuestDef(q);
  for (const g of ALL_GYMS) REG.registerGym(g);
  for (const n of ALL_NEUTRAL_ITEMS) REG.registerNeutralItem(n);
  for (const b of ALL_BOSSES) REG.registerBoss(b);
  for (const r of ALL_RAIDS) REG.registerRaid(r);
  for (const l of ALL_LORE_ENTRIES) REG.registerLoreEntry(l);
  for (const c of ALL_CUTSCENES) REG.registerCutscene(c);
  for (const e of ALL_SEASONAL_EVENTS) REG.registerSeasonalEvent(e);
  for (const l of ALL_LEGENDS) REG.registerLegend(l);
  for (const t of ALL_ROOM_TEMPLATES) REG.registerRoomTemplate(t);
  for (const d of ALL_DUNGEONS) REG.registerDungeon(d);
  for (const d of ALL_DRAFTS) REG.registerDraft(d);
  for (const t of ALL_TRAINERS) REG.registerTrainer(t);
  for (const id of ['invoke', 'chronosphere', 'stone-gaze', 'reincarnation', 'rearm', 'roshan-respawn', 'terror-fear', 'defile-growth', 'swarm-spread', 'refresh-cooldowns', 'spell-steal', 'divided-we-stand', 'tempest-double', 'morph-shift', 'primal-split', 'remote-mines']) {
    REG.registerExotic(id, (ctx) => EXOTIC_IMPLS[id]?.(ctx as ExoticContext));
  }
}

export function resetContentRegistration(): void {
  registered = false;
  REG.clear();
}
