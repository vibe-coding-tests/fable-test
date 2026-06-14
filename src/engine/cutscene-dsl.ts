import type { AnimGesture, CutsceneBeat, CutsceneDef, CutsceneTier, CutsceneTrigger, ShotAngle, ShotMove } from '../core/types';
import { REG } from '../core/registry';

const ANGLE_ALIASES: Record<string, ShotAngle> = {
  wide: 'wide',
  dramatic: 'wide',
  'through objects': 'through-objects',
  'through-objects': 'through-objects',
  'bird s eye': 'bird-eye',
  'bird eye': 'bird-eye',
  'bird-eye': 'bird-eye',
  high: 'high',
  'high angle': 'high',
  low: 'low',
  'low angle': 'low',
  close: 'close',
  'close up': 'close',
  'close-up': 'close',
  reflection: 'reflection',
  'over the shoulder': 'over-shoulder',
  'over-the-shoulder': 'over-shoulder',
  'title card': 'title-card',
  'title-card': 'title-card'
};

const MOVE_ALIASES: Record<string, ShotMove> = {
  hold: 'hold',
  'push in': 'push-in',
  'push-in': 'push-in',
  'pull back': 'pull-back',
  'pull-back': 'pull-back',
  crane: 'crane',
  snap: 'snap',
  'rack focus': 'rack-focus',
  'rack-focus': 'rack-focus',
  orbit: 'orbit'
};

function clean(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '');
}

function key(s: string): string {
  return clean(s).toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();
}

function parseShot(line: string): CutsceneBeat['shot'] {
  const slash = line.match(/SHOT:\s*([a-z-]+)\s*\/\s*([a-z-]+)\s*\/\s*([^/]+)\s*\/\s*(.+)$/i);
  if (slash) {
    return {
      angle: ANGLE_ALIASES[key(slash[1])] ?? 'wide',
      move: MOVE_ALIASES[key(slash[2])] ?? 'hold',
      palette: clean(slash[3]),
      mood: clean(slash[4])
    };
  }
  const tuple = line.match(/SHOT:\s*\(([^)]+)\)/i)?.[1];
  if (!tuple) throw new Error(`Cutscene DSL: missing SHOT tuple in "${line.trim()}"`);
  const parts = tuple.split(',').map(clean);
  return {
    angle: ANGLE_ALIASES[key(parts[3] ?? '')] ?? 'wide',
    move: 'hold',
    palette: parts[2] || 'neutral',
    mood: parts[4] || 'held'
  };
}

function defaultResolveRef(ref: string): string {
  const dialogue = ref.match(/^([a-z0-9-]+)\.dialogue\[(\d+)\]$/i);
  if (dialogue) {
    const raid = REG.raids.get(dialogue[1]);
    if (raid) return raid.dialogue[Number(dialogue[2])] ?? '';
    const gym = [...REG.gyms.values()].find((g) => g.id === dialogue[1] || g.badgeId === dialogue[1]);
    if (gym) return gym.dialogue[Number(dialogue[2])] ?? '';
  }
  const champion = ref.match(/^championDialogue\[(\d+)\]$/i);
  if (champion) {
    const draft = [...REG.drafts.values()][0];
    return draft?.championDialogue[Number(champion[1])] ?? '';
  }
  const bark = ref.match(/^([a-z0-9-]+)\.barks\[(\d+)\]$/i);
  if (bark) return REG.heroes.get(bark[1])?.barks[Number(bark[2])] ?? '';
  const lore = ref.match(/^([a-z0-9-]+)\.lore$/i);
  if (lore) {
    return REG.regions.get(lore[1])?.lore
      ?? REG.heroes.get(lore[1])?.lore
      ?? REG.items.get(lore[1])?.lore
      ?? REG.creeps.get(lore[1])?.lore
      ?? '';
  }
  throw new Error(`Cutscene DSL: unresolved ref:${ref}`);
}

function applyLine(beat: CutsceneBeat, line: string, resolveRef: (ref: string) => string): void {
  const body = line.replace(/^LINE:\s*/i, '');
  const m = body.match(/^([^:]+):\s*"([^"]+)"\s*$/);
  if (!m) throw new Error(`Cutscene DSL: bad LINE "${line.trim()}"`);
  const text = m[2].startsWith('ref:') ? resolveRef(m[2].slice(4)) : m[2];
  beat.line = { speaker: clean(m[1]), text };
}

function attr(body: string, name: string): string | undefined {
  return body.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))?.[1];
}

