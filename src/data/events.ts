import type { LegendDef, SeasonalEventDef } from '../core/types';

export const ALL_SEASONAL_EVENTS: SeasonalEventDef[] = [
  {
    id: 'diretide-roshan-candy',
    name: 'Diretide: Roshan Wakes Hungry',
    realEvent: 'Diretide',
    summary: 'A Roshan-candy rite around the Pit: feed the hunger, survive the Roshlings, keep the Loop laughing.',
    mode: 'roshan-candy',
    regionId: 'mad-moon-crater',
    cutsceneId: 'seasonal-diretide-roshan-candy',
    codexTitle: 'Diretide: Roshan Wakes Hungry',
    codexBody: 'One turn of the Loop remembers Roshan as hunger instead of guardian. Candy, Roshlings, and the Pit all point at the same joke: the immortal monster still wants tribute.',
    reward: { kind: 'loot-mark', amount: 1, label: 'late loot mark' }
  },
  {
    id: 'wraith-night-altar',
    name: 'Wraith-Night: The Altar Holds',
    realEvent: 'Wraith-Night',
    summary: 'An Icewrack wave defense at a frozen altar, climaxing on the king who refuses to stay dead.',
    mode: 'wave-defense',
    regionId: 'icewrack',
    cutsceneId: 'seasonal-wraith-night-altar',
    codexTitle: 'Wraith-Night: The Altar Holds',
    codexBody: 'The old altar has seen every dead king stand again. Wraith-Night turns that memory into a siege: hold the line, count the revivals, and let Icewrack ring.',
    reward: { kind: 'gold', amount: 750, label: 'festival purse' }
  },
  {
    id: 'continuum-descent',
    name: "Aghanim's Continuum Descent",
    realEvent: "Aghanim's Labyrinth: The Continuum Conundrum",
    summary: 'An endless-descent framing for the dungeon system, with room choices treated as time folding over itself.',
    mode: 'endless-descent',
    regionId: 'quoidge',
    cutsceneId: 'seasonal-continuum-descent',
    codexTitle: "Aghanim's Continuum Descent",
    codexBody: 'Quoidge scholars insist the dungeon is not below the town. It is beside yesterday. The Continuum event turns endless rooms into a joke only Aghanim would tell twice.',
    reward: { kind: 'loot-mark', amount: 1, label: 'mid loot mark' }
  }
];

export const ALL_LEGENDS: LegendDef[] = [
  {
    id: 'pit-remembers',
    name: 'The Pit Remembers',
    realMoment: 'TI5: Echo Slam in the Roshan pit',
    triggerSummary: 'Earthshaker lands a huge Echo Slam inside Roshan territory.',
    cutsceneId: 'legend-pit-remembers',
    codexTitle: 'The Pit Remembers',
    codexBody: 'Some plays are so loud the Loop keeps a copy. When stone, pit, and Echo Slam agree, the old crowd can almost be heard under Roshan.'
  },
  {
    id: 'hooked-home',
    name: 'Hooked Home',
    realMoment: 'TI3: Fountain Hook',
    triggerSummary: 'Pudge and a recall effect turn a hook into a homecoming trap.',
    cutsceneId: 'legend-hooked-home',
    codexTitle: 'Hooked Home',
    codexBody: 'A hook is usually a straight line. One famous turn of the Loop made it a door. The binder who repeats the trick earns the wink.'
  }
];
