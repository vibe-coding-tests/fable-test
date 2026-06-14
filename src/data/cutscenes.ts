import type { CutsceneBeat, CutsceneDef, RegionDef, ShotAngle, ShotMove, StageAction } from '../core/types';
import { compileCutsceneDsl } from '../engine/cutscene-dsl';
import { ALL_GYMS } from './gyms';
import { ALL_RAIDS } from './raids';
import { ELITE_DRAFT } from './drafts';
import { TRANQUIL_VALE } from './regions/tranquil-vale';
import { NIGHTSILVER_WOODS } from './regions/nightsilver-woods';
import { ICEWRACK } from './regions/icewrack';
import { PHASE3_REGIONS } from './regions/phase3';

const REGIONS: RegionDef[] = [TRANQUIL_VALE, NIGHTSILVER_WOODS, ICEWRACK, ...PHASE3_REGIONS];
export const OUTWORLD_CLAIMANT_RAID_IDS = [
  'renegade-marshal',
  'void-prelate',
  'queen-of-blades',
  'lord-of-terror',
  'sundered-betrayer',
  'prime-evil',
  'lord-of-hatred',
  'forsaken-queen'
];
const BESPOKE_PHASE_RAID_IDS = new Set(['void-prelate', 'last-eldwurm']);

const ACT_BREAKS: Record<string, { title: string; line: string; history: string; palette: string; mood: string }> = {
  'lunar-badge': {
    title: 'Act I - Echoes In The Shards',
    line: 'An Echo is not a ghost. It is a remembered champion, resolved long enough to ride with you.',
    history: 'Flashback: a defeated Echo stills instead of dying, proof that binding resolves a memory from an older turn of the Loop.',
    palette: 'moonlit blue',
    mood: 'revelation'
  },
  'arcane-badge': {
    title: 'Act VI - The Scholars Name It',
    line: 'Quoidge gives the war its real name: Ancient falls, time resets, and Avaryn already chose to rule the cycle.',
    history: 'Flashback: chalk circles, crater maps, and repeated Ancient-fall marks line up into the scholars\' first complete diagram of the Loop.',
    palette: 'arcane violet',
    mood: 'truth named'
  },
  'titan-badge': {
    title: 'Act VIII - The First Division',
    line: 'The Titan Badge is permission to approach the crater, and a warning: not every broken thing wants to be made whole.',
    history: 'Flashback: bronze cliffs hold the first division of forces, warning that some fractures are prisons and some are protections.',
    palette: 'titan bronze',
    mood: 'permission'
  }
};

const RAID_GRADES: Record<string, { palette: string; mood: string; reveal: string; vfx: string }> = {
  'renegade-marshal': { palette: 'gunmetal voidlight', mood: 'dusty swagger', reveal: 'The rifle finds you before the Marshal steps out of the wreck.', vfx: '#8fb7ff' },
  'void-prelate': { palette: 'dark between stars', mood: 'chosen blade', reveal: 'The blade appears only after it has already chosen the angle.', vfx: '#7c6bff' },
  'queen-of-blades': { palette: 'fallen-star purple', mood: 'swarm closing', reveal: 'The crater tightens like a web around the first footstep.', vfx: '#d882ff' },
  'lord-of-terror': { palette: 'hell-rift red', mood: 'abyss rising', reveal: 'The rift opens upward, as if the floor has learned to look back.', vfx: '#ff4c2f' },
  'sundered-betrayer': { palette: 'fel eclipse green', mood: 'betrayer unbound', reveal: 'The scar opens like a second shadow, and a horned silhouette chooses the side you fear most.', vfx: '#7dff72' },
  'prime-evil': { palette: 'worldstone ember', mood: 'destruction crowned', reveal: 'The vault burns around the stone at the world\'s heart.', vfx: '#ff7a2c' },
  'lord-of-hatred': { palette: 'lightless black', mood: 'name withheld', reveal: 'The hall goes dark before the voice admits it has arrived.', vfx: '#d62f44' },
  'forsaken-queen': { palette: 'banshee frost', mood: 'mercy gone', reveal: 'A cold arrow hangs in the air without thawing.', vfx: '#9ed8ff' },
  'last-eldwurm': { palette: 'dragonfire under moon', mood: 'home-world refusal', reveal: 'One wing, old burns, and a dragon that belongs to this falling moon.', vfx: '#ff7a2c' },
  'lich-king': { palette: 'frost crown', mood: 'summit throne', reveal: 'The summit reveals a throne made from everyone who climbed first.', vfx: '#d8f4ff' },
  'roshan-pit': { palette: 'pit gold', mood: 'immortal bargain', reveal: 'The Pit is empty only until Roshan decides otherwise.', vfx: '#ffd86a' }
};

const ARRIVAL_DIRECTING: Record<string, { opener: string; reveal: string; palette: string; mood: string; vfx: string }> = {
  'tranquil-vale': {
    opener: 'Golden grass bends around a half-buried shard before the first road appears.',
    reveal: 'Dawnshade waits beyond the Radiant shelf, quiet enough to hear the Moon-stone hum.',
    palette: 'warm Radiant gold',
    mood: 'first memory',
    vfx: '#ffd86a'
  },
  'nightsilver-woods': {
    opener: 'Moonlight catches in leaves that refuse to cast ordinary shadows.',
    reveal: 'The cult paths open under Selemene, but the broken Mad Moon answers from below.',
    palette: 'silver moonblue',
    mood: 'omen read',
    vfx: '#9ed8ff'
  },
  icewrack: {
    opener: 'A bell-note crosses the glacier before any enemy shows itself.',
    reveal: 'The Blueheart cliffs answer with tighter rings, proof that the Loop is accelerating.',
    palette: 'cryo white-blue',
    mood: 'tightening',
    vfx: '#d8f4ff'
  },
  'devarshi-desert': {
    opener: 'Star-metal glints under dunes shaped like a kingdom already buried once.',
    reveal: 'The Burrow road rises from sand that remembers losing this war before.',
    palette: 'sepia star-gold',
    mood: 'old ruin',
    vfx: '#f4c06a'
  },
  shadeshore: {
    opener: 'Black surf drags wreck-bells across the reef line.',
    reveal: 'Every captain and leviathan feud here is an old fight wearing new bodies.',
    palette: 'drowned teal',
    mood: 'salt feud',
    vfx: '#7fd0d8'
  },
  'vile-reaches': {
    opener: 'Rot engines vent into a sky thin enough for outsiders to hear.',
    reveal: 'The fifth road smells like bone-fire and the first real tear in the seal.',
    palette: 'rot red-green',
    mood: 'seal thinning',
    vfx: '#9ad66a'
  },
  quoidge: {
    opener: 'Towers dispute in violet light while scholars chalk circles around fallen stones.',
    reveal: 'Quoidge names the truth: Ancient falls, time resets, and Avaryn already chose.',
    palette: 'arcane violet',
    mood: 'truth named',
    vfx: '#b88cff'
  },
  'hidden-wood': {
    opener: 'The canopy closes over a world older than banners.',
    reveal: 'Neutral camps stir like witnesses from before heroes learned to call the war theirs.',
    palette: 'old green',
    mood: 'pre-war wild',
    vfx: '#88d878'
  },
  'mount-joerlak': {
    opener: 'Horn-calls climb the highland before the cliffs answer in bronze.',
    reveal: 'The Fundamentals still ask whether every broken thing deserves to be made whole.',
    palette: 'titan bronze',
    mood: 'first forces',
    vfx: '#caa36a'
  },
  'mad-moon-crater': {
    opener: 'The crater opens without horizon: Roshan below, Tower above, shards everywhere.',
    reveal: 'Every road has led to the place where the Loop waits for an answer.',
    palette: 'crater cold ember',
    mood: 'final question',
    vfx: '#d8f4ff'
  }
};

