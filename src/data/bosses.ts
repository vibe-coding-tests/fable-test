import type { BossDef, ItemRarity, LootTable } from '../core/types';
import { TUNING } from './tuning';

// GAMEPLAY_2.0_REHAUL §3.3: every boss is an *efficient* themed home, classified
// by its hero's combat identity so a str titan never hands out caster cores (and
// vice versa). Covers the full boss roster; anything unlisted falls to the int lane.
const AGILITY_CARRIES = new Set([
  'phantom-assassin', 'medusa', 'naga-siren', 'slark', 'broodmother', 'faceless-void', 'terrorblade', 'spectre',
  'templar-assassin', 'drow-ranger', 'nyx-assassin', 'viper', 'ember-spirit'
]);
const STRENGTH_TITANS = new Set([
  'pudge', 'lifestealer', 'doom', 'wraith-king', 'tidehunter', 'magnus', 'elder-titan', 'centaur-warrunner', 'sven', 'axe',
  'dragon-knight', 'sand-king', 'kunkka', 'slardar', 'night-stalker', 'undying', 'beastmaster', 'tiny', 'treant-protector'
]);
const INTELLIGENCE_BOSSES = new Set([
  'invoker', 'zeus', 'silencer', 'outworld-destroyer', 'skywrath-mage', 'tinker', 'lich', 'crystal-maiden', 'lina',
  'natures-prophet', 'enchantress', 'chen', 'warlock', 'visage', 'storm-spirit'
]);

const BOSS_ITEM_RARITY: Partial<Record<string, ItemRarity>> = {
  butterfly: 'immortal',
  'scythe-of-vyse': 'immortal',
  'heart-of-tarrasque': 'immortal',
  'eye-of-skadi': 'immortal',
  'refresher-orb': 'immortal',
  'aghanims-scepter': 'immortal',
  'abyssal-blade': 'immortal',
  bloodthorn: 'immortal',
  radiance: 'immortal',
  satanic: 'immortal',
  'octarine-core': 'immortal',
  'aghanims-blessing': 'immortal',
  'assault-cuirass': 'legendary',
  'black-king-bar': 'mythical',
  'diffusal-blade': 'mythical'
};

function rarityPools(ids: string[]): LootTable['assembledRarityPools'] {
  const pools: LootTable['assembledRarityPools'] = {};
  for (const id of ids) {
    const rarity = BOSS_ITEM_RARITY[id] ?? 'legendary';
    pools[rarity] = [...(pools[rarity] ?? []), id];
  }
  return pools;
}

function themedLoot(heroId: string, rank: BossDef['rank']): LootTable {
  const isMini = rank === 'mini-boss';
  let guaranteed = ['ultimate-orb'];
  let assembledPool = ['aghanims-scepter', 'refresher-orb'];
  if (AGILITY_CARRIES.has(heroId)) {
    guaranteed = ['eaglesong'];
    // crit/attack carries are the efficient home for the crit cores (§3.3: "a Daedalus farms from a crit carry").
    assembledPool = ['butterfly', 'eye-of-skadi', 'abyssal-blade', 'bloodthorn', 'diffusal-blade', 'daedalus', 'monkey-king-bar', 'mjollnir'];
  } else if (STRENGTH_TITANS.has(heroId)) {
    guaranteed = ['reaver'];
    assembledPool = ['heart-of-tarrasque', 'satanic', 'radiance', 'assault-cuirass', 'black-king-bar'];
  } else if (INTELLIGENCE_BOSSES.has(heroId)) {
    guaranteed = ['mystic-staff'];
    assembledPool = ['scythe-of-vyse', 'refresher-orb', 'octarine-core', 'aghanims-scepter', 'aghanims-blessing'];
  }
  const dropPct = isMini
    ? {
        normal: TUNING.bossAssembledDropPct.normal * 0.45,
        nightmare: TUNING.bossAssembledDropPct.nightmare * 0.5,
        hell: TUNING.bossAssembledDropPct.hell * 0.55
      }
    : TUNING.bossAssembledDropPct;
  // Bosses are a curated, repeatable source, so their anchor can drop a modestly
  // upgraded copy — but the prestige Unusual grade stays reserved to raids and
  // special battles (LOOT_OVERHAUL §3.3/§3.5). Mini-bosses get the slimmer cut.
  const qualityOdds = isMini
    ? { inscribed: 0.04, genuine: 0.03 }
    : { inscribed: 0.07, frozen: 0.05, genuine: 0.04 };
  const pool = isMini ? assembledPool.filter((id) => id !== 'aghanims-scepter').slice(0, 2) : assembledPool;
  return {
    guaranteed,
    assembledPool: pool,
    assembledRarityPools: rarityPools(pool),
    dropPct,
    pity: isMini ? TUNING.raidBadLuckPity + 2 : TUNING.raidBadLuckPity,
    qualityOdds
  };
}

