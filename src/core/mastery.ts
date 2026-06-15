import { TUNING } from '../data/tuning';
import { abilityMaxLevel } from './values';
import type { AbilityDef, Attribute, HeroDef, MasteryBranch, MasteryMechanicVerb, MasteryNode, StatModMap } from './types';

export const MASTERY_BRANCH_COUNT = 4;
export const MASTERY_TIERS_PER_BRANCH = 4;
export const MASTERY_NODE_COUNT = MASTERY_BRANCH_COUNT * MASTERY_TIERS_PER_BRANCH;
export const MASTERY_POINT_CAP = TUNING.mastery.pointLevels.length;

type MasteryArchetype = 'NUKE' | 'ZONE' | 'ATKMOD' | 'PASS' | 'SUMMON' | 'CHANNEL' | 'UTIL' | 'ULT';

const ARCHETYPE_MECHANICS: Record<MasteryArchetype, { t2: MasteryMechanicVerb; t4: MasteryMechanicVerb }> = {
  NUKE: { t2: 'mark', t4: 'chain' },
  ZONE: { t2: 'persist', t4: 'follow' },
  ATKMOD: { t2: 'mark', t4: 'consume' },
  PASS: { t2: 'prime', t4: 'echo' },
  SUMMON: { t2: 'copy', t4: 'mirror' },
  CHANNEL: { t2: 'store', t4: 'recast' },
  UTIL: { t2: 'convert', t4: 'refund' },
  ULT: { t2: 'prime', t4: 'recast' }
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function primaryStat(attribute: Attribute): keyof Pick<StatModMap, 'str' | 'agi' | 'int'> {
  return attribute === 'uni' ? 'str' : attribute;
}

function firstValueKey(ability: AbilityDef, preferred: string[]): string | undefined {
  const values = ability.values ?? {};
  return preferred.find((key) => Array.isArray(values[key])) ?? Object.keys(values)[0];
}

function inferMasteryArchetype(ability: AbilityDef): MasteryArchetype {
  if (ability.ult) return 'ULT';
  if (ability.channel) return 'CHANNEL';
  if (ability.effects?.some((effect) => effect.kind === 'summon')) return 'SUMMON';
  if (ability.targeting === 'attack-modifier') return 'ATKMOD';
  if (ability.targeting === 'passive' || ability.targeting === 'aura') return 'PASS';
  if (ability.effects?.some((effect) => effect.kind === 'zone') || ability.targeting === 'ground-aoe') return 'ZONE';
  if (ability.effects?.some((effect) => effect.kind === 'damage' || effect.kind === 'projectile' || effect.kind === 'repeat')) return 'NUKE';
  return 'UTIL';
}

function growthNode(hero: HeroDef, ability: AbilityDef, tier: 1 | 3, archetype: MasteryArchetype): MasteryNode {
  const id = `${hero.id}-${slug(ability.name)}-t${tier}`;
  const valueKey = firstValueKey(ability, archetype === 'UTIL' || archetype === 'PASS' ? ['duration', 'heal', 'block', 'bonus', 'damage'] : ['damage', 'heal', 'dps', 'bonus', 'radius', 'duration', 'count']);
  const stat = primaryStat(hero.attribute);
  const mods: StatModMap = {};
  const tierKey = tier === 1 ? 'tier1' : 'tier3';
  const abilityOverride = valueKey
    ? { abilityId: ability.id, valueKey, mode: 'mul' as const, amount: TUNING.mastery.growthValueMult[tierKey] }
    : undefined;
  if (!abilityOverride) mods[stat] = TUNING.mastery.fallbackStatBonus[tierKey];
  if (archetype === 'PASS' || archetype === 'UTIL') mods[stat] = (mods[stat] ?? 0) + TUNING.mastery.utilityStatBonus[tierKey];
  return {
    id,
    name: tier === 1 ? 'Root Growth' : 'Branch Growth',
    tier,
    kind: 'growth',
    description: tier === 1
      ? `${ability.name} gains a small ${archetype.toLowerCase()} growth bump.`
      : `${ability.name}'s growth node improves its reliability and scaling.`,
    ...(Object.keys(mods).length > 0 ? { mods } : {}),
    ...(abilityOverride ? { abilityOverride } : {})
  };
}

function mechanicNode(hero: HeroDef, ability: AbilityDef, tier: 2 | 4, archetype: MasteryArchetype): MasteryNode {
  const mech = tier === 2 ? ARCHETYPE_MECHANICS[archetype].t2 : ARCHETYPE_MECHANICS[archetype].t4;
  const valueKey = firstValueKey(ability, ['damage', 'heal', 'dps', 'bonus', 'duration', 'radius', 'count']);
  const verbText: Record<MasteryMechanicVerb, string> = {
    mark: 'marks targets for follow-up abilities',
    consume: 'consumes its own marks for a stronger payoff',
    chain: 'chains to a nearby valid target',
    echo: 'echoes from a recent trigger',
    split: 'splits its effect across multiple targets',
    follow: 'follows its owner or chosen target',
    convert: 'converts part of its cost or output into another resource',
    summon: 'creates an object that participates in the build',
    refund: 'refunds part of its cost after a successful setup',
    recast: 'can recast through a build-specific window',
    retarget: 'retargets toward marked or wounded enemies',
    copy: 'copies a named hero mechanic onto a summon or echo',
    store: 'stores power for a later release',
    prime: 'primes the next linked ability',
    mirror: 'mirrors its effect through a summon, ward, or illusion',
    persist: 'persists as a field or object after the first hit'
  };
  return {
    id: `${hero.id}-${slug(ability.name)}-t${tier}`,
    name: tier === 2 ? `${ability.name} Hook` : `${ability.name} Transform`,
    tier,
    kind: tier === 2 ? 'keystone' : 'capstone',
    mechanic: mech,
    description: `${ability.name} ${verbText[mech]}.`,
    grantsExotic: 'mastery-mechanic',
    ...(valueKey ? { abilityOverride: { abilityId: ability.id, valueKey, mode: 'mul' as const, amount: tier === 2 ? TUNING.mastery.mechanicValueMult.keystone : TUNING.mastery.mechanicValueMult.capstone } } : {})
  };
}

export function deriveMasteryTrees(hero: HeroDef): [MasteryBranch, MasteryBranch, MasteryBranch, MasteryBranch] {
  if (hero.masteryTrees) return hero.masteryTrees;
  const branches = hero.abilities.slice(0, MASTERY_BRANCH_COUNT).map((ability, branchIdx) => {
    const archetype = inferMasteryArchetype(ability);
    return {
      abilityId: ability.id,
      name: ability.name,
      nodes: [
        growthNode(hero, ability, 1, archetype),
        mechanicNode(hero, ability, 2, archetype),
        growthNode(hero, ability, 3, archetype),
        mechanicNode(hero, ability, 4, archetype)
      ]
    } satisfies MasteryBranch;
  });
  return branches as [MasteryBranch, MasteryBranch, MasteryBranch, MasteryBranch];
}

export function masteryPointsForLevel(level: number): number {
  return TUNING.mastery.pointLevels.filter((unlockLevel) => level >= unlockLevel).length;
}

export function masteryNodeIndex(branchIdx: number, tier: number): number {
  return branchIdx * MASTERY_TIERS_PER_BRANCH + (tier - 1);
}

export function masterySpent(ranks: number[] | undefined): number {
  return (ranks ?? []).reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0);
}