const RAID_PHASE_DIRECTING: Record<string, { title: string; line: string; palette: string; mood: string; vfx: string }> = {
  'roshan-pit': { title: 'The Pit Closes', line: 'Roshan plants one hand in the stone. The bargain is no longer patient.', palette: 'pit gold', mood: 'immortal anger', vfx: '#ffd86a' },
  'lord-of-terror': { title: 'The Rift Looks Back', line: 'The abyss stops waiting below the floor and starts climbing through it.', palette: 'hell-rift red', mood: 'terror rising', vfx: '#ff4c2f' },
  'lich-king': { title: 'The Summit Freezes Shut', line: 'Every frozen name on the glacier turns its face toward the fight.', palette: 'frost crown', mood: 'dead summit', vfx: '#d8f4ff' },
  'queen-of-blades': { title: 'The Web Wakes', line: 'The crater-web tightens, and every child in it learns your pulse.', palette: 'fallen-star purple', mood: 'swarm closing', vfx: '#d882ff' },
  'renegade-marshal': { title: 'The Marshal Reloads', line: 'The wreck behind him answers like a firing line.', palette: 'gunmetal voidlight', mood: 'last shot loaded', vfx: '#8fb7ff' },
  'forsaken-queen': { title: 'Mercy Stays Dead', line: 'The arrow in the air does not thaw. Neither does the Queen.', palette: 'banshee frost', mood: 'mercy gone', vfx: '#9ed8ff' },
  'sundered-betrayer': { title: 'The Eclipse Answers', line: 'The fel eclipse turns, and the shadow you cast chooses his side.', palette: 'fel eclipse green', mood: 'mirror threat', vfx: '#7dff72' },
  'prime-evil': { title: 'The Worldstone Burns', line: 'The stone at the world heart flares as if it knows his hand.', palette: 'worldstone ember', mood: 'destruction crowned', vfx: '#ff7a2c' },
  'lord-of-hatred': { title: 'The Hall Goes Lightless', line: 'Hatred takes the light first, then asks for the rest of you.', palette: 'lightless black', mood: 'name spoken', vfx: '#d62f44' }
};

const RAID_CLEAR_DIRECTING: Record<string, { speaker: string; line: string; palette: string; vfx: string }> = {
  'renegade-marshal': { speaker: 'The Renegade Marshal', line: 'The fleet is quiet at last. Even the rifle lowers.', palette: 'gunmetal dawn', vfx: '#8fb7ff' },
  'void-prelate': { speaker: 'The Void Prelate', line: 'The blade leaves no angle behind. For once, the dark misses.', palette: 'severed violet', vfx: '#7c6bff' },
  'queen-of-blades': { speaker: 'The Queen of Blades', line: 'The web opens. The children scatter back into the falling-star dust.', palette: 'fallen-star dusk', vfx: '#d882ff' },
  'lord-of-terror': { speaker: 'The Lord of Terror', line: 'The rift shuts around his name, and the room remembers how to breathe.', palette: 'rift ember', vfx: '#ff4c2f' },
  'sundered-betrayer': { speaker: 'The Sundered Betrayer', line: 'The eclipse cracks. The mirror-side of the war loses its claim.', palette: 'fel eclipse ash', vfx: '#7dff72' },
  'prime-evil': { speaker: 'The Lord of Destruction', line: 'The Worldstone keeps its heart. Destruction leaves empty-handed.', palette: 'worldstone quiet', vfx: '#ff7a2c' },
  'lord-of-hatred': { speaker: 'The Lord of Hatred', line: 'The hall takes back its light one breath at a time.', palette: 'light returning', vfx: '#d62f44' },
  'forsaken-queen': { speaker: 'The Forsaken Queen', line: 'The last arrow falls cold and harmless into the snow.', palette: 'banshee thaw', vfx: '#9ed8ff' },
  'last-eldwurm': { speaker: 'The Last Eldwurm', line: 'The ember folds low. The home-world answer has been heard.', palette: 'dragonfire dusk', vfx: '#ff7a2c' }
};

const PROLOGUE: CutsceneDef = compileCutsceneDsl(`
  BEAT {
    SHOT: bird-eye/hold/cold moonlight/held breath
    STAGE: {DescribeEnvironment(location="The Mad Moon hangs whole over the Radiant shelf.", target="tower")}
    HOLD: 2.2
  }
  BEAT {
    SHOT: close/snap/white fracture/sundering
    STAGE: {RevealMystery(mystery="A single crack becomes a sky of falling shards.", target="tower", vfx="dome", color="#d8f4ff")}
    LINE: Narration : "They sealed the war inside the Moon. The war broke the Moon."
    HOLD: 3.2
  }
  BEAT {
    SHOT: high/pull-back/shard rain blue/world wounded
    STAGE: {EstablishHistory(text="Shard-rain crosses every road the player will walk.", vfx="storm", color="#9db8ff")}
    LINE: Narration : "The falling stones ring like bells, each one carrying a war that has already happened."
    HOLD: 3.4
  }
  BEAT {
    SHOT: low/push-in/dawn gold/awakening
    STAGE: {AdvancePlot(text="At your feet, one shard remembers.", target="player", vfx="channel", color="#ffd86a")}
    LINE: Narration : "Every shard still remembers it."
    HOLD: 2.8
    SOUND: capture
  }
`, {
  id: 'prologue-moon-breaks',
  title: 'The Moon Breaks',
  tier: 'setpiece',
  trigger: { kind: 'new-game' },
  category: 'Prologue',
  replayable: true,
  music: 'silence',
  galleryCaption: 'Director note: opens on the intact Mad Moon, withholds the break until the crack, then turns the shard-rain into the sound motif that follows the player across the map.'
});

const BIND_FIRST: CutsceneDef = compileCutsceneDsl(`
  BEAT {
    SHOT: over-the-shoulder/rack-focus/shard white/uncertain
    STAGE: {DevelopCharacter(text="The defeated Echo does not fall. It flickers between hero and shard-light.", target="ally", gesture="channel-loop")}
    LINE: {hero} : "{bark}"
    HOLD: 3
  }
  BEAT {
    SHOT: close/push-in/shard white/the bind
    STAGE: {AdvancePlot(text="The shard-light reaches into the binder instead of consuming them.", target="player", vfx="channel", color="#d8f4ff")}
    LINE: Narration : "It does not die. It remembers you now. The first war you will carry."
    HOLD: 3.6
    SOUND: capture
  }
  BEAT {
    SHOT: wide/pull-back/two-shot gold/ally gained
    STAGE: {DevelopCharacter(text="The Echo settles behind the player as a companion, not a captive.", target="ally", gesture="toggle-stance", vfx="global-mark", color="#ffd86a")}
    LINE: Narration : "You do not recruit heroes. You recover the Moon, one remembered champion at a time."
    HOLD: 3.4
  }
`, {
  id: 'bind-first',
  title: 'What You Are',
  tier: 'setpiece',
  trigger: { kind: 'bind', first: true },
  category: 'Binds',
  replayable: true,
  galleryCaption: 'Director note: treats the first recruit as a reveal of the binder role, not a victory pose; the Echo stills, reaches, and joins as carried memory.'
});
BIND_FIRST.beats[0].line = { ...BIND_FIRST.beats[0].line!, portraitHeroId: '{heroId}' };

