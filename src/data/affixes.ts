import { GRADE_DEFS, percentileForGrade } from './grade';
import type { Rng } from '../core/rng';
import type { AffixPoolId, DifficultyTier, ItemAffixDef, ItemDef, ItemGrade, RolledAffix, StatModMap } from '../core/types';

export const AFFIX_POOLS: Record<AffixPoolId, string> = {
  'weapon-like': 'Weapon-like',
  'armor-like': 'Armor-like',
  'caster-like': 'Caster-like',
  mobility: 'Mobility',
  any: 'Any'
};

export const AFFIX_DEFS: ItemAffixDef[] = [
  { id: 'heavy', name: 'Heavy', kind: 'prefix', tier: 1, pools: ['weapon-like', 'any'], weight: 10, statRanges: { damage: [4, 14] } },
  { id: 'razor-edged', name: 'Razor-Edged', kind: 'prefix', tier: 2, pools: ['weapon-like'], weight: 7, statRanges: { damage: [8, 22], attackSpeed: [4, 12] } },
  { id: 'blooddrinkers', name: "Blooddrinker's", kind: 'suffix', tier: 2, pools: ['weapon-like'], weight: 6, statRanges: { lifestealPct: [4, 10] } },
  { id: 'cleaving', name: 'Cleaving', kind: 'suffix', tier: 3, pools: ['weapon-like'], weight: 4, statRanges: { damagePct: [4, 9] } },
  { id: 'of-the-bear', name: 'of the Bear', kind: 'suffix', tier: 1, pools: ['armor-like', 'any'], weight: 10, statRanges: { str: [3, 9], maxHp: [35, 120] } },
  { id: 'warded', name: 'Warded', kind: 'prefix', tier: 2, pools: ['armor-like'], weight: 7, statRanges: { magicResistPct: [4, 10] } },
  { id: 'stalwart', name: 'Stalwart', kind: 'prefix', tier: 3, pools: ['armor-like'], weight: 5, statRanges: { armor: [2, 7], statusResistPct: [4, 9] } },
  { id: 'commanding', name: 'Commanding', kind: 'prefix', tier: 3, pools: ['armor-like', 'any'], weight: 3, aura: { radius: 900, affects: 'allies', mods: { armor: 2 }, excludeSelf: true } },
  { id: 'arcane', name: 'Arcane', kind: 'prefix', tier: 1, pools: ['caster-like'], weight: 10, statRanges: { int: [3, 10], manaRegen: [0.4, 1.6] } },
  { id: 'of-insight', name: 'of Insight', kind: 'suffix', tier: 2, pools: ['caster-like'], weight: 8, statRanges: { maxMana: [45, 160], spellAmpPct: [3, 8] } },
  { id: 'overcharged', name: 'Overcharged', kind: 'prefix', tier: 3, pools: ['caster-like'], weight: 4, statRanges: { spellAmpPct: [6, 12], castRange: [35, 90] } },
  { id: 'swift', name: 'Swift', kind: 'prefix', tier: 1, pools: ['mobility', 'any'], weight: 9, statRanges: { moveSpeed: [8, 24] } },
  { id: 'of-the-hawk', name: 'of the Hawk', kind: 'suffix', tier: 2, pools: ['mobility', 'weapon-like'], weight: 6, statRanges: { attackRange: [35, 110] } },
  { id: 'vital', name: 'Vital', kind: 'prefix', tier: 1, pools: ['any'], weight: 8, statRanges: { maxHp: [45, 150] } },
  { id: 'battle-fed', name: 'Battle-Fed', kind: 'suffix', tier: 3, pools: ['weapon-like', 'any'], weight: 3, trigger: { on: 'on-kill', statStack: { mods: { damage: 1 }, max: 10 } } },
  { id: 'stormcallers', name: "Stormcaller's", kind: 'signature', tier: 4, pools: ['weapon-like', 'caster-like'], weight: 2, attack: { procChance: 30, procDamage: 120 } },
  { id: 'glassbreaker', name: 'Glassbreaker', kind: 'signature', tier: 4, pools: ['weapon-like'], weight: 2, statRanges: { armor: [3, 7], damage: [10, 24] } },
  { id: 'vampiric-surge', name: 'Vampiric Surge', kind: 'signature', tier: 4, pools: ['weapon-like', 'armor-like'], weight: 2, statRanges: { lifestealPct: [8, 18], moveSpeed: [12, 30] } },
  { id: 'ancient-mind', name: 'Ancient Mind', kind: 'signature', tier: 5, pools: ['caster-like'], weight: 1, statRanges: { spellAmpPct: [10, 18], manaRegenPctMax: [0.25, 0.7] } }
];

const DEFS = new Map(AFFIX_DEFS.map((affix) => [affix.id, affix]));

export function affixDef(id: string): ItemAffixDef {
  const def = DEFS.get(id);
  if (!def) throw new Error(`unknown item affix: ${id}`);
  return def;
}

export function affixPoolForItem(def: ItemDef): AffixPoolId[] {
  const pools: AffixPoolId[] = [];
  const mods = def.passiveMods ?? {};
  if (mods.damage || def.attackMod) pools.push('weapon-like');
  if (mods.armor || mods.maxHp || mods.str || def.aura) pools.push('armor-like');
  if (mods.int || mods.manaRegen || mods.maxMana || mods.spellAmpPct || def.active) pools.push('caster-like');
  if (mods.moveSpeed || mods.moveSpeedPct || mods.attackRange) pools.push('mobility');
  pools.push('any');
  return [...new Set(pools)];
}

