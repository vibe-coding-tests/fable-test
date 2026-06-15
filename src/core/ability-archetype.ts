import type { AbilityDef, EffectNode, StatusId, TargetSel, ValueRef } from './types';

// ============================================================
// AbilityArchetype (AUTOBATTLER_OVERHAUL §2). The parallel of
// ItemArchetype for spells: a *derived*, deterministic, cached
// classification of what *kind* of spell each ability is, so the
// scorer/planner/board/formation brain all speak the same noun.
//
// Pure over an AbilityDef's existing fields (targeting, affects,
// ult, channel, effects, aura, vfx) — no new hero data. A spell can
// carry more than one tag (Ravage is teamfight-ult + cluster-nuke;
// Epicenter is cluster-nuke + channel); the brain reads the *set*.
// Cached by AbilityDef.id exactly like itemArchetypes / combatProfile.
// ============================================================

export type AbilityArchetype =
  | 'teamfight-ult'    // big-radius hard CC / arena ult: Ravage, Black Hole, RP, Chrono, Echo Slam
  | 'cluster-nuke'     // AoE damage whose value scales with enemies caught: Macropyre, Pulse Nova
  | 'channel'          // roots the caster; interruptible; pays over time: Black Hole, Death Ward, Freezing Field
  | 'skillshot-line'   // directional line/cone: Sonic Wave, Light Strike Array, Torrent line
  | 'single-lockdown'  // hard CC on one target: Hex, Doom, Duel, Astral
  | 'zone-field'       // a standing zone/aura that shapes spacing: Macropyre field, Ice Path, auras
  | 'team-buff'        // ally heal/shield/statmod/purge: Mekansm-like, Warcry, Cold Embrace
  | 'self-steroid';    // self statmod: carry tempo buttons

const HARD_DISABLES: ReadonlySet<StatusId> = new Set<StatusId>([
  'stun', 'root', 'hex', 'fear', 'sleep', 'frozen', 'cyclone'
]);

/** A ground-aoe ult / arena ult with at least this radius reads as a teamfight ult. */
const TEAMFIGHT_RADIUS = 350;

/** vfx archetypes that read as a directional/linear skillshot footprint. */
const LINE_VFX: ReadonlySet<string> = new Set(['beam', 'wall', 'hook', 'chain']);

const CACHE = new Map<string, readonly AbilityArchetype[]>();

export function abilityArchetypes(def: AbilityDef): Set<AbilityArchetype> {
  const cached = CACHE.get(def.id);
  if (cached) return new Set(cached);
  const out = deriveAbilityArchetypes(def);
  const ordered = [...out].sort();
  CACHE.set(def.id, ordered);
  return new Set(ordered);
}

interface Facts {
  anyHardDisable: boolean;     // a hard disable lands on an enemy anywhere in the kit
  singleHardDisable: boolean;  // a hard disable on a single ('target') enemy, no radius
  aoeFootprint: boolean;       // any radius / in-radius selector / ground-aoe / zone
  maxRadius: number;           // representative radius for the teamfight-ult test
  aoeDamage: boolean;          // damage whose value scales with the cluster caught
  zone: boolean;               // a standing zone is dropped
  lineShape: boolean;          // a line zone or linear projectile (directional)
  allyGroupBenefit: boolean;   // heal/statmod/buff/purge to an ally group (or a targeted ally)
  selfBenefit: boolean;        // beneficial statmod/buff/heal on the caster itself
}

function deriveAbilityArchetypes(def: AbilityDef): Set<AbilityArchetype> {
  const out = new Set<AbilityArchetype>();
  const f: Facts = {
    anyHardDisable: false,
    singleHardDisable: false,
    aoeFootprint: false,
    maxRadius: 0,
    aoeDamage: false,
    zone: false,
    lineShape: false,
    allyGroupBenefit: false,
    selfBenefit: false
  };
  if (def.targeting === 'ground-aoe') f.aoeFootprint = true;

  scan(def, def.effects, f);
  if (def.channel?.tick) scan(def, def.channel.tick.effects, f);
  if (def.channel?.onEnd) scan(def, def.channel.onEnd, f);
  if (def.toggle) scan(def, def.toggle.effects, f);

  // zone-field: a standing zone or an aura shapes spacing.
  if (f.zone || def.aura) out.add('zone-field');

  // channel: roots the caster; pays over time; interruptible.
  if (def.channel) out.add('channel');

  // cluster-nuke: AoE damage whose value scales with the enemies caught.
  if (f.aoeDamage) out.add('cluster-nuke');

  // teamfight-ult: an arena ult — big AoE footprint plus hard CC or a big radius.
  if (def.ult && f.aoeFootprint && (f.anyHardDisable || f.maxRadius >= TEAMFIGHT_RADIUS)) {
    out.add('teamfight-ult');
  }

  // skillshot-line: directional line/cone the caster wants to angle down a row.
  if (isSkillshotLine(def, f)) out.add('skillshot-line');

  // single-lockdown: hard CC spent on one target's death/silence, not a body count.
  if (f.singleHardDisable && !f.aoeDamage) out.add('single-lockdown');

  // team-buff: a heal/shield/statmod/purge for allies, timed to the engage or a save.
  if (f.allyGroupBenefit || def.affects === 'ally') out.add('team-buff');

  // self-steroid: a self stat/tempo button pressed on contact (BKB, Warcry-self).
  if (f.selfBenefit && !out.has('team-buff')) out.add('self-steroid');

  return out;
}

