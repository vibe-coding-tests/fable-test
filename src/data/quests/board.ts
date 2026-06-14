import type { QuestDef } from '../../core/types';

// ------------------------------------------------------------------
// Quest content (QUEST.md §5). All authored, original, in the game's
// voice. Two flavors: recurring bounties (repeatable, low rewards)
// and event chapters (one-time, chained, special rewards).
// ------------------------------------------------------------------

const BOUNTIES: QuestDef[] = [
  {
    id: 'bounty-cull-wilds',
    kind: 'recurring',
    name: 'Cull the Wilds',
    giver: 'Binder\u2019s Board',
    summary: 'The shards bleed monsters into the wilds faster than they fade. Thin them.',
    objectives: [{ kind: 'kill-creeps', count: 12, text: 'Defeat wild creeps' }],
    rewards: [
      { kind: 'gold', amount: 400 },
      { kind: 'xp', amount: 320, scope: 'active' }
    ],
    repeatable: true,
    dialogue: ['The board never empties. Neither will the wilds.']
  },
  {
    id: 'bounty-binders-due',
    kind: 'recurring',
    name: 'The Binder\u2019s Due',
    giver: 'Binder\u2019s Board',
    summary: 'A binder proves their hand by what they hold, not what they kill. Bring back two bound beasts.',
    objectives: [{ kind: 'capture-creeps', count: 2, text: 'Capture creeps' }],
    rewards: [
      { kind: 'gold', amount: 350 },
      { kind: 'loot-mark', band: 'early', amount: 1 }
    ],
    repeatable: true,
    dialogue: ['Hold a thing instead of breaking it. Harder. Worth more.']
  },
  {
    id: 'bounty-echo-hunt',
    kind: 'recurring',
    name: 'Echo Hunt',
    giver: 'Binder\u2019s Board',
    summary: 'Old champions keep reforming out of the broken Moon. Put a few of them back down.',
    objectives: [{ kind: 'kill-echoes', count: 3, text: 'Defeat hero echoes' }],
    rewards: [
      { kind: 'gold', amount: 600 },
      { kind: 'xp', amount: 520, scope: 'party' }
    ],
    repeatable: true,
    dialogue: ['A memory that fights back is still a memory. Quiet it.']
  },
  {
    id: 'bounty-pit-contract',
    kind: 'recurring',
    name: 'Pit Contract',
    giver: 'Binder\u2019s Board',
    summary: 'A standing contract on the region\u2019s anchored boss. Renews when the dust settles.',
    objectives: [{ kind: 'clear-boss', count: 1, text: 'Clear any regional boss' }],
    rewards: [
      { kind: 'gold', amount: 900 },
      { kind: 'loot-mark', band: 'mid', amount: 1 }
    ],
    prereq: { badges: 1 },
    cooldownSec: 6 * 60 * 60,
    repeatable: true,
    dialogue: ['Big game pays big. Come back when it has caught its breath.']
  }
];

