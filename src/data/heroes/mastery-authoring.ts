import { TUNING } from '../tuning';
import type { MasteryBranch, MasteryMechanicVerb, MasteryNode, StatModMap } from '../../core/types';

// Authoring helper for bespoke mastery trees (SKILL_TREE_SPEC §3, Appendix A).
//
// A bespoke tree is the same shape the template builder (`deriveMasteryTrees`)
// produces — four branches in ability order, each `[growth, keystone, growth,
// capstone]` — but the keystone/capstone names, descriptions, and mechanic verbs
// are hand-authored from the appendix instead of generated. This helper fills in
// the boilerplate (ids, tiers, kinds, the shared runtime exotic hook) so each
// hero file only states the parts that carry identity.
//
// Numbers stay consistent with the derived trees: growth/mechanic overrides
// default to the same `TUNING.mastery` multipliers unless a node opts into an
// explicit amount. The appendix is a mechanic-hook pass, not a balance sheet.

const MASTERY_EXOTIC = 'mastery-mechanic';

interface AuthoredOverride {
  valueKey: string;
  mode?: 'add' | 'mul' | 'set';
  amount?: number;
}

interface GrowthSpec {
  name: string;
  description: string;
  mods?: StatModMap;
  override?: AuthoredOverride;
}

interface MechSpec {
  name: string;
  description: string;
  mechanic: MasteryMechanicVerb;
  mods?: StatModMap;
  override?: AuthoredOverride;
  cooldownAdd?: number;
}

interface BranchSpec {
  abilityId: string;
  name: string;
  t1: GrowthSpec;
  t2: MechSpec;
  t3: GrowthSpec;
  t4: MechSpec;
}

function resolveOverride(abilityId: string, override: AuthoredOverride | undefined, fallbackAmount: number) {
  if (!override) return undefined;
  return {
    abilityId,
    valueKey: override.valueKey,
    mode: override.mode ?? 'mul',
    amount: override.amount ?? fallbackAmount
  } as const;
}

function growthNode(abilityId: string, tier: 1 | 3, spec: GrowthSpec): MasteryNode {
  const fallback = tier === 1 ? TUNING.mastery.growthValueMult.tier1 : TUNING.mastery.growthValueMult.tier3;
  const abilityOverride = resolveOverride(abilityId, spec.override, fallback);
  return {
    id: `${abilityId}-mt${tier}`,
    name: spec.name,
    tier,
    kind: 'growth',
    description: spec.description,
    ...(spec.mods ? { mods: spec.mods } : {}),
    ...(abilityOverride ? { abilityOverride } : {})
  };
}

function mechNode(abilityId: string, tier: 2 | 4, spec: MechSpec): MasteryNode {
  const fallback = tier === 2 ? TUNING.mastery.mechanicValueMult.keystone : TUNING.mastery.mechanicValueMult.capstone;
  const abilityOverride = resolveOverride(abilityId, spec.override, fallback);
  return {
    id: `${abilityId}-mt${tier}`,
    name: spec.name,
    tier,
    kind: tier === 2 ? 'keystone' : 'capstone',
    description: spec.description,
    mechanic: spec.mechanic,
    grantsExotic: MASTERY_EXOTIC,
    ...(spec.mods ? { mods: spec.mods } : {}),
    ...(abilityOverride ? { abilityOverride } : {}),
    ...(spec.cooldownAdd !== undefined ? { cooldownAdd: { abilityId, amount: spec.cooldownAdd } } : {})
  };
}

export function authoredMasteryTrees(
  branches: [BranchSpec, BranchSpec, BranchSpec, BranchSpec]
): [MasteryBranch, MasteryBranch, MasteryBranch, MasteryBranch] {
  return branches.map((branch) => ({
    abilityId: branch.abilityId,
    name: branch.name,
    nodes: [
      growthNode(branch.abilityId, 1, branch.t1),
      mechNode(branch.abilityId, 2, branch.t2),
      growthNode(branch.abilityId, 3, branch.t3),
      mechNode(branch.abilityId, 4, branch.t4)
    ]
  })) as [MasteryBranch, MasteryBranch, MasteryBranch, MasteryBranch];
}