// Regular (prefix/suffix) affix tier ceiling by difficulty. The top T5 band only
// opens on Hell once the endgame is unlocked (full badges or a raid clear, §14).
function maxAffixTier(difficulty: DifficultyTier, endgameUnlocked = false): 2 | 3 | 4 | 5 {
  if (difficulty === 'hell') return endgameUnlocked ? 5 : 4;
  if (difficulty === 'nightmare') return 3;
  return 2;
}

// Signatures gate separately (§5, §14): none on Normal, the minor/full pools on
// Nightmare/Hell, and the loudest T5 "ancient tier" only on Hell + endgame.
function maxSignatureTier(difficulty: DifficultyTier, endgameUnlocked = false): 0 | 4 | 5 {
  if (difficulty === 'hell') return endgameUnlocked ? 5 : 4;
  if (difficulty === 'nightmare') return 4;
  return 0;
}

function pickWeighted(pool: ItemAffixDef[], rng: Rng): ItemAffixDef {
  const total = pool.reduce((sum, affix) => sum + Math.max(0, affix.weight), 0);
  let draw = rng.range(0, total);
  for (const affix of pool) {
    draw -= Math.max(0, affix.weight);
    if (draw <= 0) return affix;
  }
  return pool[pool.length - 1];
}

export function resolveAffix(def: ItemAffixDef, roll: number): StatModMap {
  const resolved: StatModMap = {};
  for (const [key, [lo, hi]] of Object.entries(def.statRanges ?? {}) as [keyof StatModMap, [number, number]][]) {
    const raw = lo + (hi - lo) * Math.max(0, Math.min(1, roll));
    resolved[key] = Math.round(raw * 10) / 10;
  }
  return resolved;
}

export function rollAffixesFor(item: ItemDef, grade: ItemGrade, difficulty: DifficultyTier, rng: Rng, endgameUnlocked = false): RolledAffix[] {
  const gradeDef = GRADE_DEFS[grade];
  if (gradeDef.affixSlots <= 0) return [];
  const pools = new Set(affixPoolForItem(item));
  const maxTier = maxAffixTier(difficulty, endgameUnlocked);
  const eligible = AFFIX_DEFS.filter((affix) => affix.kind !== 'signature' && affix.tier <= maxTier && affix.pools.some((pool) => pools.has(pool)));
  const picked: RolledAffix[] = [];
  const used = new Set<string>();
  const kinds = gradeDef.affixSlots === 1 ? ['prefix'] : ['prefix', 'suffix', 'prefix'];
  const basePercentile = percentileForGrade(grade, rng.next());

  for (let i = 0; i < gradeDef.affixSlots; i++) {
    const desired = kinds[i] as 'prefix' | 'suffix';
    const pool = eligible.filter((affix) => !used.has(affix.id) && (affix.kind === desired || eligible.every((candidate) => candidate.kind !== desired || used.has(candidate.id))));
    if (pool.length === 0) continue;
    const affix = pickWeighted(pool, rng);
    used.add(affix.id);
    const roll = Math.max(basePercentile, rng.next());
    picked.push({ affixId: affix.id, roll, resolved: resolveAffix(affix, roll) });
  }

  const maxSigTier = maxSignatureTier(difficulty, endgameUnlocked);
  if (maxSigTier > 0 && gradeDef.signatureChance > 0 && rng.chance(gradeDef.signatureChance)) {
    const signatures = AFFIX_DEFS.filter((affix) => affix.kind === 'signature' && affix.tier <= maxSigTier && affix.pools.some((pool) => pools.has(pool)));
    if (signatures.length > 0) {
      const affix = pickWeighted(signatures, rng);
      const roll = Math.max(basePercentile, rng.next());
      picked.push({ affixId: affix.id, roll, resolved: resolveAffix(affix, roll) });
    }
  }

  return picked;
}

export function rollAffixForKind(
  item: ItemDef,
  kind: ItemAffixDef['kind'],
  grade: ItemGrade,
  difficulty: DifficultyTier,
  rng: Rng,
  excludeIds: string[] = [],
  endgameUnlocked = false
): RolledAffix | null {
  const pools = new Set(affixPoolForItem(item));
  const tierLimit = kind === 'signature' ? maxSignatureTier(difficulty, endgameUnlocked) : maxAffixTier(difficulty, endgameUnlocked);
  if (tierLimit <= 0) return null;
  const excluded = new Set(excludeIds);
  const eligible = AFFIX_DEFS.filter((affix) =>
    affix.kind === kind &&
    affix.tier <= tierLimit &&
    !excluded.has(affix.id) &&
    affix.pools.some((pool) => pools.has(pool))
  );
  if (eligible.length === 0) return null;
  const basePercentile = percentileForGrade(grade, rng.next());
  const affix = pickWeighted(eligible, rng);
  const roll = Math.max(basePercentile, rng.next());
  return { affixId: affix.id, roll, resolved: resolveAffix(affix, roll) };
}