const BIND_STINGER: CutsceneDef = {
  id: 'bind-stinger',
  title: '{hero} Joins',
  tier: 'stinger',
  trigger: { kind: 'bind' },
  skippable: true,
  letterbox: false,
  category: 'Binds',
  replayable: false,
  beats: [
    {
      shot: { angle: 'close', move: 'push-in', palette: 'attribute flare', mood: 'claimed' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#ffd86a' }],
      line: { speaker: '{hero}', text: '{bark}', portraitHeroId: '{heroId}' },
      sound: 'capture',
      hold: 2.4
    }
  ]
};

function arrival(region: RegionDef): CutsceneDef {
  const directing = ARRIVAL_DIRECTING[region.id] ?? {
    opener: region.lore.split('.')[0] + '.',
    reveal: region.lore,
    palette: `${region.biome} grade`,
    mood: 'establishing',
    vfx: '#ffd86a'
  };
  const setpiece = region.id === 'mad-moon-crater';
  return {
    id: region.arrivalBeat ?? `arrival-${region.id}`,
    title: region.name,
    tier: setpiece ? 'setpiece' : 'stinger',
    trigger: { kind: 'region-arrival', regionId: region.id },
    skippable: true,
    letterbox: setpiece,
    category: 'Regions',
    replayable: true,
    beats: [
      {
        shot: { angle: setpiece ? 'wide' : 'high', move: setpiece ? 'crane' : 'pull-back', palette: directing.palette, mood: directing.mood },
        stage: [
          { kind: 'describe-environment', text: directing.opener },
          { kind: 'vfx', archetype: setpiece ? 'dome' : 'global-mark', color: directing.vfx }
        ],
        line: { speaker: region.name, text: directing.opener },
        hold: setpiece ? 3.8 : 2.6
      },
      {
        shot: { angle: setpiece ? 'low' : 'wide', move: 'push-in', palette: directing.palette, mood: 'act beat' },
        stage: [
          { kind: 'focus', target: region.id === 'mad-moon-crater' ? 'tower' : 'region' },
          { kind: 'reveal-mystery', text: directing.reveal, target: region.id === 'mad-moon-crater' ? 'tower' : 'region' }
        ],
        line: { speaker: region.name, text: region.lore },
        hold: setpiece ? 4.6 : 3.2
      }
    ]
  };
}

function badge(gym: (typeof ALL_GYMS)[number]): CutsceneDef {
  const setpiece = ['lunar-badge', 'arcane-badge', 'titan-badge'].includes(gym.badgeId);
  const act = ACT_BREAKS[gym.badgeId];
  const actBeats: CutsceneBeat[] = act ? [
    {
      shot: { angle: 'high', move: 'pull-back', palette: `desaturated ${act.palette}`, mood: `${act.mood} flashback` },
      stage: [
        { kind: 'title', text: act.title },
        { kind: 'establish-history', text: act.history },
        { kind: 'vfx', archetype: 'dome', color: '#d8f4ff' }
      ],
      line: { speaker: 'The Loop', text: act.line },
      sound: 'levelup',
      hold: 4.2
    },
    {
      shot: { angle: 'wide', move: 'push-in', palette: 'road opening', mood: 'deeper path' },
      stage: [
        { kind: 'focus', target: 'region' },
        { kind: 'explore-theme', text: 'The gate opens only after the flashback names what the badge changed.' }
      ],
      line: { speaker: 'Journal', text: 'The road opens, and the war underneath it sounds closer.' },
      hold: 2.8
    }
  ] : [];
  return {
    id: `badge-${gym.badgeId}`,
    title: gym.badgeId.replace(/-/g, ' '),
    tier: setpiece ? 'setpiece' : 'stinger',
    trigger: { kind: 'badge', badgeId: gym.badgeId },
    skippable: true,
    letterbox: setpiece,
    category: 'Regions',
    replayable: true,
    galleryCaption: act
      ? `Director note: badge fanfare breaks into a desaturated Loop flashback before returning to the opened road: ${act.history}`
      : undefined,
    beats: [
      {
        shot: { angle: 'title-card', move: 'hold', palette: 'badge gold', mood: 'earned' },
        stage: [{ kind: 'title', text: '{badge}' }],
        line: { speaker: gym.leader, text: gym.dialogue[0] ?? gym.theme },
        sound: 'badge',
        hold: setpiece ? 4.2 : 2.8
      },
      ...actBeats
    ]
  };
}

function dslQuote(s: string): string {
  return s.replace(/"/g, "'");
}

function resolveCutsceneRef(ref: string): string {
  const dialogue = ref.match(/^([a-z0-9-]+)\.dialogue\[(\d+)\]$/i);
  if (dialogue) {
    const raid = ALL_RAIDS.find((r) => r.id === dialogue[1]);
    if (raid) return raid.dialogue[Number(dialogue[2])] ?? '';
  }
  throw new Error(`cutscene ref not found: ${ref}`);
}

// STORY §6.7/§6.13: every claimant gets a bespoke intro built on the same three
// dramatic beats (withhold -> reveal -> claim) but with its own silhouette read,
// world register, signature staging, and palette. The boss is never focused in
// the opener; the silhouette resolves before the name, then the two shipped raid
// lines land the reveal and the claim. RAID_INTRO_SPECS replaces the old shared
// template; genericRaidIntro() stays only as a safety net for unlisted raids.
interface RaidIntroBeatSpec {
  angle: ShotAngle;
  move: ShotMove;
  palette: string;
  mood: string;
  stage: StageAction[];
}
interface RaidIntroSpec {
  caption: string;
  open: RaidIntroBeatSpec & { speaker: string; line: string };
  reveal: RaidIntroBeatSpec;
  claim: RaidIntroBeatSpec;
}

const RAID_INTRO_SPECS: Record<string, RaidIntroSpec> = {
  'roshan-pit': {
    caption: 'Director note: Dota-native register — pit gold and an empty arena that lies. Hold on the bare stone, let the Aegis-glint promise a bargain, then let Roshan rise into frame so the silhouette reads before the name.',
    open: {
      angle: 'high', move: 'hold', palette: 'pit gold', mood: 'baited quiet', speaker: "Roshan's Pit",
      line: 'The Pit is empty. Empty is the only lie it ever needs to tell.',
      stage: [{ kind: 'describe-environment', text: 'A single shard of Aegis-light hangs over bare stone, promising a bargain.' }]
    },
    reveal: {
      angle: 'low', move: 'crane', palette: 'pit gold', mood: 'immortal rising',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'The stone itself stands up and remembers being a guardian.', gesture: 'ground-slam' }]
    },
    claim: {
      angle: 'low', move: 'push-in', palette: 'pit gold', mood: 'bargain pressed',
      stage: [{ kind: 'introduce-conflict', text: 'The Pit That Never Stays Empty', target: 'boss' }, { kind: 'vfx', archetype: 'ground-aoe', color: '#ffd86a' }]
    }
  },
  'lord-of-terror': {
    caption: 'Director note: Diablo register — lightless black kept honest by one rift-ember. The horror rises from the floor instead of walking in; the rift looks back before the Lord does.',
    open: {
      angle: 'high', move: 'hold', palette: 'hell-rift red', mood: 'one ember lit', speaker: 'Hell-rift',
      line: 'The floor keeps one ember burning, like an eye that never learned to close.',
      stage: [{ kind: 'describe-environment', text: 'A seam of rift-light splits the stone, breathing heat upward.' }]
    },
    reveal: {
      angle: 'low', move: 'crane', palette: 'hell-rift red', mood: 'abyss ascending',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'The abyss climbs out of its own rift, wearing a crown of fear.', gesture: 'toggle-stance' }, { kind: 'vfx', archetype: 'beam', color: '#ff4c2f' }]
    },
    claim: {
      angle: 'low', move: 'push-in', palette: 'hell-rift red', mood: 'terror crowned',
      stage: [{ kind: 'introduce-conflict', text: 'Warden of the Hell-Rift', target: 'boss' }, { kind: 'vfx', archetype: 'ground-aoe', color: '#ff4c2f' }]
    }
  },
  'lich-king': {
    caption: 'Director note: Warcraft register — cryo white-blue and a backlit throne. Climb the glacier past everyone who tried, hold the king as a silhouette against the cold light, then let the summit freeze shut.',
    open: {
      angle: 'wide', move: 'crane', palette: 'frost crown', mood: 'frozen ascent', speaker: 'Frozen Summit',
      line: 'Every climber who tried is still here, frozen one step short of the throne.',
      stage: [{ kind: 'establish-history', text: 'Statues of the fallen line the glacier like a staircase of failures.' }]
    },
    reveal: {
      angle: 'low', move: 'crane', palette: 'frost crown', mood: 'throne backlit',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'A crowned silhouette sits where the climb ends, patient as winter.', gesture: 'toggle-stance' }]
    },
    claim: {
      angle: 'high', move: 'push-in', palette: 'frost crown', mood: 'summit sealing',
      stage: [{ kind: 'introduce-conflict', text: 'Sovereign of the Frozen Summit', target: 'boss' }, { kind: 'vfx', archetype: 'storm', color: '#d8f4ff' }]
    }
  },
  'queen-of-blades': {
    caption: 'Director note: StarCraft register — fallen-star purple and a crater strung like a web. The trap is the first beat; the swarm rises before the mother does, so the room feels closed before she speaks.',
    open: {
      angle: 'high', move: 'hold', palette: 'fallen-star purple', mood: 'web waiting', speaker: 'Fallen-star Crater',
      line: 'The crater is strung tight, and it has been waiting for a pulse to follow.',
      stage: [{ kind: 'describe-environment', text: 'Threads of fallen-star silk cross the crater like a net already set.' }]
    },
    reveal: {
      angle: 'wide', move: 'push-in', palette: 'fallen-star purple', mood: 'swarm closing',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'vfx', archetype: 'vortex', color: '#d882ff' }, { kind: 'develop-character', target: 'boss', text: 'The web tightens toward its mother, and the mother smiles.' }]
    },
    claim: {
      angle: 'low', move: 'push-in', palette: 'fallen-star purple', mood: 'brood rising',
      stage: [{ kind: 'introduce-conflict', text: 'Mother of the Fallen Star', target: 'boss' }, { kind: 'vfx', archetype: 'summon-pop', color: '#d882ff' }]
    }
  },
  'renegade-marshal': {
    caption: 'Director note: StarCraft register — gunmetal voidlight, lens-flare swagger. Open on a dead fleet and bootprints that did not run, rack from the rifle to the man, then let the wreck answer like a firing line.',
    open: {
      angle: 'wide', move: 'hold', palette: 'gunmetal voidlight', mood: 'dead fleet', speaker: 'Wreck of the Fallen Fleet',
      line: 'A whole fleet died here. One set of bootprints walked toward the wreck instead of away.',
      stage: [{ kind: 'describe-environment', text: 'Cold hulls drift in voidlight, ticking as they cool.' }]
    },
    reveal: {
      angle: 'through-objects', move: 'rack-focus', palette: 'gunmetal voidlight', mood: 'dusty swagger',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'Focus racks off the long rifle and finds the outlaw grinning behind it.', gesture: 'ranged-shot' }]
    },
    claim: {
      angle: 'low', move: 'push-in', palette: 'gunmetal voidlight', mood: 'last shot loaded',
      stage: [{ kind: 'introduce-conflict', text: 'Outlaw of the Fallen Fleet', target: 'boss' }, { kind: 'vfx', archetype: 'beam', color: '#8fb7ff' }]
    }
  },
  'void-prelate': {
    caption: 'Director note: StarCraft register — the dark between stars. The blade is the withheld reveal: you see the place it has already chosen before you see the Prelate, so the silhouette arrives a beat after the threat.',
    open: {
      angle: 'close', move: 'hold', palette: 'dark between stars', mood: 'angle chosen', speaker: 'The Severed Dark',
      line: 'You do not see the blade first. You see the place it has already decided to be.',
      stage: [{ kind: 'reveal-mystery', text: 'A seam of violet light hangs in empty air, angled at a throat that is not there yet.' }]
    },
    reveal: {
      angle: 'reflection', move: 'rack-focus', palette: 'dark between stars', mood: 'chosen blade',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'The Prelate resolves out of his own reflection, already mid-step.', gesture: 'dash' }]
    },
    claim: {
      angle: 'low', move: 'snap', palette: 'dark between stars', mood: 'no angle left',
      stage: [{ kind: 'introduce-conflict', text: 'Blade of the Severed Dark', target: 'boss' }, { kind: 'vfx', archetype: 'global-mark', color: '#7c6bff' }]
    }
  },
  'forsaken-queen': {
    caption: 'Director note: Warcraft register — banshee frost, mercy spent. Open on the arrow that will not thaw, hold it in dead air, then let the Queen step in colder than the shot she already fired.',
    open: {
      angle: 'close', move: 'hold', palette: 'banshee frost', mood: 'frozen mercy', speaker: 'Frostmourn Hollow',
      line: 'An arrow hangs in the cold, refusing to fall, refusing to thaw.',
      stage: [{ kind: 'reveal-mystery', text: 'The shaft is rimed white and motionless, as if the air agreed to hold it.' }]
    },
    reveal: {
      angle: 'low', move: 'crane', palette: 'banshee frost', mood: 'mercy gone',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'The Queen walks past her own shot without slowing, colder than the frost.', gesture: 'ranged-shot' }]
    },
    claim: {
      angle: 'wide', move: 'push-in', palette: 'banshee frost', mood: 'silence after',
      stage: [{ kind: 'introduce-conflict', text: 'Banshee of the Cold Arrow', target: 'boss' }, { kind: 'vfx', archetype: 'storm', color: '#9ed8ff' }]
    }
  },
  'sundered-betrayer': {
    caption: 'Director note: Warcraft register — fel-eclipse green and the mirror question. The eclipse shows two shapes where one should stand; the betrayer chooses the side of you that you fear, then brands the room.',
    open: {
      angle: 'reflection', move: 'hold', palette: 'fel eclipse green', mood: 'two shapes', speaker: 'Fel-Eclipse Scar',
      line: 'The eclipse shows two shapes where one shadow should fall. Both of them are looking at you.',
      stage: [{ kind: 'reveal-mystery', text: 'A green eclipse splits the scar-light into a self and its mirror.' }]
    },
    reveal: {
      angle: 'low', move: 'crane', palette: 'fel eclipse green', mood: 'betrayer unbound',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'Wings of fel-fire open as the betrayer takes the form the eclipse offered.', gesture: 'toggle-stance' }, { kind: 'vfx', archetype: 'storm', color: '#7dff72' }]
    },
    claim: {
      angle: 'close', move: 'push-in', palette: 'fel eclipse green', mood: 'brand struck',
      stage: [{ kind: 'introduce-conflict', text: 'Brand of the Fel Eclipse', target: 'boss' }, { kind: 'vfx', archetype: 'beam', color: '#7dff72' }]
    }
  },
  'prime-evil': {
    caption: 'Director note: Diablo register — worldstone ember. Open on the stone at the world heart already glowing for the wrong hand, crane the destroyer up over it, then let the Worldstone flare as if it knows him.',
    open: {
      angle: 'high', move: 'hold', palette: 'worldstone ember', mood: 'heart glowing', speaker: 'Worldstone Vault',
      line: 'The stone at the world heart is already glowing for a hand that is not yours.',
      stage: [{ kind: 'describe-environment', text: 'The Worldstone pulses in its vault, ember-light climbing the walls.' }]
    },
    reveal: {
      angle: 'low', move: 'crane', palette: 'worldstone ember', mood: 'destruction crowned',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'The last Prime Evil rises over the stone, reaching for what burns.', gesture: 'ground-slam' }]
    },
    claim: {
      angle: 'wide', move: 'push-in', palette: 'worldstone ember', mood: 'vault burning',
      stage: [{ kind: 'introduce-conflict', text: 'Last of the Prime Evils', target: 'boss' }, { kind: 'vfx', archetype: 'beam', color: '#ff7a2c' }]
    }
  },
  'lord-of-hatred': {
    caption: 'Director note: Diablo register — the screen-darken on his name. The hall puts itself out one lamp at a time as a staged beat; the voice arrives before the shape, and the shape is mostly absence.',
    open: {
      angle: 'wide', move: 'hold', palette: 'lightless black', mood: 'lamps dying', speaker: 'The Lightless Hall',
      line: 'The hall puts itself out one lamp at a time, as if hatred needs the dark to breathe.',
      stage: [{ kind: 'set-tone', text: 'Light withdraws across the hall until only the cold remains.' }, { kind: 'vfx', archetype: 'dome', color: '#101014' }]
    },
    reveal: {
      angle: 'close', move: 'snap', palette: 'lightless black', mood: 'name withheld',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'A shape that is mostly absence admits, at last, that it has arrived.' }]
    },
    claim: {
      angle: 'low', move: 'push-in', palette: 'lightless black', mood: 'name spoken',
      stage: [{ kind: 'introduce-conflict', text: 'Voice in the Lightless Hall', target: 'boss' }, { kind: 'vfx', archetype: 'beam', color: '#d62f44' }]
    }
  },
  'last-eldwurm': {
    caption: 'Director note: Dota-native counterpoint (the STORY §5.3 worked example) — dragonfire under a falling moon. Withhold on the wound, crane the silhouette up to the eye, then let the home-world refusal land the claim.',
    open: {
      angle: 'wide', move: 'hold', palette: 'dragonfire under moon', mood: 'wound shown', speaker: 'Ember Caldera',
      line: 'Embers rise through shard-dust. One wing. Old burns. Something that should already be dead.',
      stage: [{ kind: 'describe-environment', text: 'Heat-haze bends the moonlight over a caldera that still bleeds fire.' }]
    },
    reveal: {
      angle: 'low', move: 'crane', palette: 'dragonfire under moon', mood: 'home-world refusal',
      stage: [{ kind: 'focus', target: 'boss' }, { kind: 'develop-character', target: 'boss', text: 'The crane climbs the silhouette until a single old eye opens at the top.', gesture: 'toggle-stance' }]
    },
    claim: {
      angle: 'wide', move: 'push-in', palette: 'dragonfire under moon', mood: 'last of the line',
      stage: [{ kind: 'introduce-conflict', text: 'Ember Beneath the Mad Moon', target: 'boss' }, { kind: 'vfx', archetype: 'storm', color: '#ff7a2c' }]
    }
  }
};