function applyStage(beat: CutsceneBeat, line: string): void {
  const body = line.replace(/^STAGE:\s*/i, '').trim();
  beat.stage ??= [];
  const title = attr(body, 'title') ?? attr(body, 'text') ?? attr(body, 'location') ?? attr(body, 'mood') ?? attr(body, 'mystery') ?? attr(body, 'conflict');
  if (/Describe|SetTone|Establish|Explore/i.test(body) && title) {
    beat.stage.push({ kind: 'title', text: title });
  }
  const target = body.match(/target=["']?(player|ally|boss|region|item|tower)["']?/i)?.[1];
  if (target) beat.stage.push({ kind: 'focus', target: target as 'player' | 'ally' | 'boss' | 'region' | 'item' | 'tower' });
  const gesture = body.match(/gesture=["']?([a-z-]+)["']?/i)?.[1];
  if (gesture && (target === 'player' || target === 'ally' || target === 'boss')) {
    beat.stage.push({ kind: 'gesture', target, gesture: gesture as AnimGesture });
  }
  if (/DescribeRealm|DescribeEnvironment/i.test(body) && title) beat.stage.push({ kind: 'describe-environment', text: title });
  if (/DevelopCharacter/i.test(body)) beat.stage.push({ kind: 'develop-character', target: (target === 'player' || target === 'ally' || target === 'boss' ? target : 'boss'), text: title, gesture: gesture as AnimGesture | undefined });
  if (/AdvancePlot/i.test(body) && title) beat.stage.push({ kind: 'advance-plot', text: title, target: target as 'ally' | 'boss' | 'player' | 'item' | 'tower' | undefined });
  if (/IntroduceConflict/i.test(body) && title) beat.stage.push({ kind: 'introduce-conflict', text: title, target: target as 'ally' | 'boss' | 'player' | 'tower' | undefined });
  if (/RevealMystery/i.test(body) && title) beat.stage.push({ kind: 'reveal-mystery', text: title, target: target as 'ally' | 'boss' | 'region' | 'item' | 'tower' | undefined });
  if (/SetTone/i.test(body) && title) beat.stage.push({ kind: 'set-tone', text: title });
  if (/ExploreTheme/i.test(body) && title) beat.stage.push({ kind: 'explore-theme', text: title });
  if (/EstablishHistory/i.test(body) && title) beat.stage.push({ kind: 'establish-history', text: title });
}

function beatBlocks(src: string): string[] {
  const blocks: string[] = [];
  const re = /BEAT\s*\{/gi;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    if (depth === 0) blocks.push(src.slice(start, i - 1));
    re.lastIndex = i;
  }
  return blocks;
}

/** Compile the STORY §5 cut-scene authoring format into playable data. */
export function compileCutsceneDsl(
  source: string,
  meta: { id: string; title: string; tier: CutsceneTier; trigger: CutsceneTrigger; category?: CutsceneDef['category']; replayable?: boolean; resolveRef?: (ref: string) => string }
): CutsceneDef {
  const resolveRef = meta.resolveRef ?? defaultResolveRef;
  const beats = beatBlocks(source).map((block): CutsceneBeat => {
    const lines = block.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
    const shotLine = lines.find((l) => /^SHOT:/i.test(l));
    if (!shotLine) throw new Error('Cutscene DSL: every BEAT needs SHOT');
    const beat: CutsceneBeat = { shot: parseShot(shotLine) };
    const moveLine = lines.find((l) => /^MOVE:/i.test(l));
    if (moveLine) beat.shot.move = MOVE_ALIASES[key(moveLine.replace(/^MOVE:\s*/i, ''))] ?? beat.shot.move;
    for (const line of lines) {
      if (/^STAGE:/i.test(line)) applyStage(beat, line);
      else if (/^LINE:/i.test(line)) applyLine(beat, line, resolveRef);
      else if (/^HOLD:/i.test(line)) beat.hold = Number(line.replace(/^HOLD:\s*/i, ''));
      else if (/^SOUND:/i.test(line)) beat.sound = clean(line.replace(/^SOUND:\s*/i, '')) as CutsceneBeat['sound'];
    }
    return beat;
  });
  if (beats.length === 0) throw new Error('Cutscene DSL: no BEAT blocks found');
  return {
    id: meta.id,
    title: meta.title,
    tier: meta.tier,
    trigger: meta.trigger,
    skippable: true,
    letterbox: meta.tier !== 'bark',
    category: meta.category,
    replayable: meta.replayable,
    beats
  };
}
