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
  'lotus-orb': 'immortal',
  'linkens-sphere': 'immortal',
  nullifier: 'immortal',
  'helm-of-the-overlord': 'immortal',
  gleipnir: 'immortal',
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
    assembledPool = ['butterfly', 'eye-of-skadi', 'abyssal-blade', 'bloodthorn', 'nullifier', 'diffusal-blade', 'daedalus', 'monkey-king-bar', 'mjollnir'];
  } else if (STRENGTH_TITANS.has(heroId)) {
    guaranteed = ['reaver'];
    assembledPool = ['heart-of-tarrasque', 'satanic', 'radiance', 'helm-of-the-overlord', 'assault-cuirass', 'black-king-bar'];
  } else if (INTELLIGENCE_BOSSES.has(heroId)) {
    guaranteed = ['mystic-staff'];
    assembledPool = ['scythe-of-vyse', 'refresher-orb', 'octarine-core', 'lotus-orb', 'linkens-sphere', 'gleipnir', 'aghanims-scepter', 'aghanims-blessing'];
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

const BOSS_LINES: Partial<Record<string, string[]>> = {
  'phantom-assassin': ['The contract was written before this cycle began.', 'I will sign it in your shadow.'],
  medusa: ['Look at what the Loop made of me.', 'Stone remembers better than flesh.'],
  kunkka: ['The tide returns every oath I ever threw into it.', 'Stand fast or drown familiar.'],
  tidehunter: ['Your little road ends under my reef.', 'Every cycle has an admiral. Every cycle, I eat one.'],
  pudge: ['Fresh meat, old war.', 'The hook knows where history is soft.'],
  doom: ['The seal thins. I only widen it.', 'Your Ancient is a door with a heartbeat.'],
  'wraith-king': ['A crown is just a loop that learned posture.', 'Count me dead only when I stop counting myself.'],
  invoker: ['At last, someone asks the right question incorrectly.', 'I have named this Loop twice and improved it both times.'],
  zeus: ['Even thunder repeats when the sky is trapped.', 'Kneel, and I may let the next cycle hear you.'],
  'natures-prophet': ['The forest remembers before banners.', 'Every root has chosen a side except you.'],
  broodmother: ['The web is only the Loop made honest.', 'Come closer. I will teach your party geometry.'],
  magnus: ['The mountain pulls all wars to one point.', 'You brought the Moon in pieces. I bring impact.'],
  'elder-titan': ['I heard the first division. I hear this one too.', 'Not every broken thing deserves reunion.'],
  tiny: ['Stone fell from the Moon. Stone learned to punch back.', 'The crater is only a larger me.'],
  'storm-spirit': ['Round and round, hah! Even eternity needs rhythm.', 'Catch me before the next turn catches you.'],
  'ember-spirit': ['The war repeats because no one has burned clean through it.', 'One spark can make a cycle confess.'],
  spectre: ['The path behind you is also ahead.', 'At the crater, every self arrives armed.'],
  'faceless-void': ['Time is not passing. It is circling.', 'I have seen your victory. It did not end things.'],
  terrorblade: ['Your reflection has already betrayed you.', 'Break the Loop and see what climbs out of the mirror.'],
  'templar-assassin': ['You see the blade only after it has already chosen you.', 'The secret at the heart of your world is poorly guarded.'],
  'dragon-knight': ['The last of my brothers fell. I did not.', 'Your world keeps a stone at its heart. I came down for it.']
};

function bossDialogue(heroId: string, rank: BossDef['rank']): string[] {
  const authored = BOSS_LINES[heroId];
  if (authored) return authored;
  return rank === 'boss'
    ? ['This shard-road has a guardian.', 'Push harder. The next phase remembers teeth.']
    : ['A small break in the road is still a break.', 'The wild does not yield its memory quietly.'];
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
    tiers: ['normal', 'nightmare', 'hell'],
    dialogue: bossDialogue(heroId, rank)
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
