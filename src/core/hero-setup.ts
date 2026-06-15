import { activeTalentOptionsForTier } from './echo';
import { deriveMasteryTrees, MASTERY_TIERS_PER_BRANCH } from './mastery';
import type { AghanimPayload, EchoProgress, HeroAugments, HeroDef, HeroAbilityPatch, MasteryNode, TalentDef } from './types';

// ------------------------------------------------------------------
// Talents & facets are data (SPEC §5): stat mods merge into the
// unit's externalMods; ability-field overrides patch a deep-copied
// hero def before the unit is spawned.
// ------------------------------------------------------------------

export interface HeroBuild {
  def: HeroDef;
  externalMods: Record<string, number>;
}

function applyOverride(def: HeroDef, ov: { abilityId: string; valueKey: string; mode: 'add' | 'mul' | 'set'; amount: number }): void {
  const ab = def.abilities.find((a) => a.id === ov.abilityId);
  if (!ab || !ab.values || !ab.values[ov.valueKey]) return;
  ab.values[ov.valueKey] = ab.values[ov.valueKey].map((v) => {
    switch (ov.mode) {
      case 'add': return v + ov.amount;
      case 'mul': return v * ov.amount;
      case 'set': return ov.amount;
    }
  });
}

function applyCooldownAdd(def: HeroDef, ca: { abilityId: string; amount: number }): void {
  const ab = def.abilities.find((a) => a.id === ca.abilityId);
  if (!ab || !ab.cooldown) return;
  ab.cooldown = ab.cooldown.map((c) => Math.max(0.5, c + ca.amount));
}

function mergeAbilityPatch(def: HeroDef, p: HeroAbilityPatch): void {
  const ab = def.abilities.find((a) => a.id === p.abilityId);
  if (!ab) return;
  Object.assign(ab, structuredClone(p.patch));
}

function applyAghanimPayload(def: HeroDef, payload: AghanimPayload | undefined, addMods: (mods?: Record<string, number>) => void): void {
  if (!payload) return;
  addMods(payload.mods as Record<string, number> | undefined);
  for (const ov of payload.abilityValueOverrides ?? []) applyOverride(def, ov);
  for (const ca of payload.cooldownAdds ?? []) applyCooldownAdd(def, ca);
  for (const patch of payload.abilityPatches ?? []) mergeAbilityPatch(def, patch);
}

function applyMasteryNode(def: HeroDef, node: MasteryNode, branchAbilityId: string, addMods: (mods?: Record<string, number>) => void): void {
  addMods(node.mods as Record<string, number> | undefined);
  if (node.abilityOverride) applyOverride(def, node.abilityOverride);
  if (node.cooldownAdd) applyCooldownAdd(def, node.cooldownAdd);
  if (node.abilityPatch) mergeAbilityPatch(def, node.abilityPatch);
  if (node.grantsExotic) {
    const abilityId = node.abilityOverride?.abilityId ?? node.abilityPatch?.abilityId ?? branchAbilityId;
    const ab = def.abilities.find((a) => a.id === abilityId);
    const effect = { kind: 'exotic' as const, id: node.grantsExotic, params: { nodeId: node.id, tier: node.tier, mechanic: node.mechanic, abilityId } };
    if (ab && !['passive', 'aura', 'attack-modifier'].includes(ab.targeting)) {
      ab.effects = [
        ...(ab.effects ?? []),
        effect
      ];
    } else if (ab) {
      ab.triggers = [
        ...(ab.triggers ?? []),
        {
          on: ab.targeting === 'attack-modifier' ? 'on-attack-land' : 'on-cast',
          cooldown: node.tier >= 4 ? 3 : 5,
          effects: [effect]
        }
      ];
    }
  }
}

/**
 * Produce a patched hero def + stat mods for a given talent/facet selection.
 * picks[i] selects option 0/1 of talent tier i (null = unpicked);
 * echo progress activates the opposite branch for unlocked tiers.
 */
export function buildHero(
  base: HeroDef,
  picks: (0 | 1 | null)[] = [null, null, null, null],
  facetIdx = 0,
  echo?: EchoProgress,
  augments?: HeroAugments,
  masteryRanks?: number[]
): HeroBuild {
  const def: HeroDef = structuredClone(base);
  const externalMods: Record<string, number> = {};
  const addMods = (mods?: Record<string, number>) => {
    if (!mods) return;
    for (const k in mods) externalMods[k] = (externalMods[k] ?? 0) + mods[k];
  };

  base.talents.forEach((tier, i) => {
    for (const pick of activeTalentOptionsForTier(picks, echo, i)) {
      const t: TalentDef = tier.options[pick];
      addMods(t.mods as Record<string, number> | undefined);
      if (t.abilityOverride) applyOverride(def, t.abilityOverride);
      if (t.cooldownAdd) applyCooldownAdd(def, t.cooldownAdd);
    }
  });

  const branches = deriveMasteryTrees(base);
  (masteryRanks ?? []).forEach((rank, nodeIdx) => {
    if (rank <= 0) return;
    const branchIdx = Math.floor(nodeIdx / MASTERY_TIERS_PER_BRANCH);
    const tierIdx = nodeIdx % MASTERY_TIERS_PER_BRANCH;
    const branch = branches[branchIdx];
    const node = branch?.nodes[tierIdx];
    if (node) applyMasteryNode(def, node, branch.abilityId, addMods);
  });

  const facet = base.facets[facetIdx] ?? base.facets[0];
  if (facet) {
    addMods(facet.mods as Record<string, number> | undefined);
    if (facet.abilityValueOverride) applyOverride(def, facet.abilityValueOverride);
  }

  if (augments?.scepter) applyAghanimPayload(def, base.aghanim?.scepter, addMods);
  if (augments?.shard) applyAghanimPayload(def, base.aghanim?.shard, addMods);

  return { def, externalMods };
}

/** Default talent auto-pick for AI-controlled heroes: option 0 at every unlocked tier. */
export function autoPicksForLevel(level: number): (0 | 1 | null)[] {
  return [level >= 10 ? 0 : null, level >= 15 ? 0 : null, level >= 20 ? 0 : null, level >= 25 ? 0 : null];
}