function beatFromSpec(spec: RaidIntroBeatSpec, line: CutsceneBeat['line'], hold: number, sound?: CutsceneBeat['sound']): CutsceneBeat {
  return {
    shot: { angle: spec.angle, move: spec.move, palette: spec.palette, mood: spec.mood },
    stage: spec.stage,
    line,
    hold,
    ...(sound ? { sound } : {})
  };
}

function genericRaidIntro(raid: (typeof ALL_RAIDS)[number]): CutsceneDef {
  const grade = RAID_GRADES[raid.id] ?? { palette: 'raid shadow', mood: 'withheld', reveal: raid.location, vfx: '#ffd86a' };
  const def = compileCutsceneDsl(`
    BEAT {
      SHOT: wide/crane/${dslQuote(grade.palette)}/withheld
      STAGE: {DescribeEnvironment(location="${dslQuote(raid.location)}", target="region")}
      STAGE: {RevealMystery(mystery="${dslQuote(grade.reveal)}", target="region")}
      LINE: ${raid.location} : "${dslQuote(grade.reveal)}"
      HOLD: 2.6
    }
    BEAT {
      SHOT: through-objects/rack-focus/${dslQuote(grade.palette)}/${dslQuote(grade.mood)}
      STAGE: {DevelopCharacter(target="boss", text="${dslQuote(`${raid.name} steps through the wrong-world grade.`)}", gesture="toggle-stance")}
      LINE: ${raid.name} : "ref:${raid.id}.dialogue[0]"
      HOLD: 3.1
    }
    BEAT {
      SHOT: low/push-in/${dslQuote(grade.palette)}/claim named
      STAGE: {IntroduceConflict(conflict="${dslQuote(raid.title)}", target="boss")}
      STAGE: {RevealMystery(mystery="${dslQuote(raid.title)}", target="boss")}
      LINE: ${raid.name} : "ref:${raid.id}.dialogue[1]"
      HOLD: 3.2
      SOUND: raid-clear
    }
  `, {
    id: `raid-intro-${raid.id}`,
    title: raid.name,
    tier: 'setpiece',
    trigger: { kind: 'raid-intro', raidId: raid.id },
    category: 'Raids',
    replayable: true,
    resolveRef: resolveCutsceneRef
  });
  return {
    ...def,
    letterbox: true,
    music: 'duck',
    beats: def.beats.map((beat, idx) => idx === 2
      ? { ...beat, stage: [...(beat.stage ?? []), { kind: 'vfx', archetype: 'global-mark', color: grade.vfx }] }
      : beat)
  };
}

