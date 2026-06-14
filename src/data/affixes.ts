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
  { id: 'cleaving', name: 'Cleaving', kind: 'suffix', tier: 3, pools: ['weapon-like'], weight: 4, attack: { cleave: { pct: 18, radius: 260 } } },
  { id: 'executioners', name: "Executioner's", kind: 'suffix', tier: 3, pools: ['weapon-like'], weight: 4, trigger: { on: 'on-kill', effects: [{ kind: 'heal', amount: 5, target: 'self', pctMaxHp: true }, { kind: 'statmod', mods: { moveSpeed: 24 }, duration: 3, target: 'self' }] } },
  { id: 'of-the-bear', name: 'of the Bear', kind: 'suffix', tier: 1, pools: ['armor-like', 'any'], weight: 10, statRanges: { str: [3, 9], maxHp: [35, 120] } },
  { id: 'warded', name: 'Warded', kind: 'prefix', tier: 2, pools: ['armor-like'], weight: 7, statRanges: { magicResistPct: [4, 10] } },
  { id: 'stalwart', name: 'Stalwart', kind: 'prefix', tier: 3, pools: ['armor-like'], weight: 5, statRanges: { armor: [2, 7], statusResistPct: [4, 9] } },
  { id: 'commanding', name: 'Commanding', kind: 'prefix', tier: 3, pools: ['armor-like', 'any'], weight: 3, aura: { radius: 900, affects: 'allies', mods: { armor: 2 }, excludeSelf: true } },
  { id: 'thorned', name: 'Thorned', kind: 'suffix', tier: 3, pools: ['armor-like'], weight: 4, trigger: { on: 'on-damage-taken', cooldown: 0.8, effects: [{ kind: 'damage', dtype: 'physical', amount: 20, attackDamagePct: 15, target: 'target' }] } },
  { id: 'frost-veined', name: 'Frost-Veined', kind: 'prefix', tier: 2, pools: ['armor-like', 'caster-like'], weight: 5, regionWeights: { icewrack: 3.5, 'nightsilver-woods': 1.4 }, statRanges: { armor: [1, 5], manaRegen: [0.4, 1.4] } },
  { id: 'arcane', name: 'Arcane', kind: 'prefix', tier: 1, pools: ['caster-like'], weight: 10, statRanges: { int: [3, 10], manaRegen: [0.4, 1.6] } },
  { id: 'of-insight', name: 'of Insight', kind: 'suffix', tier: 2, pools: ['caster-like'], weight: 8, statRanges: { maxMana: [45, 160], spellAmpPct: [3, 8] } },
  { id: 'overcharged', name: 'Overcharged', kind: 'prefix', tier: 3, pools: ['caster-like'], weight: 4, statRanges: { spellAmpPct: [6, 12], castRange: [35, 90] } },
  { id: 'resonant', name: 'Resonant', kind: 'suffix', tier: 3, pools: ['caster-like'], weight: 4, trigger: { on: 'on-cast', cooldown: 2.5, effects: [{ kind: 'damage', dtype: 'magical', amount: 55, target: 'enemies-in-radius', radius: 260 }] } },
  { id: 'embercharged', name: 'Embercharged', kind: 'prefix', tier: 2, pools: ['weapon-like', 'caster-like'], weight: 5, regionWeights: { 'devarshi-desert': 3, 'vile-reaches': 2, 'mad-moon-crater': 1.7 }, attack: { procChance: 18, procStatus: { status: 'buff', duration: 3, params: { dotDps: 18, dotType: 'magical', tag: 'embercharged-burn' } } } },
  { id: 'swift', name: 'Swift', kind: 'prefix', tier: 1, pools: ['mobility', 'any'], weight: 9, statRanges: { moveSpeed: [8, 24] } },
  { id: 'of-the-hawk', name: 'of the Hawk', kind: 'suffix', tier: 2, pools: ['mobility', 'weapon-like'], weight: 6, statRanges: { attackRange: [35, 110] } },
  { id: 'wayfarers', name: "Wayfarer's", kind: 'suffix', tier: 2, pools: ['mobility', 'any'], weight: 5, regionWeights: { shadeshore: 2.5, 'hidden-wood': 2.2 }, statRanges: { staminaBonus: [25, 80], moveSpeed: [6, 18] } },
  { id: 'vital', name: 'Vital', kind: 'prefix', tier: 1, pools: ['any'], weight: 8, statRanges: { maxHp: [45, 150] } },
  { id: 'of-fortune', name: 'of Fortune', kind: 'suffix', tier: 2, pools: ['any'], weight: 5, statRanges: { str: [1, 4], agi: [1, 4], int: [1, 4] } },
  { id: 'battle-fed', name: 'Battle-Fed', kind: 'suffix', tier: 3, pools: ['weapon-like', 'any'], weight: 3, trigger: { on: 'on-kill', statStack: { mods: { damage: 1 }, max: 10 } } },
  { id: 'stormcallers', name: "Stormcaller's", kind: 'signature', tier: 4, pools: ['weapon-like', 'caster-like'], weight: 2, regionWeights: { 'mount-joerlak': 3, quoidge: 1.8 }, attack: { procChance: 30, procDamage: 120 }, trigger: { on: 'on-attack-land', cooldown: 0.8, effects: [{ kind: 'damage', dtype: 'magical', amount: 60, target: 'random-enemy-in-radius', radius: 650 }] } },
  { id: 'glassbreaker', name: 'Glassbreaker', kind: 'signature', tier: 4, pools: ['weapon-like'], weight: 2, attack: { procChance: 100, procStatus: { status: 'buff', duration: 4, params: { mods: { armor: -2 }, tag: 'glassbreaker-shred' } } }, statRanges: { damage: [10, 24] } },
  { id: 'vampiric-surge', name: 'Vampiric Surge', kind: 'signature', tier: 4, pools: ['weapon-like', 'armor-like'], weight: 2, trigger: { on: 'on-kill', effects: [{ kind: 'statmod', mods: { lifestealPct: 45, moveSpeed: 45 }, duration: 4, target: 'self' }] }, statRanges: { lifestealPct: [6, 12] } },
  { id: 'echoing', name: 'Echoing', kind: 'signature', tier: 4, pools: ['caster-like', 'mobility'], weight: 2, trigger: { on: 'on-cast', cooldown: 5, effects: [{ kind: 'statmod', mods: { spellAmpPct: 18, attackSpeed: 25 }, duration: 3, target: 'self' }] } },
  { id: 'ancient-mind', name: 'Ancient Mind', kind: 'signature', tier: 5, pools: ['caster-like'], weight: 1, statRanges: { spellAmpPct: [10, 18], manaRegenPctMax: [0.25, 0.7] } },
  { id: 'worldbreaker', name: 'Worldbreaker', kind: 'signature', tier: 5, pools: ['weapon-like', 'armor-like'], weight: 1, trigger: { on: 'on-attack-land', cooldown: 1.2, effects: [{ kind: 'damage', dtype: 'physical', amount: 80, attackDamagePct: 25, target: 'enemies-in-radius', radius: 240 }] } }
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

