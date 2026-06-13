import { TUNING } from '../tuning';
import type { RecruitmentQuestDef, TrialDef, TrialKind } from '../../core/types';

const HERO_REGION: Record<string, string> = {
  pudge: 'vile-reaches',
  earthshaker: 'tranquil-vale',
  lich: 'icewrack',
  luna: 'nightsilver-woods',
  sven: 'tranquil-vale',
  axe: 'tranquil-vale',
  'crystal-maiden': 'icewrack',
  sniper: 'tranquil-vale',
  mirana: 'nightsilver-woods',
  lina: 'nightsilver-woods',
  zeus: 'quoidge',
  'drow-ranger': 'tranquil-vale',
  jakiro: 'icewrack',
  'witch-doctor': 'tranquil-vale',
  omniknight: 'tranquil-vale',
  windranger: 'tranquil-vale',
  'phantom-assassin': 'devarshi-desert',
  tusk: 'icewrack',
  'ancient-apparition': 'icewrack',
  'legion-commander': 'tranquil-vale',
  'vengeful-spirit': 'tranquil-vale',
  'shadow-fiend': 'nightsilver-woods',
  riki: 'nightsilver-woods',
  'bounty-hunter': 'nightsilver-woods',
  lion: 'icewrack',
  'winter-wyvern': 'icewrack',
  'sand-king': 'devarshi-desert',
  'nyx-assassin': 'devarshi-desert',
  medusa: 'devarshi-desert',
  viper: 'devarshi-desert',
  kunkka: 'shadeshore',
  tidehunter: 'shadeshore',
  slardar: 'shadeshore',
  'naga-siren': 'shadeshore',
  slark: 'shadeshore',
  lifestealer: 'vile-reaches',
  undying: 'vile-reaches',
  doom: 'vile-reaches',
  'wraith-king': 'vile-reaches',
  'night-stalker': 'vile-reaches',
  invoker: 'quoidge',
  silencer: 'quoidge',
  'outworld-destroyer': 'quoidge',
  'skywrath-mage': 'quoidge',
  tinker: 'quoidge',
  enchantress: 'hidden-wood',
  chen: 'hidden-wood',
  'natures-prophet': 'hidden-wood',
  beastmaster: 'hidden-wood',
  broodmother: 'hidden-wood',
  warlock: 'hidden-wood',
  visage: 'hidden-wood',
  magnus: 'mount-joerlak',
  'elder-titan': 'mount-joerlak',
  tiny: 'mount-joerlak',
  'treant-protector': 'mount-joerlak',
  'centaur-warrunner': 'mount-joerlak',
  'storm-spirit': 'mount-joerlak',
  'ember-spirit': 'mount-joerlak',
  spectre: 'mad-moon-crater',
  'faceless-void': 'mad-moon-crater',
  terrorblade: 'mad-moon-crater',
  phoenix: 'mad-moon-crater',
  io: 'mad-moon-crater'
};

// Bespoke trial assignments (Phase 2 §3.3 + Phase 3 §4.5). Everyone else falls
// through to a parameterized template by silhouette/role heuristic below.
const SPECIAL_TRIALS: Record<string, TrialKind> = {
  invoker: 'combo-exam',
  chen: 'persuasion-gauntlet',
  'phantom-assassin': 'assassination-contract',
  'night-stalker': 'survive-night',
  riki: 'stealth-hunt',
  'shadow-fiend': 'souls-pact',
  kunkka: 'faction-choice',
  tidehunter: 'faction-choice',
  'elder-titan': 'lore-riddle',
  sven: 'relic-fetch',
  phoenix: 'raid-recruit',
  io: 'roster-legend'
};

// Templated recruits sitting behind a good-karma gate (§3.2).
const GOOD_KARMA_GATE = new Set<string>(['omniknight']);

function trialKind(heroId: string): TrialKind {
  if (SPECIAL_TRIALS[heroId]) return SPECIAL_TRIALS[heroId];
  if (heroId.includes('crystal') || heroId.includes('lich') || heroId.includes('winter') || heroId.includes('ancient')) return 'frost-exam';
  if (heroId.includes('sniper') || heroId.includes('mirana') || heroId.includes('pudge') || heroId.includes('windranger')) return 'skillshot-exam';
  if (heroId.includes('luna') || heroId.includes('drow')) return 'survive-night';
  if (heroId.includes('axe') || heroId.includes('lina') || heroId.includes('zeus') || heroId.includes('doom')) return 'timed-cull';
  return 'honor-duel';
}

const POS_BY_REGION: Record<string, { x: number; y: number }> = {
  'tranquil-vale': { x: 5900, y: 6800 },
  'nightsilver-woods': { x: 6000, y: 6800 },
  icewrack: { x: 6200, y: 6700 },
  'devarshi-desert': { x: 6000, y: 6900 },
  shadeshore: { x: 5600, y: 6900 },
  'vile-reaches': { x: 6000, y: 6900 },
  quoidge: { x: 6000, y: 6900 },
  'hidden-wood': { x: 5600, y: 6900 },
  'mount-joerlak': { x: 6000, y: 6900 },
  'mad-moon-crater': { x: 7000, y: 7800 }
};

