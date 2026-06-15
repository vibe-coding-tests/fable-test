import { TUNING } from '../data/tuning';
import { abilityArchetypes, type AbilityArchetype } from './ability-archetype';
import { abilityVal } from './values';
import type { AbilityDef, BoardSlot, EffectNode, Formation, HeroDef, ValueRef, Vec2 } from './types';

export type { BoardSlot, Formation } from './types';

// ============================================================
// The board (AUTOBATTLER_OVERHAUL §3). A discrete deployment grid
// mapped deterministically onto a team's half of the existing arena.
// It authors only what the sim already consumes: each unit's spawn
// position/facing and its home anchor (`homePos`). The sim stays
// continuous; the board just decides where the five start and where
// they want to hold.
//
// Pure, deterministic, headless — no DOM, no three. `slotToWorld` is a
// pure cell -> world map, so a placed team is fully replayable and the
// fallback (`core/macro.ts formationDepth`) is byte-identical to today.
// ============================================================

/** Columns (back / mid / front) and rows in the deployment grid (§3.1). */
export const BOARD_COLS = 3;
export const BOARD_ROWS = 5;

/**
 * Map a deployment cell to a world point + facing, deterministically. The column
 * band reuses `macroFormationDepth` around the team's existing X-inset so a placed
 * team occupies the same depth band as the role heuristic — front toward center,
 * back toward its own edge — and the rows spread evenly along the arena height.
 */
export function slotToWorld(team: 0 | 1, slot: BoardSlot): { pos: Vec2; facing: number } {
  const dir = team === 0 ? 1 : -1;
  const baseX = team === 0 ? TUNING.macroTeamXInset : TUNING.arenaWidth - TUNING.macroTeamXInset;
  // col 0 = back (behind the base), 1 = mid (the base line), 2 = front (toward center).
  const colOffset = (slot.col - 1) * TUNING.macroFormationDepth;
  const x = baseX + dir * colOffset;

  const rowGap = Math.min(420, TUNING.arenaHeight / (BOARD_ROWS + 1));
  const y = TUNING.arenaHeight / 2 + (slot.row - (BOARD_ROWS - 1) / 2) * rowGap;

  return { pos: { x, y }, facing: team === 0 ? 0 : Math.PI };
}

// ============================================================
// Draft authoring helpers (§3.2 / §4.2). All pure: a hero's kit and roles
// decide a suggested column + row bias; doctrines stamp a whole five at once.
// These only *suggest* — the committed Formation is what the sim consumes.
// ============================================================

const RANGED_AT_RANGE = 550; // mirrors core/macro.ts formationDepth

export type RowPref = 'center' | 'edge' | 'any';

export interface PlacementHint {
  col: 0 | 1 | 2;
  rowPref: RowPref;
  reason: string;
}

/** The archetype-driven column/row a hero *wants* (§3.2). Pure over the def. */
export function placementHint(def: HeroDef): PlacementHint {
  const arch = new Set<AbilityArchetype>();
  for (const a of def.abilities) for (const x of abilityArchetypes(a)) arch.add(x);
  const roles = def.roles;
  const ranged = def.baseStats.attackRange >= RANGED_AT_RANGE;

  if (roles.includes('durable') || roles.includes('initiator')) {
    return { col: 2, rowPref: 'center', reason: 'Frontline — soak the engage.' };
  }
  if (arch.has('teamfight-ult') || arch.has('cluster-nuke')) {
    return { col: 1, rowPref: 'center', reason: 'AoE — a central column catches the most.' };
  }
  if (arch.has('channel')) {
    return { col: 0, rowPref: 'edge', reason: 'Channel — a protected back cell.' };
  }
  if (arch.has('skillshot-line')) {
    return { col: 0, rowPref: 'edge', reason: 'Skillshot — an edge angle rakes a row.' };
  }
  if (roles.includes('support') || arch.has('team-buff')) {
    return { col: 1, rowPref: 'any', reason: 'Support — near the core to peel.' };
  }
  if (ranged) {
    return { col: 0, rowPref: 'any', reason: 'Ranged — hold behind the line.' };
  }
  return { col: 1, rowPref: 'any', reason: 'Flex.' };
}