function raidIntro(raid: (typeof ALL_RAIDS)[number]): CutsceneDef {
  const spec = RAID_INTRO_SPECS[raid.id];
  if (!spec) return genericRaidIntro(raid);
  return {
    id: `raid-intro-${raid.id}`,
    title: raid.name,
    tier: 'setpiece',
    trigger: { kind: 'raid-intro', raidId: raid.id },
    skippable: true,
    letterbox: true,
    music: 'duck',
    category: 'Raids',
    replayable: true,
    galleryCaption: spec.caption,
    beats: [
      beatFromSpec(spec.open, { speaker: spec.open.speaker, text: spec.open.line }, 2.8),
      beatFromSpec(spec.reveal, { speaker: raid.name, text: raid.dialogue[0] }, 3.2),
      beatFromSpec(spec.claim, { speaker: raid.name, text: raid.dialogue[1] }, 3.3, 'raid-clear')
    ]
  };
}

function raidPhase(raid: (typeof ALL_RAIDS)[number]): CutsceneDef {
  const grade = RAID_GRADES[raid.id] ?? { palette: 'raid shadow', mood: 'withheld', reveal: raid.location, vfx: '#ffd86a' };
  const directing = RAID_PHASE_DIRECTING[raid.id] ?? {
    title: `${raid.name} Breaks`,
    line: raid.dialogue[1] ?? 'The fight crosses a line, and the boss commits.',
    palette: grade.palette,
    mood: grade.mood,
    vfx: grade.vfx
  };
  return {
    id: `raid-phase-${raid.id}`,
    title: directing.title,
    tier: 'stinger',
    trigger: { kind: 'boss-phase', bossHeroId: raid.boss.heroId },
    skippable: true,
    letterbox: false,
    category: 'Bosses',
    replayable: false,
    beats: [
      {
        shot: { angle: 'low', move: 'push-in', palette: directing.palette, mood: directing.mood },
        stage: [
          { kind: 'gesture', target: 'boss', gesture: 'ground-slam' },
          { kind: 'vfx', archetype: 'global-mark', color: directing.vfx }
        ],
        line: { speaker: raid.name, text: directing.line },
        sound: 'levelup',
        hold: 2.1
      }
    ]
  };
}

function raidClear(raid: (typeof ALL_RAIDS)[number]): CutsceneDef {
  const grade = RAID_GRADES[raid.id] ?? { palette: 'loot gold', mood: 'claimed', reveal: raid.location, vfx: '#ffd86a' };
  const directing = RAID_CLEAR_DIRECTING[raid.id] ?? {
    speaker: raid.name,
    line: `${raid.name} falls. The floor answers with proof.`,
    palette: grade.palette,
    vfx: grade.vfx
  };
  return {
    id: `raid-clear-${raid.id}`,
    title: `${raid.name} Falls`,
    tier: 'stinger',
    trigger: { kind: 'raid-clear', raidId: raid.id },
    skippable: true,
    letterbox: false,
    category: 'Raids',
    replayable: false,
    beats: [
      {
        shot: { angle: 'wide', move: 'pull-back', palette: directing.palette, mood: 'claim broken' },
        stage: [
          { kind: 'focus', target: 'boss' },
          { kind: 'vfx', archetype: 'ground-aoe', color: directing.vfx }
        ],
        line: { speaker: directing.speaker, text: directing.line },
        sound: 'raid-clear',
        hold: 2.8
      }
    ]
  };
}

const RAID_CLEAR: CutsceneDef = {
  id: 'raid-clear-stinger',
  title: '{raid} Falls',
  tier: 'stinger',
  trigger: { kind: 'raid-clear' },
  skippable: true,
  letterbox: false,
  category: 'Raids',
  replayable: false,
  beats: [
    {
      shot: { angle: 'wide', move: 'pull-back', palette: 'loot gold', mood: 'claimed' },
      stage: [{ kind: 'vfx', archetype: 'ground-aoe', color: '#ffd86a' }],
      line: { speaker: 'Spoils', text: '{raid} falls. The floor answers with proof.' },
      sound: 'raid-clear',
      hold: 2.4
    }
  ]
};

const BOSS_CLEAR: CutsceneDef = {
  id: 'boss-clear-stinger',
  title: '{boss} Defeated',
  tier: 'stinger',
  trigger: { kind: 'boss-clear' },
  skippable: true,
  letterbox: false,
  category: 'Bosses',
  replayable: false,
  beats: [
    {
      shot: { angle: 'low', move: 'pull-back', palette: 'victory gold', mood: 'released' },
      stage: [{ kind: 'focus', target: 'boss' }],
      line: { speaker: '{boss}', text: '{bossLine}' },
      sound: 'raid-clear',
      hold: 2.5
    }
  ]
};

const BOSS_PHASE_STINGER: CutsceneDef = {
  id: 'boss-phase-stinger',
  title: '{boss} Breaks',
  tier: 'stinger',
  trigger: { kind: 'boss-phase' },
  skippable: true,
  letterbox: false,
  category: 'Bosses',
  replayable: false,
  beats: [
    {
      shot: { angle: 'low', move: 'push-in', palette: 'phase ember', mood: 'committing' },
      stage: [{ kind: 'gesture', target: 'boss', gesture: 'ground-slam' }],
      line: { speaker: '{boss}', text: '{bossLine}' },
      sound: 'levelup',
      hold: 1.8
    }
  ]
};

