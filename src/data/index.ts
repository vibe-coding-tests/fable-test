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
import { ALL_ITEMS } from './items/index';
import { ALL_CREEPS } from './creeps/index';
import { TRANQUIL_VALE } from './regions/tranquil-vale';
import { NIGHTSILVER_WOODS } from './regions/nightsilver-woods';
import { ICEWRACK } from './regions/icewrack';
import { PHASE3_REGIONS } from './regions/phase3';
import { ALL_GYMS } from './gyms';
import { ALL_QUESTS, ALL_TRIALS } from './quests';
import { ALL_NEUTRAL_ITEMS } from './neutral-items';
import { ALL_BOSSES } from './bosses';
import { ALL_RAIDS } from './raids';
import { ALL_DRAFTS } from './drafts';
import { elementForAbility, elementForHero } from '../core/resonance';
import type { HeroDef } from '../core/types';

function withElementTags(hero: HeroDef): HeroDef {
  const element = elementForHero(hero);
  const tagged = { ...hero, element };
  return {
    ...tagged,
    abilities: hero.abilities.map((ability) => ({
      ...ability,
      element: ability.element ?? elementForAbility(tagged, ability.id)
    }))
  };
}

export const ALL_HEROES: HeroDef[] = [JUGGERNAUT, CRYSTAL_MAIDEN, PUDGE, EARTHSHAKER, SNIPER, LICH, LUNA, SVEN, AXE, ...PHASE2_HEROES, ...PHASE3_HEROES].map(withElementTags);
export const ALL_REGIONS = [TRANQUIL_VALE, NIGHTSILVER_WOODS, ICEWRACK, ...PHASE3_REGIONS];

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
  for (const g of ALL_GYMS) REG.registerGym(g);
  for (const n of ALL_NEUTRAL_ITEMS) REG.registerNeutralItem(n);
  for (const b of ALL_BOSSES) REG.registerBoss(b);
  for (const r of ALL_RAIDS) REG.registerRaid(r);
  for (const d of ALL_DRAFTS) REG.registerDraft(d);
  for (const id of ['invoke', 'chronosphere', 'stone-gaze', 'reincarnation', 'rearm', 'roshan-respawn', 'terror-fear', 'defile-growth', 'swarm-spread', 'refresh-cooldowns']) {
    REG.registerExotic(id, () => {
      /* Phase 3 records the signature hook; Phase 4 gives it bespoke presentation. */
    });
  }
}

export function resetContentRegistration(): void {
  registered = false;
  REG.clear();
}