/** A hero's spatial profile for the board editor's hover readout (§7): how far its kit
 *  reaches, its biggest AoE footprint, and its archetype tags. Pure over the def. */
export interface ReachProfile {
  reach: number;       // the longest cast/attack reach across the kit
  footprint: number;   // the largest AoE radius the kit drops
  tags: AbilityArchetype[];
}

function maxRadiusInNodes(def: AbilityDef, nodes: EffectNode[] | undefined, level: number): number {
  if (!nodes) return 0;
  let r = 0;
  for (const n of nodes) {
    const radius = (n as { radius?: ValueRef }).radius;
    if (radius !== undefined) r = Math.max(r, abilityVal(def, radius, level));
    if (n.kind === 'zone') r = Math.max(r, abilityVal(def, n.zone.radius, level), maxRadiusInNodes(def, n.zone.tick?.effects, level));
    if (n.kind === 'projectile') r = Math.max(r, maxRadiusInNodes(def, n.proj.onHit, level));
    if (n.kind === 'repeat') r = Math.max(r, maxRadiusInNodes(def, n.effects, level));
  }
  return r;
}

export function reachProfile(def: HeroDef): ReachProfile {
  const tags = new Set<AbilityArchetype>();
  let reach = def.baseStats.attackRange;
  let footprint = 0;
  for (const a of def.abilities) {
    for (const t of abilityArchetypes(a)) tags.add(t);
    const lvl = a.ult ? 3 : 4;
    if (a.castRange !== undefined) reach = Math.max(reach, abilityVal(a, a.castRange, lvl));
    footprint = Math.max(footprint, maxRadiusInNodes(a, a.effects, lvl), maxRadiusInNodes(a, a.channel?.tick?.effects, lvl));
  }
  return { reach: Math.round(reach), footprint: Math.round(footprint), tags: [...tags].sort() };
}

export type DoctrineId = 'spread' | 'phalanx' | 'flank' | 'turtle';

export interface Doctrine {
  id: DoctrineId;
  name: string;
  describe: string;
}

export const DOCTRINES: readonly Doctrine[] = [
  { id: 'spread', name: 'Spread', describe: 'Each hero where its kit wants; rows fanned wide to dodge AoE.' },
  { id: 'phalanx', name: 'Phalanx', describe: 'Front-liners forward, everyone else stacked safe behind.' },
  { id: 'flank', name: 'Flank', describe: 'Core central; a diver pushed wide and forward to hit the support.' },
  { id: 'turtle', name: 'Turtle', describe: 'Everyone hugging the back edge around the saves.' }
];

/** Lay an ordered five into the grid with distinct rows (so cells never collide). */
function layout(defs: HeroDef[], cols: (0 | 1 | 2)[], rows: number[]): Formation {
  const placements: Record<string, BoardSlot> = {};
  defs.forEach((def, i) => {
    placements[def.id] = { col: cols[i], row: rows[i] };
  });
  return { placements };
}

/** The walking-party default: each hero on its hint column, rows fanned by order. */
export function defaultFormation(defs: HeroDef[]): Formation {
  const five = defs.slice(0, BOARD_ROWS);
  const cols = five.map((d) => placementHint(d).col);
  const rows = five.map((_, i) => i);
  return layout(five, cols, rows);
}

function rowPressure(formation: Formation | undefined, colMin = 0, colMax = BOARD_COLS - 1): number[] {
  const counts = Array.from({ length: BOARD_ROWS }, () => 0);
  if (!formation) return counts;
  for (const slot of Object.values(formation.placements)) {
    if (slot.col < colMin || slot.col > colMax) continue;
    if (slot.row >= 0 && slot.row < BOARD_ROWS) counts[slot.row] += 1;
  }
  return counts;
}