export function masteryNodeUnlocked(hero: HeroDef, level: number, abilityLevels: number[], nodeIdx: number): boolean {
  const branchIdx = Math.floor(nodeIdx / MASTERY_TIERS_PER_BRANCH);
  const tier = (nodeIdx % MASTERY_TIERS_PER_BRANCH) + 1;
  const ability = hero.abilities[branchIdx];
  if (!ability) return false;
  if (ability.ult && tier === 4) return abilityLevels[branchIdx] >= abilityMaxLevel(ability) && level >= 25;
  return (abilityLevels[branchIdx] ?? 0) >= tier;
}

export function canBuyMasteryNode(hero: HeroDef, level: number, abilityLevels: number[], ranks: number[] | undefined, nodeIdx: number): boolean {
  if (nodeIdx < 0 || nodeIdx >= MASTERY_NODE_COUNT) return false;
  const safeRanks = normalizeMasteryRanks(hero, level, abilityLevels, ranks);
  if (safeRanks[nodeIdx]) return false;
  if (masterySpent(safeRanks) >= masteryPointsForLevel(level)) return false;
  if (!masteryNodeUnlocked(hero, level, abilityLevels, nodeIdx)) return false;
  const tierOffset = nodeIdx % MASTERY_TIERS_PER_BRANCH;
  return tierOffset === 0 || safeRanks[nodeIdx - 1] > 0;
}

export function normalizeMasteryRanks(hero: HeroDef, level: number, abilityLevels: number[], ranks?: number[], legacyCredits = 0): number[] {
  const out = Array.from({ length: MASTERY_NODE_COUNT }, (_, i) => (ranks?.[i] ?? 0) > 0 ? 1 : 0);
  const legal = Array(MASTERY_NODE_COUNT).fill(0) as number[];
  const cap = masteryPointsForLevel(level);
  for (let i = 0; i < out.length && masterySpent(legal) < cap; i++) {
    if (out[i] <= 0) continue;
    if (masteryNodeUnlocked(hero, level, abilityLevels, i) && (i % MASTERY_TIERS_PER_BRANCH === 0 || legal[i - 1] > 0)) legal[i] = 1;
  }
  if (masterySpent(legal) > 0 || legacyCredits <= 0) return legal;
  for (let i = 0; i < legal.length && masterySpent(legal) < Math.min(cap, legacyCredits); i++) {
    if (masteryNodeUnlocked(hero, level, abilityLevels, i) && (i % MASTERY_TIERS_PER_BRANCH === 0 || legal[i - 1] > 0)) legal[i] = 1;
  }
  return legal;
}

export function boughtMasteryNodes(hero: HeroDef, ranks: number[] | undefined): MasteryNode[] {
  const branches = deriveMasteryTrees(hero);
  const out: MasteryNode[] = [];
  (ranks ?? []).forEach((rank, nodeIdx) => {
    if (rank <= 0) return;
    const branchIdx = Math.floor(nodeIdx / MASTERY_TIERS_PER_BRANCH);
    const tierIdx = nodeIdx % MASTERY_TIERS_PER_BRANCH;
    const node = branches[branchIdx]?.nodes[tierIdx];
    if (node) out.push(node);
  });
  return out;
}