const VOID_PRELATE_PHASE: CutsceneDef = {
  id: 'void-prelate-phase-break',
  title: 'The Prelate Severs',
  tier: 'setpiece',
  trigger: { kind: 'boss-phase', bossHeroId: 'templar-assassin' },
  skippable: true,
  letterbox: true,
  category: 'Bosses',
  replayable: true,
  beats: [
    {
      shot: { angle: 'close', move: 'snap', palette: 'desaturated void', mood: 'severed' },
      stage: [{ kind: 'gesture', target: 'boss', gesture: 'dash' }],
      line: { speaker: 'The Void Prelate', text: 'You see the blade only after it has already chosen you.' },
      hold: 2.2
    },
    {
      shot: { angle: 'low', move: 'push-in', palette: 'dark between stars', mood: 'hunting' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#7c6bff' }],
      line: { speaker: 'The Void Prelate', text: 'The dark blinks closer. There is no angle left to you.' },
      sound: 'raid-clear',
      hold: 2.4
    }
  ]
};

const LAST_ELDWURM_PHASE: CutsceneDef = {
  id: 'last-eldwurm-phase-break',
  title: 'The Last Dragon Reignites',
  tier: 'setpiece',
  trigger: { kind: 'boss-phase', bossHeroId: 'dragon-knight' },
  skippable: true,
  letterbox: true,
  category: 'Bosses',
  replayable: true,
  beats: [
    {
      shot: { angle: 'low', move: 'crane', palette: 'rekindled red', mood: 'refusal' },
      stage: [{ kind: 'gesture', target: 'boss', gesture: 'ground-slam' }],
      line: { speaker: 'The Last Eldwurm', text: 'The last of my brothers fell. I did not.' },
      hold: 2.4
    },
    {
      shot: { angle: 'high', move: 'push-in', palette: 'dragonfire', mood: 'hunting' },
      stage: [{ kind: 'vfx', archetype: 'storm', color: '#ff7a2c' }],
      line: { speaker: 'The Last Eldwurm', text: 'It stops dying now. It starts hunting.' },
      sound: 'raid-clear',
      hold: 2.6
    }
  ]
};

const ECHO_MILESTONE: CutsceneDef = {
  id: 'echo-milestone-stinger',
  title: 'A War You Carry',
  tier: 'stinger',
  trigger: { kind: 'echo-milestone' },
  skippable: true,
  letterbox: false,
  category: 'Binds',
  replayable: false,
  beats: [
    {
      shot: { angle: 'close', move: 'push-in', palette: 'echo blue', mood: 'remembered' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#9db8ff' }],
      line: { speaker: '{hero}', text: '{echoLine}' },
      sound: 'levelup',
      hold: 2.8
    }
  ]
};

const RESONANCE_FIRST_REACTION: CutsceneDef = {
  id: 'resonance-first-reaction',
  title: 'The Wars Answer',
  tier: 'stinger',
  trigger: { kind: 'echo-milestone' },
  skippable: true,
  letterbox: false,
  category: 'Binds',
  replayable: false,
  beats: [
    {
      shot: { angle: 'close', move: 'snap', palette: 'resonance prism', mood: 'systems awakened' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#b88cff' }],
      line: { speaker: 'Resonance', text: '{echoLine}' },
      sound: 'levelup',
      hold: 2.8
    }
  ]
};

const TRIAL_DIALOGUE_STINGER: CutsceneDef = {
  id: 'trial-dialogue-stinger',
  title: '{trial}',
  tier: 'stinger',
  trigger: { kind: 'trial-dialogue' },
  skippable: true,
  letterbox: false,
  category: 'Binds',
  replayable: false,
  beats: [
    {
      shot: { angle: 'over-shoulder', move: 'rack-focus', palette: 'trial glass', mood: 'spoken challenge' },
      stage: [{ kind: 'develop-character', target: 'boss', text: '{trial}', gesture: 'channel-loop' }],
      line: { speaker: '{speaker}', text: '{trialLine}', portraitHeroId: '{heroId}' },
      sound: 'capture',
      hold: 3
    }
  ]
};

const ELITE_OPEN: CutsceneDef = {
  id: 'elite-gauntlet-open',
  title: 'The Gauntlet Opens',
  tier: 'setpiece',
  trigger: { kind: 'elite-start' },
  skippable: true,
  letterbox: true,
  category: 'Endgame',
  replayable: true,
  requiredStaging: true,
  galleryCaption: 'Director note: the climax never becomes a silent toast. Even under cut-scene-off settings, it keeps a shortened staged concession and Tower reveal before handing the Loop question back to the player.',
  beats: [
    {
      shot: { angle: 'wide', move: 'crane', palette: 'tower shadow', mood: 'final gate' },
      stage: [
        { kind: 'describe-environment', text: 'Five doors stand in the Tower shadow.' },
        { kind: 'focus', target: 'tower' }
      ],
      line: { speaker: 'Elite Five', text: 'Five doors, one Champion, and the Tower above them all.' },
      hold: 4
    },
    {
      shot: { angle: 'through-objects', move: 'rack-focus', palette: 'draft gold', mood: 'personas in shadow' },
      stage: [{ kind: 'introduce-conflict', text: 'Each persona waits with a draft already sharpened.', target: 'boss' }],
      line: { speaker: 'Journal', text: 'Behind the last door is the only binder who has already done what you have done.' },
      sound: 'badge',
      hold: 3.4
    }
  ]
};

const ELITE_PERSONAS: CutsceneDef[] = ELITE_DRAFT.members.map((member, index) => ({
  id: `elite-persona-${index}`,
  title: member.name,
  tier: 'stinger',
  trigger: { kind: 'elite-persona', index },
  skippable: true,
  letterbox: false,
  category: 'Endgame',
  replayable: false,
  beats: [
    {
      shot: { angle: 'title-card', move: 'hold', palette: 'draft gold', mood: 'competitive' },
      stage: [{ kind: 'title', text: member.title }],
      line: { speaker: member.name, text: member.dialogue[0] ?? member.title },
      hold: 2.8
    }
  ]
}));

const CHAMPION_INTRO: CutsceneDef = {
  id: 'champion-intro',
  title: 'The Twice-Crowned',
  tier: 'setpiece',
  trigger: { kind: 'elite-start' },
  skippable: true,
  letterbox: true,
  category: 'Endgame',
  replayable: true,
  beats: [
    {
      shot: { angle: 'wide', move: 'crane', palette: 'radiant and dire', mood: 'throne revealed' },
      stage: [{ kind: 'title', text: ELITE_DRAFT.championTitle }],
      line: { speaker: ELITE_DRAFT.championName, text: ELITE_DRAFT.championDialogue[0] },
      hold: 3.2
    },
    {
      shot: { angle: 'low', move: 'push-in', palette: 'draft gold', mood: 'meta claimed' },
      stage: [{ kind: 'focus', target: 'boss' }],
      line: { speaker: ELITE_DRAFT.championName, text: ELITE_DRAFT.championDialogue[1] },
      hold: 3.1
    },
    {
      shot: { angle: 'close', move: 'snap', palette: 'tower shadow', mood: 'challenge' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#ffd86a' }],
      line: { speaker: ELITE_DRAFT.championName, text: ELITE_DRAFT.championDialogue[2] },
      sound: 'badge',
      hold: 2.8
    }
  ]
};

const CHAMPION_CLEAR: CutsceneDef = {
  id: 'champion-clear',
  title: 'Two Crowns, No Equals',
  tier: 'setpiece',
  trigger: { kind: 'champion-clear' },
  skippable: true,
  letterbox: true,
  category: 'Endgame',
  replayable: true,
  requiredStaging: true,
  galleryCaption: 'Director note: the climax never becomes a silent toast. Even under cut-scene-off settings, it keeps a shortened staged concession and Tower reveal before handing the Loop question back to the player.',
  beats: [
    {
      shot: { angle: 'low', move: 'pull-back', palette: 'radiant and dire', mood: 'concession' },
      stage: [{ kind: 'title', text: ELITE_DRAFT.championTitle }],
      line: { speaker: ELITE_DRAFT.championName, text: 'Two crowns held the cycle in place. Yours broke the grip.' },
      hold: 3.2
    },
    {
      shot: { angle: 'wide', move: 'crane', palette: 'crater moonlight', mood: 'tower revealed' },
      stage: [{ kind: 'focus', target: 'tower' }],
      line: { speaker: 'The Tower', text: 'Roshan waits below. The Ancient waits above. The Loop waits for an answer.' },
      hold: 3.8
    },
    {
      shot: { angle: 'high', move: 'pull-back', palette: 'almost-whole moon', mood: 'world gathered' },
      stage: [{ kind: 'vfx', archetype: 'dome', color: '#d8f4ff' }],
      line: { speaker: 'Narration', text: 'Every shard road, every bound Echo, every claimant turned back: the Moon is almost whole in your hands.' },
      hold: 4
    },
    {
      shot: { angle: 'title-card', move: 'hold', palette: 'zet violet', mood: 'choice' },
      stage: [{ kind: 'title', text: 'Zet\'s Question' }],
      line: { speaker: 'The Loop', text: 'Reunite it. Rule it. Break it open. The world will remember the shape you choose.' },
      sound: 'raid-clear',
      hold: 4.4
    },
    {
      shot: { angle: 'wide', move: 'push-in', palette: 'new dawn', mood: 'held open' },
      stage: [{ kind: 'focus', target: 'tower' }],
      line: { speaker: 'The Tower', text: '{closing}' },
      hold: 3.2
    }
  ]
};

const AEGIS_FIRST_HOLD: CutsceneDef = {
  id: 'item-aegis-of-the-immortal-first-hold',
  title: 'A Held Promise',
  tier: 'setpiece',
  trigger: { kind: 'item-first-hold', itemId: 'aegis-of-the-immortal' },
  skippable: true,
  letterbox: true,
  category: 'Items',
  replayable: true,
  beats: [
    {
      shot: { angle: 'high', move: 'crane', palette: 'roshan gold', mood: 'ancient bargain' },
      stage: [{ kind: 'focus', target: 'item' }],
      line: { speaker: 'Aegis of the Immortal', text: 'Roshan woke. You walked away. The Moon keeps that promise once.' },
      sound: 'raid-clear',
      hold: 3.6
    },
    {
      shot: { angle: 'close', move: 'push-in', palette: 'white-gold', mood: 'held breath' },
      stage: [{ kind: 'vfx', archetype: 'shield', color: '#ffd86a' }],
      line: { speaker: 'Aegis of the Immortal', text: 'Die once. Stand once.' },
      hold: 2.6
    }
  ]
};

const RAPIER_FIRST_HOLD: CutsceneDef = {
  id: 'item-divine-rapier-first-hold',
  title: 'A Victory Condition with a Handle',
  tier: 'setpiece',
  trigger: { kind: 'item-first-hold', itemId: 'divine-rapier' },
  skippable: true,
  letterbox: true,
  category: 'Items',
  replayable: true,
  beats: [
    {
      shot: { angle: 'low', move: 'push-in', palette: 'sunblade gold', mood: 'dangerous' },
      stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#fff1a6' }],
      line: { speaker: 'Divine Rapier', text: '{itemLore}' },
      sound: 'raid-clear',
      hold: 3.4
    }
  ]
};

const CHASE_ITEM_FIRST_HOLD: CutsceneDef = {
  id: 'item-chase-first-hold',
  title: '{item}',
  tier: 'stinger',
  trigger: { kind: 'item-first-hold', itemId: 'butterfly' },
  skippable: true,
  letterbox: false,
  category: 'Items',
  replayable: false,
  beats: [
    {
      shot: { angle: 'close', move: 'push-in', palette: 'relic flare', mood: 'turning point' },
      stage: [{ kind: 'focus', target: 'item' }],
      line: { speaker: '{item}', text: '{itemLore}' },
      sound: 'levelup',
      hold: 2.7
    }
  ]
};

const OUTWORLD_FIRST_CONTACT: CutsceneDef = {
  id: 'outworld-first-contact',
  title: 'The Seal Tears',
  tier: 'setpiece',
  trigger: { kind: 'outworld-first-contact' },
  skippable: true,
  letterbox: true,
  category: 'Claimants',
  replayable: true,
  beats: [
    {
      shot: { angle: 'wide', move: 'crane', palette: 'wrong-world blue', mood: 'intrusion' },
      stage: [{ kind: 'title', text: 'A grade that does not belong to this biome bleeds through the air.' }],
      line: { speaker: 'The Seal', text: 'The Sundering rang farther than this world.' },
      hold: 3.4
    },
    {
      shot: { angle: 'low', move: 'push-in', palette: 'void and ember', mood: 'claimant' },
      stage: [{ kind: 'focus', target: 'boss' }],
      line: { speaker: '{claimant}', text: 'Something from outside has heard the Ancients calling.' },
      sound: 'raid-clear',
      hold: 3
    }
  ]
};

const OUTWORLD_ALL_CLEAR: CutsceneDef = {
  id: 'outworld-all-clear',
  title: 'Outworld Held',
  tier: 'setpiece',
  trigger: { kind: 'outworld-all-clear' },
  skippable: true,
  letterbox: true,
  category: 'Claimants',
  replayable: true,
  beats: [
    {
      shot: { angle: 'wide', move: 'pull-back', palette: 'sealed horizon', mood: 'defended' },
      stage: [{ kind: 'title', text: 'Every claimant from beyond has fallen.' }],
      line: { speaker: 'The Seal', text: 'The world keeps its heart. For this turn of the Loop, outside stays outside.' },
      sound: 'raid-clear',
      hold: 4
    }
  ]
};

const SEASONAL_INTROS: CutsceneDef[] = [
  {
    id: 'seasonal-diretide-roshan-candy',
    title: 'Roshan Wakes Hungry',
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'diretide-roshan-candy' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'low', move: 'push-in', palette: 'candy ember', mood: 'mischief' },
        stage: [{ kind: 'focus', target: 'boss' }],
        line: { speaker: 'Roshan', text: 'The Pit remembers hunger too. Bring tribute, or become it.' },
        sound: 'raid-clear',
        hold: 3.2
      }
    ]
  },
  {
    id: 'seasonal-wraith-night-altar',
    title: 'The Altar Holds',
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'wraith-night-altar' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'wide', move: 'crane', palette: 'frost crown', mood: 'siege' },
        stage: [{ kind: 'title', text: 'Thirteen waves ring against the altar.' }],
        line: { speaker: 'Wraith-Night', text: 'Count the dead king carefully. He counts himself more than once.' },
        hold: 3.5
      }
    ]
  },
  {
    id: 'seasonal-continuum-descent',
    title: "Aghanim's Continuum Descent",
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'continuum-descent' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'high', move: 'crane', palette: 'arcane violet', mood: 'impossible map' },
        stage: [{ kind: 'title', text: 'The next room is beside yesterday.' }],
        line: { speaker: 'Aghanim', text: 'Down is such a limiting word.' },
        sound: 'levelup',
        hold: 3.4
      }
    ]
  },
  {
    id: 'seasonal-cycle-beast',
    title: 'The Cycle Beast',
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'cycle-beast' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'low', move: 'push-in', palette: 'new bloom gold', mood: 'damage race' },
        stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#ffd86a' }],
        line: { speaker: 'The Cycle Beast', text: 'Every year thinks it is the first. Prove this one wrong quickly.' },
        sound: 'levelup',
        hold: 3.2
      }
    ]
  },
  {
    id: 'seasonal-dark-reef-crawl',
    title: 'The Dark Reef',
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'dark-reef-crawl' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'wide', move: 'crane', palette: 'reef teal', mood: 'old feud' },
        stage: [{ kind: 'title', text: 'Below Shadeshore, the tide keeps every grudge.' }],
        line: { speaker: 'The Dark Reef', text: 'The sea does not forget. It only waits for deeper water.' },
        hold: 3.4
      }
    ]
  },
  {
    id: 'seasonal-collapsing-hollow',
    title: 'The Collapsing Hollow',
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'collapsing-hollow' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'high', move: 'pull-back', palette: 'hollow amber', mood: 'closing walls' },
        stage: [{ kind: 'vfx', archetype: 'dome', color: '#ffb65c' }],
        line: { speaker: 'The Hollow', text: 'Run while the walls still remember being apart.' },
        sound: 'capture',
        hold: 3.2
      }
    ]
  },
  {
    id: 'seasonal-nemestice-fall',
    title: 'Nemestice Fall',
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'nemestice-fall' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'high', move: 'crane', palette: 'zet violet', mood: 'falling seal' },
        stage: [{ kind: 'vfx', archetype: 'storm', color: '#9d7cff' }],
        line: { speaker: 'Nemestice', text: 'The seal falls in pieces. Gather what still wants the war closed.' },
        sound: 'levelup',
        hold: 3.5
      }
    ]
  },
  {
    // STORY §7.2: Crownfall is a recruitment arc, not just an act-trials driver.
    // It plays as a three-act visual novel — the crown is claimed, questioned,
    // then walked apart — with alternating dialogue cards between the narrator,
    // the deposed ruler, and the heir who will earn the claim by descending the
    // act-trials route that opens underneath the festival.
    id: 'seasonal-crowns-fall',
    title: "Crownfall: A Crown's Fall",
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'crowns-fall' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    galleryCaption: "Director note: Crownfall plays as a three-act recruitment visual novel — Claim, Question, Ruin — trading dialogue cards between the narrator, the deposed ruler, and the heir before the act-trials descent opens beneath the throne.",
    beats: [
      {
        shot: { angle: 'title-card', move: 'hold', palette: 'crown gold', mood: 'act break' },
        stage: [
          { kind: 'title', text: 'Crownfall - Act I: The Claim' },
          { kind: 'establish-history', text: 'A ruler carves "forever" into a crown and mistakes the word for a fact.' }
        ],
        line: { speaker: 'Crownfall', text: 'Every crown is a loop someone mistook for an ending.' },
        sound: 'badge',
        hold: 3.4
      },
      {
        shot: { angle: 'over-shoulder', move: 'rack-focus', palette: 'throne dust gold', mood: 'pride held' },
        stage: [{ kind: 'develop-character', target: 'boss', text: 'The deposed ruler still sits as though the throne agrees with the claim.', gesture: 'channel-loop' }],
        line: { speaker: 'The Deposed Crown', text: 'I ruled one perfect turn. The Loop kept every turn after it.' },
        hold: 3.2
      },
      {
        shot: { angle: 'title-card', move: 'hold', palette: 'question violet', mood: 'act break' },
        stage: [
          { kind: 'title', text: 'Act II: The Question' },
          { kind: 'explore-theme', text: 'A crown only means anything while someone is still allowed to ask who deserves it.' }
        ],
        line: { speaker: 'Crownfall', text: 'Acts begin when a ruler says forever. Then the world asks the question again.' },
        hold: 3.2
      },
      {
        shot: { angle: 'close', move: 'push-in', palette: 'heir gold', mood: 'resolve' },
        stage: [{ kind: 'develop-character', target: 'ally', text: 'An heir steps out of the line of mourners and does not kneel.', gesture: 'toggle-stance' }],
        line: { speaker: 'The Heir', text: 'I am not here to wear it. I am here to learn how it ends.' },
        hold: 3.2
      },
      {
        shot: { angle: 'title-card', move: 'hold', palette: 'ruin ash', mood: 'act break' },
        stage: [
          { kind: 'title', text: 'Act III: The Ruin' },
          { kind: 'establish-history', text: 'The crown comes apart act by act, until only the choice to pick it up remains.' }
        ],
        line: { speaker: 'Crownfall', text: 'A crown becomes a question, then an answer, then a ruin you can walk through.' },
        hold: 3.4
      },
      {
        shot: { angle: 'wide', move: 'crane', palette: 'crown gold dusk', mood: 'arc opens' },
        stage: [
          { kind: 'focus', target: 'region' },
          { kind: 'vfx', archetype: 'dome', color: '#ffd86a' }
        ],
        line: { speaker: 'The Heir', text: 'Walk the acts with me. We take the crown apart together, and what is left is yours to bind.' },
        sound: 'badge',
        hold: 3.6
      }
    ]
  },
  {
    id: 'seasonal-dark-moon-hunt',
    title: 'Dark Moon Hunt',
    tier: 'setpiece',
    trigger: { kind: 'seasonal-event', eventId: 'dark-moon-hunt' },
    skippable: true,
    letterbox: true,
    category: 'Festivals',
    replayable: true,
    beats: [
      {
        shot: { angle: 'wide', move: 'push-in', palette: 'nightsilver blue', mood: 'watched' },
        stage: [{ kind: 'title', text: 'Nightsilver hears two moons at once.' }],
        line: { speaker: 'Dark Moon', text: 'Hunt softly. The sky is listening.' },
        hold: 3.1
      }
    ]
  }
];