function rowsByPressure(counts: number[]): number[] {
  return Array.from({ length: BOARD_ROWS }, (_, row) => row)
    .sort((a, b) => counts[b] - counts[a] || Math.abs(a - 2) - Math.abs(b - 2) || a - b);
}

function placeFirstFree(
  placements: Record<string, BoardSlot>,
  heroId: string,
  col: 0 | 1 | 2,
  rows: number[]
): void {
  const used = new Set(Object.values(placements).map((s) => `${s.col}:${s.row}`));
  for (const row of rows) {
    if (row < 0 || row >= BOARD_ROWS) continue;
    const key = `${col}:${row}`;
    if (!used.has(key)) {
      placements[heroId] = { col, row };
      return;
    }
  }
  for (let row = 0; row < BOARD_ROWS; row++) {
    const key = `${col}:${row}`;
    if (!used.has(key)) {
      placements[heroId] = { col, row };
      return;
    }
  }
}

/**
 * Enemy-side counter-placement (§6.4): when the player authors a board, the
 * opponent does not merely stamp its default. Divers line up on exposed back-row
 * threats, frontliners meet the densest contact row, and fragile casters choose
 * lower-pressure rows. It is still just a Formation: no stat buffs, no scripts.
 */
export function counterFormation(defs: HeroDef[], opponent?: Formation): Formation {
  if (!opponent) return defaultFormation(defs);
  const five = defs.slice(0, BOARD_ROWS);
  const allPressure = rowPressure(opponent);
  const backPressure = rowPressure(opponent, 0, 0);
  const hotRows = rowsByPressure(allPressure);
  const exposedBackRows = rowsByPressure(backPressure).filter((row) => backPressure[row] > 0);
  const coolRows = Array.from({ length: BOARD_ROWS }, (_, row) => row)
    .sort((a, b) => allPressure[a] - allPressure[b] || Math.abs(b - 2) - Math.abs(a - 2) || a - b);
  const placements: Record<string, BoardSlot> = {};

  const isDiver = (d: HeroDef) => d.roles.includes('initiator') || d.roles.includes('escape');
  const isFront = (d: HeroDef) => d.roles.includes('durable') || d.roles.includes('initiator');

  for (const def of five.filter(isDiver)) {
    placeFirstFree(placements, def.id, 2, exposedBackRows.length ? exposedBackRows : hotRows);
  }
  for (const def of five.filter((d) => isFront(d) && !placements[d.id])) {
    placeFirstFree(placements, def.id, 2, hotRows);
  }
  for (const def of five.filter((d) => !placements[d.id])) {
    const hint = placementHint(def);
    const col = hint.col === 2 ? 1 : hint.col;
    placeFirstFree(placements, def.id, col, coolRows);
  }

  return { placements };
}

/** Stamp a doctrine over the five (§4.2). Always yields a legal, collision-free board. */
export function doctrineFormation(id: DoctrineId, defs: HeroDef[]): Formation {
  const five = defs.slice(0, BOARD_ROWS);
  const cols: (0 | 1 | 2)[] = five.map((d) => placementHint(d).col);
  const rows = five.map((_, i) => i);

  switch (id) {
    case 'spread':
      break; // hint columns + index rows are already maximally fanned
    case 'phalanx':
      five.forEach((d, i) => {
        cols[i] = d.roles.includes('durable') || d.roles.includes('initiator') ? 2 : 0;
      });
      break;
    case 'flank': {
      const diver = five.findIndex((d) => d.roles.includes('initiator') || d.roles.includes('escape'));
      five.forEach((_, i) => { cols[i] = 1; });
      if (diver >= 0) {
        cols[diver] = 2;
        const tmp = rows[0]; rows[0] = rows[diver]; rows[diver] = tmp; // diver to an edge row
      }
      break;
    }
    case 'turtle':
      five.forEach((_, i) => { cols[i] = 0; });
      break;
  }
  return layout(five, cols, rows);
}