const DESCRIPTION: Record<TrialKind, string> = {
  'honor-duel': 'Win a clean duel against the hero echo.',
  'timed-cull': 'Cull a small wave before the trial flame gutters out.',
  'relic-fetch': 'Recover a lore relic from a guarded marker.',
  'survive-night': 'Stand your ground under nightfall.',
  'stealth-hunt': 'Outlast the hunter stalking you in the dark.',
  'frost-exam': 'Prove you can fight through slows and disables.',
  'skillshot-exam': 'Land decisive hits on a weaving target.',
  'combo-exam': 'Chain three spell schools into one clean combo.',
  'persuasion-gauntlet': 'Convert wild creeps instead of killing them.',
  'assassination-contract': 'Mark a target and finish the contract quickly.',
  'souls-pact': 'Take the pact for power, or refuse it for honor.',
  'faction-choice': 'Choose one side of the Shadeshore captain feud.',
  'lore-riddle': 'Answer the old worldsmith riddle.',
  'raid-recruit': 'Clear the Roshan-pit recruit encounter.',
  'roster-legend': 'Recruit fifty heroes before the Wisp answers.'
};

// Per-kind tunables the TrialRunner reads (radius, count, time, target).
function paramsFor(kind: TrialKind): Record<string, number | string> {
  switch (kind) {
    case 'timed-cull':
      return { count: 4, time: 40 };
    case 'skillshot-exam':
      return { hits: 3, time: 35 };
    case 'combo-exam':
      return { schools: 3, time: 22 };
    case 'assassination-contract':
      return { time: 18 };
    case 'persuasion-gauntlet':
      return { count: 2, time: 45 };
    case 'relic-fetch':
      return { reachRadius: 260, relicDx: 620, guards: 1, time: 50 };
    case 'survive-night':
      return { time: 45, adds: 2 };
    case 'stealth-hunt':
      return { time: 40, adds: 1 };
    case 'lore-riddle':
      return { time: 60, answer: 'origin' };
    case 'faction-choice':
      return { time: 60 };
    case 'souls-pact':
      return { time: 60 };
    case 'roster-legend':
      return { recruitsNeeded: TUNING.rosterLegendNeeded };
    case 'raid-recruit':
      return { raidsNeeded: 1 };
    case 'frost-exam':
    case 'honor-duel':
    default:
      return { time: 90 };
  }
}

function dialogueFor(heroId: string, kind: TrialKind): string[] {
  const name = titleCase(heroId);
  const challenge: Partial<Record<TrialKind, string>> = {
    'honor-duel': `${name}: "Raise your weapon. Let me see if you are worth following."`,
    'souls-pact': `${name}: "Power has a price. Will you pay it, or pretend you are better than that?"`,
    'faction-choice': `${name}: "The tide and the captain both court you. You cannot have us both."`,
    'lore-riddle': `${name}: "Before the world had a name, what did it have? Answer, and we will speak."`,
    'persuasion-gauntlet': `${name}: "Killing is easy. Show me you can lead instead."`,
    'assassination-contract': `${name}: "One mark. One window. Do not make me wait."`,
    'survive-night': `${name}: "Night is when the weak are sorted from the rest. Endure it."`,
    'stealth-hunt': `${name}: "You will not see me coming. Survive anyway."`,
    'relic-fetch': `${name}: "My relic lies past the guard. Bring it, and I am yours."`,
    'skillshot-exam': `${name}: "Stillness is death. Hit what will not hold still."`,
    'combo-exam': `${name}: "Three schools, one breath. Show me the chain."`,
    'frost-exam': `${name}: "Fight cold. Fight slowed. Fight anyway."`,
    'raid-recruit': `${name}: "I answer to those who have stood in the deep places."`,
    'roster-legend': `${name}: "Gather a legend's worth of allies. Then I will believe in you."`,
    'timed-cull': `${name}: "The flame is short. Be shorter."`
  };
  return [challenge[kind] ?? `${name}: "Prove yourself."`, `${name}: "...well fought."`];
}

function titleCase(id: string): string {
  return id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
}

function trial(heroId: string): TrialDef {
  const regionId = HERO_REGION[heroId] ?? 'tranquil-vale';
  const kind = trialKind(heroId);
  const base = POS_BY_REGION[regionId];
  return {
    id: `trial-${heroId}`,
    heroId,
    kind,
    name: `${titleCase(heroId)} Trial`,
    description: DESCRIPTION[kind],
    regionId,
    pos: base,
    params: paramsFor(kind),
    reputationGate: GOOD_KARMA_GATE.has(heroId) ? TUNING.reputationGoodGate : undefined,
    relocationFloor: TUNING.relocationShardFloor,
    relocateSpots: [
      { x: base.x - 700, y: base.y + 500 },
      { x: base.x + 700, y: base.y - 450 }
    ],
    dialogue: dialogueFor(heroId, kind)
  };
}

function quest(heroId: string): RecruitmentQuestDef {
  return {
    id: `recruit-${heroId}`,
    heroId,
    trialId: `trial-${heroId}`,
    findText: `${titleCase(heroId)} has been sighted near an echo scar.`,
    trialText: `Complete ${titleCase(heroId)}'s trial, then challenge the binding echo.`,
    bindText: `Defeat ${titleCase(heroId)} in a binding duel to recruit them.`,
    findShardsNeeded: TUNING.findShardsNeeded
  };
}

export const QUEST_HERO_IDS = Object.keys(HERO_REGION);
export const ALL_TRIALS: TrialDef[] = QUEST_HERO_IDS.map(trial);
export const ALL_QUESTS: RecruitmentQuestDef[] = QUEST_HERO_IDS.map(quest);