function isSkillshotLine(def: AbilityDef, f: Facts): boolean {
  if (f.lineShape) return true;
  if (def.targeting === 'skillshot') return true;
  if (def.targeting === 'point-target' && LINE_VFX.has(def.vfx.archetype)) return true;
  return false;
}

function refMax(def: AbilityDef, ref: ValueRef | undefined): number {
  if (ref === undefined) return 0;
  if (typeof ref === 'number') return ref;
  const arr = def.values?.[ref];
  return arr && arr.length ? Math.max(...arr) : 0;
}

function isEnemyTarget(target: TargetSel): boolean {
  return target === 'target' || target === 'enemies-in-radius' || target === 'random-enemy-in-radius' || target === 'units-in-radius';
}

function isAllyGroupTarget(target: TargetSel): boolean {
  return target === 'allies-in-radius' || target === 'lowest-hp-ally-in-radius' || target === 'units-in-radius';
}

function noteRadius(def: AbilityDef, f: Facts, ref: ValueRef | undefined, target: TargetSel): boolean {
  const inRadiusSelector = target === 'enemies-in-radius' || target === 'allies-in-radius' || target === 'units-in-radius' || target === 'random-enemy-in-radius';
  if (ref === undefined && !inRadiusSelector) return false;
  f.aoeFootprint = true;
  f.maxRadius = Math.max(f.maxRadius, refMax(def, ref));
  return true;
}

function scan(def: AbilityDef, nodes: EffectNode[] | undefined, f: Facts): void {
  if (!nodes) return;
  for (const n of nodes) {
    switch (n.kind) {
      case 'damage': {
        const aoe = noteRadius(def, f, n.radius, n.target);
        if (aoe && isEnemyTarget(n.target)) f.aoeDamage = true;
        break;
      }
      case 'heal':
        noteRadius(def, f, n.radius, n.target);
        if (n.target === 'self') f.selfBenefit = true;
        else f.allyGroupBenefit = true;
        break;
      case 'mana':
        noteRadius(def, f, n.radius, n.target);
        if (n.op === 'restore') {
          if (n.target === 'self') f.selfBenefit = true;
          else if (isAllyGroupTarget(n.target) || n.target === 'target') f.allyGroupBenefit = true;
        }
        break;
      case 'status': {
        const aoe = noteRadius(def, f, n.radius, n.target);
        if (HARD_DISABLES.has(n.status) && isEnemyTarget(n.target)) {
          f.anyHardDisable = true;
          if (!aoe && n.target === 'target') f.singleHardDisable = true;
        }
        if (n.status === 'buff' || (n.params?.mods && !isEnemyTarget(n.target))) {
          if (n.target === 'self') f.selfBenefit = true;
          else if (isAllyGroupTarget(n.target) || n.target === 'target') f.allyGroupBenefit = true;
        }
        if (n.params?.periodic) scan(def, n.params.periodic.effects, f);
        break;
      }
      case 'displace':
        noteRadius(def, f, n.radius, n.target);
        // a non-blink displace (knockback/pull/forced) on an enemy is hard control.
        if (n.mode !== 'blink' && isEnemyTarget(n.target)) f.anyHardDisable = true;
        break;
      case 'statmod':
        noteRadius(def, f, n.radius, n.target);
        if (n.target === 'self') f.selfBenefit = true;
        else if (isAllyGroupTarget(n.target) || n.target === 'target') f.allyGroupBenefit = true;
        break;
      case 'zone': {
        f.zone = true;
        f.aoeFootprint = true;
        if (n.zone.shape === 'line') f.lineShape = true;
        f.maxRadius = Math.max(f.maxRadius, refMax(def, n.zone.radius));
        const tickAffects = n.zone.tick?.affects;
        if (n.zone.tick && tickAffects !== 'allies') {
          if (n.zone.tick.effects.some((e) => e.kind === 'damage')) f.aoeDamage = true;
        }
        scan(def, n.zone.tick?.effects, f);
        scan(def, n.zone.onEnter?.effects, f);
        break;
      }
      case 'summon':
        break;
      case 'projectile':
        if (n.proj.model === 'linear') f.lineShape = true;
        scan(def, n.proj.onHit, f);
        break;
      case 'repeat':
        noteRadius(def, f, n.radius, n.retarget ?? 'target');
        scan(def, n.effects, f);
        break;
      case 'purge':
        if (!isEnemyTarget(n.target)) f.allyGroupBenefit = true;
        break;
      case 'capture-channel':
      case 'exotic':
        break;
    }
  }
}
