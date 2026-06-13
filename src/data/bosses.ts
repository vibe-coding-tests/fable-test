import type { BossDef, LootTable } from '../core/types';
import { TUNING } from './tuning';

const AGILITY_CARRIES = new Set([
  'phantom-assassin', 'medusa', 'naga-siren', 'slark', 'broodmother', 'faceless-void', 'terrorblade', 'spectre'
]);
const STRENGTH_TITANS = new Set([
  'pudge', 'lifestealer', 'doom', 'wraith-king', 'tidehunter', 'magnus', 'elder-titan', 'centaur-warrunner', 'sven', 'axe'
]);
const INTELLIGENCE_BOSSES = new Set([
  'invoker', 'zeus', 'silencer', 'outworld-destroyer', 'skywrath-mage', 'tinker', 'lich', 'crystal-maiden', 'lina'
]);

function themedLoot(heroId: string, rank: BossDef['rank']): LootTable {
  const isMini = rank === 'mini-boss';
  let guaranteed = ['ultimate-orb'];
  let assembledPool = ['aghanims-scepter', 'refresher-orb'];
  if (AGILITY_CARRIES.has(heroId)) {
    guaranteed = ['eaglesong'];
    assembledPool = ['butterfly', 'eye-of-skadi', 'diffusal-blade'];
  } else if (STRENGTH_TITANS.has(heroId)) {
    guaranteed = ['reaver'];
    assembledPool = ['heart-of-tarrasque', 'assault-cuirass', 'black-king-bar'];
  } else if (INTELLIGENCE_BOSSES.has(heroId)) {
    guaranteed = ['mystic-staff'];
    assembledPool = ['scythe-of-vyse', 'refresher-orb', 'aghanims-scepter'];
  }
  const dropPct = isMini
    ? {
        normal: TUNING.bossAssembledDropPct.normal * 0.45,
        nightmare: TUNING.bossAssembledDropPct.nightmare * 0.5,
        hell: TUNING.bossAssembledDropPct.hell * 0.55
      }
    : TUNING.bossAssembledDropPct;
  return {
    guaranteed,
    assembledPool: isMini ? assembledPool.filter((id) => id !== 'aghanims-scepter').slice(0, 2) : assembledPool,
    dropPct,
    pity: isMini ? TUNING.raidBadLuckPity + 2 : TUNING.raidBadLuckPity
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
  ['boss-terrorblade', 'terrorblade', 'mad-moon-crater', 'boss']
];

export const ALL_BOSSES: BossDef[] = SPECS.map(([id, heroId, region, rank]) => boss(id, heroId, region, rank));