const LEGEND_CALLOUTS: CutsceneDef[] = [
  {
    id: 'legend-pit-remembers',
    title: 'The Pit Remembers',
    tier: 'stinger',
    trigger: { kind: 'legend-callout', legendId: 'pit-remembers' },
    skippable: true,
    letterbox: false,
    category: 'Legends',
    replayable: true,
    beats: [
      {
        shot: { angle: 'high', move: 'snap', palette: 'pit lightning', mood: 'crowd roar' },
        stage: [{ kind: 'vfx', archetype: 'ground-aoe', color: '#9db8ff' }],
        line: { speaker: 'Legend', text: 'The pit heard that Echo before.' },
        sound: 'levelup',
        hold: 2.6
      }
    ]
  },
  {
    id: 'legend-hooked-home',
    title: 'Hooked Home',
    tier: 'stinger',
    trigger: { kind: 'legend-callout', legendId: 'hooked-home' },
    skippable: true,
    letterbox: false,
    category: 'Legends',
    replayable: true,
    beats: [
      {
        shot: { angle: 'over-shoulder', move: 'snap', palette: 'fountain white', mood: 'impossible angle' },
        stage: [{ kind: 'vfx', archetype: 'hook', color: '#e9efff' }],
        line: { speaker: 'Legend', text: 'A hook is a line. This one remembered home.' },
        sound: 'capture',
        hold: 2.6
      }
    ]
  },
  {
    id: 'legend-call-paid-out',
    title: 'The Call That Paid Out',
    tier: 'stinger',
    trigger: { kind: 'legend-callout', legendId: 'call-paid-out' },
    skippable: true,
    letterbox: false,
    category: 'Legends',
    replayable: true,
    beats: [
      {
        shot: { angle: 'low', move: 'snap', palette: 'axe red', mood: 'paid for' },
        stage: [{ kind: 'gesture', target: 'player', gesture: 'ground-slam' }],
        line: { speaker: 'Legend', text: 'The call cost everything. The answer was worth more.' },
        sound: 'levelup',
        hold: 2.7
      }
    ]
  },
  {
    id: 'legend-coil-closed-game',
    title: 'The Coil That Closed the Game',
    tier: 'stinger',
    trigger: { kind: 'legend-callout', legendId: 'coil-closed-game' },
    skippable: true,
    letterbox: false,
    category: 'Legends',
    replayable: true,
    beats: [
      {
        shot: { angle: 'high', move: 'snap', palette: 'faerie violet', mood: 'escape denied' },
        stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#ff9ad8' }],
        line: { speaker: 'Legend', text: 'A perfect circle is just a door closing from every side.' },
        sound: 'capture',
        hold: 2.6
      }
    ]
  },
  {
    id: 'legend-rampage',
    title: 'Rampage',
    tier: 'stinger',
    trigger: { kind: 'legend-callout', legendId: 'rampage' },
    skippable: true,
    letterbox: false,
    category: 'Legends',
    replayable: true,
    beats: [
      {
        shot: { angle: 'wide', move: 'push-in', palette: 'victory gold', mood: 'crowd roar' },
        stage: [{ kind: 'vfx', archetype: 'global-mark', color: '#ffd86a' }],
        line: { speaker: 'Legend', text: 'Rampage.' },
        sound: 'raid-clear',
        hold: 2.4
      }
    ]
  }
];