function boss(id: string, heroId: string, region: string, rank: BossDef['rank']): BossDef {
  return {
    id,
    heroId,
    region,
    rank,
    phases: rank === 'boss'
      ? [
          { atHpPct: 66, onEnter: [{ kind: 'status', status: 'buff', duration: 6, target: 'self', params: { mods: { damagePct: 18 }, tag: `${id}-phase-2` } }] },
          { atHpPct: 33, onEnter: [{ kind: 'status', status: 'buff', duration: 8, target: 'self', params: { mods: { attackSpeed: 45 }, tag: `${id}-phase-3` } }], gambitBias: 'finish' }
        ]
      : [{ atHpPct: 50, onEnter: [{ kind: 'status', status: 'buff', duration: 5, target: 'self', params: { mods: { moveSpeedPct: 12 }, tag: `${id}-mini-phase` } }] }],
    loot: themedLoot(heroId, rank),
    tiers: ['normal', 'nightmare', 'hell']
  };
}

const SPECS: [string, string, string, BossDef['rank']][] = [
  ['boss-phantom-assassin', 'phantom-assassin', 'devarshi-desert', 'boss'],
  ['boss-medusa', 'medusa', 'devarshi-desert', 'boss'],
  ['mini-sand-king', 'sand-king', 'devarshi-desert', 'mini-boss'],
  ['mini-nyx-assassin', 'nyx-assassin', 'devarshi-desert', 'mini-boss'],
  ['mini-viper', 'viper', 'devarshi-desert', 'mini-boss'],
  ['boss-kunkka', 'kunkka', 'shadeshore', 'boss'],
  ['boss-tidehunter', 'tidehunter', 'shadeshore', 'boss'],
  ['boss-naga-siren', 'naga-siren', 'shadeshore', 'boss'],
  ['mini-slardar', 'slardar', 'shadeshore', 'mini-boss'],
  ['mini-slark', 'slark', 'shadeshore', 'mini-boss'],
  ['boss-pudge', 'pudge', 'vile-reaches', 'boss'],
  ['boss-lifestealer', 'lifestealer', 'vile-reaches', 'boss'],
  ['boss-doom', 'doom', 'vile-reaches', 'boss'],
  ['boss-wraith-king', 'wraith-king', 'vile-reaches', 'boss'],
  ['mini-undying', 'undying', 'vile-reaches', 'mini-boss'],
  ['mini-night-stalker', 'night-stalker', 'vile-reaches', 'mini-boss'],
  ['boss-invoker', 'invoker', 'quoidge', 'boss'],
  ['boss-zeus', 'zeus', 'quoidge', 'boss'],
  ['mini-silencer', 'silencer', 'quoidge', 'mini-boss'],
  ['mini-outworld-destroyer', 'outworld-destroyer', 'quoidge', 'mini-boss'],
  ['mini-skywrath-mage', 'skywrath-mage', 'quoidge', 'mini-boss'],
  ['mini-tinker', 'tinker', 'quoidge', 'mini-boss'],
  ['boss-natures-prophet', 'natures-prophet', 'hidden-wood', 'boss'],
  ['boss-broodmother', 'broodmother', 'hidden-wood', 'boss'],
  ['mini-enchantress', 'enchantress', 'hidden-wood', 'mini-boss'],
  ['mini-chen', 'chen', 'hidden-wood', 'mini-boss'],
  ['mini-beastmaster', 'beastmaster', 'hidden-wood', 'mini-boss'],
  ['mini-warlock', 'warlock', 'hidden-wood', 'mini-boss'],
  ['mini-visage', 'visage', 'hidden-wood', 'mini-boss'],
  ['boss-magnus', 'magnus', 'mount-joerlak', 'boss'],
  ['boss-elder-titan', 'elder-titan', 'mount-joerlak', 'boss'],
  ['boss-tiny', 'tiny', 'mount-joerlak', 'boss'],
  ['boss-storm-spirit', 'storm-spirit', 'mount-joerlak', 'boss'],
  ['boss-ember-spirit', 'ember-spirit', 'mount-joerlak', 'boss'],
  ['mini-treant-protector', 'treant-protector', 'mount-joerlak', 'mini-boss'],
  ['mini-centaur-warrunner', 'centaur-warrunner', 'mount-joerlak', 'mini-boss'],
  ['boss-spectre', 'spectre', 'mad-moon-crater', 'boss'],
  ['boss-faceless-void', 'faceless-void', 'mad-moon-crater', 'boss'],
  ['boss-terrorblade', 'terrorblade', 'mad-moon-crater', 'boss'],
  // Marquee guardians (MARQUEE_AND_ARMORY_ADDENDUM §2.3 / C2): the same boss the
  // raid wave names, standing at the bottom of its themed descent. They surface
  // as regional boss reruns too — one entity, three surfaces.
  ['marquee-void-prelate', 'templar-assassin', 'quoidge', 'boss'],
  ['marquee-last-eldwurm', 'dragon-knight', 'mad-moon-crater', 'boss']
];

export const ALL_BOSSES: BossDef[] = SPECS.map(([id, heroId, region, rank]) => boss(id, heroId, region, rank));
