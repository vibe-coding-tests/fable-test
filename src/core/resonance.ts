import type { ElementId, HeroDef, ItemDef, StatModMap } from './types';

export type ActiveElement = Exclude<ElementId, 'neutral'>;

export const ACTIVE_ELEMENTS: ActiveElement[] = ['pyro', 'hydro', 'electro', 'cryo', 'geo', 'dendro', 'anemo'];

export interface ReactionDef {
  id: string;
  elements: [ActiveElement, ActiveElement];
  damageMultiplier?: number;
  extraDamagePct?: number;
  status?: 'frozen';
  statMods?: StatModMap;
  statDuration?: number;
  consume: 'both' | 'existing';
}

export const REACTION_TABLE: ReactionDef[] = [
  { id: 'vaporize', elements: ['hydro', 'pyro'], damageMultiplier: 1.5, consume: 'both' },
  { id: 'melt', elements: ['cryo', 'pyro'], damageMultiplier: 1.35, consume: 'both' },
  { id: 'overload', elements: ['pyro', 'electro'], extraDamagePct: 0.45, consume: 'both' },
  { id: 'superconduct', elements: ['cryo', 'electro'], extraDamagePct: 0.2, statMods: { armor: -6 }, statDuration: 5, consume: 'both' },
  { id: 'electro-charged', elements: ['hydro', 'electro'], extraDamagePct: 0.3, consume: 'existing' },
  { id: 'freeze', elements: ['hydro', 'cryo'], status: 'frozen', statDuration: 1.5, consume: 'both' },
  { id: 'burning', elements: ['pyro', 'dendro'], extraDamagePct: 0.35, consume: 'existing' },
  { id: 'swirl', elements: ['anemo', 'pyro'], extraDamagePct: 0.25, consume: 'existing' },
  { id: 'swirl', elements: ['anemo', 'hydro'], extraDamagePct: 0.25, consume: 'existing' },
  { id: 'swirl', elements: ['anemo', 'electro'], extraDamagePct: 0.25, consume: 'existing' },
  { id: 'swirl', elements: ['anemo', 'cryo'], extraDamagePct: 0.25, consume: 'existing' },
  { id: 'swirl', elements: ['anemo', 'dendro'], extraDamagePct: 0.25, consume: 'existing' },
  { id: 'crystallize', elements: ['geo', 'pyro'], statMods: { damageTakenReductionPct: 8 }, statDuration: 4, consume: 'existing' },
  { id: 'crystallize', elements: ['geo', 'hydro'], statMods: { damageTakenReductionPct: 8 }, statDuration: 4, consume: 'existing' },
  { id: 'crystallize', elements: ['geo', 'electro'], statMods: { damageTakenReductionPct: 8 }, statDuration: 4, consume: 'existing' },
  { id: 'crystallize', elements: ['geo', 'cryo'], statMods: { damageTakenReductionPct: 8 }, statDuration: 4, consume: 'existing' },
  { id: 'crystallize', elements: ['geo', 'dendro'], statMods: { damageTakenReductionPct: 8 }, statDuration: 4, consume: 'existing' }
];

const HERO_ELEMENTS: Record<string, ElementId> = {
  lina: 'pyro',
  'shadow-fiend': 'pyro',
  doom: 'pyro',
  phoenix: 'pyro',
  'ember-spirit': 'pyro',
  kunkka: 'hydro',
  tidehunter: 'hydro',
  slardar: 'hydro',
  'naga-siren': 'hydro',
  morphling: 'hydro',
  zeus: 'electro',
  razor: 'electro',
  'storm-spirit': 'electro',
  disruptor: 'electro',
  'crystal-maiden': 'cryo',
  lich: 'cryo',
  'winter-wyvern': 'cryo',
  tusk: 'cryo',
  'ancient-apparition': 'cryo',
  earthshaker: 'geo',
  magnus: 'geo',
  tiny: 'geo',
  'sand-king': 'geo',
  'elder-titan': 'geo',
  enchantress: 'dendro',
  chen: 'dendro',
  'natures-prophet': 'dendro',
  'treant-protector': 'dendro',
  'dark-willow': 'dendro',
  mirana: 'anemo',
  'skywrath-mage': 'anemo',
  'vengeful-spirit': 'anemo'
};

export function isActiveElement(element: ElementId | undefined): element is ActiveElement {
  return !!element && element !== 'neutral';
}

export function elementForHero(hero: HeroDef): ElementId {
  if (hero.element) return hero.element;
  return HERO_ELEMENTS[hero.id] ?? 'neutral';
}

export function elementForAbility(hero: HeroDef, abilityId: string): ElementId {
  const ability = hero.abilities.find((a) => a.id === abilityId);
  if (!ability) return elementForHero(hero);
  if (ability.element) return ability.element;
  if (ability.targeting === 'passive' || ability.targeting === 'aura') return 'neutral';
  if (ability.vfx.color2 && ability.vfx.color2.toLowerCase().includes('ff7a3c')) return 'pyro';
  return elementForHero(hero);
}

export function elementForItemHit(item: ItemDef): ActiveElement | null {
  if (item.elementOnHit) return item.elementOnHit;
  if (item.id === 'maelstrom' || item.id === 'mjollnir') return 'electro';
  if (item.id === 'radiance') return 'pyro';
  if (item.id === 'eye-of-skadi') return 'cryo';
  return null;
}

export function reactionFor(existing: ActiveElement, incoming: ActiveElement): ReactionDef | null {
  return REACTION_TABLE.find((r) =>
    r.elements.includes(existing) && r.elements.includes(incoming)
  ) ?? null;
}

export function resonanceMods(heroIds: string[], heroById: (id: string) => HeroDef): { id: string; mods: StatModMap } {
  const counts = new Map<ElementId, number>();
  for (const id of heroIds) {
    const element = elementForHero(heroById(id));
    counts.set(element, (counts.get(element) ?? 0) + 1);
  }
  const shared = ACTIVE_ELEMENTS.find((e) => (counts.get(e) ?? 0) >= 2);
  switch (shared) {
    case 'pyro': return { id: 'pyro-resonance', mods: { damage: 14, statusResistPct: 8 } };
    case 'hydro': return { id: 'hydro-resonance', mods: { maxHp: 140, hpRegenPctMax: 0.35 } };
    case 'electro': return { id: 'electro-resonance', mods: { manaRegen: 1.8, castRange: 45 } };
    case 'cryo': return { id: 'cryo-resonance', mods: { damage: 8, attackSpeed: 12 } };
    case 'geo': return { id: 'geo-resonance', mods: { armor: 4, damageTakenReductionPct: 5 } };
    case 'anemo': return { id: 'anemo-resonance', mods: { moveSpeed: 24, attackSpeed: 8 } };
    case 'dendro': return { id: 'dendro-resonance', mods: { spellAmpPct: 8 } };
    default: return { id: 'harmony-resonance', mods: { maxHp: 60, manaRegen: 0.6 } };
  }
}