function regionalWeight(affix: ItemAffixDef, regionId?: string): number {
  return Math.max(0, affix.weight * (regionId ? affix.regionWeights?.[regionId] ?? 1 : 1));
}

function pickWeighted(pool: ItemAffixDef[], rng: Rng, regionId?: string): ItemAffixDef {
  const total = pool.reduce((sum, affix) => sum + regionalWeight(affix, regionId), 0);
  let draw = rng.range(0, total);
  for (const affix of pool) {
    draw -= regionalWeight(affix, regionId);
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

export function rollAffixesFor(item: ItemDef, grade: ItemGrade, difficulty: DifficultyTier, rng: Rng, endgameUnlocked = false, regionId?: string): RolledAffix[] {
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
    const affix = pickWeighted(pool, rng, regionId);
    used.add(affix.id);
    const roll = Math.max(basePercentile, rng.next());
    picked.push({ affixId: affix.id, roll, resolved: resolveAffix(affix, roll) });
  }

  const maxSigTier = maxSignatureTier(difficulty, endgameUnlocked);
  if (maxSigTier > 0 && gradeDef.signatureChance > 0 && rng.chance(gradeDef.signatureChance)) {
    const signatures = AFFIX_DEFS.filter((affix) => affix.kind === 'signature' && affix.tier <= maxSigTier && affix.pools.some((pool) => pools.has(pool)));
    if (signatures.length > 0) {
      const affix = pickWeighted(signatures, rng, regionId);
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
  endgameUnlocked = false,
  regionId?: string
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
  const affix = pickWeighted(eligible, rng, regionId);
  const roll = Math.max(basePercentile, rng.next());
  return { affixId: affix.id, roll, resolved: resolveAffix(affix, roll) };
}