const CHAPTERS: QuestDef[] = [
  {
    id: 'chapter-first-light',
    kind: 'event',
    name: 'First Light',
    giver: 'Mending the Moon',
    regionId: 'tranquil-vale',
    summary: 'No binder mends the Moon alone. Draw your first champion out of a shard.',
    objectives: [{ kind: 'recruit-heroes', count: 1, text: 'Recruit a hero' }],
    rewards: [
      { kind: 'gold', amount: 500 },
      { kind: 'xp', amount: 400, scope: 'active' },
      { kind: 'item', itemId: 'magic-wand' }
    ],
    next: 'chapter-vale-warden',
    dialogue: ['One memory carried forward. The first of many.']
  },
  {
    id: 'chapter-vale-warden',
    kind: 'event',
    name: 'Warden of the Vale',
    giver: 'Mending the Moon',
    summary: 'A badge is a region naming you its own. Earn the first one.',
    objectives: [{ kind: 'earn-badge', count: 1, text: 'Earn a gym badge' }],
    rewards: [
      { kind: 'item', itemId: 'broadsword' },
      { kind: 'loot-mark', band: 'early', amount: 1 },
      { kind: 'essence', amount: 40 }
    ],
    prereq: { quests: ['chapter-first-light'] },
    next: 'chapter-deeper-loop',
    dialogue: ['The land remembers who held it. Now it remembers you.']
  },
  {
    id: 'chapter-deeper-loop',
    kind: 'event',
    name: 'Into the Deeper Loop',
    giver: 'Mending the Moon',
    summary: 'The descent steepens. Walk a dungeon to its guardian and put down a boss to prove you can hold the depth.',
    objectives: [
      { kind: 'clear-dungeon', count: 1, text: 'Clear a dungeon' },
      { kind: 'clear-boss', count: 1, text: 'Clear a boss' }
    ],
    rewards: [
      { kind: 'item', itemId: 'ultimate-orb' },
      { kind: 'essence', amount: 80 }
    ],
    prereq: { badges: 3, quests: ['chapter-vale-warden'] },
    next: 'chapter-lost-echo',
    dialogue: ['Each turn of the Loop runs deeper than the last. Keep your feet.']
  },
  {
    id: 'chapter-lost-echo',
    kind: 'event',
    name: 'A Lost Echo',
    giver: 'Mending the Moon',
    summary: 'One memory has been waiting for a binder steady enough to carry it. Quiet five echoes and a boss, and it will answer.',
    objectives: [
      { kind: 'kill-echoes', count: 5, text: 'Defeat hero echoes' },
      { kind: 'clear-boss', count: 1, text: 'Clear a boss' }
    ],
    rewards: [{ kind: 'recruit', heroId: 'marci' }],
    prereq: { badges: 5, quests: ['chapter-deeper-loop'] },
    next: 'chapter-mad-moon',
    dialogue: ['Some echoes do not fight you. They wait to be carried. This one chose you.']
  },
  {
    id: 'chapter-mad-moon',
    kind: 'event',
    name: 'The Mad Moon\u2019s Answer',
    giver: 'Mending the Moon',
    summary: 'The deepest shards remember a war no one survived. Clear a raid and the Moon will answer in kind.',
    objectives: [{ kind: 'clear-raid', count: 1, text: 'Clear a raid' }],
    rewards: [
      { kind: 'title', id: 'moonmender', name: 'Moonmender', note: 'Answered the Mad Moon and lived to gather its pieces.' },
      { kind: 'gold', amount: 4000 },
      { kind: 'item', itemId: 'sacred-relic' }
    ],
    // The doc's spine: ready once you are deep enough — either eight badges in
    // hand or a single raid already broken — and after the Lost Echo chapter.
    prereq: { quests: ['chapter-lost-echo'], anyOf: [{ badges: 8 }, { raidClears: 1 }] },
    dialogue: ['You went where the war still rings, and you came back holding a piece of it.']
  }
];

// A side chapter that exercises region travel: it gates behind the opening
// chapter but branches off the main spine (no `next`), and homes on the Vale's
// board so the journal can show where it was posted.
const SIDE_CHAPTERS: QuestDef[] = [
  {
    id: 'chapter-wider-loop',
    kind: 'event',
    name: 'The Wider Loop',
    giver: 'Mending the Moon',
    regionId: 'tranquil-vale',
    summary: 'The Vale is only the first turn of a far longer Loop. Cross the north pass into Nightsilver Woods and see how far the break has spread.',
    objectives: [{ kind: 'reach-region', count: 1, text: 'Reach Nightsilver Woods', targetId: 'nightsilver-woods' }],
    rewards: [
      { kind: 'gold', amount: 350 },
      { kind: 'loot-mark', band: 'early', amount: 1 }
    ],
    prereq: { quests: ['chapter-first-light'] },
    dialogue: ['One vale mended. A dozen more turns of the Loop wait past the ridge.']
  }
];

export const ALL_QUEST_DEFS: QuestDef[] = [...BOUNTIES, ...CHAPTERS, ...SIDE_CHAPTERS];