export const ALL_CUTSCENES: CutsceneDef[] = [
  PROLOGUE,
  BIND_FIRST,
  BIND_STINGER,
  ...REGIONS.map(arrival),
  ...ALL_GYMS.map(badge),
  ...ALL_RAIDS.map(raidIntro),
  ...ALL_RAIDS.filter((raid) => !BESPOKE_PHASE_RAID_IDS.has(raid.id)).map(raidPhase),
  ...ALL_RAIDS.map(raidClear),
  RAID_CLEAR,
  BOSS_CLEAR,
  BOSS_PHASE_STINGER,
  VOID_PRELATE_PHASE,
  LAST_ELDWURM_PHASE,
  ECHO_MILESTONE,
  RESONANCE_FIRST_REACTION,
  TRIAL_DIALOGUE_STINGER,
  ELITE_OPEN,
  ...ELITE_PERSONAS,
  CHAMPION_INTRO,
  CHAMPION_CLEAR,
  AEGIS_FIRST_HOLD,
  RAPIER_FIRST_HOLD,
  CHASE_ITEM_FIRST_HOLD,
  OUTWORLD_FIRST_CONTACT,
  OUTWORLD_ALL_CLEAR,
  ...SEASONAL_INTROS,
  ...LEGEND_CALLOUTS
];
